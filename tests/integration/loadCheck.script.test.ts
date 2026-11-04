/**
 * scripts/load-check.sh — the staging load check that calibrates the
 * origin-latency alarm threshold.
 *
 * Two properties are worth pinning hardest, and neither is visible from reading
 * a passing run.
 *
 * The production refusal has to come before anything happens. The script is the
 * only thing standing between a mistyped target and synthetic traffic plus a
 * synthetic session landing in the environment that is about to hold real member
 * data, so the cases below assert not only the exit code but that no stub was
 * ever invoked: a refusal that fires after the address has been resolved and a
 * session minted is not a refusal.
 *
 * The session cookie must not survive the run. It is a real, middleware-verified
 * member session minted by the persona harness, written to a mode-restricted
 * temp file; a run that leaves it behind leaves a live credential on the
 * operator's disk. The test recovers the path from the curl stub's own argument
 * log and asserts the file is gone afterwards, including on the failure paths.
 *
 * Every external binary is stubbed through the script's own named seams, so no
 * case here needs AWS, terraform, curl, or a single HTTP request.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { hostIdentityAnswer, hostUrlForAlias } from '../fixtures/hostIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/load-check.sh');

let stubDir: string;

beforeEach(() => {
  stubDir = mkdtempSync(join(tmpdir(), 'footbag-test-loadcheck-'));
});

afterEach(() => {
  rmSync(stubDir, { recursive: true, force: true });
});

function callsLog(name: string): string {
  return join(stubDir, `${name}.log`);
}

function readCalls(name: string): string[] {
  const path = callsLog(name);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8').split('\n').filter((line) => line !== '');
}

/** Writes an executable stub that logs its arguments and then runs `body`. */
function stub(name: string, body: string[]): string {
  const path = join(stubDir, `${name}-stub.sh`);
  writeFileSync(
    path,
    ['#!/usr/bin/env bash', `echo "$*" >> "${callsLog(name)}"`, ...body].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

/** terraform, answering the two outputs the script reads. */
function terraformStub(): string {
  return stub('terraform', [
    'for arg in "$@"; do',
    '  if [ "$arg" = "cloudfront_domain" ]; then echo "d1234abcdef8.cloudfront.net"; exit 0; fi',
    '  if [ "$arg" = "cloudfront_distribution_id" ]; then echo "EXAMPLEDIST"; exit 0; fi',
    'done',
    'exit 1',
  ]);
}

/** curl, writing a Netscape cookie jar to whatever path follows -c. */
function curlStub(): string {
  return stub('curl', [
    'jar=""',
    'prev=""',
    'for arg in "$@"; do',
    '  if [ "$prev" = "-c" ]; then jar="$arg"; fi',
    '  prev="$arg"',
    'done',
    '[ -n "$jar" ] && printf "#HttpOnly_d1234abcdef8.cloudfront.net\\tFALSE\\t/\\tTRUE\\t0\\t__Host-footbag_session\\tvalue\\n" > "$jar"',
    'exit 0',
  ]);
}

/** The request driver, exiting with whatever code the caller wants. */
function driverStub(exitCode: number): string {
  return stub('driver', [
    'for arg in "$@"; do',
    '  if [ "$arg" = "--out" ]; then out="next"; continue; fi',
    '  if [ "${out:-}" = "next" ]; then echo "{}" > "$arg"; out=""; fi',
    'done',
    `exit ${exitCode}`,
  ]);
}

/** terraform, failing the distribution-id read with its own reason on stderr. */
function failingTerraformStub(): string {
  return stub('terraform', ['echo "terraform-stub: no outputs found" >&2', 'exit 1']);
}

/** terraform, succeeding on the distribution-id read but printing nothing. */
function emptyTerraformStub(): string {
  return stub('terraform', ['exit 0']);
}

/**
 * aws, answering get-metric-statistics. With `latencyDatapoints` false the
 * OriginLatency read comes back with an empty Datapoints list, the envelope
 * CloudWatch returns for a window it has not published (the script reads only
 * the Datapoints field, so the other envelope fields are left out).
 */
function awsStub(latencyDatapoints: boolean): string {
  const latency = latencyDatapoints
    ? '{"Label":"OriginLatency","Datapoints":[{"Timestamp":"2026-01-01T00:00:00Z","ExtendedStatistics":{"p90":410.2,"p95":1234.7,"p99":1900.1}}]}'
    : '{"Label":"OriginLatency","Datapoints":[]}';
  return stub('aws', [
    `case "$*" in`,
    `  *OriginLatency*) echo '${latency}' ;;`,
    `  *Requests*) echo '{"Label":"Requests","Datapoints":[{"Sum":42}]}' ;;`,
    `  *) echo '{"Label":"5xxErrorRate","Datapoints":[{"Average":0}]}' ;;`,
    'esac',
  ]);
}

interface RunOptions {
  terraform?: boolean | 'failing' | 'empty';
  curl?: boolean;
  driverExit?: number;
  aws?: 'datapoints' | 'no-datapoints';
}

/**
 * The staging host's stand-in. It answers the alias lookup and the question of
 * which environment it is, and logs every call so a case can show the host was
 * or was not reached.
 */
function hostStub(): string {
  const binDir = join(stubDir, 'host-bin');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(binDir, 'ssh'), [
    '#!/usr/bin/env bash',
    `echo "$*" >> "${callsLog('ssh')}"`,
    hostIdentityAnswer(),
    'for a in "$@"; do',
    '  if [ "$a" = "-G" ]; then printf "hostname 203.0.113.10\\nuser footbag\\n"; exit 0; fi',
    'done',
    'exit 1',
  ].join('\n'));
  chmodSync(join(binDir, 'ssh'), 0o755);
  writeFileSync(join(stubDir, 'pin'), '[203.0.113.10]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE\n');
  return binDir;
}

function run(args: string[], options: RunOptions = {}) {
  // The run settles and proves its identity before it reads the address.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...awsIdentityStubEnv(stubDir),
    PATH: `${hostStub()}:${process.env.PATH ?? ''}`,
    FOOTBAG_KNOWN_HOSTS: join(stubDir, 'pin'),
  };
  if (options.terraform === true) env.FOOTBAG_LOADCHECK_TERRAFORM_BIN = terraformStub();
  if (options.terraform === 'failing') env.FOOTBAG_LOADCHECK_TERRAFORM_BIN = failingTerraformStub();
  if (options.terraform === 'empty') env.FOOTBAG_LOADCHECK_TERRAFORM_BIN = emptyTerraformStub();
  if (options.aws !== undefined) env.FOOTBAG_LOADCHECK_AWS_BIN = awsStub(options.aws === 'datapoints');
  if (options.curl === true) env.FOOTBAG_LOADCHECK_CURL_BIN = curlStub();
  if (options.driverExit !== undefined) env.FOOTBAG_LOADCHECK_DRIVER = driverStub(options.driverExit);

  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: 'fixture-sudo-password\n',
    env,
    ...SPAWN_GUARD,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** The cookie-jar path the curl stub was handed, recovered from its own log. */
function mintedCookiePath(): string | undefined {
  for (const line of readCalls('curl')) {
    const match = /-c (\S+)/.exec(line);
    if (match !== null) return match[1];
  }
  return undefined;
}

describe('load-check.sh — argument validation', () => {
  it('rejects an unknown argument', () => {
    const result = run(['--bogus']);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/unknown argument/);
  });

  it('requires a target, with no default', () => {
    const result = run([]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/--target is required and has no default/);
  });

  it('rejects an unknown target', () => {
    const result = run(['--target', 'dev']);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/--target must be 'staging'/);
  });

  it('rejects a non-numeric duration', () => {
    const result = run(['--target', 'staging', '--duration', 'twenty']);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/--duration must be a whole number/);
  });

  it('rejects a zero concurrency', () => {
    const result = run(['--target', 'staging', '--concurrency', '0']);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/at least 1/);
  });

  it('refuses to re-read a window that was not named', () => {
    const result = run(['--target', 'staging', '--read-back-only']);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/requires --window-start and --window-end/);
  });
});

describe('load-check.sh — the production refusal', () => {
  it('refuses production by name, and says why', () => {
    const result = run(['--target', 'production'], { terraform: true, curl: true, driverExit: 0 });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/refused on production/);
    expect(result.stderr).toMatch(/real member data/);
  });

  it('refuses production before resolving an address, minting a session, or sending traffic', () => {
    run(['--target', 'production'], { terraform: true, curl: true, driverExit: 0 });
    expect(readCalls('ssh')).toEqual([]);
    expect(readCalls('terraform')).toEqual([]);
    expect(readCalls('curl')).toEqual([]);
    expect(readCalls('driver')).toEqual([]);
  });
});

describe('load-check.sh — seam disclosure', () => {
  it('says on stderr when a test seam is in use, because a stubbed measurement proves nothing', () => {
    const result = run(['--target', 'staging', '--preflight-only'], {
      terraform: true,
      curl: true,
      driverExit: 0,
    });
    expect(result.stderr).toMatch(/SYNTHETIC: a test seam is in use/);
  });
});

describe('load-check.sh — preflight', () => {
  it('checks every scenario path and stops, measuring nothing, under --preflight-only', () => {
    const result = run(['--target', 'staging', '--preflight-only'], {
      terraform: true,
      curl: true,
      driverExit: 0,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Nothing was measured/);

    // The driver was asked to preflight, and never asked to run a timed pass.
    const driverCalls = readCalls('driver');
    expect(driverCalls).toHaveLength(1);
    expect(driverCalls[0]).toMatch(/--preflight/);
    expect(driverCalls[0]).not.toMatch(/--duration/);
  });

  it('abandons the run when a scenario path does not answer as expected', () => {
    const result = run(['--target', 'staging'], {
      terraform: true,
      curl: true,
      driverExit: 1,
    });
    expect(result.status).toBe(1);
    expect(readCalls('driver')).toHaveLength(1);
  });

  // Defect caught: traffic aimed at an address other than the one the staging
  // host says it serves, whether typed, exported or read from somewhere else.
  it('loads the address the confirmed staging host records, and takes no other', () => {
    run(['--target', 'staging', '--preflight-only'], { terraform: true, curl: true, driverExit: 0 });
    expect(readCalls('ssh').some((c) => c.includes('footbag-host-identity'))).toBe(true);
    expect(readCalls('terraform').join('\n')).not.toMatch(/cloudfront_domain/);
    expect(readCalls('driver')[0]).toContain(hostUrlForAlias('footbag-staging'));

    const overridden = run(['--target', 'staging', '--base-url', 'https://production.example.invalid']);
    expect(overridden.status).toBe(2);
    expect(overridden.stderr).toMatch(/unknown argument '--base-url'/);
  });
});

describe('load-check.sh — reading the alarm\'s own metric', () => {
  const WINDOW = ['--window-start', '2026-01-01T00:00:00Z', '--window-end', '2026-01-01T00:10:00Z'];

  // Defect caught: a Terraform read that failed was discarded, so the run read
  // no metric at all and still exited 0, reporting a calibration it never made.
  it('fails, with Terraform\'s reason, when the distribution id cannot be read', () => {
    const result = run(['--target', 'staging', '--read-back-only', ...WINDOW], { terraform: 'failing' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('terraform-stub: no outputs found');
    expect(result.stderr).toMatch(/could not read cloudfront_distribution_id/);
  });

  // Defect caught: an empty distribution id was a warning followed by exit 0,
  // though it means the check the run exists for could not run.
  it('fails when Terraform answers with no distribution id', () => {
    const result = run(['--target', 'staging', '--read-back-only', ...WINDOW], { terraform: 'empty' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/no distribution id available/);
  });
  // The valid read beside these refusals is every --preflight-only case above,
  // which passes the same Terraform read with a stub that answers it.

  // Defect caught: a window CloudWatch had published nothing for printed
  // "none" among the readings and ended like a measured run, so the operator
  // could take an unmeasured window as one well under the alarm threshold.
  it('lists a warning in its closing output when the latency metric has no datapoints', () => {
    const result = run(['--target', 'staging', '--read-back-only', ...WINDOW], {
      terraform: true, aws: 'no-datapoints',
    });
    expect(result.status, result.stderr).toBe(0);
    const closing = result.stdout.slice(result.stdout.indexOf('Warnings:'));
    expect(result.stdout).toContain('Warnings:');
    expect(closing).toMatch(/WARNING: .*OriginLatency.*no datapoints/);
  });

  it('lists no warning when the latency metric has datapoints, and reports the worst p95', () => {
    const result = run(['--target', 'staging', '--read-back-only', ...WINDOW], {
      terraform: true, aws: 'datapoints',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('1234 ms');
    expect(result.stdout).not.toContain('Warnings:');
  });
});

describe('load-check.sh — the minted session', () => {
  it('mints one session and destroys the cookie file before exiting', () => {
    run(['--target', 'staging', '--preflight-only'], { terraform: true, curl: true, driverExit: 0 });

    const calls = readCalls('curl');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/\/dev\/switch\?as=t1_paid/);

    const jar = mintedCookiePath();
    expect(jar).toBeDefined();
    expect(existsSync(jar as string)).toBe(false);
  });

  it('destroys the cookie file on the failure path too', () => {
    run(['--target', 'staging'], { terraform: true, curl: true, driverExit: 1 });
    const jar = mintedCookiePath();
    expect(jar).toBeDefined();
    expect(existsSync(jar as string)).toBe(false);
  });
});

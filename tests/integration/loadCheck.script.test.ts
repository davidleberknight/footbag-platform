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
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

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

interface RunOptions {
  terraform?: boolean;
  curl?: boolean;
  driverExit?: number;
}

function run(args: string[], options: RunOptions = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (options.terraform === true) env.FOOTBAG_LOADCHECK_TERRAFORM_BIN = terraformStub();
  if (options.curl === true) env.FOOTBAG_LOADCHECK_CURL_BIN = curlStub();
  if (options.driverExit !== undefined) env.FOOTBAG_LOADCHECK_DRIVER = driverStub(options.driverExit);

  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
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

  it('reads the address from terraform rather than carrying one', () => {
    run(['--target', 'staging', '--preflight-only'], { terraform: true, curl: true, driverExit: 0 });
    const calls = readCalls('terraform').join('\n');
    expect(calls).toMatch(/cloudfront_domain/);
    expect(readCalls('driver')[0]).toMatch(/https:\/\/d1234abcdef8\.cloudfront\.net/);
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

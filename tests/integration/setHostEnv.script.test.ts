/**
 * scripts/set-host-env.sh: the host's record of which environment it is, and
 * the single definition of the proxy hop count it no longer writes.
 *
 * A real run stages /srv/footbag/env down from a host over ssh, with the sudo
 * password read from stdin, which CI cannot do. The synthetic --env-file mode
 * operates on a local file, reaching no host and no AWS.
 *
 * The setter writes one value, FOOTBAG_ENV. Every other value in the host env
 * file has an owner that runs on every deploy, so a second writer here would be
 * a second owner, and a disagreement between them would fail nothing at
 * runtime. The assertions below pin that it writes the record and nothing else,
 * that it refuses the other environment's host, and that the hop count has one
 * definition which the scripts with an opinion read.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/set-host-env.sh');
const LIB = join(process.cwd(), 'scripts/lib/host-env-expectations.sh');
const STATUS_SCRIPT = join(process.cwd(), 'scripts/bringup-status.sh');
const VERIFY_SCRIPT = join(process.cwd(), 'scripts/verify-host-env.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function run(args: string[]): RunResult {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    env: { ...process.env },
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Evaluate the shared helper directly, the way each script does. */
function helper(fn: string, ...args: string[]): string {
  const r = spawnSync('bash', ['-c', `source "${LIB}"; ${fn} ${args.join(' ')}`], {
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  return (r.stdout ?? '').trim();
}

function withEnvFile(contents: string, fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'footbag-test-sethostenv-'));
  const path = join(dir, 'env');
  writeFileSync(path, contents, 'utf-8');
  try {
    fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('the proxy hop count has exactly one definition', () => {
  it('states the same two-hop chain for both environments, at every milestone', () => {
    // CloudFront then nginx, in staging and in production, before and after the
    // DNS cutover: the platform is reached through its own distribution either
    // way, so no legacy front-door hop sits in front of it. Being wrong upward
    // here would let a client spoof its own address by sending a longer header.
    expect(helper('expected_trust_proxy', 'staging')).toBe('2');
    expect(helper('expected_trust_proxy', 'production')).toBe('2');
  });

  it('an unknown target is refused rather than resolving empty', () => {
    const r = spawnSync('bash', ['-c', `source "${LIB}"; expected_trust_proxy bogus`], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    expect(r.status).not.toBe(0);
  });

  it('reads the hop count from the committed host config of each environment', () => {
    // Defect caught: the helper keeps a copy of its own, so the value the deploy
    // applies and the value the verifier and the bring-up view expect can part.
    for (const target of ['staging', 'production']) {
      const committed = readFileSync(join(process.cwd(), `docker/env/${target}.env`), 'utf-8')
        .split('\n')
        .find((l) => l.startsWith('TRUST_PROXY='));
      expect(committed, `docker/env/${target}.env declares the hop count`).toBeDefined();
      expect(helper('expected_trust_proxy', target)).toBe(committed!.split('=')[1]);
    }
  });

  it('every script that has an opinion reads the helper rather than its own copy', () => {
    for (const path of [STATUS_SCRIPT, VERIFY_SCRIPT]) {
      const body = readFileSync(path, 'utf-8');
      expect(body, `${path} sources the shared definition`).toContain('host-env-expectations.sh');
      // A bare hop-count literal beside the helper call is how the copies came
      // back last time. The committed host config is the only place to say 2.
      const declaresOwn = /TRUST_PROXY=["']?[0-9]/.test(body);
      expect(declaresOwn, `${path} states no hop count of its own`).toBe(false);
    }
  });

  it('the setter writes no hop count at all, leaving it to the deploy', () => {
    // Defect caught: the setter becomes a second writer of a value the committed
    // host config owns, so whichever ran last decides the host.
    const body = readFileSync(SCRIPT, 'utf-8');
    expect(body).not.toMatch(/TRUST_PROXY/);
  });
});

describe('set-host-env.sh writes the environment record and nothing else', () => {
  // Defect caught: a new host left with no record, which every later script
  // refuses, or one recorded as something other than the target it was set up
  // as. This is the step that writes the record the others read.
  it('records which environment the host is when it records none yet', () => {
    withEnvFile('SESSION_SECRET=keep\n', (path) => {
      const r = run(['--target', 'production', '--env-file', path]);
      expect(r.exitCode, r.stderr).toBe(0);
      const lines = readFileSync(path, 'utf-8').trim().split('\n');
      expect(lines.filter((l) => l.startsWith('FOOTBAG_ENV='))).toEqual(['FOOTBAG_ENV=production']);
      expect(lines).toContain('SESSION_SECRET=keep');
    });
  });

  // Defect caught: rewriting the other environment's host under this label,
  // which would make it this environment by record and every later guard would
  // then agree with the mistake.
  it('refuses a host that records the other environment, and changes nothing', () => {
    const contents = 'FOOTBAG_ENV=production\nTRUST_PROXY=2\n';
    withEnvFile(contents, (path) => {
      const r = run(['--target', 'staging', '--env-file', path]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toMatch(/records FOOTBAG_ENV=production, but this run is --target staging/);
      expect(readFileSync(path, 'utf-8')).toBe(contents);
    });
  });

  // Defect caught: a re-run reports a change it did not make, or rewrites a
  // correct file, which teaches an operator to stop reading the diff.
  it('is a no-op when the host already records this environment', () => {
    const contents = 'FOOTBAG_ENV=staging\nA=1\n';
    withEnvFile(contents, (path) => {
      const r = run(['--target', 'staging', '--env-file', path]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Nothing to write');
      expect(readFileSync(path, 'utf-8')).toBe(contents);
    });
  });

  // Defect caught: two FOOTBAG_ENV lines, where last-wins parsing on the host
  // and the diff shown here could disagree about which environment it is.
  it('collapses duplicate records into one', () => {
    withEnvFile('FOOTBAG_ENV=staging\nA=1\nFOOTBAG_ENV=staging\n', (path) => {
      const r = run(['--target', 'staging', '--env-file', path]);
      expect(r.exitCode).toBe(0);
      const lines = readFileSync(path, 'utf-8').trim().split('\n');
      expect(lines.filter((l) => l.startsWith('FOOTBAG_ENV='))).toEqual(['FOOTBAG_ENV=staging']);
    });
  });

  // Defect caught: the setter becomes a second writer of a value another owner
  // writes on every deploy, so the host's value depends on which ran last.
  it('leaves every other value exactly as it found it, stale or not', () => {
    const others = [
      'TRUST_PROXY=3',
      'BACKUP_S3_BUCKET=stale-bucket',
      'PUBLIC_BASE_URL=https://old.invalid',
      'ALARM_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/000/retired',
      'SES_FROM_IDENTITY=old@example.invalid',
    ];
    withEnvFile(`${others.join('\n')}\n`, (path) => {
      const r = run(['--target', 'staging', '--env-file', path]);
      expect(r.exitCode).toBe(0);
      const lines = readFileSync(path, 'utf-8').trim().split('\n');
      expect(lines).toEqual([...others, 'FOOTBAG_ENV=staging']);
    });
  });
});

describe('set-host-env.sh refusals', () => {
  it('refuses an unknown target', () => {
    const r = run(['--target', 'bogus', '--dry-run']);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("must be 'staging' or 'production'");
  });

  it('refuses to run without a target, rather than choosing an environment', () => {
    // A defaulted target would send the credential on stdin at whichever host
    // the default names.
    const r = run(['--dry-run']);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('--target is required');
  });

  it('refuses a missing env file rather than creating one', () => {
    const r = run(['--target', 'staging', '--env-file', '/nonexistent/footbag-env']);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('does not exist');
  });

  // Defect caught: a runbook step carried over from before the base address was
  // Terraform's runs silently and the operator believes the window moved.
  it('refuses --preview and names the step that replaced it', () => {
    const r = run(['--target', 'production', '--preview', '--dry-run']);
    expect(r.exitCode).toBe(2);
    const said = r.stderr.replace(/\s+/g, ' ');
    expect(said).toContain('--preview is no longer a step');
    expect(said).toContain('apply the notice flag, then deploy');
  });

  it('dry run names the record and writes nothing', () => {
    withEnvFile('A=1\n', (path) => {
      const r = run(['--target', 'production', '--dry-run', '--env-file', path]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('FOOTBAG_ENV=production');
      expect(r.stdout).toContain('Nothing was written');
      expect(readFileSync(path, 'utf-8')).toBe('A=1\n');
    });
  });
});

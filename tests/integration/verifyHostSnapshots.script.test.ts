/**
 * Proving the daily host snapshot is still being taken, read-only.
 *
 * The snapshot runs inside the hosting provider with no platform code, so no
 * job-run row records it and nothing alarms when it stops. What these pin: the
 * check passes only when the newest successful snapshot is within a day plus
 * the two-hour grace, judges only successful snapshots, refuses to pass with
 * nothing to judge, requires a target, and never writes.
 *
 * AWS and Terraform are stand-ins answering from fixtures; every AWS call is
 * recorded so a case can assert that none of them wrote anything.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/verify-host-snapshots.sh');
// The clock the age is measured from; the provider snapshots daily at 15:00.
const NOW = '2026-10-07T14:00:00';

let workDir: string;
let callLog: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-host-snapshots-'));
  callLog = join(workDir, 'calls.log');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * Runs the check with the provider answering `snapshots` as rows of
 * [createdAt, status], or failing outright when `snapshots` is false (the
 * add-on is off or the instance is unknown).
 */
function run(target: string | null, snapshots: Array<[string, string]> | false) {
  const aws = join(workDir, 'aws');
  const rows = snapshots === false ? '' : snapshots.map(([c, s]) => `${c}\\t${s}`).join('\\n');
  writeFileSync(aws, [
    '#!/usr/bin/env bash',
    `echo "aws $*" >> ${JSON.stringify(callLog)}`,
    'case "$1 $2" in',
    snapshots === false
      ? '  "lightsail get-auto-snapshots") echo "NotFoundException" >&2; exit 254 ;;'
      : `  "lightsail get-auto-snapshots") printf "${rows}\\n"; exit 0 ;;`,
    'esac',
    'exit 64',
  ].join('\n'));
  chmodSync(aws, 0o755);

  const tf = join(workDir, 'terraform');
  writeFileSync(tf, [
    '#!/usr/bin/env bash',
    'case "$*" in',
    '  *lightsail_instance_name*) echo footbag-env-web ;;',
    '  *) exit 1 ;;',
    'esac',
  ].join('\n'));
  chmodSync(tf, 0o755);

  const res = spawnSync('bash', target === null ? [SCRIPT] : [SCRIPT, '--target', target], {
    ...SPAWN_GUARD,
    encoding: 'utf8',
    env: {
      ...process.env,
      VERIFY_HOST_SNAPSHOTS_AWS_BIN: aws,
      VERIFY_HOST_SNAPSHOTS_TERRAFORM_BIN: tf,
      VERIFY_HOST_SNAPSHOTS_NOW: NOW,
    },
  });
  const calls = existsSync(callLog) ? readFileSync(callLog, 'utf8') : '';
  return { status: res.status, out: `${res.stdout}${res.stderr}`, calls };
}

describe('a current snapshot', () => {
  it('passes when the newest successful snapshot is within a day', () => {
    // Yesterday's 15:00 snapshot is 23 hours old at 14:00 today.
    const r = run('production', [
      ['2026-10-05T15:02:11+00:00', 'Success'],
      ['2026-10-06T15:00:00+00:00', 'Success'],
    ]);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('host snapshots current on production');
    expect(r.out).toContain('23 hours old');
  });

  it('reads the instance name from the target environment and only reads from AWS', () => {
    const r = run('staging', [['2026-10-06T15:01:40+00:00', 'Success']]);
    expect(r.status, r.out).toBe(0);
    expect(r.calls).toContain('--resource-name footbag-env-web');
    // Every call is a read; a check that wrote would leave state behind.
    for (const line of r.calls.trim().split('\n')) {
      expect(line, `a call that is not a read: ${line}`).toMatch(/^aws lightsail get-/);
    }
  });
});

describe('a stopped snapshot', () => {
  it('fails once the newest successful snapshot is older than a day plus grace', () => {
    // An operator restoring the host would find only a two-day-old snapshot.
    const r = run('production', [['2026-10-05T15:01:40+00:00', 'Success']]);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('the daily snapshot has stopped');
  });

  it('judges only successful snapshots, so a recent failed one does not count', () => {
    const r = run('production', [
      ['2026-10-05T15:01:40+00:00', 'Success'],
      ['2026-10-06T15:01:40+00:00', 'Failed'],
    ]);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('the daily snapshot has stopped');
  });

  it('refuses to pass with no snapshots listed', () => {
    const r = run('production', []);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('has no automatic snapshots');
  });

  it('refuses to pass when the snapshots cannot be read, as with the add-on off', () => {
    const r = run('production', false);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('is the snapshot add-on enabled?');
  });
});

describe('the target', () => {
  it('is required, with no default environment', () => {
    const r = run(null, [['2026-10-06T15:01:40+00:00', 'Success']]);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('--target must be staging or production');
    expect(r.calls).toBe('');
  });
});

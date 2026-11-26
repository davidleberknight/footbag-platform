/**
 * Proving the daily host snapshot is still being taken, read-only.
 *
 * The snapshot runs inside the hosting provider with no platform code, so no
 * job-run row records it and nothing alarms when it stops. What these pin: the
 * check passes only when the newest successful snapshot is within a day plus
 * the two-hour grace, judges only successful snapshots, refuses to pass with
 * nothing to judge, requires a target, and never writes. An instance younger
 * than that limit, whose add-on reads Enabled, has no snapshot due yet: that
 * reads as its own exit status, never as a pass and never as a failure.
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
 * The instance as get-instance reports it: when it was created and the status
 * of its AutoSnapshot add-on, or a read that fails with the tool's message.
 *
 * The response's shape, from the AWS CLI reference for lightsail get-instance
 * as read on 2026-11-25 (other fields left out):
 *   { "instance": { "name": "...", "createdAt": 1570635023.124,
 *       "addOns": [ { "name": "AutoSnapshot", "status": "Enabled",
 *                     "snapshotTimeOfDay": "14:00" } ], ... } }
 * The script asks for those two fields by --query with text output, so the
 * stand-in answers that query's tab-separated pair; text output prints the
 * timestamp as ISO 8601 by default and as epoch seconds under some settings.
 */
type Instance = { createdAt: string; addOn: string } | { fails: string };

// Created long before the clock, with the add-on on: the instance every case
// sees unless it says otherwise.
const OLD_INSTANCE: Instance = { createdAt: '2026-01-01T09:00:00+00:00', addOn: 'Enabled' };
// Created at 01:11 on the clock's day, under 13 hours before it.
const NEW_INSTANCE = { createdAt: '2026-10-07T01:11:00.123000+00:00', addOn: 'Enabled' };

/**
 * Runs the check with the provider answering `snapshots` as rows of
 * [createdAt, status], or failing outright when `snapshots` is false (the
 * add-on is off or the instance is unknown), and `instance` for get-instance.
 */
function run(
  target: string | null,
  snapshots: Array<[string, string]> | false,
  instance: Instance = OLD_INSTANCE,
  extraArgs: string[] = [],
) {
  const aws = join(workDir, 'aws');
  const rows = snapshots === false ? '' : snapshots.map(([c, s]) => `${c}\\t${s}`).join('\\n');
  writeFileSync(aws, [
    '#!/usr/bin/env bash',
    `echo "aws $*" >> ${JSON.stringify(callLog)}`,
    'case "$1 $2" in',
    snapshots === false
      ? '  "lightsail get-auto-snapshots") echo "NotFoundException" >&2; exit 254 ;;'
      : `  "lightsail get-auto-snapshots") printf "${rows}\\n"; exit 0 ;;`,
    'fails' in instance
      ? `  "lightsail get-instance") echo ${JSON.stringify(instance.fails)} >&2; exit 254 ;;`
      : `  "lightsail get-instance") printf '%s\\t%s\\n' ${JSON.stringify(instance.createdAt)} ${JSON.stringify(instance.addOn)}; exit 0 ;;`,
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

  const args = target === null ? [SCRIPT, ...extraArgs] : [SCRIPT, '--target', target, ...extraArgs];
  const res = spawnSync('bash', args, {
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

describe('an instance too new for its first automatic snapshot', () => {
  it('reads not yet due, with its own exit status and the time the snapshot is due by', () => {
    // Defect caught: every instance a restore or a replacement has just created
    // fails the snapshot check, and with it the status proofs that read it, for
    // up to a day before the add-on's first daily window comes round.
    const r = run('staging', [], NEW_INSTANCE);
    expect(r.status, r.out).toBe(3);
    expect(r.out).toContain('the AutoSnapshot add-on is Enabled');
    // Created 01:11 on the 7th, plus the 26-hour limit.
    expect(r.out).toMatch(/^== first automatic snapshot of footbag-env-web is due by 2026-10-08T03:11Z/m);
    expect(r.calls).toContain('lightsail get-instance --instance-name footbag-env-web');
    expect(r.calls).toContain("addOns[?name=='AutoSnapshot'].status");
  });

  it('reads not yet due while the first snapshot is still being taken', () => {
    const r = run('staging', [['2026-10-07T14:00:31+00:00', 'InProgress']], NEW_INSTANCE);
    expect(r.status, r.out).toBe(3);
  });

  it('reads the creation time in epoch seconds as well as ISO', () => {
    // Defect caught: under the CLI's epoch timestamp setting the creation time
    // is unreadable and a new instance fails, or reads as created in 1970.
    const r = run('staging', [], { createdAt: '1791335460.123', addOn: 'Enabled' });
    expect(r.status, r.out).toBe(3);
    expect(r.out).toContain('due by 2026-10-08T03:11Z');
  });

  it('fails an instance older than the limit with no snapshot, though its add-on reads Enabled', () => {
    // Defect caught: an add-on that is on but has never taken a snapshot reads
    // not yet due for ever, so a host whose snapshots never started passes.
    const r = run('production', [], { createdAt: '2026-10-05T10:00:00+00:00', addOn: 'Enabled' });
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain('has no automatic snapshots');
    expect(r.out).toContain('past the 26-hour limit');
  });

  it('holds the limit exactly: 26 hours old fails, a second younger is not yet due', () => {
    // The clock is 14:00 on the 7th; 12:00 on the 6th is 26 hours before it.
    const at = run('staging', [], { createdAt: '2026-10-06T12:00:00+00:00', addOn: 'Enabled' });
    expect(at.status, at.out).toBe(1);
    const under = run('staging', [], { createdAt: '2026-10-06T12:00:01+00:00', addOn: 'Enabled' });
    expect(under.status, under.out).toBe(3);
  });

  it('fails a new instance whose add-on is not exactly Enabled, or is absent', () => {
    // Defect caught: a new instance created without the add-on, or with it
    // still enabling or switched off, reads not yet due and nobody learns that
    // no snapshot will ever come.
    for (const addOn of ['Disabled', 'Enabling', 'enabled', 'None']) {
      const r = run('staging', [], { createdAt: NEW_INSTANCE.createdAt, addOn });
      expect(r.status, `${addOn}: ${r.out}`).toBe(1);
      expect(r.out, addOn).toContain(`its AutoSnapshot add-on reads '${addOn}', not Enabled`);
    }
  });

  it('fails a new instance whose first snapshot failed', () => {
    // Defect caught: the add-on tried and failed, and the check calls that not
    // yet due instead of reporting the failure.
    const r = run('staging', [['2026-10-07T14:00:31+00:00', 'Failed']], NEW_INSTANCE);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain('the add-on took a snapshot that failed');
  });

  it('fails, carrying the tool\'s message, when the instance cannot be read', () => {
    // Defect caught: a refused or broken read is taken for a new instance, so
    // a check that could not look reads not yet due.
    const r = run('staging', [], {
      fails: 'An error occurred (AccessDeniedException) when calling the GetInstance operation: stand-in refusal',
    });
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain('has no automatic snapshots');
    expect(r.out).toContain('(AccessDeniedException) when calling the GetInstance operation: stand-in refusal');
  });
});

describe('requiring a snapshot to have been taken', () => {
  it('fails a new instance with no snapshot yet, naming when the first is due', () => {
    // Defect caught: a caller that needs a snapshot to exist now (a restore
    // drill, a pre-cutover proof) reads exit 3 as anything but a failure, or
    // the flag is ignored, and the run goes ahead with no snapshot to rest on.
    const r = run('staging', [], NEW_INSTANCE, ['--require-taken']);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain('--require-taken');
    expect(r.out).toContain('due by 2026-10-08T03:11Z');
  });

  it('still passes a current snapshot under the flag, so it does not refuse everything', () => {
    const r = run('production', [['2026-10-06T15:01:40+00:00', 'Success']], OLD_INSTANCE, ['--require-taken']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/^== host snapshots current on production/m);
  });

  it('still fails a stopped snapshot under the flag', () => {
    const r = run('production', [['2026-10-05T15:01:40+00:00', 'Success']], OLD_INSTANCE, ['--require-taken']);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain('the daily snapshot has stopped');
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

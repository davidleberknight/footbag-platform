/**
 * Contract tests for scripts/send-test-alarm.sh: raising one named alarm briefly
 * so every watcher can confirm alarm mail reaches them.
 *
 * What carries the risk: a test aimed at one environment reaching the other's
 * alarms; a state change made without the typed confirmation; an alarm left
 * raised because the second call was never made; and a success reported when a
 * call was refused.
 *
 * Hermetic: a stand-in AWS CLI, named through the script's test seam, logs its
 * argv and can be told to refuse, and the shared identity stub settles the
 * profile.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'send-test-alarm.sh');

let dir: string;
let fakeAws: string;
let awsLog: string;

function run(args: string[], env: Record<string, string> = {}): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...awsIdentityStubEnv(dir), FOOTBAG_AWS_BIN: fakeAws, FAKE_AWS_LOG: awsLog, ...env },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

const calls = (): string[] => fs.readFileSync(awsLog, 'utf8').split('\n').filter((l) => l.includes('set-alarm-state'));

beforeEach(() => {
  dir = createScratchDir('send-test-alarm');
  awsLog = path.join(dir, 'aws.log');
  fs.writeFileSync(awsLog, '');
  fakeAws = path.join(dir, 'aws');
  fs.writeFileSync(
    fakeAws,
    [
      '#!/usr/bin/env bash',
      'printf \'%s\\n\' "$*" >> "$FAKE_AWS_LOG"',
      // An alarm held in one region only, as the backup region\'s are: asked
      // anywhere else, AWS knows no such alarm.
      'if [[ -n "${FAKE_REGION:-}" && " $* " != *" --region ${FAKE_REGION} "* ]]; then',
      '  [[ "$2" == describe-alarms ]] && { echo None; exit 0; }',
      '  echo "ResourceNotFound" >&2; exit 254',
      'fi',
      'if [[ -n "${FAKE_REFUSE_STATE:-}" && "$*" == *"--state-value ${FAKE_REFUSE_STATE}"* ]]; then',
      '  if [[ -z "${FAKE_REFUSE_ALARM:-}" || "$*" == *"--alarm-name ${FAKE_REFUSE_ALARM} "* ]]; then',
      '    echo "ResourceNotFound" >&2; exit 254',
      '  fi',
      'fi',
      // A state read answers from FAKE_STATES_FILE, one line per read, the last
      // line repeating once the queue is used up.
      'if [[ "$1" == cloudwatch && "$2" == describe-alarms && "$*" == *"StateValue"* ]]; then',
      '  [[ "${FAKE_STATE_FAILS:-}" == 1 ]] && { echo "AccessDenied" >&2; exit 254; }',
      '  first="$(head -n 1 "$FAKE_STATES_FILE")"; rest="$(tail -n +2 "$FAKE_STATES_FILE")"',
      '  [[ -n "$rest" ]] && printf "%s\\n" "$rest" > "$FAKE_STATES_FILE"',
      '  echo "$first"; exit 0',
      'fi',
      'if [[ "$1" == cloudwatch && "$2" == describe-alarms && "$*" == *"--alarm-name-prefix"* ]]; then',
      '  printf \'%s\\n\' "${FAKE_PREFIX_NAMES-None}"; exit 0',
      'fi',
      'if [[ "$1" == cloudwatch && "$2" == describe-alarms ]]; then',
      '  printf \'%s\\n\' "${FAKE_ACTIONS-arn:aws:sns:us-east-1:000000000000:footbag-production-alarms	arn:aws:sns:us-east-1:000000000000:footbag-production-alarms-critical}"',
      'fi',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
});

afterEach(() => {
  removeScratch(dir);
});

describe('send-test-alarm: raising the alarm', () => {
  it('raises the named alarm and then sets it back to OK, in that order', () => {
    const res = run(['--target', 'production', '--alarm', 'footbag-production-5xx-rate', '--yes']);
    expect(res.status).toBe(0);
    const [raise, restore] = calls();
    expect(raise).toContain('--alarm-name footbag-production-5xx-rate');
    expect(raise).toContain('--state-value ALARM');
    expect(restore).toContain('--state-value OK');
    expect(res.stdout).toContain('Record who received both in the cutover log');
  });

  it('fails when the alarm cannot be raised, and makes no second call', () => {
    const res = run(['--target', 'production', '--alarm', 'footbag-production-5xx-rate', '--yes'], {
      FAKE_REFUSE_STATE: 'ALARM',
    });
    expect(res.status).toBe(1);
    expect(calls()).toHaveLength(1);
  });

  it('fails when the alarm was raised but could not be set back to OK', () => {
    const res = run(['--target', 'production', '--alarm', 'footbag-production-5xx-rate', '--yes'], {
      FAKE_REFUSE_STATE: 'OK',
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('could not be set back to OK');
  });
});

describe('send-test-alarm: a set of alarms in one run', () => {
  const stateCalls = () => calls().map((l) => {
    const name = /--alarm-name (\S+)/.exec(l)?.[1];
    const state = /--state-value (\S+)/.exec(l)?.[1];
    return `${name} ${state}`;
  });

  it('raises every alarm a prefix names and every named one, each once, ALARM then OK', () => {
    // Defect caught: an alarm the prefix names skipped, one raised twice, or
    // an alarm left raised because its OK was sent before the next ALARM.
    const res = run([
      '--target', 'staging', '--alarm-prefix', 'footbag-staging-container-',
      '--alarm', 'footbag-staging-site-unavailable', '--alarm', 'footbag-staging-container-oom-web', '--yes',
    ], { FAKE_PREFIX_NAMES: 'footbag-staging-container-crash-web\tfootbag-staging-container-oom-web' });
    expect(res.status, res.stderr).toBe(0);
    expect(stateCalls()).toEqual([
      'footbag-staging-container-crash-web ALARM', 'footbag-staging-container-crash-web OK',
      'footbag-staging-container-oom-web ALARM', 'footbag-staging-container-oom-web OK',
      'footbag-staging-site-unavailable ALARM', 'footbag-staging-site-unavailable OK',
    ]);
    expect(res.stdout).toContain('About to raise 3 staging alarm(s)');
  });

  it('changes nothing when a prefix names no alarm', () => {
    // Defect caught: a mistyped prefix reported as a passed test of nothing.
    const res = run(['--target', 'staging', '--alarm-prefix', 'footbag-staging-contianer-', '--yes']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('has no alarm whose name starts with footbag-staging-contianer-');
    expect(calls()).toHaveLength(0);
  });

  it('stops at an alarm whose raise is refused, leaving the earlier ones restored and the later untouched', () => {
    // Defect caught: a run that carries on past a refusal and reports the set
    // as proven, or leaves an alarm raised.
    const res = run(['--target', 'staging', '--alarm', 'footbag-staging-a', '--alarm', 'footbag-staging-b',
      '--alarm', 'footbag-staging-c', '--yes'], { FAKE_REFUSE_STATE: 'ALARM', FAKE_REFUSE_ALARM: 'footbag-staging-b' });
    expect(res.status).toBe(1);
    expect(stateCalls()).toEqual(['footbag-staging-a ALARM', 'footbag-staging-a OK', 'footbag-staging-b ALARM']);
    expect(res.stderr).toContain('The alarms after it were not touched');
  });

  it('refuses a prefix belonging to the other environment', () => {
    const res = run(['--target', 'staging', '--alarm-prefix', 'footbag-production-', '--yes']);
    expect(res.status).toBe(2);
    expect(fs.readFileSync(awsLog, 'utf8')).toBe('');
  });
});

describe('send-test-alarm: refusals', () => {
  it('refuses an alarm belonging to the other environment', () => {
    const res = run(['--target', 'staging', '--alarm', 'footbag-production-5xx-rate', '--yes']);
    expect(res.status).toBe(2);
    expect(calls()).toHaveLength(0);
  });

  it('refuses without a target or an alarm', () => {
    expect(run(['--alarm', 'footbag-production-5xx-rate', '--yes']).status).toBe(2);
    expect(run(['--target', 'production', '--yes']).status).toBe(2);
  });

  it('changes nothing without the typed confirmation when no terminal is attached', () => {
    const res = run(['--target', 'production', '--alarm', 'footbag-production-5xx-rate']);
    expect(res.status).toBe(1);
    expect(calls()).toHaveLength(0);
  });

  it('says which inboxes to check, from the alarm\'s own actions', () => {
    // Defect caught: the group told to watch for a warning that never reaches
    // it, recorded as a failed delivery; or a critical test the group is not
    // told about.
    const critical = run(['--target', 'production', '--alarm', 'footbag-production-site-unavailable', '--yes']);
    expect(critical.stdout).toContain('the watch group receives both mails as well');
    const warning = run(['--target', 'production', '--alarm', 'footbag-production-high-cpu-warning', '--yes'], {
      FAKE_ACTIONS: 'arn:aws:sns:us-east-1:000000000000:footbag-production-alarms',
    });
    expect(warning.status).toBe(0);
    expect(warning.stdout).toContain('the watch group does not receive it');
  });

  it('raises an alarm in the backup region when asked, with every call made there', () => {
    // Defect caught: the alarms on metrics AWS publishes only in us-west-2
    // can never be fire-tested, so a broken path from them to the mailbox
    // and the admin feed is never seen; or the lookup is made there and the
    // raise in the default region, failing after the confirmation.
    const env = {
      FAKE_REGION: 'us-west-2',
      FAKE_ACTIONS: 'arn:aws:sns:us-west-2:000000000000:footbag-production-alarms-usw2',
    };
    const alarm = 'footbag-production-snapshots-hourly-replication-stopped';
    const unseen = run(['--target', 'production', '--alarm', alarm, '--yes'], env);
    expect(unseen.status).toBe(1);
    expect(unseen.stderr).toContain('has no alarm named');
    expect(calls()).toHaveLength(0);
    const res = run(['--target', 'production', '--region', 'us-west-2', '--alarm', alarm, '--yes'], env);
    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toHaveLength(2);
    for (const c of calls()) expect(c).toContain('--region us-west-2');
    expect(res.stdout).toContain('the watch group receives both mails as well');
  });

  it('refuses a region the estate does not use', () => {
    const res = run(['--target', 'production', '--region', 'eu-west-1', '--alarm', 'footbag-production-site-unavailable', '--yes']);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('--region must be us-east-1 or us-west-2');
    expect(calls()).toHaveLength(0);
  });

  it('refuses a name that is not one of the environment\'s alarms, changing nothing', () => {
    const res = run(['--target', 'production', '--alarm', 'footbag-production-no-such-alarm', '--yes'], { FAKE_ACTIONS: 'None' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('has no alarm named');
    expect(calls()).toHaveLength(0);
  });

  it('says on stderr that a stand-in AWS CLI proves nothing about the account', () => {
    const res = run(['--target', 'production', '--alarm', 'footbag-production-5xx-rate', '--yes']);
    expect(res.stderr).toContain('proves nothing about the account');
  });
});

describe('send-test-alarm --status: reading alarm state, changing nothing', () => {
  const ALARM = 'footbag-production-jobs-heartbeat';
  function status(states: string[], extra: string[], env: Record<string, string> = {}) {
    const statesFile = path.join(dir, 'states');
    fs.writeFileSync(statesFile, states.join('\n') + '\n');
    return run(['--target', 'production', '--alarm', ALARM, '--status', ...extra],
      { FAKE_STATES_FILE: statesFile, FOOTBAG_ALARM_POLL_SECS: '0', ...env });
  }

  // Defect caught: a read that raises the alarm it was asked to look at, paging
  // every watcher, or that stops for a typed confirmation inside a sitting.
  it('reads the state, sets nothing and asks nothing', () => {
    const res = status(['OK'], ['--expect', 'OK']);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain(`${ALARM}: OK`);
    expect(calls()).toEqual([]);
    expect(res.stdout).not.toMatch(/Type 'APPLY'/);
  });

  // Defect caught: an alarm stuck in INSUFFICIENT_DATA (its metric never
  // arriving) read as healthy because only ALARM counts as bad.
  it('exits 3 when the alarm does not read the expected state', () => {
    const res = status(['INSUFFICIENT_DATA'], ['--expect', 'OK']);
    expect(res.status, res.stderr).toBe(3);
    expect(res.stderr).toMatch(/still not: footbag-production-jobs-heartbeat \(INSUFFICIENT_DATA\)/);
  });

  // Defect caught: the wait for a real breach giving up after the first read,
  // so an alarm that needs two evaluation periods can never be proved.
  it('reads again until the expected state arrives within the wait', () => {
    const res = status(['OK', 'OK', 'ALARM'], ['--expect', 'ALARM', '--wait-minutes', '5']);
    expect(res.status, res.stderr).toBe(0);
    expect((res.stdout.match(new RegExp(`${ALARM}: `, 'g')) ?? []).length).toBe(3);
  });

  // Defect caught: a failed read reported as "not yet", so the caller waits on
  // an alarm it cannot see.
  it('fails on a read it could not make', () => {
    const res = status(['OK'], ['--expect', 'OK'], { FAKE_STATE_FAILS: '1' });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/the state of footbag-production-jobs-heartbeat could not be read/);
  });

  it('refuses --expect without --status, and --wait-minutes without --expect', () => {
    expect(run(['--target', 'production', '--alarm', ALARM, '--expect', 'OK']).status).toBe(2);
    expect(run(['--target', 'production', '--alarm', ALARM, '--status', '--wait-minutes', '3']).status).toBe(2);
    expect(calls()).toEqual([]);
  });
});

describe('send-test-alarm: reading a metric', () => {
  /** A stand-in that answers metric reads with one line per read from FAKE_SUMS_FILE. */
  function metricAws(): string {
    const p = path.join(dir, 'aws-metric');
    fs.writeFileSync(p, [
      '#!/usr/bin/env bash',
      'printf \'%s\\n\' "$*" >> "$FAKE_AWS_LOG"',
      'if [[ "$2" == get-metric-statistics ]]; then',
      '  [[ "${FAKE_METRIC_FAILS:-}" == 1 ]] && { echo "AccessDenied" >&2; exit 254; }',
      '  first="$(head -n 1 "$FAKE_SUMS_FILE")"; rest="$(tail -n +2 "$FAKE_SUMS_FILE")"',
      '  [[ -n "$rest" ]] && printf "%s\\n" "$rest" > "$FAKE_SUMS_FILE"',
      '  echo "$first"; exit 0',
      'fi',
      '',
    ].join('\n'), { mode: 0o755 });
    return p;
  }
  function metric(sums: string[], extra: string[] = [], env: Record<string, string> = {}) {
    const f = path.join(dir, 'sums');
    fs.writeFileSync(f, sums.join('\n') + '\n');
    return run(['--target', 'production', '--status', '--metric', 'LoginSuccessCount', ...extra],
      { FOOTBAG_AWS_BIN: metricAws(), FAKE_SUMS_FILE: f, FOOTBAG_ALARM_POLL_SECS: '0', ...env });
  }

  // Defect caught: the zero-logins alarm trusted although its filter never
  // matches a real sign-in; a counted sign-in is the only proof it watches one.
  it('passes once the metric counts something in the window, reading the environment\'s namespace', () => {
    const res = metric(['0.0', '0.0\t1.0'], ['--wait-minutes', '5']);
    expect(res.status, res.stderr).toBe(0);
    const reads = fs.readFileSync(awsLog, 'utf8').split('\n').filter((l) => l.includes('get-metric-statistics'));
    expect(reads.length).toBe(2);
    expect(reads[0]).toContain('--namespace Footbag/production');
    expect(reads[0]).toContain('--metric-name LoginSuccessCount');
    expect(reads[0]).toContain('--statistics Sum');
  });

  // Defect caught: an empty window, or one holding only zeros, read as counted.
  it('exits 3 when nothing is counted within the wait', () => {
    // One read each: with no pause between reads a wait would spin for its
    // whole length, and the verdict is the same.
    expect(metric(['None']).status).toBe(3);
    expect(metric(['0.0\t0.0']).status).toBe(3);
  });

  it('fails on a read it could not make, and refuses beside an alarm name or without --status', () => {
    expect(metric(['1.0'], [], { FAKE_METRIC_FAILS: '1' }).status).toBe(1);
    expect(run(['--target', 'production', '--metric', 'LoginSuccessCount']).status).toBe(2);
    expect(run(['--target', 'production', '--status', '--metric', 'LoginSuccessCount', '--alarm', 'footbag-production-high-cpu']).status).toBe(2);
    expect(run(['--target', 'production', '--status', '--metric', 'bad name']).status).toBe(2);
  });
});

describe('send-test-alarm: pacing', () => {
  // Defect caught: a batch of test alarms published faster than the email
  // service allows one subscription (ten messages a second), which suspends
  // the subscription for 30 days, so alarm mail stops with no error.
  it('pauses between alarms, and not after the last', () => {
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    const sleepLog = path.join(dir, 'sleep.log');
    fs.writeFileSync(path.join(bin, 'sleep'), `#!/usr/bin/env bash\necho "$*" >> ${JSON.stringify(sleepLog)}\n`, { mode: 0o755 });
    const res = run(
      ['--target', 'production', '--alarm', 'footbag-production-high-cpu', '--alarm', 'footbag-production-high-memory', '--yes'],
      { PATH: `${bin}:${process.env.PATH ?? ''}` },
    );
    expect(res.status, res.stderr).toBe(0);
    expect(fs.readFileSync(sleepLog, 'utf8').trim().split('\n')).toEqual(['1']);
  });
});

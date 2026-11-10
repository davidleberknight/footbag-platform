/**
 * scripts/reconfirm-alarm-subscriptions.sh: the read-only status of every alarm
 * email subscription, and the recreation of all of them through the values
 * file, against a stand-in aws CLI, a scratch values file and a stand-in apply.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/reconfirm-alarm-subscriptions.sh');

let dir: string;
let tfvars: string;

// Answers the three reads the status makes. SUBS_<topic> lists that topic's
// email subscriptions as "arn endpoint" lines; AUTH_<n> answers for sub-<n>.
const AWS_STUB = `#!/usr/bin/env bash
case "$2" in
  list-topics)
    region=""; prev=""; for a in "$@"; do [[ "$prev" == --region ]] && region="$a"; prev="$a"; done
    if [[ "$region" == us-west-2 ]]; then printf 'arn:aws:sns:us-west-2:000000000000:footbag-staging-alarms-usw2\\n'
    else printf 'arn:aws:sns:us-east-1:000000000000:footbag-staging-alarms\\tarn:aws:sns:us-east-1:000000000000:footbag-staging-alarms-critical\\n'; fi ;;
  list-subscriptions-by-topic)
    topic=""; prev=""; for a in "$@"; do [[ "$prev" == --topic-arn ]] && topic="\${a##*:}"; prev="$a"; done
    var="SUBS_\${topic//-/_}"; printf '%b' "\${!var:-}" ;;
  get-subscription-attributes)
    sub=""; prev=""; for a in "$@"; do [[ "$prev" == --subscription-arn ]] && sub="$a"; prev="$a"; done
    var="AUTH_\${sub##*-}"
    [[ "\${!var:-}" == FAIL ]] && { echo "An error occurred (Throttling)" >&2; exit 254; }
    echo "\${!var:-true}" ;;
esac
`;

function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  const res = spawnSync('bash', [SCRIPT, '--target', 'staging', ...args], {
    encoding: 'utf8',
    env: { ...process.env, RECONFIRM_AWS_BIN: join(dir, 'aws'), ...env },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

beforeEach(() => {
  dir = createScratchDir('reconfirm-alarm-subs');
  tfvars = join(dir, 'terraform.tfvars');
  writeFileSync(join(dir, 'aws'), AWS_STUB);
  chmodSync(join(dir, 'aws'), 0o755);
});
afterEach(() => removeScratch(dir));

describe('reconfirm-alarm-subscriptions.sh --status', () => {
  const SUBS = {
    SUBS_footbag_staging_alarms: 'sub-1\\tops@example.invalid\\n',
    SUBS_footbag_staging_alarms_usw2: 'sub-2\\tops@example.invalid\\nPendingConfirmation\\tgroup@example.invalid\\n',
  };

  it('reports an authenticated subscription as safe and passes', () => {
    const r = run(['--status'], { SUBS_footbag_staging_alarms: 'sub-1\\tops@example.invalid\\n' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/footbag-staging-alarms: ops@example\.invalid authenticated/);
    expect(r.stderr).not.toMatch(/ WARN/);
  });

  // Defect caught: the shared group's subscription confirmed by a click, which
  // any member clicking an unsubscribe link removes for everyone, reported as
  // fine. The group is the address on the critical-alarms topic, and its
  // us-west-2 subscription is the group's too.
  // A caller that loops on this status (the readiness sitting) reads the exit
  // code: 4 for clicked only must not read as clean, nor as pending.
  it('warns on the group address confirmed by a click, naming the recreation, and exits 4', () => {
    const r = run(['--status'], {
      SUBS_footbag_staging_alarms_critical: 'sub-3\\tgroup@example.invalid\\n',
      SUBS_footbag_staging_alarms_usw2: 'sub-2\\tgroup@example.invalid\\n',
      AUTH_2: 'false',
    });
    expect(r.status, r.stderr).toBe(4);
    expect(r.stderr).toMatch(/footbag-staging-alarms-usw2: group@example\.invalid was confirmed by a click/);
    expect(r.stderr).toMatch(/reconfirm-alarm-subscriptions\.sh --target staging/);
  });

  // Defect caught: the operations mailbox, whose click confirmation counts as
  // confirmed, reported as a warning to recreate, so every clean run tells the
  // operator to undo a confirmation that is in order.
  it('reads the operations mailbox confirmed by a click as confirmed, with no warning, and exits 4', () => {
    const r = run(['--status'], {
      SUBS_footbag_staging_alarms: 'sub-1\\tops@example.invalid\\n',
      SUBS_footbag_staging_alarms_usw2: 'sub-2\\tops@example.invalid\\n',
      AUTH_1: 'false',
      AUTH_2: 'false',
    });
    expect(r.status, r.stderr).toBe(4);
    expect(r.stdout).toMatch(/footbag-staging-alarms: ops@example\.invalid confirmed by a click, which counts for the operations mailbox/);
    expect(r.stdout).toMatch(/footbag-staging-alarms-usw2: ops@example\.invalid confirmed by a click/);
    expect(r.stderr).not.toMatch(/WARNING/);
  });

  // Defect caught: a caller told "clean" while an address still waits for its
  // confirmation, so it gets no alarm mail at all.
  it('warns on a pending subscription, naming the confirm script, and exits 3', () => {
    const r = run(['--status'], SUBS);
    expect(r.status, r.stderr).toBe(3);
    expect(r.stderr).toMatch(/group@example\.invalid is pending confirmation; confirm its link with bash scripts\/confirm-alarm-subscription\.sh --target staging/);
  });

  // Pending is the worse state, so a mix of pending and clicked exits 3.
  it('exits 3 when one subscription is pending and another clicked', () => {
    const r = run(['--status'], { ...SUBS, AUTH_2: 'false' });
    expect(r.status, r.stderr).toBe(3);
    expect(r.stdout).toMatch(/ops@example\.invalid confirmed by a click/);
  });

  // Defect caught: a failed read reported as pending, so a caller would loop
  // asking for confirmation emails when the real problem is the read.
  it('exits 1 on a failed read even while another subscription is pending', () => {
    const r = run(['--status'], { ...SUBS, AUTH_2: 'FAIL' });
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toMatch(/could not read footbag-staging-alarms-usw2's subscription/);
  });
});

describe('reconfirm-alarm-subscriptions.sh, recreating the subscriptions', () => {
  it('raises an existing generation by one, keeping the rest of the file', () => {
    writeFileSync(tfvars, 'alarm_email = "x"\nalarm_email_subscription_generation = 3   # bumped on resend\nenable_cloudfront = true\n');
    const r = run(['--tfvars', tfvars, '--yes']);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(tfvars, 'utf8')).toBe('alarm_email = "x"\nalarm_email_subscription_generation = 4   # bumped on resend\nenable_cloudfront = true\n');
  });

  it('adds the line at 1 when the file has none, after a blank line', () => {
    // terraform fmt aligns the = signs of consecutive lines, so a line added
    // straight after the file's last setting leaves the operator's values file
    // failing the fmt check the full gate runs. A blank line makes it a group
    // of its own, which fmt leaves alone.
    writeFileSync(tfvars, 'enable_container_alarms = true\n');
    run(['--tfvars', tfvars, '--yes']);
    expect(readFileSync(tfvars, 'utf8')).toBe('enable_container_alarms = true\n\nalarm_email_subscription_generation = 1\n');
  });

  it('adds no second blank line to a file that already ends with one', () => {
    writeFileSync(tfvars, 'alarm_email = "x"\n\n');
    run(['--tfvars', tfvars, '--yes']);
    expect(readFileSync(tfvars, 'utf8')).toBe('alarm_email = "x"\n\nalarm_email_subscription_generation = 1\n');
  });

  it('refuses a generation that is not a whole number, changing nothing', () => {
    writeFileSync(tfvars, 'alarm_email_subscription_generation = "two"\n');
    const r = run(['--tfvars', tfvars, '--yes']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/is '"two"', not a whole number/);
    expect(readFileSync(tfvars, 'utf8')).toBe('alarm_email_subscription_generation = "two"\n');
  });

  it('changes nothing without the typed confirmation', () => {
    writeFileSync(tfvars, 'alarm_email_subscription_generation = 2\n');
    const r = run(['--tfvars', tfvars]);
    expect(r.status).not.toBe(0);
    expect(readFileSync(tfvars, 'utf8')).toBe('alarm_email_subscription_generation = 2\n');
  });

  it('applies and then names the confirm script for each fresh link', () => {
    writeFileSync(tfvars, 'alarm_email_subscription_generation = 0\n');
    const tf = join(dir, 'terraform-apply.sh');
    writeFileSync(tf, '#!/usr/bin/env bash\necho "applied $*"\n');
    chmodSync(tf, 0o755);
    const r = run(['--tfvars', tfvars, '--yes'], { RECONFIRM_TERRAFORM: tf });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/applied --target staging/);
    expect(r.stdout).toMatch(/bash scripts\/confirm-alarm-subscription\.sh --target staging/);
  });

  it('keeps the raised generation after a failed apply, since the apply may have recreated some', () => {
    writeFileSync(tfvars, 'alarm_email_subscription_generation = 0\n');
    const tf = join(dir, 'terraform-apply.sh');
    writeFileSync(tf, '#!/usr/bin/env bash\necho "Error: creating SNS subscription" >&2; exit 1\n');
    chmodSync(tf, 0o755);
    const r = run(['--tfvars', tfvars, '--yes'], { RECONFIRM_TERRAFORM: tf });
    expect(r.status).not.toBe(0);
    expect(readFileSync(tfvars, 'utf8')).toBe('alarm_email_subscription_generation = 1\n');
  });
});

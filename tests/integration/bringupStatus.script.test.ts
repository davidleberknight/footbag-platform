/**
 * scripts/bringup-status.sh — step rendering and next-action guidance.
 *
 * Real runs probe a live host, terraform state, and AWS, which CI cannot
 * exercise. The synthetic --probe-file mode supplies every probe result as
 * KEY=VALUE lines; these tests pin the per-step status logic (DONE /
 * PENDING / UNKNOWN / N-A / INFO) and the next-command text the operator is
 * given for each pending step.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const SCRIPT = join(process.cwd(), 'scripts/bringup-status.sh');
// The checksum a rebuild records for the schema file this release carries.
const SCHEMA_SHA = createHash('sha256').update(readFileSync(join(process.cwd(), 'database/schema.sql'))).digest('hex');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runScript(args: string[], env: NodeJS.ProcessEnv = process.env): RunResult {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    env,
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

let tmpDir: string;
beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'footbag-test-bringup-status-'));
});
afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

let fileCounter = 0;
function writeProbeFile(lines: string[]): string {
  fileCounter += 1;
  const p = join(tmpDir, `probe-${fileCounter}.env`);
  writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

const ALL_DONE_PRODUCTION = [
  'ENV_FETCHED=yes',
  'ENV_TRUST_PROXY=2',
  'ENV_BACKUP_S3_BUCKET=set',
  'ENV_PAYMENT_ADAPTER=live',
  'ENV_WEBHOOK_SECRET=set',
  'TIMER_ACTIVE=active',
  'CONTAINERS=footbag-web-1 Up 2 hours (healthy), footbag-nginx-1 Up 2 hours (healthy), footbag-worker-1 Up 2 hours (healthy), footbag-image-1 Up 2 hours (healthy)',
  'TF_PLAN=insync',
  'TF_PLAN_SHARED=insync',
  'TF_PLAN_IDENTITY=insync',
  'TF_BACKUP_ALARM=present',
  'TF_CUTOVER_ALARM=absent',
  'TF_SES_SUBSCRIPTION=present',
  'SSM_STRIPE_KEY=live',
  'SSM_BOOTSTRAP_TOKEN=absent',
  'CW_BACKUP_METRIC=flowing',
  'ORIGIN_HOP=encrypted',
];

describe('bringup-status.sh — argument validation', () => {
  it('rejects an unknown argument', () => {
    const result = runScript(['--bogus']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/unknown argument/);
  });

  it('rejects an invalid target', () => {
    const result = runScript(['--target', 'dev']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--target must be 'staging' or 'production'/);
  });

  it('rejects a nonexistent --probe-file path', () => {
    const result = runScript(['--target', 'staging', '--probe-file', join(tmpDir, 'nope')]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/does not exist/);
  });
});

describe('bringup-status.sh — fully provisioned production', () => {
  it('reports the provisioned steps DONE and exits 0', () => {
    const probe = writeProbeFile(ALL_DONE_PRODUCTION);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/1\. Host env file\s+DONE\s+TRUST_PROXY=2, BACKUP_S3_BUCKET set/);
    expect(result.stdout).toMatch(/2\. Terraform\s+DONE/);
    expect(result.stdout).toMatch(/3\. Payments\s+DONE/);
    expect(result.stdout).toMatch(/4\. Backup pipeline\s+DONE/);
    expect(result.stdout).toMatch(/5\. SES feedback\s+DONE/);
    expect(result.stdout).toMatch(/8\. Deployed runtime\s+DONE/);
  });

  it('holds the runtime row pending while the container monitor heartbeat is not arriving', () => {
    // Defect caught: healthy containers reported done while nothing watches
    // them, because the monitor's readings never reach CloudWatch.
    const probe = writeProbeFile([...ALL_DONE_PRODUCTION, 'CW_MONITOR_HEARTBEAT=missing']);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/8\. Deployed runtime\s+PENDING\s+containers healthy, but container_monitor_heartbeat is not arriving/);
    expect(result.stdout).toMatch(/journalctl -u footbag-container-monitor\.service/);
    const flowing = runScript(['--target', 'production', '--probe-file', writeProbeFile([...ALL_DONE_PRODUCTION, 'CW_MONITOR_HEARTBEAT=flowing'])]);
    expect(flowing.stdout).toMatch(/8\. Deployed runtime\s+DONE.*container monitor heartbeat: flowing/);
  });

  it('an absent token with the administrators uncounted reads unknown, never DONE, and names no raw parameter write', () => {
    // Defects caught: a self-deleted token, which reads the same before
    // provisioning and after a claim, is reported as an administrator; or the
    // operator is told to hand-type a SecureString write instead of the script.
    const probe = writeProbeFile(ALL_DONE_PRODUCTION);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/6\. First admin\s+UNKNOWN/);
    expect(result.stdout).not.toMatch(/aws ssm put-parameter/);
  });

  it('decides the first-admin row on the host database count of administrators', () => {
    // Defects caught: a production with a claimed administrator still reads
    // unknown, so the step is never seen done; or a production with none reads
    // anything but pending with the provisioning script named.
    const withAdmins = (n: string) => runScript(['--target', 'production', '--probe-file', writeProbeFile([...ALL_DONE_PRODUCTION, `DB_ADMINS=${n}`])]);
    expect(withAdmins('1').stdout).toMatch(/6\. First admin\s+DONE\s+1 administrator/);
    const none = withAdmins('0').stdout;
    expect(none).toMatch(/6\. First admin\s+PENDING\s+no administrator/);
    expect(none).toMatch(/admin-bootstrap-token\.sh --target production --profile <profile> provision/);
    const waiting = runScript(['--target', 'production', '--probe-file', writeProbeFile([
      ...ALL_DONE_PRODUCTION.map(l => l.replace('SSM_BOOTSTRAP_TOKEN=absent', 'SSM_BOOTSTRAP_TOKEN=present')), 'DB_ADMINS=0',
    ])]);
    expect(waiting.stdout).toMatch(/6\. First admin\s+PENDING\s+bootstrap token provisioned, awaiting claim/);
    expect(waiting.stdout).not.toMatch(/admin-bootstrap-token\.sh .* provision/);
  });

  it('a provisioned bootstrap token reads as awaiting claim', () => {
    const probe = writeProbeFile(
      ALL_DONE_PRODUCTION.map(l => l.replace('SSM_BOOTSTRAP_TOKEN=absent', 'SSM_BOOTSTRAP_TOKEN=present')),
    );
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/6\. First admin\s+PENDING\s+bootstrap token provisioned, awaiting claim/);
  });

  it('the cutover login alarm renders as window-scoped INFO in both states', () => {
    const offProbe = writeProbeFile(ALL_DONE_PRODUCTION);
    const off = runScript(['--target', 'production', '--probe-file', offProbe]);
    expect(off.stdout).toMatch(/7\. Cutover login alarm\s+INFO\s+OFF; correct outside the cutover window/);

    const onProbe = writeProbeFile(
      ALL_DONE_PRODUCTION.map(l => l.replace('TF_CUTOVER_ALARM=absent', 'TF_CUTOVER_ALARM=present')),
    );
    const on = runScript(['--target', 'production', '--probe-file', onProbe]);
    expect(on.stdout).toMatch(/7\. Cutover login alarm\s+INFO\s+ON; disable after the cutover window/);
    // The way off is the gate script, never a values-file edit and an apply.
    expect(on.stdout).toMatch(/set-terraform-gate\.sh --target production --gate enable_cutover_login_alarm --state off/);
    expect(on.stdout).not.toMatch(/enable_cutover_login_alarm = (true|false), apply/);
  });
});

describe('bringup-status.sh — alarm gates, alarm subscriptions and GuardDuty', () => {
  const rowsFor = (target: string, extra: string[]) =>
    runScript(['--target', target, '--probe-file', writeProbeFile([...ALL_DONE_PRODUCTION, ...extra])]).stdout;

  it('names each gate still off with the script that owns it, and reads done when none is', () => {
    // Defects caught: a gate left off in the values file reads as ready, so its
    // alarm never exists; or the next step is a values-file edit that skips the
    // gate script's metric check, arming an alarm that pages at once.
    const off = rowsFor('production', ['GATES_OFF=enable_container_alarms enable_cwagent_alarms']);
    expect(off).toMatch(/11\. Alarm gates\s+PENDING\s+off in the values file: enable_container_alarms enable_cwagent_alarms/);
    expect(off).toMatch(/set-terraform-gate\.sh --target production --gate enable_container_alarms --state on/);
    expect(off).toMatch(/arm-cwagent-alarms\.sh --target production/);
    expect(rowsFor('production', ['GATES_OFF=none'])).toMatch(/11\. Alarm gates\s+DONE/);
    expect(rowsFor('production', [])).toMatch(/11\. Alarm gates\s+UNKNOWN/);
  });

  it('reads a click-confirmed subscription done and an unconfirmed one pending with its command', () => {
    // Defects caught: a subscription that receives nothing reads as alarm mail
    // that will arrive; or one confirmed by a click, which receives alarm mail,
    // held pending so the operator is asked to confirm it again.
    const clicked = rowsFor('staging', ['SUBS_STATE=click', 'SUBS_DETAIL=footbag-staging-alarms: ops@example.test (clicked)']);
    expect(clicked).toMatch(/12\. Alarm subscriptions\s+DONE\s+confirmed.*footbag-staging-alarms/);
    const pending = rowsFor('staging', ['SUBS_STATE=pending']);
    expect(pending).toMatch(/12\. Alarm subscriptions\s+PENDING\s+awaiting confirmation/);
    expect(pending).toMatch(/Confirm subscription/);
    expect(rowsFor('staging', ['SUBS_STATE=confirmed'])).toMatch(/12\. Alarm subscriptions\s+DONE/);
  });

  it('reports GuardDuty on production only, pending with the baseline script when off', () => {
    // Defect caught: an account with no enabled detector reads ready, or the
    // account-wide row is repeated per environment.
    const off = rowsFor('production', ['GUARDDUTY=off']);
    expect(off).toMatch(/13\. GuardDuty\s+PENDING/);
    expect(off).toMatch(/apply-account-baseline\.sh --enable-guardduty/);
    expect(rowsFor('production', ['GUARDDUTY=on'])).toMatch(/13\. GuardDuty\s+DONE/);
    expect(rowsFor('staging', ['GUARDDUTY=off'])).toMatch(/13\. GuardDuty\s+N-A/);
  });

  /**
   * What reconfirm-alarm-subscriptions.sh --status printed, captured from real
   * runs on 2026-11-09 (staging, then production), with the account id and the
   * mailbox address replaced by documentation values. Only the warnings and the
   * proven line are parsed; the rest is kept as the tool printed it.
   */
  const SUBS_CAPTURED_STAGING = [
    '==> AWS identity: taken from your environment, not from this script.',
    '    arn:aws:iam::111122223333:user/footbag-operator',
    'WARNING: footbag-staging-alarms: ops@example.test was confirmed by a click, so an unsubscribe link can remove it; recreate it with bash scripts/reconfirm-alarm-subscriptions.sh --target staging',
    '  footbag-staging-alarms-critical: no email subscriptions',
    'WARNING: footbag-staging-alarms-usw2: ops@example.test was confirmed by a click, so an unsubscribe link can remove it; recreate it with bash scripts/reconfirm-alarm-subscriptions.sh --target staging',
    '',
    '==== Closing report: reconfirm-alarm-subscriptions.sh ====',
    'Warnings (2):',
    '  - footbag-staging-alarms: ops@example.test was confirmed by a click, so an unsubscribe link can remove it; recreate it with bash scripts/reconfirm-alarm-subscriptions.sh --target staging',
    '  - footbag-staging-alarms-usw2: ops@example.test was confirmed by a click, so an unsubscribe link can remove it; recreate it with bash scripts/reconfirm-alarm-subscriptions.sh --target staging',
    'Proven:',
    '  - read every email subscription on the staging alarm topics found',
  ].join('\n');
  const SUBS_CAPTURED_PENDING = [
    '==> AWS identity: taken from your environment, not from this script.',
    '    arn:aws:iam::111122223333:user/footbag-operator',
    '  footbag-production-alarms-critical (us-east-1): no such topic',
    'WARNING: footbag-production-alarms-usw2: ops@example.test is pending confirmation; confirm its link with bash scripts/confirm-alarm-subscription.sh --target production',
    '',
    '==== Closing report: reconfirm-alarm-subscriptions.sh ====',
    'Proven:',
    '  - read every email subscription on the production alarm topics found',
  ].join('\n');

  /** A run through the real aws probe: a stand-in aws answering only the
   *  GuardDuty reads, and a stand-in subscription script printing `subs`. */
  function liveAwsProbe(target: string, detectorStatus: string | null, subs: string, subsRc = 0) {
    const root = join(tmpDir, `aws-probe-${++fileCounter}`);
    const bin = join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'aws'), [
      '#!/usr/bin/env bash',
      '[[ "$1 $2" == "guardduty list-detectors" ]] && { ' + (detectorStatus === null ? 'echo None' : 'echo 12abc34d567e8fa901bc2d34e56789f0') + '; exit 0; }',
      `[[ "$1 $2" == "guardduty get-detector" ]] && { echo ${JSON.stringify(detectorStatus ?? '')}; exit 0; }`,
      'exit 255',
    ].join('\n') + '\n');
    chmodSync(join(bin, 'aws'), 0o755);
    const subsFile = join(root, 'subs.txt');
    writeFileSync(subsFile, subs + '\n');
    writeFileSync(join(root, 'reconfirm.sh'), `cat ${JSON.stringify(subsFile)}\nexit ${subsRc}\n`);
    return runScript(['--target', target, '--skip-remote', '--skip-terraform', '--profile', 'stub-profile'], {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      BRINGUP_STATUS_RECONFIRM_CMD: join(root, 'reconfirm.sh'),
    }).stdout;
  }

  it('reads GuardDuty from the detector\'s own status, so a suspended detector is not on', () => {
    // Defect caught: a detector that exists but is suspended, which detects
    // nothing, read as the account's threat detection being on.
    expect(liveAwsProbe('production', 'ENABLED', SUBS_CAPTURED_STAGING)).toMatch(/13\. GuardDuty\s+DONE/);
    expect(liveAwsProbe('production', 'SUSPENDED', SUBS_CAPTURED_STAGING)).toMatch(/13\. GuardDuty\s+PENDING/);
    expect(liveAwsProbe('production', null, SUBS_CAPTURED_STAGING)).toMatch(/13\. GuardDuty\s+PENDING/);
  });

  it('parses the subscription script\'s real output into the row, and reads a failed run as unknown', () => {
    // Defects caught: the captured warning shapes match nothing, so clicked or
    // unconfirmed subscriptions read done; or a run that failed part-way, with
    // no proven line, reads as every subscription confirmed.
    const clicked = liveAwsProbe('staging', 'ENABLED', SUBS_CAPTURED_STAGING);
    expect(clicked).toMatch(/12\. Alarm subscriptions\s+DONE\s+confirmed.*footbag-staging-alarms: ops@example\.test \(clicked\); footbag-staging-alarms-usw2: ops@example\.test \(clicked\)/);
    const pending = liveAwsProbe('production', 'ENABLED', SUBS_CAPTURED_PENDING);
    expect(pending).toMatch(/12\. Alarm subscriptions\s+PENDING\s+awaiting confirmation: footbag-production-alarms-usw2: ops@example\.test \(pending\)/);
    const allConfirmed = SUBS_CAPTURED_PENDING.split('\n').filter(l => !l.startsWith('WARNING')).join('\n');
    expect(liveAwsProbe('production', 'ENABLED', allConfirmed)).toMatch(/12\. Alarm subscriptions\s+DONE/);
    expect(liveAwsProbe('production', 'ENABLED', SUBS_CAPTURED_STAGING, 1)).toMatch(/12\. Alarm subscriptions\s+UNKNOWN/);
    const noProof = SUBS_CAPTURED_PENDING.split('\n').filter(l => !l.startsWith('WARNING') && !l.includes('read every')).join('\n');
    expect(liveAwsProbe('production', 'ENABLED', noProof)).toMatch(/12\. Alarm subscriptions\s+UNKNOWN/);
  });

  it('reads the gates off the environment values file, skipping the window-scoped login alarm', () => {
    // Defects caught: a gate set true reads as off, a gate absent from the file
    // (so at its false default) reads as on, a variable that is not an alarm
    // gate is reported, or the cutover login alarm, off outside its window by
    // design, is reported as pending work. Driven through the real terraform
    // probe against a tree the test builds, so the values-file read itself runs.
    const root = join(tmpDir, `tf-root-${++fileCounter}`);
    const tree = join(root, 'production');
    mkdirSync(tree, { recursive: true });
    writeFileSync(join(tree, 'variables.tf'), [
      'variable "enable_backup_alarm" {', '  type    = bool', '  default = false', '}',
      'variable "enable_container_alarms" {', '  type    = bool', '  default = false', '}',
      'variable "enable_host_key_alarm" {', '  type    = bool', '  default = false', '}',
      'variable "enable_cutover_login_alarm" {', '  type    = bool', '  default = false', '}',
      'variable "enable_archive" {', '  type    = bool', '  default = false', '}',
    ].join('\n') + '\n');
    writeFileSync(join(tree, 'terraform.tfvars'), [
      'enable_backup_alarm     = true',
      'enable_container_alarms = false',
      'enable_archive          = false',
    ].join('\n') + '\n');
    const tf = join(root, 'bin');
    mkdirSync(tf, { recursive: true });
    writeFileSync(join(tf, 'terraform'), '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(join(tf, 'terraform'), 0o755);
    const result = runScript(['--target', 'production', '--skip-remote', '--skip-aws'], {
      ...process.env,
      ...awsIdentityStubEnv(root),
      BRINGUP_STATUS_TF_ROOT: root,
      PATH: `${tf}:${process.env.PATH ?? ''}`,
    });
    expect(result.stderr).toMatch(/SYNTHETIC: terraform root/);
    const line = result.stdout.split('\n').find(l => /11\. Alarm gates/.test(l)) ?? '';
    expect(line).toMatch(/Alarm gates\s+PENDING\s+off in the values file: enable_container_alarms enable_host_key_alarm$/);
  });

  it('reports UNKNOWN, never DONE, when the tree declares no alarm gate to read', () => {
    // Defect caught: a tree whose gate variables could not be found (renamed,
    // moved, or the wrong directory read) reported as every alarm armed, so
    // the bring-up is signed off with its alarms off.
    const root = join(tmpDir, `tf-root-${++fileCounter}`);
    const tree = join(root, 'production');
    mkdirSync(tree, { recursive: true });
    writeFileSync(join(tree, 'variables.tf'), [
      'variable "enable_cutover_login_alarm" {', '  type    = bool', '  default = false', '}',
      'variable "enable_archive" {', '  type    = bool', '  default = false', '}',
    ].join('\n') + '\n');
    writeFileSync(join(tree, 'terraform.tfvars'), 'enable_archive = true\n');
    const tf = join(root, 'bin');
    mkdirSync(tf, { recursive: true });
    writeFileSync(join(tf, 'terraform'), '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(join(tf, 'terraform'), 0o755);
    const result = runScript(['--target', 'production', '--skip-remote', '--skip-aws'], {
      ...process.env,
      ...awsIdentityStubEnv(root),
      BRINGUP_STATUS_TF_ROOT: root,
      PATH: `${tf}:${process.env.PATH ?? ''}`,
    });
    const line = result.stdout.split('\n').find(l => /11\. Alarm gates/.test(l)) ?? '';
    expect(line).toMatch(/Alarm gates\s+UNKNOWN\s+no enable_\*alarm or enable_\*alarms variable was found/);
  });
});

describe('bringup-status.sh — the encryption keys row', () => {
  const rowFor = (extra: string[]) => {
    const out = runScript(['--target', 'staging', '--probe-file', writeProbeFile([...ALL_DONE_PRODUCTION, ...extra])]).stdout;
    const lines = out.split('\n');
    const i = lines.findIndex((l) => /14\. Encryption keys/.test(l));
    return { row: lines[i] ?? '', next: lines[i + 1] ?? '', out };
  };

  it('reads done only when both keys are Enabled', () => {
    // Defect caught: a dashboard reading the keys ready while one is not, or
    // never reading them ready at all.
    expect(rowFor(['KMS_MAIN=Enabled', 'KMS_JWT=Enabled']).row).toMatch(/Encryption keys\s+DONE/);
  });

  it('holds a key scheduled for deletion or disabled pending, naming the recovery command', () => {
    // Defect caught: a key counting down to permanent deletion, which takes
    // every secret or every sign-in with it, reads as done or as unknown.
    for (const [main, jwt, named] of [
      ['PendingDeletion', 'Enabled', /application key PendingDeletion/],
      ['Enabled', 'Disabled', /session signing key Disabled/],
    ] as const) {
      const r = rowFor([`KMS_MAIN=${main}`, `KMS_JWT=${jwt}`]);
      expect(r.row, `${main}/${jwt}`).toMatch(/Encryption keys\s+PENDING/);
      expect(r.row, `${main}/${jwt}`).toMatch(named);
      expect(r.next, `${main}/${jwt}`).toMatch(/kms-key-status\.sh --target staging --cancel-deletion/);
    }
  });

  it('a pending deletion outranks a key it could not read, and an unread key is unknown, never done', () => {
    // Defect caught: one unreadable key hiding the other's scheduled deletion,
    // or an unprobed run reading as both keys enabled.
    expect(rowFor(['KMS_MAIN=PendingDeletion']).row).toMatch(/Encryption keys\s+PENDING/);
    expect(rowFor(['KMS_MAIN=Enabled']).row).toMatch(/Encryption keys\s+UNKNOWN\s+not read: session signing key/);
  });

  it('sits before the host bootstrap rows, which start at 15', () => {
    // Defect caught: the new row colliding with the first bootstrap row's number.
    const { out } = rowFor(['KMS_MAIN=Enabled', 'KMS_JWT=Enabled']);
    const boot = out.split('-- host bootstrap')[1].split('\n').filter((l) => /^\s*\d+\.\s/.test(l));
    expect(boot[0]).toMatch(/^\s*15\.\s/);
    expect(out.indexOf('14. Encryption keys')).toBeLessThan(out.indexOf('-- host bootstrap'));
  });

  it('reads each key through its own alias with the live aws probe', () => {
    // Defect caught: the probe asking the wrong alias, or reading the one key's
    // state for both, so a scheduled signing-key deletion reads done.
    const root = join(tmpDir, `kms-probe-${++fileCounter}`);
    const bin = join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'aws'), [
      '#!/usr/bin/env bash',
      'if [[ "$1 $2" == "kms describe-key" ]]; then',
      '  case "$*" in',
      '    *alias/footbag-staging-jwt*) echo PendingDeletion; exit 0 ;;',
      '    *alias/footbag-staging\\ *) echo Enabled; exit 0 ;;',
      '  esac',
      'fi',
      'exit 255',
    ].join('\n') + '\n');
    chmodSync(join(bin, 'aws'), 0o755);
    writeFileSync(join(root, 'reconfirm.sh'), 'exit 1\n');
    const out = runScript(['--target', 'staging', '--skip-remote', '--skip-terraform', '--profile', 'stub-profile'], {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      BRINGUP_STATUS_RECONFIRM_CMD: join(root, 'reconfirm.sh'),
    }).stdout;
    const row = out.split('\n').find((l) => /14\. Encryption keys/.test(l)) ?? '';
    expect(row).toMatch(/PENDING\s+session signing key PendingDeletion$/);
  });
});

describe('bringup-status.sh — a deactivation that did not finish', () => {
  // Deactivation resets the Stripe parameters before it removes the host's
  // copy, deliberately: a deploy landing between the two reads a placeholder
  // and leaves the host alone, where the reverse order would let it reinstall
  // the secret being removed. A run that stops in that window therefore leaves
  // the parameters at placeholder while the host keeps a live signing secret,
  // and no deploy converges it, because a placeholder means "no outgoing
  // secret". Declining says so at the time; a crash says nothing, so the state
  // has to be legible here.
  const STUCK = [
    'ENV_FETCHED=yes',
    'ENV_PAYMENTS_ARMED=dark',
    'ENV_PAYMENT_ADAPTER=stub',
    'ENV_WEBHOOK_SECRET=set',
    'SSM_STRIPE_KEY=placeholder',
    'SSM_PRODUCTION_LIVE=false',
  ];

  it('reports the host still holding a signing secret the parameters say is gone', () => {
    const probe = writeProbeFile(STUCK);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/deactivation that did not finish/);
  });

  it('names finishing the deactivation as the next command, not arming', () => {
    const probe = writeProbeFile(STUCK);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/--deactivate/);
    expect(result.stdout).not.toMatch(/arm payments when ready/);
  });

  it('stays quiet on an ordinary dark host that holds no secret', () => {
    const probe = writeProbeFile(STUCK.map(l => l.replace('ENV_WEBHOOK_SECRET=set', 'ENV_WEBHOOK_SECRET=unset')));
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).not.toMatch(/deactivation that did not finish/);
    expect(result.stdout).toMatch(/arm payments when ready/);
  });
});

describe('bringup-status.sh — pending steps name their next command', () => {
  it('a bare staging host points at each bring-up script in order', () => {
    const probe = writeProbeFile([
      'ENV_FETCHED=yes',
      'ENV_TRUST_PROXY=loopback',
      'ENV_BACKUP_S3_BUCKET=unset',
      'ENV_PAYMENT_ADAPTER=stub',
      'TIMER_ACTIVE=inactive',
      'CONTAINERS=none running',
      'TF_PLAN=drift',
      'TF_BACKUP_ALARM=absent',
      'TF_SES_SUBSCRIPTION=absent',
    ]);
    const result = runScript(['--target', 'staging', '--probe-file', probe]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/1\. Host env file\s+PENDING/);
    // The host env row points at the deploy that writes those values, not at
    // the verifier that only reports on them: an operator following the next
    // command should end up with the row DONE rather than told again that it
    // is not.
    expect(result.stdout).toMatch(/\.\/deploy_to_aws\.sh --target staging \(every deploy writes/);
    expect(result.stdout).toMatch(/2\. Terraform\s+PENDING/);
    // The Terraform row points at the command that applies every tree the
    // environment stands on, and never at a hand-typed import: a resource made
    // outside Terraform is taken in by an import block through a reviewed plan.
    expect(result.stdout).toMatch(/scripts\/terraform-apply-all\.sh --target staging/);
    expect(result.stdout).not.toMatch(/terraform import/);
    expect(result.stdout).toMatch(/4\. Backup pipeline\s+PENDING/);
    expect(result.stdout).toMatch(/scripts\/install-backup-timer\.sh --target staging/);
    expect(result.stdout).toMatch(/5\. SES feedback\s+PENDING/);
    // The feeds are turned on by the script that also puts the queue addresses
    // on the host, never by a values-file edit and an apply.
    expect(result.stdout).toMatch(/activate-notification-feeds\.sh --target staging --state on/);
    expect(result.stdout).not.toMatch(/tfvars and apply/);
    expect(result.stdout).toMatch(/verify-prod-email\.sh/);
    expect(result.stdout).toMatch(/8\. Deployed runtime\s+PENDING/);
    expect(result.stdout).toMatch(/\.\/deploy_to_aws\.sh/);
  });

  it('staging on the stub adapter reads as N-A for payments, not pending', () => {
    const probe = writeProbeFile(['ENV_FETCHED=yes', 'ENV_PAYMENT_ADAPTER=stub']);
    const result = runScript(['--target', 'staging', '--probe-file', probe]);
    expect(result.stdout).toMatch(/3\. Payments\s+N-A\s+staging runs the stub adapter permanently/);
    expect(result.stdout).toMatch(/6\. First admin\s+N-A/);
    expect(result.stdout).toMatch(/7\. Cutover login alarm\s+N-A/);
  });

  it('dark production reads as N-A for payments with the arming step named', () => {
    const probe = writeProbeFile([
      'ENV_FETCHED=yes',
      'ENV_PAYMENT_ADAPTER=stub',
      'ENV_PAYMENTS_ARMED=dark',
      'SSM_PRODUCTION_LIVE=false',
    ]);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/3\. Payments\s+N-A\s+payments dark \(stub adapter/);
    // The next step must name the script that performs the arming, not the
    // values-file assignment it happens to write. Arming is three actions that
    // have to happen in order, and a status view that prints one of them invites
    // exactly the half-applied state the script exists to prevent.
    expect(result.stdout).toMatch(/arming\.sh --target production --switch payments --state armed/);
  });

  // Defect caught: a host one hop too generous, or one missing its backup
  // bucket, reads DONE; or the row sends the operator to the setter, which
  // writes neither and so cannot turn the row green.
  it.each([
    ['ENV_TRUST_PROXY=', 'ENV_TRUST_PROXY=3', 'TRUST_PROXY \\(integer hop count, production: 2 \\(CloudFront then nginx\\)\\)'],
    ['ENV_BACKUP_S3_BUCKET=', 'ENV_BACKUP_S3_BUCKET=unset', 'BACKUP_S3_BUCKET'],
  ])('a host whose %s is wrong is pending, and names the deploy that writes it', (prefix, wrong, reported) => {
    const probe = writeProbeFile(ALL_DONE_PRODUCTION.map((l) => (l.startsWith(prefix) ? wrong : l)));
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(new RegExp(`1\\. Host env file\\s+PENDING\\s+missing/invalid: ${reported}`));
    expect(result.stdout).toMatch(/\.\/deploy_to_aws\.sh --target production \(every deploy writes the committed host config and the Terraform-published values\)/);
    expect(result.stdout).not.toMatch(/set-host-env\.sh --target production/);
  });

  it('production missing payments pieces points at activate-payments.sh', () => {
    const probe = writeProbeFile([
      'ENV_FETCHED=yes',
      'ENV_TRUST_PROXY=2',
      'ENV_BACKUP_S3_BUCKET=set',
      'ENV_PAYMENT_ADAPTER=stub',
      'ENV_PAYMENTS_ARMED=armed',
      'SSM_STRIPE_KEY=placeholder',
    ]);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/3\. Payments\s+PENDING\s+PAYMENTS_ARMED: armed, SSM key: placeholder/);
    expect(result.stdout).toMatch(/scripts\/activate-payments\.sh --target production/);
  });

  // Defect caught: the operator reads a green bring-up while the origin hop is
  // still plaintext, and only learns of it when going live is refused.
  it('reports a plaintext origin hop on production as pending, naming what it blocks', () => {
    const plaintext = runScript(['--target', 'production', '--probe-file',
      writeProbeFile(['ORIGIN_HOP=plaintext (http-only)'])]);
    expect(plaintext.stdout).toMatch(/10\. Origin TLS\s+PENDING\s+plaintext \(http-only\); going live and a live Stripe key are refused/);
    expect(plaintext.stdout).toMatch(/next: put origin TLS in place after the zone move/);

    const encrypted = runScript(['--target', 'production', '--probe-file',
      writeProbeFile(['ORIGIN_HOP=encrypted'])]);
    expect(encrypted.stdout).toMatch(/10\. Origin TLS\s+DONE\s+the distribution reaches its origin https-only/);

    const unread = runScript(['--target', 'production', '--probe-file', writeProbeFile([])]);
    expect(unread.stdout).toMatch(/10\. Origin TLS\s+UNKNOWN/);

    const staging = runScript(['--target', 'staging', '--probe-file', writeProbeFile([])]);
    expect(staging.stdout).toMatch(/10\. Origin TLS\s+N-A/);
  });

  // Defect caught: the live probe misreads what CloudFront reports, so a
  // plaintext hop shows as unknown, or an unreadable one as plaintext.
  it('classifies the origin protocol the live probe reads from the distribution', () => {
    const probeWith = (policy: string | null) => {
      const caseDir = mkdtempSync(join(tmpDir, 'origin-probe-'));
      const bin = join(caseDir, 'bin');
      mkdirSync(bin, { recursive: true });
      const exe = (name: string, lines: string[]) => {
        writeFileSync(join(bin, name), ['#!/usr/bin/env bash', ...lines].join('\n') + '\n');
        chmodSync(join(bin, name), 0o755);
      };
      // Every other aws read in the probe answers nothing, so those rows stay unknown.
      exe('aws', ['exit 1']);
      exe('terraform', [
        'if [[ "$*" == *"output -raw cloudfront_distribution_id"* ]]; then echo E2TESTDIST; exit 0; fi',
        'exit 1',
      ]);
      exe('cloudfront', [policy === null ? 'exit 255' : `echo ${policy}`]);
      return runScript(['--target', 'production', '--skip-remote', '--skip-terraform', '--profile', 'footbag-operator'], {
        ...process.env,
        ...awsIdentityStubEnv(caseDir),
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        TF_OUTPUT_BIN: join(bin, 'terraform'),
        ORIGIN_TLS_AWS_BIN: join(bin, 'cloudfront'),
      });
    };
    expect(probeWith('http-only').stdout).toMatch(/10\. Origin TLS\s+PENDING\s+plaintext \(http-only\)/);
    expect(probeWith('https-only').stdout).toMatch(/10\. Origin TLS\s+DONE/);
    expect(probeWith(null).stdout).toMatch(/10\. Origin TLS\s+UNKNOWN/);
  });

  it('a backup timer active but metric missing advises waiting, not reinstalling', () => {
    const probe = writeProbeFile([
      'ENV_FETCHED=yes',
      'TIMER_ACTIVE=active',
      'CW_BACKUP_METRIC=missing',
      'TF_BACKUP_ALARM=absent',
    ]);
    const result = runScript(['--target', 'staging', '--probe-file', probe]);
    expect(result.stdout).toMatch(/4\. Backup pipeline\s+PENDING/);
    expect(result.stdout).toMatch(/wait for two timer runs/);
    expect(result.stdout).not.toMatch(/next: scripts\/install-backup-timer\.sh/);
  });

  it('a flowing metric with the alarm unarmed advises the terraform flag flip', () => {
    const probe = writeProbeFile([
      'ENV_FETCHED=yes',
      'TIMER_ACTIVE=active',
      'CW_BACKUP_METRIC=flowing',
      'TF_BACKUP_ALARM=absent',
    ]);
    const result = runScript(['--target', 'staging', '--probe-file', probe]);
    // The next step names the script that makes the change, never a hand edit
    // of the values file.
    expect(result.stdout).toMatch(/set-terraform-gate\.sh --target staging --gate enable_backup_alarm --state on/);
  });
});

describe('bringup-status.sh — the Terraform row covers every tree the environment stands on', () => {
  it('a change pending only in an account tree reads as pending, naming that tree', () => {
    // An operator told the infrastructure is done would never apply a change
    // committed to the shared or identity tree.
    const probe = writeProbeFile(ALL_DONE_PRODUCTION.map((l) => (l === 'TF_PLAN_SHARED=insync' ? 'TF_PLAN_SHARED=drift' : l)));
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/2\. Terraform\s+PENDING\s+pending changes in: shared\b/);
    expect(result.stdout).toMatch(/scripts\/terraform-apply-all\.sh --target production/);
  });

  it('an account tree it could not read is unknown, never done', () => {
    const probe = writeProbeFile(ALL_DONE_PRODUCTION.filter((l) => !l.startsWith('TF_PLAN_IDENTITY=')));
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/2\. Terraform\s+UNKNOWN\s+plan not run or failed for: identity\b/);
  });

  it('plans all three trees by their real paths when started outside the repository root', () => {
    // Run from elsewhere, a relative tree path finds nothing and every plan
    // reads as unknown, which an operator takes for a bring-up not yet done.
    const binDir = join(tmpDir, 'terraform-bin');
    const callLog = join(tmpDir, 'terraform-calls.log');
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, 'terraform'), [
      '#!/usr/bin/env bash',
      `echo "$*" >> "${callLog}"`,
      'exit 0',
    ].join('\n'));
    chmodSync(join(binDir, 'terraform'), 0o755);
    const elsewhere = join(tmpDir, 'elsewhere');
    mkdirSync(elsewhere, { recursive: true });
    const result = spawnSync(
      'bash',
      [SCRIPT, '--target', 'production', '--skip-remote', '--skip-aws'],
      {
        cwd: elsewhere,
        env: { ...process.env, ...awsIdentityStubEnv(tmpDir), PATH: `${binDir}:${process.env.PATH ?? ''}` },
        encoding: 'utf-8',
        ...SPAWN_GUARD,
      },
    );
    expect(result.stdout, result.stderr).toMatch(/2\. Terraform\s+DONE\s+plan reports no changes in shared, identity or production/);
    const planned = readFileSync(callLog, 'utf-8')
      .split('\n')
      .filter((l) => / plan /.test(l))
      .map((l) => l.match(/-chdir=(\S+)\/terraform\/(\w+)/)?.[2]);
    expect(planned.sort()).toEqual(['identity', 'production', 'shared']);
  });
});

describe('bringup-status.sh — the Stripe key mode read from the parameter', () => {
  // The probe file supplies the mode already classified, so these drive the
  // real aws probe through a stand-in aws ahead of PATH that answers the key
  // parameter and reports every other parameter absent.
  function runWithKey(key: string): RunResult {
    const binDir = join(tmpDir, `aws-bin-${key}`);
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, 'aws'), [
      '#!/usr/bin/env bash',
      'case "$*" in',
      `  *secrets/stripe_secret_key*--with-decryption*) printf '%s\\n' ${JSON.stringify(key)} ;;`,
      '  cloudwatch*) echo 0 ;;',
      '  *) echo "An error occurred (ParameterNotFound) when calling the GetParameter operation" >&2; exit 254 ;;',
      'esac',
    ].join('\n'));
    chmodSync(join(binDir, 'aws'), 0o755);
    return runScript(
      ['--target', 'production', '--profile', 'stand-in', '--skip-remote', '--skip-terraform'],
      { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}` },
    );
  }

  it.each([
    // An operator reading "live" for a test key believes payments take real
    // money while every checkout is a test-mode one.
    ['sk_test_abc123', 'test'],
    ['sk_live_abc123', 'live'],
  ])('reports %s as %s on the Payments row, never printing the key', (key, mode) => {
    const result = runWithKey(key);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/probes: aws\)/);
    expect(result.stdout).toMatch(new RegExp(`3\\. Payments\\s+PENDING\\s+.*SSM key: ${mode},`));
    expect(result.stdout + result.stderr).not.toContain(key);
  });
});

describe('bringup-status.sh — unprobed state degrades to UNKNOWN', () => {
  it('an empty probe file renders UNKNOWN rows and still exits 0', () => {
    const probe = writeProbeFile(['# nothing probed']);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/1\. Host env file\s+UNKNOWN/);
    expect(result.stdout).toMatch(/2\. Terraform\s+UNKNOWN/);
    expect(result.stdout).toMatch(/4\. Backup pipeline\s+UNKNOWN/);
    expect(result.stdout).toMatch(/5\. SES feedback\s+UNKNOWN/);
    expect(result.stdout).toMatch(/8\. Deployed runtime\s+UNKNOWN/);
  });
});

describe('bringup-status.sh — webhook-secret rotation window', () => {
  it('surfaces an open rotation window on the provisioned Payments row', () => {
    const probe = writeProbeFile([...ALL_DONE_PRODUCTION, 'ENV_WEBHOOK_SECRET_PREVIOUS=set']);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/3\. Payments\s+DONE/);
    expect(result.stdout).toMatch(/rotation window open/);
    expect(result.stdout).toMatch(/--complete-webhook-rotation/);
  });

  it('shows no rotation note when the previous secret is unset', () => {
    const probe = writeProbeFile(ALL_DONE_PRODUCTION);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/3\. Payments\s+DONE/);
    expect(result.stdout).not.toMatch(/rotation window open/);
  });
});

describe('bringup-status.sh — email wording row', () => {
  // The wording a running environment renders comes from rows the full-rebuild
  // deploy seeds, so a sidecar edit reaches nothing deployed until one runs.
  // This row is the only thing that says so; before it, production rendered
  // wording nobody knew was stale.
  const currentDigest = (): string => {
    const r = spawnSync(
      'bash',
      [
        '-c',
        `source "${join(process.cwd(), 'scripts/lib/email-template-digest.sh')}"; ` +
          `email_template_digest "${join(process.cwd(), 'curated/email_templates')}"`,
      ],
      { encoding: 'utf-8', ...SPAWN_GUARD },
    );
    return (r.stdout ?? '').trim();
  };

  it('reports agreement when the host was seeded from the sidecars as they read now', () => {
    const probe = writeProbeFile([
      ...ALL_DONE_PRODUCTION,
      `DEPLOYED_EMAIL_TEMPLATES=${currentDigest()}`,
    ]);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/9\. Email wording\s+DONE/);
  });

  it('reports a difference, and names a remedy that does not rebuild the database', () => {
    const probe = writeProbeFile([...ALL_DONE_PRODUCTION, 'DEPLOYED_EMAIL_TEMPLATES=0000badf00d']);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/9\. Email wording\s+PENDING/);
    expect(result.stdout, 'says why a code-only deploy will not fix it').toMatch(
      /code-only deploy will not change it/,
    );
    expect(result.stdout).toMatch(/admin email-template editor/);
  });

  it('is UNKNOWN rather than DONE when the host records nothing', () => {
    const probe = writeProbeFile(ALL_DONE_PRODUCTION);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.exitCode).toBe(0);
    // Silence is what this row exists to remove, so an absent record must not
    // read as agreement.
    expect(result.stdout).toMatch(/9\. Email wording\s+UNKNOWN/);
  });

  it('the digest ignores the directory it is reached by, so both sides agree', () => {
    const viaRelative = spawnSync(
      'bash',
      [
        '-c',
        `source "${join(process.cwd(), 'scripts/lib/email-template-digest.sh')}"; ` +
          `email_template_digest "${join(process.cwd(), 'scripts/../curated/email_templates')}"`,
      ],
      { encoding: 'utf-8', ...SPAWN_GUARD },
    );
    expect((viaRelative.stdout ?? '').trim()).toBe(currentDigest());
  });
});

describe('bringup-status.sh — the deployed runtime is all four containers healthy', () => {
  const HEALTHY = ALL_DONE_PRODUCTION.find((l) => l.startsWith('CONTAINERS='))!.slice('CONTAINERS='.length);

  it('reads pending when any one container is missing, unhealthy or still starting', () => {
    // Defect caught: a host with no worker (no mail, no scheduled jobs) or no
    // image service (no media) reads as deployed because web and nginx are up.
    for (const svc of ['web', 'worker', 'image', 'nginx']) {
      for (const variant of ['missing', 'unhealthy', 'starting']) {
        const containers = variant === 'missing'
          ? HEALTHY.split(', ').filter((c) => !c.startsWith(`footbag-${svc}-1 `)).join(', ')
          : HEALTHY.replace(`footbag-${svc}-1 Up 2 hours (healthy)`, `footbag-${svc}-1 Up 5 seconds (health: ${variant})`);
        const probe = writeProbeFile([...ALL_DONE_PRODUCTION.filter((l) => !l.startsWith('CONTAINERS=')), `CONTAINERS=${containers}`]);
        const result = runScript(['--target', 'production', '--probe-file', probe]);
        expect(result.stdout, `${svc} ${variant}`).toMatch(new RegExp(`8\\. Deployed runtime\\s+PENDING\\s+not healthy: ${svc} `));
      }
    }
  });
});

describe('bringup-status.sh — one row per host bootstrap step', () => {
  // The facts a finished host reports through the bootstrap status body, plus
  // the workstation-side reads. A stand-in tool-version list pins the versions.
  const FINISHED_HOST = [
    'HOST_REACHED=yes', 'ACCOUNT_USER=footbag', 'ACCOUNT_WHEEL=yes', 'ACCOUNT_KEYS=1', 'SSHD_PORTS=22 2222',
    'SSHD_ROOT=no', 'SSHD_PASSWORD=no', 'SSHD_KBD=no', 'SSHD_REVERT_PENDING=no', 'ARCH=x86_64',
    'DOCKER_ACTIVE=active', 'DOCKER_ENABLED=enabled', 'COMPOSE_VERSION=2.29.7', 'SQLITE_VERSION=3.51.2',
    'DOCKER_RPM=25.0.16-1.amzn2023.0.5', 'AL_RELEASE=2023.12.20261021', 'RSYNC=yes',
    'AWSCLI=yes', 'SRV_DIR=root:root 755', 'ENV_FILE=root:root 600', 'DB_DIR=1000:1000', 'FOOTBAG_ENV=production',
    'CRED_CHAIN=ok', 'CRED_KEY_ID=AKIAEXAMPLEEXAMPLE01', 'CWAGENT_ACTIVE=active', 'CWAGENT_ENABLED=enabled',
    'CWAGENT_SUBSTATE=running', 'CWAGENT_NRESTARTS=0', 'CWAGENT_LAST_ERROR=',
    'CWAGENT_VERSION=1.300050.0b1', 'CWAGENT_KEY_ID=AKIAEXAMPLEEXAMPLE01',
    'LOG_DRIVERS=footbag-web-1:awslogs footbag-worker-1:awslogs footbag-nginx-1:awslogs', 'SERVICE_ENABLED=enabled',
    'TIMER_ENABLED=enabled', 'ZRAM_ACTIVE=yes', 'ZRAM_SUPPRESSED=no', 'SWAPFILE=yes',
    'REBOOT_NEEDED=no', 'REBOOT_NEEDED_SAID=',
    'SSHD_LISTEN=22 2222', 'DB_FILE=present', 'REPLAY_PENDING=no', 'FEED_SES_QUEUE=set', 'FEED_ALARM_QUEUE=set',
    `DB_SCHEMA_BASELINE=${SCHEMA_SHA}`, 'DB_ADMINS=1',
    'HOST_ENV_VERIFY=ok',
    'PIN=current', 'IAM_SRC_KEYS=AKIAEXAMPLEEXAMPLE01', 'IAM_CW_KEYS=AKIAEXAMPLEEXAMPLE01', 'CW_METRICS=ok',
    'SNAPSHOT=ok', 'FEEDS_FLAG=false', 'MARKER=false',
  ];

  function manifestEnv(): NodeJS.ProcessEnv {
    const p = join(tmpDir, 'tool-versions.env');
    writeFileSync(p, [
      'COMPOSE_VERSION=v2.29.7', 'CWAGENT_VERSION=1.300050.0b1', 'SQLITE_VERSION=3.51.2',
      'DOCKER_ENGINE_HOST=25.0.16-1.amzn2023.0.5', 'AMAZON_LINUX_RELEASE=2023.12.20261021',
    ].join('\n') + '\n');
    return { ...process.env, FOOTBAG_TOOL_VERSIONS: p };
  }
  function render(lines: string[]): string {
    return runScript(['--target', 'production', '--probe-file', writeProbeFile([...ALL_DONE_PRODUCTION, ...lines])], manifestEnv()).stdout;
  }
  function override(key: string, value: string): string[] {
    return [...FINISHED_HOST.filter((l) => !l.startsWith(`${key}=`)), `${key}=${value}`];
  }

  it('covers every fact the bootstrap status body emits', () => {
    // Defect caught: a fact the body reports has no counterpart here, so the
    // rows below pass on a host the real probe would describe differently.
    const body = readFileSync(join(process.cwd(), 'scripts/internal/bootstrap-host-status-remote.sh'), 'utf-8');
    const emitted = [...body.matchAll(/^emit ([A-Z_]+) /gm)].map((m) => m[1]);
    const supplied = new Set([...FINISHED_HOST, ...ALL_DONE_PRODUCTION].map((l) => l.split('=')[0]));
    expect(emitted.filter((k) => !supplied.has(k))).toEqual([]);
  });

  it('reads every bootstrap row done or informational on a finished host', () => {
    const out = render(FINISHED_HOST);
    const rows = out.split('-- host bootstrap')[1].split('\n').filter((l) => /^\s*\d+\.\s/.test(l));
    expect(rows.length).toBe(13);
    for (const r of rows) expect(r, r).toMatch(/\s(DONE|INFO)\s/);
  });

  const removals: Array<[string, string[], RegExp, RegExp]> = [
    ['the pin', override('PIN', 'stale'), /Pinned host key\s+PENDING/, /install-known-hosts\.sh --target production/],
    ['the shared account', override('HOST_REACHED', 'no'), /Shared account, sshd ports\s+PENDING/, /bootstrap-host\.sh --target production/],
    ['the host tools', override('SQLITE_VERSION', '3.40.0'), /Host tools\s+PENDING/, /bootstrap-host\.sh --target production/],
    ['the env file', override('ENV_FILE', 'absent'), /\/srv\/footbag and env file\s+PENDING/, /bootstrap-host\.sh/],
    ['the environment record', override('FOOTBAG_ENV', ''), /Host environment record\s+PENDING/, /set-host-env\.sh --target production/],
    ['the env file the verifier passes', override('HOST_ENV_VERIFY', 'fail'), /Host environment record\s+PENDING/, /verify-host-env\.sh --target production/],
    ['sshd listening on its second port', override('SSHD_LISTEN', '22'), /Shared account, sshd ports\s+PENDING/, /bootstrap-host\.sh --target production/],
    ['the database directory', override('DB_DIR', '0:0'), /Database directory\s+PENDING/, /bootstrap-host\.sh/],
    ['the credential chain', override('CRED_CHAIN', 'fail'), /Host credential chain\s+PENDING/, /install-host-credentials\.sh --target production --rotate/],
    // A stopped agent on a host holding the publisher's key is diagnosed and
    // re-installed in place, never given a new key for a fault a key cannot fix.
    ['the agent', override('CWAGENT_ENABLED', 'disabled'), /CloudWatch agent\s+FAILED/, /diagnose-cwagent\.sh --target production, then .*install-cwagent-production\.sh --upgrade/],
    ['log shipping', override('LOG_DRIVERS', 'footbag-web-1:awslogs'), /Deployed runtime\s+PENDING\s+not yet: worker shipping/, /deploy_to_aws\.sh/],
    ['the sshd posture', override('SSHD_ROOT', 'prohibit-password'), /sshd posture\s+PENDING/, /harden-sshd\.sh --target production --apply/],
    ['the swap file', override('SWAPFILE', 'no'), /Swap\s+PENDING/, /bootstrap-host\.sh/],
    ['a recent snapshot', override('SNAPSHOT', 'fail'), /Recent host snapshot\s+PENDING/, /verify-host-snapshots\.sh --target production/],
  ];
  it.each(removals)('reports %s pending with its command', (_name, lines, row, next) => {
    // Defect caught: a host missing this bootstrap step reads done on the
    // dashboard the go-live sitting reads first.
    const out = render(lines).split('-- host bootstrap')[1];
    expect(out).toMatch(row);
    const i = out.split('\n').findIndex((l) => row.test(l));
    expect(out.split('\n')[i + 1]).toMatch(next);
  });
});

describe('bringup-status.sh — a host probe that does not finish', () => {
  // Defect caught: the probe's refusal shown mid-stream and then a clean
  // "DONE", so an operator reads a dashboard whose host rows were never read
  // as a healthy one.
  it('lists a failed host probe as a warning rather than closing clean', () => {
    const binDir = join(tmpDir, 'probe-fail-bin');
    mkdirSync(binDir, { recursive: true });
    // The alias names the account the password is for; nothing connects.
    writeFileSync(join(binDir, 'ssh'), '#!/usr/bin/env bash\nprintf "hostname 192.0.2.10\\nuser footbag\\n"\n');
    chmodSync(join(binDir, 'ssh'), 0o755);
    const run = (args: string[]) => spawnSync('bash', [SCRIPT, '--target', 'production', '--skip-terraform', '--skip-aws', ...args], {
      env: { ...process.env, ...awsIdentityStubEnv(tmpDir), PATH: `${binDir}:${process.env.PATH ?? ''}`, HOME: tmpDir },
      encoding: 'utf-8', input: '', ...SPAWN_GUARD,
    });

    // An empty first line on stdin: the probe refuses, and the report says so.
    const failed = run([]);
    expect(failed.stderr).toMatch(/Warnings \(1\):\n {2}- the remote probe of footbag-production did not finish/);
    expect(failed.stderr).toMatch(/VERDICT: DONE WITH WARNINGS/);

    // Beside it, the same run told to skip the probe closes clean.
    const skipped = run(['--skip-remote']);
    expect(skipped.stderr).not.toMatch(/the remote probe of footbag-production did not finish/);
  });
});

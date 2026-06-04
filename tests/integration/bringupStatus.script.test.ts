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
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts/bringup-status.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runScript(args: string[]): RunResult {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

let tmpDir: string;
beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'bringup-status-'));
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
  'ENV_TRUST_PROXY=3',
  'ENV_BACKUP_S3_BUCKET=set',
  'ENV_PAYMENT_ADAPTER=live',
  'ENV_WEBHOOK_SECRET=set',
  'TIMER_ACTIVE=active',
  'CONTAINERS=footbag-web Up, footbag-nginx Up, footbag-worker Up',
  'TF_PLAN=insync',
  'TF_BACKUP_ALARM=present',
  'TF_CUTOVER_ALARM=absent',
  'TF_SES_SUBSCRIPTION=present',
  'SSM_STRIPE_KEY=live',
  'SSM_BOOTSTRAP_TOKEN=absent',
  'CW_BACKUP_METRIC=flowing',
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
    expect(result.stdout).toMatch(/1\. Host env file\s+DONE\s+TRUST_PROXY=3, BACKUP_S3_BUCKET set/);
    expect(result.stdout).toMatch(/2\. Terraform\s+DONE/);
    expect(result.stdout).toMatch(/3\. Payments\s+DONE/);
    expect(result.stdout).toMatch(/4\. Backup pipeline\s+DONE/);
    expect(result.stdout).toMatch(/5\. SES feedback\s+DONE/);
    expect(result.stdout).toMatch(/8\. Deployed runtime\s+DONE/);
  });

  it('an absent bootstrap token reads as claimed-or-unprovisioned, never DONE', () => {
    const probe = writeProbeFile(ALL_DONE_PRODUCTION);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/6\. First admin\s+UNKNOWN\s+no bootstrap token parameter/);
    expect(result.stdout).toMatch(/aws ssm put-parameter --name \/footbag\/production\/app\/bootstrap\/admin_token/);
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
    expect(result.stdout).toMatch(/scripts\/verify-staging-env\.sh --target staging/);
    expect(result.stdout).toMatch(/2\. Terraform\s+PENDING/);
    expect(result.stdout).toMatch(/terraform -chdir=terraform\/staging plan/);
    expect(result.stdout).toMatch(/terraform import/);
    expect(result.stdout).toMatch(/4\. Backup pipeline\s+PENDING/);
    expect(result.stdout).toMatch(/scripts\/install-backup-timer\.sh --target staging/);
    expect(result.stdout).toMatch(/5\. SES feedback\s+PENDING/);
    expect(result.stdout).toMatch(/ses_feedback_webhook_url/);
    expect(result.stdout).toMatch(/verify-prod-email\.sh/);
    expect(result.stdout).toMatch(/8\. Deployed runtime\s+PENDING/);
    expect(result.stdout).toMatch(/\.\/deploy_to_aws\.sh/);
  });

  it('staging on the stub adapter reads as N-A for payments, not pending', () => {
    const probe = writeProbeFile(['ENV_FETCHED=yes', 'ENV_PAYMENT_ADAPTER=stub']);
    const result = runScript(['--target', 'staging', '--probe-file', probe]);
    expect(result.stdout).toMatch(/3\. Payments\s+N-A\s+staging runs the stub adapter by default/);
    expect(result.stdout).toMatch(/6\. First admin\s+N-A/);
    expect(result.stdout).toMatch(/7\. Cutover login alarm\s+N-A/);
  });

  it('production missing payments pieces points at activate-payments.sh', () => {
    const probe = writeProbeFile([
      'ENV_FETCHED=yes',
      'ENV_TRUST_PROXY=3',
      'ENV_BACKUP_S3_BUCKET=set',
      'ENV_PAYMENT_ADAPTER=stub',
      'SSM_STRIPE_KEY=placeholder',
    ]);
    const result = runScript(['--target', 'production', '--probe-file', probe]);
    expect(result.stdout).toMatch(/3\. Payments\s+PENDING\s+SSM key: placeholder/);
    expect(result.stdout).toMatch(/scripts\/activate-payments\.sh --target production/);
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
    expect(result.stdout).toMatch(/enable_backup_alarm = true in terraform\/staging\/terraform\.tfvars/);
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

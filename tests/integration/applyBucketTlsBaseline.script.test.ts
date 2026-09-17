/**
 * scripts/apply-bucket-tls-baseline.sh — the refusal that protects a live secret.
 *
 * This script applies the bucket TLS-deny baseline across three trees. The part
 * worth covering is not the apply, it is the gate in front of it: the session
 * secret's value is deliberately outside Terraform's ownership, so the only
 * correct diff on that parameter is no diff at all. A value diff means
 * ignore_changes is not taking, and confirming would write the literal
 * placeholder over a live secret and sign every member out on the next deploy.
 *
 * The gate reads the plan as JSON rather than grepping the human rendering,
 * because the human rendering elides a SecureString as (sensitive value), which
 * looks identical whether it is changing or not. That is exactly the property a
 * test can pin and an operator cannot.
 *
 * Terraform is stubbed through the script's own TERRAFORM_APPLY_BIN seam, so
 * these cases need no AWS and no state.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/apply-bucket-tls-baseline.sh');

let stubDir: string;

beforeEach(() => {
  stubDir = mkdtempSync(join(tmpdir(), 'footbag-test-tlsbaseline-'));
});

afterEach(() => {
  rmSync(stubDir, { recursive: true, force: true });
});

/** A terraform stub: `plan` writes an empty plan file, `show -json` emits the
 *  supplied document, anything else succeeds silently. */
function terraformStub(planJson: string): string {
  const path = join(stubDir, 'terraform-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'for arg in "$@"; do',
      '  if [ "$arg" = "plan" ]; then',
      '    for a in "$@"; do case "$a" in -out=*) : > "${a#-out=}";; esac; done',
      '    echo "stub plan"; exit 0',
      '  fi',
      '  if [ "$arg" = "show" ]; then',
      `    cat <<'PLANJSON'`,
      planJson,
      'PLANJSON',
      '    exit 0',
      '  fi',
      'done',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

/**
 * A stand-in AWS CLI on PATH, for the access-log delivery check.
 *
 * The deny and plaintext probes are answered healthily so the only thing a case
 * can put wrong is the listing. `logs` decides what the listing does: a key is a
 * live delivery, `none` is the literal string the CLI prints when the call
 * succeeded and matched nothing, and `unreadable` is the call failing — which is
 * a different answer and must stay one.
 */
function awsStubOnPath(logs: 'key' | 'none' | 'unreadable'): string {
  const listing =
    logs === 'unreadable'
      ? ['    echo "An error occurred (AccessDenied)" >&2; exit 254 ;;']
      : logs === 'none'
        ? ['    echo "None" ;;']
        : ['    echo "AWSLogs/123456789012/CloudFront/E1EXAMPLE.2026-09-17.gz" ;;'];
  const path = join(stubDir, 'aws');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'case "$*" in',
      '  *list-objects-v2*)',
      ...listing,
      '  *get-bucket-policy*)',
      '    echo \'{"Statement":[{"Sid":"DenyPlaintextAccess"}]}\' ;;',
      '  *head-bucket*)',
      // The deny doing its job: the script requires the refusal to name itself
      // rather than accepting any failure at all.
      '    echo "An error occurred (AccessDenied) when calling HeadBucket" >&2; exit 254 ;;',
      '  *) echo "" ;;',
      'esac',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

function run(args: string[], planJson?: string, logs?: 'key' | 'none' | 'unreadable') {
  // The run settles and proves its identity before it plans or applies.
  const env: NodeJS.ProcessEnv = { ...process.env, ...awsIdentityStubEnv(stubDir) };
  if (planJson !== undefined) env.TERRAFORM_APPLY_BIN = terraformStub(planJson);
  if (logs !== undefined) {
    awsStubOnPath(logs);
    env.PATH = `${stubDir}:${process.env.PATH ?? ''}`;
  }
  const r = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env,
    ...SPAWN_GUARD,
  });
  return { exitCode: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const NO_SECRET_CHANGE = JSON.stringify({
  resource_changes: [
    {
      address: 'aws_ssm_parameter.app_session_secret',
      type: 'aws_ssm_parameter',
      name: 'app_session_secret',
      change: { actions: ['no-op'], before: { value: 'live' }, after: { value: 'live' } },
    },
  ],
});

const SECRET_CHANGING = JSON.stringify({
  resource_changes: [
    {
      address: 'aws_ssm_parameter.app_session_secret',
      type: 'aws_ssm_parameter',
      name: 'app_session_secret',
      change: {
        actions: ['update'],
        before: { value: 'the-live-secret' },
        after: { value: 'TODO-set-via-cli-after-apply' },
      },
    },
  ],
});

describe('apply-bucket-tls-baseline.sh — argument handling', () => {
  it('dry run states the sequence and touches nothing', () => {
    const r = run(['--dry-run']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Nothing was planned, applied or read/);
    expect(r.stdout).toMatch(/terraform\/shared/);
  });

  it('refuses a step number outside the sequence', () => {
    const r = run(['--from-step', '9']);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/--from-step takes a step number from 1 to 4/);
  });

  it('rejects an unknown flag rather than ignoring it', () => {
    const r = run(['--force']);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/unknown argument/);
  });
});

describe('apply-bucket-tls-baseline.sh — the session-secret gate', () => {
  // The case the gate exists for. A plan that would rewrite the value must stop
  // the run before the confirmation, not rely on an operator noticing it.
  it('refuses to apply when the plan would change the session secret value', () => {
    const r = run(['--yes'], SECRET_CHANGING);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/REFUSING: the plan would change the value of/);
    expect(r.stderr).toMatch(/aws_ssm_parameter\.app_session_secret/);
    expect(r.stderr).toMatch(/Nothing was applied/);
  });

  // And the case that must not be blocked: the parameter present and unchanged,
  // which is what a correct apply looks like once Terraform stops owning it.
  it('does not refuse when the parameter is present and unchanged', () => {
    const r = run(['--yes'], NO_SECRET_CHANGE);
    expect(r.stderr).not.toMatch(/REFUSING: the plan would change the value of/);
  });

  it('refuses when the plan cannot be parsed, rather than reading it as clean', () => {
    // The third outcome, and the one with no operator-visible symptom. A truncated
    // or unparseable plan once exited zero from the check, which made it
    // indistinguishable from a plan carrying no secret change: the gate reported
    // nothing to worry about because it had failed to look. The check now exits
    // non-zero and the caller refuses rather than assuming the answer it could not
    // compute. Driving it needs only a stub that emits something that is not JSON.
    const r = run(['--yes'], 'this is not JSON, it is a truncated plan');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/REFUSING: the session-secret check did not complete/);
    expect(r.stderr).toMatch(/Refusing rather than|assuming it would not/);
    // It must not claim to know which way the plan would have gone.
    expect(r.stderr).not.toMatch(/REFUSING: the plan would change the value of/);
  });
});

describe('apply-bucket-tls-baseline.sh — the access-log delivery precondition', () => {
  // The second reason this script exists. It replaces a bucket policy the AWS
  // log-delivery service wrote for itself, and a wrong delivery statement errors
  // nothing: the logs simply stop arriving and nobody notices until they are
  // wanted. So the run records the newest delivered key before the apply and
  // re-reads it after.
  //
  // The failure that check cannot survive is its own reads failing. Both calls
  // answering "could not read" once compared equal, and equal is the value that
  // means "unchanged, delivery is merely batched" — so the one condition under
  // which the check can see nothing was the one it reported as fine.
  it('refuses when neither side of the comparison could be read', () => {
    const r = run(['--from-step', '1', '--yes'], NO_SECRET_CHANGE, 'unreadable');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/could not list the staging access-log bucket/);
    expect(r.stderr).toMatch(/a live delivery from one the new policy stopped/);
    // The sentence that must never be reached on an unreadable pair.
    expect(r.stdout).not.toMatch(/Delivery is batched/);
  });

  it('accepts a listing that succeeded and matched nothing, which is not the same answer', () => {
    // "None" is what the CLI prints for an empty match. A bucket with no logs
    // delivered yet is an ordinary state and must not be refused, or the
    // distinction the fix rests on would just be a stricter check.
    const r = run(['--from-step', '1', '--yes'], NO_SECRET_CHANGE, 'none');
    expect(r.stderr).not.toMatch(/could not list the staging access-log bucket/);
    expect(r.stdout).toMatch(/newest staging access-log key is now None/);
  });

  it('reports the delivered key when the listing is readable', () => {
    const r = run(['--from-step', '1', '--yes'], NO_SECRET_CHANGE, 'key');
    expect(r.stderr).not.toMatch(/could not list the staging access-log bucket/);
    expect(r.stdout).toMatch(/newest staging access-log key is now AWSLogs\//);
  });
});

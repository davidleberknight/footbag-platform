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

function run(args: string[], planJson?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (planJson !== undefined) env.TERRAFORM_APPLY_BIN = terraformStub(planJson);
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

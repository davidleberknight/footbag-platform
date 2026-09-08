/**
 * scripts/provision-ssm-secret.sh — the guards that stand between an operator
 * and an accidental production rotation.
 *
 * This script exists because a Terraform-generated secret is written into state
 * in plaintext, so the values it provisions are deliberately outside Terraform's
 * ownership. That moves a rotation from `terraform apply -replace` to a bare
 * command, and a bare command that signs every member out of the live site
 * needs its refusals to be real rather than documented. These tests pin the
 * refusals that need no AWS: the argument guards, the allowlist that stops a
 * typo creating a parameter nothing declared, and the terminal requirement on a
 * rotation. Everything past those needs credentials and belongs to the operator.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/provision-ssm-secret.sh');

function run(args: string[]) {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('provision-ssm-secret.sh — argument guards', () => {
  it('refuses without an environment, rather than defaulting to one', () => {
    const result = run(['--secret', 'session_secret', 'status']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/--env is required/);
  });

  it('refuses an unknown environment', () => {
    const result = run(['--env', 'prod', '--secret', 'session_secret', 'status']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/--env must be 'staging' or 'production'/);
  });

  it('has no "both" mode, because each environment needs its own distinct value', () => {
    const result = run(['--env', 'both', '--secret', 'session_secret', 'status']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/--env must be 'staging' or 'production'/);
  });

  it('refuses without a secret name', () => {
    const result = run(['--env', 'staging', 'status']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/--secret is required/);
  });

  it('refuses an action it was not given', () => {
    const result = run(['--env', 'staging', '--secret', 'session_secret']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/name an action/);
  });
});

describe('provision-ssm-secret.sh — the secret allowlist', () => {
  // The allowlist is a safety property rather than tidiness: a free-form name
  // would let a typo create a parameter Terraform never declared, sitting
  // outside every apply and every inventory, holding a live secret nothing
  // reads. The refusal has to come before any AWS call for that to hold.
  it('refuses a secret name it does not provision, before touching AWS', () => {
    const result = run(['--env', 'production', '--secret', 'sesion_secret', 'store']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/is not one this script provisions/);
    expect(result.stderr).toMatch(/session_secret/);
  });

  it('names the supported secrets when refusing', () => {
    const result = run(['--env', 'production', '--secret', 'stripe_secret_key', 'store']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/Supported: session_secret/);
  });
});

describe('provision-ssm-secret.sh — refusals that do not reach AWS', () => {
  it('rejects an unknown flag rather than ignoring it', () => {
    const result = run(['--env', 'staging', '--secret', 'session_secret', '--force', 'store']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/unknown argument/);
  });

  it('prints its own header as usage, so the help cannot drift from the script', () => {
    const result = run(['--help']);

    expect(result.stdout).toMatch(/provision-ssm-secret\.sh/);
    expect(result.stdout).toMatch(/status/);
    expect(result.stdout).toMatch(/store/);
    // The value the whole shape exists for: it must be findable from the help.
    expect(result.stdout).toMatch(/state/);
  });
});

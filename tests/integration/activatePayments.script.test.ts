/**
 * scripts/activate-payments.sh — env-file rewrite logic and refusal paths.
 *
 * Real runs prompt for live Stripe credentials and touch SSM and a remote
 * host, which CI cannot exercise. The synthetic --env-file mode operates on
 * a local file with the secrets supplied via STRIPE_SECRET_KEY_VALUE /
 * STRIPE_WEBHOOK_SECRET_VALUE, skipping ssh and aws entirely. These tests
 * pin the rewrite contract (replace-or-append with duplicates collapsed),
 * the credential-shape refusals, and the SECRETS_ADAPTER=live precondition.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts/activate-payments.sh');

const SECRETS = {
  STRIPE_SECRET_KEY_VALUE: 'sk_test_synthetic123',
  STRIPE_WEBHOOK_SECRET_VALUE: 'whsec_synthetic456',
} as const;

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runScript(args: string[], extraEnv: Record<string, string> = {}): RunResult {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
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
  tmpDir = mkdtempSync(join(tmpdir(), 'activate-payments-'));
});
afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

let fileCounter = 0;
function writeEnvFile(lines: string[]): string {
  fileCounter += 1;
  const p = join(tmpDir, `case-${fileCounter}.env`);
  writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

describe('activate-payments.sh — argument validation', () => {
  it('rejects an unknown argument', () => {
    const result = runScript(['--bogus']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/unknown argument/);
  });

  it('rejects an invalid target', () => {
    const result = runScript(['--target', 'dev', '--dry-run']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--target must be 'staging' or 'production'/);
  });

  it('rejects a nonexistent --env-file path', () => {
    const result = runScript(['--target', 'staging', '--env-file', join(tmpDir, 'nope.env')], SECRETS);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/does not exist/);
  });

  it('--env-file mode requires both secret env vars', () => {
    const envFile = writeEnvFile(['SECRETS_ADAPTER=live']);
    const result = runScript(['--target', 'staging', '--env-file', envFile]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/STRIPE_SECRET_KEY_VALUE and STRIPE_WEBHOOK_SECRET_VALUE/);
  });

  it('--dry-run prints the activation plan without needing secrets', () => {
    const result = runScript(['--target', 'production', '--dry-run']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/aws ssm put-parameter --name \/footbag\/production\/secrets\/stripe_secret_key/);
    expect(result.stdout).toMatch(/alias\/footbag-production/);
    expect(result.stdout).toMatch(/PAYMENT_ADAPTER=live/);
    expect(result.stdout).toMatch(/PAYMENTS-BOOT gate/);
  });
});

describe('activate-payments.sh — credential shape refusals', () => {
  it('refuses a test-mode key on production', () => {
    const envFile = writeEnvFile(['SECRETS_ADAPTER=live', 'PAYMENT_ADAPTER=stub']);
    const result = runScript(['--target', 'production', '--env-file', envFile], SECRETS);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/production requires a live-mode key/);
  });

  it('refuses a key that is neither sk_live_ nor sk_test_', () => {
    const envFile = writeEnvFile(['SECRETS_ADAPTER=live']);
    const result = runScript(['--target', 'staging', '--env-file', envFile], {
      ...SECRETS,
      STRIPE_SECRET_KEY_VALUE: 'pk_test_wrong_kind',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/start with sk_live_ or sk_test_/);
  });

  it('refuses a webhook secret without the whsec_ prefix', () => {
    const envFile = writeEnvFile(['SECRETS_ADAPTER=live']);
    const result = runScript(['--target', 'staging', '--env-file', envFile], {
      ...SECRETS,
      STRIPE_WEBHOOK_SECRET_VALUE: 'not-a-webhook-secret',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/start with whsec_/);
  });

  it('refuses the stub adapter placeholder webhook secret', () => {
    const envFile = writeEnvFile(['SECRETS_ADAPTER=live']);
    const result = runScript(['--target', 'staging', '--env-file', envFile], {
      ...SECRETS,
      STRIPE_WEBHOOK_SECRET_VALUE: 'whsec_stub_value',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/whsec_stub is the stub adapter's placeholder/);
  });
});

describe('activate-payments.sh — env-file rewrite contract', () => {
  it('fails when SECRETS_ADAPTER=live is absent (the live adapter cannot resolve the key)', () => {
    const envFile = writeEnvFile(['SECRETS_ADAPTER=local', 'PAYMENT_ADAPTER=stub']);
    const result = runScript(['--target', 'staging', '--env-file', envFile], SECRETS);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/SECRETS_ADAPTER=live is not set/);
    expect(readFileSync(envFile, 'utf-8')).toContain('PAYMENT_ADAPTER=stub');
  });

  it('flips PAYMENT_ADAPTER to live and appends the webhook secret', () => {
    const envFile = writeEnvFile(['SECRETS_ADAPTER=live', 'PAYMENT_ADAPTER=stub', 'OTHER=untouched']);
    const result = runScript(['--target', 'staging', '--env-file', envFile], SECRETS);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/GATE: PAYMENTS-BOOT PASS/);
    const rewritten = readFileSync(envFile, 'utf-8');
    expect(rewritten).toContain('PAYMENT_ADAPTER=live');
    expect(rewritten).not.toContain('PAYMENT_ADAPTER=stub');
    expect(rewritten).toContain(`STRIPE_WEBHOOK_SECRET=${SECRETS.STRIPE_WEBHOOK_SECRET_VALUE}`);
    expect(rewritten).toContain('OTHER=untouched');
  });

  it('collapses duplicate assignments instead of stacking new ones', () => {
    const envFile = writeEnvFile([
      'SECRETS_ADAPTER=live',
      'PAYMENT_ADAPTER=stub',
      'PAYMENT_ADAPTER=stub',
      'STRIPE_WEBHOOK_SECRET=whsec_old',
    ]);
    const result = runScript(['--target', 'staging', '--env-file', envFile], SECRETS);
    expect(result.exitCode).toBe(0);
    const rewritten = readFileSync(envFile, 'utf-8');
    expect(rewritten.match(/^PAYMENT_ADAPTER=/gm)).toHaveLength(1);
    expect(rewritten.match(/^STRIPE_WEBHOOK_SECRET=/gm)).toHaveLength(1);
    expect(rewritten).not.toContain('whsec_old');
  });

  it('masks the webhook secret in the displayed diff', () => {
    const envFile = writeEnvFile(['SECRETS_ADAPTER=live', 'PAYMENT_ADAPTER=stub']);
    const result = runScript(['--target', 'staging', '--env-file', envFile], SECRETS);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('STRIPE_WEBHOOK_SECRET=********');
    expect(result.stdout).not.toContain(SECRETS.STRIPE_WEBHOOK_SECRET_VALUE);
  });
});

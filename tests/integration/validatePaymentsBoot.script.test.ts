/**
 * scripts/validate-payments-boot.sh — the live-payments boot readiness gate.
 *
 * The gate reads a deploy env file and reports whether the live payment adapter
 * is configured with a webhook secret. It runs against a supplied FOOTBAG_ENV_FILE
 * so CI can exercise it against synthetic files. These tests pin the pass and
 * fail conditions and the rotation-window notice: when a webhook-secret roll is
 * mid-flight (STRIPE_WEBHOOK_SECRET_PREVIOUS present) the gate still passes but
 * flags the open window so it is not left open indefinitely.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts/validate-payments-boot.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runGate(envFile: string): RunResult {
  const result = spawnSync('bash', [SCRIPT], {
    cwd: process.cwd(),
    env: { ...process.env, FOOTBAG_ENV_FILE: envFile },
    encoding: 'utf-8',
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

let tmpDir: string;
let fileCounter = 0;
beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'validate-payments-boot-'));
});
afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeEnvFile(lines: string[]): string {
  fileCounter += 1;
  const p = join(tmpDir, `case-${fileCounter}.env`);
  writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

describe('validate-payments-boot.sh', () => {
  it('passes when the live adapter has a webhook secret', () => {
    const envFile = writeEnvFile(['PAYMENT_ADAPTER=live', 'STRIPE_WEBHOOK_SECRET=whsec_live']);
    const result = runGate(envFile);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/GATE: PAYMENTS-BOOT PASS/);
  });

  it('fails when the adapter is not live', () => {
    const envFile = writeEnvFile(['PAYMENT_ADAPTER=stub']);
    const result = runGate(envFile);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/live adapter not configured/);
  });

  it('fails when the webhook secret is missing', () => {
    const envFile = writeEnvFile(['PAYMENT_ADAPTER=live']);
    const result = runGate(envFile);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/STRIPE_WEBHOOK_SECRET is unset/);
  });

  it('passes with a notice while a rotation window is open', () => {
    const envFile = writeEnvFile([
      'PAYMENT_ADAPTER=live',
      'STRIPE_WEBHOOK_SECRET=whsec_new',
      'STRIPE_WEBHOOK_SECRET_PREVIOUS=whsec_old',
    ]);
    const result = runGate(envFile);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/GATE: PAYMENTS-BOOT PASS/);
    expect(result.stdout).toMatch(/rotation window is open/);
    expect(result.stdout).toMatch(/--complete-webhook-rotation/);
  });

  it('emits no rotation notice when no previous secret is set', () => {
    const envFile = writeEnvFile(['PAYMENT_ADAPTER=live', 'STRIPE_WEBHOOK_SECRET=whsec_live']);
    const result = runGate(envFile);
    expect(result.stdout).not.toMatch(/rotation window is open/);
  });
});

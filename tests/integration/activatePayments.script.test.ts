/**
 * scripts/activate-payments.sh — env-file rewrite logic and refusal paths.
 *
 * Real runs prompt for live Stripe credentials and touch SSM and a remote
 * host, which CI cannot exercise. The synthetic --env-file mode operates on
 * a local file with the secrets supplied via STRIPE_SECRET_KEY_VALUE /
 * STRIPE_WEBHOOK_SECRET_VALUE, skipping ssh and aws entirely. These tests
 * pin the rewrite contract (replace-or-append with duplicates collapsed),
 * the credential-shape refusals, the SECRETS_ADAPTER=live precondition, the
 * two-step webhook-secret rotation (shift current to previous, install new;
 * then clear previous), the refusal to overwrite an in-service secret outside
 * that rotation, and the masking of every secret-named line in the shown diff.
 *
 * Parameter Store is the declared source for both signing secrets and the
 * deploy syncs them onto the host, so every real-host mode writes those
 * parameters and therefore needs an AWS profile. The synthetic mode reaches no
 * AWS at all, so the parameter writes are pinned through the printed plan and
 * through the refusal that fires before any host is touched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
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
    expect(result.stdout).toMatch(/derives PAYMENT_ADAPTER from the arming flag/);
    expect(result.stdout).toMatch(/PAYMENTS-BOOT gate/);
  });

  it('refuses to activate staging (the live payment SDK boots only on production)', () => {
    const result = runScript(['--target', 'staging', '--dry-run']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/staging never activates live payments/);
  });
});

describe('activate-payments.sh — the signing secret is written to Parameter Store', () => {
  it('activation plans a write of the webhook-secret parameter under the environment KMS alias', () => {
    const result = runScript(['--target', 'production', '--dry-run']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(
      /aws ssm put-parameter --name \/footbag\/production\/secrets\/stripe_webhook_secret/,
    );
    expect(result.stdout).toMatch(/alias\/footbag-production/);
  });

  it('rotation plans a write of both the current and the outgoing secret parameters', () => {
    const result = runScript(['--target', 'production', '--dry-run', '--rotate-webhook-secret']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\/footbag\/production\/secrets\/stripe_webhook_secret\b/);
    expect(result.stdout).toMatch(/\/footbag\/production\/secrets\/stripe_webhook_secret_previous/);
  });

  it('completing a rotation plans a return of the outgoing parameter to its placeholder', () => {
    const result = runScript([
      '--target',
      'production',
      '--dry-run',
      '--complete-webhook-rotation',
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\/footbag\/production\/secrets\/stripe_webhook_secret_previous/);
    expect(result.stdout).toMatch(/placeholder/);
  });

  it('rotation against a real host refuses without an AWS profile, before touching the host', () => {
    const result = runScript(['--target', 'production', '--rotate-webhook-secret']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--profile is required/);
    expect(result.stderr).toMatch(/stripe_\*/);
  });

  it('completing a rotation against a real host refuses without an AWS profile', () => {
    const result = runScript(['--target', 'production', '--complete-webhook-rotation']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--profile is required/);
  });

  it('the synthetic mode still reaches no AWS, so rotation there needs no profile', () => {
    const envFile = writeEnvFile([
      'SECRETS_ADAPTER=live',
      'PAYMENT_ADAPTER=live',
      'STRIPE_WEBHOOK_SECRET=whsec_inservice000',
    ]);
    const result = runScript(
      ['--target', 'staging', '--env-file', envFile, '--rotate-webhook-secret'],
      { STRIPE_WEBHOOK_SECRET_VALUE: 'whsec_rolled111' },
    );
    expect(result.exitCode).toBe(0);
    const written = readFileSync(envFile, 'utf-8');
    expect(written).toMatch(/^STRIPE_WEBHOOK_SECRET=whsec_rolled111$/m);
    expect(written).toMatch(/^STRIPE_WEBHOOK_SECRET_PREVIOUS=whsec_inservice000$/m);
  });
});

describe('activate-payments.sh — credential shape refusals', () => {
  it('accepts a test-mode key on production with a pre-live notice (the pre-cutover exercise)', () => {
    const envFile = writeEnvFile(['SECRETS_ADAPTER=live', 'PAYMENT_ADAPTER=stub', 'PAYMENTS_ARMED=dark']);
    const result = runScript(['--target', 'production', '--env-file', envFile], SECRETS);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/NOTICE: test-mode key supplied/);
    expect(result.stdout).toMatch(/production-live/);
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

  it('appends the webhook secret and leaves PAYMENT_ADAPTER untouched (the deploy derives it)', () => {
    const envFile = writeEnvFile(['SECRETS_ADAPTER=live', 'PAYMENT_ADAPTER=stub', 'PAYMENTS_ARMED=dark', 'OTHER=untouched']);
    const result = runScript(['--target', 'staging', '--env-file', envFile], SECRETS);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/GATE: PAYMENTS-BOOT PASS/);
    const rewritten = readFileSync(envFile, 'utf-8');
    expect(rewritten).toContain('PAYMENT_ADAPTER=stub');
    expect(rewritten).not.toContain('PAYMENT_ADAPTER=live');
    expect(rewritten).toContain(`STRIPE_WEBHOOK_SECRET=${SECRETS.STRIPE_WEBHOOK_SECRET_VALUE}`);
    expect(rewritten).toContain('OTHER=untouched');
  });

  it('collapses duplicate webhook-secret assignments instead of stacking new ones', () => {
    // An idempotent re-activation: the file already carries the value being
    // installed (duplicated here), so activation proceeds and must leave a
    // single assignment rather than stacking another. PAYMENT_ADAPTER lines
    // pass through verbatim; the deploy owns that key.
    const envFile = writeEnvFile([
      'SECRETS_ADAPTER=live',
      'PAYMENT_ADAPTER=stub',
      'PAYMENTS_ARMED=dark',
      `STRIPE_WEBHOOK_SECRET=${SECRETS.STRIPE_WEBHOOK_SECRET_VALUE}`,
      `STRIPE_WEBHOOK_SECRET=${SECRETS.STRIPE_WEBHOOK_SECRET_VALUE}`,
    ]);
    const result = runScript(['--target', 'staging', '--env-file', envFile], SECRETS);
    expect(result.exitCode).toBe(0);
    const rewritten = readFileSync(envFile, 'utf-8');
    expect(rewritten.match(/^STRIPE_WEBHOOK_SECRET=/gm)).toHaveLength(1);
  });

  it('refuses to overwrite an in-service webhook secret and points to rotation', () => {
    const envFile = writeEnvFile([
      'SECRETS_ADAPTER=live',
      'PAYMENT_ADAPTER=live',
      'STRIPE_WEBHOOK_SECRET=whsec_already_live',
    ]);
    const result = runScript(['--target', 'staging', '--env-file', envFile], SECRETS);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/already set to a different value/);
    expect(result.stderr).toMatch(/--rotate-webhook-secret/);
    // The file is left untouched; the live secret is not replaced.
    expect(readFileSync(envFile, 'utf-8')).toContain('STRIPE_WEBHOOK_SECRET=whsec_already_live');
  });

  it('masks the webhook secret in the displayed diff', () => {
    const envFile = writeEnvFile(['SECRETS_ADAPTER=live', 'PAYMENT_ADAPTER=stub', 'PAYMENTS_ARMED=dark']);
    const result = runScript(['--target', 'staging', '--env-file', envFile], SECRETS);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('STRIPE_WEBHOOK_SECRET=********');
    expect(result.stdout).not.toContain(SECRETS.STRIPE_WEBHOOK_SECRET_VALUE);
  });

  it('masks every secret-named line in the diff, not only the changed one', () => {
    // A secret sitting in the diff's unchanged context window must not print in
    // the clear next to the line that actually changed.
    const envFile = writeEnvFile([
      'SECRETS_ADAPTER=live',
      'PAYMENT_ADAPTER=stub',
      'PAYMENTS_ARMED=dark',
      'SESSION_SECRET=session_plaintext_value',
      'INTERNAL_EVENT_SECRET=ipc_plaintext_value',
    ]);
    const result = runScript(['--target', 'staging', '--env-file', envFile], SECRETS);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('session_plaintext_value');
    expect(result.stdout).not.toContain('ipc_plaintext_value');
    expect(result.stdout).toContain('SESSION_SECRET=********');
  });
});

describe('activate-payments.sh — webhook-secret rotation', () => {
  const LIVE_ENV = [
    'SECRETS_ADAPTER=live',
    'PAYMENT_ADAPTER=live',
    'STRIPE_WEBHOOK_SECRET=whsec_current_value',
  ];

  it('shifts the current secret to previous and installs the new one', () => {
    const envFile = writeEnvFile(LIVE_ENV);
    const result = runScript(
      ['--target', 'staging', '--env-file', envFile, '--rotate-webhook-secret'],
      { STRIPE_WEBHOOK_SECRET_VALUE: 'whsec_new_value' },
    );
    expect(result.exitCode).toBe(0);
    const rewritten = readFileSync(envFile, 'utf-8');
    expect(rewritten).toContain('STRIPE_WEBHOOK_SECRET=whsec_new_value');
    expect(rewritten).toContain('STRIPE_WEBHOOK_SECRET_PREVIOUS=whsec_current_value');
    expect(rewritten.match(/^STRIPE_WEBHOOK_SECRET=/gm)).toHaveLength(1);
    // Rotation must not touch PAYMENT_ADAPTER; the host is already live.
    expect(rewritten).toContain('PAYMENT_ADAPTER=live');
    // The gate observes the open rotation window.
    expect(result.stdout).toMatch(/rotation window is open/);
  });

  it('masks both the new and the previous secret in the diff', () => {
    const envFile = writeEnvFile(LIVE_ENV);
    const result = runScript(
      ['--target', 'staging', '--env-file', envFile, '--rotate-webhook-secret'],
      { STRIPE_WEBHOOK_SECRET_VALUE: 'whsec_new_value' },
    );
    expect(result.stdout).not.toContain('whsec_new_value');
    expect(result.stdout).not.toContain('whsec_current_value');
    expect(result.stdout).toContain('STRIPE_WEBHOOK_SECRET_PREVIOUS=********');
  });

  it('refuses to rotate when no secret is set yet', () => {
    const envFile = writeEnvFile(['SECRETS_ADAPTER=live', 'PAYMENT_ADAPTER=live']);
    const result = runScript(
      ['--target', 'staging', '--env-file', envFile, '--rotate-webhook-secret'],
      { STRIPE_WEBHOOK_SECRET_VALUE: 'whsec_new_value' },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/nothing to rotate/);
  });

  it('refuses to rotate to an identical secret', () => {
    const envFile = writeEnvFile(LIVE_ENV);
    const result = runScript(
      ['--target', 'staging', '--env-file', envFile, '--rotate-webhook-secret'],
      { STRIPE_WEBHOOK_SECRET_VALUE: 'whsec_current_value' },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/identical to the current one/);
  });

  it('refuses a second rotation while a window is already open', () => {
    const envFile = writeEnvFile([...LIVE_ENV, 'STRIPE_WEBHOOK_SECRET_PREVIOUS=whsec_older_value']);
    const result = runScript(
      ['--target', 'staging', '--env-file', envFile, '--rotate-webhook-secret'],
      { STRIPE_WEBHOOK_SECRET_VALUE: 'whsec_new_value' },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/rotation window is open/);
  });

  it('refuses to rotate when PAYMENT_ADAPTER is not live', () => {
    const envFile = writeEnvFile([
      'SECRETS_ADAPTER=live',
      'PAYMENT_ADAPTER=stub',
      'STRIPE_WEBHOOK_SECRET=whsec_current_value',
    ]);
    const result = runScript(
      ['--target', 'staging', '--env-file', envFile, '--rotate-webhook-secret'],
      { STRIPE_WEBHOOK_SECRET_VALUE: 'whsec_new_value' },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/PAYMENT_ADAPTER=live is not set/);
  });

  it('completing a rotation clears the previous secret and passes the gate', () => {
    const envFile = writeEnvFile([...LIVE_ENV, 'STRIPE_WEBHOOK_SECRET_PREVIOUS=whsec_older_value']);
    const result = runScript(['--target', 'staging', '--env-file', envFile, '--complete-webhook-rotation']);
    expect(result.exitCode).toBe(0);
    const rewritten = readFileSync(envFile, 'utf-8');
    expect(rewritten).not.toMatch(/^STRIPE_WEBHOOK_SECRET_PREVIOUS=/m);
    expect(rewritten).toContain('STRIPE_WEBHOOK_SECRET=whsec_current_value');
    expect(result.stdout).toMatch(/GATE: PAYMENTS-BOOT PASS/);
  });

  it('completing with no open window is an idempotent no-op', () => {
    const envFile = writeEnvFile(LIVE_ENV);
    const result = runScript(['--target', 'staging', '--env-file', envFile, '--complete-webhook-rotation']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/no rotation window to close/);
  });
});

// ── the order of writes, and the temp file that holds the key ────────────────
//
// The Parameter Store write is the one irreversible act in this script: it uses
// --overwrite and the replaced value cannot be recovered from here. It therefore
// has to come after every refusal that could still abort the run, and it must
// not be able to leave the plaintext key behind if the run is interrupted.
// Neither property can be executed in CI, because the write path needs AWS and
// the synthetic mode deliberately skips it, so both are pinned against the
// source. The behaviour that IS executable, the new flag, is exercised directly.

describe('activate-payments.sh — write ordering and key-file hygiene', () => {
  const source = readFileSync(SCRIPT, 'utf-8');

  it('writes the Stripe key only after every refusal that can abort the run', () => {
    const keyWrite = source.indexOf('put_ssm_secret "$SSM_PARAM" "$STRIPE_KEY"');
    expect(keyWrite).toBeGreaterThan(-1);
    for (const refusal of [
      'Stripe secret keys start with sk_live_ or sk_test_',
      'webhook signing secrets start with whsec_',
      'SECRETS_ADAPTER=live is not set in the host env file',
      'plain activation will not overwrite it',
    ]) {
      const at = source.indexOf(refusal);
      expect(at, refusal).toBeGreaterThan(-1);
      expect(at, refusal).toBeLessThan(keyWrite);
    }
  });

  it('the temp file holding the key is the one the trap actually shreds', () => {
    // The previous trap named KEY_TMP while the function assigned a local, so an
    // interrupt between creating the file and shredding it left the plaintext
    // secret behind.
    expect(source).toMatch(/KEY_TMP="\$\(mktemp \/tmp\/footbag-ssm-val\.XXXXXX\)"/);
    expect(source).toMatch(/trap 'shred -u "\$\{KEY_TMP:-\}"/);
    expect(source).toMatch(/--value "file:\/\/\$KEY_TMP"/);
  });

  it('refuses to replace an existing Stripe key unless told to', () => {
    expect(source).toMatch(/already holds a different Stripe API key/);
    expect(source).toMatch(/Re-run with --replace-key/);
  });

  it('accepts --replace-key as an argument', () => {
    const result = runScript(['--target', 'production', '--replace-key', '--dry-run']);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toMatch(/unknown argument/);
  });

  it('the printed plan states that the checks precede the writes', () => {
    const result = runScript(['--target', 'production', '--dry-run']);
    const checks = result.stdout.indexOf('Check every refusal BEFORE anything is written');
    const keyPut = result.stdout.indexOf('--name /footbag/production/secrets/stripe_secret_key');
    expect(checks).toBeGreaterThan(-1);
    expect(keyPut).toBeGreaterThan(checks);
  });
});

/**
 * Deactivation is what keeps a test-mode exercise from closing a door. The
 * signing secret it installs otherwise outlives disarming, because the deploy
 * re-syncs it from Parameter Store whatever the arming state, and a later plain
 * activation then refuses to replace a secret already in service while the
 * rotation refuses for want of the live adapter disarming removed. Returning
 * both host lines and all three parameters to their pre-activation state makes
 * the next activation a first activation.
 */
describe('activate-payments.sh — deactivation leaves nothing behind', () => {
  const DARK_HOST = [
    'FOOTBAG_ENV=production',
    'SECRETS_ADAPTER=live',
    'PAYMENT_ADAPTER=stub',
    'STRIPE_WEBHOOK_SECRET=whsec_fromtheexercise',
    'STRIPE_WEBHOOK_SECRET_STUB=whsec_stub_abc',
    'SESSION_SECRET=unrelated',
  ];

  it('removes both signing-secret lines and keeps everything else', () => {
    const envFile = writeEnvFile([...DARK_HOST, 'STRIPE_WEBHOOK_SECRET_PREVIOUS=whsec_older']);

    const result = runScript(['--target', 'production', '--env-file', envFile, '--deactivate']);
    const after = readFileSync(envFile, 'utf-8');

    expect(result.exitCode).toBe(0);
    expect(after).not.toMatch(/^STRIPE_WEBHOOK_SECRET=/m);
    expect(after).not.toMatch(/^STRIPE_WEBHOOK_SECRET_PREVIOUS=/m);
    expect(after).toMatch(/^SESSION_SECRET=unrelated$/m);
    expect(after).toMatch(/^SECRETS_ADAPTER=live$/m);
  });

  it('leaves the stub twin in place, because a dark host verifies against it', () => {
    const envFile = writeEnvFile(DARK_HOST);

    runScript(['--target', 'production', '--env-file', envFile, '--deactivate']);

    expect(readFileSync(envFile, 'utf-8')).toMatch(/^STRIPE_WEBHOOK_SECRET_STUB=whsec_stub_abc$/m);
  });

  it('refuses on a host still running the live adapter, and changes nothing', () => {
    const envFile = writeEnvFile([
      'FOOTBAG_ENV=production',
      'SECRETS_ADAPTER=live',
      'PAYMENT_ADAPTER=live',
      'STRIPE_WEBHOOK_SECRET=whsec_inservice',
    ]);
    const before = readFileSync(envFile, 'utf-8');

    const result = runScript(['--target', 'production', '--env-file', envFile, '--deactivate']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/disarm payments before removing/);
    expect(result.stderr).toMatch(/--switch payments --state dark/);
    expect(readFileSync(envFile, 'utf-8')).toEqual(before);
  });

  it('is a no-op on a host that never held a secret', () => {
    const envFile = writeEnvFile([
      'FOOTBAG_ENV=production',
      'SECRETS_ADAPTER=live',
      'PAYMENT_ADAPTER=stub',
    ]);
    const before = readFileSync(envFile, 'utf-8');

    const result = runScript(['--target', 'production', '--env-file', envFile, '--deactivate']);

    expect(result.exitCode).toBe(0);
    expect(readFileSync(envFile, 'utf-8')).toEqual(before);
  });

  it('needs no secret in the environment, unlike activation', () => {
    const envFile = writeEnvFile(DARK_HOST);

    const result = runScript(['--target', 'production', '--env-file', envFile, '--deactivate']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toMatch(/STRIPE_SECRET_KEY_VALUE/);
  });

  it('plans all three parameters back to the placeholder, and the refusal that guards it', () => {
    const result = runScript(['--target', 'production', '--deactivate', '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('/footbag/production/secrets/stripe_secret_key');
    expect(result.stdout).toContain('/footbag/production/secrets/stripe_webhook_secret');
    expect(result.stdout).toContain('/footbag/production/secrets/stripe_webhook_secret_previous');
    expect(result.stdout).toMatch(/REFUSE if\s*\n?\s*PAYMENT_ADAPTER=live/);
    expect(result.stdout).toContain('REMOVE PAYMENT CREDENTIALS');
  });

  it('resets the parameters before touching the host, so a deploy between the two cannot undo it', () => {
    const result = runScript(['--target', 'production', '--deactivate', '--dry-run']);
    const params = result.stdout.indexOf('Return all three parameters to the placeholder');
    const host = result.stdout.indexOf('Remove the STRIPE_WEBHOOK_SECRET and');

    expect(params).toBeGreaterThan(-1);
    expect(host).toBeGreaterThan(params);
  });
});

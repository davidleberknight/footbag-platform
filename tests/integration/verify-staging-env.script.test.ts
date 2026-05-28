/**
 * scripts/verify-staging-env.sh — boundary value validation harness.
 *
 * The ops script (Pass 3 R7) reads /srv/footbag/env on a deployed host and
 * compares against terraform-output expected values. To exercise the check
 * logic in CI without a live staging host, the script exposes a synthetic
 * --env-file mode that takes a local env-file path and accepts the terraform
 * outputs via TF_JWT_KMS_KEY_ARN / TF_SES_SENDER / TF_MEDIA_BUCKET env vars.
 *
 * This suite enumerates the PASS / FAIL / WARN matrix using one fixture per
 * invariant. Boundary value analysis per docs/TESTING.md §4.4: each critical
 * invariant gets one negative case (mutation that should fail) and the clean
 * baseline serves as the all-positive boundary.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts/verify-staging-env.sh');

const TF_ENV = {
  TF_JWT_KMS_KEY_ARN: 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh',
  TF_SES_SENDER: 'noreply@footbag.org',
  TF_MEDIA_BUCKET: 'footbag-staging-media',
} as const;

const CLEAN_STAGING_ENV = [
  'FOOTBAG_ENV=staging',
  'NODE_ENV=production',
  `SESSION_SECRET=${'a'.repeat(48)}`,
  'JWT_SIGNER=kms',
  `JWT_KMS_KEY_ID=${TF_ENV.TF_JWT_KMS_KEY_ARN}`,
  'SES_ADAPTER=live',
  `SES_FROM_IDENTITY=${TF_ENV.TF_SES_SENDER}`,
  'MEDIA_STORAGE_ADAPTER=s3',
  `MEDIA_STORAGE_S3_BUCKET=${TF_ENV.TF_MEDIA_BUCKET}`,
  'AWS_REGION=us-east-1',
  'SAFE_BROWSING_ADAPTER=live',
  'SECRETS_ADAPTER=live',
  'HTTP_REACHABILITY_ADAPTER=live',
  `INTERNAL_EVENT_SECRET=${'a'.repeat(64)}`,
  'PUBLIC_BASE_URL=https://staging.footbag.org',
  'FOOTBAG_DB_PATH=/srv/footbag/data/footbag.db',
  'PORT=3000',
  'IMAGE_PROCESSOR_URL=http://image-worker:4000',
  'TRUST_PROXY=loopback, linklocal, uniquelocal',
  'PAYMENT_ADAPTER=stub',
].join('\n');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runScript(opts: {
  envFilePath: string;
  target?: 'staging' | 'production';
  extraEnv?: Record<string, string>;
  tfEnv?: Partial<typeof TF_ENV>;
}): RunResult {
  const target = opts.target ?? 'staging';
  const env = {
    ...process.env,
    ...TF_ENV,
    ...(opts.tfEnv ?? {}),
    ...(opts.extraEnv ?? {}),
  };
  // spawnSync (not execFileSync) so stderr is captured regardless of exit
  // code; the script writes advisory WARNs to stderr while exiting 0.
  const result = spawnSync(
    'bash',
    [SCRIPT, '--target', target, '--env-file', opts.envFilePath],
    { env, encoding: 'utf-8' },
  );
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

let tmpDir: string;
beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'verify-env-'));
});
afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

let envFileCounter = 0;
function writeEnvFile(contents: string): string {
  envFileCounter += 1;
  const p = join(tmpDir, `case-${envFileCounter}.env`);
  writeFileSync(p, contents);
  return p;
}

function mutate(field: RegExp, replacement: string, base = CLEAN_STAGING_ENV): string {
  if (!field.test(base)) {
    throw new Error(`mutate(): pattern ${field} not found in base env`);
  }
  return base.replace(field, replacement);
}

describe('verify-staging-env.sh — clean baseline', () => {
  it('clean staging env → exit 0, no FAILs, success summary', () => {
    const result = runScript({ envFilePath: writeEnvFile(CLEAN_STAGING_ENV) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('All critical invariants passed');
    expect(result.stdout).not.toContain('  FAIL  ');
  });
});

describe('verify-staging-env.sh — critical invariant FAIL boundaries', () => {
  it('FOOTBAG_ENV unset → FAIL env discriminator', () => {
    const env = mutate(/^FOOTBAG_ENV=.*\n/m, '');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +env discriminator/);
  });

  it('NODE_ENV=development with FOOTBAG_ENV=staging → FAIL cross-invariant (R1)', () => {
    const env = mutate(/NODE_ENV=production/, 'NODE_ENV=development');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +NODE_ENV cross-invariant/);
  });

  it('SESSION_SECRET shorter than 32 chars → FAIL', () => {
    const env = mutate(/SESSION_SECRET=.+/, 'SESSION_SECRET=tooshort');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/SESSION_SECRET is \d+ chars \(need >= 32\)/);
  });

  it("SESSION_SECRET contains 'changeme' → FAIL", () => {
    const env = mutate(
      /SESSION_SECRET=.+/,
      `SESSION_SECRET=${'a'.repeat(20)}changeme${'b'.repeat(20)}`,
    );
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("contains 'changeme'");
  });

  it('JWT_KMS_KEY_ID drift from terraform → FAIL', () => {
    const env = mutate(
      /JWT_KMS_KEY_ID=.+/,
      'JWT_KMS_KEY_ID=arn:aws:kms:us-east-1:0:key/different',
    );
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +JWT KMS key ARN matches terraform/);
  });

  it('SES_FROM_IDENTITY drift from terraform → FAIL', () => {
    const env = mutate(/SES_FROM_IDENTITY=.+/, 'SES_FROM_IDENTITY=wrong@example.com');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +SES sender identity matches terraform/);
  });

  it('MEDIA_STORAGE_S3_BUCKET drift from terraform → FAIL', () => {
    const env = mutate(/MEDIA_STORAGE_S3_BUCKET=.+/, 'MEDIA_STORAGE_S3_BUCKET=wrong-bucket');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +media bucket matches terraform/);
  });

  it('INTERNAL_EVENT_SECRET = dev-default literal → FAIL', () => {
    const env = mutate(
      /INTERNAL_EVENT_SECRET=.+/,
      'INTERNAL_EVENT_SECRET=dev-internal-event-secret-not-for-prod',
    );
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('is the dev-default literal');
  });

  it('IMAGE_PROCESSOR_URL pointing at localhost → FAIL', () => {
    const env = mutate(
      /IMAGE_PROCESSOR_URL=.+/,
      'IMAGE_PROCESSOR_URL=http://localhost:4001',
    );
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('references localhost');
  });

  it('PORT unset in env file → PASS (docker-compose hardcodes PORT: "3000")', () => {
    // Adversarial cross-check: the script now greps docker/docker-compose.yml
    // for each var's coverage. PORT is hardcoded in both web and worker
    // service environment blocks, so the env file legitimately doesn't need
    // to set it. A FAIL here would surface only if the compose hardcode were
    // removed AND the env file didn't cover the gap.
    const env = mutate(/^PORT=.+\n/m, '');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/PASS +app port:.*hardcoded in docker-compose/);
  });

  it('IMAGE_PROCESSOR_URL unset in env file → PASS (docker-compose prod overlay provides default)', () => {
    // Same adversarial cross-check: docker-compose.prod.yml uses
    // `${IMAGE_PROCESSOR_URL:-http://image:4000}` as the env-substituted
    // value with an in-stack default. Env file may legitimately omit it.
    const env = mutate(/^IMAGE_PROCESSOR_URL=.+\n/m, '');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/PASS +image processor URL:/);
  });
});

describe('verify-staging-env.sh — dev-shortcut posture per target', () => {
  it('FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID set on staging → FAIL (production-forbidden everywhere)', () => {
    const env = CLEAN_STAGING_ENV + '\nFOOTBAG_DEV_AUTOLOGIN_MEMBER_ID=admin-1';
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +production-forbidden dev shortcut: FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID/);
  });

  it('FOOTBAG_DEV_INITIAL_ADMIN_EMAILS set on staging → PASS (staging-allowed)', () => {
    const env = CLEAN_STAGING_ENV + '\nFOOTBAG_DEV_INITIAL_ADMIN_EMAILS=admin@example.com';
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(
      /PASS +staging-allowed shortcut: FOOTBAG_DEV_INITIAL_ADMIN_EMAILS is set/,
    );
  });

  it('FOOTBAG_DEV_INITIAL_ADMIN_EMAILS set on production → FAIL', () => {
    const env =
      mutate(/FOOTBAG_ENV=staging/, 'FOOTBAG_ENV=production') +
      '\nFOOTBAG_DEV_INITIAL_ADMIN_EMAILS=admin@example.com';
    const result = runScript({
      envFilePath: writeEnvFile(env),
      target: 'production',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(
      /FAIL +production-forbidden dev shortcut: FOOTBAG_DEV_INITIAL_ADMIN_EMAILS/,
    );
  });

  it('staging with no seed/allowlist vars → WARN advisory, exit 0', () => {
    const result = runScript({ envFilePath: writeEnvFile(CLEAN_STAGING_ENV) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(
      /WARN +staging-allowed shortcut: FOOTBAG_DEV_ADMIN_SEED_JSON is unset/,
    );
  });
});

describe('verify-staging-env.sh — advisory checks', () => {
  it('TRUST_PROXY unset → WARN advisory, still exit 0', () => {
    const env = mutate(/^TRUST_PROXY=.*\n?/m, '');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/WARN +trust proxy: TRUST_PROXY unset/);
  });

  it('SES_SANDBOX_MODE=1 on production → FAIL', () => {
    const env =
      mutate(/FOOTBAG_ENV=staging/, 'FOOTBAG_ENV=production') + '\nSES_SANDBOX_MODE=1';
    const result = runScript({
      envFilePath: writeEnvFile(env),
      target: 'production',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('production must be out of sandbox');
  });

  it('SES_SANDBOX_MODE=1 on staging → PASS (staging-acceptable)', () => {
    const env = CLEAN_STAGING_ENV + '\nSES_SANDBOX_MODE=1';
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/PASS +SES sandbox: SES_SANDBOX_MODE on/);
  });

  it('SES_SANDBOX_MODE off on staging → WARN advisory, exit 0', () => {
    const result = runScript({ envFilePath: writeEnvFile(CLEAN_STAGING_ENV) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/WARN +SES sandbox: SES_SANDBOX_MODE is off on staging/);
  });
});

describe('verify-staging-env.sh — CLI / fixture errors', () => {
  it('--target with invalid value → exit 2', () => {
    const result = spawnSync('bash', [SCRIPT, '--target', 'qa'], {
      encoding: 'utf-8',
    });
    expect(result.status).toBe(2);
  });

  it('--env-file path does not exist → exit 2', () => {
    const result = spawnSync(
      'bash',
      [SCRIPT, '--target', 'staging', '--env-file', join(tmpDir, 'does-not-exist.env')],
      { env: { ...process.env, ...TF_ENV }, encoding: 'utf-8' },
    );
    expect(result.status).toBe(2);
    expect(result.stderr ?? '').toContain('does not exist');
  });

  it('--env-file mode without TF_* env vars → exit 2', () => {
    const envFilePath = writeEnvFile(CLEAN_STAGING_ENV);
    // Construct an env object that explicitly drops the TF_* keys (process.env
    // may carry them from a prior test in the same vitest worker).
    const sanitisedEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (k.startsWith('TF_')) continue;
      if (v !== undefined) sanitisedEnv[k] = v;
    }
    const result = spawnSync(
      'bash',
      [SCRIPT, '--target', 'staging', '--env-file', envFilePath],
      { env: sanitisedEnv, encoding: 'utf-8' },
    );
    expect(result.status).toBe(2);
    expect(result.stderr ?? '').toContain('requires TF_JWT_KMS_KEY_ARN');
  });

  it('unparseable env-file line → WARN to stderr, processing continues', () => {
    const env = CLEAN_STAGING_ENV + '\nthis is not a valid line\n';
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toMatch(/WARN: unparseable line/);
  });

  it('comments and blank lines are silently ignored', () => {
    const env = `# top comment\n\n${CLEAN_STAGING_ENV}\n\n  # indented comment\n`;
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toMatch(/WARN: unparseable line/);
  });

  it('quoted values are unwrapped before comparison', () => {
    const env = CLEAN_STAGING_ENV.replace(/FOOTBAG_ENV=staging/, 'FOOTBAG_ENV="staging"');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/PASS +env discriminator: FOOTBAG_ENV=staging/);
  });
});

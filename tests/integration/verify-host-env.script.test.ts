/**
 * scripts/verify-host-env.sh — boundary value validation harness.
 *
 * The ops script reads /srv/footbag/env on a deployed host and
 * compares against terraform-output expected values. To exercise the check
 * logic in CI without a live staging host, the script exposes a synthetic
 * --env-file mode that takes a local env-file path and accepts the terraform
 * outputs via TF_JWT_KMS_KEY_ARN / TF_SES_SENDER / TF_MEDIA_BUCKET env vars.
 *
 * This suite enumerates the PASS / FAIL / WARN matrix using one fixture per
 * invariant: each critical invariant gets one negative case (a mutation that
 * should fail) and the clean baseline serves as the all-positive boundary.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts/verify-host-env.sh');

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
  'SES_ADAPTER=stub',
  `SES_FROM_IDENTITY=${TF_ENV.TF_SES_SENDER}`,
  'MEDIA_STORAGE_ADAPTER=s3',
  `MEDIA_STORAGE_S3_BUCKET=${TF_ENV.TF_MEDIA_BUCKET}`,
  'AWS_REGION=us-east-1',
  'SAFE_BROWSING_ADAPTER=live',
  'SECRETS_ADAPTER=live',
  'HTTP_REACHABILITY_ADAPTER=live',
  'CAPTCHA_ADAPTER=stub',
  `INTERNAL_EVENT_SECRET=${'a'.repeat(64)}`,
  'SES_FEEDBACK_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/000/footbag-staging-ses-feedback-feed',
  'SES_FEEDBACK_TOPIC_ARN=arn:aws:sns:us-east-1:000:footbag-staging-ses-feedback',
  'ALARM_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/000/footbag-staging-alarm-feed',
  'ALARM_TOPIC_ARN=arn:aws:sns:us-east-1:000:footbag-staging-alarms',
  'PUBLIC_BASE_URL=https://staging.footbag.org',
  'FOOTBAG_DB_PATH=/srv/footbag/data/footbag.db',
  'PORT=3000',
  'IMAGE_PROCESSOR_URL=http://image-worker:4000',
  'TRUST_PROXY=2',
  'BACKUP_S3_BUCKET=footbag-staging-db-snapshots',
  'PAYMENT_ADAPTER=stub',
  'STRIPE_WEBHOOK_SECRET_STUB=whsec_stub_staging_generated_value',
  'PAYMENTS_ARMED=armed',
  'EMAIL_SEND_ARMED=armed',
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
    { env, encoding: 'utf-8', ...SPAWN_GUARD },
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

// Production-shaped variant with live SES: the feedback-webhook key checks
// apply only on hosts that actually send real mail.
function liveSesEnv(): string {
  return CLEAN_STAGING_ENV
    .replace('FOOTBAG_ENV=staging', 'FOOTBAG_ENV=production')
    .replace('SES_ADAPTER=stub', 'SES_ADAPTER=live');
}

describe('verify-host-env.sh — clean baseline', () => {
  it('clean staging env → exit 0, no FAILs, success summary', () => {
    const result = runScript({ envFilePath: writeEnvFile(CLEAN_STAGING_ENV) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('All critical invariants passed');
    expect(result.stdout).not.toContain('  FAIL  ');
  });
});

describe('verify-host-env.sh — critical invariant FAIL boundaries', () => {
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

  it('a JWT_KMS_KEY_ID that is neither the alias nor the built key → FAIL', () => {
    const env = mutate(
      /JWT_KMS_KEY_ID=.+/,
      'JWT_KMS_KEY_ID=arn:aws:kms:us-east-1:0:key/different',
    );
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +JWT KMS key/);
  });

  it('an unset JWT_KMS_KEY_ID → FAIL', () => {
    // The signer refuses to start without it, so this is not advisory.
    const env = mutate(/JWT_KMS_KEY_ID=.+\n/, '');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +JWT KMS key: JWT_KMS_KEY_ID is unset/);
  });

  it('SES_FROM_IDENTITY drift from terraform → FAIL (production, where live SES is checked)', () => {
    const env = mutate(/FOOTBAG_ENV=staging/, 'FOOTBAG_ENV=production')
      .replace('SES_ADAPTER=stub', 'SES_ADAPTER=live')
      .replace(/SES_FROM_IDENTITY=.+/, 'SES_FROM_IDENTITY=wrong@example.com');
    const result = runScript({ envFilePath: writeEnvFile(env), target: 'production' });
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

  it('the feedback queue is not required while SES is stubbed', () => {
    // The queue carries bounce and complaint notifications, which only exist
    // once live SES is activated; a stub-SES host must not be forced to carry
    // one.
    const env = mutate(/^SES_FEEDBACK_QUEUE_URL=.+\n/m, '');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('not required (SES_ADAPTER is not');
  });

  it('the feedback queue missing under live SES fails, because nothing would record a bounce', () => {
    // Sending would carry on while the platform's view of which mailboxes are
    // dead silently stopped being updated. That is invisible until a member
    // reports mail they should never have received.
    const env = liveSesEnv().replace(/^SES_FEEDBACK_QUEUE_URL=.+\n/m, '');
    const result = runScript({ envFilePath: writeEnvFile(env), target: 'production' });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('SES_FEEDBACK_QUEUE_URL is unset');
  });

  it('an alarm queue without its topic fails, because the read cannot be attributed', () => {
    const env = mutate(/^ALARM_TOPIC_ARN=.+\n/m, '', liveSesEnv());
    const result = runScript({ envFilePath: writeEnvFile(env), target: 'production' });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('ALARM_TOPIC_ARN is not');
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

describe('verify-host-env.sh — dev-shortcut posture per target', () => {
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
      mutate(/FOOTBAG_ENV=staging/, 'FOOTBAG_ENV=production').replace(
        'SES_ADAPTER=stub',
        'SES_ADAPTER=live',
      ) +
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

  it('staging with no allowlist var → WARN advisory, exit 0', () => {
    const result = runScript({ envFilePath: writeEnvFile(CLEAN_STAGING_ENV) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(
      /WARN +staging-allowed shortcut: FOOTBAG_DEV_INITIAL_ADMIN_EMAILS is unset/,
    );
  });
});

describe('verify-host-env.sh — advisory checks', () => {
  it('the terraform-managed JWT alias is the expected value and passes clean', () => {
    const env = mutate(/JWT_KMS_KEY_ID=.+/, 'JWT_KMS_KEY_ID=alias/footbag-staging-jwt');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/PASS +JWT KMS key: JWT_KMS_KEY_ID=alias\/footbag-staging-jwt/);
    expect(result.stdout).not.toMatch(/WARN +JWT KMS key/);
  });

  it('the key ARN → WARN advisory, still exit 0, and says why it is worth moving', () => {
    // It signs correctly, so failing the run would block a deploy over a value
    // that works. But the adapter copies it into every session token's kid
    // header, so the ARN publishes the AWS account id to every session holder,
    // and correcting it invalidates those sessions.
    const result = runScript({ envFilePath: writeEnvFile(CLEAN_STAGING_ENV) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/WARN +JWT KMS key: JWT_KMS_KEY_ID is the key ARN/);
    expect(result.stdout).toMatch(/account id/);
    expect(result.stdout).toMatch(/invalidates every session/);
  });

  it('TRUST_PROXY unset → WARN advisory (rate limiting degrades to coarse buckets), still exit 0', () => {
    const env = mutate(/^TRUST_PROXY=.*\n?/m, '');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/WARN +trust proxy: TRUST_PROXY is not an integer XFF hop count/);
  });

  it('TRUST_PROXY set to a named range → WARN advisory, still exit 0', () => {
    const env = mutate(/^TRUST_PROXY=.*$/m, 'TRUST_PROXY=loopback, linklocal, uniquelocal');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/WARN +trust proxy: TRUST_PROXY is not an integer XFF hop count/);
  });

  it('TRUST_PROXY=2 → PASS', () => {
    const result = runScript({ envFilePath: writeEnvFile(CLEAN_STAGING_ENV) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/PASS +trust proxy: TRUST_PROXY=2/);
  });

  it('BACKUP_S3_BUCKET unset → WARN advisory (backup timer cannot upload), still exit 0', () => {
    const env = mutate(/^BACKUP_S3_BUCKET=.*\n?/m, '');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/WARN +backup bucket: BACKUP_S3_BUCKET unset/);
  });

  it('BACKUP_S3_BUCKET set → PASS', () => {
    const result = runScript({ envFilePath: writeEnvFile(CLEAN_STAGING_ENV) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/PASS +backup bucket: BACKUP_S3_BUCKET=footbag-staging-db-snapshots/);
  });

  it('SES_ADAPTER=stub on staging → PASS (staging runs the stub adapter)', () => {
    const result = runScript({ envFilePath: writeEnvFile(CLEAN_STAGING_ENV) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/PASS +SES adapter/);
  });

  it('CAPTCHA_ADAPTER=live on staging → FAIL (a challenge staging cannot serve)', () => {
    // The one adapter whose value genuinely differs between the environments,
    // and the reason it is pinned here rather than merely required: a live
    // captcha on staging is not a preference, it is a tester who cannot get
    // past registration because nothing there can issue the challenge.
    const env = mutate(/CAPTCHA_ADAPTER=stub/, 'CAPTCHA_ADAPTER=live');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +captcha adapter/);
  });

  it('CAPTCHA_ADAPTER unset on production → FAIL (set, but not pinned to a value)', () => {
    // Production is only required to have chosen, because captcha is activated
    // there as tracked operator work alongside safe browsing and URL
    // reachability; a host that has not reached that step is early rather than
    // misconfigured. Unset is still a failure: nothing has chosen at all.
    const env = mutate(/FOOTBAG_ENV=staging/, 'FOOTBAG_ENV=production')
      .replace(/CAPTCHA_ADAPTER=.+\n/, '');
    const result = runScript({ envFilePath: writeEnvFile(env), target: 'production' });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +captcha adapter/);
  });

  it('CAPTCHA_ADAPTER=live on production → PASS', () => {
    const env = mutate(/FOOTBAG_ENV=staging/, 'FOOTBAG_ENV=production')
      .replace('CAPTCHA_ADAPTER=stub', 'CAPTCHA_ADAPTER=live');
    const result = runScript({ envFilePath: writeEnvFile(env), target: 'production' });
    expect(result.stdout).toMatch(/PASS +captcha adapter/);
  });

  it('SES_ADAPTER=live on staging → FAIL (live SES is production-only)', () => {
    const env = mutate(/SES_ADAPTER=stub/, 'SES_ADAPTER=live');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +SES adapter/);
  });

  // Without its own secret, a stub-adapter host verifies webhooks against a
  // constant committed to the repository, so anyone with a copy could forge a
  // delivery it accepts.
  it('STRIPE_WEBHOOK_SECRET_STUB unset under the stub adapter → FAIL', () => {
    const env = mutate(/STRIPE_WEBHOOK_SECRET_STUB=.*/, '');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +stub webhook signing secret/);
  });

  it('STRIPE_WEBHOOK_SECRET_STUB is not required when the host runs the live adapter', () => {
    const env = mutate(/STRIPE_WEBHOOK_SECRET_STUB=.*/, '')
      .replace(/PAYMENT_ADAPTER=stub/, 'PAYMENT_ADAPTER=live');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.stdout).not.toMatch(/stub webhook signing secret/);
  });
});

describe('verify-host-env.sh — CLI / fixture errors', () => {
  it('--target with invalid value → exit 2', () => {
    const result = spawnSync('bash', [SCRIPT, '--target', 'qa'], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    expect(result.status).toBe(2);
  });

  it('--env-file path does not exist → exit 2', () => {
    const result = spawnSync(
      'bash',
      [SCRIPT, '--target', 'staging', '--env-file', join(tmpDir, 'does-not-exist.env')],
      { env: { ...process.env, ...TF_ENV }, encoding: 'utf-8', ...SPAWN_GUARD },
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
      { env: sanitisedEnv, encoding: 'utf-8', ...SPAWN_GUARD },
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

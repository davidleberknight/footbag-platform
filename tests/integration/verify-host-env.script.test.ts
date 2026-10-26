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
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
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
  'AWS_PROFILE=footbag-staging-runtime',
  'FOOTBAG_DB_DIR=/srv/footbag/db',
  'FOOTBAG_DB_PATH=/srv/footbag/db/footbag.db',
  'PORT=3000',
  'IMAGE_PROCESSOR_URL=http://image-worker:4000',
  'TRUST_PROXY=2',
  'BACKUP_S3_BUCKET=footbag-staging-db-snapshots',
  'PAYMENT_ADAPTER=stub',
  'STRIPE_WEBHOOK_SECRET_STUB=whsec_stub_abababababababababababababababababababababababab',
  'PAYMENTS_ARMED=armed',
  'EMAIL_SEND_ARMED=armed',
  // Both link-protection switches armed, matching the live screening and
  // reachability selectors above. These are not inert below production, so the
  // switch and its selector must agree on staging too.
  'URL_SCREENING_ARMED=armed',
  'REACHABILITY_ARMED=armed',
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
  tmpDir = mkdtempSync(join(tmpdir(), 'footbag-test-verify-env-'));
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

  // Defect caught: a host constant drifts from the committed config (the other
  // environment's profile, the old beside-the-install database path, a wrong
  // region) and the verifier, checking only that a value is set, calls it
  // healthy while the host signs AWS calls with a chain it was never given or
  // replaces a database no container opens.
  it.each([
    ['AWS_PROFILE', 'footbag-production-runtime', 'runtime profile matches committed host config'],
    ['FOOTBAG_DB_PATH', '/srv/footbag/footbag.db', 'database path matches committed host config'],
    ['FOOTBAG_DB_DIR', '/srv/footbag', 'database directory matches committed host config'],
    ['AWS_REGION', 'us-west-2', 'AWS region matches committed host config'],
  ])('%s drifted from the committed host config → FAIL', (key, wrong, label) => {
    const env = mutate(new RegExp(`^${key}=.+$`, 'm'), `${key}=${wrong}`);
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(`FAIL  ${label}: ${key}=${wrong}`);
  });

  it('each host constant at its committed value → PASS on production too', () => {
    // The positive control for the drift cases, on the other target, so the
    // expectation is shown to follow the target rather than one fixed file.
    const env = mutate(/^AWS_PROFILE=.+$/m, 'AWS_PROFILE=footbag-production-runtime');
    const result = runScript({ envFilePath: writeEnvFile(env), target: 'production' });
    expect(result.stdout).toContain('PASS  runtime profile matches committed host config: AWS_PROFILE=footbag-production-runtime');
    expect(result.stdout).toContain('PASS  database path matches committed host config: FOOTBAG_DB_PATH=/srv/footbag/db/footbag.db');
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
    expect(result.stdout).toMatch(/WARN +trust proxy: TRUST_PROXY=<unset> is not the committed hop count/);
  });

  it('TRUST_PROXY set to a named range → WARN advisory, still exit 0', () => {
    const env = mutate(/^TRUST_PROXY=.*$/m, 'TRUST_PROXY=loopback, linklocal, uniquelocal');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/WARN +trust proxy: TRUST_PROXY=loopback, linklocal, uniquelocal is not the committed hop count/);
  });

  // Defect caught: a host one hop too generous lets any client spoof its own
  // address with a longer forwarded header, and an integer check alone calls
  // that healthy.
  it('an integer hop count other than the committed one → WARN, naming the deploy as the fix', () => {
    const env = mutate(/^TRUST_PROXY=.*$/m, 'TRUST_PROXY=3');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/WARN +trust proxy: TRUST_PROXY=3 is not the committed hop count \(staging: 2 \(CloudFront then nginx\)\)/);
    expect(result.stdout).toMatch(/next deploy applies the committed value/);
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

  // A real provider secret in the stub's slot would have the stub host act on
  // deliveries signed for the live endpoint; the committed constant is the
  // forgeable value the generated one exists to replace.
  it.each([
    ['a real provider signing secret', 'whsec_live_realvalue'],
    ['the committed stub constant', 'whsec_stub_0000000000000000000000000000'],
    ['a short guessable value', 'whsec_stub_abc'],
  ])('STRIPE_WEBHOOK_SECRET_STUB set to %s → FAIL without printing it', (_label, value) => {
    const env = mutate(/STRIPE_WEBHOOK_SECRET_STUB=.*/, `STRIPE_WEBHOOK_SECRET_STUB=${value}`);
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +stub webhook signing secret/);
    expect(result.stdout + result.stderr).not.toContain(value);
  });

  it('the generated stub signing secret passes', () => {
    const result = runScript({ envFilePath: writeEnvFile(CLEAN_STAGING_ENV) });
    expect(result.stdout).toMatch(/PASS +stub webhook signing secret/);
  });

  // A rotation left open keeps the outgoing signing secret valid indefinitely,
  // so a leaked old secret still forges deliveries. Nothing else says so on a
  // host check; it is a warning because the window is legitimate while a roll
  // is in progress.
  it('an open rotation window warns, names the command that closes it, and never prints the value', () => {
    const previous = 'whsec_outgoing_rotation_value';
    const env = `${CLEAN_STAGING_ENV}\nSTRIPE_WEBHOOK_SECRET_PREVIOUS=${previous}\n`;
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/WARN +webhook rotation window open/);
    expect(result.stdout).toContain('--complete-webhook-rotation');
    expect(result.stdout + result.stderr).not.toContain(previous);
  });

  it('no rotation warning when no previous secret is held', () => {
    const result = runScript({ envFilePath: writeEnvFile(CLEAN_STAGING_ENV) });
    expect(result.stdout).not.toMatch(/rotation window/);
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

  it('no --target → exit 2, rather than verifying an environment nobody named', () => {
    const result = spawnSync('bash', [SCRIPT], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/--target is required/);
  });

  // Defect caught: a host left on a previous base address (before the freeze,
  // across it, or across the launch apply) still answers and passes every health
  // check while building every absolute link, redirect and mail link against a
  // name that does not reach the platform. A non-empty check cannot see it.
  it('a host whose base address differs from the one the tree decides fails, naming the deploy', () => {
    const envFilePath = writeEnvFile(
      mutate(/^PUBLIC_BASE_URL=.*$/m, 'PUBLIC_BASE_URL=https://www.footbag.org'),
    );
    const result = runScript({
      envFilePath,
      extraEnv: { TF_PUBLIC_BASE_URL: 'https://preview.footbag.org' },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain(
      "FAIL  public base URL: PUBLIC_BASE_URL=https://www.footbag.org, but the tree says the platform is reached at 'https://preview.footbag.org'",
    );
    expect(result.stdout).toMatch(/Deploy staging, which syncs it/);
  });

  it('the base address the tree decides passes', () => {
    const envFilePath = writeEnvFile(
      mutate(/^PUBLIC_BASE_URL=.*$/m, 'PUBLIC_BASE_URL=https://preview.footbag.org'),
    );
    const result = runScript({
      envFilePath,
      extraEnv: { TF_PUBLIC_BASE_URL: 'https://preview.footbag.org' },
    });
    expect(result.stdout).toContain('PASS  public base URL: PUBLIC_BASE_URL=https://preview.footbag.org');
  });

  it('an unset base address fails against the tree, naming the deploy', () => {
    const envFilePath = writeEnvFile(mutate(/^PUBLIC_BASE_URL=.*\n?/m, ''));
    const result = runScript({
      envFilePath,
      extraEnv: { TF_PUBLIC_BASE_URL: 'https://staging.footbag.org' },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toMatch(/PUBLIC_BASE_URL is unset \(expected 'https:\/\/staging\.footbag\.org'\); the deploy syncs it/);
  });

  it('falls back to a presence check when the tree supplies no expectation', () => {
    // A fixture that carries no expectation, and a synthetic run must not fail
    // over one it was never given.
    const envFilePath = writeEnvFile(CLEAN_STAGING_ENV);
    const result = runScript({ envFilePath });
    expect(result.stdout).toContain('PASS  public base URL: PUBLIC_BASE_URL is set');
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

describe('verify-host-env.sh — the link-protection switches and their derived selectors', () => {
  // This script is the drift detector for exactly this pair, and until these
  // cases existed every fixture in the file happened to encode an agreeing
  // pair, so the branches that catch a disagreement had never run. A detector
  // whose detecting branch is never exercised is a detector nobody has tested.

  it('fails when screening is armed but the host runs the stub', () => {
    const env = mutate(/SAFE_BROWSING_ADAPTER=live/, 'SAFE_BROWSING_ADAPTER=stub');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(
      /FAIL +safe-browsing adapter \(screening armed\): SAFE_BROWSING_ADAPTER=stub \(expected 'live'\)/,
    );
  });

  it('fails when screening is dark but the host reaches the live API', () => {
    const env = mutate(/URL_SCREENING_ARMED=armed/, 'URL_SCREENING_ARMED=dark');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +safe-browsing adapter \(screening dark/);
    // The message says what the state means, not just that two strings differ:
    // a dark host is not screening anything a member submits.
    expect(result.stdout).toMatch(/every submitted link goes unscreened/);
  });

  it('fails when reachability is armed but the host makes no probe', () => {
    const env = mutate(/HTTP_REACHABILITY_ADAPTER=live/, 'HTTP_REACHABILITY_ADAPTER=disabled');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(
      /FAIL +HTTP reachability adapter \(reachability armed\): HTTP_REACHABILITY_ADAPTER=disabled/,
    );
  });

  it('passes when reachability is dark and the host is disabled', () => {
    const env = mutate(/REACHABILITY_ARMED=armed/, 'REACHABILITY_ARMED=dark').replace(
      'HTTP_REACHABILITY_ADAPTER=live',
      'HTTP_REACHABILITY_ADAPTER=disabled',
    );
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/PASS +HTTP reachability adapter \(reachability dark/);
  });

  it('skips the derived check when a switch is missing, and counts it as neither pass nor failure', () => {
    // The switch check already reports the fault. Reporting it twice under a
    // different name sends the reader looking for two problems, and inventing an
    // expectation for a selector with nothing to derive from is worse: before
    // this branch existed the script demanded 'live' from a host whose switch it
    // could not read, which is a failure it made up.
    const env = CLEAN_STAGING_ENV.replace(/URL_SCREENING_ARMED=armed\n/, '');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +URL screening arming switch/);
    expect(result.stdout).toMatch(
      /SKIP +safe-browsing adapter: not checkable while URL_SCREENING_ARMED is unset/,
    );
    // The skip names the remedy, and it is not "edit the host env file".
    expect(result.stdout).toMatch(/terraform apply publishes the switch, the next deploy syncs it/);
    // Exactly one failure: the missing switch. The skip added none.
    expect(result.stdout).toMatch(/Fails: +1/);
  });

  it('refuses a switch value that is neither armed nor dark', () => {
    const env = mutate(/URL_SCREENING_ARMED=armed/, 'URL_SCREENING_ARMED=on');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/FAIL +URL screening arming switch/);
  });

  it('names the owner of each class rather than telling the operator to edit the host', () => {
    // The old footer said to fix /srv/footbag/env, which for a Terraform-owned
    // value is advice that the next deploy undoes. Its replacement then named
    // the three actions of an arming change, which is the same mistake one
    // level up: an operator following a list of steps by hand is exactly how a
    // switch and its derived selector end up disagreeing. Name the script.
    const env = mutate(/URL_SCREENING_ARMED=armed/, 'URL_SCREENING_ARMED=on');
    const result = runScript({ envFilePath: writeEnvFile(env) });
    expect(result.stderr).toMatch(/Fix each at its owner before deploying/);
    expect(result.stderr).toMatch(/scripts\/arming\.sh --target <environment> --switch <name>/);
    // A derived selector is not editable at the host or in the committed file,
    // so its remedy is its switch or a redeploy. The old footer sent an operator
    // to a file that cannot change the value.
    expect(result.stderr).toMatch(/not editable here: fix its switch above, or redeploy/);
    expect(result.stderr).not.toMatch(/Fix \/srv\/footbag\/env on/);
  });
});

describe('verify-host-env.sh — every remedy it prints is a command that runs', () => {
  // The setter lost its staging default, so a remedy naming it without a target
  // exits 2 before doing anything. Four of these hints were left behind when the
  // others were updated, which is the shape this counts rather than samples.
  it('names the setter script only with a target', () => {
    const lines = readFileSync(SCRIPT, 'utf8').split('\n');
    const offenders = lines.filter(
      (line) =>
        !/^\s*#/.test(line) &&
        /set-host-env\.sh/.test(line) &&
        !/set-host-env\.sh --target/.test(line),
    );
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('verify-host-env.sh — every Terraform-published value held against Parameter Store', () => {
  // The catalogue read at test time, so a value added to it is covered here
  // without anyone extending this suite.
  const catalogue = spawnSync(
    'bash',
    [
      '-c',
      'source scripts/lib/host-values.sh; for k in $(host_values_keys param); do ' +
        'printf "%s|%s|%s\\n" "$k" "$(host_value_field "$k" source)" "$(host_value_field "$k" required)"; done',
    ],
    { encoding: 'utf-8', ...SPAWN_GUARD },
  )
    .stdout.trim()
    .split('\n')
    .map((line) => {
      const [key, source, required] = line.split('|');
      return { key, source, required };
    });

  const HOST_ENV = [
    CLEAN_STAGING_ENV,
    'SES_CONFIGURATION_SET_TRANSACTIONAL=footbag-staging-transactional',
    'SES_CONFIGURATION_SET_BULK=footbag-staging-bulk',
  ].join('\n');
  const hostValue = (env: string, key: string): string | undefined =>
    env.split('\n').find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1);

  // The listing in the shape the by-path read prints: name, a tab, the value.
  function listing(overrides: Record<string, string | null> = {}): string {
    return catalogue
      .map(({ key, source }) => {
        const value = key in overrides ? overrides[key] : hostValue(HOST_ENV, key);
        return value === null || value === undefined ? null : `/footbag/staging/${source}\t${value}`;
      })
      .filter((l): l is string => l !== null)
      .join('\n');
  }
  function runWith(env: string, published: string): RunResult {
    envFileCounter += 1;
    const publishedPath = join(tmpDir, `published-${envFileCounter}.txt`);
    writeFileSync(publishedPath, `${published}\n`);
    return runScript({
      envFilePath: writeEnvFile(env),
      extraEnv: { HOST_VALUES_PUBLISHED_FILE: publishedPath },
    });
  }

  it('reads the catalogue it compares against', () => {
    // A catalogue read that printed nothing would make every case below vacuous.
    expect(catalogue.length).toBeGreaterThan(5);
    expect(catalogue.some((c) => c.required === 'optional')).toBe(true);
  });

  // Defect caught: a value the deploy should have synced but did not, or one an
  // apply moved after the last deploy, leaves the host running configuration
  // Terraform no longer declares, and nothing else in the verifier compares it.
  it('passes each value the host holds as published, and says it read a stand-in listing', () => {
    const result = runWith(HOST_ENV, listing());
    expect(result.exitCode, result.stdout).toBe(0);
    for (const { key, source } of catalogue) {
      expect(result.stdout, key).toContain(`PASS  published at /footbag/staging/${source}: ${key}=`);
    }
    expect(result.stderr).toMatch(/SYNTHETIC: Parameter Store listing read from HOST_VALUES_PUBLISHED_FILE/);
  });

  it('fails on any one value that differs from its parameter, naming the published value', () => {
    for (const { key, source } of catalogue) {
      const result = runWith(HOST_ENV, listing({ [key]: `drifted-${key.toLowerCase()}` }));
      expect(result.exitCode, key).not.toBe(0);
      expect(result.stdout, key).toContain(
        `FAIL  published at /footbag/staging/${source}: ${key}=${hostValue(HOST_ENV, key)} (expected 'drifted-${key.toLowerCase()}')`,
      );
    }
  });

  // Defect caught: a queue removed from Terraform but still on the host keeps
  // the worker polling a queue that no longer exists.
  it('fails an optional value the host still holds after its parameter is gone, and passes it absent', () => {
    const optional = catalogue.find((c) => c.required === 'optional')!;
    const stale = runWith(HOST_ENV, listing({ [optional.key]: null }));
    expect(stale.exitCode).not.toBe(0);
    expect(stale.stdout).toContain(
      `FAIL  ${optional.key} is on the host but /footbag/staging/${optional.source} does not exist; deploy staging, which clears it`,
    );

    const cleared = HOST_ENV.split('\n').filter((l) => !l.startsWith(`${optional.key}=`)).join('\n');
    const absent = runWith(cleared, listing({ [optional.key]: null }));
    expect(absent.stdout).toContain(
      `PASS  ${optional.key} absent, as /footbag/staging/${optional.source} is unpublished`,
    );
    expect(absent.stdout).not.toContain(`FAIL  ${optional.key}`);
  });

  it('fails a required value whose parameter is missing, naming the apply', () => {
    const required = catalogue.find((c) => c.required === 'required')!;
    const result = runWith(HOST_ENV, listing({ [required.key]: null }));
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain(
      `FAIL  /footbag/staging/${required.source} does not exist; apply the staging Terraform tree`,
    );
  });

  it('a synthetic run given no listing says the comparison was skipped rather than passed', () => {
    const result = runScript({ envFilePath: writeEnvFile(HOST_ENV) });
    expect(result.stdout).toContain('SKIP  Terraform-published values: synthetic run with no Parameter Store listing');
    expect(result.stdout).not.toContain('PASS  published at');
  });
});

/**
 * Boot-time config assertions for src/config/env.ts.
 *
 * Dev↔staging adapter parity (testing rule §"Dev↔staging adapter parity"):
 * prod-mode env.ts must fail-fast at module-load with specific error messages
 * when required AWS wiring env vars are absent. These tests exercise the
 * fail-fast paths directly so a misconfigured staging host surfaces the
 * problem at container startup, not at first request.
 *
 * Pattern: vi.resetModules() between cases + fresh dynamic import of
 * ../../src/config/env so the frozen `config` singleton is re-evaluated with
 * per-case process.env overrides. Global defaults from tests/setup-env.ts
 * are explicitly deleted where a case needs "unset".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type EnvSnapshot = Record<string, string | undefined>;

function snapshotEnv(): EnvSnapshot {
  return { ...process.env };
}

function restoreEnv(snap: EnvSnapshot): void {
  for (const k of Object.keys(process.env)) delete process.env[k];
  for (const [k, v] of Object.entries(snap)) {
    if (v !== undefined) process.env[k] = v;
  }
}

function baselineRequired(): void {
  process.env.PORT = '3099';
  process.env.LOG_LEVEL = 'error';
  process.env.FOOTBAG_DB_PATH = ':memory:';
  process.env.PUBLIC_BASE_URL = 'http://localhost';
  // Valid prod SESSION_SECRET by default; specific tests override.
  process.env.SESSION_SECRET = 'a'.repeat(48);
}

function clearAwsWiring(): void {
  delete process.env.JWT_SIGNER;
  delete process.env.JWT_KMS_KEY_ID;
  delete process.env.JWT_LOCAL_KEYPAIR_PATH;
  delete process.env.SES_ADAPTER;
  delete process.env.SES_FROM_IDENTITY;
  delete process.env.SAFE_BROWSING_ADAPTER;
  delete process.env.SAFE_BROWSING_API_KEY;
  delete process.env.SECRETS_ADAPTER;
  delete process.env.FOOTBAG_ENV;
  delete process.env.HTTP_REACHABILITY_ADAPTER;
  delete process.env.ALLOW_CURATED_SIDECAR_WRITES;
  delete process.env.GALLERY_MAX_EXTERNAL_LINKS;
  delete process.env.AWS_REGION;
  delete process.env.IMAGE_PROCESSOR_URL;
  delete process.env.IMAGE_MAX_CONCURRENT;
  delete process.env.IMAGE_PORT;
  delete process.env.IMAGE_PROCESS_TIMEOUT_MS;
  delete process.env.VIDEO_PROCESSOR_URL;
  delete process.env.VIDEO_TRANSCODE_TIMEOUT_MS;
  delete process.env.MEDIA_STORAGE_ADAPTER;
  delete process.env.MEDIA_STORAGE_S3_BUCKET;
  delete process.env.MEDIA_PRESIGNED_PUT_TTL_SECONDS;
  delete process.env.MEDIA_PENDING_UPLOAD_PREFIX;
  delete process.env.WORKER_INTERNAL_PORT;
  delete process.env.WORKER_INTERNAL_URL;
  delete process.env.WEB_INTERNAL_URL;
  delete process.env.INTERNAL_EVENT_SECRET;
  delete process.env.MEDIA_JOB_LEASE_SECONDS;
  delete process.env.MEDIA_JOB_MAX_RETRIES;
  delete process.env.PAYMENT_ADAPTER;
  delete process.env.STRIPE_WEBHOOK_SECRET;
}

describe('env config: dev defaults apply when NODE_ENV is not production', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('defaults JWT_SIGNER=local, SES_ADAPTER=stub, SAFE_BROWSING_ADAPTER=stub under NODE_ENV=development', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.jwtSigner).toBe('local');
    expect(config.sesAdapter).toBe('stub');
    expect(config.safeBrowsingAdapter).toBe('stub');
  });

  it('defaults JWT_SIGNER=local and SES_ADAPTER=stub under NODE_ENV=test', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'test';
    const { config } = await import('../../src/config/env');
    expect(config.jwtSigner).toBe('local');
    expect(config.sesAdapter).toBe('stub');
  });

  it('accepts SESSION_SECRET=changeme-short outside production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.SESSION_SECRET = 'short-changeme-value';
    const { config } = await import('../../src/config/env');
    expect(config.sessionSecret).toBe('short-changeme-value');
  });
});

describe('env config: prod-mode fail-fast (staging runtime)', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('throws when JWT_SIGNER is unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /JWT_SIGNER must be set explicitly in production/,
    );
  });

  it('throws when JWT_SIGNER has an invalid value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'bogus';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /JWT_SIGNER must be 'kms' or 'local', got: bogus/,
    );
  });

  it('throws when JWT_SIGNER=kms but JWT_KMS_KEY_ID is unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'kms';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /JWT_KMS_KEY_ID is required when JWT_SIGNER=kms/,
    );
  });

  it('throws when SES_ADAPTER is unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /SES_ADAPTER must be set explicitly in production/,
    );
  });

  it('throws when SES_ADAPTER has an invalid value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'bogus';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /SES_ADAPTER must be 'live' or 'stub', got: bogus/,
    );
  });

  it('throws when SES_ADAPTER=live but SES_FROM_IDENTITY is unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'live';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.AWS_REGION = 'us-east-1';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /SES_FROM_IDENTITY is required when SES_ADAPTER=live/,
    );
  });

  it('throws when SES_ADAPTER=stub under FOOTBAG_ENV=production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.FOOTBAG_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /SES_ADAPTER must be 'live' when FOOTBAG_ENV=production/,
    );
  });

  it('throws when SES_ADAPTER=live under FOOTBAG_ENV=staging', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.FOOTBAG_ENV = 'staging';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'live';
    process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.AWS_REGION = 'us-east-1';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /SES_ADAPTER must be 'stub' when FOOTBAG_ENV=staging/,
    );
  });

  it('throws when JWT_SIGNER=kms or SES_ADAPTER=live but AWS_REGION is unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'kms';
    process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:0:key/x';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /AWS_REGION is required when JWT_SIGNER=kms/,
    );
  });

  it('throws when SESSION_SECRET is shorter than 32 characters', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.SESSION_SECRET = 'a'.repeat(31);
    await expect(import('../../src/config/env')).rejects.toThrow(
      /SESSION_SECRET must be at least 32 characters in production/,
    );
  });

  it('throws when SESSION_SECRET contains the "changeme" placeholder', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.SESSION_SECRET = 'a'.repeat(20) + 'changeme' + 'b'.repeat(20);
    await expect(import('../../src/config/env')).rejects.toThrow(
      /SESSION_SECRET appears to contain the \.env\.example placeholder/,
    );
  });

  it('loads successfully with a complete staging-style configuration', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'kms';
    process.env.JWT_KMS_KEY_ID =
      'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
    process.env.SES_ADAPTER = 'live';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.SES_FROM_IDENTITY = 'noreply@footbag.org';
    process.env.AWS_REGION = 'us-east-1';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    const { config } = await import('../../src/config/env');
    expect(config.jwtSigner).toBe('kms');
    expect(config.stripeWebhookSecret).toBe('whsec_test_live_value');
    expect(config.jwtKmsKeyId).toBe(
      'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh',
    );
    expect(config.sesAdapter).toBe('live');
    expect(config.sesFromIdentity).toBe('noreply@footbag.org');
    expect(config.awsRegion).toBe('us-east-1');
    expect(config.imageProcessorUrl).toBe('http://image:4000');
    expect(config.mediaStorageAdapter).toBe('local');
    expect(config.safeBrowsingAdapter).toBe('stub');
  });

  it('throws when SAFE_BROWSING_ADAPTER is unset in production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /SAFE_BROWSING_ADAPTER must be set explicitly in production/,
    );
  });

  it('throws when SAFE_BROWSING_ADAPTER has an invalid value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'bogus';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /SAFE_BROWSING_ADAPTER must be 'live' or 'stub', got: bogus/,
    );
  });

  it('accepts SAFE_BROWSING_ADAPTER=live without SAFE_BROWSING_API_KEY env var (key resolved via SecretsAdapter at first lookup)', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'live';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    const { config } = await import('../../src/config/env');
    expect(config.safeBrowsingAdapter).toBe('live');
    expect(config.secretsAdapter).toBe('stub');
  });

  it('throws when SECRETS_ADAPTER is unset in production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /SECRETS_ADAPTER must be set explicitly in production/,
    );
  });

  it('throws on invalid SECRETS_ADAPTER value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.SECRETS_ADAPTER = 'aws-secrets-manager';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /SECRETS_ADAPTER must be 'live', 'stub', or 'local'/,
    );
  });

  it("defaults SECRETS_ADAPTER to 'local' outside production", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.secretsAdapter).toBe('local');
  });

  it('throws when SECRETS_ADAPTER=live but FOOTBAG_ENV is unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_ENV is required when SECRETS_ADAPTER=live/,
    );
  });

  it('derives ssmPrefix from FOOTBAG_ENV when SECRETS_ADAPTER=live', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'staging';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    const { config } = await import('../../src/config/env');
    expect(config.footbagEnv).toBe('staging');
    expect(config.ssmPrefix).toBe('/footbag/staging');
  });

  it('throws on invalid FOOTBAG_ENV value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FOOTBAG_ENV = 'qa';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_ENV must be 'staging', 'production', or 'development'/,
    );
  });

  it('throws when IMAGE_PROCESSOR_URL is unset in production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /IMAGE_PROCESSOR_URL must be set explicitly in production/,
    );
  });


  it('throws when FOOTBAG_DEV_ADMIN_GRANT_TIER2=1 with FOOTBAG_ENV=staging', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'staging';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.FOOTBAG_DEV_ADMIN_GRANT_TIER2 = '1';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_DEV_ADMIN_GRANT_TIER2 is dev-only/,
    );
  });

  it('throws when FOOTBAG_DEV_ADMIN_GRANT_TIER2=1 with FOOTBAG_ENV unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    delete process.env.FOOTBAG_ENV;
    process.env.FOOTBAG_DEV_ADMIN_GRANT_TIER2 = '1';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_DEV_ADMIN_GRANT_TIER2 is dev-only/,
    );
  });

  it('accepts FOOTBAG_DEV_ADMIN_GRANT_TIER2=1 when FOOTBAG_ENV=development', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FOOTBAG_ENV = 'development';
    process.env.FOOTBAG_DEV_ADMIN_GRANT_TIER2 = '1';
    const { config } = await import('../../src/config/env');
    expect(config.devAdminGrantTier2).toBe(true);
  });

  it('accepts FOOTBAG_DEV_ADMIN_GRANT_TIER2=true', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FOOTBAG_ENV = 'development';
    process.env.FOOTBAG_DEV_ADMIN_GRANT_TIER2 = 'true';
    const { config } = await import('../../src/config/env');
    expect(config.devAdminGrantTier2).toBe(true);
  });

  it('FOOTBAG_DEV_ADMIN_GRANT_TIER2=0 parses as false (no fail-fast in non-dev)', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'staging';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.FOOTBAG_DEV_ADMIN_GRANT_TIER2 = '0';
    const { config } = await import('../../src/config/env');
    expect(config.devAdminGrantTier2).toBe(false);
  });

  it('FOOTBAG_DEV_ADMIN_GRANT_TIER2=false parses as false', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FOOTBAG_ENV = 'development';
    process.env.FOOTBAG_DEV_ADMIN_GRANT_TIER2 = 'false';
    const { config } = await import('../../src/config/env');
    expect(config.devAdminGrantTier2).toBe(false);
  });

  it('defaults FOOTBAG_DEV_ADMIN_GRANT_TIER2 to false when unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    delete process.env.FOOTBAG_DEV_ADMIN_GRANT_TIER2;
    const { config } = await import('../../src/config/env');
    expect(config.devAdminGrantTier2).toBe(false);
  });

  it('rejects FOOTBAG_DEV_ADMIN_GRANT_TIER2 with an invalid value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FOOTBAG_DEV_ADMIN_GRANT_TIER2 = 'maybe';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_DEV_ADMIN_GRANT_TIER2 must be/,
    );
  });

  it("defaults PAYMENT_ADAPTER to 'stub' in non-production", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    delete process.env.PAYMENT_ADAPTER;
    const { config } = await import('../../src/config/env');
    expect(config.paymentAdapter).toBe('stub');
  });

  it("accepts PAYMENT_ADAPTER='stub' in development", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.PAYMENT_ADAPTER = 'stub';
    const { config } = await import('../../src/config/env');
    expect(config.paymentAdapter).toBe('stub');
  });

  it("accepts PAYMENT_ADAPTER='live' in non-production (factory throws at call time, not at boot)", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    const { config } = await import('../../src/config/env');
    expect(config.paymentAdapter).toBe('live');
  });

  it("rejects PAYMENT_ADAPTER='stub' in production", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'live';
    process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
    process.env.AWS_REGION = 'us-east-1';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'production';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'stub';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /PAYMENT_ADAPTER='stub' is forbidden in production/,
    );
  });

  it("accepts PAYMENT_ADAPTER='stub' under FOOTBAG_ENV=staging (staging pins NODE_ENV=production but runs the stub)", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.FOOTBAG_ENV = 'staging';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'stub';
    const { config } = await import('../../src/config/env');
    expect(config.paymentAdapter).toBe('stub');
  });

  it('rejects PAYMENT_ADAPTER with an invalid value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.PAYMENT_ADAPTER = 'maybe';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /PAYMENT_ADAPTER must be 'live' or 'stub'/,
    );
  });

  it('requires PAYMENT_ADAPTER to be set explicitly in production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'live';
    process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
    process.env.AWS_REGION = 'us-east-1';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'production';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    delete process.env.PAYMENT_ADAPTER;
    await expect(import('../../src/config/env')).rejects.toThrow(
      /PAYMENT_ADAPTER must be set explicitly in production/,
    );
  });

  it("requires STRIPE_WEBHOOK_SECRET when PAYMENT_ADAPTER='live'", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'live';
    process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
    process.env.AWS_REGION = 'us-east-1';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'production';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    delete process.env.STRIPE_WEBHOOK_SECRET;
    await expect(import('../../src/config/env')).rejects.toThrow(
      /STRIPE_WEBHOOK_SECRET is required/,
    );
  });

  it('rejects a whsec_stub-prefixed STRIPE_WEBHOOK_SECRET in production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'live';
    process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
    process.env.AWS_REGION = 'us-east-1';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'production';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stub_0000000000000000000000000000';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /must not be a stub secret in production/,
    );
  });

  it("does not require STRIPE_WEBHOOK_SECRET when PAYMENT_ADAPTER='stub'", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.PAYMENT_ADAPTER = 'stub';
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { config } = await import('../../src/config/env');
    expect(config.paymentAdapter).toBe('stub');
    expect(config.stripeWebhookSecret).toBeUndefined();
  });

  it("loads with a valid live STRIPE_WEBHOOK_SECRET", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'live';
    process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
    process.env.AWS_REGION = 'us-east-1';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'production';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live_realvalue';
    const { config } = await import('../../src/config/env');
    expect(config.stripeWebhookSecret).toBe('whsec_live_realvalue');
  });

  // Regression for B9: FOOTBAG_TEST_MEMORY_PERCENT was read via process.env
  // inside operationsPlatformService, ungated. An env injection in production
  // could forge anonymous /health/ready readings. The new boot-time guard
  // refuses production start when this var is set; tests and staging
  // operators retain the override.

  it('parses FOOTBAG_TEST_MEMORY_PERCENT as a number under FOOTBAG_ENV=development', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FOOTBAG_ENV = 'development';
    process.env.FOOTBAG_TEST_MEMORY_PERCENT = '42';
    const { config } = await import('../../src/config/env');
    expect(config.testMemoryPercent).toBe(42);
  });

  it("parses FOOTBAG_TEST_MEMORY_PERCENT='null' to null", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FOOTBAG_TEST_MEMORY_PERCENT = 'null';
    const { config } = await import('../../src/config/env');
    expect(config.testMemoryPercent).toBeNull();
  });

  it('defaults FOOTBAG_TEST_MEMORY_PERCENT to undefined when unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    delete process.env.FOOTBAG_TEST_MEMORY_PERCENT;
    const { config } = await import('../../src/config/env');
    expect(config.testMemoryPercent).toBeUndefined();
  });

  it('rejects FOOTBAG_TEST_MEMORY_PERCENT with a non-numeric value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FOOTBAG_TEST_MEMORY_PERCENT = 'not-a-number';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_TEST_MEMORY_PERCENT must be a finite number/,
    );
  });

  it('throws when FOOTBAG_TEST_MEMORY_PERCENT is set with FOOTBAG_ENV=production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'live';
    process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
    process.env.AWS_REGION = 'us-east-1';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'production';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.FOOTBAG_TEST_MEMORY_PERCENT = '5';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_TEST_MEMORY_PERCENT is dev\/staging-only; refusing production start/,
    );
  });

  it('accepts FOOTBAG_TEST_MEMORY_PERCENT under FOOTBAG_ENV=staging', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'staging';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.FOOTBAG_TEST_MEMORY_PERCENT = '85';
    const { config } = await import('../../src/config/env');
    expect(config.testMemoryPercent).toBe(85);
  });

  // Production-env fail-fast for every dev-only flag. The staging-env cases
  // above cover the dev/staging boundary; these cases lock production as the
  // highest-stakes refusal. A regression that quietly removed any of these
  // guards would let a dev shortcut land on a prod host.


  it('throws when FOOTBAG_DEV_ADMIN_GRANT_TIER2=1 with FOOTBAG_ENV=production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'live';
    process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
    process.env.AWS_REGION = 'us-east-1';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'production';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.FOOTBAG_DEV_ADMIN_GRANT_TIER2 = '1';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_DEV_ADMIN_GRANT_TIER2 is dev-only/,
    );
  });

  it('throws when FOOTBAG_DEV_INITIAL_ADMIN_EMAILS is non-empty with FOOTBAG_ENV=production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'live';
    process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
    process.env.AWS_REGION = 'us-east-1';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'production';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.FOOTBAG_DEV_INITIAL_ADMIN_EMAILS = 'someone@example.com';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_DEV_INITIAL_ADMIN_EMAILS is dev\/staging-only/,
    );
  });

  it('accepts FOOTBAG_DEV_INITIAL_ADMIN_EMAILS in staging (dev/staging shortcut path)', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'staging';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.FOOTBAG_DEV_INITIAL_ADMIN_EMAILS = 'someone@example.com';
    // Boot succeeds; the allowlist value reaches devShortcuts at runtime.
    await expect(import('../../src/config/env')).resolves.toBeDefined();
  });

  it('FOOTBAG_DEV_INITIAL_ADMIN_EMAILS empty/whitespace does not trigger prod fail-fast', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'live';
    process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
    process.env.AWS_REGION = 'us-east-1';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'production';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.FOOTBAG_DEV_INITIAL_ADMIN_EMAILS = '   ';
    // Empty/whitespace value is treated as unset (deploy pipeline writes an
    // empty value when the workstation's .local/initial-admins.txt is empty;
    // that must not fail-fast a prod boot, only a non-empty value would).
    await expect(import('../../src/config/env')).resolves.toBeDefined();
  });

  it('throws when FOOTBAG_DEV_INITIAL_ADMIN_EMAILS is non-empty with FOOTBAG_ENV unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    // SECRETS_ADAPTER=stub so we don't trip the unrelated 'live requires
    // FOOTBAG_ENV' guard before reaching the dev-emails check.
    process.env.SECRETS_ADAPTER = 'stub';
    // FOOTBAG_ENV intentionally left unset (clearAwsWiring deleted it).
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.FOOTBAG_DEV_INITIAL_ADMIN_EMAILS = 'someone@example.com';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_DEV_INITIAL_ADMIN_EMAILS is dev\/staging-only/,
    );
  });
});

describe('env config: FOOTBAG_ENV ↔ NODE_ENV cross-invariant', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('throws when FOOTBAG_ENV=staging with NODE_ENV=development', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FOOTBAG_ENV = 'staging';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_ENV=staging requires NODE_ENV=production/,
    );
  });

  it('throws when FOOTBAG_ENV=production with NODE_ENV=development', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FOOTBAG_ENV = 'production';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_ENV=production requires NODE_ENV=production/,
    );
  });

  it('throws when FOOTBAG_ENV=staging with NODE_ENV=test', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'test';
    process.env.FOOTBAG_ENV = 'staging';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_ENV=staging requires NODE_ENV=production/,
    );
  });

  it('accepts FOOTBAG_ENV=staging with NODE_ENV=production (positive boundary)', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.FOOTBAG_ENV = 'staging';
    const { config } = await import('../../src/config/env');
    expect(config.footbagEnv).toBe('staging');
    expect(config.nodeEnv).toBe('production');
  });

  it('accepts FOOTBAG_ENV=development with NODE_ENV=test (positive boundary for dev path)', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'test';
    process.env.FOOTBAG_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.footbagEnv).toBe('development');
    expect(config.nodeEnv).toBe('test');
  });

  it('accepts FOOTBAG_ENV unset with any NODE_ENV (no cross-invariant when env unset)', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    delete process.env.FOOTBAG_ENV;
    const { config } = await import('../../src/config/env');
    expect(config.footbagEnv).toBeUndefined();
  });
});

describe('env config: MEDIA_STORAGE_*', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('defaults to local when unset outside production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.mediaStorageAdapter).toBe('local');
    expect(config.mediaStorageS3Bucket).toBeUndefined();
  });

  it('defaults mediaDir and curatedMediaDir to the two separate local lanes', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    delete process.env.FOOTBAG_MEDIA_DIR;
    delete process.env.FOOTBAG_CURATED_MEDIA_DIR;
    const { config } = await import('../../src/config/env');
    expect(config.mediaDir).toBe('./s3-adapter-local');
    expect(config.curatedMediaDir).toBe('./.curated-build');
  });

  it('honors FOOTBAG_MEDIA_DIR and FOOTBAG_CURATED_MEDIA_DIR overrides independently', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FOOTBAG_MEDIA_DIR = '/tmp/uploads-lane';
    process.env.FOOTBAG_CURATED_MEDIA_DIR = '/tmp/curated-lane';
    const { config } = await import('../../src/config/env');
    expect(config.mediaDir).toBe('/tmp/uploads-lane');
    expect(config.curatedMediaDir).toBe('/tmp/curated-lane');
  });

  it('throws when MEDIA_STORAGE_ADAPTER is unset in production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /MEDIA_STORAGE_ADAPTER must be set explicitly in production/,
    );
  });

  it('throws on invalid MEDIA_STORAGE_ADAPTER value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_STORAGE_ADAPTER = 'gcs';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /MEDIA_STORAGE_ADAPTER must be 's3' or 'local', got: gcs/,
    );
  });

  it('throws when MEDIA_STORAGE_ADAPTER=s3 but MEDIA_STORAGE_S3_BUCKET is unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_STORAGE_ADAPTER = 's3';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.AWS_REGION = 'us-east-1';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /MEDIA_STORAGE_S3_BUCKET is required when MEDIA_STORAGE_ADAPTER=s3/,
    );
  });

  it('throws when MEDIA_STORAGE_ADAPTER=s3 but AWS_REGION is unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_STORAGE_ADAPTER = 's3';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.MEDIA_STORAGE_S3_BUCKET = 'media-bucket-1';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /AWS_REGION is required.*MEDIA_STORAGE_ADAPTER=s3/,
    );
  });

  it('accepts an explicit local configuration', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    const { config } = await import('../../src/config/env');
    expect(config.mediaStorageAdapter).toBe('local');
    expect(config.mediaStorageS3Bucket).toBeUndefined();
  });

  it('accepts a fully-populated s3 configuration', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 's3';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.MEDIA_STORAGE_S3_BUCKET = 'footbag-staging-media';
    process.env.AWS_REGION = 'us-east-1';
    process.env.INTERNAL_EVENT_SECRET = 'a'.repeat(48);
    const { config } = await import('../../src/config/env');
    expect(config.mediaStorageAdapter).toBe('s3');
    expect(config.mediaStorageS3Bucket).toBe('footbag-staging-media');
    expect(config.awsRegion).toBe('us-east-1');
  });

  it('throws when MEDIA_STORAGE_ADAPTER=s3 but INTERNAL_EVENT_SECRET is unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 's3';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.MEDIA_STORAGE_S3_BUCKET = 'footbag-staging-media';
    process.env.AWS_REGION = 'us-east-1';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /INTERNAL_EVENT_SECRET is required when MEDIA_STORAGE_ADAPTER=s3/,
    );
  });

  it('defaults INTERNAL_EVENT_SECRET in dev so web + image worker share a token without operator config', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.internalEventSecret).toBe('dev-internal-event-secret-not-for-prod');
  });

  it('honors an explicit INTERNAL_EVENT_SECRET over the dev default', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.INTERNAL_EVENT_SECRET = 'operator-supplied-token';
    const { config } = await import('../../src/config/env');
    expect(config.internalEventSecret).toBe('operator-supplied-token');
  });

  it('does NOT default INTERNAL_EVENT_SECRET in production with local storage', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    const { config } = await import('../../src/config/env');
    expect(config.internalEventSecret).toBeUndefined();
  });
});

describe('env config: MEDIA_PRESIGNED_PUT_TTL_SECONDS and MEDIA_PENDING_UPLOAD_PREFIX', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('uses defaults when unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.mediaPresignedPutTtlSeconds).toBe(900);
    expect(config.mediaPendingUploadPrefix).toBe('pending/');
  });

  it('honors MEDIA_PRESIGNED_PUT_TTL_SECONDS within range', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_PRESIGNED_PUT_TTL_SECONDS = '1800';
    const { config } = await import('../../src/config/env');
    expect(config.mediaPresignedPutTtlSeconds).toBe(1800);
  });

  it('throws when MEDIA_PRESIGNED_PUT_TTL_SECONDS is below the floor', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_PRESIGNED_PUT_TTL_SECONDS = '30';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /MEDIA_PRESIGNED_PUT_TTL_SECONDS must be between 60 and 3600/,
    );
  });

  it('throws when MEDIA_PRESIGNED_PUT_TTL_SECONDS exceeds the ceiling', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_PRESIGNED_PUT_TTL_SECONDS = '7200';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /MEDIA_PRESIGNED_PUT_TTL_SECONDS must be between 60 and 3600/,
    );
  });

  it('throws when MEDIA_PRESIGNED_PUT_TTL_SECONDS is non-numeric', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_PRESIGNED_PUT_TTL_SECONDS = 'never';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /MEDIA_PRESIGNED_PUT_TTL_SECONDS must be a positive integer/,
    );
  });

  it('honors MEDIA_PENDING_UPLOAD_PREFIX when valid', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_PENDING_UPLOAD_PREFIX = 'staging_pending/';
    const { config } = await import('../../src/config/env');
    expect(config.mediaPendingUploadPrefix).toBe('staging_pending/');
  });

  it('rejects MEDIA_PENDING_UPLOAD_PREFIX without a trailing slash', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_PENDING_UPLOAD_PREFIX = 'pending';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /MEDIA_PENDING_UPLOAD_PREFIX must match \[a-z0-9_\]\+\//,
    );
  });

  it('rejects MEDIA_PENDING_UPLOAD_PREFIX with disallowed characters', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.MEDIA_PENDING_UPLOAD_PREFIX = 'Up/Loads/';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /MEDIA_PENDING_UPLOAD_PREFIX must match \[a-z0-9_\]\+\//,
    );
  });
});

describe('env config: IMAGE_* parsing and defaults', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('uses dev defaults when IMAGE_* vars are unset outside production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.imageProcessorUrl).toBe('http://localhost:4001');
    expect(config.imageMaxConcurrent).toBe(2);
    expect(config.imagePort).toBe(4000);
    expect(config.imageProcessTimeoutMs).toBe(30000);
  });

  it('honors IMAGE_PROCESSOR_URL when set', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    const { config } = await import('../../src/config/env');
    expect(config.imageProcessorUrl).toBe('http://image:4000');
  });

  it('throws when IMAGE_MAX_CONCURRENT is non-numeric', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.IMAGE_MAX_CONCURRENT = 'abc';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /IMAGE_MAX_CONCURRENT must be a positive integer/,
    );
  });

  it('throws when IMAGE_MAX_CONCURRENT is out of range', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.IMAGE_MAX_CONCURRENT = '99';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /IMAGE_MAX_CONCURRENT must be between 1 and 16/,
    );
  });

  it('throws when IMAGE_PORT is non-numeric', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.IMAGE_PORT = 'not-a-port';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /IMAGE_PORT must be a positive integer/,
    );
  });

  it('throws when IMAGE_PORT is out of range', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.IMAGE_PORT = '99999';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /IMAGE_PORT must be between 1 and 65535/,
    );
  });

  it('throws when IMAGE_PROCESS_TIMEOUT_MS is non-numeric', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.IMAGE_PROCESS_TIMEOUT_MS = 'never';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /IMAGE_PROCESS_TIMEOUT_MS must be a positive integer/,
    );
  });

  it('parses valid IMAGE_* integers', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.IMAGE_MAX_CONCURRENT = '5';
    process.env.IMAGE_PORT = '4500';
    process.env.IMAGE_PROCESS_TIMEOUT_MS = '15000';
    const { config } = await import('../../src/config/env');
    expect(config.imageMaxConcurrent).toBe(5);
    expect(config.imagePort).toBe(4500);
    expect(config.imageProcessTimeoutMs).toBe(15000);
  });
});

describe('env config: VIDEO_* parsing and defaults', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('falls back videoProcessorUrl to imageProcessorUrl when VIDEO_PROCESSOR_URL is unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    const { config } = await import('../../src/config/env');
    expect(config.videoProcessorUrl).toBe('http://image:4000');
  });

  it('honors VIDEO_PROCESSOR_URL when set independently', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.VIDEO_PROCESSOR_URL = 'http://video:4002';
    const { config } = await import('../../src/config/env');
    expect(config.videoProcessorUrl).toBe('http://video:4002');
  });

  it('inherits the dev fallback when neither var is set', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.videoProcessorUrl).toBe('http://localhost:4001');
  });

  it('throws via IMAGE_PROCESSOR_URL when both are unset in production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /IMAGE_PROCESSOR_URL must be set explicitly in production/,
    );
  });

  it('uses default videoTranscodeTimeoutMs when unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.videoTranscodeTimeoutMs).toBe(300000);
  });

  it('parses valid VIDEO_TRANSCODE_TIMEOUT_MS', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.VIDEO_TRANSCODE_TIMEOUT_MS = '600000';
    const { config } = await import('../../src/config/env');
    expect(config.videoTranscodeTimeoutMs).toBe(600000);
  });

  it('throws when VIDEO_TRANSCODE_TIMEOUT_MS is non-numeric', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.VIDEO_TRANSCODE_TIMEOUT_MS = 'forever';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /VIDEO_TRANSCODE_TIMEOUT_MS must be a positive integer/,
    );
  });

  it('throws when VIDEO_TRANSCODE_TIMEOUT_MS is out of range', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.VIDEO_TRANSCODE_TIMEOUT_MS = '99999999';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /VIDEO_TRANSCODE_TIMEOUT_MS must be between 1 and 1800000/,
    );
  });
});

describe('env config: PORT validation', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('throws on non-numeric PORT', async () => {
    baselineRequired();
    process.env.NODE_ENV = 'development';
    process.env.PORT = 'not-a-port';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /PORT must be a valid integer between 1 and 65535/,
    );
  });

  it('throws on out-of-range PORT', async () => {
    baselineRequired();
    process.env.NODE_ENV = 'development';
    process.env.PORT = '99999';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /PORT must be a valid integer between 1 and 65535/,
    );
  });
});

describe('env config: HTTP_REACHABILITY_ADAPTER', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('defaults to stub under NODE_ENV=development', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.httpReachabilityAdapter).toBe('stub');
  });

  it('throws when unset in production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /HTTP_REACHABILITY_ADAPTER must be set explicitly in production/,
    );
  });

  it('throws when set to an invalid value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'bogus';
    process.env.SECRETS_ADAPTER = 'stub';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /HTTP_REACHABILITY_ADAPTER must be 'live', 'stub', or 'disabled', got: bogus/,
    );
  });

  it('accepts each of live, stub, disabled', async () => {
    for (const value of ['live', 'stub', 'disabled'] as const) {
      vi.resetModules();
      baselineRequired();
      clearAwsWiring();
      process.env.NODE_ENV = 'production';
      process.env.JWT_SIGNER = 'local';
      process.env.SES_ADAPTER = 'stub';
      process.env.SAFE_BROWSING_ADAPTER = 'stub';
      process.env.HTTP_REACHABILITY_ADAPTER = value;
      process.env.SECRETS_ADAPTER = 'stub';
      process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
      process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
      const { config } = await import('../../src/config/env');
      expect(config.httpReachabilityAdapter).toBe(value);
    }
  });
});

describe('env config: ALLOW_CURATED_SIDECAR_WRITES', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('defaults to true under NODE_ENV=development', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.allowCuratedSidecarWrites).toBe(true);
  });

  it('defaults to false under NODE_ENV=test', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'test';
    const { config } = await import('../../src/config/env');
    expect(config.allowCuratedSidecarWrites).toBe(false);
  });

  it('defaults to false under NODE_ENV=production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'disabled';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    const { config } = await import('../../src/config/env');
    expect(config.allowCuratedSidecarWrites).toBe(false);
  });

  it('honors explicit override to true even in production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    process.env.SES_ADAPTER = 'stub';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'disabled';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.ALLOW_CURATED_SIDECAR_WRITES = '1';
    const { config } = await import('../../src/config/env');
    expect(config.allowCuratedSidecarWrites).toBe(true);
  });

  it('honors explicit override to false in development', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_CURATED_SIDECAR_WRITES = '0';
    const { config } = await import('../../src/config/env');
    expect(config.allowCuratedSidecarWrites).toBe(false);
  });

  it('throws on invalid value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_CURATED_SIDECAR_WRITES = 'bogus';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /ALLOW_CURATED_SIDECAR_WRITES must be '1', '0', 'true', or 'false', got: bogus/,
    );
  });
});

describe('env config: GALLERY_MAX_EXTERNAL_LINKS', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('defaults to 1 when unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.galleryMaxExternalLinks).toBe(1);
  });

  it('honors operator override', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.GALLERY_MAX_EXTERNAL_LINKS = '5';
    const { config } = await import('../../src/config/env');
    expect(config.galleryMaxExternalLinks).toBe(5);
  });

  it('rejects non-integer override', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.GALLERY_MAX_EXTERNAL_LINKS = 'abc';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /GALLERY_MAX_EXTERNAL_LINKS must be a non-negative integer/,
    );
  });

  it('rejects out-of-range override', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.GALLERY_MAX_EXTERNAL_LINKS = '999';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /GALLERY_MAX_EXTERNAL_LINKS must be between 0 and 100/,
    );
  });
});

describe('env config: FOOTBAG_CHEAP_PASSWORD_HASH (test-only, VITEST-gated)', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('defaults to strong (useCheapPasswordHash false) when unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    delete process.env.FOOTBAG_CHEAP_PASSWORD_HASH;
    const { config } = await import('../../src/config/env');
    expect(config.useCheapPasswordHash).toBe(false);
  });

  it("treats '0' as strong", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FOOTBAG_CHEAP_PASSWORD_HASH = '0';
    const { config } = await import('../../src/config/env');
    expect(config.useCheapPasswordHash).toBe(false);
  });

  it("honours '1' when running under the Vitest runner (process.env.VITEST set)", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    // VITEST is set by the runner; assert the precondition the guard relies on.
    expect(process.env.VITEST).toBeTruthy();
    process.env.FOOTBAG_CHEAP_PASSWORD_HASH = '1';
    const { config } = await import('../../src/config/env');
    expect(config.useCheapPasswordHash).toBe(true);
  });

  it("refuses '1' when process.env.VITEST is unset (cannot weaken hashing in a real process)", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    delete process.env.VITEST;
    process.env.FOOTBAG_CHEAP_PASSWORD_HASH = '1';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_CHEAP_PASSWORD_HASH is a test-only switch.*refused outside the Vitest runner/,
    );
  });

  it('throws on an invalid value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FOOTBAG_CHEAP_PASSWORD_HASH = 'maybe';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_CHEAP_PASSWORD_HASH must be '1', '0', 'true', or 'false', got: maybe/,
    );
  });
});

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
  // Always required (the /ipc router is always mounted); valid by default
  // so configurations load. The dedicated required-when-unset tests delete it.
  process.env.INTERNAL_EVENT_SECRET = 'c'.repeat(48);
  // Arming switches, mandatory-explicit under prod-mode boots; 'armed' is
  // valid in every environment. The dedicated unset/dark cases delete or
  // override them.
  process.env.PAYMENTS_ARMED = 'armed';
  process.env.EMAIL_SEND_ARMED = 'armed';
  // Mandatory-explicit under prod-mode boots like the sibling adapter
  // selectors; stub is valid everywhere except FOOTBAG_ENV=production.
  // The dedicated default/unset cases delete it.
  process.env.CAPTCHA_ADAPTER = 'stub';
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
  delete process.env.ARCHIVE_URL;
  delete process.env.ARCHIVE_LOGIN_REDIRECT;
  delete process.env.ARCHIVE_COOKIE_SIGNER;
  delete process.env.ARCHIVE_KEY_PAIR_ID;
  delete process.env.ARCHIVE_SIGNING_KEY_PATH;
  delete process.env.ARCHIVE_COOKIE_DOMAIN;
  delete process.env.CURATED_ROOT_DIR;
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
  delete process.env.MEDIA_JOB_LEASE_SECONDS;
  delete process.env.MEDIA_JOB_MAX_RETRIES;
  delete process.env.FFMPEG_TIMEOUT_SECONDS;
  delete process.env.VIDEO_MAX_BYTES;
  delete process.env.VIDEO_MAX_HEIGHT;
  delete process.env.PAYMENT_ADAPTER;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET_PREVIOUS;
  delete process.env.STRIPE_WEBHOOK_SECRET_STUB;
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

  it('loads with no port, base URL or database path set, so a checkout with no environment file runs', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    delete process.env.PORT;
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.FOOTBAG_DB_PATH;
    const { config } = await import('../../src/config/env');
    expect(config.port).toBe(3000);
    expect(config.publicBaseUrl).toBe('http://localhost:3000');
    expect(config.dbPath).toBe('./database/footbag.db');
  });

  it('lets an explicit port, base URL and database path win over the development defaults', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.PORT = '3456';
    process.env.PUBLIC_BASE_URL = 'http://localhost:3456';
    process.env.FOOTBAG_DB_PATH = '/tmp/footbag-test-explicit.db';
    const { config } = await import('../../src/config/env');
    expect(config.port).toBe(3456);
    expect(config.publicBaseUrl).toBe('http://localhost:3456');
    expect(config.dbPath).toBe('/tmp/footbag-test-explicit.db');
  });

  it('accepts SESSION_SECRET=changeme-short outside production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.SESSION_SECRET = 'short-changeme-value';
    const { config } = await import('../../src/config/env');
    expect(config.sessionSecret).toBe('short-changeme-value');
  });

  it('defaults CAPTCHA_ADAPTER=stub and turnstileSiteKey=null', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    delete process.env.CAPTCHA_ADAPTER;
    delete process.env.TURNSTILE_SITE_KEY;
    const { config } = await import('../../src/config/env');
    expect(config.captchaAdapter).toBe('stub');
    expect(config.turnstileSiteKey).toBeNull();
  });

  it('throws when CAPTCHA_ADAPTER has an invalid value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.CAPTCHA_ADAPTER = 'bogus';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /CAPTCHA_ADAPTER must be 'live' or 'stub', got: bogus/,
    );
  });

  it('throws when CAPTCHA_ADAPTER=live but TURNSTILE_SITE_KEY is unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.CAPTCHA_ADAPTER = 'live';
    delete process.env.TURNSTILE_SITE_KEY;
    await expect(import('../../src/config/env')).rejects.toThrow(
      /TURNSTILE_SITE_KEY is required when CAPTCHA_ADAPTER=live/,
    );
  });

  it('loads live captcha config when TURNSTILE_SITE_KEY is set', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.CAPTCHA_ADAPTER = 'live';
    process.env.TURNSTILE_SITE_KEY = '0xSITEKEY';
    const { config } = await import('../../src/config/env');
    expect(config.captchaAdapter).toBe('live');
    expect(config.turnstileSiteKey).toBe('0xSITEKEY');
  });

  it('throws when CAPTCHA_ADAPTER is stub under FOOTBAG_ENV=production', async () => {
    // The stub answers "you are human" for every request, so a production
    // boot carrying the stub must fail at startup, not run login and
    // registration with no CAPTCHA.
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.FOOTBAG_ENV = 'production';
    process.env.JWT_SIGNER = 'kms';
    process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
    process.env.SES_ADAPTER = 'live';
    process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
    process.env.AWS_REGION = 'us-east-1';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'stub';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
    process.env.CAPTCHA_ADAPTER = 'stub';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /CAPTCHA_ADAPTER must be 'live' when FOOTBAG_ENV=production/,
    );
  });

  it('accepts an explicit captcha stub under FOOTBAG_ENV=staging (prod-mode)', async () => {
    // Staging runs prod-mode for hardening parity but stays on the stub by
    // design; the production CAPTCHA gate must not fire there.
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
    process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_staging_generated_value';
    process.env.CAPTCHA_ADAPTER = 'stub';
    const { config } = await import('../../src/config/env');
    expect(config.captchaAdapter).toBe('stub');
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

  it.each(['PORT', 'PUBLIC_BASE_URL', 'FOOTBAG_DB_PATH'])(
    'throws when %s is unset, so the development default cannot mask a host the deploy failed to configure',
    async (name) => {
      baselineRequired();
      clearAwsWiring();
      process.env.NODE_ENV = 'production';
      // A prod-mode boot demands every adapter selector be explicit, and each is
      // read before the three values under test, so the whole shape is set here
      // to let the boot reach the assertion.
      process.env.JWT_SIGNER = 'kms';
      process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
      process.env.AWS_REGION = 'us-east-1';
      process.env.SES_ADAPTER = 'stub';
      process.env.SAFE_BROWSING_ADAPTER = 'stub';
      process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
      process.env.SECRETS_ADAPTER = 'stub';
      process.env.FOOTBAG_ENV = 'staging';
      process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
      process.env.MEDIA_STORAGE_ADAPTER = 'local';
      process.env.CAPTCHA_ADAPTER = 'stub';
      process.env.PAYMENT_ADAPTER = 'stub';
      process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_staging_generated_value';
      delete process.env[name];
      await expect(import('../../src/config/env')).rejects.toThrow(
        new RegExp(`Missing required environment variable: ${name}`),
      );
    },
  );

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
    process.env.JWT_SIGNER = 'kms';
    process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
    process.env.AWS_REGION = 'us-east-1';
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

  function validProdWiring(): void {
    // Full valid prod wiring so the earlier fail-fasts (JWT, SES, adapters)
    // pass and the import reaches the trust-proxy parsing.
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
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
  }

  it('prod-mode boot parses an integer TRUST_PROXY hop count', async () => {
    baselineRequired();
    clearAwsWiring();
    validProdWiring();
    process.env.TRUST_PROXY = '3';
    const { config } = await import('../../src/config/env');
    expect(config.trustProxy).toBe(3);
  });

  it('prod-mode unset TRUST_PROXY falls back to the fail-closed named ranges', async () => {
    baselineRequired();
    clearAwsWiring();
    validProdWiring();
    delete process.env.TRUST_PROXY;
    const { config } = await import('../../src/config/env');
    expect(config.trustProxy).toBe('loopback, linklocal, uniquelocal');
  });

  it('non-prod TRUST_PROXY defaults to 0 when unset and passes named values through', async () => {
    baselineRequired();
    clearAwsWiring();
    delete process.env.TRUST_PROXY;
    process.env.NODE_ENV = 'development';
    const first = await import('../../src/config/env');
    expect(first.config.trustProxy).toBe(0);

    vi.resetModules();
    baselineRequired();
    clearAwsWiring();
    process.env.TRUST_PROXY = 'loopback';
    process.env.NODE_ENV = 'development';
    const second = await import('../../src/config/env');
    expect(second.config.trustProxy).toBe('loopback');
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
      /SECRETS_ADAPTER must be 'live' or 'stub'/,
    );
  });

  it("defaults SECRETS_ADAPTER to 'stub' outside production", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.secretsAdapter).toBe('stub');
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
    process.env.AWS_REGION = 'us-east-1';
    process.env.FOOTBAG_ENV = 'staging';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'stub';
    process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_staging_generated_value';
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

  it("accepts PAYMENT_ADAPTER='live' when FOOTBAG_ENV is unset (bare test boots; deployed non-production environments refuse it)", async () => {
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
    process.env.JWT_SIGNER = 'kms';
    process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
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
    process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_staging_generated_value';
    const { config } = await import('../../src/config/env');
    expect(config.paymentAdapter).toBe('stub');
  });

  // The stub adapter's fallback signing secret is committed source. A staging
  // host that kept it would accept a webhook forged by anyone holding a copy of
  // the repository, so staging must carry its own generated value.
  it('requires STRIPE_WEBHOOK_SECRET_STUB when staging runs the stub adapter', async () => {
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
    delete process.env.STRIPE_WEBHOOK_SECRET_STUB;
    await expect(import('../../src/config/env')).rejects.toThrow(
      /STRIPE_WEBHOOK_SECRET_STUB is required when FOOTBAG_ENV=staging/,
    );
  });

  it('carries the staging stub signing secret through to config', async () => {
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
    process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_staging_generated_value';
    const { config } = await import('../../src/config/env');
    expect(config.stripeWebhookSecretStub).toBe('whsec_stub_staging_generated_value');
  });

  // Development and test are not reachable from the internet, so the adapter's
  // own constant is an acceptable signing secret there and nothing is required.
  it('leaves the stub signing secret undefined in development', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.PAYMENT_ADAPTER = 'stub';
    delete process.env.STRIPE_WEBHOOK_SECRET_STUB;
    const { config } = await import('../../src/config/env');
    expect(config.stripeWebhookSecretStub).toBeUndefined();
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
    process.env.JWT_SIGNER = 'kms';
    process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
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
    process.env.JWT_SIGNER = 'kms';
    process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
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
    process.env.JWT_SIGNER = 'kms';
    process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
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

  // The rotation secret is optional, but while it is set it is trusted exactly
  // as much as the current one: a delivery signed with it is accepted. So it
  // carries the same production guard, or a stub secret could be smuggled in
  // through the second slot while the first one looks correct.
  it('rejects a whsec_stub-prefixed STRIPE_WEBHOOK_SECRET_PREVIOUS in production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'kms';
    process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
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
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_a_real_looking_live_secret_value';
    process.env.STRIPE_WEBHOOK_SECRET_PREVIOUS = 'whsec_stub_0000000000000000000000000000';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /STRIPE_WEBHOOK_SECRET_PREVIOUS must not be a stub secret in production/,
    );
  });

  it('leaves the rotation secret undefined when no rotation is in flight', async () => {
    baselineRequired();
    process.env.PAYMENT_ADAPTER = 'stub';
    const { config } = await import('../../src/config/env');
    expect(config.stripeWebhookSecretPrevious).toBeUndefined();
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
    process.env.JWT_SIGNER = 'kms';
    process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
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
    process.env.CAPTCHA_ADAPTER = 'live';
    process.env.TURNSTILE_SITE_KEY = 'turnstile-site-key';
    const { config } = await import('../../src/config/env');
    expect(config.stripeWebhookSecret).toBe('whsec_live_realvalue');
  });

  // FOOTBAG_TEST_MEMORY_PERCENT was read via process.env
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
    process.env.JWT_SIGNER = 'kms';
    process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
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
    process.env.AWS_REGION = 'us-east-1';
    process.env.FOOTBAG_ENV = 'staging';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'stub';
    process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_staging_generated_value';
    process.env.FOOTBAG_TEST_MEMORY_PERCENT = '85';
    const { config } = await import('../../src/config/env');
    expect(config.testMemoryPercent).toBe(85);
  });

  // Production-env fail-fast for every dev-only flag. The staging-env cases
  // above cover the dev/staging boundary; these cases lock production as the
  // highest-stakes refusal. A regression that quietly removed any of these
  // guards would let a dev shortcut land on a prod host.


  it('throws when FOOTBAG_DEV_INITIAL_ADMIN_EMAILS is non-empty with FOOTBAG_ENV=production', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'kms';
    process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
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
    process.env.AWS_REGION = 'us-east-1';
    process.env.FOOTBAG_ENV = 'staging';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.PAYMENT_ADAPTER = 'stub';
    process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_staging_generated_value';
    process.env.FOOTBAG_DEV_INITIAL_ADMIN_EMAILS = 'someone@example.com';
    // Boot succeeds; the allowlist value reaches devShortcuts at runtime.
    await expect(import('../../src/config/env')).resolves.toBeDefined();
  });

  it('FOOTBAG_DEV_INITIAL_ADMIN_EMAILS empty/whitespace does not trigger prod fail-fast', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'kms';
    process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
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
    process.env.CAPTCHA_ADAPTER = 'live';
    process.env.TURNSTILE_SITE_KEY = 'turnstile-site-key';
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
    process.env.PAYMENT_ADAPTER = 'stub';
    process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_staging_generated_value';
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
    delete process.env.INTERNAL_EVENT_SECRET;
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
      /INTERNAL_EVENT_SECRET is required/,
    );
  });

  it('falls back to a fixed literal in dev when INTERNAL_EVENT_SECRET is unset, so the three local processes agree without setup', async () => {
    baselineRequired();
    clearAwsWiring();
    delete process.env.INTERNAL_EVENT_SECRET;
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.internalEventSecret).toBe('dev-internal-event-secret-not-for-prod');
  });

  it('uses the operator-supplied INTERNAL_EVENT_SECRET', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.INTERNAL_EVENT_SECRET = 'operator-supplied-token';
    const { config } = await import('../../src/config/env');
    expect(config.internalEventSecret).toBe('operator-supplied-token');
  });

  it('throws in production with local storage when INTERNAL_EVENT_SECRET is unset', async () => {
    baselineRequired();
    clearAwsWiring();
    delete process.env.INTERNAL_EVENT_SECRET;
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
    await expect(import('../../src/config/env')).rejects.toThrow(
      /INTERNAL_EVENT_SECRET is required/,
    );
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

describe('env config: ARCHIVE_LOGIN_REDIRECT', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('defaults to false when unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.archiveLoginRedirect).toBe(false);
  });

  it("parses '1' as true and '0' as false", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.ARCHIVE_LOGIN_REDIRECT = '1';
    let mod = await import('../../src/config/env');
    expect(mod.config.archiveLoginRedirect).toBe(true);
    vi.resetModules();
    process.env.ARCHIVE_LOGIN_REDIRECT = '0';
    mod = await import('../../src/config/env');
    expect(mod.config.archiveLoginRedirect).toBe(false);
  });

  it('throws on invalid value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.ARCHIVE_LOGIN_REDIRECT = 'yes';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /ARCHIVE_LOGIN_REDIRECT must be '1', '0', 'true', or 'false', got: yes/,
    );
  });
});

describe('env config: ARCHIVE_COOKIE_SIGNER and companions', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('defaults to null when unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.archiveCookieSigner).toBeNull();
  });

  it('throws on an unknown signer value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.ARCHIVE_COOKIE_SIGNER = 'kms';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /ARCHIVE_COOKIE_SIGNER must be 'ssm' or 'local', got: kms/,
    );
  });

  it('requires ARCHIVE_KEY_PAIR_ID when the signer is ssm', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.ARCHIVE_URL = 'https://archive.example.test';
    process.env.ARCHIVE_COOKIE_SIGNER = 'ssm';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /ARCHIVE_KEY_PAIR_ID is required when ARCHIVE_COOKIE_SIGNER=ssm/,
    );
  });

  it('requires ARCHIVE_URL when any signer is set', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.ARCHIVE_COOKIE_SIGNER = 'local';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /ARCHIVE_URL is required when ARCHIVE_COOKIE_SIGNER is set/,
    );
  });

  it('requires the cookie domain to be a parent-domain scope (leading dot)', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.ARCHIVE_URL = 'https://archive.example.test';
    process.env.ARCHIVE_COOKIE_SIGNER = 'local';
    process.env.ARCHIVE_COOKIE_DOMAIN = 'example.test';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /ARCHIVE_COOKIE_DOMAIN must start with '\.'/,
    );
  });

  it('refuses a cookie domain without a signer', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.ARCHIVE_COOKIE_DOMAIN = '.example.test';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /ARCHIVE_COOKIE_DOMAIN requires ARCHIVE_COOKIE_SIGNER/,
    );
  });

  it('accepts the full ssm configuration', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.ARCHIVE_URL = 'https://archive.example.test';
    process.env.ARCHIVE_COOKIE_SIGNER = 'ssm';
    process.env.ARCHIVE_KEY_PAIR_ID = 'KEXAMPLE123';
    process.env.ARCHIVE_COOKIE_DOMAIN = '.example.test';
    const { config } = await import('../../src/config/env');
    expect(config.archiveCookieSigner).toBe('ssm');
    expect(config.archiveKeyPairId).toBe('KEXAMPLE123');
    expect(config.archiveCookieDomain).toBe('.example.test');
  });
});

describe('env config: CURATED_ROOT_DIR', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('defaults to null when unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    delete process.env.CURATED_ROOT_DIR;
    const { config } = await import('../../src/config/env');
    expect(config.curatedRootDirOverride).toBeNull();
  });

  it('is null when set to a whitespace-only value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.CURATED_ROOT_DIR = '   ';
    const { config } = await import('../../src/config/env');
    expect(config.curatedRootDirOverride).toBeNull();
  });

  it('carries the trimmed path when set', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.CURATED_ROOT_DIR = '  /tmp/footbag-e2e-curated-abc  ';
    const { config } = await import('../../src/config/env');
    expect(config.curatedRootDirOverride).toBe('/tmp/footbag-e2e-curated-abc');
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

describe('env config: VIDEO_MAX_HEIGHT', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('defaults to 1080', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.videoMaxHeight).toBe(1080);
  });

  it('honors an operator override down to a cheaper ceiling', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.VIDEO_MAX_HEIGHT = '720';
    const { config } = await import('../../src/config/env');
    expect(config.videoMaxHeight).toBe(720);
  });

  it('rejects an override outside the supported range', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.VIDEO_MAX_HEIGHT = '4320';
    await expect(import('../../src/config/env')).rejects.toThrow(/VIDEO_MAX_HEIGHT/);
  });
});

describe('env config: VIDEO_MAX_BYTES', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('defaults to a size the encoder can finish inside its time budget', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.videoMaxBytes).toBe(120 * 1024 * 1024);
  });

  it('honors an operator override', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.VIDEO_MAX_BYTES = String(64 * 1024 * 1024);
    const { config } = await import('../../src/config/env');
    expect(config.videoMaxBytes).toBe(64 * 1024 * 1024);
  });

  it('rejects an override beyond the supported range', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.VIDEO_MAX_BYTES = String(4 * 1024 * 1024 * 1024);
    await expect(import('../../src/config/env')).rejects.toThrow(/VIDEO_MAX_BYTES/);
  });
});

describe('env config: FFMPEG_TIMEOUT_SECONDS', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('defaults below the HTTP boundary the caller waits on', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.ffmpegTimeoutSeconds).toBe(240);
    expect(config.ffmpegTimeoutSeconds * 1000).toBeLessThan(
      config.videoTranscodeTimeoutMs,
    );
  });

  it('honors an operator override for a slow host or a long source', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.VIDEO_TRANSCODE_TIMEOUT_MS = '1800000';
    process.env.FFMPEG_TIMEOUT_SECONDS = '1500';
    // Raising the attempt ceiling obliges raising the job lease with it: the
    // lease must outlast the longest legitimate attempt.
    process.env.MEDIA_JOB_LEASE_SECONDS = '2000';
    const { config } = await import('../../src/config/env');
    expect(config.ffmpegTimeoutSeconds).toBe(1500);
  });

  it('refuses a ceiling at or above the caller deadline', async () => {
    // Inverted, the caller abandons the request and marks the job failed while
    // ffmpeg keeps running and keeps the worker's video slot, so later jobs are
    // refused as busy for reasons nothing reports.
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.VIDEO_TRANSCODE_TIMEOUT_MS = '300000';
    process.env.FFMPEG_TIMEOUT_SECONDS = '600';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /must be less than VIDEO_TRANSCODE_TIMEOUT_MS/,
    );
  });

  it('rejects a non-integer override', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FFMPEG_TIMEOUT_SECONDS = 'abc';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FFMPEG_TIMEOUT_SECONDS/,
    );
  });

  it('rejects an override low enough to abort legitimate transcodes', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FFMPEG_TIMEOUT_SECONDS = '5';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FFMPEG_TIMEOUT_SECONDS/,
    );
  });
});

describe('env config: MEDIA_JOB_LEASE_SECONDS outlasts a transcode attempt', () => {
  // An expired lease is read as proof the process holding a media job is gone,
  // and the recurring reap reclaims the row on that proof. A lease shorter
  // than the longest legitimate attempt would let the reap steal a job that is
  // still running, so the pair is cross-checked at boot.
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  it('defaults with the lease above the attempt ceiling', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    const { config } = await import('../../src/config/env');
    expect(config.mediaJobLeaseSeconds * 1000).toBeGreaterThan(
      config.videoTranscodeTimeoutMs,
    );
  });

  it('refuses a lease at or below the attempt ceiling', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.VIDEO_TRANSCODE_TIMEOUT_MS = '300000';
    process.env.MEDIA_JOB_LEASE_SECONDS = '300';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /MEDIA_JOB_LEASE_SECONDS \(300s\) must exceed VIDEO_TRANSCODE_TIMEOUT_MS/,
    );
  });

  it('counts the busy-wait budget against the lease, not just the transcode ceiling', async () => {
    // 450s of lease clears the 300s transcode ceiling alone but not the
    // ceiling plus the 180s of bounded waits a busy worker may add; admitting
    // it would let the reap reclaim a job that is still politely waiting.
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.VIDEO_TRANSCODE_TIMEOUT_MS = '300000';
    process.env.MEDIA_JOB_LEASE_SECONDS = '450';
    await expect(import('../../src/config/env')).rejects.toThrow(/busy-wait budget/);
  });

  it('honors a raised lease alongside a raised attempt ceiling', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.VIDEO_TRANSCODE_TIMEOUT_MS = '1800000';
    process.env.FFMPEG_TIMEOUT_SECONDS = '1500';
    process.env.MEDIA_JOB_LEASE_SECONDS = '2000';
    const { config } = await import('../../src/config/env');
    expect(config.mediaJobLeaseSeconds).toBe(2000);
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

describe('env config: arming switches (EMAIL_SEND_ARMED / PAYMENTS_ARMED)', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  // A production-shaped boot minus the adapters and flags each case sets
  // itself. Mirrors the passing live-load shape used elsewhere in this file.
  function productionShape(): void {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.JWT_SIGNER = 'kms';
    process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
    process.env.AWS_REGION = 'us-east-1';
    process.env.SAFE_BROWSING_ADAPTER = 'stub';
    process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'production';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.CAPTCHA_ADAPTER = 'live';
    process.env.TURNSTILE_SITE_KEY = 'turnstile-site-key';
  }

  function armedEmailEnv(): void {
    process.env.SES_ADAPTER = 'live';
    process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
  }

  function armedPaymentsEnv(): void {
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live_realvalue';
  }

  it('throws when EMAIL_SEND_ARMED is unset under a prod-mode boot', async () => {
    productionShape();
    armedEmailEnv();
    armedPaymentsEnv();
    delete process.env.EMAIL_SEND_ARMED;
    await expect(import('../../src/config/env')).rejects.toThrow(
      /EMAIL_SEND_ARMED must be set explicitly in production \(no default\)/,
    );
  });

  it('throws when PAYMENTS_ARMED is unset under a prod-mode boot', async () => {
    productionShape();
    armedEmailEnv();
    armedPaymentsEnv();
    delete process.env.PAYMENTS_ARMED;
    await expect(import('../../src/config/env')).rejects.toThrow(
      /PAYMENTS_ARMED must be set explicitly in production \(no default\)/,
    );
  });

  it('throws on an invalid EMAIL_SEND_ARMED value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.EMAIL_SEND_ARMED = 'on';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /EMAIL_SEND_ARMED must be 'armed' or 'dark', got: on/,
    );
  });

  it('throws on an invalid PAYMENTS_ARMED value', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.PAYMENTS_ARMED = 'on';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /PAYMENTS_ARMED must be 'armed' or 'dark', got: on/,
    );
  });

  it("defaults both switches to 'armed' below prod-mode boots", async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    delete process.env.EMAIL_SEND_ARMED;
    delete process.env.PAYMENTS_ARMED;
    const { config } = await import('../../src/config/env');
    expect(config.emailSendArmed).toBe('armed');
    expect(config.paymentsArmed).toBe('armed');
  });

  it('boots a fully dark production on the stub adapters', async () => {
    productionShape();
    process.env.EMAIL_SEND_ARMED = 'dark';
    process.env.PAYMENTS_ARMED = 'dark';
    process.env.SES_ADAPTER = 'stub';
    process.env.PAYMENT_ADAPTER = 'stub';
    process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_production_generated';
    const { config } = await import('../../src/config/env');
    expect(config.emailSendArmed).toBe('dark');
    expect(config.paymentsArmed).toBe('dark');
    expect(config.sesAdapter).toBe('stub');
    expect(config.paymentAdapter).toBe('stub');
  });

  it('refuses a live SES adapter on a dark production email side', async () => {
    productionShape();
    process.env.EMAIL_SEND_ARMED = 'dark';
    armedEmailEnv();
    process.env.PAYMENT_ADAPTER = 'stub';
    process.env.PAYMENTS_ARMED = 'dark';
    process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_production_generated';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /SES_ADAPTER must be 'stub' when FOOTBAG_ENV=production and EMAIL_SEND_ARMED=dark/,
    );
  });

  it('refuses a live payment adapter on a dark production payment side', async () => {
    productionShape();
    process.env.EMAIL_SEND_ARMED = 'armed';
    armedEmailEnv();
    process.env.PAYMENTS_ARMED = 'dark';
    armedPaymentsEnv();
    await expect(import('../../src/config/env')).rejects.toThrow(
      /PAYMENT_ADAPTER must be 'stub' when FOOTBAG_ENV=production and PAYMENTS_ARMED=dark/,
    );
  });

  it('refuses a stub SES adapter on an armed production email side', async () => {
    productionShape();
    process.env.EMAIL_SEND_ARMED = 'armed';
    process.env.SES_ADAPTER = 'stub';
    process.env.PAYMENTS_ARMED = 'dark';
    process.env.PAYMENT_ADAPTER = 'stub';
    process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_production_generated';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /SES_ADAPTER must be 'live' when FOOTBAG_ENV=production and EMAIL_SEND_ARMED=armed/,
    );
  });

  it('arms each side independently (dark email beside armed payments)', async () => {
    productionShape();
    process.env.EMAIL_SEND_ARMED = 'dark';
    process.env.SES_ADAPTER = 'stub';
    process.env.PAYMENTS_ARMED = 'armed';
    armedPaymentsEnv();
    const { config } = await import('../../src/config/env');
    expect(config.sesAdapter).toBe('stub');
    expect(config.paymentAdapter).toBe('live');
  });

  it('requires a generated stub webhook secret on a dark production payment side', async () => {
    productionShape();
    process.env.EMAIL_SEND_ARMED = 'dark';
    process.env.SES_ADAPTER = 'stub';
    process.env.PAYMENTS_ARMED = 'dark';
    process.env.PAYMENT_ADAPTER = 'stub';
    delete process.env.STRIPE_WEBHOOK_SECRET_STUB;
    await expect(import('../../src/config/env')).rejects.toThrow(
      /STRIPE_WEBHOOK_SECRET_STUB is required when FOOTBAG_ENV=production and PAYMENT_ADAPTER='stub'/,
    );
  });

  it('keeps the staging stub mandates regardless of the switch values', async () => {
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
    process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_staging_generated_value';
    process.env.EMAIL_SEND_ARMED = 'dark';
    process.env.PAYMENTS_ARMED = 'dark';
    const { config } = await import('../../src/config/env');
    expect(config.sesAdapter).toBe('stub');
    expect(config.paymentAdapter).toBe('stub');
  });

  it('refuses the live payment SDK under FOOTBAG_ENV=staging', async () => {
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
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live_realvalue';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /PAYMENT_ADAPTER must be 'stub' when FOOTBAG_ENV=staging \(got 'live'\)/,
    );
  });

  it('refuses the live payment SDK under FOOTBAG_ENV=development', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.FOOTBAG_ENV = 'development';
    process.env.PAYMENT_ADAPTER = 'live';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live_realvalue';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /PAYMENT_ADAPTER must be 'stub' when FOOTBAG_ENV=development \(got 'live'\)/,
    );
  });
});

describe('env config: prod-mode deployment-env declaration and hardening mandates', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  // A fully explicit prod-mode boot on stub adapters with FOOTBAG_ENV left
  // unset: the bare-test-boot shape. Cases add or delete the one var whose
  // mandate they exercise.
  function explicitProdStubWiring(): void {
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
    process.env.PAYMENT_ADAPTER = 'stub';
  }

  it('requires FOOTBAG_ENV on a prod-mode boot outside the Vitest runner', async () => {
    explicitProdStubWiring();
    // Outside the runner (VITEST unset) a prod-mode boot must declare its
    // deployment environment: every FOOTBAG_ENV-keyed production mandate
    // silently skips without it.
    delete process.env.VITEST;
    await expect(import('../../src/config/env')).rejects.toThrow(
      /FOOTBAG_ENV must be set explicitly when NODE_ENV=production/,
    );
  });

  it('keeps bare test boots bootable: FOOTBAG_ENV may stay unset under the Vitest runner', async () => {
    explicitProdStubWiring();
    expect(process.env.VITEST).toBeTruthy();
    const { config } = await import('../../src/config/env');
    expect(config.footbagEnv).toBeUndefined();
  });

  it('requires CAPTCHA_ADAPTER to be set explicitly under a prod-mode boot', async () => {
    explicitProdStubWiring();
    delete process.env.CAPTCHA_ADAPTER;
    await expect(import('../../src/config/env')).rejects.toThrow(
      /CAPTCHA_ADAPTER must be set explicitly in production \(no default\)/,
    );
  });

  it("requires JWT_SIGNER='kms' under FOOTBAG_ENV=production", async () => {
    explicitProdStubWiring();
    process.env.FOOTBAG_ENV = 'production';
    process.env.JWT_SIGNER = 'local';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /JWT_SIGNER must be 'kms' when FOOTBAG_ENV=production/,
    );
  });

  it('requires AWS_REGION when SECRETS_ADAPTER=live alone selects an AWS backend', async () => {
    explicitProdStubWiring();
    process.env.SECRETS_ADAPTER = 'live';
    process.env.FOOTBAG_ENV = 'staging';
    process.env.CAPTCHA_ADAPTER = 'stub';
    process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_staging_generated_value';
    delete process.env.AWS_REGION;
    await expect(import('../../src/config/env')).rejects.toThrow(
      /AWS_REGION is required when JWT_SIGNER=kms, SES_ADAPTER=live, SECRETS_ADAPTER=live, or MEDIA_STORAGE_ADAPTER=s3/,
    );
  });

  it('refuses the boolean TRUST_PROXY forms at boot', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.TRUST_PROXY = 'true';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /TRUST_PROXY must be an exact integer hop count or an address-range list/,
    );

    vi.resetModules();
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.TRUST_PROXY = 'false';
    await expect(import('../../src/config/env')).rejects.toThrow(
      /TRUST_PROXY must be an exact integer hop count or an address-range list/,
    );
  });

  it('trims outer whitespace from selector values instead of refusing the boot', async () => {
    // A hand-edited host env file pasted with CRLF line endings must not
    // refuse an otherwise-correct configuration.
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.SES_ADAPTER = 'stub\r';
    process.env.EMAIL_SEND_ARMED = ' armed ';
    const { config } = await import('../../src/config/env');
    expect(config.sesAdapter).toBe('stub');
    expect(config.emailSendArmed).toBe('armed');
  });

  it('treats a whitespace-only selector value as unset', async () => {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'development';
    process.env.CAPTCHA_ADAPTER = '   ';
    const { config } = await import('../../src/config/env');
    expect(config.captchaAdapter).toBe('stub');
  });

  it('trims NODE_ENV so a CRLF-pasted production value still hardens the boot', async () => {
    explicitProdStubWiring();
    process.env.NODE_ENV = 'production\n';
    delete process.env.CAPTCHA_ADAPTER;
    await expect(import('../../src/config/env')).rejects.toThrow(
      /CAPTCHA_ADAPTER must be set explicitly in production \(no default\)/,
    );
  });
});

describe('env config: link-protection switches (URL_SCREENING_ARMED / REACHABILITY_ARMED)', () => {
  let snap: EnvSnapshot;
  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });
  afterEach(() => restoreEnv(snap));

  // A deployed-environment boot minus the two switches and the two selectors,
  // which each case sets itself. FOOTBAG_ENV is what turns the guards on: they
  // are deliberately inert below a deployed environment, because a development
  // boot holds the stub selectors while the switches keep their non-production
  // defaults, and that pairing is correct rather than a mismatch.
  function deployedShape(env: 'staging' | 'production'): void {
    baselineRequired();
    clearAwsWiring();
    process.env.NODE_ENV = 'production';
    process.env.FOOTBAG_ENV = env;
    process.env.JWT_SIGNER = 'kms';
    process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
    process.env.AWS_REGION = 'us-east-1';
    process.env.SES_ADAPTER = 'stub';
    process.env.SECRETS_ADAPTER = 'live';
    process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
    process.env.MEDIA_STORAGE_ADAPTER = 'local';
    process.env.CAPTCHA_ADAPTER = env === 'production' ? 'live' : 'stub';
    if (env === 'production') process.env.TURNSTILE_SITE_KEY = 'turnstile-site-key';
    process.env.PAYMENT_ADAPTER = 'stub';
    process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_generated_value';
    process.env.EMAIL_SEND_ARMED = 'dark';
    process.env.PAYMENTS_ARMED = 'dark';
  }

  describe('the switch values themselves', () => {
    it.each(['URL_SCREENING_ARMED', 'REACHABILITY_ARMED'])(
      'throws when %s is unset in a production-hardened boot, so no default can mask a host the deploy failed to sync',
      async (name) => {
        deployedShape('staging');
        process.env.URL_SCREENING_ARMED = 'dark';
        process.env.REACHABILITY_ARMED = 'dark';
        process.env.SAFE_BROWSING_ADAPTER = 'stub';
        process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
        delete process.env[name];
        await expect(import('../../src/config/env')).rejects.toThrow(
          new RegExp(`${name} must be set explicitly in production \\(no default\\)`),
        );
      },
    );

    it.each(['URL_SCREENING_ARMED', 'REACHABILITY_ARMED'])(
      'throws when %s holds a value that is neither armed nor dark',
      async (name) => {
        deployedShape('staging');
        process.env.URL_SCREENING_ARMED = 'dark';
        process.env.REACHABILITY_ARMED = 'dark';
        process.env.SAFE_BROWSING_ADAPTER = 'stub';
        process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
        process.env[name] = 'on';
        await expect(import('../../src/config/env')).rejects.toThrow(
          new RegExp(`${name} must be 'armed' or 'dark', got: on`),
        );
      },
    );

    it('defaults both to armed below a production-hardened boot, so a checkout runs with no environment file', async () => {
      baselineRequired();
      clearAwsWiring();
      process.env.NODE_ENV = 'development';
      delete process.env.URL_SCREENING_ARMED;
      delete process.env.REACHABILITY_ARMED;
      const { config } = await import('../../src/config/env');
      expect(config.urlScreeningArmed).toBe('armed');
      expect(config.reachabilityArmed).toBe('armed');
    });
  });

  describe('switch and selector must agree in a deployed environment', () => {
    // Each case is the failure the deploy is supposed to make unreachable: it
    // derives the selector from the switch on every run, so a disagreement means
    // the host was hand-edited or a deploy half did not run. Refusing beats
    // picking one of two answers, because the wrong pick is silent — a selector
    // on its non-protective value boots exactly as cleanly as one on its
    // protective value.
    it.each(['staging', 'production'] as const)(
      'refuses armed screening running on the stub deny list (%s)',
      async (env) => {
        deployedShape(env);
        process.env.URL_SCREENING_ARMED = 'armed';
        process.env.SAFE_BROWSING_ADAPTER = 'stub';
        process.env.REACHABILITY_ARMED = 'dark';
        process.env.HTTP_REACHABILITY_ADAPTER = 'disabled';
        await expect(import('../../src/config/env')).rejects.toThrow(
          /SAFE_BROWSING_ADAPTER must be 'live' when FOOTBAG_ENV=.* and URL_SCREENING_ARMED=armed/,
        );
      },
    );

    it('refuses dark screening reaching the live API', async () => {
      deployedShape('staging');
      process.env.URL_SCREENING_ARMED = 'dark';
      process.env.SAFE_BROWSING_ADAPTER = 'live';
      process.env.REACHABILITY_ARMED = 'dark';
      process.env.HTTP_REACHABILITY_ADAPTER = 'disabled';
      await expect(import('../../src/config/env')).rejects.toThrow(
        /SAFE_BROWSING_ADAPTER must be 'stub' when FOOTBAG_ENV=.* and URL_SCREENING_ARMED=dark/,
      );
    });

    it('refuses armed reachability that does not actually probe', async () => {
      deployedShape('staging');
      process.env.URL_SCREENING_ARMED = 'dark';
      process.env.SAFE_BROWSING_ADAPTER = 'stub';
      process.env.REACHABILITY_ARMED = 'armed';
      process.env.HTTP_REACHABILITY_ADAPTER = 'disabled';
      await expect(import('../../src/config/env')).rejects.toThrow(
        /HTTP_REACHABILITY_ADAPTER must be 'live' when FOOTBAG_ENV=.* and REACHABILITY_ARMED=armed/,
      );
    });

    it('refuses dark reachability that probes anyway', async () => {
      deployedShape('staging');
      process.env.URL_SCREENING_ARMED = 'dark';
      process.env.SAFE_BROWSING_ADAPTER = 'stub';
      process.env.REACHABILITY_ARMED = 'dark';
      process.env.HTTP_REACHABILITY_ADAPTER = 'live';
      await expect(import('../../src/config/env')).rejects.toThrow(
        /HTTP_REACHABILITY_ADAPTER must not be 'live' when FOOTBAG_ENV=.* and REACHABILITY_ARMED=dark/,
      );
    });

    it("accepts dark reachability on the stub, because 'stub' makes no outbound probe either", async () => {
      // The guard reads the behaviour rather than the literal. The deploy writes
      // 'disabled' for dark, but a host holding 'stub' is not probing either, and
      // refusing it would fail a boot that is behaving correctly.
      deployedShape('staging');
      process.env.URL_SCREENING_ARMED = 'dark';
      process.env.SAFE_BROWSING_ADAPTER = 'stub';
      process.env.REACHABILITY_ARMED = 'dark';
      process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
      const { config } = await import('../../src/config/env');
      expect(config.httpReachabilityAdapter).toBe('stub');
      expect(config.reachabilityArmed).toBe('dark');
    });

    it('accepts the agreeing armed pair', async () => {
      deployedShape('staging');
      process.env.URL_SCREENING_ARMED = 'armed';
      process.env.SAFE_BROWSING_ADAPTER = 'live';
      process.env.REACHABILITY_ARMED = 'armed';
      process.env.HTTP_REACHABILITY_ADAPTER = 'live';
      const { config } = await import('../../src/config/env');
      expect(config.safeBrowsingAdapter).toBe('live');
      expect(config.httpReachabilityAdapter).toBe('live');
    });
  });

  describe('the guards are inert below a deployed environment', () => {
    // Without this, a local run breaks: the stub selectors are the development
    // defaults while the switches default armed, which is a mismatch on paper
    // and correct in fact. Nothing else in the suite proves the gate exists.
    it.each([undefined, 'development'] as const)(
      'allows a mismatched pair when FOOTBAG_ENV is %s',
      async (env) => {
        baselineRequired();
        clearAwsWiring();
        process.env.NODE_ENV = 'development';
        if (env === undefined) delete process.env.FOOTBAG_ENV;
        else process.env.FOOTBAG_ENV = env;
        process.env.URL_SCREENING_ARMED = 'armed';
        process.env.SAFE_BROWSING_ADAPTER = 'stub';
        process.env.REACHABILITY_ARMED = 'armed';
        process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
        const { config } = await import('../../src/config/env');
        expect(config.safeBrowsingAdapter).toBe('stub');
        expect(config.urlScreeningArmed).toBe('armed');
      },
    );
  });
});

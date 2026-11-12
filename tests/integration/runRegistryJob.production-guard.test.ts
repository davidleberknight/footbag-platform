/**
 * The testkit's on-demand job run refuses production.
 *
 * The production image is built without the testkit; this proves the run
 * refuses there anyway, before writing anything, so a mis-built image still
 * cannot run a scheduled job off its schedule against live data. This boots a
 * complete production-mode configuration so the environment resolves to
 * production.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4792');

process.env.NODE_ENV = 'production';
process.env.FOOTBAG_ENV = 'production';
process.env.SESSION_SECRET = 'a'.repeat(48);
process.env.INTERNAL_EVENT_SECRET = 'c'.repeat(48);
process.env.JWT_SIGNER = 'kms';
process.env.JWT_KMS_KEY_ID = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
process.env.SES_ADAPTER = 'live';
process.env.SES_FROM_IDENTITY = 'noreply@footbag.org';
process.env.SAFE_BROWSING_ADAPTER = 'stub';
process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
process.env.SECRETS_ADAPTER = 'stub';
process.env.AWS_REGION = 'us-east-1';
process.env.IMAGE_PROCESSOR_URL = 'http://image:4000';
process.env.MEDIA_STORAGE_ADAPTER = 'local';
process.env.PAYMENT_ADAPTER = 'live';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_live_value';
process.env.CAPTCHA_ADAPTER = 'live';
process.env.TURNSTILE_SITE_KEY = '1x00000000000000000000AA';
delete process.env.ALLOW_CURATED_SIDECAR_WRITES;

beforeAll(() => {
  createTestDb(dbPath).close();
});

afterAll(() => cleanupTestDb(dbPath));

describe('runRegistryJobNow in production', () => {
  it('refuses a real registry job and writes no run row', async () => {
    const cfg = await import('../../src/config/env');
    expect(cfg.config.footbagEnv).toBe('production');
    const runner = await import('../../src/testkit/runRegistryJob');

    await expect(runner.runRegistryJobNow('SYS_Reconcile_Payments_Nightly'))
      .rejects.toBeInstanceOf(runner.RegistryJobRefusedError);

    const db = new BetterSqlite3(dbPath);
    const count = (db.prepare('SELECT COUNT(*) AS n FROM system_job_runs').get() as { n: number }).n;
    db.close();
    expect(count).toBe(0);
  });
});

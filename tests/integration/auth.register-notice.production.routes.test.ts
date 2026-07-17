/**
 * The registration "account data may be deleted / under active development"
 * warning is a non-production notice. In production it must never render, so the
 * page never tells a real registrant their account is disposable, and the
 * Turnstile developer-stub copy must never appear either. This boots a complete
 * production-mode configuration so config.footbagEnv resolves to 'production'.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3213');

// Complete production wiring (mirrors the env-config success case) plus
// FOOTBAG_ENV=production. Adapters that would otherwise reach AWS stay on the
// stub/local implementations; only the env discriminator and the live captcha
// requirement matter here.
process.env.NODE_ENV = 'production';
process.env.FOOTBAG_ENV = 'production';
process.env.SESSION_SECRET = 'a'.repeat(48);
process.env.SES_FEEDBACK_WEBHOOK_KEY = 'b'.repeat(48);
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
process.env.CAPTCHA_ADAPTER = 'live'; // a production boot rejects the captcha stub
process.env.TURNSTILE_SITE_KEY = '1x00000000000000000000AA';
delete process.env.ALLOW_CURATED_SIDECAR_WRITES;

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  const cfg = await import('../../src/config/env');
  expect(cfg.config.footbagEnv).toBe('production');
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /register — production hides development-only copy', () => {
  it('renders without the account-volatility / active-development warning', async () => {
    const res = await request(createApp()).get('/register');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('under active development');
    expect(res.text).not.toContain('Early access notice');
  });

  it('does not show the Turnstile developer-stub bypass copy', async () => {
    const res = await request(createApp()).get('/register');
    expect(res.text).not.toContain('Developer stub');
    expect(res.text).not.toContain('is bypassed');
  });
});

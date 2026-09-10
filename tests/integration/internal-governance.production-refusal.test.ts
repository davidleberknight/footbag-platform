/**
 * Legacy-governance-review only: DELETE BEFORE GO-LIVE.
 *
 * /internal-governance/* must not exist in production. This file runs the
 * case under a full production boot, mirroring internal.retired-surface.test.ts
 * for the retired /internal mount: a valid production baseline proves the
 * 404s below reflect an absent route rather than a boot failure. The
 * dev-environment case (where the router does mount) is covered by
 * internal-governance.routes.test.ts. The config singleton freezes on the
 * first importApp, so this file boots exactly one env.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3612');

const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
const PRIOR_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV                  = 'production';
process.env.FOOTBAG_ENV               = 'production';
process.env.SESSION_SECRET            = 'a'.repeat(48);
process.env.JWT_SIGNER                = 'kms';
process.env.JWT_KMS_KEY_ID            = 'arn:aws:kms:us-east-1:000000000000:key/abcd-efgh';
process.env.SES_ADAPTER               = 'live';
process.env.SES_FROM_IDENTITY         = 'noreply@test.example.com';
process.env.AWS_REGION                = 'us-east-1';
process.env.SAFE_BROWSING_ADAPTER     = 'stub';
process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
process.env.SECRETS_ADAPTER           = 'stub';
process.env.IMAGE_PROCESSOR_URL       = 'http://image:4000';
process.env.MEDIA_STORAGE_ADAPTER     = 'local';
process.env.PAYMENT_ADAPTER           = 'live';
process.env.STRIPE_WEBHOOK_SECRET     = 'whsec_live_realvalue';
process.env.SES_FEEDBACK_WEBHOOK_KEY  = 'b'.repeat(48);
process.env.CAPTCHA_ADAPTER           = 'live';
process.env.TURNSTILE_SITE_KEY        = '1x00000000000000000000AA';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
  if (PRIOR_FOOTBAG_ENV === undefined) delete process.env.FOOTBAG_ENV;
  else process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
  if (PRIOR_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PRIOR_NODE_ENV;
});

describe('/internal-governance/* under production', () => {
  it('boots under FOOTBAG_ENV=production', () => {
    const app = createApp();
    expect(app).toBeTypeOf('function');
  });

  it('returns 404 for the committees list', async () => {
    const app = createApp();
    const res = await request(app).get('/internal-governance/committees');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a committee detail page', async () => {
    const app = createApp();
    const res = await request(app).get('/internal-governance/committees/9001');
    expect(res.status).toBe(404);
  });

  it('returns 404 for the elections list', async () => {
    const app = createApp();
    const res = await request(app).get('/internal-governance/elections');
    expect(res.status).toBe(404);
  });
});

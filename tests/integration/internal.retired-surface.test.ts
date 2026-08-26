/**
 * The internal QC subsystem is retired, so the whole /internal surface is
 * unreachable. There is no router to mount and no environment in which one
 * appears, which is why every path under it answers 404 rather than the
 * 302-to-login or 403 an auth gate would produce.
 *
 * This file runs the case under a full production boot, because production is
 * the environment the retirement exists to protect and a valid production
 * baseline also proves the 404s reflect an absent route rather than a boot
 * failure. The dev-environment case, where the router used to mount, is
 * covered by the admin crawl in route-wiring.crawl.test.ts. The config
 * singleton freezes on the first importApp, so this file boots exactly one env.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3434');

// A full, valid FOOTBAG_ENV=production baseline (mirrors devRoutes.prodGate).
// Production mandates JWT_SIGNER=kms; the signer inits lazily and no case in
// this file signs or verifies a session, so the fake key ARN never reaches
// AWS. SES_ADAPTER=live is required under prod and inits lazily too (no
// network at boot).
const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
const PRIOR_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV                  = 'production';
process.env.FOOTBAG_ENV               = 'production';
process.env.SESSION_SECRET            = 'a'.repeat(48); // prod rejects the short test default
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
process.env.SES_FEEDBACK_WEBHOOK_KEY  = 'b'.repeat(48); // required when SES_ADAPTER=live
process.env.CAPTCHA_ADAPTER           = 'live'; // production boot rejects the captcha stub
process.env.TURNSTILE_SITE_KEY        = '1x00000000000000000000AA'; // required with the live adapter; its secret resolves lazily and is never touched here

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

describe('/internal/* — the retired QC surface', () => {
  it('boots under FOOTBAG_ENV=production', () => {
    // Proves the prod baseline above is valid and the app actually booted in
    // production mode, so the 404s below reflect an absent route rather than a
    // boot failure or a misconfigured env.
    const app = createApp();
    expect(app).toBeTypeOf('function');
  });

  it('returns 404 for the retired persons QC page', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/persons/qc');
    expect(res.status).toBe(404);
  });

  it('returns 404 for the retired net review page', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    expect(res.status).toBe(404);
  });

  it('returns 404 for the retired bookmark redirect', async () => {
    // This path once forwarded to the admin workbench, which is a keeper
    // surface reached at /admin/freestyle/emerging-vocabulary. The forward went
    // with the router: /internal answers nothing at all.
    const app = createApp();
    const res = await request(app).get('/internal/freestyle/emerging-vocabulary');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a state-changing POST under the retired surface', async () => {
    const app = createApp();
    // Send a matching Origin so the origin pin passes; the request then falls
    // through to the catch-all 404 (proving the route is unregistered), rather
    // than being rejected 403 at the origin-pin perimeter.
    const res = await request(app)
      .post('/internal/net/team-corrections/any-id/decision')
      .set('Origin', process.env.PUBLIC_BASE_URL ?? 'http://localhost:3434');
    expect(res.status).toBe(404);
  });
});

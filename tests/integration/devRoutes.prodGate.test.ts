/**
 * Mount-gate acceptance test: the /dev persona-harness router is mounted only
 * when config.footbagEnv is 'development' or 'staging' (src/app.ts), so under
 * FOOTBAG_ENV=production the entire /dev surface must be unreachable (404).
 *
 * The dev-reachable positive case is covered by devSwitchRoute.test.ts and
 * devPersonasListing.test.ts; this file owns the production-refusal case. The
 * config singleton freezes on the first importApp, so this file boots exactly
 * one env (production). It probes the /dev routes (/switch, /login, /personas).
 *
 * It also probes POST /payments/checkout/:sessionId/decline: that stub-only
 * tester affordance is registered only when PAYMENT_ADAPTER=stub, and this
 * baseline runs PAYMENT_ADAPTER=live, so the route must be unregistered (404)
 * in production.
 *
 * The primary guard is the app.ts mount condition plus env.ts's
 * throw-on-invalid FOOTBAG_ENV; this closes the acceptance-test gap, not a
 * live hole.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3433');

// A full, valid FOOTBAG_ENV=production baseline (mirrors the passing prod cases
// in tests/unit/env-config.test.ts). JWT_SIGNER=local and the stub adapters
// keep boot off AWS; SES_ADAPTER=live is required under prod and inits lazily
// (no network at boot). JWT_LOCAL_KEYPAIR_PATH is intentionally NOT set here —
// it is frozen per-worker by tests/setup-env.ts.
const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
const PRIOR_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV                  = 'production';
process.env.FOOTBAG_ENV               = 'production';
process.env.SESSION_SECRET            = 'a'.repeat(48); // prod rejects the short test default
process.env.JWT_SIGNER                = 'local';
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

describe('GET /dev/* — production mount gate', () => {
  it('boots under FOOTBAG_ENV=production', () => {
    // Proves the prod baseline above is valid and the app actually booted in
    // production mode, so the 404 below reflects an unmounted router rather
    // than a boot failure or a misconfigured env.
    const app = createApp();
    expect(app).toBeTypeOf('function');
  });

  it('returns 404 for /dev/switch (router not mounted in production)', async () => {
    const app = createApp();
    const res = await request(app).get('/dev/switch?as=any-slug');
    expect(res.status).toBe(404);
  });

  it('returns 404 for /dev/personas (router not mounted in production)', async () => {
    const app = createApp();
    const res = await request(app).get('/dev/personas');
    expect(res.status).toBe(404);
  });

  it('returns 404 for /dev/login (router not mounted in production)', async () => {
    const app = createApp();
    const res = await request(app).get('/dev/login?as=any-slug');
    expect(res.status).toBe(404);
  });

  it('returns 404 for /dev/build-claim (real-flow claim affordance not mounted in production)', async () => {
    const app = createApp();
    const res = await request(app).get('/dev/build-claim?as=any-id');
    expect(res.status).toBe(404);
  });

  it('returns 404 for /dev/outbox (router not mounted in production)', async () => {
    const app = createApp();
    const res = await request(app).get('/dev/outbox');
    expect(res.status).toBe(404);
  });

  it('returns 404 for POST /payments/checkout/:id/decline (stub-only route unregistered in live mode)', async () => {
    const app = createApp();
    // Send a matching Origin so requireOriginPin passes; the request then falls
    // through to the catch-all 404 (proving the route is unregistered), rather
    // than being rejected 403 at the origin-pin perimeter.
    const res = await request(app)
      .post('/payments/checkout/cs_stub_anything/decline')
      .set('Origin', process.env.PUBLIC_BASE_URL ?? 'http://localhost:3433');
    expect(res.status).toBe(404);
  });
});

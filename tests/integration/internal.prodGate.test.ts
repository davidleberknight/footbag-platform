/**
 * Mount-gate acceptance test: the /internal QC router is mounted only when
 * config.footbagEnv is not 'production' (src/app.ts), so under
 * FOOTBAG_ENV=production the entire /internal surface must be unreachable
 * (404). The 404 — rather than the 302-to-login or 403 the router's own auth
 * gate produces when mounted — proves the router is absent, not merely gated.
 *
 * The mounted-environment behavior (login redirect, 403 for non-admins, 200
 * for admins) is covered by internal.auth-gate.test.ts; this file owns the
 * production-refusal case. The config singleton freezes on the first
 * importApp, so this file boots exactly one env (production).
 *
 * The runtime mount gate is one of two safeguards that keep the QC subsystem
 * out of production; the other is the production image build, which strips
 * dist/internal-qc and stubs the router module. This test pins the runtime
 * layer, which protects even an image built with the strip disabled.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3434');

// A full, valid FOOTBAG_ENV=production baseline (mirrors devRoutes.prodGate).
// JWT_SIGNER=local and the stub adapters keep boot off AWS; SES_ADAPTER=live
// is required under prod and inits lazily (no network at boot).
// JWT_LOCAL_KEYPAIR_PATH is intentionally NOT set here — it is frozen
// per-worker by tests/setup-env.ts.
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

describe('/internal/* — production mount gate', () => {
  it('boots under FOOTBAG_ENV=production', () => {
    // Proves the prod baseline above is valid and the app actually booted in
    // production mode, so the 404s below reflect an unmounted router rather
    // than a boot failure or a misconfigured env.
    const app = createApp();
    expect(app).toBeTypeOf('function');
  });

  it('returns 404 for GET /internal/persons/qc (router not mounted in production)', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/persons/qc');
    expect(res.status).toBe(404);
  });

  it('returns 404 for GET /internal/net/review (router not mounted in production)', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a state-changing POST under /internal (router not mounted in production)', async () => {
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

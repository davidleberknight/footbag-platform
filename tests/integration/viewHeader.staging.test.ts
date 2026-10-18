/**
 * Outside development, no page names the view that rendered it. The
 * X-Footbag-View header exists for the local layout check only; on a deployed
 * box it would publish the site's template layout to anyone reading response
 * headers. Staging is pinned because it is the deployed environment where the
 * development-only routes are also mounted, so a gate copied from theirs would
 * leak here first. The development side is viewHeader.development.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4614');

// A valid staging boot: production hardening with every adapter stubbed, so boot stays off AWS.
const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
const PRIOR_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV                  = 'production';
process.env.FOOTBAG_ENV               = 'staging';
process.env.SESSION_SECRET            = 'a'.repeat(48);
process.env.JWT_SIGNER                = 'local';
process.env.SES_ADAPTER               = 'stub';
process.env.SES_FROM_IDENTITY         = 'noreply@test.example.com';
process.env.AWS_REGION                = 'us-east-1';
process.env.SAFE_BROWSING_ADAPTER     = 'stub';
process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
process.env.SECRETS_ADAPTER           = 'stub';
process.env.CAPTCHA_ADAPTER           = 'stub';
process.env.IMAGE_PROCESSOR_URL       = 'http://image:4000';
process.env.MEDIA_STORAGE_ADAPTER     = 'local';
process.env.PAYMENT_ADAPTER           = 'stub';
process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_staging_generated_value';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  createTestDb(dbPath).close();
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
  if (PRIOR_FOOTBAG_ENV === undefined) delete process.env.FOOTBAG_ENV;
  else process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
  if (PRIOR_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PRIOR_NODE_ENV;
});

describe('X-Footbag-View (staging boot)', () => {
  it('is absent from a rendered page', async () => {
    // A deployed box naming its templates hands an attacker a map of the server's views.
    const res = await request(createApp()).get('/legal');
    expect(res.status).toBe(200);
    expect(res.headers['x-footbag-view']).toBeUndefined();
  });
});

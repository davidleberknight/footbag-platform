import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3972');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember, createTestSessionJwt, completeOnboarding } from '../fixtures/factories';

const MEMBER_ID = 'purchase-route-001';
const MEMBER_SLUG = 'purchaser';
const OTHER_ID = 'purchase-route-002';
const OTHER_SLUG = 'imposter';

let createApp: Awaited<ReturnType<typeof importApp>>;

function memberCookie(memberId: string = MEMBER_ID): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role: 'member' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'Purchaser', login_email: 'purchaser@example.com' });
  insertMember(db, { id: OTHER_ID,  slug: OTHER_SLUG,  display_name: 'Other',     login_email: 'other@example.com' });
  completeOnboarding(db, MEMBER_ID);
  completeOnboarding(db, OTHER_ID);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(async () => {
  const { resetPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
  resetPaymentAdapterForTests();
});

describe('POST /members/:memberKey/purchase-tier (stub adapter)', () => {
  it('redirects 303 to /payments/checkout/:sessionId for an eligible member', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${MEMBER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie())
      .send({ tier: 'tier1', returnTo: `/members/${MEMBER_SLUG}` });
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/^\/payments\/checkout\/cs_stub_[a-z0-9]+$/);
  });

  it('redirects anonymous POSTers to login with returnTo', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${MEMBER_SLUG}/purchase-tier`)
      .send({ tier: 'tier1' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });

  it('returns 404 when another member POSTs to a different :memberKey (anti-enumeration)', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OTHER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie(MEMBER_ID))
      .send({ tier: 'tier1' });
    expect(res.status).toBe(404);
  });

  it('returns 422 for an invalid tier value', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${MEMBER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie())
      .send({ tier: 'bogus' });
    expect(res.status).toBe(422);
  });
});

describe('GET /payments/checkout/:sessionId (stub adapter)', () => {
  it('renders the confirmation page for the session owner', async () => {
    const app = createApp();
    const start = await request(app)
      .post(`/members/${MEMBER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie())
      .send({ tier: 'tier1' });
    expect(start.status).toBe(303);
    const checkoutUrl = start.headers.location;

    const res = await request(app)
      .get(checkoutUrl)
      .set('Cookie', memberCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('IFPA Tier 1 Membership');
    expect(res.text).toContain('Confirm and Pay');
  });

  it('404s for a different member', async () => {
    const app = createApp();
    const start = await request(app)
      .post(`/members/${MEMBER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie())
      .send({ tier: 'tier1' });
    const checkoutUrl = start.headers.location;
    const res = await request(app)
      .get(checkoutUrl)
      .set('Cookie', memberCookie(OTHER_ID));
    expect(res.status).toBe(404);
  });
});

describe('POST /payments/checkout/:sessionId/confirm (stub adapter)', () => {
  it('confirms the purchase, transitions to succeeded, applies tier, redirects to /payments/success', async () => {
    const app = createApp();
    const start = await request(app)
      .post(`/members/${MEMBER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie())
      .send({ tier: 'tier1', returnTo: `/members/${MEMBER_SLUG}` });
    const checkoutUrl = start.headers.location;
    const sessionId = checkoutUrl.split('/').pop()!;

    const confirm = await request(app)
      .post(`/payments/checkout/${sessionId}/confirm`)
      .set('Cookie', memberCookie());
    expect(confirm.status).toBe(303);
    expect(confirm.headers.location).toMatch(/\/payments\/success/);
    expect(confirm.headers.location).toContain(`session_id=${sessionId}`);

    const testDb = new BetterSqlite3(dbPath);
    try {
      const payment = testDb.prepare(
        'SELECT status, purchased_tier_status FROM payments WHERE stripe_checkout_session_id = ?',
      ).get(sessionId) as Record<string, unknown>;
      expect(payment.status).toBe('succeeded');
      expect(payment.purchased_tier_status).toBe('tier1');

      const tier = testDb.prepare(
        'SELECT tier_status FROM member_tier_current WHERE member_id = ?',
      ).get(MEMBER_ID) as Record<string, unknown>;
      expect(tier.tier_status).toBe('tier1');
    } finally {
      testDb.close();
    }
  });
});

describe('GET /payments/success (stub adapter)', () => {
  it('renders tier-1 success copy after confirming a tier1 purchase', async () => {
    const app = createApp();
    const start = await request(app)
      .post(`/members/${OTHER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie(OTHER_ID))
      .send({ tier: 'tier1', returnTo: `/members/${OTHER_SLUG}` });
    const sessionId = start.headers.location.split('/').pop()!;
    await request(app)
      .post(`/payments/checkout/${sessionId}/confirm`)
      .set('Cookie', memberCookie(OTHER_ID));

    const res = await request(app)
      .get(`/payments/success?session_id=${sessionId}&returnTo=%2Fmembers%2F${OTHER_SLUG}`)
      .set('Cookie', memberCookie(OTHER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Tier 1 IFPA Member activated');
    expect(res.text).toContain('vote in IFPA elections');
    expect(res.text).toContain(`/members/${OTHER_SLUG}`);
  });
});

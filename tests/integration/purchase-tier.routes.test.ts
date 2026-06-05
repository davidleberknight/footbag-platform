import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3972');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember, createTestSessionJwt, completeOnboarding } from '../fixtures/factories';
import { expectLoggedError } from '../setup-env';

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
  // Each test exercises one purchase in isolation. Clear any pending payment
  // left by a prior test so the one-pending-membership-per-member index
  // (ux_payments_one_pending_membership) does not reject a fresh start. Pending
  // rows are FK-leaf (no transition/grant rows reference them until they leave
  // 'pending'), so this delete is safe.
  const db = new BetterSqlite3(dbPath);
  try {
    db.prepare("DELETE FROM payments WHERE status = 'pending'").run();
  } finally {
    db.close();
  }
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

  it('returns 422 with the conflict message when a membership purchase is already pending', async () => {
    // The one-pending-membership-per-member unique index rejects the second
    // insert; that is an ordinary user state (double-click, second tab) and
    // must render as a 422 conflict, not fall through to the 500 handler.
    const app = createApp();
    const first = await request(app)
      .post(`/members/${MEMBER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie())
      .send({ tier: 'tier1', returnTo: `/members/${MEMBER_SLUG}` });
    expect(first.status).toBe(303);

    const second = await request(app)
      .post(`/members/${MEMBER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie())
      .send({ tier: 'tier1', returnTo: `/members/${MEMBER_SLUG}` });
    expect(second.status).toBe(422);
    expect(second.text).toContain('already in progress');
  });

  it('persists the stripe ids on the pending row with no NULL window', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${MEMBER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie())
      .send({ tier: 'tier1' });
    expect(res.status).toBe(303);
    const sessionId = res.headers.location.split('/').pop()!;

    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const row = db.prepare(
        `SELECT status, stripe_checkout_session_id, stripe_payment_intent_id
           FROM payments WHERE stripe_checkout_session_id = ?`,
      ).get(sessionId) as Record<string, unknown> | undefined;
      expect(row).toBeTruthy();
      expect(row!.status).toBe('pending');
      expect(row!.stripe_checkout_session_id).toBe(sessionId);
      expect(row!.stripe_payment_intent_id).not.toBeNull();
    } finally {
      db.close();
    }
  });

  it('does not orphan a NULL-stripe-id pending row when checkout creation fails', async () => {
    const app = createApp();
    // Force the external checkout-session call to fail once. Pre-fix the pending
    // row was inserted BEFORE this call, so it persists with NULL stripe ids and
    // the partial unique index then blocks any retry. Post-fix the call runs
    // first, so a failure writes no row at all.
    const { getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
    const adapter = getPaymentAdapter();
    const spy = vi
      .spyOn(adapter, 'createCheckoutSession')
      .mockRejectedValueOnce(new Error('stripe network failure'));

    const first = await request(app)
      .post(`/members/${MEMBER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie())
      .send({ tier: 'tier1' });
    expect(first.status).toBe(500);
    expectLoggedError('unhandled error');
    spy.mockRestore();

    const db = new BetterSqlite3(dbPath, { readonly: true });
    let orphanCount: number;
    try {
      orphanCount = (db.prepare(
        `SELECT COUNT(*) AS c FROM payments
          WHERE member_id = ? AND status = 'pending' AND stripe_checkout_session_id IS NULL`,
      ).get(MEMBER_ID) as { c: number }).c;
    } finally {
      db.close();
    }
    expect(orphanCount).toBe(0);

    // The member can retry immediately (no leftover pending row blocking the index).
    const second = await request(app)
      .post(`/members/${MEMBER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie())
      .send({ tier: 'tier1' });
    expect(second.status).toBe(303);
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
  it('renders the processing variant while the payment row is still pending', async () => {
    // In live mode the browser redirect can land before the provider
    // webhook; the page must not claim the membership is active while the
    // row is pending and the tier ungranted.
    const PENDING_ID = 'purchase-route-pending';
    const PENDING_SLUG = 'pending_purchaser';
    const seedDb = new BetterSqlite3(dbPath);
    insertMember(seedDb, {
      id: PENDING_ID, slug: PENDING_SLUG,
      display_name: 'Pending Purchaser', login_email: 'pending-purchaser@example.com',
    });
    completeOnboarding(seedDb, PENDING_ID);
    seedDb.close();

    const app = createApp();
    const start = await request(app)
      .post(`/members/${PENDING_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie(PENDING_ID))
      .send({ tier: 'tier1', returnTo: `/members/${PENDING_SLUG}` });
    expect(start.status).toBe(303);
    const sessionId = start.headers.location.split('/').pop()!;

    // No checkout confirm: the row stays 'pending'.
    const res = await request(app)
      .get(`/payments/success?session_id=${sessionId}&returnTo=%2Fmembers%2F${PENDING_SLUG}`)
      .set('Cookie', memberCookie(PENDING_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Payment processing');
    expect(res.text).toContain('Your payment is processing.');
    expect(res.text).toContain('as soon as your payment is confirmed');
    expect(res.text).not.toContain('activated');
  });

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

// Kept last: this block tunes purchase_tier_rate_limit_per_hour via
// system_config, a latest-effective value that would otherwise throttle
// purchase POSTs in any subsequent describe.
describe('POST /members/:memberKey/purchase-tier — rate limit', () => {
  it('member exceeding the purchase-attempt limit -> 429 with Retry-After', async () => {
    // Every attempt creates a checkout session at the payment provider
    // before the duplicate-pending index can reject it, so bursts must be
    // throttled to stop orphaned sessions from piling up.
    const RL_ID = 'purchase-route-rl';
    const RL_SLUG = 'rl_purchaser';
    const seedDb = new BetterSqlite3(dbPath);
    insertMember(seedDb, {
      id: RL_ID, slug: RL_SLUG,
      display_name: 'RL Purchaser', login_email: 'rl-purchaser@example.com',
    });
    completeOnboarding(seedDb, RL_ID);
    seedDb.prepare(`
      INSERT INTO system_config
        (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
      VALUES (?, ?, 'purchase_tier_rate_limit_per_hour', '2', ?, 'Test tunable', NULL)
    `).run('test-purchase-tier-rl', '2026-05-22T00:00:00.000Z', '2026-05-22T00:00:00.000Z');
    seedDb.close();

    const rlMod = await import('../../src/services/rateLimitService');
    rlMod.resetRateLimitForTests();
    try {
      const app = createApp();
      const first = await request(app)
        .post(`/members/${RL_SLUG}/purchase-tier`)
        .set('Cookie', memberCookie(RL_ID))
        .send({ tier: 'tier1', returnTo: `/members/${RL_SLUG}` });
      expect(first.status).toBe(303);

      const second = await request(app)
        .post(`/members/${RL_SLUG}/purchase-tier`)
        .set('Cookie', memberCookie(RL_ID))
        .send({ tier: 'tier1', returnTo: `/members/${RL_SLUG}` });
      expect(second.status).toBe(422);

      const blocked = await request(app)
        .post(`/members/${RL_SLUG}/purchase-tier`)
        .set('Cookie', memberCookie(RL_ID))
        .send({ tier: 'tier1', returnTo: `/members/${RL_SLUG}` });
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
    } finally {
      rlMod.resetRateLimitForTests();
    }
  });
});

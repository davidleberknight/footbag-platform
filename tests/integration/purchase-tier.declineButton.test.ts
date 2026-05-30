/**
 * POST /payments/checkout/:sessionId/decline (stub adapter) — the tester-facing
 * decline button.
 *
 * Exercises the payment-failure path end to end: it forces the stub outcome to
 * 'failure', so the signed synthetic event is payment_intent.payment_failed,
 * which the real webhook handler transitions pending -> failed with no tier
 * grant, then redirects to the cancel page. Mirrors the confirm/cancel route
 * tests. The live-mode (route-unregistered) 404 lives in devRoutes.prodGate.test.ts
 * (one PAYMENT_ADAPTER per booted file).
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3439');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember, createTestSessionJwt, completeOnboarding } from '../fixtures/factories';

const MEMBER_ID = 'decline-route-001';
const MEMBER_SLUG = 'decliner';
const OTHER_ID = 'decline-route-002';
const OTHER_SLUG = 'decline-imposter';

let createApp: Awaited<ReturnType<typeof importApp>>;

function memberCookie(memberId: string = MEMBER_ID): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role: 'member' })}`;
}

async function startPurchase(slug: string, memberId: string): Promise<string> {
  const res = await request(createApp())
    .post(`/members/${slug}/purchase-tier`)
    .set('Cookie', memberCookie(memberId))
    .send({ tier: 'tier1', returnTo: `/members/${slug}` });
  expect(res.status).toBe(303);
  return res.headers.location.split('/').pop()!;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'Decliner', login_email: 'decliner@example.com' });
  insertMember(db, { id: OTHER_ID,  slug: OTHER_SLUG,  display_name: 'Imposter', login_email: 'declimp@example.com' });
  completeOnboarding(db, MEMBER_ID);
  completeOnboarding(db, OTHER_ID);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(async () => {
  const { resetPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
  resetPaymentAdapterForTests();
  // Clear any pending payment a prior test left so the one-pending-membership
  // partial index does not reject a fresh start.
  const db = new BetterSqlite3(dbPath);
  try {
    db.prepare("DELETE FROM payments WHERE status = 'pending'").run();
  } finally {
    db.close();
  }
});

describe('checkout page renders the decline affordance', () => {
  it('GET /payments/checkout/:sessionId includes a Decline payment button', async () => {
    const sessionId = await startPurchase(MEMBER_SLUG, MEMBER_ID);
    const res = await request(createApp())
      .get(`/payments/checkout/${sessionId}`)
      .set('Cookie', memberCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Decline payment');
    expect(res.text).toContain(`/payments/checkout/${sessionId}/decline`);
  });
});

describe('POST /payments/checkout/:sessionId/decline', () => {
  it('marks the payment failed, grants no tier, records the failure, and redirects to cancel', async () => {
    const sessionId = await startPurchase(MEMBER_SLUG, MEMBER_ID);

    const res = await request(createApp())
      .post(`/payments/checkout/${sessionId}/decline`)
      .set('Cookie', memberCookie());
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/\/payments\/cancel/);

    const db = new BetterSqlite3(dbPath);
    try {
      const payment = db
        .prepare('SELECT id, status FROM payments WHERE stripe_checkout_session_id = ?')
        .get(sessionId) as { id: string; status: string };
      expect(payment.status).toBe('failed');

      // No tier grant: the member stays at the tier0 baseline (no tier1 upgrade
      // row landed from the failed payment).
      const tier = db
        .prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?')
        .get(MEMBER_ID) as { tier_status: string } | undefined;
      expect(tier?.tier_status ?? 'tier0').toBe('tier0');

      const transitions = db
        .prepare("SELECT COUNT(*) AS c FROM payment_status_transitions WHERE payment_id = ? AND to_status = 'failed'")
        .get(payment.id) as { c: number };
      expect(transitions.c).toBe(1);

      const events = db
        .prepare("SELECT COUNT(*) AS c FROM stripe_events WHERE event_type = 'payment_intent.payment_failed'")
        .get() as { c: number };
      expect(events.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it('redirects an unauthenticated decline to login (requireAuth)', async () => {
    const res = await request(createApp()).post('/payments/checkout/cs_stub_anything/decline');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });

  it('404s when a different member declines a session they do not own', async () => {
    const sessionId = await startPurchase(MEMBER_SLUG, MEMBER_ID);
    const res = await request(createApp())
      .post(`/payments/checkout/${sessionId}/decline`)
      .set('Cookie', memberCookie(OTHER_ID));
    expect(res.status).toBe(404);
  });
});

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3971');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember } from '../fixtures/factories';

const MEMBER_T0_TIER1 = 'pay-svc-t0-tier1';
const MEMBER_T0_TIER2 = 'pay-svc-t0-tier2';
const MEMBER_FAIL     = 'pay-svc-fail';
const MEMBER_CANCEL   = 'pay-svc-cancel';
const MEMBER_IDEMP    = 'pay-svc-idemp';
const MEMBER_DBL      = 'pay-svc-dbl';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_T0_TIER1, slug: 't0_buy_tier1', display_name: 'Buyer 1', login_email: 'buyer1@example.com' });
  insertMember(db, { id: MEMBER_T0_TIER2, slug: 't0_buy_tier2', display_name: 'Buyer 2', login_email: 'buyer2@example.com' });
  insertMember(db, { id: MEMBER_FAIL,     slug: 't0_fail',      display_name: 'Failer',   login_email: 'fail@example.com' });
  insertMember(db, { id: MEMBER_CANCEL,   slug: 't0_cancel',    display_name: 'Canceler', login_email: 'cancel@example.com' });
  insertMember(db, { id: MEMBER_IDEMP,    slug: 't0_idemp',     display_name: 'Idemp',    login_email: 'idemp@example.com' });
  insertMember(db, { id: MEMBER_DBL,      slug: 't0_dbl',       display_name: 'Doubler',  login_email: 'dbl@example.com' });
  db.close();
  await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(async () => {
  const { resetPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
  resetPaymentAdapterForTests();
});

describe('payment workflow (stub adapter, Stripe-flow mirror)', () => {
  it('Tier 0 -> Tier 1: success flow writes payment, transition, grant, tier_current, audit', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { getStubPaymentAdapterForTests, getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
    getPaymentAdapter();
    const result = await paymentService.startMembershipPurchase(MEMBER_T0_TIER1, 'tier1', `/members/t0_buy_tier1`);
    const stub = getStubPaymentAdapterForTests()!;
    const { rawBody, signature } = stub.buildSignedStubWebhookEvent(result.sessionId);
    paymentService.handleWebhook(rawBody, signature);

    const testDb = new BetterSqlite3(dbPath);
    try {
      const payment = testDb.prepare('SELECT * FROM payments WHERE id = ?').get(result.paymentId) as Record<string, unknown>;
      expect(payment.status).toBe('succeeded');
      expect(payment.payment_type).toBe('membership');
      expect(payment.purchased_tier_status).toBe('tier1');
      expect(payment.amount_cents).toBe(1000);
      expect(payment.member_id).toBe(MEMBER_T0_TIER1);
      expect(typeof payment.stripe_checkout_session_id).toBe('string');
      expect(typeof payment.stripe_payment_intent_id).toBe('string');

      const transition = testDb.prepare(
        'SELECT * FROM payment_status_transitions WHERE payment_id = ? AND to_status = ?',
      ).get(result.paymentId, 'succeeded') as Record<string, unknown>;
      expect(transition.from_status).toBe('pending');
      expect(typeof transition.stripe_event_id).toBe('string');

      const tier = testDb.prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?').get(MEMBER_T0_TIER1) as Record<string, unknown>;
      expect(tier.tier_status).toBe('tier1');

      const grant = testDb.prepare(
        'SELECT * FROM member_tier_grants WHERE member_id = ? ORDER BY created_at DESC LIMIT 1',
      ).get(MEMBER_T0_TIER1) as Record<string, unknown>;
      expect(grant.reason_code).toBe('purchase.tier1');
      expect(grant.related_payment_id).toBe(result.paymentId);

      const audit = testDb.prepare(
        "SELECT * FROM audit_entries WHERE entity_id = ? AND action_type = 'tier.purchase_grant'",
      ).get(MEMBER_T0_TIER1) as Record<string, unknown> | undefined;
      expect(audit).toBeTruthy();

      const paymentAudit = testDb.prepare(
        "SELECT * FROM audit_entries WHERE entity_id = ? AND action_type = 'payment.succeeded'",
      ).get(result.paymentId) as Record<string, unknown> | undefined;
      expect(paymentAudit).toBeTruthy();
    } finally {
      testDb.close();
    }
  });

  it('Tier 0 -> Tier 2: success flow upgrades to tier2 at $50', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { getStubPaymentAdapterForTests, getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
    getPaymentAdapter();
    const result = await paymentService.startMembershipPurchase(MEMBER_T0_TIER2, 'tier2', `/members/t0_buy_tier2`);
    const stub = getStubPaymentAdapterForTests()!;
    const { rawBody, signature } = stub.buildSignedStubWebhookEvent(result.sessionId);
    paymentService.handleWebhook(rawBody, signature);

    const testDb = new BetterSqlite3(dbPath);
    try {
      const payment = testDb.prepare('SELECT * FROM payments WHERE id = ?').get(result.paymentId) as Record<string, unknown>;
      expect(payment.purchased_tier_status).toBe('tier2');
      expect(payment.amount_cents).toBe(5000);

      const tier = testDb.prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?').get(MEMBER_T0_TIER2) as Record<string, unknown>;
      expect(tier.tier_status).toBe('tier2');
    } finally {
      testDb.close();
    }
  });

  it("setNextOutcome('failure'): payment transitions to failed, no grant, no tier change", async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { getStubPaymentAdapterForTests, getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
    getPaymentAdapter();
    const stub = getStubPaymentAdapterForTests()!;
    stub.setNextOutcome('failure');

    const result = await paymentService.startMembershipPurchase(MEMBER_FAIL, 'tier1', `/members/t0_fail`);
    const { rawBody, signature } = stub.buildSignedStubWebhookEvent(result.sessionId);
    paymentService.handleWebhook(rawBody, signature);

    const testDb = new BetterSqlite3(dbPath);
    try {
      const payment = testDb.prepare('SELECT status FROM payments WHERE id = ?').get(result.paymentId) as Record<string, unknown>;
      expect(payment.status).toBe('failed');

      const tier = testDb.prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?').get(MEMBER_FAIL) as Record<string, unknown> | undefined;
      expect(tier?.tier_status ?? 'tier0').toBe('tier0');

      const grantCount = (testDb.prepare(
        "SELECT COUNT(*) AS c FROM member_tier_grants WHERE member_id = ? AND reason_code LIKE 'purchase.%'",
      ).get(MEMBER_FAIL) as { c: number }).c;
      expect(grantCount).toBe(0);
    } finally {
      testDb.close();
    }
  });

  it("setNextOutcome('cancel'): payment transitions to canceled, no grant", async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { getStubPaymentAdapterForTests, getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
    getPaymentAdapter();
    const stub = getStubPaymentAdapterForTests()!;
    stub.setNextOutcome('cancel');

    const result = await paymentService.startMembershipPurchase(MEMBER_CANCEL, 'tier1', `/members/t0_cancel`);
    const { rawBody, signature } = stub.buildSignedStubWebhookEvent(result.sessionId);
    paymentService.handleWebhook(rawBody, signature);

    const testDb = new BetterSqlite3(dbPath);
    try {
      const payment = testDb.prepare('SELECT status FROM payments WHERE id = ?').get(result.paymentId) as Record<string, unknown>;
      expect(payment.status).toBe('canceled');
      const tier = testDb.prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?').get(MEMBER_CANCEL) as Record<string, unknown> | undefined;
      expect(tier?.tier_status ?? 'tier0').toBe('tier0');
    } finally {
      testDb.close();
    }
  });

  it('webhook idempotency: replaying the same event id does not double-apply effects', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { getStubPaymentAdapterForTests, getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
    getPaymentAdapter();
    const stub = getStubPaymentAdapterForTests()!;
    const result = await paymentService.startMembershipPurchase(MEMBER_IDEMP, 'tier1', `/members/t0_idemp`);
    const { rawBody, signature } = stub.buildSignedStubWebhookEvent(result.sessionId);
    const eventId = (JSON.parse(rawBody) as { id: string }).id;

    paymentService.handleWebhook(rawBody, signature);
    paymentService.handleWebhook(rawBody, signature); // replay

    const testDb = new BetterSqlite3(dbPath);
    try {
      const transitions = testDb.prepare(
        'SELECT COUNT(*) AS c FROM payment_status_transitions WHERE payment_id = ?',
      ).get(result.paymentId) as { c: number };
      expect(transitions.c).toBe(1);

      const grants = testDb.prepare(
        "SELECT COUNT(*) AS c FROM member_tier_grants WHERE member_id = ? AND reason_code = 'purchase.tier1'",
      ).get(MEMBER_IDEMP) as { c: number };
      expect(grants.c).toBe(1);

      const stripeEvent = testDb.prepare(
        'SELECT * FROM stripe_events WHERE event_id = ?',
      ).get(eventId) as Record<string, unknown>;
      expect(stripeEvent.processing_status).toBe('processed');
      expect(stripeEvent.attempts).toBe(1);
    } finally {
      testDb.close();
    }
  });

  it('a second pending membership purchase for the same member is rejected', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { ConflictError } = await import('../../src/services/serviceErrors');
    const { getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
    getPaymentAdapter();

    await paymentService.startMembershipPurchase(MEMBER_DBL, 'tier1', `/members/t0_dbl`);
    await expect(
      paymentService.startMembershipPurchase(MEMBER_DBL, 'tier1', `/members/t0_dbl`),
    ).rejects.toBeInstanceOf(ConflictError);

    const testDb = new BetterSqlite3(dbPath);
    try {
      const pending = testDb.prepare(
        "SELECT COUNT(*) AS c FROM payments WHERE member_id = ? AND status = 'pending' AND payment_type = 'membership'",
      ).get(MEMBER_DBL) as { c: number };
      expect(pending.c).toBe(1);
    } finally {
      testDb.close();
    }
  });

  it('startDonation and startEventRegistrationPayment throw (not yet implemented)', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    expect(() => paymentService.startDonation('m', 1000, null, false)).toThrow(/not yet implemented/i);
    expect(() => paymentService.startEventRegistrationPayment('m', 'e', 1000)).toThrow(/not yet implemented/i);
  });
});

describe('webhook correlation fallback (deferred PaymentIntent creation)', () => {
  // Stripe may not create the PaymentIntent until the buyer submits payment,
  // so the pending row inserted at checkout-session creation can carry a NULL
  // stripe_payment_intent_id. The intent's metadata carries paymentId (stamped
  // at session creation); the webhook handler falls back to it and backfills
  // the intent id onto the row.
  const M_FB_OK   = 'pay-svc-fb-ok';
  const M_FB_FAIL = 'pay-svc-fb-fail';
  const M_FB_BIND = 'pay-svc-fb-bind';

  beforeAll(() => {
    const db = new BetterSqlite3(dbPath);
    insertMember(db, { id: M_FB_OK,   slug: 'fb_ok',   display_name: 'FB Ok',   login_email: 'fb-ok@example.com' });
    insertMember(db, { id: M_FB_FAIL, slug: 'fb_fail', display_name: 'FB Fail', login_email: 'fb-fail@example.com' });
    insertMember(db, { id: M_FB_BIND, slug: 'fb_bind', display_name: 'FB Bind', login_email: 'fb-bind@example.com' });
    db.close();
  });

  async function startWithNullIntent(memberId: string, slug: string): Promise<string> {
    const { paymentService } = await import('../../src/services/paymentService');
    const { getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
    getPaymentAdapter();
    const result = await paymentService.startMembershipPurchase(memberId, 'tier1', `/members/${slug}`);
    const db = new BetterSqlite3(dbPath);
    try {
      db.prepare('UPDATE payments SET stripe_payment_intent_id = NULL WHERE id = ?').run(result.paymentId);
    } finally {
      db.close();
    }
    return result.paymentId;
  }

  async function signedIntentEvent(
    type: 'payment_intent.succeeded' | 'payment_intent.payment_failed',
    paymentIntentId: string,
    metadata: Record<string, string>,
    eventId: string,
  ): Promise<{ rawBody: string; signature: string }> {
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const rawBody = JSON.stringify({
      id: eventId,
      type,
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: paymentIntentId, amount: 2500, currency: 'usd', metadata } },
    });
    return { rawBody, signature: signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET) };
  }

  it('succeeded event with unknown intent id resolves via metadata.paymentId, backfills, and grants the tier', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const paymentId = await startWithNullIntent(M_FB_OK, 'fb_ok');
    const { rawBody, signature } = await signedIntentEvent(
      'payment_intent.succeeded', 'pi_deferred_ok_1', { paymentId, memberId: M_FB_OK }, 'evt_fb_ok_1',
    );
    const outcome = paymentService.handleWebhook(rawBody, signature);
    expect(outcome.outcome).toBe('processed');

    const db = new BetterSqlite3(dbPath);
    try {
      const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as Record<string, unknown>;
      expect(row.status).toBe('succeeded');
      expect(row.stripe_payment_intent_id).toBe('pi_deferred_ok_1');
      const tier = db.prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?').get(M_FB_OK) as { tier_status?: string } | undefined;
      expect(tier?.tier_status).toBe('tier1');
    } finally {
      db.close();
    }
  });

  it('payment_failed event with unknown intent id resolves via metadata.paymentId and backfills', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const paymentId = await startWithNullIntent(M_FB_FAIL, 'fb_fail');
    const { rawBody, signature } = await signedIntentEvent(
      'payment_intent.payment_failed', 'pi_deferred_fail_1', { paymentId, memberId: M_FB_FAIL }, 'evt_fb_fail_1',
    );
    const outcome = paymentService.handleWebhook(rawBody, signature);
    expect(outcome.outcome).toBe('processed');

    const db = new BetterSqlite3(dbPath);
    try {
      const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as Record<string, unknown>;
      expect(row.status).toBe('failed');
      expect(row.stripe_payment_intent_id).toBe('pi_deferred_fail_1');
    } finally {
      db.close();
    }
  });

  it('metadata pointing at a row already bound to a different intent is not trusted', async () => {
    const { paymentService, RecoverableWebhookError } = await import('../../src/services/paymentService');
    const { getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
    getPaymentAdapter();
    // Bound row: keep the stub-issued intent id in place.
    const result = await paymentService.startMembershipPurchase(M_FB_BIND, 'tier1', '/members/fb_bind');
    const { rawBody, signature } = await signedIntentEvent(
      'payment_intent.succeeded', 'pi_evil_1', { paymentId: result.paymentId, memberId: M_FB_BIND }, 'evt_fb_bind_1',
    );
    expect(() => paymentService.handleWebhook(rawBody, signature)).toThrow(RecoverableWebhookError);

    const db = new BetterSqlite3(dbPath);
    try {
      const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(result.paymentId) as Record<string, unknown>;
      expect(row.status).toBe('pending');
      expect(row.stripe_payment_intent_id).not.toBe('pi_evil_1');
    } finally {
      db.close();
    }
  });

  it('unknown intent with no metadata still throws RecoverableWebhookError (Stripe retries)', async () => {
    const { paymentService, RecoverableWebhookError } = await import('../../src/services/paymentService');
    const { rawBody, signature } = await signedIntentEvent(
      'payment_intent.succeeded', 'pi_nobody_1', {}, 'evt_fb_none_1',
    );
    expect(() => paymentService.handleWebhook(rawBody, signature)).toThrow(RecoverableWebhookError);
  });
});

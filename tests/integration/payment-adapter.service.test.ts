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

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_T0_TIER1, slug: 't0_buy_tier1', display_name: 'Buyer 1', login_email: 'buyer1@example.com' });
  insertMember(db, { id: MEMBER_T0_TIER2, slug: 't0_buy_tier2', display_name: 'Buyer 2', login_email: 'buyer2@example.com' });
  insertMember(db, { id: MEMBER_FAIL,     slug: 't0_fail',      display_name: 'Failer',   login_email: 'fail@example.com' });
  insertMember(db, { id: MEMBER_CANCEL,   slug: 't0_cancel',    display_name: 'Canceler', login_email: 'cancel@example.com' });
  insertMember(db, { id: MEMBER_IDEMP,    slug: 't0_idemp',     display_name: 'Idemp',    login_email: 'idemp@example.com' });
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
    const event = stub.buildStubWebhookEvent(result.sessionId);
    await paymentService.handleWebhook(JSON.stringify(event), 'stub');

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
    const event = stub.buildStubWebhookEvent(result.sessionId);
    await paymentService.handleWebhook(JSON.stringify(event), 'stub');

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
    const event = stub.buildStubWebhookEvent(result.sessionId);
    await paymentService.handleWebhook(JSON.stringify(event), 'stub');

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
    const event = stub.buildStubWebhookEvent(result.sessionId);
    await paymentService.handleWebhook(JSON.stringify(event), 'stub');

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
    const event = stub.buildStubWebhookEvent(result.sessionId);

    await paymentService.handleWebhook(JSON.stringify(event), 'stub');
    await paymentService.handleWebhook(JSON.stringify(event), 'stub'); // replay

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
      ).get(event.id) as Record<string, unknown>;
      expect(stripeEvent.processing_status).toBe('processed');
      expect(stripeEvent.attempts).toBe(1);
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

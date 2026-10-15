import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3971');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember, insertSystemConfig } from '../fixtures/factories';

const MEMBER_T0_TIER1 = 'pay-svc-t0-tier1';
const MEMBER_T0_TIER2 = 'pay-svc-t0-tier2';
const MEMBER_FAIL     = 'pay-svc-fail';
const MEMBER_CANCEL   = 'pay-svc-cancel';
const MEMBER_IDEMP    = 'pay-svc-idemp';
const MEMBER_DBL      = 'pay-svc-dbl';
const MEMBER_PAID     = 'pay-svc-paid';
const MEMBER_SAVED_CUS = 'pay-svc-saved-cus';
const MEMBER_NO_CUS    = 'pay-svc-no-cus';
const MEMBER_RELEASED_PAID = 'pay-svc-released-paid';
const MEMBER_UNSETTLED = 'pay-svc-unsettled';
const MEMBER_OPEN_FAILS = 'pay-svc-open-fails';
const MEMBER_RACE      = 'pay-svc-race';
const MEMBER_GIFT_RACE = 'pay-svc-gift-race';
const MEMBER_GIFT_UNSETTLED = 'pay-svc-gift-unsettled';
const MEMBER_TIER_RACE = 'pay-svc-tier-race';
const ATTEMPTS_PER_HOUR = 4;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_T0_TIER1, slug: 't0_buy_tier1', display_name: 'Buyer 1', login_email: 'buyer1@example.com' });
  insertMember(db, { id: MEMBER_T0_TIER2, slug: 't0_buy_tier2', display_name: 'Buyer 2', login_email: 'buyer2@example.com' });
  insertMember(db, { id: MEMBER_FAIL,     slug: 't0_fail',      display_name: 'Failer',   login_email: 'fail@example.com' });
  insertMember(db, { id: MEMBER_CANCEL,   slug: 't0_cancel',    display_name: 'Canceler', login_email: 'cancel@example.com' });
  insertMember(db, { id: MEMBER_IDEMP,    slug: 't0_idemp',     display_name: 'Idemp',    login_email: 'idemp@example.com' });
  insertMember(db, { id: MEMBER_DBL,      slug: 't0_dbl',       display_name: 'Doubler',  login_email: 'dbl@example.com' });
  insertMember(db, { id: MEMBER_PAID,     slug: 't0_paid',      display_name: 'Payer',    login_email: 'paid@example.com' });
  insertMember(db, {
    id: MEMBER_SAVED_CUS, slug: 't0_saved_cus', display_name: 'Repeat Payer', login_email: 'saved@example.com',
    stripe_customer_id: 'cus_member_saved',
  });
  insertMember(db, { id: MEMBER_NO_CUS,   slug: 't0_no_cus',    display_name: 'First Timer', login_email: 'nocus@example.com' });
  insertMember(db, { id: MEMBER_RELEASED_PAID, slug: 't0_released_paid', display_name: 'Late Payer', login_email: 'latepay@example.com' });
  insertMember(db, { id: MEMBER_UNSETTLED, slug: 't0_unsettled', display_name: 'Unsettled', login_email: 'unsettled@example.com' });
  insertMember(db, { id: MEMBER_OPEN_FAILS, slug: 't0_open_fails', display_name: 'Open Fails', login_email: 'openfails@example.com' });
  insertMember(db, { id: MEMBER_RACE, slug: 't0_race', display_name: 'Racer', login_email: 'racer@example.com' });
  insertMember(db, { id: MEMBER_GIFT_RACE, slug: 't0_gift_race', display_name: 'Gift Racer', login_email: 'giftrace@example.com' });
  insertMember(db, { id: MEMBER_GIFT_UNSETTLED, slug: 't0_gift_unsettled', display_name: 'Gift Unsettled', login_email: 'giftunsettled@example.com' });
  insertMember(db, { id: MEMBER_TIER_RACE, slug: 't0_tier_race', display_name: 'Tier Racer', login_email: 'tierrace@example.com' });
  // Four attempts an hour, so a slot a race's losing submit failed to give
  // back shows as a refusal; no other case here needs more than four.
  insertSystemConfig(db, { config_key: 'purchase_tier_rate_limit_per_hour', value_json: String(ATTEMPTS_PER_HOUR) });
  insertSystemConfig(db, { config_key: 'donation_rate_limit_per_hour', value_json: String(ATTEMPTS_PER_HOUR) });
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

      // ordering-is-the-contract: this member is granted exactly one tier in the
      // suite, and tier-grant ids are UUIDv7 besides, so the ordering names a
      // single defined row either way.
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

  it("setNextOutcome('failure'): the declined attempt is recorded, the payment stays open, no grant", async () => {
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
      // A declined card does not end the payment: the checkout session is still
      // open and another card can still settle it.
      const payment = testDb.prepare('SELECT status FROM payments WHERE id = ?').get(result.paymentId) as Record<string, unknown>;
      expect(payment.status).toBe('pending');

      const attempt = testDb.prepare(
        `SELECT COUNT(*) AS c FROM payment_status_transitions
         WHERE payment_id = ? AND event_type = 'payment_intent.payment_failed'`,
      ).get(result.paymentId) as { c: number };
      expect(attempt.c).toBe(1);

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
      expect(stripeEvent).toBeDefined();
      expect(typeof stripeEvent.processed_at).toBe('string');
      expect(stripeEvent.processed_at).not.toBe('');
    } finally {
      testDb.close();
    }
  });

  // Defect caught: a member who cancels at the provider and then chooses a
  // different tier is refused for the hour or two the abandoned checkout stays
  // open, told to cancel what they already cancelled; or the old row is closed
  // without the transition and audit row the expiry webhook would write; or
  // the webhook that arrives afterwards moves the row a second time.
  it('a second same-tier purchase returns to the open checkout; a different tier releases it and opens its own', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { getPaymentAdapter, getStubPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
    getPaymentAdapter();
    const stub = getStubPaymentAdapterForTests()!;

    // The first session is one the buyer walks away from, so the simulation's
    // webhook for it is the expiry.
    stub.setNextOutcome('cancel');
    const first = await paymentService.startMembershipPurchase(MEMBER_DBL, 'tier1', `/members/t0_dbl`);
    const repeat = await paymentService.startMembershipPurchase(MEMBER_DBL, 'tier1', `/members/t0_dbl`);
    expect(repeat).toEqual(first);

    const other = await paymentService.startMembershipPurchase(MEMBER_DBL, 'tier2', `/members/t0_dbl`);
    expect(other.paymentId).not.toBe(first.paymentId);

    const read = () => {
      const testDb = new BetterSqlite3(dbPath, { readonly: true });
      try {
        return {
          rows: testDb.prepare(
            "SELECT id, status, purchased_tier_status FROM payments WHERE member_id = ? AND payment_type = 'membership' ORDER BY id",
          ).all(MEMBER_DBL) as Array<{ id: string; status: string; purchased_tier_status: string }>,
          transitions: testDb.prepare(
            "SELECT from_status, to_status FROM payment_status_transitions WHERE payment_id = ?",
          ).all(first.paymentId) as Array<{ from_status: string; to_status: string }>,
          audits: testDb.prepare(
            "SELECT actor_type, actor_member_id FROM audit_entries WHERE action_type = 'payment.canceled' AND entity_id = ?",
          ).all(first.paymentId) as Array<{ actor_type: string; actor_member_id: string }>,
        };
      } finally {
        testDb.close();
      }
    };
    const released = read();
    expect(released.rows.find((r) => r.id === first.paymentId)?.status).toBe('canceled');
    expect(released.rows.find((r) => r.id === other.paymentId)).toMatchObject({ status: 'pending', purchased_tier_status: 'tier2' });
    expect(released.transitions).toEqual([{ from_status: 'pending', to_status: 'canceled' }]);
    expect(released.audits).toEqual([{ actor_type: 'member', actor_member_id: MEMBER_DBL }]);
    expect(await stub.openCheckoutUrl(first.sessionId)).toBeNull();

    // The provider's own expiry event for the released session arrives later
    // and finds nothing to do.
    const { rawBody, signature } = stub.buildSignedStubWebhookEvent(first.sessionId);
    paymentService.handleWebhook(rawBody, signature);
    expect(read()).toEqual(released);
  });

  // Defect caught: a checkout the buyer actually paid for is cancelled locally
  // because the member started another purchase, so the payment's settlement
  // can no longer be applied and they are charged without the tier.
  it('a different-tier purchase leaves a checkout the provider reports paid, and is refused', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { ConflictError } = await import('../../src/services/serviceErrors');
    const { getPaymentAdapter, setPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
    const stub = getPaymentAdapter();

    const first = await paymentService.startMembershipPurchase(MEMBER_PAID, 'tier1', `/members/t0_paid`);
    setPaymentAdapterForTests({ ...stub, closeCheckoutSession: async () => false });
    await expect(
      paymentService.startMembershipPurchase(MEMBER_PAID, 'tier2', `/members/t0_paid`),
    ).rejects.toBeInstanceOf(ConflictError);

    const testDb = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const rows = testDb.prepare(
        "SELECT id, status FROM payments WHERE member_id = ? AND payment_type = 'membership'",
      ).all(MEMBER_PAID) as Array<{ id: string; status: string }>;
      expect(rows).toEqual([{ id: first.paymentId, status: 'pending' }]);
    } finally {
      testDb.close();
    }
  });

  it('startEventRegistrationPayment throws a typed unavailable error (clean 503, not a stack-trace 500)', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { ServiceUnavailableError } = await import('../../src/services/serviceErrors');
    expect(() => paymentService.startEventRegistrationPayment('m', 'e', 1000)).toThrow(ServiceUnavailableError);
  });
});

describe('a checkout submitted twice, overlapping, or after it was paid', () => {
  async function load() {
    const { paymentService } = await import('../../src/services/paymentService');
    const { ConflictError } = await import('../../src/services/serviceErrors');
    const adapterMod = await import('../../src/adapters/paymentAdapter');
    adapterMod.getPaymentAdapter();
    return { paymentService, ConflictError, adapterMod, stub: adapterMod.getStubPaymentAdapterForTests()! };
  }

  function rowsFor(memberId: string, paymentType: string) {
    const testDb = new BetterSqlite3(dbPath, { readonly: true });
    try {
      return testDb.prepare(
        'SELECT id, status FROM payments WHERE member_id = ? AND payment_type = ? ORDER BY id',
      ).all(memberId, paymentType) as Array<{ id: string; status: string }>;
    } finally {
      testDb.close();
    }
  }

  function incompleteSubscriptionsFor(memberId: string): number {
    const testDb = new BetterSqlite3(dbPath, { readonly: true });
    try {
      return (testDb.prepare(
        "SELECT COUNT(*) AS n FROM recurring_donation_subscriptions WHERE member_id = ? AND status = 'incomplete'",
      ).get(memberId) as { n: number }).n;
    } finally {
      testDb.close();
    }
  }

  // Defect caught: a checkout the member's new purchase released can still be
  // paid in the simulation, so "released, then paid" is never exercised and a
  // regression that grants a tier for a cancelled checkout goes unseen.
  it('a released checkout cannot be paid afterwards', async () => {
    const { paymentService, stub } = await load();
    const first = await paymentService.startMembershipPurchase(MEMBER_RELEASED_PAID, 'tier1', '/members/t0_released_paid');
    await paymentService.startMembershipPurchase(MEMBER_RELEASED_PAID, 'tier2', '/members/t0_released_paid');
    expect(await stub.openCheckoutUrl(first.sessionId)).toBeNull();

    expect(paymentService.getStubCheckoutSession(first.sessionId, MEMBER_RELEASED_PAID)).toBeNull();
    expect(paymentService.completeStubCheckout(first.sessionId, MEMBER_RELEASED_PAID, 'confirm')).toBeNull();
    expect(rowsFor(MEMBER_RELEASED_PAID, 'membership').find((r) => r.id === first.paymentId)?.status).toBe('canceled');
  });

  // Defect caught: the member paid, then resubmitted before the provider's
  // confirmation arrived; the purchase opens and abandons a second session,
  // spends their allowance, and tells them to "complete or cancel" a checkout
  // they can no longer do either to.
  it('a resubmit after paying, before the confirmation arrives, opens nothing and says it is still confirming', async () => {
    const { paymentService, ConflictError, stub } = await load();
    const first = await paymentService.startMembershipPurchase(MEMBER_UNSETTLED, 'tier1', '/members/t0_unsettled');
    // The provider completes the session; its webhook has not been delivered.
    stub.buildSignedStubWebhookEvent(first.sessionId);
    const sessionsBefore = stub.sessions.size;

    const err = await paymentService.startMembershipPurchase(MEMBER_UNSETTLED, 'tier1', '/members/t0_unsettled')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as Error).message).toBe(
      'We are still confirming your last membership checkout. Please try again in a few minutes.',
    );
    expect(stub.sessions.size).toBe(sessionsBefore);
    expect(rowsFor(MEMBER_UNSETTLED, 'membership')).toEqual([{ id: first.paymentId, status: 'pending' }]);
  });

  // Defect caught: the provider errors while the resubmit asks for the open
  // checkout's address, and the member gets a server error instead of a way
  // to pay.
  it('a provider error while reopening a checkout falls through rather than failing', async () => {
    const { paymentService, adapterMod, stub } = await load();
    await paymentService.startMembershipPurchase(MEMBER_OPEN_FAILS, 'tier1', '/members/t0_open_fails');
    await paymentService.startDonation(MEMBER_OPEN_FAILS, 2500, null, false, '/members/t0_open_fails');
    adapterMod.setPaymentAdapterForTests({
      ...stub,
      openCheckoutUrl: async () => { throw new Error('provider unavailable'); },
    });

    const membership = await paymentService.startMembershipPurchase(MEMBER_OPEN_FAILS, 'tier1', '/members/t0_open_fails');
    expect(membership.redirectUrl).toMatch(/^\/payments\/checkout\//);
    const gift = await paymentService.startDonation(MEMBER_OPEN_FAILS, 2500, null, false, '/members/t0_open_fails');
    expect(gift.redirectUrl).toMatch(/^\/payments\/checkout\//);
  });

  // Defect caught: two overlapping first purchases both open a provider
  // session; the second meets the one-pending-purchase rule and the member is
  // shown "already in progress" while an orphaned session stays open.
  it('two overlapping first purchases of one tier end at one checkout', async () => {
    const { paymentService, stub } = await load();
    const [a, b] = await Promise.all([
      paymentService.startMembershipPurchase(MEMBER_RACE, 'tier1', '/members/t0_race'),
      paymentService.startMembershipPurchase(MEMBER_RACE, 'tier1', '/members/t0_race'),
    ]);
    expect(b.paymentId).toBe(a.paymentId);
    expect(b.sessionId).toBe(a.sessionId);
    expect(rowsFor(MEMBER_RACE, 'membership')).toEqual([{ id: a.paymentId, status: 'pending' }]);
    // The losing request's own session is closed, not left open at the provider.
    const orphans = [...stub.sessions.values()]
      .filter((s) => s.memberId === MEMBER_RACE && s.sessionId !== a.sessionId);
    expect(orphans).toHaveLength(1);
    expect(await stub.openCheckoutUrl(orphans[0].sessionId)).toBeNull();

    // The losing submit gave back its slot: the race holds one of four, so
    // three more purchases (each releasing the last) are still allowed.
    for (const tier of ['tier2', 'tier1', 'tier2'] as const) {
      await expect(paymentService.startMembershipPurchase(MEMBER_RACE, tier, '/members/t0_race')).resolves.toBeDefined();
    }
  });

  // Defect caught: overlapping first purchases of two different tiers both
  // land on one checkout, so the member pays for a tier they did not choose
  // on the last click.
  it('overlapping first purchases of two different tiers are not merged', async () => {
    const { paymentService, ConflictError, stub } = await load();
    const outcomes = await Promise.allSettled([
      paymentService.startMembershipPurchase(MEMBER_TIER_RACE, 'tier1', '/members/t0_tier_race'),
      paymentService.startMembershipPurchase(MEMBER_TIER_RACE, 'tier2', '/members/t0_tier_race'),
    ]);
    const won = outcomes.filter((o) => o.status === 'fulfilled');
    const lost = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toBeInstanceOf(ConflictError);
    expect(rowsFor(MEMBER_TIER_RACE, 'membership')).toHaveLength(1);
    const open = [];
    for (const s of stub.sessions.values()) {
      if (s.memberId === MEMBER_TIER_RACE && await stub.openCheckoutUrl(s.sessionId)) open.push(s.sessionId);
    }
    expect(open).toHaveLength(1);
  });

  // Defect caught: two overlapping submits of one gift each open a checkout
  // and a pending record, so the donor can pay the same gift twice.
  it('two overlapping submits of one gift, one-time or yearly, end at one checkout', async () => {
    const { paymentService, stub } = await load();
    const openSessions = async (): Promise<number> => {
      let n = 0;
      for (const s of stub.sessions.values()) {
        if (s.memberId === MEMBER_GIFT_RACE && await stub.openCheckoutUrl(s.sessionId)) n += 1;
      }
      return n;
    };

    const [a, b] = await Promise.all([
      paymentService.startDonation(MEMBER_GIFT_RACE, 2500, 'Twice', false, '/members/t0_gift_race'),
      paymentService.startDonation(MEMBER_GIFT_RACE, 2500, 'Twice', false, '/members/t0_gift_race'),
    ]);
    expect(b.reference).toBe(a.reference);
    expect(rowsFor(MEMBER_GIFT_RACE, 'donation')).toHaveLength(1);
    // The losing request's own session is closed, not left open to be paid.
    expect(await openSessions()).toBe(1);

    const [c, d] = await Promise.all([
      paymentService.startDonation(MEMBER_GIFT_RACE, 3000, 'Yearly', true, '/members/t0_gift_race'),
      paymentService.startDonation(MEMBER_GIFT_RACE, 3000, 'Yearly', true, '/members/t0_gift_race'),
    ]);
    expect(d.reference).toBe(c.reference);
    expect(incompleteSubscriptionsFor(MEMBER_GIFT_RACE)).toBe(1);
    expect(await openSessions()).toBe(2);

    // Each losing submit gave back its slot: the two races hold two of four,
    // so two more gifts are still allowed.
    for (const amount of [4100, 4200]) {
      await expect(paymentService.startDonation(MEMBER_GIFT_RACE, amount, null, false, '/members/t0_gift_race'))
        .resolves.toBeDefined();
    }
  });

  // Defect caught: a gift paid at the provider whose confirmation has not yet
  // arrived no longer reopens, so a resubmit opens a second checkout and the
  // donor is charged twice for one gift.
  it('a resubmitted gift after paying, before the confirmation arrives, opens no second checkout', async () => {
    const { paymentService, ConflictError, stub } = await load();
    const message = 'We are still confirming your last donation checkout. Please try again in a few minutes.';
    for (const recurring of [false, true]) {
      const first = await paymentService.startDonation(MEMBER_GIFT_UNSETTLED, 4000, null, recurring, '/members/t0_gift_unsettled');
      stub.buildSignedStubWebhookEvent(first.sessionId);
      const sessionsBefore = stub.sessions.size;

      const err = await paymentService.startDonation(MEMBER_GIFT_UNSETTLED, 4000, null, recurring, '/members/t0_gift_unsettled')
        .catch((e: unknown) => e);
      expect(err, `recurring=${recurring}`).toBeInstanceOf(ConflictError);
      expect((err as Error).message).toBe(message);
      expect(stub.sessions.size, `recurring=${recurring}`).toBe(sessionsBefore);
    }
  });
});

// The provider mints a fresh Customer for any checkout that names none, so a
// member who already has one would end up with a second, and their payment
// history would be split across records nobody can reconcile provider-side.
describe('one-time checkouts reuse the member saved Stripe customer', () => {
  async function sessionFor(sessionId: string) {
    const { getStubPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
    return getStubPaymentAdapterForTests()!.sessions.get(sessionId);
  }

  it('a membership purchase carries the saved customer', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
    getPaymentAdapter();
    const result = await paymentService.startMembershipPurchase(MEMBER_SAVED_CUS, 'tier1', '/members/t0_saved_cus');
    expect((await sessionFor(result.sessionId))?.stripeCustomerId).toBe('cus_member_saved');
  });

  it('a one-time donation carries the saved customer', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
    getPaymentAdapter();
    const result = await paymentService.startDonation(MEMBER_SAVED_CUS, 2500, 'For the HoF', false, '/members/t0_saved_cus');
    expect((await sessionFor(result.sessionId))?.stripeCustomerId).toBe('cus_member_saved');
  });

  it('a member with no saved customer leaves the provider to create one', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
    getPaymentAdapter();
    const result = await paymentService.startDonation(MEMBER_NO_CUS, 2500, null, false, '/members/t0_no_cus');
    expect((await sessionFor(result.sessionId))?.stripeCustomerId).toBeNull();
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

  it('a succeeded payment enqueues a receipt email to the member', async () => {
    const M_RECEIPT = 'pay-svc-fb-receipt';
    const setupDb = new BetterSqlite3(dbPath);
    insertMember(setupDb, { id: M_RECEIPT, slug: 'fb_receipt', display_name: 'FB Receipt', login_email: 'fb-receipt@example.com' });
    setupDb.close();

    const { paymentService } = await import('../../src/services/paymentService');
    const paymentId = await startWithNullIntent(M_RECEIPT, 'fb_receipt');
    const { rawBody, signature } = await signedIntentEvent(
      'payment_intent.succeeded', 'pi_receipt_ok_1', { paymentId, memberId: M_RECEIPT }, 'evt_receipt_ok_1',
    );
    expect(paymentService.handleWebhook(rawBody, signature).outcome).toBe('processed');

    const db = new BetterSqlite3(dbPath);
    try {
      const receipt = db
        .prepare(`SELECT recipient_email, recipient_member_id, subject, body_text FROM outbox_emails WHERE idempotency_key = ?`)
        .get(`payment_receipt:${paymentId}:succeeded`) as
          | { recipient_email: string; recipient_member_id: string; subject: string; body_text: string }
          | undefined;
      expect(receipt).toBeDefined();
      expect(receipt!.recipient_email).toBe('fb-receipt@example.com');
      expect(receipt!.recipient_member_id).toBe(M_RECEIPT);
      expect(receipt!.subject).toContain('Payment received');
      expect(receipt!.body_text).toContain('Thank you for your payment.');

      // A receipt states when the money moved and whether it repeats, so the
      // member can file it without opening the site.
      const { created_at: paidAt } = db
        .prepare('SELECT created_at FROM payments WHERE id = ?')
        .get(paymentId) as { created_at: string };
      const { formatDateDisplay } = await import('../../src/services/dateFormat');
      expect(receipt!.body_text).toContain(formatDateDisplay(paidAt, { style: 'long' }));
      expect(receipt!.body_text).toContain('One-time payment');
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
      // The declined attempt is recorded but the payment stays open: the buyer is
      // still on the checkout page and can pay with another card.
      expect(row.status).toBe('pending');
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

  it('acknowledges an intent carrying no platform correlation, which retrying could never resolve', async () => {
    // Checkout stamps paymentId onto every intent this platform opens, so an
    // intent without it is not ours: a recurring donation's invoice raises its
    // own intent events, and Stripe delivers them here too. Answering those as
    // recoverable made Stripe retry an impossible lookup for days on every
    // renewal. The retry path is still exercised for an intent that IS ours but
    // whose row is not visible yet.
    const { paymentService } = await import('../../src/services/paymentService');
    const { rawBody, signature } = await signedIntentEvent(
      'payment_intent.succeeded', 'pi_nobody_1', {}, 'evt_fb_none_1',
    );
    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'ignored' });
  });
});

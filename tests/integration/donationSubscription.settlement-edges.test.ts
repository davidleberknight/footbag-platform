/**
 * Recurring donations at the edges of settlement: the orderings, identities and
 * side-effect failures that sit between a provider event and the local mirror.
 *
 * The contract these assert: a gift the provider is billing always ends up with
 * a local row its renewals can settle against, even when its checkout was
 * closed out first; the row's own member, never the event's metadata, owns what
 * the event writes; a failure for an invoice already paid never moves the gift
 * or mails the member; a notice sent after an event committed never turns the
 * settled event into an error; and a checkout refused while an earlier one is
 * still confirming spends none of the member's attempts.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4033');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember } from '../fixtures/factories';

const M_REOPENED = 'edge-reopened';
const M_OWNER = 'edge-owner';
const M_STRANGER = 'edge-stranger';
const M_SAME_SECOND = 'edge-same-second';
const M_SAME_SECOND_REFUNDED = 'edge-same-second-refunded';
const M_UNPAID_START = 'edge-unpaid-start';
const M_PAID_START = 'edge-paid-start';
const M_INVOICE_RACE = 'edge-invoice-race';
const M_OTHER_UNIQUE = 'edge-other-unique';
const M_RECEIPT = 'edge-receipt';
const M_NOTICE = 'edge-notice';
const M_ADMIN_ALERT = 'edge-admin-alert';
const M_DONATE_LIMIT = 'edge-donate-limit';
const M_WINNER_LIMIT = 'edge-winner-limit';
const M_MEMBERSHIP_LIMIT = 'edge-membership-limit';
const ALL_MEMBERS = [
  M_REOPENED, M_OWNER, M_STRANGER, M_SAME_SECOND, M_SAME_SECOND_REFUNDED, M_UNPAID_START, M_PAID_START,
  M_INVOICE_RACE, M_OTHER_UNIQUE, M_RECEIPT, M_NOTICE, M_ADMIN_ALERT,
  M_DONATE_LIMIT, M_WINNER_LIMIT, M_MEMBERSHIP_LIMIT,
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  ALL_MEMBERS.forEach((id, i) => {
    insertMember(db, {
      id,
      slug: `edge_${i}`,
      display_name: `Edge ${i}`,
      login_email: `edge${i}@example.com`,
    });
  });
  db.close();
  await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(async () => {
  const { resetPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
  resetPaymentAdapterForTests();
  (await import('../../src/services/rateLimitService')).resetRateLimitForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function openDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

async function svc() {
  return (await import('../../src/services/paymentService')).paymentService;
}

async function stubAdapter() {
  const mod = await import('../../src/adapters/paymentAdapter');
  mod.getPaymentAdapter();
  return mod.getStubPaymentAdapterForTests()!;
}

function row(sql: string, ...params: unknown[]): Record<string, unknown> | undefined {
  const db = openDb();
  try {
    return db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
  } finally {
    db.close();
  }
}

function count(sql: string, ...params: unknown[]): number {
  return (row(sql, ...params) as { c: number }).c;
}

/** A provider subscription.created event this test states in full, for the
 *  shapes the stub's own checkout completion never produces. */
async function signedCreated(o: {
  eventId: string;
  stripeSubscriptionId: string;
  status: string;
  metadata: Record<string, string>;
}): Promise<{ rawBody: string; signature: string }> {
  const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
  const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
  const rawBody = JSON.stringify({
    id: o.eventId,
    type: 'customer.subscription.created',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: o.stripeSubscriptionId,
        customer: `cus_${o.eventId}`,
        status: o.status,
        metadata: o.metadata,
      },
    },
  });
  return { rawBody, signature: signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET) };
}

async function activate(memberId: string): Promise<{
  sessionId: string; subscriptionId: string; stripeSubscriptionId: string;
}> {
  const paymentService = await svc();
  const stub = await stubAdapter();
  const started = await paymentService.startDonation(memberId, 2500, null, true, '/x');
  const created = stub.buildSignedStubWebhookEvent(started.sessionId);
  expect(paymentService.handleWebhook(created.rawBody, created.signature)).toEqual({
    outcome: 'processed',
  });
  return {
    sessionId: started.sessionId,
    subscriptionId: started.reference,
    stripeSubscriptionId: stub.sessions.get(started.sessionId)!.stripeSubscriptionId!,
  };
}

function outboxCount(keyPrefix: string): number {
  return count(
    'SELECT COUNT(*) AS c FROM outbox_emails WHERE idempotency_key LIKE ?',
    `${keyPrefix}%`,
  );
}

describe('a subscription confirmed after its checkout was closed out', () => {
  // Defect caught: the provider bills a gift whose checkout row was already
  // closed by the expiry, the created event is swallowed as a duplicate, and
  // every renewal is refused for redelivery forever, so the money is never
  // booked and the member is never acknowledged.
  it('mirrors the live subscription on a row of its own, and its renewal settles', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const started = await paymentService.startDonation(M_REOPENED, 2500, 'late', true, '/x');

    stub.overrideSessionOutcome(started.sessionId, 'cancel');
    const expired = stub.buildSignedStubWebhookEvent(started.sessionId);
    expect(paymentService.handleWebhook(expired.rawBody, expired.signature))
      .toEqual({ outcome: 'processed' });

    stub.overrideSessionOutcome(started.sessionId, 'success');
    const created = stub.buildSignedStubWebhookEvent(started.sessionId);
    expect(paymentService.handleWebhook(created.rawBody, created.signature))
      .toEqual({ outcome: 'processed' });

    const stripeSubscriptionId = stub.sessions.get(started.sessionId)!.stripeSubscriptionId!;
    const live = row(
      'SELECT * FROM recurring_donation_subscriptions WHERE stripe_subscription_id = ?',
      stripeSubscriptionId,
    )!;
    expect(live.status).toBe('active');
    expect(live.member_id).toBe(M_REOPENED);
    expect(live.donation_note).toBe('late');
    // The closed-out checkout stays as the member's history shows it.
    expect(live.id).not.toBe(started.reference);
    const abandoned = row(
      'SELECT * FROM recurring_donation_subscriptions WHERE id = ?', started.reference,
    )!;
    expect(abandoned.status).toBe('canceled');
    expect(abandoned.stripe_subscription_id).toBeNull();
    expect(count(
      `SELECT COUNT(*) AS c FROM recurring_donation_subscription_transitions
       WHERE recurring_subscription_id = ? AND lifecycle_event_code = 'activated'`,
      live.id,
    )).toBe(1);

    const invoice = stub.buildSignedStubSubscriptionEvent(started.sessionId, 'invoice_paid');
    expect(paymentService.handleWebhook(invoice.rawBody, invoice.signature))
      .toEqual({ outcome: 'processed' });
    expect(count(
      "SELECT COUNT(*) AS c FROM payments WHERE recurring_subscription_id = ? AND status = 'succeeded'",
      live.id,
    )).toBe(1);
  });
});

describe('the opened row, not the event metadata, names the member', () => {
  // Defect caught: an event whose metadata names someone else writes that
  // person's id into the ledger and audit trail, and pins the payer's provider
  // customer onto the wrong member's account.
  it('acknowledges an event naming a different member and writes nothing', async () => {
    const paymentService = await svc();
    await stubAdapter();
    const started = await paymentService.startDonation(M_OWNER, 2500, null, true, '/x');
    const evt = await signedCreated({
      eventId: 'evt_edge_wrong_member',
      stripeSubscriptionId: 'sub_edge_wrong_member',
      status: 'active',
      metadata: {
        subscriptionRecordId: started.reference,
        memberId: M_STRANGER,
        amountCents: '2500',
      },
    });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'ignored' });

    expect(row('SELECT status FROM recurring_donation_subscriptions WHERE id = ?', started.reference))
      .toEqual({ status: 'incomplete' });
    expect(row('SELECT stripe_customer_id FROM members WHERE id = ?', M_STRANGER))
      .toEqual({ stripe_customer_id: null });
    expect(count(
      'SELECT COUNT(*) AS c FROM recurring_donation_subscription_transitions WHERE member_id = ?',
      M_STRANGER,
    )).toBe(0);
  });
});

describe('the started notice follows the status the provider reported', () => {
  // Defect caught: a member whose first payment has not settled is told their
  // yearly gift has started, when nothing has been collected.
  it('sends no started notice for a subscription that is not yet collecting', async () => {
    const paymentService = await svc();
    await stubAdapter();
    const started = await paymentService.startDonation(M_UNPAID_START, 2500, null, true, '/x');
    const evt = await signedCreated({
      eventId: 'evt_edge_unpaid_start',
      stripeSubscriptionId: 'sub_edge_unpaid_start',
      status: 'incomplete',
      metadata: {
        subscriptionRecordId: started.reference,
        memberId: M_UNPAID_START,
        amountCents: '2500',
      },
    });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'processed' });
    expect(row('SELECT status FROM recurring_donation_subscriptions WHERE id = ?', started.reference))
      .toEqual({ status: 'past_due' });
    expect(outboxCount(`donation_subscription_started:${started.reference}:`)).toBe(0);
  });

  it('sends the started notice for an active subscription', async () => {
    const { subscriptionId } = await activate(M_PAID_START);
    expect(outboxCount(`donation_subscription_started:${subscriptionId}:`)).toBe(1);
  });
});

describe('a failure and a payment for one invoice in the same second', () => {
  // Defect caught: the provider stamps events to the second, so a failure
  // delivered after the payment that settled the same invoice reads as fresh,
  // moves a paid-up gift to past due and tells the member their charge failed.
  it('keeps the paid gift active and sends no charge-failed notice', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activate(M_SAME_SECOND);
    const createdSeconds = Math.floor(Date.now() / 1000) + 60;
    const invoiceId = 'in_edge_same_second';

    const paid = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_paid', {
      invoiceId, createdSeconds,
    });
    expect(paymentService.handleWebhook(paid.rawBody, paid.signature)).toEqual({ outcome: 'processed' });

    const failed = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_failed', {
      invoiceId, createdSeconds,
    });
    expect(paymentService.handleWebhook(failed.rawBody, failed.signature))
      .toEqual({ outcome: 'duplicate' });

    expect(row('SELECT status, failure_count FROM recurring_donation_subscriptions WHERE id = ?', subscriptionId))
      .toEqual({ status: 'active', failure_count: 0 });
    expect(outboxCount(`donation_subscription_charge_failed:${subscriptionId}:`)).toBe(0);
  });

  // Defect caught: once the paid renewal is refunded, a same-second failure
  // for its invoice is taken as fresh again, and the member whose money came
  // back is told their charge failed and moved to past due.
  it('treats an invoice whose payment was since refunded as paid', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activate(M_SAME_SECOND_REFUNDED);
    const createdSeconds = Math.floor(Date.now() / 1000) + 60;
    const invoiceId = 'in_edge_same_second_refunded';

    const paid = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_paid', {
      invoiceId, createdSeconds,
    });
    expect(paymentService.handleWebhook(paid.rawBody, paid.signature)).toEqual({ outcome: 'processed' });
    const db = openDb();
    try {
      // The refund itself is not what this case is about, only the state it leaves.
      db.prepare("UPDATE payments SET status = 'refunded' WHERE stripe_invoice_id = ?").run(invoiceId);
    } finally {
      db.close();
    }

    const failed = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_failed', {
      invoiceId, createdSeconds,
    });
    expect(paymentService.handleWebhook(failed.rawBody, failed.signature))
      .toEqual({ outcome: 'duplicate' });
    expect(row('SELECT status, failure_count FROM recurring_donation_subscriptions WHERE id = ?', subscriptionId))
      .toEqual({ status: 'active', failure_count: 0 });
    expect(outboxCount(`donation_subscription_charge_failed:${subscriptionId}:`)).toBe(0);
  });
});

describe('a unique violation while booking a renewal', () => {
  async function bookedInvoiceEvent(memberId: string, invoiceId: string) {
    const stub = await stubAdapter();
    const { sessionId } = await activate(memberId);
    return stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_paid', { invoiceId });
  }

  // Defect caught: a second delivery for the same invoice that loses the race
  // answers with an error instead of asking for the redelivery that restates it.
  it('asks for redelivery when another delivery booked the same invoice first', async () => {
    const paymentService = await svc();
    const { RecoverableWebhookError } = await import('../../src/services/paymentService');
    const stub = await stubAdapter();
    const { sessionId } = await activate(M_INVOICE_RACE);
    const invoiceId = 'in_edge_race';
    const first = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded', { invoiceId });
    expect(paymentService.handleWebhook(first.rawBody, first.signature)).toEqual({ outcome: 'processed' });

    // The second delivery's lookup ran before the first committed.
    const dbMod = await import('../../src/db/db');
    const real = dbMod.payments.findByStripeInvoiceId;
    let calls = 0;
    vi.spyOn(dbMod.payments, 'findByStripeInvoiceId', 'get').mockReturnValue({
      get: (...args: unknown[]) => (calls++ === 0 ? undefined : real.get(...args)),
    } as unknown as typeof real);

    const second = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_paid', { invoiceId });
    expect(() => paymentService.handleWebhook(second.rawBody, second.signature))
      .toThrow(RecoverableWebhookError);
  });

  // Defect caught: any unique violation in the booking, not only the invoice
  // one, is answered as a harmless race and retried forever with no alarm.
  it('lets any other unique violation surface as an unexpected error', async () => {
    const paymentService = await svc();
    const { RecoverableWebhookError } = await import('../../src/services/paymentService');
    const evt = await bookedInvoiceEvent(M_OTHER_UNIQUE, 'in_edge_other_unique');

    const dbMod = await import('../../src/db/db');
    const real = dbMod.payments.insertSubscriptionChargePayment;
    vi.spyOn(dbMod.payments, 'insertSubscriptionChargePayment', 'get').mockReturnValue({
      run: () => {
        const err = new Error('UNIQUE constraint failed: payments.id') as Error & { code: string };
        err.code = 'SQLITE_CONSTRAINT_UNIQUE';
        throw err;
      },
    } as unknown as typeof real);

    let thrown: unknown;
    try {
      paymentService.handleWebhook(evt.rawBody, evt.signature);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(RecoverableWebhookError);
    expect((thrown as { code?: string }).code).toBe('SQLITE_CONSTRAINT_UNIQUE');
  });
});

describe('a notice after the commit never fails the settled event', () => {
  async function breakContactLookup(): Promise<void> {
    const dbMod = await import('../../src/db/db');
    const real = dbMod.auth.findMemberForSessionAfterVerify;
    vi.spyOn(dbMod.auth, 'findMemberForSessionAfterVerify', 'get').mockReturnValue({
      get: () => { throw new Error('contact lookup unavailable'); },
    } as unknown as typeof real);
  }

  // Defect caught: the charge is booked, the receipt lookup throws, and the
  // provider is answered with an error for an event that already applied.
  it('acknowledges a booked renewal whose receipt lookup failed', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activate(M_RECEIPT);
    await breakContactLookup();
    const invoice = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_paid');
    expect(paymentService.handleWebhook(invoice.rawBody, invoice.signature))
      .toEqual({ outcome: 'processed' });
    expect(count('SELECT COUNT(*) AS c FROM payments WHERE recurring_subscription_id = ?', subscriptionId))
      .toBe(1);
  });

  // Defect caught: the subscription is promoted, the notice lookup throws, and
  // the provider is answered with an error for an event that already applied.
  it('acknowledges a confirmed subscription whose notice lookup failed', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const started = await paymentService.startDonation(M_NOTICE, 2500, null, true, '/x');
    await breakContactLookup();
    const created = stub.buildSignedStubWebhookEvent(started.sessionId);
    expect(paymentService.handleWebhook(created.rawBody, created.signature))
      .toEqual({ outcome: 'processed' });
    expect(row('SELECT status FROM recurring_donation_subscriptions WHERE id = ?', started.reference))
      .toEqual({ status: 'active' });
  });

  // Defect caught: the gift is recorded as ended, the administrator alert
  // throws, and the provider is answered with an error for an applied event.
  it('acknowledges an ended subscription whose administrator alert failed', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activate(M_ADMIN_ALERT);
    const { emailService } = await import('../../src/services/emailService');
    vi.spyOn(emailService, 'sendToAdmins').mockImplementation(() => {
      throw new Error('admin alert unavailable');
    });
    const deleted = stub.buildSignedStubSubscriptionEvent(sessionId, 'deleted');
    expect(paymentService.handleWebhook(deleted.rawBody, deleted.signature))
      .toEqual({ outcome: 'processed' });
    expect(row('SELECT status FROM recurring_donation_subscriptions WHERE id = ?', subscriptionId))
      .toEqual({ status: 'canceled' });
  });
});

describe('a checkout refused while an earlier one is still confirming', () => {
  /** Whether the bucket has a free attempt left under a ceiling of one: true
   *  only if the refused request gave back the attempt it took. */
  async function attemptStillFree(key: string): Promise<boolean> {
    const rl = await import('../../src/services/rateLimitService');
    return rl.hit(key, 1, 60).allowed;
  }

  // Defect caught: each refusal spends one of the member's hourly attempts,
  // so a member waiting on a confirmation is locked out of a genuine gift.
  it('gives the donation attempt back', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { ConflictError } = await import('../../src/services/serviceErrors');
    const first = await paymentService.startDonation(M_DONATE_LIMIT, 2500, 'once', false, '/x');
    // Paid at the provider, confirmation not yet delivered.
    stub.buildSignedStubWebhookEvent(first.sessionId);
    (await import('../../src/services/rateLimitService')).resetRateLimitForTests();

    await expect(paymentService.startDonation(M_DONATE_LIMIT, 2500, 'once', false, '/x'))
      .rejects.toBeInstanceOf(ConflictError);
    expect(await attemptStillFree(`donate:${M_DONATE_LIMIT}`)).toBe(true);
  });

  // Defect caught: a submit that loses the race to a checkout that no longer
  // opens spends an attempt for a checkout it closed again.
  it('gives the attempt back when the overlapping checkout cannot be reopened', async () => {
    const paymentService = await svc();
    await stubAdapter();
    const { ConflictError } = await import('../../src/services/serviceErrors');
    const dbMod = await import('../../src/db/db');
    const real = dbMod.payments.findPendingDonationForMember;
    let calls = 0;
    vi.spyOn(dbMod.payments, 'findPendingDonationForMember', 'get').mockReturnValue({
      // Nothing open when the request starts; an overlapping submit's row,
      // whose session the provider no longer holds, by the time it records.
      get: () => (calls++ === 0 ? undefined : { id: 'pay_edge_winner', session_id: 'cs_edge_gone' }),
    } as unknown as typeof real);

    await expect(paymentService.startDonation(M_WINNER_LIMIT, 2500, 'race', false, '/x'))
      .rejects.toBeInstanceOf(ConflictError);
    expect(await attemptStillFree(`donate:${M_WINNER_LIMIT}`)).toBe(true);
  });

  it('gives the membership attempt back', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { ConflictError } = await import('../../src/services/serviceErrors');
    const first = await paymentService.startMembershipPurchase(M_MEMBERSHIP_LIMIT, 'tier1', '/x');
    stub.buildSignedStubWebhookEvent(first.sessionId);
    (await import('../../src/services/rateLimitService')).resetRateLimitForTests();

    await expect(paymentService.startMembershipPurchase(M_MEMBERSHIP_LIMIT, 'tier1', '/x'))
      .rejects.toBeInstanceOf(ConflictError);
    expect(await attemptStillFree(`purchase-tier:${M_MEMBERSHIP_LIMIT}`)).toBe(true);
  });
});

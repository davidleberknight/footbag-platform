/**
 * Recurring and one-time donations: the checkout entry points, the subscription
 * and invoice webhook handlers, and member-requested cancellation.
 *
 * The contract these assert: Stripe owns the billing schedule and every retry,
 * so local subscription state moves only in response to a webhook; each handler
 * claims the Stripe event id inside the same transaction as the state change it
 * guards, so a redelivery is a no-op duplicate and a failure leaves nothing
 * half-applied; and a recurring checkout writes nothing locally until the
 * created event arrives, so an abandoned checkout leaves no trace.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4031');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember } from '../fixtures/factories';

const M_PLAIN = 'don-plain';
const M_HOF = 'don-hof';
const M_BAP = 'don-bap';
const M_BOTH = 'don-both';
const M_OTHER = 'don-other';
const M_FAIL_AGAIN = 'don-fail-again';
const M_UPDATE_AGAIN = 'don-update-again';
const M_SIGNUP = 'don-signup';
const ALL_MEMBERS = [
  M_PLAIN, M_HOF, M_BAP, M_BOTH, M_OTHER,
  M_FAIL_AGAIN, M_UPDATE_AGAIN, M_SIGNUP,
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  ALL_MEMBERS.forEach((id, i) => {
    insertMember(db, {
      id,
      slug: `don_${i}`,
      display_name: `Don ${i}`,
      login_email: `don${i}@example.com`,
      is_hof: id === M_HOF || id === M_BOTH ? 1 : 0,
      is_bap: id === M_BAP || id === M_BOTH ? 1 : 0,
    });
  });
  db.close();
  await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(async () => {
  const { resetPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
  resetPaymentAdapterForTests();
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

/** Opens a recurring checkout and drives it through the created event, leaving a
 *  live local subscription. Returns the ids later events must reference. */
async function activateSubscription(
  memberId: string,
  opts: { amountCents?: number; note?: string | null } = {},
): Promise<{ sessionId: string; subscriptionId: string; stripeSubscriptionId: string }> {
  const paymentService = await svc();
  const stub = await stubAdapter();
  const started = await paymentService.startDonation(
    memberId,
    opts.amountCents ?? 2500,
    opts.note ?? null,
    true,
    '/members/x',
  );
  const created = stub.buildSignedStubWebhookEvent(started.sessionId);
  expect(paymentService.handleWebhook(created.rawBody, created.signature)).toEqual({
    outcome: 'processed',
  });
  const session = stub.sessions.get(started.sessionId)!;
  return {
    sessionId: started.sessionId,
    subscriptionId: started.reference,
    stripeSubscriptionId: session.stripeSubscriptionId!,
  };
}

function readSubscription(id: string): Record<string, unknown> | undefined {
  const db = openDb();
  try {
    return db
      .prepare('SELECT * FROM recurring_donation_subscriptions WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
  } finally {
    db.close();
  }
}

function countRows(sql: string, ...params: unknown[]): number {
  const db = openDb();
  try {
    return (db.prepare(sql).get(...params) as { c: number }).c;
  } finally {
    db.close();
  }
}

describe('startDonation: amount and note handling', () => {
  it('rejects an amount below the floor, above the ceiling, and a non-integer', async () => {
    const paymentService = await svc();
    const { ValidationError } = await import('../../src/services/serviceErrors');
    await expect(paymentService.startDonation(M_PLAIN, 99, null, false, '/x'))
      .rejects.toBeInstanceOf(ValidationError);
    await expect(paymentService.startDonation(M_PLAIN, 2_000_001, null, false, '/x'))
      .rejects.toBeInstanceOf(ValidationError);
    await expect(paymentService.startDonation(M_PLAIN, 10.5, null, false, '/x'))
      .rejects.toBeInstanceOf(ValidationError);
    await expect(paymentService.startDonation(M_PLAIN, Number.NaN, null, false, '/x'))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses an amount finer than a cent rather than quietly rounding it', async () => {
    // Taking a different amount from the one the donor typed, even by a cent,
    // is a small dishonesty on a donation form. Refuse and let them retype.
    const paymentService = await svc();
    const { ValidationError } = await import('../../src/services/serviceErrors');
    await expect(paymentService.startDonation(M_PLAIN, '42.505', null, false, '/x'))
      .rejects.toBeInstanceOf(ValidationError);
    await expect(paymentService.startDonation(M_PLAIN, '10.999', null, false, '/x'))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('reads a typed decimal as dollars and a bare integer as cents', async () => {
    const paymentService = await svc();
    const started = await paymentService.startDonation(M_PLAIN, '42.50', null, false, '/x');
    const db = openDb();
    try {
      const row = db.prepare('SELECT amount_cents FROM payments WHERE id = ?')
        .get(started.reference) as { amount_cents: number };
      expect(row.amount_cents).toBe(4250);
    } finally {
      db.close();
    }
    // The suggested-amount buttons post cents directly.
    const fromButton = await paymentService.startDonation(M_PLAIN, '2500', null, false, '/x');
    const db2 = openDb();
    try {
      const row = db2.prepare('SELECT amount_cents FROM payments WHERE id = ?')
        .get(fromButton.reference) as { amount_cents: number };
      expect(row.amount_cents).toBe(2500);
    } finally {
      db2.close();
    }
  });

  it('refuses text, scientific notation and hex rather than coercing them', async () => {
    const paymentService = await svc();
    const { ValidationError } = await import('../../src/services/serviceErrors');
    for (const bad of ['abc', '2e3', '0x64', '25.00.00', '-25', '  ', '25 dollars']) {
      await expect(paymentService.startDonation(M_PLAIN, bad, null, false, '/x'))
        .rejects.toBeInstanceOf(ValidationError);
    }
  });

  it('accepts a currency symbol and thousands separators the member may paste', async () => {
    const paymentService = await svc();
    await expect(paymentService.startDonation(M_PLAIN, '$1,250.00', null, false, '/x'))
      .resolves.toBeTruthy();
  });

  it('accepts the exact floor and ceiling', async () => {
    const paymentService = await svc();
    await expect(paymentService.startDonation(M_PLAIN, 100, null, false, '/x')).resolves.toBeTruthy();
    await expect(paymentService.startDonation(M_PLAIN, 2_000_000, null, false, '/x')).resolves.toBeTruthy();
  });

  it('rejects a note longer than the stored limit', async () => {
    const paymentService = await svc();
    const { ValidationError } = await import('../../src/services/serviceErrors');
    await expect(
      paymentService.startDonation(M_PLAIN, 1000, 'x'.repeat(501), false, '/x'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('defaults a blank note to the honor fund, preferring Hall of Fame when a member holds both', async () => {
    const paymentService = await svc();
    await paymentService.startDonation(M_HOF, 1000, '   ', false, '/x');
    await paymentService.startDonation(M_BAP, 1000, null, false, '/x');
    await paymentService.startDonation(M_BOTH, 1000, null, false, '/x');
    await paymentService.startDonation(M_PLAIN, 1000, null, false, '/x');
    const db = openDb();
    try {
      const note = (id: string): string | null =>
        (db.prepare(
          'SELECT donation_note FROM payments WHERE member_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
        ).get(id) as { donation_note: string | null }).donation_note;
      expect(note(M_HOF)).toBe('HoF Fund');
      expect(note(M_BAP)).toBe('BAP Fund');
      expect(note(M_BOTH)).toBe('HoF Fund');
      expect(note(M_PLAIN)).toBeNull();
    } finally {
      db.close();
    }
  });

  it('keeps a member-supplied note in preference to the honor default', async () => {
    const paymentService = await svc();
    const started = await paymentService.startDonation(M_HOF, 1000, '  In memory of a friend  ', false, '/x');
    const db = openDb();
    try {
      const row = db.prepare('SELECT donation_note FROM payments WHERE id = ?').get(started.reference) as
        | { donation_note: string }
        | undefined;
      expect(row?.donation_note).toBe('In memory of a friend');
    } finally {
      db.close();
    }
  });
});

describe('startDonation: one-time gift', () => {
  it('writes a pending donation row and settles through the shared payment-intent handler without granting a tier', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const started = await paymentService.startDonation(M_PLAIN, 1500, 'Thanks', false, '/x');

    let row = openDb();
    try {
      const pending = row.prepare('SELECT * FROM payments WHERE id = ?').get(started.reference) as Record<string, unknown>;
      expect(pending.status).toBe('pending');
      expect(pending.payment_type).toBe('donation');
      expect(pending.purchased_tier_status).toBeNull();
      expect(pending.donation_note).toBe('Thanks');
    } finally {
      row.close();
    }

    const evt = stub.buildSignedStubWebhookEvent(started.sessionId);
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'processed' });

    row = openDb();
    try {
      const settled = row.prepare('SELECT status FROM payments WHERE id = ?').get(started.reference) as { status: string };
      expect(settled.status).toBe('succeeded');
      const grants = row.prepare(
        "SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'tier.purchase_grant' AND entity_id = ?",
      ).get(started.reference) as { c: number };
      expect(grants.c).toBe(0);
    } finally {
      row.close();
    }
  });
});

describe('startDonation: recurring gift writes nothing until Stripe confirms', () => {
  it('leaves no local subscription row when the checkout is abandoned', async () => {
    const paymentService = await svc();
    await stubAdapter();
    const started = await paymentService.startDonation(M_PLAIN, 2500, null, true, '/x');
    expect(readSubscription(started.reference)).toBeUndefined();
    expect(countRows('SELECT COUNT(*) AS c FROM payments WHERE id = ?', started.reference)).toBe(0);
  });

});

describe('customer.subscription.created', () => {
  it('inserts the active subscription, records the activation, and establishes the member Stripe customer', async () => {
    const { subscriptionId, stripeSubscriptionId } = await activateSubscription(M_PLAIN, {
      amountCents: 3000,
      note: 'Yearly support',
    });
    const sub = readSubscription(subscriptionId)!;
    expect(sub.status).toBe('active');
    expect(sub.amount_cents).toBe(3000);
    expect(sub.billing_interval).toBe('yearly');
    expect(sub.donation_comment).toBe('Yearly support');
    expect(sub.stripe_subscription_id).toBe(stripeSubscriptionId);
    expect(sub.is_cancel_at_period_end).toBe(0);

    expect(countRows(
      "SELECT COUNT(*) AS c FROM recurring_donation_subscription_transitions WHERE recurring_subscription_id = ? AND lifecycle_event_code = 'activated'",
      subscriptionId,
    )).toBe(1);

    const db = openDb();
    try {
      const member = db.prepare('SELECT stripe_customer_id FROM members WHERE id = ?').get(M_PLAIN) as
        { stripe_customer_id: string | null };
      expect(member.stripe_customer_id).toBe(sub.stripe_customer_id);
    } finally {
      db.close();
    }
  });

  it('treats a redelivery of the same event as a duplicate and inserts no second subscription', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const started = await paymentService.startDonation(M_OTHER, 2500, null, true, '/x');
    const evt = stub.buildSignedStubWebhookEvent(started.sessionId);
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'duplicate' });
    expect(countRows(
      'SELECT COUNT(*) AS c FROM recurring_donation_subscriptions WHERE member_id = ?',
      M_OTHER,
    )).toBe(1);
  });

  it('ignores a subscription created outside the platform, which carries no correlation metadata', async () => {
    const paymentService = await svc();
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const rawBody = JSON.stringify({
      id: 'evt_dashboard_made',
      type: 'customer.subscription.created',
      created: 1700000000,
      data: { object: { id: 'sub_dashboard', customer: 'cus_dashboard', metadata: {} } },
    });
    const signature = signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET);
    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'ignored' });
    expect(countRows(
      'SELECT COUNT(*) AS c FROM recurring_donation_subscriptions WHERE stripe_subscription_id = ?',
      'sub_dashboard',
    )).toBe(0);
  });
});

describe('invoice.payment_succeeded', () => {
  it('records the annual charge as its own donation payment linked to the subscription', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId, stripeSubscriptionId } = await activateSubscription(M_PLAIN);

    const invoice = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded');
    expect(paymentService.handleWebhook(invoice.rawBody, invoice.signature)).toEqual({ outcome: 'processed' });

    const db = openDb();
    try {
      const charge = db.prepare(
        'SELECT * FROM payments WHERE recurring_subscription_id = ?',
      ).get(subscriptionId) as Record<string, unknown>;
      expect(charge.status).toBe('succeeded');
      expect(charge.payment_type).toBe('donation');
      expect(charge.stripe_subscription_id).toBe(stripeSubscriptionId);
      // The transition ledger must carry the pending-to-succeeded step, so a
      // subscription charge is auditable exactly like a one-time payment.
      const transitions = db.prepare(
        "SELECT COUNT(*) AS c FROM payment_status_transitions WHERE payment_id = ? AND from_status = 'pending' AND to_status = 'succeeded'",
      ).get(charge.id) as { c: number };
      expect(transitions.c).toBe(1);
    } finally {
      db.close();
    }

    expect(countRows(
      "SELECT COUNT(*) AS c FROM recurring_donation_subscription_transitions WHERE recurring_subscription_id = ? AND lifecycle_event_code = 'charge_succeeded'",
      subscriptionId,
    )).toBe(1);
  });

  it('creates only one payment row when Stripe redelivers the same invoice event', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activateSubscription(M_OTHER);
    const invoice = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded');
    expect(paymentService.handleWebhook(invoice.rawBody, invoice.signature)).toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(invoice.rawBody, invoice.signature)).toEqual({ outcome: 'duplicate' });
    expect(countRows(
      'SELECT COUNT(*) AS c FROM payments WHERE recurring_subscription_id = ?',
      subscriptionId,
    )).toBe(1);
  });

  it('is recoverable when the invoice arrives before the subscription was mirrored, so Stripe retries', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { RecoverableWebhookError } = await import('../../src/services/paymentService');
    const started = await paymentService.startDonation(M_PLAIN, 2500, null, true, '/x');
    const invoice = stub.buildSignedStubSubscriptionEvent(started.sessionId, 'invoice_succeeded');
    expect(() => paymentService.handleWebhook(invoice.rawBody, invoice.signature))
      .toThrow(RecoverableWebhookError);
    // Nothing was claimed, so the retry re-runs cleanly.
    expect(countRows(
      'SELECT COUNT(*) AS c FROM payments WHERE recurring_subscription_id = ?',
      started.reference,
    )).toBe(0);
  });
});

describe('invoice.payment_failed', () => {
  it('moves the subscription to past due, counts the failure, and raises a payments work-queue item', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activateSubscription(M_PLAIN);

    const failed = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_failed');
    expect(paymentService.handleWebhook(failed.rawBody, failed.signature)).toEqual({ outcome: 'processed' });

    const sub = readSubscription(subscriptionId)!;
    expect(sub.status).toBe('past_due');
    expect(sub.failure_count).toBe(1);

    expect(countRows(
      "SELECT COUNT(*) AS c FROM work_queue_items WHERE queue_category = 'payments' AND task_type = 'recurring_donation_charge_declined' AND entity_id = ?",
      subscriptionId,
    )).toBe(1);
  });

  // The provider retries any delivery it did not get a clean answer for. A
  // second count would put the donation closer to dunning exhaustion than the
  // donor's card actually is, and a second queue item is noise an administrator
  // has to dismiss.
  it('counts one failure and raises one queue item when the same failure is delivered twice', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activateSubscription(M_FAIL_AGAIN);

    const failed = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_failed');
    expect(paymentService.handleWebhook(failed.rawBody, failed.signature)).toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(failed.rawBody, failed.signature)).toEqual({ outcome: 'duplicate' });

    const sub = readSubscription(subscriptionId)!;
    expect(sub.status).toBe('past_due');
    expect(sub.failure_count).toBe(1);
    expect(countRows(
      "SELECT COUNT(*) AS c FROM work_queue_items WHERE task_type = 'recurring_donation_charge_declined' AND entity_id = ?",
      subscriptionId,
    )).toBe(1);
  });

  it('returns a past-due subscription to active on the next successful charge', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activateSubscription(M_OTHER);

    const failed = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_failed');
    paymentService.handleWebhook(failed.rawBody, failed.signature);
    expect(readSubscription(subscriptionId)!.status).toBe('past_due');

    const ok = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded');
    expect(paymentService.handleWebhook(ok.rawBody, ok.signature)).toEqual({ outcome: 'processed' });
    expect(readSubscription(subscriptionId)!.status).toBe('active');
  });
});

describe('customer.subscription.updated', () => {
  it('mirrors an amount change made in the Stripe dashboard', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activateSubscription(M_PLAIN, { amountCents: 2500 });

    const updated = stub.buildSignedStubSubscriptionEvent(sessionId, 'updated', { amountCents: 4000 });
    expect(paymentService.handleWebhook(updated.rawBody, updated.signature)).toEqual({ outcome: 'processed' });

    expect(readSubscription(subscriptionId)!.amount_cents).toBe(4000);
    expect(countRows(
      "SELECT COUNT(*) AS c FROM recurring_donation_subscription_transitions WHERE recurring_subscription_id = ? AND lifecycle_event_code = 'updated'",
      subscriptionId,
    )).toBe(1);
  });

  it('is a no-op when Stripe reports nothing the platform mirrors has changed', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId } = await activateSubscription(M_OTHER, { amountCents: 2500 });
    const updated = stub.buildSignedStubSubscriptionEvent(sessionId, 'updated', { amountCents: 2500 });
    expect(paymentService.handleWebhook(updated.rawBody, updated.signature)).toEqual({ outcome: 'duplicate' });
  });

  // A redelivery of a change already applied must not append a second entry to
  // the donation's history, which is the record of what the provider actually
  // did and when.
  it('mirrors a change once when the same change is delivered twice', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activateSubscription(M_UPDATE_AGAIN, { amountCents: 2500 });

    const updated = stub.buildSignedStubSubscriptionEvent(sessionId, 'updated', { amountCents: 4000 });
    expect(paymentService.handleWebhook(updated.rawBody, updated.signature)).toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(updated.rawBody, updated.signature)).toEqual({ outcome: 'duplicate' });

    expect(readSubscription(subscriptionId)!.amount_cents).toBe(4000);
    expect(countRows(
      "SELECT COUNT(*) AS c FROM recurring_donation_subscription_transitions WHERE recurring_subscription_id = ? AND lifecycle_event_code = 'updated'",
      subscriptionId,
    )).toBe(1);
  });
});

describe('customer.subscription.deleted', () => {
  it('ends the subscription and stamps the cancellation time', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activateSubscription(M_PLAIN);

    const deleted = stub.buildSignedStubSubscriptionEvent(sessionId, 'deleted');
    expect(paymentService.handleWebhook(deleted.rawBody, deleted.signature)).toEqual({ outcome: 'processed' });

    const sub = readSubscription(subscriptionId)!;
    expect(sub.status).toBe('canceled');
    expect(sub.canceled_at).toBeTruthy();
  });

  it('treats a redelivered cancellation as a duplicate', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activateSubscription(M_OTHER);
    const deleted = stub.buildSignedStubSubscriptionEvent(sessionId, 'deleted');
    paymentService.handleWebhook(deleted.rawBody, deleted.signature);
    expect(paymentService.handleWebhook(deleted.rawBody, deleted.signature)).toEqual({ outcome: 'duplicate' });
    expect(countRows(
      "SELECT COUNT(*) AS c FROM recurring_donation_subscription_transitions WHERE recurring_subscription_id = ? AND lifecycle_event_code = 'canceled'",
      subscriptionId,
    )).toBe(1);
  });
});

// Signing up for a recurring donation does not produce one event. Stripe raises
// the subscription, then the signup invoice that collects the first year, then a
// payment_intent event for that invoice's own intent, all within moments of the
// donor leaving Checkout. Driving them one at a time in other tests hides what
// the combination does, and the combination is where the same money could be
// booked twice.
describe('the events a recurring signup actually produces on day one', () => {
  it('books the first year once, however many events the provider sends', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const signupInvoiceId = 'in_signup_day_one';

    const started = await paymentService.startDonation(M_SIGNUP, 2500, 'For the fund', true, '/members/x');

    // 1. The subscription itself. This writes the donation, not a payment: no
    //    money is recorded until an invoice says it was collected.
    const created = stub.buildSignedStubWebhookEvent(started.sessionId);
    expect(paymentService.handleWebhook(created.rawBody, created.signature))
      .toEqual({ outcome: 'processed' });
    expect(countRows('SELECT COUNT(*) AS c FROM payments WHERE member_id = ?', M_SIGNUP)).toBe(0);

    // 2. The signup invoice. Stripe marks the first invoice of a subscription
    //    with its own billing reason, which is what distinguishes it from every
    //    later renewal.
    const signupInvoice = stub.buildSignedStubSubscriptionEvent(started.sessionId, 'invoice_succeeded', {
      invoiceId: signupInvoiceId,
      billingReason: 'subscription_create',
    });
    expect(JSON.parse(signupInvoice.rawBody).data.object.billing_reason).toBe('subscription_create');
    expect(paymentService.handleWebhook(signupInvoice.rawBody, signupInvoice.signature))
      .toEqual({ outcome: 'processed' });

    // 3. The invoice's own payment intent. Stripe raises these for an invoice
    //    exactly as it does for a checkout, and this one carries none of the
    //    platform's correlation metadata because the platform did not open it.
    //    Hand-built: the stub synthesizes events for sessions it issued, and this
    //    intent belongs to the provider's invoice, not to a session.
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const intentBody = JSON.stringify({
      id: 'evt_signup_invoice_intent',
      type: 'payment_intent.succeeded',
      created: 1700000000,
      data: { object: { id: 'pi_signup_invoice', amount: 2500, currency: 'usd', metadata: {} } },
    });
    expect(paymentService.handleWebhook(intentBody, signStripeWebhook(intentBody, STUB_WEBHOOK_SECRET)))
      .toEqual({ outcome: 'ignored' });

    // One payment row for the first year, attributed to the donation and to the
    // invoice that collected it. Two rows here would mean the member's history,
    // the receipts, and every revenue figure double-count day one.
    const db = openDb();
    try {
      const rows = db.prepare(
        'SELECT amount_cents, status, stripe_invoice_id, recurring_subscription_id FROM payments WHERE member_id = ?',
      ).all(M_SIGNUP) as Array<{
        amount_cents: number;
        status: string;
        stripe_invoice_id: string | null;
        recurring_subscription_id: string | null;
      }>;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        amount_cents: 2500,
        status: 'succeeded',
        stripe_invoice_id: signupInvoiceId,
        recurring_subscription_id: started.reference,
      });
    } finally {
      db.close();
    }

    const sub = readSubscription(started.reference)!;
    expect(sub.status).toBe('active');
    expect(sub.amount_cents).toBe(2500);
  });
});

describe('events that belong to Stripe but not to this platform', () => {
  // A recurring renewal is settled through an invoice, and Stripe raises
  // payment_intent events for that invoice's own intent exactly as it does for a
  // one-time checkout. Answering those as recoverable would make Stripe retry a
  // lookup that can never succeed, for days, on every renewal, and sustained
  // failures put the whole endpoint at risk of being disabled.
  async function signed(body: object): Promise<{ rawBody: string; signature: string }> {
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const rawBody = JSON.stringify(body);
    return { rawBody, signature: signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET) };
  }

  it('acknowledges a payment intent that carries no platform correlation, instead of retrying forever', async () => {
    const paymentService = await svc();
    const evt = await signed({
      id: 'evt_invoice_intent',
      type: 'payment_intent.succeeded',
      created: 1700000000,
      // No paymentId in metadata: this is an invoice's own intent, not one this
      // platform opened through checkout.
      data: { object: { id: 'pi_from_an_invoice', amount: 2500, currency: 'usd', metadata: {} } },
    });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'ignored' });
  });

  it('still retries when the intent is ours but its row is not visible yet', async () => {
    const paymentService = await svc();
    const { RecoverableWebhookError } = await import('../../src/services/paymentService');
    const evt = await signed({
      id: 'evt_ours_not_yet',
      type: 'payment_intent.succeeded',
      created: 1700000000,
      data: {
        object: {
          id: 'pi_ours_pending',
          amount: 2500,
          currency: 'usd',
          metadata: { paymentId: 'pay_not_inserted_yet', memberId: M_PLAIN },
        },
      },
    });
    expect(() => paymentService.handleWebhook(evt.rawBody, evt.signature))
      .toThrow(RecoverableWebhookError);
  });

  it('acknowledges an unattributable refund and puts it in front of an administrator', async () => {
    const paymentService = await svc();
    const evt = await signed({
      id: 'evt_orphan_refund',
      type: 'charge.refunded',
      created: 1700000000,
      data: {
        object: {
          id: 'ch_orphan', payment_intent: 'pi_no_local_row',
          amount: 2500, amount_refunded: 2500,
        },
      },
    });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'ignored' });
    expect(countRows(
      "SELECT COUNT(*) AS c FROM work_queue_items WHERE task_type = 'unattributed_refund' AND entity_id = ?",
      'pi_no_local_row',
    )).toBe(1);
  });
});

describe('out-of-order subscription events', () => {
  // Stripe does not guarantee delivery order. Acknowledging one of ours before
  // its creation has landed would claim the event id and lose it permanently,
  // leaving an ended subscription looking live on the member's own page.
  async function signedSubscriptionEvent(
    type: string, id: string, meta: Record<string, string>,
  ): Promise<{ rawBody: string; signature: string }> {
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const rawBody = JSON.stringify({
      id: `evt_ooo_${id}`,
      type,
      created: 1700000000,
      data: { object: { id, customer: 'cus_x', status: 'canceled', metadata: meta } },
    });
    return { rawBody, signature: signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET) };
  }

  it('asks for redelivery when one of ours is cancelled before its creation lands', async () => {
    const paymentService = await svc();
    const { RecoverableWebhookError } = await import('../../src/services/paymentService');
    const evt = await signedSubscriptionEvent(
      'customer.subscription.deleted', 'sub_ours_early', { subscriptionRecordId: 'rds_pending' },
    );
    expect(() => paymentService.handleWebhook(evt.rawBody, evt.signature))
      .toThrow(RecoverableWebhookError);
  });

  it('asks for redelivery when one of ours is updated before its creation lands', async () => {
    const paymentService = await svc();
    const { RecoverableWebhookError } = await import('../../src/services/paymentService');
    const evt = await signedSubscriptionEvent(
      'customer.subscription.updated', 'sub_ours_early_upd', { subscriptionRecordId: 'rds_pending' },
    );
    expect(() => paymentService.handleWebhook(evt.rawBody, evt.signature))
      .toThrow(RecoverableWebhookError);
  });

  it('still ignores a subscription created outside the platform, which will never be mirrored', async () => {
    const paymentService = await svc();
    const evt = await signedSubscriptionEvent(
      'customer.subscription.deleted', 'sub_dashboard_made', {},
    );
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'ignored' });
  });
});

describe('cancelRecurringDonation', () => {
  it('records the cancellation intent without moving the status, which only Stripe does', async () => {
    const paymentService = await svc();
    await stubAdapter();
    const { subscriptionId, stripeSubscriptionId } = await activateSubscription(M_PLAIN);

    await expect(paymentService.cancelRecurringDonation(M_PLAIN, stripeSubscriptionId))
      .resolves.toEqual({ status: 'cancel_requested' });

    const sub = readSubscription(subscriptionId)!;
    expect(sub.is_cancel_at_period_end).toBe(1);
    expect(sub.cancel_requested_at).toBeTruthy();
    expect(sub.status).toBe('active');
    expect(countRows(
      "SELECT COUNT(*) AS c FROM recurring_donation_subscription_transitions WHERE recurring_subscription_id = ? AND lifecycle_event_code = 'cancel_requested'",
      subscriptionId,
    )).toBe(1);
  });

  it('is idempotent: a second request neither errors nor records a second intent', async () => {
    const paymentService = await svc();
    await stubAdapter();
    const { subscriptionId, stripeSubscriptionId } = await activateSubscription(M_OTHER);
    await paymentService.cancelRecurringDonation(M_OTHER, stripeSubscriptionId);
    await expect(paymentService.cancelRecurringDonation(M_OTHER, stripeSubscriptionId))
      .resolves.toEqual({ status: 'already_requested' });
    expect(countRows(
      "SELECT COUNT(*) AS c FROM recurring_donation_subscription_transitions WHERE recurring_subscription_id = ? AND lifecycle_event_code = 'cancel_requested'",
      subscriptionId,
    )).toBe(1);
  });

  it('reports another member subscription exactly as a missing one, so it cannot be probed for', async () => {
    const paymentService = await svc();
    await stubAdapter();
    const { NotFoundError } = await import('../../src/services/serviceErrors');
    const { stripeSubscriptionId } = await activateSubscription(M_PLAIN);

    await expect(paymentService.cancelRecurringDonation(M_OTHER, stripeSubscriptionId))
      .rejects.toBeInstanceOf(NotFoundError);
    await expect(paymentService.cancelRecurringDonation(M_OTHER, 'sub_does_not_exist'))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses to cancel a subscription that has already ended', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { ConflictError } = await import('../../src/services/serviceErrors');
    const { sessionId, stripeSubscriptionId } = await activateSubscription(M_PLAIN);
    const deleted = stub.buildSignedStubSubscriptionEvent(sessionId, 'deleted');
    paymentService.handleWebhook(deleted.rawBody, deleted.signature);

    await expect(paymentService.cancelRecurringDonation(M_PLAIN, stripeSubscriptionId))
      .rejects.toBeInstanceOf(ConflictError);
  });
});

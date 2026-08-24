/**
 * Recurring and one-time donations: the checkout entry points, the subscription
 * and invoice webhook handlers, and member-requested cancellation.
 *
 * The contract these assert: Stripe owns the billing schedule and every retry,
 * so local subscription state moves only in response to a webhook; each handler
 * claims the Stripe event id inside the same transaction as the state change it
 * guards, so a redelivery is a no-op duplicate and a failure leaves nothing
 * half-applied; and a recurring checkout records its subscription row before
 * the redirect, in an unresolved state, so an abandoned checkout leaves a trace
 * rather than nothing. The created event promotes that row and the expiry event
 * closes it out; an unresolved row is invisible to the member and to the
 * provider comparison, and is raised for a human only once it goes stale.
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
const M_PROMOTE = 'don-promote';
const M_LEDGER = 'don-ledger';
const M_EXPIRE = 'don-expire';
const M_EXPIRE_AGAIN = 'don-expire-again';
const M_OUT_OF_ORDER_SUCCESS = 'don-ooo-success';
const M_RENEWAL_CURRENCY = 'don-renewal-ccy';
const M_LATE_ON_ENDED = 'don-late-on-ended';
const M_UPDATE_ON_ENDED = 'don-update-on-ended';
const ALL_MEMBERS = [
  M_PLAIN, M_HOF, M_BAP, M_BOTH, M_OTHER,
  M_FAIL_AGAIN, M_UPDATE_AGAIN, M_SIGNUP,
  M_PROMOTE, M_LEDGER, M_EXPIRE, M_EXPIRE_AGAIN,
  M_OUT_OF_ORDER_SUCCESS, M_RENEWAL_CURRENCY,
  M_LATE_ON_ENDED, M_UPDATE_ON_ENDED,
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

describe('startDonation: a recurring gift is recorded from the moment checkout opens', () => {
  it('writes an unresolved subscription row before the member is redirected', async () => {
    const paymentService = await svc();
    await stubAdapter();
    const started = await paymentService.startDonation(M_PLAIN, 2500, 'For the kids', true, '/x');

    const sub = readSubscription(started.reference)!;
    expect(sub).toBeDefined();
    expect(sub.status).toBe('incomplete');
    expect(sub.amount_cents).toBe(2500);
    expect(sub.donation_comment).toBe('For the kids');
    // The provider mints both of these during checkout, so neither can exist
    // yet; the session is the only handle the row has until it is confirmed.
    expect(sub.stripe_subscription_id).toBeNull();
    expect(sub.checkout_session_id).toBe(started.sessionId);

    // A recurring gift is a subscription, never a payment row of its own; the
    // charges arrive later as invoices.
    expect(countRows('SELECT COUNT(*) AS c FROM payments WHERE id = ?', started.reference)).toBe(0);
  });

  it('keeps an unresolved checkout out of the member-facing history', async () => {
    const paymentService = await svc();
    await stubAdapter();
    const started = await paymentService.startDonation(M_PLAIN, 2500, null, true, '/x');

    const page = paymentService.getPaymentHistoryPage(M_PLAIN, 'plain-member');
    const references = page.content.recurringRows.map((r) => r.reference);
    expect(references).not.toContain(started.reference);
  });

  it('keeps an unresolved checkout out of the active-subscription view', async () => {
    const paymentService = await svc();
    await stubAdapter();
    const started = await paymentService.startDonation(M_PLAIN, 2500, null, true, '/x');

    expect(countRows(
      'SELECT COUNT(*) AS c FROM recurring_donation_subscriptions_active WHERE id = ?',
      started.reference,
    )).toBe(0);
    expect(countRows(
      'SELECT COUNT(*) AS c FROM recurring_donation_subscriptions WHERE id = ?',
      started.reference,
    )).toBe(1);
  });
});

describe('resolving the row a recurring checkout opened', () => {
  it('promotes the row checkout wrote rather than creating a second one', async () => {
    const { subscriptionId, stripeSubscriptionId } = await activateSubscription(M_PROMOTE, {
      amountCents: 4000,
    });

    // One row, not two: the created event has to recognise the row already
    // written at checkout, or a member ends up with a phantom duplicate gift.
    expect(countRows(
      'SELECT COUNT(*) AS c FROM recurring_donation_subscriptions WHERE member_id = ?',
      M_PROMOTE,
    )).toBe(1);

    const sub = readSubscription(subscriptionId)!;
    expect(sub.status).toBe('active');
    expect(sub.stripe_subscription_id).toBe(stripeSubscriptionId);
    // The session that opened it stays on the row: it is how an expiry arriving
    // late is matched, and how the checkout is traced in the dashboard.
    expect(sub.checkout_session_id).not.toBeNull();
    // version moves because this is an update of an existing row.
    expect(sub.version).toBe(2);
  });

  it('records the promotion in the ledger as coming from the unresolved state', async () => {
    const { subscriptionId } = await activateSubscription(M_LEDGER);
    expect(countRows(
      `SELECT COUNT(*) AS c FROM recurring_donation_subscription_transitions
       WHERE recurring_subscription_id = ? AND old_status = 'incomplete' AND new_status = 'active'`,
      subscriptionId,
    )).toBe(1);
  });

  it('closes the row out when the checkout expires instead of completing', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const started = await paymentService.startDonation(M_EXPIRE, 2500, null, true, '/x');

    stub.overrideSessionOutcome(started.sessionId, 'cancel');
    const expired = stub.buildSignedStubWebhookEvent(started.sessionId);
    expect(paymentService.handleWebhook(expired.rawBody, expired.signature)).toEqual({
      outcome: 'processed',
    });

    const sub = readSubscription(started.reference)!;
    expect(sub.status).toBe('canceled');
    expect(sub.canceled_at).not.toBeNull();
    // Closed out, never deleted: the row is the evidence the member tried.
    expect(countRows(
      'SELECT COUNT(*) AS c FROM recurring_donation_subscriptions WHERE id = ?',
      started.reference,
    )).toBe(1);
  });

  it('treats a redelivered expiry as a duplicate rather than moving the row again', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const started = await paymentService.startDonation(M_EXPIRE_AGAIN, 2500, null, true, '/x');

    stub.overrideSessionOutcome(started.sessionId, 'cancel');
    const first = stub.buildSignedStubWebhookEvent(started.sessionId);
    paymentService.handleWebhook(first.rawBody, first.signature);
    const versionAfterFirst = readSubscription(started.reference)!.version;

    const again = stub.buildSignedStubWebhookEvent(started.sessionId);
    paymentService.handleWebhook(again.rawBody, again.signature);
    expect(readSubscription(started.reference)!.version).toBe(versionAfterFirst);
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

  it('tells the member in the receipt that this gift repeats yearly', async () => {
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activateSubscription(M_PLAIN);

    const invoice = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded');
    expect(paymentService.handleWebhook(invoice.rawBody, invoice.signature)).toEqual({ outcome: 'processed' });

    const db = openDb();
    try {
      const charge = db.prepare(
        'SELECT id, created_at FROM payments WHERE recurring_subscription_id = ?',
      ).get(subscriptionId) as { id: string; created_at: string };
      const receipt = db.prepare(
        'SELECT body_text FROM outbox_emails WHERE idempotency_key = ?',
      ).get(`payment_receipt:${charge.id}:succeeded`) as { body_text: string } | undefined;
      expect(receipt).toBeDefined();
      const { formatDateDisplay } = await import('../../src/services/dateFormat');
      expect(receipt!.body_text).toContain(formatDateDisplay(charge.created_at, { style: 'long' }));
      expect(receipt!.body_text).toContain('Yearly recurring donation');
    } finally {
      db.close();
    }
  });

  it('does not record a subscription as collecting when the provider says its first payment has not settled', async () => {
    // Stripe raises customer.subscription.created for a subscription still
    // waiting on an authentication step or an asynchronous payment method. The
    // handler used to promote every one of them to active, so a donation that
    // had collected nothing appeared live on the member's history and in the
    // admin surfaces, and stayed that way unless a later failure happened to
    // arrive.
    const paymentService = await svc();
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const started = await paymentService.startDonation(M_PLAIN, 2500, null, true, '/x');
    const rawBody = JSON.stringify({
      id: 'evt_sub_incomplete',
      type: 'customer.subscription.created',
      created: 1700000002,
      data: {
        object: {
          id: 'sub_incomplete_first_payment',
          customer: 'cus_incomplete',
          status: 'incomplete',
          metadata: {
            subscriptionRecordId: started.reference,
            memberId: M_PLAIN,
            amountCents: '2500',
          },
        },
      },
    });
    const signature = signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET);
    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'processed' });

    const db = openDb();
    try {
      const row = db.prepare(
        'SELECT status FROM recurring_donation_subscriptions WHERE id = ?',
      ).get(started.reference) as { status: string };
      expect(row.status).not.toBe('active');
      expect(row.status).toBe('past_due');
    } finally {
      db.close();
    }
  });

  it('acknowledges a created event for a row already resolved, rather than colliding forever', async () => {
    // Reachable by ordering alone: an expiry event closes the opened row out at
    // the same moment the creation arrives. The insert fallback would then
    // collide on the primary key, surface as an unhandled failure, retry
    // identically for days, and lose the gift.
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const { sessionId, subscriptionId } = await activateSubscription(M_OTHER);

    // The row is now 'active', so it is no longer awaiting confirmation.
    const rawBody = JSON.stringify({
      id: 'evt_created_after_resolved',
      type: 'customer.subscription.created',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'sub_created_again',
          customer: 'cus_created_again',
          status: 'active',
          metadata: {
            subscriptionRecordId: subscriptionId,
            memberId: M_OTHER,
            amountCents: '2500',
          },
        },
      },
    });
    expect(paymentService.handleWebhook(rawBody, signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET)))
      .toEqual({ outcome: 'duplicate' });

    // And exactly one row still exists for that record.
    expect(countRows(
      'SELECT COUNT(*) AS c FROM recurring_donation_subscriptions WHERE id = ?',
      subscriptionId,
    )).toBe(1);
    void stub;
    void sessionId;
  });

  it('ignores an invoice raised outside the platform instead of retrying it forever', async () => {
    // An invoice for a subscription created in the provider's console, or a
    // one-off invoice with no subscription at all, can never match a local row.
    // Refusing it would make the provider retry for days on every billing
    // cycle, flood the delivery-failure metric, and risk the endpoint being
    // disabled for every other event too.
    const paymentService = await svc();
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const rawBody = JSON.stringify({
      id: 'evt_invoice_foreign',
      type: 'invoice.payment_succeeded',
      created: 1700000000,
      data: {
        object: {
          id: 'in_foreign',
          parent: {
            type: 'subscription_details',
            subscription_details: { subscription: 'sub_dashboard_made', metadata: {} },
          },
          amount_paid: 4200,
          currency: 'usd',
        },
      },
    });
    const signature = signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET);
    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'ignored' });
    expect(countRows(
      'SELECT COUNT(*) AS c FROM payments WHERE stripe_invoice_id = ?',
      'in_foreign',
    )).toBe(0);
  });

  it('still asks for redelivery when the invoice is ours and the subscription has not landed yet', async () => {
    // The distinction the ignore above must not blur: an invoice carrying this
    // platform's correlation metadata is ours, and a missing local row means
    // the created event is still in flight, so the delivery is refused and the
    // provider redelivers rather than the charge being lost.
    const paymentService = await svc();
    const { RecoverableWebhookError } = await import('../../src/services/paymentService');
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const rawBody = JSON.stringify({
      id: 'evt_invoice_ours_early',
      type: 'invoice.payment_succeeded',
      created: 1700000001,
      data: {
        object: {
          id: 'in_ours_early',
          parent: {
            type: 'subscription_details',
            subscription_details: {
              subscription: 'sub_not_mirrored_yet',
              metadata: { subscriptionRecordId: 'rds_not_here_yet' },
            },
          },
          amount_paid: 2500,
          currency: 'usd',
        },
      },
    });
    const signature = signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET);
    expect(() => paymentService.handleWebhook(rawBody, signature))
      .toThrow(RecoverableWebhookError);
  });

  it('books a renewal in the currency the invoice was collected in, not the stored one', async () => {
    // The subscription row keeps its own copy of the currency, and booking the
    // charge from that copy records money in a currency it never moved in. It
    // also makes the nightly comparison meaningless: the platform would be
    // checking its own guess against the provider rather than checking two
    // records of one event. The invoice is what says what was actually taken.
    const paymentService = await svc();
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const { subscriptionId, stripeSubscriptionId } = await activateSubscription(M_RENEWAL_CURRENCY);

    const rawBody = JSON.stringify({
      id: 'evt_invoice_currency',
      type: 'invoice.payment_succeeded',
      created: 1700000900,
      data: {
        object: {
          id: 'in_currency',
          parent: {
            type: 'subscription_details',
            subscription_details: {
              subscription: stripeSubscriptionId,
              metadata: { subscriptionRecordId: subscriptionId },
            },
          },
          amount_paid: 2500,
          currency: 'eur',
        },
      },
    });
    const signature = signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET);
    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'processed' });

    const db = openDb();
    try {
      const row = db.prepare(
        'SELECT currency FROM payments WHERE stripe_invoice_id = ?',
      ).get('in_currency') as { currency: string };
      expect(row.currency).toBe('EUR');
    } finally {
      db.close();
    }
  });

  it('books an out-of-order renewal charge without reviving the donation or rewinding the watermark', async () => {
    // The mirror image of the case below, and the one the success handler had
    // no guard for. A charge that settled EARLIER can arrive after a later
    // failure, and the money is real either way, so the payment row is written.
    // But the status write is keyed on the row id alone, so applying it would
    // put a past_due donation back to active on the strength of older news, and
    // would drag last_stripe_event_created backwards — which then lets an
    // intermediate event replayed afterwards pass a staleness check it should
    // fail. The charge is booked; the subscription state is left alone.
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activateSubscription(M_OUT_OF_ORDER_SUCCESS);

    const earlyAt = Math.floor(Date.parse('2026-09-01T10:00:00.000Z') / 1000);
    const lateAt = earlyAt + 7200;

    // The later failure lands first and moves the donation to past_due.
    const failure = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_failed', {
      invoiceId: 'in_late_failure', createdSeconds: lateAt,
    });
    expect(paymentService.handleWebhook(failure.rawBody, failure.signature))
      .toEqual({ outcome: 'processed' });

    // Now the older success for a different invoice arrives.
    const success = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded', {
      invoiceId: 'in_early_success', createdSeconds: earlyAt,
    });
    expect(paymentService.handleWebhook(success.rawBody, success.signature))
      .toEqual({ outcome: 'processed' });

    const db = openDb();
    try {
      // The money is recorded: it genuinely moved.
      const booked = db.prepare(
        'SELECT COUNT(*) AS c FROM payments WHERE stripe_invoice_id = ?',
      ).get('in_early_success') as { c: number };
      expect(booked.c).toBe(1);

      const sub = db.prepare(
        `SELECT status, last_stripe_event_created
           FROM recurring_donation_subscriptions WHERE id = ?`,
      ).get(subscriptionId) as { status: string; last_stripe_event_created: string };
      // Not revived by older news, and the watermark did not rewind.
      expect(sub.status).toBe('past_due');
      expect(Date.parse(sub.last_stripe_event_created)).toBe(lateAt * 1000);

      // The ledger records where the row actually landed, not where the
      // unapplied event would have put it.
      const transition = db.prepare(
        `SELECT new_status FROM recurring_donation_subscription_transitions
          WHERE stripe_invoice_id = ?`,
      ).get('in_early_success') as { new_status: string };
      expect(transition.new_status).toBe('past_due');
    } finally {
      db.close();
    }
  });

  it('does not flip a settled renewal to past_due when the failed attempt arrives after the success', async () => {
    // One billing cycle raises both events: the attempt that declined and the
    // retry that collected. The provider does not guarantee delivery order, and
    // the failure's own retries make inversion likely. Applying the older
    // failure afterwards would tell a member whose card was charged that it was
    // not, raise an administrator work item for money that arrived, and leave
    // the donation reading past_due until the next event a year later.
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activateSubscription(M_PLAIN);

    const failedAt = Math.floor(Date.parse('2026-07-01T10:00:00.000Z') / 1000);
    const succeededAt = failedAt + 3600;

    const success = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded', {
      invoiceId: 'in_cycle_one', createdSeconds: succeededAt,
    });
    expect(paymentService.handleWebhook(success.rawBody, success.signature))
      .toEqual({ outcome: 'processed' });

    const failure = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_failed', {
      invoiceId: 'in_cycle_one', createdSeconds: failedAt,
    });
    expect(paymentService.handleWebhook(failure.rawBody, failure.signature))
      .toEqual({ outcome: 'duplicate' });

    const db = openDb();
    try {
      const sub = db.prepare(
        'SELECT status, failure_count FROM recurring_donation_subscriptions WHERE id = ?',
      ).get(subscriptionId) as { status: string; failure_count: number };
      expect(sub.status).toBe('active');
      expect(sub.failure_count).toBe(0);
      // No charge-failed notice reaches the member, and no work item is raised.
      // Scoped to this subscription: the suite shares one database, so an
      // un-scoped count over the whole table asserts something about every
      // other test rather than about this one.
      const notices = db.prepare(
        `SELECT COUNT(*) AS c FROM work_queue_items
          WHERE queue_category = 'payments' AND entity_id = ?`,
      ).get(subscriptionId) as { c: number };
      expect(notices.c).toBe(0);
    } finally {
      db.close();
    }
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

  it('records a late failed charge on an ended donation once, however often it is redelivered', async () => {
    // The provider can report a failed collection after the subscription is
    // already gone: the last dunning attempt on a final invoice. Nothing is
    // owed and no member action would help, so it is recorded and acknowledged
    // rather than acted on. The audit ledger is append-only, so a redelivery
    // that appended again would put the same late failure on the record twice.
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activateSubscription(M_LATE_ON_ENDED);
    const deleted = stub.buildSignedStubSubscriptionEvent(sessionId, 'deleted');
    paymentService.handleWebhook(deleted.rawBody, deleted.signature);

    const failure = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_failed', {
      invoiceId: 'in_after_the_end',
    });
    expect(paymentService.handleWebhook(failure.rawBody, failure.signature))
      .toEqual({ outcome: 'ignored' });
    expect(paymentService.handleWebhook(failure.rawBody, failure.signature))
      .toEqual({ outcome: 'duplicate' });

    expect(countRows(
      "SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'payment.recurring_charge_declined' AND entity_id = ?",
      subscriptionId,
    )).toBe(1);
    // And the ended donation stays ended.
    expect(readSubscription(subscriptionId)!.status).toBe('canceled');
  });

  it('records a change reported against an ended donation once, however often it is redelivered', async () => {
    // Same shape as the late failure: a change cannot be applied to a
    // subscription already recorded as canceled without contradicting the
    // cancellation, so it is recorded and acknowledged, and the append-only
    // ledger must not carry it twice.
    const paymentService = await svc();
    const stub = await stubAdapter();
    const { sessionId, subscriptionId } = await activateSubscription(M_UPDATE_ON_ENDED);
    const deleted = stub.buildSignedStubSubscriptionEvent(sessionId, 'deleted');
    paymentService.handleWebhook(deleted.rawBody, deleted.signature);

    const updated = stub.buildSignedStubSubscriptionEvent(sessionId, 'updated');
    expect(paymentService.handleWebhook(updated.rawBody, updated.signature))
      .toEqual({ outcome: 'ignored' });
    expect(paymentService.handleWebhook(updated.rawBody, updated.signature))
      .toEqual({ outcome: 'duplicate' });

    expect(countRows(
      "SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'payment.recurring_donation_updated' AND entity_id = ?",
      subscriptionId,
    )).toBe(1);
    expect(readSubscription(subscriptionId)!.status).toBe('canceled');
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

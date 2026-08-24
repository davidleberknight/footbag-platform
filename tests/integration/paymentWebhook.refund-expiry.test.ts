import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3974');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember } from '../fixtures/factories';

const M_REFUND = 'rx-refund';
const M_REFUND_IDEMPOTENT = 'rx-refund-idem';
const M_EXPIRE = 'rx-expire';
const M_EXPIRE_IDEMPOTENT = 'rx-expire-idem';
const M_EXPIRE_UNKNOWN = 'rx-expire-unknown';
const M_PARTIAL = 'rx-partial';
const M_FULL = 'rx-full';
const M_STALE = 'rx-stale';
const M_AMBIGUOUS = 'rx-ambiguous';
const M_NO_INTENT = 'rx-no-intent';
const M_REFUND_PENDING = 'rx-refund-pending';
const M_REDELIVERED = 'rx-redelivered';
const M_ROLLBACK = 'rx-rollback';
const M_AUDIT_FIELDS = 'rx-audit-fields';
const M_UNATTRIBUTED_TWICE = 'rx-unattributed-twice';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const [i, id] of [M_REFUND, M_REFUND_IDEMPOTENT, M_EXPIRE, M_EXPIRE_IDEMPOTENT, M_EXPIRE_UNKNOWN, M_PARTIAL, M_FULL, M_STALE, M_AMBIGUOUS, M_NO_INTENT, M_REFUND_PENDING, M_REDELIVERED, M_ROLLBACK, M_AUDIT_FIELDS, M_UNATTRIBUTED_TWICE].entries()) {
    insertMember(db, { id, slug: `rx_${i}`, display_name: `Rx ${i}`, login_email: `rx${i}@example.com` });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(async () => {
  const { resetPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
  resetPaymentAdapterForTests();
});

function openDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

// Drives a membership purchase through to a settled 'succeeded' payment and
// returns the payment id plus the Stripe payment-intent id a refund event must
// reference (the refund handler matches on stripe_payment_intent_id).
async function settleSucceededPayment(
  memberId: string,
): Promise<{ paymentId: string; intentId: string; sessionId: string }> {
  const { paymentService } = await import('../../src/services/paymentService');
  const { getStubPaymentAdapterForTests, getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
  getPaymentAdapter();
  const started = await paymentService.startMembershipPurchase(memberId, 'tier1', '/members/x');
  const stub = getStubPaymentAdapterForTests()!;
  const { rawBody, signature } = stub.buildSignedStubWebhookEvent(started.sessionId);
  expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'processed' });
  const db = openDb();
  try {
    const row = db
      .prepare('SELECT stripe_payment_intent_id FROM payments WHERE id = ?')
      .get(started.paymentId) as { stripe_payment_intent_id: string };
    return {
      paymentId: started.paymentId,
      intentId: row.stripe_payment_intent_id,
      sessionId: started.sessionId,
    };
  } finally {
    db.close();
  }
}

// The provider builds the refund payload, not the test: a hand-written charge is
// free to omit fields real Stripe always sends, and the classification the
// handler makes turns on exactly those fields.
async function stubRefundEvent(
  sessionId: string,
  opts?: Parameters<
    NonNullable<
      Awaited<ReturnType<typeof import('../../src/adapters/paymentAdapter')['getStubPaymentAdapterForTests']>>
    >['buildSignedStubRefundEvent']
  >[1],
): Promise<{ rawBody: string; signature: string }> {
  const { getStubPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
  return getStubPaymentAdapterForTests()!.buildSignedStubRefundEvent(sessionId, opts);
}

// Starts a membership purchase and leaves it pending (no success webhook).
async function startPendingPayment(memberId: string): Promise<{ paymentId: string; sessionId: string }> {
  const { paymentService } = await import('../../src/services/paymentService');
  const { getPaymentAdapter } = await import('../../src/adapters/paymentAdapter');
  getPaymentAdapter();
  const started = await paymentService.startMembershipPurchase(memberId, 'tier1', '/members/x');
  return { paymentId: started.paymentId, sessionId: started.sessionId };
}

describe('out-of-order provider events on a payment', () => {
  // Delivery order is not guaranteed, so an older event can arrive after a
  // newer one. Applying it would quietly undo the newer state: a late-arriving
  // succeeded event landing after a refund would resurrect the payment as paid.
  it('ignores an event older than the last one already applied', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { paymentId, intentId } = await settleSucceededPayment(M_STALE);

    // Refund it with a clearly later event, then replay an older succeeded event.
    const refund = await signedEvent({
      id: 'evt_stale_refund',
      type: 'charge.refunded',
      created: 2000000000,
      data: {
        object: { id: 'ch_stale', payment_intent: intentId, amount: 1000, amount_refunded: 1000 },
      },
    });
    expect(paymentService.handleWebhook(refund.rawBody, refund.signature))
      .toEqual({ outcome: 'processed' });

    const late = await signedEvent({
      id: 'evt_stale_late_success',
      type: 'payment_intent.succeeded',
      created: 1000000000,
      data: { object: { id: intentId, amount: 1000, currency: 'usd', metadata: { paymentId } } },
    });
    expect(paymentService.handleWebhook(late.rawBody, late.signature))
      .toEqual({ outcome: 'duplicate' });

    const db = openDb();
    try {
      const row = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as
        { status: string };
      expect(row.status).toBe('refunded');
    } finally {
      db.close();
    }
  });
});

describe('partial refunds', () => {
  // The status machine is monotonic and `refunded` is terminal, so recording a
  // partial refund as a full one is a lie that cannot be walked back: it
  // misreports the donation on the member's own history, and it makes a later
  // full refund look like a duplicate and be dropped.
  it('does not mark a partially refunded payment as refunded', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { paymentId, sessionId } = await settleSucceededPayment(M_PARTIAL);
    const evt = await stubRefundEvent(sessionId, { amountCents: 1000, refundedAmountCents: 250 });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'ignored' });

    const db = openDb();
    try {
      const row = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as
        { status: string };
      expect(row.status).toBe('succeeded');
      const queued = db.prepare(
        "SELECT COUNT(*) AS c FROM work_queue_items WHERE task_type = 'partial_refund_review' AND entity_id = ?",
      ).get(paymentId) as { c: number };
      expect(queued.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it('acknowledges an expiry event that names no session, rather than retrying it forever', async () => {
    // A payload that cannot name its session is permanently unusable: every
    // redelivery carries the identical bytes. Throwing made it a 500, so the
    // provider retried for days and tripped the operator error alarm on each
    // attempt, and it could never succeed. Nothing is lost by acknowledging —
    // an expiry with no session matches no local row, and an abandoned checkout
    // that never receives its expiry is raised separately by the staleness sweep.
    const { paymentService } = await import('../../src/services/paymentService');
    const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
    const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
    const rawBody = JSON.stringify({
      id: 'evt_expiry_no_session',
      type: 'checkout.session.expired',
      created: Math.floor(Date.now() / 1000),
      data: { object: { payment_intent: 'pi_orphan' } },
    });
    expect(paymentService.handleWebhook(rawBody, signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET)))
      .toEqual({ outcome: 'ignored' });
  });

  it('raises one review item and one audit row when the same partial refund is redelivered', async () => {
    // The provider redelivers whenever it does not see a timely 200, including
    // when the 200 was sent and lost. This path acknowledges rather than
    // mutating, so it used to append its audit row and raise its work item on
    // every delivery: an administrator saw two review items for one refund, and
    // the append-only ledger permanently double-counted the money.
    const { paymentService } = await import('../../src/services/paymentService');
    const { paymentId, sessionId } = await settleSucceededPayment(M_REDELIVERED);
    const evt = await stubRefundEvent(sessionId, { amountCents: 1000, refundedAmountCents: 250 });

    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'ignored' });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'duplicate' });

    const db = openDb();
    try {
      const queued = db.prepare(
        "SELECT COUNT(*) AS c FROM work_queue_items WHERE task_type = 'partial_refund_review' AND entity_id = ?",
      ).get(paymentId) as { c: number };
      expect(queued.c).toBe(1);
      const audited = db.prepare(
        "SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'payment.partially_refunded' AND entity_id = ?",
      ).get(paymentId) as { c: number };
      expect(audited.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it('loses no work item when the raise fails part-way through the delivery', async () => {
    // The delivery claims the event id and raises the work item in ONE
    // transaction. Claimed first and committed separately, a failure to raise
    // would answer 500, the provider would redeliver, the claim would then lose,
    // and the handler would report a duplicate over a work item that was never
    // created — losing an administrator's only notice of a partial refund, since
    // the payment row itself never moves for one.
    const { paymentService } = await import('../../src/services/paymentService');
    const { paymentId, sessionId } = await settleSucceededPayment(M_ROLLBACK);
    const evt = await stubRefundEvent(sessionId, { amountCents: 1000, refundedAmountCents: 250 });
    const eventId = (JSON.parse(evt.rawBody) as { id: string }).id;

    // Fault injection against the real database: the raise fails, nothing else
    // does. A trigger is reversible and leaves every schema reference intact.
    const inject = openDb();
    try {
      inject.exec(
        `CREATE TRIGGER tmp_block_work_queue BEFORE INSERT ON work_queue_items
         BEGIN SELECT RAISE(ABORT, 'injected work-queue failure'); END;`,
      );
    } finally {
      inject.close();
    }

    expect(() => paymentService.handleWebhook(evt.rawBody, evt.signature)).toThrow();

    const during = openDb();
    try {
      const claimed = during.prepare(
        'SELECT COUNT(*) AS c FROM stripe_events WHERE event_id = ?',
      ).get(eventId) as { c: number };
      // The whole point: the claim rolled back with the failed raise.
      expect(claimed.c).toBe(0);
      const audited = during.prepare(
        "SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'payment.partially_refunded' AND entity_id = ?",
      ).get(paymentId) as { c: number };
      expect(audited.c).toBe(0);
      during.exec('DROP TRIGGER tmp_block_work_queue;');
    } finally {
      during.close();
    }

    // The provider's redelivery now finds nothing claimed and completes.
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'ignored' });

    const db = openDb();
    try {
      const queued = db.prepare(
        "SELECT COUNT(*) AS c FROM work_queue_items WHERE task_type = 'partial_refund_review' AND entity_id = ?",
      ).get(paymentId) as { c: number };
      expect(queued.c).toBe(1);
      const audited = db.prepare(
        "SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'payment.partially_refunded' AND entity_id = ?",
      ).get(paymentId) as { c: number };
      expect(audited.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it('still records a full refund as refunded', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { paymentId, sessionId } = await settleSucceededPayment(M_FULL);
    const evt = await stubRefundEvent(sessionId, { amountCents: 1000, refundedAmountCents: 1000 });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'processed' });

    const db = openDb();
    try {
      const row = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as
        { status: string };
      expect(row.status).toBe('refunded');
    } finally {
      db.close();
    }
  });

  // `refunded` cannot be walked back, so it is claimed only when the provider
  // states both amounts and they say the whole charge was returned. A payload
  // that leaves the amounts out must land in the state an administrator can
  // still resolve either way, never in the terminal one.
  it('records the amount, currency and charge id the refund requirement enumerates', async () => {
    // The audit ledger is kept for seven years and is read on its own, long
    // after anyone would think to join it back to a payment row that may by
    // then have been anonymized. A refund dispute is worked from this row, and
    // without the amount it cannot say how much went back.
    const { paymentService } = await import('../../src/services/paymentService');
    const { paymentId, sessionId } = await settleSucceededPayment(M_AUDIT_FIELDS);
    const evt = await stubRefundEvent(sessionId, { amountCents: 1000, refundedAmountCents: 1000 });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'processed' });

    const db = openDb();
    try {
      const succeeded = JSON.parse((db.prepare(
        "SELECT metadata_json FROM audit_entries WHERE action_type = 'payment.succeeded' AND entity_id = ?",
      ).get(paymentId) as { metadata_json: string }).metadata_json);
      expect(succeeded.amount_cents).toBe(1000);
      expect(succeeded.currency).toBe('USD');

      const refunded = JSON.parse((db.prepare(
        "SELECT metadata_json FROM audit_entries WHERE action_type = 'payment.refunded' AND entity_id = ?",
      ).get(paymentId) as { metadata_json: string }).metadata_json);
      expect(refunded.refunded_amount_cents).toBe(1000);
      expect(refunded.currency).toBe('USD');
      expect(typeof refunded.stripe_charge_id).toBe('string');
    } finally {
      db.close();
    }
  });

  it('treats a refund whose amounts are absent as partial, not full', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { paymentId, sessionId } = await settleSucceededPayment(M_AMBIGUOUS);
    const evt = await stubRefundEvent(sessionId, { omitAmounts: true });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'ignored' });

    const db = openDb();
    try {
      const row = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as
        { status: string };
      expect(row.status).toBe('succeeded');
      const queued = db.prepare(
        "SELECT COUNT(*) AS c FROM work_queue_items WHERE task_type = 'partial_refund_review' AND entity_id = ?",
      ).get(paymentId) as { c: number };
      expect(queued.c).toBe(1);
    } finally {
      db.close();
    }
  });

  // A charge the provider did not create from a payment intent carries no
  // reference to match a local payment on. It must still reach an administrator
  // rather than crashing the handler into a retry storm.
  it('queues a refund whose charge carries no payment-intent reference', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { sessionId } = await settleSucceededPayment(M_NO_INTENT);
    const evt = await stubRefundEvent(sessionId, { omitPaymentIntent: true });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'ignored' });

    const db = openDb();
    try {
      const queued = db.prepare(
        `SELECT COUNT(*) AS c FROM work_queue_items
         WHERE task_type = 'unattributed_refund' AND entity_type = 'stripe_charge'`,
      ).get() as { c: number };
      expect(queued.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it('puts one copy of an unattributable refund in front of an administrator, not one per delivery', async () => {
    // The provider redelivers whenever it does not see a timely 200, including
    // when the 200 was sent and lost. This path writes no payment row and moves
    // no status, so the work item is the only durable record it produces: a
    // second copy is a second case for the same money, and none at all is the
    // refund going unseen.
    const { paymentService } = await import('../../src/services/paymentService');
    const { sessionId } = await settleSucceededPayment(M_UNATTRIBUTED_TWICE);
    const evt = await stubRefundEvent(sessionId, { omitPaymentIntent: true });

    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'ignored' });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'duplicate' });

    const db = openDb();
    try {
      // The charge id is what an administrator would search on, and it is the
      // only identifier this path records, so the count is taken against it.
      const chargeId = ((JSON.parse(evt.rawBody) as { data: { object: { id: string } } })
        .data.object.id);
      const queued = db.prepare(
        `SELECT COUNT(*) AS c FROM work_queue_items
          WHERE task_type = 'unattributed_refund' AND entity_id = ?`,
      ).get(chargeId) as { c: number };
      expect(queued.c).toBe(1);
    } finally {
      db.close();
    }
  });
});

async function signedEvent(body: object): Promise<{ rawBody: string; signature: string }> {
  const { signStripeWebhook } = await import('../../src/adapters/stripeWebhook');
  const { STUB_WEBHOOK_SECRET } = await import('../../src/adapters/paymentAdapter');
  const rawBody = JSON.stringify(body);
  return { rawBody, signature: signStripeWebhook(rawBody, STUB_WEBHOOK_SECRET) };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe('charge.refunded webhook handler', () => {
  it('transitions a succeeded payment to refunded and writes a refund audit row', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { paymentId, sessionId } = await settleSucceededPayment(M_REFUND);
    const { rawBody, signature } = await stubRefundEvent(sessionId);

    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'processed' });

    const db = openDb();
    try {
      const payment = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as { status: string };
      expect(payment.status).toBe('refunded');
      // One transition for the success (pending -> succeeded) plus one for the refund.
      const transitions = db
        .prepare('SELECT COUNT(*) AS c FROM payment_status_transitions WHERE payment_id = ?')
        .get(paymentId) as { c: number };
      expect(transitions.c).toBe(2);
      const audit = db
        .prepare("SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'payment.refunded' AND entity_id = ?")
        .get(paymentId) as { c: number };
      expect(audit.c).toBe(1);
      // Refund makes no automatic tier change; the grant from the purchase stands.
      const tier = db
        .prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?')
        .get(M_REFUND) as { tier_status: string };
      expect(tier.tier_status).toBe('tier1');
    } finally {
      db.close();
    }
  });

  it('is idempotent: re-delivering the refund event applies the transition once', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { paymentId, sessionId } = await settleSucceededPayment(M_REFUND_IDEMPOTENT);
    const { rawBody, signature } = await stubRefundEvent(sessionId);

    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'duplicate' });

    const db = openDb();
    try {
      const transitions = db
        .prepare('SELECT COUNT(*) AS c FROM payment_status_transitions WHERE payment_id = ?')
        .get(paymentId) as { c: number };
      expect(transitions.c).toBe(2); // success + one refund; replay added none
      const audit = db
        .prepare("SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'payment.refunded' AND entity_id = ?")
        .get(paymentId) as { c: number };
      expect(audit.c).toBe(1);
    } finally {
      db.close();
    }
  });

  // Delivery order is not guaranteed, so the refund of a charge can arrive
  // before the event that recorded the charge itself. Refunding a payment the
  // ledger has not seen settle would either be refused by the monotonic status
  // machine or, worse, record a refund of money the platform never recorded
  // receiving. Asking for redelivery lets the success land first and the refund
  // apply cleanly afterwards.
  it('asks for redelivery when the refund arrives before the payment has settled', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { RecoverableWebhookError } = await import('../../src/services/paymentService');
    const { paymentId, sessionId } = await startPendingPayment(M_REFUND_PENDING);
    const { rawBody, signature } = await stubRefundEvent(sessionId);

    expect(() => paymentService.handleWebhook(rawBody, signature)).toThrow(RecoverableWebhookError);

    const db = openDb();
    try {
      const payment = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as { status: string };
      expect(payment.status).toBe('pending');
      const transitions = db
        .prepare('SELECT COUNT(*) AS c FROM payment_status_transitions WHERE payment_id = ?')
        .get(paymentId) as { c: number };
      expect(transitions.c).toBe(0);
      // Nothing was claimed, so the redelivery re-runs from a clean slate.
      const claimed = db
        .prepare("SELECT COUNT(*) AS c FROM stripe_events WHERE event_id = ?")
        .get((JSON.parse(rawBody) as { id: string }).id) as { c: number };
      expect(claimed.c).toBe(0);
    } finally {
      db.close();
    }
  });
});

describe('checkout.session.expired webhook handler', () => {
  it('cancels a pending payment and writes a cancel audit row', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { paymentId, sessionId } = await startPendingPayment(M_EXPIRE);
    const { rawBody, signature } = await signedEvent({
      id: 'evt_expire_ok',
      type: 'checkout.session.expired',
      created: nowSeconds(),
      data: { object: { id: sessionId } },
    });

    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'processed' });

    const db = openDb();
    try {
      const payment = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as { status: string };
      expect(payment.status).toBe('canceled');
      const audit = db
        .prepare("SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'payment.canceled' AND entity_id = ?")
        .get(paymentId) as { c: number };
      expect(audit.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it('is idempotent: re-delivering the expiry event is a no-op once canceled', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { sessionId } = await startPendingPayment(M_EXPIRE_IDEMPOTENT);
    const { rawBody, signature } = await signedEvent({
      id: 'evt_expire_idem',
      type: 'checkout.session.expired',
      created: nowSeconds(),
      data: { object: { id: sessionId } },
    });

    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'duplicate' });
  });

  it('acknowledges an expiry for an unknown session without writing payment state', async () => {
    const { paymentService } = await import('../../src/services/paymentService');
    const { rawBody, signature } = await signedEvent({
      id: 'evt_expire_unknown',
      type: 'checkout.session.expired',
      created: nowSeconds(),
      data: { object: { id: 'cs_never_created' } },
    });

    expect(paymentService.handleWebhook(rawBody, signature)).toEqual({ outcome: 'ignored' });
  });
});

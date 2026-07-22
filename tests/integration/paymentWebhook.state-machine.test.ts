/**
 * The payment webhook state machine: what each provider event is allowed to do
 * to a payment or a recurring donation, and what it must refuse to do.
 *
 * The cases here are the ones where the provider's model and the platform's
 * differ. A card decline is a moment inside an open checkout, not the end of the
 * payment. A donation that has ended stays ended however late the provider keeps
 * reporting against it. Money leaving the account through a dispute or stalling
 * in a failed payout is invisible to every other surface, so it has to be raised
 * where an administrator will see it.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3977');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember } from '../fixtures/factories';

const M_RETRY = 'sm-retry';
const M_ABANDON = 'sm-abandon';
const M_LATE_FAIL = 'sm-late-fail';
const M_SUB_PAID = 'sm-sub-paid';
const M_SUB_FAILED = 'sm-sub-failed';
const M_SUB_UPDATED = 'sm-sub-updated';
const M_SUB_PAUSED = 'sm-sub-paused';
const M_SUB_ORDER = 'sm-sub-order';
const M_SUB_RETRY = 'sm-sub-retry';
const M_SUB_LATE = 'sm-sub-late';
const M_DECLINE_AGAIN = 'sm-decline-again';
const M_EXPIRE_LATE = 'sm-expire-late';
const M_SIGNUP = 'sm-signup';

const MEMBERS = [
  M_RETRY, M_ABANDON, M_LATE_FAIL,
  M_SUB_PAID, M_SUB_FAILED, M_SUB_UPDATED, M_SUB_PAUSED, M_SUB_ORDER,
  M_SUB_RETRY, M_SUB_LATE,
  M_DECLINE_AGAIN, M_EXPIRE_LATE, M_SIGNUP,
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const [i, id] of MEMBERS.entries()) {
    insertMember(db, { id, slug: `sm_${i}`, display_name: `Sm ${i}`, login_email: `sm${i}@example.com` });
  }
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

async function services() {
  const { paymentService } = await import('../../src/services/paymentService');
  const mod = await import('../../src/adapters/paymentAdapter');
  mod.getPaymentAdapter();
  return { paymentService, stub: mod.getStubPaymentAdapterForTests()! };
}

/** Starts a membership checkout and returns the ids the events address. */
async function startCheckout(memberId: string): Promise<{ paymentId: string; sessionId: string }> {
  const { paymentService } = await services();
  const started = await paymentService.startMembershipPurchase(memberId, 'tier1', '/members/x');
  return { paymentId: started.paymentId, sessionId: started.sessionId };
}

/** Opens a recurring donation and returns the checkout session the lifecycle
 *  events are built from, plus the local subscription row id. */
async function liveSubscription(memberId: string): Promise<{ sessionId: string; subId: string }> {
  const { paymentService, stub } = await services();
  const started = await paymentService.startDonation(memberId, 2500, null, true, '/x');
  const created = stub.buildSignedStubWebhookEvent(started.sessionId);
  expect(paymentService.handleWebhook(created.rawBody, created.signature))
    .toEqual({ outcome: 'processed' });
  const stripeSubscriptionId = stub.sessions.get(started.sessionId)!.stripeSubscriptionId!;
  const db = openDb();
  try {
    const row = db
      .prepare('SELECT id FROM recurring_donation_subscriptions WHERE stripe_subscription_id = ?')
      .get(stripeSubscriptionId) as { id: string };
    return { sessionId: started.sessionId, subId: row.id };
  } finally {
    db.close();
  }
}

/** Ends a donation the way the provider does, so the later events in these tests
 *  arrive against a subscription that is already over. */
async function endSubscription(sessionId: string): Promise<void> {
  const { paymentService, stub } = await services();
  const ended = stub.buildSignedStubSubscriptionEvent(sessionId, 'deleted');
  expect(paymentService.handleWebhook(ended.rawBody, ended.signature))
    .toEqual({ outcome: 'processed' });
}

function subscriptionRow(subId: string): {
  status: string;
  canceled_at: string | null;
  amount_cents: number;
} {
  const db = openDb();
  try {
    return db
      .prepare('SELECT status, canceled_at, amount_cents FROM recurring_donation_subscriptions WHERE id = ?')
      .get(subId) as { status: string; canceled_at: string | null; amount_cents: number };
  } finally {
    db.close();
  }
}

function countQueueItems(taskType: string, entityId?: string): number {
  const db = openDb();
  try {
    const sql = entityId
      ? 'SELECT COUNT(*) AS c FROM work_queue_items WHERE task_type = ? AND entity_id = ?'
      : 'SELECT COUNT(*) AS c FROM work_queue_items WHERE task_type = ?';
    const args = entityId ? [taskType, entityId] : [taskType];
    return (db.prepare(sql).get(...args) as { c: number }).c;
  } finally {
    db.close();
  }
}

describe('a declined card inside an open checkout', () => {
  it('leaves the payment open so a second card can still settle it', async () => {
    const { paymentService, stub } = await services();
    const { paymentId, sessionId } = await startCheckout(M_RETRY);

    stub.overrideSessionOutcome(sessionId, 'failure');
    const declined = stub.buildSignedStubWebhookEvent(sessionId);
    expect(paymentService.handleWebhook(declined.rawBody, declined.signature))
      .toEqual({ outcome: 'processed' });

    const db = openDb();
    try {
      const afterDecline = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as
        { status: string };
      expect(afterDecline.status).toBe('pending');
    } finally {
      db.close();
    }

    stub.overrideSessionOutcome(sessionId, 'success');
    const settled = stub.buildSignedStubWebhookEvent(sessionId);
    expect(paymentService.handleWebhook(settled.rawBody, settled.signature))
      .toEqual({ outcome: 'processed' });

    const db2 = openDb();
    try {
      const payment = db2.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as
        { status: string };
      expect(payment.status).toBe('succeeded');

      // The member paid, so the tier they bought is theirs.
      const tier = db2
        .prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?')
        .get(M_RETRY) as { tier_status?: string } | undefined;
      expect(tier?.tier_status).toBe('tier1');

      // The attempt is not lost: it is on the payment's own ledger, and so is
      // the settlement that followed it.
      const attempts = db2.prepare(
        `SELECT from_status, to_status, event_type FROM payment_status_transitions
         WHERE payment_id = ? ORDER BY created_at, rowid`,
      ).all(paymentId) as Array<{ from_status: string; to_status: string; event_type: string }>;
      expect(attempts).toHaveLength(2);
      expect(attempts[0]).toMatchObject({
        from_status: 'pending',
        to_status: 'pending',
        event_type: 'payment_intent.payment_failed',
      });
      expect(attempts[1]).toMatchObject({
        from_status: 'pending',
        to_status: 'succeeded',
        event_type: 'payment_intent.succeeded',
      });
    } finally {
      db2.close();
    }
  });

  it('settles the payment as canceled when the abandoned session expires', async () => {
    const { paymentService, stub } = await services();
    const { paymentId, sessionId } = await startCheckout(M_ABANDON);

    stub.overrideSessionOutcome(sessionId, 'failure');
    const declined = stub.buildSignedStubWebhookEvent(sessionId);
    paymentService.handleWebhook(declined.rawBody, declined.signature);

    stub.overrideSessionOutcome(sessionId, 'cancel');
    const expired = stub.buildSignedStubWebhookEvent(sessionId);
    expect(paymentService.handleWebhook(expired.rawBody, expired.signature))
      .toEqual({ outcome: 'processed' });

    const db = openDb();
    try {
      const payment = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as
        { status: string };
      expect(payment.status).toBe('canceled');
    } finally {
      db.close();
    }
  });

  it('acknowledges a decline reported after the payment already settled', async () => {
    const { paymentService, stub } = await services();
    const { paymentId, sessionId } = await startCheckout(M_LATE_FAIL);

    const settled = stub.buildSignedStubWebhookEvent(sessionId);
    expect(paymentService.handleWebhook(settled.rawBody, settled.signature))
      .toEqual({ outcome: 'processed' });

    stub.overrideSessionOutcome(sessionId, 'failure');
    const declined = stub.buildSignedStubWebhookEvent(sessionId);
    // Acknowledged, not retried: no redelivery of this event could ever apply it.
    expect(paymentService.handleWebhook(declined.rawBody, declined.signature))
      .toEqual({ outcome: 'duplicate' });

    const db = openDb();
    try {
      const payment = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as
        { status: string };
      expect(payment.status).toBe('succeeded');
    } finally {
      db.close();
    }
  });

  // The provider retries a delivery it did not get a clean answer for, so the
  // same decline arrives more than once. A second attempt row on the ledger
  // would misreport how many times the donor's card was actually refused.
  it('records one attempt when the same decline is delivered twice', async () => {
    const { paymentService, stub } = await services();
    const { paymentId, sessionId } = await startCheckout(M_DECLINE_AGAIN);

    stub.overrideSessionOutcome(sessionId, 'failure');
    const declined = stub.buildSignedStubWebhookEvent(sessionId);
    expect(paymentService.handleWebhook(declined.rawBody, declined.signature))
      .toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(declined.rawBody, declined.signature))
      .toEqual({ outcome: 'duplicate' });

    const db = openDb();
    try {
      const payment = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as
        { status: string };
      expect(payment.status).toBe('pending');

      const attempts = db.prepare(
        `SELECT COUNT(*) AS c FROM payment_status_transitions
         WHERE payment_id = ? AND event_type = 'payment_intent.payment_failed'`,
      ).get(paymentId) as { c: number };
      expect(attempts.c).toBe(1);
    } finally {
      db.close();
    }
  });

  // A session that has been paid still expires at the provider once its window
  // closes, so this event arrives in the ordinary course against a payment that
  // is already settled. Cancelling a payment the member made would take away
  // what they paid for.
  it('leaves a settled payment alone when its checkout session later expires', async () => {
    const { paymentService, stub } = await services();
    const { paymentId, sessionId } = await startCheckout(M_EXPIRE_LATE);

    const settled = stub.buildSignedStubWebhookEvent(sessionId);
    expect(paymentService.handleWebhook(settled.rawBody, settled.signature))
      .toEqual({ outcome: 'processed' });

    stub.overrideSessionOutcome(sessionId, 'cancel');
    const expired = stub.buildSignedStubWebhookEvent(sessionId);
    expect(paymentService.handleWebhook(expired.rawBody, expired.signature))
      .toEqual({ outcome: 'duplicate' });

    const db = openDb();
    try {
      const payment = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as
        { status: string };
      expect(payment.status).toBe('succeeded');

      const cancels = db.prepare(
        `SELECT COUNT(*) AS c FROM payment_status_transitions
         WHERE payment_id = ? AND to_status = 'canceled'`,
      ).get(paymentId) as { c: number };
      expect(cancels.c).toBe(0);

      // The tier the member bought is still theirs.
      const tier = db
        .prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?')
        .get(M_EXPIRE_LATE) as { tier_status?: string } | undefined;
      expect(tier?.tier_status).toBe('tier1');
    } finally {
      db.close();
    }
  });
});

describe('provider events arriving after a donation has ended', () => {
  it('records a charge that settled late without reviving the donation', async () => {
    const { paymentService, stub } = await services();
    const { sessionId, subId } = await liveSubscription(M_SUB_PAID);
    await endSubscription(sessionId);

    const late = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded');
    expect(paymentService.handleWebhook(late.rawBody, late.signature))
      .toEqual({ outcome: 'processed' });

    const after = subscriptionRow(subId);
    expect(after.status).toBe('canceled');
    expect(after.canceled_at).not.toBeNull();

    // The money moved, so the charge is on the books even though the donation
    // had already ended.
    const db = openDb();
    try {
      const charge = db.prepare(
        `SELECT status FROM payments WHERE recurring_subscription_id = ? AND status = 'succeeded'`,
      ).all(subId) as Array<{ status: string }>;
      expect(charge).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('acknowledges a failed charge without moving the donation off canceled', async () => {
    const { paymentService, stub } = await services();
    const { sessionId, subId } = await liveSubscription(M_SUB_FAILED);
    await endSubscription(sessionId);

    const late = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_failed');
    expect(paymentService.handleWebhook(late.rawBody, late.signature))
      .toEqual({ outcome: 'ignored' });

    const after = subscriptionRow(subId);
    expect(after.status).toBe('canceled');
    expect(after.canceled_at).not.toBeNull();
    // Nothing for an administrator to chase: the donation is already over.
    expect(countQueueItems('recurring_donation_charge_declined', subId)).toBe(0);
  });

  it('acknowledges a subscription change without moving the donation off canceled', async () => {
    const { paymentService, stub } = await services();
    const { sessionId, subId } = await liveSubscription(M_SUB_UPDATED);
    await endSubscription(sessionId);

    const late = stub.buildSignedStubSubscriptionEvent(sessionId, 'updated', {
      status: 'active',
      amountCents: 9900,
    });
    expect(paymentService.handleWebhook(late.rawBody, late.signature))
      .toEqual({ outcome: 'ignored' });

    const after = subscriptionRow(subId);
    expect(after.status).toBe('canceled');
    expect(after.amount_cents).toBe(2500);
    expect(after.canceled_at).not.toBeNull();
  });
});

describe('a donation paused at the provider', () => {
  it('stops reading as a live donation and is raised for an administrator', async () => {
    const { paymentService, stub } = await services();
    const { sessionId, subId } = await liveSubscription(M_SUB_PAUSED);

    const paused = stub.buildSignedStubSubscriptionEvent(sessionId, 'updated', {
      status: 'paused',
    });
    expect(paymentService.handleWebhook(paused.rawBody, paused.signature))
      .toEqual({ outcome: 'processed' });

    // The mirror has no paused state; what matters is that it no longer claims
    // the donation is collecting.
    expect(subscriptionRow(subId).status).toBe('past_due');
    expect(countQueueItems('recurring_donation_paused', subId)).toBe(1);
  });
});

describe('subscription events delivered out of order', () => {
  it('keeps the newer state when an older change arrives after it', async () => {
    const { paymentService, stub } = await services();
    const { sessionId, subId } = await liveSubscription(M_SUB_ORDER);

    const newer = stub.buildSignedStubSubscriptionEvent(sessionId, 'updated', {
      amountCents: 5000,
      createdSeconds: 2000000000,
    });
    expect(paymentService.handleWebhook(newer.rawBody, newer.signature))
      .toEqual({ outcome: 'processed' });

    const older = stub.buildSignedStubSubscriptionEvent(sessionId, 'updated', {
      amountCents: 1500,
      createdSeconds: 1000000000,
    });
    expect(paymentService.handleWebhook(older.rawBody, older.signature))
      .toEqual({ outcome: 'duplicate' });

    expect(subscriptionRow(subId).amount_cents).toBe(5000);
  });
});

describe('several payment attempts against one renewal invoice', () => {
  /** The charge rows recorded against an invoice, newest amount first. */
  function chargeRows(invoiceId: string): { id: string; amount_cents: number; status: string }[] {
    const db = openDb();
    try {
      return db
        .prepare('SELECT id, amount_cents, status FROM payments WHERE stripe_invoice_id = ?')
        .all(invoiceId) as { id: string; amount_cents: number; status: string }[];
    } finally {
      db.close();
    }
  }

  it('records one charge and moves it to the latest amount the provider reports', async () => {
    // The provider raises a payment event per attempt on an invoice and each
    // states the amount paid on that invoice so far, not the amount of that
    // attempt. A second row would book the same money twice and overstate what
    // the donation collected.
    const { paymentService, stub } = await services();
    const { sessionId } = await liveSubscription(M_SUB_RETRY);
    const invoiceId = 'in_retry_cycle';

    const partial = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded', {
      invoiceId, amountCents: 1000, createdSeconds: 1000000000,
    });
    expect(paymentService.handleWebhook(partial.rawBody, partial.signature))
      .toEqual({ outcome: 'processed' });

    const settled = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded', {
      invoiceId, amountCents: 2500, createdSeconds: 1000000100,
    });
    expect(paymentService.handleWebhook(settled.rawBody, settled.signature))
      .toEqual({ outcome: 'processed' });

    const rows = chargeRows(invoiceId);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount_cents).toBe(2500);
    expect(rows[0].status).toBe('succeeded');

    // The money settled once, so the ledger records one status change for it.
    const db = openDb();
    try {
      const transitions = db
        .prepare('SELECT COUNT(*) AS c FROM payment_status_transitions WHERE payment_id = ?')
        .get(rows[0].id) as { c: number };
      expect(transitions.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it('keeps the settled amount when an earlier attempt arrives after it', async () => {
    const { paymentService, stub } = await services();
    const { sessionId } = await liveSubscription(M_SUB_LATE);
    const invoiceId = 'in_late_attempt';

    const settled = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded', {
      invoiceId, amountCents: 2500, createdSeconds: 1000000100,
    });
    expect(paymentService.handleWebhook(settled.rawBody, settled.signature))
      .toEqual({ outcome: 'processed' });

    const earlier = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded', {
      invoiceId, amountCents: 1000, createdSeconds: 1000000000,
    });
    expect(paymentService.handleWebhook(earlier.rawBody, earlier.signature))
      .toEqual({ outcome: 'duplicate' });

    const rows = chargeRows(invoiceId);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount_cents).toBe(2500);
  });
});

describe('money leaving the account outside the payment flow', () => {
  it('raises a dispute for an administrator at every stage the provider reports', async () => {
    const { paymentService, stub } = await services();
    const disputeId = 'dp_state_machine_1';

    for (const kind of ['dispute_created', 'dispute_funds_withdrawn', 'dispute_closed'] as const) {
      const evt = stub.buildSignedStubAccountEvent(kind, {
        objectId: disputeId,
        amountCents: 2500,
        chargeId: 'ch_disputed_1',
        paymentIntentId: 'pi_disputed_1',
      });
      expect(paymentService.handleWebhook(evt.rawBody, evt.signature))
        .toEqual({ outcome: 'processed' });
    }

    expect(countQueueItems('charge_dispute_review', disputeId)).toBe(3);

    const db = openDb();
    try {
      const audits = db.prepare(
        `SELECT action_type FROM audit_entries WHERE entity_id = ? ORDER BY action_type`,
      ).all(disputeId) as Array<{ action_type: string }>;
      expect(audits.map((a) => a.action_type)).toEqual([
        'payment.dispute_closed',
        'payment.dispute_funds_withdrawn',
        'payment.dispute_opened',
      ]);

      // The identifiers an administrator needs to find the dispute at the
      // provider travel on the item itself.
      const detail = db.prepare(
        `SELECT detail_text FROM work_queue_items WHERE entity_id = ? LIMIT 1`,
      ).get(disputeId) as { detail_text: string };
      expect(detail.detail_text).toContain('ch_disputed_1');
      expect(detail.detail_text).toContain('pi_disputed_1');
      expect(detail.detail_text).toContain('$25.00');
    } finally {
      db.close();
    }
  });

  it('does not raise the same dispute event twice when it is redelivered', async () => {
    const { paymentService, stub } = await services();
    const evt = stub.buildSignedStubAccountEvent('dispute_created', {
      objectId: 'dp_state_machine_2',
    });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature))
      .toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature))
      .toEqual({ outcome: 'duplicate' });
    expect(countQueueItems('charge_dispute_review', 'dp_state_machine_2')).toBe(1);
  });

  it('raises a failed payout, which no other surface would show', async () => {
    const { paymentService, stub } = await services();
    const evt = stub.buildSignedStubAccountEvent('payout_failed', {
      objectId: 'po_state_machine_1',
      amountCents: 120000,
      reason: 'account_closed',
    });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature))
      .toEqual({ outcome: 'processed' });

    expect(countQueueItems('payout_failed', 'po_state_machine_1')).toBe(1);

    const db = openDb();
    try {
      const audit = db.prepare(
        `SELECT COUNT(*) AS c FROM audit_entries
         WHERE action_type = 'payment.payout_rejected' AND entity_id = ?`,
      ).get('po_state_machine_1') as { c: number };
      expect(audit.c).toBe(1);
    } finally {
      db.close();
    }
  });
});

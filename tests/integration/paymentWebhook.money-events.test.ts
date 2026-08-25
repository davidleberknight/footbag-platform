/**
 * Money moving outside a payment's own status machine, and settlements that
 * disagree with what was asked for.
 *
 * A dispute at every stage the provider reports, a refund the provider could
 * not complete, a rejected payout, a renewal reported twice by two event types,
 * a renewal invoice that collected nothing, and a settlement whose amount or
 * currency differs from the local record. None of these move the payment row;
 * each leaves an audit row and, where a person must act, a work item, written
 * in the same transaction as the event's idempotency claim so a failure between
 * them cannot lose the only record.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4103');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember } from '../fixtures/factories';

const M_REFUND_FAILED = 'me-refund-failed';
const M_REFUND_PROGRESS = 'me-refund-progress';
const M_INVOICE_PAID = 'me-invoice-paid';
const M_INVOICE_TWICE = 'me-invoice-twice';
const M_INVOICE_RESTATE = 'me-invoice-restate';
const M_INVOICE_ZERO = 'me-invoice-zero';
const M_AMOUNT_MISMATCH = 'me-amount-mismatch';
const M_CURRENCY_MISMATCH = 'me-currency-mismatch';
const M_AMOUNT_MATCH = 'me-amount-match';
const M_AMOUNT_ABSENT = 'me-amount-absent';

const MEMBERS = [
  M_REFUND_FAILED, M_REFUND_PROGRESS,
  M_INVOICE_PAID, M_INVOICE_TWICE, M_INVOICE_RESTATE, M_INVOICE_ZERO,
  M_AMOUNT_MISMATCH, M_CURRENCY_MISMATCH, M_AMOUNT_MATCH, M_AMOUNT_ABSENT,
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const [i, id] of MEMBERS.entries()) {
    insertMember(db, { id, slug: `me_${i}`, display_name: `Me ${i}`, login_email: `me${i}@example.com` });
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

function countRows(sql: string, ...args: unknown[]): number {
  const db = openDb();
  try {
    return (db.prepare(sql).get(...args) as { c: number }).c;
  } finally {
    db.close();
  }
}

function countQueueItems(taskType: string, entityId?: string): number {
  return entityId
    ? countRows('SELECT COUNT(*) AS c FROM work_queue_items WHERE task_type = ? AND entity_id = ?', taskType, entityId)
    : countRows('SELECT COUNT(*) AS c FROM work_queue_items WHERE task_type = ?', taskType);
}

function auditTypesFor(entityId: string): string[] {
  const db = openDb();
  try {
    return (db.prepare(
      'SELECT action_type FROM audit_entries WHERE entity_id = ? ORDER BY action_type',
    ).all(entityId) as Array<{ action_type: string }>).map((r) => r.action_type);
  } finally {
    db.close();
  }
}

function eventIdOf(evt: { rawBody: string }): string {
  return (JSON.parse(evt.rawBody) as { id: string }).id;
}

/** Puts a trigger in front of the work-queue insert so the side effect fails
 *  after the claim would have committed, then removes it. */
function withBlockedWorkQueue(run: () => void): void {
  const inject = openDb();
  try {
    inject.exec(
      `CREATE TRIGGER tmp_block_work_queue BEFORE INSERT ON work_queue_items
       BEGIN SELECT RAISE(ABORT, 'injected work-queue failure'); END;`,
    );
  } finally {
    inject.close();
  }
  try {
    run();
  } finally {
    const clear = openDb();
    try {
      clear.exec('DROP TRIGGER tmp_block_work_queue;');
    } finally {
      clear.close();
    }
  }
}

/** Drives a membership purchase to a settled payment and returns its ids. */
async function settleMembership(
  memberId: string,
): Promise<{ paymentId: string; sessionId: string; intentId: string }> {
  const { paymentService, stub } = await services();
  const started = await paymentService.startMembershipPurchase(memberId, 'tier1', '/members/x');
  const evt = stub.buildSignedStubWebhookEvent(started.sessionId);
  expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'processed' });
  return {
    paymentId: started.paymentId,
    sessionId: started.sessionId,
    intentId: stub.sessions.get(started.sessionId)!.paymentIntentId!,
  };
}

/** Opens a recurring donation and confirms it, returning the session the
 *  renewal events are built from and the local subscription row id. */
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

function chargeRows(invoiceId: string): Array<{ amount_cents: number; status: string }> {
  const db = openDb();
  try {
    return db
      .prepare('SELECT amount_cents, status FROM payments WHERE stripe_invoice_id = ?')
      .all(invoiceId) as Array<{ amount_cents: number; status: string }>;
  } finally {
    db.close();
  }
}

function tierOf(memberId: string): string {
  const db = openDb();
  try {
    return (db.prepare('SELECT tier_status FROM member_tier_current WHERE member_id = ?')
      .get(memberId) as { tier_status: string }).tier_status;
  } finally {
    db.close();
  }
}

function mismatchIssuesFor(paymentId: string): Array<{ details_json: string }> {
  const db = openDb();
  try {
    return db.prepare(
      "SELECT details_json FROM reconciliation_issues WHERE issue_type = 'payment_amount_mismatch' AND payment_id = ?",
    ).all(paymentId) as Array<{ details_json: string }>;
  } finally {
    db.close();
  }
}

describe('a card dispute through every stage the provider reports', () => {
  it('records each stage and puts every stage except an evidence update in front of an administrator', async () => {
    const { paymentService, stub } = await services();
    const disputeId = 'dp_money_events_1';
    const stages = [
      'dispute_created', 'dispute_updated', 'dispute_funds_withdrawn',
      'dispute_closed', 'dispute_funds_reinstated',
    ] as const;
    for (const kind of stages) {
      const evt = stub.buildSignedStubAccountEvent(kind, {
        objectId: disputeId, amountCents: 2500, chargeId: 'ch_me_1', paymentIntentId: 'pi_me_1',
      });
      expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'processed' });
    }

    expect(auditTypesFor(disputeId)).toEqual([
      'payment.dispute_closed',
      'payment.dispute_funds_reinstated',
      'payment.dispute_funds_withdrawn',
      'payment.dispute_opened',
      'payment.dispute_updated',
    ]);
    // Four items: the evidence update raises none, because the case is already
    // in front of someone.
    expect(countQueueItems('charge_dispute_review', disputeId)).toBe(4);

    const db = openDb();
    try {
      const reinstated = db.prepare(
        `SELECT reason_text, detail_text FROM work_queue_items
         WHERE entity_id = ? AND reason_text LIKE '%returned to the account%'`,
      ).get(disputeId) as { reason_text: string; detail_text: string } | undefined;
      expect(reinstated).toBeDefined();
      expect(reinstated!.detail_text).toContain('status won');
      expect(reinstated!.detail_text).toContain('$25.00');
    } finally {
      db.close();
    }
  });

  it('records a won dispute once however often the provider redelivers it', async () => {
    const { paymentService, stub } = await services();
    const evt = stub.buildSignedStubAccountEvent('dispute_funds_reinstated', { objectId: 'dp_money_events_2' });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'duplicate' });
    expect(countQueueItems('charge_dispute_review', 'dp_money_events_2')).toBe(1);
    expect(auditTypesFor('dp_money_events_2')).toEqual(['payment.dispute_funds_reinstated']);
  });

  it('loses neither the audit row nor the work item when the raise fails part-way through', async () => {
    const { paymentService, stub } = await services();
    const disputeId = 'dp_money_events_3';
    const evt = stub.buildSignedStubAccountEvent('dispute_created', { objectId: disputeId });

    withBlockedWorkQueue(() => {
      expect(() => paymentService.handleWebhook(evt.rawBody, evt.signature)).toThrow();
      // The claim rolled back with the failed raise, and so did the audit row
      // written before it: the delivery left no half-record behind.
      expect(countRows('SELECT COUNT(*) AS c FROM stripe_events WHERE event_id = ?', eventIdOf(evt))).toBe(0);
      expect(auditTypesFor(disputeId)).toEqual([]);
    });

    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'processed' });
    expect(auditTypesFor(disputeId)).toEqual(['payment.dispute_opened']);
    expect(countQueueItems('charge_dispute_review', disputeId)).toBe(1);
  });
});

describe('a payout the bank refused', () => {
  it('loses neither the audit row nor the work item when the raise fails part-way through', async () => {
    const { paymentService, stub } = await services();
    const payoutId = 'po_money_events_1';
    const evt = stub.buildSignedStubAccountEvent('payout_failed', { objectId: payoutId, amountCents: 120000 });

    withBlockedWorkQueue(() => {
      expect(() => paymentService.handleWebhook(evt.rawBody, evt.signature)).toThrow();
      expect(countRows('SELECT COUNT(*) AS c FROM stripe_events WHERE event_id = ?', eventIdOf(evt))).toBe(0);
      expect(auditTypesFor(payoutId)).toEqual([]);
    });

    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'duplicate' });
    expect(auditTypesFor(payoutId)).toEqual(['payment.payout_rejected']);
    expect(countQueueItems('payout_failed', payoutId)).toBe(1);
  });
});

describe('a refund the provider could not return to the card', () => {
  it('records the failure against the refunded payment and raises it, once', async () => {
    const { paymentService, stub } = await services();
    const { paymentId, sessionId, intentId } = await settleMembership(M_REFUND_FAILED);
    const refunded = stub.buildSignedStubRefundEvent(sessionId);
    expect(paymentService.handleWebhook(refunded.rawBody, refunded.signature)).toEqual({ outcome: 'processed' });

    const failed = stub.buildSignedStubAccountEvent('refund_failed', {
      objectId: 're_money_events_1', paymentIntentId: intentId, amountCents: 1000, reason: 'expired_or_canceled_card',
    });
    expect(paymentService.handleWebhook(failed.rawBody, failed.signature)).toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(failed.rawBody, failed.signature)).toEqual({ outcome: 'duplicate' });

    // The payment row stays refunded: the status machine has nowhere to go
    // back to, and the failure lives beside it instead.
    const db = openDb();
    try {
      const row = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as { status: string };
      expect(row.status).toBe('refunded');
      const audit = db.prepare(
        "SELECT metadata_json FROM audit_entries WHERE action_type = 'payment.refund_not_returned' AND entity_type = 'payment' AND entity_id = ?",
      ).all(paymentId) as Array<{ metadata_json: string }>;
      expect(audit).toHaveLength(1);
      const meta = JSON.parse(audit[0].metadata_json) as Record<string, unknown>;
      expect(meta.failure_reason).toBe('expired_or_canceled_card');
      expect(meta.stripe_refund_id).toBe('re_money_events_1');
      expect(meta.amount_cents).toBe(1000);
      const item = db.prepare(
        "SELECT detail_text FROM work_queue_items WHERE task_type = 'refund_failed_review' AND entity_id = ?",
      ).all('re_money_events_1') as Array<{ detail_text: string }>;
      expect(item).toHaveLength(1);
      expect(item[0].detail_text).toContain(`payment ${paymentId}`);
    } finally {
      db.close();
    }
  });

  it('acknowledges ordinary refund progress and records nothing', async () => {
    const { paymentService, stub } = await services();
    const { intentId } = await settleMembership(M_REFUND_PROGRESS);
    const progress = stub.buildSignedStubAccountEvent('refund_updated', {
      objectId: 're_money_events_2', paymentIntentId: intentId, refundStatus: 'succeeded',
    });
    expect(paymentService.handleWebhook(progress.rawBody, progress.signature)).toEqual({ outcome: 'ignored' });
    expect(countQueueItems('refund_failed_review', 're_money_events_2')).toBe(0);
    expect(countRows(
      "SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'payment.refund_not_returned' AND json_extract(metadata_json, '$.stripe_refund_id') = ?",
      're_money_events_2',
    )).toBe(0);
  });

  it('records a reversed refund it cannot attribute against the refund itself', async () => {
    const { paymentService, stub } = await services();
    const reversed = stub.buildSignedStubAccountEvent('refund_updated', {
      objectId: 're_money_events_3', paymentIntentId: 'pi_nobody_knows', refundStatus: 'canceled',
    });
    expect(paymentService.handleWebhook(reversed.rawBody, reversed.signature)).toEqual({ outcome: 'processed' });
    expect(auditTypesFor('re_money_events_3')).toEqual(['payment.refund_not_returned']);
    expect(countQueueItems('refund_failed_review', 're_money_events_3')).toBe(1);
  });
});

describe('the mode a recurring donation was confirmed in', () => {
  it('is recorded from the provider event, so a rehearsal never reconciles against live money', async () => {
    const { paymentService, stub } = await services();
    const started = await paymentService.startDonation(M_INVOICE_PAID, 2500, null, true, '/x');
    const opened = countRows(
      'SELECT COUNT(*) AS c FROM recurring_donation_subscriptions WHERE checkout_session_id = ? AND provider_livemode IS NULL',
      started.sessionId,
    );
    // The opening row has not been seen by the provider, so its mode is unknown.
    expect(opened).toBe(1);
    const created = stub.buildSignedStubWebhookEvent(started.sessionId);
    expect(paymentService.handleWebhook(created.rawBody, created.signature)).toEqual({ outcome: 'processed' });
    const db = openDb();
    try {
      const row = db.prepare(
        'SELECT provider_livemode FROM recurring_donation_subscriptions WHERE stripe_subscription_id = ?',
      ).get(stub.sessions.get(started.sessionId)!.stripeSubscriptionId!) as { provider_livemode: number };
      // The stub never carries a live flag, so the row records a rehearsal.
      expect(row.provider_livemode).toBe(0);
    } finally {
      db.close();
    }
  });
});

describe('a renewal the provider reports as paid', () => {
  it('books the charge from invoice.paid alone', async () => {
    const { paymentService, stub } = await services();
    const { sessionId } = await liveSubscription(M_INVOICE_PAID);
    const paid = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_paid', { invoiceId: 'in_me_paid' });
    expect(paymentService.handleWebhook(paid.rawBody, paid.signature)).toEqual({ outcome: 'processed' });
    const rows = chargeRows('in_me_paid');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ amount_cents: 2500, status: 'succeeded' });
  });

  it('books one settlement once when both invoice events arrive for it', async () => {
    const { paymentService, stub } = await services();
    const { sessionId } = await liveSubscription(M_INVOICE_TWICE);
    const paid = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_paid', { invoiceId: 'in_me_twice' });
    const succeeded = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded', { invoiceId: 'in_me_twice' });
    expect(paymentService.handleWebhook(paid.rawBody, paid.signature)).toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(succeeded.rawBody, succeeded.signature)).toEqual({ outcome: 'duplicate' });

    expect(chargeRows('in_me_twice')).toHaveLength(1);
    // Agreeing with what is booked is not a change, so no amount update is
    // written to the ledger for it.
    expect(countRows(
      "SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'payment.recurring_charge_amount_updated' AND json_extract(metadata_json, '$.stripe_invoice_id') = ?",
      'in_me_twice',
    )).toBe(0);
    // Both deliveries are on the received-event trail.
    expect(countRows('SELECT COUNT(*) AS c FROM stripe_events WHERE event_id IN (?, ?)', eventIdOf(paid), eventIdOf(succeeded))).toBe(2);
  });

  it('still restates a later event that reports a different amount for the same invoice', async () => {
    const { paymentService, stub } = await services();
    const { sessionId } = await liveSubscription(M_INVOICE_RESTATE);
    const first = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_paid', {
      invoiceId: 'in_me_restate', amountCents: 2000, createdSeconds: 1000000000,
    });
    const later = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded', {
      invoiceId: 'in_me_restate', amountCents: 2500, createdSeconds: 1000000100,
    });
    expect(paymentService.handleWebhook(first.rawBody, first.signature)).toEqual({ outcome: 'processed' });
    expect(paymentService.handleWebhook(later.rawBody, later.signature)).toEqual({ outcome: 'processed' });
    const rows = chargeRows('in_me_restate');
    expect(rows).toHaveLength(1);
    expect(rows[0].amount_cents).toBe(2500);
  });

  it('books nothing and sends no receipt for an invoice that collected nothing', async () => {
    const { paymentService, stub } = await services();
    const { sessionId, subId } = await liveSubscription(M_INVOICE_ZERO);
    // The signup confirmation is already in the outbox; nothing may join it.
    const outboxBefore = countRows(
      'SELECT COUNT(*) AS c FROM outbox_emails WHERE recipient_member_id = ?', M_INVOICE_ZERO,
    );
    const zero = stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded', {
      invoiceId: 'in_me_zero', amountCents: 0,
    });
    expect(paymentService.handleWebhook(zero.rawBody, zero.signature)).toEqual({ outcome: 'ignored' });
    expect(paymentService.handleWebhook(zero.rawBody, zero.signature)).toEqual({ outcome: 'duplicate' });

    expect(chargeRows('in_me_zero')).toHaveLength(0);
    expect(countRows(
      "SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'payment.recurring_charge_zero_amount' AND entity_id = ?",
      subId,
    )).toBe(1);
    expect(countRows(
      'SELECT COUNT(*) AS c FROM outbox_emails WHERE recipient_member_id = ?',
      M_INVOICE_ZERO,
    )).toBe(outboxBefore);
  });
});

describe('a settlement that disagrees with the local record', () => {
  it('settles and grants, and raises the amount disagreement at once with both figures', async () => {
    const { paymentService, stub } = await services();
    const started = await paymentService.startMembershipPurchase(M_AMOUNT_MISMATCH, 'tier1', '/members/x');
    const evt = stub.buildSignedStubWebhookEvent(started.sessionId, { settledAmountCents: 100 });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'processed' });

    expect(tierOf(M_AMOUNT_MISMATCH)).toBe('tier1');
    const issues = mismatchIssuesFor(started.paymentId);
    expect(issues).toHaveLength(1);
    const details = JSON.parse(issues[0].details_json) as Record<string, unknown>;
    expect(details.local_amount_cents).toBe(1000);
    expect(details.provider_amount_cents).toBe(100);
    expect(details.local_currency).toBe('USD');
    expect(details.provider_currency).toBe('USD');
    expect(countQueueItems('reconciliation_discrepancy')).toBeGreaterThanOrEqual(1);

    // A redelivery is a duplicate at the claim, so it raises nothing twice.
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'duplicate' });
    expect(mismatchIssuesFor(started.paymentId)).toHaveLength(1);
  });

  it('treats a different currency as a disagreement even when the number matches', async () => {
    const { paymentService, stub } = await services();
    const started = await paymentService.startMembershipPurchase(M_CURRENCY_MISMATCH, 'tier1', '/members/x');
    const evt = stub.buildSignedStubWebhookEvent(started.sessionId, { settledCurrency: 'EUR' });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'processed' });
    const issues = mismatchIssuesFor(started.paymentId);
    expect(issues).toHaveLength(1);
    expect((JSON.parse(issues[0].details_json) as Record<string, unknown>).provider_currency).toBe('EUR');
  });

  it('raises nothing when the settlement matches', async () => {
    const { paymentId } = await settleMembership(M_AMOUNT_MATCH);
    expect(mismatchIssuesFor(paymentId)).toHaveLength(0);
  });

  it('raises nothing when the settlement states no amount to compare', async () => {
    const { paymentService, stub } = await services();
    const started = await paymentService.startMembershipPurchase(M_AMOUNT_ABSENT, 'tier1', '/members/x');
    const evt = stub.buildSignedStubWebhookEvent(started.sessionId, { omitSettledAmount: true });
    expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'processed' });
    expect(tierOf(M_AMOUNT_ABSENT)).toBe('tier1');
    expect(mismatchIssuesFor(started.paymentId)).toHaveLength(0);
  });
});

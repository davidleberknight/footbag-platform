/**
 * A webhook's durable record survives a failed first delivery.
 *
 * Each handler claims the event id and writes its audit row, and where a person
 * must act a work item, in one transaction. If the claim committed first and the
 * record was written afterwards, a failure on that write would answer an error,
 * the provider would redeliver, the claim would then read as a duplicate, and
 * the payment's seven-year audit record or an administrator's only notice would
 * never be written. Each row below fails exactly that write on the first
 * delivery and asserts the claim rolled back with it, then redelivers and
 * asserts the record is there exactly once.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4311');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember } from '../fixtures/factories';
import { armWriteFault } from '../fixtures/faultInjection';

type Signed = { rawBody: string; signature: string };

interface SweepRow {
  event: string;
  /** The audit action this delivery must record. */
  actionType: string;
  /** A work item the delivery raises beside it, faulted in its own pass. */
  taskType?: string;
  /** Drives the member to the state the event applies to, and returns it. */
  prepare: (memberId: string) => Promise<Signed>;
}

let memberSeq = 0;

beforeAll(async () => {
  createTestDb(dbPath).close();
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

function freshMember(): string {
  memberSeq += 1;
  const id = `fi-member-${memberSeq}`;
  const db = openDb();
  try {
    insertMember(db, {
      id, slug: `fi_${memberSeq}`, display_name: `Fi ${memberSeq}`,
      login_email: `fi${memberSeq}@example.com`,
    });
  } finally {
    db.close();
  }
  return id;
}

async function services() {
  const { paymentService } = await import('../../src/services/paymentService');
  const mod = await import('../../src/adapters/paymentAdapter');
  mod.getPaymentAdapter();
  return { paymentService, stub: mod.getStubPaymentAdapterForTests()! };
}

function deliver(evt: Signed): unknown {
  return servicesSync!.handleWebhook(evt.rawBody, evt.signature);
}

let servicesSync: { handleWebhook(rawBody: string, signature: string): unknown } | null = null;

async function startMembership(memberId: string): Promise<string> {
  const { paymentService } = await services();
  return (await paymentService.startMembershipPurchase(memberId, 'tier1', '/members/x')).sessionId;
}

async function startRecurring(memberId: string): Promise<string> {
  const { paymentService } = await services();
  return (await paymentService.startDonation(memberId, 2500, null, true, '/x')).sessionId;
}

async function liveRecurring(memberId: string): Promise<string> {
  const { stub } = await services();
  const sessionId = await startRecurring(memberId);
  expect(deliver(stub.buildSignedStubWebhookEvent(sessionId))).toEqual({ outcome: 'processed' });
  return sessionId;
}

const ROWS: SweepRow[] = [
  {
    event: 'payment_intent.succeeded',
    actionType: 'payment.succeeded',
    prepare: async (m) => (await services()).stub.buildSignedStubWebhookEvent(await startMembership(m)),
  },
  {
    event: 'payment_intent.payment_failed',
    actionType: 'payment.attempt_declined',
    prepare: async (m) => {
      const { stub } = await services();
      const sessionId = await startMembership(m);
      stub.overrideSessionOutcome(sessionId, 'failure');
      return stub.buildSignedStubWebhookEvent(sessionId);
    },
  },
  {
    event: 'charge.refunded',
    actionType: 'payment.refunded',
    prepare: async (m) => {
      const { stub } = await services();
      const sessionId = await startMembership(m);
      expect(deliver(stub.buildSignedStubWebhookEvent(sessionId))).toEqual({ outcome: 'processed' });
      return stub.buildSignedStubRefundEvent(sessionId);
    },
  },
  {
    event: 'checkout.session.expired',
    actionType: 'payment.canceled',
    prepare: async (m) => {
      const { stub } = await services();
      const sessionId = await startMembership(m);
      stub.overrideSessionOutcome(sessionId, 'cancel');
      return stub.buildSignedStubWebhookEvent(sessionId);
    },
  },
  {
    event: 'checkout.session.expired',
    actionType: 'payment.recurring_donation_checkout_abandoned',
    prepare: async (m) => {
      const { stub } = await services();
      const sessionId = await startRecurring(m);
      stub.overrideSessionOutcome(sessionId, 'cancel');
      return stub.buildSignedStubWebhookEvent(sessionId);
    },
  },
  {
    event: 'customer.subscription.created',
    actionType: 'payment.recurring_donation_activated',
    prepare: async (m) => (await services()).stub.buildSignedStubWebhookEvent(await startRecurring(m)),
  },
  {
    event: 'invoice.paid',
    actionType: 'payment.recurring_charge_succeeded',
    prepare: async (m) => (await services()).stub.buildSignedStubSubscriptionEvent(
      await liveRecurring(m), 'invoice_paid', { invoiceId: `in_fi_paid_${m}` },
    ),
  },
  {
    event: 'invoice.payment_succeeded',
    actionType: 'payment.recurring_charge_amount_updated',
    prepare: async (m) => {
      const { stub } = await services();
      const sessionId = await liveRecurring(m);
      const invoiceId = `in_fi_restate_${m}`;
      expect(deliver(stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_paid', {
        invoiceId, amountCents: 2000, createdSeconds: 1_000_000_000,
      }))).toEqual({ outcome: 'processed' });
      return stub.buildSignedStubSubscriptionEvent(sessionId, 'invoice_succeeded', {
        invoiceId, amountCents: 2500, createdSeconds: 1_000_000_100,
      });
    },
  },
  {
    event: 'invoice.payment_failed',
    actionType: 'payment.recurring_charge_declined',
    taskType: 'recurring_donation_charge_declined',
    prepare: async (m) => (await services()).stub.buildSignedStubSubscriptionEvent(
      await liveRecurring(m), 'invoice_failed', { invoiceId: `in_fi_failed_${m}` },
    ),
  },
  {
    event: 'customer.subscription.updated',
    actionType: 'payment.recurring_donation_updated',
    taskType: 'recurring_donation_paused',
    prepare: async (m) => (await services()).stub.buildSignedStubSubscriptionEvent(
      await liveRecurring(m), 'updated', { collectionPaused: true },
    ),
  },
  {
    event: 'customer.subscription.deleted',
    actionType: 'payment.recurring_donation_canceled',
    prepare: async (m) => (await services()).stub.buildSignedStubSubscriptionEvent(
      await liveRecurring(m), 'deleted',
    ),
  },
];

// Every required event either has a row above, or records nothing outside a
// transaction it already shares with its claim, pinned by its own fault test:
// the dispute stages and the failed payout in the money-events suite, the refund
// outcomes beside the partial refund in the refund-expiry suite.
const ATOMIC_ELSEWHERE = [
  'refund.failed',
  'refund.updated',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
  'payout.failed',
];

function count(sql: string, ...args: unknown[]): number {
  const db = openDb();
  try {
    return (db.prepare(sql).get(...args) as { c: number }).c;
  } finally {
    db.close();
  }
}

function eventIdOf(evt: Signed): string {
  return (JSON.parse(evt.rawBody) as { id: string }).id;
}

function auditedFor(actionType: string, eventId: string): number {
  return count(
    "SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = ? AND json_extract(metadata_json, '$.stripe_event_id') = ?",
    actionType, eventId,
  );
}

describe('a webhook record written in the same transaction as its claim', () => {
  beforeAll(async () => {
    servicesSync = (await services()).paymentService;
  });

  it('accounts for every required webhook event', async () => {
    const { REQUIRED_WEBHOOK_EVENTS } = await import('../../src/services/paymentService');
    const covered = new Set([...ROWS.map((r) => r.event), ...ATOMIC_ELSEWHERE]);
    const missing = REQUIRED_WEBHOOK_EVENTS.filter((e) => !covered.has(e));
    expect(missing).toEqual([]);
  });

  it.each(ROWS.map((r) => [`${r.event} -> ${r.actionType}`, r] as const))(
    'keeps the audit row across a failed first delivery: %s',
    async (_label, row) => {
      const evt = await row.prepare(freshMember());
      const eventId = eventIdOf(evt);

      const fault = armWriteFault(dbPath, {
        table: 'audit_entries', op: 'INSERT', when: `NEW.action_type = '${row.actionType}'`,
      });
      try {
        expect(() => deliver(evt)).toThrow(/injected INSERT fault/);
      } finally {
        fault.disarm();
      }
      expect(count('SELECT COUNT(*) AS c FROM stripe_events WHERE event_id = ?', eventId)).toBe(0);

      expect(deliver(evt)).toEqual({ outcome: 'processed' });
      expect(auditedFor(row.actionType, eventId)).toBe(1);
    },
  );

  it.each(ROWS.filter((r) => r.taskType).map((r) => [r.taskType!, r] as const))(
    'keeps the work item across a failed first delivery: %s',
    async (taskType, row) => {
      const evt = await row.prepare(freshMember());
      const eventId = eventIdOf(evt);
      const before = count('SELECT COUNT(*) AS c FROM work_queue_items WHERE task_type = ?', taskType);

      const fault = armWriteFault(dbPath, {
        table: 'work_queue_items', op: 'INSERT', when: `NEW.task_type = '${taskType}'`,
      });
      try {
        expect(() => deliver(evt)).toThrow(/injected INSERT fault/);
      } finally {
        fault.disarm();
      }
      expect(count('SELECT COUNT(*) AS c FROM stripe_events WHERE event_id = ?', eventId)).toBe(0);
      expect(auditedFor(row.actionType, eventId)).toBe(0);

      expect(deliver(evt)).toEqual({ outcome: 'processed' });
      expect(count('SELECT COUNT(*) AS c FROM work_queue_items WHERE task_type = ?', taskType))
        .toBe(before + 1);
    },
  );
});

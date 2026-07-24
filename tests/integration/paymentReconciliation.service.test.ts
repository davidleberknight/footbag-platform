/**
 * Nightly payment reconciliation: the two comparison passes, the discrepancy
 * classes each raises, and the administrator-facing resolve path.
 *
 * The contract these assert: reconciliation reports disagreement and never
 * corrects either side, because a mismatch is evidence that needs a human
 * decision; a re-run over an unresolved discrepancy reports it once rather than
 * once per night; and an amount comparison compares currency as well as value,
 * so equal numbers in different currencies are a discrepancy rather than a
 * match.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4034');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertPayment,
  insertRecurringDonationSubscription,
} from '../fixtures/factories';

const MEMBER = 'recon-member';
const ADMIN = 'recon-admin';

// Inside the default seven-day reconciliation window relative to NOW.
const NOW = new Date('2026-07-20T03:00:00.000Z');
const IN_WINDOW = '2026-07-18T12:00:00.000Z';
const BEFORE_WINDOW = '2026-06-01T12:00:00.000Z';

let createApp: Awaited<ReturnType<typeof importApp>>;

function openDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER, slug: 'recon_member', display_name: 'Recon Member', login_email: 'recon@example.com' });
  insertMember(db, { id: ADMIN, slug: 'recon_admin', display_name: 'Recon Admin', login_email: 'recon-admin@example.com', is_admin: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Each case owns its own local rows and provider ledger, so one case's
// deliberate discrepancy is never another's surprise.
beforeEach(async () => {
  const { resetPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
  resetPaymentAdapterForTests();
  const db = openDb();
  try {
    db.prepare('DELETE FROM reconciliation_issues').run();
    db.prepare('DELETE FROM work_queue_items').run();
    db.prepare('DELETE FROM payments').run();
    db.prepare('DELETE FROM recurring_donation_subscriptions').run();
  } finally {
    db.close();
  }
});

async function svc() {
  return (await import('../../src/services/paymentReconciliationService')).paymentReconciliationService;
}

async function stub() {
  const mod = await import('../../src/adapters/paymentAdapter');
  mod.getPaymentAdapter();
  return mod.getStubPaymentAdapterForTests()!;
}

function seed(fn: (db: BetterSqlite3.Database) => void): void {
  const db = openDb();
  try {
    fn(db);
  } finally {
    db.close();
  }
}

function issueTypes(): string[] {
  const db = openDb();
  try {
    return (db.prepare('SELECT issue_type FROM reconciliation_issues ORDER BY issue_type').all() as
      { issue_type: string }[]).map((r) => r.issue_type);
  } finally {
    db.close();
  }
}

describe('pass 1: one-time payments against the provider ledger', () => {
  it('reports a settled local payment the provider has no record of', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-orphan', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_gone',
      });
    });
    const result = await (await svc()).runReconciliation({ now: NOW });
    expect(result.issuesRaised).toBe(1);
    expect(issueTypes()).toEqual(['payment_missing_at_provider']);
  });

  it('reports provider-settled money that never reached a local record, which is the missed-webhook case', async () => {
    const adapter = await stub();
    adapter.setLedgerPaymentIntent({
      id: 'pi_unrecorded', amountCents: 5000, currency: 'USD', status: 'succeeded', createdAt: IN_WINDOW,
    });
    const result = await (await svc()).runReconciliation({ now: NOW });
    expect(result.issuesRaised).toBe(1);
    expect(issueTypes()).toEqual(['provider_payment_missing_locally']);
  });

  it('ignores an unsettled provider intent, which is an abandoned checkout rather than a gap', async () => {
    const adapter = await stub();
    adapter.setLedgerPaymentIntent({
      id: 'pi_abandoned', amountCents: 5000, currency: 'USD',
      status: 'requires_payment_method', createdAt: IN_WINDOW,
    });
    const result = await (await svc()).runReconciliation({ now: NOW });
    expect(result.issuesRaised).toBe(0);
  });

  it('reports an amount that disagrees', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-amt', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_amt',
      });
    });
    const adapter = await stub();
    adapter.setLedgerPaymentIntent({
      id: 'pi_amt', amountCents: 9900, currency: 'USD', status: 'succeeded', createdAt: IN_WINDOW,
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).toContain('payment_amount_mismatch');
  });

  it('reports a matching amount under a different currency, because equal numbers in different currencies are different money', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-cur', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, currency: 'USD',
        stripe_payment_intent_id: 'pi_cur',
      });
    });
    const adapter = await stub();
    adapter.setLedgerPaymentIntent({
      id: 'pi_cur', amountCents: 2500, currency: 'EUR', status: 'succeeded', createdAt: IN_WINDOW,
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).toContain('payment_amount_mismatch');
  });

  it('reports a status that disagrees', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-st', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_st',
      });
    });
    const adapter = await stub();
    adapter.setLedgerPaymentIntent({
      id: 'pi_st', amountCents: 2500, currency: 'USD', status: 'canceled', createdAt: IN_WINDOW,
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).toContain('payment_status_mismatch');
  });

  it('leaves a pending checkout with no provider intent alone, because the provider defers creating one', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-inflight', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'pending', amount_cents: 2500, stripe_payment_intent_id: null,
      });
    });
    const result = await (await svc()).runReconciliation({ now: NOW });
    expect(result.issuesRaised).toBe(0);
  });

  it('compares only the window, so an older payment is not re-examined every night', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-old', member_id: MEMBER, created_at: BEFORE_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_old',
      });
    });
    const result = await (await svc()).runReconciliation({ now: NOW });
    expect(result.localPaymentsCompared).toBe(0);
    expect(result.issuesRaised).toBe(0);
  });

  it('skips anonymised payments, whose provider references were cleared on purpose at the retention boundary', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-anon', member_id: null, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: null,
      });
    });
    const result = await (await svc()).runReconciliation({ now: NOW });
    expect(result.localPaymentsCompared).toBe(0);
    expect(result.issuesRaised).toBe(0);
  });
});

describe('pass 2: subscriptions and renewal invoices', () => {
  it('reports a live local subscription the provider has no record of', async () => {
    seed((db) => {
      insertRecurringDonationSubscription(db, {
        member_id: MEMBER, stripe_subscription_id: 'sub_gone', status: 'active',
      });
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).toContain('subscription_missing_at_provider');
  });

  it('reports a live provider subscription with no local mirror', async () => {
    const adapter = await stub();
    adapter.setLedgerSubscription({
      id: 'sub_unmirrored', customerId: 'cus_x', status: 'active', amountCents: 2500, currency: 'USD',
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).toContain('provider_subscription_missing_locally');
  });

  it('ignores a provider subscription the provider has already ended, which is history rather than a gap', async () => {
    const adapter = await stub();
    adapter.setLedgerSubscription({
      id: 'sub_done', customerId: 'cus_x', status: 'canceled', amountCents: 2500, currency: 'USD',
    });
    const result = await (await svc()).runReconciliation({ now: NOW });
    expect(result.issuesRaised).toBe(0);
  });

  it('reports a subscription status that disagrees', async () => {
    seed((db) => {
      insertRecurringDonationSubscription(db, {
        member_id: MEMBER, stripe_subscription_id: 'sub_drift', status: 'active',
      });
    });
    const adapter = await stub();
    adapter.setLedgerSubscription({
      id: 'sub_drift', customerId: 'cus_x', status: 'past_due', amountCents: 2500, currency: 'USD',
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).toContain('subscription_status_mismatch');
  });

  it('reports a provider renewal charge with no local payment record', async () => {
    seed((db) => {
      insertRecurringDonationSubscription(db, {
        member_id: MEMBER, stripe_subscription_id: 'sub_live', status: 'active',
      });
    });
    const adapter = await stub();
    adapter.setLedgerSubscription({
      id: 'sub_live', customerId: 'cus_x', status: 'active', amountCents: 2500, currency: 'USD',
    });
    adapter.setLedgerInvoice({
      id: 'in_missing', subscriptionId: 'sub_live', amountPaidCents: 2500,
      currency: 'USD', status: 'paid', createdAt: IN_WINDOW,
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).toContain('invoice_charge_missing_locally');
  });

  it('accepts a renewal charge that was recorded, matching on the stored invoice id', async () => {
    seed((db) => {
      const subId = insertRecurringDonationSubscription(db, {
        member_id: MEMBER, stripe_subscription_id: 'sub_ok', status: 'active',
      });
      insertPayment(db, {
        id: 'pay-renewal', member_id: MEMBER, payment_type: 'donation', created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500,
        recurring_subscription_id: subId, stripe_subscription_id: 'sub_ok',
        stripe_invoice_id: 'in_ok',
      });
    });
    const adapter = await stub();
    adapter.setLedgerSubscription({
      id: 'sub_ok', customerId: 'cus_x', status: 'active', amountCents: 2500, currency: 'USD',
    });
    adapter.setLedgerInvoice({
      id: 'in_ok', subscriptionId: 'sub_ok', amountPaidCents: 2500,
      currency: 'USD', status: 'paid', createdAt: IN_WINDOW,
    });
    const result = await (await svc()).runReconciliation({ now: NOW });
    expect(result.issuesRaised).toBe(0);
  });

  it('reports every unrecorded renewal on one subscription, not just the first', async () => {
    // Two renewals missed on the same donation are two separate charges of real
    // money. If the discrepancy's identity stopped at the subscription, the
    // second and every later one would be silently folded into the first and an
    // administrator would repair one charge believing the account was square.
    seed((db) => {
      insertRecurringDonationSubscription(db, {
        member_id: MEMBER, stripe_subscription_id: 'sub_two', status: 'active',
      });
    });
    const adapter = await stub();
    adapter.setLedgerSubscription({
      id: 'sub_two', customerId: 'cus_x', status: 'active', amountCents: 2500, currency: 'USD',
    });
    adapter.setLedgerInvoice({
      id: 'in_first', subscriptionId: 'sub_two', amountPaidCents: 2500,
      currency: 'USD', status: 'paid', createdAt: IN_WINDOW,
    });
    adapter.setLedgerInvoice({
      id: 'in_second', subscriptionId: 'sub_two', amountPaidCents: 2500,
      currency: 'USD', status: 'paid', createdAt: IN_WINDOW,
    });

    const result = await (await svc()).runReconciliation({ now: NOW });

    expect(result.issuesRaised).toBe(2);
    const db = openDb();
    try {
      const rows = db.prepare(
        `SELECT stripe_invoice_id FROM reconciliation_issues
         WHERE issue_type = 'invoice_charge_missing_locally'
         ORDER BY stripe_invoice_id`,
      ).all() as { stripe_invoice_id: string }[];
      expect(rows.map((r) => r.stripe_invoice_id)).toEqual(['in_first', 'in_second']);
    } finally {
      db.close();
    }
  });

  it('still reports each missed renewal exactly once when the pass runs again', async () => {
    seed((db) => {
      insertRecurringDonationSubscription(db, {
        member_id: MEMBER, stripe_subscription_id: 'sub_rerun', status: 'active',
      });
    });
    const adapter = await stub();
    adapter.setLedgerSubscription({
      id: 'sub_rerun', customerId: 'cus_x', status: 'active', amountCents: 2500, currency: 'USD',
    });
    adapter.setLedgerInvoice({
      id: 'in_rerun_a', subscriptionId: 'sub_rerun', amountPaidCents: 2500,
      currency: 'USD', status: 'paid', createdAt: IN_WINDOW,
    });
    adapter.setLedgerInvoice({
      id: 'in_rerun_b', subscriptionId: 'sub_rerun', amountPaidCents: 2500,
      currency: 'USD', status: 'paid', createdAt: IN_WINDOW,
    });

    const service = await svc();
    const first = await service.runReconciliation({ now: NOW });
    const second = await service.runReconciliation({ now: NOW });

    expect(first.issuesRaised).toBe(2);
    expect(second.issuesRaised).toBe(0);
    expect(second.duplicatesSkipped).toBe(2);
  });

  it('reports an unmirrored subscription once, not twice, when its invoice is also unmatched', async () => {
    const adapter = await stub();
    adapter.setLedgerSubscription({
      id: 'sub_ghost', customerId: 'cus_x', status: 'active', amountCents: 2500, currency: 'USD',
    });
    adapter.setLedgerInvoice({
      id: 'in_ghost', subscriptionId: 'sub_ghost', amountPaidCents: 2500,
      currency: 'USD', status: 'paid', createdAt: IN_WINDOW,
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).toEqual(['provider_subscription_missing_locally']);
  });
});

describe('records the comparison deliberately does not report', () => {
  it('accepts a refunded payment whose provider intent still reads settled', async () => {
    // A refund does not move the provider intent off succeeded: the charge did
    // succeed, and the reversal is a separate provider record. Reading that as a
    // status mismatch would re-raise the same issue for every refund on every
    // nightly pass, which is how a genuine alert channel turns into noise.
    seed((db) => {
      insertPayment(db, {
        id: 'pay-refunded', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'refunded', amount_cents: 2500, stripe_payment_intent_id: 'pi_refunded',
      });
    });
    const adapter = await stub();
    adapter.setLedgerPaymentIntent({
      id: 'pi_refunded', amountCents: 2500, currency: 'USD', status: 'succeeded',
      createdAt: IN_WINDOW,
    });

    const result = await (await svc()).runReconciliation({ now: NOW });

    expect(result.issuesRaised).toBe(0);
  });

  it('still reports a genuine status disagreement on a payment that was never refunded', async () => {
    // Guards the guard: the refund allowance must not swallow the mismatch
    // class it sits inside.
    seed((db) => {
      insertPayment(db, {
        id: 'pay-still-pending', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'pending', amount_cents: 2500, stripe_payment_intent_id: 'pi_settled',
      });
    });
    const adapter = await stub();
    adapter.setLedgerPaymentIntent({
      id: 'pi_settled', amountCents: 2500, currency: 'USD', status: 'succeeded',
      createdAt: IN_WINDOW,
    });

    await (await svc()).runReconciliation({ now: NOW });

    expect(issueTypes()).toEqual(['payment_status_mismatch']);
  });
});

describe('the delivery grace period', () => {
  // A webhook and a ledger read do not land at the same instant, so a record
  // seconds old legitimately exists on one side only. Judging it immediately
  // reports two systems catching up with each other as a discrepancy.
  const JUST_NOW = '2026-07-20T02:50:00.000Z';
  const WELL_BEFORE = '2026-07-20T01:00:00.000Z';

  it('leaves a provider charge that landed moments ago for a later run', async () => {
    const adapter = await stub();
    adapter.setLedgerPaymentIntent({
      id: 'pi_fresh', amountCents: 5000, currency: 'USD', status: 'succeeded',
      createdAt: JUST_NOW,
    });

    const result = await (await svc()).runReconciliation({ now: NOW });

    expect(result.issuesRaised).toBe(0);
  });

  it('reports the same provider charge once it is older than the grace period', async () => {
    const adapter = await stub();
    adapter.setLedgerPaymentIntent({
      id: 'pi_aged', amountCents: 5000, currency: 'USD', status: 'succeeded',
      createdAt: WELL_BEFORE,
    });

    await (await svc()).runReconciliation({ now: NOW });

    expect(issueTypes()).toEqual(['provider_payment_missing_locally']);
  });

  it('leaves a local payment written moments ago for a later run', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-fresh', member_id: MEMBER, created_at: JUST_NOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_local_fresh',
      });
    });

    const result = await (await svc()).runReconciliation({ now: NOW });

    expect(result.issuesRaised).toBe(0);
  });

  it('leaves a renewal invoice raised moments ago for a later run', async () => {
    seed((db) => {
      insertRecurringDonationSubscription(db, {
        member_id: MEMBER, stripe_subscription_id: 'sub_fresh', status: 'active',
      });
    });
    const adapter = await stub();
    adapter.setLedgerSubscription({
      id: 'sub_fresh', customerId: 'cus_x', status: 'active', amountCents: 2500, currency: 'USD',
    });
    adapter.setLedgerInvoice({
      id: 'in_fresh', subscriptionId: 'sub_fresh', amountPaidCents: 2500,
      currency: 'USD', status: 'paid', createdAt: JUST_NOW,
    });

    const result = await (await svc()).runReconciliation({ now: NOW });

    expect(result.issuesRaised).toBe(0);
  });
});

describe('re-running the pass', () => {
  it('reports an unresolved discrepancy once, however many nights it runs', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-repeat', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_repeat',
      });
    });
    const service = await svc();
    const first = await service.runReconciliation({ now: NOW });
    const second = await service.runReconciliation({ now: NOW });
    expect(first.issuesRaised).toBe(1);
    expect(second.issuesRaised).toBe(0);
    expect(second.duplicatesSkipped).toBe(1);
    expect(issueTypes()).toHaveLength(1);
  });

  it('de-duplicates structurally, so overlapping runs cannot both raise the same issue', async () => {
    // The idempotency guarantee cannot rest on a check-then-insert in service
    // code: two overlapping runs (the nightly pass and an operator re-running
    // it) both read "not present" before either commits. Raising the same draft
    // twice in a row proves the constraint, not the check, is what holds.
    seed((db) => {
      insertPayment(db, {
        id: 'pay-atomic', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_atomic',
      });
    });
    const service = await svc();
    const draft = {
      issueType: 'payment_missing_at_provider' as const,
      paymentId: 'pay-atomic',
      stripePaymentIntentId: 'pi_atomic',
      stripeSubscriptionId: null,
      stripeInvoiceId: null,
      details: { reason: 'test' },
    };
    expect(service.raiseIssue(draft, NOW)).toBe(true);
    expect(service.raiseIssue(draft, NOW)).toBe(false);
    expect(issueTypes()).toHaveLength(1);
  });

  it('de-duplicates a discrepancy whose references are null, which a unique index alone would miss', async () => {
    // SQLite treats NULLs as distinct in a unique index, so a discrepancy with
    // no local payment id would duplicate on every run without the coalesced
    // index expression behind it.
    const service = await svc();
    const draft = {
      issueType: 'provider_payment_missing_locally' as const,
      paymentId: null,
      stripePaymentIntentId: 'pi_nulls',
      stripeSubscriptionId: null,
      stripeInvoiceId: null,
      details: { reason: 'test' },
    };
    expect(service.raiseIssue(draft, NOW)).toBe(true);
    expect(service.raiseIssue(draft, NOW)).toBe(false);
    expect(issueTypes()).toHaveLength(1);
  });

  it('raises a payments work-queue item per issue, so a discrepancy reaches the dashboard', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-wq', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_wq',
      });
    });
    await (await svc()).runReconciliation({ now: NOW });
    const db = openDb();
    try {
      const row = db.prepare(
        "SELECT COUNT(*) AS c FROM work_queue_items WHERE queue_category = 'payments' AND task_type = 'reconciliation_discrepancy'",
      ).get() as { c: number };
      expect(row.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it('never rewrites either side, because a mismatch is evidence for a human rather than something to correct', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-untouched', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_untouched',
      });
    });
    const adapter = await stub();
    adapter.setLedgerPaymentIntent({
      id: 'pi_untouched', amountCents: 9900, currency: 'USD', status: 'canceled', createdAt: IN_WINDOW,
    });
    await (await svc()).runReconciliation({ now: NOW });
    const db = openDb();
    try {
      const row = db.prepare('SELECT status, amount_cents FROM payments WHERE id = ?').get('pay-untouched') as
        { status: string; amount_cents: number };
      expect(row.status).toBe('succeeded');
      expect(row.amount_cents).toBe(2500);
    } finally {
      db.close();
    }
  });
});

describe('resolving an issue', () => {
  async function oneOutstandingIssue(): Promise<string> {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-res', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_res',
      });
    });
    await (await svc()).runReconciliation({ now: NOW });
    const db = openDb();
    try {
      return (db.prepare('SELECT id FROM reconciliation_issues LIMIT 1').get() as { id: string }).id;
    } finally {
      db.close();
    }
  }

  it('records who decided, when, and why', async () => {
    const issueId = await oneOutstandingIssue();
    await (await svc()).resolveIssue({ issueId, adminMemberId: ADMIN, notes: 'Checked the provider console; a test charge.' });
    const db = openDb();
    try {
      const row = db.prepare('SELECT * FROM reconciliation_issues WHERE id = ?').get(issueId) as Record<string, unknown>;
      expect(row.status).toBe('resolved');
      expect(row.resolved_by_member_id).toBe(ADMIN);
      expect(row.resolution_notes).toBe('Checked the provider console; a test charge.');
      expect(row.resolved_at).toBeTruthy();
    } finally {
      db.close();
    }
  });

  it('closes the discrepancy work-queue twin in the same step, so the two never drift apart', async () => {
    const issueId = await oneOutstandingIssue();
    const twinQuery =
      "SELECT status, resolved_by_member_id, decision_label, reason_text FROM work_queue_items " +
      "WHERE task_type = 'reconciliation_discrepancy' AND entity_type = 'reconciliation_issue' AND entity_id = ?";

    const db = openDb();
    try {
      const before = db.prepare(twinQuery).get(issueId) as { status: string };
      expect(before.status).toBe('open');
    } finally {
      db.close();
    }

    await (await svc()).resolveIssue({ issueId, adminMemberId: ADMIN, notes: 'Located in the dashboard.' });

    const after = openDb();
    try {
      const twin = after.prepare(twinQuery).get(issueId) as {
        status: string;
        resolved_by_member_id: string;
        decision_label: string;
        reason_text: string;
      };
      expect(twin.status).toBe('resolved');
      expect(twin.resolved_by_member_id).toBe(ADMIN);
      expect(twin.decision_label).toBe('closed_with_reconciliation_issue');
      expect(twin.reason_text).toBe('Located in the dashboard.');
    } finally {
      after.close();
    }
  });

  it('leaves the queue untouched when a second resolution is refused, with no orphaned audit row', async () => {
    const issueId = await oneOutstandingIssue();
    const service = await svc();
    service.resolveIssue({ issueId, adminMemberId: ADMIN, notes: 'First decision.' });
    // A later run re-raises the discrepancy as a fresh outstanding issue with its
    // own open twin; the stale id no longer resolves.
    await service.runReconciliation({ now: NOW });
    const { NotFoundError } = await import('../../src/services/serviceErrors');
    expect(() => service.resolveIssue({ issueId, adminMemberId: ADMIN, notes: 'Second decision.' }))
      .toThrow(NotFoundError);

    const db = openDb();
    try {
      const resolvedTwins = db.prepare(
        "SELECT COUNT(*) AS c FROM work_queue_items WHERE task_type = 'reconciliation_discrepancy' AND status = 'resolved'",
      ).get() as { c: number };
      const openTwins = db.prepare(
        "SELECT COUNT(*) AS c FROM work_queue_items WHERE task_type = 'reconciliation_discrepancy' AND status = 'open'",
      ).get() as { c: number };
      // The first resolution closed one twin; the re-raise opened a fresh one;
      // the refused second resolution changed neither.
      expect(resolvedTwins.c).toBe(1);
      expect(openTwins.c).toBe(1);
      const auditCount = db.prepare(
        "SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'payment.reconciliation_issue_resolved' AND entity_id = ?",
      ).get(issueId) as { c: number };
      expect(auditCount.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it('refuses an empty or whitespace note, because a closed issue with no explanation helps nobody', async () => {
    const issueId = await oneOutstandingIssue();
    const service = await svc();
    const { ValidationError } = await import('../../src/services/serviceErrors');
    expect(() => service.resolveIssue({ issueId, adminMemberId: ADMIN, notes: '' })).toThrow(ValidationError);
    expect(() => service.resolveIssue({ issueId, adminMemberId: ADMIN, notes: '   ' })).toThrow(ValidationError);
  });

  it('reports an unknown issue as missing', async () => {
    const service = await svc();
    const { NotFoundError } = await import('../../src/services/serviceErrors');
    expect(() => service.resolveIssue({ issueId: 'rec_nope', adminMemberId: ADMIN, notes: 'x' }))
      .toThrow(NotFoundError);
  });

  it('refuses a second resolution rather than overwriting the first administrator note', async () => {
    const issueId = await oneOutstandingIssue();
    const service = await svc();
    const { NotFoundError } = await import('../../src/services/serviceErrors');
    service.resolveIssue({ issueId, adminMemberId: ADMIN, notes: 'First decision.' });
    expect(() => service.resolveIssue({ issueId, adminMemberId: ADMIN, notes: 'Second decision.' }))
      .toThrow(NotFoundError);
    const db = openDb();
    try {
      const row = db.prepare('SELECT resolution_notes FROM reconciliation_issues WHERE id = ?').get(issueId) as
        { resolution_notes: string };
      expect(row.resolution_notes).toBe('First decision.');
    } finally {
      db.close();
    }
  });

  it('re-raises the discrepancy on a later run once it has been resolved, because a resolved issue no longer suppresses it', async () => {
    const issueId = await oneOutstandingIssue();
    const service = await svc();
    service.resolveIssue({ issueId, adminMemberId: ADMIN, notes: 'Handled.' });
    const again = await service.runReconciliation({ now: NOW });
    expect(again.issuesRaised).toBe(1);
  });
});

describe('retention', () => {
  it('purges resolved issues past their expiry but keeps outstanding ones however old', async () => {
    const service = await svc();
    seed((db) => {
      insertPayment(db, {
        id: 'pay-ret', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_ret',
      });
    });
    await service.runReconciliation({ now: NOW });
    const db = openDb();
    let issueId: string;
    try {
      issueId = (db.prepare('SELECT id FROM reconciliation_issues LIMIT 1').get() as { id: string }).id;
    } finally {
      db.close();
    }
    service.resolveIssue({ issueId, adminMemberId: ADMIN, notes: 'Handled.' });

    // Nothing is due yet at the moment of resolution.
    expect(service.purgeExpiredResolvedIssues({ now: NOW }).deleted).toBe(0);
    // Well past the retention window, the resolved row goes.
    const farFuture = new Date('2027-01-01T00:00:00.000Z');
    expect(service.purgeExpiredResolvedIssues({ now: farFuture }).deleted).toBe(1);

    // An outstanding issue of the same vintage survives the same sweep.
    await service.runReconciliation({ now: NOW });
    expect(service.purgeExpiredResolvedIssues({ now: farFuture }).deleted).toBe(0);
    expect(service.countOutstandingIssues()).toBe(1);
  });
});

describe('the reconciliation digest', () => {
  it('sends nothing when there is nothing outstanding, so an empty digest never trains people to ignore it', async () => {
    const result = (await svc()).sendReconciliationDigest();
    expect(result).toEqual({ admins: 0, sent: 0, outstanding: 0 });
  });

  it('reports the outstanding count when there is work waiting', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-digest', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_digest',
      });
    });
    const service = await svc();
    await service.runReconciliation({ now: NOW });
    expect(service.sendReconciliationDigest().outstanding).toBe(1);
  });
});

describe('the digest cadence gate', () => {
  it('sends on the first pass and then holds off until the configured interval elapses', async () => {
    // The daily worker tick calls this every day, so the config key rather than
    // the tick must govern the true cadence; without the gate administrators
    // would be mailed the same outstanding list every morning.
    const { operationsPlatformService } = await import('../../src/services/operationsPlatformService');
    seed((db) => {
      insertPayment(db, {
        id: 'pay-digest-gate', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_digest_gate',
      });
    });
    await (await svc()).runReconciliation({ now: NOW });

    const first = await operationsPlatformService.runReconciliationDigest(NOW);
    expect(first.skipped).toBe(false);

    // Immediately after, and a few days later: still inside the default
    // seven-day window, so no second mailing.
    expect((await operationsPlatformService.runReconciliationDigest(NOW)).skipped).toBe(true);
    const threeDaysOn = new Date('2026-07-23T03:00:00.000Z');
    expect((await operationsPlatformService.runReconciliationDigest(threeDaysOn)).skipped).toBe(true);

    // Well past the window, it sends again. The date is deliberately far out
    // rather than exactly eight days on, so the case reads as clearly outside
    // the interval rather than resting on which side of the boundary a
    // same-instant comparison falls.
    const wellPastTheWindow = new Date('2027-01-01T03:00:00.000Z');
    expect((await operationsPlatformService.runReconciliationDigest(wellPastTheWindow)).skipped)
      .toBe(false);
  });
});

describe('the nightly job gate', () => {
  it('runs on the first tick of a UTC day whatever hour that tick falls at', async () => {
    // The worker ticks once a day, at whatever time of day it happened to
    // start. A gate that also demanded a particular hour would skip a tick
    // falling before it and not get another chance until the next day, so a
    // worker started in the small hours would never reconcile at all.
    const { operationsPlatformService } = await import('../../src/services/operationsPlatformService');
    const earlyTick = new Date('2026-07-21T01:00:00.000Z');
    expect((await operationsPlatformService.runPaymentReconciliation(earlyTick)).skipped).toBe(false);

    // Same UTC day, later in the evening: already done.
    const laterSameDay = new Date('2026-07-21T22:00:00.000Z');
    expect((await operationsPlatformService.runPaymentReconciliation(laterSameDay)).skipped).toBe(true);

    // Next UTC day: runs again.
    const nextDay = new Date('2026-07-22T03:00:00.000Z');
    expect((await operationsPlatformService.runPaymentReconciliation(nextDay)).skipped).toBe(false);
  });
});

describe('purging resolved issues on the daily tick', () => {
  it('clears issues past their retention and records the run', async () => {
    // The purge is wired to the worker tick rather than left to be called by
    // hand: an unwired retention rule is a documented promise the system never
    // keeps.
    seed((db) => {
      insertPayment(db, {
        id: 'pay-purge-job', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_purge_job',
      });
    });
    const service = await svc();
    await service.runReconciliation({ now: NOW });
    const db0 = openDb();
    const issueId = (db0.prepare('SELECT id FROM reconciliation_issues').get() as { id: string }).id;
    db0.close();
    service.resolveIssue({ issueId, adminMemberId: ADMIN, notes: 'Handled with the provider.' });

    const { operationsPlatformService } = await import('../../src/services/operationsPlatformService');
    const pastRetention = new Date('2027-01-01T00:00:00.000Z');
    const result = await operationsPlatformService.runReconciliationIssuePurge(pastRetention);

    expect(result).toEqual({ deleted: 1 });
    const db = openDb();
    try {
      expect(db.prepare('SELECT COUNT(*) AS n FROM reconciliation_issues').get()).toEqual({ n: 0 });
      const run = db.prepare(
        `SELECT status FROM system_job_runs
         WHERE job_name = 'SYS_Purge_Reconciliation_Issues'
         ORDER BY started_at DESC LIMIT 1`,
      ).get() as { status: string } | undefined;
      expect(run?.status).toBe('succeeded');
    } finally {
      db.close();
    }
  });

  it('leaves an outstanding issue alone however long it has been open', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-keep-open', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, stripe_payment_intent_id: 'pi_keep_open',
      });
    });
    await (await svc()).runReconciliation({ now: NOW });

    const { operationsPlatformService } = await import('../../src/services/operationsPlatformService');
    const result = await operationsPlatformService.runReconciliationIssuePurge(
      new Date('2027-01-01T00:00:00.000Z'),
    );

    expect(result).toEqual({ deleted: 0 });
    expect(issueTypes()).toHaveLength(1);
  });
});

void createApp;

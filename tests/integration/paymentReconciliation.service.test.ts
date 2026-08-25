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
  insertAuditEntry,
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

// The digest goes to the fixed treasurer contact address rather than to a
// list or the admin alert stream: the person answerable for the money needs
// this report whether or not they hold any platform account.
const TREASURER_ADDRESS = 'ifpa-treasurer@footbag.org';

function latestDigestBody(): string {
  const db = openDb();
  try {
    const row = db.prepare(
      `SELECT body_text FROM outbox_emails WHERE recipient_email = ?
        ORDER BY created_at DESC LIMIT 1`,
    ).get(TREASURER_ADDRESS) as { body_text: string } | undefined;
    expect(row, 'a digest row addressed to the treasurer').toBeDefined();
    return row!.body_text;
  } finally {
    db.close();
  }
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
  const { resetPaymentAdapterForTests, getPaymentAdapter, getStubPaymentAdapterForTests } =
    await import('../../src/adapters/paymentAdapter');
  resetPaymentAdapterForTests();
  // The rows these cases build are live money by default, so the credential
  // the comparison runs under is live too; the mode-scoping cases set their
  // own mode explicitly.
  getPaymentAdapter();
  getStubPaymentAdapterForTests()!.setLoadedCredentialModeForTests('live');
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
      // Ours: the platform stamped this correlation key at checkout. No local
      // row carries it, so the money settled and the webhook never landed.
      platformPaymentId: 'pay-never-recorded',
    });
    const result = await (await svc()).runReconciliation({ now: NOW });
    expect(result.issuesRaised).toBe(1);
    expect(issueTypes()).toEqual(['provider_payment_missing_locally']);
  });

  it('names the missing local payment id on the issue, so an administrator knows where to look', async () => {
    const adapter = await stub();
    adapter.setLedgerPaymentIntent({
      id: 'pi_unrecorded_named', amountCents: 5000, currency: 'USD', status: 'succeeded',
      createdAt: IN_WINDOW, platformPaymentId: 'pay-never-recorded',
    });
    await (await svc()).runReconciliation({ now: NOW });
    const db = openDb();
    try {
      const row = db.prepare('SELECT details_json FROM reconciliation_issues').get() as { details_json: string };
      expect(JSON.parse(row.details_json).platform_payment_id).toBe('pay-never-recorded');
    } finally {
      db.close();
    }
  });

  it('skips a subscription cycle\'s own settlement intent', async () => {
    // A renewal's settlement intent carries no paymentId, because the platform
    // did not create it. Reporting it would raise one unresolvable issue per
    // renewal, every night, and the invoice pass owns that comparison anyway.
    // It is recognised by its customer being one the provider is billing on a
    // subscription, since a payment intent carries no invoice reference at all
    // at the pinned API version.
    //
    // Regression: this skip used to key on an `invoice` field that does not
    // exist on a payment intent, so it never fired.
    const adapter = await stub();
    adapter.setLedgerSubscription({
      id: 'sub_renewing', customerId: 'cus_donor', status: 'active',
      amountCents: 2500, currency: 'USD',
    });
    adapter.setLedgerPaymentIntent({
      id: 'pi_renewal_cycle', amountCents: 2500, currency: 'USD', status: 'succeeded',
      createdAt: IN_WINDOW, platformPaymentId: null, customerId: 'cus_donor',
    });
    const result = await (await svc()).runReconciliation({ now: NOW });
    // The subscription itself is reported as unmirrored, which is a different
    // and correct finding; what must not appear is a payment discrepancy.
    expect(issueTypes()).not.toContain('provider_payment_missing_locally');
  });

  it('reports a charge created straight in the provider console', async () => {
    // Money the provider settled that reached no local record, which is exactly
    // what this pass exists to catch. It carries no platform correlation key,
    // and its customer is billing no subscription, so it is not a renewal.
    //
    // Regression: narrowing the renewal skip to "any intent without our
    // metadata" swallowed this case entirely, leaving unrecorded money
    // invisible to every pass.
    const adapter = await stub();
    adapter.setLedgerPaymentIntent({
      id: 'pi_console_charge', amountCents: 9900, currency: 'USD', status: 'succeeded',
      createdAt: IN_WINDOW, platformPaymentId: null, customerId: 'cus_stranger',
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).toContain('provider_payment_missing_locally');
    const db = openDb();
    try {
      const row = db.prepare(
        `SELECT details_json FROM reconciliation_issues
          WHERE stripe_payment_intent_id = 'pi_console_charge'`,
      ).get() as { details_json: string };
      const details = JSON.parse(row.details_json);
      expect(details.platform_payment_id).toBeNull();
      expect(details.stripe_customer_id).toBe('cus_stranger');
      expect(details.reason).toBe('provider settled a payment this platform did not originate');
    } finally {
      db.close();
    }
  });

  it('reports a charge with no customer at all', async () => {
    // The customer reference is optional at the provider, and a null one must
    // not accidentally match the "billed on a subscription" set.
    const adapter = await stub();
    adapter.setLedgerSubscription({
      id: 'sub_other', customerId: 'cus_donor', status: 'active',
      amountCents: 2500, currency: 'USD',
    });
    adapter.setLedgerPaymentIntent({
      id: 'pi_no_customer', amountCents: 500, currency: 'USD', status: 'succeeded',
      createdAt: IN_WINDOW, platformPaymentId: null, customerId: null,
    });
    await (await svc()).runReconciliation({ now: NOW });
    const db = openDb();
    try {
      const row = db.prepare(
        `SELECT COUNT(*) AS n FROM reconciliation_issues
          WHERE stripe_payment_intent_id = 'pi_no_customer'`,
      ).get() as { n: number };
      expect(row.n).toBe(1);
    } finally {
      db.close();
    }
  });

  it('skips an intent whose correlation key names a local row, even when the row never got the intent id', async () => {
    // The provider defers intent creation on some checkouts, so a settled row
    // can exist with a null intent id. The money is recorded; reporting it as
    // missing would be a false positive on top of a real row.
    seed((db) => {
      insertPayment(db, {
        id: 'pay-unlinked', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 5000, stripe_payment_intent_id: null,
      });
    });
    const adapter = await stub();
    adapter.setLedgerPaymentIntent({
      id: 'pi_unlinked', amountCents: 5000, currency: 'USD', status: 'succeeded',
      createdAt: IN_WINDOW, platformPaymentId: 'pay-unlinked',
    });
    await (await svc()).runReconciliation({ now: NOW });
    // The forward pass still reports the missing linkage, which is its job.
    // What must not happen is the reverse pass reporting the same money a
    // second time as never recorded at all.
    expect(issueTypes()).toEqual(['payment_missing_at_provider']);
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

  it('reports a recurring checkout that was never confirmed and never expired', async () => {
    // The benign reading is that the member walked away and the expiry event
    // was lost. The costly one is that the provider has a live subscription
    // charging a card that this platform never heard about. Nothing here can
    // tell them apart, which is exactly why it goes to a human.
    seed((db) => {
      insertRecurringDonationSubscription(db, {
        member_id: MEMBER, status: 'incomplete', created_at: BEFORE_WINDOW,
      });
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).toContain('subscription_checkout_unresolved');
  });

  it('returns a rejected resolution note to its own row and no other', async () => {
    // Echoing the submitted note into every textarea on the page would put one
    // administrator's half-written reasoning underneath somebody else's
    // unrelated discrepancy, which is worse than losing it.
    seed((db) => {
      insertRecurringDonationSubscription(db, {
        id: 'rds-note-a', member_id: MEMBER, status: 'incomplete', created_at: BEFORE_WINDOW,
      });
      insertRecurringDonationSubscription(db, {
        id: 'rds-note-b', member_id: ADMIN, status: 'incomplete', created_at: BEFORE_WINDOW,
      });
    });
    const svcRef = await svc();
    await svcRef.runReconciliation({ now: NOW });

    const ids = (() => {
      const db = openDb();
      try {
        return (db.prepare('SELECT id FROM reconciliation_issues ORDER BY id').all() as
          { id: string }[]).map((r) => r.id);
      } finally {
        db.close();
      }
    })();
    expect(ids.length).toBeGreaterThanOrEqual(2);

    const page = svcRef.getAdminReconciliationPage({
      status: 'outstanding',
      errorMessage: 'too long',
      submittedIssueId: ids[0],
      submittedNotes: 'what I checked and concluded',
    });

    const carrying = page.content.rows.filter((r) => r.submittedNotes !== null);
    expect(carrying).toHaveLength(1);
    expect(carrying[0].id).toBe(ids[0]);
    expect(carrying[0].submittedNotes).toBe('what I checked and concluded');
  });

  it('raises one issue per stranded checkout, not one for all of them', async () => {
    // A webhook outage strands several members' checkouts at once, and each may
    // be a live subscription charging a card this platform cannot see. They
    // used to collapse onto a single dedup slot, so an administrator saw one
    // issue naming one member and the rest stayed invisible.
    seed((db) => {
      insertRecurringDonationSubscription(db, {
        id: 'rds-stranded-a', member_id: MEMBER, status: 'incomplete', created_at: BEFORE_WINDOW,
      });
      insertRecurringDonationSubscription(db, {
        id: 'rds-stranded-b', member_id: ADMIN, status: 'incomplete', created_at: BEFORE_WINDOW,
      });
    });
    await (await svc()).runReconciliation({ now: NOW });
    const db = openDb();
    try {
      const rows = db.prepare(
        `SELECT subscription_record_id FROM reconciliation_issues
         WHERE issue_type = 'subscription_checkout_unresolved'
         ORDER BY subscription_record_id`,
      ).all() as { subscription_record_id: string }[];
      expect(rows.map((r) => r.subscription_record_id)).toEqual(['rds-stranded-a', 'rds-stranded-b']);
    } finally {
      db.close();
    }
  });

  it('does not report an unconfirmed checkout as a subscription missing at the provider', async () => {
    // It has no subscription id to be missing. Reporting it under that type
    // would tell an administrator to look for something that never existed.
    seed((db) => {
      insertRecurringDonationSubscription(db, {
        member_id: MEMBER, status: 'incomplete', created_at: BEFORE_WINDOW,
      });
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).not.toContain('subscription_missing_at_provider');
  });

  it('leaves a checkout opened moments ago alone, the same as every other record', async () => {
    // Inside the grace window the member may still be on the Stripe page.
    seed((db) => {
      insertRecurringDonationSubscription(db, {
        member_id: MEMBER, status: 'incomplete', created_at: NOW.toISOString(),
      });
    });
    const result = await (await svc()).runReconciliation({ now: NOW });
    expect(result.issuesRaised).toBe(0);
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

  it('reports a paid invoice on a donation that has already ended locally', async () => {
    // The costly gap: the provider collects a final dunning attempt after the
    // subscription is canceled locally, and the webhook recording it is lost.
    // The webhook path books such a charge deliberately, because the money
    // moved, so a missing row is a real discrepancy. Both passes used to skip
    // it — the subscription pass compares only live rows, and the invoice pass
    // read the active view to decide whether it knew the subscription at all —
    // so the money went unrecorded and unreported, permanently.
    seed((db) => {
      insertRecurringDonationSubscription(db, {
        member_id: MEMBER, stripe_subscription_id: 'sub_ended', status: 'canceled',
      });
    });
    const adapter = await stub();
    adapter.setLedgerInvoice({
      id: 'in_late_collection', subscriptionId: 'sub_ended', amountPaidCents: 2500,
      currency: 'USD', status: 'paid', createdAt: IN_WINDOW,
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).toContain('invoice_charge_missing_locally');
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

  it('reports a renewal booked in a different currency than the provider collected', async () => {
    // One-time payments compare amount AND currency, deliberately, because
    // equal numbers in different currencies are a discrepancy rather than a
    // match. A renewal is money in exactly the same sense, and checking only
    // that a row exists passed a charge booked in a currency the money never
    // moved in as reconciled.
    seed((db) => {
      const subId = insertRecurringDonationSubscription(db, {
        member_id: MEMBER, stripe_subscription_id: 'sub_ccy', status: 'active',
      });
      insertPayment(db, {
        id: 'pay-renewal-ccy', member_id: MEMBER, payment_type: 'donation', created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500, currency: 'EUR',
        recurring_subscription_id: subId, stripe_subscription_id: 'sub_ccy',
        stripe_invoice_id: 'in_ccy',
      });
    });
    const adapter = await stub();
    adapter.setLedgerSubscription({
      id: 'sub_ccy', customerId: 'cus_x', status: 'active', amountCents: 2500, currency: 'USD',
    });
    adapter.setLedgerInvoice({
      id: 'in_ccy', subscriptionId: 'sub_ccy', amountPaidCents: 2500,
      currency: 'USD', status: 'paid', createdAt: IN_WINDOW,
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).toContain('invoice_charge_amount_mismatch');

    const db = openDb();
    try {
      const row = db.prepare(
        `SELECT details_json FROM reconciliation_issues
          WHERE issue_type = 'invoice_charge_amount_mismatch'`,
      ).get() as { details_json: string };
      const details = JSON.parse(row.details_json);
      // Both sides named, so an administrator can see which is which without
      // opening the provider dashboard first.
      expect(details.local_currency).toBe('EUR');
      expect(details.provider_currency).toBe('USD');
    } finally {
      db.close();
    }
  });

  it('reports a renewal booked for a different amount than the provider collected', async () => {
    seed((db) => {
      const subId = insertRecurringDonationSubscription(db, {
        member_id: MEMBER, stripe_subscription_id: 'sub_amt', status: 'active',
      });
      insertPayment(db, {
        id: 'pay-renewal-amt', member_id: MEMBER, payment_type: 'donation', created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 2500,
        recurring_subscription_id: subId, stripe_subscription_id: 'sub_amt',
        stripe_invoice_id: 'in_amt',
      });
    });
    const adapter = await stub();
    adapter.setLedgerSubscription({
      id: 'sub_amt', customerId: 'cus_x', status: 'active', amountCents: 2500, currency: 'USD',
    });
    adapter.setLedgerInvoice({
      id: 'in_amt', subscriptionId: 'sub_amt', amountPaidCents: 9900,
      currency: 'USD', status: 'paid', createdAt: IN_WINDOW,
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).toContain('invoice_charge_amount_mismatch');
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
      createdAt: JUST_NOW, platformPaymentId: 'pay-fresh-unrecorded',
    });

    const result = await (await svc()).runReconciliation({ now: NOW });

    expect(result.issuesRaised).toBe(0);
  });

  it('reports the same provider charge once it is older than the grace period', async () => {
    const adapter = await stub();
    adapter.setLedgerPaymentIntent({
      id: 'pi_aged', amountCents: 5000, currency: 'USD', status: 'succeeded',
      createdAt: WELL_BEFORE, platformPaymentId: 'pay-aged-unrecorded',
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

describe('period totals and export', () => {
  // The tests below run in their own months. Seeded rows accumulate across this
  // file, and these assert on whole-range figures, so sharing a window with the
  // other totals tests would make each one depend on what ran before it.
  const REHEARSAL_MONTH = { at: '2026-03-05T12:00:00.000Z', from: '2026-03-01', to: '2026-04-01' };
  const UNKNOWN_MONTH = { at: '2026-04-05T12:00:00.000Z', from: '2026-04-01', to: '2026-05-01' };
  const ALL_REAL_MONTH = { at: '2026-05-05T12:00:00.000Z', from: '2026-05-01', to: '2026-06-01' };
  const REFUND_MONTH = { at: '2026-06-05T12:00:00.000Z', from: '2026-06-01', to: '2026-07-01' };

  it('keeps rehearsal money out of the totals and says that it did', async () => {
    // Production is proven with the provider in test mode before it goes live,
    // so rehearsal charges sit in the same table as real ones. A total that
    // swept them in would report money the organization never took, and one
    // that dropped them silently would read as money gone missing.
    seed((db) => {
      insertPayment(db, {
        id: 'pay-real', member_id: MEMBER, payment_type: 'donation', created_at: REHEARSAL_MONTH.at,
        status: 'succeeded', amount_cents: 5000, provider_livemode: 1,
      });
      insertPayment(db, {
        id: 'pay-rehearsal', member_id: MEMBER, payment_type: 'donation',
        created_at: REHEARSAL_MONTH.at,
        status: 'succeeded', amount_cents: 90000, provider_livemode: 0,
      });
    });
    const { periodTotals, periodTotalsExclusionLine } =
      await import('../../src/services/paymentReconciliationService');
    const donations = periodTotals(REHEARSAL_MONTH.from, REHEARSAL_MONTH.to)
      .find((r) => r.currency === 'USD' && r.categoryLabel === 'Donation');
    expect(donations?.grossDisplay).toBe('50.00 USD');
    expect(donations?.count).toBe(1);
    expect(periodTotalsExclusionLine(REHEARSAL_MONTH.from, REHEARSAL_MONTH.to))
      .toBe('These totals count real money only. Set aside: 1 test-mode payment.');
  });

  it('sets aside a payment whose provider mode was never recorded rather than counting it', async () => {
    // A row predating the provider-mode flag cannot be shown to be real money,
    // and a total is the last place to let a missing value read as real.
    seed((db) => {
      insertPayment(db, {
        id: 'pay-unknown-mode', member_id: MEMBER, payment_type: 'donation',
        created_at: UNKNOWN_MONTH.at, status: 'succeeded', amount_cents: 7000,
        provider_livemode: null,
      });
    });
    const { periodTotals, periodTotalsExclusionLine } =
      await import('../../src/services/paymentReconciliationService');
    const donations = periodTotals(UNKNOWN_MONTH.from, UNKNOWN_MONTH.to)
      .find((r) => r.currency === 'USD' && r.categoryLabel === 'Donation');
    expect(donations).toBeUndefined();
    expect(periodTotalsExclusionLine(UNKNOWN_MONTH.from, UNKNOWN_MONTH.to)).toBe(
      'These totals count real money only. Set aside: 1 payment whose provider mode was never recorded.',
    );
  });

  it('says nothing about exclusions when every payment in the range is real money', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-all-real', member_id: MEMBER, payment_type: 'donation',
        created_at: ALL_REAL_MONTH.at,
        status: 'succeeded', amount_cents: 1200, provider_livemode: 1,
      });
    });
    const { periodTotalsExclusionLine } =
      await import('../../src/services/paymentReconciliationService');
    expect(periodTotalsExclusionLine(ALL_REAL_MONTH.from, ALL_REAL_MONTH.to)).toBeNull();
  });

  it('does not net a rehearsal refund against real money', async () => {
    // The refund pass has to carry the same filter as the gross pass, or a
    // test-mode refund would reduce a real total.
    seed((db) => {
      insertPayment(db, {
        id: 'pay-real-gross', member_id: MEMBER, payment_type: 'donation',
        created_at: REFUND_MONTH.at,
        status: 'succeeded', amount_cents: 8000, provider_livemode: 1,
      });
      insertPayment(db, {
        id: 'pay-rehearsal-refunded', member_id: MEMBER, payment_type: 'donation',
        created_at: REFUND_MONTH.at, status: 'refunded', amount_cents: 8000, provider_livemode: 0,
      });
      insertAuditEntry(db, {
        action_type: 'payment.refunded',
        category: 'payment', actor_type: 'system',
        entity_type: 'payment', entity_id: 'pay-rehearsal-refunded',
        metadata: { refunded_amount_cents: 8000, currency: 'USD' },
      });
    });
    const { periodTotals } = await import('../../src/services/paymentReconciliationService');
    const donations = periodTotals(REFUND_MONTH.from, REFUND_MONTH.to)
      .find((r) => r.currency === 'USD' && r.categoryLabel === 'Donation');
    expect(donations?.grossDisplay).toBe('80.00 USD');
    expect(donations?.refundedDisplay).toBe('0.00 USD');
    expect(donations?.netDisplay).toBe('80.00 USD');
  });

  it('nets a partial refund out of the period total instead of reporting it at full value', async () => {
    // A partial refund never touches the payment row, by design, so gross alone
    // counts a half-returned charge at full value forever. That is the number
    // that would otherwise reach a board report.
    seed((db) => {
      insertPayment(db, {
        id: 'pay-net', member_id: MEMBER, payment_type: 'donation', created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 10000,
      });
      insertAuditEntry(db, {
        action_type: 'payment.partially_refunded',
        category: 'payment',
        actor_type: 'system',
        entity_type: 'payment',
        entity_id: 'pay-net',
        metadata: { refunded_amount_cents: 2500, currency: 'USD' },
      });
    });
    const { periodTotals } = await import('../../src/services/paymentReconciliationService');
    const rows = periodTotals('2026-07-01', '2026-08-01');
    const donations = rows.find((r) => r.currency === 'USD' && r.categoryLabel === 'Donation');
    expect(donations?.grossDisplay).toBe('100.00 USD');
    expect(donations?.refundedDisplay).toBe('25.00 USD');
    expect(donations?.netDisplay).toBe('75.00 USD');
  });

  it('counts a cumulative refund once rather than adding the partial to the full', async () => {
    // The provider reports the total refunded so far on each refund event, so a
    // partial followed by a full one describes overlapping money. Adding both
    // rows would report more going back than ever came in.
    seed((db) => {
      insertPayment(db, {
        id: 'pay-cumulative', member_id: MEMBER, payment_type: 'donation', created_at: IN_WINDOW,
        status: 'refunded', amount_cents: 10000,
      });
      insertAuditEntry(db, {
        action_type: 'payment.partially_refunded',
        category: 'payment', actor_type: 'system',
        entity_type: 'payment', entity_id: 'pay-cumulative',
        metadata: { refunded_amount_cents: 4000, currency: 'USD' },
      });
      insertAuditEntry(db, {
        action_type: 'payment.refunded',
        category: 'payment', actor_type: 'system',
        entity_type: 'payment', entity_id: 'pay-cumulative',
        metadata: { refunded_amount_cents: 10000, currency: 'USD' },
      });
    });
    const { periodTotals } = await import('../../src/services/paymentReconciliationService');
    const rows = periodTotals('2026-07-01', '2026-08-01');
    const donations = rows.find((r) => r.currency === 'USD' && r.categoryLabel === 'Donation');
    expect(donations?.refundedDisplay).toBe('100.00 USD');
    expect(donations?.netDisplay).toBe('0.00 USD');
  });

});

describe('duplicate charges', () => {
  it('asks about the same member charged the same amount twice in quick succession', async () => {
    // The requirement names unexpected duplicates as a discrepancy the nightly
    // job records, and nothing looked. This platform's own guarantees are what
    // hide the case: each attempt mints its own payment id and its own checkout
    // session, so a member who pays twice produces two rows that each match a
    // provider settlement exactly and compare clean in every other pass.
    seed((db) => {
      insertPayment(db, {
        id: 'pay-dup-first', member_id: MEMBER, payment_type: 'donation',
        created_at: '2026-07-18T12:00:00.000Z', status: 'succeeded', amount_cents: 5000,
        stripe_payment_intent_id: 'pi_dup_first',
      });
      insertPayment(db, {
        id: 'pay-dup-second', member_id: MEMBER, payment_type: 'donation',
        created_at: '2026-07-18T12:09:00.000Z', status: 'succeeded', amount_cents: 5000,
        stripe_payment_intent_id: 'pi_dup_second',
      });
    });
    const adapter = await stub();
    adapter.setLedgerPaymentIntent({
      id: 'pi_dup_first', amountCents: 5000, currency: 'USD', status: 'succeeded',
      createdAt: '2026-07-18T12:00:00.000Z', platformPaymentId: 'pay-dup-first',
    });
    adapter.setLedgerPaymentIntent({
      id: 'pi_dup_second', amountCents: 5000, currency: 'USD', status: 'succeeded',
      createdAt: '2026-07-18T12:09:00.000Z', platformPaymentId: 'pay-dup-second',
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).toContain('duplicate_provider_charge');

    const db = openDb();
    try {
      const row = db.prepare(
        `SELECT details_json FROM reconciliation_issues
          WHERE issue_type = 'duplicate_provider_charge'`,
      ).get() as { details_json: string };
      const details = JSON.parse(row.details_json);
      // Both payments named, so the reader can look at the pair rather than
      // hunting for the partner of the one that was flagged.
      expect(details.first_payment_id).toBe('pay-dup-first');
      expect(details.second_payment_id).toBe('pay-dup-second');
      expect(details.minutes_apart).toBe(9);
    } finally {
      db.close();
    }
  });

  it('says nothing about two gifts far enough apart to be meant', async () => {
    // A member who gives twice in a week is being generous, not double-charged.
    // A question asked too often stops being read.
    seed((db) => {
      insertPayment(db, {
        id: 'pay-apart-first', member_id: MEMBER, payment_type: 'donation',
        created_at: '2026-07-16T12:00:00.000Z', status: 'succeeded', amount_cents: 5000,
      });
      insertPayment(db, {
        id: 'pay-apart-second', member_id: MEMBER, payment_type: 'donation',
        created_at: '2026-07-18T12:00:00.000Z', status: 'succeeded', amount_cents: 5000,
      });
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).not.toContain('duplicate_provider_charge');
  });

  it('says nothing about two different amounts, or two different members', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-diff-amount', member_id: MEMBER, payment_type: 'donation',
        created_at: '2026-07-18T12:00:00.000Z', status: 'succeeded', amount_cents: 5000,
      });
      insertPayment(db, {
        id: 'pay-diff-amount-2', member_id: MEMBER, payment_type: 'donation',
        created_at: '2026-07-18T12:05:00.000Z', status: 'succeeded', amount_cents: 2500,
      });
      insertPayment(db, {
        id: 'pay-diff-member', member_id: ADMIN, payment_type: 'donation',
        created_at: '2026-07-18T12:06:00.000Z', status: 'succeeded', amount_cents: 5000,
      });
    });
    await (await svc()).runReconciliation({ now: NOW });
    expect(issueTypes()).not.toContain('duplicate_provider_charge');
  });
});

describe('the reconciliation digest', () => {
  it('still sends on a clean period, because the nil report is the liveness signal', async () => {
    // Deliberately the reverse of the earlier behaviour, which stayed silent on
    // a clean period so an empty digest would not train people to ignore it.
    // That reasoning holds for an operator, who has a scheduled-job health
    // surface telling them the job still runs. The reader this report is
    // written for has no such surface, so silence and "the job died three
    // months ago" look identical to them.
    const result = (await svc()).sendReconciliationDigest({ now: NOW });
    expect(result.outstanding).toBe(0);
    expect(result.sent).toBe(1);
    expect(result.recipient).toBe(TREASURER_ADDRESS);

    const body = latestDigestBody();
    // It says plainly that the check ran and found nothing, rather than
    // leaving an empty section for the reader to interpret.
    expect(body).toContain('Everything matched');
    expect(body).toContain('Nothing outstanding.');
    // And where every nightly report lives, because nothing depends on this
    // email being read.
    expect(body).toContain('/admin/payments/reports');

    // The address belongs to no member, so the row carries none to erase.
    const db = openDb();
    try {
      const row = db.prepare(
        'SELECT recipient_member_id FROM outbox_emails WHERE recipient_email = ? ORDER BY created_at DESC LIMIT 1',
      ).get(TREASURER_ADDRESS) as { recipient_member_id: string | null };
      expect(row.recipient_member_id).toBeNull();
    } finally {
      db.close();
    }
  });

  it('sends one copy a day however many times the daily pass asks', async () => {
    const service = await svc();
    const first = service.sendReconciliationDigest({ now: NOW });
    const again = service.sendReconciliationDigest({ now: NOW });
    expect(first.sent).toBe(1);
    // The second is a duplicate at the outbox key and is not counted as sent
    // twice by the outbox; the service reports what it handed over.
    expect(again.recipient).toBe(TREASURER_ADDRESS);
    const db = openDb();
    try {
      const rows = db.prepare(
        'SELECT COUNT(*) AS c FROM outbox_emails WHERE recipient_email = ? AND idempotency_key = ?',
      ).get(TREASURER_ADDRESS, `reconciliation-digest:${NOW.toISOString().slice(0, 10)}`) as { c: number };
      expect(rows.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it('says what the last nightly pass compared and set aside', async () => {
    seed((db) => {
      insertPayment(db, {
        id: 'pay-digest-live', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 1000, stripe_payment_intent_id: 'pi_digest_live',
      });
      insertPayment(db, {
        id: 'pay-digest-test', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 1000, stripe_payment_intent_id: 'pi_digest_test',
        provider_livemode: 0,
      });
    });
    const { operationsPlatformService } = await import('../../src/services/operationsPlatformService');
    await operationsPlatformService.runPaymentReconciliation(new Date(NOW.getTime() + 1));
    // Its own day, so this copy is a fresh outbox row rather than the
    // duplicate of one an earlier case already queued for today.
    (await svc()).sendReconciliationDigest({ now: new Date(NOW.getTime() + 3 * 86_400_000) });
    const body = latestDigestBody();
    expect(body).toContain('compared live-mode records');
    expect(body).toContain('1 row was set aside as the other mode');
  });

  it('names what needs a decision, how old the oldest is, and who settled what', async () => {
    // Written for whoever answers for the money: plain descriptions rather than
    // issue-type codes, amounts with their currency, and the resolution half
    // that shows questions are being answered and by whom.
    seed((db) => {
      insertPayment(db, {
        id: 'pay-digest-readable', member_id: MEMBER, created_at: IN_WINDOW,
        status: 'succeeded', amount_cents: 4200, stripe_payment_intent_id: 'pi_digest_readable',
      });
    });
    const service = await svc();
    await service.runReconciliation({ now: NOW });
    // A later day than the other digest cases, so this copy is its own outbox
    // row rather than the duplicate of one already queued.
    const later = new Date(NOW.getTime() + 2 * 86_400_000);
    const result = service.sendReconciliationDigest({ now: later });
    expect(result.sent).toBe(1);

    const body = latestDigestBody();
    // A plain description, not the stored issue-type code.
    expect(body).toContain('Local payment with no provider record');
    expect(body).not.toContain('payment_missing_at_provider');
    // The money, with the currency on the face of it.
    expect(body).toContain('42.00 USD');
    // And the section a reader with nothing to do can skip.
    expect(body).toContain('Nothing was resolved during this period.');
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

    // The breakdown is asserted, not just the total: one number covering two
    // tables cannot say which of them shrank, and an issue purge that silently
    // deleted only counters would read identically.
    expect(result).toEqual({ deleted: 1, issuesDeleted: 1, failureCountersDeleted: 0 });
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

    expect(result).toEqual({ deleted: 0, issuesDeleted: 0, failureCountersDeleted: 0 });
    expect(issueTypes()).toHaveLength(1);
  });
});

void createApp;

/**
 * The nightly reconciliation compares only rows of the provider mode the
 * loaded credential is in, and every run leaves a report that says what it
 * compared, set aside, raised and found resolved.
 *
 * A live key cannot list test-mode objects and the reverse, so a rehearsal row
 * compared against a live ledger reads as missing money for the length of the
 * window. Rows of the other mode are set aside and counted; a row whose mode
 * was never recorded is compared, and a credential whose mode is unknown
 * compares everything. The report is kept on the job-run record, which is what
 * the Financial Reports view reads back.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4104');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertPayment,
  insertRecurringDonationSubscription,
} from '../fixtures/factories';
import { expectLoggedError } from '../setup-env';

const MEMBER = 'ms-member';
const ADMIN = 'ms-admin';
const NOW = new Date('2026-07-20T03:00:00.000Z');
const IN_WINDOW = '2026-07-18T12:00:00.000Z';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER, slug: 'ms_member', display_name: 'Ms Member', login_email: 'ms@example.com' });
  insertMember(db, { id: ADMIN, slug: 'ms_admin', display_name: 'Ms Admin', login_email: 'ms-admin@example.com', is_admin: 1 });
  db.close();
  await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function openDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

function seed(fn: (db: BetterSqlite3.Database) => void): void {
  const db = openDb();
  try {
    fn(db);
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  const { resetPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
  resetPaymentAdapterForTests();
  seed((db) => {
    db.prepare('DELETE FROM reconciliation_issues').run();
    db.prepare('DELETE FROM work_queue_items').run();
    db.prepare('DELETE FROM payments').run();
    db.prepare('DELETE FROM recurring_donation_subscriptions').run();
    db.prepare('DELETE FROM system_job_runs').run();
  });
});

async function stubIn(mode: 'live' | 'test' | 'unknown') {
  const mod = await import('../../src/adapters/paymentAdapter');
  mod.getPaymentAdapter();
  const stub = mod.getStubPaymentAdapterForTests()!;
  stub.setLoadedCredentialModeForTests(mode);
  return stub;
}

async function svc() {
  return (await import('../../src/services/paymentReconciliationService')).paymentReconciliationService;
}

function issueTypes(): string[] {
  const db = openDb();
  try {
    return (db.prepare('SELECT issue_type FROM reconciliation_issues ORDER BY issue_type')
      .all() as Array<{ issue_type: string }>).map((r) => r.issue_type);
  } finally {
    db.close();
  }
}

function issuePaymentIds(): string[] {
  const db = openDb();
  try {
    return (db.prepare('SELECT payment_id FROM reconciliation_issues WHERE payment_id IS NOT NULL ORDER BY payment_id')
      .all() as Array<{ payment_id: string }>).map((r) => r.payment_id);
  } finally {
    db.close();
  }
}

/** Three settled payments the provider does not know about: one live, one a
 *  rehearsal, one written before the mode was recorded. Distinct amounts, so
 *  the duplicate-charge pass has nothing to ask about. */
function seedThreeModes(): void {
  seed((db) => {
    insertPayment(db, {
      id: 'pay-live', member_id: MEMBER, created_at: IN_WINDOW, status: 'succeeded',
      amount_cents: 1000, stripe_payment_intent_id: 'pi_live', provider_livemode: 1,
    });
    insertPayment(db, {
      id: 'pay-test', member_id: MEMBER, created_at: IN_WINDOW, status: 'succeeded',
      amount_cents: 1100, stripe_payment_intent_id: 'pi_test', provider_livemode: 0,
    });
    insertPayment(db, {
      id: 'pay-unknown', member_id: MEMBER, created_at: IN_WINDOW, status: 'succeeded',
      amount_cents: 1200, stripe_payment_intent_id: 'pi_unknown', provider_livemode: null,
    });
  });
}

describe('which local rows a pass compares', () => {
  it('under a live credential compares live and unrecorded rows and sets a rehearsal row aside', async () => {
    await stubIn('live');
    seedThreeModes();
    const result = await (await svc()).runReconciliation({ now: NOW });
    expect(result.modeCompared).toBe('live');
    expect(result.rowsSetAside).toEqual({ payments: 1, subscriptions: 0 });
    expect(result.localPaymentsCompared).toBe(2);
    expect(issuePaymentIds()).toEqual(['pay-live', 'pay-unknown']);
  });

  it('under a test credential sets the live row aside instead', async () => {
    await stubIn('test');
    seedThreeModes();
    const result = await (await svc()).runReconciliation({ now: NOW });
    expect(result.modeCompared).toBe('test');
    expect(result.rowsSetAside.payments).toBe(1);
    expect(issuePaymentIds()).toEqual(['pay-test', 'pay-unknown']);
  });

  it('compares everything when the credential mode could not be read', async () => {
    await stubIn('unknown');
    seedThreeModes();
    const result = await (await svc()).runReconciliation({ now: NOW });
    expect(result.modeCompared).toBe('unknown');
    expect(result.rowsSetAside.payments).toBe(0);
    expect(issuePaymentIds()).toEqual(['pay-live', 'pay-test', 'pay-unknown']);
  });

  it('applies the same rule to recurring donations', async () => {
    await stubIn('live');
    seed((db) => {
      insertRecurringDonationSubscription(db, {
        id: 'sub-live', member_id: MEMBER, stripe_subscription_id: 'sub_live', provider_livemode: 1,
      });
      insertRecurringDonationSubscription(db, {
        id: 'sub-test', member_id: MEMBER, stripe_subscription_id: 'sub_test', provider_livemode: 0,
      });
    });
    const result = await (await svc()).runReconciliation({ now: NOW });
    expect(result.rowsSetAside).toEqual({ payments: 0, subscriptions: 1 });
    expect(result.localSubscriptionsCompared).toBe(1);
    const db = openDb();
    try {
      const raised = db.prepare(
        "SELECT stripe_subscription_id FROM reconciliation_issues WHERE issue_type = 'subscription_missing_at_provider'",
      ).all() as Array<{ stripe_subscription_id: string }>;
      expect(raised.map((r) => r.stripe_subscription_id)).toEqual(['sub_live']);
    } finally {
      db.close();
    }
  });

});

describe('the report a run leaves behind', () => {
  it('names what it raised, with the amount and the payment, and the totals for its window', async () => {
    await stubIn('live');
    seed((db) => {
      insertPayment(db, {
        id: 'pay-report', member_id: MEMBER, created_at: IN_WINDOW, status: 'succeeded',
        amount_cents: 4200, stripe_payment_intent_id: 'pi_report', provider_livemode: 1,
      });
      insertPayment(db, {
        id: 'pay-report-test', member_id: MEMBER, created_at: IN_WINDOW, status: 'succeeded',
        amount_cents: 900, stripe_payment_intent_id: 'pi_report_test', provider_livemode: 0,
      });
    });
    const result = await (await svc()).runReconciliation({ now: NOW });
    expect(result.raised).toHaveLength(1);
    expect(result.raised[0]).toMatchObject({
      issueType: 'payment_missing_at_provider',
      label: 'Local payment with no provider record',
      amountPhrase: '42.00 USD',
      paymentId: 'pay-report',
    });
    expect(result.outstandingAfterRun).toBe(1);
    expect(result.previousRunAt).toBeNull();
    expect(result.resolvedSincePreviousRun).toEqual([]);
    // Live rows only, and the rehearsal row said to have been left out.
    expect(result.totals).toHaveLength(1);
    expect(result.totals[0]).toMatchObject({ categoryLabel: 'Membership', count: 1, grossDisplay: '42.00 USD' });
    expect(result.totalsExclusionLine).toContain('1 test-mode payment');
  });

  it('carries what was resolved since the previous run and who resolved it', async () => {
    await stubIn('live');
    seed((db) => {
      insertPayment(db, {
        id: 'pay-resolve', member_id: MEMBER, created_at: IN_WINDOW, status: 'succeeded',
        amount_cents: 1000, stripe_payment_intent_id: 'pi_resolve',
      });
    });
    const { operationsPlatformService } = await import('../../src/services/operationsPlatformService');
    const first = await operationsPlatformService.runPaymentReconciliation(NOW);
    expect(first.issuesRaised).toBe(1);

    const service = await svc();
    const issueId = (openDb().prepare('SELECT id FROM reconciliation_issues').get() as { id: string }).id;
    service.resolveIssue({ issueId, adminMemberId: ADMIN, notes: 'Checked at the provider; a console charge.' });

    // The next UTC day, so the once-per-day gate lets it run.
    const nextDay = new Date(NOW.getTime() + 86_400_000);
    const second = await operationsPlatformService.runPaymentReconciliation(nextDay);
    expect(second.skipped).toBe(false);

    const runs = openDb().prepare(
      "SELECT details_json FROM system_job_runs WHERE job_name = 'SYS_Reconcile_Payments_Nightly' AND status = 'succeeded' ORDER BY started_at DESC",
    ).all() as Array<{ details_json: string }>;
    expect(runs).toHaveLength(2);
    const report = JSON.parse(runs[0].details_json) as {
      previousRunAt: string | null;
      resolvedSincePreviousRun: Array<{ id: string; resolvedBySlug: string | null; label: string }>;
      raised: unknown[];
      outstandingAfterRun: number;
    };
    expect(report.previousRunAt).not.toBeNull();
    expect(report.resolvedSincePreviousRun).toHaveLength(1);
    expect(report.resolvedSincePreviousRun[0]).toMatchObject({ id: issueId, resolvedBySlug: 'ms_admin' });
    // The discrepancy is still present at the provider, so it is raised again
    // rather than silently forgotten once resolved.
    expect(report.raised).toHaveLength(1);
    expect(report.outstandingAfterRun).toBe(1);
  });

  it('is read back by the reports pages, and an unknown run is not found', async () => {
    await stubIn('live');
    seed((db) => {
      insertPayment(db, {
        id: 'pay-page', member_id: MEMBER, created_at: IN_WINDOW, status: 'succeeded',
        amount_cents: 1000, stripe_payment_intent_id: 'pi_page',
      });
    });
    const { operationsPlatformService } = await import('../../src/services/operationsPlatformService');
    await operationsPlatformService.runPaymentReconciliation(NOW);
    const service = await svc();

    const list = service.getAdminReportsPage({ now: NOW });
    expect(list.content.hasRows).toBe(true);
    expect(list.content.rows[0]).toMatchObject({ statusLabel: 'Completed', modeLabel: 'Live money', issuesRaised: 1, isFailed: false });
    expect(list.content.digest.recipientAddress).toBe('ifpa-treasurer@footbag.org');
    expect(list.content.digest.hasEverSent).toBe(false);
    expect(list.content.digest.nextDueDisplay).toBe('on the next daily pass');

    const detail = service.getAdminReportPage(list.content.rows[0].id);
    expect(detail).not.toBeNull();
    expect(detail!.content.isFailed).toBe(false);
    expect(detail!.content.report!.raised[0]).toMatchObject({
      label: 'Local payment with no provider record',
      paymentHref: '/admin/payments/pay-page',
    });
    expect(detail!.content.report!.modeLabel).toBe('Live money');
    expect(service.getAdminReportPage('jr_nobody')).toBeNull();
  });

  it('shows a run that failed as failed, with what went wrong', async () => {
    await stubIn('live');
    seed((db) => {
      insertPayment(db, {
        id: 'pay-fail', member_id: MEMBER, created_at: IN_WINDOW, status: 'succeeded',
        amount_cents: 1000, stripe_payment_intent_id: 'pi_fail',
      });
      db.exec(
        `CREATE TRIGGER tmp_block_issues BEFORE INSERT ON reconciliation_issues
         BEGIN SELECT RAISE(ABORT, 'injected issue failure'); END;`,
      );
    });
    expectLoggedError('SYS_Reconcile_Payments_Nightly: failed');
    const { operationsPlatformService } = await import('../../src/services/operationsPlatformService');
    await expect(operationsPlatformService.runPaymentReconciliation(NOW)).rejects.toThrow();
    seed((db) => db.exec('DROP TRIGGER tmp_block_issues;'));

    const service = await svc();
    const list = service.getAdminReportsPage({ now: NOW });
    expect(list.content.rows[0]).toMatchObject({ statusLabel: 'Failed', isFailed: true });
    const detail = service.getAdminReportPage(list.content.rows[0].id)!;
    expect(detail.content.isFailed).toBe(true);
    expect(detail.content.failureText).toContain('injected issue failure');
    expect(detail.content.report).toBeNull();
  });
});

/**
 * PaymentReconciliationService -- nightly comparison of the platform's payment
 * records against the payment provider's ledger, plus the administrator-facing
 * views that work the resulting discrepancies.
 *
 * Owns:
 *   - `reconciliation_issues` row writes (raise, resolve) and reads
 *   - The two nightly comparison passes (one-time payments, subscriptions)
 *   - The periodic reconciliation digest to administrators
 *   - Admin-facing view-model shaping for the All Payments list, the payment
 *     detail, and the Reconciliation Issues list
 *
 * Does not own:
 *   - Any `payments` or subscription row write. Reconciliation reports
 *     disagreement; it never silently "corrects" either side. An administrator
 *     decides what a discrepancy means and records that decision as the
 *     resolution note.
 *   - The Stripe SDK calls (delegated to PaymentAdapter's ledger reads)
 *   - Job-run bookkeeping (the operations platform service wraps each pass in
 *     recordJobRun)
 *
 * Required patterns:
 *   - Re-running a pass is idempotent. An outstanding issue with the same type
 *     and the same provider references is not raised twice, so a nightly pass
 *     over an unresolved discrepancy does not accumulate duplicates. The invoice
 *     is part of those references: several missed renewals on one subscription
 *     are separate discrepancies and each gets its own issue.
 *   - A record is left alone until it is older than the delivery grace period.
 *     A webhook and a ledger read do not land at the same instant, so judging a
 *     record seconds old reports two systems catching up as a disagreement.
 *   - A locally refunded payment whose provider intent still reads settled is
 *     agreement, not a mismatch: the provider records a reversal separately and
 *     never moves the original intent off succeeded.
 *   - An amount comparison compares currency as well as value. Two records
 *     agreeing on 2500 but disagreeing on USD versus EUR are a discrepancy, not
 *     a match.
 *   - Reads are windowed. Subscriptions are compared as current state, because a
 *     subscription created years ago is still live; intents and invoices are
 *     compared over a bounded window so the pass does not re-walk the whole
 *     ledger nightly.
 *   - Every raised issue also enters the admin work queue in the `payments`
 *     category, so a discrepancy reaches the dashboard rather than waiting for
 *     someone to open the reconciliation page.
 *   - Resolving an issue closes its open work-queue twin in the same
 *     transaction as the issue update and the audit row. The reconciliation
 *     page is the resolution surface for a discrepancy; the queue card is only a
 *     pointer to it and is never resolved on its own.
 *   - A payment reaches its event through the registration that references it,
 *     never through a column on the payment. Only a registration fee has one, so
 *     the join is optional and a donation or membership shows no event.
 *   - The provider-mode badge marks a test-mode payment and a payment whose mode
 *     was never recorded. Live money is deliberately left unmarked, so an absent
 *     value can never render as a real charge.
 *   - The All Payments order comes from a fixed set of sort keys. An order
 *     cannot be parameterised into a prepared statement, so an unrecognised key
 *     falls back to the default rather than reaching the SQL.
 *   - Whether a provider payment intent is ours is decided by the correlation
 *     key the platform stamps into its metadata, never by an invoice reference
 *     on the intent: PaymentIntent carries no invoice linkage at the pinned API
 *     version, so reading one silently matched nothing and would have reported
 *     every renewal as money settled with no local record.
 *   - "Not ours" is not the same as "not worth reporting", and the reverse pass
 *     keeps that distinction. A renewal's own settlement intent carries no
 *     correlation key and belongs to a customer the provider is billing on a
 *     subscription, so the invoice pass owns it and this pass skips it. A charge
 *     created straight in the provider's console carries no key either, and it
 *     is exactly what this pass exists to report: money settled with no local
 *     record. Treating both alike in either direction is wrong — one way floods
 *     the queue with a renewal a night, the other hides unrecorded money.
 *   - The invoice pass asks whether a subscription is mirrored at all, which
 *     includes the canceled ones. The platform deliberately books a charge that
 *     settles after a donation ended, so an invoice against a canceled
 *     subscription is one it should hold a payment row for; reading only the
 *     active view made that money invisible to both passes.
 *   - A discrepancy with no provider identifier keys on the local row instead.
 *     An unresolved recurring checkout has no subscription, intent or invoice
 *     id by definition, so without the local id every one of them collapsed
 *     onto a single slot in the outstanding-dedup index and a webhook outage
 *     that stranded several members surfaced as one issue naming one of them.
 *
 *   - The periodic summary is sent on its cadence whether or not there is
 *     anything in it. Silence on a clean period is safe for an operator, who
 *     has a scheduled-job health surface telling them the job still runs, and
 *     unsafe for the reader this report is written for, who has no such surface
 *     and cannot tell a quiet quarter from a job that died. The nil report is
 *     the liveness signal.
 *
 * Persistence:
 *   Writes: reconciliation_issues, work_queue_items, audit_entries.
 *   Deletes on the daily pass: expired resolved reconciliation_issues, and the
 *     stripe_webhook_failures counters that age out on the same key.
 *   Reads for the admin views: payments, members, registrations, events, tags.
 *   Reads for the digest: reconciliation_issues (open, and resolved within the
 *     period, joined to members for the resolver's name).
 *
 * Side effects:
 *   - audit_entries append (issue raised, issue resolved)
 *   - work_queue_items insert in the `payments` category per raised issue;
 *     close of the discrepancy's queue twin on resolve
 *   - outbox_emails enqueue (the periodic digest, one per subscriber to the
 *     financial-digest list, which is deliberately not the admin alert stream:
 *     the person answerable for the money needs this report whether or not they
 *     hold an admin account, and should not have to take the flagged-media and
 *     security traffic to get it)
 */
import { randomUUID } from 'node:crypto';
import {
  payments as paymentsDb,
  recurringDonationSubscriptions as subsDb,
  reconciliationIssues as issuesDb,
  stripeWebhookFailures as webhookFailuresDb,
  paymentMoneyHistory,
  paymentPeriodTotals,
  account,
  workQueue,
  mailingListSubscriptions,
  queryAdminPayments,
  countAdminPayments,
  findAdminPaymentById,
  queryReconciliationIssues,
  oldestOutstandingReconciliationIssueAt,
  countReconciliationIssues,
  transaction,
  type AdminPaymentFilters,
  listAdminPaymentEventOptions,
  isAdminPaymentSort,
  ADMIN_PAYMENT_DEFAULT_SORT,
} from '../db/db';
import type { PageViewModel } from '../types/page';
import { logger } from '../config/logger';
import { config } from '../config/env';
import { appendAuditEntry } from './auditService';
import { readIntConfig } from './configReader';
import { NotFoundError, ValidationError } from './serviceErrors';
import { emailService } from './emailService';
import { workQueueService } from './workQueueService';
import {
  getPaymentAdapter,
  type LedgerWindow,
  type StripeInvoiceSummary,
  type StripePaymentIntentSummary,
  type StripeSubscriptionSummary,
} from '../adapters/paymentAdapter';

// ── Types ────────────────────────────────────────────────────────────────────

/** The discrepancy classes both passes can raise. Each names what disagrees, in
 *  the direction it disagrees, so an administrator reading the queue knows which
 *  side to investigate first. */
export type ReconciliationIssueType =
  | 'payment_missing_at_provider'
  | 'provider_payment_missing_locally'
  | 'payment_amount_mismatch'
  | 'payment_status_mismatch'
  | 'subscription_missing_at_provider'
  | 'provider_subscription_missing_locally'
  | 'subscription_status_mismatch'
  | 'invoice_charge_missing_locally'
  | 'invoice_charge_amount_mismatch'
  | 'duplicate_provider_charge'
  | 'subscription_checkout_unresolved';

export interface ReconciliationRunResult {
  windowStart: string;
  windowEnd: string;
  localPaymentsCompared: number;
  providerIntentsCompared: number;
  localSubscriptionsCompared: number;
  providerSubscriptionsCompared: number;
  providerInvoicesCompared: number;
  issuesRaised: number;
  duplicatesSkipped: number;
}

interface LocalPaymentRow {
  id: string;
  member_id: string;
  payment_type: string;
  amount_cents: number;
  currency: string;
  status: string;
  stripe_payment_intent_id: string | null;
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  recurring_subscription_id: string | null;
  created_at: string;
}

interface LocalSubscriptionRow {
  id: string;
  member_id: string;
  /** Null on an unresolved checkout row, which has no provider subscription
   *  behind it yet. Every row the comparison passes see is confirmed, so only
   *  the unresolved-checkout sweep encounters the null. */
  stripe_subscription_id: string | null;
  checkout_session_id: string | null;
  created_at: string;
  status: string;
  amount_cents: number;
  currency: string;
}

interface IssueDraft {
  issueType: ReconciliationIssueType;
  paymentId: string | null;
  stripePaymentIntentId: string | null;
  stripeSubscriptionId: string | null;
  stripeInvoiceId: string | null;
  /** The local recurring-donation row, for the one discrepancy class that has
   *  no provider identifier of its own. Part of the issue's identity, so two
   *  stranded checkouts are two issues rather than one. */
  subscriptionRecordId?: string | null;
  details: Record<string, unknown>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const RECONCILIATION_WINDOW_DEFAULT_DAYS = 7;
/** How long a record is left alone before the comparison judges it. A webhook
 *  and a ledger read do not land at the same instant, so a payment seconds old
 *  legitimately exists on one side only; classifying it immediately reports the
 *  gap between two systems catching up as a discrepancy. */
const RECONCILIATION_GRACE_DEFAULT_MINUTES = 30;
const RECONCILIATION_EXPIRY_DEFAULT_DAYS = 90;
const DIGEST_INTERVAL_DEFAULT_DAYS = 7;
const RESOLUTION_NOTE_MAX_CHARS = 2000;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** How close together two identical settled charges to one member have to be
 *  before the pass asks about them. An hour is well outside any plausible
 *  double-submit and well inside "the member meant to give twice", which is the
 *  balance a question rather than an accusation wants. */
const DUPLICATE_CHARGE_WINDOW_MINUTES = 60;
/** How many discrepancies the digest names before it says how many it left out.
 *  A summary long enough to scroll stops being read. */
const DIGEST_MAX_LINES = 20;
/** The most rows one export carries. Generous for this organization's whole
 *  history, and a bound rather than none so a filterless export cannot try to
 *  build an unbounded string in memory. The file says when it applied. */
const PAYMENT_EXPORT_MAX_ROWS = 10_000;

/** A cell that cannot become a formula when the file is opened. A leading
 *  equals, plus, minus or at sign makes a spreadsheet execute what follows, and
 *  a payment descriptor carries a member's donation note, which is text a
 *  member wrote. Same guard the audit-log export uses, for the same reason. */
const CSV_FORMULA_LEAD = /^[=+\-@\t\r]/;
function csvCell(v: string | null): string {
  const raw = v ?? '';
  const s = CSV_FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Provider intent statuses that mean money actually moved. Anything else is a
 *  checkout the buyer never completed, which is not expected to have a settled
 *  local counterpart. */
const PROVIDER_SETTLED_INTENT_STATUSES = new Set(['succeeded']);

// ── Helpers ──────────────────────────────────────────────────────────────────

function newIssueId(): string {
  return `rec_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/** Maps a provider intent status onto the platform's payment vocabulary, so the
 *  status comparison is between like and like rather than between two different
 *  providers' spellings of the same idea. */
function mapIntentStatusToLocal(status: string): string | null {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    case 'canceled':
      return 'canceled';
    case 'requires_payment_method':
    case 'requires_action':
    case 'requires_confirmation':
    case 'processing':
      return 'pending';
    default:
      return null;
  }
}

function mapProviderSubscriptionStatus(status: string): string | null {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    case 'paused':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return null;
  }
}

export function reconciliationWindow(now: Date): LedgerWindow {
  const days = readIntConfig('reconciliation_window_days', RECONCILIATION_WINDOW_DEFAULT_DAYS);
  return {
    createdAfter: new Date(now.getTime() - days * DAY_MS).toISOString(),
    createdBefore: now.toISOString(),
  };
}

// ── Service ──────────────────────────────────────────────────────────────────

export const paymentReconciliationService = {
  /**
   * Runs both comparison passes over the reconciliation window and records every
   * disagreement as an outstanding issue.
   *
   * Nothing here writes to `payments` or to a subscription. A mismatch means the
   * two systems disagree and a human must decide which is right; silently
   * rewriting either side would destroy the evidence the discrepancy exists.
   */
  async runReconciliation(opts: { now?: Date } = {}): Promise<ReconciliationRunResult> {
    const now = opts.now ?? new Date();
    const window = reconciliationWindow(now);
    const adapter = getPaymentAdapter();

    const localPayments = paymentsDb.listForReconciliation.all(
      window.createdAfter,
      window.createdBefore,
    ) as LocalPaymentRow[];
    const localSubscriptions = subsDb.listActive.all() as LocalSubscriptionRow[];
    // Wider than the active view on purpose: see the statement's own note. An
    // invoice that settled against a donation which has since ended still needs
    // a local payment row, and the active view cannot answer whether we know
    // that subscription at all.
    const mirroredSubscriptionIds = new Set(
      (subsDb.listAllStripeIds.all() as { stripe_subscription_id: string }[])
        .map((r) => r.stripe_subscription_id),
    );

    const [providerIntents, providerSubscriptions, providerInvoices] = await Promise.all([
      adapter.listPaymentIntents(window),
      adapter.listSubscriptions(),
      adapter.listInvoices(window),
    ]);

    const graceMinutes = readIntConfig(
      'reconciliation_grace_minutes',
      RECONCILIATION_GRACE_DEFAULT_MINUTES,
    );
    const graceCutoff = new Date(now.getTime() - graceMinutes * MINUTE_MS).toISOString();

    // A recurring checkout writes its row before the redirect and something is
    // expected to resolve it: the created event promotes it, or the expiry
    // event closes it out. One that is still unresolved long afterwards means
    // neither arrived, and the benign reading (the member wandered off and the
    // expiry was lost) cannot be told apart from the costly one (the provider
    // has a live subscription charging a card that this platform has no record
    // of). That ambiguity is exactly what a human needs to look at, and it is
    // invisible everywhere else because unresolved rows are filtered out of the
    // active view, the member's history, and the comparison above.
    const staleIncomplete = subsDb.listStaleIncomplete.all(
      graceCutoff,
    ) as LocalSubscriptionRow[];

    // Every customer the provider is billing on a subscription, taken from the
    // provider's own list rather than from the local mirror, so a subscription
    // created straight in the console counts too and its renewal settlements
    // are not mistaken for unrecorded one-off charges.
    const subscriptionCustomerIds = new Set(
      providerSubscriptions
        .map((s) => s.customerId)
        .filter((id): id is string => id !== null),
    );

    const drafts: IssueDraft[] = [
      ...comparePayments(localPayments, providerIntents, subscriptionCustomerIds, graceCutoff),
      ...compareSubscriptions(localSubscriptions, providerSubscriptions),
      ...compareInvoices(localPayments, providerInvoices, mirroredSubscriptionIds, graceCutoff),
      ...flagDuplicateCharges(localPayments),
      ...flagUnresolvedCheckouts(staleIncomplete),
    ];

    let raised = 0;
    let duplicates = 0;
    for (const draft of drafts) {
      if (this.raiseIssue(draft, now)) raised += 1;
      else duplicates += 1;
    }

    return {
      windowStart: window.createdAfter,
      windowEnd: window.createdBefore,
      localPaymentsCompared: localPayments.length,
      providerIntentsCompared: providerIntents.length,
      localSubscriptionsCompared: localSubscriptions.length,
      providerSubscriptionsCompared: providerSubscriptions.length,
      providerInvoicesCompared: providerInvoices.length,
      issuesRaised: raised,
      duplicatesSkipped: duplicates,
    };
  },

  /** Records one discrepancy. Returns false when an identical outstanding issue
   *  already exists, so a nightly re-run over an unresolved discrepancy reports
   *  it once rather than once per night. */
  raiseIssue(draft: IssueDraft, now: Date): boolean {
    const id = newIssueId();
    const nowIso = now.toISOString();
    const expiryDays = readIntConfig(
      'reconciliation_expiry_days',
      RECONCILIATION_EXPIRY_DEFAULT_DAYS,
    );
    const expiresAt = new Date(now.getTime() + expiryDays * DAY_MS).toISOString();

    // The insert is the idempotency check. A check-then-insert in application
    // code cannot make this pass idempotent on its own, because two overlapping
    // runs both read "not present" before either commits; the partial unique
    // index on the outstanding discrepancy keys is what actually enforces it.
    const inserted = issuesDb.insertIssueIfAbsent.run(
      id,
      nowIso, 'reconciliation', nowIso, 'reconciliation',
      draft.issueType,
      draft.paymentId,
      draft.stripePaymentIntentId,
      draft.stripeSubscriptionId,
      draft.stripeInvoiceId,
      draft.subscriptionRecordId ?? null,
      JSON.stringify(draft.details),
      expiresAt,
    );
    if (inserted.changes === 0) return false;

    appendAuditEntry({
      actionType: 'payment.reconciliation_issue_raised',
      category: 'payment',
      actorType: 'system',
      actorMemberId: null,
      entityType: 'reconciliation_issue',
      entityId: id,
      reasonText: null,
      metadata: {
        issue_type: draft.issueType,
        payment_id: draft.paymentId,
        stripe_payment_intent_id: draft.stripePaymentIntentId,
        stripe_subscription_id: draft.stripeSubscriptionId,
        stripe_invoice_id: draft.stripeInvoiceId,
      },
    });

    // Surfaced on the admin dashboard rather than only on the reconciliation
    // page, so a discrepancy is noticed without anyone going looking.
    workQueueService.enqueue({
      actorId: 'system',
      queueCategory: 'payments',
      taskType: 'reconciliation_discrepancy',
      entityType: 'reconciliation_issue',
      entityId: id,
      priority: 0,
      reasonText: `Payment reconciliation found a discrepancy: ${draft.issueType}.`,
      detailText: null,
    });

    return true;
  },

  /** Marks a discrepancy handled, recording who decided and why. The note is
   *  required: an issue closed with no explanation tells the next administrator
   *  nothing, which defeats the point of a shared queue. */
  resolveIssue(input: {
    issueId: string;
    adminMemberId: string;
    notes: string;
  }): { status: 'resolved' } {
    const notes = input.notes.trim();
    if (notes === '') {
      throw new ValidationError('Explain what you did, so the next administrator can follow it.');
    }
    // Bounded like every other free-text field the platform stores, rather than
    // relying on the body-parser limit as an accidental backstop.
    if (notes.length > RESOLUTION_NOTE_MAX_CHARS) {
      throw new ValidationError(
        `A resolution note is limited to ${RESOLUTION_NOTE_MAX_CHARS} characters.`,
      );
    }
    const issue = issuesDb.findById.get(input.issueId) as { id: string; status: string } | undefined;
    if (!issue) throw new NotFoundError('reconciliation issue not found');

    const nowIso = new Date().toISOString();
    // The issue row, its queue twin, and the audit row commit together: the
    // queue card is a pointer to the issue, and a resolved issue with a still-open
    // pointer (or the reverse) would send the next administrator in circles.
    transaction(() => {
      const res = issuesDb.resolveIssue.run(
        nowIso, input.adminMemberId, notes, nowIso, input.adminMemberId, input.issueId,
      );
      // Already resolved by another administrator between the page render and the
      // submit: reported as missing rather than silently overwriting their note.
      if (res.changes === 0) throw new NotFoundError('reconciliation issue is no longer outstanding');

      // Close the queue twin raised alongside this issue. A missing twin (old or
      // edge-case data) changes nothing and is left as-is: the issue resolution
      // is the primary record.
      workQueue.resolveOpenByEntity.run(
        nowIso,
        input.adminMemberId,
        'closed_with_reconciliation_issue',
        notes,
        nowIso,
        input.adminMemberId,
        'reconciliation_discrepancy',
        'reconciliation_issue',
        input.issueId,
      );

      appendAuditEntry({
        actionType: 'payment.reconciliation_issue_resolved',
        category: 'payment',
        actorType: 'admin',
        actorMemberId: input.adminMemberId,
        entityType: 'reconciliation_issue',
        entityId: input.issueId,
        reasonText: notes,
        metadata: {},
      });
    });
    return { status: 'resolved' };
  },

  /**
   * The periodic reconciliation summary, on the cadence set by
   * `reconciliation_summary_interval_days`.
   *
   * Sent every cadence regardless of what it contains, including when there is
   * nothing to report. That is a deliberate reversal of the earlier behaviour,
   * which stayed silent on a clean period on the reasoning that an empty digest
   * trains people to ignore it. That reasoning holds for an operator, who has a
   * scheduled-job health surface telling them the job still runs. It does not
   * hold for the reader this report is actually written for: the person
   * answerable for the money has no such surface, so for them silence and
   * "nothing arrived because the job died three months ago" look identical.
   * The nil report IS the liveness signal, and it is one line long.
   *
   * Carries recently resolved issues alongside the open ones, naming who
   * resolved each and when. That is what the requirement asks for, and it is
   * also the only place the person answerable for the money can see that
   * questions are being answered and by whom.
   *
   * Written for a non-technical reader: amounts with their currency, plain
   * descriptions rather than issue-type codes, oldest first so the thing that
   * has been waiting longest is at the top, and a clear split between what
   * needs attention and what is merely for the record.
   *
   * Goes to its own mailing list rather than to the admin alert stream, so the
   * treasurer receives this and not the flagged-media and security traffic.
   * Best-effort per recipient, so one bad address never aborts the batch.
   */
  sendReconciliationDigest(opts: { now?: Date } = {}): {
    admins: number;
    sent: number;
    outstanding: number;
    resolved: number;
  } {
    const now = opts.now ?? new Date();
    const intervalDays = readIntConfig(
      'reconciliation_summary_interval_days',
      DIGEST_INTERVAL_DEFAULT_DAYS,
    );
    const since = new Date(now.getTime() - intervalDays * DAY_MS).toISOString();

    const outstanding = issuesDb.listOutstandingOldestFirst.all() as IssueRow[];
    const resolved = issuesDb.listResolvedSince.all(since) as Array<
      IssueRow & { resolved_at: string | null; resolved_by_slug: string | null }
    >;

    const recipients = mailingListSubscriptions.listActiveSubscribersBySlug.all(
      'financial-digest',
    ) as Array<{ member_id: string; login_email: string }>;

    const oldest = outstanding[0];
    const day = now.toISOString().slice(0, 10);

    let sent = 0;
    for (const recipient of recipients) {
      try {
        emailService.send({
          template: 'reconciliation_digest',
          params: {
            outstandingCount: outstanding.length,
            resolvedCount: resolved.length,
            periodDays: intervalDays,
            oldestOutstandingAgeDays: oldest ? ageInDays(oldest.created_at, now) : null,
            needsAttentionLines: digestLines(outstanding, now),
            forTheRecordLines: resolvedDigestLines(resolved),
            reviewUrl: `${config.publicBaseUrl}/admin/payments/reconciliation`,
          },
          recipientEmail: recipient.login_email,
          recipientMemberId: recipient.member_id,
          idempotencyKey: `reconciliation-digest:${day}:${recipient.member_id}`,
        });
        sent += 1;
      } catch (err) {
        logger.warn('reconciliation digest enqueue failed for one recipient', {
          err: err instanceof Error ? err.message : String(err),
          memberId: recipient.member_id,
        });
      }
    }
    return {
      admins: recipients.length,
      sent,
      outstanding: outstanding.length,
      resolved: resolved.length,
    };
  },

  /**
   * Clears expired rows from the two tables this daily pass owns.
   *
   * Resolved issues past their retention window go; outstanding issues are
   * never purged, however old, because they still need a decision. The
   * webhook-failure counters age out on the same key and in the same pass: they
   * are operational telemetry an administrator reviews alongside these
   * discrepancies, and the endpoint producing them is public, so leaving them
   * to accumulate would be the one way a bounded counter stops being bounded.
   *
   * `deleted` is the total across both, which is what the job record reports.
   * The two are also returned separately, because one number covering two
   * tables cannot answer which of them actually shrank.
   */
  purgeExpiredResolvedIssues(opts: { now?: Date } = {}): {
    deleted: number;
    issuesDeleted: number;
    failureCountersDeleted: number;
  } {
    const now = opts.now ?? new Date();
    const nowIso = now.toISOString();
    const issues = issuesDb.deleteExpiredResolved.run(nowIso);
    const failures = webhookFailuresDb.deleteExpired.run(nowIso);
    return {
      deleted: issues.changes + failures.changes,
      issuesDeleted: issues.changes,
      failureCountersDeleted: failures.changes,
    };
  },

  countOutstandingIssues(): number {
    return (issuesDb.countOutstanding.get() as { c: number }).c;
  },

  /** Admin All Payments list: every inbound payment, filterable and paged. */
  getAdminPaymentsPage(q: AdminPaymentQuery): PageViewModel<AdminPaymentsContent> {
    const page = normalizePage(q.page);
    const memberInput = (q.memberId ?? '').trim();
    const filters: AdminPaymentFilters = {
      paymentType: q.paymentType || undefined,
      status: q.status || undefined,
      // A member handle resolves to the ids it matches; an empty array (matched
      // nobody) is deliberately kept so the filter returns no rows rather than
      // dropping to unfiltered.
      memberIds: memberInput ? resolveMemberIdsForPaymentSearch(memberInput) : undefined,
      reference: q.reference || undefined,
      createdFrom: q.createdFrom || undefined,
      createdTo: inclusiveToBound(q.createdTo),
      eventId: q.eventId || undefined,
    };
    // An unrecognised sort key falls back rather than erroring: it arrives from
    // the query string, where a stale bookmark or a hand-edited URL is ordinary
    // rather than exceptional, and the page is still perfectly answerable.
    const activeSort = q.sort && isAdminPaymentSort(q.sort) ? q.sort : ADMIN_PAYMENT_DEFAULT_SORT;
    const total = countAdminPayments(filters);
    const offset = (page - 1) * ADMIN_PAGE_SIZE;
    const rows = queryAdminPayments(filters, ADMIN_PAGE_SIZE, offset, activeSort);
    const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
    const sortedQuery: AdminPaymentQuery = { ...q, sort: activeSort };
    // Totals cover the chosen date range rather than the current page: a page
    // is an arbitrary fifty rows and summing it would answer a question nobody
    // asked. Unbounded when no range is chosen, which is correct for an
    // organization whose whole payment history is small.
    const totalsFrom = q.createdFrom || '0000-01-01';
    const totalsTo = inclusiveToBound(q.createdTo) ?? '9999-12-31';
    const totals = periodTotals(totalsFrom, totalsTo);
    const exclusionLine = periodTotalsExclusionLine(totalsFrom, totalsTo);

    return {
      seo: { title: 'All Payments', noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_payments', title: 'All Payments' },
      content: {
        rows: rows.map((r) => ({
          id: String(r.id),
          dateDisplay: dateDisplay(String(r.created_at)),
          typeLabel: PAYMENT_TYPE_LABELS[String(r.payment_type)] ?? String(r.payment_type),
          amountDisplay: formatAmount(Number(r.amount_cents), String(r.currency)),
          statusLabel: String(r.status),
          memberSlug: r.member_slug ? String(r.member_slug) : null,
          memberHref: r.member_slug ? `/members/${String(r.member_slug)}` : null,
          reference: String(r.stripe_payment_intent_id ?? r.stripe_subscription_id ?? r.id),
          providerModeLabel: providerModeLabel(r.provider_livemode),
          hasProviderModeBadge: providerModeLabel(r.provider_livemode) !== null,
          eventTitle: r.event_title ? String(r.event_title) : null,
          eventHref: eventHrefFrom(r.event_tag),
          detailHref: `/admin/payments/${String(r.id)}`,
        })),
        hasRows: rows.length > 0,
        // Totals for the chosen date range, gross and net. A page of rows
        // answers "which payments"; a month-end needs "how much", and the net
        // column is what stops a partially refunded charge being reported at
        // full value forever.
        periodTotals: totals,
        hasPeriodTotals: totals.length > 0,
        periodTotalsExclusionLine: exclusionLine,
        hasPeriodTotalsExclusion: exclusionLine !== null,
        periodLabel: periodLabelFor(q.createdFrom, q.createdTo),
        exportHref: paymentsExportHref(sortedQuery),
        resultSummary: summaryLine(total, offset, rows.length, 'payment'),
        prevPageHref: page > 1 ? paymentsHrefFor(sortedQuery, page - 1) : null,
        nextPageHref: page < totalPages ? paymentsHrefFor(sortedQuery, page + 1) : null,
        sortHeaders: paymentSortHeaders(q, activeSort),
        activeSort,
        filters: {
          paymentType: q.paymentType ?? '',
          status: q.status ?? '',
          memberId: q.memberId ?? '',
          reference: q.reference ?? '',
          createdFrom: q.createdFrom ?? '',
          createdTo: q.createdTo ?? '',
          eventId: q.eventId ?? '',
          sort: activeSort,
        },
        typeOptions: [...PAYMENT_TYPE_OPTIONS],
        statusOptions: [...PAYMENT_STATUS_OPTIONS],
        eventOptions: listAdminPaymentEventOptions().map((e) => ({
          id: String(e.event_id),
          title: String(e.event_title),
          isSelected: String(e.event_id) === (q.eventId ?? ''),
        })),
        reconciliationHref: '/admin/payments/reconciliation',
        clearHref: '/admin/payments',
      },
    };
  },

  /** Admin payment detail. Returns null for an unknown id so the controller can
   *  answer 404 without the service knowing about HTTP. */
  getAdminPaymentDetailPage(paymentId: string): PageViewModel<AdminPaymentDetailContent> | null {
    const r = findAdminPaymentById(paymentId);
    if (!r) return null;
    const note = r.donation_note ? String(r.donation_note) : null;
    const moneyHistory = paymentMoneyEvents(
      paymentId,
      r.stripe_payment_intent_id ? String(r.stripe_payment_intent_id) : null,
      String(r.currency),
    );
    return {
      seo: { title: 'Payment Detail', noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_payment_detail', title: 'Payment Detail' },
      content: {
        id: String(r.id),
        dateDisplay: dateDisplay(String(r.created_at)),
        typeLabel: PAYMENT_TYPE_LABELS[String(r.payment_type)] ?? String(r.payment_type),
        amountDisplay: formatAmount(Number(r.amount_cents), String(r.currency)),
        statusLabel: String(r.status),
        descriptor: String(r.descriptor),
        donationNote: note,
        hasDonationNote: note !== null,
        memberSlug: r.member_slug ? String(r.member_slug) : null,
        memberHref: r.member_slug ? `/members/${String(r.member_slug)}` : null,
        stripePaymentIntentId: r.stripe_payment_intent_id ? String(r.stripe_payment_intent_id) : null,
        stripeCheckoutSessionId: r.stripe_checkout_session_id ? String(r.stripe_checkout_session_id) : null,
        stripeSubscriptionId: r.stripe_subscription_id ? String(r.stripe_subscription_id) : null,
        recurringSubscriptionId: r.recurring_subscription_id ? String(r.recurring_subscription_id) : null,
        providerModeLabel: providerModeLabel(r.provider_livemode),
        hasProviderModeBadge: providerModeLabel(r.provider_livemode) !== null,
        eventTitle: r.event_title ? String(r.event_title) : null,
        eventHref: eventHrefFrom(r.event_tag),
        hasEvent: Boolean(r.event_title),
        moneyHistory,
        hasMoneyHistory: moneyHistory.length > 0,
        amountIsNotNet: moneyHistory.length > 0 && String(r.status) !== 'refunded',
        backHref: '/admin/payments',
      },
    };
  },

  /**
   * The All Payments view as a file an accountant can open.
   *
   * Exports exactly what the filters select, so the file is the view the
   * administrator was looking at rather than a differently-scoped extract they
   * have to reconcile against it. Every amount carries its currency in its own
   * column: a spreadsheet that sums a column of mixed currencies produces a
   * figure true of none of them.
   *
   * Capped, and the cap is stated in the file rather than left to be inferred
   * from a row count, because a silently truncated financial export is worse
   * than no export.
   *
   * The export is itself recorded. Someone taking the whole payment record out
   * of the platform is an event the platform should be able to account for.
   */
  exportAdminPayments(q: AdminPaymentQuery, adminMemberId: string): {
    contentType: string;
    filename: string;
    body: string;
    count: number;
  } {
    const filters: AdminPaymentFilters = {
      paymentType: q.paymentType || undefined,
      status: q.status || undefined,
      memberIds: (q.memberId ?? '').trim()
        ? resolveMemberIdsForPaymentSearch((q.memberId ?? '').trim())
        : undefined,
      reference: q.reference || undefined,
      createdFrom: q.createdFrom || undefined,
      createdTo: inclusiveToBound(q.createdTo),
      eventId: q.eventId || undefined,
    };
    const activeSort = q.sort && isAdminPaymentSort(q.sort) ? q.sort : ADMIN_PAYMENT_DEFAULT_SORT;
    const total = countAdminPayments(filters);
    const rows = queryAdminPayments(filters, PAYMENT_EXPORT_MAX_ROWS, 0, activeSort);
    const truncated = total > rows.length;

    const lines: string[] = [];
    if (truncated) {
      lines.push(
        `# Showing ${rows.length} of ${total} matching payments. Narrow the date range to export the rest.`,
      );
    }
    lines.push([
      'payment_id', 'date_utc', 'type', 'status', 'amount', 'currency',
      'member_slug', 'descriptor', 'event', 'provider_reference',
    ].join(','));
    for (const r of rows) {
      lines.push([
        String(r.id),
        String(r.created_at),
        String(r.payment_type),
        String(r.status),
        // The bare number, so a spreadsheet can add it up; the currency is its
        // own column beside it rather than glued to the figure.
        (Number(r.amount_cents) / 100).toFixed(2),
        String(r.currency).toUpperCase(),
        r.member_slug ? String(r.member_slug) : '',
        String(r.descriptor ?? ''),
        r.event_title ? String(r.event_title) : '',
        String(r.stripe_payment_intent_id ?? r.stripe_subscription_id ?? r.id),
      ].map(csvCell).join(','));
    }

    appendAuditEntry({
      actionType: 'payment.exported',
      category: 'payment',
      actorType: 'admin',
      actorMemberId: adminMemberId,
      entityType: 'payment_export',
      entityId: 'all_payments',
      reasonText: null,
      metadata: {
        row_count: rows.length,
        matching_total: total,
        truncated,
        created_from: q.createdFrom ?? null,
        created_to: q.createdTo ?? null,
        payment_type: q.paymentType ?? null,
        status: q.status ?? null,
      },
    });

    return {
      contentType: 'text/csv',
      filename: 'payments.csv',
      body: lines.join('\n'),
      count: rows.length,
    };
  },

  /** Admin Reconciliation Issues list. Defaults to Outstanding, because the
   *  point of the page is the work still waiting. */
  getAdminReconciliationPage(q: {
    status?: string;
    page?: number;
    resolvedFlag?: boolean;
    errorMessage?: string | null;
    /** The issue whose resolve attempt failed, and the note the administrator
     *  had written. Re-rendering without them throws away what was typed: the
     *  note is prose about what someone checked and concluded, so losing a long
     *  one to a length error and making them write it again is the page failing
     *  the person using it. */
    submittedIssueId?: string | null;
    submittedNotes?: string | null;
    /** Newest first by default. Oldest first is what the person answerable for
     *  the money wants, because the number that matters on an exceptions queue
     *  is how long the worst one has been waiting. */
    sort?: string;
    now?: Date;
  }): PageViewModel<AdminReconciliationContent> {
    const requested = ISSUE_STATUS_OPTIONS.includes(q.status as never) ? q.status! : 'outstanding';
    const dbStatus = requested === 'all' ? null : (requested as 'outstanding' | 'resolved');
    const page = normalizePage(q.page);
    const oldestFirst = q.sort === 'oldest';
    const total = countReconciliationIssues(dbStatus);
    const offset = (page - 1) * ADMIN_PAGE_SIZE;
    const rows = queryReconciliationIssues(dbStatus, ADMIN_PAGE_SIZE, offset, oldestFirst);
    const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
    const now = q.now ?? new Date();
    const oldestAt = oldestOutstandingReconciliationIssueAt();
    const oldestDays = oldestAt === null ? null : ageInDays(oldestAt, now);

    return {
      seo: { title: 'Reconciliation Issues', noindex: true },
      page: {
        sectionKey: 'admin',
        pageKey: 'admin_reconciliation',
        title: 'Reconciliation Issues',
      },
      content: {
        rows: rows.map((r) => ({
          id: String(r.id),
          dateDisplay: dateDisplay(String(r.created_at)),
          issueLabel:
            ISSUE_TYPE_LABELS[String(r.issue_type) as ReconciliationIssueType] ??
            String(r.issue_type),
          issueType: String(r.issue_type),
          detailLines: detailLines(String(r.details_json)),
          referenceLines: reconciliationReferenceLines(r),
          paymentHref: r.payment_id ? `/admin/payments/${String(r.payment_id)}` : null,
          isOutstanding: String(r.status) === 'outstanding',
          resolveAction: `/admin/payments/reconciliation/${String(r.id)}/resolve`,
          resolvedAtDisplay: r.resolved_at ? dateDisplay(String(r.resolved_at)) : null,
          resolvedBySlug: r.resolved_by_slug ? String(r.resolved_by_slug) : null,
          resolutionNotes: r.resolution_notes ? String(r.resolution_notes) : null,
          // Only the row that failed carries the submitted text back, so a
          // rejected note reappears in the box it was typed into rather than in
          // every box on the page.
          submittedNotes:
            q.submittedIssueId != null && String(r.id) === q.submittedIssueId
              ? (q.submittedNotes ?? null)
              : null,
        })),
        hasRows: rows.length > 0,
        resultSummary: summaryLine(total, offset, rows.length, 'issue'),
        prevPageHref: page > 1 ? issuesHrefFor(requested, page - 1, q.sort) : null,
        nextPageHref: page < totalPages ? issuesHrefFor(requested, page + 1, q.sort) : null,
        statusFilter: requested,
        statusOptions: [...ISSUE_STATUS_OPTIONS],
        paymentsHref: '/admin/payments',
        resolvedFlag: q.resolvedFlag ?? false,
        errorMessage: q.errorMessage ?? null,
        activeSort: oldestFirst ? 'oldest' : 'newest',
        toggleSortHref: issuesHrefFor(requested, 1, oldestFirst ? 'newest' : 'oldest'),
        toggleSortLabel: oldestFirst ? 'Show newest first' : 'Show oldest first',
        // Led with rather than buried, because an issue nobody has answered for
        // months is invisible on a newest-first list: it sits on the last page,
        // and nothing on the page says it is there.
        oldestOutstandingDays: oldestDays,
        oldestOutstandingLine: oldestDays === null
          ? null
          : oldestDays === 0
            ? 'The oldest unresolved question was raised today.'
            : `The oldest unresolved question has been waiting ${oldestDays} day${oldestDays === 1 ? '' : 's'}.`,
      },
    };
  },
};

// ── Admin page shaping ───────────────────────────────────────────────────────

const ADMIN_PAGE_SIZE = 50;

// Upper bound on the member ids a single member-handle search resolves to, so a
// broad name fragment cannot build an unbounded IN list. An administrator who
// hits it narrows the handle.
const MEMBER_SEARCH_RESOLVE_LIMIT = 500;

const PAYMENT_TYPE_OPTIONS = ['donation', 'membership', 'event_registration'] as const;
const PAYMENT_STATUS_OPTIONS = ['pending', 'succeeded', 'failed', 'canceled', 'refunded'] as const;
const ISSUE_STATUS_OPTIONS = ['outstanding', 'resolved', 'all'] as const;

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  donation: 'Donation',
  membership: 'Membership',
  event_registration: 'Event registration',
};

const ISSUE_TYPE_LABELS: Record<ReconciliationIssueType, string> = {
  payment_missing_at_provider: 'Local payment with no provider record',
  provider_payment_missing_locally: 'Provider payment with no local record',
  payment_amount_mismatch: 'Amount or currency disagrees',
  payment_status_mismatch: 'Status disagrees',
  subscription_missing_at_provider: 'Local subscription with no provider record',
  provider_subscription_missing_locally: 'Provider subscription with no local record',
  subscription_status_mismatch: 'Subscription status disagrees',
  invoice_charge_missing_locally: 'Provider renewal charge with no local record',
  invoice_charge_amount_mismatch: 'Renewal amount or currency disagrees',
  duplicate_provider_charge: 'The same member appears charged twice for the same thing',
  subscription_checkout_unresolved: 'Recurring checkout never resolved either way',
};

export interface AdminPaymentQuery {
  paymentType?: string;
  status?: string;
  memberId?: string;
  reference?: string;
  createdFrom?: string;
  createdTo?: string;
  eventId?: string;
  /** One of the whitelisted keys in `db.ts`; anything else falls back to the
   *  default rather than reaching the statement. */
  sort?: string;
  page?: number;
}

/** One column heading of the All Payments table. A non-sortable column carries a
 *  null href and renders as plain text. */
export interface AdminPaymentSortHeader {
  label: string;
  href: string | null;
  isActive: boolean;
  directionGlyph: string | null;
  ariaSort: string | null;
}

export interface AdminPaymentEventOption {
  id: string;
  title: string;
  isSelected: boolean;
}

export interface AdminPaymentRowViewModel {
  id: string;
  dateDisplay: string;
  typeLabel: string;
  amountDisplay: string;
  statusLabel: string;
  memberSlug: string | null;
  memberHref: string | null;
  reference: string;
  /** Null for a live payment, which is deliberately unbadged; see
   *  `providerModeLabel`. */
  providerModeLabel: string | null;
  hasProviderModeBadge: boolean;
  /** The event a registration fee was taken for; null for every donation and
   *  membership, which settle no registration. */
  eventTitle: string | null;
  eventHref: string | null;
  detailHref: string;
}

export interface AdminPaymentsContent {
  rows: AdminPaymentRowViewModel[];
  hasRows: boolean;
  /** Gross, refunded and net for the chosen date range, by purpose and
   *  currency. Never summed across currencies: one number covering two of them
   *  is true of neither. */
  periodTotals: PeriodTotalRow[];
  hasPeriodTotals: boolean;
  periodTotalsExclusionLine: string | null;
  hasPeriodTotalsExclusion: boolean;
  periodLabel: string;
  exportHref: string;
  resultSummary: string;
  prevPageHref: string | null;
  nextPageHref: string | null;
  sortHeaders: AdminPaymentSortHeader[];
  activeSort: string;
  filters: Required<Omit<AdminPaymentQuery, 'page'>>;
  typeOptions: string[];
  statusOptions: string[];
  eventOptions: AdminPaymentEventOption[];
  reconciliationHref: string;
  clearHref: string;
}

/** One money-affecting event after settlement, shaped for reading rather than
 *  for querying: an administrator looking at a payment wants to know what
 *  happened and how much, not which action-type code recorded it. */
export interface PaymentMoneyEvent {
  whenDisplay: string;
  label: string;
  amountDisplay: string | null;
  detail: string | null;
}

export interface AdminPaymentDetailContent {
  id: string;
  dateDisplay: string;
  typeLabel: string;
  amountDisplay: string;
  statusLabel: string;
  descriptor: string;
  /** Read-only in every admin surface: a donor's words are theirs. */
  donationNote: string | null;
  hasDonationNote: boolean;
  memberSlug: string | null;
  memberHref: string | null;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
  stripeSubscriptionId: string | null;
  recurringSubscriptionId: string | null;
  /** Null for a live payment, which is deliberately unbadged; see
   *  `providerModeLabel`. */
  providerModeLabel: string | null;
  hasProviderModeBadge: boolean;
  /** The event a registration fee was taken for; null for every donation and
   *  membership, which settle no registration. */
  eventTitle: string | null;
  eventHref: string | null;
  hasEvent: boolean;
  /** Money that moved after this payment settled: a partial refund, a dispute,
   *  a rejected payout. None of them touches the payment row, by design, so
   *  without this the page shows the full original amount and nothing at all to
   *  say that money went back. */
  moneyHistory: PaymentMoneyEvent[];
  hasMoneyHistory: boolean;
  /** True where something came back or is being contested, so the amount above
   *  is no longer what the organization kept. */
  amountIsNotNet: boolean;
  backHref: string;
}

export interface AdminIssueRowViewModel {
  id: string;
  dateDisplay: string;
  issueLabel: string;
  issueType: string;
  detailLines: string[];
  /** The provider ids on the issue (payment intent, subscription, invoice),
   *  rendered as copyable text so an administrator can cross-reference in the
   *  Stripe dashboard. Only the ids the issue actually carries appear. */
  referenceLines: Array<{ label: string; value: string }>;
  paymentHref: string | null;
  isOutstanding: boolean;
  resolveAction: string;
  resolvedAtDisplay: string | null;
  resolvedBySlug: string | null;
  resolutionNotes: string | null;
  /** What the administrator typed, when their resolve attempt was rejected and
   *  this is the row it was rejected on. Null everywhere else. */
  submittedNotes: string | null;
}

export interface AdminReconciliationContent {
  rows: AdminIssueRowViewModel[];
  hasRows: boolean;
  resultSummary: string;
  prevPageHref: string | null;
  nextPageHref: string | null;
  statusFilter: string;
  statusOptions: string[];
  paymentsHref: string;
  resolvedFlag: boolean;
  errorMessage: string | null;
  activeSort: 'newest' | 'oldest';
  toggleSortHref: string;
  toggleSortLabel: string;
  /** Whole days the longest-waiting unresolved discrepancy has been open, or
   *  null when none is. */
  oldestOutstandingDays: number | null;
  oldestOutstandingLine: string | null;
}

/** The amount with its own currency code and no invented symbol. A dollar sign
 *  in front of a euro total is a false statement about money, and this figure is
 *  read by whoever has to reconcile the books. Every payment settles in one
 *  currency today, so the wrong symbol is currently latent rather than visible —
 *  but the reconciliation design's own worked example of an amount mismatch is
 *  the same number in two currencies, which is exactly the case that would print
 *  it. */
function formatAmount(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

// Labels a row by the provider mode it was taken in. Only the two states an
// administrator must not mistake for real money get a label: a test-mode
// rehearsal, and a row written before the mode was recorded, which cannot be
// back-derived. Live money is deliberately unlabelled, so the absence of a badge
// means "ordinary payment" and a missing value can never be read as one.
// The public event page is keyed on the event's hashtag with the leading marker
// dropped, the same derivation the event service applies. Null whenever the
// payment settles no registration, which is every donation and membership.
function eventHrefFrom(tagNormalized: unknown): string | null {
  if (!tagNormalized) return null;
  const tag = String(tagNormalized);
  return `/events/${tag.startsWith('#') ? tag.slice(1) : tag}`;
}

function providerModeLabel(raw: unknown): string | null {
  if (raw === null || raw === undefined) return 'Unknown mode';
  return Number(raw) === 1 ? null : 'Test mode';
}

// Stored timestamps are UTC; naming the zone stops an admin reconciling against
// a provider dashboard from reading the figure as their own clock.
function dateDisplay(iso: string): string {
  return `${iso.slice(0, 19).replace('T', ' ')} UTC`;
}

/** The subset of a reconciliation issue the digest reads. Kept local to this
 *  service: the digest is a rendering concern, not a contract. */
interface IssueRow {
  id: string;
  issue_type: string;
  created_at: string;
  details_json: string;
}

/** Whole days between a stored timestamp and now, floored, never negative. */
function ageInDays(iso: string, now: Date): number {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / DAY_MS));
}

/** The money an issue is about, when its details carry any, rendered with its
 *  own currency code. Several discrepancy classes name the two sides
 *  separately, so the provider's figure is preferred: that is the money that
 *  actually moved. */
function issueAmountPhrase(details: Record<string, unknown>): string | null {
  const candidates: Array<[unknown, unknown]> = [
    [details.provider_amount_cents, details.provider_currency],
    [details.amount_cents, details.currency],
    [details.local_amount_cents, details.local_currency],
  ];
  for (const [cents, currency] of candidates) {
    if (typeof cents === 'number' && typeof currency === 'string' && currency !== '') {
      return formatAmount(cents, currency);
    }
  }
  return null;
}

/** One readable line per open discrepancy, oldest first, for a reader who does
 *  not know the issue-type vocabulary and should not have to. */
function digestLines(rows: IssueRow[], now: Date): string {
  if (rows.length === 0) return '';
  const listed = rows.slice(0, DIGEST_MAX_LINES);
  const lines = listed.map((row) => {
    const details = parseDetails(row.details_json);
    const label =
      ISSUE_TYPE_LABELS[row.issue_type as ReconciliationIssueType] ?? row.issue_type;
    const amount = issueAmountPhrase(details);
    const days = ageInDays(row.created_at, now);
    const age = days === 0 ? 'today' : days === 1 ? '1 day old' : `${days} days old`;
    return [
      `${row.created_at.slice(0, 10)} (${age})`,
      label,
      amount,
    ].filter((part) => part !== null).join(' - ');
  });
  // A silent cap reads as "this is all of them". Say what was left out.
  if (rows.length > listed.length) {
    lines.push(
      `... and ${rows.length - listed.length} more, not listed here. See the full queue.`,
    );
  }
  return lines.join('\n');
}

/** The same, for what was settled during the period, naming who settled it.
 *  A resolution with no named resolver is possible only if the member record
 *  has since gone, so it says so rather than printing an empty name. */
function resolvedDigestLines(
  rows: Array<IssueRow & { resolved_at: string | null; resolved_by_slug: string | null }>,
): string {
  if (rows.length === 0) return '';
  const listed = rows.slice(0, DIGEST_MAX_LINES);
  const lines = listed.map((row) => {
    const label =
      ISSUE_TYPE_LABELS[row.issue_type as ReconciliationIssueType] ?? row.issue_type;
    const amount = issueAmountPhrase(parseDetails(row.details_json));
    const who = row.resolved_by_slug ?? 'an administrator whose account has since been removed';
    const when = row.resolved_at ? row.resolved_at.slice(0, 10) : 'an unrecorded date';
    return [label, amount, `resolved by ${who} on ${when}`]
      .filter((part) => part !== null)
      .join(' - ');
  });
  if (rows.length > listed.length) {
    lines.push(`... and ${rows.length - listed.length} more, not listed here.`);
  }
  return lines.join('\n');
}

/** One line of the period summary: what came in for one purpose in one
 *  currency, what went back out, and what is left. */
export interface PeriodTotalRow {
  categoryLabel: string;
  currency: string;
  count: number;
  grossDisplay: string;
  refundedDisplay: string;
  netDisplay: string;
  hasRefunds: boolean;
}

/**
 * What the organization took in over a range, what came back, and the
 * difference.
 *
 * Gross alone is the figure the platform could always produce, and it is the
 * wrong one to report on its own: a partial refund and a chargeback never touch
 * the payment row, by design, so a payment that was half returned still counts
 * at full value in every total forever. Reporting gross, refunds and net side
 * by side is what makes the number safe to put in front of a board.
 *
 * Refunds are taken per payment rather than summed across audit rows, because
 * the provider reports a cumulative refunded amount per charge: a partial
 * refund followed by a full one describes overlapping money, and adding the two
 * rows would overstate what went back. A full refund returns the whole payment,
 * so it wins over any partial figure recorded earlier.
 */
export function periodTotals(fromIso: string, toIso: string): PeriodTotalRow[] {
  const gross = paymentPeriodTotals.grossByTypeInRange.all(fromIso, toIso) as Array<{
    payment_type: string; currency: string; n: number; total_cents: number;
  }>;
  const refundFacts = paymentPeriodTotals.refundFactsInRange.all(fromIso, toIso) as Array<{
    id: string; payment_type: string; currency: string; amount_cents: number;
    action_type: string; refunded_amount_cents: number | null;
  }>;

  const refundedByPayment = new Map<string, { key: string; cents: number }>();
  for (const fact of refundFacts) {
    const key = `${fact.payment_type}|${fact.currency.toUpperCase()}`;
    const cents = fact.action_type === 'payment.refunded'
      ? fact.amount_cents
      : fact.refunded_amount_cents ?? 0;
    const held = refundedByPayment.get(fact.id);
    if (!held || cents > held.cents) refundedByPayment.set(fact.id, { key, cents });
  }
  const refundedByKey = new Map<string, number>();
  for (const { key, cents } of refundedByPayment.values()) {
    refundedByKey.set(key, (refundedByKey.get(key) ?? 0) + cents);
  }

  return gross.map((row) => {
    const currency = row.currency.toUpperCase();
    const refunded = refundedByKey.get(`${row.payment_type}|${currency}`) ?? 0;
    return {
      categoryLabel: PAYMENT_TYPE_LABELS[row.payment_type] ?? row.payment_type,
      currency,
      count: row.n,
      grossDisplay: formatAmount(row.total_cents, currency),
      refundedDisplay: formatAmount(refunded, currency),
      netDisplay: formatAmount(row.total_cents - refunded, currency),
      hasRefunds: refunded > 0,
    };
  });
}

/**
 * The one-line disclosure that goes with the totals, or null when nothing was
 * set aside. The totals count real money only, so a range containing rehearsal
 * charges produces a figure lower than the row count above it would suggest;
 * saying so is what stops the difference reading as missing money.
 */
export function periodTotalsExclusionLine(fromIso: string, toIso: string): string | null {
  const rows = paymentPeriodTotals.excludedFromTotalsInRange.all(fromIso, toIso) as Array<{
    mode: string; n: number;
  }>;
  if (rows.length === 0) return null;
  const testCount = rows.find((r) => r.mode === 'test')?.n ?? 0;
  const unknownCount = rows.find((r) => r.mode === 'unknown')?.n ?? 0;
  const parts: string[] = [];
  if (testCount > 0) {
    parts.push(`${testCount} test-mode payment${testCount === 1 ? '' : 's'}`);
  }
  if (unknownCount > 0) {
    parts.push(
      `${unknownCount} payment${unknownCount === 1 ? '' : 's'} whose provider mode was never recorded`,
    );
  }
  return `These totals count real money only. Set aside: ${parts.join(' and ')}.`;
}

/** What each money-affecting event is called on the page. Plain words, because
 *  the reader is deciding whether money needs chasing, not grepping logs. */
const MONEY_EVENT_LABELS: Record<string, string> = {
  'payment.refunded': 'Refunded in full',
  'payment.partially_refunded': 'Partially refunded',
  'payment.canceled': 'Canceled',
  'payment.dispute_opened': 'Disputed by the cardholder',
  'payment.dispute_closed': 'Dispute closed',
  'payment.dispute_funds_withdrawn': 'Disputed funds withdrawn',
  'payment.payout_rejected': 'Payout to the bank account rejected',
};

/**
 * The money that moved on a payment after it settled.
 *
 * Read from the audit ledger because that is the only place it exists: a
 * partial refund, a dispute and a rejected payout all leave the payment row
 * untouched by design, so a page built from that row alone reports the full
 * original amount forever and shows nothing to the contrary.
 */
function paymentMoneyEvents(
  paymentId: string,
  stripePaymentIntentId: string | null,
  paymentCurrency: string,
): PaymentMoneyEvent[] {
  const rows = paymentMoneyHistory.forPayment.all(
    paymentId, stripePaymentIntentId,
  ) as Array<{
    occurred_at: string;
    action_type: string;
    reason_text: string | null;
    metadata_json: string;
  }>;
  return rows.map((row) => {
    const meta = parseDetails(row.metadata_json);
    const cents = typeof meta.refunded_amount_cents === 'number'
      ? meta.refunded_amount_cents
      : typeof meta.amount_cents === 'number' ? meta.amount_cents : null;
    const currency = typeof meta.currency === 'string' && meta.currency !== ''
      ? meta.currency
      : paymentCurrency;
    return {
      whenDisplay: dateDisplay(row.occurred_at),
      label: MONEY_EVENT_LABELS[row.action_type] ?? row.action_type,
      amountDisplay: cents === null ? null : formatAmount(cents, currency),
      detail: row.reason_text,
    };
  });
}

/** Details are written by this service and are always an object, but they are
 *  read back out of a text column, so a row hand-edited into invalid JSON must
 *  not take the whole digest down with it. */
function parseDetails(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// A payment's created_at is a full timestamp, so an admin's `to=YYYY-MM-DD` must
// compare against the start of the NEXT day for the chosen day to be included;
// the SQL bound stays exclusive. Non-date input passes through unchanged.
function inclusiveToBound(to: string | undefined): string | undefined {
  if (!to) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(to);
  if (!m) return to;
  const next = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
  return next.toISOString().slice(0, 10);
}

// Resolves what an administrator would say about a donor (an id, a slug, a login
// email, or part of a display name) to the member ids the payments filter reads.
// A cap bounds the id list a very broad name fragment can produce; beyond it the
// administrator narrows the search.
function resolveMemberIdsForPaymentSearch(input: string): string[] {
  const normalized = input.toLowerCase();
  const escaped = normalized
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
  const rows = account.findMemberIdsForAdminSearch.all(
    input,
    input,
    normalized,
    escaped,
    MEMBER_SEARCH_RESOLVE_LIMIT,
  ) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

function paymentFilterParams(q: AdminPaymentQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.paymentType) p.set('type', q.paymentType);
  if (q.status) p.set('status', q.status);
  if (q.memberId) p.set('member', q.memberId);
  if (q.reference) p.set('reference', q.reference);
  if (q.createdFrom) p.set('from', q.createdFrom);
  if (q.createdTo) p.set('to', q.createdTo);
  if (q.eventId) p.set('event', q.eventId);
  return p;
}

function paymentsHrefFor(q: AdminPaymentQuery, page: number): string {
  const p = paymentFilterParams(q);
  if (q.sort && q.sort !== ADMIN_PAYMENT_DEFAULT_SORT) p.set('sort', q.sort);
  if (page > 1) p.set('page', String(page));
  const qs = p.toString();
  return qs ? `/admin/payments?${qs}` : '/admin/payments';
}

/** The export of exactly what the current filters select, so the file an
 *  accountant opens is the view the administrator was looking at. */
function paymentsExportHref(q: AdminPaymentQuery): string {
  const p = paymentFilterParams(q);
  if (q.sort && q.sort !== ADMIN_PAYMENT_DEFAULT_SORT) p.set('sort', q.sort);
  const qs = p.toString();
  return qs ? `/admin/payments/export?${qs}` : '/admin/payments/export';
}

/** Plain words for the range the totals cover, because "1 July to 31 July" is
 *  what a reader needs to know they are looking at the right month. */
function periodLabelFor(from: string | undefined, to: string | undefined): string {
  if (from && to) return `${from} to ${to}`;
  if (from) return `${from} onwards`;
  if (to) return `everything up to ${to}`;
  return 'the whole record';
}

/** The sortable and non-sortable column headings of the All Payments table, in
 *  render order. The service fixes each heading's destination so the template
 *  renders a display-and-href pair and never assembles a query string itself. */
function paymentSortHeaders(q: AdminPaymentQuery, activeSort: string): AdminPaymentSortHeader[] {
  const columns: Array<{ label: string; key: string | null }> = [
    { label: 'Date', key: 'date' },
    { label: 'Type', key: 'type' },
    { label: 'Amount', key: 'amount' },
    { label: 'Status', key: 'status' },
    { label: 'Member', key: 'member' },
    { label: 'Event', key: 'event' },
    { label: 'Reference', key: 'reference' },
    { label: '', key: null },
  ];
  return columns.map(({ label, key }) => {
    if (key === null) {
      return { label, href: null, isActive: false, directionGlyph: null, ariaSort: null };
    }
    const isActive = activeSort === `${key}_asc` || activeSort === `${key}_desc`;
    const ascending = activeSort === `${key}_asc`;
    // Clicking the active column reverses it; clicking any other starts it
    // ascending, which is what a reader expects of a column they have not
    // sorted by yet. Date is the exception: newest-first is the useful default
    // for a payment ledger, so its first click keeps descending.
    const nextSort = isActive
      ? `${key}_${ascending ? 'desc' : 'asc'}`
      : `${key}_${key === 'date' ? 'desc' : 'asc'}`;
    const p = paymentFilterParams(q);
    if (nextSort !== ADMIN_PAYMENT_DEFAULT_SORT) p.set('sort', nextSort);
    const qs = p.toString();
    return {
      label,
      href: qs ? `/admin/payments?${qs}` : '/admin/payments',
      isActive,
      // The direction marker states which way the column is ordered, so it is
      // content rather than decoration and is paired with aria-sort for a
      // reader who never sees the glyph.
      directionGlyph: isActive ? (ascending ? '↑' : '↓') : null,
      ariaSort: isActive ? (ascending ? 'ascending' : 'descending') : null,
    };
  });
}

function issuesHrefFor(status: string, page: number, sort?: string): string {
  const p = new URLSearchParams();
  if (status && status !== 'outstanding') p.set('status', status);
  if (page > 1) p.set('page', String(page));
  // Only the non-default order is carried, so the ordinary link stays clean and
  // a chosen order survives paging.
  if (sort === 'oldest') p.set('sort', 'oldest');
  const qs = p.toString();
  return qs ? `/admin/payments/reconciliation?${qs}` : '/admin/payments/reconciliation';
}

/** Renders the stored discrepancy detail as plain readable lines, so an
 *  administrator sees what disagrees without decoding raw JSON. */
function detailLines(detailsJson: string): string[] {
  try {
    const parsed = JSON.parse(detailsJson) as Record<string, unknown>;
    return Object.entries(parsed).map(
      ([key, value]) => `${key.replace(/_/g, ' ')}: ${value === null ? 'none' : String(value)}`,
    );
  } catch {
    return ['The stored detail for this issue could not be read.'];
  }
}

/** The provider ids the issue carries, labelled for display. Only present ids
 *  appear, so an issue about a one-time payment shows no subscription line. */
function reconciliationReferenceLines(
  r: Record<string, unknown>,
): Array<{ label: string; value: string }> {
  const lines: Array<{ label: string; value: string }> = [];
  if (r.stripe_payment_intent_id) lines.push({ label: 'Payment Intent', value: String(r.stripe_payment_intent_id) });
  if (r.stripe_subscription_id) lines.push({ label: 'Subscription', value: String(r.stripe_subscription_id) });
  if (r.stripe_invoice_id) lines.push({ label: 'Invoice', value: String(r.stripe_invoice_id) });
  return lines;
}

function normalizePage(page: number | undefined): number {
  return page && Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function summaryLine(total: number, offset: number, shown: number, noun: string): string {
  if (total === 0) return `No matching ${noun}s.`;
  return `Showing ${offset + 1} to ${offset + shown} of ${total} ${noun}${total === 1 ? '' : 's'}.`;
}

// ── Comparison passes ────────────────────────────────────────────────────────

/** Pass 1: one-time payments against provider payment intents. Records created
 *  after `graceCutoff` are matched but never judged, so normal delivery lag at
 *  the edge of the run does not read as a discrepancy. */
function comparePayments(
  local: LocalPaymentRow[],
  provider: StripePaymentIntentSummary[],
  /** Every customer the provider is billing on a subscription. An intent with
   *  no platform correlation key that belongs to one of these is a renewal's
   *  own settlement vehicle, which the invoice pass owns. */
  subscriptionCustomerIds: Set<string>,
  graceCutoff: string,
): IssueDraft[] {
  const drafts: IssueDraft[] = [];
  const providerById = new Map(provider.map((p) => [p.id, p]));
  const matchedProviderIds = new Set<string>();

  // Subscription charges are settled by invoice, not by a checkout intent, so
  // they are compared in the invoice pass instead of here.
  const oneTime = local.filter((p) => p.recurring_subscription_id === null);

  for (const payment of oneTime) {
    const intentId = payment.stripe_payment_intent_id;
    const withinGrace = payment.created_at >= graceCutoff;
    // A pending row with no intent id yet is a checkout in flight, not a
    // discrepancy: the provider legitimately defers intent creation.
    if (!intentId) {
      if (payment.status !== 'pending' && !withinGrace) {
        drafts.push({
          issueType: 'payment_missing_at_provider',
          paymentId: payment.id,
          stripePaymentIntentId: null,
          stripeSubscriptionId: null,
          stripeInvoiceId: null,
          details: {
            reason: 'settled payment carries no provider payment intent',
            local_status: payment.status,
            amount_cents: payment.amount_cents,
            currency: payment.currency,
          },
        });
      }
      continue;
    }

    const intent = providerById.get(intentId);
    if (!intent) {
      if (withinGrace) continue;
      drafts.push({
        issueType: 'payment_missing_at_provider',
        paymentId: payment.id,
        stripePaymentIntentId: intentId,
        stripeSubscriptionId: null,
        stripeInvoiceId: null,
        details: {
          reason: 'no provider payment intent matches this payment',
          local_status: payment.status,
          amount_cents: payment.amount_cents,
          currency: payment.currency,
        },
      });
      continue;
    }
    // Matched before the grace check so the reverse pass does not report this
    // intent as having no local record.
    matchedProviderIds.add(intentId);
    if (withinGrace) continue;

    // Currency is part of the amount, not a label beside it: equal numbers in
    // different currencies are different money.
    if (
      intent.amountCents !== payment.amount_cents ||
      intent.currency !== payment.currency.toUpperCase()
    ) {
      drafts.push({
        issueType: 'payment_amount_mismatch',
        paymentId: payment.id,
        stripePaymentIntentId: intentId,
        stripeSubscriptionId: null,
        stripeInvoiceId: null,
        details: {
          local_amount_cents: payment.amount_cents,
          local_currency: payment.currency.toUpperCase(),
          provider_amount_cents: intent.amountCents,
          provider_currency: intent.currency,
        },
      });
    }

    // A refund does not move the provider intent off `succeeded`: the charge did
    // succeed, and the reversal is a separate provider record. The refund is
    // already recorded locally, so the two sides agree despite the different
    // words, and reporting it would raise the same issue on every nightly pass.
    const mapped = mapIntentStatusToLocal(intent.status);
    const refundedLocally = payment.status === 'refunded' && mapped === 'succeeded';
    if (mapped !== null && mapped !== payment.status && !refundedLocally) {
      drafts.push({
        issueType: 'payment_status_mismatch',
        paymentId: payment.id,
        stripePaymentIntentId: intentId,
        stripeSubscriptionId: null,
        stripeInvoiceId: null,
        details: {
          local_status: payment.status,
          provider_status: intent.status,
          provider_status_as_local: mapped,
        },
      });
    }
  }

  // The other direction: money the provider settled that never reached a local
  // record, which is the missed-webhook case reconciliation exists to catch.
  for (const intent of provider) {
    if (matchedProviderIds.has(intent.id)) continue;
    if (intent.platformPaymentId !== null) {
      // Ours, and already recorded: the money reached a local row even though
      // this intent id never got written onto it. A settled row with no intent
      // id is the forward pass's finding, not this one's. Looked up by id
      // rather than against the windowed set, because the provider may defer
      // creating the intent until the buyer actually pays, so a checkout opened
      // just before the window can settle just inside it and its row would
      // otherwise read as absent.
      if (paymentsDb.findById.get(intent.platformPaymentId)) continue;
    } else if (subscriptionCustomerIds.has(intent.customerId ?? '')) {
      // Not ours by metadata, and it belongs to a customer the provider is
      // billing on a subscription: this is a subscription cycle's own
      // settlement intent. The invoice pass owns that comparison, and flagging
      // it here would raise one unresolvable issue per renewal, forever.
      //
      // A console-created charge against one of those same customers is
      // therefore also skipped. That is the deliberate cost of having no
      // invoice reference on an intent at this API version: the alternative,
      // skipping every un-correlated intent, hid genuine unrecorded money.
      continue;
    }
    if (!PROVIDER_SETTLED_INTENT_STATUSES.has(intent.status)) continue;
    // A charge the provider settled moments ago may still be in flight to the
    // webhook that records it locally.
    if (intent.createdAt >= graceCutoff) continue;
    drafts.push({
      issueType: 'provider_payment_missing_locally',
      paymentId: null,
      stripePaymentIntentId: intent.id,
      stripeSubscriptionId: null,
      stripeInvoiceId: null,
      details: {
        reason: intent.platformPaymentId !== null
          ? 'provider settled a payment with no local record'
          : 'provider settled a payment this platform did not originate',
        provider_status: intent.status,
        amount_cents: intent.amountCents,
        currency: intent.currency,
        created_at: intent.createdAt,
        // The correlation key this platform stamped on the intent. It names the
        // payment row that should exist and does not, which is where an
        // administrator starts looking. Absent on a charge the platform never
        // created, where the customer reference is the only lead there is.
        platform_payment_id: intent.platformPaymentId,
        stripe_customer_id: intent.customerId,
      },
    });
  }

  return drafts;
}

/**
 * Pass 2b: recurring checkouts that never resolved.
 *
 * Not a comparison against the provider ledger, because there is nothing to
 * compare with: the row carries no subscription id. It is a check that the
 * local state machine finished. A row still unresolved past the grace cutoff
 * either lost its expiry event (harmless) or lost its created event (a live
 * subscription this platform cannot see), and only a human can tell which by
 * looking the session up in the dashboard.
 */
function flagUnresolvedCheckouts(stale: LocalSubscriptionRow[]): IssueDraft[] {
  return stale.map((sub) => ({
    issueType: 'subscription_checkout_unresolved' as const,
    paymentId: null,
    stripePaymentIntentId: null,
    stripeSubscriptionId: null,
    stripeInvoiceId: null,
    // The row itself is the identity here: there is no provider identifier to
    // key on, which is precisely what the discrepancy says. Each stranded
    // checkout is its own live-subscription-we-cannot-see risk and needs its
    // own slot in front of an administrator.
    subscriptionRecordId: sub.id,
    details: {
      reason: 'a recurring checkout was opened and neither confirmed nor expired',
      subscription_record_id: sub.id,
      checkout_session_id: sub.checkout_session_id,
      opened_at: sub.created_at,
      amount_cents: sub.amount_cents,
      currency: sub.currency,
    },
  }));
}

/** Pass 2a: local subscriptions against provider subscriptions. */
function compareSubscriptions(
  local: LocalSubscriptionRow[],
  provider: StripeSubscriptionSummary[],
): IssueDraft[] {
  const drafts: IssueDraft[] = [];
  const providerById = new Map(provider.map((s) => [s.id, s]));
  const localByStripeId = new Map(local.map((s) => [s.stripe_subscription_id, s]));

  for (const sub of local) {
    // The active view excludes unresolved checkouts, so every row here carries
    // a subscription id. Skipping the null rather than asserting keeps this
    // pass correct if that view ever widens: an unresolved row has its own
    // sweep and must not be reported as missing at the provider.
    if (!sub.stripe_subscription_id) continue;
    const remote = providerById.get(sub.stripe_subscription_id);
    if (!remote) {
      drafts.push({
        issueType: 'subscription_missing_at_provider',
        paymentId: null,
        stripePaymentIntentId: null,
        stripeSubscriptionId: sub.stripe_subscription_id,
        stripeInvoiceId: null,
        details: {
          reason: 'a live local subscription has no provider counterpart',
          local_status: sub.status,
          amount_cents: sub.amount_cents,
          currency: sub.currency,
        },
      });
      continue;
    }
    const mapped = remote.status ? mapProviderSubscriptionStatus(remote.status) : null;
    if (mapped !== null && mapped !== sub.status) {
      drafts.push({
        issueType: 'subscription_status_mismatch',
        paymentId: null,
        stripePaymentIntentId: null,
        stripeSubscriptionId: sub.stripe_subscription_id,
        stripeInvoiceId: null,
        details: {
          local_status: sub.status,
          provider_status: remote.status,
          provider_status_as_local: mapped,
        },
      });
    }
  }

  for (const remote of provider) {
    if (localByStripeId.has(remote.id)) continue;
    // Only a live provider subscription is expected to have a local mirror; one
    // the provider has already ended is history, not a gap.
    if (mapProviderSubscriptionStatus(remote.status) === 'canceled') continue;
    drafts.push({
      issueType: 'provider_subscription_missing_locally',
      paymentId: null,
      stripePaymentIntentId: null,
      stripeSubscriptionId: remote.id,
      stripeInvoiceId: null,
      details: {
        reason: 'the provider holds a live subscription with no local record',
        provider_status: remote.status,
        amount_cents: remote.amountCents,
        currency: remote.currency,
      },
    });
  }

  return drafts;
}

/** Pass 2b: provider invoices against the local per-cycle charge rows. Invoices
 *  newer than `graceCutoff` are left for a later run, since the webhook that
 *  records the charge may still be in flight. */
function compareInvoices(
  localPayments: LocalPaymentRow[],
  providerInvoices: StripeInvoiceSummary[],
  knownSubscriptionIds: Set<string>,
  graceCutoff: string,
): IssueDraft[] {
  const drafts: IssueDraft[] = [];
  // By invoice id rather than as a bare set of ids, so a recorded renewal can be
  // compared rather than only counted. The requirement makes amount AND currency
  // a discrepancy for one-time payments, and a renewal is money in exactly the
  // same sense; checking only that a row exists would pass a renewal booked for
  // the wrong sum, or in a currency the money never moved in, as reconciled.
  const recordedByInvoiceId = new Map(
    localPayments
      .filter((p): p is LocalPaymentRow & { stripe_invoice_id: string } =>
        p.stripe_invoice_id !== null)
      .map((p) => [p.stripe_invoice_id, p]),
  );

  for (const invoice of providerInvoices) {
    if (invoice.status !== 'paid') continue;
    const recorded = recordedByInvoiceId.get(invoice.id);
    if (recorded) {
      if (invoice.createdAt >= graceCutoff) continue;
      const amountDiffers = recorded.amount_cents !== invoice.amountPaidCents;
      const currencyDiffers =
        recorded.currency.toUpperCase() !== invoice.currency.toUpperCase();
      if (amountDiffers || currencyDiffers) {
        drafts.push({
          issueType: 'invoice_charge_amount_mismatch',
          paymentId: recorded.id,
          stripePaymentIntentId: null,
          stripeSubscriptionId: invoice.subscriptionId,
          stripeInvoiceId: invoice.id,
          details: {
            reason: currencyDiffers && amountDiffers
              ? 'the renewal was booked with a different amount and currency than the provider collected'
              : currencyDiffers
                ? 'the renewal was booked in a different currency than the provider collected'
                : 'the renewal was booked for a different amount than the provider collected',
            local_amount_cents: recorded.amount_cents,
            local_currency: recorded.currency.toUpperCase(),
            provider_amount_cents: invoice.amountPaidCents,
            provider_currency: invoice.currency.toUpperCase(),
            created_at: invoice.createdAt,
          },
        });
      }
      continue;
    }
    if (invoice.createdAt >= graceCutoff) continue;
    // An invoice against a subscription the platform never mirrored is already
    // reported by the subscription pass; reporting it again here would put two
    // issues in front of an administrator for one underlying problem.
    if (invoice.subscriptionId && !knownSubscriptionIds.has(invoice.subscriptionId)) continue;
    drafts.push({
      issueType: 'invoice_charge_missing_locally',
      paymentId: null,
      stripePaymentIntentId: null,
      stripeSubscriptionId: invoice.subscriptionId,
      stripeInvoiceId: invoice.id,
      details: {
        reason: 'the provider charged a renewal with no local payment record',
        stripe_invoice_id: invoice.id,
        amount_cents: invoice.amountPaidCents,
        currency: invoice.currency,
        created_at: invoice.createdAt,
      },
    });
  }

  return drafts;
}

/**
 * Pass 3: the same member charged twice for the same thing, close together.
 *
 * The requirement names unexpected duplicates as a discrepancy the nightly job
 * records, and nothing looked. The reason it is worth a pass of its own is that
 * this platform's own guarantees are what hide it: each attempt mints its own
 * payment id and its own checkout session, so a member who pays twice produces
 * two rows that each match a provider settlement exactly. Both compare clean in
 * every other pass, and the member finds out before the organization does.
 *
 * Deliberately compared on the local rows rather than against the provider. A
 * settlement with no local row is already the reverse pass's finding, so every
 * duplicate that matters is a pair of rows here, and looking again at the
 * provider would only raise the same pair twice.
 *
 * This reports a question, not a fault. A second gift from a generous member
 * minutes after the first is perfectly legitimate, which is why the wording
 * asks rather than accuses, and why nothing is reversed automatically.
 */
function flagDuplicateCharges(local: LocalPaymentRow[]): IssueDraft[] {
  const drafts: IssueDraft[] = [];
  const settled = local
    .filter((p) => p.status === 'succeeded')
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  for (let i = 0; i < settled.length; i += 1) {
    const earlier = settled[i];
    for (let j = i + 1; j < settled.length; j += 1) {
      const later = settled[j];
      if (later.member_id !== earlier.member_id) continue;
      if (later.payment_type !== earlier.payment_type) continue;
      if (later.amount_cents !== earlier.amount_cents) continue;
      if (later.currency.toUpperCase() !== earlier.currency.toUpperCase()) continue;
      const apartMs = Date.parse(later.created_at) - Date.parse(earlier.created_at);
      if (Number.isNaN(apartMs) || apartMs > DUPLICATE_CHARGE_WINDOW_MINUTES * MINUTE_MS) continue;
      drafts.push({
        issueType: 'duplicate_provider_charge',
        // Keyed on the later payment, so one pair is one issue however many
        // times the pass runs, and resolving it frees exactly that slot.
        paymentId: later.id,
        stripePaymentIntentId: later.stripe_payment_intent_id,
        stripeSubscriptionId: null,
        stripeInvoiceId: null,
        details: {
          reason:
            'the same member was charged the same amount for the same thing twice in quick '
            + 'succession, which may be a genuine repeat or may be a double payment',
          member_id: later.member_id,
          payment_type: later.payment_type,
          amount_cents: later.amount_cents,
          currency: later.currency.toUpperCase(),
          first_payment_id: earlier.id,
          first_created_at: earlier.created_at,
          second_payment_id: later.id,
          second_created_at: later.created_at,
          minutes_apart: Math.round(apartMs / MINUTE_MS),
        },
      });
      // One partner per payment is enough to put the pair in front of someone.
      break;
    }
  }

  return drafts;
}

/** The digest cadence used when the administrator-configurable key is unset.
 *  Exported so the scheduled job reads the same figure this service does: two
 *  copies of a default drift the moment one of them is tuned, and the symptom
 *  would be a digest arriving on a cadence nobody chose. */
export const RECONCILIATION_DIGEST_INTERVAL_DEFAULT_DAYS = DIGEST_INTERVAL_DEFAULT_DAYS;

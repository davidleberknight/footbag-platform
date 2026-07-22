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
 *
 * Persistence:
 *   reconciliation_issues, work_queue_items, audit_entries.
 *
 * Side effects:
 *   - audit_entries append (issue raised, issue resolved)
 *   - work_queue_items insert in the `payments` category per raised issue;
 *     close of the discrepancy's queue twin on resolve
 *   - outbox_emails enqueue (the periodic digest, one per administrator)
 */
import { randomUUID } from 'node:crypto';
import {
  payments as paymentsDb,
  recurringDonationSubscriptions as subsDb,
  reconciliationIssues as issuesDb,
  account,
  workQueue,
  mailingListSubscriptions,
  queryAdminPayments,
  countAdminPayments,
  findAdminPaymentById,
  queryReconciliationIssues,
  countReconciliationIssues,
  transaction,
  type AdminPaymentFilters,
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
  | 'invoice_charge_missing_locally';

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
  stripe_subscription_id: string;
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

    const drafts: IssueDraft[] = [
      ...comparePayments(localPayments, providerIntents, graceCutoff),
      ...compareSubscriptions(localSubscriptions, providerSubscriptions),
      ...compareInvoices(localPayments, providerInvoices, localSubscriptions, graceCutoff),
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
   * Emails each administrator a rollup of the outstanding discrepancies, on the
   * cadence set by `reconciliation_summary_interval_days`. Best-effort per
   * administrator so one bad address never aborts the batch, and silent when
   * there is nothing outstanding: an empty digest trains people to ignore it.
   */
  sendReconciliationDigest(): { admins: number; sent: number; outstanding: number } {
    const outstanding = issuesDb.listOutstanding.all() as Array<{
      id: string;
      issue_type: string;
      created_at: string;
    }>;
    if (outstanding.length === 0) return { admins: 0, sent: 0, outstanding: 0 };

    const admins = mailingListSubscriptions.listActiveSubscribersBySlug.all('admin-alerts') as Array<{
      member_id: string;
      login_email: string;
    }>;
    const DIGEST_MAX_LINES = 20;
    const listed = outstanding.slice(0, DIGEST_MAX_LINES);
    const lines = listed.map((i) => `${i.created_at.slice(0, 10)}  ${i.issue_type}  ${i.id}`);
    // A silent cap reads as "this is all of them". Say what was left out.
    if (outstanding.length > listed.length) {
      lines.push(
        `... and ${outstanding.length - listed.length} more, not listed here. See the full queue.`,
      );
    }
    const itemLines = lines.join('\n');
    const day = new Date().toISOString().slice(0, 10);

    let sent = 0;
    for (const admin of admins) {
      try {
        emailService.send({
          template: 'reconciliation_digest',
          params: {
            outstandingCount: outstanding.length,
            itemLines,
            reviewUrl: `${config.publicBaseUrl}/admin/payments/reconciliation`,
          },
          recipientEmail: admin.login_email,
          recipientMemberId: admin.member_id,
          idempotencyKey: `reconciliation-digest:${day}:${admin.member_id}`,
        });
        sent += 1;
      } catch (err) {
        logger.warn('reconciliation digest enqueue failed for one administrator', {
          err: err instanceof Error ? err.message : String(err),
          memberId: admin.member_id,
        });
      }
    }
    return { admins: admins.length, sent, outstanding: outstanding.length };
  },

  /** Clears resolved issues past their retention window. Outstanding issues are
   *  never purged, however old: they still need a decision. */
  purgeExpiredResolvedIssues(opts: { now?: Date } = {}): { deleted: number } {
    const now = opts.now ?? new Date();
    const res = issuesDb.deleteExpiredResolved.run(now.toISOString());
    return { deleted: res.changes };
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
    };
    const total = countAdminPayments(filters);
    const offset = (page - 1) * ADMIN_PAGE_SIZE;
    const rows = queryAdminPayments(filters, ADMIN_PAGE_SIZE, offset);
    const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

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
          detailHref: `/admin/payments/${String(r.id)}`,
        })),
        hasRows: rows.length > 0,
        resultSummary: summaryLine(total, offset, rows.length, 'payment'),
        prevPageHref: page > 1 ? paymentsHrefFor(q, page - 1) : null,
        nextPageHref: page < totalPages ? paymentsHrefFor(q, page + 1) : null,
        filters: {
          paymentType: q.paymentType ?? '',
          status: q.status ?? '',
          memberId: q.memberId ?? '',
          reference: q.reference ?? '',
          createdFrom: q.createdFrom ?? '',
          createdTo: q.createdTo ?? '',
        },
        typeOptions: [...PAYMENT_TYPE_OPTIONS],
        statusOptions: [...PAYMENT_STATUS_OPTIONS],
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
    return {
      seo: { title: 'Payment detail', noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_payment_detail', title: 'Payment detail' },
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
        backHref: '/admin/payments',
      },
    };
  },

  /** Admin Reconciliation Issues list. Defaults to Outstanding, because the
   *  point of the page is the work still waiting. */
  getAdminReconciliationPage(q: {
    status?: string;
    page?: number;
    resolvedFlag?: boolean;
    errorMessage?: string | null;
  }): PageViewModel<AdminReconciliationContent> {
    const requested = ISSUE_STATUS_OPTIONS.includes(q.status as never) ? q.status! : 'outstanding';
    const dbStatus = requested === 'all' ? null : (requested as 'outstanding' | 'resolved');
    const page = normalizePage(q.page);
    const total = countReconciliationIssues(dbStatus);
    const offset = (page - 1) * ADMIN_PAGE_SIZE;
    const rows = queryReconciliationIssues(dbStatus, ADMIN_PAGE_SIZE, offset);
    const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

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
        })),
        hasRows: rows.length > 0,
        resultSummary: summaryLine(total, offset, rows.length, 'issue'),
        prevPageHref: page > 1 ? issuesHrefFor(requested, page - 1) : null,
        nextPageHref: page < totalPages ? issuesHrefFor(requested, page + 1) : null,
        statusFilter: requested,
        statusOptions: [...ISSUE_STATUS_OPTIONS],
        paymentsHref: '/admin/payments',
        resolvedFlag: q.resolvedFlag ?? false,
        errorMessage: q.errorMessage ?? null,
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
};

export interface AdminPaymentQuery {
  paymentType?: string;
  status?: string;
  memberId?: string;
  reference?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
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
  detailHref: string;
}

export interface AdminPaymentsContent {
  rows: AdminPaymentRowViewModel[];
  hasRows: boolean;
  resultSummary: string;
  prevPageHref: string | null;
  nextPageHref: string | null;
  filters: Required<Omit<AdminPaymentQuery, 'page'>>;
  typeOptions: string[];
  statusOptions: string[];
  reconciliationHref: string;
  clearHref: string;
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
}

function formatAmount(cents: number, currency: string): string {
  return `$${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function dateDisplay(iso: string): string {
  return iso.slice(0, 19).replace('T', ' ');
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
  return p;
}

function paymentsHrefFor(q: AdminPaymentQuery, page: number): string {
  const p = paymentFilterParams(q);
  if (page > 1) p.set('page', String(page));
  const qs = p.toString();
  return qs ? `/admin/payments?${qs}` : '/admin/payments';
}

function issuesHrefFor(status: string, page: number): string {
  const p = new URLSearchParams();
  if (status && status !== 'outstanding') p.set('status', status);
  if (page > 1) p.set('page', String(page));
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
  if (r.stripe_payment_intent_id) lines.push({ label: 'Payment intent', value: String(r.stripe_payment_intent_id) });
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
        reason: 'provider settled a payment with no local record',
        provider_status: intent.status,
        amount_cents: intent.amountCents,
        currency: intent.currency,
        created_at: intent.createdAt,
      },
    });
  }

  return drafts;
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
  localSubscriptions: LocalSubscriptionRow[],
  graceCutoff: string,
): IssueDraft[] {
  const drafts: IssueDraft[] = [];
  const recordedInvoiceIds = new Set(
    localPayments
      .map((p) => p.stripe_invoice_id)
      .filter((id): id is string => id !== null),
  );
  const knownSubscriptionIds = new Set(localSubscriptions.map((s) => s.stripe_subscription_id));

  for (const invoice of providerInvoices) {
    if (invoice.status !== 'paid') continue;
    if (recordedInvoiceIds.has(invoice.id)) continue;
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

export const RECONCILIATION_DIGEST_INTERVAL_DEFAULT_DAYS = DIGEST_INTERVAL_DEFAULT_DAYS;

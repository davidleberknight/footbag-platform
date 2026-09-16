/**
 * Admin outbound-email viewer service.
 *
 * Owns: the read-and-shape surface for the admin email-log page over
 * `outbox_emails`, including each row's template-body preview read from
 * `email_templates`, and one write: an administrator's review of a message the
 * sender gave up on. Does not own: enqueuing or sending email (that is
 * `emailService` / `communicationService`), or any other mutation of the outbox.
 *
 * Audience: admin only (Sensitivity 4). The page is read-only about content:
 * nothing here edits, resends or deletes a message, and the one write records a
 * human judgement against a row in a terminal failure state (`dead_letter`,
 * `manual_review`), which is the only thing on this surface an administrator can
 * act on. The review changes no delivery fact: the status stays, the health page
 * keeps counting the failure, and what ends is the urgent signal that otherwise
 * has no off switch short of retention deleting the row. Each message's
 * body is shown as its underlying template with the merge fields left clearly
 * unpopulated (the stamped variant key names the exact message sent), so the
 * log conveys what was sent without exposing the recipient's rendered
 * personal data. It never shows a recipient-rendered message body: a
 * delivered row's `body_text` is nulled on send, and the classification-gated
 * break-glass reveal a confidential rendered body would need is a separate
 * surface, not part of this viewer. The recipient email is admin-visible
 * operational data on this role-scoped surface.
 */
import {
  emailTemplates,
  outbox,
  queryOutboxLog,
  countOutboxLog,
  transaction,
  type EmailTemplateRow,
  type OutboxLogFilters,
  type OutboxLogQueryRow,
} from '../db/db';
import { emailTemplateClassification, listEmailTemplateKeys } from './emailService';
import { appendAuditEntry } from './auditService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { runSqliteRead } from './sqliteRetry';
import type { PageViewModel } from '../types/page';
import type { OutcomeTone } from '../lib/outcomeNotice';

const REVIEW_NOTE_MAX = 300;

export type MarkReviewedResult =
  | { status: 'reviewed' }
  | { status: 'already_reviewed' }
  // The message is not in a terminal failure state, so there is nothing here to
  // settle: the drain still owns it.
  | { status: 'not_reviewable' };

const PAGE_SIZE = 50;
const STATUS_OPTIONS = ['pending', 'sending', 'sent', 'failed', 'dead_letter', 'manual_review'] as const;

export interface EmailLogQuery {
  recipient?: string | null;
  templateKey?: string | null;
  status?: string | null;
  page?: number;
}

interface EmailLogEntryViewModel {
  id: string;
  createdAtDisplay: string;
  sentAtDisplay: string | null;
  recipientLabel: string;
  recipientHref: string | null;
  subject: string;
  templateKey: string;
  classificationLabel: string | null;
  statusLabel: string;
  // What the mail provider reported back about this message, once it had left.
  // Null where it reported nothing, which is every message that arrived and most
  // of those that did not. Delivery status above is what the platform observed
  // at the moment of sending, and says nothing about what happened afterwards.
  feedbackLabel: string | null;
  lastError: string | null;
  templateBodyPreview: string | null;
  // A message the drain has given up on, or cannot say was received, is the
  // only kind an administrator can act on here, and only once.
  isReviewable: boolean;
  isReviewed: boolean;
  reviewedLabel: string | null;
  reviewNote: string | null;
  reviewHref: string;
}

export interface EmailLogContent {
  entries: EmailLogEntryViewModel[];
  hasEntries: boolean;
  resultSummary: string;
  total: number;
  page: number;
  prevPageHref: string | null;
  nextPageHref: string | null;
  filters: {
    recipient: string;
    templateKey: string;
    status: string;
  };
  templateKeyOptions: string[];
  statusOptions: string[];
  reviewNoteMaxLength: number;
}

function normalize(q: EmailLogQuery): { filters: OutboxLogFilters; page: number } {
  const page = q.page && q.page > 0 ? Math.floor(q.page) : 1;
  return {
    page,
    filters: {
      recipient: q.recipient || null,
      templateKey: q.templateKey || null,
      status: q.status || null,
    },
  };
}

function filterParams(q: EmailLogQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.recipient) p.set('recipient', q.recipient);
  if (q.templateKey) p.set('template', q.templateKey);
  if (q.status) p.set('status', q.status);
  return p;
}

function hrefFor(q: EmailLogQuery, page: number): string {
  const p = filterParams(q);
  if (page > 1) p.set('page', String(page));
  const qs = p.toString();
  return qs ? `/admin/email-log?${qs}` : '/admin/email-log';
}

// Every stored timestamp is UTC, and this surface is read while reconstructing
// when something happened. Rendering the bare figure invites an admin to read it
// as their own clock and be wrong by their offset, so the zone is on the face of
// it.
function tsDisplay(iso: string | null): string | null {
  return iso ? `${iso.slice(0, 19).replace('T', ' ')} UTC` : null;
}

function recipientLabel(row: OutboxLogQueryRow): string {
  if (row.recipient_email) return row.recipient_email;
  if (row.mailing_list_id) return `(list: ${row.mailing_list_id})`;
  if (row.recipient_member_id) return row.recipient_member_id;
  return '(unknown)';
}

// The unpopulated template body for a stamped key: the stored body_template IS
// the template with its merge fields unfilled, so it previews the message with
// no personal data. Null (no disclosure rendered) for a null or unregistered
// key, e.g. a row stamped before its template was renamed.
function templateBodyPreview(templateKey: string | null): string | null {
  if (!templateKey) return null;
  const row = emailTemplates.getByKey.get(templateKey) as EmailTemplateRow | undefined;
  return row ? row.body_template : null;
}

/** The two terminal failure states: nothing in the platform moves them on. */
const REVIEWABLE_STATUSES = new Set(['dead_letter', 'manual_review']);

// Feedback reaches this row because the send kept the identifier the provider
// issued for it and the report carries the same one. The wording names the
// provider's verdict rather than the raw event name, because an admin reading
// this is answering "what happened to this message".
const FEEDBACK_VERDICTS: Record<string, string> = {
  bounce:    'Bounced',
  complaint: 'Marked as spam',
};

function feedbackLabel(row: OutboxLogQueryRow): string | null {
  if (!row.feedback_event_type) return null;
  const verdict = FEEDBACK_VERDICTS[row.feedback_event_type];
  if (!verdict) return null;
  const when = tsDisplay(row.feedback_created_at);
  return when ? `${verdict} ${when}` : verdict;
}

function shapeRow(row: OutboxLogQueryRow): EmailLogEntryViewModel {
  const isReviewed = row.reviewed_at !== null;
  return {
    id: row.id,
    createdAtDisplay: tsDisplay(row.created_at) ?? '',
    sentAtDisplay: tsDisplay(row.sent_at),
    recipientLabel: recipientLabel(row),
    recipientHref: row.recipient_slug ? `/members/${row.recipient_slug}` : null,
    subject: row.subject,
    templateKey: row.template_key ?? '(none)',
    classificationLabel: emailTemplateClassification(row.template_key),
    statusLabel: row.status.replace('_', ' '),
    feedbackLabel: feedbackLabel(row),
    lastError: row.last_error,
    templateBodyPreview: templateBodyPreview(row.template_key),
    isReviewable: REVIEWABLE_STATUSES.has(row.status) && !isReviewed,
    isReviewed,
    reviewedLabel: isReviewed
      ? `Reviewed ${tsDisplay(row.reviewed_at)}${row.reviewed_by_display_name ? ` by ${row.reviewed_by_display_name}` : ''}`
      : null,
    reviewNote: row.review_note,
    reviewHref: `/admin/email-log/${row.id}/review`,
  };
}

export const emailLogService = {
  /**
   * The log listing. `notice` is the outcome of whatever action redirected or
   * re-rendered here, carried on the page envelope with its tone so the one
   * message partial draws it; the caller decides the tone because only the
   * caller knows which of the review's endings it is reporting.
   */
  getEmailLogPage(
    q: EmailLogQuery,
    notice?: [OutcomeTone, string],
  ): PageViewModel<EmailLogContent> {
    const { filters, page } = normalize(q);
    const total = countOutboxLog(filters);
    const offset = (page - 1) * PAGE_SIZE;
    const rows = queryOutboxLog(filters, PAGE_SIZE, offset);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const firstShown = total === 0 ? 0 : offset + 1;
    const lastShown = offset + rows.length;
    const resultSummary = total === 0
      ? 'No matching emails.'
      : `Showing ${firstShown} to ${lastShown} of ${total} email${total === 1 ? '' : 's'}.`;

    return {
      seo: { title: 'Email Log', noindex: true },
      page: {
        sectionKey: 'admin', pageKey: 'admin_email_log', title: 'Email Log',
        ...(notice ? { notice: notice[1], noticeTone: notice[0] } : {}),
      },
      content: {
        entries: rows.map(shapeRow),
        hasEntries: rows.length > 0,
        resultSummary,
        total,
        page,
        prevPageHref: page > 1 ? hrefFor(q, page - 1) : null,
        nextPageHref: page < totalPages ? hrefFor(q, page + 1) : null,
        filters: {
          recipient: q.recipient ?? '',
          templateKey: q.templateKey ?? '',
          status: q.status ?? '',
        },
        templateKeyOptions: listEmailTemplateKeys(),
        statusOptions: [...STATUS_OPTIONS],
        reviewNoteMaxLength: REVIEW_NOTE_MAX,
      },
    };
  },

  /**
   * Record that an administrator has looked at a message the platform gave up
   * on and judged it settled. It asserts nothing about delivery: the row keeps
   * its status, so the log still says what happened, and the health page keeps
   * counting it. What it ends is the urgent signal, which otherwise has no off
   * switch short of the row ageing out of retention.
   *
   * Deliberately no resend. The stored row is a rendered message, and the mail
   * most likely to reach this state carries a verification or reset link that
   * has since expired, so replaying it would deliver something worse than
   * silence. Where the member still needs the content, the route is the live
   * action that issues a fresh one.
   */
  markReviewed(input: { outboxId: string; adminMemberId: string; note: unknown }): MarkReviewedResult {
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (note.length === 0) {
      throw new ValidationError('A note is required.', { note: 'A note is required.' });
    }
    if (note.length > REVIEW_NOTE_MAX) {
      throw new ValidationError(`Keep the note under ${REVIEW_NOTE_MAX} characters.`, {
        note: `Keep the note under ${REVIEW_NOTE_MAX} characters.`,
      });
    }

    const row = runSqliteRead('emailLogService.findForReview', () =>
      outbox.findForReview.get(input.outboxId),
    ) as { id: string; status: string; template_key: string | null; recipient_member_id: string | null; reviewed_at: string | null } | undefined;
    if (!row) throw new NotFoundError(`Outbox message not found: ${input.outboxId}`);
    if (!REVIEWABLE_STATUSES.has(row.status)) return { status: 'not_reviewable' };

    const nowIso = new Date().toISOString();
    let reviewed = false;
    transaction(() => {
      const res = outbox.markReviewed.run(
        nowIso, input.adminMemberId, note, nowIso, input.adminMemberId, input.outboxId,
      );
      if (res.changes === 0) return;

      appendAuditEntry({
        actionType: 'email.dead_letter_reviewed',
        category:   'email',
        actorType:  'admin',
        actorMemberId: input.adminMemberId,
        entityType: 'outbox_email',
        entityId:   input.outboxId,
        reasonText: note,
        metadata:   {
          outboxStatus: row.status,
          templateKey:  row.template_key,
          // The recipient is referenced by member id where there is one, never
          // by address: this ledger is permanent and erasure cannot reach it.
          recipientMemberId: row.recipient_member_id,
        },
      });
      reviewed = true;
    });

    return reviewed ? { status: 'reviewed' } : { status: 'already_reviewed' };
  },
};

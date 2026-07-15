/**
 * Admin outbound-email viewer service.
 *
 * Owns: the read-and-shape surface for the admin email-log page over
 * `outbox_emails`, including each row's template-body preview read from
 * `email_templates`. Does not own: enqueuing or sending email (that is
 * `emailService` / `communicationService`), or any mutation of the outbox.
 *
 * Audience: admin only (Sensitivity 4). The page is read-only. Each message's
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
  queryOutboxLog,
  countOutboxLog,
  type EmailTemplateRow,
  type OutboxLogFilters,
  type OutboxLogQueryRow,
} from '../db/db';
import { emailTemplateClassification, listEmailTemplateKeys } from './emailService';
import type { PageViewModel } from '../types/page';

const PAGE_SIZE = 50;
const STATUS_OPTIONS = ['pending', 'sending', 'sent', 'failed', 'dead_letter'] as const;

export interface EmailLogQuery {
  recipient?: string | null;
  templateKey?: string | null;
  status?: string | null;
  page?: number;
}

interface EmailLogEntryViewModel {
  createdAtDisplay: string;
  sentAtDisplay: string | null;
  recipientLabel: string;
  recipientHref: string | null;
  subject: string;
  templateKey: string;
  classificationLabel: string | null;
  statusLabel: string;
  lastError: string | null;
  templateBodyPreview: string | null;
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

function tsDisplay(iso: string | null): string | null {
  return iso ? iso.slice(0, 19).replace('T', ' ') : null;
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

function shapeRow(row: OutboxLogQueryRow): EmailLogEntryViewModel {
  return {
    createdAtDisplay: tsDisplay(row.created_at) ?? '',
    sentAtDisplay: tsDisplay(row.sent_at),
    recipientLabel: recipientLabel(row),
    recipientHref: row.recipient_slug ? `/members/${row.recipient_slug}` : null,
    subject: row.subject,
    templateKey: row.template_key ?? '(none)',
    classificationLabel: emailTemplateClassification(row.template_key),
    statusLabel: row.status.replace('_', ' '),
    lastError: row.last_error,
    templateBodyPreview: templateBodyPreview(row.template_key),
  };
}

export const emailLogService = {
  getEmailLogPage(q: EmailLogQuery): PageViewModel<EmailLogContent> {
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
      page: { sectionKey: 'admin', pageKey: 'admin_email_log', title: 'Email Log' },
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
      },
    };
  },
};

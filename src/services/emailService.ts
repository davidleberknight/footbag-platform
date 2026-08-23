/**
 * Email service — the single path for sending any platform email.
 *
 * Owns: the render step over `email_templates` rows for the registry defined
 * in `emailTemplateRegistry.ts` (logical send key → typed param shaper;
 * variant template key → stored wording), and stamping the variant
 * `template_key` onto the outbox row. Does not own the outbox/SES transport
 * (`communicationService`) or template authoring (the sidecar seeder
 * pre-go-live; the admin template editor after).
 *
 * Render contract: the wording comes from the `email_templates` row for the
 * shaped variant key — a disabled row suppresses that email type (warn-logged,
 * nothing enqueued); a missing row for a registered key is a seed invariant
 * violation and throws; an unresolved `{token}` is warn-logged and left
 * literal rather than failing the send. The row's `pii_classification` is the
 * effective value (admin-editable override); the registry carries the
 * canonical default.
 *
 * Bodies are plain text: the SES transport sends them as a text part, so an
 * interpolated member-supplied value cannot inject mail headers, and a
 * newline in a value only adds body lines.
 *
 * Deliverability: a best-effort send whose target mailbox has a non-ok
 * email_status is suppressed at the outbox enqueue (the transport owns that
 * gate); `strict` sends bypass it, because they are member-initiated
 * security signals where non-delivery is its own risk.
 */
import {
  getCommunicationService,
  type EnqueueResult,
  type EnqueueOutcome,
  type MailingListEnqueueResult,
} from './communicationService';
import { account, emailTemplates, type EmailTemplateRow } from '../db/db';
import { logger } from '../config/logger';
import {
  shapeEmail,
  emailTemplateDefaultClassification,
  type EmailPiiClass,
  type EmailTemplateKey,
  type ShapedEmail,
  type TemplateParams,
} from './emailTemplateRegistry';

export { listEmailTemplateKeys } from './emailTemplateRegistry';
export type { EmailPiiClass, EmailTemplateKey, TemplateParams, TierKey } from './emailTemplateRegistry';

/**
 * Effective PII classification for a template_key: the email_templates row's
 * value when present (the admin-editable override), else the registry default;
 * null when the key is unregistered and has no row.
 */
export function emailTemplateClassification(key: string | null | undefined): EmailPiiClass | null {
  if (!key) return null;
  const row = emailTemplates.getByKey.get(key) as EmailTemplateRow | undefined;
  if (row) return row.pii_classification as EmailPiiClass;
  return emailTemplateDefaultClassification(key);
}

const MERGE_TOKEN_RE = /\{([a-z][a-zA-Z0-9]*)\}/g;

function substituteTokens(
  text: string,
  merge: Record<string, string>,
  variant: string,
  field: 'subject' | 'body',
): string {
  return text.replace(MERGE_TOKEN_RE, (match, token: string) => {
    const value = merge[token];
    if (value === undefined) {
      logger.warn('email template merge token unresolved; left literal', { variant, field, token });
      return match;
    }
    return value;
  });
}

type RenderOutcome =
  | { status: 'rendered'; subject: string; bodyText: string }
  | { status: 'suppressed' };

function renderVariant(shaped: ShapedEmail): RenderOutcome {
  const row = emailTemplates.getByKey.get(shaped.variant) as EmailTemplateRow | undefined;
  if (!row) {
    // Every registered variant is seeded from its committed sidecar; a
    // missing row means this database was built without the email-template
    // seed and cannot send mail correctly.
    throw new Error(
      `email_templates row missing for registered template '${shaped.variant}'; `
      + 'run scripts/seed_email_templates.py against this database',
    );
  }
  if (!row.is_enabled) {
    logger.warn('email suppressed: template disabled', { template: shaped.variant });
    return { status: 'suppressed' };
  }
  return {
    status: 'rendered',
    subject: substituteTokens(row.subject_template, shaped.merge, shaped.variant, 'subject'),
    bodyText: substituteTokens(row.body_template, shaped.merge, shaped.variant, 'body'),
  };
}

export type SendResult = EnqueueResult | { id: null; status: 'suppressed' };

/**
 * Narrows the enqueue outcome to the single-recipient answer callers of `send`
 * expect. One audience of one resolves to at most one row, so the counts say
 * which of the three states it reached.
 */
function singleResult(outcome: EnqueueOutcome): SendResult {
  if (outcome.duplicates > 0) return { id: outcome.ids[0], status: 'duplicate' };
  if (outcome.enqueued > 0) return { id: outcome.ids[0], status: 'enqueued' };
  return { id: null, status: 'suppressed' };
}

interface SendBase {
  recipientEmail: string;
  /** Required: erasure reaches an outbox row only through this column. */
  recipientMemberId: string;
  idempotencyKey?: string;
  /** Use the strict enqueue (surfaces transport failures as 503) for security-signal emails. */
  strict?: boolean;
  /** Tags the outbox row with the list a list-associated individual send belongs to. */
  mailingListId?: string;
}

export const emailService = {
  /** Render the named template from its email_templates row and enqueue it, stamping the variant template_key. */
  send<K extends EmailTemplateKey>(
    input: SendBase & { template: K; params: TemplateParams<K> },
  ): SendResult {
    const shaped = shapeEmail(input.template, input.params);
    const rendered = renderVariant(shaped);
    if (rendered.status === 'suppressed') return { id: null, status: 'suppressed' };
    const outcome = getCommunicationService().enqueue({
      audience: {
        kind: 'address',
        email: input.recipientEmail,
        memberId: input.recipientMemberId,
        listTag: input.mailingListId,
      },
      subject: rendered.subject,
      bodyText: rendered.bodyText,
      templateKey: shaped.variant,
      idempotencyKey: input.idempotencyKey,
      strict: input.strict,
    });
    return singleResult(outcome);
  },

  /**
   * Fire-and-forget member notification. Resolves the member's deliverable email
   * (or uses the one supplied), skips with a warning when there is none, and
   * sends best-effort so a delivery problem never unwinds the committed action
   * that triggered it.
   */
  sendToMember<K extends EmailTemplateKey>(input: {
    template: K;
    params: TemplateParams<K>;
    memberId: string;
    idempotencyKey: string;
  }): void {
    const row = account.findNotificationContactById.get(input.memberId) as
      | { login_email: string | null }
      | undefined;
    if (!row?.login_email) {
      logger.warn(`${input.template} skipped: no deliverable recipient`, {
        memberId: input.memberId,
      });
      return;
    }
    try {
      emailService.send({
        template: input.template,
        params: input.params,
        recipientEmail: row.login_email,
        recipientMemberId: input.memberId,
        idempotencyKey: input.idempotencyKey,
      });
    } catch (err) {
      logger.warn(`${input.template} email enqueue failed`, {
        err: err instanceof Error ? err.message : String(err),
        memberId: input.memberId,
      });
    }
  },

  /** Render the named template and fan it out to a mailing list, stamping the variant template_key. */
  sendToMailingList<K extends EmailTemplateKey>(
    input: { template: K; params: TemplateParams<K>; mailingListSlug: string; idempotencyKeyPrefix: string },
  ): MailingListEnqueueResult {
    const shaped = shapeEmail(input.template, input.params);
    const rendered = renderVariant(shaped);
    if (rendered.status === 'suppressed') return { enqueued: 0, duplicates: 0 };
    const outcome = getCommunicationService().enqueue({
      audience: { kind: 'list', slug: input.mailingListSlug },
      subject: rendered.subject,
      bodyText: rendered.bodyText,
      templateKey: shaped.variant,
      idempotencyKey: input.idempotencyKeyPrefix,
    });
    return { enqueued: outcome.enqueued, duplicates: outcome.duplicates };
  },

  /** Fan an admin notification out to every administrator via the admin-alerts list. */
  sendToAdmins<K extends EmailTemplateKey>(
    input: { template: K; params: TemplateParams<K>; idempotencyKeyPrefix: string },
  ): MailingListEnqueueResult {
    return emailService.sendToMailingList({
      template: input.template,
      params: input.params,
      mailingListSlug: 'admin-alerts',
      idempotencyKeyPrefix: input.idempotencyKeyPrefix,
    });
  },
};

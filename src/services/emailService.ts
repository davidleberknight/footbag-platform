/**
 * Email service — the single path for sending any platform email.
 *
 * Owns: the registry mapping each registered `template_key` to its PII
 * classification and its content source, the render step, and stamping the
 * `template_key` onto the `outbox_emails` row. Does not own the outbox/SES
 * transport (that is `communicationService`).
 *
 * Current: each template's subject and body come from a hard-coded generator in
 * `emailContent.ts`, an accepted deviation so the current email scenarios are
 * testable now.
 * Target: render subject and body from a curated `email_templates` row (seeded
 * from committed JSON sidecars pre-go-live, admin-edited post-go-live), the same
 * source-of-truth cutover pattern curated media uses.
 */
import * as emailContent from './emailContent';
import {
  getCommunicationService,
  type EnqueueResult,
  type MailingListEnqueueResult,
} from './communicationService';
import { account } from '../db/db';
import { logger } from '../config/logger';

export type EmailPiiClass = 'public' | 'internal' | 'confidential' | 'restricted';

type EmailBody = { subject: string; bodyText: string };
type Empty = Record<string, never>;

interface TemplateDef<P> {
  classification: EmailPiiClass;
  build: (params: P) => EmailBody;
}

function def<P>(classification: EmailPiiClass, build: (params: P) => EmailBody): TemplateDef<P> {
  return { classification, build };
}

// The registered template set. Current source of each subject/body is the
// hard-coded generator (deviation); the classification drives how much of a
// message the admin email viewer may reveal.
const TEMPLATES = {
  account_verify:                def('restricted',   emailContent.accountVerifyEmail),
  password_reset_request:        def('restricted',   emailContent.passwordResetRequestEmail),
  password_reset_confirm:        def('internal',     (_p: Empty) => emailContent.passwordResetConfirmEmail()),
  password_changed:              def('internal',     (_p: Empty) => emailContent.passwordChangedEmail()),
  legacy_claim_confirm:          def('restricted',   emailContent.legacyClaimConfirmEmail),
  mailbox_link_confirm:          def('restricted',   emailContent.mailboxLinkConfirmEmail),
  vouch_confirmation:            def('confidential', emailContent.vouchConfirmationEmail),
  honor_congratulation:          def('internal',     emailContent.honorCongratulationEmail),
  tier_change_notice:            def('confidential', emailContent.tierChangeNoticeEmail),
  admin_role_change:             def('internal',     emailContent.adminRoleChangeEmail),
  payment_receipt:               def('confidential', emailContent.paymentReceiptEmail),
  active_player_expiry_reminder: def('internal',     emailContent.activePlayerExpiryReminderEmail),
  club_membership_member:        def('confidential', emailContent.clubMembershipMemberEmail),
  club_membership_leader:        def('confidential', emailContent.clubMembershipLeaderEmail),
  club_volunteer_leadership:     def('confidential', emailContent.clubVolunteerLeadershipEmail),
  club_coleader_invite:          def('confidential', emailContent.clubCoLeaderInviteEmail),
  club_leaderless_contact:       def('confidential', emailContent.clubLeaderlessContactEmail),
  contact_request_resolution:    def('confidential', emailContent.contactRequestResolutionEmail),
  admin_queue_alert:             def('internal',     emailContent.adminQueueAlertEmail),
};

export type EmailTemplateKey = keyof typeof TEMPLATES;
export type TemplateParams<K extends EmailTemplateKey> = Parameters<(typeof TEMPLATES)[K]['build']>[0];

/** PII classification for a template_key, or null when the key is unregistered. */
export function emailTemplateClassification(key: string | null | undefined): EmailPiiClass | null {
  if (!key) return null;
  return key in TEMPLATES ? TEMPLATES[key as EmailTemplateKey].classification : null;
}

interface SendBase {
  recipientEmail: string;
  recipientMemberId?: string | null;
  idempotencyKey?: string;
  /** Use the strict enqueue (surfaces transport failures as 503) for security-signal emails. */
  strict?: boolean;
  /** Tags the outbox row with the list a list-associated individual send belongs to. */
  mailingListId?: string;
}

export const emailService = {
  /** Render the named template and enqueue it, stamping its template_key. */
  send<K extends EmailTemplateKey>(
    input: SendBase & { template: K; params: TemplateParams<K> },
  ): EnqueueResult {
    const tdef = TEMPLATES[input.template] as TemplateDef<TemplateParams<K>>;
    const content = tdef.build(input.params);
    const comms = getCommunicationService();
    const enqueueInput = {
      recipientEmail: input.recipientEmail,
      recipientMemberId: input.recipientMemberId ?? undefined,
      subject: content.subject,
      bodyText: content.bodyText,
      templateKey: input.template,
      idempotencyKey: input.idempotencyKey,
      mailingListId: input.mailingListId,
    };
    return input.strict ? comms.enqueueEmailOrFail(enqueueInput) : comms.enqueueEmail(enqueueInput);
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

  /** Render the named template and fan it out to a mailing list, stamping its template_key. */
  sendToMailingList<K extends EmailTemplateKey>(
    input: { template: K; params: TemplateParams<K>; mailingListSlug: string; idempotencyKeyPrefix: string },
  ): MailingListEnqueueResult {
    const tdef = TEMPLATES[input.template] as TemplateDef<TemplateParams<K>>;
    const content = tdef.build(input.params);
    return getCommunicationService().enqueueMailingListEmail({
      mailingListSlug: input.mailingListSlug,
      subject: content.subject,
      bodyText: content.bodyText,
      templateKey: input.template,
      idempotencyKeyPrefix: input.idempotencyKeyPrefix,
    });
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

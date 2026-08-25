/**
 * SesFeedbackService -- SES bounce/complaint feedback intake.
 *
 * Owns the processing of SNS-delivered SES feedback notifications: permanent
 * bounces mark the matching member's email_status 'bounced', complaints mark
 * it 'complained', the member's currently-subscribed mailing-list rows are
 * flipped to the matching 'bounced'/'complained' status, and every processed
 * notification appends an audit row.
 * Escalation-only writes: an admin-set 'suppressed' status is never
 * overwritten, and a complaint outranks a bounce. Subscription-confirmation
 * messages append a token-free audit row and surface the one-time SubscribeURL
 * on the operator log line for out-of-band confirmation; the URL is never
 * persisted in the audit trail (it is a bearer token, and the trail is
 * admin-exportable and exempt from erasure) and never auto-fetched
 * (auto-confirm would fetch an attacker-supplied URL). The log is not a void:
 * it ships to CloudWatch and is retained, so the distinction being drawn is
 * which surface holds the token, not whether it is written down at all.
 *
 * Idempotency: the inbound SNS MessageId is claimed in ses_events (INSERT OR
 * IGNORE) inside the same transaction as the status writes; a redelivery whose
 * id is already present short-circuits, so status flips and audit rows happen
 * exactly once. Parallel to the stripe_events webhook idempotency.
 *
 * Persistence: writes members.email_status and mailing_list_subscriptions
 * status; claims ses_events; appends audit_entries.
 *
 * Transport auth (the shared-secret query key plus SNS signature verification
 * on the webhook request) is the IPC controller's concern, not this service's.
 */
import { sesFeedback, mailingListSubscriptions, sesEvents, transaction } from '../db/db';
import { appendAuditEntry } from './auditService';
import { logger } from '../config/logger';
import { safeSubscribeUrlForLog } from '../lib/snsSignature';

export type SesFeedbackResult =
  | { status: 'processed'; kind: 'bounce' | 'complaint'; recipients: number; membersUpdated: number }
  | { status: 'duplicate'; kind: 'bounce' | 'complaint' | 'subscription_confirmation' }
  | { status: 'subscription_pending' }
  | {
    status: 'ignored';
    reason: 'transient_bounce' | 'not_spam_feedback' | 'unknown_type' | 'malformed';
  };

function maskEmail(email: string): string {
  return email.replace(/^(.).*(@.*)$/, '$1***$2');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function processSnsMessage(rawBody: string): SesFeedbackResult {
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { status: 'ignored', reason: 'malformed' };
  }

  if (envelope.Type === 'SubscriptionConfirmation') {
    // Claim the message id first, exactly as the notification path does. Without
    // it every repeat of one confirmation writes another row into an
    // append-only ledger that nothing can prune, which is a flooding primitive
    // for anyone able to reach this endpoint.
    const confirmationId = typeof envelope.MessageId === 'string' ? envelope.MessageId : null;
    const seenAt = new Date().toISOString();
    let outcome: SesFeedbackResult = { status: 'subscription_pending' };
    transaction(() => {
      if (confirmationId) {
        const claim = sesEvents.insertEventOrIgnore.run(
          confirmationId, seenAt, 'subscription_confirmation', seenAt, 0,
        );
        if (claim.changes === 0) {
          outcome = { status: 'duplicate', kind: 'subscription_confirmation' };
          return;
        }
      }
      appendAuditEntry({
        actionType:    'email.sns_subscription_pending',
        category:      'system',
        actorType:     'system',
        actorMemberId: null,
        entityType:    'system',
        entityId:      'ses_feedback',
        reasonText:    'SNS subscription confirmation received; operator confirms the subscription out-of-band.',
        metadata: {
          topic_arn:     typeof envelope.TopicArn === 'string' ? envelope.TopicArn : null,
        },
      });
      // The one-time SubscribeURL is a bearer confirmation token, so it stays out
      // of the admin-exportable, erasure-exempt audit trail and is surfaced on
      // this operator log line instead. It is also attacker-chosen on a forged
      // confirmation, so it is logged only when it is genuinely an SNS endpoint
      // and within a length bound; the token is single-use and expires, which is
      // what makes the log an acceptable home for it.
      logger.warn('ses_feedback.subscription_confirmation_pending', {
        topicArn:     envelope.TopicArn,
        subscribeUrl: safeSubscribeUrlForLog(envelope.SubscribeURL),
      });
    });
    return outcome;
  }

  if (envelope.Type !== 'Notification' || typeof envelope.Message !== 'string') {
    return { status: 'ignored', reason: 'unknown_type' };
  }

  // SNS assigns one MessageId per message and reuses it across delivery retries,
  // so it is the idempotency key for redelivered bounce/complaint notifications.
  const messageId = typeof envelope.MessageId === 'string' ? envelope.MessageId : null;

  let message: Record<string, unknown>;
  try {
    message = JSON.parse(envelope.Message) as Record<string, unknown>;
  } catch {
    return { status: 'ignored', reason: 'malformed' };
  }

  if (message.notificationType === 'Bounce') {
    const bounce = (message.bounce ?? {}) as Record<string, unknown>;
    if (bounce.bounceType !== 'Permanent') {
      // Transient bounces (mailbox full, greylisting) self-heal; recording a
      // permanent status for them would wrongly silence the member.
      return { status: 'ignored', reason: 'transient_bounce' };
    }
    const recipients = (Array.isArray(bounce.bouncedRecipients) ? bounce.bouncedRecipients : [])
      .map((r) => (r as Record<string, unknown>).emailAddress)
      .filter((v): v is string => typeof v === 'string');
    return applyStatus('bounce', recipients, messageId);
  }

  if (message.notificationType === 'Complaint') {
    const complaint = (message.complaint ?? {}) as Record<string, unknown>;
    // A complaint feedback type of 'not-spam' is the opposite report: the
    // recipient told their provider this mail was wrongly filtered. Treating it
    // like an abuse report would let a member's vote of confidence be the thing
    // that stops their mail, and terminally, since nothing downgrades a
    // complained mailbox. Every other type, and an absent one, is a complaint.
    if (complaint.complaintFeedbackType === 'not-spam') {
      return { status: 'ignored', reason: 'not_spam_feedback' };
    }
    const recipients = (Array.isArray(complaint.complainedRecipients) ? complaint.complainedRecipients : [])
      .map((r) => (r as Record<string, unknown>).emailAddress)
      .filter((v): v is string => typeof v === 'string');
    return applyStatus('complaint', recipients, messageId);
  }

  return { status: 'ignored', reason: 'unknown_type' };
}

function applyStatus(
  kind: 'bounce' | 'complaint',
  recipients: string[],
  messageId: string | null,
): SesFeedbackResult {
  const now = new Date().toISOString();
  let membersUpdated = 0;
  let duplicate = false;
  transaction(() => {
    // Claim the SNS MessageId first. A redelivery whose id is already recorded
    // returns changes=0; short-circuit so the status flips and audit rows are
    // written exactly once. A notification without a MessageId cannot be deduped
    // and is processed (dropping real feedback over a missing key is worse).
    if (messageId) {
      // The recipient count travels with the claim. One notification can name
      // several bounced or complained addresses, and the health view reports
      // recipients, not notifications, so counting rows would undercount.
      const claim = sesEvents.insertEventOrIgnore.run(
        messageId, now, kind, now, recipients.length,
      );
      if (claim.changes === 0) {
        duplicate = true;
        return;
      }
    }
    for (const email of recipients) {
      const normalized = normalizeEmail(email);
      const res = kind === 'bounce'
        ? sesFeedback.markBounced.run(now, normalized)
        : sesFeedback.markComplained.run(now, normalized);
      membersUpdated += res.changes;
      if (kind === 'bounce') {
        mailingListSubscriptions.markBouncedForEmail.run(now, now, 'SES hard bounce', normalized);
      } else {
        mailingListSubscriptions.markComplainedForEmail.run(now, now, 'SES complaint', normalized);
      }
      appendAuditEntry({
        actionType:    kind === 'bounce' ? 'email.bounce_recorded' : 'email.complaint_recorded',
        category:      'system',
        actorType:     'system',
        actorMemberId: null,
        entityType:    'system',
        entityId:      'ses_feedback',
        reasonText:    null,
        metadata: {
          masked_email:   maskEmail(normalized),
          member_matched: res.changes > 0,
        },
      });
    }
  });
  if (duplicate) {
    return { status: 'duplicate', kind };
  }
  return { status: 'processed', kind, recipients: recipients.length, membersUpdated };
}

export const sesFeedbackService = { processSnsMessage };

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
 * messages are recorded for the operator to confirm out-of-band (the
 * SubscribeURL is never auto-fetched: auto-confirm would fetch an
 * attacker-supplied URL).
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

export type SesFeedbackResult =
  | { status: 'processed'; kind: 'bounce' | 'complaint'; recipients: number; membersUpdated: number }
  | { status: 'duplicate'; kind: 'bounce' | 'complaint' }
  | { status: 'subscription_pending' }
  | { status: 'ignored'; reason: 'transient_bounce' | 'unknown_type' | 'malformed' };

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
    appendAuditEntry({
      actionType:    'email.sns_subscription_pending',
      category:      'system',
      actorType:     'system',
      actorMemberId: null,
      entityType:    'system',
      entityId:      'ses_feedback',
      reasonText:    'SNS subscription confirmation received; operator confirms via the SubscribeURL out-of-band.',
      metadata: {
        topic_arn:     typeof envelope.TopicArn === 'string' ? envelope.TopicArn : null,
        subscribe_url: typeof envelope.SubscribeURL === 'string' ? envelope.SubscribeURL : null,
      },
    });
    logger.warn('ses_feedback.subscription_confirmation_pending', {
      topicArn: envelope.TopicArn,
    });
    return { status: 'subscription_pending' };
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
      const claim = sesEvents.insertEventOrIgnore.run(messageId, now, kind, now);
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

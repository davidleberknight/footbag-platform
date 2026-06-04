/**
 * SesFeedbackService -- SES bounce/complaint feedback intake.
 *
 * Owns the processing of SNS-delivered SES feedback notifications: permanent
 * bounces mark the matching member's email_status 'bounced', complaints mark
 * it 'complained', and every processed notification appends an audit row.
 * Escalation-only writes: an admin-set 'suppressed' status is never
 * overwritten, and a complaint outranks a bounce. Subscription-confirmation
 * messages are recorded for the operator to confirm out-of-band (the
 * SubscribeURL is never auto-fetched: auto-confirm would fetch an
 * attacker-supplied URL).
 *
 * Transport auth (the shared-secret query key on the webhook URL) is the
 * IPC controller's concern, not this service's.
 */
import { sesFeedback, transaction } from '../db/db';
import { appendAuditEntry } from './auditService';
import { logger } from '../config/logger';

export type SesFeedbackResult =
  | { status: 'processed'; kind: 'bounce' | 'complaint'; recipients: number; membersUpdated: number }
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
    return applyStatus('bounce', recipients);
  }

  if (message.notificationType === 'Complaint') {
    const complaint = (message.complaint ?? {}) as Record<string, unknown>;
    const recipients = (Array.isArray(complaint.complainedRecipients) ? complaint.complainedRecipients : [])
      .map((r) => (r as Record<string, unknown>).emailAddress)
      .filter((v): v is string => typeof v === 'string');
    return applyStatus('complaint', recipients);
  }

  return { status: 'ignored', reason: 'unknown_type' };
}

function applyStatus(kind: 'bounce' | 'complaint', recipients: string[]): SesFeedbackResult {
  const now = new Date().toISOString();
  let membersUpdated = 0;
  transaction(() => {
    for (const email of recipients) {
      const normalized = normalizeEmail(email);
      const res = kind === 'bounce'
        ? sesFeedback.markBounced.run(now, normalized)
        : sesFeedback.markComplained.run(now, normalized);
      membersUpdated += res.changes;
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
  return { status: 'processed', kind, recipients: recipients.length, membersUpdated };
}

export const sesFeedbackService = { processSnsMessage };

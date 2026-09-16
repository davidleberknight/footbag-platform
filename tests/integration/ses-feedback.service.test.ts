/**
 * What the platform records when the mail provider reports a bounce or a
 * complaint: a permanent bounce marks the matching member's email_status
 * 'bounced' with an audit row; a complaint marks 'complained' and outranks a
 * bounce; transient bounces change nothing, and a 'not-spam' report is the
 * opposite signal and changes nothing either; an admin-set 'suppressed' status
 * is never overwritten; a subscription confirmation is recorded for out-of-band
 * operator action and never auto-fetched; a malformed payload is refused; and
 * the same notification arriving twice is processed exactly once.
 *
 * These drive the service with the envelope a notification carries. The
 * transport is a queue the worker polls: the read is authorized by the runtime
 * role and the publishing topic is checked before anything is dispatched here,
 * so authentication is covered where it lives rather than restated per case.
 * That the same notification can arrive twice is a property of the queue, which
 * is why the idempotency case matters here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMailingListSubscription, insertMember, insertOutboxEmail } from '../fixtures/factories';

const { dbPath } = setTestEnv('3083');

let db: BetterSqlite3.Database;
let feedback: typeof import('../../src/services/sesFeedbackService')['sesFeedbackService'];

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: 'sf-1', slug: 'sf_1', login_email: 'bouncer@example.com' });
  insertMember(db, { id: 'sf-2', slug: 'sf_2', login_email: 'complainer@example.com' });
  insertMember(db, { id: 'sf-3', slug: 'sf_3', login_email: 'suppressed@example.com' });
  db.prepare(`UPDATE members SET email_status = 'suppressed' WHERE id = 'sf-3'`).run();
  // The tracing cases need addresses no earlier case has already flipped, since
  // these statuses only ever escalate.
  insertMember(db, { id: 'sf-4', slug: 'sf_4', login_email: 'traced@example.com' });
  insertMember(db, { id: 'sf-5', slug: 'sf_5', login_email: 'untraceable@example.com' });
  insertMember(db, { id: 'sf-6', slug: 'sf_6', login_email: 'envelopeless@example.com' });
  ({ sesFeedbackService: feedback } = await import('../../src/services/sesFeedbackService'));
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function snsEnvelope(message: Record<string, unknown>, messageId?: string): string {
  const envelope: Record<string, unknown> = {
    Type: 'Notification',
    TopicArn: 'arn:aws:sns:us-east-1:000:t',
    Message: JSON.stringify(message),
  };
  if (messageId !== undefined) envelope.MessageId = messageId;
  return JSON.stringify(envelope);
}

/**
 * The mail envelope names the message the provider is reporting on. It is
 * omitted where a case is about the address alone, which is also what a payload
 * missing it must still be handled as.
 */
function mailEnvelope(mailMessageId?: string): Record<string, unknown> {
  return mailMessageId === undefined ? {} : { mail: { messageId: mailMessageId } };
}

function bounceBody(
  emails: string[],
  bounceType = 'Permanent',
  messageId?: string,
  mailMessageId?: string,
): string {
  return snsEnvelope({
    notificationType: 'Bounce',
    bounce: { bounceType, bouncedRecipients: emails.map((e) => ({ emailAddress: e })) },
    ...mailEnvelope(mailMessageId),
  }, messageId);
}

function complaintBody(emails: string[], messageId?: string, mailMessageId?: string): string {
  return snsEnvelope({
    notificationType: 'Complaint',
    complaint: { complainedRecipients: emails.map((e) => ({ emailAddress: e })) },
    ...mailEnvelope(mailMessageId),
  }, messageId);
}

/** A complaint carrying the feedback type the provider assigned it. */
function typedComplaintBody(
  emails: string[],
  feedbackType: string,
  messageId?: string,
): string {
  return snsEnvelope({
    notificationType: 'Complaint',
    complaint: {
      complainedRecipients: emails.map((e) => ({ emailAddress: e })),
      complaintFeedbackType: feedbackType,
    },
  }, messageId);
}

function bounceAuditsFor(maskedEmail: string): number {
  const rows = db.prepare(
    `SELECT metadata_json FROM audit_entries WHERE action_type = 'email.bounce_recorded'`,
  ).all() as Array<{ metadata_json: string }>;
  return rows.filter((r) => (JSON.parse(r.metadata_json) as { masked_email?: string }).masked_email === maskedEmail).length;
}

function statusOf(id: string): string {
  return (db.prepare('SELECT email_status FROM members WHERE id = ?').get(id) as { email_status: string }).email_status;
}

describe('bounce and complaint notifications', () => {
  it('a synthetic permanent bounce marks the member bounced with an audit row', async () => {
    feedback.processSnsMessage(bounceBody(['Bouncer@Example.com']));
    expect(statusOf('sf-1')).toBe('bounced');
    const audits = db.prepare(
      `SELECT metadata_json FROM audit_entries WHERE action_type = 'email.bounce_recorded'`,
    ).all() as Array<{ metadata_json: string }>;
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const meta = JSON.parse(audits[audits.length - 1].metadata_json) as Record<string, unknown>;
    expect(meta.masked_email).toBe('b***@example.com');
    expect(meta.member_matched).toBe(true);
    // Exactly one permanent bounce was sent for this address, so exactly one
    // bounce-recorded audit row should exist for it.
    expect(bounceAuditsFor('b***@example.com')).toBe(1);
  });

  it("a permanent bounce flips the member's subscribed mailing-list rows to bounced", async () => {
    insertMember(db, { id: 'sf-sub', slug: 'sf_sub', login_email: 'subscriber@example.com' });
    insertMailingListSubscription(db, {
      id: 'mls-sf-sub', list_slug: 'newsletter', member_id: 'sf-sub', status: 'subscribed',
    });

    feedback.processSnsMessage(bounceBody(['subscriber@example.com']));

    const sub = db.prepare(
      `SELECT status FROM mailing_list_subscriptions WHERE id = 'mls-sf-sub'`,
    ).get() as { status: string };
    expect(sub.status).toBe('bounced');
  });

  it('a transient bounce changes nothing', async () => {
    feedback.processSnsMessage(bounceBody(['complainer@example.com'], 'Transient'));
    expect(statusOf('sf-2')).toBe('ok');
  });

  it('a complaint marks complained and outranks a prior bounce; suppressed is never overwritten', async () => {
    feedback.processSnsMessage(complaintBody(['complainer@example.com']));
    expect(statusOf('sf-2')).toBe('complained');

    // Complaint outranks the bounce already recorded for sf-1.
    feedback.processSnsMessage(complaintBody(['bouncer@example.com']));
    expect(statusOf('sf-1')).toBe('complained');

    // Suppressed stays suppressed through both notification kinds.
    feedback.processSnsMessage(bounceBody(['suppressed@example.com']));
    feedback.processSnsMessage(complaintBody(['suppressed@example.com']));
    expect(statusOf('sf-3')).toBe('suppressed');
  });

  it("a complaint flips the member's subscribed mailing-list rows to complained", async () => {
    insertMember(db, { id: 'sf-csub', slug: 'sf_csub', login_email: 'csub@example.com' });
    insertMailingListSubscription(db, {
      id: 'mls-sf-csub', list_slug: 'newsletter', member_id: 'sf-csub', status: 'subscribed',
    });

    feedback.processSnsMessage(complaintBody(['csub@example.com']));

    const sub = db.prepare(
      `SELECT status, updated_by, version FROM mailing_list_subscriptions WHERE id = 'mls-sf-csub'`,
    ).get() as { status: string; updated_by: string; version: number };
    expect(sub.status).toBe('complained');
    // The feedback write must bump the schema-metadata columns, not leave them stale.
    expect(sub.updated_by).toBe('ses_feedback');
    expect(sub.version).toBe(2);
  });

  it('a later bounce never downgrades an already-complained member', async () => {
    // sf-1 was escalated to complained above. A subsequent permanent bounce
    // for the same address must not pull it back to bounced.
    expect(statusOf('sf-1')).toBe('complained');
    feedback.processSnsMessage(bounceBody(['bouncer@example.com']));
    expect(statusOf('sf-1')).toBe('complained');
  });

  it('a redelivered notification with the same SNS MessageId is processed exactly once', async () => {
    insertMember(db, { id: 'sf-dup', slug: 'sf_dup', login_email: 'dup@example.com' });
    const body = bounceBody(['dup@example.com'], 'Permanent', 'sns-msg-dup-1');

    const first = feedback.processSnsMessage(body);
    expect(statusOf('sf-dup')).toBe('bounced');
    expect(bounceAuditsFor('d***@example.com')).toBe(1);

    // Redelivery of the identical message: status already bounced, and the
    // dedupe must prevent a second audit row.
    const second = feedback.processSnsMessage(body);
    expect(statusOf('sf-dup')).toBe('bounced');
    expect(bounceAuditsFor('d***@example.com')).toBe(1);

    const events = db.prepare(`SELECT COUNT(*) AS n FROM ses_events WHERE message_id = 'sns-msg-dup-1'`)
      .get() as { n: number };
    expect(events.n).toBe(1);
  });

  it('a subscription confirmation is recorded for the operator, never auto-fetched', async () => {
    feedback.processSnsMessage(JSON.stringify({
        Type: 'SubscriptionConfirmation',
        TopicArn: 'arn:aws:sns:us-east-1:000:t',
        SubscribeURL: 'https://sns.us-east-1.amazonaws.com/confirm?token=abc',
      }));
    const audits = db.prepare(
      `SELECT metadata_json FROM audit_entries WHERE action_type = 'email.sns_subscription_pending'`,
    ).all() as Array<{ metadata_json: string }>;
    expect(audits).toHaveLength(1);
    const metadata = JSON.parse(audits[0].metadata_json);
    // The topic is recorded for the operator; the one-time SubscribeURL is a
    // bearer token and must never be persisted in the durable audit trail.
    expect(metadata.topic_arn).toBe('arn:aws:sns:us-east-1:000:t');
    expect(metadata.subscribe_url).toBeUndefined();
    expect(audits[0].metadata_json).not.toContain('sns.us-east-1.amazonaws.com');
  });

  it('a not-spam report leaves the mailbox deliverable', () => {
    // The recipient told their provider this mail was wrongly filtered, which
    // arrives on the same notification type as an abuse report. Acting on it
    // would let a member's vote of confidence be the thing that stops their
    // mail, and terminally: nothing downgrades a complained mailbox.
    insertMember(db, { id: 'sf-notspam', slug: 'sf_notspam', login_email: 'notspam@example.com' });
    feedback.processSnsMessage(
      typedComplaintBody(['notspam@example.com'], 'not-spam', 'sns-not-spam'),
    );
    expect(statusOf('sf-notspam')).toBe('ok');
  });

  it('an abuse report is still a complaint', () => {
    // The feedback type narrows what counts as a complaint; it must not become
    // a hole that lets a real abuse report through unrecorded.
    insertMember(db, { id: 'sf-abuse', slug: 'sf_abuse', login_email: 'abuse@example.com' });
    feedback.processSnsMessage(
      typedComplaintBody(['abuse@example.com'], 'abuse', 'sns-abuse'),
    );
    expect(statusOf('sf-abuse')).toBe('complained');
  });

  it('ignores a malformed payload rather than throwing on it', () => {
    // An unparseable body is reported, not raised: the feed loop deletes a
    // message the service returns on and leaves one it throws on for
    // redelivery, and redelivering a payload that will never parse would have
    // the queue hand back the same body until it aged out.
    const result = feedback.processSnsMessage('this is not json');
    expect(result).toEqual({ status: 'ignored', reason: 'malformed' });
  });
});

/**
 * Which send a piece of feedback belongs to. The sent message kept the
 * identifier the provider issued for it, and the report names the same one, so
 * the notification record can carry the message as well as the address. The
 * address half of the work never depends on that resolving: a mailbox that
 * refuses mail is a fact about the mailbox, not about the message.
 */
describe('tracing feedback to the send that caused it', () => {
  function eventRow(snsMessageId: string): {
    mail_message_id: string | null;
    outbox_email_id: string | null;
  } {
    return db.prepare(
      'SELECT mail_message_id, outbox_email_id FROM ses_events WHERE message_id = ?',
    ).get(snsMessageId) as { mail_message_id: string | null; outbox_email_id: string | null };
  }

  it('records the message a bounce is about, alongside the address', () => {
    const outboxId = insertOutboxEmail(db, {
      recipient_email: 'traced@example.com',
      status: 'sent',
      sent_at: '2026-04-17T00:00:00.000Z',
      provider_message_id: 'provider-msg-traced',
    });
    feedback.processSnsMessage(
      bounceBody(['traced@example.com'], 'Permanent', 'sns-traced', 'provider-msg-traced'),
    );
    expect(statusOf('sf-4')).toBe('bounced');
    expect(eventRow('sns-traced')).toEqual({
      mail_message_id: 'provider-msg-traced',
      outbox_email_id: outboxId,
    });
  });

  it('records a message it cannot resolve, and still acts on the address', () => {
    // Ordinary rather than exceptional: the per-recipient copy ages out of the
    // outbox long before the provider stops having an opinion about the address.
    feedback.processSnsMessage(
      bounceBody(['untraceable@example.com'], 'Permanent', 'sns-untraceable', 'provider-msg-gone'),
    );
    expect(statusOf('sf-5')).toBe('bounced');
    expect(eventRow('sns-untraceable')).toEqual({
      mail_message_id: 'provider-msg-gone',
      outbox_email_id: null,
    });
  });

  it('handles a notification carrying no mail envelope at all', () => {
    feedback.processSnsMessage(
      bounceBody(['envelopeless@example.com'], 'Permanent', 'sns-envelopeless'),
    );
    expect(statusOf('sf-6')).toBe('bounced');
    expect(eventRow('sns-envelopeless')).toEqual({
      mail_message_id: null,
      outbox_email_id: null,
    });
  });

  it('does not re-resolve a redelivered notification, which is claimed once', () => {
    insertOutboxEmail(db, {
      recipient_email: 'traced@example.com',
      status: 'sent',
      sent_at: '2026-04-17T00:00:00.000Z',
      provider_message_id: 'provider-msg-repeat',
    });
    const body = complaintBody(['traced@example.com'], 'sns-repeat', 'provider-msg-repeat');
    expect(feedback.processSnsMessage(body)).toMatchObject({ status: 'processed' });
    expect(feedback.processSnsMessage(body)).toEqual({ status: 'duplicate', kind: 'complaint' });
    const rows = db.prepare(
      'SELECT COUNT(*) AS n FROM ses_events WHERE message_id = ?',
    ).get('sns-repeat') as { n: number };
    expect(rows.n).toBe(1);
  });
});

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
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3083');

let db: BetterSqlite3.Database;
let feedback: typeof import('../../src/services/sesFeedbackService')['sesFeedbackService'];

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: 'sf-1', slug: 'sf_1', login_email: 'bouncer@example.com' });
  insertMember(db, { id: 'sf-2', slug: 'sf_2', login_email: 'complainer@example.com' });
  insertMember(db, { id: 'sf-3', slug: 'sf_3', login_email: 'suppressed@example.com' });
  db.prepare(`UPDATE members SET email_status = 'suppressed' WHERE id = 'sf-3'`).run();
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

function bounceBody(emails: string[], bounceType = 'Permanent', messageId?: string): string {
  return snsEnvelope({
    notificationType: 'Bounce',
    bounce: { bounceType, bouncedRecipients: emails.map((e) => ({ emailAddress: e })) },
  }, messageId);
}

function complaintBody(emails: string[], messageId?: string): string {
  return snsEnvelope({
    notificationType: 'Complaint',
    complaint: { complainedRecipients: emails.map((e) => ({ emailAddress: e })) },
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
    db.prepare(`
      INSERT INTO mailing_list_subscriptions (
        id, created_at, created_by, updated_at, updated_by, version,
        mailing_list_id, member_id, status, status_updated_at
      ) VALUES ('mls-sf-sub', '2026-01-01T00:00:00.000Z', 'system', '2026-01-01T00:00:00.000Z', 'system', 1,
                'newsletter', 'sf-sub', 'subscribed', '2026-01-01T00:00:00.000Z')
    `).run();

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
    db.prepare(`
      INSERT INTO mailing_list_subscriptions (
        id, created_at, created_by, updated_at, updated_by, version,
        mailing_list_id, member_id, status, status_updated_at
      ) VALUES ('mls-sf-csub', '2026-01-01T00:00:00.000Z', 'system', '2026-01-01T00:00:00.000Z', 'system', 1,
                'newsletter', 'sf-csub', 'subscribed', '2026-01-01T00:00:00.000Z')
    `).run();

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

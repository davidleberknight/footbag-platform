/**
 * SES feedback webhook contract: a permanent-bounce notification marks the
 * matching member's email_status 'bounced' with an audit row; a complaint
 * marks 'complained' and outranks a bounce; transient bounces change
 * nothing; an admin-set 'suppressed' status is never overwritten; a
 * subscription-confirmation message is recorded for out-of-band operator
 * confirmation and never auto-fetched; the shared-secret query key gates
 * every request; an unsigned/forged payload is rejected even when the URL
 * key is correct.
 *
 * Behavior tests install a permissive signature verifier (real SNS
 * signatures require AWS-signed payloads and a network cert fetch); the
 * forged-payload test runs the real verifier.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';
import {
  setSnsSignatureVerifierForTests,
  resetSnsSignatureVerifierForTests,
} from '../../src/lib/snsSignature';

const { dbPath } = setTestEnv('3083');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

// The webhook authenticates with its own dedicated key (the env.ts dev
// default when the env var is unset), never with INTERNAL_EVENT_SECRET.
const KEY = process.env.SES_FEEDBACK_WEBHOOK_KEY ?? 'dev-ses-feedback-key-not-for-prod';
const PATH_WITH_KEY = () => `/webhooks/ses-feedback?key=${encodeURIComponent(KEY)}`;

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: 'sf-1', slug: 'sf_1', login_email: 'bouncer@example.com' });
  insertMember(db, { id: 'sf-2', slug: 'sf_2', login_email: 'complainer@example.com' });
  insertMember(db, { id: 'sf-3', slug: 'sf_3', login_email: 'suppressed@example.com' });
  db.prepare(`UPDATE members SET email_status = 'suppressed' WHERE id = 'sf-3'`).run();
  setSnsSignatureVerifierForTests(async () => true);
  createApp = await importApp();
});

afterAll(() => {
  resetSnsSignatureVerifierForTests();
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

function bounceAuditsFor(maskedEmail: string): number {
  const rows = db.prepare(
    `SELECT metadata_json FROM audit_entries WHERE action_type = 'email.bounce_recorded'`,
  ).all() as Array<{ metadata_json: string }>;
  return rows.filter((r) => (JSON.parse(r.metadata_json) as { masked_email?: string }).masked_email === maskedEmail).length;
}

function statusOf(id: string): string {
  return (db.prepare('SELECT email_status FROM members WHERE id = ?').get(id) as { email_status: string }).email_status;
}

describe('SES feedback webhook', () => {
  it('rejects requests without the shared-secret key', async () => {
    const res = await request(createApp())
      .post('/webhooks/ses-feedback?key=wrong')
      .type('text/plain')
      .send(bounceBody(['bouncer@example.com']));
    expect(res.status).toBe(401);
    expect(statusOf('sf-1')).toBe('ok');
  });

  it('rejects the worker IPC secret: an access-log leak of this URL must not extend to the IPC endpoints, and vice versa', async () => {
    const ipcSecret = process.env.INTERNAL_EVENT_SECRET ?? '';
    expect(ipcSecret).not.toBe('');
    const res = await request(createApp())
      .post(`/webhooks/ses-feedback?key=${encodeURIComponent(ipcSecret)}`)
      .type('text/plain')
      .send(bounceBody(['bouncer@example.com']));
    expect(res.status).toBe(401);
    expect(statusOf('sf-1')).toBe('ok');
  });

  it('rejects an unsigned forged payload even with the correct URL key (the key lands in access logs; the SNS signature must gate processing)', async () => {
    resetSnsSignatureVerifierForTests();
    try {
      const res = await request(createApp())
        .post(PATH_WITH_KEY())
        .type('text/plain')
        .send(bounceBody(['bouncer@example.com']));
      expect(res.status).toBe(401);
      expect(statusOf('sf-1')).toBe('ok');
    } finally {
      setSnsSignatureVerifierForTests(async () => true);
    }
  });

  it('a synthetic permanent bounce marks the member bounced with an audit row', async () => {
    const res = await request(createApp())
      .post(PATH_WITH_KEY())
      .type('text/plain')
      .send(bounceBody(['Bouncer@Example.com']));
    expect(res.status).toBe(200);
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

    const res = await request(createApp())
      .post(PATH_WITH_KEY())
      .type('text/plain')
      .send(bounceBody(['subscriber@example.com']));
    expect(res.status).toBe(200);

    const sub = db.prepare(
      `SELECT status FROM mailing_list_subscriptions WHERE id = 'mls-sf-sub'`,
    ).get() as { status: string };
    expect(sub.status).toBe('bounced');
  });

  it('a transient bounce changes nothing', async () => {
    const res = await request(createApp())
      .post(PATH_WITH_KEY())
      .type('text/plain')
      .send(bounceBody(['complainer@example.com'], 'Transient'));
    expect(res.status).toBe(200);
    expect(statusOf('sf-2')).toBe('ok');
  });

  it('a complaint marks complained and outranks a prior bounce; suppressed is never overwritten', async () => {
    await request(createApp())
      .post(PATH_WITH_KEY())
      .type('text/plain')
      .send(complaintBody(['complainer@example.com']));
    expect(statusOf('sf-2')).toBe('complained');

    // Complaint outranks the bounce already recorded for sf-1.
    await request(createApp())
      .post(PATH_WITH_KEY())
      .type('text/plain')
      .send(complaintBody(['bouncer@example.com']));
    expect(statusOf('sf-1')).toBe('complained');

    // Suppressed stays suppressed through both notification kinds.
    await request(createApp())
      .post(PATH_WITH_KEY())
      .type('text/plain')
      .send(bounceBody(['suppressed@example.com']));
    await request(createApp())
      .post(PATH_WITH_KEY())
      .type('text/plain')
      .send(complaintBody(['suppressed@example.com']));
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

    await request(createApp())
      .post(PATH_WITH_KEY())
      .type('text/plain')
      .send(complaintBody(['csub@example.com']));

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
    await request(createApp())
      .post(PATH_WITH_KEY())
      .type('text/plain')
      .send(bounceBody(['bouncer@example.com']));
    expect(statusOf('sf-1')).toBe('complained');
  });

  it('a redelivered notification with the same SNS MessageId is processed exactly once', async () => {
    insertMember(db, { id: 'sf-dup', slug: 'sf_dup', login_email: 'dup@example.com' });
    const body = bounceBody(['dup@example.com'], 'Permanent', 'sns-msg-dup-1');

    const first = await request(createApp()).post(PATH_WITH_KEY()).type('text/plain').send(body);
    expect(first.status).toBe(200);
    expect(statusOf('sf-dup')).toBe('bounced');
    expect(bounceAuditsFor('d***@example.com')).toBe(1);

    // Redelivery of the identical message: status already bounced, and the
    // dedupe must prevent a second audit row.
    const second = await request(createApp()).post(PATH_WITH_KEY()).type('text/plain').send(body);
    expect(second.status).toBe(200);
    expect(statusOf('sf-dup')).toBe('bounced');
    expect(bounceAuditsFor('d***@example.com')).toBe(1);

    const events = db.prepare(`SELECT COUNT(*) AS n FROM ses_events WHERE message_id = 'sns-msg-dup-1'`)
      .get() as { n: number };
    expect(events.n).toBe(1);
  });

  it('a subscription confirmation is recorded for the operator, never auto-fetched', async () => {
    const res = await request(createApp())
      .post(PATH_WITH_KEY())
      .type('text/plain')
      .send(JSON.stringify({
        Type: 'SubscriptionConfirmation',
        TopicArn: 'arn:aws:sns:us-east-1:000:t',
        SubscribeURL: 'https://sns.us-east-1.amazonaws.com/confirm?token=abc',
      }));
    expect(res.status).toBe(200);
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

  it('malformed payloads are acknowledged without effect', async () => {
    const res = await request(createApp())
      .post(PATH_WITH_KEY())
      .type('text/plain')
      .send('this is not json');
    expect(res.status).toBe(200);
  });
});

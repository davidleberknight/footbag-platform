/**
 * SES feedback webhook contract: a permanent-bounce notification marks the
 * matching member's email_status 'bounced' with an audit row; a complaint
 * marks 'complained' and outranks a bounce; transient bounces change
 * nothing; an admin-set 'suppressed' status is never overwritten; a
 * subscription-confirmation message is recorded for out-of-band operator
 * confirmation and never auto-fetched; the shared-secret query key gates
 * every request.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

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
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function snsEnvelope(message: Record<string, unknown>): string {
  return JSON.stringify({ Type: 'Notification', TopicArn: 'arn:aws:sns:us-east-1:000:t', Message: JSON.stringify(message) });
}

function bounceBody(emails: string[], bounceType = 'Permanent'): string {
  return snsEnvelope({
    notificationType: 'Bounce',
    bounce: { bounceType, bouncedRecipients: emails.map((e) => ({ emailAddress: e })) },
  });
}

function complaintBody(emails: string[]): string {
  return snsEnvelope({
    notificationType: 'Complaint',
    complaint: { complainedRecipients: emails.map((e) => ({ emailAddress: e })) },
  });
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
    expect(JSON.parse(audits[0].metadata_json).subscribe_url).toContain('sns.us-east-1.amazonaws.com');
  });

  it('malformed payloads are acknowledged without effect', async () => {
    const res = await request(createApp())
      .post(PATH_WITH_KEY())
      .type('text/plain')
      .send('this is not json');
    expect(res.status).toBe(200);
  });
});

/**
 * Admin "contact members" action on a leaderless club: emails the club's
 * current members the volunteer-to-co-lead invitation and audit-logs the send.
 * It does not resolve the queue item (the club stays leaderless until a member
 * steps up).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertClub, insertMemberClubAffiliation, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3202');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const ADMIN_ID = 'ccm-admin';
const CLUB_ID = 'ccm-club';

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'ccm_admin', login_email: 'ccm-admin@example.com', is_admin: 1 });
  insertClub(db, { id: CLUB_ID, name: 'Leaderless Active Club' });
  // Two current members with contact emails; one without (skipped).
  for (const i of [1, 2]) {
    insertMember(db, { id: `ccm-mem-${i}`, slug: `ccm_mem_${i}`, login_email: `ccm-mem-${i}@example.com` });
    insertMemberClubAffiliation(db, `ccm-mem-${i}`, CLUB_ID);
  }
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

const adminCookie = () => `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;

describe('POST /admin/club-cleanup/:clubId/contact-members', () => {
  it('emails the club\'s current members and audit-logs the send; the club stays leaderless', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/${CLUB_ID}/contact-members`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({});
    expect(res.status).toBe(303);

    const emails = db.prepare(
      `SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_member_id IN ('ccm-mem-1','ccm-mem-2')`,
    ).get() as { n: number };
    expect(emails.n).toBe(2);

    const audit = db.prepare(
      `SELECT metadata_json FROM audit_entries WHERE action_type = 'admin.club_cleanup.contact_members' AND entity_id = ?`,
    ).get(CLUB_ID) as { metadata_json: string };
    expect(JSON.parse(audit.metadata_json).recipient_count).toBe(2);

    // No leadership row was written; the club is still leaderless.
    const leaders = db.prepare('SELECT COUNT(*) AS n FROM club_leaders WHERE club_id = ?').get(CLUB_ID) as { n: number };
    expect(leaders.n).toBe(0);
  });

  it('contacting the same leaderless club twice enqueues no duplicate emails (stable idempotency key)', async () => {
    const dupClubId = insertClub(db, { id: 'ccm-club-dup', name: 'Leaderless Dup Club' });
    for (const i of [1, 2]) {
      insertMember(db, { id: `ccm-dup-mem-${i}`, slug: `ccm_dup_mem_${i}`, login_email: `ccm-dup-mem-${i}@example.com` });
      insertMemberClubAffiliation(db, `ccm-dup-mem-${i}`, dupClubId);
    }

    for (let i = 0; i < 2; i++) {
      const res = await request(createApp())
        .post(`/admin/club-cleanup/${dupClubId}/contact-members`)
        .set('Cookie', adminCookie())
        .type('form')
        .send({});
      expect(res.status).toBe(303);
    }

    // The idempotency key is stable per club and member, so the second send
    // collapses onto the first outbox rows rather than enqueuing duplicates.
    const emails = db.prepare(
      `SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_member_id IN ('ccm-dup-mem-1','ccm-dup-mem-2')`,
    ).get() as { n: number };
    expect(emails.n).toBe(2);
  });

  // A send to a mailbox that has already bounced or complained is suppressed
  // before it leaves the platform. Counting it would put contacts in the audit
  // trail that never happened, and undeliverable mailboxes are routine.
  it('counts only members the invitation actually reached', async () => {
    const clubId = insertClub(db, { id: 'ccm-club-suppressed', name: 'Leaderless Suppressed Club' });
    insertMember(db, {
      id: 'ccm-ok-mem', slug: 'ccm_ok_mem', login_email: 'ccm-ok-mem@example.com',
    });
    insertMember(db, {
      id: 'ccm-bounced-mem', slug: 'ccm_bounced_mem', login_email: 'ccm-bounced-mem@example.com',
      email_status: 'bounced',
    });
    insertMemberClubAffiliation(db, 'ccm-ok-mem', clubId);
    insertMemberClubAffiliation(db, 'ccm-bounced-mem', clubId);

    const res = await request(createApp())
      .post(`/admin/club-cleanup/${clubId}/contact-members`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({});
    expect(res.status).toBe(303);

    // The reachable member is queued; the bounced mailbox is not.
    const queued = db.prepare(
      'SELECT recipient_member_id FROM outbox_emails WHERE recipient_member_id IN (?, ?)',
    ).all('ccm-ok-mem', 'ccm-bounced-mem') as Array<{ recipient_member_id: string }>;
    expect(queued.map((r) => r.recipient_member_id)).toEqual(['ccm-ok-mem']);

    const audit = db.prepare(
      `SELECT metadata_json FROM audit_entries
        WHERE action_type = 'admin.club_cleanup.contact_members' AND entity_id = ?`,
    ).get(clubId) as { metadata_json: string };
    expect(JSON.parse(audit.metadata_json).recipient_count).toBe(1);
  });

  // An unreachable member must cost that member only, never the rest of the
  // club behind them in the order.
  it('keeps contacting the rest of the club past an unreachable member', async () => {
    const clubId = insertClub(db, { id: 'ccm-club-partial', name: 'Leaderless Partial Club' });
    // Ordered by display name, so the failing member is reached first and the
    // other two only get their invitation if the loop carries on past it.
    insertMember(db, {
      id: 'ccm-fail-mem', slug: 'ccm_fail_mem', display_name: 'Aaron Fails',
      login_email: 'ccm-fail-mem@example.com', email_status: 'complained',
    });
    insertMember(db, {
      id: 'ccm-after-1', slug: 'ccm_after_1', display_name: 'Mia After',
      login_email: 'ccm-after-1@example.com',
    });
    insertMember(db, {
      id: 'ccm-after-2', slug: 'ccm_after_2', display_name: 'Zoe After',
      login_email: 'ccm-after-2@example.com',
    });
    for (const id of ['ccm-fail-mem', 'ccm-after-1', 'ccm-after-2']) {
      insertMemberClubAffiliation(db, id, clubId);
    }

    const res = await request(createApp())
      .post(`/admin/club-cleanup/${clubId}/contact-members`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({});
    expect(res.status).toBe(303);

    const queued = db.prepare(
      `SELECT recipient_member_id FROM outbox_emails
        WHERE recipient_member_id IN ('ccm-fail-mem','ccm-after-1','ccm-after-2')
        ORDER BY recipient_member_id`,
    ).all() as Array<{ recipient_member_id: string }>;
    expect(queued.map((r) => r.recipient_member_id)).toEqual(['ccm-after-1', 'ccm-after-2']);

    const audit = db.prepare(
      `SELECT metadata_json FROM audit_entries
        WHERE action_type = 'admin.club_cleanup.contact_members' AND entity_id = ?`,
    ).get(clubId) as { metadata_json: string };
    expect(JSON.parse(audit.metadata_json).recipient_count).toBe(2);
  });

  it('a non-admin cannot trigger the action', async () => {
    const memberId = insertMember(db, { id: 'ccm-nonadmin', slug: 'ccm_nonadmin' });
    const res = await request(createApp())
      .post(`/admin/club-cleanup/${CLUB_ID}/contact-members`)
      .set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId })}`)
      .type('form')
      .send({});
    expect([403, 404]).toContain(res.status);
  });
});

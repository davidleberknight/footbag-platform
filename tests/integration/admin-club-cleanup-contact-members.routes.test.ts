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

const adminCookie = () => `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;

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

  it('a non-admin cannot trigger the action', async () => {
    const memberId = insertMember(db, { id: 'ccm-nonadmin', slug: 'ccm_nonadmin' });
    const res = await request(createApp())
      .post(`/admin/club-cleanup/${CLUB_ID}/contact-members`)
      .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId })}`)
      .type('form')
      .send({});
    expect([403, 404]).toContain(res.status);
  });
});

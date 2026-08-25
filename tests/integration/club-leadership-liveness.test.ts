/**
 * Club leadership counts only leaders who can still act.
 *
 * A leadership row outlives the member's account by design, so historical
 * leadership stays attributable. That means every read asking "who leads this
 * club now" has to exclude a leader whose account is deleted or whose member has
 * died; otherwise a club with nobody able to act on it still reads as led, never
 * reaches the administrator's needs-leader list, and publishes a dead member's
 * address as its contact.
 *
 * Covers the needs-leader predicate for both states, the restore that takes a
 * club back off the list, and the public club page's leadership block.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertClub, insertClubLeader, createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3428');

const ADMIN_ID = 'cll_admin';
const LIVE_LEADER = 'cll_live_leader';
const DELETED_LEADER = 'cll_deleted_leader';
const DECEASED_LEADER = 'cll_deceased_leader';

const CLUB_LIVE = 'cll_club_live';
const CLUB_DELETED = 'cll_club_deleted';
const CLUB_DECEASED = 'cll_club_deceased';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

function db<T>(fn: (conn: BetterSqlite3.Database) => T): T {
  const conn = new BetterSqlite3(dbPath);
  try {
    return fn(conn);
  } finally {
    conn.close();
  }
}

async function needsLeaderPage(): Promise<string> {
  const res = await request(createApp())
    .get('/admin/clubs/leadership').set('Cookie', adminCookie());
  expect(res.status).toBe(200);
  return res.text;
}

beforeAll(async () => {
  const conn = createTestDb(dbPath);
  insertMember(conn, {
    id: ADMIN_ID, slug: 'cll_admin', display_name: 'Ada Admin', real_name: 'Ada Admin',
    login_email: 'cll-admin@example.com', is_admin: 1,
  });
  insertMember(conn, {
    id: LIVE_LEADER, slug: 'cll_liv_leader', display_name: 'Liv Leader', real_name: 'Liv Leader',
    login_email: 'cll-liv@example.com',
  });
  insertMember(conn, {
    id: DELETED_LEADER, slug: 'cll_del_leader', display_name: 'Del Leader', real_name: 'Del Leader',
    login_email: 'cll-del@example.com',
  });
  insertMember(conn, {
    id: DECEASED_LEADER, slug: 'cll_dee_leader', display_name: 'Dee Leader', real_name: 'Dee Leader',
    login_email: 'cll-dee@example.com',
  });

  insertClub(conn, { id: CLUB_LIVE, name: 'Live Led Club', status: 'active' });
  insertClub(conn, { id: CLUB_DELETED, name: 'Departed Leader Club', status: 'active' });
  // Publicly visible, because one assertion below reads this club's own public
  // page to prove a dead member is no longer named on it.
  insertClub(conn, {
    id: CLUB_DECEASED, name: 'Bereaved Club', status: 'active', publiclyVisible: true,
  });

  insertClubLeader(conn, { club_id: CLUB_LIVE, member_id: LIVE_LEADER });
  insertClubLeader(conn, { club_id: CLUB_DELETED, member_id: DELETED_LEADER });
  insertClubLeader(conn, { club_id: CLUB_DECEASED, member_id: DECEASED_LEADER });

  conn.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('a club whose only co-leader can no longer act', () => {
  it('stays off the list while its co-leader is live', async () => {
    expect(await needsLeaderPage()).not.toContain('Live Led Club');
  });

  it('reaches the list when its only co-leader deletes their account, and leaves again on restore', async () => {
    db((conn) => conn.prepare(
      `UPDATE members SET deleted_at = ?, deleted_by = ? WHERE id = ?`,
    ).run('2026-03-01T00:00:00.000Z', ADMIN_ID, DELETED_LEADER));
    expect(await needsLeaderPage()).toContain('Departed Leader Club');

    db((conn) => conn.prepare(
      `UPDATE members SET deleted_at = NULL, deleted_by = NULL WHERE id = ?`,
    ).run(DELETED_LEADER));
    expect(await needsLeaderPage()).not.toContain('Departed Leader Club');
  });

  it('reaches the list when its only co-leader has died, and stays there', async () => {
    db((conn) => conn.prepare(
      `UPDATE members SET is_deceased = 1, deceased_at = ? WHERE id = ?`,
    ).run('2026-03-01T00:00:00.000Z', DECEASED_LEADER));

    expect(await needsLeaderPage()).toContain('Bereaved Club');
    // There is no restore from this state, so a second read must not quietly
    // drop it again.
    expect(await needsLeaderPage()).toContain('Bereaved Club');
  });

  it('reaches the administrator cleanup queue too, not only the member-facing list', async () => {
    // The two predicates ask the same question from different surfaces. One
    // repointed and the other not would leave a club visible as leaderless to
    // members while never reaching the administrator who can act on it.
    const res = await request(createApp())
      .get('/admin/club-cleanup').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Bereaved Club');
  });

  it('keeps the leadership row, so the club history stays attributable', () => {
    const row = db((conn) => conn.prepare(
      `SELECT member_id FROM club_leaders WHERE club_id = ?`,
    ).get(CLUB_DECEASED)) as { member_id: string } | undefined;
    expect(row?.member_id).toBe(DECEASED_LEADER);
  });

  it('stops publishing the dead member as the club leadership contact', async () => {
    // A club's public address is its hashtag key, not its internal id, so the
    // key is read back from the row the factory created.
    const key = db((conn) => conn.prepare(
      `SELECT t.tag_normalized FROM clubs c JOIN tags t ON t.id = c.hashtag_tag_id WHERE c.id = ?`,
    ).get(CLUB_DECEASED)) as { tag_normalized: string } | undefined;
    const publicKey = key!.tag_normalized.replace(/^#/, '');

    const res = await request(createApp())
      .get(`/clubs/${publicKey}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Bereaved Club');
    expect(res.text).not.toContain('Dee Leader');
    expect(res.text).not.toContain('cll-dee@example.com');
  });
});

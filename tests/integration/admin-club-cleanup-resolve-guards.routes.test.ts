import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4039');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertClub,
  insertClubViabilitySignal,
  insertLegacyClubCandidate,
  createTestSessionJwt,
} from '../fixtures/factories';

const ADMIN_ID    = 'guard-admin-001';
const MEMBER_ID   = 'guard-member-001';
const LIVE_CLUB   = 'guard-club-live';
const ARCHIVED    = 'guard-club-archived';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

function openDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

function clubStatus(id: string): string | undefined {
  const db = openDb();
  const row = db.prepare('SELECT status FROM clubs WHERE id = ?').get(id) as
    | { status: string } | undefined;
  db.close();
  return row?.status;
}

function resolutionCount(clubId: string): number {
  const db = openDb();
  const row = db.prepare(
    'SELECT COUNT(*) AS n FROM club_cleanup_resolutions WHERE club_id = ?',
  ).get(clubId) as { n: number };
  db.close();
  return row.n;
}

function cleanupAuditCount(entityId: string): number {
  const db = openDb();
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM audit_entries
      WHERE entity_id = ? AND action_type LIKE 'admin.club_cleanup.%'`,
  ).get(entityId) as { n: number };
  db.close();
  return row.n;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, {
    id: ADMIN_ID, slug: 'guard_admin', display_name: 'Guard Admin',
    login_email: 'guard-admin@example.com', is_admin: 1,
  });
  insertMember(db, {
    id: MEMBER_ID, slug: 'guard_member', display_name: 'Guard Member',
    login_email: 'guard-member@example.com',
  });

  insertClub(db, { id: LIVE_CLUB, name: 'Live Club', status: 'active' });
  insertClub(db, { id: ARCHIVED, name: 'Archived Club', status: 'archived' });

  // Both clubs carry an import record and negative wizard answers, so each would
  // reach the crowdsource-viability group on its own evidence if its status let
  // it. That keeps the archived case about status alone.
  insertLegacyClubCandidate(db, { mapped_club_id: LIVE_CLUB, classification: 'pre_populate' });
  insertLegacyClubCandidate(db, { mapped_club_id: ARCHIVED, classification: 'pre_populate' });
  insertClubViabilitySignal(db, { member_id: MEMBER_ID, club_id: LIVE_CLUB, activity_signal: 'not_active' });
  insertClubViabilitySignal(db, { member_id: MEMBER_ID, club_id: ARCHIVED, activity_signal: 'not_active' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('POST /admin/club-cleanup/:clubId/resolve -- archived clubs are terminal', () => {
  it('demoting an archived club is refused and its status is unchanged', async () => {
    expect(clubStatus(ARCHIVED)).toBe('archived');

    const res = await request(createApp())
      .post(`/admin/club-cleanup/${ARCHIVED}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'demote_inactive', predicate: 'crowdsource_viability' });

    expect(res.status).toBe(422);
    expect(clubStatus(ARCHIVED)).toBe('archived');
  });

  it('no resolution or audit row is written for a refused archived club', async () => {
    const resolutionsBefore = resolutionCount(ARCHIVED);
    const auditBefore = cleanupAuditCount(ARCHIVED);

    await request(createApp())
      .post(`/admin/club-cleanup/${ARCHIVED}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'park', predicate: 'leaderless_active' });

    expect(resolutionCount(ARCHIVED)).toBe(resolutionsBefore);
    expect(cleanupAuditCount(ARCHIVED)).toBe(auditBefore);
  });

  it('every action is refused on an archived club, not only the status-changing ones', async () => {
    for (const action of ['demote_inactive', 'archive', 'dismiss', 'park']) {
      const res = await request(createApp())
        .post(`/admin/club-cleanup/${ARCHIVED}/resolve`)
        .set('Cookie', adminCookie())
        .send({ action, predicate: 'crowdsource_viability' });
      expect(res.status, `action ${action}`).toBe(422);
    }
    expect(clubStatus(ARCHIVED)).toBe('archived');
  });
});

describe('POST /admin/club-cleanup/:clubId/resolve -- predicate and club validation', () => {
  it('an unknown predicate is refused and writes no resolution', async () => {
    const before = resolutionCount(LIVE_CLUB);

    const res = await request(createApp())
      .post(`/admin/club-cleanup/${LIVE_CLUB}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'park', predicate: 'nonsense_predicate' });

    expect(res.status).toBe(422);
    expect(resolutionCount(LIVE_CLUB)).toBe(before);
  });

  it('a candidate-side predicate does not resolve a club item', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/${LIVE_CLUB}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'park', predicate: 'promotable_candidate' });

    expect(res.status).toBe(422);
  });

  it('a club id that names nothing is 404 and writes no resolution or audit row', async () => {
    const res = await request(createApp())
      .post('/admin/club-cleanup/no-such-club/resolve')
      .set('Cookie', adminCookie())
      .send({ action: 'park', predicate: 'crowdsource_viability' });

    expect(res.status).toBe(404);
    expect(resolutionCount('no-such-club')).toBe(0);
    expect(cleanupAuditCount('no-such-club')).toBe(0);
  });

  it('a valid park on a live club still succeeds', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/${LIVE_CLUB}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'park', predicate: 'crowdsource_viability', reasonText: 'waiting on a member' });

    expect(res.status).toBe(303);
    expect(resolutionCount(LIVE_CLUB)).toBe(1);
    expect(clubStatus(LIVE_CLUB)).toBe('active');
  });
});

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3974');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertClub,
  insertClubViabilitySignal,
  createTestSessionJwt,
} from '../fixtures/factories';

const ADMIN_ID  = 'cleanup-admin-001';
const MEMBER_ID = 'cleanup-member-001';
const CLUB_ID   = 'cleanup-club-001';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, { id: ADMIN_ID,  slug: 'cleanup_admin',  display_name: 'Cleanup Admin', login_email: 'cleanup-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'cleanup_member', display_name: 'Cleanup Member', login_email: 'cleanup-member@example.com' });
  insertClub(db, { id: CLUB_ID, name: 'Dirty Club' });

  insertClubViabilitySignal(db, { member_id: MEMBER_ID, club_id: CLUB_ID, activity_signal: 'not_active' });
  insertClubViabilitySignal(db, { member_id: ADMIN_ID, club_id: CLUB_ID, activity_signal: 'not_active' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /admin/club-cleanup', () => {
  it('unauthenticated -> 302', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/club-cleanup');
    expect(res.status).toBe(302);
  });

  it('non-admin -> 403', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/club-cleanup')
      .set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('admin -> 200 with cleanup queue', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Dirty Club');
    expect(res.text).toContain('Club Cleanup Queue');
  });
});

describe('POST /admin/club-cleanup/:clubId/resolve', () => {
  it('demote_inactive changes club status to inactive', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/admin/club-cleanup/${CLUB_ID}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'demote_inactive', predicate: 'crowdsource_viability', reasonText: 'Test demotion' });
    expect(res.status).toBe(303);

    const testDb = new BetterSqlite3(dbPath);
    try {
      const club = testDb.prepare('SELECT status FROM clubs WHERE id = ?').get(CLUB_ID) as Record<string, unknown>;
      expect(club.status).toBe('inactive');

      const audit = testDb.prepare("SELECT * FROM audit_entries WHERE entity_id = ? AND action_type = 'admin.club_cleanup.demote_inactive'").get(CLUB_ID) as Record<string, unknown>;
      expect(audit).toBeTruthy();
    } finally {
      testDb.close();
    }
  });

  it('invalid action -> 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/admin/club-cleanup/${CLUB_ID}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'invalid_action' });
    expect(res.status).toBe(422);
  });

  it('non-admin -> 403', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/admin/club-cleanup/${CLUB_ID}/resolve`)
      .set('Cookie', memberCookie())
      .send({ action: 'dismiss' });
    expect(res.status).toBe(403);
  });

  it('defer_30 records resolution with deferred_until', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/admin/club-cleanup/${CLUB_ID}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'defer_30', predicate: 'crowdsource_viability', reasonText: 'Check back later' });
    expect(res.status).toBe(303);

    const testDb = new BetterSqlite3(dbPath);
    try {
      const resolution = testDb.prepare(
        'SELECT * FROM club_cleanup_resolutions WHERE club_id = ? AND predicate_name = ?',
      ).get(CLUB_ID, 'crowdsource_viability') as Record<string, unknown>;
      expect(resolution.resolution).toBe('deferred');
      expect(resolution.deferred_until).toBeTruthy();
    } finally {
      testDb.close();
    }
  });
});

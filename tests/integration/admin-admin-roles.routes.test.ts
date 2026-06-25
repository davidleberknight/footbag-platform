/**
 * Admin grant/revoke of the platform administrator role: the steady-state
 * A_Manage_Admin_Role action. Covers the Tier 2/3 grant gate, the self-revoke
 * guard that keeps at least one admin, the admin-alerts subscribe-on-grant /
 * unsubscribe-on-revoke side effect (leaving other lists untouched), the
 * affected-member notification, the audit trail, and the admin-only route gate.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createMemberAtTier, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3142');

const TS = '2025-01-01T00:00:00.000Z';

const ADMIN_ID    = 'ar_admin_001';
const ADMIN_SLUG  = 'ar_admin_one';
const ADMIN2_ID   = 'ar_admin_002';
const ADMIN2_SLUG = 'ar_admin_two';
const T2_ID       = 'ar_t2_001';
const T2_SLUG     = 'ar_t2_one';
const T1_ID       = 'ar_t1_001';
const T1_SLUG     = 'ar_t1_one';
const MEMBER_ID   = 'ar_member_001';
const MEMBER_SLUG = 'ar_member_one';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID,  slug: ADMIN_SLUG,  display_name: 'Ada Admin',   real_name: 'Ada Admin',   login_email: 'ar-admin@example.com',  is_admin: 1 });
  insertMember(db, { id: ADMIN2_ID, slug: ADMIN2_SLUG, display_name: 'Ben Admin',   real_name: 'Ben Admin',   login_email: 'ar-admin2@example.com', is_admin: 1 });
  createMemberAtTier(db, { id: T2_ID, slug: T2_SLUG, tier: 'tier2', memberOverrides: { display_name: 'Tess Two', real_name: 'Tess Two', login_email: 'ar-t2@example.com' } });
  createMemberAtTier(db, { id: T1_ID, slug: T1_SLUG, tier: 'tier1', memberOverrides: { display_name: 'Una One',  real_name: 'Una One',  login_email: 'ar-t1@example.com' } });
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'Mo Member', real_name: 'Mo Member', login_email: 'ar-member@example.com' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Restore a known baseline before each test, since grant/revoke mutate is_admin
// and subscription rows. Ben (ADMIN2) starts as a subscribed admin so the revoke
// path has something to clear; Ben also holds a second list so the test can
// prove revoke leaves other subscriptions untouched.
beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare(`UPDATE members SET is_admin = 1 WHERE id IN (?, ?)`).run(ADMIN_ID, ADMIN2_ID);
  db.prepare(`UPDATE members SET is_admin = 0 WHERE id IN (?, ?, ?)`).run(T2_ID, T1_ID, MEMBER_ID);
  db.prepare(`DELETE FROM mailing_list_subscriptions`).run();
  db.prepare(`DELETE FROM outbox_emails`).run();
  // audit_entries is append-only (DELETE is trigger-blocked); each successful
  // grant/revoke targets a distinct member in a single run, so the per-entity
  // audit counts below stay exact without a reset.
  const subRow = (id: string, list: string, mid: string) =>
    db.prepare(`INSERT INTO mailing_list_subscriptions (id, created_at, created_by, updated_at, updated_by, version, mailing_list_id, member_id, status, status_updated_at) VALUES (?, ?, 'system', ?, 'system', 1, ?, ?, 'subscribed', ?)`)
      .run(id, TS, TS, list, mid, TS);
  subRow('mls_admin2_alerts', 'admin-alerts', ADMIN2_ID);
  subRow('mls_admin2_other', 'all-members', ADMIN2_ID);
  db.close();
});

function readMember(id: string): { is_admin: number } {
  const db = new BetterSqlite3(dbPath);
  const row = db.prepare(`SELECT is_admin FROM members WHERE id = ?`).get(id) as { is_admin: number };
  db.close();
  return row;
}
function readSubStatus(memberId: string, list: string): string | undefined {
  const db = new BetterSqlite3(dbPath);
  const row = db.prepare(`SELECT status FROM mailing_list_subscriptions WHERE member_id = ? AND mailing_list_id = ?`).get(memberId, list) as { status: string } | undefined;
  db.close();
  return row?.status;
}
function countAudit(actionType: string, entityId: string): number {
  const db = new BetterSqlite3(dbPath);
  const row = db.prepare(`SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = ? AND entity_id = ?`).get(actionType, entityId) as { c: number };
  db.close();
  return row.c;
}
function countOutboxFor(memberId: string): number {
  const db = new BetterSqlite3(dbPath);
  const row = db.prepare(`SELECT COUNT(*) AS c FROM outbox_emails WHERE recipient_member_id = ?`).get(memberId) as { c: number };
  db.close();
  return row.c;
}

describe('GET /admin/admin-roles', () => {
  it('unauthenticated → 302 to /login', async () => {
    const res = await request(createApp()).get('/admin/admin-roles');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('non-admin → 403', async () => {
    const res = await request(createApp()).get('/admin/admin-roles').set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('admin → 200 listing current admins and the grant form', async () => {
    const res = await request(createApp()).get('/admin/admin-roles').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Ada Admin');
    expect(res.text).toContain('Ben Admin');
    expect(res.text).toContain('Grant the admin role');
  });
});

describe('POST /admin/admin-roles/grant', () => {
  it('grants a Tier 2 member: 303, is_admin set, audited, subscribed, emailed', async () => {
    const res = await request(createApp())
      .post('/admin/admin-roles/grant')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: T2_SLUG, reason: 'Joining the admin team.' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/admin-roles');
    expect(readMember(T2_ID).is_admin).toBe(1);
    expect(countAudit('admin.role_granted', T2_ID)).toBe(1);
    expect(readSubStatus(T2_ID, 'admin-alerts')).toBe('subscribed');
    expect(countOutboxFor(T2_ID)).toBe(1);
  });

  it('rejects granting a member below Tier 2 → 422, no change', async () => {
    const res = await request(createApp())
      .post('/admin/admin-roles/grant')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: T1_SLUG, reason: 'Should fail.' });
    expect(res.status).toBe(422);
    expect(readMember(T1_ID).is_admin).toBe(0);
    expect(countAudit('admin.role_granted', T1_ID)).toBe(0);
  });

  it('rejects granting a member who is already an admin → 422', async () => {
    const res = await request(createApp())
      .post('/admin/admin-roles/grant')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: ADMIN2_SLUG, reason: 'Already admin.' });
    expect(res.status).toBe(422);
  });

  it('unknown member key → 422 (re-render the form with a fixable-input error)', async () => {
    const res = await request(createApp())
      .post('/admin/admin-roles/grant')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: 'no_such_member', reason: 'x' });
    expect(res.status).toBe(422);
  });

  it('missing reason → 422', async () => {
    const res = await request(createApp())
      .post('/admin/admin-roles/grant')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: T2_SLUG, reason: '   ' });
    expect(res.status).toBe(422);
    expect(readMember(T2_ID).is_admin).toBe(0);
  });

  it('non-admin actor → 403', async () => {
    const res = await request(createApp())
      .post('/admin/admin-roles/grant')
      .set('Cookie', memberCookie())
      .type('form')
      .send({ member_key: T2_SLUG, reason: 'x' });
    expect(res.status).toBe(403);
    expect(readMember(T2_ID).is_admin).toBe(0);
  });
});

describe('POST /admin/admin-roles/:memberId/revoke', () => {
  it('revokes an admin: 303, is_admin cleared, audited, admin-alerts unsubscribed, other lists intact, emailed', async () => {
    const res = await request(createApp())
      .post(`/admin/admin-roles/${ADMIN2_ID}/revoke`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'Stepping down.' });
    expect(res.status).toBe(303);
    expect(readMember(ADMIN2_ID).is_admin).toBe(0);
    expect(countAudit('admin.role_revoked', ADMIN2_ID)).toBe(1);
    expect(readSubStatus(ADMIN2_ID, 'admin-alerts')).toBe('unsubscribed');
    // Other subscriptions are untouched (US: revoke does not change other lists).
    expect(readSubStatus(ADMIN2_ID, 'all-members')).toBe('subscribed');
    expect(countOutboxFor(ADMIN2_ID)).toBe(1);
  });

  it('an admin cannot revoke their own role → 422, still admin', async () => {
    const res = await request(createApp())
      .post(`/admin/admin-roles/${ADMIN_ID}/revoke`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'Trying to self-revoke.' });
    expect(res.status).toBe(422);
    expect(readMember(ADMIN_ID).is_admin).toBe(1);
  });

  it('revoking a member who is not an admin → 422', async () => {
    const res = await request(createApp())
      .post(`/admin/admin-roles/${T2_ID}/revoke`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'Not an admin.' });
    expect(res.status).toBe(422);
  });

  it('unknown member id → 404', async () => {
    const res = await request(createApp())
      .post('/admin/admin-roles/no_such_member/revoke')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'x' });
    expect(res.status).toBe(404);
  });

  it('missing reason → 422', async () => {
    const res = await request(createApp())
      .post(`/admin/admin-roles/${ADMIN2_ID}/revoke`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: '' });
    expect(res.status).toBe(422);
    expect(readMember(ADMIN2_ID).is_admin).toBe(1);
  });

  it('non-admin actor → 403', async () => {
    const res = await request(createApp())
      .post(`/admin/admin-roles/${ADMIN2_ID}/revoke`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ reason: 'x' });
    expect(res.status).toBe(403);
    expect(readMember(ADMIN2_ID).is_admin).toBe(1);
  });
});

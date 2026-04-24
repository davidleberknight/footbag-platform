/**
 * Integration tests for audit_entries writes from the auth flows.
 *
 * Covers the four auth-event writers:
 *   - register success                    → auth.register
 *   - password change success             → auth.password_change
 *   - password reset completion           → auth.password_reset
 *   - login rate-limit threshold crossing → auth.login_rate_limited
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createHash } from 'crypto';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3091');

let createApp: Awaited<ReturnType<typeof importApp>>;

const OWN_ID        = 'audit-owner-001';
const OWN_SLUG      = 'audit_owner';
const OWN_EMAIL     = 'audit-owner@example.com';
const OLD_PASSWORD  = 'AuditOld!1';
const NEW_PASSWORD  = 'AuditNew!2';

function ownCookie(passwordVersion = 1): string {
  return `footbag_session=${createTestSessionJwt({ memberId: OWN_ID, passwordVersion })}`;
}

interface AuditRow {
  id: string;
  created_at: string;
  created_by: string;
  occurred_at: string;
  actor_type: string;
  actor_member_id: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string;
  category: string;
  reason_text: string | null;
  metadata_json: string;
}

function readAudits(filter: { action_type?: string; entity_id?: string } = {}): AuditRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const where: string[] = [];
  const params: string[] = [];
  if (filter.action_type) { where.push('action_type = ?'); params.push(filter.action_type); }
  if (filter.entity_id)   { where.push('entity_id = ?');   params.push(filter.entity_id); }
  const sql = 'SELECT * FROM audit_entries'
    + (where.length ? ` WHERE ${where.join(' AND ')}` : '')
    + ' ORDER BY created_at ASC';
  const rows = db.prepare(sql).all(...params) as AuditRow[];
  db.close();
  return rows;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const hash = await argon2.hash(OLD_PASSWORD);
  insertMember(db, {
    id: OWN_ID,
    slug: OWN_SLUG,
    login_email: OWN_EMAIL,
    display_name: 'Audit Owner',
    password_hash: hash,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(async () => {
  // audit_entries is immutable (DB triggers); do not clear it. Tests
  // assert by action_type + entity_id or by count-delta instead.
  const db = new BetterSqlite3(dbPath);
  const hash = await argon2.hash(OLD_PASSWORD);
  db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?').run(hash, OWN_ID);
  db.prepare('DELETE FROM outbox_emails').run();
  db.prepare('DELETE FROM account_tokens').run();
  db.close();
});

describe('audit_entries — register', () => {
  it('successful POST /register → auth.register row, actor_type=system, entity=new member', async () => {
    const app = createApp();
    const before = readAudits({ action_type: 'auth.register' }).length;
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        email: 'newcomer@example.com',
        password: 'NewUser!1',
        confirmPassword: 'NewUser!1',
        realName: 'Newcomer Jones',
        displayName: 'Newcomer Jones',
      });
    expect(res.status).toBe(302);

    const rows = readAudits({ action_type: 'auth.register' });
    expect(rows.length).toBe(before + 1);
    const r = rows[rows.length - 1];
    expect(r.category).toBe('auth');
    expect(r.actor_type).toBe('system');
    expect(r.actor_member_id).toBeNull();
    expect(r.entity_type).toBe('member');
    expect(r.entity_id).toMatch(/^member_/);
    expect(r.created_by).toBe('system');
    expect(r.reason_text).toBeNull();
    expect(JSON.parse(r.metadata_json)).toEqual({});

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const exists = db.prepare('SELECT 1 AS ok FROM members WHERE id = ?').get(r.entity_id) as { ok: number } | undefined;
    db.close();
    expect(exists?.ok).toBe(1);
  });

  it('silent-duplicate POST /register (already-registered email) → no new audit row', async () => {
    const app = createApp();
    const before = readAudits({ action_type: 'auth.register' }).length;
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        email: OWN_EMAIL,
        password: 'Something!1',
        confirmPassword: 'Something!1',
        realName: 'Someone Else',
        displayName: 'Someone Else',
      });
    expect(res.status).toBe(302);
    expect(readAudits({ action_type: 'auth.register' }).length).toBe(before);
  });
});

describe('audit_entries — password change', () => {
  it('successful POST /members/:slug/edit/password → auth.password_change, actor_type=member', async () => {
    const app = createApp();
    const before = readAudits({ action_type: 'auth.password_change' }).length;
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1))
      .type('form')
      .send({
        oldPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
    expect(res.status).toBe(200);

    const rows = readAudits({ action_type: 'auth.password_change' });
    expect(rows.length).toBe(before + 1);
    const r = rows[rows.length - 1];
    expect(r.category).toBe('auth');
    expect(r.actor_type).toBe('member');
    expect(r.actor_member_id).toBe(OWN_ID);
    expect(r.entity_type).toBe('member');
    expect(r.entity_id).toBe(OWN_ID);
    expect(r.reason_text).toBeNull();
    expect(JSON.parse(r.metadata_json)).toEqual({});
  });

  it('failed POST /members/:slug/edit/password (wrong old password) → no new audit row', async () => {
    const app = createApp();
    const before = readAudits({ action_type: 'auth.password_change' }).length;
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit/password`)
      .set('Cookie', ownCookie(1))
      .type('form')
      .send({
        oldPassword: 'wrong-old-password',
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD,
      });
    expect(res.status).toBe(422);
    expect(readAudits({ action_type: 'auth.password_change' }).length).toBe(before);
  });
});

describe('audit_entries — password reset', () => {
  it('successful POST /password/reset/:token → auth.password_reset, actor_type=system', async () => {
    const app = createApp();
    await request(app).post('/password/forgot').type('form').send({ email: OWN_EMAIL });

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      `SELECT body_text FROM outbox_emails WHERE recipient_email = ? ORDER BY created_at DESC LIMIT 1`,
    ).get(OWN_EMAIL) as { body_text: string };
    db.close();
    const token = row.body_text.match(/\/password\/reset\/([A-Za-z0-9_-]+)/)![1];

    const res = await request(app)
      .post(`/password/reset/${token}`)
      .type('form')
      .send({ newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    expect(res.status).toBe(302);

    const rows = readAudits({ action_type: 'auth.password_reset', entity_id: OWN_ID });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.category).toBe('auth');
    expect(r.actor_type).toBe('system');
    expect(r.actor_member_id).toBeNull();
    expect(r.entity_type).toBe('member');
    expect(r.entity_id).toBe(OWN_ID);
    expect(JSON.parse(r.metadata_json)).toEqual({});
  });
});

describe('audit_entries — login rate-limit', () => {
  it('login attempts that exceed the bucket → auth.login_rate_limited row with hashed email, no member actor', async () => {
    const app = createApp();
    const attackEmail = 'attacker@example.com';
    const expectedHash = createHash('sha256').update(attackEmail).digest('hex');

    // Default login_rate_limit_max_attempts is 10. Exhaust, then one more.
    for (let i = 0; i < 10; i++) {
      await request(app).post('/login').type('form').send({ email: attackEmail, password: 'wrong' });
    }
    expect(readAudits({ action_type: 'auth.login_rate_limited' })).toHaveLength(0);

    const blocked = await request(app).post('/login').type('form').send({ email: attackEmail, password: 'wrong' });
    expect(blocked.status).toBe(429);

    const rows = readAudits({ action_type: 'auth.login_rate_limited' });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const r = rows[0];
    expect(r.category).toBe('auth');
    expect(r.actor_type).toBe('system');
    expect(r.actor_member_id).toBeNull();
    expect(r.entity_type).toBe('login_attempt');
    expect(r.entity_id).toBe(expectedHash);
    expect(r.entity_id).toMatch(/^[0-9a-f]{64}$/);
    const meta = JSON.parse(r.metadata_json) as {
      retryAfterSeconds: number;
      windowMinutes: number;
      maxAttempts: number;
    };
    expect(meta.maxAttempts).toBe(10);
    expect(meta.windowMinutes).toBeGreaterThan(0);
    expect(meta.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('audit row never contains plaintext email or IP', async () => {
    const rows = readAudits();
    for (const r of rows) {
      expect(r.entity_id).not.toContain('@');
      expect(r.metadata_json).not.toContain('@');
      expect(r.metadata_json).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    }
  });
});

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
import request from '../fixtures/supertestWithOrigin';
import { hashTestPassword } from '../fixtures/hashTestPassword';
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
const LOCKED_ID      = 'audit-locked-001';
const LOCKED_EMAIL   = 'audit-locked@example.com';
const PROSPECT_EMAIL = 'audit-prospect@example.com';
const DELETED_EMAIL  = 'audit-deleted@example.com';

function ownCookie(passwordVersion = 1): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: OWN_ID, passwordVersion })}`;
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

function countNotices(): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(
    "SELECT COUNT(*) AS n FROM outbox_emails WHERE idempotency_key LIKE 'account_exists_notice:%'",
  ).get() as { n: number };
  db.close();
  return row.n;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const hash = await hashTestPassword(OLD_PASSWORD);
  insertMember(db, {
    id: OWN_ID,
    slug: OWN_SLUG,
    login_email: OWN_EMAIL,
    display_name: 'Audit Owner',
    password_hash: hash,
  });
  insertMember(db, { id: LOCKED_ID, slug: 'audit_locked', login_email: LOCKED_EMAIL, password_hash: hash });
  insertMember(db, {
    id: 'audit-prospect-001', slug: 'audit_prospect', login_email: PROSPECT_EMAIL,
    password_hash: hash, onboarding: 'none',
  });
  insertMember(db, {
    id: 'audit-deleted-001', slug: 'audit_deleted', login_email: DELETED_EMAIL,
    password_hash: hash, deleted_at: '2026-01-01T00:00:00.000Z',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(async () => {
  // audit_entries is immutable (DB triggers); do not clear it. Tests
  // assert by action_type + entity_id or by count-delta instead.
  const db = new BetterSqlite3(dbPath);
  const hash = await hashTestPassword(OLD_PASSWORD);
  db.prepare('UPDATE members SET password_hash=?, password_version=1 WHERE id=?').run(hash, OWN_ID);
  db.prepare('DELETE FROM outbox_emails').run();
  db.prepare('DELETE FROM account_tokens').run();
  db.close();
});

// A registrant is not a member, and the audit log holds rows about members only:
// registering, or trying to register an address already held, writes none.
describe('audit_entries — register', () => {
  it('successful POST /register creates the account and writes no audit row about it', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        email: 'newcomer@example.com',
        password: 'NewUser!1',
        confirmPassword: 'NewUser!1',
        givenNames: 'Newcomer', familyName: 'Jones',
        displayName: 'Newcomer Jones',
      });
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const created = db.prepare("SELECT id FROM members WHERE login_email = 'newcomer@example.com'")
      .get() as { id: string } | undefined;
    const rows = db.prepare('SELECT action_type FROM audit_entries WHERE entity_id = ? OR actor_member_id = ?')
      .all(created?.id, created?.id);
    db.close();
    expect(created).toBeDefined();
    expect(rows).toEqual([]);
  });

  it('duplicate-email POST /register → enumeration-safe 303, the notice queued for the holder, and no audit row', async () => {
    const app = createApp();
    const beforeAudit = readAudits({}).length;
    const beforeNotices = countNotices();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        email: OWN_EMAIL,
        password: 'Something!1',
        confirmPassword: 'Something!1',
        givenNames: 'Someone', familyName: 'Else',
        displayName: 'Someone Else',
      });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/check-email');
    expect(res.text).not.toContain('already exists');
    // The attempt changed nothing on the existing account; the outbox row is the
    // record that the holder was told.
    expect(countNotices()).toBe(beforeNotices + 1);
    expect(readAudits({}).length).toBe(beforeAudit);
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
    expect(res.status).toBe(303);

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
    // On a dev or staging host the forgot-sent page renders the reset link in
    // the simulated-email card, so read the token from the response HTML (the
    // enqueued outbox body is scrubbed once the card's drain sends it).
    const forgot = await request(app).post('/password/forgot').type('form').send({ email: OWN_EMAIL });
    const token = forgot.text.match(/\/password\/reset\/([A-Za-z0-9_-]+)/)![1];

    const res = await request(app)
      .post(`/password/reset/${token}`)
      .type('form')
      .send({ newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    expect(res.status).toBe(303);

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
  // Default login_rate_limit_max_attempts is 10: ten failures fill the
  // bucket and the eleventh is refused.
  async function exhaustLoginBucket(app: ReturnType<typeof createApp>, email: string) {
    for (let i = 0; i < 10; i++) {
      await request(app).post('/login').type('form').send({ email, password: 'wrong' });
    }
    return request(app).post('/login').type('form').send({ email, password: 'wrong' });
  }

  it("a lockout on a member's address → one auth.login_rate_limited row naming the member by id", async () => {
    const app = createApp();
    const before = readAudits({ action_type: 'auth.login_rate_limited' }).length;

    const blocked = await exhaustLoginBucket(app, LOCKED_EMAIL);
    expect(blocked.status).toBe(429);

    const rows = readAudits({ action_type: 'auth.login_rate_limited', entity_id: LOCKED_ID });
    expect(rows).toHaveLength(1);
    expect(readAudits({ action_type: 'auth.login_rate_limited' })).toHaveLength(before + 1);
    const r = rows[0];
    expect(r.category).toBe('auth');
    expect(r.actor_type).toBe('system');
    expect(r.actor_member_id).toBeNull();
    expect(r.entity_type).toBe('member');
    const meta = JSON.parse(r.metadata_json) as Record<string, unknown>;
    // No form of the address rides along in the metadata.
    expect(Object.keys(meta).sort()).toEqual(['bucket', 'maxAttempts', 'retryAfterSeconds', 'windowMinutes']);
    expect(meta.maxAttempts).toBe(10);
    // The per-address-and-IP bucket filled first; a row naming the other bucket
    // would send a reviewer looking for a distributed attack that never happened.
    expect(meta.bucket).toBe('email_ip');
  });

  it('a lockout on an address that belongs to no member is refused the same way and writes no row', async () => {
    const app = createApp();
    // An unknown address, a prospective member still onboarding, and a deleted
    // account: none is a member, so none is a person the ledger may hold.
    for (const email of ['nobody-here@example.com', PROSPECT_EMAIL, DELETED_EMAIL]) {
      const before = readAudits({ action_type: 'auth.login_rate_limited' }).length;
      const blocked = await exhaustLoginBucket(app, email);
      expect(blocked.status, email).toBe(429);
      expect(blocked.text, email).toContain('Too many failed login attempts');
      expect(readAudits({ action_type: 'auth.login_rate_limited' }).length, email).toBe(before);
    }
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

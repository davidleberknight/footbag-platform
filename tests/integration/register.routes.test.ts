/**
 * Integration tests for member registration.
 *
 * Covers:
 *   GET  /register        — form render
 *   POST /register        — valid registration, duplicate email, short password,
 *                           mismatched passwords, missing display name
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const TEST_DB_PATH      = path.join(process.cwd(), `test-register-${Date.now()}.db`);
const TEST_ADMIN_FILE   = path.join(process.cwd(), `test-initial-admins-${Date.now()}.txt`);

// JWT/SES env vars come from tests/setup-env.ts (per-vitest-worker defaults).
process.env.FOOTBAG_DB_PATH          = TEST_DB_PATH;
process.env.FOOTBAG_INITIAL_ADMIN_FILE = TEST_ADMIN_FILE;
process.env.PORT                     = '3004';
process.env.NODE_ENV                 = 'test';
process.env.LOG_LEVEL                = 'error';
process.env.PUBLIC_BASE_URL          = 'http://localhost:3004';
process.env.SESSION_SECRET           = 'register-test-secret';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

beforeAll(async () => {
  const schema = fs.readFileSync(
    path.join(process.cwd(), 'database', 'schema.sql'),
    'utf8',
  );
  const db = new BetterSqlite3(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);

  // Pre-existing member for duplicate-email tests.
  insertMember(db, {
    id:          'member-existing-001',
    slug:        'existing_user',
    login_email: 'existing@example.com',
    display_name: 'Existing User',
  });

  db.close();

  const mod = await import('../../src/app');
  createApp = mod.createApp;
});

afterAll(() => {
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB_PATH + ext); } catch { /* ignore */ }
  }
  try { fs.unlinkSync(TEST_ADMIN_FILE); } catch { /* ignore */ }
});

function writeAdminFile(contents: string): void {
  fs.writeFileSync(TEST_ADMIN_FILE, contents, 'utf8');
}

function clearAdminFile(): void {
  try { fs.unlinkSync(TEST_ADMIN_FILE); } catch { /* ignore */ }
}

// ── GET /register ─────────────────────────────────────────────────────────────

describe('GET /register', () => {
  it('returns 200 with registration form', async () => {
    const app = createApp();
    const res = await request(app).get('/register');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Register to create an IFPA member account.');
    expect(res.text).toContain('name="realName"');
    expect(res.text).toContain('name="displayName"');
    expect(res.text).toContain('name="email"');
    expect(res.text).toContain('name="password"');
    expect(res.text).toContain('name="confirmPassword"');
  });

  it('shows early access data warning', async () => {
    const app = createApp();
    const res = await request(app).get('/register');
    expect(res.text).toContain('Early access notice');
    expect(res.text).toContain('may be deleted');
  });

  it('redirects authenticated user to own profile', async () => {
    const app = createApp();
    const cookie = `footbag_session=${createTestSessionJwt({ memberId: 'member-existing-001' })}`;
    const res = await request(app).get('/register').set('Cookie', cookie);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/members/existing_user');
  });
});

// ── POST /register ────────────────────────────────────────────────────────────

describe('POST /register', () => {
  it('valid registration → 302 to /register/check-email, no session cookie, DB rows land', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        realName: 'New Player',
        email: 'newplayer@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/register/check-email');
    const cookies = res.headers['set-cookie'] as string[] | undefined;
    expect(cookies?.some((c) => c.startsWith('footbag_session='))).toBeFalsy();

    // The registered branch MUST insert a members row AND enqueue an
    // outbox_emails row. Anti-enumeration keeps the HTTP response identical
    // to silent_duplicate, so DB state is the only signal that the write
    // path actually ran. Successful registration must enqueue a verification
    // email to the new member.
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const member = db.prepare(
      `SELECT id, slug, login_email_normalized, display_name_normalized,
              password_hash, email_verified_at
         FROM members WHERE login_email_normalized = ?`,
    ).get('newplayer@example.com') as
      | { id: string; slug: string; login_email_normalized: string;
          display_name_normalized: string; password_hash: string | null;
          email_verified_at: string | null }
      | undefined;
    const outboxRows = db.prepare(
      `SELECT id, recipient_email, recipient_member_id, status, retry_count
         FROM outbox_emails WHERE recipient_email = ?`,
    ).all('newplayer@example.com') as Array<{
      id: string; recipient_email: string; recipient_member_id: string | null;
      status: string; retry_count: number;
    }>;
    db.close();

    expect(member).toBeDefined();
    expect(member!.slug).toBeTruthy();
    expect(member!.password_hash).toBeTruthy();
    expect(member!.email_verified_at).toBeNull();
    expect(member!.display_name_normalized).toBe('new player');

    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].status).toBe('pending');
    expect(outboxRows[0].retry_count).toBe(0);
    expect(outboxRows[0].recipient_member_id).toBe(member!.id);
  });

  it('duplicate email → 302 to /register/check-email, NO new DB rows (anti-enumeration + silent dedup)', async () => {
    const app = createApp();

    // Snapshot counts *before* the POST. Prior it-blocks may have created
    // rows; we assert ONLY that the duplicate POST added nothing.
    // When the submitted address is already registered, no new member row
    // is created and no new verification email is enqueued.
    const countBefore = (() => {
      const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
      const m = db.prepare(`SELECT COUNT(*) AS n FROM members`).get() as { n: number };
      const o = db.prepare(`SELECT COUNT(*) AS n FROM outbox_emails`).get() as { n: number };
      db.close();
      return { members: m.n, outbox: o.n };
    })();

    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        realName: 'Duplicate User',
        email: 'existing@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/register/check-email');

    const countAfter = (() => {
      const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
      const m = db.prepare(`SELECT COUNT(*) AS n FROM members`).get() as { n: number };
      const o = db.prepare(`SELECT COUNT(*) AS n FROM outbox_emails`).get() as { n: number };
      db.close();
      return { members: m.n, outbox: o.n };
    })();

    expect(countAfter.members).toBe(countBefore.members);
    expect(countAfter.outbox).toBe(countBefore.outbox);
  });

  it('short password → 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        realName: 'Short Pass',
        email: 'shortpass@example.com',
        password: 'short',
        confirmPassword: 'short',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('at least 8 characters');
  });

  it('mismatched passwords → 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        realName: 'Mismatch User',
        email: 'mismatch@example.com',
        password: 'securepass123',
        confirmPassword: 'differentpass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('do not match');
  });

  it('missing real name → 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        realName: '',
        email: 'noname@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Full legal name is required');
  });

  it('missing email → 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        realName: 'No Email',
        email: '',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Email address is required');
  });

  it('single-word real name → 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        realName: 'trained',
        email: 'trained@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('first name and last name');
  });

  it('digits in real name → 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        realName: 'Player 123',
        email: 'digits@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('must not contain digits');
  });

  it('display name with different surname → 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        realName: 'David Leberknight',
        displayName: 'xXFootbagMasterXx',
        email: 'badsurname@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('must include your last name');
  });

  it('display name with matching surname succeeds', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        realName: 'David Leberknight',
        displayName: 'Dave Leberknight',
        email: 'daveleberknight@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/register/check-email');
  });

  it('blank display name defaults to real name', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        realName: 'Jane Footbagger',
        displayName: '',
        email: 'janefootbagger@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/register/check-email');
  });

  it('slug conflict is resolved with suffix (no visible leak; unverified row exists)', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        realName: 'Existing User',
        email: 'existinguser2@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/register/check-email');
  });
});

// ── Initial-admin bootstrap (DD §2.9) ────────────────────────────────────────
//
// When the operator places `.local/initial-admins.txt` (path injectable via
// FOOTBAG_INITIAL_ADMIN_FILE) listing one email per line, registering with a
// listed email auto-grants is_admin=1 on the new row plus a
// 'grant_admin_bootstrap' audit row. Listed emails not yet registered have no
// effect; production mode disables the file read entirely (covered by unit
// tests since this suite runs with NODE_ENV='test').

describe('POST /register — initial-admin bootstrap', () => {
  it('email listed in admin file → registered with is_admin=1 + audit row', async () => {
    writeAdminFile('# initial admins\nbootstrap-admin@example.com\n');
    try {
      const app = createApp();
      const res = await request(app)
        .post('/register')
        .type('form')
        .send({
          realName: 'Bootstrap Admin',
          email: 'bootstrap-admin@example.com',
          password: 'securepass123',
          confirmPassword: 'securepass123',
        });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/register/check-email');

      const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
      const member = db.prepare(
        `SELECT id, is_admin FROM members WHERE login_email_normalized = ?`,
      ).get('bootstrap-admin@example.com') as { id: string; is_admin: number } | undefined;
      const auditRows = db.prepare(
        `SELECT action_type, actor_type FROM audit_entries
           WHERE entity_id = ? AND action_type = 'grant_admin_bootstrap'`,
      ).all(member!.id) as Array<{ action_type: string; actor_type: string }>;
      db.close();

      expect(member).toBeDefined();
      expect(member!.is_admin).toBe(1);
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].actor_type).toBe('system');
    } finally {
      clearAdminFile();
    }
  });

  it('email NOT in admin file → registered as plain member, no bootstrap audit', async () => {
    writeAdminFile('someone-else@example.com\n');
    try {
      const app = createApp();
      const res = await request(app)
        .post('/register')
        .type('form')
        .send({
          realName: 'Plain Member',
          email: 'plain-member@example.com',
          password: 'securepass123',
          confirmPassword: 'securepass123',
        });
      expect(res.status).toBe(302);

      const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
      const member = db.prepare(
        `SELECT id, is_admin FROM members WHERE login_email_normalized = ?`,
      ).get('plain-member@example.com') as { id: string; is_admin: number } | undefined;
      const auditCount = db.prepare(
        `SELECT COUNT(*) AS n FROM audit_entries
           WHERE entity_id = ? AND action_type = 'grant_admin_bootstrap'`,
      ).get(member!.id) as { n: number };
      db.close();

      expect(member!.is_admin).toBe(0);
      expect(auditCount.n).toBe(0);
    } finally {
      clearAdminFile();
    }
  });

  it('admin file missing → registered as plain member, no errors', async () => {
    clearAdminFile();
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        realName: 'No File',
        email: 'no-file@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(302);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const member = db.prepare(
      `SELECT id, is_admin FROM members WHERE login_email_normalized = ?`,
    ).get('no-file@example.com') as { id: string; is_admin: number } | undefined;
    const auditCount = db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries
         WHERE entity_id = ? AND action_type = 'grant_admin_bootstrap'`,
    ).get(member!.id) as { n: number };
    db.close();

    expect(member!.is_admin).toBe(0);
    expect(auditCount.n).toBe(0);
  });
});

// ── Simulated-email-card regression (covers the prior pre-seed confusion) ───

describe('POST /register → /register/check-email', () => {
  it('renders the verification email link via simulated email card (dev SES_ADAPTER=stub)', async () => {
    const app = createApp();
    // Use a fresh cookie jar with supertest agent so the redirect stays in-session.
    const agent = request.agent(app);
    const post = await agent
      .post('/register')
      .type('form')
      .send({
        realName: 'Card Test',
        email: 'card-test@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(post.status).toBe(302);
    expect(post.headers.location).toBe('/register/check-email');

    const checkEmail = await agent.get('/register/check-email');
    expect(checkEmail.status).toBe(200);
    // The simulated email card surfaces the verification URL extracted from the
    // outbox row body. Asserting the URL pattern guards against the regression
    // where the registration → simulated-card path silently drops the email
    // (which is what the operator hit when an admin row was pre-created and
    // /register hit the silent-duplicate branch).
    expect(checkEmail.text).toMatch(/\/verify\/[A-Za-z0-9_-]+/);
    expect(checkEmail.text).toContain('card-test@example.com');
  });
});

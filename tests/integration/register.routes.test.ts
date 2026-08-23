/**
 * Integration tests for member registration.
 *
 * Covers:
 *   GET  /register        — form render
 *   POST /register        — valid registration, duplicate email, short password,
 *                           mismatched passwords, missing display name
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { expectLoggedError } from '../setup-env';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { createTestDb } from '../fixtures/testDb';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const TEST_DB_PATH      = path.join(os.tmpdir(), `footbag-test-register-${Date.now()}.db`);
const TEST_ADMIN_FILE   = path.join(os.tmpdir(), `footbag-test-initial-admins-${Date.now()}.txt`);

// JWT/SES env vars come from tests/setup-env.ts (per-vitest-worker defaults).
process.env.FOOTBAG_DB_PATH          = TEST_DB_PATH;
process.env.FOOTBAG_INITIAL_ADMIN_FILE = TEST_ADMIN_FILE;
process.env.PORT                     = '3004';
process.env.NODE_ENV                 = 'test';
// applyDevStagingBootstrapAdmin gates on FOOTBAG_ENV; the bootstrap suite
// below exercises the dev/staging path, so the test process advertises
// development to enable the allowlist behavior.
process.env.FOOTBAG_ENV              = 'development';
process.env.LOG_LEVEL                = 'error';
process.env.PUBLIC_BASE_URL          = 'http://localhost:3004';
process.env.SESSION_SECRET           = 'register-test-secret';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

beforeAll(async () => {
  const db = createTestDb(TEST_DB_PATH);
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
    expect(res.text).toContain('name="givenNames"');
    expect(res.text).toContain('name="familyName"');
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
    const cookie = `__Host-footbag_session=${createTestSessionJwt({ memberId: 'member-existing-001' })}`;
    const res = await request(app).get('/register').set('Cookie', cookie);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/members/existing_user');
  });
});

// ── POST /register ────────────────────────────────────────────────────────────

describe('POST /register', () => {
  it('valid registration → 303 to /register/check-email, no session cookie, DB rows land', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'New', familyName: 'Player',
        email: 'newplayer@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/check-email');
    const cookies = res.headers['set-cookie'] as string[] | undefined;
    expect(cookies?.some((c) => c.startsWith('__Host-footbag_session='))).toBeFalsy();

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

  it('duplicate email → identical 303 response, no new member, out-of-band account-exists notice', async () => {
    const app = createApp();

    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Duplicate', familyName: 'User',
        email: 'existing@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    // Anti-enumeration: identical to a fresh registration, with no "already
    // exists" leak in the response.
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/check-email');
    expect(res.text).not.toContain('already exists');

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    // No second member row was created for the duplicate email.
    const memberCount = db.prepare(
      `SELECT COUNT(*) AS c FROM members WHERE login_email_normalized = ?`,
    ).get('existing@example.com') as { c: number };
    // The existing address received an out-of-band account-exists notice
    // (not a verification link).
    const notice = db.prepare(
      `SELECT recipient_member_id, template_key FROM outbox_emails
         WHERE recipient_email = ? AND template_key = 'account_exists_notice'`,
    ).all('existing@example.com') as Array<{ recipient_member_id: string | null; template_key: string }>;
    db.close();

    expect(memberCount.c).toBe(1);
    expect(notice).toHaveLength(1);
    expect(notice[0].recipient_member_id).toBe('member-existing-001');
  });

  it('short password → 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Short', familyName: 'Pass',
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
        givenNames: 'Mismatch', familyName: 'User',
        email: 'mismatch@example.com',
        password: 'securepass123',
        confirmPassword: 'differentpass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('do not match');
  });

  // One of the two name fields is required, never both.
  it('both name fields blank → 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: '',
        familyName: '',
        email: 'noname@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Enter your name');
  });

  it('missing email → 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'No', familyName: 'Email',
        email: '',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Email address is required');
  });

  // A legal name that is a single word is ordinary in much of the world. It is
  // recorded as the family name, which is the part every claim path matches on,
  // so such a member is anchored the same way as everyone else.
  it('a member with a single legal name registers with it as their family name', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: '',
        familyName: 'Suharto',
        email: 'suharto@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const row = db.prepare(
      'SELECT given_names, family_name, real_name FROM members WHERE login_email = ?',
    ).get('suharto@example.com') as
      { given_names: string | null; family_name: string | null; real_name: string };
    db.close();
    expect(row.given_names).toBeNull();
    expect(row.family_name).toBe('Suharto');
    expect(row.real_name).toBe('Suharto');
  });

  it('digits in real name → 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Player', familyName: '123',
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
        givenNames: 'David', familyName: 'Mockingbird',
        displayName: 'xXFootbagMasterXx',
        email: 'badsurname@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('must include your family name');
  });

  it('single-character display name → 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Bob', familyName: 'X',
        displayName: 'X',
        email: 'onechardisplay@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('at least 2 characters');
  });

  it('display name with matching surname succeeds', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'David', familyName: 'Mockingbird',
        displayName: 'Dave Mockingbird',
        email: 'davemockingbird@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/check-email');
  });

  it('blank display name defaults to real name', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Jane', familyName: 'Footbagger',
        displayName: '',
        email: 'janefootbagger@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/check-email');
  });

  // UTS #39 display-name safety: reject the homograph and invisible-character
  // spoofing vectors, normalize the stored name to NFC.
  it('mixed-script real name (Cyrillic homoglyph) → 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        // "Jane" with a Cyrillic 'а' (U+0430) hidden among the Latin letters.
        givenNames: 'Jаne', familyName: 'Smith',
        email: 'homoglyph@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('must not mix letters from different scripts');
  });

  it('real name with a bidi-control character → 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        // Right-to-left override (U+202E) appended to an otherwise valid name.
        givenNames: 'John', familyName: 'Smith‮',
        email: 'bidi@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('invisible or control characters');
  });

  it('real name with a zero-width space → 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'John​', familyName: 'Smith',
        email: 'zwsp@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('invisible or control characters');
  });

  it('display name with a Cyrillic homoglyph → 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'David', familyName: 'Mockingbird',
        // Latin display name with a Cyrillic 'о' (U+043E) in the surname.
        displayName: 'David Mоckingbird',
        email: 'displayhomoglyph@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('must not mix letters from different scripts');
  });

  // Reserved-name protection: a name may not claim a role or an official
  // position the registrant does not hold. Whole words only, so a real surname
  // that merely contains one still registers.
  it('real name claiming an official position → 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Footbag', familyName: 'Official',
        email: 'roleclaim@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('must not include a word reserved');
  });

  it('display name claiming a role → 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Bob', familyName: 'Smith',
        displayName: 'Admin Smith',
        email: 'displayroleclaim@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('must not include a word reserved');
  });

  it('display name spelling a role with digits → 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        // Digits are refused in a real name, so the substituted spelling can
        // only arrive through the display name.
        givenNames: 'Bob', familyName: 'Smith',
        displayName: 'Adm1n Smith',
        email: 'substitutedroleclaim@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('must not include a word reserved');
  });

  it('custom profile URL claiming an official position → 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Bob', familyName: 'Smith',
        slug: 'ifpa_official_smith',
        email: 'slugroleclaim@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('must not include a word reserved');
  });

  it('surname containing a reserved word as a substring registers', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Ana', familyName: 'Stafford',
        email: 'stafford@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/check-email');
  });

  it('accented single-script name registers and is stored NFC-normalized', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        // Decomposed input: "André Müller" as base letters + combining marks.
        givenNames: 'André', familyName: 'Müller',
        email: 'accented@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/check-email');

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const row = db.prepare(
      `SELECT real_name, display_name_normalized
         FROM members WHERE login_email_normalized = ?`,
    ).get('accented@example.com') as
      | { real_name: string; display_name_normalized: string }
      | undefined;
    db.close();
    // Stored in composed NFC form, not the decomposed input.
    expect(row?.real_name).toBe('André Müller');
    expect(row?.display_name_normalized).toBe('andré müller');
  });

  it('slug conflict is resolved with suffix (no visible leak; unverified row exists)', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Existing', familyName: 'User',
        email: 'existinguser2@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/check-email');
  });

  it('custom slug succeeds and is stored in the DB', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Slug', familyName: 'Tester',
        email: 'slugtester@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
        slug: 'slug_tester',
      });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/check-email');

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const member = db.prepare(
      `SELECT slug FROM members WHERE login_email_normalized = ?`,
    ).get('slugtester@example.com') as { slug: string } | undefined;
    db.close();
    expect(member).toBeDefined();
    expect(member!.slug).toBe('slug_tester');
  });

  it('blank slug falls back to auto-generation', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Auto', familyName: 'Slugger',
        email: 'autoslugger@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
        slug: '',
      });
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const member = db.prepare(
      `SELECT slug FROM members WHERE login_email_normalized = ?`,
    ).get('autoslugger@example.com') as { slug: string } | undefined;
    db.close();
    expect(member).toBeDefined();
    expect(member!.slug).toBe('auto_slugger');
  });

  it('slug with invalid format → 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Bad', familyName: 'Format',
        email: 'badformat@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
        slug: '_leading_underscore',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('lowercase letters, numbers, and underscores');
  });

  it('slug too short → 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Short', familyName: 'Slug',
        email: 'shortslug@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
        slug: 'x',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('at least 2 characters');
  });

  it('slug missing surname → 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'David', familyName: 'Mockingbird',
        email: 'nosurname@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
        slug: 'cool_handle',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('must contain your family name');
  });

  it('user-provided slug collision → 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Existing', familyName: 'User',
        email: 'slugcollision@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
        slug: 'existing_user',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('already taken');
  });

  it('slug is echoed back on validation error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: '',
        familyName: '',
        email: 'echo@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
        slug: 'my_slug',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('value="my_slug"');
  });
});

// ── Initial-admin bootstrap ───────────────────────────────────────────────────
//
// When the operator places `.local/initial-admins.txt` (path injectable via
// FOOTBAG_INITIAL_ADMIN_FILE) listing one email per line, registering with a
// listed email auto-grants is_admin=1 on the new row plus a
// 'admin.dev_register_allowlist_grant' audit row. Listed emails not yet
// registered have no effect; production mode disables the file read entirely
// (covered by unit tests since this suite runs with NODE_ENV='test').

describe('POST /register — initial-admin bootstrap', () => {
  it('email listed in admin file → registered with is_admin=1 + audit row', async () => {
    writeAdminFile('# initial admins\nbootstrap-admin@example.com\n');
    try {
      const app = createApp();
      const res = await request(app)
        .post('/register')
        .type('form')
        .send({
          // The allowlist file is what grants the role here; a name claiming it
          // is refused at validation and would never reach the grant.
          givenNames: 'Bootstrap', familyName: 'Bootlace',
          email: 'bootstrap-admin@example.com',
          password: 'securepass123',
          confirmPassword: 'securepass123',
        });
      expect(res.status).toBe(303);
      expect(res.headers.location).toBe('/register/check-email');

      const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
      const member = db.prepare(
        `SELECT id, is_admin FROM members WHERE login_email_normalized = ?`,
      ).get('bootstrap-admin@example.com') as { id: string; is_admin: number } | undefined;
      const auditRows = db.prepare(
        `SELECT action_type, actor_type FROM audit_entries
           WHERE entity_id = ? AND action_type = 'admin.dev_register_allowlist_grant'`,
      ).all(member!.id) as Array<{ action_type: string; actor_type: string }>;
      // P1.11 / M-4: unified bootstrap also writes the Tier 2 grant atomically.
      // Verify the ledger row carries the bootstrap reason_code so a future
      // refactor cannot silently regress to the pre-unification "admin without
      // Tier 2" state.
      const tierGrantRow = db.prepare(
        `SELECT new_tier_status, reason_code FROM member_tier_grants
           WHERE member_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
      ).get(member!.id) as
        | { new_tier_status: string; reason_code: string }
        | undefined;
      db.close();

      expect(member).toBeDefined();
      expect(member!.is_admin).toBe(1);
      // Two admin.dev_register_allowlist_grant audit rows: one for the is_admin
      // flag set and one for the atomic Tier 2 grant. Both are system-actor entries.
      expect(auditRows).toHaveLength(2);
      expect(auditRows[0].actor_type).toBe('system');
      expect(auditRows[1].actor_type).toBe('system');
      expect(tierGrantRow).toBeDefined();
      expect(tierGrantRow!.new_tier_status).toBe('tier2');
      expect(tierGrantRow!.reason_code).toBe('dev_admin_register_allowlist.admin_tier2');
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
          givenNames: 'Plain', familyName: 'Member',
          email: 'plain-member@example.com',
          password: 'securepass123',
          confirmPassword: 'securepass123',
        });
      expect(res.status).toBe(303);

      const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
      const member = db.prepare(
        `SELECT id, is_admin FROM members WHERE login_email_normalized = ?`,
      ).get('plain-member@example.com') as { id: string; is_admin: number } | undefined;
      const auditCount = db.prepare(
        `SELECT COUNT(*) AS n FROM audit_entries
           WHERE entity_id = ? AND action_type = 'admin.dev_register_allowlist_grant'`,
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
        givenNames: 'No', familyName: 'File',
        email: 'no-file@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const member = db.prepare(
      `SELECT id, is_admin FROM members WHERE login_email_normalized = ?`,
    ).get('no-file@example.com') as { id: string; is_admin: number } | undefined;
    const auditCount = db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries
         WHERE entity_id = ? AND action_type = 'admin.dev_register_allowlist_grant'`,
    ).get(member!.id) as { n: number };
    db.close();

    expect(member!.is_admin).toBe(0);
    expect(auditCount.n).toBe(0);
  });
});

// ── Verify-email enqueue failure ──────────────────────────────────────────────
//
// When `enqueueEmailOrFail` throws after the member row commits, the member
// row stays committed, an `auth.register_notification_failed` audit row is
// written, and the controller renders a 503. The legitimate registrant can
// self-recover via /verify/resend once the outbox is healthy again.

describe('POST /register — verify-email enqueue failure', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let commsMod: typeof import('../../src/services/communicationService');

  beforeAll(async () => {
    commsMod = await import('../../src/services/communicationService');
  });

  afterEach(() => {
    commsMod.resetCommunicationServiceForTests();
  });

  it('enqueueEmailOrFail throws → 503 + member row committed + audit row + no outbox row', async () => {
    expectLoggedError('audit: auth.register_notification_failed');
    const { ServiceUnavailableError } = await import('../../src/services/serviceErrors');
    commsMod.setCommunicationServiceForTests({
      enqueue: () => {
        throw new ServiceUnavailableError('synthetic enqueue failure for verify-email');
      },
      processSendQueue: async () => ({
        claimed: 0, sent: 0, failed: 0, deadLettered: 0, paused: false,
      }),
    });

    const targetEmail = 'enqueue-fail@example.com';
    const app = createApp();
    const res = await request(app)
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Enqueue', familyName: 'Fail',
        email: targetEmail,
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });

    expect(res.status).toBe(503);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const member = db.prepare(
      `SELECT id, slug, login_email_normalized, password_hash, email_verified_at
         FROM members WHERE login_email_normalized = ?`,
    ).get(targetEmail) as
      | { id: string; slug: string; login_email_normalized: string;
          password_hash: string | null; email_verified_at: string | null }
      | undefined;
    const auditRow = db.prepare(
      `SELECT action_type, category, actor_type, entity_id FROM audit_entries
         WHERE entity_id = ? AND action_type = 'auth.register_notification_failed'
         ORDER BY created_at DESC LIMIT 1`,
    ).get(member?.id ?? '') as
      | { action_type: string; category: string; actor_type: string; entity_id: string }
      | undefined;
    const registerAudit = db.prepare(
      `SELECT action_type FROM audit_entries
         WHERE entity_id = ? AND action_type = 'auth.register'
         ORDER BY created_at DESC LIMIT 1`,
    ).get(member?.id ?? '') as { action_type: string } | undefined;
    const outboxRows = db.prepare(
      `SELECT id FROM outbox_emails WHERE recipient_email = ?`,
    ).all(targetEmail) as Array<{ id: string }>;
    db.close();

    // Member row committed despite the enqueue failure (R4 pattern: the
    // mutation is committed before the strict enqueue helper runs).
    expect(member).toBeDefined();
    expect(member!.password_hash).toBeTruthy();
    expect(member!.email_verified_at).toBeNull();

    // High-priority audit row was written from the catch block.
    expect(auditRow).toBeDefined();
    expect(auditRow!.action_type).toBe('auth.register_notification_failed');
    expect(auditRow!.category).toBe('auth');
    expect(auditRow!.actor_type).toBe('system');
    expect(auditRow!.entity_id).toBe(member!.id);

    // The canonical auth.register row is written before the verify-email enqueue,
    // so the registration stays auditable even when the notification path fails.
    expect(registerAudit).toBeDefined();

    // The strict helper threw before any outbox row was committed.
    expect(outboxRows).toHaveLength(0);
  });
});

// ── Simulated-email-card regression (covers the prior pre-seed confusion) ───

describe('POST /register → /register/check-email', () => {
  it('renders the verification email link via simulated email card (dev SES_ADAPTER=stub)', async () => {
    const app = createApp();
    // Drain any pending outbox backlog accumulated by earlier tests: the
    // simulated-card page drains a bounded worker batch, so this registration's
    // own verification email must not sit behind more pending rows than one
    // drain clears. Clearing the queue keeps this card render deterministic
    // regardless of how many prior registrations left mail queued.
    const reset = new BetterSqlite3(TEST_DB_PATH);
    reset.prepare(`DELETE FROM outbox_emails WHERE status = 'pending'`).run();
    reset.close();
    // Use a fresh cookie jar with supertest agent so the redirect stays in-session.
    const agent = request.agent(app);
    const post = await agent
      .post('/register')
      .type('form')
      .send({
        givenNames: 'Card', familyName: 'Test',
        email: 'card-test@example.com',
        password: 'securepass123',
        confirmPassword: 'securepass123',
      });
    expect(post.status).toBe(303);
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

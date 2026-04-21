/**
 * Adversarial tests: SQL injection attempts against free-text inputs.
 *
 * Per `.claude/rules/testing.md` §Adversarial testing: "SQL-injection
 * attempts in every free-text input."
 *
 * This suite asserts the long-term contract that free-text user input is
 * parameterized at the db layer, never concatenated into SQL. Positive proof:
 *
 *   - no endpoint responds 500 for a payload containing DROP / UNION / --
 *   - the `members` table remains queryable after every payload (row count
 *     unchanged; schema intact)
 *   - the payload is stored verbatim (escaped, not executed) when the flow
 *     accepts it
 *
 * Not attempted here: exhaustive fuzzing, error-based injection that depends
 * on SQLite-specific error shapes, or blind boolean/time-based injection.
 * The goal is a representative assault across every free-text surface, not a
 * full fuzzing harness.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import argon2 from 'argon2';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3080');

let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID       = 'sqli-member-001';
const MEMBER_SLUG     = 'sqli_member';
const MEMBER_EMAIL    = 'sqli@example.com';
const MEMBER_PASSWORD = 'OrigPass!1';

// Payloads chosen to exercise classical SQL injection shapes:
//   - statement termination + follow-up DDL
//   - boolean bypass
//   - UNION-based extraction
//   - comment-based trailing truncation
//   - stacked backslash escape
const SQL_PAYLOADS = [
  "'; DROP TABLE members; --",
  "' OR 1=1 --",
  "' UNION SELECT id, login_email, password_hash FROM members --",
  "admin' --",
  "\\'); DROP TABLE members; --",
  "Robert'); DROP TABLE members; --",
];

function countMembers(): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT COUNT(*) AS n FROM members').get() as { n: number };
  db.close();
  return row.n;
}

function ownCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: MEMBER_ID,
    slug: MEMBER_SLUG,
    login_email: MEMBER_EMAIL,
    display_name: 'Sqli Member',
    password_hash: await argon2.hash(MEMBER_PASSWORD),
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ── POST /register ────────────────────────────────────────────────────────────
//
// Registration can legitimately succeed when the payload is a non-empty
// string (the email validator only rejects empty). What matters here is that
// the `members` table still exists afterward (DROP didn't land) and the
// payload did not produce a 500. Row count may grow by 1 — that's a normal
// registration path, not a security failure.

describe('POST /register — SQL injection in email/realName/displayName', () => {
  for (const payload of SQL_PAYLOADS) {
    it(`survives payload in email: ${payload.slice(0, 24)}...`, async () => {
      const before = countMembers();
      const res = await request(createApp())
        .post('/register')
        .type('form')
        .send({
          email: payload,
          realName: 'Test User',
          displayName: 'Test User',
          password: 'ValidPass1!',
          confirmPassword: 'ValidPass1!',
        });
      // Expect a 2xx or validation 4xx — never a 500 (SQL error bubbling up).
      expect(res.status).toBeLessThan(500);
      // Members table still present. Count never drops below `before` — a
      // successful DROP TABLE would throw when countMembers() runs, and any
      // other injection that deleted rows would show a decrease.
      expect(countMembers()).toBeGreaterThanOrEqual(before);
    });
  }
});

// ── POST /login ───────────────────────────────────────────────────────────────

describe('POST /login — SQL injection in email', () => {
  for (const payload of SQL_PAYLOADS) {
    it(`survives payload: ${payload.slice(0, 24)}...`, async () => {
      const before = countMembers();
      const res = await request(createApp())
        .post('/login')
        .type('form')
        .send({ email: payload, password: 'anything' });
      expect(res.status).toBeLessThan(500);
      // Login must fail (generic invalid-credentials) — never succeed on a payload.
      expect(res.status).not.toBe(302);
      expect(countMembers()).toBe(before);
    });
  }
});

// ── POST /password/forgot ─────────────────────────────────────────────────────

describe('POST /password/forgot — SQL injection in email', () => {
  for (const payload of SQL_PAYLOADS) {
    it(`survives payload: ${payload.slice(0, 24)}...`, async () => {
      const before = countMembers();
      const res = await request(createApp())
        .post('/password/forgot')
        .type('form')
        .send({ email: payload });
      expect(res.status).toBeLessThan(500);
      expect(countMembers()).toBe(before);
    });
  }
});

// ── POST /verify/resend ───────────────────────────────────────────────────────

describe('POST /verify/resend — SQL injection in email', () => {
  for (const payload of SQL_PAYLOADS) {
    it(`survives payload: ${payload.slice(0, 24)}...`, async () => {
      const before = countMembers();
      const res = await request(createApp())
        .post('/verify/resend')
        .type('form')
        .send({ email: payload });
      expect(res.status).toBeLessThan(500);
      expect(countMembers()).toBe(before);
    });
  }
});

// ── POST /members/:slug/edit — bio (authenticated) ────────────────────────────

describe('POST /members/:slug/edit — SQL injection in bio', () => {
  for (const payload of SQL_PAYLOADS) {
    it(`stores payload verbatim (escaped): ${payload.slice(0, 24)}...`, async () => {
      const before = countMembers();
      const res = await request(createApp())
        .post(`/members/${MEMBER_SLUG}/edit`)
        .set('Cookie', ownCookie())
        .type('form')
        .send({
          bio: payload,
          // Required form fields for profile-edit.
          firstCompetitionYear: '',
          showCompetitiveResults: 'on',
        });
      expect(res.status).toBeLessThan(500);
      expect(countMembers()).toBe(before);

      // Verify bio persisted verbatim — the payload was stored as a string,
      // not executed.
      const db = new BetterSqlite3(dbPath, { readonly: true });
      const row = db.prepare('SELECT bio FROM members WHERE id = ?').get(MEMBER_ID) as { bio: string };
      db.close();
      expect(row.bio).toBe(payload);
    });
  }
});

// ── GET /members?q=... (authenticated member search) ──────────────────────────

describe('GET /members?q=... — SQL injection in search query', () => {
  for (const payload of SQL_PAYLOADS) {
    it(`survives payload: ${payload.slice(0, 24)}...`, async () => {
      const before = countMembers();
      const res = await request(createApp())
        .get(`/members?q=${encodeURIComponent(payload)}`)
        .set('Cookie', ownCookie());
      expect(res.status).toBeLessThan(500);
      expect(countMembers()).toBe(before);
    });
  }
});

// ── POST /history/claim (authenticated) ───────────────────────────────────────

describe('POST /history/claim — SQL injection in identifier', () => {
  for (const payload of SQL_PAYLOADS) {
    it(`survives payload: ${payload.slice(0, 24)}...`, async () => {
      const before = countMembers();
      const res = await request(createApp())
        .post('/history/claim')
        .set('Cookie', ownCookie())
        .type('form')
        .send({ identifier: payload });
      expect(res.status).toBeLessThan(500);
      expect(countMembers()).toBe(before);
    });
  }
});

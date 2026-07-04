/**
 * Regression: concurrent registration must not leak email existence via 500.
 *
 * Before the fix, registerMember did checkEmailExists then insertMember
 * outside any transaction. Two concurrent same-email registrations both
 * observed emailExists=undefined, both attempted insert, and the loser
 * surfaced an uncaught SQLITE_CONSTRAINT_UNIQUE as a 500 — which (a) tells
 * the attacker the email is now registered, and (b) breaks the
 * anti-enumeration contract by giving a different observable response
 * from the "exists before request" path that returns 200 silent_duplicate.
 *
 * The same constraint surface covers slug uniqueness: two registrants
 * with identical display names race to the same generated slug. The fix
 * regenerates the slug and retries up to N times on UNIQUE-slug collision.
 *
 * Anti-enumeration contract: existing and non-existing accounts must be
 * indistinguishable from the outside.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3095');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  createTestDb(dbPath).close();
  createApp = await importApp();
}, 30000);

afterAll(() => cleanupTestDb(dbPath));

function countMembersByEmail(email: string): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const r = db
      .prepare(`SELECT COUNT(*) AS n FROM members WHERE login_email_normalized = ?`)
      .get(email.toLowerCase()) as { n: number };
    return r.n;
  } finally {
    db.close();
  }
}

function countMembersBySlug(slug: string): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const r = db.prepare(`SELECT COUNT(*) AS n FROM members WHERE slug = ?`).get(slug) as {
      n: number;
    };
    return r.n;
  } finally {
    db.close();
  }
}

describe('POST /register race against email UNIQUE constraint', () => {
  it('two concurrent same-email registrations: both return the identical 303; exactly one members row inserted', async () => {
    const app = createApp();
    const sharedEmail = 'race-email@example.com';
    const post = (realName: string, displayName: string) =>
      request(app)
        .post('/register')
        .type('form')
        .send({
          email: sharedEmail,
          password: 'TestPassword123!',
          confirmPassword: 'TestPassword123!',
          realName,
          displayName,
        });

    const [resA, resB] = await Promise.all([
      post('Alice Smith', 'Alice Smith'),
      post('Bob Smith', 'Bob Smith'),
    ]);

    // Both return the identical enumeration-safe 303 to check-email: one insert
    // wins, the loser hits the login_email UNIQUE constraint and takes the same
    // account-exists notice path rather than leaking a duplicate error. Neither
    // should 500.
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([303, 303]);

    // Exactly one member row exists for the shared email.
    expect(countMembersByEmail(sharedEmail)).toBe(1);
  }, 30000);
});

describe('POST /register race against slug UNIQUE constraint', () => {
  it('two concurrent registrations with identical display names succeed (slug retry resolves collision)', async () => {
    const app = createApp();
    const post = (email: string) =>
      request(app)
        .post('/register')
        .type('form')
        .send({
          email,
          password: 'TestPassword123!',
          confirmPassword: 'TestPassword123!',
          realName: 'John Slugrace',
          displayName: 'John Slugrace',
        });

    const [resA, resB] = await Promise.all([
      post('slug-race-a@example.com'),
      post('slug-race-b@example.com'),
    ]);

    // Both succeed — slug retry resolves the collision.
    expect([200, 303]).toContain(resA.status);
    expect([200, 303]).toContain(resB.status);
    expect(resA.status).not.toBe(500);
    expect(resB.status).not.toBe(500);

    expect(countMembersByEmail('slug-race-a@example.com')).toBe(1);
    expect(countMembersByEmail('slug-race-b@example.com')).toBe(1);

    // Slugs differ.
    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const rows = db
        .prepare(
          `SELECT slug FROM members WHERE login_email_normalized IN (?, ?) ORDER BY slug`,
        )
        .all('slug-race-a@example.com', 'slug-race-b@example.com') as Array<{ slug: string }>;
      expect(rows.length).toBe(2);
      expect(rows[0].slug).not.toBe(rows[1].slug);
      // Base slug is `john_slugrace`; one of them carries a numeric suffix.
      expect(rows.some(r => r.slug === 'john_slugrace')).toBe(true);
      expect(rows.some(r => /^john_slugrace_\d+$/.test(r.slug))).toBe(true);
    } finally {
      db.close();
    }
    // Sanity: exactly one row holds the base slug.
    expect(countMembersBySlug('john_slugrace')).toBe(1);
  }, 30000);
});

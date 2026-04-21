/**
 * Adversarial tests: transaction atomicity for multi-row writes.
 *
 * Per `.claude/rules/testing.md` §What "edge cases" means: "multi-row writes
 * either all land or none."
 *
 * This suite pins the atomicity contract for flows that write to more than
 * one row or table in a single service call. If any step fails, no partial
 * state should persist.
 *
 * Limitation: strict mid-transaction fault injection would require either DB
 * mocking (forbidden per testing.md) or a stub adapter. These tests instead
 * exercise the paths where the service itself throws mid-transaction and
 * verify DB state is consistent after the throw.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import argon2 from 'argon2';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3083');

let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID       = 'atomic-member-001';
const MEMBER_SLUG     = 'atomic_member';
const MEMBER_EMAIL    = 'atomic@example.com';
const MEMBER_PASSWORD = 'OrigPass!1';
const LEGACY_ID       = 'atomic-legacy-001';

function ownCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}

function readMember(): Record<string, unknown> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM members WHERE id = ?').get(MEMBER_ID) as Record<string, unknown>;
  db.close();
  return row;
}

function readLegacy(): Record<string, unknown> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM legacy_members WHERE legacy_member_id = ?').get(LEGACY_ID) as Record<string, unknown>;
  db.close();
  return row;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: MEMBER_ID,
    slug: MEMBER_SLUG,
    login_email: MEMBER_EMAIL,
    display_name: 'Atomic Member',
    password_hash: await argon2.hash(MEMBER_PASSWORD),
  });
  insertLegacyMember(db, {
    legacy_member_id: LEGACY_ID,
    legacy_email: 'legacy@example.com',
    display_name: 'Legacy Ghost',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Reset legacy-claim state between tests.
beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare('UPDATE legacy_members SET claimed_by_member_id = NULL, claimed_at = NULL WHERE legacy_member_id = ?').run(LEGACY_ID);
  db.prepare('UPDATE members SET legacy_member_id = NULL, historical_person_id = NULL WHERE id = ?').run(MEMBER_ID);
  db.close();
});

// ── claimLegacyAccount atomicity ──────────────────────────────────────────────

describe('claimLegacyAccount — atomicity invariants', () => {
  it('throws on unknown legacy id → no member or legacy-member state changed', async () => {
    const res = await request(createApp())
      .post('/history/claim/confirm')
      .set('Cookie', ownCookie())
      .type('form')
      .send({ legacyMemberId: 'does-not-exist' });
    // Service throws ValidationError, controller renders error view.
    expect(res.status).toBeLessThan(500);

    const member = readMember();
    const legacy = readLegacy();
    expect(member.legacy_member_id).toBeNull();
    expect(member.historical_person_id).toBeNull();
    expect(legacy.claimed_by_member_id).toBeNull();
    expect(legacy.claimed_at).toBeNull();
  });

  it('throws when legacy already claimed → requesting member unchanged', async () => {
    // Pre-claim the legacy by a different member.
    const db = new BetterSqlite3(dbPath);
    insertMember(db, {
      id: 'other-member-001',
      slug: 'other_member',
      login_email: 'other@example.com',
      display_name: 'Other Member',
    });
    db.prepare(
      'UPDATE legacy_members SET claimed_by_member_id = ?, claimed_at = ? WHERE legacy_member_id = ?',
    ).run('other-member-001', '2025-01-01T00:00:00Z', LEGACY_ID);
    db.close();

    const res = await request(createApp())
      .post('/history/claim/confirm')
      .set('Cookie', ownCookie())
      .type('form')
      .send({ legacyMemberId: LEGACY_ID });
    expect(res.status).toBeLessThan(500);

    // Our requesting member row unchanged; the other member's claim still in place.
    const member = readMember();
    expect(member.legacy_member_id).toBeNull();
    const legacy = readLegacy();
    expect(legacy.claimed_by_member_id).toBe('other-member-001');
  });

  it('successful claim writes all three state changes together', async () => {
    const res = await request(createApp())
      .post('/history/claim/confirm')
      .set('Cookie', ownCookie())
      .type('form')
      .send({ legacyMemberId: LEGACY_ID });
    expect(res.status).toBeLessThan(500);

    const member = readMember();
    const legacy = readLegacy();
    // Both sides of the claim transaction landed.
    expect(member.legacy_member_id).toBe(LEGACY_ID);
    expect(legacy.claimed_by_member_id).toBe(MEMBER_ID);
    expect(legacy.claimed_at).toBeTruthy();
  });
});

// ── completePasswordReset atomicity ───────────────────────────────────────────
//
// completePasswordReset updates the password, bumps password_version, and
// marks the token as used. All three must land together. If any step fails,
// none should.

describe('completePasswordReset — atomicity', () => {
  it('invalid token throws → password_hash and password_version unchanged', async () => {
    const before = readMember();

    const res = await request(createApp())
      .post('/password/reset/not-a-valid-token')
      .type('form')
      .send({ newPassword: 'NewPass1!', confirmPassword: 'NewPass1!' });
    expect(res.status).toBeLessThan(500);

    const after = readMember();
    expect(after.password_hash).toBe(before.password_hash);
    expect(after.password_version).toBe(before.password_version);
  });

  it('valid token → password_hash changed, version bumped, token consumed, all in one transaction', async () => {
    const app = createApp();
    // Request a reset token via the public forgot endpoint.
    const forgot = await request(app)
      .post('/password/forgot')
      .type('form')
      .send({ email: MEMBER_EMAIL });
    expect(forgot.status).toBe(200);

    // Extract the token from the outbox.
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      `SELECT body_text FROM outbox_emails
         WHERE recipient_email = ?
         ORDER BY created_at DESC LIMIT 1`,
    ).get(MEMBER_EMAIL) as { body_text: string } | undefined;
    db.close();
    if (!row) throw new Error('no reset email in outbox');
    const match = row.body_text.match(/\/password\/reset\/([A-Za-z0-9_-]+)/);
    if (!match) throw new Error('no reset link in body');
    const token = match[1];

    const before = readMember();
    const completeRes = await request(app)
      .post(`/password/reset/${token}`)
      .type('form')
      .send({ newPassword: 'BrandNew!2', confirmPassword: 'BrandNew!2' });
    expect(completeRes.status).toBe(302);

    const after = readMember();
    expect(after.password_hash).not.toBe(before.password_hash);
    expect(after.password_version).toBe(Number(before.password_version) + 1);

    // Token marked consumed. A second attempt with the same token must fail.
    const replay = await request(app)
      .post(`/password/reset/${token}`)
      .type('form')
      .send({ newPassword: 'Another!3', confirmPassword: 'Another!3' });
    expect(replay.status).not.toBe(302);
  });
});

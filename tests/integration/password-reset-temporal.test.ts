/**
 * Password-reset token temporal + single-use contract.
 *
 * A reset link must work exactly once and only before it expires. Completing a
 * reset bumps `password_version` (which invalidates every outstanding session);
 * an expired or already-used link must not. Token issuance had coverage; the
 * route-level expiry and replay consequences did not. Expiry is evaluated in
 * application code, so the test seeds a past `expires_at` rather than moving a
 * clock the SQL layer would not see.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import originRequest from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedPersona } from '../../src/testkit/personaFactory';
import { isoHoursAgo } from '../fixtures/clock';

const { dbPath } = setTestEnv('3418');

const SLUG = 'reset_target';
const MEMBER_ID = `member_persona_${SLUG}`;
const NEW_PASSWORD = 'Reset1ngStr0ngP@ss';

let createApp: Awaited<ReturnType<typeof importApp>>;
let expiredToken = '';
let validToken = '';

function passwordVersion(): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const row = db
      .prepare('SELECT password_version FROM members WHERE id = ?')
      .get(MEMBER_ID) as { password_version: number };
    return row.password_version;
  } finally {
    db.close();
  }
}

function reset(token: string) {
  return originRequest(createApp())
    .post(`/password/reset/${token}`)
    .send({ newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedPersona(db, {
    slug: SLUG,
    displayName: 'Reese Ett',
    tier: 'tier0',
    onboardingComplete: true,
    coverageNotes: ['password-reset token temporal probe'],
  });
  db.close();
  createApp = await importApp();

  const { issueToken } = await import('../../src/services/accountTokenService');
  expiredToken = issueToken({ memberId: MEMBER_ID, tokenType: 'password_reset', ttlHours: 1 }).rawToken;
  const writer = new BetterSqlite3(dbPath);
  writer
    .prepare("UPDATE account_tokens SET expires_at = ? WHERE member_id = ? AND token_type = 'password_reset'")
    .run(isoHoursAgo(2), MEMBER_ID);
  writer.close();
  validToken = issueToken({ memberId: MEMBER_ID, tokenType: 'password_reset', ttlHours: 1 }).rawToken;
});

afterAll(() => cleanupTestDb(dbPath));

describe('password-reset token temporal + single-use contract', () => {
  it('rejects an expired reset token and leaves the password unchanged', async () => {
    const before = passwordVersion();
    const res = await reset(expiredToken);
    expect(res.status, 'expired token rejected').toBe(422);
    expect(passwordVersion(), 'password_version unchanged after expired token').toBe(before);
  });

  it('accepts a valid reset token and bumps password_version', async () => {
    const before = passwordVersion();
    const res = await reset(validToken);
    expect(res.status, 'valid reset redirects to profile').toBe(303);
    expect(passwordVersion(), 'password_version bumped on reset').toBe(before + 1);
  });

  it('rejects a replayed (already-consumed) reset token', async () => {
    const before = passwordVersion();
    const res = await reset(validToken);
    expect(res.status, 'replayed token rejected').toBe(422);
    expect(passwordVersion(), 'password_version unchanged on replay').toBe(before);
  });
});

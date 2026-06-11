/**
 * Account-token temporal contract: an expired token is rejected.
 *
 * Email-verification and password-reset tokens carry a TTL; a click that
 * arrives after expiry must not take effect. Token issuance and the service-
 * level TTL math were tested, but the route-level consequence — an expired
 * verify link leaves the account unverified — was not. Expiry is evaluated in
 * application code (`new Date(expires_at) <= Date.now()`), so the test seeds a
 * past `expires_at` rather than moving a clock the SQL layer would not see.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedPersona } from '../../src/testkit/personaFactory';
import { isoHoursAgo } from '../fixtures/clock';

const { dbPath } = setTestEnv('3417');

const SLUG = 'verify_target';
const MEMBER_ID = `member_persona_${SLUG}`;

let createApp: Awaited<ReturnType<typeof importApp>>;
let expiredToken = '';
let validToken = '';

function isVerified(): boolean {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const row = db
      .prepare('SELECT email_verified_at FROM members WHERE id = ?')
      .get(MEMBER_ID) as { email_verified_at: string | null } | undefined;
    return Boolean(row?.email_verified_at);
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedPersona(db, {
    slug: SLUG,
    displayName: 'Vera Fy',
    tier: 'tier0',
    emailVerified: false,
    coverageNotes: ['email-verify token temporal probe'],
  });
  db.close();
  createApp = await importApp();

  // issueToken is dynamically imported after importApp so the config singleton
  // freezes against the test environment, not a static-import-time default.
  const { issueToken } = await import('../../src/services/accountTokenService');

  // Issue one token, push its expiry into the past, then issue a fresh one: the
  // member now holds an expired token and a valid token of the same type.
  expiredToken = issueToken({ memberId: MEMBER_ID, tokenType: 'email_verify', ttlHours: 1 }).rawToken;
  const writer = new BetterSqlite3(dbPath);
  writer
    .prepare("UPDATE account_tokens SET expires_at = ? WHERE member_id = ? AND token_type = 'email_verify'")
    .run(isoHoursAgo(2), MEMBER_ID);
  writer.close();
  validToken = issueToken({ memberId: MEMBER_ID, tokenType: 'email_verify', ttlHours: 1 }).rawToken;
});

afterAll(() => cleanupTestDb(dbPath));

describe('email-verify token temporal contract', () => {
  it('an expired verify link leaves the account unverified', async () => {
    expect(isVerified(), 'starts unverified').toBe(false);
    await request(createApp()).get(`/verify/${expiredToken}`);
    expect(isVerified(), 'still unverified after expired link').toBe(false);
  });

  it('a valid verify link verifies the account', async () => {
    await request(createApp()).get(`/verify/${validToken}`);
    expect(isVerified(), 'verified after valid link').toBe(true);
  });
});

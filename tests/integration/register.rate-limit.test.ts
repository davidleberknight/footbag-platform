/**
 * Regression: POST /register must be rate-limited by caller IP.
 * Every other sensitive account endpoint (login, password-forgot, verify-resend,
 * claim) is throttled; register was not, leaving outbox-flood / argon2-CPU
 * exhaustion / unbounded spam-account creation open.
 *
 * Own DB + own file so the process-global rate-limit bucket is not perturbed by
 * other register tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { rowPin, snapshotIds, rowsAddedSince } from '../fixtures/rowPinning';
import { insertSystemConfig } from '../fixtures/factories';

const { dbPath } = setTestEnv('3092');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Lower the register bucket to 2 per window so the 3rd attempt is blocked.
  insertSystemConfig(db, {
    config_key: 'register_rate_limit_max_attempts',
    value_json: '2',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function registerBody(n: number) {
  // displayName === realName so the surname-in-display-name check is skipped;
  // slug carries the realName surname ('tester') per validateSlug.
  return {
    givenNames: 'Reg', familyName: 'Tester',
    displayName: 'Reg Tester',
    email: `reg-${n}@example.com`,
    password: 'ValidPass!1',
    confirmPassword: 'ValidPass!1',
    slug: `reg_tester_${n}`,
  };
}

describe('POST /register — rate limiting', () => {
  it('blocks with 429 + Retry-After after the configured cap, and writes no audit row', async () => {
    const app = createApp();

    // First two attempts from this IP are under the cap (not rate-limited).
    for (let i = 1; i <= 2; i++) {
      const res = await request(app).post('/register').type('form').send(registerBody(i));
      expect(res.status).not.toBe(429);
    }

    // Third attempt from the same IP is throttled before any processing.
    const auditPin = rowPin('audit_entries', '1 = 1');
    const before = (() => {
      const db = new BetterSqlite3(dbPath, { readonly: true });
      const ids = snapshotIds(db, auditPin);
      db.close();
      return ids;
    })();
    const blocked = await request(app).post('/register').type('form').send(registerBody(3));
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.text).toContain('Too many registration attempts');

    const db = new BetterSqlite3(dbPath, { readonly: true });
    // Someone registering is not yet a member, so the refused attempt leaves
    // nothing about them in the ledger.
    const added = rowsAddedSince(db, auditPin, before);
    // The throttled email must NOT have produced a member row.
    const blockedMember = db.prepare(
      'SELECT id FROM members WHERE login_email = ?',
    ).get('reg-3@example.com') as { id: string } | undefined;
    db.close();

    expect(added).toEqual([]);
    expect(blockedMember).toBeUndefined();
  });
});

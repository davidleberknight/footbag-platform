/**
 * Failed logins are counted twice, against two independent buckets: one keyed
 * on the (email, address) pair and one keyed on the account alone. The second
 * is what stops an attacker spreading attempts for one account across many
 * addresses, so it has to hold on its own key rather than as a side effect of
 * the first.
 *
 * Every request here comes from one address, and the account ceiling is lowered
 * below the seeded per-address ceiling. Without a separate account-keyed bucket
 * all of these attempts would stay under the per-address ceiling and answer
 * 200; the refusal is the whole evidence that the second bucket exists and is
 * enforced on its own key.
 *
 * Own file, own database, and only this ceiling lowered in it: two lowered
 * ceilings in one database means the lower of them always refuses first and the
 * other is never measured.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { hashTestPassword } from '../fixtures/hashTestPassword';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertSystemConfig } from '../fixtures/factories';

const { dbPath } = setTestEnv('4207');

const ACCOUNT_CAP = 3;
const MEMBER_ID = 'account-bucket-member-001';
const MEMBER_EMAIL = 'account-bucket-member@example.com';

let app: import('express').Express;

function readLockoutRows(): { metadata_json: string }[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db.prepare(
    "SELECT metadata_json FROM audit_entries WHERE action_type = 'auth.login_rate_limited' AND entity_id = ?",
  ).all(MEMBER_ID) as { metadata_json: string }[];
  db.close();
  return rows;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertSystemConfig(db, {
    config_key: 'login_account_rate_limit_max_attempts',
    value_json: String(ACCOUNT_CAP),
    reason_text: 'Lowered below the seeded per-address ceiling so this bucket refuses first',
  });
  insertMember(db, {
    id: MEMBER_ID, slug: 'account_bucket_member', login_email: MEMBER_EMAIL,
    password_hash: await hashTestPassword('Correct!Pass1'),
  });
  db.close();

  const createApp = await importApp();
  app = createApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('POST /login — the account-keyed ceiling is a separate bucket', () => {
  it('refuses on the account key while the per-address count is still under its own ceiling', async () => {
    const EMAIL = 'account-bucket-test@example.com';
    for (let i = 0; i < ACCOUNT_CAP; i++) {
      const ok = await request(app)
        .post('/login').type('form')
        .send({ email: EMAIL, password: 'wrong-password' });
      expect(ok.status, `attempt ${i + 1} of ${ACCOUNT_CAP} is under the ceiling`).toBe(200);
    }
    const blocked = await request(app)
      .post('/login').type('form')
      .send({ email: EMAIL, password: 'wrong-password' });
    expect(blocked.status).toBe(429);
    expect(blocked.text).toContain('Too many failed login attempts');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it("records one lockout row naming the account bucket, however many attempts it then refuses", async () => {
    // A row per refusal would read as several lockouts; a row naming the
    // per-address bucket would send a reviewer after the wrong attack.
    for (let i = 0; i < ACCOUNT_CAP + 3; i++) {
      await request(app).post('/login').type('form').send({ email: MEMBER_EMAIL, password: 'wrong-password' });
    }
    const rows = readLockoutRows();
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].metadata_json).bucket).toBe('account');
  });
});

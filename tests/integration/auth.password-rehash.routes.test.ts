/**
 * A password hash made under an older hashing scheme is re-derived at the
 * member's next successful sign-in, so raising the hashing cost reaches every
 * active account without asking anyone to reset a password.
 *
 * The re-hash changes only how the password is stored: the session counter is
 * untouched, so no other device is signed out, and a failed sign-in re-hashes
 * nothing, because only a verified password can be re-derived.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import argon2 from 'argon2';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { hashTestPassword } from '../fixtures/hashTestPassword';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('4251');

// Imported once the test environment is set, because the module reads the
// frozen configuration on load.
let CURRENT_PASSWORD_HASH_VERSION: number;

const PASSWORD = 'Rehash!Pass1';
const OLD_ID = 'rehash-old-001';
const OLD_EMAIL = 'rehash-old@example.com';
const CURRENT_ID = 'rehash-current-001';
const CURRENT_EMAIL = 'rehash-current@example.com';
const FAILED_ID = 'rehash-failed-001';
const FAILED_EMAIL = 'rehash-failed@example.com';

let app: import('express').Express;
const seededHash: Record<string, string> = {};

interface CredentialRow { password_hash: string; password_hash_version: number; password_version: number }

function readCredentials(id: string): CredentialRow {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(
    'SELECT password_hash, password_hash_version, password_version FROM members WHERE id = ?',
  ).get(id) as CredentialRow;
  db.close();
  return row;
}

beforeAll(async () => {
  ({ CURRENT_PASSWORD_HASH_VERSION } = await import('../../src/lib/passwordHash'));
  const db = createTestDb(dbPath);
  const older = CURRENT_PASSWORD_HASH_VERSION - 1;
  for (const [id, email, version] of [
    [OLD_ID, OLD_EMAIL, older],
    [CURRENT_ID, CURRENT_EMAIL, CURRENT_PASSWORD_HASH_VERSION],
    [FAILED_ID, FAILED_EMAIL, older],
  ] as const) {
    seededHash[id] = await hashTestPassword(PASSWORD);
    insertMember(db, {
      id, slug: id.replace(/-/g, '_'), login_email: email,
      password_hash: seededHash[id], password_hash_version: version, password_version: 3,
    });
  }
  db.close();
  const createApp = await importApp();
  app = createApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('POST /login re-derives a hash made under an older scheme', () => {
  it('stores a fresh hash under the current scheme and signs no one out', async () => {
    const res = await request(app).post('/login').type('form').send({ email: OLD_EMAIL, password: PASSWORD });
    expect(res.status).toBe(303);

    const row = readCredentials(OLD_ID);
    // Left on the old scheme, the account never gains the stronger cost.
    expect(row.password_hash_version).toBe(CURRENT_PASSWORD_HASH_VERSION);
    expect(row.password_hash).not.toBe(seededHash[OLD_ID]);
    // A stored hash the password no longer verifies against locks the member out.
    expect(await argon2.verify(row.password_hash, PASSWORD)).toBe(true);
    // Bumping the session counter would sign the member out everywhere else.
    expect(row.password_version).toBe(3);
  });

  it('leaves a hash already on the current scheme as it was', async () => {
    const res = await request(app).post('/login').type('form').send({ email: CURRENT_EMAIL, password: PASSWORD });
    expect(res.status).toBe(303);
    expect(readCredentials(CURRENT_ID).password_hash).toBe(seededHash[CURRENT_ID]);
  });

  it('never overwrites a password changed after the sign-in read the old hash', async () => {
    // A member who changes their password while a re-hash is in flight would
    // otherwise be put back on the old password by the late write.
    const { auth } = await import('../../src/db/db');
    const changed = await hashTestPassword('Changed!Pass2');
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET password_hash = ? WHERE id = ?').run(changed, CURRENT_ID); // factory-cannot-express: a later password change on an existing row
    db.close();
    const result = auth.updatePasswordHash.run(
      'stale-rehash', CURRENT_PASSWORD_HASH_VERSION, new Date().toISOString(), CURRENT_ID, seededHash[CURRENT_ID],
    );
    expect(result.changes).toBe(0);
    expect(readCredentials(CURRENT_ID).password_hash).toBe(changed);
  });

  it('re-hashes nothing on a failed sign-in', async () => {
    const res = await request(app).post('/login').type('form').send({ email: FAILED_EMAIL, password: 'Wrong!Pass1' });
    expect(res.status).toBe(200);
    const row = readCredentials(FAILED_ID);
    expect(row.password_hash).toBe(seededHash[FAILED_ID]);
    expect(row.password_hash_version).toBe(CURRENT_PASSWORD_HASH_VERSION - 1);
  });
});

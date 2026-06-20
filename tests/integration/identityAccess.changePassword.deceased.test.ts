/**
 * The self-service password-change credential lookup excludes deceased members,
 * matching every sibling session query. A deceased account cannot change its
 * password even when the supplied current password is correct: the change path
 * finds no eligible row and treats the request as a wrong current password.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';
import { hashTestPassword } from '../fixtures/hashTestPassword';

const { dbPath } = setTestEnv('3203');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/identityAccessService').identityAccessService;

const OLD_PASSWORD = 'old-password-123';
const NEW_PASSWORD = 'new-password-456';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  svc = (await import('../../src/services/identityAccessService')).identityAccessService;
});

afterAll(() => cleanupTestDb(dbPath));

describe('identityAccessService.changePassword deceased exclusion', () => {
  it('a living member with the correct current password can change it', async () => {
    const hash = await hashTestPassword(OLD_PASSWORD);
    const db = new BetterSqlite3(dbPath);
    insertMember(db, {
      id: 'pwchange-alive',
      slug: 'pwchange_alive',
      login_email: 'pwchange-alive@example.com',
      password_hash: hash,
    });
    db.close();

    const res = await svc.changePassword('pwchange-alive', OLD_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    expect(res.memberId).toBe('pwchange-alive');
  });

  it('a deceased member cannot change their password even with the correct current password', async () => {
    const hash = await hashTestPassword(OLD_PASSWORD);
    const db = new BetterSqlite3(dbPath);
    insertMember(db, {
      id: 'pwchange-deceased',
      slug: 'pwchange_deceased',
      login_email: 'pwchange-deceased@example.com',
      password_hash: hash,
      is_deceased: 1,
    });
    db.close();

    await expect(
      svc.changePassword('pwchange-deceased', OLD_PASSWORD, NEW_PASSWORD, NEW_PASSWORD),
    ).rejects.toThrow('Current password is incorrect.');
  });
});

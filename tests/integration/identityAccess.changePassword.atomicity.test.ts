/**
 * Atomicity regression test for identityAccessService.changePassword (B47).
 *
 * The password bump (which invalidates all other sessions) and its audit row
 * must commit together. Pre-fix they ran as two separate statements, so a
 * failed audit append left password_version bumped with no audit trail. The
 * confirmation email is external I/O and stays post-commit (not asserted here;
 * the throw happens before it is reached).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';
import { hashTestPassword } from '../fixtures/hashTestPassword';

const { dbPath } = setTestEnv('3098');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/identityAccessService').identityAccessService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let audit: typeof import('../../src/services/auditService');

const OLD_PASSWORD = 'old-password-123';
const NEW_PASSWORD = 'new-password-456';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  svc = (await import('../../src/services/identityAccessService')).identityAccessService;
  audit = await import('../../src/services/auditService');
});

afterAll(() => cleanupTestDb(dbPath));

function passwordHashOf(id: string): string {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT password_hash FROM members WHERE id = ?').get(id) as { password_hash: string };
  db.close();
  return row.password_hash;
}

describe('identityAccessService.changePassword atomicity', () => {
  it('B47: rolls back the password bump when the audit append throws', async () => {
    const oldHash = await hashTestPassword(OLD_PASSWORD);
    const id = 'pwchange-atom-1';
    const db = new BetterSqlite3(dbPath);
    insertMember(db, { id, slug: 'pwchange-atom-1', login_email: 'pwchange-atom-1@example.com', password_hash: oldHash });
    db.close();

    const spy = vi.spyOn(audit, 'appendAuditEntry').mockImplementation(() => {
      throw new Error('forced audit failure');
    });
    await expect(
      svc.changePassword(id, OLD_PASSWORD, NEW_PASSWORD, NEW_PASSWORD),
    ).rejects.toThrow('forced audit failure');
    spy.mockRestore();

    // Pre-fix: password_hash was updated before the (failing) audit append, so it
    // would now be the new hash. Post-fix: the whole change rolled back.
    expect(passwordHashOf(id)).toBe(oldHash);
  });
});

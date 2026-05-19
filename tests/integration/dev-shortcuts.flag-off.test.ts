/**
 * Integration test for repairAdminTier2Invariant when the opt-in
 * env var is OFF. Even with admins violating the Tier 2 invariant,
 * the pass must return zero repairs and write no marker rows. The
 * flag default is off; this exercises the explicit-disable path.
 */
import BetterSqlite3 from 'better-sqlite3';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

process.env.FOOTBAG_ENV = 'development';
delete process.env.FOOTBAG_DEV_ADMIN_GRANT_TIER2;

const { dbPath } = setTestEnv('3202');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let devShortcutsMod: typeof import('../../src/dev-shortcuts/runtime');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let tieringMod: typeof import('../../src/services/membershipTieringService');

const ADMIN_ID = 'devrepair-off-admin';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'devrepair_off_admin', is_admin: 1 });
  db.close();
  devShortcutsMod = await import('../../src/dev-shortcuts/runtime');
  tieringMod = await import('../../src/services/membershipTieringService');
});

afterAll(() => cleanupTestDb(dbPath));

describe('repairAdminTier2Invariant with FOOTBAG_DEV_ADMIN_GRANT_TIER2 unset', () => {
  it('returns { repaired: 0, skipped: 0 } and writes no marker rows', () => {
    const result = devShortcutsMod.repairAdminTier2Invariant();
    expect(result).toEqual({ repaired: 0, skipped: 0 });

    expect(tieringMod.getTierStatus(ADMIN_ID).tier_status).toBe('tier0');

    const db = new BetterSqlite3(dbPath);
    const repairGrant = db
      .prepare(
        `SELECT id FROM member_tier_grants
         WHERE reason_code = 'dev_admin_invariant_repair'`,
      )
      .all() as Array<{ id: string }>;
    expect(repairGrant).toEqual([]);
    db.close();
  });
});

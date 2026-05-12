/**
 * Regression: repairAdminTier2Invariant must return { repaired: 0, skipped: 0 }
 * for any FOOTBAG_ENV value that is not 'development', even when
 * devAdminGrantTier2 is true. The primary guard is env.ts boot-fail-fast
 * (env.ts:285-295 refuses FOOTBAG_DEV_ADMIN_GRANT_TIER2=1 outside
 * development). This in-function guard is the second line of defense: a
 * future caller that constructs the function's config inputs directly
 * (e.g. via the testability opts) still cannot trigger a write in a
 * production-shaped environment.
 *
 * The function takes test-only opts overrides; this test exercises every
 * non-development footbagEnv value to confirm the guard rejects them all.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

process.env.FOOTBAG_ENV = 'development';

const { dbPath } = setTestEnv('3203');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let devShortcutsMod: typeof import('../../src/dev-admin-shortcuts/runtime');

const ADMIN_ID = 'devrepair-prodguard-admin';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Insert an admin that violates the Tier 2 invariant. If the in-function
  // guard fails open, the function would write a repair grant for this row.
  insertMember(db, { id: ADMIN_ID, slug: 'devrepair_prodguard_admin', is_admin: 1 });
  db.close();
  devShortcutsMod = await import('../../src/dev-admin-shortcuts/runtime');
});

afterAll(() => cleanupTestDb(dbPath));

function countRepairGrants(): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const r = db
      .prepare(
        `SELECT COUNT(*) AS n FROM member_tier_grants
         WHERE reason_code = 'dev_admin_invariant_repair'`,
      )
      .get() as { n: number };
    return r.n;
  } finally {
    db.close();
  }
}

describe('repairAdminTier2Invariant — in-function FOOTBAG_ENV guard', () => {
  // 'production' and 'staging' are the values most operationally at risk;
  // any non-development string must hit the early-return. (FOOTBAG_ENV
  // unset is normally rejected by env.ts at boot when the companion flag
  // FOOTBAG_DEV_ADMIN_GRANT_TIER2 is set, so the "<unset>" case cannot
  // reach this function in a real misconfigured deploy.)
  for (const env of ['production', 'staging', 'test', 'qa', '']) {
    it(`returns { repaired: 0, skipped: 0 } and writes no rows when footbagEnv='${env}'`, () => {
      const before = countRepairGrants();
      const result = devShortcutsMod.repairAdminTier2Invariant({
        footbagEnv: env,
        // Even with the flag asserted true via the opts override, the
        // footbagEnv gate alone must block the write.
        devAdminGrantTier2: true,
      });
      expect(result).toEqual({ repaired: 0, skipped: 0 });
      expect(countRepairGrants()).toBe(before);
    });
  }

  it('also returns { repaired: 0, skipped: 0 } when devAdminGrantTier2 is false even in development', () => {
    const before = countRepairGrants();
    const result = devShortcutsMod.repairAdminTier2Invariant({
      footbagEnv: 'development',
      devAdminGrantTier2: false,
    });
    expect(result).toEqual({ repaired: 0, skipped: 0 });
    expect(countRepairGrants()).toBe(before);
  });
});

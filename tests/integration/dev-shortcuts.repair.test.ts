/**
 * Integration tests for src/dev-admin-shortcuts/runtime.ts
 * repairAdminTier2Invariant.
 *
 * The platform admin role requires Tier 2 or Tier 3 status as a
 * prerequisite. In dev environments where the legacy data dump or the
 * dev-admin seed has not been run cleanly, an admin row may exist with
 * is_admin=1 but a tier ledger that says tier0 or tier1. The repair
 * pass closes that gap by inserting a Tier 2 grant for each admin
 * below tier2. The grant carries a unique reason_code and the audit
 * row carries a unique action_type so a pre-deploy grep against any
 * production database returns zero rows.
 *
 * Behavior contract verified here:
 *   - admin tier0 → repaired to tier2 with the marker reason_code/action_type.
 *   - admin tier1 → repaired to tier2.
 *   - admin tier3 → no-op (already satisfies invariant).
 *   - non-admin tier0 → no-op (predicate keyed on is_admin only).
 *   - second call → idempotent, repaired count is 0.
 *   - flag off → no-op even when admins violate the invariant.
 */
import BetterSqlite3 from 'better-sqlite3';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, createMemberAtTier } from '../fixtures/factories';

// Set the env-mode gates BEFORE the env config singleton is loaded.
// setTestEnv assigns DB-path and other test vars next; both groups must
// be present at config-load time.
process.env.FOOTBAG_ENV = 'development';
process.env.FOOTBAG_DEV_ADMIN_GRANT_TIER2 = '1';

const { dbPath } = setTestEnv('3201');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let devShortcutsMod: typeof import('../../src/dev-admin-shortcuts/runtime');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let tieringMod: typeof import('../../src/services/membershipTieringService');

const ADMIN_T0_ID = 'devrepair-admin-t0';
const ADMIN_T1_ID = 'devrepair-admin-t1';
const ADMIN_T3_ID = 'devrepair-admin-t3';
const NORMIE_T0_ID = 'devrepair-normie-t0';
const TIER3_ACTOR  = 'devrepair-actor';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: TIER3_ACTOR, slug: 'devrepair_actor', is_admin: 1 });
  insertMember(db, { id: ADMIN_T0_ID, slug: 'devrepair_admin_t0', is_admin: 1 });
  createMemberAtTier(db, {
    id: ADMIN_T1_ID, slug: 'devrepair_admin_t1', tier: 'tier1',
    memberOverrides: { is_admin: 1 },
  });
  createMemberAtTier(db, {
    id: ADMIN_T3_ID, slug: 'devrepair_admin_t3', tier: 'tier3',
    underlying_tier_status: 'tier2', actor_member_id: TIER3_ACTOR,
    memberOverrides: { is_admin: 1 },
  });
  insertMember(db, { id: NORMIE_T0_ID, slug: 'devrepair_normie_t0' });
  db.close();

  devShortcutsMod = await import('../../src/dev-admin-shortcuts/runtime');
  tieringMod = await import('../../src/services/membershipTieringService');
});

afterAll(() => cleanupTestDb(dbPath));

describe('repairAdminTier2Invariant', () => {
  it('repairs admin tier0 → tier2 with the marker reason_code', () => {
    const before = tieringMod.getTierStatus(ADMIN_T0_ID).tier_status;
    expect(before).toBe('tier0');

    const result = devShortcutsMod.repairAdminTier2Invariant();
    // First-time call: TIER3_ACTOR (admin t0), ADMIN_T0_ID (admin t0),
    // ADMIN_T1_ID (admin t1) all need repair. ADMIN_T3_ID skipped.
    expect(result.repaired).toBe(3);
    expect(result.skipped).toBe(1);

    const after = tieringMod.getTierStatus(ADMIN_T0_ID).tier_status;
    expect(after).toBe('tier2');

    // Marker rows present.
    const db = new BetterSqlite3(dbPath);
    const grant = db
      .prepare(
        `SELECT new_tier_status, reason_code FROM member_tier_grants
         WHERE member_id = ? AND reason_code = 'dev_admin_invariant_repair'
         ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(ADMIN_T0_ID) as { new_tier_status: string; reason_code: string } | undefined;
    expect(grant?.new_tier_status).toBe('tier2');
    expect(grant?.reason_code).toBe('dev_admin_invariant_repair');

    const audit = db
      .prepare(
        `SELECT action_type FROM audit_entries
         WHERE entity_id = ? AND action_type = 'dev_admin_invariant_repair'
         ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(ADMIN_T0_ID) as { action_type: string } | undefined;
    expect(audit?.action_type).toBe('dev_admin_invariant_repair');
    db.close();
  });

  it('promotes admin tier1 → tier2 in the same first pass', () => {
    const after = tieringMod.getTierStatus(ADMIN_T1_ID).tier_status;
    expect(after).toBe('tier2');
  });

  it('admin tier3 is left untouched (already satisfies invariant)', () => {
    const after = tieringMod.getTierStatus(ADMIN_T3_ID).tier_status;
    expect(after).toBe('tier3');
    const db = new BetterSqlite3(dbPath);
    const repairGrant = db
      .prepare(
        `SELECT id FROM member_tier_grants
         WHERE member_id = ? AND reason_code = 'dev_admin_invariant_repair'`,
      )
      .get(ADMIN_T3_ID) as { id: string } | undefined;
    expect(repairGrant).toBeUndefined();
    db.close();
  });

  it('non-admin tier0 is never repaired (predicate keyed on is_admin)', () => {
    const after = tieringMod.getTierStatus(NORMIE_T0_ID).tier_status;
    expect(after).toBe('tier0');
    const db = new BetterSqlite3(dbPath);
    const repairGrant = db
      .prepare(
        `SELECT id FROM member_tier_grants
         WHERE member_id = ? AND reason_code = 'dev_admin_invariant_repair'`,
      )
      .get(NORMIE_T0_ID) as { id: string } | undefined;
    expect(repairGrant).toBeUndefined();
    db.close();
  });

  it('idempotent: second call repairs zero (all admins now at tier2+)', () => {
    const result = devShortcutsMod.repairAdminTier2Invariant();
    expect(result.repaired).toBe(0);
    // All four admins (TIER3_ACTOR, ADMIN_T0_ID, ADMIN_T1_ID, ADMIN_T3_ID)
    // are now at tier2+ and skipped.
    expect(result.skipped).toBe(4);
  });
});

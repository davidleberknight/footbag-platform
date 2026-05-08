/**
 * Integration tests for membershipTieringService.
 *
 * Covers tiering service edge cases:
 *   - Tier 0 buys Tier 1 / Tier 2 ends current Active Player
 *   - Tier 0 / Tier 1 / Tier 2 → Tier 3 governance with correct underlying
 *   - Tier 0 with AP → Tier 3 ends AP (paired ledger writes in one transaction)
 *   - HoF / BAP induction on Tier 0/1/2 grants Tier 2; on Tier 3 updates underlying
 *   - governance_removed reverts to underlying from latest governance_set
 *   - DB CHECK rejection when governance rows omit underlying tier columns
 *   - Admin override writes a correct row with mandatory reason text
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertActivePlayerGrant,
  insertPayment,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3091');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let mts: typeof import('../../src/services/membershipTieringService');

const ADMIN_ID = 'member-admin';
const FUTURE_AP = '2099-01-01T00:00:00.000Z';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'tier_admin', is_admin: 1 });
  db.close();
  mts = await import('../../src/services/membershipTieringService');
});

afterAll(() => cleanupTestDb(dbPath));

let memberCounter = 0;
function freshMember(overrides: Partial<Parameters<typeof insertMember>[1]> = {}): string {
  const db = new BetterSqlite3(dbPath);
  memberCounter += 1;
  const id = `member-tier-${memberCounter}`;
  insertMember(db, { id, slug: `tier_${memberCounter}`, ...overrides });
  db.close();
  return id;
}

let paymentCounter = 0;
function freshPayment(memberId: string, tier: 'tier1' | 'tier2'): string {
  const db = new BetterSqlite3(dbPath);
  paymentCounter += 1;
  const id = `pay-test-mt-${paymentCounter}`;
  insertPayment(db, {
    id,
    member_id: memberId,
    payment_type: 'membership',
    purchased_tier_status: tier,
    status: 'succeeded',
  });
  db.close();
  return id;
}

interface TierGrantRow {
  id: string;
  change_type: string;
  old_tier_status: string | null;
  new_tier_status: string;
  old_underlying_tier_status: string | null;
  new_underlying_tier_status: string | null;
  reason_code: string;
  reason_text: string | null;
  related_payment_id: string | null;
  actor_member_id: string | null;
  created_at: string;
}

interface ApGrantRow {
  id: string;
  change_type: string;
  old_active_player_expires_at: string | null;
  new_active_player_expires_at: string | null;
  reason_code: string;
  actor_member_id: string | null;
  created_at: string;
}

function tierGrants(memberId: string): TierGrantRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT id, change_type, old_tier_status, new_tier_status,
              old_underlying_tier_status, new_underlying_tier_status,
              reason_code, reason_text, related_payment_id,
              actor_member_id, created_at
       FROM member_tier_grants
       WHERE member_id = ?
       ORDER BY created_at, id`,
    )
    .all(memberId) as TierGrantRow[];
  db.close();
  return rows;
}

function apGrants(memberId: string): ApGrantRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT id, change_type,
              old_active_player_expires_at, new_active_player_expires_at,
              reason_code, actor_member_id, created_at
       FROM active_player_grants
       WHERE member_id = ?
       ORDER BY created_at, id`,
    )
    .all(memberId) as ApGrantRow[];
  db.close();
  return rows;
}

function seedActivePlayer(memberId: string, expiresAt = FUTURE_AP): void {
  const db = new BetterSqlite3(dbPath);
  insertActivePlayerGrant(db, {
    member_id: memberId,
    change_type: 'grant',
    new_active_player_expires_at: expiresAt,
    reason_code: 'official_event_attendance',
  });
  db.close();
}

describe('getTierStatus', () => {
  it('returns tier0 with null underlying for a member with no ledger entry', () => {
    const id = freshMember();
    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier0',
      underlying_tier_status: null,
    });
  });

  it('throws NotFoundError for an unknown member id', () => {
    expect(() => mts.getTierStatus('does-not-exist')).toThrow(/not found/i);
  });
});

describe('applyPurchaseGrant', () => {
  it('Tier 0 buys Tier 1: ends current AP and writes both ledger rows', () => {
    const id = freshMember();
    seedActivePlayer(id);
    expect(mts.getTierStatus(id).tier_status).toBe('tier0');

    const paymentId = freshPayment(id, 'tier1');
    mts.applyPurchaseGrant(id, id, paymentId, 'tier1');

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier1',
      underlying_tier_status: null,
    });
    const tg = tierGrants(id);
    expect(tg).toHaveLength(1);
    expect(tg[0]).toMatchObject({
      change_type: 'grant',
      old_tier_status: 'tier0',
      new_tier_status: 'tier1',
      reason_code: 'purchase.tier1',
      related_payment_id: paymentId,
      actor_member_id: id,
    });
    const ap = apGrants(id);
    expect(ap).toHaveLength(2);
    expect(ap[1]).toMatchObject({
      change_type: 'end',
      old_active_player_expires_at: FUTURE_AP,
      new_active_player_expires_at: null,
      reason_code: 'membership_upgrade_ended_active_player',
      actor_member_id: id,
    });
  });

  it('Tier 0 buys Tier 2: ends current AP and writes both ledger rows', () => {
    const id = freshMember();
    seedActivePlayer(id);

    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier2'), 'tier2');

    expect(mts.getTierStatus(id).tier_status).toBe('tier2');
    const tg = tierGrants(id);
    expect(tg[0]).toMatchObject({
      change_type: 'grant',
      old_tier_status: 'tier0',
      new_tier_status: 'tier2',
      reason_code: 'purchase.tier2',
    });
    const ap = apGrants(id);
    expect(ap.find((r) => r.change_type === 'end')).toBeDefined();
  });

  it('Tier 0 without AP: writes the tier grant only (no AP end row)', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier1'), 'tier1');
    expect(tierGrants(id)).toHaveLength(1);
    expect(apGrants(id)).toHaveLength(0);
  });
});

describe('applyHonorGrant', () => {
  it('Tier 0 → HoF: writes Tier 2 grant and ends current AP', () => {
    const id = freshMember();
    seedActivePlayer(id);

    mts.applyHonorGrant(ADMIN_ID, id, 'hof');

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier2',
      underlying_tier_status: null,
    });
    const tg = tierGrants(id);
    expect(tg[0]).toMatchObject({
      change_type: 'grant',
      old_tier_status: 'tier0',
      new_tier_status: 'tier2',
      reason_code: 'honor.hof_tier2_grant',
      actor_member_id: ADMIN_ID,
    });
    expect(apGrants(id).some((r) => r.change_type === 'end')).toBe(true);
  });

  it('Tier 1 → BAP: writes Tier 2 grant; no AP rows', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier1'), 'tier1');

    mts.applyHonorGrant(ADMIN_ID, id, 'bap');

    expect(mts.getTierStatus(id).tier_status).toBe('tier2');
    const latest = tierGrants(id).at(-1)!;
    expect(latest).toMatchObject({
      change_type: 'grant',
      old_tier_status: 'tier1',
      new_tier_status: 'tier2',
      reason_code: 'honor.bap_tier2_grant',
    });
    expect(apGrants(id)).toHaveLength(0);
  });

  it('Tier 3 (underlying tier1) → HoF: writes governance_set updating underlying to tier2', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier1'), 'tier1');
    mts.setGovernanceTier3(ADMIN_ID, id);
    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier3',
      underlying_tier_status: 'tier1',
    });

    mts.applyHonorGrant(ADMIN_ID, id, 'hof');

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier3',
      underlying_tier_status: 'tier2',
    });
    const latest = tierGrants(id).at(-1)!;
    expect(latest).toMatchObject({
      change_type: 'governance_set',
      old_tier_status: 'tier3',
      new_tier_status: 'tier3',
      old_underlying_tier_status: 'tier1',
      new_underlying_tier_status: 'tier2',
      reason_code: 'honor.hof_tier2_grant',
    });
  });
});

describe('setGovernanceTier3', () => {
  it('Tier 0 → Tier 3: underlying=tier1; ends AP; both rows written', () => {
    const id = freshMember();
    seedActivePlayer(id);

    mts.setGovernanceTier3(ADMIN_ID, id);

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier3',
      underlying_tier_status: 'tier1',
    });
    const tg = tierGrants(id);
    expect(tg[0]).toMatchObject({
      change_type: 'governance_set',
      old_tier_status: 'tier0',
      new_tier_status: 'tier3',
      new_underlying_tier_status: 'tier1',
      reason_code: 'governance.tier3_set',
    });
    const apEnd = apGrants(id).find((r) => r.change_type === 'end');
    expect(apEnd).toMatchObject({
      reason_code: 'tier3_grant_ended_active_player',
      actor_member_id: ADMIN_ID,
      new_active_player_expires_at: null,
    });
  });

  it('Tier 1 → Tier 3: underlying=tier1', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier1'), 'tier1');

    mts.setGovernanceTier3(ADMIN_ID, id);

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier3',
      underlying_tier_status: 'tier1',
    });
  });

  it('Tier 2 → Tier 3: underlying=tier2', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier2'), 'tier2');

    mts.setGovernanceTier3(ADMIN_ID, id);

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier3',
      underlying_tier_status: 'tier2',
    });
  });

  it('rejects re-grant to a member who is already Tier 3', () => {
    const id = freshMember();
    mts.setGovernanceTier3(ADMIN_ID, id);

    expect(() => mts.setGovernanceTier3(ADMIN_ID, id)).toThrow(/already Tier 3/);
  });

  it('writes both the tier-grant and AP-end rows in the same transaction (atomicity)', () => {
    const id = freshMember();
    seedActivePlayer(id);

    mts.setGovernanceTier3(ADMIN_ID, id);

    const tg = tierGrants(id);
    const ap = apGrants(id);
    const tierTs = tg.find((r) => r.change_type === 'governance_set')!.created_at;
    const apTs = ap.find((r) => r.change_type === 'end')!.created_at;
    expect(tierTs).toBe(apTs);
  });
});

describe('removeGovernanceTier3', () => {
  it('reverts to the underlying tier captured by the latest governance_set row', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier2'), 'tier2');
    mts.setGovernanceTier3(ADMIN_ID, id);
    expect(mts.getTierStatus(id).underlying_tier_status).toBe('tier2');

    mts.removeGovernanceTier3(ADMIN_ID, id);

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier2',
      underlying_tier_status: null,
    });
    const latest = tierGrants(id).at(-1)!;
    expect(latest).toMatchObject({
      change_type: 'governance_removed',
      old_tier_status: 'tier3',
      new_tier_status: 'tier2',
      old_underlying_tier_status: 'tier2',
      new_underlying_tier_status: null,
      reason_code: 'governance.tier3_removed',
    });
  });

  it('reverts to tier1 when the prior path was Tier 0 → Tier 3', () => {
    const id = freshMember();
    mts.setGovernanceTier3(ADMIN_ID, id);

    mts.removeGovernanceTier3(ADMIN_ID, id);

    expect(mts.getTierStatus(id).tier_status).toBe('tier1');
  });

  it('rejects when the member is not currently Tier 3', () => {
    const id = freshMember();
    expect(() => mts.removeGovernanceTier3(ADMIN_ID, id)).toThrow(/not Tier 3/);
  });

  it('after a HoF-on-Tier3 governance_set, removal reverts to the updated underlying (tier2)', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier1'), 'tier1');
    mts.setGovernanceTier3(ADMIN_ID, id);
    mts.applyHonorGrant(ADMIN_ID, id, 'hof');
    expect(mts.getTierStatus(id).underlying_tier_status).toBe('tier2');

    mts.removeGovernanceTier3(ADMIN_ID, id);

    expect(mts.getTierStatus(id).tier_status).toBe('tier2');
  });
});

describe('adminOverride', () => {
  it('writes a correct row with the mandatory reason text', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier1'), 'tier1');

    mts.adminOverride(ADMIN_ID, id, 'tier0', 'erroneous earlier grant');

    expect(mts.getTierStatus(id).tier_status).toBe('tier0');
    const latest = tierGrants(id).at(-1)!;
    expect(latest).toMatchObject({
      change_type: 'correct',
      old_tier_status: 'tier1',
      new_tier_status: 'tier0',
      reason_code: 'admin.correction',
      reason_text: 'erroneous earlier grant',
      actor_member_id: ADMIN_ID,
    });
  });

  it('rejects an empty reason text', () => {
    const id = freshMember();
    expect(() => mts.adminOverride(ADMIN_ID, id, 'tier1', '')).toThrow(/required/);
    expect(() => mts.adminOverride(ADMIN_ID, id, 'tier1', '   ')).toThrow(/required/);
  });

  it('rejects an oversized reason text (1MB)', () => {
    const id = freshMember();
    const huge = 'x'.repeat(1_000_000);
    expect(() => mts.adminOverride(ADMIN_ID, id, 'tier1', huge)).toThrow(/exceeds/);
    // No row should have been written.
    expect(tierGrants(id)).toHaveLength(0);
  });

  it('preserves unicode mischief verbatim in reason_text', () => {
    const id = freshMember();
    const sneaky = 'a‮‍b‬ right-to-left override + zero-width joiner';

    mts.adminOverride(ADMIN_ID, id, 'tier1', sneaky);

    const latest = tierGrants(id).at(-1)!;
    expect(latest.reason_text).toBe(sneaky);
  });
});

describe('DB-level governance integrity guards', () => {
  // These assert the schema CHECK constraints fire when the service contract
  // is bypassed. The plan calls them out explicitly so they cannot regress
  // out of the schema without a test failure.

  it('rejects a governance_set row missing new_underlying_tier_status', () => {
    const id = freshMember();
    const db = new BetterSqlite3(dbPath);
    expect(() =>
      db
        .prepare(
          `INSERT INTO member_tier_grants (
             id, created_at, created_by,
             member_id, actor_member_id,
             change_type,
             old_tier_status, new_tier_status,
             old_underlying_tier_status, new_underlying_tier_status,
             reason_code
           ) VALUES (?, ?, 'system', ?, ?, 'governance_set', 'tier1', 'tier3', NULL, NULL, 'test')`,
        )
        .run('mtg-bad-1', '2026-01-01T00:00:00.000Z', id, ADMIN_ID),
    ).toThrow(/CHECK/i);
    db.close();
  });

  it('rejects a governance_removed row missing old_underlying_tier_status', () => {
    const id = freshMember();
    const db = new BetterSqlite3(dbPath);
    expect(() =>
      db
        .prepare(
          `INSERT INTO member_tier_grants (
             id, created_at, created_by,
             member_id, actor_member_id,
             change_type,
             old_tier_status, new_tier_status,
             old_underlying_tier_status, new_underlying_tier_status,
             reason_code
           ) VALUES (?, ?, 'system', ?, ?, 'governance_removed', 'tier3', 'tier1', NULL, NULL, 'test')`,
        )
        .run('mtg-bad-2', '2026-01-01T00:00:00.000Z', id, ADMIN_ID),
    ).toThrow(/CHECK/i);
    db.close();
  });
});

describe('audit log', () => {
  it('writes a tier_change audit entry on adminOverride', () => {
    const id = freshMember();
    mts.adminOverride(ADMIN_ID, id, 'tier1', 'manual fix');

    const dbh = new BetterSqlite3(dbPath, { readonly: true });
    const rows = dbh
      .prepare(
        `SELECT action_type, category, actor_type, actor_member_id, entity_id, reason_text
         FROM audit_entries
         WHERE entity_id = ? AND action_type = 'tier.admin_override'`,
      )
      .all(id) as Array<{
        action_type: string;
        category: string;
        actor_type: string;
        actor_member_id: string;
        entity_id: string;
        reason_text: string;
      }>;
    dbh.close();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action_type: 'tier.admin_override',
      category: 'tier_change',
      actor_type: 'admin',
      actor_member_id: ADMIN_ID,
      entity_id: id,
      reason_text: 'manual fix',
    });
  });

  it('writes a governance_change audit entry on setGovernanceTier3', () => {
    const id = freshMember();
    mts.setGovernanceTier3(ADMIN_ID, id);

    const dbh = new BetterSqlite3(dbPath, { readonly: true });
    const rows = dbh
      .prepare(
        `SELECT category, action_type FROM audit_entries
         WHERE entity_id = ? AND action_type = 'tier.governance_set'`,
      )
      .all(id) as Array<{ category: string; action_type: string }>;
    dbh.close();
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('governance_change');
  });
});

// Ensure each describe block's tests are self-contained: there is no shared
// member id across blocks, but beforeEach is a useful safety net to flag any
// future drift away from the freshMember pattern.
beforeEach(() => {
  // Intentionally empty: every test calls freshMember() to get an isolated
  // member id. Kept to surface intent in case future edits add per-test setup.
});

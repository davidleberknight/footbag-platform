/**
 * AP edge-state coverage for hasTier1Benefits.
 *
 * Complementary to active-player.service.test.ts (which covers the AP
 * service contract: applyAttendance / applyVouch / applyClubJoin /
 * applyExpiry behaviors, idempotency, no-shorten, rate limits, etc.).
 * This file pins the predicate-side: given a member's full AP ledger
 * (grant / extend / end / expire rows) plus tier, does hasTier1Benefits
 * return the expected boolean? It exists because the predicate is the
 * load-bearing surface for the requireTier1Benefits middleware and the
 * assertTier1Benefits service-layer defense-in-depth,
 * and a regression in the AP-current view's expiry semantics would not
 * be caught by the AP service tests alone.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertActivePlayerGrant,
  createMemberAtTier,
  createTier0WithActivePlayer,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3079');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let predicates: typeof import('../../src/services/tierPredicates');

const ADMIN_ID = 'admin-ap-edge';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'ap_edge_admin', is_admin: 1 });
  db.close();
  predicates = await import('../../src/services/tierPredicates');
});

afterAll(() => cleanupTestDb(dbPath));

let counter = 0;
function nextId(prefix: string): { id: string; slug: string } {
  counter += 1;
  return { id: `member-ap-edge-${prefix}-${counter}`, slug: `ap_edge_${prefix}_${counter}` };
}

// "Future" offsets use Date.now() because the AP-current view evaluates
// `expires_at > strftime('now')` and the test asserts "future is true."
// Drift between Date.now() at fixture-insert and view-eval at predicate-call
// is bounded by test duration (sub-millisecond), so a 30-day future offset
// is robustly in the future under any realistic CI scheduler. The fragile
// pattern that violates testing.md is asserting against ~10ms boundaries;
// see the 'tier0_ap_already_expired' case for the deterministic alternative.
function isoOffsetDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe('hasTier1Benefits — AP edge states (Tier 0)', () => {
  it('tier0_no_ap → false (no AP ledger row at all)', () => {
    const db = new BetterSqlite3(dbPath);
    const { id, slug } = nextId('t0_noap');
    insertMember(db, { id, slug });
    db.close();
    expect(predicates.hasTier1Benefits(id)).toBe(false);
  });

  it('tier0_ap_current_30d → true (AP grant 30 days in the future)', () => {
    const db = new BetterSqlite3(dbPath);
    const { id, slug } = nextId('t0_30d');
    createTier0WithActivePlayer(db, { id, slug, expiresAt: isoOffsetDays(30) });
    db.close();
    expect(predicates.hasTier1Benefits(id)).toBe(true);
  });

  it('tier0_ap_already_expired → false (boundary: expiry past "now" with the view\'s strict > comparison)', () => {
    // AP-current view evaluates `expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`.
    // Use a clearly-past timestamp (year 2000) to remove any dependence on
    // CI scheduler timing. The earlier '~10ms in the past' approach was
    // fragile under slow CI hardware; this pins the strict-greater
    // semantics deterministically: any past expiry → predicate false.
    const db = new BetterSqlite3(dbPath);
    const { id, slug } = nextId('t0_already_expired');
    const expiredLongAgo = '2000-01-01T00:00:00.000Z';
    createTier0WithActivePlayer(db, { id, slug, expiresAt: expiredLongAgo });
    db.close();
    expect(predicates.hasTier1Benefits(id)).toBe(false);
  });

  it('tier0_ap_expired_yesterday → false', () => {
    const db = new BetterSqlite3(dbPath);
    const { id, slug } = nextId('t0_y');
    createTier0WithActivePlayer(db, { id, slug, expiresAt: isoOffsetDays(-1) });
    db.close();
    expect(predicates.hasTier1Benefits(id)).toBe(false);
  });

  it('tier0_ap_long_window → true (AP grant 730+ days out, typical vouch grant)', () => {
    const db = new BetterSqlite3(dbPath);
    const { id, slug } = nextId('t0_long');
    createTier0WithActivePlayer(db, { id, slug, expiresAt: isoOffsetDays(800) });
    db.close();
    expect(predicates.hasTier1Benefits(id)).toBe(true);
  });

  it('tier0_ap_extended → true (grant followed by extend pushes expiry farther out)', () => {
    // Older grant 30 days, newer extend 365 days. The view picks the latest
    // ledger row by (created_at, id). hasTier1Benefits must return true.
    const db = new BetterSqlite3(dbPath);
    const { id, slug } = nextId('t0_extended');
    insertMember(db, { id, slug });
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'grant',
      new_active_player_expires_at: isoOffsetDays(30),
      reason_code: 'official_event_attendance',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'extend',
      old_active_player_expires_at: isoOffsetDays(30),
      new_active_player_expires_at: isoOffsetDays(365),
      reason_code: 'official_event_attendance',
      created_at: '2026-02-01T00:00:00.000Z',
    });
    db.close();
    expect(predicates.hasTier1Benefits(id)).toBe(true);
  });

  it('tier0_ap_grant_then_end → false (end row supersedes the prior grant; new_expires_at NULL)', () => {
    const db = new BetterSqlite3(dbPath);
    const { id, slug } = nextId('t0_end');
    insertMember(db, { id, slug });
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'grant',
      new_active_player_expires_at: isoOffsetDays(30),
      reason_code: 'official_event_attendance',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'end',
      old_active_player_expires_at: isoOffsetDays(30),
      new_active_player_expires_at: null,
      reason_code: 'membership_upgrade_ended_active_player',
      created_at: '2026-02-01T00:00:00.000Z',
    });
    db.close();
    expect(predicates.hasTier1Benefits(id)).toBe(false);
  });

  it('tier0_ap_grant_then_expire → false (expire row written by the SYS expiry job)', () => {
    const db = new BetterSqlite3(dbPath);
    const { id, slug } = nextId('t0_exp');
    insertMember(db, { id, slug });
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'grant',
      new_active_player_expires_at: isoOffsetDays(-30),
      reason_code: 'official_event_attendance',
      created_at: '2025-01-01T00:00:00.000Z',
    });
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'expire',
      old_active_player_expires_at: isoOffsetDays(-30),
      new_active_player_expires_at: null,
      reason_code: 'sys_active_player_expiry_job',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    db.close();
    expect(predicates.hasTier1Benefits(id)).toBe(false);
  });
});

describe('hasTier1Benefits — Tier 1+ ignores AP ledger', () => {
  // The AP-current view zeroes is_active_player when tier_status != 'tier0',
  // so any AP grant on a Tier 1+ member is irrelevant to the predicate.
  // hasTier1Benefits returns true via the tier_status branch alone.
  it('tier1_with_ap_attempted → true', () => {
    const db = new BetterSqlite3(dbPath);
    const { id, slug } = nextId('t1_ap');
    createMemberAtTier(db, { id, slug, tier: 'tier1' });
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'grant',
      new_active_player_expires_at: isoOffsetDays(30),
      reason_code: 'official_event_attendance',
    });
    db.close();
    expect(predicates.hasTier1Benefits(id)).toBe(true);
  });

  it('tier2_with_ap_attempted → true', () => {
    const db = new BetterSqlite3(dbPath);
    const { id, slug } = nextId('t2_ap');
    createMemberAtTier(db, { id, slug, tier: 'tier2' });
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'grant',
      new_active_player_expires_at: isoOffsetDays(30),
      reason_code: 'official_event_attendance',
    });
    db.close();
    expect(predicates.hasTier1Benefits(id)).toBe(true);
  });

  it('tier3_with_ap_attempted → true', () => {
    const db = new BetterSqlite3(dbPath);
    const { id, slug } = nextId('t3_ap');
    createMemberAtTier(db, {
      id, slug, tier: 'tier3', underlying_tier_status: 'tier1',
      actor_member_id: ADMIN_ID,
    });
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'grant',
      new_active_player_expires_at: isoOffsetDays(30),
      reason_code: 'official_event_attendance',
    });
    db.close();
    expect(predicates.hasTier1Benefits(id)).toBe(true);
  });
});

describe('Factory smoke tests for the new ergonomic helpers', () => {
  // These pin the helper signatures so accidental drift in the helper's
  // side-effects (e.g. forgetting the underlying-tier ledger row) shows
  // up here rather than as a confusing failure in a downstream test.
  it('createMemberAtTier(tier3) writes the governance_set ledger row with the right underlying', () => {
    const db = new BetterSqlite3(dbPath);
    const { id, slug } = nextId('helper_t3');
    createMemberAtTier(db, {
      id, slug, tier: 'tier3', underlying_tier_status: 'tier2',
      actor_member_id: ADMIN_ID,
    });
    const latest = db
      .prepare(
        `SELECT change_type, new_tier_status, new_underlying_tier_status, reason_code
         FROM member_tier_grants WHERE member_id = ?`,
      )
      .get(id) as {
        change_type: string;
        new_tier_status: string;
        new_underlying_tier_status: string | null;
        reason_code: string;
      };
    db.close();
    expect(latest).toEqual({
      change_type: 'governance_set',
      new_tier_status: 'tier3',
      new_underlying_tier_status: 'tier2',
      reason_code: 'governance.tier3_set',
    });
  });

  it('createTier0WithActivePlayer writes a single AP grant row at the requested expiry', () => {
    const db = new BetterSqlite3(dbPath);
    const { id, slug } = nextId('helper_t0_ap');
    const expiresAt = isoOffsetDays(60);
    createTier0WithActivePlayer(db, { id, slug, expiresAt });
    const rows = db
      .prepare(
        `SELECT change_type, new_active_player_expires_at, reason_code
         FROM active_player_grants WHERE member_id = ?`,
      )
      .all(id) as Array<{
        change_type: string;
        new_active_player_expires_at: string | null;
        reason_code: string;
      }>;
    db.close();
    expect(rows).toEqual([
      { change_type: 'grant', new_active_player_expires_at: expiresAt, reason_code: 'official_event_attendance' },
    ]);
    // No tier grant row written.
    const db2 = new BetterSqlite3(dbPath);
    const tg = db2.prepare('SELECT count(*) as n FROM member_tier_grants WHERE member_id = ?').get(id) as { n: number };
    db2.close();
    expect(tg.n).toBe(0);
  });

  it('createMemberAtTier(tier3) without underlying_tier_status throws', () => {
    expect(() => {
      const db = new BetterSqlite3(dbPath);
      const { id, slug } = nextId('helper_t3_bad');
      try {
        createMemberAtTier(db, { id, slug, tier: 'tier3' });
      } finally {
        db.close();
      }
    }).toThrow(/underlying_tier_status/);
  });
});


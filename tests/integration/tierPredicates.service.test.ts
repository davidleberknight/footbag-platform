/**
 * Integration tests for tierPredicates.
 *
 * Covers the five-state truth table for hasTier1Benefits, isTier2Plus,
 * isTier3, plus NotFoundError propagation when called with an unknown
 * member id. Tier states are built using the existing tiering-service
 * write functions (applyPurchaseGrant, setGovernanceTier3) and the
 * existing insertActivePlayerGrant factory — the same pattern used by
 * tests/integration/membership-tiering.service.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertActivePlayerGrant,
  insertPayment,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3074');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let mts: typeof import('../../src/services/membershipTieringService');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let predicates: typeof import('../../src/services/tierPredicates');

const ADMIN_ID = 'member-admin';
const FUTURE_AP = '2099-01-01T00:00:00.000Z';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'pred_admin', is_admin: 1 });
  db.close();
  mts = await import('../../src/services/membershipTieringService');
  predicates = await import('../../src/services/tierPredicates');
});

afterAll(() => cleanupTestDb(dbPath));

let memberCounter = 0;
function freshMember(): string {
  const db = new BetterSqlite3(dbPath);
  memberCounter += 1;
  const id = `member-pred-${memberCounter}`;
  insertMember(db, { id, slug: `pred_${memberCounter}` });
  db.close();
  return id;
}

let paymentCounter = 0;
function freshPayment(memberId: string, tier: 'tier1' | 'tier2'): string {
  const db = new BetterSqlite3(dbPath);
  paymentCounter += 1;
  const id = `pay-pred-${paymentCounter}`;
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

function seedActivePlayer(memberId: string): void {
  const db = new BetterSqlite3(dbPath);
  insertActivePlayerGrant(db, {
    member_id: memberId,
    change_type: 'grant',
    new_active_player_expires_at: FUTURE_AP,
    reason_code: 'official_event_attendance',
  });
  db.close();
}

function makeTier1(memberId: string): void {
  mts.applyPurchaseGrant(memberId, memberId, freshPayment(memberId, 'tier1'), 'tier1');
}

function makeTier2(memberId: string): void {
  mts.applyPurchaseGrant(memberId, memberId, freshPayment(memberId, 'tier2'), 'tier2');
}

function makeTier3UnderlyingTier1(memberId: string): void {
  // tier0 → setGovernanceTier3 produces underlying='tier1' per service rule.
  mts.setGovernanceTier3(ADMIN_ID, memberId);
}

function makeTier3UnderlyingTier2(memberId: string): void {
  makeTier2(memberId);
  mts.setGovernanceTier3(ADMIN_ID, memberId);
}

describe('hasTier1Benefits', () => {
  it('returns false for tier0 member with no Active Player', () => {
    const id = freshMember();
    expect(predicates.hasTier1Benefits(id)).toBe(false);
  });

  it('returns true for tier0 member with current Active Player', () => {
    const id = freshMember();
    seedActivePlayer(id);
    expect(predicates.hasTier1Benefits(id)).toBe(true);
  });

  it('returns true for tier1 member', () => {
    const id = freshMember();
    makeTier1(id);
    expect(predicates.hasTier1Benefits(id)).toBe(true);
  });

  it('returns true for tier2 member', () => {
    const id = freshMember();
    makeTier2(id);
    expect(predicates.hasTier1Benefits(id)).toBe(true);
  });

  it('returns true for tier3 member with underlying tier1', () => {
    const id = freshMember();
    makeTier3UnderlyingTier1(id);
    expect(predicates.hasTier1Benefits(id)).toBe(true);
  });

  it('returns true for tier3 member with underlying tier2', () => {
    const id = freshMember();
    makeTier3UnderlyingTier2(id);
    expect(predicates.hasTier1Benefits(id)).toBe(true);
  });

  it('returns false for an unknown member id (NotFoundError caught; treated as no entitlement)', () => {
    expect(predicates.hasTier1Benefits('does-not-exist')).toBe(false);
  });
});

describe('isTier2Plus', () => {
  it('returns false for tier0 member with no Active Player', () => {
    const id = freshMember();
    expect(predicates.isTier2Plus(id)).toBe(false);
  });

  it('returns false for tier0 member with current Active Player', () => {
    // Active Player gives Tier 1 benefits but does not satisfy Tier 2+.
    const id = freshMember();
    seedActivePlayer(id);
    expect(predicates.isTier2Plus(id)).toBe(false);
  });

  it('returns false for tier1 member', () => {
    const id = freshMember();
    makeTier1(id);
    expect(predicates.isTier2Plus(id)).toBe(false);
  });

  it('returns true for tier2 member', () => {
    const id = freshMember();
    makeTier2(id);
    expect(predicates.isTier2Plus(id)).toBe(true);
  });

  it('returns true for tier3 member with underlying tier1', () => {
    const id = freshMember();
    makeTier3UnderlyingTier1(id);
    expect(predicates.isTier2Plus(id)).toBe(true);
  });

  it('returns true for tier3 member with underlying tier2', () => {
    const id = freshMember();
    makeTier3UnderlyingTier2(id);
    expect(predicates.isTier2Plus(id)).toBe(true);
  });

  it('returns false for an unknown member id (NotFoundError caught; treated as no entitlement)', () => {
    expect(predicates.isTier2Plus('does-not-exist')).toBe(false);
  });
});

describe('isTier3', () => {
  it('returns false for tier0 member with no Active Player', () => {
    const id = freshMember();
    expect(predicates.isTier3(id)).toBe(false);
  });

  it('returns false for tier0 member with current Active Player', () => {
    const id = freshMember();
    seedActivePlayer(id);
    expect(predicates.isTier3(id)).toBe(false);
  });

  it('returns false for tier1 member', () => {
    const id = freshMember();
    makeTier1(id);
    expect(predicates.isTier3(id)).toBe(false);
  });

  it('returns false for tier2 member', () => {
    const id = freshMember();
    makeTier2(id);
    expect(predicates.isTier3(id)).toBe(false);
  });

  it('returns true for tier3 member with underlying tier1', () => {
    const id = freshMember();
    makeTier3UnderlyingTier1(id);
    expect(predicates.isTier3(id)).toBe(true);
  });

  it('returns true for tier3 member with underlying tier2', () => {
    const id = freshMember();
    makeTier3UnderlyingTier2(id);
    expect(predicates.isTier3(id)).toBe(true);
  });

  it('returns false for an unknown member id (NotFoundError caught; treated as no entitlement)', () => {
    expect(predicates.isTier3('does-not-exist')).toBe(false);
  });
});

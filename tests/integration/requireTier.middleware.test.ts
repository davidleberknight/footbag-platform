/**
 * requireTier* middleware integration tests.
 *
 * Exercise each middleware factory's branches against the REAL tierPredicates
 * service backed by a real SQLite DB. The unit-test version of this file
 * mocked tierPredicates with vi.mock; that hid signature drift in the
 * predicate module and gave no end-to-end coverage that the middleware's
 * pre-DB defensive branches behave correctly.
 *
 * Defensive bypass (req.user null): tested without DB rows; the middleware
 * must short-circuit to 403 before any predicate call so an unauthenticated
 * request that somehow reached this layer cannot leak past.
 *
 * Predicate-true / predicate-false branches: tested with real members at
 * each tier grant level. The membership predicate's truth table is
 * exhaustively covered by tierPredicates.service.test.ts; this file confirms
 * the middleware composes that predicate correctly under realistic inputs
 * (admin short-circuit included).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { SessionUser } from '../../src/middleware/auth';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertMemberTierGrant, insertActivePlayerGrant } from '../fixtures/factories';

const { dbPath } = setTestEnv('3155');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let middlewareMod: typeof import('../../src/middleware/requireTier');

const MEMBER_TIER0 = 'rt-mid-tier0';
const MEMBER_TIER1 = 'rt-mid-tier1';
const MEMBER_TIER2 = 'rt-mid-tier2';
const MEMBER_TIER3 = 'rt-mid-tier3';
const MEMBER_T0_AP = 'rt-mid-t0-ap';
const MEMBER_ADMIN = 'rt-mid-admin';

const FUTURE_AP = '2099-01-01T00:00:00.000Z';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_TIER0, slug: 'rt_t0' });
  insertMember(db, { id: MEMBER_TIER1, slug: 'rt_t1' });
  insertMember(db, { id: MEMBER_TIER2, slug: 'rt_t2' });
  insertMember(db, { id: MEMBER_TIER3, slug: 'rt_t3' });
  insertMember(db, { id: MEMBER_T0_AP, slug: 'rt_t0_ap' });
  insertMember(db, { id: MEMBER_ADMIN, slug: 'rt_admin', is_admin: 1 });

  insertMemberTierGrant(db, { member_id: MEMBER_TIER1, new_tier_status: 'tier1' });
  insertMemberTierGrant(db, { member_id: MEMBER_TIER2, new_tier_status: 'tier2' });
  insertMemberTierGrant(db, {
    member_id: MEMBER_TIER3,
    actor_member_id: MEMBER_ADMIN,
    change_type: 'governance_set',
    new_tier_status: 'tier3',
    new_underlying_tier_status: 'tier1',
    reason_code: 'governance.tier3_set',
  });
  insertActivePlayerGrant(db, {
    member_id: MEMBER_T0_AP,
    change_type: 'grant',
    new_active_player_expires_at: FUTURE_AP,
    reason_code: 'official_event_attendance',
  });
  // MEMBER_ADMIN intentionally has NO tier grant — verifies the
  // tierPredicates admin short-circuit makes the middleware accept.

  db.close();
  middlewareMod = await import('../../src/middleware/requireTier');
});

afterAll(() => cleanupTestDb(dbPath));

function makeReq(user: SessionUser | null): Request {
  return { user } as unknown as Request;
}

function makeRes() {
  const render = vi.fn();
  const status = vi.fn().mockReturnValue({ render });
  const res = { status } as unknown as Response;
  return { res, status, render };
}

function userOf(memberId: string, role: 'member' | 'admin' = 'member'): SessionUser {
  return { userId: memberId, slug: 'irrelevant', role };
}

describe('requireTier1Benefits', () => {
  it('returns 403 when req.user is null (defensive bypass guard)', () => {
    const { res, status, render } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    middlewareMod.requireTier1Benefits()(makeReq(null), res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(render).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for tier0 member with no AP', () => {
    const { res, status, render } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    middlewareMod.requireTier1Benefits()(makeReq(userOf(MEMBER_TIER0)), res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(render).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for tier0 member with active AP', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    middlewareMod.requireTier1Benefits()(makeReq(userOf(MEMBER_T0_AP)), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('calls next() for tier1 member', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    middlewareMod.requireTier1Benefits()(makeReq(userOf(MEMBER_TIER1)), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('calls next() for admin member with no tier grant (short-circuit)', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    middlewareMod.requireTier1Benefits()(makeReq(userOf(MEMBER_ADMIN, 'admin')), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });
});

describe('requireTier2Plus', () => {
  it('returns 403 when req.user is null', () => {
    const { res, status, render } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    middlewareMod.requireTier2Plus()(makeReq(null), res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(render).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for tier1 member', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    middlewareMod.requireTier2Plus()(makeReq(userOf(MEMBER_TIER1)), res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for tier2 member', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    middlewareMod.requireTier2Plus()(makeReq(userOf(MEMBER_TIER2)), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('calls next() for tier3 member', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    middlewareMod.requireTier2Plus()(makeReq(userOf(MEMBER_TIER3)), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('calls next() for admin member with no tier grant', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    middlewareMod.requireTier2Plus()(makeReq(userOf(MEMBER_ADMIN, 'admin')), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });
});

describe('requireTier3', () => {
  it('returns 403 when req.user is null', () => {
    const { res, status, render } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    middlewareMod.requireTier3()(makeReq(null), res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(render).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for tier2 member', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    middlewareMod.requireTier3()(makeReq(userOf(MEMBER_TIER2)), res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for tier3 member', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    middlewareMod.requireTier3()(makeReq(userOf(MEMBER_TIER3)), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('calls next() for admin member with no tier grant', () => {
    const { res, status } = makeRes();
    const next = vi.fn() as unknown as NextFunction;
    middlewareMod.requireTier3()(makeReq(userOf(MEMBER_ADMIN, 'admin')), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });
});

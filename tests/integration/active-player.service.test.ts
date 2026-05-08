/**
 * Integration tests for activePlayerService.
 *
 * Covers AP service surface edge cases:
 *   - applyAttendance: grant, extend, no-shorten, registration idempotency,
 *     Tier 1+ no-op, validation
 *   - applyVouch: grant + paired vouch row, target Tier 1+ no-op, self-vouch
 *     rejection, voucher-tier validation, rate-limit, no-shorten
 *   - applyClubJoin: lifetime one-time idempotency (broader than the schema
 *     unique index), Tier 1+ no-op, FK validation
 *   - applyExpiry: writes an `expire` row exactly once per crossing
 *   - getStatus: returns shape from member_active_player_current
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertEvent,
  insertClub,
  insertRegistration,
  insertMemberClubAffiliation,
  insertActivePlayerGrant,
  insertMemberTierGrant,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3092');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let aps: typeof import('../../src/services/activePlayerService');

const PAST_AP = '2020-01-01T00:00:00.000Z';
const FUTURE_AP = '2099-01-01T00:00:00.000Z';
const NEAR_FUTURE_AP = '2027-01-01T00:00:00.000Z';
const ACTOR_ID = 'member-ap-actor';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ACTOR_ID, slug: 'ap_actor', is_admin: 1 });
  // Seed the system_config keys the service reads.
  const cfg = db.prepare(`
    INSERT INTO system_config (
      id, created_at,
      config_key, value_json, effective_start_at, reason_text
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  cfg.run('cfg-apdays', '2025-01-01T00:00:00.000Z',
    'active_player_duration_days', '730',
    '2025-01-01T00:00:00.000Z', 'seed');
  cfg.run('cfg-vouchmax', '2025-01-01T00:00:00.000Z',
    'vouch_rate_limit_max_per_hour', '5',
    '2025-01-01T00:00:00.000Z', 'seed');
  cfg.run('cfg-vouchwin', '2025-01-01T00:00:00.000Z',
    'vouch_rate_limit_window_minutes', '60',
    '2025-01-01T00:00:00.000Z', 'seed');
  db.close();
  aps = await import('../../src/services/activePlayerService');
});

afterAll(() => cleanupTestDb(dbPath));

let memberCounter = 0;
function freshMember(): string {
  const db = new BetterSqlite3(dbPath);
  memberCounter += 1;
  const id = `member-ap-${memberCounter}`;
  insertMember(db, { id, slug: `ap_${memberCounter}` });
  db.close();
  return id;
}

function setMemberTier(memberId: string, tier: 'tier0' | 'tier1' | 'tier2' | 'tier3'): void {
  if (tier === 'tier0') return;
  const db = new BetterSqlite3(dbPath);
  insertMemberTierGrant(db, {
    member_id: memberId,
    change_type: tier === 'tier3' ? 'governance_set' : 'grant',
    new_tier_status: tier,
    new_underlying_tier_status: tier === 'tier3' ? 'tier1' : null,
    reason_code:
      tier === 'tier3' ? 'governance.tier3_set'
        : tier === 'tier2' ? 'purchase.tier2'
          : 'purchase.tier1',
  });
  db.close();
}

interface ApGrantRow {
  id: string;
  change_type: string;
  old_active_player_expires_at: string | null;
  new_active_player_expires_at: string | null;
  reason_code: string;
  reason_text: string | null;
  related_event_id: string | null;
  related_registration_id: string | null;
  related_club_id: string | null;
  related_club_affiliation_id: string | null;
  related_vouch_id: string | null;
  actor_member_id: string | null;
}

function apGrants(memberId: string): ApGrantRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT id, change_type,
              old_active_player_expires_at, new_active_player_expires_at,
              reason_code, reason_text,
              related_event_id, related_registration_id, related_club_id,
              related_club_affiliation_id, related_vouch_id,
              actor_member_id
       FROM active_player_grants
       WHERE member_id = ?
       ORDER BY created_at, id`,
    )
    .all(memberId) as ApGrantRow[];
  db.close();
  return rows;
}

function vouchRows(targetId: string): Array<{
  id: string;
  voucher_member_id: string;
  reason_text: string | null;
  new_active_player_expires_at: string | null;
}> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT id, voucher_member_id, reason_text, new_active_player_expires_at
       FROM active_player_vouches
       WHERE target_member_id = ?
       ORDER BY created_at, id`,
    )
    .all(targetId) as Array<{
      id: string;
      voucher_member_id: string;
      reason_text: string | null;
      new_active_player_expires_at: string | null;
    }>;
  db.close();
  return rows;
}

function auditCount(entityId: string, actionType: string): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_entries
       WHERE entity_id = ? AND action_type = ?`,
    )
    .get(entityId, actionType) as { n: number };
  db.close();
  return row.n;
}

function buildEvent(): { eventId: string } {
  const db = new BetterSqlite3(dbPath);
  const eventId = insertEvent(db, { end_date: '2026-06-03' });
  db.close();
  return { eventId };
}

function buildRegistration(eventId: string, memberId: string): string {
  const db = new BetterSqlite3(dbPath);
  const regId = insertRegistration(db, eventId, memberId);
  db.close();
  return regId;
}

describe('getStatus', () => {
  it('returns inactive defaults for a member with no AP rows', () => {
    const id = freshMember();
    expect(aps.getStatus(id)).toEqual({
      is_active_player: 0,
      active_player_expires_at: null,
      latest_active_player_reason_code: null,
    });
  });

  it('reports is_active_player=1 when latest grant has future expiry and tier=tier0', () => {
    const id = freshMember();
    const db = new BetterSqlite3(dbPath);
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'grant',
      new_active_player_expires_at: FUTURE_AP,
      reason_code: 'official_event_attendance',
    });
    db.close();
    const status = aps.getStatus(id);
    expect(status.is_active_player).toBe(1);
    expect(status.active_player_expires_at).toBe(FUTURE_AP);
    expect(status.latest_active_player_reason_code).toBe('official_event_attendance');
  });

  it('reports is_active_player=0 when tier is tier1+ even if AP rows exist', () => {
    const id = freshMember();
    const db = new BetterSqlite3(dbPath);
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'grant',
      new_active_player_expires_at: FUTURE_AP,
    });
    db.close();
    setMemberTier(id, 'tier1');
    const status = aps.getStatus(id);
    expect(status.is_active_player).toBe(0);
    expect(status.active_player_expires_at).toBeNull();
  });
});

describe('applyAttendance', () => {
  it('Tier 0 first attendance: writes a `grant` row with future expiry', () => {
    const id = freshMember();
    const { eventId } = buildEvent();
    const regId = buildRegistration(eventId, id);

    const result = aps.applyAttendance(ACTOR_ID, id, regId, '2026-06-03');

    expect(result.status).toBe('granted');
    const rows = apGrants(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      change_type: 'grant',
      reason_code: 'official_event_attendance',
      related_registration_id: regId,
      related_event_id: eventId,
    });
    expect(rows[0].new_active_player_expires_at).toBeTruthy();
  });

  it('Tier 0 second attendance: writes an `extend` row when later expiry', () => {
    const id = freshMember();
    const { eventId: e1 } = buildEvent();
    const r1 = buildRegistration(e1, id);
    const { eventId: e2 } = buildEvent();
    const r2 = buildRegistration(e2, id);

    aps.applyAttendance(ACTOR_ID, id, r1, '2026-06-03');
    const result = aps.applyAttendance(ACTOR_ID, id, r2, '2027-06-03');

    expect(result.status).toBe('extended');
    const rows = apGrants(id);
    expect(rows).toHaveLength(2);
    expect(rows[1].change_type).toBe('extend');
    expect(rows[1].old_active_player_expires_at).toBe(rows[0].new_active_player_expires_at);
  });

  it('no-shorten rule: an earlier-event attendance after a later-event attendance is a no-op', () => {
    const id = freshMember();
    const { eventId: e1 } = buildEvent();
    const r1 = buildRegistration(e1, id);
    const { eventId: e2 } = buildEvent();
    const r2 = buildRegistration(e2, id);

    aps.applyAttendance(ACTOR_ID, id, r1, '2027-06-03');
    const result = aps.applyAttendance(ACTOR_ID, id, r2, '2026-06-03');

    expect(result).toEqual({ status: 'noop', reason: 'no_shorten' });
    expect(apGrants(id)).toHaveLength(1);
    expect(auditCount(id, 'active_player.attendance_noop')).toBe(1);
  });

  it('per-registration idempotency: second call for same registrationId is a no-op', () => {
    const id = freshMember();
    const { eventId } = buildEvent();
    const regId = buildRegistration(eventId, id);

    aps.applyAttendance(ACTOR_ID, id, regId, '2026-06-03');
    const result = aps.applyAttendance(ACTOR_ID, id, regId, '2030-06-03');

    expect(result).toEqual({ status: 'noop', reason: 'already_processed' });
    expect(apGrants(id)).toHaveLength(1);
  });

  it('Tier 1+ member: returns no-op and writes only the audit entry', () => {
    const id = freshMember();
    setMemberTier(id, 'tier1');
    const { eventId } = buildEvent();
    const regId = buildRegistration(eventId, id);

    const result = aps.applyAttendance(ACTOR_ID, id, regId, '2026-06-03');

    expect(result).toEqual({ status: 'noop', reason: 'tier1_plus_no_op' });
    expect(apGrants(id)).toHaveLength(0);
    expect(auditCount(id, 'active_player.attendance_noop')).toBe(1);
  });

  it('rejects an unknown registrationId', () => {
    const id = freshMember();
    expect(() =>
      aps.applyAttendance(ACTOR_ID, id, 'reg-bogus', '2026-06-03'),
    ).toThrow(/registration .* not found/);
  });

  it('rejects a registration that belongs to a different member', () => {
    const idA = freshMember();
    const idB = freshMember();
    const { eventId } = buildEvent();
    const regA = buildRegistration(eventId, idA);
    expect(() => aps.applyAttendance(ACTOR_ID, idB, regA, '2026-06-03')).toThrow(
      /does not belong to member/,
    );
  });

  it('rejects a malformed eventEndDate', () => {
    const id = freshMember();
    const { eventId } = buildEvent();
    const regId = buildRegistration(eventId, id);
    expect(() => aps.applyAttendance(ACTOR_ID, id, regId, 'not-a-date')).toThrow(
      /invalid eventEndDate/,
    );
  });
});

describe('applyVouch', () => {
  function buildVoucher(tier: 'tier1' | 'tier2' | 'tier3' = 'tier2'): string {
    const id = freshMember();
    setMemberTier(id, tier);
    return id;
  }

  it('Tier 2 → Tier 0: writes vouch row + AP grant row in same transaction', () => {
    const voucher = buildVoucher('tier2');
    const target = freshMember();

    const result = aps.applyVouch(voucher, target, 'looks great');

    expect(result.status).toBe('granted');
    const grants = apGrants(target);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      change_type: 'grant',
      reason_code: 'tier2_vouch_active_player',
      reason_text: 'looks great',
      actor_member_id: voucher,
    });
    expect(grants[0].related_vouch_id).toBeTruthy();

    const vouches = vouchRows(target);
    expect(vouches).toHaveLength(1);
    expect(vouches[0].voucher_member_id).toBe(voucher);
    expect(vouches[0].reason_text).toBe('looks great');
    // AP grant row's related_vouch_id matches the vouch row id.
    expect(grants[0].related_vouch_id).toBe(vouches[0].id);
  });

  it('Tier 3 voucher is allowed', () => {
    const voucher = buildVoucher('tier3');
    const target = freshMember();
    const result = aps.applyVouch(voucher, target, 'fine');
    expect(result.status).toBe('granted');
  });

  it('Tier 1 voucher is rejected', () => {
    const voucher = buildVoucher('tier1');
    const target = freshMember();
    expect(() => aps.applyVouch(voucher, target, 'no')).toThrow(
      /must be Tier 2 or Tier 3/,
    );
  });

  it('Tier 0 voucher is rejected', () => {
    const voucher = freshMember();
    const target = freshMember();
    expect(() => aps.applyVouch(voucher, target, 'no')).toThrow(
      /must be Tier 2 or Tier 3/,
    );
  });

  it('target Tier 1+: returns no-op (no vouch row, no AP row, audit-only)', () => {
    const voucher = buildVoucher('tier2');
    const target = freshMember();
    setMemberTier(target, 'tier1');

    const result = aps.applyVouch(voucher, target, 'try');

    expect(result).toEqual({ status: 'noop', reason: 'tier1_plus_no_op' });
    expect(apGrants(target)).toHaveLength(0);
    expect(vouchRows(target)).toHaveLength(0);
    expect(auditCount(target, 'active_player.vouch_noop')).toBe(1);
  });

  it('rejects self-vouch at the service layer (DB CHECK is the backstop)', () => {
    const voucher = buildVoucher('tier2');
    expect(() => aps.applyVouch(voucher, voucher, 'me')).toThrow(/yourself/);
    expect(vouchRows(voucher)).toHaveLength(0);
  });

  it('rejects oversized reason text (1MB)', () => {
    const voucher = buildVoucher('tier2');
    const target = freshMember();
    const huge = 'x'.repeat(1_000_000);
    expect(() => aps.applyVouch(voucher, target, huge)).toThrow(/exceeds/);
    expect(apGrants(target)).toHaveLength(0);
    expect(vouchRows(target)).toHaveLength(0);
  });

  it('preserves unicode mischief verbatim in vouch and AP grant rows', () => {
    const voucher = buildVoucher('tier2');
    const target = freshMember();
    const sneaky = '‮reversed‬ + ‍joiner';

    aps.applyVouch(voucher, target, sneaky);

    expect(vouchRows(target)[0].reason_text).toBe(sneaky);
    expect(apGrants(target)[0].reason_text).toBe(sneaky);
  });

  it('rate-limit: 6th vouch within window throws RateLimitedError', async () => {
    const voucher = buildVoucher('tier2');
    // Five distinct targets, all under the limit.
    for (let i = 0; i < 5; i += 1) {
      const target = freshMember();
      aps.applyVouch(voucher, target, `vouch ${i}`);
    }
    const sixthTarget = freshMember();
    const { RateLimitedError } = await import('../../src/services/serviceErrors');
    expect(() => aps.applyVouch(voucher, sixthTarget, 'too many')).toThrow(
      RateLimitedError,
    );
    // No AP row written for the rejected target.
    expect(apGrants(sixthTarget)).toHaveLength(0);
  });

  it('rate-limit: no-op vouches against Tier 1+ targets do NOT consume the limit', () => {
    // Target-tier check runs before the rate-limit check, so no-op vouches
    // bypass the limiter. Verify by performing 5 no-op vouches and then a
    // real vouch that should still succeed.
    const voucher = buildVoucher('tier2');
    for (let i = 0; i < 5; i += 1) {
      const target = freshMember();
      setMemberTier(target, 'tier1');
      aps.applyVouch(voucher, target, `noop ${i}`);
    }
    const realTarget = freshMember();
    const result = aps.applyVouch(voucher, realTarget, 'real');
    expect(result.status).toBe('granted');
  });
});

describe('applyClubJoin', () => {
  function buildAffiliation(memberId: string): string {
    const db = new BetterSqlite3(dbPath);
    const clubId = insertClub(db);
    const affId = insertMemberClubAffiliation(db, memberId, clubId);
    db.close();
    return affId;
  }

  it('Tier 0 with no AP history: writes a one-time grant row', () => {
    const id = freshMember();
    const affId = buildAffiliation(id);

    const result = aps.applyClubJoin(ACTOR_ID, id, affId);

    expect(result.status).toBe('granted');
    const rows = apGrants(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      change_type: 'grant',
      reason_code: 'club_join_one_time_active_player_grant',
      related_club_affiliation_id: affId,
    });
    expect(rows[0].related_club_id).toBeTruthy();
  });

  it('lifetime idempotency: second call after a prior AP row is a no-op (broader than schema unique)', () => {
    const id = freshMember();
    // Seed a prior AP row from attendance (different reason_code than club-join).
    const db = new BetterSqlite3(dbPath);
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'grant',
      new_active_player_expires_at: FUTURE_AP,
      reason_code: 'official_event_attendance',
    });
    db.close();
    const affId = buildAffiliation(id);

    const result = aps.applyClubJoin(ACTOR_ID, id, affId);

    expect(result).toEqual({
      status: 'noop',
      reason: 'already_active_player_history',
    });
    // No new club-join row should have been added.
    expect(
      apGrants(id).filter(
        (r) => r.reason_code === 'club_join_one_time_active_player_grant',
      ),
    ).toHaveLength(0);
  });

  it('blocked even after a prior expired AP row (lifetime scope is "ever AP", not "current AP")', () => {
    const id = freshMember();
    const db = new BetterSqlite3(dbPath);
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'grant',
      new_active_player_expires_at: PAST_AP,
      reason_code: 'official_event_attendance',
    });
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'expire',
      new_active_player_expires_at: null,
      reason_code: 'active_player_expired',
    });
    db.close();
    const affId = buildAffiliation(id);

    const result = aps.applyClubJoin(ACTOR_ID, id, affId);

    expect(result.status).toBe('noop');
  });

  it('Tier 1+ target: returns no-op and writes only the audit entry', () => {
    const id = freshMember();
    setMemberTier(id, 'tier1');
    const affId = buildAffiliation(id);

    const result = aps.applyClubJoin(ACTOR_ID, id, affId);

    expect(result).toEqual({ status: 'noop', reason: 'tier1_plus_no_op' });
    expect(apGrants(id)).toHaveLength(0);
  });

  it('rejects an affiliation that belongs to a different member', () => {
    const idA = freshMember();
    const idB = freshMember();
    const affA = buildAffiliation(idA);
    expect(() => aps.applyClubJoin(ACTOR_ID, idB, affA)).toThrow(
      /does not belong to member/,
    );
  });

  it('rejects an unknown affiliationId', () => {
    const id = freshMember();
    expect(() => aps.applyClubJoin(ACTOR_ID, id, 'aff-bogus')).toThrow(
      /not found/,
    );
  });
});

describe('applyExpiry', () => {
  it('writes an `expire` row when latest grant has past expiry', () => {
    const id = freshMember();
    const db = new BetterSqlite3(dbPath);
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'grant',
      new_active_player_expires_at: PAST_AP,
      reason_code: 'official_event_attendance',
    });
    db.close();

    const result = aps.applyExpiry(id);

    expect(result).toEqual({ ok: true, expired: true });
    const rows = apGrants(id);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      change_type: 'expire',
      reason_code: 'active_player_expired',
      new_active_player_expires_at: null,
    });
  });

  it('no-op when latest grant is already `expire`', () => {
    const id = freshMember();
    const db = new BetterSqlite3(dbPath);
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'grant',
      new_active_player_expires_at: PAST_AP,
    });
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'expire',
      new_active_player_expires_at: null,
      reason_code: 'active_player_expired',
    });
    db.close();

    const result = aps.applyExpiry(id);

    expect(result).toEqual({ ok: true, expired: false });
    expect(apGrants(id)).toHaveLength(2);
  });

  it('no-op when latest expiry is still in the future', () => {
    const id = freshMember();
    const db = new BetterSqlite3(dbPath);
    insertActivePlayerGrant(db, {
      member_id: id,
      change_type: 'grant',
      new_active_player_expires_at: NEAR_FUTURE_AP,
    });
    db.close();

    const result = aps.applyExpiry(id);

    expect(result).toEqual({ ok: true, expired: false });
    expect(apGrants(id)).toHaveLength(1);
  });

  it('no-op when member has no AP rows at all', () => {
    const id = freshMember();
    const result = aps.applyExpiry(id);
    expect(result).toEqual({ ok: true, expired: false });
  });
});

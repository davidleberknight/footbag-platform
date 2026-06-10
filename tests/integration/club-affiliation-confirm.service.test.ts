/**
 * Service-level integration tests for clubService.confirmAffiliation —
 * the wizard's membership-card transition path. Exercises the schema
 * CHECK contract (resolution_status='confirmed_current' requires
 * resolved_club_id), the pre_populate-only scope (wizard never creates
 * clubs), the two-current-club cap, and same-club idempotency.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertClub,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertMemberClubAffiliation,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3161');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/clubService').clubService;

interface AffiliationDbRow {
  resolution_status: string;
  resolved_club_id:  string | null;
}

interface MemberAffiliationRow {
  member_id:  string;
  club_id:    string;
  is_current: number;
  is_primary: number;
  source:     string;
}

function readAffiliation(id: string): AffiliationDbRow {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db
    .prepare(`SELECT resolution_status, resolved_club_id FROM legacy_person_club_affiliations WHERE id = ?`)
    .get(id) as AffiliationDbRow;
  db.close();
  return row;
}

function readMemberAffiliations(memberId: string): MemberAffiliationRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT member_id, club_id, is_current, is_primary, source
         FROM member_club_affiliations WHERE member_id = ? ORDER BY rowid`,
    )
    .all(memberId) as MemberAffiliationRow[];
  db.close();
  return rows;
}

function readClubsCount(): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(`SELECT COUNT(*) AS c FROM clubs`).get() as { c: number };
  db.close();
  return row.c;
}

const MEMBER_PRE_POPULATE = 'member-confirm-pre';
const MEMBER_DECLINE      = 'member-confirm-decline';
const MEMBER_IDEMPOTENT   = 'member-confirm-idempotent';
const MEMBER_NO_MAPPED    = 'member-confirm-no-mapped';
const MEMBER_CROSS_CLUB   = 'member-confirm-cross-club';
const MEMBER_THREE_CAP    = 'member-confirm-three-cap';
const MEMBER_FORMER       = 'member-confirm-former';
const MEMBER_SAME_CLUB    = 'member-confirm-same-club';

let prePopulateClubId   = '';
let prePopulateAffId    = '';
let declineAffId        = '';
let idempotentAffId     = '';
let noMappedAffId       = '';
let crossClubA          = '';
let crossClubB          = '';
let crossAffB           = '';
let threeCapClubC       = '';
let threeCapAffC        = '';
let formerClubC         = '';
let formerAffC          = '';
let sameClubAffId       = '';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // ── pre_populate happy path ──
  insertMember(db, { id: MEMBER_PRE_POPULATE, slug: 'm_confirm_pre', login_email: 'pre@example.com', legacy_member_id: 'lm-pre' });
  prePopulateClubId = insertClub(db, { name: 'Confirmable Club' });
  const candPre = insertLegacyClubCandidate(db, {
    classification:  'pre_populate',
    mapped_club_id:  prePopulateClubId,
    display_name:    'Confirmable Club',
  });
  prePopulateAffId = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-pre',
    legacy_club_candidate_id: candPre,
    confidence_score:         0.9,
  });

  // ── decline branch ──
  insertMember(db, { id: MEMBER_DECLINE, slug: 'm_confirm_decline', login_email: 'decline@example.com', legacy_member_id: 'lm-decline' });
  const declineClubId = insertClub(db, { name: 'Decline Target Club' });
  const candDecline = insertLegacyClubCandidate(db, {
    classification:  'pre_populate',
    mapped_club_id:  declineClubId,
  });
  declineAffId = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-decline',
    legacy_club_candidate_id: candDecline,
    confidence_score:         0.5,
  });

  // ── idempotent re-submit (already confirmed) ──
  insertMember(db, { id: MEMBER_IDEMPOTENT, slug: 'm_confirm_idem', login_email: 'idem@example.com', legacy_member_id: 'lm-idem' });
  const idempotentClubId = insertClub(db, { name: 'Idempotent Confirm Club' });
  const candIdem = insertLegacyClubCandidate(db, {
    classification:  'pre_populate',
    mapped_club_id:  idempotentClubId,
  });
  idempotentAffId = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-idem',
    legacy_club_candidate_id: candIdem,
    confidence_score:         0.7,
  });

  // ── candidate without mapped_club_id (onboarding_visible, dormant, junk) ──
  insertMember(db, { id: MEMBER_NO_MAPPED, slug: 'm_confirm_no_mapped', login_email: 'nomap@example.com', legacy_member_id: 'lm-nomap' });
  const candNoMapped = insertLegacyClubCandidate(db, {
    classification:  'onboarding_visible',
    mapped_club_id:  null,
  });
  noMappedAffId = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-nomap',
    legacy_club_candidate_id: candNoMapped,
  });

  // ── cross-club current-affiliation conflict ──
  insertMember(db, { id: MEMBER_CROSS_CLUB, slug: 'm_confirm_cross', login_email: 'cross@example.com', legacy_member_id: 'lm-cross-confirm' });
  crossClubA = insertClub(db, { name: 'Cross-confirm Club A (existing current)' });
  crossClubB = insertClub(db, { name: 'Cross-confirm Club B (new claim)' });
  // Pre-existing is_current=1 primary affiliation at club A.
  db.prepare(`
    INSERT INTO member_club_affiliations (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, club_id, is_current, is_primary, is_contact, source
    ) VALUES ('mca-pre-cross-confirm',
              '2025-01-01T00:00:00.000Z', 'test', '2025-01-01T00:00:00.000Z', 'test', 1,
              ?, ?, 1, 1, 0, 'admin')
  `).run(MEMBER_CROSS_CLUB, crossClubA);
  const candCrossB = insertLegacyClubCandidate(db, {
    classification: 'pre_populate',
    mapped_club_id: crossClubB,
  });
  crossAffB = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-cross-confirm',
    legacy_club_candidate_id: candCrossB,
    confidence_score:         0.9,
  });

  // ── three-club cap (member already has 2 current clubs) ──
  insertMember(db, { id: MEMBER_THREE_CAP, slug: 'm_confirm_three_cap', login_email: 'threecap@example.com', legacy_member_id: 'lm-three-cap' });
  const capClubA = insertClub(db, { name: 'Cap Club A' });
  const capClubB = insertClub(db, { name: 'Cap Club B' });
  threeCapClubC = insertClub(db, { name: 'Cap Club C (should be blocked)' });
  insertMemberClubAffiliation(db, MEMBER_THREE_CAP, capClubA, { is_current: 1, is_primary: 1, source: 'admin' });
  insertMemberClubAffiliation(db, MEMBER_THREE_CAP, capClubB, { is_current: 1, is_primary: 0, source: 'admin' });
  const candCapC = insertLegacyClubCandidate(db, {
    classification: 'pre_populate',
    mapped_club_id: threeCapClubC,
  });
  threeCapAffC = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-three-cap',
    legacy_club_candidate_id: candCapC,
    confidence_score:         0.8,
  });

  // ── former clubs don't count toward cap ──
  insertMember(db, { id: MEMBER_FORMER, slug: 'm_confirm_former', login_email: 'former@example.com', legacy_member_id: 'lm-former' });
  const formerClubA = insertClub(db, { name: 'Former Club A (current)' });
  const formerClubB = insertClub(db, { name: 'Former Club B (former)' });
  formerClubC = insertClub(db, { name: 'Former Club C (new claim)' });
  insertMemberClubAffiliation(db, MEMBER_FORMER, formerClubA, { is_current: 1, is_primary: 1, source: 'admin' });
  insertMemberClubAffiliation(db, MEMBER_FORMER, formerClubB, { is_current: 0, source: 'admin' });
  const candFormerC = insertLegacyClubCandidate(db, {
    classification: 'pre_populate',
    mapped_club_id: formerClubC,
  });
  formerAffC = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-former',
    legacy_club_candidate_id: candFormerC,
    confidence_score:         0.7,
  });

  // ── same-club idempotency under two-club cap ──
  insertMember(db, { id: MEMBER_SAME_CLUB, slug: 'm_confirm_same_club', login_email: 'sameclub@example.com', legacy_member_id: 'lm-same-club' });
  const sameClub = insertClub(db, { name: 'Same Club (already current)' });
  insertMemberClubAffiliation(db, MEMBER_SAME_CLUB, sameClub, { is_current: 1, is_primary: 1, source: 'admin' });
  const candSame = insertLegacyClubCandidate(db, {
    classification: 'pre_populate',
    mapped_club_id: sameClub,
  });
  sameClubAffId = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-same-club',
    legacy_club_candidate_id: candSame,
    confidence_score:         0.8,
  });

  db.close();

  const mod = await import('../../src/services/clubService');
  svc = mod.clubService;
});

afterAll(() => cleanupTestDb(dbPath));

describe('clubService.confirmAffiliation — pre_populate happy path', () => {
  it('confirm transitions row to confirmed_current, stamps resolved_club_id, inserts member_club_affiliation', () => {
    const clubsBefore = readClubsCount();
    const result = svc.confirmAffiliation(prePopulateAffId, MEMBER_PRE_POPULATE, 'confirm');

    expect(result.branch).toBe('confirmed');
    expect(result.resolvedClubId).toBe(prePopulateClubId);
    expect(result.newAffiliationId).toBeTruthy();

    const row = readAffiliation(prePopulateAffId);
    expect(row.resolution_status).toBe('confirmed_current');
    expect(row.resolved_club_id).toBe(prePopulateClubId);

    const affs = readMemberAffiliations(MEMBER_PRE_POPULATE);
    expect(affs).toHaveLength(1);
    expect(affs[0]).toMatchObject({
      club_id:    prePopulateClubId,
      is_current: 1,
      is_primary: 1,
      source:     'legacy_claim',
    });

    // Wizard never creates clubs (M_Complete_Onboarding_Wizard rule).
    expect(readClubsCount()).toBe(clubsBefore);
  });
});

describe('clubService.confirmAffiliation — decline branch', () => {
  it('decline transitions row to rejected; no member_club_affiliations row written', () => {
    const result = svc.confirmAffiliation(declineAffId, MEMBER_DECLINE, 'decline');

    expect(result.branch).toBe('declined');
    expect(result.resolvedClubId).toBeNull();
    expect(result.newAffiliationId).toBeNull();

    const row = readAffiliation(declineAffId);
    expect(row.resolution_status).toBe('rejected');
    expect(row.resolved_club_id).toBeNull();

    expect(readMemberAffiliations(MEMBER_DECLINE)).toHaveLength(0);
  });
});

describe('clubService.confirmAffiliation — idempotency', () => {
  it('re-submitting confirm on an already-confirmed row is a no-op', () => {
    const first = svc.confirmAffiliation(idempotentAffId, MEMBER_IDEMPOTENT, 'confirm');
    expect(first.branch).toBe('confirmed');

    const afterFirst = readAffiliation(idempotentAffId);
    expect(afterFirst.resolution_status).toBe('confirmed_current');
    expect(readMemberAffiliations(MEMBER_IDEMPOTENT)).toHaveLength(1);

    const second = svc.confirmAffiliation(idempotentAffId, MEMBER_IDEMPOTENT, 'confirm');
    expect(second.branch).toBe('idempotent');
    expect(second.resolvedClubId).toBe(first.resolvedClubId);
    expect(second.newAffiliationId).toBeNull();

    // No double-affiliation: the second confirm did not insert a second row.
    expect(readMemberAffiliations(MEMBER_IDEMPOTENT)).toHaveLength(1);
  });
});

describe('clubService.confirmAffiliation — candidate without mapped_club_id (anti-enumeration)', () => {
  it('throws NotFoundError when the parent candidate has no mapped_club_id', async () => {
    const { NotFoundError } = await import('../../src/services/serviceErrors');
    expect(() => svc.confirmAffiliation(noMappedAffId, MEMBER_NO_MAPPED, 'confirm'))
      .toThrow(NotFoundError);

    // Row state unchanged: still 'pending', no resolved_club_id stamped.
    const row = readAffiliation(noMappedAffId);
    expect(row.resolution_status).toBe('pending');
    expect(row.resolved_club_id).toBeNull();
  });

  it('throws NotFoundError when the affiliation row id does not exist', async () => {
    const { NotFoundError } = await import('../../src/services/serviceErrors');
    expect(() => svc.confirmAffiliation('lpca-nonexistent', MEMBER_NO_MAPPED, 'confirm'))
      .toThrow(NotFoundError);
  });
});

describe('clubService.confirmAffiliation — two-current-club cap: second current affiliation succeeds', () => {
  it('member already current at club A confirms B: both affiliations land (under two-club cap)', () => {
    const result = svc.confirmAffiliation(crossAffB, MEMBER_CROSS_CLUB, 'confirm');

    expect(result.branch).toBe('confirmed');
    expect(result.resolvedClubId).toBe(crossClubB);
    expect(result.newAffiliationId).toBeTruthy();

    const row = readAffiliation(crossAffB);
    expect(row.resolution_status).toBe('confirmed_current');
    expect(row.resolved_club_id).toBe(crossClubB);

    const affs = readMemberAffiliations(MEMBER_CROSS_CLUB);
    expect(affs).toHaveLength(2);
    expect(affs.map((a) => a.club_id).sort()).toEqual([crossClubA, crossClubB].sort());
    expect(affs.every((a) => a.is_current === 1)).toBe(true);

    // Club A (pre-existing) is primary; club B (newly confirmed) is secondary.
    const primary = affs.find((a) => a.club_id === crossClubA)!;
    const secondary = affs.find((a) => a.club_id === crossClubB)!;
    expect(primary.is_primary).toBe(1);
    expect(secondary.is_primary).toBe(0);
  });
});

describe('clubService.confirmAffiliation — three-club cap: third current affiliation blocked', () => {
  it('member with two current clubs, third confirm is a cap hit: row stays pending and actionable, no mca row created', () => {
    const result = svc.confirmAffiliation(threeCapAffC, MEMBER_THREE_CAP, 'confirm');

    // At the two-current-club cap the confirm is a no-op cap hit: the resolved
    // club is reported back for messaging, but no affiliation lands.
    expect(result.branch).toBe('cap_hit');
    expect(result.resolvedClubId).toBe(threeCapClubC);
    expect(result.newAffiliationId).toBeNull();

    // The legacy row is left pending (not transitioned, not stamped) so the
    // member can free a current-club slot and confirm it later.
    const row = readAffiliation(threeCapAffC);
    expect(row.resolution_status).toBe('pending');
    expect(row.resolved_club_id).toBeNull();

    const affs = readMemberAffiliations(MEMBER_THREE_CAP);
    const currentAffs = affs.filter((a) => a.is_current === 1);
    expect(currentAffs).toHaveLength(2);
  });
});

describe('clubService.confirmAffiliation — former clubs do not count toward cap', () => {
  it('member with one current and one former club, confirming third: insert succeeds (current count is 1)', () => {
    const result = svc.confirmAffiliation(formerAffC, MEMBER_FORMER, 'confirm');

    expect(result.branch).toBe('confirmed');
    expect(result.resolvedClubId).toBe(formerClubC);
    expect(result.newAffiliationId).toBeTruthy();

    const affs = readMemberAffiliations(MEMBER_FORMER);
    const currentAffs = affs.filter((a) => a.is_current === 1);
    expect(currentAffs).toHaveLength(2);
    expect(currentAffs.map((a) => a.club_id).sort()).toEqual(
      [/* formerClubA */ currentAffs.find((a) => a.club_id !== formerClubC)!.club_id, formerClubC].sort(),
    );
  });
});

describe('clubService.confirmAffiliation — same-club idempotency under two-club cap', () => {
  it('member already current at club A, confirms club A again: UNIQUE(member_id, club_id) catches it', () => {
    const result = svc.confirmAffiliation(sameClubAffId, MEMBER_SAME_CLUB, 'confirm');

    expect(result.branch).toBe('confirmed');
    expect(result.newAffiliationId).toBeNull();

    const affs = readMemberAffiliations(MEMBER_SAME_CLUB);
    expect(affs).toHaveLength(1);
    expect(affs[0].is_current).toBe(1);
  });
});

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4041');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertClub,
  insertClubBootstrapLeader,
  insertLegacyClubCandidate,
  insertMemberClubAffiliation,
  completeOnboarding,
} from '../fixtures/factories';

let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let clubSvc: typeof import('../../src/services/clubService').clubService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let leadershipSvc: typeof import('../../src/services/adminClubLeadershipService').adminClubLeadershipService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let onboardingSvc: typeof import('../../src/services/memberOnboardingService').memberOnboardingService;

const ADMIN_ID = 'inv-admin-001';

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, {
    id: ADMIN_ID, slug: 'inv_admin', display_name: 'Invariant Admin',
    login_email: 'inv-admin@example.com', is_admin: 1,
  });
  await importApp();
  clubSvc = (await import('../../src/services/clubService')).clubService;
  leadershipSvc = (await import('../../src/services/adminClubLeadershipService')).adminClubLeadershipService;
  onboardingSvc = (await import('../../src/services/memberOnboardingService')).memberOnboardingService;
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

let _n = 0;
function anchorFor(memberId: string): string {
  return `lm-${memberId}`;
}
function seedMember(): string {
  _n += 1;
  const memberId = `inv-mem-${_n}`;
  insertMember(db, {
    id: memberId, slug: `inv_mem_${_n}`, login_email: `${memberId}@example.com`,
    legacy_member_id: anchorFor(memberId),
  });
  completeOnboarding(db, memberId);
  return memberId;
}
function seedClub(name: string): string {
  _n += 1;
  return insertClub(db, { id: `inv-club-${_n}`, name: `${name} ${_n}`, status: 'active' });
}

function affiliations(memberId: string): Array<{ club_id: string; is_current: number; is_primary: number }> {
  return db.prepare(
    `SELECT club_id, is_current, is_primary FROM member_club_affiliations
      WHERE member_id = ? ORDER BY club_id`,
  ).all(memberId) as Array<{ club_id: string; is_current: number; is_primary: number }>;
}

function primaryCount(memberId: string): number {
  return affiliations(memberId).filter((a) => a.is_current === 1 && a.is_primary === 1).length;
}

describe('a main club is chosen automatically only for a lone remaining club', () => {
  // Defect caught: leaving the main club leaves the member's only remaining
  // club designated secondary, with no main club at all.
  it('leaving the main club makes a lone remaining club main', () => {
    const memberId = seedMember();
    const clubX = seedClub('Repair X');
    const clubY = seedClub('Repair Y');
    clubSvc.joinClub(memberId, clubX);
    clubSvc.joinClub(memberId, clubY);

    clubSvc.leaveClub(memberId, clubX, { confirmed: true });

    const current = affiliations(memberId).filter((a) => a.is_current === 1);
    expect(current).toEqual([{ club_id: clubY, is_current: 1, is_primary: 1 }]);
  });

  // Defect caught: the leave picks one of two remaining clubs as main itself,
  // a choice that belongs to the member.
  it('leaving the main club with two remaining makes neither main', () => {
    const memberId = seedMember();
    const clubX = seedClub('Repair X');
    const clubY = seedClub('Repair Y');
    const clubZ = seedClub('Repair Z');
    // Seeded past the two-club limit, which no member or admin path reaches,
    // because that is the only way two clubs survive a leave.
    insertMemberClubAffiliation(db, memberId, clubX, { is_primary: 1 });
    insertMemberClubAffiliation(db, memberId, clubY, { is_primary: 0 });
    insertMemberClubAffiliation(db, memberId, clubZ, { is_primary: 0 });

    clubSvc.leaveClub(memberId, clubX, { confirmed: true });

    const current = affiliations(memberId).filter((a) => a.is_current === 1);
    expect(current).toHaveLength(2);
    expect(primaryCount(memberId)).toBe(0);
  });

  it('an admin demote that removes the affiliation makes the lone remaining club main', () => {
    const memberId = seedMember();
    const clubLed = seedClub('Demote Led');
    const clubOther = seedClub('Demote Other');

    leadershipSvc.assignLeader(ADMIN_ID, clubLed, memberId, 'Their first and primary club');
    clubSvc.joinClub(memberId, clubOther);
    expect(affiliations(memberId).find((a) => a.club_id === clubLed)!.is_primary).toBe(1);

    leadershipSvc.demoteLeader(ADMIN_ID, clubLed, memberId, 'remove_affiliation', 'Stepping them back');

    expect(affiliations(memberId).filter((a) => a.is_current === 1)).toHaveLength(1);
    expect(primaryCount(memberId)).toBe(1);
  });
});

describe('a wizard card brings back an affiliation an admin ended', () => {
  it('confirming a leadership card reactivates the ended row rather than reporting a membership that does not exist', () => {
    const memberId = seedMember();
    const clubId = seedClub('Revive');

    // Admin gives them the affiliation, then ends it. The lifelong
    // UNIQUE(member_id, club_id) row survives with is_current = 0.
    leadershipSvc.assignLeader(ADMIN_ID, clubId, memberId, 'Assigning before the wizard runs');
    leadershipSvc.demoteLeader(ADMIN_ID, clubId, memberId, 'remove_affiliation', 'Removing before the wizard runs');
    expect(affiliations(memberId).filter((a) => a.is_current === 1)).toHaveLength(0);

    const candidateId = insertClubBootstrapLeader(db, {
      club_id: clubId, legacy_member_id: anchorFor(memberId), role: 'leader', status: 'provisional',
    });

    const result = onboardingSvc.submitClubAffiliationsResponse(memberId, {
      candidateId, userDecision: 'confirm', activitySignal: 'active',
    });
    expect(result.branch).toBe('promoted_co_leader');

    const current = affiliations(memberId).filter((a) => a.is_current === 1);
    expect(current).toHaveLength(1);
    expect(current[0].club_id).toBe(clubId);
    expect(primaryCount(memberId)).toBe(1);
  });

  it('a club the member already holds is left exactly as it is', () => {
    const memberId = seedMember();
    const clubId = seedClub('Already In');

    clubSvc.joinClub(memberId, clubId);
    const before = affiliations(memberId);
    expect(before).toHaveLength(1);
    expect(before[0].is_primary).toBe(1);

    const candidateId = insertClubBootstrapLeader(db, {
      club_id: clubId, legacy_member_id: anchorFor(memberId), role: 'leader', status: 'provisional',
    });
    onboardingSvc.submitClubAffiliationsResponse(memberId, {
      candidateId, userDecision: 'confirm', activitySignal: 'active',
    });

    // The live row keeps its primary flag: recomputing it here is what would
    // have left the member holding a club and no primary.
    expect(affiliations(memberId)).toEqual(before);
  });
});

describe('promotion refuses a candidate retired while its URL was being checked', () => {
  it('never produces a live club from a candidate archived during the network call', async () => {
    const candidateId = insertLegacyClubCandidate(db, {
      display_name: 'Racy Candidate',
      // A state on file, so this case exercises the archived-during-the-call
      // race rather than the separate state requirement.
      city: 'Portland', region: 'Oregon', country: 'USA',
      classification: 'onboarding_visible',
      external_url: 'https://example.com/racy',
    });

    // The URL check is network I/O and yields the event loop, so an archive
    // scheduled here lands inside the window between the guards and the
    // transaction. The guards run before that window; only a re-read inside
    // the transaction can see this.
    setImmediate(() => {
      db.prepare(
        `UPDATE legacy_club_candidates SET lifecycle_state = 'archived' WHERE id = ?`,
      ).run(candidateId);
    });

    await expect(
      clubSvc.promoteCandidate(candidateId, ADMIN_ID, { actorType: 'admin', trigger: 'admin_queue' }),
    ).rejects.toThrow(/archived/i);

    const row = db.prepare(
      'SELECT lifecycle_state, mapped_club_id FROM legacy_club_candidates WHERE id = ?',
    ).get(candidateId) as { lifecycle_state: string | null; mapped_club_id: string | null };
    expect(row.lifecycle_state).toBe('archived');
    expect(row.mapped_club_id).toBeNull();
  });
});

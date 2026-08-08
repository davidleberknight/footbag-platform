import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3973');

import BetterSqlite3 from 'better-sqlite3';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  insertMember,
  insertClub,
  insertClubViabilitySignal,
  insertLegacyClubCandidate,
  insertClubLeader,
  insertMemberClubAffiliation,
} from '../fixtures/factories';

const MEMBER_A = 'viab-mem-a';
const MEMBER_B = 'viab-mem-b';
const MEMBER_C = 'viab-mem-c';
const MEMBER_D = 'viab-mem-d';

const CLUB_ACTIVE      = 'viab-club-active';
const CLUB_INACTIVE    = 'viab-club-inactive';
const CLUB_WEAK        = 'viab-club-weak';
const CLUB_REVIEW      = 'viab-club-review';
const CLUB_NOSIGNAL    = 'viab-club-nosignal';
const CLUB_MIXED       = 'viab-club-mixed';
const CLUB_LEADERLESS  = 'viab-club-leaderless';
const CLUB_DUP_MEMBER  = 'viab-club-dup-member';
const CLUB_CHANGED     = 'viab-club-changed';
const CLUB_OF_PROMOTED = 'viab-club-of-promoted';
const CLUB_MAPPED_ONBOARDING = 'viab-club-mapped-onboarding';
const CLUB_LIVE_MEMBERS  = 'viab-club-live-members';
const CLUB_LIVE_LEADER   = 'viab-club-live-leader';
const CLUB_LIVE_WEAK     = 'viab-club-live-weak';
const CLUB_LIVE_REVIEW   = 'viab-club-live-review';

const CAND_FLAGGED  = 'viab-cand-flagged';
const CAND_PROMOTED = 'viab-cand-promoted';
const CAND_ARCHIVED = 'viab-cand-archived';

function insertCandidateFlag(
  db: Parameters<typeof insertClubViabilitySignal>[0],
  memberId: string,
  candidateId: string,
  activitySignal: string,
  createdAt?: string,
): void {
  insertClubViabilitySignal(db, {
    member_id: memberId,
    club_id: null,
    activity_signal: activitySignal,
    source_entity_type: 'legacy_club_candidate',
    source_entity_id: candidateId,
    ...(createdAt ? { created_at: createdAt } : {}),
  });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, { id: MEMBER_A, slug: 'viab_a', display_name: 'Viab A', login_email: 'viab-a@example.com' });
  insertMember(db, { id: MEMBER_B, slug: 'viab_b', display_name: 'Viab B', login_email: 'viab-b@example.com' });
  insertMember(db, { id: MEMBER_C, slug: 'viab_c', display_name: 'Viab C', login_email: 'viab-c@example.com' });
  insertMember(db, { id: MEMBER_D, slug: 'viab_d', display_name: 'Viab D', login_email: 'viab-d@example.com' });

  insertClub(db, { id: CLUB_ACTIVE,   name: 'Active Club' });
  insertClub(db, { id: CLUB_INACTIVE, name: 'Concordant Inactive Club' });
  insertClub(db, { id: CLUB_WEAK,     name: 'Weak Inactive Club' });
  insertClub(db, { id: CLUB_REVIEW,   name: 'Needs Review Club' });
  insertClub(db, { id: CLUB_NOSIGNAL, name: 'No Signal Club' });
  insertClub(db, { id: CLUB_MIXED,      name: 'Mixed Club' });
  insertClub(db, { id: CLUB_LEADERLESS, name: 'Leaderless Club' });

  // G1: one active signal -> confirmed_active
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_ACTIVE, activity_signal: 'active' });

  // G2: 2+ inactive, no active, no operational life -> concordant inactive
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_INACTIVE, activity_signal: 'not_active' });
  insertClubViabilitySignal(db, { member_id: MEMBER_B, club_id: CLUB_INACTIVE, activity_signal: 'not_active' });

  // G3: 1 inactive, no active, no operational life, weak legacy -> weak inactive
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_WEAK, activity_signal: 'not_active' });

  // G4: 1 inactive, no active, no operational life, strong legacy -> needs_review.
  // Strong legacy is the pre_populate classification alone; no rule-firing flags.
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_REVIEW, activity_signal: 'not_active' });
  insertLegacyClubCandidate(db, { id: 'lcc-review-001', mapped_club_id: CLUB_REVIEW, classification: 'pre_populate' });

  // A mapped candidate that is NOT pre_populate is not strong legacy: the same
  // lone-inactive shape stays G3, proving classification alone gates l1.
  insertClub(db, { id: CLUB_MAPPED_ONBOARDING, name: 'Mapped Onboarding Club' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_MAPPED_ONBOARDING, activity_signal: 'not_active' });
  insertLegacyClubCandidate(db, { id: 'lcc-mapped-onb-001', mapped_club_id: CLUB_MAPPED_ONBOARDING, classification: 'onboarding_visible' });

  // Visible operational life suppresses every negative gate. Each club below
  // carries the exact signal shape that would otherwise demote it, plus a
  // current member or a leader, which is direct evidence the club is alive and
  // outranks members reporting it inactive.
  insertClub(db, { id: CLUB_LIVE_MEMBERS, name: 'Live Members Club' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_LIVE_MEMBERS, activity_signal: 'not_active' });
  insertClubViabilitySignal(db, { member_id: MEMBER_B, club_id: CLUB_LIVE_MEMBERS, activity_signal: 'not_active' });
  insertMemberClubAffiliation(db, MEMBER_C, CLUB_LIVE_MEMBERS);

  insertClub(db, { id: CLUB_LIVE_LEADER, name: 'Live Leader Club' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_LIVE_LEADER, activity_signal: 'not_active' });
  insertClubViabilitySignal(db, { member_id: MEMBER_B, club_id: CLUB_LIVE_LEADER, activity_signal: 'not_active' });
  insertClubLeader(db, { club_id: CLUB_LIVE_LEADER, member_id: MEMBER_D });

  insertClub(db, { id: CLUB_LIVE_WEAK, name: 'Live Weak Club' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_LIVE_WEAK, activity_signal: 'not_active' });
  insertMemberClubAffiliation(db, MEMBER_C, CLUB_LIVE_WEAK);

  insertClub(db, { id: CLUB_LIVE_REVIEW, name: 'Live Review Club' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_LIVE_REVIEW, activity_signal: 'not_active' });
  insertLegacyClubCandidate(db, { id: 'lcc-live-review-001', mapped_club_id: CLUB_LIVE_REVIEW, classification: 'pre_populate' });
  insertMemberClubAffiliation(db, MEMBER_C, CLUB_LIVE_REVIEW);

  // Mixed: active + inactive -> G1 wins
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_MIXED, activity_signal: 'not_active' });
  insertClubViabilitySignal(db, { member_id: MEMBER_B, club_id: CLUB_MIXED, activity_signal: 'active' });

  // One member re-posting 'not_active' is one vote, not two: G3, not G2.
  insertClub(db, { id: CLUB_DUP_MEMBER, name: 'Duplicate Member Club' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_DUP_MEMBER, activity_signal: 'not_active', created_at: '2026-01-01T00:00:00.000Z' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_DUP_MEMBER, activity_signal: 'not_active', created_at: '2026-01-02T00:00:00.000Z' });

  // A member who changes their answer counts at their latest answer only:
  // earlier 'not_active' superseded by later 'active' -> G1.
  insertClub(db, { id: CLUB_CHANGED, name: 'Changed Answer Club' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_CHANGED, activity_signal: 'not_active', created_at: '2026-01-01T00:00:00.000Z' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_CHANGED, activity_signal: 'active', created_at: '2026-02-01T00:00:00.000Z' });

  // Candidate-keyed flags: activity answers about unpromoted candidates.
  // One member re-posts (one vote), one reports it active.
  insertLegacyClubCandidate(db, { id: CAND_FLAGGED, display_name: 'Flagged Candidate', classification: 'onboarding_visible' });
  insertCandidateFlag(db, MEMBER_A, CAND_FLAGGED, 'not_active', '2026-01-01T00:00:00.000Z');
  insertCandidateFlag(db, MEMBER_A, CAND_FLAGGED, 'not_active', '2026-01-02T00:00:00.000Z');
  insertCandidateFlag(db, MEMBER_C, CAND_FLAGGED, 'active');

  // A promoted candidate's un-stamped flag rows surface nowhere: not in the
  // candidate-flag group (the candidate is promoted) and not in its live
  // club's gates (the rows carry no club id).
  insertClub(db, { id: CLUB_OF_PROMOTED, name: 'Promoted Candidate Club' });
  insertLegacyClubCandidate(db, { id: CAND_PROMOTED, display_name: 'Promoted Candidate', mapped_club_id: CLUB_OF_PROMOTED });
  insertCandidateFlag(db, MEMBER_A, CAND_PROMOTED, 'not_active');

  // Terminal candidates leave the flag group with them.
  insertLegacyClubCandidate(db, { id: CAND_ARCHIVED, display_name: 'Archived Flagged Candidate', classification: 'dormant', lifecycle_state: 'archived' });
  insertCandidateFlag(db, MEMBER_A, CAND_ARCHIVED, 'not_active');

  db.close();
  await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('one verdict per club', () => {
  it('a member vouching for the club makes it alive', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    expect(clubCleanupService.getClubVerdict(CLUB_ACTIVE)?.verdict).toBe('alive');
  });

  it('a current member outranks members reporting the club inactive', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    expect(clubCleanupService.getClubVerdict(CLUB_LIVE_MEMBERS)?.verdict).toBe('alive');
  });

  it('a current co-leader outranks members reporting the club inactive', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    expect(clubCleanupService.getClubVerdict(CLUB_LIVE_LEADER)?.verdict).toBe('alive');
  });

  it('a write-off the club record does not contradict is defunct', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const result = clubCleanupService.getClubVerdict(CLUB_WEAK);
    expect(result?.verdict).toBe('defunct_by_rule');
    expect(result?.everHostedEvent).toBe(false);
    expect(result?.wasEstablished).toBe(false);
  });

  it('one write-off is enough; a second only repeats it', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    expect(clubCleanupService.getClubVerdict(CLUB_INACTIVE)?.verdict).toBe('defunct_by_rule');
    expect(clubCleanupService.getClubVerdict(CLUB_WEAK)?.verdict).toBe('defunct_by_rule');
  });

  it('a write-off against an established club goes to a human, not the rules', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const result = clubCleanupService.getClubVerdict(CLUB_REVIEW);
    expect(result?.verdict).toBe('needs_review');
    expect(result?.wasEstablished).toBe(true);
  });

  it('a club the pipeline marked for members to confirm is not established, so a write-off settles it', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    expect(clubCleanupService.getClubVerdict(CLUB_MAPPED_ONBOARDING)?.verdict).toBe('defunct_by_rule');
  });

  it('a club nobody has voted on and the pipeline never judged waits for an answer', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    expect(clubCleanupService.getClubVerdict(CLUB_NOSIGNAL)?.verdict).toBe('waiting');
  });

  it('one member repeating themselves is one vote', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const result = clubCleanupService.getClubVerdict(CLUB_DUP_MEMBER);
    expect(result?.inactiveVotes).toBe(1);
  });

  it('a member who changes their answer counts at the latest one', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    expect(clubCleanupService.getClubVerdict(CLUB_CHANGED)?.verdict).toBe('alive');
  });

  it('a positive answer wins over a negative one from someone else', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    expect(clubCleanupService.getClubVerdict(CLUB_MIXED)?.verdict).toBe('alive');
  });

  it('the schema rejects every retired signal value and stage at the door', async () => {
    // The wizard is the only collection surface and its activity question
    // offers two answers, so the vocabulary the earlier design carried
    // (not-sure and never-heard answers; club-page and dashboard stages) is
    // rejected by the database itself, not merely unwritten by the service.
    const raw = new BetterSqlite3(dbPath);
    for (const activity_signal of ['not_sure', 'never_heard_of_it']) {
      expect(() =>
        insertClubViabilitySignal(raw, { member_id: MEMBER_A, club_id: CLUB_WEAK, activity_signal }),
      ).toThrow(/CHECK constraint failed/);
    }
    for (const source_stage of ['club_detail', 'dashboard']) {
      expect(() =>
        insertClubViabilitySignal(raw, { member_id: MEMBER_A, club_id: CLUB_WEAK, source_stage, activity_signal: 'active' }),
      ).toThrow(/CHECK constraint failed/);
    }
    raw.close();
  });
});

describe('getCleanupQueuePage', () => {
  it('returns actionable items from multiple predicates', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const vm = clubCleanupService.getCleanupQueuePage();
    const items = vm.content.itemGroups.flatMap(g => g.items);

    const viabilityItems = items.filter(i => i.predicate === 'crowdsource_viability');
    expect(viabilityItems.length).toBeGreaterThan(0);

    const leaderlessItems = items.filter(i => i.predicate === 'leaderless_active');
    const leaderlessClub = leaderlessItems.find(i => i.clubId === CLUB_LEADERLESS);
    expect(leaderlessClub).toBeTruthy();
    // Leaderless is a tolerated state: the item is a low-priority "Needs
    // Leader" opportunity, never remediation work.
    expect(leaderlessClub!.predicateLabel).toBe('Needs Leader');
    expect(leaderlessClub!.isOpportunity).toBe(true);
  });

  it('excludes G1_confirmed_active clubs from viability items', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const vm = clubCleanupService.getCleanupQueuePage();
    const activeClub = vm.content.itemGroups.flatMap(g => g.items).find(
      i => i.clubId === CLUB_ACTIVE && i.predicate === 'crowdsource_viability',
    );
    expect(activeClub).toBeUndefined();
  });

  it('names the negative wizard reporters, and the fact that contradicts them, on the review item', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const vm = clubCleanupService.getCleanupQueuePage();
    const item = vm.content.itemGroups.flatMap(g => g.items).find(
      i => i.clubId === CLUB_REVIEW && i.predicate === 'crowdsource_viability',
    );
    expect(item).toBeTruthy();
    expect(item!.detail).toContain('inactive per: Viab A');
    expect(item!.detail).toContain('established club');
  });

  it('a club the rules settle is demoted rather than queued', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const vm = clubCleanupService.getCleanupQueuePage();
    const queued = vm.content.itemGroups.flatMap(g => g.items).find(
      i => i.clubId === CLUB_WEAK && i.predicate === 'crowdsource_viability',
    );
    expect(queued).toBeUndefined();
    expect(clubCleanupService.getClubVerdict(CLUB_WEAK)?.verdict).toBe('defunct_by_rule');
  });
});

describe('candidate-flag group', () => {
  it('groups flags per unpromoted candidate, one vote per member, naming negative reporters', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const vm = clubCleanupService.getCleanupQueuePage();
    const item = vm.content.candidateFlags.find(f => f.candidateId === CAND_FLAGGED);
    expect(item).toBeTruthy();
    // Member A's re-post is one vote.
    expect(item!.flagCount).toBe(1);
    expect(item!.detail).toContain('1 active, 1 inactive');
    expect(item!.detail).toContain('inactive per: Viab A');
    expect(item!.classificationLabel).toBe('Onboarding-visible');
  });

  it('excludes promoted and terminal candidates from the flag group', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const vm = clubCleanupService.getCleanupQueuePage();
    const ids = vm.content.candidateFlags.map(f => f.candidateId);
    expect(ids).not.toContain(CAND_PROMOTED);
    expect(ids).not.toContain(CAND_ARCHIVED);
  });

  it('candidate-keyed rows never feed a club gate', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    // The promoted candidate's un-stamped flag row carries no club id, so its
    // live club counts no votes of either kind from it.
    const result = clubCleanupService.getClubVerdict(CLUB_OF_PROMOTED);
    expect(result?.activeVotes).toBe(0);
    expect(result?.inactiveVotes).toBe(0);
  });

  it('counts flag items in the backlog badge', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const badge = clubCleanupService.getBacklogBadge();
    const vm = clubCleanupService.getCleanupQueuePage();
    const visibleCount = vm.content.itemGroups.flatMap(g => g.items).length
      + vm.content.residue.length
      + vm.content.candidates.length
      + vm.content.junkCandidates.length
      + vm.content.candidateFlags.length;
    expect(badge.openCount).toBe(visibleCount);
    expect(vm.content.candidateFlags.length).toBeGreaterThan(0);
  });
});

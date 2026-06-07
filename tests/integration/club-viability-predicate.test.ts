import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3973');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  insertMember,
  insertClub,
  insertClubViabilitySignal,
  insertLegacyClubCandidate,
} from '../fixtures/factories';

const MEMBER_A = 'viab-mem-a';
const MEMBER_B = 'viab-mem-b';
const MEMBER_C = 'viab-mem-c';

const CLUB_ACTIVE      = 'viab-club-active';
const CLUB_INACTIVE    = 'viab-club-inactive';
const CLUB_WEAK        = 'viab-club-weak';
const CLUB_REVIEW      = 'viab-club-review';
const CLUB_NOSIGNAL    = 'viab-club-nosignal';
const CLUB_MIXED       = 'viab-club-mixed';
const CLUB_LEADERLESS  = 'viab-club-leaderless';
const CLUB_DETAIL_POS  = 'viab-club-detail-pos';
const CLUB_DUP_MEMBER  = 'viab-club-dup-member';
const CLUB_CHANGED     = 'viab-club-changed';
const CLUB_DETAIL_ONLY = 'viab-club-detail-only';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, { id: MEMBER_A, slug: 'viab_a', display_name: 'Viab A', login_email: 'viab-a@example.com' });
  insertMember(db, { id: MEMBER_B, slug: 'viab_b', display_name: 'Viab B', login_email: 'viab-b@example.com' });
  insertMember(db, { id: MEMBER_C, slug: 'viab_c', display_name: 'Viab C', login_email: 'viab-c@example.com' });

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

  // G4: 1 inactive, no active, no operational life, strong legacy -> needs_review
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_REVIEW, activity_signal: 'not_active' });
  insertLegacyClubCandidate(db, { id: 'lcc-review-001', mapped_club_id: CLUB_REVIEW, classification: 'pre_populate', r1: 1, r2: 1 });

  // Mixed: active + inactive -> G1 wins
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_MIXED, activity_signal: 'not_active' });
  insertClubViabilitySignal(db, { member_id: MEMBER_B, club_id: CLUB_MIXED, activity_signal: 'active' });

  // Detail-page 'active' must not decide a gate: the wizard channel says
  // one member inactive, so the gate is G3, not G1.
  insertClub(db, { id: CLUB_DETAIL_POS, name: 'Detail Positive Club' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_DETAIL_POS, source_stage: 'club_detail', activity_signal: 'active' });
  insertClubViabilitySignal(db, { member_id: MEMBER_B, club_id: CLUB_DETAIL_POS, activity_signal: 'not_active' });

  // One member re-posting 'not_active' is one vote, not two: G3, not G2.
  insertClub(db, { id: CLUB_DUP_MEMBER, name: 'Duplicate Member Club' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_DUP_MEMBER, activity_signal: 'not_active', created_at: '2026-01-01T00:00:00.000Z' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_DUP_MEMBER, activity_signal: 'not_active', created_at: '2026-01-02T00:00:00.000Z' });

  // A member who changes their answer counts at their latest answer only:
  // earlier 'not_active' superseded by later 'active' -> G1.
  insertClub(db, { id: CLUB_CHANGED, name: 'Changed Answer Club' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_CHANGED, activity_signal: 'not_active', created_at: '2026-01-01T00:00:00.000Z' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_CHANGED, activity_signal: 'active', created_at: '2026-02-01T00:00:00.000Z' });

  // Rows from the retired club-page poll channel only: the gates see
  // nothing and no crowdsource queue item appears.
  insertClub(db, { id: CLUB_DETAIL_ONLY, name: 'Detail Only Club' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_DETAIL_ONLY, source_stage: 'club_detail', activity_signal: 'not_active', created_at: '2026-01-01T00:00:00.000Z' });
  insertClubViabilitySignal(db, { member_id: MEMBER_A, club_id: CLUB_DETAIL_ONLY, source_stage: 'club_detail', activity_signal: 'not_active', created_at: '2026-01-02T00:00:00.000Z' });
  insertClubViabilitySignal(db, { member_id: MEMBER_B, club_id: CLUB_DETAIL_ONLY, source_stage: 'club_detail', activity_signal: 'never_heard_of_it' });
  insertClubViabilitySignal(db, { member_id: MEMBER_C, club_id: CLUB_DETAIL_ONLY, source_stage: 'club_detail', activity_signal: 'active' });

  db.close();
  await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('evaluateClubViability', () => {
  it('G1: any active signal -> confirmed_active', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const result = clubCleanupService.evaluateClubViability(CLUB_ACTIVE);
    expect(result.gate).toBe('G1_confirmed_active');
    expect(result.s1AnyActive).toBe(true);
  });

  it('G2: concordant inactive (2+) -> concordant_inactive', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const result = clubCleanupService.evaluateClubViability(CLUB_INACTIVE);
    expect(result.gate).toBe('G2_concordant_inactive');
    expect(result.s3ConcordantInactive).toBe(true);
  });

  it('G3: single inactive, weak legacy -> weak_inactive', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const result = clubCleanupService.evaluateClubViability(CLUB_WEAK);
    expect(result.gate).toBe('G3_weak_inactive');
    expect(result.s2AnyInactive).toBe(true);
    expect(result.s3ConcordantInactive).toBe(false);
    expect(result.l1StrongLegacy).toBe(false);
  });

  it('G4: single inactive, strong legacy -> needs_review', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const result = clubCleanupService.evaluateClubViability(CLUB_REVIEW);
    expect(result.gate).toBe('G4_needs_review');
    expect(result.l1StrongLegacy).toBe(true);
  });

  it('no signals -> no_signals', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const result = clubCleanupService.evaluateClubViability(CLUB_NOSIGNAL);
    expect(result.gate).toBe('no_signals');
  });

  it('mixed active + inactive -> G1 wins', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const result = clubCleanupService.evaluateClubViability(CLUB_MIXED);
    expect(result.gate).toBe('G1_confirmed_active');
  });

  it('a detail-page active signal does not decide a gate', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const result = clubCleanupService.evaluateClubViability(CLUB_DETAIL_POS);
    expect(result.gate).toBe('G3_weak_inactive');
    expect(result.s1AnyActive).toBe(false);
  });

  it('one member re-posting inactive is one vote, not concordant', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const result = clubCleanupService.evaluateClubViability(CLUB_DUP_MEMBER);
    expect(result.gate).toBe('G3_weak_inactive');
    expect(result.s3ConcordantInactive).toBe(false);
  });

  it('a changed answer counts at its latest value', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const result = clubCleanupService.evaluateClubViability(CLUB_CHANGED);
    expect(result.gate).toBe('G1_confirmed_active');
  });

  it('detail-page-only reports leave the gates at no_signals', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const result = clubCleanupService.evaluateClubViability(CLUB_DETAIL_ONLY);
    expect(result.gate).toBe('no_signals');
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
    expect(leaderlessClub!.predicateLabel).toBe('Leaderless active club');
  });

  it('excludes G1_confirmed_active clubs from viability items', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const vm = clubCleanupService.getCleanupQueuePage();
    const activeClub = vm.content.itemGroups.flatMap(g => g.items).find(
      i => i.clubId === CLUB_ACTIVE && i.predicate === 'crowdsource_viability',
    );
    expect(activeClub).toBeUndefined();
  });

  it('retired club-page poll rows never produce a crowdsource queue item', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const vm = clubCleanupService.getCleanupQueuePage();
    // CLUB_DETAIL_ONLY carries only club_detail rows: no gate fires and no
    // crowdsource item appears (it may still surface as leaderless, which
    // is independent of signals).
    const crowdsourceItem = vm.content.itemGroups.flatMap(g => g.items).find(
      i => i.clubId === CLUB_DETAIL_ONLY && i.predicate === 'crowdsource_viability',
    );
    expect(crowdsourceItem).toBeUndefined();
  });

  it('names the negative wizard reporters on the crowdsource item', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const vm = clubCleanupService.getCleanupQueuePage();
    const item = vm.content.itemGroups.flatMap(g => g.items).find(
      i => i.clubId === CLUB_WEAK && i.predicate === 'crowdsource_viability',
    );
    expect(item).toBeTruthy();
    expect(item!.detail).toContain('inactive per: Viab A');
  });
});

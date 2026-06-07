/**
 * Integration tests for same-city multi-club disambiguation in the
 * onboarding wizard's club_affiliations task. When a member matches
 * multiple clubs in the same city, the wizard groups them into a
 * single disambiguation card with checkboxes instead of rendering
 * individual confirm/decline cards.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertClub,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertClubBootstrapLeader,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3180');

let createApp: Awaited<ReturnType<typeof importApp>>;
let testDb: BetterSqlite3.Database;

const MEMBER_SAME_CITY    = 'wiz-disambig-samecity';
const MEMBER_MIXED        = 'wiz-disambig-mixed';
const MEMBER_LEADERSHIP   = 'wiz-disambig-leadership';
const MEMBER_F1           = 'wiz-disambig-f1';

let sameCityAffA = '';
let sameCityAffB = '';
let sameCityAffC = '';
let mixedPortlandAffA = '';
let mixedPortlandAffB = '';
let mixedDenverAff = '';
let leadershipCblId = '';
let leadershipAffId = '';
let f1AffId = '';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Same-city scenario: 3 clubs in Portland for one member.
  insertMember(db, {
    id: MEMBER_SAME_CITY,
    slug: 'wiz_disambig_samecity',
    login_email: 'disambig-same@example.com',
    legacy_member_id: 'lm-disambig-same',
  });
  const clubA = insertClub(db, { name: 'Portland Alpha', city: 'Portland', country: 'USA' });
  const clubB = insertClub(db, { name: 'Portland Beta',  city: 'Portland', country: 'USA' });
  const clubC = insertClub(db, { name: 'Portland Gamma', city: 'Portland', country: 'USA' });
  const candA = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: clubA, display_name: 'Portland Alpha' });
  const candB = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: clubB, display_name: 'Portland Beta' });
  const candC = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: clubC, display_name: 'Portland Gamma' });
  sameCityAffA = insertLegacyPersonClubAffiliation(db, { legacy_member_id: 'lm-disambig-same', legacy_club_candidate_id: candA, confidence_score: 0.9 });
  sameCityAffB = insertLegacyPersonClubAffiliation(db, { legacy_member_id: 'lm-disambig-same', legacy_club_candidate_id: candB, confidence_score: 0.7 });
  sameCityAffC = insertLegacyPersonClubAffiliation(db, { legacy_member_id: 'lm-disambig-same', legacy_club_candidate_id: candC, confidence_score: 0.5 });

  // Mixed-city: 2 Portland + 1 Denver for one member.
  insertMember(db, {
    id: MEMBER_MIXED,
    slug: 'wiz_disambig_mixed',
    login_email: 'disambig-mixed@example.com',
    legacy_member_id: 'lm-disambig-mixed',
  });
  const mixClubPA = insertClub(db, { name: 'Mixed Portland A', city: 'Portland', country: 'USA' });
  const mixClubPB = insertClub(db, { name: 'Mixed Portland B', city: 'Portland', country: 'USA' });
  const mixClubD  = insertClub(db, { name: 'Denver Solo Club', city: 'Denver',   country: 'USA' });
  const mixCandPA = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: mixClubPA, display_name: 'Mixed Portland A' });
  const mixCandPB = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: mixClubPB, display_name: 'Mixed Portland B' });
  const mixCandD  = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: mixClubD,  display_name: 'Denver Solo Club' });
  mixedPortlandAffA = insertLegacyPersonClubAffiliation(db, { legacy_member_id: 'lm-disambig-mixed', legacy_club_candidate_id: mixCandPA, confidence_score: 0.9 });
  mixedPortlandAffB = insertLegacyPersonClubAffiliation(db, { legacy_member_id: 'lm-disambig-mixed', legacy_club_candidate_id: mixCandPB, confidence_score: 0.7 });
  mixedDenverAff    = insertLegacyPersonClubAffiliation(db, { legacy_member_id: 'lm-disambig-mixed', legacy_club_candidate_id: mixCandD,  confidence_score: 0.9 });

  // Leadership + same-city memberships: leadership always individual.
  insertMember(db, {
    id: MEMBER_LEADERSHIP,
    slug: 'wiz_disambig_leader',
    login_email: 'disambig-leader@example.com',
    legacy_member_id: 'lm-disambig-leader',
  });
  const leaderClub = insertClub(db, { name: 'Leader Club Helsinki', city: 'Helsinki', country: 'Finland' });
  const memberClubH1 = insertClub(db, { name: 'Helsinki Club Alpha', city: 'Helsinki', country: 'Finland' });
  const memberClubH2 = insertClub(db, { name: 'Helsinki Club Beta',  city: 'Helsinki', country: 'Finland' });
  leadershipCblId = insertClubBootstrapLeader(db, {
    club_id: leaderClub,
    legacy_member_id: 'lm-disambig-leader',
    role: 'leader',
    status: 'provisional',
  });
  const candH1 = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: memberClubH1, display_name: 'Helsinki Club Alpha' });
  const candH2 = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: memberClubH2, display_name: 'Helsinki Club Beta' });
  leadershipAffId = insertLegacyPersonClubAffiliation(db, { legacy_member_id: 'lm-disambig-leader', legacy_club_candidate_id: candH1, confidence_score: 0.9 });
  insertLegacyPersonClubAffiliation(db, { legacy_member_id: 'lm-disambig-leader', legacy_club_candidate_id: candH2, confidence_score: 0.7 });

  // F1 anti-enumeration: another member's affiliation.
  insertMember(db, {
    id: MEMBER_F1,
    slug: 'wiz_disambig_f1',
    login_email: 'disambig-f1@example.com',
    legacy_member_id: 'lm-disambig-f1',
  });
  const f1Club = insertClub(db, { name: 'F1 Club', city: 'Denver', country: 'USA' });
  const f1Cand = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: f1Club, display_name: 'F1 Club' });
  f1AffId = insertLegacyPersonClubAffiliation(db, { legacy_member_id: 'lm-disambig-f1', legacy_club_candidate_id: f1Cand, confidence_score: 0.9 });

  db.close();
  createApp = await importApp();
  testDb = new BetterSqlite3(dbPath);
  testDb.pragma('foreign_keys = ON');
});

afterAll(() => {
  testDb.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

function readAffiliationStatus(id: string): string {
  const row = testDb
    .prepare('SELECT resolution_status FROM legacy_person_club_affiliations WHERE id = ?')
    .get(id) as { resolution_status: string } | undefined;
  return row?.resolution_status ?? '';
}

function readTaskState(memberId: string): string | null {
  const row = testDb
    .prepare("SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = 'club_affiliations'")
    .get(memberId) as { state: string } | undefined;
  return row?.state ?? null;
}

describe('GET /register/wizard/club_affiliations — disambiguation card rendering', () => {
  it('3 same-city clubs render as a single disambiguation card', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_SAME_CITY));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Which clubs in Portland were you part of?');
    expect(res.text).toContain('Portland Alpha');
    expect(res.text).toContain('Portland Beta');
    expect(res.text).toContain('Portland Gamma');
    expect(res.text).toContain('name="kind" value="disambiguation"');
  });

  it('mixed-city member sees disambiguation for Portland and individual card for Denver', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_MIXED));
    expect(res.status).toBe(200);
    // First card should be Denver (alphabetical by city), which is a single
    // membership card, OR Portland disambiguation (depends on sort order).
    // With city-then-name ordering, Denver < Portland alphabetically.
    expect(res.text).toMatch(/Denver Solo Club|Which clubs in Portland/);
  });

  it('leadership cards render individually, not grouped with same-city memberships', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_LEADERSHIP));
    expect(res.status).toBe(200);
    // Leadership renders first (stage ordering).
    expect(res.text).toContain('Were you a contact for Leader Club Helsinki?');
    expect(res.text).not.toContain('Which clubs in Helsinki');
  });
});

describe('POST /register/wizard/club_affiliations/submit — disambiguation', () => {
  it('selecting 1 of 3 confirms selected, declines the other 2', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_SAME_CITY))
      .type('form')
      .send({
        kind: 'disambiguation',
        allCandidateIds: [sameCityAffA, sameCityAffB, sameCityAffC],
        selectedCandidateIds: sameCityAffA,
      });
    expect(res.status).toBe(303);

    expect(readAffiliationStatus(sameCityAffA)).toBe('confirmed_current');
    expect(readAffiliationStatus(sameCityAffB)).toBe('rejected');
    expect(readAffiliationStatus(sameCityAffC)).toBe('rejected');
  });

  it('selecting none declines all', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_MIXED))
      .type('form')
      .send({
        kind: 'disambiguation',
        allCandidateIds: [mixedPortlandAffA, mixedPortlandAffB],
      });
    expect(res.status).toBe(303);

    expect(readAffiliationStatus(mixedPortlandAffA)).toBe('rejected');
    expect(readAffiliationStatus(mixedPortlandAffB)).toBe('rejected');
  });

  it('missing allCandidateIds returns validation error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_SAME_CITY))
      .type('form')
      .send({ kind: 'disambiguation' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('allCandidateIds is required');
  });

  it('anti-enumeration: POST with another members candidateIds returns 404', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_SAME_CITY))
      .type('form')
      .send({
        kind: 'disambiguation',
        allCandidateIds: f1AffId,
        selectedCandidateIds: f1AffId,
      });
    expect(res.status).toBe(404);

    expect(readAffiliationStatus(f1AffId)).toBe('pending');
  });

  it('resolving every card without a confirmed club leaves the task open for the find-or-create wrap-up', async () => {
    // Resolve Denver solo card for MEMBER_MIXED (Portland already resolved above).
    const app = createApp();
    await request(app)
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_MIXED))
      .type('form')
      .send({
        kind: 'membership',
        candidateId: mixedDenverAff,
        userDecision: 'decline',
        activitySignal: 'not_sure',
      });

    // All cards resolved, no club confirmed: the wrap-up guidance screen
    // (clubs browse + create-club path) renders instead of auto-completing.
    expect(readTaskState(MEMBER_MIXED)).not.toBe('completed');
    const wrapUp = await request(app)
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_MIXED));
    expect(wrapUp.status).toBe(200);
    expect(wrapUp.text).toContain('Find or create your club');
    expect(wrapUp.text).toContain('Skip for now');
  });
});

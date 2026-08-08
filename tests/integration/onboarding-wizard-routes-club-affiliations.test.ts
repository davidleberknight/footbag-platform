/**
 * Route-level integration tests for the wizard's club_affiliations task
 * — GET renders the first remaining card; POST submits a per-card
 * decision, then 303s to the next remaining card (retry_same) or to the
 * next wizard task (advance). F1 anti-enumeration: cross-member POSTs
 * land on 404 with no DB writes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertClub,
  insertClubLeader,
  insertClubBootstrapLeader,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertMemberClubAffiliation,
  insertOnboardingTask,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3162');

let createApp: Awaited<ReturnType<typeof importApp>>;
let testDb: BetterSqlite3.Database;

const MEMBER_EMPTY     = 'wiz-clubaff-empty';
const MEMBER_MEMBERSHIP = 'wiz-clubaff-membership';
const MEMBER_LEADERSHIP = 'wiz-clubaff-leadership';
const MEMBER_LEAD_CAPPED = 'wiz-clubaff-lead-capped';
const MEMBER_MULTI     = 'wiz-clubaff-multi';
const MEMBER_F1_OTHER  = 'wiz-clubaff-other';
const MEMBER_JUNK      = 'wiz-clubaff-junk';
const MEMBER_PROMOTE   = 'wiz-clubaff-promote';
const MEMBER_NOPROMOTE = 'wiz-clubaff-nopromote';
const MEMBER_CAP       = 'wiz-clubaff-cap';
const MEMBER_DISAMBIG_CAP = 'wiz-clubaff-disambig-cap';
const MEMBER_SKIP_DONE    = 'wiz-clubaff-skip-done';
const MEMBER_PD_SKIP      = 'wiz-clubaff-pd-skip';
const MEMBER_CAP_LAST     = 'wiz-clubaff-cap-last';

let membershipClubId = '';
let membershipAffId  = '';
let leadershipClubId = '';
let leadershipCblId  = '';
let cappedCblId      = '';
let multiClubAlpha   = '';
let multiClubBeta    = '';
let multiAffAlpha    = '';
let multiCblBeta     = '';
let otherMemberAffId = '';
let promoteCandId    = '';
let promoteAffId     = '';
let nopromoteCandId  = '';
let nopromoteAffId   = '';
let capAffId         = '';
let capLastAffId     = '';
let disambigCapAffX  = '';
let disambigCapAffY  = '';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Empty: member with no candidates -> empty-state GET.
  insertMember(db, { onboarding: 'none',
    id: MEMBER_EMPTY,
    slug: 'wiz_clubaff_empty',
    login_email: 'wiz-empty@example.com',
    legacy_member_id: 'lm-wiz-empty',
  });

  // Membership-only: one pending membership candidate.
  insertMember(db, { onboarding: 'none',
    id: MEMBER_MEMBERSHIP,
    slug: 'wiz_clubaff_membership',
    login_email: 'wiz-membership@example.com',
    legacy_member_id: 'lm-wiz-membership',
  });
  membershipClubId = insertClub(db, { name: 'Membership Wizard Club' });
  // Seed an existing co-leader so confirming membership (which now grants the
  // member Active Player) does not surface a path-2 leadership offer; this test
  // isolates pure membership-completion. The path-2 offer has its own coverage.
  insertMember(db, { onboarding: 'none', id: 'wiz-membership-coleader', slug: 'wiz_membership_coleader', login_email: 'wiz-mem-co@example.com' });
  insertClubLeader(db, { club_id: membershipClubId, member_id: 'wiz-membership-coleader' });
  const membershipCand = insertLegacyClubCandidate(db, {
    classification: 'pre_populate',
    mapped_club_id: membershipClubId,
    display_name:   'Membership Wizard Club',
  });
  membershipAffId = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-wiz-membership',
    legacy_club_candidate_id: membershipCand,
    confidence_score:         0.9,
  });

  // Leadership-only: one provisional bootstrap leader.
  insertMember(db, { onboarding: 'none',
    id: MEMBER_LEADERSHIP,
    slug: 'wiz_clubaff_leadership',
    login_email: 'wiz-leadership@example.com',
    legacy_member_id: 'lm-wiz-leadership',
  });
  leadershipClubId = insertClub(db, { name: 'Leadership Wizard Club' });
  leadershipCblId = insertClubBootstrapLeader(db, {
    club_id:          leadershipClubId,
    legacy_member_id: 'lm-wiz-leadership',
    role:             'leader',
    status:           'provisional',
  });

  // A returning leader who already holds two current clubs. Their leadership
  // claim can still make them a co-leader, but the club cannot become one of
  // their clubs, and the wizard has to say so rather than report it added.
  insertMember(db, { onboarding: 'none',
    id: MEMBER_LEAD_CAPPED,
    slug: 'wiz_clubaff_lead_capped',
    login_email: 'wiz-lead-capped@example.com',
    legacy_member_id: 'lm-wiz-lead-capped',
  });
  insertMemberClubAffiliation(db, MEMBER_LEAD_CAPPED, insertClub(db, { name: 'Capped First Club' }), { is_primary: 1 });
  insertMemberClubAffiliation(db, MEMBER_LEAD_CAPPED, insertClub(db, { name: 'Capped Second Club' }), { is_primary: 0 });
  cappedCblId = insertClubBootstrapLeader(db, {
    club_id:          insertClub(db, { name: 'Capped Leadership Club' }),
    legacy_member_id: 'lm-wiz-lead-capped',
    role:             'leader',
    status:           'provisional',
  });

  // Multi: one membership at club Alpha + one leadership at club Beta.
  // Stage-aware ordering: leadership (Stage 1A) renders before membership
  // (Stage 1B) regardless of club name. So the Beta leadership card renders
  // first; after submit, the Alpha membership card renders.
  insertMember(db, { onboarding: 'none',
    id: MEMBER_MULTI,
    slug: 'wiz_clubaff_multi',
    login_email: 'wiz-multi@example.com',
    legacy_member_id: 'lm-wiz-multi',
  });
  multiClubAlpha = insertClub(db, { name: 'Alpha Club (membership)' });
  multiClubBeta  = insertClub(db, { name: 'Beta Club (leadership)' });
  const multiCandAlpha = insertLegacyClubCandidate(db, {
    classification: 'pre_populate',
    mapped_club_id: multiClubAlpha,
    display_name:   'Alpha Club (membership)',
  });
  multiAffAlpha = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-wiz-multi',
    legacy_club_candidate_id: multiCandAlpha,
    confidence_score:         0.9,
  });
  multiCblBeta = insertClubBootstrapLeader(db, {
    club_id:          multiClubBeta,
    legacy_member_id: 'lm-wiz-multi',
    role:             'leader',
    status:           'provisional',
  });

  // Junk-classified candidate: a pending affiliation against a junk candidate
  // must never surface as a wizard card, even when the candidate has a
  // mapped clubs row.
  insertMember(db, { onboarding: 'none',
    id: MEMBER_JUNK,
    slug: 'wiz_clubaff_junk',
    login_email: 'wiz-junk@example.com',
    legacy_member_id: 'lm-wiz-junk',
  });
  const junkClubId = insertClub(db, { name: 'Junk Wizard Club' });
  const junkCand = insertLegacyClubCandidate(db, {
    classification: 'junk',
    mapped_club_id: junkClubId,
    display_name:   'Junk Wizard Club',
  });
  insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-wiz-junk',
    legacy_club_candidate_id: junkCand,
    confidence_score:         0.9,
  });

  // Unpromoted candidates: pending affiliations against onboarding_visible
  // candidates that have no clubs row yet. Confirm promotes; decline does not.
  insertMember(db, { onboarding: 'none',
    id: MEMBER_PROMOTE,
    slug: 'wiz_clubaff_promote',
    login_email: 'wiz-promote@example.com',
    legacy_member_id: 'lm-wiz-promote',
  });
  promoteCandId = insertLegacyClubCandidate(db, {
    classification: 'onboarding_visible',
    display_name:   'Unpromoted Confirm Club',
    city:           'Springfield',
    country:        'USA',
    description:    'A club awaiting promotion.',
  });
  promoteAffId = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-wiz-promote',
    legacy_club_candidate_id: promoteCandId,
    confidence_score:         0.9,
  });
  insertMember(db, { onboarding: 'none',
    id: MEMBER_NOPROMOTE,
    slug: 'wiz_clubaff_nopromote',
    login_email: 'wiz-nopromote@example.com',
    legacy_member_id: 'lm-wiz-nopromote',
  });
  nopromoteCandId = insertLegacyClubCandidate(db, {
    classification: 'onboarding_visible',
    display_name:   'Unpromoted Decline Club',
    country:        'USA',
  });
  nopromoteAffId = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-wiz-nopromote',
    legacy_club_candidate_id: nopromoteCandId,
    confidence_score:         0.7,
  });

  // At-cap: member already holds two current club affiliations plus a pending
  // membership candidate for a third club. Confirming the third is a cap hit.
  insertMember(db, { onboarding: 'none',
    id: MEMBER_CAP,
    slug: 'wiz_clubaff_cap',
    login_email: 'wiz-cap@example.com',
    legacy_member_id: 'lm-wiz-cap',
  });
  const capClubA = insertClub(db, { name: 'Cap Current Club A' });
  const capClubB = insertClub(db, { name: 'Cap Current Club B' });
  insertMemberClubAffiliation(db, MEMBER_CAP, capClubA, { is_current: 1, is_primary: 1 });
  insertMemberClubAffiliation(db, MEMBER_CAP, capClubB, { is_current: 1, is_primary: 0 });
  const capClubC = insertClub(db, { name: 'Cap Third Club C' });
  const capCand = insertLegacyClubCandidate(db, {
    classification: 'pre_populate',
    mapped_club_id: capClubC,
    display_name:   'Cap Third Club C',
  });
  capAffId = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-wiz-cap',
    legacy_club_candidate_id: capCand,
    confidence_score:         0.9,
  });

  // At-cap with the club step last: same shape as MEMBER_CAP, but the claim
  // step is already answered, so resolving this card completes onboarding and
  // the member is advanced straight to the completion page. That is the case
  // where the club card never renders again, so it is the one that proves the
  // cap notice still reaches the member.
  insertMember(db, { onboarding: 'none',
    id: MEMBER_CAP_LAST,
    slug: 'wiz_clubaff_cap_last',
    login_email: 'wiz-cap-last@example.com',
    legacy_member_id: 'lm-wiz-cap-last',
  });
  const capLastA = insertClub(db, { name: 'Cap Last Current A' });
  const capLastB = insertClub(db, { name: 'Cap Last Current B' });
  insertMemberClubAffiliation(db, MEMBER_CAP_LAST, capLastA, { is_current: 1, is_primary: 1 });
  insertMemberClubAffiliation(db, MEMBER_CAP_LAST, capLastB, { is_current: 1, is_primary: 0 });
  const capLastC = insertClub(db, { name: 'Cap Last Third Club' });
  const capLastCand = insertLegacyClubCandidate(db, {
    classification: 'pre_populate',
    mapped_club_id: capLastC,
    display_name:   'Cap Last Third Club',
  });
  capLastAffId = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-wiz-cap-last',
    legacy_club_candidate_id: capLastCand,
    confidence_score:         0.9,
  });
  insertOnboardingTask(db, MEMBER_CAP_LAST, 'legacy_claim', 'completed');

  // F1 setup: a different member's candidate that the attacker tries to POST.
  insertMember(db, { onboarding: 'none',
    id: MEMBER_F1_OTHER,
    slug: 'wiz_clubaff_other',
    login_email: 'wiz-other@example.com',
    legacy_member_id: 'lm-wiz-other',
  });
  const otherClubId = insertClub(db, { name: 'Other Member Club' });
  const otherCand = insertLegacyClubCandidate(db, {
    classification: 'pre_populate',
    mapped_club_id: otherClubId,
  });
  otherMemberAffId = insertLegacyPersonClubAffiliation(db, {
    legacy_member_id:         'lm-wiz-other',
    legacy_club_candidate_id: otherCand,
  });

  // At-cap disambiguation: a member already at the two-current-club cap with a
  // same-city pair of pending candidates (one disambiguation card). Confirming
  // a club from it is a cap hit, so the wizard must surface the cap notice
  // rather than telling the member the club was added.
  insertMember(db, { onboarding: 'none',
    id: MEMBER_DISAMBIG_CAP,
    slug: 'wiz_clubaff_disambig_cap',
    login_email: 'wiz-disambig-cap@example.com',
    legacy_member_id: 'lm-wiz-disambig-cap',
  });
  const dcCurA = insertClub(db, { name: 'DisambigCap Current A' });
  const dcCurB = insertClub(db, { name: 'DisambigCap Current B' });
  insertMemberClubAffiliation(db, MEMBER_DISAMBIG_CAP, dcCurA, { is_current: 1, is_primary: 1 });
  insertMemberClubAffiliation(db, MEMBER_DISAMBIG_CAP, dcCurB, { is_current: 1, is_primary: 0 });
  const dcClubX = insertClub(db, { name: 'Boston X', city: 'Boston', country: 'USA' });
  const dcClubY = insertClub(db, { name: 'Boston Y', city: 'Boston', country: 'USA' });
  const dcCandX = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: dcClubX, display_name: 'Boston X' });
  const dcCandY = insertLegacyClubCandidate(db, { classification: 'pre_populate', mapped_club_id: dcClubY, display_name: 'Boston Y' });
  disambigCapAffX = insertLegacyPersonClubAffiliation(db, { legacy_member_id: 'lm-wiz-disambig-cap', legacy_club_candidate_id: dcCandX, confidence_score: 0.9 });
  disambigCapAffY = insertLegacyPersonClubAffiliation(db, { legacy_member_id: 'lm-wiz-disambig-cap', legacy_club_candidate_id: dcCandY, confidence_score: 0.7 });

  // Skip-guard members: one with the club task already completed (a skip POST
  // must not re-open it), one with personal_details pending (a skip POST on the
  // required task is a no-op that leaves it pending).
  insertMember(db, { onboarding: 'none', id: MEMBER_SKIP_DONE, slug: 'wiz_clubaff_skip_done', login_email: 'wiz-skip-done@example.com' });
  insertOnboardingTask(db, MEMBER_SKIP_DONE, 'club_affiliations', 'completed');
  insertMember(db, { onboarding: 'none', id: MEMBER_PD_SKIP, slug: 'wiz_clubaff_pd_skip', login_email: 'wiz-pd-skip@example.com' });
  insertOnboardingTask(db, MEMBER_PD_SKIP, 'personal_details', 'pending');

  // The club-affiliations step runs only once personal details are on file, so
  // every member that reaches a club card, the wrap-up landing, or a club-card
  // submit has that prerequisite completed first.
  for (const id of [
    MEMBER_EMPTY, MEMBER_MEMBERSHIP, MEMBER_LEADERSHIP, MEMBER_LEAD_CAPPED, MEMBER_MULTI,
    MEMBER_JUNK, MEMBER_CAP, MEMBER_CAP_LAST, MEMBER_DISAMBIG_CAP, MEMBER_PROMOTE, MEMBER_NOPROMOTE,
  ]) {
    insertOnboardingTask(db, id, 'personal_details', 'completed');
  }

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
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function readAffiliationStatus(id: string): string {
  const row = testDb
    .prepare(`SELECT resolution_status FROM legacy_person_club_affiliations WHERE id = ?`)
    .get(id) as { resolution_status: string } | undefined;
  return row?.resolution_status ?? '';
}

function readCurrentAffiliationCount(memberId: string): number {
  const row = testDb
    .prepare(`SELECT COUNT(*) c FROM member_club_affiliations WHERE member_id = ? AND is_current = 1`)
    .get(memberId) as { c: number };
  return row.c;
}

function readBootstrapStatus(id: string): string {
  const row = testDb
    .prepare(`SELECT status FROM club_bootstrap_leaders WHERE id = ?`)
    .get(id) as { status: string } | undefined;
  return row?.status ?? '';
}

function readTaskState(memberId: string, taskType: string = 'club_affiliations'): string | null {
  const row = testDb
    .prepare(`SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = ?`)
    .get(memberId, taskType) as { state: string } | undefined;
  return row?.state ?? null;
}

function clubJoinGrantCount(memberId: string): number {
  const row = testDb
    .prepare(
      `SELECT COUNT(*) AS n FROM active_player_grants
       WHERE member_id = ? AND reason_code = 'club_join_one_time_active_player_grant'`,
    )
    .get(memberId) as { n: number };
  return row.n;
}

function isActivePlayer(memberId: string): number {
  const row = testDb
    .prepare(`SELECT is_active_player FROM member_active_player_current WHERE member_id = ?`)
    .get(memberId) as { is_active_player: number } | undefined;
  return row?.is_active_player ?? 0;
}

describe('GET /register/wizard/club_affiliations — card listing', () => {
  it('member with no candidates -> task stays pending and renders the find-or-create wrap-up landing', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_EMPTY));
    // club_affiliations is universal: a member with zero possible cards still
    // reaches the find-or-create-your-club wrap-up so every member is asked to
    // join or create a club. With no legacy suggestion material, the landing
    // states that no past club affiliation was found.
    expect(res.status).toBe(200);
    expect(res.text).toContain('Clubs come after onboarding');
    expect(res.text).toContain('We did not find a past club affiliation for you');
    expect(readTaskState(MEMBER_EMPTY)).toBe('pending');
  });

  it('junk-classified candidate never surfaces as a card; member reaches the wrap-up landing', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_JUNK));
    expect(res.text).not.toContain('Junk Wizard Club');
    // With the junk candidate filtered, the member has zero Stage 1 cards and
    // still lands on the find-or-create-your-club wrap-up landing.
    expect(res.status).toBe(200);
    expect(res.text).toContain('Clubs come after onboarding');
    expect(readTaskState(MEMBER_JUNK)).toBe('pending');
  });

  it('member with one membership candidate -> renders the membership card with the confidence band', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_MEMBERSHIP));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Membership Wizard Club');
    expect(res.text).toContain('Were you a member of');
    expect(res.text).toContain('Match strength: High');
    // The hidden inputs encode kind + candidateId for the POST.
    expect(res.text).toContain('value="membership"');
    expect(res.text).toContain(`value="${membershipAffId}"`);
    // One save control, below both questions, so the member reaches the action
    // having already read what it submits.
    expect(res.text.match(/>Save Answers</g)?.length).toBe(1);
  });

  it('member with one leadership candidate -> renders the leadership card with classification + signal checklist', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_LEADERSHIP));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Leadership Wizard Club');
    // The leadership card asks the leadership question (a Yes records
    // co-leadership, not plain membership) and states the co-leader /
    // club-revival / Active-Player consequences of confirming.
    expect(res.text).toContain('Were you a leader or organizer of');
    expect(res.text).toContain('makes you a co-leader');
    // No signals seeded -> classification falls back to 'none' (plain-language label).
    expect(res.text).toContain('Uncertain match');
    expect(res.text).toContain('value="leadership"');
    expect(res.text).toContain(`value="${leadershipCblId}"`);
    // Per Q1 lock: all 7 signal labels render.
    expect(res.text).toContain('Listed as contact');
    expect(res.text).toContain('Has affiliations');
    expect(res.text).toContain('Hosted events');
    expect(res.text).toContain('Roster of 5 or more members');
    expect(res.text).toContain('Name mirrored in description');
    expect(res.text).toContain('Active in last 5 years');
    expect(res.text).toContain('Geographic match');
  });

  it('member with multiple candidates across clubs -> Stage 1A leadership cards before Stage 1B membership cards', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_MULTI));
    expect(res.status).toBe(200);
    // Stage 1A (leadership) renders before Stage 1B (membership) regardless
    // of club name; the Beta leadership card renders first even though
    // Alpha is alphabetically earlier.
    expect(res.text).toContain('Beta Club (leadership)');
    // The leadership card is identified by its co-leader consequences note; the
    // membership card ("Match strength") is not rendered yet (one card at a time).
    expect(res.text).toContain('makes you a co-leader');
    expect(res.text).not.toContain('Match strength');
  });
});

describe('the wizard offers no way out but an answer', () => {
  const taskState = (memberId: string): string =>
    (testDb.prepare(
      `SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = 'club_affiliations'`,
    ).get(memberId) as { state: string } | undefined)?.state ?? 'missing';

  it('the retired detour and dismiss routes are gone', async () => {
    const id = insertMember(testDb, { onboarding: 'none', slug: 'wiz_no_exits', login_email: 'wiz-no-exits@example.com' });
    await request(createApp()).get('/register/wizard/club_affiliations').set('Cookie', cookieFor(id));

    const detour = await request(createApp())
      .get('/register/wizard/club_affiliations/detour?to=create')
      .set('Cookie', cookieFor(id));
    expect(detour.status).toBe(404);

    const dismiss = await request(createApp())
      .post('/register/wizard/club_affiliations/dismiss')
      .set('Cookie', cookieFor(id));
    expect(dismiss.status).toBe(404);

    expect(taskState(id)).toBe('pending');
  });

  it('the no-club answer completes the task', async () => {
    const id = insertMember(testDb, { onboarding: 'none', slug: 'wiz_no_clubs', login_email: 'wiz-no-clubs@example.com' });
    // The club step runs only once personal details are on file.
    insertOnboardingTask(testDb, id, 'personal_details', 'completed');
    await request(createApp()).get('/register/wizard/club_affiliations').set('Cookie', cookieFor(id));
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/none')
      .set('Cookie', cookieFor(id));
    expect(res.status).toBe(303);
    expect(taskState(id)).toBe('completed');
  });

  it('the no-club answer refuses before personal details are on file', async () => {
    const id = insertMember(testDb, { onboarding: 'none', slug: 'wiz_no_clubs_early', login_email: 'wiz-no-clubs-early@example.com' });
    await request(createApp()).get('/register/wizard/club_affiliations').set('Cookie', cookieFor(id));
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/none')
      .set('Cookie', cookieFor(id));
    expect(res.status).toBe(303);
    expect(taskState(id)).toBe('pending');
  });

  it('the no-club answer is a no-op once the task is already answered', async () => {
    const id = insertMember(testDb, { onboarding: 'none', slug: 'wiz_no_clubs_again', login_email: 'wiz-no-clubs-again@example.com' });
    insertOnboardingTask(testDb, id, 'personal_details', 'completed');
    await request(createApp()).get('/register/wizard/club_affiliations').set('Cookie', cookieFor(id));
    await request(createApp())
      .post('/register/wizard/club_affiliations/none')
      .set('Cookie', cookieFor(id));
    const again = await request(createApp())
      .post('/register/wizard/club_affiliations/none')
      .set('Cookie', cookieFor(id));
    expect(again.status).toBe(303);
    expect(taskState(id)).toBe('completed');
  });
});

describe('POST /register/wizard/club_affiliations/submit — per-card flow', () => {
  it('membership confirm with one remaining card -> 303 retry_same; lpca status confirmed_current', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_MEMBERSHIP))
      .type('form')
      .send({ kind: 'membership', candidateId: membershipAffId, userDecision: 'confirm', activitySignal: 'active' });

    expect(res.status).toBe(303);
    // No more club cards remaining -> advance to the next pending task. This
    // member has personal details on file but has not completed legacy_claim, so
    // the wizard routes there next (the order is personal_details, then
    // legacy_claim, then club_affiliations).
    expect(res.headers.location).toBe('/register/wizard/legacy_claim');
    expect(readAffiliationStatus(membershipAffId)).toBe('confirmed_current');
    expect(readTaskState(MEMBER_MEMBERSHIP)).toBe('completed');

    // The first club affiliation fires the one-time club-join Active Player
    // grant for a Tier 0 member, who now reads as a current Active Player.
    expect(clubJoinGrantCount(MEMBER_MEMBERSHIP)).toBe(1);
    expect(isActivePlayer(MEMBER_MEMBERSHIP)).toBe(1);
  });

  it('membership confirm at the two-current-club cap records a former membership and resolves the card', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_CAP))
      .type('form')
      .send({ kind: 'membership', candidateId: capAffId, userDecision: 'confirm', activitySignal: 'active' });

    expect(res.status).toBe(303);
    // The Yes is true about the past even though no current slot is free, so
    // it is kept as a former membership and the card never blocks the step.
    expect(readAffiliationStatus(capAffId)).toBe('former_only');
    // No current affiliation is written, so the cap itself still holds.
    expect(readCurrentAffiliationCount(MEMBER_CAP)).toBe(2);

    // The member carries the cap notice into the next render of the step.
    const setCookies = (res.headers['set-cookie'] ?? []) as unknown as string[];
    const flashCookie = setCookies
      .map((c) => c.split(';')[0])
      .find((c) => c.startsWith('footbag_flash='));
    expect(flashCookie).toBeDefined();
  });

  it('cap hit on the last card is explained on the club step itself, not a step later', async () => {
    // Resolving the last card completes the step, so without holding the render
    // the club page never draws again and the member reads what happened to
    // their Yes on the completion page with no club context around it. The step
    // draws once more instead, carrying the notice and a way onward.
    const submit = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_CAP_LAST))
      .type('form')
      .send({ kind: 'membership', candidateId: capLastAffId, userDecision: 'confirm', activitySignal: 'active' });
    expect(submit.status).toBe(303);

    const flashCookie = ((submit.headers['set-cookie'] ?? []) as unknown as string[])
      .map((c) => c.split(';')[0])
      .find((c) => c.startsWith('footbag_flash='));
    expect(flashCookie).toBeDefined();

    const carried = `${cookieFor(MEMBER_CAP_LAST)}; ${flashCookie}`;

    const afterCard = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', carried);
    expect(afterCard.status).toBe(200);
    expect(afterCard.text).toContain('two current-club limit');
    expect(afterCard.text).toContain('Cap Last Third Club');
    // The spent controls are gone: no card to answer and no no-club exit.
    expect(afterCard.text).not.toContain('Finish Without a Club');
    expect(afterCard.text).toContain('Continue');

    // The hold lasts exactly one render. With the notice spent, the step
    // advances as it did before, so nothing is stuck behind a read receipt.
    const again = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_CAP_LAST));
    expect(again.status).toBe(303);
    expect(again.headers.location).toBe('/register/wizard/complete');
  });

  it('leadership confirm -> 303 advance; bootstrap_leader claimed; task completed', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_LEADERSHIP))
      .type('form')
      .send({ kind: 'leadership', candidateId: leadershipCblId, userDecision: 'confirm', activitySignal: 'active' });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/legacy_claim');
    expect(readBootstrapStatus(leadershipCblId)).toBe('claimed');
    expect(readTaskState(MEMBER_LEADERSHIP)).toBe('completed');

    // Claiming bootstrap leadership creates the member's first club affiliation,
    // which fires the one-time club-join Active Player grant for a Tier 0 member.
    expect(clubJoinGrantCount(MEMBER_LEADERSHIP)).toBe(1);
    expect(isActivePlayer(MEMBER_LEADERSHIP)).toBe(1);
  });

  it('leadership confirm at the two-club cap says so, and never reports the club added', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_LEAD_CAPPED))
      .type('form')
      .send({ kind: 'leadership', candidateId: cappedCblId, userDecision: 'confirm', activitySignal: 'active' });
    expect(res.status).toBe(303);

    // The claim itself stands: the bootstrap row is claimed and the member
    // co-leads the club. Only the club membership was refused.
    expect(readBootstrapStatus(cappedCblId)).toBe('claimed');

    const flashCookie = ((res.headers['set-cookie'] ?? []) as unknown as string[])
      .map((c) => c.split(';')[0])
      .find((c) => c.startsWith('footbag_flash='));
    expect(flashCookie).toBeDefined();

    // A leadership claim completes the club task in the submit itself, so the
    // club step has nothing left to draw and the notice lands on the page the
    // member is actually sent to.
    const carried = `${cookieFor(MEMBER_LEAD_CAPPED)}; ${flashCookie}`;
    let page = await request(app).get('/register/wizard/club_affiliations').set('Cookie', carried);
    if (page.status === 303) {
      page = await request(app).get(page.headers.location as string).set('Cookie', carried);
    }
    expect(page.status).toBe(200);
    expect(page.text).toContain('two current-club limit');
    expect(page.text).toContain('Capped Leadership Club');
    expect(page.text).toContain('you lead');
    expect(page.text).not.toContain('Added Capped Leadership Club to your clubs');
  });

  it('multi-card flow: submit Beta leadership (Stage 1A) first -> 303 retry_same; second GET renders Alpha membership (Stage 1B); second submit advances', async () => {
    const first = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_MULTI))
      .type('form')
      .send({ kind: 'leadership', candidateId: multiCblBeta, userDecision: 'confirm', activitySignal: 'active' });

    expect(first.status).toBe(303);
    expect(first.headers.location).toBe('/register/wizard/club_affiliations');
    expect(readTaskState(MEMBER_MULTI)).not.toBe('completed');
    expect(readBootstrapStatus(multiCblBeta)).toBe('claimed');

    const next = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_MULTI));
    expect(next.status).toBe(200);
    expect(next.text).toContain('Alpha Club (membership)');
    expect(next.text).toContain('Were you a member of');

    const second = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_MULTI))
      .type('form')
      .send({ kind: 'membership', candidateId: multiAffAlpha, userDecision: 'confirm', activitySignal: 'active' });

    expect(second.status).toBe(303);
    expect(second.headers.location).toBe('/register/wizard/legacy_claim');
    expect(readTaskState(MEMBER_MULTI)).toBe('completed');
  });

  it('Tier 1+ member confirming a first affiliation gets no club-join grant (Active Player is a Tier 0 benefit)', async () => {
    const TIER1_MEMBER = 'wiz-clubaff-tier1';
    const TIER1_LM = 'lm-wiz-tier1';
    insertMember(testDb, {
      id: TIER1_MEMBER, slug: 'wiz_clubaff_tier1',
      login_email: 'wiz-tier1@example.com', legacy_member_id: TIER1_LM,
    });
    testDb.prepare(`
      INSERT INTO member_tier_grants
        (id, created_at, created_by, member_id, actor_member_id, change_type,
         old_tier_status, new_tier_status, old_underlying_tier_status, new_underlying_tier_status, reason_code)
      VALUES (?, '2026-01-01T00:00:00.000Z', 'test', ?, NULL, 'grant',
              'tier0', 'tier1', NULL, NULL, 'test.tier_grant')
    `).run('wiz-tier1-grant', TIER1_MEMBER);
    const clubId = insertClub(testDb, { name: 'Tier1 Wizard Club' });
    // Existing co-leader so the confirmed membership does not surface a path-2 offer.
    insertMember(testDb, { id: 'wiz-tier1-coleader', slug: 'wiz_tier1_coleader', login_email: 'wiz-tier1-co@example.com' });
    insertClubLeader(testDb, { club_id: clubId, member_id: 'wiz-tier1-coleader' });
    const cand = insertLegacyClubCandidate(testDb, {
      classification: 'pre_populate', mapped_club_id: clubId, display_name: 'Tier1 Wizard Club',
    });
    const affId = insertLegacyPersonClubAffiliation(testDb, {
      legacy_member_id: TIER1_LM, legacy_club_candidate_id: cand, confidence_score: 0.9,
    });

    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(TIER1_MEMBER))
      .type('form')
      .send({ kind: 'membership', candidateId: affId, userDecision: 'confirm', activitySignal: 'active' });

    expect(res.status).toBe(303);
    expect(readAffiliationStatus(affId)).toBe('confirmed_current');
    expect(clubJoinGrantCount(TIER1_MEMBER)).toBe(0);
    expect(isActivePlayer(TIER1_MEMBER)).toBe(0);
  });
});

describe('POST /register/wizard/club_affiliations/submit — F1 anti-enumeration', () => {
  it('member A POSTing member B candidateId -> 404; B status untouched', async () => {
    const beforeStatus = readAffiliationStatus(otherMemberAffId);

    // MEMBER_EMPTY (legacy_member_id='lm-wiz-empty') tries to POST against
    // MEMBER_F1_OTHER's affiliation (legacy_member_id='lm-wiz-other').
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_EMPTY))
      .type('form')
      .send({ kind: 'membership', candidateId: otherMemberAffId, userDecision: 'confirm', activitySignal: 'active' });

    expect(res.status).toBe(404);
    expect(readAffiliationStatus(otherMemberAffId)).toBe(beforeStatus);
  });

  it('member with no legacy_member_id -> any candidateId returns 404 (no F1 anchor)', async () => {
    // A fresh member with NO legacy_member_id link.
    const orphan = insertMember(testDb, {
      slug: `wiz_clubaff_orphan_${Date.now()}`,
      login_email: `wiz-orphan-${Date.now()}@example.com`,
    });
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(orphan))
      .type('form')
      .send({ kind: 'membership', candidateId: otherMemberAffId, userDecision: 'confirm', activitySignal: 'active' });

    expect(res.status).toBe(404);
  });
});

describe('POST /register/wizard/club_affiliations/submit — validation', () => {
  it('missing candidateId -> 422 with form-error inline', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_EMPTY))
      .type('form')
      .send({ kind: 'membership', userDecision: 'confirm', activitySignal: 'active' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('candidateId is required');
  });

  it('invalid userDecision -> 422', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_EMPTY))
      .type('form')
      .send({ kind: 'membership', candidateId: 'some-id', userDecision: 'maybe' });
    expect(res.status).toBe(422);
    expect(res.text).toContain("userDecision must be one of");
  });

  it('invalid kind -> 422', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_EMPTY))
      .type('form')
      .send({ kind: 'other_kind', candidateId: 'some-id', userDecision: 'confirm', activitySignal: 'active' });
    expect(res.status).toBe(422);
    expect(res.text).toContain("kind must be one of");
  });

  it('unauthenticated POST -> 302 to /login', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .type('form')
      .send({ kind: 'membership', candidateId: 'some-id', userDecision: 'confirm', activitySignal: 'active' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });
});

describe('POST /register/wizard/club_affiliations/submit — unpromoted-candidate promotion', () => {
  function readCandidate(id: string): { mapped_club_id: string | null; classification: string } {
    return testDb
      .prepare(`SELECT mapped_club_id, classification FROM legacy_club_candidates WHERE id = ?`)
      .get(id) as { mapped_club_id: string | null; classification: string };
  }

  it('card for an unpromoted candidate renders from the candidate fields', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_PROMOTE));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Unpromoted Confirm Club');
    expect(res.text).toContain('Were you a member of');
  });

  it('confirm promotes the candidate to a live club, confirms the affiliation, and completes the task', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_PROMOTE))
      .type('form')
      .send({ kind: 'membership', candidateId: promoteAffId, userDecision: 'confirm', activitySignal: 'active' });
    expect(res.status).toBe(303);

    const candidate = readCandidate(promoteCandId);
    expect(candidate.mapped_club_id).not.toBeNull();

    const club = testDb
      .prepare(`SELECT name FROM clubs WHERE id = ?`)
      .get(candidate.mapped_club_id) as { name: string } | undefined;
    expect(club?.name).toBe('Unpromoted Confirm Club');

    const aff = testDb
      .prepare(`SELECT resolution_status, resolved_club_id FROM legacy_person_club_affiliations WHERE id = ?`)
      .get(promoteAffId) as { resolution_status: string; resolved_club_id: string | null };
    expect(aff.resolution_status).toBe('confirmed_current');
    expect(aff.resolved_club_id).toBe(candidate.mapped_club_id);

    const mca = testDb
      .prepare(`SELECT club_id, is_current FROM member_club_affiliations WHERE member_id = ?`)
      .all(MEMBER_PROMOTE) as Array<{ club_id: string; is_current: number }>;
    expect(mca).toHaveLength(1);
    expect(mca[0].club_id).toBe(candidate.mapped_club_id);
    expect(mca[0].is_current).toBe(1);

    expect(readTaskState(MEMBER_PROMOTE)).toBe('completed');
  });

  it('decline rejects the suggestion without creating a club', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_NOPROMOTE))
      .type('form')
      .send({ kind: 'membership', candidateId: nopromoteAffId, userDecision: 'decline', activitySignal: 'not_active' });
    expect(res.status).toBe(303);

    expect(readCandidate(nopromoteCandId).mapped_club_id).toBeNull();
    expect(readAffiliationStatus(nopromoteAffId)).toBe('rejected');
    expect(readTaskState(MEMBER_NOPROMOTE)).not.toBe('completed');
  });

  it('skip from the wrap-up guidance screen ends the task', async () => {
    // The declined-everything member sees the wrap-up, then skips out.
    const wrapUp = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_NOPROMOTE));
    expect(wrapUp.status).toBe(200);
    expect(wrapUp.text).toContain('Clubs come after onboarding');
    // Joining and creating clubs are member capabilities, still fenced at this
    // point, so the wizard offers neither action nor any outward link.
    expect(wrapUp.text).not.toContain('Create a New Club');
    expect(wrapUp.text).not.toContain('Browse Clubs');
    expect(wrapUp.text).not.toContain('Creating a club requires IFPA Membership (Tier 1)');

    const answer = await request(createApp())
      .post('/register/wizard/club_affiliations/none')
      .set('Cookie', cookieFor(MEMBER_NOPROMOTE));
    expect(answer.status).toBe(303);
    expect(readTaskState(MEMBER_NOPROMOTE)).toBe('completed');
  });
});

describe('POST /register/wizard/club_affiliations/submit — activity-signal emission on every membership branch', () => {
  const SIG_DECLINE  = 'wiz-sig-decline';
  const SIG_CORRECT  = 'wiz-sig-correct';
  const SIG_CONFIRM  = 'wiz-sig-confirm';

  let declineCandId = '';
  let declineAffId  = '';
  let correctClubId = '';
  let correctAffId  = '';
  let confirmClubId = '';
  let confirmAffId  = '';

  interface SignalRow {
    club_id: string | null;
    source_stage: string;
    activity_signal: string;
    source_entity_type: string | null;
    source_entity_id: string | null;
  }

  function readSignals(memberId: string): SignalRow[] {
    return testDb
      .prepare(`SELECT club_id, source_stage, activity_signal, source_entity_type, source_entity_id
                  FROM club_viability_signals WHERE member_id = ? ORDER BY rowid`)
      .all(memberId) as SignalRow[];
  }

  beforeAll(() => {
    insertMember(testDb, {
      id: SIG_DECLINE,
      slug: 'wiz_sig_decline',
      login_email: 'wiz-sig-decline@example.com',
      legacy_member_id: 'lm-wiz-sig-decline',
    });
    declineCandId = insertLegacyClubCandidate(testDb, {
      classification: 'onboarding_visible',
      display_name:   'Signal Decline Club',
    });
    declineAffId = insertLegacyPersonClubAffiliation(testDb, {
      legacy_member_id:         'lm-wiz-sig-decline',
      legacy_club_candidate_id: declineCandId,
    });

    insertMember(testDb, {
      id: SIG_CORRECT,
      slug: 'wiz_sig_correct',
      login_email: 'wiz-sig-correct@example.com',
      legacy_member_id: 'lm-wiz-sig-correct',
    });
    correctClubId = insertClub(testDb, { name: 'Signal Correct Club' });
    const correctCandId = insertLegacyClubCandidate(testDb, {
      classification: 'pre_populate',
      mapped_club_id: correctClubId,
      display_name:   'Signal Correct Club',
    });
    correctAffId = insertLegacyPersonClubAffiliation(testDb, {
      legacy_member_id:         'lm-wiz-sig-correct',
      legacy_club_candidate_id: correctCandId,
    });

    insertMember(testDb, {
      id: SIG_CONFIRM,
      slug: 'wiz_sig_confirm',
      login_email: 'wiz-sig-confirm@example.com',
      legacy_member_id: 'lm-wiz-sig-confirm',
    });
    confirmClubId = insertClub(testDb, { name: 'Signal Confirm Club' });
    const confirmCandId = insertLegacyClubCandidate(testDb, {
      classification: 'pre_populate',
      mapped_club_id: confirmClubId,
      display_name:   'Signal Confirm Club',
    });
    confirmAffId = insertLegacyPersonClubAffiliation(testDb, {
      legacy_member_id:         'lm-wiz-sig-confirm',
      legacy_club_candidate_id: confirmCandId,
    });
  });

  it('decline on an unpromoted candidate records a candidate-keyed flag, keyed by the candidate id', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(SIG_DECLINE))
      .type('form')
      .send({ kind: 'membership', candidateId: declineAffId, userDecision: 'decline', activitySignal: 'not_active' });
    expect(res.status).toBe(303);

    const signals = readSignals(SIG_DECLINE);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({
      club_id: null,
      source_stage: 'stage1b_affiliated',
      activity_signal: 'not_active',
      source_entity_type: 'legacy_club_candidate',
      source_entity_id: declineCandId,
    });
  });

  it('correct on a promoted candidate records the signal against the mapped live club', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(SIG_CORRECT))
      .type('form')
      .send({ kind: 'membership', candidateId: correctAffId, userDecision: 'correct', activitySignal: 'not_active' });
    expect(res.status).toBe(303);

    const signals = readSignals(SIG_CORRECT);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({
      club_id: correctClubId,
      source_stage: 'stage1b_affiliated',
      activity_signal: 'not_active',
      source_entity_type: 'legacy_person_club_affiliation',
      source_entity_id: correctAffId,
    });
  });

  it('confirm still records the signal against the resolved club', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(SIG_CONFIRM))
      .type('form')
      .send({ kind: 'membership', candidateId: confirmAffId, userDecision: 'confirm', activitySignal: 'active' });
    expect(res.status).toBe(303);

    const signals = readSignals(SIG_CONFIRM);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toEqual({
      club_id: confirmClubId,
      source_stage: 'stage1b_affiliated',
      activity_signal: 'active',
      source_entity_type: 'legacy_person_club_affiliation',
      source_entity_id: confirmAffId,
    });
  });

  it('a member-confirm promotion stamps an earlier decliner’s candidate-keyed flag onto the new club', async () => {
    const SIG_EARLY = 'wiz-sig-early-decliner';
    const SIG_LATE  = 'wiz-sig-late-confirmer';
    insertMember(testDb, {
      id: SIG_EARLY,
      slug: 'wiz_sig_early',
      login_email: 'wiz-sig-early@example.com',
      legacy_member_id: 'lm-wiz-sig-early',
    });
    insertMember(testDb, {
      id: SIG_LATE,
      slug: 'wiz_sig_late',
      login_email: 'wiz-sig-late@example.com',
      legacy_member_id: 'lm-wiz-sig-late',
    });
    const sharedCandId = insertLegacyClubCandidate(testDb, {
      classification: 'onboarding_visible',
      display_name:   'Shared Carry-Forward Club',
    });
    const earlyAffId = insertLegacyPersonClubAffiliation(testDb, {
      legacy_member_id:         'lm-wiz-sig-early',
      legacy_club_candidate_id: sharedCandId,
    });
    const lateAffId = insertLegacyPersonClubAffiliation(testDb, {
      legacy_member_id:         'lm-wiz-sig-late',
      legacy_club_candidate_id: sharedCandId,
    });

    // The early member declines while the candidate is unpromoted: their
    // activity answer lands as a candidate-keyed flag.
    const decline = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(SIG_EARLY))
      .type('form')
      .send({ kind: 'membership', candidateId: earlyAffId, userDecision: 'decline', activitySignal: 'not_active' });
    expect(decline.status).toBe(303);
    expect(readSignals(SIG_EARLY)[0].club_id).toBeNull();

    // A later member confirms, which promotes the candidate; the earlier
    // flag gets the new club id stamped so both votes feed the same gate.
    const confirm = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(SIG_LATE))
      .type('form')
      .send({ kind: 'membership', candidateId: lateAffId, userDecision: 'confirm', activitySignal: 'active' });
    expect(confirm.status).toBe(303);

    const mappedClubId = (testDb
      .prepare(`SELECT mapped_club_id FROM legacy_club_candidates WHERE id = ?`)
      .get(sharedCandId) as { mapped_club_id: string | null }).mapped_club_id;
    expect(mappedClubId).not.toBeNull();

    const earlySignals = readSignals(SIG_EARLY);
    expect(earlySignals).toHaveLength(1);
    expect(earlySignals[0].club_id).toBe(mappedClubId);
    expect(earlySignals[0].source_entity_type).toBe('legacy_club_candidate');
    expect(readSignals(SIG_LATE)[0].club_id).toBe(mappedClubId);
  });
});

describe('club_affiliations answer guards and the grouped card', () => {
  it('the grouped card leaves the chosen club pending for its own card, and declines the rest', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_DISAMBIG_CAP))
      .type('form')
      .send({
        kind: 'disambiguation',
        allCandidateIds: [disambigCapAffX, disambigCapAffY],
        selectedCandidateIds: disambigCapAffX,
      });
    expect(res.status).toBe(303);
    // Choosing on the grouped card resolves WHICH club, not the membership
    // itself: the chosen row stays pending so its standard card can ask the
    // membership and activity questions.
    expect(readAffiliationStatus(disambigCapAffX)).toBe('pending');
    expect(readAffiliationStatus(disambigCapAffY)).toBe('rejected');

    const getRes = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_DISAMBIG_CAP));
    expect(getRes.status).toBe(200);
    expect(getRes.text).toContain('still active?');
  });

  it('the no-club answer on an already-answered club task leaves it completed', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/none')
      .set('Cookie', cookieFor(MEMBER_SKIP_DONE))
      .type('form')
      .send({});
    expect(res.status).toBe(303);
    expect(readTaskState(MEMBER_SKIP_DONE, 'club_affiliations')).toBe('completed');
  });

  it('no task carries a skip route: the required personal-details step has none', async () => {
    const res = await request(createApp())
      .post('/register/wizard/personal_details/skip')
      .set('Cookie', cookieFor(MEMBER_PD_SKIP))
      .type('form')
      .send({});
    expect(res.status).toBe(404);
    expect(readTaskState(MEMBER_PD_SKIP, 'personal_details')).toBe('pending');
  });
});

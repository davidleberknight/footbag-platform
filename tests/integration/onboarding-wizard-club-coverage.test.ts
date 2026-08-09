/**
 * Club-card coverage across both identity anchors. A member's claimed identity
 * is the pair (legacy_member_id, historical_person_id), and club suggestion
 * rows may be anchored on either, so the wizard's club task matches a row on
 * whichever anchor it carries. A member who claimed a historical record with
 * no old-site account sees and resolves that record's club affiliations, and
 * the wrap-up landing never tells them no affiliation was found when one
 * exists. Ownership stays strict: each anchor compares only against the
 * member's own same-kind anchor, so one member's anchor can never resolve
 * another member's card.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertOnboardingTask,
  insertHistoricalPerson,
  insertLegacyMember,
  insertClub,
  insertClubBootstrapLeader,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3217');

let createApp: Awaited<ReturnType<typeof importApp>>;
let testDb: BetterSqlite3.Database;

const HP_ONLY_MEMBER  = 'cov-hp-only';
const HP_ONLY_PERSON  = 'hp-cov-only';
const OTHER_MEMBER    = 'cov-other';
const OTHER_PERSON    = 'hp-cov-other';
const NO_MATERIAL     = 'cov-no-material';
const ARCHIVED_MEMBER = 'cov-archived';
const ARCHIVED_PERSON = 'hp-cov-archived';

let hpOnlyAffId = '';
let otherAffId  = '';
let archivedAffId = '';

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function seedHpAnchoredCard(db: BetterSqlite3.Database, opts: {
  memberId: string; personId: string; slug: string; clubName: string;
}): string {
  insertHistoricalPerson(db, { person_id: opts.personId, person_name: `Person ${opts.slug}` });
  insertMember(db, {
    id: opts.memberId,
    slug: opts.slug,
    login_email: `${opts.memberId}@example.com`,
    historical_person_id: opts.personId,
    onboarding: 'none',
  });
  insertOnboardingTask(db, opts.memberId, 'personal_details', 'completed');
  insertOnboardingTask(db, opts.memberId, 'legacy_claim', 'completed');
  const clubId = insertClub(db, { name: opts.clubName });
  const candidateId = insertLegacyClubCandidate(db, {
    classification: 'onboarding_visible',
    mapped_club_id: clubId,
    display_name: opts.clubName,
  });
  return insertLegacyPersonClubAffiliation(db, {
    historical_person_id: opts.personId,
    legacy_club_candidate_id: candidateId,
  });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  hpOnlyAffId = seedHpAnchoredCard(db, {
    memberId: HP_ONLY_MEMBER, personId: HP_ONLY_PERSON,
    slug: 'cov_hp_only', clubName: 'Coverage Kickers',
  });
  otherAffId = seedHpAnchoredCard(db, {
    memberId: OTHER_MEMBER, personId: OTHER_PERSON,
    slug: 'cov_other', clubName: 'Other City Circle',
  });

  // The member's only suggestion points at a candidate an admin has archived.
  // Archiving is terminal, so the card must not be offered: answering Yes on it
  // would promote the archived record into a live club.
  archivedAffId = seedHpAnchoredCard(db, {
    memberId: ARCHIVED_MEMBER, personId: ARCHIVED_PERSON,
    slug: 'cov_archived', clubName: 'Archived Coverage Club',
  });
  db.prepare(`
    UPDATE legacy_club_candidates SET lifecycle_state = 'archived'
     WHERE id = (SELECT legacy_club_candidate_id FROM legacy_person_club_affiliations WHERE id = ?)
  `).run(archivedAffId);

  // A member with neither anchor: the wrap-up truthfully reports no
  // affiliation material.
  insertMember(db, {
    id: NO_MATERIAL, slug: 'cov_no_material',
    login_email: 'cov-no-material@example.com', onboarding: 'none',
  });
  insertOnboardingTask(db, NO_MATERIAL, 'personal_details', 'completed');
  insertOnboardingTask(db, NO_MATERIAL, 'legacy_claim', 'completed');

  db.close();
  createApp = await importApp();
  testDb = new BetterSqlite3(dbPath);
});

afterAll(() => {
  testDb.close();
  cleanupTestDb(dbPath);
});

describe('a historical-record-only claimant sees their club cards', () => {
  it('renders the affiliation card anchored on historical_person_id alone', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(HP_ONLY_MEMBER));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Coverage Kickers');
    expect(res.text).toContain('Were you a member of');
  });

  it('the wrap-up never claims no affiliation was found for a member whose record carries one', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(HP_ONLY_MEMBER));
    expect(res.text).not.toContain('We did not find a past club affiliation for you');
  });

  it('answering the card through the normal submit resolves it and records the activity signal', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(HP_ONLY_MEMBER))
      .type('form')
      .send({
        kind: 'membership',
        candidateId: hpOnlyAffId,
        userDecision: 'decline',
        activitySignal: 'not_active',
      });
    expect(res.status).toBe(303);

    const aff = testDb.prepare(
      'SELECT resolution_status FROM legacy_person_club_affiliations WHERE id = ?',
    ).get(hpOnlyAffId) as { resolution_status: string };
    expect(aff.resolution_status).toBe('rejected');

    const signal = testDb.prepare(
      'SELECT activity_signal FROM club_viability_signals WHERE member_id = ?',
    ).get(HP_ONLY_MEMBER) as { activity_signal: string } | undefined;
    expect(signal?.activity_signal).toBe('not_active');
  });
});

describe('ownership stays strict across anchors', () => {
  it("one member's historical anchor cannot resolve another member's card (404, indistinguishable from missing)", async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(HP_ONLY_MEMBER))
      .type('form')
      .send({
        kind: 'membership',
        candidateId: otherAffId,
        userDecision: 'confirm',
        activitySignal: 'active',
      });
    expect(res.status).toBe(404);

    const aff = testDb.prepare(
      'SELECT resolution_status FROM legacy_person_club_affiliations WHERE id = ?',
    ).get(otherAffId) as { resolution_status: string };
    expect(aff.resolution_status).toBe('pending');
  });

  it('a member with neither anchor gets the truthful no-affiliation wrap-up', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(NO_MATERIAL));
    expect(res.status).toBe(200);
    expect(res.text).toContain('We did not find a past club affiliation for you');
  });
});

describe('one club, one question: a leadership card subsumes the membership suggestion for the same club', () => {
  const LEGACY_ID = 'LM-ONEQ-1';
  const MEMBER = 'cov-one-question';
  let clubId = '';
  let leadershipId = '';
  let membershipAffId = '';

  beforeAll(() => {
    insertLegacyMember(testDb, { legacy_member_id: LEGACY_ID, real_name: 'One Question' });
    insertMember(testDb, {
      id: MEMBER, slug: 'cov_one_question',
      login_email: 'cov-oneq@example.com',
      legacy_member_id: LEGACY_ID,
      onboarding: 'none',
    });
    insertOnboardingTask(testDb, MEMBER, 'personal_details', 'completed');
    insertOnboardingTask(testDb, MEMBER, 'legacy_claim', 'completed');

    clubId = insertClub(testDb, { name: 'One Question Club' });
    const candidateId = insertLegacyClubCandidate(testDb, {
      classification: 'onboarding_visible',
      mapped_club_id: clubId,
      display_name: 'One Question Club',
    });
    membershipAffId = insertLegacyPersonClubAffiliation(testDb, {
      legacy_member_id: LEGACY_ID,
      legacy_club_candidate_id: candidateId,
    });
    leadershipId = insertClubBootstrapLeader(testDb, {
      club_id: clubId,
      legacy_member_id: LEGACY_ID,
      role: 'co-leader',
    });
  });

  it('renders the leadership card only, never a second card for the same club', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER));
    expect(res.status).toBe(200);
    // The leadership card names the club once; the membership suggestion for
    // the same club stays off the screen.
    const askCount = (res.text.match(/One Question Club/g) ?? []).length;
    expect(res.text).toContain('One Question Club');
    expect(res.text).not.toContain('Were you a member of One Question Club');
    expect(askCount).toBeGreaterThan(0);
  });

  it('confirming leadership supersedes the hidden membership row in the same transaction', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER))
      .type('form')
      .send({
        kind: 'leadership',
        candidateId: leadershipId,
        userDecision: 'confirm',
        activitySignal: 'active',
      });
    expect(res.status).toBe(303);

    const aff = testDb.prepare(
      'SELECT resolution_status, resolved_club_id FROM legacy_person_club_affiliations WHERE id = ?',
    ).get(membershipAffId) as { resolution_status: string; resolved_club_id: string | null };
    expect(aff.resolution_status).toBe('superseded');
    expect(aff.resolved_club_id).toBe(clubId);

    // One question means one signal for the club.
    const signals = testDb.prepare(
      'SELECT COUNT(*) AS c FROM club_viability_signals WHERE member_id = ? AND club_id = ?',
    ).get(MEMBER, clubId) as { c: number };
    expect(signals.c).toBe(1);
  });
});

describe('one club, one question: declining leadership lets the membership question surface', () => {
  const LEGACY_ID = 'LM-ONEQ-2';
  const MEMBER = 'cov-decline-lead';
  let clubId = '';
  let leadershipId = '';
  let membershipAffId = '';

  beforeAll(() => {
    insertLegacyMember(testDb, { legacy_member_id: LEGACY_ID, real_name: 'Decline Lead' });
    insertMember(testDb, {
      id: MEMBER, slug: 'cov_decline_lead',
      login_email: 'cov-decl@example.com',
      legacy_member_id: LEGACY_ID,
      onboarding: 'none',
    });
    insertOnboardingTask(testDb, MEMBER, 'personal_details', 'completed');
    insertOnboardingTask(testDb, MEMBER, 'legacy_claim', 'completed');

    clubId = insertClub(testDb, { name: 'Decline Lead Club' });
    const candidateId = insertLegacyClubCandidate(testDb, {
      classification: 'onboarding_visible',
      mapped_club_id: clubId,
      display_name: 'Decline Lead Club',
    });
    membershipAffId = insertLegacyPersonClubAffiliation(testDb, {
      legacy_member_id: LEGACY_ID,
      legacy_club_candidate_id: candidateId,
    });
    leadershipId = insertClubBootstrapLeader(testDb, {
      club_id: clubId,
      legacy_member_id: LEGACY_ID,
      role: 'co-leader',
    });
  });

  it('after a leadership decline, the membership card renders and the row is still pending', async () => {
    const decline = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER))
      .type('form')
      .send({
        kind: 'leadership',
        candidateId: leadershipId,
        userDecision: 'decline',
        activitySignal: 'not_active',
      });
    expect(decline.status).toBe(303);

    const aff = testDb.prepare(
      'SELECT resolution_status FROM legacy_person_club_affiliations WHERE id = ?',
    ).get(membershipAffId) as { resolution_status: string };
    expect(aff.resolution_status).toBe('pending');

    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Were you a member of Decline Lead Club');
  });
});

// An archived candidate is a terminal decision. It must not reach a registrant
// as a card, because confirming one promotes it back into a live club, and it
// must not count as affiliation material either, or the wrap-up would claim the
// member had suggestions it never showed them.
describe('an archived candidate never reaches the wizard', () => {
  it('shows no card and reports no affiliation material', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(ARCHIVED_MEMBER));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Archived Coverage Club');
    expect(res.text).not.toContain(archivedAffId);

    const affStatus = testDb
      .prepare('SELECT resolution_status FROM legacy_person_club_affiliations WHERE id = ?')
      .get(archivedAffId) as { resolution_status: string };
    expect(affStatus.resolution_status).toBe('pending');
  });
});

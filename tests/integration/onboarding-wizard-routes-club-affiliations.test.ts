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
  insertClubBootstrapLeader,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3162');

let createApp: Awaited<ReturnType<typeof importApp>>;
let testDb: BetterSqlite3.Database;

const MEMBER_EMPTY     = 'wiz-clubaff-empty';
const MEMBER_MEMBERSHIP = 'wiz-clubaff-membership';
const MEMBER_LEADERSHIP = 'wiz-clubaff-leadership';
const MEMBER_MULTI     = 'wiz-clubaff-multi';
const MEMBER_F1_OTHER  = 'wiz-clubaff-other';

let membershipClubId = '';
let membershipAffId  = '';
let leadershipClubId = '';
let leadershipCblId  = '';
let multiClubAlpha   = '';
let multiClubBeta    = '';
let multiAffAlpha    = '';
let multiCblBeta     = '';
let otherMemberAffId = '';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Empty: member with no candidates -> empty-state GET.
  insertMember(db, {
    id: MEMBER_EMPTY,
    slug: 'wiz_clubaff_empty',
    login_email: 'wiz-empty@example.com',
    legacy_member_id: 'lm-wiz-empty',
  });

  // Membership-only: one pending membership candidate.
  insertMember(db, {
    id: MEMBER_MEMBERSHIP,
    slug: 'wiz_clubaff_membership',
    login_email: 'wiz-membership@example.com',
    legacy_member_id: 'lm-wiz-membership',
  });
  membershipClubId = insertClub(db, { name: 'Membership Wizard Club' });
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
  insertMember(db, {
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

  // Multi: one membership at club Alpha + one leadership at club Beta.
  // Stage-aware ordering: leadership (Stage 1A) renders before membership
  // (Stage 1B) regardless of club name. So the Beta leadership card renders
  // first; after submit, the Alpha membership card renders.
  insertMember(db, {
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

  // F1 setup: a different member's candidate that the attacker tries to POST.
  insertMember(db, {
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
    .prepare(`SELECT resolution_status FROM legacy_person_club_affiliations WHERE id = ?`)
    .get(id) as { resolution_status: string } | undefined;
  return row?.resolution_status ?? '';
}

function readBootstrapStatus(id: string): string {
  const row = testDb
    .prepare(`SELECT status FROM club_bootstrap_leaders WHERE id = ?`)
    .get(id) as { status: string } | undefined;
  return row?.status ?? '';
}

function readTaskState(memberId: string): string | null {
  const row = testDb
    .prepare(`SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = 'club_affiliations'`)
    .get(memberId) as { state: string } | undefined;
  return row?.state ?? null;
}

describe('GET /register/wizard/club_affiliations — card listing', () => {
  it('member with no candidates -> task auto-transitions to not_applicable and 303-redirects to next task', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_EMPTY));
    // A member with zero possible cards is moved to not_applicable so the
    // wizard does not render a meaningless "no clubs to confirm" page with a
    // skip-as-Continue button. The dashboard widget drops not_applicable rows
    // entirely, so the task disappears from view.
    expect(res.status).toBe(303);
    expect(res.headers.location).not.toBe('/register/wizard/club_affiliations');
    expect(readTaskState(MEMBER_EMPTY)).toBe('not_applicable');
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
  });

  it('member with one leadership candidate -> renders the leadership card with classification + signal checklist', async () => {
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(MEMBER_LEADERSHIP));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Leadership Wizard Club');
    expect(res.text).toContain('Were you a contact for');
    // No signals seeded -> classification falls back to 'none'.
    expect(res.text).toContain('NONE');
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
    expect(res.text).toContain('Were you a contact for');
    expect(res.text).not.toContain('Were you a member of');
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
    // No more cards remaining -> advance to wizard complete (club_affiliations is the last task).
    expect(res.headers.location).toBe('/register/wizard/complete');
    expect(readAffiliationStatus(membershipAffId)).toBe('confirmed_current');
    expect(readTaskState(MEMBER_MEMBERSHIP)).toBe('completed');
  });

  it('leadership confirm -> 303 advance; bootstrap_leader claimed; task completed', async () => {
    const res = await request(createApp())
      .post('/register/wizard/club_affiliations/submit')
      .set('Cookie', cookieFor(MEMBER_LEADERSHIP))
      .type('form')
      .send({ kind: 'leadership', candidateId: leadershipCblId, userDecision: 'confirm', activitySignal: 'active' });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/complete');
    expect(readBootstrapStatus(leadershipCblId)).toBe('claimed');
    expect(readTaskState(MEMBER_LEADERSHIP)).toBe('completed');
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
    expect(second.headers.location).toBe('/register/wizard/complete');
    expect(readTaskState(MEMBER_MULTI)).toBe('completed');
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

/**
 * Integration tests for the onboarding wizard surface
 * (/register/wizard/:taskType). The wizard follows the project-wide
 * HTTP response convention: POST state-changing handlers 303 to the
 * next-task GET (or /register/wizard/complete); transient-notice
 * outcomes 303 to the same step carrying a flash cookie that the next
 * GET consumes; validation errors re-render inline at 422; rate-limit
 * re-renders at 429 with Retry-After.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertHistoricalPerson, insertOnboardingTask, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3133');

let createApp: Awaited<ReturnType<typeof importApp>>;
let testDb: BetterSqlite3.Database;

const OWNER_ID    = 'wiz-owner';
const OWNER_SLUG  = 'wiz_owner';
const OTHER_ID    = 'wiz-other';
const OTHER_SLUG  = 'wiz_other';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: OWNER_ID, slug: OWNER_SLUG, login_email: 'wiz-owner@example.com', birth_date: '1980-01-01', onboarding: 'none' });
  insertMember(db, { id: OTHER_ID, slug: OTHER_SLUG, login_email: 'wiz-other@example.com', onboarding: 'none' });
  // The legacy-claim step is reachable only once personal details are on file,
  // so the shared members that exercise it start with that prerequisite met.
  insertOnboardingTask(db, OWNER_ID, 'personal_details', 'completed');
  insertOnboardingTask(db, OTHER_ID, 'personal_details', 'completed');
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

// Inserts a member whose personal_details task is already completed, so the
// legacy-claim step (and everything gated behind it) is immediately reachable.
function insertClaimReadyMember(overrides: Parameters<typeof insertMember>[1] = {}): string {
  const id = insertMember(testDb, { onboarding: 'none', ...overrides });
  insertOnboardingTask(testDb, id, 'personal_details', 'completed');
  return id;
}

function countOnboardingTasks(memberId: string): number {
  return (testDb.prepare(
    'SELECT COUNT(*) AS c FROM member_onboarding_tasks WHERE member_id = ?',
  ).get(memberId) as { c: number }).c;
}

function getTaskState(memberId: string, taskType: string): string | null {
  const row = testDb.prepare(
    'SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = ?',
  ).get(memberId, taskType) as { state: string } | undefined;
  return row?.state ?? null;
}

function countAuditEntries(memberId: string, actionType: string): number {
  return (testDb.prepare(
    "SELECT COUNT(*) AS c FROM audit_entries WHERE actor_member_id = ? AND action_type = ?",
  ).get(memberId, actionType) as { c: number }).c;
}

describe('GET /register/wizard/:taskType — auth + task list bootstrap', () => {
  it('unauthenticated -> 302 to /login with returnTo', async () => {
    const res = await request(createApp()).get('/register/wizard/legacy_claim');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
    expect(res.headers.location).toContain('returnTo=%2Fregister%2Fwizard%2Flegacy_claim');
  });

  it('authenticated GET creates all task rows on first visit (idempotent)', async () => {
    const memberId = insertMember(testDb, { onboarding: 'none', slug: `wiz_bootstrap_${Date.now()}`, login_email: `wiz-bs-${Date.now()}@example.com` });
    expect(countOnboardingTasks(memberId)).toBe(0);
    const res = await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
    // The personal-Details form carries a single save control while other
    // onboarding steps remain, labelled to continue the wizard.
    expect(res.text.match(/>Save and Continue Onboarding</g)?.length).toBe(1);
    expect(countOnboardingTasks(memberId)).toBe(3);
    await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(memberId));
    expect(countOnboardingTasks(memberId)).toBe(3);
  });

  it('personal_details submit label says Continue while other steps remain, Complete when it is the last', async () => {
    // Fresh member, every task pending: saving personal_details continues the wizard.
    const more = insertMember(testDb, { onboarding: 'none', slug: `pd_more_${Date.now()}`, login_email: `pd-more-${Date.now()}@example.com` });
    const moreRes = await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', cookieFor(more));
    expect(moreRes.text).toContain('Save and Continue Onboarding');
    expect(moreRes.text).not.toContain('Save and Complete Onboarding');

    // Member whose other tasks are already terminal: personal_details is the
    // last outstanding step, so the label finishes onboarding.
    const last = insertMember(testDb, { onboarding: 'none', slug: `pd_last_${Date.now()}`, login_email: `pd-last-${Date.now()}@example.com` });
    insertOnboardingTask(testDb, last, 'personal_details', 'pending');
    insertOnboardingTask(testDb, last, 'legacy_claim', 'completed');
    insertOnboardingTask(testDb, last, 'club_affiliations', 'completed');
    const lastRes = await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', cookieFor(last));
    expect(lastRes.text).toContain('Save and Complete Onboarding');
    expect(lastRes.text).not.toContain('Save and Continue Onboarding');
  });

  it('unknown :taskType -> 404', async () => {
    const res = await request(createApp())
      .get('/register/wizard/no_such_task')
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(404);
  });

  it('unicode in :taskType -> 404', async () => {
    const res = await request(createApp())
      .get(`/register/wizard/${encodeURIComponent('legacy_claim‮')}`)
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(404);
  });

  it('renders each known taskType (club_affiliations renders the wrap-up landing when the member has zero possible cards)', async () => {
    const stamp = Date.now();
    const memberId = insertClaimReadyMember({ slug: `wiz_eachtask_${stamp}`, login_email: `wiz-each-${stamp}@example.com` });
    const cookie = cookieFor(memberId);
    for (const taskType of ['legacy_claim']) {
      const res = await request(createApp())
        .get(`/register/wizard/${taskType}`)
        .set('Cookie', cookie);
      expect(res.status, `taskType=${taskType}`).toBe(200);
    }
    // Each step renders when the registrant reaches it, and only then: the
    // steps are answered in order, so the claim step is answered before the club
    // step can draw. club_affiliations is universal even so: a member with no
    // legacy linkage has no Stage 1 card and lands on the find-or-create-your-
    // club wrap-up landing.
    testDb.prepare(
      `UPDATE member_onboarding_tasks SET state = 'completed'
        WHERE member_id = ? AND task_type = 'legacy_claim'`,
    ).run(memberId);
    const ca = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookie);
    expect(ca.status).toBe(200);
    expect(ca.text).toContain('We did not find a past club affiliation for you');
    expect(getTaskState(memberId, 'club_affiliations')).toBe('pending');
  });

  it('GET /register/wizard/complete renders the completion page when nothing is outstanding', async () => {
    const memberId = insertMember(testDb, { onboarding: 'none', slug: `wiz_done_get_${Date.now()}`, login_email: `wiz-done-get-${Date.now()}@example.com` });
    // The complete page renders only when no task is outstanding: both required
    // tasks completed and the optional club task resolved. A member with no task
    // rows is not done and is routed to a task instead.
    insertOnboardingTask(testDb, memberId, 'personal_details', 'completed');
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'completed');
    insertOnboardingTask(testDb, memberId, 'club_affiliations', 'completed');
    const res = await request(createApp())
      .get('/register/wizard/complete')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
  });
});

describe('POST /register/wizard/personal_details/submit — collects details and completes the task', () => {
  it('saves gender, first competition year, and show_competitive_results, then advances', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none', slug: `wiz_pd_${stamp}`, login_email: `wiz-pd-${stamp}@example.com` });
    // First GET bootstraps the task rows.
    await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', cookieFor(memberId));

    const res = await request(createApp())
      .post('/register/wizard/personal_details/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({
        city: 'Eugene',
        region: 'OR',
        country: 'USA',
        birthDay: '5', birthMonth: '5', birthYear: '1990',
        gender: 'male',
        year: '2010',
        showFirstCompetitionYear: '1',
        showCompetitiveResults: '1',
      });
    expect(res.status).toBe(303);
    expect(getTaskState(memberId, 'personal_details')).toBe('completed');

    const row = testDb.prepare(
      'SELECT gender, first_competition_year, show_competitive_results FROM members WHERE id = ?',
    ).get(memberId) as { gender: string; first_competition_year: number | null; show_competitive_results: number };
    expect(row.gender).toBe('male');
    expect(row.first_competition_year).toBe(2010);
    expect(row.show_competitive_results).toBe(1);
  });

  it('stores the checked results-visibility box when the form submits the hidden default alongside it', async () => {
    // The form pairs a hidden "0" with the checkbox's "1", so a checked box
    // sends both values and the body carries an array. Submitting a bare "1"
    // is not what a browser sends and hides whether the pair is read correctly.
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none', slug: `wiz_pd_pair_${stamp}`, login_email: `wiz-pd-pair-${stamp}@example.com` });
    await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', cookieFor(memberId));

    const res = await request(createApp())
      .post('/register/wizard/personal_details/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({
        city: 'Eugene',
        region: 'OR',
        country: 'USA',
        birthDay: '5', birthMonth: '5', birthYear: '1990',
        showCompetitiveResults: ['0', '1'],
      });
    expect(res.status).toBe(303);

    const row = testDb.prepare(
      'SELECT show_competitive_results FROM members WHERE id = ?',
    ).get(memberId) as { show_competitive_results: number };
    expect(row.show_competitive_results).toBe(1);
  });

  it('stores the unchecked results-visibility box when only the hidden default is submitted', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none', slug: `wiz_pd_unchecked_${stamp}`, login_email: `wiz-pd-unchecked-${stamp}@example.com` });
    await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', cookieFor(memberId));

    const res = await request(createApp())
      .post('/register/wizard/personal_details/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({
        city: 'Eugene',
        region: 'OR',
        country: 'USA',
        birthDay: '5', birthMonth: '5', birthYear: '1990',
        showCompetitiveResults: '0',
      });
    expect(res.status).toBe(303);

    const row = testDb.prepare(
      'SELECT show_competitive_results FROM members WHERE id = ?',
    ).get(memberId) as { show_competitive_results: number };
    expect(row.show_competitive_results).toBe(0);
  });

  it('rejects an impossible calendar date (Feb 30) rather than rolling it forward and storing it', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none', slug: `wiz_pd_baddate_${stamp}`, login_email: `wiz-pd-baddate-${stamp}@example.com` });
    await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', cookieFor(memberId));

    const res = await request(createApp())
      .post('/register/wizard/personal_details/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({
        city: 'Eugene',
        region: 'OR',
        country: 'USA',
        birthDay: '30', birthMonth: '2', birthYear: '2023',
        gender: 'male',
      });
    // A calendar-invalid date is rejected: the submit does not advance, the task
    // stays outstanding, and no rolled-forward value is persisted.
    expect(res.status).not.toBe(303);
    expect(getTaskState(memberId, 'personal_details')).toBe('pending');
    const row = testDb.prepare('SELECT birth_date FROM members WHERE id = ?')
      .get(memberId) as { birth_date: string | null };
    expect(row.birth_date).toBeNull();
  });

  it('refuses a re-submission against the already-completed task and stores none of it', async () => {
    // The step's page already refuses to draw once the task is complete, so a
    // submission arriving here is a stale tab, a back-button re-post, or a
    // crafted request. It must not rewrite the personal details the claim task
    // has already matched on.
    const stamp = Date.now();
    const memberId = insertClaimReadyMember({
      slug: `wiz_pd_done_${stamp}`,
      login_email: `wiz-pd-done-${stamp}@example.com`,
      city: 'Eugene', region: 'OR', country: 'USA', birth_date: '1990-05-05',
    });
    const before = countAuditEntries(memberId, 'wizard.task.completed');

    const res = await request(createApp())
      .post('/register/wizard/personal_details/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({
        city: 'Tallinn',
        region: '',
        country: 'Estonia',
        birthDay: '9', birthMonth: '9', birthYear: '1971',
        gender: 'female',
        year: '1999',
        showCompetitiveResults: '0',
      });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/personal_details');
    expect(getTaskState(memberId, 'personal_details')).toBe('completed');
    const row = testDb.prepare(
      'SELECT city, region, country, birth_date, gender FROM members WHERE id = ?',
    ).get(memberId) as {
      city: string; region: string; country: string; birth_date: string; gender: string;
    };
    expect(row.city).toBe('Eugene');
    expect(row.region).toBe('OR');
    expect(row.country).toBe('USA');
    expect(row.birth_date).toBe('1990-05-05');
    expect(row.gender).not.toBe('female');
    expect(countAuditEntries(memberId, 'wizard.task.completed')).toBe(before);
  });

  it('sends the refused re-submission on to whatever the member still owes', async () => {
    // Bouncing to the step's own GET is only correct because that GET is the
    // single place deciding where a completed task sends the member. Follow the
    // hop rather than trusting it, or the guard could quietly dead-end a member
    // on a page that refuses to draw.
    const stamp = Date.now();
    const memberId = insertClaimReadyMember({
      slug: `wiz_pd_onward_${stamp}`,
      login_email: `wiz-pd-onward-${stamp}@example.com`,
    });
    const posted = await request(createApp())
      .post('/register/wizard/personal_details/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ city: 'Eugene', region: 'OR', country: 'USA', birthDay: '5', birthMonth: '5', birthYear: '1990' });
    expect(posted.headers.location).toBe('/register/wizard/personal_details');

    const followed = await request(createApp())
      .get(posted.headers.location as string)
      .set('Cookie', cookieFor(memberId));
    expect(followed.status).toBe(303);
    expect(followed.headers.location).toBe('/register/wizard/legacy_claim');
  });

  it('does not fire while the task is still pending, so a validation retry still completes it', async () => {
    // The guard keys on the completed state, and a rejected submission leaves
    // the task pending. A guard that keyed on anything coarser would lock a
    // member out of the step after their first typo.
    const stamp = Date.now();
    const memberId = insertMember(testDb, {
      onboarding: 'none',
      slug: `wiz_pd_retry_${stamp}`,
      login_email: `wiz-pd-retry-${stamp}@example.com`,
    });
    await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', cookieFor(memberId));

    const rejected = await request(createApp())
      .post('/register/wizard/personal_details/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ city: 'Eugene', region: 'OR', country: 'USA', birthDay: '30', birthMonth: '2', birthYear: '1990' });
    expect(rejected.status).toBe(422);
    expect(getTaskState(memberId, 'personal_details')).toBe('pending');

    const accepted = await request(createApp())
      .post('/register/wizard/personal_details/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ city: 'Eugene', region: 'OR', country: 'USA', birthDay: '5', birthMonth: '5', birthYear: '1990' });
    expect(accepted.status).toBe(303);
    expect(accepted.headers.location).toBe('/register/wizard/legacy_claim');
    expect(getTaskState(memberId, 'personal_details')).toBe('completed');
  });

  it('refuses a full state name where the country has an official code set', async () => {
    // The wizard is where location is collected, so the rule is enforced at the
    // point of collection rather than only on the profile-edit form.
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none', slug: `wiz_pd_badregion_${stamp}`, login_email: `wiz-pd-badregion-${stamp}@example.com` });
    await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', cookieFor(memberId));

    const res = await request(createApp())
      .post('/register/wizard/personal_details/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({
        city: 'Eugene',
        region: 'Oregon',
        country: 'USA',
        birthDay: '5', birthMonth: '5', birthYear: '1990',
        gender: 'male',
      });
    expect(res.status).not.toBe(303);
    expect(res.text).toContain('official two-letter state or province code');
    expect(getTaskState(memberId, 'personal_details')).toBe('pending');
  });
});

describe('POST /register/wizard/:taskType/skip — 303 advance to next task', () => {
  it('the legacy_claim "nothing to claim" decision completes the task and advances 303 to club_affiliations', async () => {
    const stamp = Date.now();
    const memberId = insertClaimReadyMember({ slug: `wiz_skip_lc_${stamp}`, login_email: `wiz-skip-lc-${stamp}@example.com`, birth_date: '1980-01-01' });
    await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    const beforeAudits = countAuditEntries(memberId, 'wizard.task.completed');
    // Continuing without linking requires the attestation that the member never
    // held an old-site account; it completes legacy_claim and advances.
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ no_link_answer: 'never_had_one' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
    // legacy_claim is a required decision: the "nothing to claim" control
    // completes it rather than leaving it skipped.
    expect(getTaskState(memberId, 'legacy_claim')).toBe('completed');
    expect(countAuditEntries(memberId, 'wizard.task.completed')).toBe(beforeAudits + 1);
    // Member has no legacy_member_id linkage -> listWizardCardsForMember
    // returns []; club_affiliations is universal, so the GET renders the
    // find-or-create-your-club wrap-up landing and the task stays pending.
    const followUp = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(memberId));
    expect(followUp.status).toBe(200);
    expect(followUp.text).toContain('Clubs come after onboarding');
    expect(getTaskState(memberId, 'club_affiliations')).toBe('pending');
  });

  it('the cannot-find-it answer completes the task and offers one last attempt at the match', async () => {
    // A registrant who did hold an old account is never asked to say they did
    // not in order to get past this step. The answer finishes the step outright,
    // and the attempt it opens gates nothing, because completion has already
    // happened by the time it is offered.
    const stamp = Date.now();
    const memberId = insertClaimReadyMember({ slug: `wiz_cfi_${stamp}`, login_email: `wiz-cfi-${stamp}@example.com` });
    const cookie = cookieFor(memberId);

    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', cookie).type('form').send({ no_link_answer: 'cannot_find_it' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/legacy_claim?sharpen=1');
    expect(getTaskState(memberId, 'legacy_claim')).toBe('completed');

    const page = await request(createApp()).get(res.headers.location).set('Cookie', cookie);
    expect(page.status).toBe(200);
    expect(page.text).toContain('One more look for your old account');
    // The date the matcher runs on is offered back, which is the only place a
    // registrant can correct it once the details step has closed behind them.
    expect(page.text).toContain('/register/wizard/legacy_claim/birth-date');
    expect(page.text).not.toContain('checked again for matches');
    // The step is answered, so it stops asking for an answer.
    expect(page.text).not.toContain('I Never Had an Old Account');
  });

  it('each non-claiming answer records its own value, and only with the completion', async () => {
    // The two answers are different facts about the member, and the one that
    // says they held an old account and cannot find it is marked nowhere else
    // in the system. Recorded under one value they would be indistinguishable
    // afterwards, so each gets its own, and neither is written unless the
    // completion it belongs to is written too.
    const NEVER = 'wizard.legacy_claim.never_had_account';
    const CANNOT = 'wizard.legacy_claim.cannot_find_record';
    const stamp = Date.now();

    const neverId = insertClaimReadyMember({ slug: `wiz_ans_never_${stamp}`, login_email: `wiz-ans-never-${stamp}@example.com` });
    const neverCookie = cookieFor(neverId);
    // A refused answer completes nothing, so it records nothing either.
    const refused = await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', neverCookie).type('form').send({ no_link_answer: 'whatever' });
    expect(refused.status).toBe(422);
    expect(countAuditEntries(neverId, NEVER)).toBe(0);
    expect(countAuditEntries(neverId, CANNOT)).toBe(0);

    await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', neverCookie).type('form').send({ no_link_answer: 'never_had_one' });
    expect(getTaskState(neverId, 'legacy_claim')).toBe('completed');
    expect(countAuditEntries(neverId, NEVER)).toBe(1);
    expect(countAuditEntries(neverId, CANNOT)).toBe(0);

    // A replayed POST is refused by the completed task, so it cannot add a
    // second answer to a question already settled.
    await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', neverCookie).type('form').send({ no_link_answer: 'cannot_find_it' });
    expect(countAuditEntries(neverId, NEVER)).toBe(1);
    expect(countAuditEntries(neverId, CANNOT)).toBe(0);

    const cannotId = insertClaimReadyMember({ slug: `wiz_ans_cannot_${stamp}`, login_email: `wiz-ans-cannot-${stamp}@example.com` });
    await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', cookieFor(cannotId)).type('form').send({ no_link_answer: 'cannot_find_it' });
    expect(getTaskState(cannotId, 'legacy_claim')).toBe('completed');
    expect(countAuditEntries(cannotId, CANNOT)).toBe(1);
    expect(countAuditEntries(cannotId, NEVER)).toBe(0);

    // The two are separable after the fact, which is the whole point of
    // recording them apart: filtering to one answer returns only its members.
    const cannotActors = testDb.prepare(
      'SELECT actor_member_id AS id FROM audit_entries WHERE action_type = ?',
    ).all(CANNOT) as { id: string }[];
    const ids = cannotActors.map((row) => row.id);
    expect(ids).toContain(cannotId);
    expect(ids).not.toContain(neverId);
  });

  it('lets a registrant correct the date the matcher runs on, and re-checks', async () => {
    const stamp = Date.now();
    const memberId = insertClaimReadyMember({ slug: `wiz_dob_${stamp}`, login_email: `wiz-dob-${stamp}@example.com` });
    const cookie = cookieFor(memberId);
    await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', cookie).type('form').send({ no_link_answer: 'cannot_find_it' });

    const saved = await request(createApp())
      .post('/register/wizard/legacy_claim/birth-date')
      .set('Cookie', cookie).type('form')
      .send({ birthDay: '9', birthMonth: '4', birthYear: '1984' });
    expect(saved.status).toBe(303);
    expect(saved.headers.location).toBe('/register/wizard/legacy_claim?birth_date=saved');

    const page = await request(createApp()).get(saved.headers.location).set('Cookie', cookie);
    expect(page.text).toContain('checked again for matches');
    expect(page.text).toContain('value="1984"');

    const bad = await request(createApp())
      .post('/register/wizard/legacy_claim/birth-date')
      .set('Cookie', cookie).type('form')
      .send({ birthDay: '31', birthMonth: '2', birthYear: '1984' });
    expect(bad.status).toBe(422);
  });

  it('continue-without-linking requires one of the two answers', async () => {
    const stamp = Date.now();
    const memberId = insertClaimReadyMember({ slug: `wiz_attest_${stamp}`, login_email: `wiz-attest-${stamp}@example.com` });
    const cookie = cookieFor(memberId);
    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookie);

    // With no answer the decision is refused: the legacy-claim page re-renders
    // at 422 with the message and the task is untouched. An unrecognised value
    // is treated the same way, so a crafted body cannot complete the task.
    const missing = await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', cookie).type('form').send({});
    expect(missing.status).toBe(422);
    expect(missing.text).toContain('Tell us which one applies');
    expect(getTaskState(memberId, 'legacy_claim')).not.toBe('completed');

    const bogus = await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', cookie).type('form').send({ no_link_answer: 'whatever' });
    expect(bogus.status).toBe(422);
    expect(getTaskState(memberId, 'legacy_claim')).not.toBe('completed');

    // With an answer the required decision completes and the wizard advances.
    const attested = await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', cookie).type('form').send({ no_link_answer: 'never_had_one' });
    expect(attested.status).toBe(303);
    expect(attested.headers.location).toBe('/register/wizard/club_affiliations');
    expect(getTaskState(memberId, 'legacy_claim')).toBe('completed');
  });

  it('completing the required tasks and skipping the optional club task lands on /register/wizard/complete', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none', slug: `wiz_skip_all_${stamp}`, login_email: `wiz-skip-all-${stamp}@example.com` });
    const cookie = cookieFor(memberId);
    await request(createApp()).get('/register/wizard/personal_details').set('Cookie', cookie);
    // personal_details is required: it completes via a valid submit, not a skip.
    let res = await request(createApp())
      .post('/register/wizard/personal_details/submit')
      .set('Cookie', cookie).type('form')
      .send({ city: 'Eugene', region: 'OR', country: 'USA', birthDay: '5', birthMonth: '5', birthYear: '1990', gender: 'undisclosed' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/legacy_claim');
    // legacy_claim is required: the "nothing to claim" control, with the never-
    // had-an-account attestation, completes it.
    res = await request(createApp()).post('/register/wizard/legacy_claim/continue-without-linking').set('Cookie', cookie).type('form').send({ no_link_answer: 'never_had_one' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
    // club_affiliations never requires a club, but it does require an answer.
    res = await request(createApp()).post('/register/wizard/club_affiliations/none').set('Cookie', cookie).type('form').send({});
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/complete');
    const followUp = await request(createApp()).get('/register/wizard/complete').set('Cookie', cookie);
    expect(followUp.status).toBe(200);
    expect(getTaskState(memberId, 'personal_details')).toBe('completed');
    expect(getTaskState(memberId, 'legacy_claim')).toBe('completed');
    expect(getTaskState(memberId, 'club_affiliations')).toBe('completed');
    // The member is now a full member, marked once by the completion event.
    expect(countAuditEntries(memberId, 'wizard.complete')).toBe(1);
  });

  it('skip on unknown taskType -> 404, no state changes', async () => {
    const before = countOnboardingTasks(OWNER_ID);
    const res = await request(createApp())
      .post('/register/wizard/no_such_task/skip')
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({});
    expect(res.status).toBe(404);
    expect(countOnboardingTasks(OWNER_ID)).toBe(before);
  });
});

describe('GET /register/wizard/legacy_claim — candidate list shape', () => {
  it('renders no search box: old records are reached only through the step\'s own matching', async () => {
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('/register/wizard/legacy_claim/find');
    expect(res.text).not.toContain('name="identifier"');
  });

  it('renders Skip and Back-to-dashboard affordances', async () => {
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('action="/register/wizard/legacy_claim/continue-without-linking"');
    expect(res.text).toContain(`href="/members/${OWNER_SLUG}"`);
  });
});

describe('GET /register/wizard/legacy_claim — name-match record card', () => {
  it('offers the claim itself when the surname on the record will pass the gate', async () => {
    const stamp = Date.now();
    const hpId = `hp-wizok-${stamp}`;
    insertHistoricalPerson(testDb, { person_id: hpId, person_name: 'Wilma Passable' });
    const memberId = insertClaimReadyMember({
      slug: `wiz_hpok_${stamp}`, login_email: `wiz-hpok-${stamp}@example.com`,
      real_name: 'Wilma Passable', display_name: 'Wilma Passable', birth_date: '1980-01-01',
    });
    const followUp = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(followUp.text).toContain(`href="/history/${hpId}/claim"`);
    expect(followUp.text).toContain('Claim This Record');
  });
});

describe('last outstanding task -> 303 to /register/wizard/complete', () => {
  it('completing the required tasks and skipping the optional club task lands on complete', async () => {
    const memberId = insertMember(testDb, { onboarding: 'none', slug: `wiz_done_${Date.now()}`, login_email: `wiz-done-${Date.now()}@example.com` });
    const cookie = cookieFor(memberId);
    await request(createApp()).get('/register/wizard/personal_details').set('Cookie', cookie);
    await request(createApp())
      .post('/register/wizard/personal_details/submit')
      .set('Cookie', cookie).type('form')
      .send({ city: 'Eugene', region: 'OR', country: 'USA', birthDay: '5', birthMonth: '5', birthYear: '1990', gender: 'undisclosed' });
    await request(createApp()).post('/register/wizard/legacy_claim/continue-without-linking').set('Cookie', cookie).type('form').send({ no_link_answer: 'never_had_one' });
    await request(createApp()).post('/register/wizard/club_affiliations/none').set('Cookie', cookie).type('form').send({});
    const followUp = await request(createApp()).get('/register/wizard/complete').set('Cookie', cookie);
    expect(followUp.status).toBe(200);
  });
});

describe('per-member scoping: handlers read memberId from session, never URL/body', () => {
  it('member A POST cannot affect member B onboarding rows', async () => {
    const memberAId = insertClaimReadyMember({ slug: `wiz_a_${Date.now()}`, login_email: `wiz-a-${Date.now()}@example.com`, birth_date: '1980-01-01' });
    const memberBId = insertMember(testDb, { onboarding: 'none', slug: `wiz_b_${Date.now()}`, login_email: `wiz-b-${Date.now()}@example.com` });
    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberAId));
    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberBId));
    const beforeB = getTaskState(memberBId, 'legacy_claim');
    await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking').set('Cookie', cookieFor(memberAId)).type('form').send({ no_link_answer: 'never_had_one' });
    // The legacy_claim decision completes member A's task; member B is untouched.
    expect(getTaskState(memberAId, 'legacy_claim')).toBe('completed');
    expect(getTaskState(memberBId, 'legacy_claim')).toBe(beforeB);
  });
});

describe('flash cookie behavior (adversarial)', () => {
  it('a forged flash naming a claim-result kind the platform no longer issues draws nothing', async () => {
    const memberId = insertClaimReadyMember({ slug: `wiz_ft_${Date.now()}`, login_email: `wiz-ft-${Date.now()}@example.com` });
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', `${cookieFor(memberId)}; footbag_flash=wizard_legacy_claim_result:{"hpPersonId":"hp-tampered"}`)
      .send();
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('confirmation link has been sent');
    expect(res.text).not.toContain('hp-tampered');
  });
});

describe('wizard back link', () => {
  it('renders the Back-to-dashboard link based on the requesting session slug', async () => {
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(OTHER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain(`href="/members/${OTHER_SLUG}"`);
  });
});

// ── wizard.start audit entry ─────────────────────────────────────────────────
//
// Every wizard transition emits an audit_entries row. The `start` event
// fires once per member, the first time the task list materializes; later
// GETs are idempotent no-ops on the task table and must not duplicate
// the audit row.

describe('GET /register/wizard/:taskType — wizard.start audit invariant', () => {
  it('first GET writes exactly one wizard.start audit entry; second GET is a no-op', async () => {
    const stamp = Date.now() + 200;
    const memberId = insertMember(testDb, { onboarding: 'none', slug: `wiz_start_${stamp}`, login_email: `wiz-start-${stamp}@example.com` });
    const cookie = cookieFor(memberId);
    const app = createApp();

    expect(countAuditEntries(memberId, 'wizard.start')).toBe(0);

    await request(app).get('/register/wizard/legacy_claim').set('Cookie', cookie);
    expect(countAuditEntries(memberId, 'wizard.start')).toBe(1);

    await request(app).get('/register/wizard/legacy_claim').set('Cookie', cookie);
    expect(countAuditEntries(memberId, 'wizard.start')).toBe(1);
  });
});

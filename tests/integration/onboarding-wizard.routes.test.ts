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
import {
  REGION_CODE_MESSAGE,
  REGION_COUNTRY_MISMATCH_MESSAGE,
  REGION_REQUIRED_MESSAGE,
  regionPickerEntries,
} from '../../src/services/memberLocationRules';

const { dbPath } = setTestEnv('3133');

// Built from code points so the decomposed and composed forms stay visibly
// different in the source.
const DECOMPOSED_E_ACUTE = `e${String.fromCodePoint(0x0301)}`;
const COMPOSED_E_ACUTE = String.fromCodePoint(0x00e9);

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

// A missing row reads as pending, as the wizard itself reads it.
function getTaskState(memberId: string, taskType: string): string {
  const row = testDb.prepare(
    'SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = ?',
  ).get(memberId, taskType) as { state: string } | undefined;
  return row?.state ?? 'pending';
}

// A prospective member's claim evidence, held on their claim-step row until the
// transaction that makes them a member writes it to the audit log.
function countHeldAuditEntries(memberId: string, actionType: string): number {
  const row = testDb.prepare(
    "SELECT answer_json FROM member_onboarding_tasks WHERE member_id = ? AND task_type = 'legacy_claim'",
  ).get(memberId) as { answer_json: string | null } | undefined;
  const held = row?.answer_json ? JSON.parse(row.answer_json) as { audit?: Array<{ actionType: string }> } : {};
  return (held.audit ?? []).filter((e) => e.actionType === actionType).length;
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

  it('authenticated GET renders the first step for a member with no task rows and creates none', async () => {
    // The rows are created when the email is verified; a page load never
    // creates them, and a missing row reads as pending.
    const memberId = insertMember(testDb, { onboarding: 'none', slug: `wiz_bootstrap_${Date.now()}`, login_email: `wiz-bs-${Date.now()}@example.com` });
    const res = await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
    // The personal-Details form carries a single save control while other
    // onboarding steps remain, labelled to continue the wizard.
    expect(res.text.match(/>Save and Continue Onboarding</g)?.length).toBe(1);
    expect(countOnboardingTasks(memberId)).toBe(0);
    expect(countAuditEntries(memberId, 'wizard.start')).toBe(0);
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
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'completed');
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
    // The registrant is not a member yet, so the audit log records nothing of
    // their edits to their own details.
    expect(testDb.prepare('SELECT action_type FROM audit_entries WHERE entity_id = ? OR actor_member_id = ?')
      .all(memberId, memberId)).toEqual([]);
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

  // Defect caught: the city the registrant typed is stored with markup, a C1
  // control character or a decomposed accent, so the same place typed two ways
  // compares unequal on the roster and in claim matching. The form asks New
  // Zealand for no region, so a region carried by a hand-built request is not
  // stored either: free text would reach the roster through a field no member
  // was shown.
  it('stores the city as the cleaner leaves it, and no region the form does not ask for', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none', slug: `wiz_pd_clean_${stamp}`, login_email: `wiz-pd-clean-${stamp}@example.com` });
    const res = await request(createApp())
      .post('/register/wizard/personal_details/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({
        city: `Montr${DECOMPOSED_E_ACUTE}al <b>Nord</b>`,
        region: 'Canter<i>bury</i>\u0085',
        country: 'New Zealand',
        birthDay: '5', birthMonth: '5', birthYear: '1990',
      });
    expect(res.status).toBe(303);
    const row = testDb.prepare('SELECT city, region FROM members WHERE id = ?')
      .get(memberId) as { city: string; region: string };
    expect(row).toEqual({ city: `Montr${COMPOSED_E_ACUTE}al Nord`, region: null });
  });

  // Defect caught: a city that was only markup passes the required check
  // because it reads the raw text, and the task completes with no city.
  it('refuses a city that is only markup, leaving the task open and the city untouched', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none', slug: `wiz_pd_markup_${stamp}`, login_email: `wiz-pd-markup-${stamp}@example.com` });
    const res = await request(createApp())
      .post('/register/wizard/personal_details/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({
        city: '<b></b>', region: 'OR', country: 'USA',
        birthDay: '5', birthMonth: '5', birthYear: '1990',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('City is required.');
    expect(getTaskState(memberId, 'personal_details')).toBe('pending');
    const row = testDb.prepare('SELECT city FROM members WHERE id = ?').get(memberId) as { city: string };
    expect(row.city).toBe('Testville');
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

});

// ── State or province: picked from one preloaded list, never typed ──────────

describe('the personal-details state or province picker', () => {
  function freshRegistrant(tag: string): string {
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // A real new registrant has no location on file; the factory's default
    // country is cleared so the form meets the state a person starts in.
    return insertMember(testDb, {
      onboarding: 'none',
      slug: `wiz_pd_${tag}_${stamp}`,
      login_email: `wiz-pd-${tag}-${stamp}@example.com`,
      country: null,
      region: null,
    });
  }

  async function submit(memberId: string, fields: Record<string, string>) {
    await request(createApp()).get('/register/wizard/personal_details').set('Cookie', cookieFor(memberId));
    return request(createApp())
      .post('/register/wizard/personal_details/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ city: 'Eugene', birthDay: '5', birthMonth: '5', birthYear: '1990', ...fields });
  }

  function storedRegion(memberId: string): string | null {
    return (testDb.prepare('SELECT region FROM members WHERE id = ?').get(memberId) as { region: string | null }).region;
  }

  function optionTags(html: string): string[] {
    const select = /<select id="region"[\s\S]*?<\/select>/.exec(html)?.[0] ?? '';
    return select.match(/<option [^>]*value="[^"]+"[^>]*>/g) ?? [];
  }

  function templateTags(html: string): string[] {
    const template = /<template data-region-options>[\s\S]*?<\/template>/.exec(html)?.[0] ?? '';
    return template.match(/<option [^>]*value="[^"]+"[^>]*>/g) ?? [];
  }

  it('shows no state list until a country is chosen, with every entry ready for the script', async () => {
    // A member never sees another country's states. With no country on file
    // the field is hidden and its list empty; every entry waits, inert, in the
    // template the script copies from once a country is picked, so nothing is
    // ever typed.
    const memberId = freshRegistrant('first');
    const res = await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/<input[^>]*id="region"/);
    expect(res.text).toMatch(/data-region-field\s+hidden/);
    expect(optionTags(res.text)).toHaveLength(0);
    const ready = templateTags(res.text);
    const expected = regionPickerEntries();
    expect(expected.length).toBeGreaterThan(60);
    expect(ready).toHaveLength(expected.length);
    for (const entry of expected) {
      expect(ready.some((tag) => tag.includes(`value="${entry.value}"`)), entry.value).toBe(true);
    }
  });

  it('lists only the chosen country\'s entries once the country is known', async () => {
    // A save refused for another reason re-renders with the submitted country:
    // only its own states are offered, and they are required in the USA.
    const memberId = freshRegistrant('onlyus');
    const res = await submit(memberId, { country: 'United States', region: 'US-CO', birthDay: '30', birthMonth: '2' });
    expect(res.status).toBe(422);
    const offered = optionTags(res.text);
    const us = regionPickerEntries().filter((e) => e.countryCode === 'US');
    expect(offered).toHaveLength(us.length);
    for (const tag of offered) expect(tag, tag).toMatch(/value="US-/);
    expect(res.text).toMatch(/<select id="region"[^>]*\srequired/);
  });

  it('stores the two-letter code of the state picked for the USA', async () => {
    const memberId = freshRegistrant('pickus');
    const res = await submit(memberId, { country: 'United States', region: 'US-OR' });
    expect(res.status).toBe(303);
    expect(getTaskState(memberId, 'personal_details')).toBe('completed');
    expect(storedRegion(memberId)).toBe('OR');
  });

  it('tells a shared code apart by its country', async () => {
    // WA is both Washington and Western Australia. Storing the wrong one would
    // put an Australian in an American state on the roster.
    const memberId = freshRegistrant('pickau');
    const res = await submit(memberId, { country: 'Australia', region: 'AU-WA' });
    expect(res.status).toBe(303);
    expect(storedRegion(memberId)).toBe('WA');
    const mismatched = freshRegistrant('pickwa');
    const refused = await submit(mismatched, { country: 'Australia', region: 'US-WA' });
    expect(refused.status).toBe(422);
    expect(refused.text).toContain(REGION_COUNTRY_MISMATCH_MESSAGE);
  });

  it('lets an Australian leave the state blank, and requires one in the USA', async () => {
    const australian = freshRegistrant('blankau');
    const ok = await submit(australian, { country: 'Australia', region: '' });
    expect(ok.status).toBe(303);
    expect(storedRegion(australian)).toBeNull();

    const american = freshRegistrant('blankus');
    const refused = await submit(american, { country: 'United States', region: '' });
    expect(refused.status).toBe(422);
    expect(refused.text).toContain(REGION_REQUIRED_MESSAGE);
    expect(getTaskState(american, 'personal_details')).toBe('pending');
  });

  it('refuses a province picked with another country, offering only the chosen country\'s list', async () => {
    // Either half could be the mistake, so nothing is guessed. The page comes
    // back with the chosen country's states only, never the other country's.
    const memberId = freshRegistrant('mismatch');
    const before = storedRegion(memberId);
    const res = await submit(memberId, { country: 'United States', region: 'CA-ON' });
    expect(res.status).toBe(422);
    expect(res.text).toContain(REGION_COUNTRY_MISMATCH_MESSAGE);
    const offered = optionTags(res.text);
    expect(offered.length).toBeGreaterThan(0);
    for (const tag of offered) expect(tag, tag).toMatch(/value="US-/);
    expect(storedRegion(memberId)).toBe(before);
    expect(before).not.toBe('ON');
  });

  it('refuses a code on no list without offering it back as an option', async () => {
    // A refused value offered back as its own entry would be selected and
    // submitted again, trapping the member on the step.
    const memberId = freshRegistrant('badcode');
    const res = await submit(memberId, { country: 'United States', region: 'US-ZZ' });
    expect(res.status).toBe(422);
    expect(res.text).toContain(REGION_CODE_MESSAGE);
    expect(res.text).not.toContain('value="US-ZZ"');
    expect(res.text).toMatch(/<option value="US-OR"/);
  });

  it('keeps the picked state selected when the save is refused for another reason', async () => {
    const memberId = freshRegistrant('reoffer');
    const res = await submit(memberId, { country: 'United States', region: 'US-CO', birthDay: '30', birthMonth: '2' });
    expect(res.status).toBe(422);
    const selected = optionTags(res.text).filter((tag) => /\sselected/.test(tag));
    expect(selected).toHaveLength(1);
    expect(selected[0]).toContain('value="US-CO"');
  });

  it('hides the field for a country that asks for no region', async () => {
    // A member in New Zealand is asked nothing about a region, so the field is
    // drawn hidden from the first render rather than shown and then removed.
    const memberId = freshRegistrant('nz');
    const res = await submit(memberId, { country: 'New Zealand', region: '', birthDay: '30', birthMonth: '2' });
    expect(res.status).toBe(422);
    expect(res.text).toMatch(/data-region-field\s+hidden/);
    const american = freshRegistrant('nzcontrol');
    const shown = await submit(american, { country: 'United States', region: '', birthDay: '30', birthMonth: '2' });
    expect(shown.text).not.toMatch(/data-region-field\s+hidden/);
  });
});

describe('POST /register/wizard/:taskType/skip — 303 advance to next task', () => {
  it('the legacy_claim "nothing to claim" decision completes the task and advances 303 to club_affiliations', async () => {
    const stamp = Date.now();
    const memberId = insertClaimReadyMember({ slug: `wiz_skip_lc_${stamp}`, login_email: `wiz-skip-lc-${stamp}@example.com`, birth_date: '1980-01-01' });
    await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
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
    expect(countHeldAuditEntries(neverId, NEVER)).toBe(0);
    expect(countHeldAuditEntries(neverId, CANNOT)).toBe(0);

    await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', neverCookie).type('form').send({ no_link_answer: 'never_had_one' });
    expect(getTaskState(neverId, 'legacy_claim')).toBe('completed');
    expect(countHeldAuditEntries(neverId, NEVER)).toBe(1);
    expect(countHeldAuditEntries(neverId, CANNOT)).toBe(0);

    // A replayed POST is refused by the completed task, so it cannot add a
    // second answer to a question already settled.
    await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', neverCookie).type('form').send({ no_link_answer: 'cannot_find_it' });
    expect(countHeldAuditEntries(neverId, NEVER)).toBe(1);
    expect(countHeldAuditEntries(neverId, CANNOT)).toBe(0);

    const cannotId = insertClaimReadyMember({ slug: `wiz_ans_cannot_${stamp}`, login_email: `wiz-ans-cannot-${stamp}@example.com` });
    await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', cookieFor(cannotId)).type('form').send({ no_link_answer: 'cannot_find_it' });
    expect(getTaskState(cannotId, 'legacy_claim')).toBe('completed');
    expect(countHeldAuditEntries(cannotId, CANNOT)).toBe(1);
    expect(countHeldAuditEntries(cannotId, NEVER)).toBe(0);

    // Finishing onboarding makes each a member and writes the held answer.
    for (const id of [neverId, cannotId]) {
      const done = await request(createApp())
        .post('/register/wizard/club_affiliations/none')
        .set('Cookie', cookieFor(id)).type('form').send({});
      expect(done.status).toBe(303);
    }
    expect(countAuditEntries(neverId, NEVER)).toBe(1);
    expect(countAuditEntries(neverId, CANNOT)).toBe(0);
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
    expect(page.text).toMatch(/class="form-success-banner" role="status">Saved\. We checked again for matches/);
    expect(page.text).toContain('value="1984"');

    // The same date sent again changed nothing: the page still confirms the
    // re-check, but in the informational tone rather than claiming a save.
    const same = await request(createApp())
      .post('/register/wizard/legacy_claim/birth-date')
      .set('Cookie', cookie).type('form')
      .send({ birthDay: '9', birthMonth: '4', birthYear: '1984' });
    expect(same.status).toBe(303);
    expect(same.headers.location).toBe('/register/wizard/legacy_claim?birth_date=unchanged');
    const samePage = await request(createApp()).get(same.headers.location).set('Cookie', cookie);
    expect(samePage.text).toMatch(/class="form-notice" role="status">Saved\. We checked again for matches/);
    expect(samePage.text).not.toContain('form-success-banner');

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
  it('a forged flash naming a claim-result kind the platform does not issue draws nothing', async () => {
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

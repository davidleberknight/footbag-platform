/**
 * Regression suite for the wizard's task-state contracts: a task completes in
 * the transaction of the answer that settles it, never on a page load; the
 * claim answer completes the claim step even when the member already holds the
 * record; and the completion page never claims progress the task rows do not
 * show.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertHistoricalPerson, insertOnboardingTask, insertClub, insertMemberClubAffiliation,
  insertLegacyMember, setOnboardingHeldAnswer, createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3160');

let createApp: Awaited<ReturnType<typeof importApp>>;
let testDb: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/memberOnboardingService').memberOnboardingService;

beforeAll(async () => {
  testDb = createTestDb(dbPath);
  createApp = await importApp();
  const mod = await import('../../src/services/memberOnboardingService');
  svc = mod.memberOnboardingService;
});

afterAll(() => {
  probe?.close();
  testDb.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

// The checklist as email verification leaves it: three pending rows.
function seedPendingTasks(memberId: string): void {
  for (const t of ['personal_details', 'legacy_claim', 'club_affiliations'] as const) {
    insertOnboardingTask(testDb, memberId, t, 'pending');
  }
}

// A read-only second connection sees data_version move whenever the app's
// connection commits, so an unchanged value proves the requests wrote nothing.
let probe: BetterSqlite3.Database | null = null;
function dataVersion(): number {
  probe ??= new BetterSqlite3(dbPath, { readonly: true });
  return probe.pragma('data_version', { simple: true }) as number;
}

// A claim held on the member's claim step, as a prospective member holds one
// until onboarding completes, with the step itself left as the case sets it.
function seedHeldClaim(memberId: string, target: { accountId: string | null; recordId: string | null }): void {
  setOnboardingHeldAnswer(testDb, memberId, 'legacy_claim', {
    claim: { target, withSurname: false, heldAt: '2026-01-01T00:00:00.000Z' },
  });
}

function getTaskState(memberId: string, taskType: string): string | null {
  const row = testDb
    .prepare(`SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = ?`)
    .get(memberId, taskType) as { state: string } | undefined;
  return row?.state ?? null;
}

describe('A1: profile edit is a member capability, so it can never complete an onboarding task', () => {
  it('a pending registrant posting a profile edit is routed to the wizard and the task state is untouched', async () => {
    // The wizard's personal_details step is the only writer of the required
    // fields while pending; the profile-edit surface requires membership, so
    // there is no back door that completes the task from outside the wizard.
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_a1n_${stamp}`,
      login_email: `state-a1n-${stamp}@example.com`,
      real_name:   'A One',
      birth_date:  '1990-05-15',
    });
    seedPendingTasks(memberId);
    expect(getTaskState(memberId, 'personal_details')).toBe('pending');

    const res = await request(createApp())
      .post(`/members/state_a1n_${stamp}/edit`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({
        bio: '', city: 'Portland', region: 'OR', country: 'US', phone: '', emailVisibility: 'private',
        firstCompetitionYear: '1992',
        showCompetitiveResults: '1',
      });
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
    expect(getTaskState(memberId, 'personal_details')).toBe('pending');
  });
});

describe('A2: out-of-wizard HP claim completes the legacy_claim task', () => {
  it('POST /history/:personId/claim/confirm transitions legacy_claim to completed in the same transaction as the claim', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_a2_${stamp}`,
      login_email: `state-a2-${stamp}@example.com`,
      real_name:   'Foo Bar',
      birth_date:  '1980-01-01',
    });
    const personId = insertHistoricalPerson(testDb, { person_name: 'Foo Bar' });
    seedPendingTasks(memberId);
    // The out-of-wizard historical-record claim surface is reached only after
    // onboarding completes, so personal details are already on file.
    svc.completeTask(memberId, 'personal_details');
    expect(getTaskState(memberId, 'legacy_claim')).toBe('pending');

    const res = await request(createApp())
      .post(`/history/${personId}/claim/confirm`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});
    expect(res.status).toBe(303);
    expect(getTaskState(memberId, 'legacy_claim')).toBe('completed');
  });
});

describe('opening a wizard page writes nothing and completes no task', () => {
  const WIZARD_GETS = [
    '/register/wizard/personal_details',
    '/register/wizard/legacy_claim',
    '/register/wizard/club_affiliations',
    '/register/wizard/complete',
  ];

  it('GET /register/wizard/club_affiliations stays pending and renders the wrap-up landing for a member with no possible cards', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_a5_${stamp}`,
      login_email: `state-a5-${stamp}@example.com`,
    });
    seedPendingTasks(memberId);
    // The steps are answered in order, so the club step is reachable only once
    // the two ahead of it are answered.
    svc.completeTask(memberId, 'personal_details');
    svc.completeTask(memberId, 'legacy_claim');

    const before = dataVersion();
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(memberId));
    // club_affiliations is universal: a member with no possible cards reaches
    // the wrap-up landing, which renders and waits for the explicit no-club
    // answer rather than completing on the render.
    expect(res.status).toBe(200);
    expect(res.text).toContain('Finish Without a Club');
    expect(getTaskState(memberId, 'club_affiliations')).toBe('pending');
    expect(dataVersion()).toBe(before);
  });

  it('a member holding a current club with no card left is still asked: the club page completes nothing', async () => {
    // Only the member's own answer settles the club step. A club arriving any
    // other way, an administrator's assignment included, leaves the step for
    // the member to answer.
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_club_held_${stamp}`,
      login_email: `state-club-held-${stamp}@example.com`,
    });
    insertMemberClubAffiliation(testDb, memberId, insertClub(testDb), { is_primary: 1 });
    seedPendingTasks(memberId);
    svc.completeTask(memberId, 'personal_details');
    svc.completeTask(memberId, 'legacy_claim');

    const before = dataVersion();
    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
    expect(getTaskState(memberId, 'club_affiliations')).toBe('pending');
    expect(dataVersion()).toBe(before);
  });

  it('a member holding a claim of a record whose claim step is pending sees the step, and the page completes nothing', async () => {
    const stamp = Date.now();
    const personId = insertHistoricalPerson(testDb, { person_name: 'L Five' });
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_l5_${stamp}`,
      login_email: `state-l5-${stamp}@example.com`,
      real_name:   'L Five',
    });
    seedPendingTasks(memberId);
    svc.completeTask(memberId, 'personal_details');
    // A prospective member never holds a written link; what they hold is the
    // claim waiting on their claim step for onboarding to complete.
    seedHeldClaim(memberId, { accountId: null, recordId: personId });

    const before = dataVersion();
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
    expect(getTaskState(memberId, 'legacy_claim')).toBe('pending');
    expect(dataVersion()).toBe(before);
  });

  it('every wizard page, for a member with no task rows, writes nothing and routes to the first step', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_norows_${stamp}`,
      login_email: `state-norows-${stamp}@example.com`,
    });
    const before = dataVersion();
    for (const path of WIZARD_GETS) {
      const res = await request(createApp()).get(path).set('Cookie', cookieFor(memberId));
      if (path === '/register/wizard/personal_details') {
        expect(res.status, path).toBe(200);
      } else {
        expect(res.status, path).toBe(303);
        expect(res.headers.location, path).toBe('/register/wizard/personal_details');
      }
    }
    expect(dataVersion()).toBe(before);
    expect(getTaskState(memberId, 'personal_details')).toBeNull();
  });

  it('every wizard page, for a member whose only row is a completed first step, writes nothing and routes to the claim step', async () => {
    // With the rows read as stored, the completion page saw nothing outstanding
    // and sent the member to the completed first step, which sent them back.
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_partial_${stamp}`,
      login_email: `state-partial-${stamp}@example.com`,
    });
    insertOnboardingTask(testDb, memberId, 'personal_details', 'completed');
    const before = dataVersion();
    for (const path of WIZARD_GETS) {
      const res = await request(createApp()).get(path).set('Cookie', cookieFor(memberId));
      if (path === '/register/wizard/legacy_claim') {
        expect(res.status, path).toBe(200);
      } else {
        expect(res.status, path).toBe(303);
        expect(res.headers.location, path).toBe('/register/wizard/legacy_claim');
      }
    }
    expect(dataVersion()).toBe(before);
  });
});

describe('the claim answer completes the claim step when the member already holds the record', () => {
  // Holding the record answers the step. With no page load completing
  // anything, a pending step beside a held record is completed by the claim
  // POST the member makes, which otherwise reports the success it already had.
  function seedHolder(tag: string): { memberId: string; personId: string } {
    const stamp = Date.now();
    const personId = insertHistoricalPerson(testDb, { person_name: `Held ${tag}` });
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_held_${tag}_${stamp}`,
      login_email: `state-held-${tag}-${stamp}@example.com`,
      real_name:   `Held ${tag}`,
      birth_date:  '1980-01-01',
    });
    seedPendingTasks(memberId);
    svc.completeTask(memberId, 'personal_details');
    seedHeldClaim(memberId, { accountId: null, recordId: personId });
    return { memberId, personId };
  }

  it('through the wizard card claim', async () => {
    const { memberId, personId } = seedHolder('card');
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/claim')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ recordId: personId });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
    expect(getTaskState(memberId, 'legacy_claim')).toBe('completed');
  });

  it('through a card naming only the record of an old account the member already holds', async () => {
    // The member holds a claim of the old account the record belongs to but
    // not of the record itself, so the match, not the held-target shortcut,
    // finds the card already theirs.
    const stamp = Date.now();
    const legacyId = `LM-HELD-${stamp}`;
    const email = `state-held-acct-${stamp}@example.com`;
    insertLegacyMember(testDb, { legacy_member_id: legacyId, legacy_email: email, real_name: 'Held Account' });
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_held_acct_${stamp}`,
      login_email: email,
      real_name:   'Held Account',
      birth_date:  '1980-01-01',
    });
    const personId = insertHistoricalPerson(testDb, { person_name: 'Held Account', legacy_member_id: legacyId });
    seedPendingTasks(memberId);
    svc.completeTask(memberId, 'personal_details');
    seedHeldClaim(memberId, { accountId: legacyId, recordId: null });

    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/claim')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ recordId: personId });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
    expect(getTaskState(memberId, 'legacy_claim')).toBe('completed');
  });

  it('through the historical-record claim confirmation', async () => {
    const { memberId, personId } = seedHolder('hist');
    const res = await request(createApp())
      .post(`/history/${personId}/claim/confirm`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});
    expect(res.status).toBe(303);
    expect(getTaskState(memberId, 'legacy_claim')).toBe('completed');
  });
});

describe('/register/wizard/complete does not lie about progress', () => {
  it('GET /register/wizard/complete redirects to the next pending task when tasks remain', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_b2_${stamp}`,
      login_email: `state-b2-${stamp}@example.com`,
    });
    seedPendingTasks(memberId);

    const res = await request(createApp())
      .get('/register/wizard/complete')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location?.startsWith('/register/wizard/')).toBe(true);
    expect(res.headers.location).not.toBe('/register/wizard/complete');
  });

  it('GET /register/wizard/complete renders the completion page once all three tasks are answered', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_b2_done_${stamp}`,
      login_email: `state-b2-done-${stamp}@example.com`,
    });
    seedPendingTasks(memberId);
    svc.completeTask(memberId, 'personal_details');
    svc.completeTask(memberId, 'legacy_claim');
    svc.completeTask(memberId, 'club_affiliations');

    const res = await request(createApp())
      .get('/register/wizard/complete')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
  });

  it('GET /register/wizard/complete routes a member whose club question is still open back to it', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_b2_club_open_${stamp}`,
      login_email: `state-b2-club-open-${stamp}@example.com`,
    });
    seedPendingTasks(memberId);
    svc.completeTask(memberId, 'personal_details');
    svc.completeTask(memberId, 'legacy_claim');

    // Both identity steps are answered but the club question is not, so the
    // page must not claim the member is done while the gate still fences them.
    const res = await request(createApp())
      .get('/register/wizard/complete')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
  });
});

describe('answering a task advances the wizard, never back into a resolved one', () => {
  it('each explicit answer advances to the next task, and the last lands on the completion page', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_a6_${stamp}`,
      login_email: `state-a6-${stamp}@example.com`,
      birth_date:  '1980-01-01',
    });
    const cookie = cookieFor(memberId);
    // Personal details come first and unlock the later steps; complete them so
    // the walk can advance through legacy_claim and club_affiliations.
    svc.completeTask(memberId, 'personal_details');

    // Continuing without linking is the required legacy decision and needs the
    // attestation that the member never held an old-site account; it completes
    // legacy_claim and advances to the club step.
    const r1 = await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', cookie).type('form').send({ no_link_answer: 'never_had_one' });
    expect(r1.headers.location).toBe('/register/wizard/club_affiliations');

    const r2 = await request(createApp())
      .post('/register/wizard/club_affiliations/none')
      .set('Cookie', cookie).type('form').send({});
    // Answering the last remaining task advances to the completion page, never
    // back into an already-resolved task.
    expect(r2.headers.location).toBe('/register/wizard/complete');
    expect(getTaskState(memberId, 'club_affiliations')).toBe('completed');
  });

  it('the club task never resurfaces as outstanding once it is answered', () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_a7_${stamp}`,
      login_email: `state-a7-${stamp}@example.com`,
    });
    seedPendingTasks(memberId);
    svc.completeTask(memberId, 'club_affiliations');

    expect(svc.nextOutstandingTaskType(memberId)).not.toBe('club_affiliations');
  });
});

describe('membership is granted only when all three tasks are completed', () => {
  it('isOnboardingComplete flips true exactly on the last completion', () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_c4_${stamp}`,
      login_email: `state-c4-${stamp}@example.com`,
    });
    seedPendingTasks(memberId);
    svc.completeTask(memberId, 'personal_details');
    svc.completeTask(memberId, 'legacy_claim');

    // The club task is still unanswered, so the account is still pending.
    expect(svc.isOnboardingComplete(memberId)).toBe(false);
    expect(svc.nextOutstandingTaskType(memberId)).toBe('club_affiliations');

    svc.completeTask(memberId, 'club_affiliations');
    expect(svc.isOnboardingComplete(memberId)).toBe(true);
    expect(svc.nextOutstandingTaskType(memberId)).toBeNull();
  });
});

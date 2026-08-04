/**
 * Regression suite for the wizard's state-reconciliation contracts:
 * the dashboard widget must never disagree with the underlying link state,
 * out-of-wizard surfaces that change task-relevant fields must transition
 * the corresponding task, and the wizard GET handlers must reconcile
 * task state with reality on every render.
 *
 * Each test maps to a finding from the wizard adversarial review; the test
 * fails against the pre-fix code path and pins the post-fix behavior.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertHistoricalPerson, createTestSessionJwt } from '../fixtures/factories';

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
  testDb.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
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
    svc.startTaskList(memberId);
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
    svc.startTaskList(memberId);
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

describe('A5 + L5: wizard GETs reconcile task state with underlying reality', () => {
  it('GET /register/wizard/club_affiliations stays pending and renders the wrap-up landing for a member with no possible cards', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_a5_${stamp}`,
      login_email: `state-a5-${stamp}@example.com`,
    });
    svc.startTaskList(memberId);
    // The club-affiliations step runs only once personal details are on file.
    svc.completeTask(memberId, 'personal_details');

    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(memberId));
    // club_affiliations is universal: a member with no possible cards reaches
    // the wrap-up landing, which renders and waits for the explicit no-club
    // answer rather than completing on the render.
    expect(res.status).toBe(200);
    expect(res.text).toContain('Clubs come after onboarding');
    expect(res.text).toContain('Finish Without a Club');
    expect(getTaskState(memberId, 'club_affiliations')).toBe('pending');

    // Rendering the landing a second time still transitions nothing: only the
    // explicit answer completes the task.
    const again = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(memberId));
    expect(again.status).toBe(200);
    expect(getTaskState(memberId, 'club_affiliations')).toBe('pending');
  });

  it('GET /register/wizard/legacy_claim auto-transitions to completed when historical_person_id is set', async () => {
    const stamp = Date.now();
    const personId = insertHistoricalPerson(testDb, { person_name: 'L Five' });
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_l5_${stamp}`,
      login_email: `state-l5-${stamp}@example.com`,
      real_name:   'L Five',
    });
    // The MemberOverrides factory does not surface historical_person_id;
    // patch it directly so the wizard's reconcile-on-GET sees a linked
    // HP and runs the auto-complete branch.
    testDb.prepare(`UPDATE members SET historical_person_id = ? WHERE id = ?`).run(personId, memberId);
    svc.startTaskList(memberId);
    // The legacy-claim step reconciles on GET only once personal details are on
    // file, so complete that prerequisite before exercising the auto-complete.
    svc.completeTask(memberId, 'personal_details');
    expect(getTaskState(memberId, 'legacy_claim')).toBe('pending');

    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
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
    svc.startTaskList(memberId);

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
    svc.startTaskList(memberId);
    svc.completeTask(memberId, 'personal_details');
    svc.completeTask(memberId, 'legacy_claim');
    svc.completeTask(memberId, 'club_affiliations');

    const res = await request(createApp())
      .get('/register/wizard/complete')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Your onboarding is complete');
  });

  it('GET /register/wizard/complete routes a member whose club question is still open back to it', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_b2_club_open_${stamp}`,
      login_email: `state-b2-club-open-${stamp}@example.com`,
    });
    svc.startTaskList(memberId);
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
      .set('Cookie', cookie).type('form').send({ no_old_account: '1' });
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
    svc.startTaskList(memberId);
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
    svc.startTaskList(memberId);
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

describe('D4: legacy_claim search surfaces the validation message inline', () => {
  it('POST /register/wizard/legacy_claim/find with empty identifier renders the validation message', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { onboarding: 'none',
      slug: `state_d4_${stamp}`,
      login_email: `state-d4-${stamp}@example.com`,
      birth_date:  '1980-01-01',
    });
    svc.startTaskList(memberId);
    // The manual search runs only once personal details are on file.
    svc.completeTask(memberId, 'personal_details');
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Enter an identifier');
  });
});

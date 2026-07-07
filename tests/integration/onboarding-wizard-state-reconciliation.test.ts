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
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

function getTaskState(memberId: string, taskType: string): string | null {
  const row = testDb
    .prepare(`SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = ?`)
    .get(memberId, taskType) as { state: string } | undefined;
  return row?.state ?? null;
}

describe('A1: profile-edit save gates the personal_details task on the mandatory fields', () => {
  it('does not complete personal_details when the saved profile blanks city and country', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, {
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
        bio: '', city: '', region: '', country: '', phone: '', emailVisibility: 'private',
        firstCompetitionYear: '1992',
        showCompetitiveResults: '1',
      });
    // City and country are mandatory, so a blank-mandatory-field save is rejected
    // outright rather than silently completing an incomplete profile.
    expect(res.status).toBe(422);

    // A rejected save must not flip the required onboarding task to completed, or
    // a member becomes a full member with city and country missing.
    expect(getTaskState(memberId, 'personal_details')).toBe('pending');
  });

  it('completes personal_details when city and country are saved and a date of birth is on file', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, {
      slug: `state_a1y_${stamp}`,
      login_email: `state-a1y-${stamp}@example.com`,
      real_name:   'A One',
      birth_date:  '1990-05-15',
    });
    svc.startTaskList(memberId);
    expect(getTaskState(memberId, 'personal_details')).toBe('pending');

    const res = await request(createApp())
      .post(`/members/state_a1y_${stamp}/edit`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({
        bio: '', city: 'Portland', region: '', country: 'US', phone: '', emailVisibility: 'private',
        firstCompetitionYear: '1992',
        showCompetitiveResults: '1',
      });
    expect(res.status).toBe(303);

    expect(getTaskState(memberId, 'personal_details')).toBe('completed');
  });
});

describe('A2: out-of-wizard HP claim completes the legacy_claim task', () => {
  it('POST /history/:personId/claim/confirm transitions legacy_claim to completed in the same transaction as the claim', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, {
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
    const memberId = insertMember(testDb, {
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
    // the find-or-create-your-club wrap-up landing rather than being skipped.
    expect(res.status).toBe(200);
    expect(res.text).toContain('Find or create your club');
    expect(getTaskState(memberId, 'club_affiliations')).toBe('pending');
  });

  it('GET /register/wizard/legacy_claim auto-transitions to completed when historical_person_id is set', async () => {
    const stamp = Date.now();
    const personId = insertHistoricalPerson(testDb, { person_name: 'L Five' });
    const memberId = insertMember(testDb, {
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
    const memberId = insertMember(testDb, {
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

  it('GET /register/wizard/complete renders the completion page when no pending tasks remain', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, {
      slug: `state_b2_done_${stamp}`,
      login_email: `state-b2-done-${stamp}@example.com`,
    });
    svc.startTaskList(memberId);
    svc.completeTask(memberId, 'personal_details');
    svc.completeTask(memberId, 'legacy_claim');
    svc.markTaskNotApplicable(memberId, 'club_affiliations');

    const res = await request(createApp())
      .get('/register/wizard/complete')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Your onboarding tasks are handled');
  });
});

describe('A6 + A7: skipped tasks land in the skipped bucket, not the in-sequence advance set', () => {
  it('nextTaskAfter (via skip-and-advance) does not loop the wizard back into a skipped task', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, {
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
      .post('/register/wizard/legacy_claim/skip')
      .set('Cookie', cookie).type('form').send({ no_old_account: '1' });
    expect(r1.headers.location).toBe('/register/wizard/club_affiliations');

    const r2 = await request(createApp())
      .post('/register/wizard/club_affiliations/skip')
      .set('Cookie', cookie).type('form').send({});
    // Skipping the last remaining task advances to the completion page, never
    // back into an already-resolved task.
    expect(r2.headers.location).toBe('/register/wizard/complete');
  });

  it('getDashboardTaskWidget puts skipped rows in the skipped bucket (not pending)', () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, {
      slug: `state_a7_${stamp}`,
      login_email: `state-a7-${stamp}@example.com`,
    });
    svc.startTaskList(memberId);
    svc.skipTask(memberId, 'club_affiliations');

    const widget = svc.getDashboardTaskWidget(memberId);
    expect(widget.skipped.map((t) => t.taskType)).toContain('club_affiliations');
    expect(widget.pending.map((t) => t.taskType)).not.toContain('club_affiliations');
    const skipped = widget.skipped.find((t) => t.taskType === 'club_affiliations')!;
    expect(skipped.ctaLabel).toBe('Open Task');
  });
});

describe('C4: dashboard widget hides when nothing is outstanding', () => {
  it('widget.hasOutstanding is false when every task is completed or not_applicable', () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, {
      slug: `state_c4_${stamp}`,
      login_email: `state-c4-${stamp}@example.com`,
    });
    svc.startTaskList(memberId);
    svc.completeTask(memberId, 'personal_details');
    svc.completeTask(memberId, 'legacy_claim');
    svc.markTaskNotApplicable(memberId, 'club_affiliations');

    const widget = svc.getDashboardTaskWidget(memberId);
    expect(widget.hasOutstanding).toBe(false);
    const allBuckets = [
      ...widget.pending, ...widget.paused, ...widget.skipped,
    ].map((t) => t.taskType);
    expect(allBuckets).toHaveLength(0);
  });
});

describe('markTaskNotApplicable guards the always-completable required task', () => {
  it('refuses to mark personal_details not_applicable; allows legacy_claim and club_affiliations', () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, {
      slug: `state_na_guard_${stamp}`,
      login_email: `state-na-guard-${stamp}@example.com`,
    });
    svc.startTaskList(memberId);

    // personal_details is always completable by saving its fields, so it must
    // never be removed from the outstanding set via not_applicable; the call is
    // refused and the state is untouched.
    expect(() => svc.markTaskNotApplicable(memberId, 'personal_details')).toThrow();
    expect(getTaskState(memberId, 'personal_details')).toBe('pending');

    // legacy_claim has a legitimate not_applicable path (no plausible legacy
    // match) and club_affiliations is optional, so neither is guarded.
    expect(() => svc.markTaskNotApplicable(memberId, 'legacy_claim')).not.toThrow();
    expect(getTaskState(memberId, 'legacy_claim')).toBe('not_applicable');
    expect(() => svc.markTaskNotApplicable(memberId, 'club_affiliations')).not.toThrow();
    expect(getTaskState(memberId, 'club_affiliations')).toBe('not_applicable');
  });
});

describe('D4: legacy_claim search surfaces the validation message inline', () => {
  it('POST /register/wizard/legacy_claim/find with empty identifier renders the validation message', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, {
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

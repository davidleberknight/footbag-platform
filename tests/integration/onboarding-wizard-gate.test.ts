/**
 * Membership authorization (requireMember). Membership is an authorization
 * level above authentication: an account is pending from registration until
 * all three onboarding tasks are completed, and a pending registrant holds a
 * session but no member authorization. A pending request to any member
 * capability is routed to its next outstanding wizard task; public browse,
 * the wizard and its claim affordances, and logout are all a pending
 * registrant can reach. A pending account also has no profile page for any
 * non-admin viewer and never appears in member search.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertOnboardingTask, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3214');

let createApp: Awaited<ReturnType<typeof importApp>>;
let testDb: BetterSqlite3.Database;

beforeAll(async () => {
  const db = createTestDb(dbPath);
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

function insertPendingMember(slug: string, extra: Parameters<typeof insertMember>[1] = {}): string {
  return insertMember(testDb, { slug, onboarding: 'none', ...extra });
}

describe('requireMember — membership authorization gate', () => {
  it('zero task rows: a member-capability route redirects to the wizard', async () => {
    const memberId = insertPendingMember('gate_zero_rows');
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
  });

  it('the club question unanswered on its own still gates: all three tasks are required', async () => {
    const memberId = insertPendingMember('gate_club_pending');
    insertOnboardingTask(testDb, memberId, 'personal_details', 'completed');
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'completed');
    insertOnboardingTask(testDb, memberId, 'club_affiliations', 'pending');
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
  });

  it('all three tasks answered: the member is authorized and the capability route serves', async () => {
    const memberId = insertMember(testDb, { slug: 'gate_all_done' });
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).not.toBe(303);
  });

  it('personal_details unanswered: still pending, and routed to that task first', async () => {
    const memberId = insertPendingMember('gate_pd_pending');
    insertOnboardingTask(testDb, memberId, 'personal_details', 'pending');
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'completed');
    insertOnboardingTask(testDb, memberId, 'club_affiliations', 'completed');
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/personal_details');
  });

  it('legacy_claim unanswered: still pending, since the legacy decision is required', async () => {
    const memberId = insertPendingMember('gate_lc_pending');
    insertOnboardingTask(testDb, memberId, 'personal_details', 'completed');
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'pending');
    insertOnboardingTask(testDb, memberId, 'club_affiliations', 'completed');
    const res = await request(createApp())
      .get('/clubs/create')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/legacy_claim');
  });

  it('club browse (GET /clubs) stays reachable while pending — public browse is not a member capability', async () => {
    const memberId = insertPendingMember('gate_browse_open');
    const res = await request(createApp())
      .get('/clubs')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).not.toBe(303);
  });

  it('club detail / country browse (GET /clubs/:key) stays reachable while pending', async () => {
    const memberId = insertPendingMember('gate_club_detail');
    const res = await request(createApp())
      .get('/clubs/some-country-or-club')
      .set('Cookie', cookieFor(memberId));
    expect(res.headers.location ?? '').not.toContain('/register/wizard/');
  });

  it('donations are a member capability: GET /donate redirects a pending registrant to the wizard', async () => {
    const memberId = insertPendingMember('gate_donate_fenced');
    const res = await request(createApp())
      .get('/donate')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
  });

  it('POST /donate is likewise denied to a pending registrant', async () => {
    const memberId = insertPendingMember('gate_donate_post');
    const res = await request(createApp())
      .post('/donate')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ amount: '10' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
  });

  it('the payment return pages are member-only: GET /payments/success redirects a pending registrant', async () => {
    const memberId = insertPendingMember('gate_pay_success');
    const res = await request(createApp())
      .get('/payments/success')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
  });

  it('profile edit is a member capability: a pending registrant is routed to the wizard', async () => {
    const memberId = insertPendingMember('gate_edit_fenced');
    const res = await request(createApp())
      .get('/members/gate_edit_fenced/edit')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
  });

  it('contact-admin is a member capability: a pending registrant is routed to the wizard', async () => {
    const memberId = insertPendingMember('gate_contact_fenced');
    const res = await request(createApp())
      .get('/members/gate_contact_fenced/contact-admin')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
  });

  it('writing to an administrator is a member capability, so the wizard has no route to one', async () => {
    // The surface an administrator answers on is member-only, so a request filed
    // by someone still signing up could never be answered. The contact form is
    // the one route to an administrator and it is member-gated; the wizard
    // carries no route of its own.
    const memberId = insertPendingMember('gate_help_request');
    const res = await request(createApp())
      .post(`/members/gate_help_request/contact-admin`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({
        category: 'identity_link_issue',
        message: 'I competed at Worlds 2003 under another name.',
      });
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
    // The redirect alone proves nothing, since the success path also redirects.
    // What proves it is that no work landed in front of an administrator.
    const queued = testDb
      .prepare(
        `SELECT COUNT(*) AS n FROM work_queue_items
          WHERE task_type = 'member_link_help_request' AND entity_id = ?`,
      )
      .get(memberId) as { n: number };
    expect(queued.n).toBe(0);
  });

  it('offers a pending registrant no affordance for writing to an administrator', async () => {
    const memberId = insertPendingMember('gate_help_hidden');
    // The claim task only draws once the details it matches on are on file.
    insertOnboardingTask(testDb, memberId, 'personal_details', 'completed');
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'pending');
    insertOnboardingTask(testDb, memberId, 'club_affiliations', 'pending');
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('/register/wizard/legacy_claim/help-request');
    expect(res.text).not.toContain('Send to an Administrator');
    expect(res.text).not.toContain("Still can't find your records?");
    expect(res.text).not.toContain('/contact-admin');
  });

  it('refuses a crafted answer to a step the registrant has not reached yet', async () => {
    // The steps are answered in catalogue order. Routing decides what the next
    // link points at; this is the server holding a request to the same order
    // whatever route it arrived by, so a later step cannot be answered first and
    // leave an earlier one to become the answer that confers membership.
    const memberId = insertPendingMember('gate_out_of_order');
    insertOnboardingTask(testDb, memberId, 'personal_details', 'completed');
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'pending');
    insertOnboardingTask(testDb, memberId, 'club_affiliations', 'pending');

    const club = await request(createApp())
      .post('/register/wizard/club_affiliations/none')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});
    expect(club.status).toBe(303);

    const states = testDb.prepare(
      `SELECT task_type, state FROM member_onboarding_tasks WHERE member_id = ?`,
    ).all(memberId) as Array<{ task_type: string; state: string }>;
    expect(states.find((r) => r.task_type === 'club_affiliations')?.state).toBe('pending');
    expect(states.find((r) => r.task_type === 'legacy_claim')?.state).toBe('pending');
  });

  it('sends a registrant who opens a later step back to the one they are on', async () => {
    const memberId = insertPendingMember('gate_skip_ahead');
    insertOnboardingTask(testDb, memberId, 'personal_details', 'completed');
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'pending');
    insertOnboardingTask(testDb, memberId, 'club_affiliations', 'pending');

    const res = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/legacy_claim');
  });

  it('closes the wizard to a member who has finished signing up', async () => {
    // Claiming belongs to the wizard and the wizard belongs to signing up. A
    // member reaching a task by URL is sent to their own dashboard rather than
    // shown a page whose every control would refuse them; a link they still need
    // is asked for through the identity-link category of the contact form.
    const memberId = insertMember(testDb, { slug: 'gate_wizard_closed' });
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).not.toContain('/register/wizard/');
  });

  it('the wizard itself stays reachable while pending', async () => {
    const memberId = insertPendingMember('gate_wizard_open');
    const res = await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', cookieFor(memberId));
    expect(res.headers.location ?? '').not.toContain('/login');
    expect(res.status).toBe(200);
  });

  it('an admin whose onboarding is incomplete is routed to the wizard, not the admin surface', async () => {
    // Closes the dev-bootstrap gap: an allowlisted admin created at
    // registration is still pending until the wizard is done. Admin authority
    // sits above member authority, never beside it.
    const adminId = insertPendingMember('gate_admin_pending', { is_admin: 1 });
    const res = await request(createApp())
      .get('/admin/work-queue')
      .set('Cookie', cookieFor(adminId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
  });

  it('an onboarded admin passes the membership gate and is governed by requireAdmin as usual', async () => {
    const adminId = insertMember(testDb, { slug: 'gate_admin_done', is_admin: 1 });
    const res = await request(createApp())
      .get('/admin/work-queue')
      .set('Cookie', cookieFor(adminId));
    expect(res.headers.location ?? '').not.toContain('/register/wizard/');
    expect(res.status).not.toBe(303);
  });

  it('membership takes effect on the session the registrant already holds', async () => {
    // Membership is read from the task rows on every request rather than
    // carried in the session, so answering the last task opens the member
    // surfaces immediately. A session that had to be reissued would strand a
    // registrant who just finished the wizard behind the gate that sent them
    // there, which is why this is asserted on one unchanged cookie.
    const memberId = insertPendingMember('gate_same_session');
    insertOnboardingTask(testDb, memberId, 'personal_details', 'completed');
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'completed');
    insertOnboardingTask(testDb, memberId, 'club_affiliations', 'pending');
    const cookie = cookieFor(memberId);

    const denied = await request(createApp()).get('/clubs/create').set('Cookie', cookie);
    expect(denied.status).toBe(303);
    expect(denied.headers.location).toBe('/register/wizard/club_affiliations');

    await request(createApp())
      .post('/register/wizard/club_affiliations/none')
      .set('Cookie', cookie)
      .type('form')
      .send({});

    const allowed = await request(createApp()).get('/clubs/create').set('Cookie', cookie);
    expect(allowed.status).not.toBe(303);
  });
});

describe('a pending account has no profile page and is not searchable', () => {
  it('the pending owner requesting their own profile is routed to their next wizard task', async () => {
    const memberId = insertPendingMember('pending_own_profile');
    const res = await request(createApp())
      .get('/members/pending_own_profile')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
  });

  it('a member viewing a pending account gets the same not-found as an unknown slug', async () => {
    insertPendingMember('pending_target');
    const viewerId = insertMember(testDb, { slug: 'pending_viewer' });
    const app = createApp();
    const pendingRes = await request(app)
      .get('/members/pending_target')
      .set('Cookie', cookieFor(viewerId));
    const unknownRes = await request(app)
      .get('/members/no_such_slug_at_all')
      .set('Cookie', cookieFor(viewerId));
    expect(pendingRes.status).toBe(404);
    expect(unknownRes.status).toBe(404);
  });

  it('an admin can still open a pending account profile (operational oversight)', async () => {
    insertPendingMember('pending_admin_target');
    const adminId = insertMember(testDb, { slug: 'pending_admin_viewer', is_admin: 1 });
    const res = await request(createApp())
      .get('/members/pending_admin_target')
      .set('Cookie', cookieFor(adminId));
    expect(res.status).toBe(200);
  });

  it('members_searchable excludes a pending account and admits it on completion', async () => {
    const memberId = insertPendingMember('pending_search_probe');
    const count = () =>
      (testDb.prepare('SELECT COUNT(*) AS c FROM members_searchable WHERE id = ?')
        .get(memberId) as { c: number }).c;
    expect(count()).toBe(0);
    insertOnboardingTask(testDb, memberId, 'personal_details', 'completed');
    insertOnboardingTask(testDb, memberId, 'legacy_claim', 'completed');
    insertOnboardingTask(testDb, memberId, 'club_affiliations', 'completed');
    expect(count()).toBe(1);
  });
});

describe('wizard complete page — no false completion on zero task rows', () => {
  it('a member with zero task rows is routed to an outstanding task, not shown the complete page', async () => {
    // With no task rows materialized, the outstanding set is empty and would read
    // as "all done" — a false completion page while the gate still blocks every
    // capability route. The complete handler must materialize the task list first.
    const memberId = insertPendingMember('complete_zero_rows');
    const res = await request(createApp())
      .get('/register/wizard/complete')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/register/wizard/');
  });
});

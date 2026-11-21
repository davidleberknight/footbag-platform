/**
 * Admin grant/revoke of the platform administrator role: the steady-state
 * A_Manage_Admin_Role action. Covers the Tier 2/3 grant gate, the self-revoke
 * guard that keeps at least one admin, the admin-alerts subscribe-on-grant /
 * unsubscribe-on-revoke side effect (leaving other lists untouched), the
 * affected-member notification, the audit trail, and the admin-only route gate.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createMemberAtTier, createTestSessionJwt, insertMailingListSubscription } from '../fixtures/factories';

const { dbPath } = setTestEnv('3142');

const TS = '2025-01-01T00:00:00.000Z';

const ADMIN_ID    = 'ar_admin_001';
const ADMIN_SLUG  = 'ar_admin_one';
const ADMIN2_ID   = 'ar_admin_002';
const ADMIN2_SLUG = 'ar_admin_two';
const T2_ID       = 'ar_t2_001';
const T2_SLUG     = 'ar_t2_one';
const T1_ID       = 'ar_t1_001';
const T1_SLUG     = 'ar_t1_one';
const MEMBER_ID   = 'ar_member_001';
const MEMBER_SLUG = 'ar_member_one';
// Granted only by the reason-cleaning case, so its audit count stays its own.
const CLEAN_ID    = 'ar_clean_001';
const CLEAN_SLUG  = 'ar_clean_one';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function admin2Cookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN2_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}
// The outcome rides a flash cookie across the redirect; the follow-up GET carries
// it the way a browser would.
function flashOf(res: { get(h: string): string[] | undefined }): string | undefined {
  return (res.get('Set-Cookie') ?? []).find((c) => c.startsWith('footbag_flash='))?.split(';')[0];
}
async function listPageWith(flash: string): Promise<string> {
  const page = await request(createApp())
    .get('/admin/admin-roles')
    .set('Cookie', `${adminCookie()}; ${flash}`);
  expect(page.status).toBe(200);
  return page.text;
}
function grantConfirm(cookie: string, memberId: string) {
  return request(createApp())
    .post('/admin/admin-roles/grant/confirm')
    .set('Cookie', cookie)
    .type('form')
    .send({ member_id: memberId, reason: 'Joining the admin team.' });
}
function grantForm(fields: Record<string, string>) {
  return request(createApp())
    .post('/admin/admin-roles/grant')
    .set('Cookie', adminCookie())
    .type('form')
    .send(fields);
}
function revokeConfirm(cookie: string, memberId: string) {
  return request(createApp())
    .post(`/admin/admin-roles/${memberId}/revoke/confirm`)
    .set('Cookie', cookie)
    .type('form')
    .send({ reason: 'Stepping down.' });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID,  slug: ADMIN_SLUG,  display_name: 'Ada Admin',   real_name: 'Ada Admin',   login_email: 'ar-admin@example.com',  is_admin: 1 });
  insertMember(db, { id: ADMIN2_ID, slug: ADMIN2_SLUG, display_name: 'Ben Admin',   real_name: 'Ben Admin',   login_email: 'ar-admin2@example.com', is_admin: 1 });
  createMemberAtTier(db, { id: T2_ID, slug: T2_SLUG, tier: 'tier2', memberOverrides: { display_name: 'Tess Two', real_name: 'Tess Two', login_email: 'ar-t2@example.com' } });
  createMemberAtTier(db, { id: T1_ID, slug: T1_SLUG, tier: 'tier1', memberOverrides: { display_name: 'Una One',  real_name: 'Una One',  login_email: 'ar-t1@example.com' } });
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'Mo Member', real_name: 'Mo Member', login_email: 'ar-member@example.com' });
  createMemberAtTier(db, { id: CLEAN_ID, slug: CLEAN_SLUG, tier: 'tier2', memberOverrides: { display_name: 'Cleo Clean', real_name: 'Cleo Clean', login_email: 'ar-clean@example.com' } });
  // An administrator who has not finished onboarding, as a bootstrap admin can be.
  insertMember(db, { id: 'ar_prospect_admin', slug: 'ar_prospect_admin', display_name: 'Pia Prospect', real_name: 'Pia Prospect', login_email: 'ar-prospect@example.com', is_admin: 1, onboarding: 'none' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Restore a known baseline before each test, since grant/revoke mutate is_admin
// and subscription rows. Ben (ADMIN2) starts as a subscribed admin so the revoke
// path has something to clear; Ben also holds a second list so the test can
// prove revoke leaves other subscriptions untouched.
beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare(`UPDATE members SET is_admin = 1 WHERE id IN (?, ?)`).run(ADMIN_ID, ADMIN2_ID);
  db.prepare(`UPDATE members SET is_admin = 0 WHERE id IN (?, ?, ?)`).run(T2_ID, T1_ID, MEMBER_ID);
  db.prepare(`DELETE FROM mailing_list_subscriptions`).run();
  db.prepare(`DELETE FROM outbox_emails`).run();
  // audit_entries is append-only (DELETE is trigger-blocked); each successful
  // grant/revoke targets a distinct member in a single run, so the per-entity
  // audit counts below stay exact without a reset.
  const subRow = (id: string, list: string, mid: string) =>
    insertMailingListSubscription(db, { id, list_slug: list, member_id: mid });
  subRow('mls_admin2_alerts', 'admin-alerts', ADMIN2_ID);
  subRow('mls_admin2_other', 'all-members', ADMIN2_ID);
  db.close();
});

function readMember(id: string): { is_admin: number } {
  const db = new BetterSqlite3(dbPath);
  const row = db.prepare(`SELECT is_admin FROM members WHERE id = ?`).get(id) as { is_admin: number };
  db.close();
  return row;
}
function readTier(id: string): string | undefined {
  const db = new BetterSqlite3(dbPath);
  const row = db.prepare(`SELECT tier_status FROM member_tier_current WHERE member_id = ?`).get(id) as { tier_status: string } | undefined;
  db.close();
  return row?.tier_status;
}
function readSubStatus(memberId: string, list: string): string | undefined {
  const db = new BetterSqlite3(dbPath);
  const row = db.prepare(`SELECT status FROM mailing_list_subscriptions WHERE member_id = ? AND mailing_list_id = ?`).get(memberId, list) as { status: string } | undefined;
  db.close();
  return row?.status;
}
function countAudit(actionType: string, entityId: string): number {
  const db = new BetterSqlite3(dbPath);
  const row = db.prepare(`SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = ? AND entity_id = ?`).get(actionType, entityId) as { c: number };
  db.close();
  return row.c;
}
function countOutboxFor(memberId: string): number {
  const db = new BetterSqlite3(dbPath);
  const row = db.prepare(`SELECT COUNT(*) AS c FROM outbox_emails WHERE recipient_member_id = ?`).get(memberId) as { c: number };
  db.close();
  return row.c;
}

describe('GET /admin/admin-roles', () => {
  it('unauthenticated → 302 to /login', async () => {
    const res = await request(createApp()).get('/admin/admin-roles');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('non-admin → 403', async () => {
    const res = await request(createApp()).get('/admin/admin-roles').set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('admin → 200 listing current admins and the grant form', async () => {
    const res = await request(createApp()).get('/admin/admin-roles').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Ada Admin');
    expect(res.text).toContain('Ben Admin');
    // An admin still onboarding is not yet a member, so is not named to anyone.
    expect(res.text).not.toContain('Pia Prospect');
  });
});

describe('POST /admin/admin-roles/grant', () => {
  it('grant requires confirmation: the form POST shows a confirm page naming the member and writes nothing yet', async () => {
    const res = await request(createApp())
      .post('/admin/admin-roles/grant')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_id: T2_ID, reason: 'Joining the admin team.' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Tess Two');
    expect(res.text).toContain('/admin/admin-roles/grant/confirm');
    expect(readMember(T2_ID).is_admin).toBe(0);
    expect(countAudit('admin.role_granted', T2_ID)).toBe(0);
  });

  it('grant confirm commits: 303, is_admin set, audited, subscribed, emailed', async () => {
    const res = await request(createApp())
      .post('/admin/admin-roles/grant/confirm')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_id: T2_ID, reason: 'Joining the admin team.' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/admin-roles');
    expect(readMember(T2_ID).is_admin).toBe(1);
    expect(countAudit('admin.role_granted', T2_ID)).toBe(1);
    expect(readSubStatus(T2_ID, 'admin-alerts')).toBe('subscribed');
    expect(countOutboxFor(T2_ID)).toBe(1);
  });

  it('a repeated grant confirm by the same admin reports the first grant: 303, no second audit row or email', async () => {
    // Defect caught: a double-clicked or re-posted Grant shows an error for a grant that succeeded.
    const send = () => request(createApp())
      .post('/admin/admin-roles/grant/confirm')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_id: T2_ID, reason: 'Joining the admin team.' });
    expect((await send()).status).toBe(303);
    const auditAfterFirst = countAudit('admin.role_granted', T2_ID);
    const outboxAfterFirst = countOutboxFor(T2_ID);
    const repeat = await send();
    expect(repeat.status).toBe(303);
    expect(repeat.headers.location).toBe('/admin/admin-roles');
    expect(flashOf(repeat)).toBeUndefined();   // the first grant carried no notice either
    expect(readMember(T2_ID).is_admin).toBe(1);
    expect(countAudit('admin.role_granted', T2_ID)).toBe(auditAfterFirst);
    expect(countOutboxFor(T2_ID)).toBe(outboxAfterFirst);
  });

  it('a grant confirm for a member another act already made an administrator says nothing was changed, in the informational tone, and writes nothing', async () => {
    // Defect caught: an admin acting on a stale page is shown an error, or a
    // success they did not cause, for a role someone else already granted.
    const auditBefore = countAudit('admin.role_granted', ADMIN2_ID);
    const outboxBefore = countOutboxFor(ADMIN2_ID);
    const res = await grantConfirm(adminCookie(), ADMIN2_ID);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/admin-roles');
    const page = await listPageWith(flashOf(res)!);
    expect(page).toMatch(/class="form-notice"[^>]*>That member is already an administrator/);
    expect(page).not.toContain('form-error-banner');
    expect(countAudit('admin.role_granted', ADMIN2_ID)).toBe(auditBefore);
    expect(countOutboxFor(ADMIN2_ID)).toBe(outboxBefore);
  });

  it("an admin's earlier grant that another admin since reversed and re-made is not their repeat: it reports the state as already held", async () => {
    // Defect caught: a stale confirm page claims this admin's grant stands when
    // another admin's later grant is the one in force.
    expect((await grantConfirm(adminCookie(), T2_ID)).status).toBe(303);
    expect((await revokeConfirm(admin2Cookie(), T2_ID)).status).toBe(303);
    expect((await grantConfirm(admin2Cookie(), T2_ID)).status).toBe(303);
    const auditBefore = countAudit('admin.role_granted', T2_ID);

    const stale = await grantConfirm(adminCookie(), T2_ID);
    expect(stale.status).toBe(303);
    expect(flashOf(stale)).toBeDefined();
    expect(countAudit('admin.role_granted', T2_ID)).toBe(auditBefore);
  });

  it('grant confirm: non-admin actor → 403, no change', async () => {
    const res = await request(createApp())
      .post('/admin/admin-roles/grant/confirm')
      .set('Cookie', memberCookie())
      .type('form')
      .send({ member_id: T2_ID, reason: 'x' });
    expect(res.status).toBe(403);
    expect(readMember(T2_ID).is_admin).toBe(0);
  });

  it('granting a member below Tier 2 applies the tier the role requires', async () => {
    // Tier 2 is an invariant of the admin role, established by the grant, not a
    // precondition the target has to arrive holding. Refusing here would send an
    // administrator to the tier-override surface to enable a grant the platform
    // is about to make anyway.
    const preview = await request(createApp())
      .post('/admin/admin-roles/grant')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_id: T1_ID, reason: 'Joining the admin team.' });
    expect(preview.status).toBe(200);
    expect(readMember(T1_ID).is_admin).toBe(0);
    expect(readTier(T1_ID)).toBe('tier1');

    const res = await request(createApp())
      .post('/admin/admin-roles/grant/confirm')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_id: T1_ID, reason: 'Joining the admin team.' });
    expect(res.status).toBe(303);
    expect(readMember(T1_ID).is_admin).toBe(1);
    expect(readTier(T1_ID)).toBe('tier2');
    expect(countAudit('admin.role_granted', T1_ID)).toBe(1);
    // One event, one row: the tier movement rides the grant's own audit row
    // rather than a second row claiming to be a bootstrap.
    expect(countAudit('admin.bootstrap_grant', T1_ID)).toBe(0);
    expect(readSubStatus(T1_ID, 'admin-alerts')).toBe('subscribed');
  });

  it('granting a member who already holds Tier 2 leaves their tier alone', async () => {
    await request(createApp())
      .post('/admin/admin-roles/grant/confirm')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_id: T2_ID, reason: 'Joining the admin team.' });
    expect(readMember(T2_ID).is_admin).toBe(1);
    expect(readTier(T2_ID)).toBe('tier2');
    expect(countAudit('admin.bootstrap_grant', T2_ID)).toBe(0);
  });

  it('rejects granting a member who is already an admin → 422', async () => {
    const res = await request(createApp())
      .post('/admin/admin-roles/grant')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_id: ADMIN2_ID, reason: 'Already admin.' });
    expect(res.status).toBe(422);
  });

  // Defect caught: the form still accepts a typed profile handle, so an admin is
  // asked for something nobody knows instead of choosing the member by name.
  it('refuses a profile handle posted in place of the chosen member, and an unknown id, writing nothing', async () => {
    const auditBefore = countAudit('admin.role_granted', T2_ID);
    for (const memberId of [T2_SLUG, 'no_such_member']) {
      const res = await grantForm({ member_id: memberId, reason: 'Joining the admin team.' });
      expect(res.status, memberId).toBe(422);
      expect(res.text, memberId).not.toContain('/admin/admin-roles/grant/confirm');
    }
    const confirm = await grantConfirm(adminCookie(), T2_SLUG);
    expect(confirm.status).toBe(422);
    expect(readMember(T2_ID).is_admin).toBe(0);
    expect(countAudit('admin.role_granted', T2_ID)).toBe(auditBefore);
  });

  // Defect caught: the first visit shows no way to find a member, so the admin
  // has nothing to fill in; or the search sits outside the grant form and loses
  // the reason typed beside it.
  it('opens the member search on the grant form on first visit', async () => {
    const res = await request(createApp()).get('/admin/admin-roles').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<input type="text" id="grant-admin-form-pick-q" name="pick_q" form="grant-admin-form"/);
    expect(res.text).toMatch(/name="pick" value="search:admin" formaction="\/admin\/admin-roles\/grant#grant-admin-form-pick"/);
    // Nobody is chosen yet, and no visible field asks for a member.
    expect(res.text).toContain('<input type="hidden" name="member_id" value="" form="grant-admin-form" />');
    expect(res.text).not.toMatch(/<input(?![^>]*type="hidden")[^>]*name="member_(?:id|key)"/);
  });

  // Defect caught: the search offers someone who is already an administrator,
  // misses a member who opted out of member search (whom an admin must reach),
  // or a search writes something.
  it('searches by name, reaching an opted-out member and leaving out current administrators, and writes nothing', async () => {
    const db = new BetterSqlite3(dbPath);
    insertMember(db, { id: 'ar_hidden_001', slug: 'ar_hidden_one', display_name: 'Tessa Hidden', real_name: 'Tessa Hidden', login_email: 'ar-hidden@example.com', searchable: 0 });
    db.close();
    const auditBefore = countAudit('admin.role_granted', T2_ID);
    const res = await grantForm({ pick: 'search:admin', pick_q: 'Tess', reason: 'Joining.' });
    expect(res.status).toBe(200);
    expect(res.text).toContain(`value="choose:admin:${T2_ID}"`);
    expect(res.text).toContain('value="choose:admin:ar_hidden_001"');
    // The reason typed before searching is still there.
    expect(res.text).toMatch(/id="grant_reason" name="reason" value="Joining\."/);

    const admins = await grantForm({ pick: 'search:admin', pick_q: 'Admin', reason: '' });
    expect(admins.status).toBe(200);
    expect(admins.text).not.toContain(`value="choose:admin:${ADMIN2_ID}"`);
    expect(admins.text).not.toContain(`value="choose:admin:${ADMIN_ID}"`);
    expect(readMember(T2_ID).is_admin).toBe(0);
    expect(countAudit('admin.role_granted', T2_ID)).toBe(auditBefore);
  });

  // Defect caught: choosing a member does not carry them into the form, or the
  // confirm page loses the choice, so the grant lands on nobody or someone else.
  it('carries a chosen member through the form and the confirm page to the grant', async () => {
    const chose = await grantForm({ pick: `choose:admin:${T2_ID}`, pick_q: 'Tess', reason: 'Joining the admin team.' });
    expect(chose.status).toBe(200);
    expect(chose.text).toContain(`<input type="hidden" name="member_id" value="${T2_ID}" form="grant-admin-form" />`);
    expect(chose.text).toContain('value="change:admin"');
    expect(readMember(T2_ID).is_admin).toBe(0);

    const preview = await grantForm({ member_id: T2_ID, reason: 'Joining the admin team.' });
    expect(preview.status).toBe(200);
    expect(preview.text).toContain(`<input type="hidden" name="member_id" value="${T2_ID}" />`);

    expect((await grantConfirm(adminCookie(), T2_ID)).status).toBe(303);
    expect(readMember(T2_ID).is_admin).toBe(1);
  });

  it('missing reason → 422', async () => {
    const res = await request(createApp())
      .post('/admin/admin-roles/grant')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_id: T2_ID, reason: '   ' });
    expect(res.status).toBe(422);
    expect(readMember(T2_ID).is_admin).toBe(0);
  });

  // Defect caught: markup, a control character or a run of spaces typed into
  // the reason reaches the confirmation step and the audit trail as typed, or a
  // reason that is only markup passes the required check and a member is made
  // an administrator with no reason on the record.
  it('carries a cleaned reason to the audit row, and refuses one that is only markup with nothing written', async () => {
    const markupOnly = '<script></script><b></b>';
    for (const path of ['/admin/admin-roles/grant', '/admin/admin-roles/grant/confirm']) {
      const refused = await request(createApp())
        .post(path).set('Cookie', adminCookie())
        .type('form').send({ member_id: CLEAN_ID, reason: markupOnly });
      expect(refused.status, path).toBe(422);
    }
    expect(readMember(CLEAN_ID).is_admin).toBe(0);
    expect(countAudit('admin.role_granted', CLEAN_ID)).toBe(0);
    expect(countOutboxFor(CLEAN_ID)).toBe(0);

    const dirty = '<b>Joining</b> the\u0085 admin   team.';
    const preview = await request(createApp())
      .post('/admin/admin-roles/grant').set('Cookie', adminCookie())
      .type('form').send({ member_id: CLEAN_ID, reason: dirty });
    expect(preview.status).toBe(200);
    expect(preview.text).toContain('name="reason" value="Joining the admin team."');

    const res = await request(createApp())
      .post('/admin/admin-roles/grant/confirm').set('Cookie', adminCookie())
      .type('form').send({ member_id: CLEAN_ID, reason: dirty });
    expect(res.status).toBe(303);
    expect(readMember(CLEAN_ID).is_admin).toBe(1);
    const db = new BetterSqlite3(dbPath);
    const rows = db.prepare(
      "SELECT reason_text FROM audit_entries WHERE action_type = 'admin.role_granted' AND entity_id = ?",
    ).all(CLEAN_ID) as Array<{ reason_text: string | null }>;
    db.close();
    expect(rows).toEqual([{ reason_text: 'Joining the admin team.' }]);
  });

  it('non-admin actor → 403', async () => {
    const res = await request(createApp())
      .post('/admin/admin-roles/grant')
      .set('Cookie', memberCookie())
      .type('form')
      .send({ member_id: T2_ID, reason: 'x' });
    expect(res.status).toBe(403);
    expect(readMember(T2_ID).is_admin).toBe(0);
  });
});

describe('POST /admin/admin-roles/:memberId/revoke', () => {
  it('revoke requires confirmation: the form POST shows a confirm page naming the member and writes nothing yet', async () => {
    const res = await request(createApp())
      .post(`/admin/admin-roles/${ADMIN2_ID}/revoke`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'Stepping down.' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Ben Admin');
    expect(res.text).toContain(`/admin/admin-roles/${ADMIN2_ID}/revoke/confirm`);
    expect(readMember(ADMIN2_ID).is_admin).toBe(1);
    expect(countAudit('admin.role_revoked', ADMIN2_ID)).toBe(0);
  });

  it('revoke confirm commits: 303, is_admin cleared, audited, admin-alerts unsubscribed, other lists intact, emailed', async () => {
    const res = await request(createApp())
      .post(`/admin/admin-roles/${ADMIN2_ID}/revoke/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'Stepping down.' });
    expect(res.status).toBe(303);
    expect(readMember(ADMIN2_ID).is_admin).toBe(0);
    expect(countAudit('admin.role_revoked', ADMIN2_ID)).toBe(1);
    expect(readSubStatus(ADMIN2_ID, 'admin-alerts')).toBe('unsubscribed');
    // Other subscriptions are untouched (revoke does not change other lists).
    expect(readSubStatus(ADMIN2_ID, 'all-members')).toBe('subscribed');
    expect(countOutboxFor(ADMIN2_ID)).toBe(1);
  });

  it('a repeated revoke confirm by the same admin reports the first revoke: 303, no second audit row or email', async () => {
    // Defect caught: a re-posted Revoke shows an error for a role that was already removed.
    const send = () => request(createApp())
      .post(`/admin/admin-roles/${ADMIN2_ID}/revoke/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'Stepping down.' });
    expect((await send()).status).toBe(303);
    const auditAfterFirst = countAudit('admin.role_revoked', ADMIN2_ID);
    const outboxAfterFirst = countOutboxFor(ADMIN2_ID);
    const repeat = await send();
    expect(repeat.status).toBe(303);
    expect(repeat.headers.location).toBe('/admin/admin-roles');
    expect(flashOf(repeat)).toBeUndefined();   // the first revoke carried no notice either
    expect(readMember(ADMIN2_ID).is_admin).toBe(0);
    expect(countAudit('admin.role_revoked', ADMIN2_ID)).toBe(auditAfterFirst);
    expect(countOutboxFor(ADMIN2_ID)).toBe(outboxAfterFirst);
  });

  it('a revoke confirm for a member another admin already removed says nothing was changed, in the informational tone, and writes nothing', async () => {
    // Defect caught: a revoke from a stale page shows an error, or claims this
    // admin's own success, for a role another admin already took away.
    expect((await grantConfirm(admin2Cookie(), T1_ID)).status).toBe(303);
    expect((await revokeConfirm(admin2Cookie(), T1_ID)).status).toBe(303);
    const auditBefore = countAudit('admin.role_revoked', T1_ID);
    const outboxBefore = countOutboxFor(T1_ID);

    const res = await revokeConfirm(adminCookie(), T1_ID);
    expect(res.status).toBe(303);
    const page = await listPageWith(flashOf(res)!);
    expect(page).toMatch(/class="form-notice"[^>]*>That member is no longer an administrator/);
    expect(countAudit('admin.role_revoked', T1_ID)).toBe(auditBefore);
    expect(countOutboxFor(T1_ID)).toBe(outboxBefore);
  });

  it('revoke confirm re-validates: an admin cannot confirm revoking their own role → 422, still admin', async () => {
    const res = await request(createApp())
      .post(`/admin/admin-roles/${ADMIN_ID}/revoke/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'Self-revoke at commit.' });
    expect(res.status).toBe(422);
    expect(readMember(ADMIN_ID).is_admin).toBe(1);
  });

  it('revoke confirm: non-admin actor → 403, no change', async () => {
    const res = await request(createApp())
      .post(`/admin/admin-roles/${ADMIN2_ID}/revoke/confirm`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ reason: 'x' });
    expect(res.status).toBe(403);
    expect(readMember(ADMIN2_ID).is_admin).toBe(1);
  });

  it('an admin cannot revoke their own role → 422, still admin', async () => {
    const res = await request(createApp())
      .post(`/admin/admin-roles/${ADMIN_ID}/revoke`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'Trying to self-revoke.' });
    expect(res.status).toBe(422);
    expect(readMember(ADMIN_ID).is_admin).toBe(1);
  });

  it('revoking a member who is not an admin → 422', async () => {
    const res = await request(createApp())
      .post(`/admin/admin-roles/${T2_ID}/revoke`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'Not an admin.' });
    expect(res.status).toBe(422);
  });

  it('unknown member id → 404', async () => {
    const res = await request(createApp())
      .post('/admin/admin-roles/no_such_member/revoke')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: 'x' });
    expect(res.status).toBe(404);
  });

  it('missing reason → 422', async () => {
    const res = await request(createApp())
      .post(`/admin/admin-roles/${ADMIN2_ID}/revoke`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reason: '' });
    expect(res.status).toBe(422);
    expect(readMember(ADMIN2_ID).is_admin).toBe(1);
  });

  it('non-admin actor → 403', async () => {
    const res = await request(createApp())
      .post(`/admin/admin-roles/${ADMIN2_ID}/revoke`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ reason: 'x' });
    expect(res.status).toBe(403);
    expect(readMember(ADMIN2_ID).is_admin).toBe(1);
  });
});

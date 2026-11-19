/**
 * An administrator restricting an abusive member's account at once, lifting
 * it, and recording the IFPA board's decision under the bylaws' discipline
 * article, from the administrator member record; the barred address at
 * registration; and the daily pass that lifts ended board suspensions and
 * deletes decisions past retention.
 *
 * The contract: a restriction is previewed, takes a reason, ends every session
 * and every later sign-in (a verification link included), returns an
 * announcement waiting for approval, changes no tier, audits and emails the
 * member. An administrator's account, the platform's own and a deleted one are
 * refused. A board suspension cannot be lifted early and lifts by itself on its
 * end date. A decision is refused with less notice, or an expulsion with less
 * time after the hearing, than the bylaws give. An expulsion bars the address by
 * keyed hash, deletes the account and sends its own notice; that address then
 * gets the ordinary registration response and no account.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMemberAnnouncement,
  insertWorkQueueItem,
  insertAccountToken,
  insertMembershipDisciplineDecision,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';
import { hashTestPassword } from '../fixtures/hashTestPassword';
import { flashValueOf } from '../fixtures/flashCookie';
import { isoDaysAgo, isoDaysFromNow } from '../fixtures/clock';

const { dbPath } = setTestEnv('4766');
process.env.PAYMENT_ADAPTER = 'stub';

const ADMIN_ID = 'amr_admin';
const SYSTEM_ID = 'amr_system';
const PASSWORD = 'restricted-pass-123';
const REASON = 'Repeated abusive messages to other members';

let createApp: Awaited<ReturnType<typeof importApp>>;
let passwordHash = '';

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

let n = 0;
function seedMember(o: { isAdmin?: 0 | 1; verified?: boolean } = {}): { id: string; slug: string; email: string } {
  n += 1;
  const slug = `amr_mem_${n}`;
  const email = `amr-mem-${n}@example.com`;
  const id = withDb((db) => {
    const memberId = insertMember(db, {
      id: `amr-mem-${n}`, slug, display_name: `Member ${n}`, login_email: email,
      password_hash: passwordHash, is_admin: o.isAdmin ?? 0,
      ...(o.verified === false ? { email_verified_at: null } : {}),
    });
    completeOnboarding(db, memberId);
    return memberId;
  });
  return { id, slug, email };
}

function post(path: string, body: Record<string, string>) {
  return request(createApp()).post(path).set('Cookie', adminCookie()).type('form').send(body);
}

function outcomeOf(res: Parameters<typeof flashValueOf>[0]): string | undefined {
  return flashValueOf(res)?.split(':').pop();
}

function memberRow(id: string) {
  return withDb((db) => db.prepare(
    'SELECT restricted_at, restricted_until, password_version, deleted_at FROM members WHERE id = ?',
  ).get(id) as { restricted_at: string | null; restricted_until: string | null; password_version: number; deleted_at: string | null });
}

function audits(id: string, actionType: string) {
  return withDb((db) => db.prepare(
    'SELECT actor_type, actor_member_id, reason_text, metadata_json FROM audit_entries WHERE action_type = ? AND entity_id = ?',
  ).all(actionType, id) as Array<{ actor_type: string; actor_member_id: string | null; reason_text: string | null; metadata_json: string }>);
}

function mailTemplates(id: string): string[] {
  return withDb((db) => (db.prepare(
    'SELECT template_key FROM outbox_emails WHERE recipient_member_id = ?',
  ).all(id) as Array<{ template_key: string }>).map((r) => r.template_key));
}

function decisionCount(id: string): number {
  return withDb((db) => (db.prepare(
    'SELECT COUNT(*) AS n FROM membership_discipline_decisions WHERE member_id = ?',
  ).get(id) as { n: number }).n);
}

function tierRow(id: string): unknown {
  return withDb((db) => db.prepare('SELECT * FROM member_tier_current WHERE member_id = ?').get(id));
}

const restrict = (id: string, reason = REASON) => post(`/admin/members/${id}/restrict/confirm`, { reason });
const lift = (id: string, reason = 'Board asked for it lifted') => post(`/admin/members/${id}/restrict/lift/confirm`, { reason });

function decision(id: string, o: Partial<Record<string, string>> = {}) {
  return post(`/admin/members/${id}/discipline/confirm`, {
    decided_by: 'IFPA board',
    outcome: 'other_sanction',
    notice_date: isoDaysAgo(30).slice(0, 10),
    hearing_date: isoDaysAgo(20).slice(0, 10),
    decision_date: isoDaysAgo(10).slice(0, 10),
    suspended_until: '',
    reason: 'Harassment at the 2026 worlds',
    ...o,
  });
}

beforeAll(async () => {
  passwordHash = await hashTestPassword(PASSWORD);
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'amr_admin', login_email: 'amr-admin@example.com', is_admin: 1 });
  insertMember(db, { id: SYSTEM_ID, slug: 'amr_system', is_system: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('restricting an account', () => {
  // Defect caught: the control is missing for an ordinary member, or offered on
  // an account the write would refuse.
  it('offers the control on an ordinary member and not on an administrator or the system account', async () => {
    const plain = seedMember();
    const admin = seedMember({ isAdmin: 1 });
    const get = (id: string) => request(createApp()).get(`/admin/members/${id}`).set('Cookie', adminCookie());
    expect((await get(plain.id)).text).toContain(`action="/admin/members/${plain.id}/restrict"`);
    expect((await get(admin.id)).text).not.toContain(`action="/admin/members/${admin.id}/restrict"`);
    expect((await get(SYSTEM_ID)).text).not.toContain(`action="/admin/members/${SYSTEM_ID}/restrict"`);
  });

  // Defect caught: the preview restricts, or a blank reason leaves the member's
  // notice and the audit row with nothing to say why.
  it('previews without writing, and refuses a blank reason', async () => {
    const m = seedMember();
    const res = await post(`/admin/members/${m.id}/restrict`, { reason: REASON });
    expect(res.status).toBe(200);
    expect(res.text).toContain(`action="/admin/members/${m.id}/restrict/confirm"`);
    expect(memberRow(m.id).restricted_at).toBeNull();
    expect((await restrict(m.id, '  ')).status).toBe(422);
    expect(memberRow(m.id).restricted_at).toBeNull();
  });

  // Defect caught: a restricted member keeps acting through a session issued
  // before the restriction; the tier changes; nothing records or tells them.
  it('ends the existing session, changes no tier, audits once and emails the member', async () => {
    const m = seedMember();
    const cookie = `__Host-footbag_session=${createTestSessionJwt({ memberId: m.id, role: 'member', passwordVersion: 1 })}`;
    const edit = () => request(createApp()).get(`/members/${m.slug}/edit`).set('Cookie', cookie);
    expect((await edit()).status).toBe(200);
    const tierBefore = tierRow(m.id);

    const res = await restrict(m.id);
    expect(res.status).toBe(303);
    expect(outcomeOf(res)).toBe('account_restricted');

    const row = memberRow(m.id);
    expect(row.restricted_at).not.toBeNull();
    expect(row.password_version).toBe(2);
    expect((await edit()).status).toBe(302);
    // A token carrying the current password version is refused too: the
    // restriction itself closes the session, not only the version bump.
    const current = `__Host-footbag_session=${createTestSessionJwt({ memberId: m.id, role: 'member', passwordVersion: 2 })}`;
    expect((await request(createApp()).get(`/members/${m.slug}/edit`).set('Cookie', current)).status).toBe(302);
    expect(tierRow(m.id)).toEqual(tierBefore);
    const rows = audits(m.id, 'auth.account_restricted');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_type: 'admin', actor_member_id: ADMIN_ID, reason_text: REASON });
    expect(mailTemplates(m.id).filter((t) => t === 'account_restricted')).toHaveLength(1);

    // Submitted twice: the same redirect, an informational outcome, and no
    // second audit row or notice.
    const again = await restrict(m.id);
    expect(again.status).toBe(303);
    expect(outcomeOf(again)).toBe('account_already_restricted');
    expect(audits(m.id, 'auth.account_restricted')).toHaveLength(1);
    expect(mailTemplates(m.id).filter((t) => t === 'account_restricted')).toHaveLength(1);
  });

  // Defect caught: an announcement the restricted member had waiting is still
  // sent once an administrator approves it.
  it('returns an announcement waiting for approval', async () => {
    const m = seedMember();
    const annId = withDb((db) => {
      const id = insertMemberAnnouncement(db, { member_id: m.id });
      insertWorkQueueItem(db, { task_type: 'announcement_review', entity_type: 'member_announcement', entity_id: id });
      return id;
    });
    await restrict(m.id);
    const status = withDb((db) => (db.prepare('SELECT status FROM member_announcements WHERE id = ?')
      .get(annId) as { status: string }).status);
    expect(status).toBe('returned');
  });

  // Defect caught: a restricted member with the right password signs in again,
  // while the refusal must not tell a stranger the address has an account.
  it('refuses sign-in with the right password and says why, and gives the ordinary answer to a wrong one', async () => {
    const { RESTRICTED_SIGN_IN_MESSAGE } = await import('../../src/services/identityAccessService');
    const m = seedMember();
    const login = (password: string) => request(createApp()).post('/login').type('form').send({ email: m.email, password });
    expect((await login(PASSWORD)).status).toBe(303);
    await restrict(m.id);
    const right = await login(PASSWORD);
    expect(right.status).toBe(403);
    expect(right.text).toContain(RESTRICTED_SIGN_IN_MESSAGE);
    expect(right.get('Set-Cookie')?.some((c) => c.startsWith('__Host-footbag_session=')) ?? false).toBe(false);
    const wrong = await login('not-the-password');
    expect(wrong.status).not.toBe(403);
    expect(wrong.text).not.toContain(RESTRICTED_SIGN_IN_MESSAGE);
  });

  // Defect caught: a verification link opens a session for a restricted account.
  it('opens no session from a verification link for a restricted account', async () => {
    const issue = (memberId: string, raw: string) => withDb((db) => insertAccountToken(db, memberId, {
      token_type: 'email_verify', token_hash: createHash('sha256').update(raw).digest('hex'),
    }));
    const sessionSet = (res: { get(h: string): string[] | undefined }) =>
      res.get('Set-Cookie')?.some((c) => c.startsWith('__Host-footbag_session=')) ?? false;

    const control = seedMember({ verified: false });
    issue(control.id, 'amr-raw-control-token');
    expect(sessionSet(await request(createApp()).get('/verify/amr-raw-control-token'))).toBe(true);

    const m = seedMember({ verified: false });
    await restrict(m.id);
    issue(m.id, 'amr-raw-restricted-token');
    expect(sessionSet(await request(createApp()).get('/verify/amr-raw-restricted-token'))).toBe(false);
  });

  // Defect caught: an administrator restricts another administrator or the
  // platform's own account through a crafted post.
  it('refuses another administrator and the system account', async () => {
    const admin = seedMember({ isAdmin: 1 });
    expect((await restrict(admin.id)).status).toBe(422);
    expect((await restrict(SYSTEM_ID)).status).toBe(422);
    expect(memberRow(admin.id).restricted_at).toBeNull();
    expect(memberRow(SYSTEM_ID).restricted_at).toBeNull();
  });
});

describe('lifting a restriction', () => {
  // Defect caught: a lifted member stays locked out, or is not told.
  it('lifts an administrator restriction, audits it and emails the member', async () => {
    const m = seedMember();
    await restrict(m.id);
    const res = await lift(m.id);
    expect(outcomeOf(res)).toBe('restriction_lifted');
    expect(memberRow(m.id).restricted_at).toBeNull();
    expect(audits(m.id, 'auth.account_restriction_lifted')).toHaveLength(1);
    expect(mailTemplates(m.id)).toContain('account_restriction_lifted');
    const signIn = await request(createApp()).post('/login').type('form').send({ email: m.email, password: PASSWORD });
    expect(signIn.status).toBe(303);
  });

  // Defect caught: an administrator overrides the board's final suspension.
  it('refuses to lift a board suspension that is still running', async () => {
    const m = seedMember();
    const until = isoDaysFromNow(30).slice(0, 10);
    expect(outcomeOf(await decision(m.id, { outcome: 'suspended', suspended_until: until }))).toBe('discipline_recorded');
    expect((await lift(m.id)).status).toBe(422);
    expect(memberRow(m.id).restricted_until).toBe(until);
  });
});

describe("recording the board's decision", () => {
  // Defect caught: a suspension or expulsion is carried out with less notice
  // than the bylaws give the member.
  it('refuses a suspension decided less than 15 days after notice, and accepts one at 15', async () => {
    const m = seedMember();
    const short = await decision(m.id, {
      outcome: 'suspended', suspended_until: isoDaysFromNow(30).slice(0, 10),
      notice_date: isoDaysAgo(24).slice(0, 10), hearing_date: isoDaysAgo(20).slice(0, 10),
      decision_date: isoDaysAgo(10).slice(0, 10),
    });
    expect(short.status).toBe(422);
    expect(decisionCount(m.id)).toBe(0);
    const ok = await decision(m.id, {
      outcome: 'suspended', suspended_until: isoDaysFromNow(30).slice(0, 10),
      notice_date: isoDaysAgo(25).slice(0, 10), hearing_date: isoDaysAgo(20).slice(0, 10),
      decision_date: isoDaysAgo(10).slice(0, 10),
    });
    expect(outcomeOf(ok)).toBe('discipline_recorded');
    expect(memberRow(m.id).restricted_at).not.toBeNull();
    expect(mailTemplates(m.id)).toContain('membership_discipline_suspended');
  });

  // Defect caught: an expulsion takes effect too soon after the hearing.
  it('refuses an expulsion decided less than 5 days after the hearing', async () => {
    const m = seedMember();
    const res = await decision(m.id, {
      outcome: 'expelled', hearing_date: isoDaysAgo(14).slice(0, 10), decision_date: isoDaysAgo(10).slice(0, 10),
    });
    expect(res.status).toBe(422);
    expect(memberRow(m.id).deleted_at).toBeNull();
    expect(decisionCount(m.id)).toBe(0);
  });

  // Defect caught: once the board rules for a lesser outcome the account stays
  // locked; a resubmitted decision is recorded twice.
  it('lifts a standing restriction on any other outcome, and records a resubmission once', async () => {
    const m = seedMember();
    await restrict(m.id);
    expect(outcomeOf(await decision(m.id))).toBe('discipline_recorded');
    expect(memberRow(m.id).restricted_at).toBeNull();
    expect(mailTemplates(m.id)).toContain('membership_discipline_other');
    await decision(m.id);
    expect(decisionCount(m.id)).toBe(1);
  });

  // Defect caught: an expelled member keeps the account, can register again
  // with the same address, is sent the ordinary deletion notice that says the
  // address frees up, or has their address written into the audit log.
  it('expels: bars the address, deletes the account, sends the expulsion notice, and keeps the address out of the audit row', async () => {
    const m = seedMember();
    const res = await decision(m.id, { outcome: 'expelled' });
    expect(outcomeOf(res)).toBe('member_expelled');
    expect(memberRow(m.id).deleted_at).not.toBeNull();
    const templates = mailTemplates(m.id);
    expect(templates).toContain('membership_expelled');
    expect(templates).not.toContain('account_deleted_by_admin');
    const row = audits(m.id, 'member.discipline_recorded')[0];
    expect(`${row.reason_text} ${row.metadata_json}`).not.toContain(m.email);
    const barred = withDb((db) => (db.prepare('SELECT COUNT(*) AS n FROM barred_email_hashes').get() as { n: number }).n);
    expect(barred).toBeGreaterThanOrEqual(1);

    // The barred address gets the same response as any other address and no
    // account; a fresh address beside it gets an account.
    const register = (email: string) => request(createApp()).post('/register').type('form').send({
      givenNames: 'Come', familyName: 'Back', email, password: 'comeback-pass-1', confirmPassword: 'comeback-pass-1',
    });
    const countFor = (email: string) => withDb((db) => (db.prepare(
      'SELECT COUNT(*) AS n FROM members WHERE login_email_normalized = ?',
    ).get(email) as { n: number }).n);
    const fresh = await register('amr-fresh@example.com');
    const blocked = await register(m.email.toUpperCase());
    expect(blocked.status).toBe(fresh.status);
    expect(blocked.headers.location).toBe(fresh.headers.location);
    expect(countFor('amr-fresh@example.com')).toBe(1);
    expect(countFor(m.email)).toBe(1);
    const notice = withDb((db) => (db.prepare(
      "SELECT COUNT(*) AS n FROM outbox_emails WHERE template_key = 'registration_refused_barred' AND lower(recipient_email) = ?",
    ).get(m.email) as { n: number }).n);
    expect(notice).toBe(1);

    // The purge at the end of the grace period erases the administrator's
    // reason along with the rest of the account's personal data.
    const { operationsPlatformService } = await import('../../src/services/operationsPlatformService');
    expect(withDb((db) => (db.prepare('SELECT restriction_reason FROM members WHERE id = ?')
      .get(m.id) as { restriction_reason: string | null }).restriction_reason)).not.toBeNull();
    await operationsPlatformService.runPiiPurgeScan({ now: new Date(Date.parse(isoDaysFromNow(400))) });
    const purged = withDb((db) => db.prepare(
      'SELECT personal_data_purged_at, restricted_at, restriction_reason FROM members WHERE id = ?',
    ).get(m.id) as { personal_data_purged_at: string | null; restricted_at: string | null; restriction_reason: string | null });
    expect(purged.personal_data_purged_at).not.toBeNull();
    expect(purged.restricted_at).toBeNull();
    expect(purged.restriction_reason).toBeNull();
  });
});

describe('the daily discipline pass', () => {
  // Defect caught: an ended suspension never lifts, an administrator's
  // open-ended restriction is lifted by the job, or a decision inside the
  // challenge window is deleted.
  it('lifts ended suspensions only and deletes only decisions past retention, through its registry entry', async () => {
    const suspended = seedMember();
    await decision(suspended.id, { outcome: 'suspended', suspended_until: isoDaysFromNow(5).slice(0, 10) });
    const adminRestricted = seedMember();
    await restrict(adminRestricted.id);

    const [oldPurged, recentPurged] = withDb((db) => [isoDaysAgo(400), isoDaysAgo(30)].map((purgedAt, i) => {
      const id = insertMember(db, {
        id: `amr-purged-${i}`, slug: `amr_purged_${i}`, deleted_at: purgedAt, personal_data_purged_at: purgedAt,
      });
      insertMembershipDisciplineDecision(db, { member_id: id });
      return id;
    }));

    const { JOBS } = await import('../../src/services/jobRegistry');
    const job = JOBS.find((j) => j.name === 'SYS_Apply_Membership_Discipline')!;
    // On the suspension's end date itself: the member is restored that day.
    const now = new Date(Date.parse(isoDaysFromNow(5)));
    await job.run({ now, reapExpiredMediaJobs: async () => ({ reclaimedIds: [] }) });

    expect(memberRow(suspended.id).restricted_at).toBeNull();
    expect(audits(suspended.id, 'auth.account_restriction_lifted')).toMatchObject([{ actor_type: 'system' }]);
    expect(mailTemplates(suspended.id)).toContain('account_restriction_lifted');
    expect(memberRow(adminRestricted.id).restricted_at).not.toBeNull();
    expect(decisionCount(oldPurged)).toBe(0);
    expect(decisionCount(recentPurged)).toBe(1);
    expect(decisionCount(suspended.id)).toBe(1);
    const runs = withDb((db) => (db.prepare(
      "SELECT COUNT(*) AS n FROM system_job_runs WHERE job_name = 'SYS_Apply_Membership_Discipline'",
    ).get() as { n: number }).n);
    expect(runs).toBe(1);
  });
});

/**
 * Admin honor-tier grant surface: an admin grants a HoF or BAP honoree their
 * Tier 2 membership when a claim-time grant did not fire. Covers both honors,
 * the two-step confirmation, current-tier display, the duplicate-grant guard
 * (same member + same honor blocked; HoF and BAP independent; concurrent
 * double-submit), the audit/ledger/email side effects, unknown-member and
 * invalid-honor handling, admin authorization, and the Origin-pin (CSRF) gate.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import rawRequest from 'supertest';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createMemberAtTier, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3143');

const ADMIN_ID = 'hg_admin_001';
const NONADMIN_ID = 'hg_member_001';
const NONADMIN_SLUG = 'hg_member_one';

// One target member per grant assertion: the tier ledger and audit trail are
// append-only, so a member that has received a grant cannot be reset.
const HOF_T0 = 'hg_hof_t0';
const BAP_T2 = 'hg_bap_t2';
const BOTH_T0 = 'hg_both_t0';
const DUP_T0 = 'hg_dup_t0';
const CONC_T0 = 'hg_conc_t0';
const T3_MEMBER = 'hg_t3';
const PREVIEW_T2 = 'hg_preview_t2';
const PREVIEW_DUP = 'hg_preview_dup';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: NONADMIN_ID })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'hg_admin_one', display_name: 'Ada Admin', real_name: 'Ada Admin', login_email: 'hg-admin@example.com', is_admin: 1 });
  insertMember(db, { id: NONADMIN_ID, slug: NONADMIN_SLUG, display_name: 'Mo Member', real_name: 'Mo Member', login_email: 'hg-member@example.com' });
  const t0 = (id: string, name: string) => insertMember(db, { id, slug: id, display_name: name, real_name: name, login_email: `${id}@example.com` });
  t0(HOF_T0, 'Hattie Fame');
  t0(BOTH_T0, 'Bea Oth');
  t0(DUP_T0, 'Dana Up');
  t0(CONC_T0, 'Connie Current');
  t0(PREVIEW_DUP, 'Pree View');
  createMemberAtTier(db, { id: BAP_T2, slug: BAP_T2, tier: 'tier2', memberOverrides: { display_name: 'Bap Two', real_name: 'Bap Two', login_email: 'hg-bap-t2@example.com' } });
  createMemberAtTier(db, { id: PREVIEW_T2, slug: PREVIEW_T2, tier: 'tier2', memberOverrides: { display_name: 'Percy Two', real_name: 'Percy Two', login_email: 'hg-preview-t2@example.com' } });
  createMemberAtTier(db, { id: T3_MEMBER, slug: T3_MEMBER, tier: 'tier3', underlying_tier_status: 'tier1', memberOverrides: { display_name: 'Trey Three', real_name: 'Trey Three', login_email: 'hg-t3@example.com' } });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Outbox is not append-only, so clear it for exact per-member email counts.
beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare(`DELETE FROM outbox_emails`).run();
  db.close();
});

function readTier(memberId: string): string {
  const db = new BetterSqlite3(dbPath);
  const row = db.prepare(`SELECT tier_status FROM member_tier_current WHERE member_id = ?`).get(memberId) as { tier_status: string } | undefined;
  db.close();
  return row?.tier_status ?? 'tier0';
}
function countAudit(actionType: string, entityId: string): number {
  const db = new BetterSqlite3(dbPath);
  const row = db.prepare(`SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = ? AND entity_id = ?`).get(actionType, entityId) as { c: number };
  db.close();
  return row.c;
}
function countHonorLedger(memberId: string, reasonCode: string): number {
  const db = new BetterSqlite3(dbPath);
  const row = db.prepare(`SELECT COUNT(*) AS c FROM member_tier_grants WHERE member_id = ? AND reason_code = ?`).get(memberId, reasonCode) as { c: number };
  db.close();
  return row.c;
}
function countOutboxFor(memberId: string): number {
  const db = new BetterSqlite3(dbPath);
  const row = db.prepare(`SELECT COUNT(*) AS c FROM outbox_emails WHERE recipient_member_id = ?`).get(memberId) as { c: number };
  db.close();
  return row.c;
}
function grant(cookie: string, member_key: string, honor: string) {
  return request(createApp()).post('/admin/honor-grants/grant/confirm').set('Cookie', cookie).type('form').send({ member_key, honor });
}

describe('GET /admin/honor-grants', () => {
  it('unauthenticated → 302 to /login', async () => {
    const res = await request(createApp()).get('/admin/honor-grants');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });
  it('non-admin → 403', async () => {
    const res = await request(createApp()).get('/admin/honor-grants').set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });
  it('admin → 200 with the grant form', async () => {
    const res = await request(createApp()).get('/admin/honor-grants').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Grant an honor tier');
    expect(res.text).toContain('/admin/honor-grants/grant');
  });
});

describe('POST /admin/honor-grants/grant (preview)', () => {
  it('names the member and current tier and writes nothing', async () => {
    const res = await request(createApp()).post('/admin/honor-grants/grant').set('Cookie', adminCookie()).type('form').send({ member_key: PREVIEW_T2, honor: 'hof' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Percy Two');
    expect(res.text).toContain('Tier 2');
    expect(res.text).toContain('/admin/honor-grants/grant/confirm');
    expect(countAudit('tier.hof_grant', PREVIEW_T2)).toBe(0);
  });
  it('an already-granted honor shows already-held with no confirm action', async () => {
    expect((await grant(adminCookie(), PREVIEW_DUP, 'hof')).status).toBe(303);
    const res = await request(createApp()).post('/admin/honor-grants/grant').set('Cookie', adminCookie()).type('form').send({ member_key: PREVIEW_DUP, honor: 'hof' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('already holds');
    expect(res.text).not.toContain('/admin/honor-grants/grant/confirm');
  });
  it('unknown member → 422', async () => {
    const res = await request(createApp()).post('/admin/honor-grants/grant').set('Cookie', adminCookie()).type('form').send({ member_key: 'no_such_member', honor: 'hof' });
    expect(res.status).toBe(422);
  });
  it('invalid honor → 422', async () => {
    const res = await request(createApp()).post('/admin/honor-grants/grant').set('Cookie', adminCookie()).type('form').send({ member_key: PREVIEW_T2, honor: 'nonsense' });
    expect(res.status).toBe(422);
  });
  it('non-admin → 403', async () => {
    const res = await request(createApp()).post('/admin/honor-grants/grant').set('Cookie', memberCookie()).type('form').send({ member_key: PREVIEW_T2, honor: 'hof' });
    expect(res.status).toBe(403);
  });
});

describe('POST /admin/honor-grants/grant/confirm (commit)', () => {
  it('HoF grant: 303, member reaches Tier 2, audited, emailed', async () => {
    const res = await grant(adminCookie(), HOF_T0, 'hof');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/honor-grants');
    expect(readTier(HOF_T0)).toBe('tier2');
    expect(countAudit('tier.hof_grant', HOF_T0)).toBe(1);
    expect(countOutboxFor(HOF_T0)).toBe(1);
  });
  it('BAP grant on a member already Tier 2 for another reason still records the honor', async () => {
    expect(readTier(BAP_T2)).toBe('tier2');
    const res = await grant(adminCookie(), BAP_T2, 'bap');
    expect(res.status).toBe(303);
    expect(readTier(BAP_T2)).toBe('tier2');
    expect(countAudit('tier.bap_grant', BAP_T2)).toBe(1);
  });
  it('a member may hold both HoF and BAP independently', async () => {
    expect((await grant(adminCookie(), BOTH_T0, 'hof')).status).toBe(303);
    expect((await grant(adminCookie(), BOTH_T0, 'bap')).status).toBe(303);
    expect(countHonorLedger(BOTH_T0, 'honor.hof_tier2_grant')).toBe(1);
    expect(countHonorLedger(BOTH_T0, 'honor.bap_tier2_grant')).toBe(1);
  });
  it('a Tier 3 member keeps Tier 3 and records the honor', async () => {
    const res = await grant(adminCookie(), T3_MEMBER, 'bap');
    expect(res.status).toBe(303);
    expect(readTier(T3_MEMBER)).toBe('tier3');
    expect(countAudit('tier.bap_grant', T3_MEMBER)).toBe(1);
  });
  it('duplicate same-honor grant → 409, no second ledger row, audit row, or email', async () => {
    expect((await grant(adminCookie(), DUP_T0, 'hof')).status).toBe(303);
    const dup = await grant(adminCookie(), DUP_T0, 'hof');
    expect(dup.status).toBe(409);
    expect(countHonorLedger(DUP_T0, 'honor.hof_tier2_grant')).toBe(1);
    expect(countAudit('tier.hof_grant', DUP_T0)).toBe(1);
    expect(countOutboxFor(DUP_T0)).toBe(1);   // only the first grant's email; the duplicate sent none
  });
  it('concurrent double-submit grants exactly once', async () => {
    const [a, b] = await Promise.all([grant(adminCookie(), CONC_T0, 'hof'), grant(adminCookie(), CONC_T0, 'hof')]);
    expect([a.status, b.status].sort()).toEqual([303, 409]);
    expect(countHonorLedger(CONC_T0, 'honor.hof_tier2_grant')).toBe(1);
    expect(countAudit('tier.hof_grant', CONC_T0)).toBe(1);
    expect(countOutboxFor(CONC_T0)).toBe(1);
  });
  it('invalid honor at confirm → 422', async () => {
    const res = await grant(adminCookie(), PREVIEW_T2, 'nonsense');
    expect(res.status).toBe(422);
  });
  it('unknown member at confirm → 422', async () => {
    const res = await grant(adminCookie(), 'no_such_member', 'hof');
    expect(res.status).toBe(422);
  });
  it('non-admin actor → 403, no grant', async () => {
    const res = await grant(memberCookie(), PREVIEW_T2, 'hof');
    expect(res.status).toBe(403);
  });
});

describe('CSRF / Origin-pin gate', () => {
  it('grant POST with a mismatched Origin → 403 (before auth)', async () => {
    const res = await rawRequest(createApp()).post('/admin/honor-grants/grant').set('Cookie', adminCookie()).set('Origin', 'http://evil.example').type('form').send({ member_key: HOF_T0, honor: 'hof' });
    expect(res.status).toBe(403);
  });
  it('confirm POST with a mismatched Origin → 403 (before auth)', async () => {
    const res = await rawRequest(createApp()).post('/admin/honor-grants/grant/confirm').set('Cookie', adminCookie()).set('Origin', 'http://evil.example').type('form').send({ member_key: HOF_T0, honor: 'hof' });
    expect(res.status).toBe(403);
  });
});

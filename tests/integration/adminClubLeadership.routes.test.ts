/**
 * Admin club-leadership remediation contract: the queue lists Needs Leader
 * and Needs Contact clubs computed fresh; assigning a leader from the
 * member base creates the missing affiliation, supersedes provisional
 * bootstrap rows, and audit-logs with reason; promoting a second leader
 * demotes the incumbent in the same transaction; a member already leader
 * at another club is refused; exceeding the five-row cap demands an
 * explicit cap-override reason; demotion requires a mandatory reason and
 * can strip the affiliation; contact remediation updates the email with
 * audit before/after. Non-admins never reach any of it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertClub, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3081');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: 'acl-admin', slug: 'acl_admin', login_email: 'acl-admin@example.com', is_admin: 1 });
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

const adminCookie = () => `footbag_session=${createTestSessionJwt({ memberId: 'acl-admin', role: 'admin' })}`;

let _n = 0;
function seedClub(opts: { contactEmail?: string | null } = {}): string {
  _n += 1;
  const clubId = `acl-club-${_n}`;
  insertClub(db, { id: clubId, name: `ACL Club ${_n}`, contact_email: opts.contactEmail ?? null });
  return clubId;
}
function seedMember(): string {
  _n += 1;
  const id = `acl-mem-${_n}`;
  insertMember(db, { id, slug: `acl_mem_${_n}`, login_email: `${id}@example.com`, display_name: `ACL Member ${_n}` });
  return id;
}
function leaders(clubId: string): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM club_leaders WHERE club_id = ? ORDER BY role').all(clubId) as Array<Record<string, unknown>>;
}

describe('access', () => {
  it('non-admins never reach the surface', async () => {
    const member = seedMember();
    const res = await request(createApp())
      .get('/admin/clubs/leadership')
      .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId: member })}`);
    expect([403, 404]).toContain(res.status);
  });
});

describe('queue', () => {
  it('lists Needs Leader and Needs Contact clubs', async () => {
    const leaderless = seedClub({ contactEmail: 'has@contact.example.com' });
    const contactless = seedClub({ contactEmail: null });
    void leaderless;

    const res = await request(createApp()).get('/admin/clubs/leadership').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Needs Leader');
    expect(res.text).toContain(`ACL Club ${_n - 1}`);
    expect(res.text).toContain(`ACL Club ${_n}`);
    void contactless;
  });
});

describe('assign', () => {
  it('assigns from the member base, creates the affiliation, supersedes bootstrap rows, audits with reason', async () => {
    const clubId = seedClub();
    const memberId = seedMember();
    // A provisional bootstrap candidate that must be superseded.
    db.prepare(`
      INSERT INTO club_bootstrap_leaders
        (id, created_at, created_by, updated_at, updated_by, club_id, legacy_member_id, role, status, confidence_score)
      VALUES (?, '2026-01-01T00:00:00.000Z', 'test', '2026-01-01T00:00:00.000Z', 'test', ?, 'LM-acl', 'leader', 'provisional', 0.8)
    `).run(`acl-cbl-${_n}`, clubId);

    const res = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: memberId, role: 'leader', reason: 'Leadership gap remediation.' });
    expect(res.status).toBe(303);

    const rows = leaders(clubId);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('leader');

    const aff = db.prepare(
      'SELECT * FROM member_club_affiliations WHERE member_id = ? AND club_id = ? AND is_current = 1',
    ).get(memberId, clubId) as Record<string, unknown>;
    expect(aff).toBeDefined();
    expect(aff.source).toBe('admin');

    const cbl = db.prepare('SELECT status FROM club_bootstrap_leaders WHERE club_id = ?').get(clubId) as { status: string };
    expect(cbl.status).toBe('superseded');

    const audit = db.prepare(
      `SELECT reason_text FROM audit_entries WHERE action_type = 'club.admin_leader_assigned' AND entity_id = ?`,
    ).get(clubId) as { reason_text: string };
    expect(audit.reason_text).toBe('Leadership gap remediation.');
  });

  it('promoting a second leader demotes the incumbent in one transaction', async () => {
    const clubId = seedClub();
    const first = seedMember();
    const second = seedMember();
    for (const [m, role] of [[first, 'leader'], [second, 'co-leader']] as const) {
      await request(createApp())
        .post(`/admin/clubs/${clubId}/leadership/assign`)
        .set('Cookie', adminCookie())
        .type('form')
        .send({ member_key: m, role, reason: 'setup' });
    }

    const res = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: second, role: 'leader', reason: 'Succession.' });
    expect(res.status).toBe(303);

    const rows = leaders(clubId);
    const byMember = Object.fromEntries(rows.map((r) => [r.member_id, r.role]));
    expect(byMember[second]).toBe('leader');
    expect(byMember[first]).toBe('co-leader');
  });

  it('refuses promoting a member who is leader of another club, with direction', async () => {
    const clubA = seedClub();
    const clubB = seedClub();
    const m = seedMember();
    await request(createApp())
      .post(`/admin/clubs/${clubA}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: m, role: 'leader', reason: 'setup' });

    const res = await request(createApp())
      .post(`/admin/clubs/${clubB}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: m, role: 'leader', reason: 'second club' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Demote them there');
    expect(leaders(clubB)).toHaveLength(0);
  });

  it('the five-row cap demands an explicit cap-override reason', async () => {
    const clubId = seedClub();
    for (let i = 0; i < 5; i++) {
      const m = seedMember();
      await request(createApp())
        .post(`/admin/clubs/${clubId}/leadership/assign`)
        .set('Cookie', adminCookie())
        .type('form')
        .send({ member_key: m, role: 'co-leader', reason: 'setup' });
    }
    const sixth = seedMember();

    const refused = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: sixth, role: 'co-leader', reason: 'growth' });
    expect(refused.status).toBe(422);
    expect(refused.text).toContain('cap-override');

    const allowed = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: sixth, role: 'co-leader', reason: 'growth', cap_override_reason: 'Large active club; board approved.' });
    expect(allowed.status).toBe(303);
    expect(leaders(clubId)).toHaveLength(6);

    const audit = db.prepare(
      `SELECT metadata_json FROM audit_entries WHERE action_type = 'club.admin_leader_assigned' AND entity_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    ).get(clubId) as { metadata_json: string };
    expect(JSON.parse(audit.metadata_json).cap_override_reason).toBe('Large active club; board approved.');
  });
});

describe('demote and contact', () => {
  it('demotion requires a reason; remove_affiliation strips the roster row too', async () => {
    const clubId = seedClub();
    const m = seedMember();
    await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: m, role: 'leader', reason: 'setup' });

    const noReason = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/demote`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_id: m, mode: 'remove_affiliation', reason: '  ' });
    expect(noReason.status).toBe(422);

    const res = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/demote`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_id: m, mode: 'remove_affiliation', reason: 'Unreachable for a year.' });
    expect(res.status).toBe(303);
    expect(leaders(clubId)).toHaveLength(0);
    const aff = db.prepare(
      'SELECT is_current FROM member_club_affiliations WHERE member_id = ? AND club_id = ?',
    ).get(m, clubId) as { is_current: number };
    expect(aff.is_current).toBe(0);
  });

  it('contact remediation updates the email with before/after audit', async () => {
    const clubId = seedClub({ contactEmail: null });
    const res = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/contact`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ contact_email: 'fixed@club.example.com', reason: 'Leader supplied a working address.' });
    expect(res.status).toBe(303);

    const club = db.prepare('SELECT contact_email FROM clubs WHERE id = ?').get(clubId) as { contact_email: string };
    expect(club.contact_email).toBe('fixed@club.example.com');

    const audit = db.prepare(
      `SELECT metadata_json FROM audit_entries WHERE action_type = 'club.admin_contact_updated' AND entity_id = ?`,
    ).get(clubId) as { metadata_json: string };
    const meta = JSON.parse(audit.metadata_json) as Record<string, unknown>;
    expect(meta.before).toBeNull();
    expect(meta.after).toBe('fixed@club.example.com');
  });

  it('contact remediation rejects addresses without a local part, domain, or TLD', async () => {
    // A bare '@' or a half-formed address would persist and break the club
    // contact flows downstream; the form re-renders with a 422 instead.
    const clubId = seedClub({ contactEmail: null });
    for (const bad of ['@', 'user@', '@domain.com', 'user@domain', 'user domain@x.com']) {
      const res = await request(createApp())
        .post(`/admin/clubs/${clubId}/leadership/contact`)
        .set('Cookie', adminCookie())
        .type('form')
        .send({ contact_email: bad, reason: 'Attempted fix.' });
      expect(res.status).toBe(422);
    }
    const club = db.prepare('SELECT contact_email FROM clubs WHERE id = ?').get(clubId) as { contact_email: string | null };
    expect(club.contact_email).toBeNull();
  });
});

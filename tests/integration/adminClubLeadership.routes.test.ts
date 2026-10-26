/**
 * Admin club-leadership contract on the per-club leadership page: assigning a
 * co-leader from the member base creates the missing affiliation, supersedes
 * provisional bootstrap rows, and audit-logs with reason; a member who already
 * co-leads another club is refused with direction; five co-leaders is a hard
 * limit; a member already holding two other clubs is refused a third; an
 * archived club takes no co-leader, while an inactive one is revived; removal
 * requires a mandatory reason, can strip the affiliation, and picks a main club
 * only for a lone survivor. The list of clubs needing a leader lives in the club
 * cleanup queue, not here. Non-admins never reach any of it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertClub, createTestSessionJwt, insertClubBootstrapLeader, insertMemberClubAffiliation,
  insertClubLeader,
} from '../fixtures/factories';
import { flashCookieOf } from '../fixtures/flashCookie';

const { dbPath } = setTestEnv('3081');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;
// Imported after setTestEnv, like the app itself: a static import would open the
// database module against the developer's own path before the test path is set.
let leadershipService: typeof import('../../src/services/adminClubLeadershipService').adminClubLeadershipService;
let ServiceUnavailableError: typeof import('../../src/services/serviceErrors').ServiceUnavailableError;

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: 'acl-admin', slug: 'acl_admin', login_email: 'acl-admin@example.com', is_admin: 1 });
  insertMember(db, { id: 'acl-admin2', slug: 'acl_admin2', login_email: 'acl-admin2@example.com', is_admin: 1 });
  createApp = await importApp();
  ({ adminClubLeadershipService: leadershipService } = await import(
    '../../src/services/adminClubLeadershipService'
  ));
  ({ ServiceUnavailableError } = await import('../../src/services/serviceErrors'));
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

const adminCookie = () => `__Host-footbag_session=${createTestSessionJwt({ memberId: 'acl-admin', role: 'admin' })}`;
const admin2Cookie = () => `__Host-footbag_session=${createTestSessionJwt({ memberId: 'acl-admin2', role: 'admin' })}`;

/** Follow a post-redirect-get the way a browser does, carrying the flash back. */
async function landedOn(res: { headers: Record<string, string>; get(h: string): string[] | string | undefined }, cookie: string) {
  return request(createApp())
    .get(res.headers.location)
    .set('Cookie', [cookie, flashCookieOf(res)].filter(Boolean).join('; '));
}

function assignAuditCount(clubId: string): number {
  return (db.prepare(
    "SELECT COUNT(*) AS c FROM audit_entries WHERE entity_id = ? AND action_type = 'club.admin_leader_assigned'",
  ).get(clubId) as { c: number }).c;
}

describe('reporting the outcome', () => {
  it('an assign says the co-leader was added, and a second assign by the same admin says it again without writing', async () => {
    // Defect caught: the admin lands back on the page with no word that the
    // assign happened, or a double submit is drawn as a red refusal.
    const clubId = seedClub();
    const m = seedMember();
    const first = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie()).type('form')
      .send({ member_key: m, reason: 'Leadership gap remediation.' });
    expect(first.status).toBe(303);
    const shown = await landedOn(first, adminCookie());
    expect(shown.status).toBe(200);
    expect(shown.text).toContain('<div class="form-success-banner" role="status">Co-leader added.</div>');

    const again = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie()).type('form')
      .send({ member_key: m, reason: 'Leadership gap remediation.' });
    expect(again.status).toBe(303);
    const shownAgain = await landedOn(again, adminCookie());
    expect(shownAgain.text).toContain('<div class="form-success-banner" role="status">Co-leader added.</div>');
    expect(leaders(clubId)).toHaveLength(1);
    expect(assignAuditCount(clubId)).toBe(1);
  });

  it('a member another admin already made co-leader reads as informational, and nothing is written', async () => {
    // Defect caught: another admin's earlier act painted as this admin's
    // refusal, or claimed as this admin's own success.
    const clubId = seedClub();
    const m = seedMember();
    await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie()).type('form')
      .send({ member_key: m, reason: 'Leadership gap remediation.' });
    const res = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', admin2Cookie()).type('form')
      .send({ member_key: m, reason: 'Also noticed the gap.' });
    expect(res.status).toBe(303);
    const shown = await landedOn(res, admin2Cookie());
    expect(shown.text).toContain('<p class="form-notice" role="status">That member already co-leads this club.</p>');
    expect(shown.text).not.toContain('Co-leader added.');
    expect(assignAuditCount(clubId)).toBe(1);
  });

  it('a demote says which of the two things it did', async () => {
    // Defect caught: the two demote modes report the same sentence, so an
    // admin cannot tell from the page whether the member left the club.
    for (const [mode, sentence] of [
      ['to_member', 'Leader stepped down to member.'],
      ['remove_affiliation', 'Leader removed from the club.'],
    ] as const) {
      const clubId = seedClub();
      const m = seedMember();
      await request(createApp())
        .post(`/admin/clubs/${clubId}/leadership/assign`)
        .set('Cookie', adminCookie()).type('form')
        .send({ member_key: m, reason: 'setup' });
      const res = await request(createApp())
        .post(`/admin/clubs/${clubId}/leadership/demote/confirm`)
        .set('Cookie', adminCookie()).type('form')
        .send({ member_id: m, mode, reason: 'Unreachable for a year.' });
      expect(res.status).toBe(303);
      const shown = await landedOn(res, adminCookie());
      expect(shown.text, mode).toContain(`<div class="form-success-banner" role="status">${sentence}</div>`);
    }
  });
});

let _n = 0;
function seedClub(status: 'active' | 'inactive' | 'archived' = 'active'): string {
  _n += 1;
  const clubId = `acl-club-${_n}`;
  insertClub(db, { id: clubId, name: `ACL Club ${_n}`, status });
  return clubId;
}
function clubStatus(clubId: string): string {
  return (db.prepare('SELECT status FROM clubs WHERE id = ?').get(clubId) as { status: string }).status;
}
function currentClubs(memberId: string): Array<{ club_id: string; is_primary: number }> {
  return db.prepare(
    'SELECT club_id, is_primary FROM member_club_affiliations WHERE member_id = ? AND is_current = 1 ORDER BY club_id',
  ).all(memberId) as Array<{ club_id: string; is_primary: number }>;
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
    const clubId = seedClub();
    const res = await request(createApp())
      .get(`/admin/clubs/${clubId}/leadership`)
      .set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId: member })}`);
    expect(res.status).toBe(403);
  });
});

describe('one list of clubs needing a leader', () => {
  // Defect caught: a second list of leaderless clubs survives beside the
  // cleanup queue, so admins work two lists that can disagree. The detail page
  // proves the admin session reaches a real club page beside it.
  it('the retired leadership list answers not found, and the club page leads back to the cleanup queue', async () => {
    const clubId = seedClub();
    const gone = await request(createApp()).get('/admin/clubs/leadership').set('Cookie', adminCookie());
    expect(gone.status).toBe(404);

    const detail = await request(createApp()).get(`/admin/clubs/${clubId}/leadership`).set('Cookie', adminCookie());
    expect(detail.status).toBe(200);
    expect(detail.text).toContain('href="/admin/club-cleanup"');
    expect(detail.text).not.toContain('href="/admin/clubs/leadership"');
  });
});

describe('assign', () => {
  // The error page is the club's own detail page, so rendering it means loading
  // the club again. When the club is the thing that does not exist that load
  // throws a second time from inside the handler's catch, where nothing catches
  // it, and the visitor gets a server error where the same id answers 404 on a
  // GET.
  it('answers not-found for an unknown club id rather than a server error', async () => {
    const memberId = seedMember();
    const res = await request(createApp())
      .post('/admin/clubs/club-that-does-not-exist/leadership/assign')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: memberId, reason: 'Leadership gap remediation.' });
    expect(res.status).toBe(404);
  });

  it('assigns from the member base, creates the affiliation, supersedes bootstrap rows, audits with reason', async () => {
    const clubId = seedClub();
    const memberId = seedMember();
    // A provisional bootstrap candidate that must be superseded.
    insertClubBootstrapLeader(db, {
      id: `acl-cbl-${_n}`,
      club_id: clubId,
      legacy_member_id: 'LM-acl',
      role: 'leader',
      status: 'provisional',
      confidence_score: 0.8,
    });

    const res = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: memberId, reason: 'Leadership gap remediation.' });
    expect(res.status).toBe(303);

    const rows = leaders(clubId);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('co-leader');

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

  it('assigning a second co-leader adds them as an equal co-leader (no demote)', async () => {
    const clubId = seedClub();
    const first = seedMember();
    const second = seedMember();
    for (const m of [first, second]) {
      await request(createApp())
        .post(`/admin/clubs/${clubId}/leadership/assign`)
        .set('Cookie', adminCookie())
        .type('form')
        .send({ member_key: m, reason: 'setup' });
    }

    const rows = leaders(clubId);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.role === 'co-leader')).toBe(true);
  });

  it('refuses assigning a member who already co-leads another club, with direction', async () => {
    const clubA = seedClub();
    const clubB = seedClub();
    const m = seedMember();
    await request(createApp())
      .post(`/admin/clubs/${clubA}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: m, reason: 'setup' });

    const res = await request(createApp())
      .post(`/admin/clubs/${clubB}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: m, reason: 'second club' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('step down at their club first');
    expect(leaders(clubB)).toHaveLength(0);
  });

  // Defect caught: an admin gives a club a sixth co-leader, by an override
  // field or by any submitted reason, past the hard limit of five.
  it('refuses a sixth co-leader at five, whatever the form carries, and offers no override field', async () => {
    const clubId = seedClub();
    for (let i = 0; i < 4; i++) {
      const m = seedMember();
      const res = await request(createApp())
        .post(`/admin/clubs/${clubId}/leadership/assign`)
        .set('Cookie', adminCookie())
        .type('form')
        .send({ member_key: m, reason: 'setup' });
      expect(res.status).toBe(303);
    }
    // The fifth lands: the limit is five, not four.
    const fifth = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: seedMember(), reason: 'setup' });
    expect(fifth.status).toBe(303);
    expect(leaders(clubId)).toHaveLength(5);

    const refused = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: seedMember(), reason: 'growth', cap_override_reason: 'Large active club; board approved.' });
    expect(refused.status).toBe(422);
    expect(refused.text).toContain('This club already has 5 co-leaders, the most a club can have.');
    expect(refused.text).not.toContain('cap_override_reason');
    expect(leaders(clubId)).toHaveLength(5);
    expect(assignAuditCount(clubId)).toBe(5);
  });

  // Defect caught: a co-leader who has died still counts toward five, so a
  // club whose leader died can never be given a replacement at the limit; or
  // the leadership page reads 6/5 beside a limit that counts five.
  it('does not count a deceased co-leader toward five, on the limit or on the page', async () => {
    const clubId = seedClub();
    const gone = 'acl-mem-deceased';
    insertMember(db, { id: gone, slug: 'acl_mem_deceased', login_email: `${gone}@example.com`, is_deceased: 1 });
    insertClubLeader(db, { club_id: clubId, member_id: gone });
    for (let i = 0; i < 5; i++) {
      const res = await request(createApp())
        .post(`/admin/clubs/${clubId}/leadership/assign`)
        .set('Cookie', adminCookie())
        .type('form')
        .send({ member_key: seedMember(), reason: 'setup' });
      expect(res.status).toBe(303);
    }
    expect(leaders(clubId)).toHaveLength(6);

    const page = await request(createApp())
      .get(`/admin/clubs/${clubId}/leadership`)
      .set('Cookie', adminCookie());
    expect(page.status).toBe(200);
    expect(page.text).toContain('Current Leadership (5/5)');

    const refused = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: seedMember(), reason: 'setup' });
    expect(refused.status).toBe(422);
    expect(leaders(clubId)).toHaveLength(6);
  });

  // Defect caught: admin assignment puts a member already in two clubs on a
  // third club's roster, past the two-club limit every member path holds.
  it('refuses a member who already holds two other current clubs, and accepts one who holds one', async () => {
    const clubId = seedClub();
    const full = seedMember();
    insertMemberClubAffiliation(db, full, seedClub(), { is_primary: 1 });
    insertMemberClubAffiliation(db, full, seedClub(), { is_primary: 0 });

    const refused = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: full, reason: 'Leadership gap remediation.' });
    expect(refused.status).toBe(422);
    expect(refused.text).toContain('That member already belongs to two clubs');
    expect(leaders(clubId)).toHaveLength(0);
    expect(currentClubs(full)).toHaveLength(2);

    const one = seedMember();
    insertMemberClubAffiliation(db, one, seedClub(), { is_primary: 1 });
    const accepted = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: one, reason: 'Leadership gap remediation.' });
    expect(accepted.status).toBe(303);
    expect(currentClubs(one)).toHaveLength(2);
  });

  // Defect caught: the two-club refusal also catches a member whose second
  // club is this one, so an admin cannot make a current member its leader.
  it('a member holding two clubs, one of them this club, can be made its co-leader', async () => {
    const clubId = seedClub();
    const m = seedMember();
    insertMemberClubAffiliation(db, m, seedClub(), { is_primary: 1 });
    insertMemberClubAffiliation(db, m, clubId, { is_primary: 0 });
    const res = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: m, reason: 'Leadership gap remediation.' });
    expect(res.status).toBe(303);
    expect(leaders(clubId)).toHaveLength(1);
  });

  // Defect caught: staffing an archived club brings it back to active,
  // although archiving is final.
  it('refuses an archived club and leaves it archived, while an inactive club is revived', async () => {
    const archived = seedClub('archived');
    const refused = await request(createApp())
      .post(`/admin/clubs/${archived}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: seedMember(), reason: 'Someone asked for it back.' });
    expect(refused.status).toBe(422);
    expect(refused.text).toContain('This club is archived, which is final');
    expect(clubStatus(archived)).toBe('archived');
    expect(leaders(archived)).toHaveLength(0);

    const inactive = seedClub('inactive');
    const revived = await request(createApp())
      .post(`/admin/clubs/${inactive}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: seedMember(), reason: 'Back in action.' });
    expect(revived.status).toBe(303);
    expect(clubStatus(inactive)).toBe('active');
  });
});

describe('the reasons are cleaned before they are checked', () => {
  function assign(clubId: string, form: Record<string, string>) {
    return request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(form);
  }

  // Defect caught: a reason that is only markup passes the required check, so
  // a co-leader is assigned with nothing reviewable in the ledger; or a real
  // reason is recorded with its markup and control characters.
  it('refuses a markup-only reason, then records a real one cleaned', async () => {
    const clubId = seedClub();
    const memberId = seedMember();

    const refused = await assign(clubId, { member_key: memberId, reason: '<b></b>' });
    expect(refused.status).toBe(422);
    expect(leaders(clubId)).toHaveLength(0);

    const done = await assign(clubId, { member_key: memberId, reason: 'Gap <b>remediation</b>\u0085 now' });
    expect(done.status).toBe(303);
    const audit = db.prepare(
      `SELECT reason_text FROM audit_entries WHERE action_type = 'club.admin_leader_assigned' AND entity_id = ?`,
    ).all(clubId) as Array<{ reason_text: string }>;
    expect(audit).toEqual([{ reason_text: 'Gap remediation now' }]);
  });
});

describe('demote', () => {
  it('removal requires a reason; remove_affiliation strips the roster row too', async () => {
    const clubId = seedClub();
    const m = seedMember();
    await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: m, reason: 'setup' });

    const noReason = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/demote`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_id: m, mode: 'remove_affiliation', reason: '  ' });
    expect(noReason.status).toBe(422);

    // Removing the affiliation ends their membership of the club, so it is
    // shown before it is done, like every other admin write on a person.
    const preview = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/demote`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_id: m, mode: 'remove_affiliation', reason: 'Unreachable for a year.' });
    expect(preview.status).toBe(200);
    expect(preview.text).toContain('stop being a member of this club');
    expect(leaders(clubId)).toHaveLength(1);

    const res = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/demote/confirm`)
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

  // Defect caught: removal picks a main club automatically for a member left
  // with two, a choice that is the member's own; or leaves a lone survivor
  // designated secondary with no main club at all.
  it('removal makes a lone surviving club main, and with two left makes neither main', async () => {
    const lone = seedMember();
    const loneLed = seedClub();
    const loneOther = seedClub();
    insertMemberClubAffiliation(db, lone, loneLed, { is_primary: 1 });
    insertMemberClubAffiliation(db, lone, loneOther, { is_primary: 0 });
    await request(createApp())
      .post(`/admin/clubs/${loneLed}/leadership/assign`)
      .set('Cookie', adminCookie()).type('form')
      .send({ member_key: lone, reason: 'setup' });
    const loneRes = await request(createApp())
      .post(`/admin/clubs/${loneLed}/leadership/demote/confirm`)
      .set('Cookie', adminCookie()).type('form')
      .send({ member_id: lone, mode: 'remove_affiliation', reason: 'Unreachable for a year.' });
    expect(loneRes.status).toBe(303);
    expect(currentClubs(lone)).toEqual([{ club_id: loneOther, is_primary: 1 }]);

    // Seeded past the two-club limit, the only way two can survive a removal.
    const many = seedMember();
    const led = seedClub();
    const a = seedClub();
    const b = seedClub();
    insertMemberClubAffiliation(db, many, led, { is_primary: 1 });
    insertMemberClubAffiliation(db, many, a, { is_primary: 0 });
    insertMemberClubAffiliation(db, many, b, { is_primary: 0 });
    await request(createApp())
      .post(`/admin/clubs/${led}/leadership/assign`)
      .set('Cookie', adminCookie()).type('form')
      .send({ member_key: many, reason: 'setup' });
    expect(leaders(led)).toHaveLength(1);
    const res = await request(createApp())
      .post(`/admin/clubs/${led}/leadership/demote/confirm`)
      .set('Cookie', adminCookie()).type('form')
      .send({ member_id: many, mode: 'remove_affiliation', reason: 'Unreachable for a year.' });
    expect(res.status).toBe(303);
    expect(currentClubs(many).map((r) => r.is_primary)).toEqual([0, 0]);
  });

  it('an unrecognized demote mode is rejected (422), leaving the leadership intact', async () => {
    const clubId = seedClub();
    const m = seedMember();
    await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/assign`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_key: m, reason: 'setup' });

    const res = await request(createApp())
      .post(`/admin/clubs/${clubId}/leadership/demote`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ member_id: m, mode: 'banish', reason: 'tampered mode' });
    expect(res.status).toBe(422);
    // The bogus mode neither removed the roster row nor the affiliation.
    expect(leaders(clubId)).toHaveLength(1);
  });
});

// Rebuilding the detail page to carry an inline error can itself fail. Only a
// club that is genuinely gone has no page to answer on; a database too busy to
// serve the reload is a temporary condition, and reporting it as a club that
// does not exist would send an admin looking for a deletion that never happened.
describe('a failed page reload keeps its own answer', () => {
  it('answers temporarily-unavailable when the reload finds the database busy', async () => {
    const clubId = seedClub();
    const spy = vi.spyOn(leadershipService, 'getClubLeadershipPage').mockImplementation(() => {
      throw new ServiceUnavailableError('database is busy');
    });
    try {
      const res = await request(createApp())
        .post(`/admin/clubs/${clubId}/leadership/assign`)
        .set('Cookie', adminCookie())
        .type('form')
        .send({ member_key: '', reason: '' });
      expect(res.status).toBe(503);
    } finally {
      spy.mockRestore();
    }
  });
});

/**
 * Club status completions: sole-co-leader leave warning, deliberate
 * reactivation, and the active-only public directory.
 *
 *   - A member who is the club's only co-leader is warned before leaving and
 *     must confirm; with two co-leaders, or as a plain member, leaving goes
 *     straight through. Leaving leaderless is allowed, never blocked.
 *   - A co-leader can reactivate an inactive club at any time, audit-logged;
 *     reactivating an already-active club is a no-op.
 *   - Inactive clubs drop out of the public directory but stay reachable by
 *     direct link, where the detail page shows an inactive warning.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertClub,
  insertTag,
  insertClubLeader,
  insertMemberClubAffiliation,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3992');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let clubSvc: typeof import('../../src/services/clubService').clubService;

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
  clubSvc = (await import('../../src/services/clubService')).clubService;
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

let _n = 0;
function seedMember(): string {
  _n += 1;
  const id = `clr-mem-${_n}`;
  insertMember(db, { id, slug: `clr_mem_${_n}`, login_email: `${id}@example.com` });
  completeOnboarding(db, id);
  return id;
}
function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}
function clubStatus(clubId: string): string {
  return (db.prepare('SELECT status FROM clubs WHERE id = ?').get(clubId) as { status: string }).status;
}
function affiliationIsCurrent(memberId: string, clubId: string): number {
  const row = db.prepare(
    'SELECT is_current FROM member_club_affiliations WHERE member_id = ? AND club_id = ?',
  ).get(memberId, clubId) as { is_current: number } | undefined;
  return row?.is_current ?? -1;
}
function leaderRowCount(memberId: string, clubId: string): number {
  return (db.prepare(
    'SELECT COUNT(*) AS c FROM club_leaders WHERE member_id = ? AND club_id = ?',
  ).get(memberId, clubId) as { c: number }).c;
}
function reactivateAudits(clubId: string): Array<{ metadata_json: string }> {
  return db.prepare(
    `SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'club.reactivated'`,
  ).all(clubId) as Array<{ metadata_json: string }>;
}

describe('leaveClub: sole co-leader confirmation', () => {
  it('the only co-leader leaving unconfirmed is asked to confirm, and nothing changes yet', () => {
    const memberId = seedMember();
    const clubId = insertClub(db, { name: 'Sole Co-leader Club' });
    insertMemberClubAffiliation(db, memberId, clubId, { is_primary: 1 });
    insertClubLeader(db, { club_id: clubId, member_id: memberId });

    const result = clubSvc.leaveClub(memberId, clubId);
    expect(result.branch).toBe('needs_coleader_confirmation');
    if (result.branch === 'needs_coleader_confirmation') {
      expect(result.clubName).toBe('Sole Co-leader Club');
    }
    // Unconfirmed: still a current member and still a co-leader.
    expect(affiliationIsCurrent(memberId, clubId)).toBe(1);
    expect(leaderRowCount(memberId, clubId)).toBe(1);
  });

  it('the only co-leader leaving with confirmed=true leaves and vacates leadership', () => {
    const memberId = seedMember();
    const clubId = insertClub(db, { name: 'Confirm Club' });
    insertMemberClubAffiliation(db, memberId, clubId, { is_primary: 1 });
    insertClubLeader(db, { club_id: clubId, member_id: memberId });

    const result = clubSvc.leaveClub(memberId, clubId, { confirmed: true });
    expect(result.branch).toBe('left');
    expect(affiliationIsCurrent(memberId, clubId)).toBe(0);
    expect(leaderRowCount(memberId, clubId)).toBe(0);
  });

  it('a co-leader who is not the only one leaves without a confirmation gate', () => {
    const leaverId = seedMember();
    const otherId = seedMember();
    const clubId = insertClub(db, { name: 'Two Co-leaders Club' });
    insertMemberClubAffiliation(db, leaverId, clubId, { is_primary: 1 });
    insertClubLeader(db, { club_id: clubId, member_id: leaverId });
    insertClubLeader(db, { club_id: clubId, member_id: otherId });

    const result = clubSvc.leaveClub(leaverId, clubId);
    expect(result.branch).toBe('left');
    expect(leaderRowCount(leaverId, clubId)).toBe(0);
    expect(leaderRowCount(otherId, clubId)).toBe(1);
  });

  it('a plain member (not a co-leader) leaves without a confirmation gate', () => {
    const memberId = seedMember();
    const clubId = insertClub(db, { name: 'Plain Member Club' });
    insertMemberClubAffiliation(db, memberId, clubId, { is_primary: 1 });

    const result = clubSvc.leaveClub(memberId, clubId);
    expect(result.branch).toBe('left');
  });
});

describe('reactivateClub', () => {
  it('a co-leader reactivates an inactive club, audit-logged', () => {
    const memberId = seedMember();
    const clubId = insertClub(db, { name: 'Dormant Club', status: 'inactive' });
    insertClubLeader(db, { club_id: clubId, member_id: memberId });

    const result = clubSvc.reactivateClub(memberId, clubId);
    expect(result.branch).toBe('reactivated');
    expect(clubStatus(clubId)).toBe('active');
    const audits = reactivateAudits(clubId);
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0].metadata_json).old_status).toBe('inactive');
  });

  it('reactivating an already-active club is a no-op with no audit', () => {
    const memberId = seedMember();
    const clubId = insertClub(db, { name: 'Already Active Club', status: 'active' });
    insertClubLeader(db, { club_id: clubId, member_id: memberId });

    const result = clubSvc.reactivateClub(memberId, clubId);
    expect(result.branch).toBe('already_active');
    expect(reactivateAudits(clubId)).toHaveLength(0);
  });

  it('a non-leader cannot reactivate', () => {
    const memberId = seedMember();
    const clubId = insertClub(db, { name: 'Not Mine Club', status: 'inactive' });

    const result = clubSvc.reactivateClub(memberId, clubId);
    expect(result.branch).toBe('not_leader');
    expect(clubStatus(clubId)).toBe('inactive');
  });
});

describe('public directory excludes inactive clubs', () => {
  it('an inactive-only country drops out of the index, and a mixed country counts active only', () => {
    insertClub(db, { id: 'club-canada-active', name: 'Active In Canada', country: 'Canada', status: 'active', publiclyVisible: true });
    insertClub(db, { id: 'club-canada-inactive', name: 'Inactive In Canada', country: 'Canada', status: 'inactive', publiclyVisible: true });
    insertClub(db, { id: 'club-brazil-inactive', name: 'Inactive In Brazil', country: 'Brazil', status: 'inactive', publiclyVisible: true });

    const countries = clubSvc.getPublicClubsIndexPage().content.countries;
    const canada = countries.find((c) => c.country === 'Canada');
    expect(canada).toBeDefined();
    expect(canada!.total).toBe(1);
    expect(countries.find((c) => c.country === 'Brazil')).toBeUndefined();

    const page = clubSvc.getPublicCountryPage(canada!.countrySlug, false);
    expect(page.content.total).toBe(1);
  });

  it('an inactive club is still reachable by direct link and shows the inactive warning', async () => {
    const tagId = insertTag(db, { standard_type: 'club', tag_normalized: '#club_directlink_inactive' });
    insertClub(db, { name: 'Direct Link Inactive', status: 'inactive', hashtag_tag_id: tagId });

    const res = await request(createApp()).get('/clubs/club_directlink_inactive');
    expect(res.status).toBe(200);
    expect(res.text).toContain('This club is inactive');
  });
});

describe('club routes: leave confirmation and reactivate', () => {
  it('POST /clubs/:key/leave as the sole co-leader renders the confirmation page', async () => {
    const memberId = seedMember();
    const tagId = insertTag(db, { standard_type: 'club', tag_normalized: '#club_leave_confirm' });
    const clubId = insertClub(db, { name: 'Leave Confirm Club', hashtag_tag_id: tagId });
    insertMemberClubAffiliation(db, memberId, clubId, { is_primary: 1 });
    insertClubLeader(db, { club_id: clubId, member_id: memberId });

    const res = await request(createApp())
      .post('/clubs/club_leave_confirm/leave')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});
    expect(res.status).toBe(200);
    expect(res.text).toContain('only co-leader');
    expect(res.text).toContain('Leave Anyway');
    // The "Manage co-leaders" affordance points back at the club page.
    expect(res.text).toContain('/clubs/club_leave_confirm');
    // Still a current member: the warning did not leave the club.
    expect(affiliationIsCurrent(memberId, clubId)).toBe(1);
  });

  it('POST /clubs/:key/leave with confirmed=1 leaves the club', async () => {
    const memberId = seedMember();
    const tagId = insertTag(db, { standard_type: 'club', tag_normalized: '#club_leave_now' });
    const clubId = insertClub(db, { name: 'Leave Now Club', hashtag_tag_id: tagId });
    insertMemberClubAffiliation(db, memberId, clubId, { is_primary: 1 });
    insertClubLeader(db, { club_id: clubId, member_id: memberId });

    const res = await request(createApp())
      .post('/clubs/club_leave_now/leave')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ confirmed: '1' });
    expect(res.status).toBe(303);
    expect(affiliationIsCurrent(memberId, clubId)).toBe(0);
  });

  it('POST /clubs/:key/reactivate as a co-leader reactivates the club', async () => {
    const memberId = seedMember();
    const tagId = insertTag(db, { standard_type: 'club', tag_normalized: '#club_reactivate_route' });
    const clubId = insertClub(db, { name: 'Reactivate Route Club', status: 'inactive', hashtag_tag_id: tagId });
    insertClubLeader(db, { club_id: clubId, member_id: memberId });

    const res = await request(createApp())
      .post('/clubs/club_reactivate_route/reactivate')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});
    expect(res.status).toBe(303);
    expect(clubStatus(clubId)).toBe('active');
  });

  it('POST /clubs/:key/reactivate requires authentication', async () => {
    const res = await request(createApp())
      .post('/clubs/club_reactivate_route/reactivate')
      .type('form')
      .send({});
    expect(res.status).toBe(302);
  });
});

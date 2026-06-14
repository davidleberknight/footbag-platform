/**
 * Flat co-leadership member flows: self-volunteer eligibility, invite-by-email,
 * and step-down.
 *
 *   - volunteerToCoLeadClub is immediate for an eligible member (current member
 *     of the club, Tier 1 benefits via Tier 1+ or an active Active-Player
 *     period, not already co-leading another club, club under the 5-co-leader
 *     cap). It audits the add and notifies existing co-leaders.
 *   - A member with no Tier 1 benefits, a non-member, a member who already
 *     co-leads elsewhere, and a full club are each refused without writing a
 *     club_leaders row.
 *   - Invite is an email to the volunteer affordance, not a stored handshake:
 *     it writes no club_leaders row and is restricted to current co-leaders.
 *   - Step-down removes the caller's own co-leader row while preserving their
 *     club membership; the last co-leader out leaves the club leaderless.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertTag,
  insertClub,
  insertClubLeader,
  insertMemberClubAffiliation,
  createMemberAtTier,
  createTier0WithActivePlayer,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3199');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const FAR_FUTURE = '2099-12-31T00:00:00.000Z';

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

const cookieFor = (memberId: string) => `footbag_session=${createTestSessionJwt({ memberId })}`;

let _n = 0;
function seedClub(): { clubId: string; clubKey: string } {
  _n += 1;
  const slug = `coled_${_n}`;
  const tagId = insertTag(db, { standard_type: 'club', tag_normalized: `#club_${slug}` });
  const clubId = insertClub(db, { id: `cold-club-${_n}`, name: `Coled Club ${_n}`, hashtag_tag_id: tagId });
  return { clubId, clubKey: `club_${slug}` };
}
// A member that POSTs must have completed onboarding; otherwise the wizard gate
// intercepts the request and redirects to /register/wizard before the route.
function tier1Actor(id: string, slug: string): string {
  const m = createMemberAtTier(db, { id, slug, tier: 'tier1' });
  completeOnboarding(db, m);
  return m;
}
function tier0Actor(id: string, slug: string): string {
  const m = createMemberAtTier(db, { id, slug, tier: 'tier0' });
  completeOnboarding(db, m);
  return m;
}
function tier0ApActor(id: string, slug: string): string {
  const m = createTier0WithActivePlayer(db, { id, slug, expiresAt: FAR_FUTURE });
  completeOnboarding(db, m);
  return m;
}
function leaderRows(clubId: string): Array<{ member_id: string; role: string }> {
  return db.prepare('SELECT member_id, role FROM club_leaders WHERE club_id = ?').all(clubId) as Array<{ member_id: string; role: string }>;
}
function emailCount(memberId: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_member_id = ?`).get(memberId) as { n: number }).n;
}

describe('POST /clubs/:key/volunteer', () => {
  it('an eligible Tier 1 current member becomes a co-leader, audited', async () => {
    const { clubId, clubKey } = seedClub();
    const m = tier1Actor(`v-t1-${_n}`, `v_t1_${_n}`);
    insertMemberClubAffiliation(db, m, clubId);

    const res = await request(createApp()).post(`/clubs/${clubKey}/volunteer`).set('Cookie', cookieFor(m));
    expect(res.status).toBe(303);

    expect(leaderRows(clubId)).toEqual([{ member_id: m, role: 'co-leader' }]);
    const audit = db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = 'club.coleader_volunteered' AND actor_member_id = ?`,
    ).get(m) as { n: number };
    expect(audit.n).toBe(1);
  });

  it('a Tier 0 member with an active Active-Player period is eligible', async () => {
    const { clubId, clubKey } = seedClub();
    const m = tier0ApActor(`v-ap-${_n}`, `v_ap_${_n}`);
    insertMemberClubAffiliation(db, m, clubId);

    const res = await request(createApp()).post(`/clubs/${clubKey}/volunteer`).set('Cookie', cookieFor(m));
    expect(res.status).toBe(303);
    expect(leaderRows(clubId)).toEqual([{ member_id: m, role: 'co-leader' }]);
  });

  it('a Tier 0 member without Active Player is refused', async () => {
    const { clubId, clubKey } = seedClub();
    const m = tier0Actor(`v-t0-${_n}`, `v_t0_${_n}`);
    insertMemberClubAffiliation(db, m, clubId);

    const res = await request(createApp()).post(`/clubs/${clubKey}/volunteer`).set('Cookie', cookieFor(m));
    expect(res.status).toBe(303);
    expect(leaderRows(clubId)).toHaveLength(0);
  });

  it('a non-member of the club is refused', async () => {
    const { clubId, clubKey } = seedClub();
    const m = tier1Actor(`v-nonmem-${_n}`, `v_nonmem_${_n}`);

    const res = await request(createApp()).post(`/clubs/${clubKey}/volunteer`).set('Cookie', cookieFor(m));
    expect(res.status).toBe(303);
    expect(leaderRows(clubId)).toHaveLength(0);
  });

  it('a member who already co-leads another club cannot volunteer again', async () => {
    const other = seedClub();
    const { clubId, clubKey } = seedClub();
    const m = tier1Actor(`v-multi-${_n}`, `v_multi_${_n}`);
    insertClubLeader(db, { club_id: other.clubId, member_id: m });
    insertMemberClubAffiliation(db, m, clubId);

    const res = await request(createApp()).post(`/clubs/${clubKey}/volunteer`).set('Cookie', cookieFor(m));
    expect(res.status).toBe(303);
    expect(leaderRows(clubId)).toHaveLength(0);
  });

  it('a club already at the five-co-leader cap refuses a sixth', async () => {
    const { clubId, clubKey } = seedClub();
    for (let i = 0; i < 5; i++) {
      const ldr = insertMember(db, { id: `v-cap-${_n}-${i}`, slug: `v_cap_${_n}_${i}` });
      insertClubLeader(db, { club_id: clubId, member_id: ldr });
    }
    const m = tier1Actor(`v-sixth-${_n}`, `v_sixth_${_n}`);
    insertMemberClubAffiliation(db, m, clubId);

    const res = await request(createApp()).post(`/clubs/${clubKey}/volunteer`).set('Cookie', cookieFor(m));
    expect(res.status).toBe(303);
    expect(leaderRows(clubId)).toHaveLength(5);
  });

  it('self-adding to an already-led club notifies the existing co-leaders', async () => {
    const { clubId, clubKey } = seedClub();
    const existing = insertMember(db, { id: `v-existing-${_n}`, slug: `v_existing_${_n}`, login_email: `v-existing-${_n}@example.com` });
    insertClubLeader(db, { club_id: clubId, member_id: existing });
    const m = tier1Actor(`v-joiner-${_n}`, `v_joiner_${_n}`);
    insertMemberClubAffiliation(db, m, clubId);

    const res = await request(createApp()).post(`/clubs/${clubKey}/volunteer`).set('Cookie', cookieFor(m));
    expect(res.status).toBe(303);
    expect(emailCount(existing)).toBe(1);
  });
});

describe('POST /clubs/:key/invite', () => {
  it('a co-leader invites a member: email enqueued, audited, no club_leaders row for the invitee', async () => {
    const { clubId, clubKey } = seedClub();
    const leader = tier1Actor(`i-leader-${_n}`, `i_leader_${_n}`);
    insertClubLeader(db, { club_id: clubId, member_id: leader });
    insertMemberClubAffiliation(db, leader, clubId);
    const invitee = insertMember(db, { id: `i-invitee-${_n}`, slug: `i_invitee_${_n}`, login_email: `i-invitee-${_n}@example.com` });
    // The invitee must already be a current member of the club.
    insertMemberClubAffiliation(db, invitee, clubId);

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/invite`)
      .set('Cookie', cookieFor(leader))
      .type('form')
      .send({ member_key: invitee });
    expect(res.status).toBe(303);

    expect(emailCount(invitee)).toBe(1);
    // No leadership row is written by an invite; acceptance is the invitee volunteering.
    expect(leaderRows(clubId).some((r) => r.member_id === invitee)).toBe(false);
    const audit = db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = 'club.coleader_invited' AND actor_member_id = ?`,
    ).get(leader) as { n: number };
    expect(audit.n).toBe(1);
  });

  it('a non-co-leader cannot invite', async () => {
    const { clubId, clubKey } = seedClub();
    const notLeader = tier1Actor(`i-notldr-${_n}`, `i_notldr_${_n}`);
    insertMemberClubAffiliation(db, notLeader, clubId);
    const invitee = insertMember(db, { id: `i-inv2-${_n}`, slug: `i_inv2_${_n}`, login_email: `i-inv2-${_n}@example.com` });

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/invite`)
      .set('Cookie', cookieFor(notLeader))
      .type('form')
      .send({ member_key: invitee });
    expect(res.status).toBe(303);
    expect(emailCount(invitee)).toBe(0);
    void clubId;
  });

  it('cannot invite a member who is not a current member of the club: no email enqueued', async () => {
    const { clubId, clubKey } = seedClub();
    const leader = tier1Actor(`i-leader2-${_n}`, `i_leader2_${_n}`);
    insertClubLeader(db, { club_id: clubId, member_id: leader });
    insertMemberClubAffiliation(db, leader, clubId);
    // Invitee has no affiliation with this club.
    const invitee = insertMember(db, { id: `i-nonmem-${_n}`, slug: `i_nonmem_${_n}`, login_email: `i-nonmem-${_n}@example.com` });

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/invite`)
      .set('Cookie', cookieFor(leader))
      .type('form')
      .send({ member_key: invitee });
    expect(res.status).toBe(303);
    expect(emailCount(invitee)).toBe(0);
    expect(leaderRows(clubId).some((r) => r.member_id === invitee)).toBe(false);
  });
});

describe('POST /clubs/:key/mark-inactive', () => {
  it('a club leader marks the club inactive: status flips, affiliations preserved, audited', async () => {
    const { clubId, clubKey } = seedClub();
    const leader = tier1Actor(`mi-leader-${_n}`, `mi_leader_${_n}`);
    insertClubLeader(db, { club_id: clubId, member_id: leader });
    insertMemberClubAffiliation(db, leader, clubId);

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/mark-inactive`)
      .set('Cookie', cookieFor(leader));
    expect(res.status).toBe(303);

    const club = db.prepare('SELECT status FROM clubs WHERE id = ?').get(clubId) as { status: string };
    expect(club.status).toBe('inactive');

    // Deactivation must not drop member affiliations.
    const aff = db.prepare(
      'SELECT COUNT(*) AS n FROM member_club_affiliations WHERE club_id = ? AND member_id = ?',
    ).get(clubId, leader) as { n: number };
    expect(aff.n).toBe(1);

    const audit = db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = 'club.marked_inactive' AND entity_id = ?`,
    ).get(clubId) as { n: number };
    expect(audit.n).toBe(1);
  });

  it('a non-leader cannot mark the club inactive: status unchanged', async () => {
    const { clubId, clubKey } = seedClub();
    const notLeader = tier1Actor(`mi-notldr-${_n}`, `mi_notldr_${_n}`);
    insertMemberClubAffiliation(db, notLeader, clubId);

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/mark-inactive`)
      .set('Cookie', cookieFor(notLeader));
    expect(res.status).toBe(303);
    const club = db.prepare('SELECT status FROM clubs WHERE id = ?').get(clubId) as { status: string };
    expect(club.status).toBe('active');
  });

  it('unauthenticated request is redirected to login', async () => {
    const { clubKey } = seedClub();
    const res = await request(createApp()).post(`/clubs/${clubKey}/mark-inactive`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });
});

describe('POST /clubs/:key/step-down', () => {
  it('a co-leader steps down: the row is removed but the affiliation is kept', async () => {
    const { clubId, clubKey } = seedClub();
    const m = tier1Actor(`s-down-${_n}`, `s_down_${_n}`);
    insertClubLeader(db, { club_id: clubId, member_id: m });
    insertMemberClubAffiliation(db, m, clubId);

    const res = await request(createApp()).post(`/clubs/${clubKey}/step-down`).set('Cookie', cookieFor(m));
    expect(res.status).toBe(303);

    expect(leaderRows(clubId)).toHaveLength(0);
    const aff = db.prepare(
      'SELECT is_current FROM member_club_affiliations WHERE member_id = ? AND club_id = ?',
    ).get(m, clubId) as { is_current: number };
    expect(aff.is_current).toBe(1);
  });

  it('the last co-leader stepping down leaves the club leaderless, not blocked', async () => {
    const { clubId, clubKey } = seedClub();
    const m = tier1Actor(`s-last-${_n}`, `s_last_${_n}`);
    insertClubLeader(db, { club_id: clubId, member_id: m });
    insertMemberClubAffiliation(db, m, clubId);

    const res = await request(createApp()).post(`/clubs/${clubKey}/step-down`).set('Cookie', cookieFor(m));
    expect(res.status).toBe(303);
    expect(leaderRows(clubId)).toHaveLength(0);
    const club = db.prepare(`SELECT status FROM clubs WHERE id = ?`).get(clubId) as { status: string };
    expect(club.status).toBe('active');
  });
});

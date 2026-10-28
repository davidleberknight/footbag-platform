/**
 * Flat co-leadership member flows: self-volunteer eligibility, the club page's
 * leadership block, and step-down.
 *
 *   - volunteerToCoLeadClub is immediate for an eligible member (current member
 *     of the club, Tier 1 benefits via Tier 1+ or an active Active-Player
 *     period, not already co-leading another club, club under the 5-co-leader
 *     cap). It audits the add and notifies existing co-leaders.
 *   - A member with no Tier 1 benefits, a non-member, a member who already
 *     co-leads elsewhere, and a full club are each refused without writing a
 *     club_leaders row.
 *   - Co-leadership is gained only by volunteering (or admin assignment): a
 *     co-leader's club page offers no recruiting control.
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
  insertAuditEntry,
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

const cookieFor = (memberId: string) => `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;

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
function currentAffiliations(memberId: string): Array<{ club_id: string; is_primary: number }> {
  return db.prepare(
    'SELECT club_id, is_primary FROM member_club_affiliations WHERE member_id = ? AND is_current = 1',
  ).all(memberId) as Array<{ club_id: string; is_primary: number }>;
}
function emailCount(memberId: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_member_id = ?`).get(memberId) as { n: number }).n;
}
function outboxTotal(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM outbox_emails').get() as { n: number }).n;
}
function auditCount(actionType: string, where: string, ...params: unknown[]): number {
  return (db.prepare(
    `SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = ? AND ${where}`,
  ).get(actionType, ...params) as { n: number }).n;
}
/** The page a club action redirected to, opened with the flash it set. */
async function landedOn(memberId: string, res: { headers: Record<string, unknown> }): Promise<string> {
  const flash = ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? [])
    .find((c) => c.startsWith('footbag_flash='))?.split(';')[0];
  expect(flash, 'the action left no outcome for the next page to show').toBeDefined();
  const shown = await request(createApp())
    .get(res.headers.location as string)
    .set('Cookie', [cookieFor(memberId), flash].join('; '));
  expect(shown.status).toBe(200);
  return shown.text;
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

  it('a Tier 0 member without Active Player is refused at the tier gate', async () => {
    const { clubId, clubKey } = seedClub();
    const m = tier0Actor(`v-t0-${_n}`, `v_t0_${_n}`);
    insertMemberClubAffiliation(db, m, clubId);

    // Volunteering to co-lead always requires Tier 1 benefits; the route gate
    // returns 403 before the service runs.
    const res = await request(createApp()).post(`/clubs/${clubKey}/volunteer`).set('Cookie', cookieFor(m));
    expect(res.status).toBe(403);
    expect(leaderRows(clubId)).toHaveLength(0);
  });

  // Defect caught: a member not yet in the club has to join and then volunteer
  // as two acts, or volunteering makes them a co-leader of a club they are not
  // a member of; or the join half skips what a join records (the primary flag,
  // its audit row, its notices).
  it('a non-member joins the club and becomes a co-leader in the same step', async () => {
    const { clubId, clubKey } = seedClub();
    const m = tier1Actor(`v-nonmem-${_n}`, `v_nonmem_${_n}`);

    const res = await request(createApp()).post(`/clubs/${clubKey}/volunteer`).set('Cookie', cookieFor(m));
    expect(res.status).toBe(303);
    expect(leaderRows(clubId)).toEqual([{ member_id: m, role: 'co-leader' }]);
    expect(currentAffiliations(m)).toEqual([{ club_id: clubId, is_primary: 1 }]);
    expect(auditCount('club.member_joined', 'actor_member_id = ?', m)).toBe(1);
    expect(auditCount('club.coleader_volunteered', 'actor_member_id = ?', m)).toBe(1);
    expect(emailCount(m)).toBe(1);
  });

  // Defect caught: a Tier 0 site member with no Active Player period, not in
  // the club, is offered the volunteer button, or posts it directly, and joins
  // the club, collects the one-time club-join period and leads it on that period.
  it('a Tier 0 site member without Active Player is not offered volunteering at a club they are not in, and cannot post it', async () => {
    const { clubId, clubKey } = seedClub();
    // A club with a co-leader, so the Join control this member may use shows.
    const leader = tier1Actor(`v-t0-out-ldr-${_n}`, `v_t0_out_ldr_${_n}`);
    insertClubLeader(db, { club_id: clubId, member_id: leader });
    const m = tier0Actor(`v-t0-out-${_n}`, `v_t0_out_${_n}`);

    const page = await request(createApp()).get(`/clubs/${clubKey}`).set('Cookie', cookieFor(m));
    expect(page.status).toBe(200);
    expect(page.text).toContain(`action="/clubs/${clubKey}/join"`);
    expect(page.text).not.toContain(`action="/clubs/${clubKey}/volunteer"`);

    const res = await request(createApp()).post(`/clubs/${clubKey}/volunteer`).set('Cookie', cookieFor(m));
    expect(res.status).toBe(403);
    expect(leaderRows(clubId)).toHaveLength(1);
    expect(currentAffiliations(m)).toEqual([]);
    expect(auditCount('club.member_joined', 'actor_member_id = ?', m)).toBe(0);
    expect(db.prepare(
      "SELECT COUNT(*) AS n FROM active_player_grants WHERE member_id = ? AND reason_code = 'club_join_one_time_active_player_grant'",
    ).get(m)).toEqual({ n: 0 });
  });

  // Defect caught: a volunteer refused for leadership reasons is still left
  // holding the membership the same click made, or a member already in two
  // other clubs reaches a third through the volunteer button.
  it('a refused non-member volunteer is left with no join, at the co-leader cap or the club cap', async () => {
    const full = seedClub();
    for (let i = 0; i < 5; i++) {
      const ldr = insertMember(db, { id: `v-full-${_n}-${i}`, slug: `v_full_${_n}_${i}` });
      insertClubLeader(db, { club_id: full.clubId, member_id: ldr });
    }
    const m = tier1Actor(`v-rollback-${_n}`, `v_rollback_${_n}`);
    const capped = await request(createApp()).post(`/clubs/${full.clubKey}/volunteer`).set('Cookie', cookieFor(m));
    expect(capped.status).toBe(303);
    expect(leaderRows(full.clubId)).toHaveLength(5);
    expect(currentAffiliations(m)).toEqual([]);
    expect(auditCount('club.member_joined', 'actor_member_id = ?', m)).toBe(0);

    const { clubId, clubKey } = seedClub();
    const two = tier1Actor(`v-twoclubs-${_n}`, `v_twoclubs_${_n}`);
    insertMemberClubAffiliation(db, two, seedClub().clubId, { is_primary: 1 });
    insertMemberClubAffiliation(db, two, seedClub().clubId, { is_primary: 0 });
    const third = await request(createApp()).post(`/clubs/${clubKey}/volunteer`).set('Cookie', cookieFor(two));
    expect(third.status).toBe(303);
    expect(leaderRows(clubId)).toHaveLength(0);
    expect(currentAffiliations(two)).toHaveLength(2);
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

describe('club page leadership block', () => {
  // Defect caught: a co-leader's club page offers a way to recruit another
  // co-leader by mail (or an empty Leadership heading with nothing under it),
  // when co-leadership is gained only by volunteering or admin assignment;
  // or the eligible member beside them loses the volunteer button.
  it('a co-leader sees no leadership controls and no mail goes out; an eligible member still sees Volunteer', async () => {
    const { clubId, clubKey } = seedClub();
    const leader = tier1Actor(`lb-leader-${_n}`, `lb_leader_${_n}`);
    insertClubLeader(db, { club_id: clubId, member_id: leader });
    insertMemberClubAffiliation(db, leader, clubId);
    const eligible = tier1Actor(`lb-member-${_n}`, `lb_member_${_n}`);
    insertMemberClubAffiliation(db, eligible, clubId);

    const leaderPage = await request(createApp()).get(`/clubs/${clubKey}`).set('Cookie', cookieFor(leader));
    expect(leaderPage.status).toBe(200);
    expect(leaderPage.text).not.toContain('<h2>Leadership</h2>');
    expect(leaderPage.text).not.toContain(`/clubs/${clubKey}/invite`);

    const memberPage = await request(createApp()).get(`/clubs/${clubKey}`).set('Cookie', cookieFor(eligible));
    expect(memberPage.status).toBe(200);
    expect(memberPage.text).toContain('<h2>Leadership</h2>');
    expect(memberPage.text).toContain(`action="/clubs/${clubKey}/volunteer"`);

    // A member not in the club who could join it is offered the same button,
    // which joins them as it makes them a co-leader; one already in two other
    // clubs cannot join, so is offered nothing.
    const outsider = tier1Actor(`lb-outsider-${_n}`, `lb_outsider_${_n}`);
    const outsiderPage = await request(createApp()).get(`/clubs/${clubKey}`).set('Cookie', cookieFor(outsider));
    expect(outsiderPage.status).toBe(200);
    expect(outsiderPage.text).toContain(`action="/clubs/${clubKey}/volunteer"`);
    const twoClubs = tier1Actor(`lb-twoclubs-${_n}`, `lb_twoclubs_${_n}`);
    insertMemberClubAffiliation(db, twoClubs, seedClub().clubId, { is_primary: 1 });
    insertMemberClubAffiliation(db, twoClubs, seedClub().clubId, { is_primary: 0 });
    const fullPage = await request(createApp()).get(`/clubs/${clubKey}`).set('Cookie', cookieFor(twoClubs));
    expect(fullPage.status).toBe(200);
    expect(fullPage.text).not.toContain(`action="/clubs/${clubKey}/volunteer"`);

    const outboxBefore = outboxTotal();
    const res = await request(createApp())
      .post(`/clubs/${clubKey}/invite`)
      .set('Cookie', cookieFor(leader))
      .type('form')
      .send({ member_key: eligible });
    expect(res.status).toBe(404);
    expect(outboxTotal()).toBe(outboxBefore);
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

    const asked = await request(createApp()).post(`/clubs/${clubKey}/step-down`).set('Cookie', cookieFor(m));
    expect(asked.status).toBe(200);
    expect(asked.text).toContain('Step Down');
    expect(leaderRows(clubId)).toHaveLength(1);

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/step-down`)
      .set('Cookie', cookieFor(m))
      .type('form')
      .send({ confirmed: '1' });
    expect(res.status).toBe(303);

    expect(leaderRows(clubId)).toHaveLength(0);
    const aff = db.prepare(
      'SELECT is_current FROM member_club_affiliations WHERE member_id = ? AND club_id = ?',
    ).get(m, clubId) as { is_current: number };
    expect(aff.is_current).toBe(1);
  });

  // Defect caught: a member who stepped down, was given a seat again and then
  // lost it another way posts a stale step-down form and is told "Stepped down"
  // as if their own act still stood, when they are simply not a co-leader.
  it('an old step-down undone by a later seat is not taken for a repeat', async () => {
    const { clubId, clubKey } = seedClub();
    const m = tier1Actor(`s-again-${_n}`, `s_again_${_n}`);
    insertClubLeader(db, { club_id: clubId, member_id: m });
    insertMemberClubAffiliation(db, m, clubId);
    const first = await request(createApp())
      .post(`/clubs/${clubKey}/step-down`).set('Cookie', cookieFor(m)).type('form').send({ confirmed: '1' });
    expect(first.status).toBe(303);
    expect(await landedOn(m, first)).toContain('Stepped down from co-leading this club.');

    // An administrator assigns them again, then demotes them.
    insertAuditEntry(db, {
      action_type: 'club.admin_leader_assigned', actor_type: 'admin', entity_type: 'club', entity_id: clubId,
      metadata: { member_id: m }, occurred_at: new Date(Date.now() + 1000).toISOString(),
    });

    const stale = await request(createApp())
      .post(`/clubs/${clubKey}/step-down`).set('Cookie', cookieFor(m)).type('form').send({ confirmed: '1' });
    expect(await landedOn(m, stale)).toContain('You are not a co-leader of this club.');
  });

  it('the last co-leader stepping down leaves the club leaderless, not blocked', async () => {
    const { clubId, clubKey } = seedClub();
    const m = tier1Actor(`s-last-${_n}`, `s_last_${_n}`);
    insertClubLeader(db, { club_id: clubId, member_id: m });
    insertMemberClubAffiliation(db, m, clubId);

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/step-down`)
      .set('Cookie', cookieFor(m))
      .type('form')
      .send({ confirmed: '1' });
    expect(res.status).toBe(303);
    expect(leaderRows(clubId)).toHaveLength(0);
    const club = db.prepare(`SELECT status FROM clubs WHERE id = ?`).get(clubId) as { status: string };
    expect(club.status).toBe('active');
  });

  /** What a step-down could write: the club's leader rows and the member's
   *  affiliation, their step-down audit rows, and the outbox. */
  function stepDownState(memberId: string, clubId: string): Record<string, unknown> {
    return {
      leaders: leaderRows(clubId).map((r) => r.member_id).sort(),
      affiliation: db.prepare(
        'SELECT is_current, version FROM member_club_affiliations WHERE member_id = ? AND club_id = ?',
      ).get(memberId, clubId) ?? null,
      stepDownAudits: auditCount('club.coleader_stepped_down', 'actor_member_id = ?', memberId),
      outbox: outboxTotal(),
    };
  }
  const stepDown = (memberId: string, clubKey: string) => request(createApp())
    .post(`/clubs/${clubKey}/step-down`)
    .set('Cookie', cookieFor(memberId))
    .type('form')
    .send({ confirmed: '1' });

  // Defect caught: a co-leader who confirms a step-down twice is told they are
  // not a co-leader of the club they just stood down from, or the repeat
  // records a second step-down or notifies the remaining co-leaders again.
  it('a step-down submitted twice repeats the first success and writes nothing', async () => {
    const { clubId, clubKey } = seedClub();
    const m = tier1Actor(`s-twice-${_n}`, `s_twice_${_n}`);
    const staying = insertMember(db, { id: `s-staying-${_n}`, slug: `s_staying_${_n}`, login_email: `s-staying-${_n}@example.com` });
    insertClubLeader(db, { club_id: clubId, member_id: m });
    insertClubLeader(db, { club_id: clubId, member_id: staying });
    insertMemberClubAffiliation(db, m, clubId);

    const first = await stepDown(m, clubKey);
    expect(first.status).toBe(303);
    const afterFirst = stepDownState(m, clubId);
    expect(afterFirst.leaders).toEqual([staying]);
    expect(afterFirst.stepDownAudits).toBe(1);

    const second = await stepDown(m, clubKey);
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    expect(stepDownState(m, clubId)).toEqual(afterFirst);

    const page = await landedOn(m, second);
    expect(page).toContain(
      '<div class="form-success-banner" role="status">Stepped down from co-leading this club.</div>',
    );
    expect(page).not.toContain('You are not a co-leader of this club.');
  });

  // Defect caught: a member who never co-led the club is told they stepped
  // down, or is shown a refusal for a state that already holds.
  it('a step-down by a member who never co-led reads as informational and writes nothing', async () => {
    const { clubId, clubKey } = seedClub();
    const m = tier1Actor(`s-never-${_n}`, `s_never_${_n}`);
    insertMemberClubAffiliation(db, m, clubId);
    const before = stepDownState(m, clubId);

    const res = await stepDown(m, clubKey);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/s_never_${_n}`);
    expect(stepDownState(m, clubId)).toEqual(before);

    const page = await landedOn(m, res);
    expect(page).toContain('<p class="form-notice" role="status">You are not a co-leader of this club.</p>');
    expect(page).not.toContain('form-success-banner');
    expect(page).not.toContain('form-error-banner');
  });
});

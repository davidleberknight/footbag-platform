/**
 * Joining a club with no co-leader.
 *
 * A Tier 0 member's first club join grants an Active Player period, and with
 * it Tier 1 benefits such as media upload. The co-leaders' join email, which
 * asks them to report a name they do not recognise, is the human check on that
 * grant. A club with no current co-leader has nobody to make it, so a member
 * without Tier 1 benefits is refused there: nothing is written, no period is
 * granted, and the club page offers no Join control, saying why instead. A
 * member who already holds Tier 1 benefits gains nothing from the join and may
 * join any club.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMemberTierGrant,
  insertActivePlayerGrant,
  insertClub,
  insertTag,
  insertClubLeader,
  insertMemberClubAffiliation,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';
import { isoDaysFromNow } from '../fixtures/clock';
import { flashValueOf } from '../fixtures/flashCookie';

const { dbPath } = setTestEnv('4740');

let createApp: Awaited<ReturnType<typeof importApp>>;
let noLeaderRefusal: string;
let otherTopicLabel: string;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

let n = 0;

function seedMember(opts: { tier1?: boolean; activePlayer?: boolean; deceased?: boolean } = {}): string {
  n += 1;
  return withDb((db) => {
    const id = insertMember(db, {
      id: `lj-mem-${n}`, slug: `lj_mem_${n}`, display_name: `Joiner ${n}`,
      login_email: `lj-mem-${n}@example.com`, is_deceased: opts.deceased ? 1 : 0,
    });
    completeOnboarding(db, id);
    if (opts.tier1) {
      insertMemberTierGrant(db, { member_id: id, new_tier_status: 'tier1', reason_code: 'purchase.tier1' });
    }
    if (opts.activePlayer) {
      insertActivePlayerGrant(db, {
        member_id: id, new_active_player_expires_at: isoDaysFromNow(200),
      });
    }
    return id;
  });
}

function seedClub(opts: { leaderId?: string; status?: 'active' | 'inactive' } = {}): { clubId: string; clubKey: string } {
  n += 1;
  const slug = `ljclub_${n}`;
  return withDb((db) => {
    const tagId = insertTag(db, { standard_type: 'club', tag_normalized: `#club_${slug}` });
    const clubId = insertClub(db, {
      id: `lj-club-${n}`, name: `Leaderless Club ${n}`, hashtag_tag_id: tagId, status: opts.status ?? 'active',
    });
    if (opts.leaderId) {
      insertMemberClubAffiliation(db, opts.leaderId, clubId, { is_primary: 1 });
      insertClubLeader(db, { id: `lj-cl-${n}`, club_id: clubId, member_id: opts.leaderId });
    }
    return { clubId, clubKey: `club_${slug}` };
  });
}

function slugOf(memberId: string): string {
  return withDb((db) => (db.prepare('SELECT slug FROM members WHERE id = ?').get(memberId) as { slug: string }).slug);
}

function postJoin(clubKey: string, memberId: string) {
  return request(createApp()).post(`/clubs/${clubKey}/join`).set('Cookie', cookieFor(memberId)).type('form').send({});
}

function affiliationCount(memberId: string, clubId: string): number {
  return withDb((db) => (db.prepare(
    'SELECT COUNT(*) AS c FROM member_club_affiliations WHERE member_id = ? AND club_id = ? AND is_current = 1',
  ).get(memberId, clubId) as { c: number }).c);
}

function clubJoinGrants(memberId: string): number {
  return withDb((db) => (db.prepare(
    `SELECT COUNT(*) AS c FROM active_player_grants WHERE member_id = ? AND related_club_id IS NOT NULL`,
  ).get(memberId) as { c: number }).c);
}

function joinAudits(memberId: string): number {
  return withDb((db) => (db.prepare(
    `SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'club.member_joined' AND actor_member_id = ?`,
  ).get(memberId) as { c: number }).c);
}

function outboxTo(memberId: string): Array<{ body_text: string }> {
  return withDb((db) => db.prepare(
    'SELECT body_text FROM outbox_emails WHERE recipient_member_id = ?',
  ).all(memberId) as Array<{ body_text: string }>);
}

beforeAll(async () => {
  createTestDb(dbPath).close();
  createApp = await importApp();
  noLeaderRefusal = (await import('../../src/services/clubService')).NO_LEADER_JOIN_REFUSAL;
  otherTopicLabel = (await import('../../src/services/adminWorkQueueService')).CONTACT_CATEGORY_LABELS.other;
});

afterAll(() => cleanupTestDb(dbPath));

describe('a member without Tier 1 benefits on a club with no co-leader', () => {
  // Defect caught: a spam account joins a leaderless club and walks away with
  // an Active Player period and media upload, and no co-leader is ever told.
  it('is refused, and nothing is written, granted or sent', async () => {
    const memberId = seedMember();
    const { clubId, clubKey } = seedClub();

    const res = await postJoin(clubKey, memberId);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/clubs/${clubKey}`);
    expect(flashValueOf(res)).toContain(noLeaderRefusal);
    expect(affiliationCount(memberId, clubId)).toBe(0);
    expect(clubJoinGrants(memberId)).toBe(0);
    expect(joinAudits(memberId)).toBe(0);
    expect(outboxTo(memberId)).toHaveLength(0);
  });

  // Defect caught: the refusal reaches a club that does have a co-leader, so a
  // new free member can never join anything and earn their Active Player period.
  it('joins a club that has a co-leader, and the first join still grants Active Player', async () => {
    const leaderId = seedMember({ tier1: true });
    const memberId = seedMember();
    const { clubId, clubKey } = seedClub({ leaderId });

    const res = await postJoin(clubKey, memberId);
    expect(res.status).toBe(303);
    expect(flashValueOf(res)).not.toContain(noLeaderRefusal);
    expect(affiliationCount(memberId, clubId)).toBe(1);
    expect(clubJoinGrants(memberId)).toBe(1);
  });

  // Defect caught: a co-leader who has died still counts as the club's check,
  // so the refusal is bypassed on a club nobody is reading the mail for.
  it('is refused when the only co-leader is marked deceased', async () => {
    const leaderId = seedMember({ tier1: true, deceased: true });
    const memberId = seedMember();
    const { clubId, clubKey } = seedClub({ leaderId });

    const res = await postJoin(clubKey, memberId);
    expect(flashValueOf(res)).toContain(noLeaderRefusal);
    expect(affiliationCount(memberId, clubId)).toBe(0);
  });

  // Defect caught: a refused join on an inactive club still revives it, so a
  // spam attempt puts a dead club back in the directory.
  it('leaves an inactive club inactive', async () => {
    const memberId = seedMember();
    const { clubId, clubKey } = seedClub({ status: 'inactive' });

    await postJoin(clubKey, memberId);
    const status = withDb((db) => (db.prepare('SELECT status FROM clubs WHERE id = ?')
      .get(clubId) as { status: string }).status);
    expect(status).toBe('inactive');
  });

  // Defect caught: the page offers a Join button that can only be refused, or
  // hides it and leaves the member no way forward: no link to upgrade, none to
  // the events that earn Active Player, and none that actually lands.
  it('replaces the Join control with a note linking to their own upgrade and to events, while a member with Tier 1 benefits sees the control', async () => {
    const tier0 = seedMember();
    const tier1 = seedMember({ tier1: true });
    const { clubKey } = seedClub();
    const membershipHref = `/members/${slugOf(tier0)}#membership`;

    const blocked = await request(createApp()).get(`/clubs/${clubKey}`).set('Cookie', cookieFor(tier0));
    expect(blocked.status).toBe(200);
    expect(blocked.text).not.toContain(`action="/clubs/${clubKey}/join"`);
    expect(blocked.text).toContain(`<a href="${membershipHref}">`);
    expect(blocked.text).toContain('<a href="/events">event</a>');

    const profile = await request(createApp()).get(membershipHref.split('#')[0]).set('Cookie', cookieFor(tier0));
    expect(profile.status).toBe(200);
    expect(profile.text).toContain('id="membership"');

    const open = await request(createApp()).get(`/clubs/${clubKey}`).set('Cookie', cookieFor(tier1));
    expect(open.status).toBe(200);
    expect(open.text).toContain(`action="/clubs/${clubKey}/join"`);
    expect(open.text).not.toContain(`/members/${slugOf(tier1)}#membership`);
  });

  // Defect caught: a member already in two clubs is told they can join any
  // club with a co-leader, which the two-club limit refuses.
  it('tells a member below the two-club limit they can join any club with a co-leader, and not one at it', async () => {
    const pointer = 'You can also join any club that has a co-leader.';
    const free = seedMember();
    const capped = seedMember();
    for (let i = 0; i < 2; i += 1) {
      const { clubId } = seedClub();
      withDb((db) => insertMemberClubAffiliation(db, capped, clubId, { is_primary: i === 0 ? 1 : 0, source: 'legacy_claim' }));
    }
    const { clubKey } = seedClub();

    const freePage = await request(createApp()).get(`/clubs/${clubKey}`).set('Cookie', cookieFor(free));
    expect(freePage.text).toContain(pointer);
    const cappedPage = await request(createApp()).get(`/clubs/${clubKey}`).set('Cookie', cookieFor(capped));
    expect(cappedPage.text).toContain(`/members/${slugOf(capped)}#membership`);
    expect(cappedPage.text).not.toContain(pointer);
  });
});

describe('a member who already holds Tier 1 benefits', () => {
  // Defect caught: the refusal reads the tier alone, so a Tier 0 member who
  // earned Active Player at an event is wrongly kept out of a leaderless club.
  it('joins a leaderless club through an active Active Player period', async () => {
    const memberId = seedMember({ activePlayer: true });
    const { clubId, clubKey } = seedClub();

    const res = await postJoin(clubKey, memberId);
    expect(res.status).toBe(303);
    expect(flashValueOf(res)).not.toContain(noLeaderRefusal);
    expect(affiliationCount(memberId, clubId)).toBe(1);
  });

  it('joins a leaderless club through a Tier 1 membership', async () => {
    const memberId = seedMember({ tier1: true });
    const { clubId, clubKey } = seedClub();

    await postJoin(clubKey, memberId);
    expect(affiliationCount(memberId, clubId)).toBe(1);
  });
});

describe('the order of the refusals', () => {
  // Defect caught: a member already on the roster is told they cannot join.
  it('reports an existing membership ahead of the leaderless refusal', async () => {
    const memberId = seedMember();
    const { clubId, clubKey } = seedClub();
    withDb((db) => insertMemberClubAffiliation(db, memberId, clubId, { is_primary: 1, source: 'legacy_claim' }));

    const res = await postJoin(clubKey, memberId);
    expect(flashValueOf(res)).toContain('You are already a member of this club.');
  });

  // Defect caught: a member at the two-club cap is told to leave a club, when
  // leaving one would still not let them join this one.
  it('reports the leaderless refusal ahead of the two-club cap', async () => {
    const memberId = seedMember();
    for (let i = 0; i < 2; i += 1) {
      const { clubId } = seedClub();
      withDb((db) => insertMemberClubAffiliation(db, memberId, clubId, { is_primary: i === 0 ? 1 : 0, source: 'legacy_claim' }));
    }
    const { clubKey } = seedClub();

    const res = await postJoin(clubKey, memberId);
    expect(flashValueOf(res)).toContain(noLeaderRefusal);
  });
});

describe('the co-leaders join email', () => {
  // Defect caught: the email names a link or a topic the member-facing pages
  // do not carry, so a co-leader who wants to report a fake account cannot
  // follow the instructions.
  it('tells co-leaders how to report a bogus join, through the link and topic the site really offers', async () => {
    const leaderId = seedMember({ tier1: true });
    const memberId = seedMember();
    const { clubKey } = seedClub({ leaderId });

    await postJoin(clubKey, memberId);
    const mail = outboxTo(leaderId);
    expect(mail).toHaveLength(1);
    const body = mail[0].body_text;

    const leaderSlug = withDb((db) => (db.prepare('SELECT slug FROM members WHERE id = ?')
      .get(leaderId) as { slug: string }).slug);
    const editPage = await request(createApp()).get(`/members/${leaderSlug}/edit`).set('Cookie', cookieFor(leaderId));
    expect(editPage.status).toBe(200);
    const linkLabel = /<a href="\/members\/[^"]+\/contact-admin"[^>]*>([^<]+)<\/a>/.exec(editPage.text)?.[1];
    expect(linkLabel).toBeDefined();

    expect(body).toContain(`"${linkLabel}"`);
    expect(body).toContain('Edit Profile');
    expect(body).toContain(`topic ${otherTopicLabel}`);
  });
});

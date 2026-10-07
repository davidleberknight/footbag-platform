/**
 * No page lists a member the platform no longer treats as a current member.
 *
 * A club roster, the official roster and every other page that lists people
 * draw on the same members, and the state nobody seeded is the one that leaks:
 * a deceased member still listed on their club's roster, a deleted account on
 * the official roster.
 * One member in every state is put everywhere a page can list them (a current
 * club affiliation, a paid tier, a confirmed event registration), each under a
 * name that appears nowhere else. Then every page that takes no key, plus the
 * club and event pages they belong to, is fetched by a visitor and by a
 * signed-in Tier 2 member, and none may name an excluded member.
 *
 * The live member is the positive control: the club roster and the official
 * roster must name them, or every exclusion could pass by listing nobody.
 * Bounced and complaining members are current members whose mailbox fails, so
 * they are listed like anyone else and are not part of this claim.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { loadRouteTable } from '../fixtures/routeTable';
import {
  insertMember,
  insertEvent,
  insertTag,
  insertClub,
  insertMemberClubAffiliation,
  insertMemberTierGrant,
  createTestSessionJwt,
} from '../fixtures/factories';
import { MEMBER_STATES, seedMemberStateMatrix, type MemberState, type MemberStateMatrix } from '../fixtures/memberStates';

const { dbPath } = setTestEnv('4473');

let createApp: Awaited<ReturnType<typeof importApp>>;

// An unverified account is not claimed here: it has never signed in, so it
// cannot have joined a club or paid, and the state in which a registrant does
// hold a club affiliation (mid-way through the onboarding wizard) is a
// reachability question this sweep does not settle.
const EXCLUDED: MemberState[] = ['deceased', 'softDeleted', 'purged'];
const VIEWER = 'listing-viewer';
const EVENT_KEY = 'event_2026_listing_sweep';

const nameOf = (state: MemberState) => `Zqxlisting${state.toLowerCase()}`;

let matrix: MemberStateMatrix;
let clubKey = '';
let pages: string[] = [];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: VIEWER, slug: 'listing_viewer', login_email: 'listing-viewer@example.test' });
  insertMemberTierGrant(db, { member_id: VIEWER, new_tier_status: 'tier2', reason_code: 'purchase' });

  const eventId = insertEvent(db, {
    status: 'reg_open', hashtag_tag_id: insertTag(db, { tag_normalized: `#${EVENT_KEY}` }),
  });
  matrix = seedMemberStateMatrix(db, { prefix: 'lst', eventId });
  const clubId = insertClub(db, { publiclyVisible: true });
  clubKey = (db.prepare(
    'SELECT t.tag_normalized AS tag FROM clubs c JOIN tags t ON t.id = c.hashtag_tag_id WHERE c.id = ?',
  ).get(clubId) as { tag: string }).tag.slice(1);

  const rename = db.prepare('UPDATE members SET display_name = ?, real_name = ? WHERE id = ?');
  for (const state of MEMBER_STATES) {
    rename.run(nameOf(state), nameOf(state), matrix[state]);
    insertMemberClubAffiliation(db, matrix[state], clubId);
    insertMemberTierGrant(db, { member_id: matrix[state], new_tier_status: 'tier1', reason_code: 'purchase' });
  }
  db.close();

  createApp = await importApp();

  const table = await loadRouteTable();
  pages = [...new Set(table.allRoutes
    .filter((r) => r.method === 'GET' && !r.path.includes(':') && !r.path.startsWith('/admin'))
    .map((r) => r.path))]
    .concat([`/clubs/${clubKey}`, `/events/${EVENT_KEY}`])
    .sort();
});

afterAll(() => cleanupTestDb(dbPath));

async function fetchAs(url: string, viewer: 'anonymous' | 'member'): Promise<{ status: number; text: string }> {
  const req = request(createApp()).get(url);
  if (viewer === 'member') req.set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId: VIEWER })}`);
  const res = await req;
  return { status: res.status, text: res.text ?? '' };
}

describe('member-state listing sweep', () => {
  // Defect caught: the roster reads stop listing anyone, so every exclusion
  // below would pass by showing nobody at all.
  it('names the live member on the club roster and the official roster', async () => {
    const club = await fetchAs(`/clubs/${clubKey}`, 'member');
    expect(club.status).toBe(200);
    expect(club.text, 'club roster lists the live member').toContain(nameOf('live'));
    const roster = await fetchAs('/ifpa/roster', 'member');
    expect(roster.status).toBe(200);
    expect(roster.text, 'official roster lists the live member').toContain(nameOf('live'));
  });

  for (const viewer of ['anonymous', 'member'] as const) {
    // Defect caught: a listing statement forgets one member state, so a
    // deceased, deleted, erased or never-verified account is listed as a
    // current member.
    it(`lists no excluded member on any page a ${viewer === 'member' ? 'signed-in Tier 2 member' : 'visitor'} can open`, async () => {
      expect(pages.length, 'pages to sweep').toBeGreaterThan(30);
      const leaks: string[] = [];
      for (const url of pages) {
        const { text } = await fetchAs(url, viewer);
        for (const state of EXCLUDED) {
          if (text.includes(nameOf(state))) leaks.push(`${url} names the ${state} member`);
        }
      }
      expect(leaks).toEqual([]);
    });
  }
});

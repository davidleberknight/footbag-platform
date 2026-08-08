/**
 * The club roster, the member count and the country tiles must reflect what a
 * member actually did. Every live membership path writes member_club_affiliations,
 * so a roster or count built only from the imported legacy rows shows a member
 * nothing after they join, create or leave a club. These cases drive the real
 * routes and assert the public surfaces, seeded from the live tables rather than
 * the legacy ones.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3992');

import BetterSqlite3 from 'better-sqlite3';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import {
  insertTag,
  insertClub,
  insertClubLeader,
  insertMember,
  insertMemberClubAffiliation,
  insertMemberTierGrant,
  insertHistoricalPerson,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  createTestSessionJwt,
  completeOnboarding,
} from '../fixtures/factories';

const JOINER   = 'roster-joiner-001';
const LEAVER   = 'roster-leaver-001';
const ONLOOKER = 'roster-onlooker-001';
const FARAWAY  = 'roster-faraway-001';

const CLUB_IMPORTED = 'club-roster-imported';
const CLUB_LIVE     = 'club-roster-live';
const CLUB_FARAWAY  = 'club-roster-faraway';

const FARAWAY_COUNTRY = 'Testlandia';

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role: 'member' })}`;
}

function currentAffiliationCount(clubId: string): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return (db.prepare(
      'SELECT COUNT(*) AS c FROM member_club_affiliations WHERE club_id = ? AND is_current = 1',
    ).get(clubId) as { c: number }).c;
  } finally {
    db.close();
  }
}

// The country tiles carry their member count in the map data island rather than
// in visible text, so the assertion reads it from there.
function mapCountFor(html: string, country: string): number {
  const island = html.slice(html.indexOf('id="clubs-map-data"'));
  const json = island.slice(island.indexOf('>') + 1, island.indexOf('</script>'));
  const entry = (JSON.parse(json) as Array<{ name: string; memberCount: number }>)
    .find((c) => c.name === country);
  return entry?.memberCount ?? 0;
}

// The club page names people in more than one place, so roster assertions read
// the members block alone: a leader named in the leadership block proves
// nothing about the roster.
function rosterBlock(html: string): string {
  const start = html.indexOf('class="club-members"');
  if (start === -1) return '';
  const list = html.indexOf('club-member-list', start);
  return list === -1 ? '' : html.slice(list, html.indexOf('</ul>', list));
}

// The country page renders one list entry per club, keyed by club id.
function clubCard(html: string, clubId: string): string {
  const start = html.indexOf(`data-club-id="${clubId}"`);
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('</li>', start));
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  for (const [id, slug, name] of [
    [JOINER,   'roster_joiner',   'Rosa Joiner'],
    [ONLOOKER, 'roster_onlooker', 'Olive Onlooker'],
    [FARAWAY,  'roster_faraway',  'Fern Faraway'],
  ] as const) {
    insertMember(db, { id, slug, display_name: name, login_email: `${slug}@example.com`, country: 'USA' });
    completeOnboarding(db, id);
  }
  // Creating a club needs Tier 1 benefits.
  insertMemberTierGrant(db, { member_id: JOINER, new_tier_status: 'tier1', reason_code: 'purchase.tier1' });
  // The leaver claimed the historical person their imported affiliation names,
  // so leaving has an imported row to retire as well as a live one.
  insertMember(db, {
    id: LEAVER,
    slug: 'roster_leaver',
    display_name: 'Leo Leaver',
    login_email: 'roster_leaver@example.com',
    country: 'USA',
    historical_person_id: 'person-roster-leaver',
  });
  completeOnboarding(db, LEAVER);

  insertClub(db, {
    id: CLUB_IMPORTED,
    name: 'Imported Roster Club',
    city: 'Denver',
    country: 'USA',
    hashtag_tag_id: insertTag(db, {
      tag_normalized: '#club_imported_roster',
      tag_display: '#club_imported_roster',
      standard_type: 'club',
    }),
  });
  const importedCandidate = insertLegacyClubCandidate(db, {
    legacy_club_key: 'legacy_roster_imported',
    display_name: 'Imported Roster Club',
    country: 'USA',
    classification: 'pre_populate',
    mapped_club_id: CLUB_IMPORTED,
  });
  insertLegacyPersonClubAffiliation(db, {
    id: 'lpca-roster-leaver',
    historical_person_id: 'person-roster-leaver',
    legacy_club_candidate_id: importedCandidate,
    resolution_status: 'confirmed_current',
    resolved_club_id: CLUB_IMPORTED,
    inferred_role: 'member',
    display_name: 'Leo Leaver',
  });

  // A club that only ever existed on the platform: no candidate, so nothing in
  // the imported roster can describe it, and its only leader is a live row.
  insertClub(db, {
    id: CLUB_LIVE,
    name: 'Live Only Club',
    city: 'Portland',
    country: 'USA',
    hashtag_tag_id: insertTag(db, {
      tag_normalized: '#club_live_only',
      tag_display: '#club_live_only',
      standard_type: 'club',
    }),
  });
  insertClubLeader(db, { club_id: CLUB_LIVE, member_id: ONLOOKER });

  // A country of its own, so its tile count is not entangled with the clubs
  // above: one imported row still awaiting an answer, one a member declined,
  // one an admin de-listed, and one member who joined on the platform.
  insertClub(db, {
    id: CLUB_FARAWAY,
    name: 'Faraway Footbag Club',
    city: 'Farborough',
    country: FARAWAY_COUNTRY,
    hashtag_tag_id: insertTag(db, {
      tag_normalized: '#club_faraway',
      tag_display: '#club_faraway',
      standard_type: 'club',
    }),
  });
  const farawayCandidate = insertLegacyClubCandidate(db, {
    legacy_club_key: 'legacy_roster_faraway',
    display_name: 'Faraway Footbag Club',
    country: FARAWAY_COUNTRY,
    classification: 'pre_populate',
    mapped_club_id: CLUB_FARAWAY,
  });
  for (const [suffix, status, personName] of [
    ['pending',  'pending',     'Pending Person'],
    ['declined', 'rejected',    'Declined Person'],
    ['delisted', 'former_only', 'Delisted Person'],
  ] as const) {
    const personId = insertHistoricalPerson(db, {
      person_id: `person-faraway-${suffix}`,
      person_name: personName,
      country: 'US',
    });
    insertLegacyPersonClubAffiliation(db, {
      id: `lpca-faraway-${suffix}`,
      historical_person_id: personId,
      legacy_club_candidate_id: farawayCandidate,
      resolution_status: status,
      ...(status === 'pending' ? {} : { resolved_club_id: CLUB_FARAWAY }),
      inferred_role: 'member',
      display_name: personName,
    });
  }
  insertMemberClubAffiliation(db, FARAWAY, CLUB_FARAWAY);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('a club roster shows the members who joined it', () => {
  it('a member who joins appears on the roster and in the member count', async () => {
    const app = createApp();
    const join = await request(app)
      .post('/clubs/club_live_only/join')
      .set('Cookie', cookieFor(JOINER));
    expect(join.status).toBe(303);
    expect(currentAffiliationCount(CLUB_LIVE)).toBe(1);

    const page = await request(app)
      .get('/clubs/club_live_only')
      .set('Cookie', cookieFor(ONLOOKER));
    expect(page.status).toBe(200);
    expect(rosterBlock(page.text)).toContain('Rosa Joiner');

    // The count chip lives on the club's directory card.
    const directory = await request(app).get('/clubs/usa').set('Cookie', cookieFor(ONLOOKER));
    expect(clubCard(directory.text, CLUB_LIVE)).toContain('1 member');
  });

  it('the roster still renders to members only', async () => {
    const anonymous = await request(createApp()).get('/clubs/club_live_only');
    expect(anonymous.status).toBe(200);
    expect(rosterBlock(anonymous.text)).not.toContain('Rosa Joiner');
  });

  it('a club created on the platform lists its creator, who has no imported record at all', async () => {
    const app = createApp();
    const create = await request(app)
      .post('/clubs/create')
      .set('Cookie', cookieFor(JOINER))
      .type('form')
      .send({ name: 'Joiner Footbag Collective', city: 'Boise', country: 'USA' });
    expect(create.status).toBe(303);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    let key: string;
    try {
      key = (db.prepare(`
        SELECT t.tag_normalized AS tag FROM clubs c
          JOIN tags t ON t.id = c.hashtag_tag_id
         WHERE c.name = 'Joiner Footbag Collective'
      `).get() as { tag: string }).tag.replace('#', '');
    } finally {
      db.close();
    }

    const page = await request(app)
      .get(`/clubs/${key}`)
      .set('Cookie', cookieFor(ONLOOKER));
    expect(page.status).toBe(200);
    expect(rosterBlock(page.text)).toContain('Rosa Joiner');
  });

  it('a member who leaves drops off the roster, imported row and all', async () => {
    const app = createApp();
    const join = await request(app)
      .post('/clubs/club_imported_roster/join')
      .set('Cookie', cookieFor(LEAVER));
    expect(join.status).toBe(303);

    const joined = await request(app)
      .get('/clubs/club_imported_roster')
      .set('Cookie', cookieFor(ONLOOKER));
    expect(rosterBlock(joined.text)).toContain('Leo Leaver');

    const leave = await request(app)
      .post('/clubs/club_imported_roster/leave')
      .set('Cookie', cookieFor(LEAVER))
      .type('form')
      .send({ confirmed: '1' });
    expect(leave.status).toBe(303);

    const after = await request(app)
      .get('/clubs/club_imported_roster')
      .set('Cookie', cookieFor(ONLOOKER));
    expect(after.status).toBe(200);
    expect(rosterBlock(after.text)).not.toContain('Leo Leaver');

    // The historical fact survives the departure; only its current-roster
    // standing is retired.
    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const row = db.prepare(
        'SELECT resolution_status FROM legacy_person_club_affiliations WHERE id = ?',
      ).get('lpca-roster-leaver') as { resolution_status: string };
      expect(row.resolution_status).toBe('former_only');
    } finally {
      db.close();
    }
  });

  it('a member holding both an imported row and a live affiliation is listed once', async () => {
    const app = createApp();
    const rejoin = await request(app)
      .post('/clubs/club_imported_roster/join')
      .set('Cookie', cookieFor(LEAVER));
    expect(rejoin.status).toBe(303);

    const page = await request(app)
      .get('/clubs/club_imported_roster')
      .set('Cookie', cookieFor(ONLOOKER));
    expect(page.status).toBe(200);
    expect(rosterBlock(page.text).split('Leo Leaver').length - 1).toBe(1);
  });
});

describe('the clubs directory counts the same people', () => {
  it('a club whose only leader joined on the platform is not labelled leaderless', async () => {
    const page = await request(createApp())
      .get('/clubs/usa')
      .set('Cookie', cookieFor(JOINER));
    expect(page.status).toBe(200);

    const card = clubCard(page.text, CLUB_LIVE);
    expect(card).not.toContain('No known leaders yet');
    expect(card).toContain('Olive Onlooker');
  });

  it('a country tile counts unanswered and live memberships, and nothing a member or admin has resolved', async () => {
    const page = await request(createApp()).get('/clubs');
    expect(page.status).toBe(200);
    // One imported row still awaiting an answer plus one member who joined
    // here; the declined row and the de-listed row are not membership.
    expect(mapCountFor(page.text, FARAWAY_COUNTRY)).toBe(2);
  });
});

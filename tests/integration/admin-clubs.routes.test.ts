/**
 * Administrator correction of a club's own content and of the hashtag that is
 * its address.
 *
 * A club's co-leaders are the ordinary path for these fields; this surface is
 * the backstop for when they cannot or will not use it. So the suite pins that
 * the correction obeys the co-leaders' own rules rather than a looser set, that
 * the reason is mandatory, that the audit row says an administrator made it and
 * carries each changed value before and after, that every current co-leader is
 * told, and that a hashtag move takes the club's public address with it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertClub, insertClubLeader, insertTag, completeOnboarding, createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3440');

const ADMIN_ID   = 'ac_admin';
const LEADER_ID  = 'ac_leader';
const COLEAD_ID  = 'ac_colead';
const CLUB_ID    = 'club-test-ac-main';
const RIVAL_ID   = 'club-test-ac-rival';
const GONE_ID    = 'club-test-ac-archived';

let createApp: Awaited<ReturnType<typeof importApp>>;
let conn: BetterSqlite3.Database;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

function leaderCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: LEADER_ID })}`;
}

function clubRow(id = CLUB_ID): {
  name: string; description: string; city: string; region: string | null;
  country: string; external_url: string | null; status: string; version: number;
} {
  return conn.prepare(
    'SELECT name, description, city, region, country, external_url, status, version'
    + ' FROM clubs WHERE id = ?',
  ).get(id) as {
    name: string; description: string; city: string; region: string | null;
    country: string; external_url: string | null; status: string; version: number;
  };
}

function clubTag(id = CLUB_ID): string {
  return (conn.prepare(
    'SELECT t.tag_normalized FROM clubs c JOIN tags t ON t.id = c.hashtag_tag_id WHERE c.id = ?',
  ).get(id) as { tag_normalized: string }).tag_normalized;
}

function auditRows(actionType: string, clubId = CLUB_ID): Array<{
  actor_type: string; actor_member_id: string | null;
  reason_text: string | null; metadata_json: string;
}> {
  return conn.prepare(
    'SELECT actor_type, actor_member_id, reason_text, metadata_json FROM audit_entries'
    + ' WHERE action_type = ? AND entity_id = ? ORDER BY id',
  ).all(actionType, clubId) as Array<{
    actor_type: string; actor_member_id: string | null;
    reason_text: string | null; metadata_json: string;
  }>;
}

function noticesTo(memberId: string): Array<{ template_key: string; body_text: string }> {
  return conn.prepare(
    "SELECT template_key, body_text FROM outbox_emails"
    + " WHERE recipient_member_id = ? AND template_key = 'club_record_corrected'",
  ).all(memberId) as Array<{ template_key: string; body_text: string }>;
}

/** The whole club form, as the record posts it, with fields overridden. */
function submission(over: Record<string, string> = {}): Record<string, string> {
  return {
    name:         'Aukland Footbag',
    description:  'The original description.',
    city:         'Aukland',
    region:       '',
    country:      'New Zealand',
    external_url: '',
    reason:       'The city is misspelled and the leaders have both gone quiet.',
    ...over,
  };
}

beforeAll(async () => {
  conn = createTestDb(dbPath);
  insertMember(conn, {
    id: ADMIN_ID, slug: 'ac-admin', display_name: 'Ada Admin', real_name: 'Ada Admin',
    login_email: 'ac-admin@example.com', is_admin: 1,
  });
  insertMember(conn, {
    id: LEADER_ID, slug: 'ac-leader', display_name: 'Lea Leader', real_name: 'Lea Leader',
    login_email: 'ac-leader@example.com',
  });
  insertMember(conn, {
    id: COLEAD_ID, slug: 'ac-colead', display_name: 'Cal Colead', real_name: 'Cal Colead',
    login_email: 'ac-colead@example.com',
  });
  completeOnboarding(conn, ADMIN_ID);
  completeOnboarding(conn, LEADER_ID);
  completeOnboarding(conn, COLEAD_ID);

  // A publicly addressable hashtag, because the club's page and its gallery are
  // reached through it and a hashtag move has to be seen to take them along.
  insertClub(conn, {
    id: CLUB_ID,
    hashtag_tag_id: insertTag(conn, {
      tag_normalized: '#club_ac_main', tag_display: '#club_ac_main', standard_type: 'club',
    }),
    name: 'Aukland Footbag',
    description: 'The original description.',
    city: 'Aukland',
    region: null,
    country: 'New Zealand',
  });
  // Same country, different name: what a rename must not be allowed to collide
  // with, since two clubs never share an exact name within one country.
  insertClub(conn, {
    id: RIVAL_ID,
    hashtag_tag_id: insertTag(conn, {
      tag_normalized: '#club_ac_rival', tag_display: '#club_ac_rival', standard_type: 'club',
    }),
    name: 'Wellington Footbag',
    city: 'Wellington',
    country: 'New Zealand',
  });
  // An archived club: the public listings drop it, and the record exists to
  // reach exactly the clubs those listings exclude.
  insertClub(conn, {
    id: GONE_ID,
    hashtag_tag_id: insertTag(conn, {
      tag_normalized: '#club_ac_archived', tag_display: '#club_ac_archived', standard_type: 'club',
    }),
    name: 'Dunedin Footbag',
    city: 'Dunedin',
    country: 'New Zealand',
    status: 'archived',
  });
  insertClubLeader(conn, { id: 'cl-test-ac-1', club_id: CLUB_ID, member_id: LEADER_ID });
  insertClubLeader(conn, { id: 'cl-test-ac-2', club_id: CLUB_ID, member_id: COLEAD_ID });

  createApp = await importApp();
});

afterAll(() => {
  conn.close();
  cleanupTestDb(dbPath);
});

describe('the club lookup reaches every club, not only the listed ones', () => {
  it('prompts before a search and finds a club by part of its name', async () => {
    const empty = await request(createApp()).get('/admin/clubs').set('Cookie', adminCookie());
    expect(empty.status).toBe(200);
    expect(empty.text).toContain('Search for a club');

    const found = await request(createApp())
      .get('/admin/clubs?q=aukland').set('Cookie', adminCookie());
    expect(found.status).toBe(200);
    expect(found.text).toContain('Aukland Footbag');
    expect(found.text).toContain(`/admin/clubs/${CLUB_ID}`);
  });

  it('finds a club by its hashtag written any of the three ways it appears', async () => {
    const withHash = await request(createApp())
      .get('/admin/clubs?q=%23club_ac_main').set('Cookie', adminCookie());
    const withPrefix = await request(createApp())
      .get('/admin/clubs?q=club_ac_main').set('Cookie', adminCookie());
    const bare = await request(createApp())
      .get('/admin/clubs?q=ac_main').set('Cookie', adminCookie());

    expect(withHash.text).toContain(`/admin/clubs/${CLUB_ID}`);
    expect(withPrefix.text).toContain(`/admin/clubs/${CLUB_ID}`);
    expect(bare.text).toContain(`/admin/clubs/${CLUB_ID}`);
  });

  it('reaches an archived club, which the public directory does not list', async () => {
    const res = await request(createApp())
      .get('/admin/clubs?q=dunedin').set('Cookie', adminCookie());
    expect(res.text).toContain('Dunedin Footbag');
    expect(res.text).toContain('Archived');
  });

  it('refuses a search too short to mean anything, rather than matching everything', async () => {
    const res = await request(createApp()).get('/admin/clubs?q=a').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('at least 2 characters');
    expect(res.text).not.toContain('Aukland Footbag');
  });
});

describe('the club record opens on what the club holds', () => {
  it('prefills every correctable field and names the co-leaders who will be told', async () => {
    const res = await request(createApp())
      .get(`/admin/clubs/${CLUB_ID}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('value="Aukland Footbag"');
    expect(res.text).toContain('value="Aukland"');
    expect(res.text).toContain('value="New Zealand"');
    // The platform owns the '#club_' in front, so only the part that moves is
    // offered for editing.
    expect(res.text).toContain('value="ac_main"');
    expect(res.text).toContain('Lea Leader');
    expect(res.text).toContain('Cal Colead');
  });

  it('is a 404 for a club id that resolves to nothing', async () => {
    const res = await request(createApp())
      .get('/admin/clubs/club-test-nobody').set('Cookie', adminCookie());
    expect(res.status).toBe(404);
  });
});

describe('the details preview writes nothing and reports what would move', () => {
  it('names each changed field with its value before and after', async () => {
    const res = await request(createApp())
      .post(`/admin/clubs/${CLUB_ID}/content`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({ city: 'Auckland' }));

    expect(res.status).toBe(200);
    expect(res.text).toContain('City');
    expect(res.text).toContain('Aukland');
    expect(res.text).toContain('Auckland');
    expect(clubRow().city).toBe('Aukland');
    expect(auditRows('club.content_corrected')).toHaveLength(0);
  });

  it('says so plainly when the submission would change nothing', async () => {
    const res = await request(createApp())
      .post(`/admin/clubs/${CLUB_ID}/content`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission());

    expect(res.status).toBe(200);
    expect(res.text).toContain('Nothing would change');
  });

  it('refuses a correction with no reason, on the record it came from', async () => {
    const res = await request(createApp())
      .post(`/admin/clubs/${CLUB_ID}/content`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({ city: 'Auckland', reason: '   ' }));

    expect(res.status).toBe(422);
    expect(res.text).toContain('Enter the reason for this correction.');
    expect(clubRow().city).toBe('Aukland');
  });

  it("holds the administrator to the co-leaders' own rules, not a looser set", async () => {
    const blank = await request(createApp())
      .post(`/admin/clubs/${CLUB_ID}/content`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({ name: '' }));
    expect(blank.status).toBe(422);
    expect(blank.text).toContain('Club name is required.');

    const collision = await request(createApp())
      .post(`/admin/clubs/${CLUB_ID}/content`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({ name: 'Wellington Footbag' }));
    expect(collision.status).toBe(422);
    expect(collision.text).toContain('already exists in that country');
    expect(clubRow().name).toBe('Aukland Footbag');
  });
});

describe('a confirmed details correction', () => {
  it('writes the club, records who did it and why, and tells every co-leader', async () => {
    const res = await request(createApp())
      .post(`/admin/clubs/${CLUB_ID}/content/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({ city: 'Auckland', description: 'A corrected description.' }));

    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(`/admin/clubs/${CLUB_ID}`);

    const row = clubRow();
    expect(row.city).toBe('Auckland');
    expect(row.description).toBe('A corrected description.');

    const audit = auditRows('club.content_corrected');
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor_type).toBe('admin');
    expect(audit[0]!.actor_member_id).toBe(ADMIN_ID);
    expect(audit[0]!.reason_text).toBe(submission().reason);
    expect(JSON.parse(audit[0]!.metadata_json).changes).toMatchObject({
      city:        { before: 'Aukland', after: 'Auckland' },
      description: { before: 'The original description.', after: 'A corrected description.' },
    });

    // Both co-leaders, because they are a flat equal set with no first among
    // them, so there is no co-leader the others would hear it from.
    expect(noticesTo(LEADER_ID)).toHaveLength(1);
    expect(noticesTo(COLEAD_ID)).toHaveLength(1);
    expect(noticesTo(LEADER_ID)[0]!.body_text).toContain("the club's city");
    expect(noticesTo(LEADER_ID)[0]!.body_text).toContain(submission().reason);
  });

  it('reports the correction on the record it returns to', async () => {
    const res = await request(createApp())
      .post(`/admin/clubs/${CLUB_ID}/content/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({ city: 'Auckland', description: 'A corrected description.', country: 'Aotearoa' }));
    const flash = (res.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0]).join('; ');

    const shown = await request(createApp())
      .get(`/admin/clubs/${CLUB_ID}`).set('Cookie', `${adminCookie()}; ${flash}`);
    expect(shown.status).toBe(200);
    expect(shown.text).toContain('have been corrected');
  });

  it('writes nothing at all when the submission moves nothing', async () => {
    const before = auditRows('club.content_corrected').length;
    const current = clubRow();

    const res = await request(createApp())
      .post(`/admin/clubs/${CLUB_ID}/content/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({
        name: current.name, description: current.description, city: current.city,
        region: current.region ?? '', country: current.country,
      }));

    expect(res.status).toBe(303);
    expect(auditRows('club.content_corrected')).toHaveLength(before);
    expect(clubRow().version).toBe(current.version);
  });

  it('persists only the fields the form owns, whatever else is posted with them', async () => {
    const before = clubRow();
    const res = await request(createApp())
      .post(`/admin/clubs/${CLUB_ID}/content/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({
        ...submission({ city: 'Tāmaki Makaurau', country: before.country, name: before.name, description: before.description }),
        status:  'archived',
        id:      'club-test-somewhere-else',
        version: '9999',
      });

    expect(res.status).toBe(303);
    const after = clubRow();
    expect(after.city).toBe('Tāmaki Makaurau');
    expect(after.status).toBe('active');
    expect(clubRow('club-test-somewhere-else')).toBeUndefined();
  });
});

describe("a co-leader's own edit is still their own act", () => {
  it('records the member action type with no reason, not the administrator one', async () => {
    const before = auditRows('club.content_corrected').length;
    const res = await request(createApp())
      .post('/clubs/club_ac_main/content/edit')
      .set('Cookie', leaderCookie())
      .type('form')
      .send({
        name: 'Aukland Footbag', description: 'Written by a leader.',
        city: clubRow().city, region: '', country: clubRow().country, external_url: '',
      });

    expect(res.status).toBe(303);
    const own = auditRows('club.content_edited');
    expect(own.length).toBeGreaterThan(0);
    expect(own[own.length - 1]!.actor_type).toBe('member');
    expect(own[own.length - 1]!.actor_member_id).toBe(LEADER_ID);
    expect(own[own.length - 1]!.reason_text).toBeNull();
    expect(auditRows('club.content_corrected')).toHaveLength(before);
  });
});

describe('the hashtag is the club address, so moving it is its own act', () => {
  it('warns before it moves, and writes nothing at the preview', async () => {
    const res = await request(createApp())
      .post(`/admin/clubs/${CLUB_ID}/hashtag`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ hashtag_slug: 'auckland_footbag', reason: 'The city was misspelled in the address too.' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('#club_ac_main');
    expect(res.text).toContain('#club_auckland_footbag');
    expect(res.text).toContain('cannot be undone');
    expect(clubTag()).toBe('#club_ac_main');
  });

  it('refuses a hashtag that is not one, and one another tag already holds', async () => {
    const bad = await request(createApp())
      .post(`/admin/clubs/${CLUB_ID}/hashtag`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ hashtag_slug: 'x', reason: 'Trying a single character.' });
    expect(bad.status).toBe(422);
    expect(bad.text).toContain('at least two characters');

    const taken = await request(createApp())
      .post(`/admin/clubs/${CLUB_ID}/hashtag`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ hashtag_slug: 'ac_rival', reason: "Trying another club's address." });
    expect(taken.status).toBe(422);
    expect(taken.text).toContain('already holds that hashtag');
    expect(clubTag()).toBe('#club_ac_main');
  });

  it('writes nothing when the submitted hashtag is the one already held', async () => {
    const preview = await request(createApp())
      .post(`/admin/clubs/${CLUB_ID}/hashtag`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ hashtag_slug: 'ac_main', reason: 'Re-confirming the address.' });
    expect(preview.text).toContain('Nothing would change');

    const confirmed = await request(createApp())
      .post(`/admin/clubs/${CLUB_ID}/hashtag/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ hashtag_slug: 'ac_main', reason: 'Re-confirming the address.' });
    expect(confirmed.status).toBe(303);
    expect(auditRows('club.hashtag_corrected')).toHaveLength(0);
  });

  it('moves the address, takes the public page with it, and tells the co-leaders', async () => {
    const reason = 'The city was misspelled in the address too.';
    const res = await request(createApp())
      .post(`/admin/clubs/${CLUB_ID}/hashtag/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ hashtag_slug: 'auckland_footbag', reason });

    expect(res.status).toBe(303);
    expect(clubTag()).toBe('#club_auckland_footbag');

    const audit = auditRows('club.hashtag_corrected');
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor_type).toBe('admin');
    expect(audit[0]!.reason_text).toBe(reason);
    expect(JSON.parse(audit[0]!.metadata_json)).toMatchObject({
      old_tag: '#club_ac_main', new_tag: '#club_auckland_footbag',
    });

    // The old address is dead and nothing redirects from it; the new one serves.
    const dead = await request(createApp()).get('/clubs/club_ac_main');
    expect(dead.status).toBe(404);
    const live = await request(createApp()).get('/clubs/club_auckland_footbag');
    expect(live.status).toBe(200);

    // Picked out by what it says rather than by position: outbox ids are random,
    // so "the last one" is not a thing a query can ask for.
    const aboutTheHashtag = noticesTo(LEADER_ID).filter((n) => n.body_text.includes('hashtag'));
    expect(aboutTheHashtag).toHaveLength(1);
    expect(aboutTheHashtag[0]!.body_text).toContain(reason);
  });
});

describe('a multi-line description resubmitted unchanged changes nothing', () => {
  // A browser sends a textarea's line breaks as CRLF whatever value it was
  // given, while the database holds LF. Without normalisation the two never
  // match, so an administrator previewing a correction they have not written is
  // told the description changed, confirming it writes an audit row claiming a
  // change no reader can see, and the refusal below can never fire. The text
  // here carries real line breaks for that reason: a single-line description
  // cannot express the defect at all.
  const MULTILINE = 'The first line of it.\nThe second line of it.\nAnd a third.';

  const rivalForm = (description: string): Record<string, string> => ({
    name:         'Wellington Footbag',
    description,
    city:         'Wellington',
    region:       '',
    country:      'New Zealand',
    external_url: '',
    reason:       'Setting up the line-ending case.',
  });

  it('accepts the description with the line breaks a browser would send', async () => {
    const res = await request(createApp())
      .post(`/admin/clubs/${RIVAL_ID}/content/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(rivalForm(MULTILINE));
    expect(res.status).toBe(303);
    expect(clubRow(RIVAL_ID).description).toBe(MULTILINE);
  });

  it('reports no change when the same text comes back with CRLF line breaks', async () => {
    const asBrowserSends = MULTILINE.replace(/\n/g, '\r\n');
    const preview = await request(createApp())
      .post(`/admin/clubs/${RIVAL_ID}/content`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(rivalForm(asBrowserSends));

    expect(preview.status).toBe(200);
    expect(preview.text).toContain('Nothing would change');
  });

  it('writes no audit row and leaves the stored text alone on that resubmission', async () => {
    const before = auditRows('club.content_corrected', RIVAL_ID).length;
    const res = await request(createApp())
      .post(`/admin/clubs/${RIVAL_ID}/content/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(rivalForm(MULTILINE.replace(/\n/g, '\r\n')));

    expect(res.status).toBe(303);
    expect(auditRows('club.content_corrected', RIVAL_ID)).toHaveLength(before);
    // Stored exactly as it went in: normalisation collapses CRLF, it does not
    // strip the line breaks themselves.
    expect(clubRow(RIVAL_ID).description).toBe(MULTILINE);
  });
});

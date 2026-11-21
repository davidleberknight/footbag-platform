/**
 * How the public event pages list and show events.
 *
 * The contract: the events landing page lists every public upcoming event,
 * one that has started but not yet ended included, each as a card linking to
 * its event page with its registration status; a draft, pending or canceled
 * event is never listed. Below them come the current year's completed events,
 * and beside them a side list linking each archive year. A year page lists its
 * completed events as the same items, with their hashtag and no status, and
 * ends with one link back to the landing page. An event page groups its
 * divisions by competition category with each division's count, shows results
 * only once the event has taken place, and colours first to third place. A
 * member is offered registration only when there is a division to enter.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { isoDaysFromNow, isoDaysAgo } from '../fixtures/clock';
import {
  createMemberAtTier,
  completeOnboarding,
  createTestSessionJwt,
  insertEvent,
  insertDiscipline,
  insertRegistration,
  insertRegistrationDisciplineSelection,
  insertResultsUpload,
  insertResultEntry,
  insertResultParticipant,
  insertMediaItem,
  attachMediaTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4996');

let createApp: Awaited<ReturnType<typeof importApp>>;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

const day = (iso: string): string => iso.slice(0, 10);
const thisYear = new Date().getUTCFullYear();

interface Seeded { id: string; key: string }

function seedEvent(o: {
  status: 'reg_open' | 'closed' | 'completed' | 'draft' | 'pending_approval' | 'canceled';
  start: string;
  end?: string;
  registration_status?: 'open' | 'closed';
  attendees?: boolean;
}): Seeded {
  return withDb((db) => {
    const id = insertEvent(db, {
      status: o.status, start_date: o.start, end_date: o.end ?? o.start,
      registration_status: o.registration_status ?? 'open',
      is_attendee_registration_open: o.attendees ? 1 : 0,
    });
    const tag = (db.prepare('SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?')
      .get(id) as { tag_normalized: string }).tag_normalized;
    return { id, key: tag.slice(1) };
  });
}

/** The markup from an element with the given id to the end of its block. */
function region(html: string, id: string, endMarker: string): string {
  const start = html.indexOf(`id="${id}"`);
  expect(start, `${id} is on the page`).toBeGreaterThan(-1);
  const end = html.indexOf(endMarker, start);
  return html.slice(start, end === -1 ? undefined : end);
}

let upcoming: Seeded;
let paused: Seeded;
let underWay: Seeded;
let endsToday: Seeded;
let draft: Seeded;
let pending: Seeded;
let canceled: Seeded;
let currentYearDone: Seeded;
let pastYearDone: Seeded;
let member: string;
let netSingles: string;
let freestyle: string;

beforeAll(async () => {
  createTestDb(dbPath).close();
  createApp = await importApp();
  upcoming = seedEvent({ status: 'reg_open', start: day(isoDaysFromNow(40)) });
  paused = seedEvent({ status: 'reg_open', start: day(isoDaysFromNow(41)), registration_status: 'closed' });
  underWay = seedEvent({ status: 'closed', start: day(isoDaysAgo(1)), end: day(isoDaysFromNow(1)) });
  endsToday = seedEvent({ status: 'closed', start: day(isoDaysAgo(2)), end: day(new Date().toISOString()) });
  draft = seedEvent({ status: 'draft', start: day(isoDaysFromNow(42)) });
  pending = seedEvent({ status: 'pending_approval', start: day(isoDaysFromNow(43)) });
  canceled = seedEvent({ status: 'canceled', start: day(isoDaysFromNow(44)) });
  currentYearDone = seedEvent({ status: 'completed', start: `${thisYear}-01-01` });
  pastYearDone = seedEvent({ status: 'completed', start: `${thisYear - 3}-07-04` });

  withDb((db) => {
    member = 'listing-member';
    createMemberAtTier(db, { id: member, slug: 'listing_member', tier: 'tier1', memberOverrides: { display_name: 'Listing Member', login_email: 'listing@example.com' } });
    completeOnboarding(db, member);
    netSingles = insertDiscipline(db, upcoming.id, { name: 'Open Singles Net', discipline_category: 'net', team_type: 'singles', gender_eligibility: 'open', division_class: 'open', sort_order: 1 });
    freestyle = insertDiscipline(db, upcoming.id, { name: 'Open Routines', discipline_category: 'freestyle', team_type: 'singles', gender_eligibility: 'open', division_class: 'open', sort_order: 2 });
    insertDiscipline(db, upcoming.id, { name: 'Intermediate Singles Net', discipline_category: 'net', team_type: 'singles', gender_eligibility: 'open', division_class: 'intermediate', sort_order: 3 });
    const reg = insertRegistration(db, upcoming.id, member);
    insertRegistrationDisciplineSelection(db, reg, netSingles);

    const done = insertDiscipline(db, pastYearDone.id, { name: 'Open Singles Net', discipline_category: 'net', team_type: 'singles', gender_eligibility: 'open', division_class: 'open', sort_order: 1 });
    const upload = insertResultsUpload(db, pastYearDone.id, member);
    for (const place of [1, 2, 3, 4]) {
      const entry = insertResultEntry(db, pastYearDone.id, upload, done, { placement: place });
      insertResultParticipant(db, entry, `Player ${place}`);
    }

    // One photo carries the paused event's hashtag; no media carries the others'.
    const pausedTagId = (db.prepare('SELECT hashtag_tag_id AS id FROM events WHERE id = ?').get(paused.id) as { id: string }).id;
    attachMediaTag(db, insertMediaItem(db, { uploader_member_id: member, caption: 'Paused event photo' }), pausedTagId);
  });
});

afterAll(() => cleanupTestDb(dbPath));

describe('the events landing page', () => {
  // Defect caught: a public upcoming event, or one already under way, cannot
  // be found from the landing page, or a draft, pending or canceled event is
  // shown to the public.
  it('lists every public upcoming event and nothing unpublished', async () => {
    const res = await request(createApp()).get('/events');
    expect(res.status).toBe(200);
    const listed = region(res.text, 'upcoming-events', '</section>');
    for (const e of [upcoming, paused, underWay, endsToday]) expect(listed, e.key).toContain(`href="/events/${e.key}"`);
    for (const e of [draft, pending, canceled]) expect(res.text, e.key).not.toContain(`/events/${e.key}`);
  });

  // Defect caught: a paused event's card promises open registration the form
  // will refuse.
  it('shows each card with its registration status, closed while paused', async () => {
    const listed = region((await request(createApp()).get('/events')).text, 'upcoming-events', '</section>');
    const card = (key: string) => listed.slice(listed.lastIndexOf('<article', listed.indexOf(`/events/${key}"`)), listed.indexOf('</article>', listed.indexOf(`/events/${key}"`)));
    expect(card(upcoming.key)).toContain('badge-reg_open');
    expect(card(paused.key)).toContain('badge-closed');
    expect(card(paused.key)).not.toContain('badge-reg_open');
  });

  // Defect caught: a visitor never learns the hashtag to share an event's photos
  // under, or a hashtag no media carries links to an empty gallery, or one that
  // media does carry does not open its gallery.
  it("shows each card's hashtag, linked to the gallery only when media carries it", async () => {
    const listed = region((await request(createApp()).get('/events')).text, 'upcoming-events', '</section>');
    const card = (key: string) => listed.slice(listed.lastIndexOf('<article', listed.indexOf(`/events/${key}"`)), listed.indexOf('</article>', listed.indexOf(`/events/${key}"`)));
    expect(card(upcoming.key)).toContain(`<span class="hashtag">#${upcoming.key}</span>`);
    expect(card(upcoming.key)).not.toContain('context=');
    expect(card(paused.key)).toContain(`<a class="hashtag hashtag--media" href="/media/browse?context=${paused.key}">#${paused.key}</a>`);
  });

  // Defect caught: a completed event is listed on the landing page as a line
  // item, when past events are reached only through their year's button.
  it('lists no completed event on the landing page, this year or earlier', async () => {
    const res = await request(createApp()).get('/events');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(`/events/${currentYearDone.key}"`);
    expect(res.text).not.toContain(`/events/${pastYearDone.key}"`);
  });

  // Defect caught: an archive year is missing from the year buttons, or a year
  // with no completed public event links to an empty page.
  it('links exactly the years that have completed public events', async () => {
    const side = region((await request(createApp()).get('/events')).text, 'past-events', '</section>');
    const years = [...side.matchAll(/href="\/events\/year\/(\d{4})"/g)].map((m) => Number(m[1])).sort();
    expect(years).toEqual([thisYear - 3, thisYear].sort());
  });
});

describe('a year page', () => {
  // Defect caught: a year page draws its events differently from the landing
  // page, shows a registration badge on a finished event, or loses its way
  // back to the landing page.
  it('lists each completed event with its hashtag, no status, and one back link', async () => {
    const res = await request(createApp()).get(`/events/year/${thisYear - 3}`);
    expect(res.status).toBe(200);
    const list = region(res.text, 'year-events', '</section>');
    expect(list).toContain(`href="/events/${pastYearDone.key}"`);
    expect(list).toContain(`#${pastYearDone.key}`);
    expect(list).not.toMatch(/badge-(reg_open|closed)/);
    expect(res.text.match(/class="page-back-link"><a href="\/events"/g)).toHaveLength(1);
  });
});

describe('an event page', () => {
  // Defect caught: a visitor cannot see how many have entered each category's
  // divisions, or divisions of different categories are mixed together.
  it('groups the divisions by competition category with each count', async () => {
    const res = await request(createApp()).get(`/events/${upcoming.key}`);
    const categories = region(res.text, 'competition-categories', 'id="results"');
    const netAt = categories.indexOf('Open Singles Net');
    const intermediateAt = categories.indexOf('Intermediate Singles Net');
    const freestyleAt = categories.indexOf('Open Routines');
    // Both net divisions sit together, ahead of the freestyle group, though
    // the freestyle division was entered between them.
    expect(netAt).toBeGreaterThan(-1);
    expect(intermediateAt).toBeGreaterThan(netAt);
    expect(freestyleAt).toBeGreaterThan(intermediateAt);
    expect(categories.match(/<h3>/g)).toHaveLength(2);
    expect(categories).toContain('1 registered');
    expect(freestyle).toBeTruthy();
  });

  // Defect caught: an event still to come shows a results section that can
  // only ever say there are none, or a finished event loses its results.
  it('shows results for a completed event only', async () => {
    expect((await request(createApp()).get(`/events/${upcoming.key}`)).text).not.toContain('id="results"');
    // Closed for registration is still an event to come.
    expect((await request(createApp()).get(`/events/${underWay.key}`)).text).not.toContain('id="results"');
    expect((await request(createApp()).get(`/events/${pastYearDone.key}`)).text).toContain('id="results"');
  });

  // Defect caught: a member is offered a registration form for an event with
  // nothing to enter, which then refuses every submission.
  it('offers registration only when the event has a division to enter', async () => {
    const bare = seedEvent({ status: 'reg_open', start: day(isoDaysFromNow(50)) });
    const withDivision = seedEvent({ status: 'reg_open', start: day(isoDaysFromNow(51)) });
    withDb((db) => insertDiscipline(db, withDivision.id, {
      name: 'Open Singles Net', discipline_category: 'net', team_type: 'singles',
      gender_eligibility: 'open', division_class: 'open', sort_order: 1,
    }));
    // An attendee needs no division, and a standing spanning several
    // categories beside a real division leaves that division enterable.
    const attendeesOnly = seedEvent({ status: 'reg_open', start: day(isoDaysFromNow(52)), attendees: true });
    const withStanding = seedEvent({ status: 'reg_open', start: day(isoDaysFromNow(53)) });
    withDb((db) => {
      insertDiscipline(db, withStanding.id, {
        name: 'Open Singles Net', discipline_category: 'net', team_type: 'singles',
        gender_eligibility: 'open', division_class: 'open', sort_order: 1,
      });
      insertDiscipline(db, withStanding.id, {
        name: 'Overall', discipline_category: null, team_type: 'singles', gender_eligibility: 'open',
        division_class: 'open', is_aggregate_standing: 1, sort_order: 2,
      });
    });
    const cookie = `__Host-footbag_session=${createTestSessionJwt({ memberId: member })}`;
    const page = async (key: string) => (await request(createApp()).get(`/events/${key}`).set('Cookie', cookie)).text;
    expect(await page(withDivision.key)).toContain(`href="/events/${withDivision.key}/register"`);
    expect(await page(bare.key)).not.toContain(`/events/${bare.key}/register`);
    expect(await page(attendeesOnly.key)).toContain(`href="/events/${attendeesOnly.key}/register"`);
    expect(await page(withStanding.key)).toContain(`href="/events/${withStanding.key}/register"`);
  });

  // Defect caught: the podium is not marked, or fourth place is coloured as a medal.
  it('colours first to third place and no other', async () => {
    const results = region((await request(createApp()).get(`/events/${pastYearDone.key}`)).text, 'results', '</table>');
    const cells = [...results.matchAll(/<td class="placement-num ([a-z]*)">(\d+)<\/td>/g)].map((m) => [m[2], m[1]]);
    expect(Object.fromEntries(cells)).toEqual({ 1: 'gold', 2: 'silver', 3: 'bronze', 4: '' });
  });
});

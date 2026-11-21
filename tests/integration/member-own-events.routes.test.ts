/**
 * A member's own events on their profile, and where a player's past events
 * lead.
 *
 * The contract: the owner's profile lists, as upcoming events, the public
 * events they hold a confirmed registration for that have not yet ended, each
 * linking to its event page, with its gallery when the event's hashtag carries
 * media. A pending or canceled registration is not an upcoming event, and an
 * event the member only organizes is listed with their organizer controls, not
 * as one they are registered for. Their past events with results are the
 * Competitive Results table, which names where each event was held and links
 * its gallery; the same table on the public profile and the historical player
 * page does the same. The event page shows the member their own registration:
 * its divisions and partner.
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
  insertEventOrganizer,
  insertDiscipline,
  insertRegistration,
  insertRegistrationDisciplineSelection,
  insertResultsUpload,
  insertResultEntry,
  insertResultParticipant,
  insertHistoricalPerson,
  insertMediaItem,
  insertTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4994');

let createApp: Awaited<ReturnType<typeof importApp>>;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function get(memberId: string | null, path: string) {
  const r = request(createApp()).get(path);
  return memberId ? r.set('Cookie', cookieFor(memberId)) : r;
}

const day = (iso: string): string => iso.slice(0, 10);

function makeMember(id: string, o: { historical_person_id?: string; name?: string } = {}): string {
  return withDb((db) => {
    createMemberAtTier(db, {
      id, slug: id.replace(/-/g, '_'), tier: 'tier1',
      memberOverrides: {
        display_name: o.name ?? `Member ${id}`, login_email: `${id}@example.com`,
        ...(o.historical_person_id ? { historical_person_id: o.historical_person_id } : {}),
      },
    });
    completeOnboarding(db, id);
    return id;
  });
}

interface Seeded { id: string; key: string; division: string }

let seq = 0;
function seedEvent(o: {
  status?: 'reg_open' | 'closed' | 'completed' | 'draft';
  start: string;
  end?: string;
  city?: string;
  region?: string | null;
  country?: string;
  withMedia?: boolean;
  uploader?: string;
}): Seeded {
  return withDb((db) => {
    seq += 1;
    const normalized = `#event_${o.start.slice(0, 4)}_own_events_${seq}`;
    // The tag id is the one the media factory derives from the tag's text, so
    // a media item tagged with the event's hashtag joins this same tag row.
    const tagId = insertTag(db, { id: `tag-${normalized.replace(/[^a-z0-9]/g, '_')}`, tag_normalized: normalized });
    const id = insertEvent(db, {
      hashtag_tag_id: tagId,
      title: `Own Events ${seq}`,
      status: o.status ?? 'reg_open',
      start_date: o.start,
      end_date: o.end ?? o.start,
      city: o.city ?? 'Boulder',
      region: o.region === undefined ? 'CO' : o.region,
      country: o.country ?? 'United States',
    });
    const division = insertDiscipline(db, id, {
      name: 'Open Singles Footbag Net', discipline_category: 'net', team_type: 'singles',
      gender_eligibility: 'open', division_class: 'open', sort_order: 1,
    });
    if (o.withMedia) insertMediaItem(db, { uploader_member_id: o.uploader!, tags: [normalized] });
    return { id, key: normalized.slice(1), division };
  });
}

/** The markup of one profile section, found by its id. */
function section(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  expect(start, `section ${id} is on the page`).toBeGreaterThan(-1);
  const next = html.indexOf('class="profile-section"', start);
  return html.slice(start, next === -1 ? undefined : next);
}

const galleryHref = (key: string): string => `/media/browse?context=${key}`;

let mia: string;
let organizer: string;
let upcoming: Seeded;
let underWay: Seeded;
let endsToday: Seeded;
let ended: Seeded;
let pendingEvent: Seeded;
let canceledEvent: Seeded;
let organizedOnly: Seeded;
let withGallery: Seeded;
let pastWithResults: Seeded;
let pastNoMedia: Seeded;

const HP_PLAYER = 'hp-own-events-player';

beforeAll(async () => {
  createTestDb(dbPath);
  createApp = await importApp();
  withDb((db) => insertHistoricalPerson(db, { person_id: HP_PLAYER, person_name: 'Mia Results', hof_member: 1, hof_induction_year: 2001 }));
  mia = makeMember('own-mia', { historical_person_id: HP_PLAYER, name: 'Mia Results' });
  organizer = makeMember('own-olive');

  upcoming = seedEvent({ start: day(isoDaysFromNow(20)) });
  underWay = seedEvent({ start: day(isoDaysAgo(1)), end: day(isoDaysFromNow(1)), status: 'closed' });
  endsToday = seedEvent({ start: day(isoDaysAgo(2)), end: day(new Date().toISOString()), status: 'closed' });
  ended = seedEvent({ start: day(isoDaysAgo(10)), end: day(isoDaysAgo(9)), status: 'closed' });
  pendingEvent = seedEvent({ start: day(isoDaysFromNow(25)) });
  canceledEvent = seedEvent({ start: day(isoDaysFromNow(26)) });
  organizedOnly = seedEvent({ start: day(isoDaysFromNow(27)) });
  withGallery = seedEvent({ start: day(isoDaysFromNow(28)), withMedia: true, uploader: organizer });
  pastWithResults = seedEvent({
    status: 'completed', start: '2019-07-20', end: '2019-07-21', city: 'Oulu', region: null,
    country: 'Finland', withMedia: true, uploader: organizer,
  });
  pastNoMedia = seedEvent({ status: 'completed', start: '2018-08-04', city: 'Portland', region: 'OR' });

  withDb((db) => {
    for (const e of [upcoming, underWay, endsToday, ended, withGallery]) insertRegistration(db, e.id, mia);
    insertRegistration(db, pendingEvent.id, mia, { status: 'pending' });
    insertRegistration(db, canceledEvent.id, mia, { status: 'canceled', canceled_at: new Date().toISOString(), cancel_reason: 'test' });
    insertEventOrganizer(db, organizedOnly.id, mia);
    for (const e of [pastWithResults, pastNoMedia]) {
      const upload = insertResultsUpload(db, e.id, organizer);
      const entry = insertResultEntry(db, e.id, upload, e.division, { placement: 2 });
      insertResultParticipant(db, entry, 'Mia Results', { member_id: mia, historical_person_id: HP_PLAYER });
    }
  });
});

afterAll(() => cleanupTestDb(dbPath));

describe("the owner's upcoming events", () => {
  // Defect caught: the member cannot find from their profile an event they
  // registered for, or one under way drops off before it ends, or an ended or
  // abandoned registration still reads as an event they are going to.
  it('lists confirmed registrations on events not yet ended, and nothing else', async () => {
    const res = await get(mia, '/members/own_mia');
    expect(res.status).toBe(200);
    const listed = section(res.text, 'upcoming-events');
    for (const e of [upcoming, underWay, endsToday, withGallery]) {
      expect(listed, `${e.key} listed`).toContain(`href="/events/${e.key}"`);
    }
    for (const e of [ended, pendingEvent, canceledEvent, organizedOnly]) {
      expect(listed, `${e.key} not listed`).not.toContain(`/events/${e.key}`);
    }
  });

  // Defect caught: an event the member only organizes loses its manage
  // controls, or is presented as one they are registered for.
  it('keeps an organized event with its organizer controls', async () => {
    const res = await get(mia, '/members/own_mia');
    expect(section(res.text, 'organized-events')).toContain(`/events/${organizedOnly.key}/manage`);
  });

  // Defect caught: the member is sent to an empty gallery, or cannot reach
  // the photos of an event that has some.
  it('links the gallery only for an event whose hashtag carries media', async () => {
    const listed = section((await get(mia, '/members/own_mia')).text, 'upcoming-events');
    expect(listed).toContain(galleryHref(withGallery.key));
    expect(listed).not.toContain(galleryHref(upcoming.key));
  });
});

describe('Competitive Results as the past events with results', () => {
  // Defect caught: a player's results do not say where each event was held,
  // or do not lead to the event's photos, on any page showing the table.
  it.each([
    ['the owner profile', () => mia, '/members/own_mia'],
    ['the public profile', () => organizer, '/members/own_mia'],
    ['the historical player page', () => null, `/history/${HP_PLAYER}`],
  ])('names the location and links the gallery on %s', async (_label, viewer, path) => {
    const res = await get(viewer(), path);
    expect(res.status).toBe(200);
    const table = res.text.slice(res.text.indexOf('aria-label="Competitive Results"'));
    expect(table).toContain(`href="/events/${pastWithResults.key}"`);
    expect(table).toContain('Oulu, Finland');
    expect(table).toContain('Portland, OR, United States');
    expect(table).toContain(galleryHref(pastWithResults.key));
    expect(table).not.toContain(galleryHref(pastNoMedia.key));
  });
});

describe('the member’s own registration on the event page', () => {
  // Defect caught: a registered member cannot see which divisions they
  // entered or who their partner is.
  it('shows the divisions entered and the partner named', async () => {
    const partner = makeMember('own-pat', { name: 'Pat Partner' });
    const doubles = withDb((db) => {
      const d = insertDiscipline(db, upcoming.id, {
        name: 'Open Doubles Footbag Net', discipline_category: 'net', team_type: 'doubles',
        gender_eligibility: 'open', division_class: 'open', sort_order: 2,
      });
      const reg = (db.prepare('SELECT id FROM registrations WHERE event_id = ? AND member_id = ?')
        .get(upcoming.id, mia) as { id: string }).id;
      insertRegistrationDisciplineSelection(db, reg, d, { partner_member_id: partner });
      return d;
    });
    expect(doubles).toBeTruthy();
    const res = await get(mia, `/events/${upcoming.key}`);
    expect(res.status).toBe(200);
    // The block runs from its own heading to the next one, so the registrant
    // list below it, which names the same partner, cannot satisfy the check.
    const start = res.text.indexOf('id="your-registration"');
    expect(start).toBeGreaterThan(-1);
    const ownHeading = res.text.indexOf('<h2', start);
    const nextHeading = res.text.indexOf('<h2', ownHeading + 1);
    const mine = res.text.slice(start, nextHeading === -1 ? undefined : nextHeading);
    expect(mine).toContain('Open Doubles Footbag Net');
    expect(mine).toContain('Pat Partner');
  });
});

/**
 * The news items the event flows publish on their own. A free event opening at
 * its creation, a sanction granted (by an administrator's approval or the
 * Board's award) and an event's first results each leave one News item about
 * the event, written in the same act, with no author, naming the event. A
 * repeat of the act, or a later results upload, keeps the one item. A
 * sanctioned draft has nothing to announce yet. Deleting an event deletes its
 * items, and cancelling it takes them off every public news surface.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { isoDaysFromNow } from '../fixtures/clock';
import {
  completeOnboarding,
  createMemberAtTier,
  createTestSessionJwt,
  insertDiscipline,
  insertEvent,
  insertEventOrganizer,
  insertMember,
  insertRegistration,
  insertRegistrationDisciplineSelection,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4999');

let createApp: Awaited<ReturnType<typeof importApp>>;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function cookieFor(memberId: string, admin = false): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, ...(admin ? { role: 'admin' as const } : {}) })}`;
}

function makeMember(id: string, tier: 'tier1' | 'tier2'): string {
  return withDb((db) => {
    createMemberAtTier(db, {
      id, slug: id.replace(/-/g, '_'), tier,
      memberOverrides: { display_name: `Member ${id}`, login_email: `${id}@example.com` },
    });
    completeOnboarding(db, id);
    return id;
  });
}

function post(memberId: string, path: string, body: Record<string, string>, admin = false) {
  return request(createApp()).post(path).set('Cookie', cookieFor(memberId, admin)).type('form').send(body);
}

function get(path: string) {
  return request(createApp()).get(path);
}

interface NewsRow {
  id: string; news_type: string; title: string; body: string;
  author_member_id: string | null; created_by: string; is_public: number;
}

function itemsFor(eventId: string): NewsRow[] {
  return withDb((db) => db.prepare(
    `SELECT id, news_type, title, body, author_member_id, created_by, is_public
       FROM news_items WHERE entity_type = 'event' AND entity_id = ?`,
  ).all(eventId) as NewsRow[]);
}

interface SeededEvent { id: string; base: string }

function seedEvent(o: {
  title?: string; status?: 'draft' | 'reg_open'; organizer: string; endDaysAgo?: number; city?: string;
}): SeededEvent {
  return withDb((db) => {
    const dates = o.endDaysAgo === undefined
      ? {}
      : { start_date: isoDaysFromNow(-o.endDaysAgo).slice(0, 10), end_date: isoDaysFromNow(-o.endDaysAgo).slice(0, 10) };
    const id = insertEvent(db, {
      title: o.title ?? `News Test ${Math.random().toString(36).slice(2, 8)}`,
      status: o.status ?? 'reg_open',
      city: o.city ?? 'Testville',
      ...dates,
    });
    insertEventOrganizer(db, id, o.organizer);
    for (const [i, d] of [
      { gender: 'open', cls: 'open' }, { gender: 'women', cls: 'open' }, { gender: 'open', cls: 'intermediate' },
    ].entries()) {
      insertDiscipline(db, id, {
        name: `Division ${i}`, discipline_category: 'net', game_id: 'game_footbag_net', team_type: 'singles',
        gender_eligibility: d.gender as 'open' | 'women', division_class: d.cls as 'open' | 'intermediate', sort_order: i + 1,
      });
    }
    const tag = (db.prepare('SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?')
      .get(id) as { tag_normalized: string }).tag_normalized;
    return { id, base: `/events/${tag.slice(1)}` };
  });
}

function eventIdByTitle(title: string): string {
  return withDb((db) => (db.prepare('SELECT id FROM events WHERE title = ?').get(title) as { id: string }).id);
}

/** A complete sanction request for an event with no fee, as the form is filled in. */
const SANCTION_REQUEST = {
  attest: '1', deviates: 'no', deviations: '', prize_money: 'no', prize_total: '', prize_currency: 'USD',
  entry_fee_includes: '', frequency: 'first_time', years_held: '', expected_players: '40',
  expected_spectators: '', permits: 'not_needed', insurance: 'yes', justification: '',
};

function openSanctionItem(eventId: string): string {
  const open = withDb((db) => db.prepare(
    "SELECT id FROM work_queue_items WHERE entity_id = ? AND task_type = 'sanction_request' AND status = 'open'",
  ).all(eventId) as Array<{ id: string }>);
  expect(open).toHaveLength(1);
  return open[0].id;
}

const YEAR = String(new Date().getUTCFullYear() + 2);

function createForm(title: string, eventType: 'free' | 'sanctioned', city: string, slug = ''): Record<string, string> {
  return {
    event_type: eventType, title, description: 'Two days of net and freestyle.',
    start_date: `${YEAR}-06-12`, end_date: `${YEAR}-06-14`,
    city, region: 'Oregon', country: 'United States',
    registration_deadline: '', tshirt_size_collected: '0', slug, competitor_fee: '', spectator_fee: '',
  };
}

const RESULTS_HEADER = 'division,category,place,player,partner,score\n';

function commitResults(memberId: string, ev: SeededEvent, csv: string) {
  return request(createApp()).post(`${ev.base}/results`).set('Cookie', cookieFor(memberId))
    .field('results_text', csv).field('filename', 'results.csv').field('step', 'commit');
}

let organizer: string;
let director: string;
let player: string;
let admin: string;

beforeAll(async () => {
  createTestDb(dbPath).close();
  organizer = makeMember('en-olive', 'tier1');
  player = makeMember('en-ben', 'tier1');
  director = makeMember('en-dana', 'tier2');
  admin = withDb((db) => insertMember(db, {
    id: 'en-admin', slug: 'en_admin', display_name: 'Admin Ann', login_email: 'en-admin@example.com', is_admin: 1,
  }));
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('creating an event', () => {
  // Defect caught: a free event opens with no news item, the item records an
  // author as if a person wrote it, or it fails to name the event.
  it('publishes one News item about a free event, naming it, with no author', async () => {
    const title = 'Willamette Kick Off';
    expect((await post(organizer, '/events/create', createForm(title, 'free', 'Corvallis'))).status).toBe(303);
    const eventId = eventIdByTitle(title);

    const items = itemsFor(eventId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ news_type: 'event_published', author_member_id: null, created_by: organizer, is_public: 1 });
    expect(items[0].title).toContain(title);
    expect(items[0].body).toContain(title);
    expect(items[0].body).toContain('Corvallis');

    // Defect caught: the item exists but no visitor can read it.
    const feed = await get('/news');
    expect(feed.status).toBe(200);
    expect(feed.text).toContain(`href="/news/${items[0].id}"`);
    expect((await get(`/news/${items[0].id}`)).status).toBe(200);
  });

  // Defect caught: a sanctioned draft, which nobody can register for yet, is
  // announced as open before IFPA has decided it.
  it('publishes nothing for a sanctioned event still in draft', async () => {
    const title = 'Cascade Draft Open';
    expect((await post(director, '/events/create', createForm(title, 'sanctioned', 'Bend'))).status).toBe(303);
    expect(itemsFor(eventIdByTitle(title))).toHaveLength(0);
  });

  // Defect caught: an organizer's title turns into a link or markup in a post
  // the platform publishes in IFPA's voice.
  it('shows the organizer\'s Markdown and HTML as the text they typed', async () => {
    const title = 'Big **Jam** [prize](https://evil.example) <b>now</b>';
    expect((await post(organizer, '/events/create', createForm(title, 'free', 'Salem', 'markup_jam'))).status).toBe(303);
    const eventId = withDb((db) => (db.prepare(
      'SELECT e.id FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE t.tag_normalized = ?',
    ).get(`#event_${YEAR}_markup_jam`) as { id: string }).id);
    const [item] = itemsFor(eventId);
    const page = await get(`/news/${item.id}`);
    expect(page.status).toBe(200);
    expect(page.text).not.toContain('href="https://evil.example"');
    expect(page.text).not.toContain('<strong>Jam</strong>');
    expect(page.text).not.toContain('<b>now</b>');
  });
});

describe('granting a sanction', () => {
  // Defect caught: an approved event opens with no news item, or a repeated
  // approval publishes a second one.
  it('publishes one News item on approval, and a repeat approval adds none', async () => {
    const ev = seedEvent({ status: 'draft', organizer: director, city: 'Ashland' });
    expect((await post(director, `${ev.base}/sanction`, SANCTION_REQUEST)).status).toBe(303);
    expect(itemsFor(ev.id)).toHaveLength(0);

    const itemId = openSanctionItem(ev.id);
    expect((await post(admin, `/admin/work-queue/${itemId}/sanction/approve`, { note: '' }, true)).status).toBe(303);
    const items = itemsFor(ev.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ news_type: 'event_published', author_member_id: null, created_by: admin });
    expect(items[0].body).toContain('Ashland');

    expect((await post(admin, `/admin/work-queue/${itemId}/sanction/approve`, { note: '' }, true)).status).toBe(303);
    expect(itemsFor(ev.id).map((i) => i.id)).toEqual([items[0].id]);
  });

  // Defect caught: a Board-awarded World Championships opens with no news item.
  it('publishes one News item on the Board\'s award', async () => {
    const ev = seedEvent({ status: 'draft', organizer: director });
    const res = await post(admin, `/admin/events/${ev.id}/sanction-award`, { citation: 'Board decision of 2026-03-01' }, true);
    expect(res.status).toBe(303);
    const items = itemsFor(ev.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ news_type: 'event_published', created_by: admin });
  });

  // Defect caught: a rejected request is announced as sanctioned.
  it('publishes nothing when the request is rejected', async () => {
    const ev = seedEvent({ status: 'draft', organizer: director });
    expect((await post(director, `${ev.base}/sanction`, SANCTION_REQUEST)).status).toBe(303);
    const itemId = openSanctionItem(ev.id);
    expect((await post(admin, `/admin/work-queue/${itemId}/sanction/reject`, { reason: 'Dates clash with Worlds.' }, true)).status).toBe(303);
    expect(itemsFor(ev.id)).toHaveLength(0);
  });
});

describe('publishing results', () => {
  // Defect caught: results go up with no news item, or every later upload or
  // correction publishes another.
  it('publishes one results item on the first upload and keeps it on a later one', async () => {
    const ev = seedEvent({ organizer, endDaysAgo: 2 });
    withDb((db) => {
      const reg = insertRegistration(db, ev.id, player, { status: 'confirmed' });
      for (const name of ['Division 0', 'Division 1']) {
        const division = (db.prepare('SELECT id FROM event_disciplines WHERE event_id = ? AND name = ?')
          .get(ev.id, name) as { id: string }).id;
        insertRegistrationDisciplineSelection(db, reg, division, {});
      }
    });
    expect((await commitResults(organizer, ev, `${RESULTS_HEADER}Division 0,,1,Member en-ben,,\n`)).status).toBe(303);
    const first = itemsFor(ev.id).filter((i) => i.news_type === 'event_results');
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ author_member_id: null, created_by: organizer });

    expect((await commitResults(organizer, ev, `${RESULTS_HEADER}Division 1,,1,Member en-ben,,\n`)).status).toBe(303);
    expect(withDb((db) => db.prepare('SELECT COUNT(*) c FROM event_results_uploads WHERE event_id = ?').get(ev.id) as { c: number }).c).toBe(2);
    expect(itemsFor(ev.id).filter((i) => i.news_type === 'event_results').map((i) => i.id)).toEqual([first[0].id]);
  });
});

describe('removing an event', () => {
  // Defect caught: a deleted event's item stays in the feed, pointing at an
  // event that no longer exists.
  it('deletes the event\'s items with it', async () => {
    const title = 'Deleted Before It Began';
    expect((await post(organizer, '/events/create', createForm(title, 'free', 'Eugene'))).status).toBe(303);
    const eventId = eventIdByTitle(title);
    const [item] = itemsFor(eventId);
    const base = withDb((db) => (db.prepare(
      'SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?',
    ).get(eventId) as { tag_normalized: string }).tag_normalized.slice(1));

    expect((await post(organizer, `/events/${base}/delete`, { confirmed: '1', reason: 'Duplicate' })).status).toBe(303);
    expect(itemsFor(eventId)).toHaveLength(0);
    expect((await get(`/news/${item.id}`)).status).toBe(404);
  });

  // Defect caught: a cancelled event's announcement still reads as open in
  // the feed, as if the event were going ahead.
  it('takes a cancelled event\'s item off the feed and its page', async () => {
    const title = 'Rained Out Classic';
    expect((await post(organizer, '/events/create', createForm(title, 'free', 'Medford'))).status).toBe(303);
    const eventId = eventIdByTitle(title);
    const [item] = itemsFor(eventId);
    const base = withDb((db) => (db.prepare(
      'SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?',
    ).get(eventId) as { tag_normalized: string }).tag_normalized.slice(1));
    expect((await get(`/news/${item.id}`)).status).toBe(200);

    expect((await post(organizer, `/events/${base}/cancel`, { confirmed: '1', reason: 'Venue flooded' })).status).toBe(303);
    expect(itemsFor(eventId)).toHaveLength(1);
    expect((await get(`/news/${item.id}`)).status).toBe(404);
    expect((await get('/news')).text).not.toContain(`href="/news/${item.id}"`);
  });
});

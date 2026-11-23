/**
 * The home page band under the hero: the three newest public news items as
 * compact dated items, ending in a link to the news page. The home page lists
 * no events; they are on the events page.
 *
 * The contract: the items are the newest three public ones, newest first, each
 * with its date, label and headline linking to its page, an event item with
 * its event's hashtag; a hidden item, one whose publication time has not come
 * and one about an event that is not publicly visible never appear. No item
 * draws an excerpt or a thumbnail. The band renders the same for every viewer.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { cachedGet } from '../fixtures/cachedGet';
import {
  completeOnboarding,
  createTestSessionJwt,
  insertEvent,
  insertMember,
  insertNewsItem,
  insertTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4992');

// The band reads the clock for which items are published and which events are
// publicly visible, so the suite runs at one fixed instant.
const NOW = new Date('2026-07-01T12:00:00.000Z');

const VIEWER = 'band-viewer';

let createApp: Awaited<ReturnType<typeof importApp>>;
let page: (path: string) => Promise<request.Response>;

type EventStatus = NonNullable<NonNullable<Parameters<typeof insertEvent>[1]>['status']>;

function publicEvent(db: Parameters<typeof insertEvent>[0], key: string, title: string, start: string, status: EventStatus = 'reg_open'): string {
  const tagId = insertTag(db, { tag_normalized: `#${key}`, tag_display: `#${key}`, standard_type: 'event' });
  return insertEvent(db, { title, hashtag_tag_id: tagId, start_date: start, end_date: start, status });
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  const db = createTestDb(dbPath);

  insertMember(db, { id: VIEWER, slug: 'band_viewer', display_name: 'Band Viewer' });
  completeOnboarding(db, VIEWER);

  // An upcoming public event the home page must not list, one a news item is
  // about, and a cancelled one whose news item must not show.
  publicEvent(db, 'event_2026_band_upcoming', 'Band Event Upcoming', '2026-07-10');
  const eventForNews = publicEvent(db, 'event_2026_band_newsy', 'Band Event Newsy', '2027-01-08');
  const canceledId = publicEvent(db, 'event_2026_band_called_off', 'Band Event Called Off', '2026-07-06', 'canceled');

  // Six public items, so the band cuts the three oldest; and three withheld items,
  // each newer than every public one, so a missing filter would put it first.
  insertNewsItem(db, { id: 'band_n1', published_at: '2026-06-30T09:00:00.000Z', title: 'Band News One', body: 'An excerpt that the band never shows.' });
  insertNewsItem(db, { id: 'band_n2', published_at: '2026-06-28T09:00:00.000Z', news_type: 'community_post', title: 'Band News Two', author_member_id: VIEWER });
  insertNewsItem(db, { id: 'band_n3', published_at: '2026-06-25T09:00:00.000Z', news_type: 'event_published', title: 'Band News Three', entity_type: 'event', entity_id: eventForNews });
  insertNewsItem(db, { id: 'band_n4', published_at: '2026-05-20T09:00:00.000Z', title: 'Band News Four' });
  insertNewsItem(db, { id: 'band_n5', published_at: '2025-12-01T09:00:00.000Z', title: 'Band News Five' });
  insertNewsItem(db, { id: 'band_n6', published_at: '2025-01-01T09:00:00.000Z', title: 'Band News Six' });
  insertNewsItem(db, { id: 'band_hidden', published_at: '2026-07-01T08:00:00.000Z', title: 'Band Hidden', is_public: 0 });
  insertNewsItem(db, { id: 'band_future', published_at: '2026-07-02T09:00:00.000Z', title: 'Band Future' });
  insertNewsItem(db, { id: 'band_canceled', published_at: '2026-07-01T07:00:00.000Z', news_type: 'event_published', title: 'Band Canceled', entity_type: 'event', entity_id: canceledId });
  db.close();

  createApp = await importApp();
  page = cachedGet(() => createApp());
});

afterAll(() => {
  vi.useRealTimers();
  cleanupTestDb(dbPath);
});

function region(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  expect(start, `region ${id} present`).toBeGreaterThan(-1);
  // The list ends in its full-page link, so the region runs to that link's end.
  const link = html.indexOf('class="btn btn-outline" href="/news"', start);
  expect(link, `region ${id} ends in its link`).toBeGreaterThan(start);
  return html.slice(start, html.indexOf('</p>', link));
}

function cards(html: string, id: string): string[] {
  return region(html, id).split('<article class="card">').slice(1);
}

describe('the home page news list', () => {
  it('shows the three newest public items, newest first, each linking to its page', async () => {
    const res = await page('/');
    expect(res.status).toBe(200);
    const hrefs = cards(res.text, 'home-news').map((c) => c.match(/class="card-link" href="([^"]+)"/)?.[1]);
    // ordering-is-the-contract: the band shows the newest items first.
    expect(hrefs).toEqual(['/news/band_n1', '/news/band_n2', '/news/band_n3']);
  });

  it('never shows a hidden, future-dated or cancelled-event item', async () => {
    const res = await page('/');
    const news = region(res.text, 'home-news');
    for (const id of ['band_hidden', 'band_future', 'band_canceled']) {
      expect(news, id).not.toContain(`/news/${id}"`);
    }
    expect(news).toContain('/news/band_n1"');
  });

  it('gives each item its date and label, an event item its hashtag, and no excerpt or thumbnail', async () => {
    const res = await page('/');
    const [n1, n2, n3] = cards(res.text, 'home-news');
    expect(n1).toContain('<span>30 June 2026</span>');
    expect(n1).toContain('<span class="badge badge-muted">News</span>');
    expect(n2).toContain('<span class="badge badge-muted">Community</span>');
    expect(n3).toContain('class="hashtag">#event_2026_band_newsy</span>');
    const news = region(res.text, 'home-news');
    expect(news).not.toContain('card-description');
    expect(news).not.toContain('card-thumb');
  });

  it('ends in a button to the news page', async () => {
    const res = await page('/');
    expect(region(res.text, 'home-news')).toMatch(/<a class="btn btn-outline" href="\/news">/);
  });

  it('lists no events, which are on the events page', async () => {
    const res = await page('/');
    expect(res.text).not.toContain('Band Event Upcoming');
    const events = await page('/events');
    expect(events.text).toContain('Band Event Upcoming');
  });
});

describe('every viewer', () => {
  it('renders the band the same for a signed-in member', async () => {
    const anonymous = await page('/');
    const signedIn = await request(createApp())
      .get('/')
      .set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId: VIEWER })}`);
    expect(signedIn.status).toBe(200);
    expect(region(signedIn.text, 'home-news')).toBe(region(anonymous.text, 'home-news'));
  });
});

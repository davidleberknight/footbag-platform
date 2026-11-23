/**
 * The public news pages: the current year's items at /news, an earlier year's
 * at /news/year/:year, and each item's own page at /news/:newsId.
 *
 * The contract: items are listed newest first, each a clickable dated card
 * with its date, label, headline linking to its page and a plain-text excerpt;
 * no item names its author or links a member. An event item describes its
 * event: the event's dates, its registration status while upcoming, its place
 * and host club, its description, and its cover as a thumbnail, with no
 * hashtag; the item's own page carries the hashtag. A hidden item, one whose publication time has not come,
 * and one about an event that is not publicly visible appear nowhere. The
 * current year shows an empty state when it has no items; any other year with
 * no items, a malformed year and a future year are not found; the current
 * year's own year address redirects to /news. The year navigation links only
 * to years holding items. Every surface renders the same for every viewer.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { cachedGet } from '../fixtures/cachedGet';
import {
  attachMediaTag,
  completeOnboarding,
  createTestSessionJwt,
  insertClub,
  insertEvent,
  insertMediaItem,
  insertMember,
  insertNewsItem,
  insertTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4985');

// The pages read the clock for the current year and for which items have been
// published, so the suite runs at one fixed instant.
const NOW = new Date('2026-07-01T12:00:00.000Z');

const AUTHOR = 'news-author';
const UNFINISHED = 'news-unfinished';

const EVENT_KEY = 'event_2026_news_open';
const BARE_EVENT_KEY = 'event_2026_news_bare';

const LONG_BODY = `**Big news.** ${'Footbag players gathered from every corner of the world to kick. '.repeat(8)}`;

let createApp: Awaited<ReturnType<typeof importApp>>;
let page: (path: string) => Promise<request.Response>;
let coverMediaId = '';

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  const db = createTestDb(dbPath);

  insertMember(db, { id: AUTHOR, slug: 'news_author', display_name: 'Pat Kicker' });
  completeOnboarding(db, AUTHOR);
  insertMember(db, { id: UNFINISHED, slug: 'news_unfinished', display_name: 'Sam Pending', onboarding: 'none' });

  // A public event with a cover photo that carries its hashtag, so it has a
  // gallery; another with no media; a cancelled one.
  const tagId = insertTag(db, { tag_normalized: `#${EVENT_KEY}`, standard_type: 'event' });
  coverMediaId = insertMediaItem(db, { uploader_member_id: AUTHOR, moderation_status: 'active', is_avatar: 0 });
  attachMediaTag(db, coverMediaId, tagId);
  const hostClubId = insertClub(db, { name: 'Austin Kickers' });
  const eventId = insertEvent(db, {
    title: 'News Open', hashtag_tag_id: tagId, start_date: '2026-09-10', end_date: '2026-09-12',
    status: 'reg_open', cover_media_id: coverMediaId, description: 'Three days of freestyle by the river.',
    city: 'Austin', region: 'TX', country: 'United States', host_club_id: hostClubId,
  });
  const bareTag = insertTag(db, { tag_normalized: `#${BARE_EVENT_KEY}`, standard_type: 'event' });
  const bareEventId = insertEvent(db, {
    title: 'Bare Open', hashtag_tag_id: bareTag, start_date: '2026-09-20', end_date: '2026-09-20', status: 'reg_open',
    description: '',
  });
  const heldTag = insertTag(db, { tag_normalized: '#event_2026_news_held', standard_type: 'event' });
  const heldEventId = insertEvent(db, {
    title: 'Held Open', hashtag_tag_id: heldTag, start_date: '2026-05-03', end_date: '2026-05-03', status: 'completed',
  });
  const canceledEventId = insertEvent(db, {
    title: 'Called Off', start_date: '2026-10-01', end_date: '2026-10-01', status: 'canceled',
  });

  insertNewsItem(db, { id: 'news_a', published_at: '2026-06-20T09:00:00.000Z', news_type: 'announcement', title: 'Announcement A', body: LONG_BODY });
  insertNewsItem(db, { id: 'news_b', published_at: '2026-06-25T09:00:00.000Z', news_type: 'community_post', title: 'Community B', body: 'A post *from* a member.', author_member_id: AUTHOR });
  insertNewsItem(db, { id: 'news_c', published_at: '2026-06-10T09:00:00.000Z', news_type: 'community_post', title: 'Community C', author_member_id: UNFINISHED });
  insertNewsItem(db, { id: 'news_d', published_at: '2026-06-15T09:00:00.000Z', news_type: 'event_published', title: 'Event D', body: 'Registration is open.', entity_type: 'event', entity_id: eventId });
  insertNewsItem(db, { id: 'news_h', published_at: '2026-06-05T09:00:00.000Z', news_type: 'event_published', title: 'Event H', entity_type: 'event', entity_id: bareEventId });
  insertNewsItem(db, { id: 'news_r', published_at: '2026-06-01T09:00:00.000Z', news_type: 'event_results', title: 'Results R', entity_type: 'event', entity_id: heldEventId });
  insertNewsItem(db, { id: 'news_canceled', published_at: '2026-06-18T09:00:00.000Z', news_type: 'event_published', title: 'Canceled E', entity_type: 'event', entity_id: canceledEventId });
  insertNewsItem(db, { id: 'news_hidden', published_at: '2026-06-19T09:00:00.000Z', title: 'Hidden F', is_public: 0 });
  insertNewsItem(db, { id: 'news_future', published_at: '2026-08-01T09:00:00.000Z', title: 'Future G' });
  insertNewsItem(db, { id: 'news_2024', published_at: '2024-03-01T09:00:00.000Z', title: 'Older I' });
  insertNewsItem(db, { id: 'news_2022', published_at: '2022-05-01T09:00:00.000Z', title: 'Oldest J' });
  insertNewsItem(db, { id: 'news_2023_hidden', published_at: '2023-05-01T09:00:00.000Z', title: 'Hidden K', is_public: 0 });
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
  const end = html.indexOf('</div>\n', start);
  return html.slice(start, end === -1 ? undefined : end);
}

function cards(html: string): string[] {
  return region(html, 'news-items').split('<article class="card">').slice(1);
}

function cardFor(html: string, id: string): string {
  const card = cards(html).find((c) => c.includes(`href="/news/${id}"`));
  expect(card, `card for ${id}`).toBeDefined();
  return card!;
}

describe('the news landing page', () => {
  it('lists the current year\'s public items newest first, each card linking to its page', async () => {
    const res = await page('/news');
    expect(res.status).toBe(200);
    const order = cards(res.text).map((c) => c.match(/class="card-link" href="\/news\/([^"]+)"/)?.[1]);
    // ordering-is-the-contract: the story lists a year's items newest first.
    expect(order).toEqual(['news_b', 'news_a', 'news_d', 'news_c', 'news_h', 'news_r']);
  });

  it('shows no hidden, future-dated or cancelled-event item', async () => {
    const res = await page('/news');
    for (const id of ['news_hidden', 'news_future', 'news_canceled']) {
      expect(res.text, id).not.toContain(`/news/${id}"`);
    }
    expect(res.text).toContain('/news/news_b"');
  });

  it('gives each entry its date, label and a plain-text excerpt cut at a word', async () => {
    const res = await page('/news');
    const a = cardFor(res.text, 'news_a');
    expect(a).toContain('<span>20 June 2026</span>');
    expect(a).toContain('<span class="badge badge-muted">News</span>');
    const excerpt = a.match(/<p class="card-description">([^<]*)<\/p>/)?.[1] ?? '';
    expect(excerpt.startsWith('Big news. Footbag players')).toBe(true);
    expect(excerpt).not.toContain('**');
    expect([...excerpt].length).toBeLessThanOrEqual(201);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(cardFor(res.text, 'news_b')).toContain('<span class="badge badge-muted">Community</span>');
  });

  // Defect caught: a member's post names its author or links a member-only
  // profile, a dead end for every viewer who is not a member.
  it('names no author and links no member on any card, a Community post included', async () => {
    const res = await page('/news');
    const b = cardFor(res.text, 'news_b');
    expect(b).toContain('href="/news/news_b"');
    expect(b).not.toContain('/members/');
    expect(b).not.toContain('Pat Kicker');
    expect(cardFor(res.text, 'news_c')).not.toContain('/members/');
    expect(cardFor(res.text, 'news_a')).not.toContain('/members/');
  });

  // Defect caught: a reader of an event item sees when it was posted and a
  // bare hashtag instead of when and where the event runs and whether they
  // can still register.
  it('describes an event item\'s event: its dates, registration status, place and description, with no hashtag', async () => {
    const res = await page('/news');
    const d = cardFor(res.text, 'news_d');
    expect(d).toContain('<span>10–12 September 2026</span>');
    expect(d).not.toContain('15 June 2026');
    expect(d).toContain('<span class="badge badge-muted">News</span>');
    expect(d).toMatch(/<span class="badge badge-(reg_open|closed)">/);
    expect(d).toContain('<span>Austin, TX, United States</span>');
    expect(d).toContain('<span>Austin Kickers</span>');
    expect(d).toContain('<p class="card-description">Three days of freestyle by the river.</p>');
    expect(d).not.toContain('hashtag');
    expect(d).toMatch(/<a class="card-thumb" href="\/news\/news_d" tabindex="-1" aria-hidden="true">/);
  });

  // Defect caught: an event with no description leaves its card blank, or a
  // results item shows a registration badge for an event already held.
  it('falls back to the item\'s own excerpt, and shows no registration status for a completed event', async () => {
    const res = await page('/news');
    const h = cardFor(res.text, 'news_h');
    expect(h).toContain('<p class="card-description">A short Markdown body.</p>');
    expect(h).not.toContain('hashtag');
    expect(h).not.toContain('card-thumb');
    const r = cardFor(res.text, 'news_r');
    expect(r).toContain('<span>3 May 2026</span>');
    expect(r).not.toMatch(/badge-(reg_open|closed|completed)/);
    expect(cardFor(res.text, 'news_a')).not.toContain('hashtag');
  });

  it('draws the entries as clickable cards in a card grid', async () => {
    const res = await page('/news');
    expect(res.text).toContain('<div class="card-grid" id="news-items">');
    expect(cardFor(res.text, 'news_b')).toContain('<a class="card-link" href="/news/news_b">');
  });

  it('links back to the nearest earlier year holding items, and forward to none', async () => {
    const res = await page('/news');
    const nav = res.text.slice(res.text.indexOf('year-page-nav'), res.text.indexOf('news-items'));
    expect(nav).toContain('href="/news/year/2024"');
    expect(nav).toContain('hero-year-arrow--disabled');
  });

  it('shows the empty state when the current year has no items yet', async () => {
    vi.setSystemTime(new Date('2027-02-01T12:00:00.000Z'));
    try {
      const res = await request(createApp()).get('/news');
      expect(res.status).toBe(200);
      expect(res.text).not.toContain('id="news-items"');
      expect(res.text).toContain('class="empty-state"');
      expect(res.text).toContain('href="/news/year/2026"');
    } finally {
      vi.setSystemTime(NOW);
    }
  });
});

describe('an earlier year\'s news page', () => {
  it('lists that year\'s items and navigates to the years either side holding items', async () => {
    const res = await page('/news/year/2024');
    expect(res.status).toBe(200);
    expect(cards(res.text)).toHaveLength(1);
    expect(res.text).toContain('href="/news/news_2024"');
    const nav = res.text.slice(res.text.indexOf('year-page-nav'), res.text.indexOf('news-items'));
    expect(nav).toContain('href="/news/year/2022"');
    // The current year is reached at its landing address, never its year address.
    expect(nav).toContain('href="/news"');
    expect(nav).not.toContain('/news/year/2026');
    expect(res.text).toContain('<p class="page-back-link"><a href="/news" class="action-link">');
  });

  it('skips a year whose only items are hidden', async () => {
    const res = await page('/news/year/2022');
    expect(res.status).toBe(200);
    const nav = res.text.slice(res.text.indexOf('year-page-nav'), res.text.indexOf('news-items'));
    expect(nav).toContain('href="/news/year/2024"');
    expect(nav).not.toContain('/news/year/2023');
  });

  it('redirects the current year\'s year address to the landing page', async () => {
    const res = await page('/news/year/2026');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/news');
  });

  it.each([
    ['a year with only hidden items', '/news/year/2023'],
    ['a year with no items', '/news/year/1999'],
    ['a future year', '/news/year/2027'],
    ['a year that is not four digits', '/news/year/notayear'],
    ['a three-digit year', '/news/year/999'],
  ])('answers not-found for %s', async (_label, path) => {
    const res = await page(path);
    expect(res.status).toBe(404);
  });
});

describe('a news item\'s own page', () => {
  it('shows an event item in the detail-page order, with its cover as the share image', async () => {
    const res = await page('/news/news_d');
    expect(res.status).toBe(200);
    const html = res.text;
    const positions = ['id="news-cover-photo"', 'id="news-facts"', 'id="news-media"', '<p>Registration is open.</p>', 'id="news-event-link"', 'class="page-back-link"']
      .map((marker) => html.indexOf(marker));
    for (const p of positions) expect(p).toBeGreaterThan(-1);
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);

    const coverSrc = html.match(/id="news-cover-photo" class="cover-photo" src="([^"]+)"/)?.[1] ?? '';
    expect(coverSrc).not.toBe('');
    expect(html).toMatch(new RegExp(`<meta property="og:image" content="[^"]*${coverSrc.replace(/[.?*+^$()[\]{}|\\]/g, '\\$&')}"`));
    // The media line's gallery address, its "=" entity-escaped in the attribute.
    expect(html).toMatch(new RegExp(`id="news-media"[\\s\\S]*href="/media/browse\\?context(=|&#x3D;)${EVENT_KEY}"`));
    expect(html).toContain(`id="news-event-link" href="/events/${EVENT_KEY}"`);
    expect(html).toContain('<p>Registration is open.</p>');
    expect(html).toContain('<p class="page-back-link"><a href="/news" class="action-link">');
  });

  // Defect caught: a member's post page names its author or links a
  // member-only profile.
  it('shows a Community post with no author or member link, and links back to its own year', async () => {
    const b = await page('/news/news_b');
    expect(b.status).toBe(200);
    expect(b.text).toContain('<span class="badge badge-muted">Community</span>');
    expect(b.text).not.toContain('/members/');
    expect(b.text).not.toContain('Pat Kicker');
    expect(b.text).not.toContain('id="news-media"');
    expect(b.text).not.toContain('id="news-cover-photo"');

    const older = await page('/news/news_2024');
    expect(older.status).toBe(200);
    expect(older.text).toContain('<p class="page-back-link"><a href="/news/year/2024" class="action-link">');
    expect(older.text).not.toContain('/members/');
  });

  it.each(['news_hidden', 'news_future', 'news_canceled', 'news_missing'])('answers not-found for %s', async (id) => {
    const res = await page(`/news/${id}`);
    expect(res.status).toBe(404);
  });
});

describe('every viewer and every listing', () => {
  it('renders the news list the same for a signed-in member', async () => {
    const anonymous = await page('/news');
    const signedIn = await request(createApp())
      .get('/news')
      .set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId: AUTHOR })}`);
    expect(signedIn.status).toBe(200);
    expect(region(signedIn.text, 'news-items')).toBe(region(anonymous.text, 'news-items'));
  });

  it('lists the public news pages in the sitemap, and none of the withheld items', async () => {
    const res = await page('/sitemap.xml');
    expect(res.status).toBe(200);
    for (const path of ['/news', '/news/year/2024', '/news/year/2022', '/news/news_d', '/news/news_2024']) {
      expect(res.text, path).toContain(`${path}</loc>`);
    }
    for (const path of ['/news/year/2026', '/news/year/2023', '/news/news_hidden', '/news/news_future', '/news/news_canceled']) {
      expect(res.text, path).not.toContain(`${path}</loc>`);
    }
  });
});

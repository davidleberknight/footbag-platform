/**
 * Crawler and AI-agent discoverability surfaces: robots.txt, sitemap.xml,
 * llms.txt, the page-head metadata the layout emits, and the indexing-control
 * response headers.
 *
 * This suite runs in a non-production environment (FOOTBAG_ENV unset), which is
 * the staging/development crawl posture: robots.txt disallows all crawling and
 * every response carries a noindex directive. The production allow-all policy is
 * pinned in seo.robots-production.routes.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertEvent, insertClub, insertTag, insertMemberGallery, insertHistoricalPerson, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3080');
const ORIGIN = 'http://localhost:3080';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, { id: 'seo-member-1', slug: 'seo_member_1' });

  // A completed event in a known archive year, so its detail URL appears in the
  // sitemap via the per-year completed-event enumeration.
  const eventTag = insertTag(db, { standard_type: 'event', tag_normalized: '#event_2019_test_worlds' });
  insertEvent(db, { hashtag_tag_id: eventTag, status: 'completed', start_date: '2019-08-01', end_date: '2019-08-03' });

  // An open club, so its detail URL appears in the sitemap.
  const clubTag = insertTag(db, { standard_type: 'club', tag_normalized: '#club_seattle' });
  insertClub(db, { id: 'club-seattle-real', hashtag_tag_id: clubTag, name: 'Seattle Footbag' });

  // A named gallery, so its detail URL appears in the sitemap.
  insertMemberGallery(db, { id: 'gallery_seo_test', owner_member_id: 'seo-member-1', name: 'SEO Test Gallery' });

  // Two historical people: one canonical, with a public detail page, and one
  // outside the canonical scope, which has no page for a crawler to reach.
  insertHistoricalPerson(db, { person_id: 'person-seo-canonical', person_name: 'Canonical Player' });
  insertHistoricalPerson(db, {
    person_id: 'person-seo-noncanonical',
    person_name: 'Non-canonical Player',
    source_scope: 'MIRROR',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function authCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: 'seo-member-1', role: 'member' })}`;
}

describe('GET /robots.txt (non-production)', () => {
  it('disallows all crawling and is served as text/plain', async () => {
    const res = await request(createApp()).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toBe('User-agent: *\nDisallow: /\n');
  });

  it('does not advertise a sitemap on a non-production host', async () => {
    const res = await request(createApp()).get('/robots.txt');
    expect(res.text).not.toContain('Sitemap:');
  });
});

describe('GET /sitemap.xml', () => {
  it('is valid XML served as xml with a urlset root', async () => {
    const res = await request(createApp()).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('xml');
    expect(res.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(res.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  });

  it('lists static public hubs as absolute URLs', async () => {
    const res = await request(createApp()).get('/sitemap.xml');
    for (const path of ['/', '/events', '/clubs', '/freestyle', '/records', '/hof', '/bap', '/legal', '/rules', '/ifpa']) {
      expect(res.text).toContain(`<loc>${ORIGIN}${path}</loc>`);
    }
  });

  it('lists dynamic event, club, rules, and IFPA detail URLs', async () => {
    const res = await request(createApp()).get('/sitemap.xml');
    expect(res.text).toContain(`<loc>${ORIGIN}/events/event_2019_test_worlds</loc>`);
    expect(res.text).toContain(`<loc>${ORIGIN}/events/year/2019</loc>`);
    expect(res.text).toContain(`<loc>${ORIGIN}/clubs/club_seattle</loc>`);
    // Rules and IFPA documents come from committed content, so at least one of
    // each is always present.
    expect(res.text).toMatch(new RegExp(`<loc>${ORIGIN}/rules/[^<]+</loc>`));
    expect(res.text).toMatch(new RegExp(`<loc>${ORIGIN}/ifpa/[^<]+</loc>`));
  });

  it('lists historical-person detail URLs, which are the site long tail', async () => {
    const res = await request(createApp()).get('/sitemap.xml');
    expect(res.text).toContain(`<loc>${ORIGIN}/history/person-seo-canonical</loc>`);
    // A person outside the canonical scope has no detail page, so pointing a
    // crawler at one would advertise a URL that does not serve.
    expect(res.text).not.toContain(`<loc>${ORIGIN}/history/person-seo-noncanonical</loc>`);
  });

  it('lists freestyle set-detail and named-gallery URLs', async () => {
    const res = await request(createApp()).get('/sitemap.xml');
    // The Toe Set is a stable canonical set, so its detail page is always present.
    expect(res.text).toContain(`<loc>${ORIGIN}/freestyle/sets/toe</loc>`);
    expect(res.text).toContain(`<loc>${ORIGIN}/media/gallery_seo_test</loc>`);
  });

  it('does not enumerate individual media-item pages', async () => {
    const res = await request(createApp()).get('/sitemap.xml');
    expect(res.text).not.toContain(`${ORIGIN}/media/item/`);
  });

  it('every <loc> is an absolute URL', async () => {
    const res = await request(createApp()).get('/sitemap.xml');
    expect(res.text).not.toMatch(/<loc>(?!http)/);
  });

  it('never lists private, member, or machine routes', async () => {
    const res = await request(createApp()).get('/sitemap.xml');
    // A historical person's detail page is a public historical record and is
    // listed; the claim flow hanging off the same path is member-only and is
    // not, which is why the history exclusion is the claim suffix rather than
    // the whole prefix.
    for (const path of ['/admin', '/login', '/register', '/members', '/claim', '/internal', '/health', '/payments']) {
      expect(res.text).not.toContain(`${ORIGIN}${path}`);
    }
  });
});

describe('GET /llms.txt', () => {
  it('is served as markdown with a single top-level heading', async () => {
    const res = await request(createApp()).get('/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.text.startsWith('# Footbag Worldwide')).toBe(true);
    expect(res.text.match(/^# /gm)?.length).toBe(1);
    expect(res.text).toContain(`(${ORIGIN}/events)`);
  });
});

describe('page-head metadata', () => {
  it('a public page emits description, absolute canonical, Open Graph, and Twitter tags', async () => {
    const res = await request(createApp()).get('/legal');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<meta name="description" content="Privacy, Terms of Use');
    expect(res.text).toContain(`<link rel="canonical" href="${ORIGIN}/legal" />`);
    expect(res.text).toContain(`<meta property="og:url" content="${ORIGIN}/legal" />`);
    expect(res.text).toContain('<meta property="og:title"');
    expect(res.text).toContain('<meta name="twitter:card" content="summary" />');
    expect(res.text).toContain(`<meta property="og:image" content="${ORIGIN}/img/ifpa-logo.png" />`);
  });

  it('an indexable public page carries no robots noindex meta', async () => {
    const res = await request(createApp()).get('/legal');
    expect(res.text).not.toContain('name="robots"');
  });

  it('a thin auth page is marked noindex', async () => {
    const res = await request(createApp()).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<meta name="robots" content="noindex, follow" />');
  });
});

describe('indexing-control response headers (non-production)', () => {
  it('an unauthenticated response carries the environment-wide noindex header', async () => {
    const res = await request(createApp()).get('/legal');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('an authenticated response is marked noindex and not cacheable', async () => {
    const res = await request(createApp()).get('/legal').set('Cookie', authCookie());
    expect(res.headers['x-robots-tag']).toBe('noindex');
    expect(res.headers['cache-control']).toBe('private, no-store');
  });
});

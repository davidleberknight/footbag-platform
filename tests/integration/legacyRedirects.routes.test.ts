/**
 * Old footbag.org addresses that outside pages still cite answer a permanent
 * redirect to the public page carrying the same content; every other old
 * address answers the standard not-found page.
 *
 * The expected pairs below are written by hand from the verified citation
 * list, not read from the redirect table, so a row dropped, mistyped or
 * pointed at the wrong page fails here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertTag, insertEvent, insertClub } from '../fixtures/factories';
import { loadServedRoutes } from '../fixtures/routeTable';

const { dbPath } = setTestEnv('4931');

let createApp: Awaited<ReturnType<typeof importApp>>;

const EXPECTED: ReadonlyArray<readonly [string, string]> = [
  ['/movelist', '/freestyle/tricks'],
  ['/freestyle/index.html', '/freestyle/tricks?view=add'],
  ['/rules/chapter/200', '/consecutives'],
  ['/rules/chapter/300', '/rules/net/footbag-net'],
  ['/rules/chapter/400', '/rules/golf/footbag-golf'],
  ['/rules/chapter/500', '/rules/freestyle/footbag-freestyle'],
  ['/reference/-/Footbag_Net_Rules', '/rules/net/footbag-net'],
  ['/faq/show/941272106', '/hof'],
  ['/faq/show/941275559', '/freestyle/about'],
  ['/faq/show/941274599', '/consecutives'],
  ['/freestyle/5-minute-notation.html', '/freestyle/concepts#jobs-notation'],
  ['/events/show/1741024635', '/events/event_2025_worlds_france'],
  ['/events/show/1226679678', '/events/event_2009_worlds_germany'],
  ['/events/show/1646387871', '/events/event_2022_worlds_poland'],
  ['/events/show/1646855336', '/events/event_2022_22nd_annual_ifpa_european_footbag_championships'],
  ['/events/show/1668541701', '/events/event_2022_xxii_polish_footbag_championships_warsaw'],
  ['/events/show/1624971880', '/events/event_2021_21st_ifpa_european_footbag_net_championships'],
  ['/events/show/1600984774', '/events/event_2020_xx_polish_footbag_championships_warsaw'],
  ['/worlds2003/results.html', '/events/event_2003_worlds_czech_republic'],
  ['/worlds96/results.html', '/events/event_1996_worlds_canada'],
  ['/worlds2011', '/events/event_2011_worlds_finland'],
  ['/worlds97/hall-of-fame.html', '/hof'],
  ['/clubs/show/nyfa', '/clubs/club_new_york'],
];

const SOURCES = new Set(EXPECTED.map(([from]) => from.toLowerCase()));

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const eventTag = insertTag(db, { tag_normalized: '#event_2025_worlds_france', tag_display: '#event_2025_worlds_france' });
  insertEvent(db, { hashtag_tag_id: eventTag, title: 'World Footbag Championships 2025', start_date: '2025-07-28', status: 'completed', registration_status: 'closed' });
  const clubTag = insertTag(db, { standard_type: 'club', tag_normalized: '#club_new_york', tag_display: '#club_new_york' });
  insertClub(db, { hashtag_tag_id: clubTag, name: 'New York Footbag Association', status: 'active' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('cited old footbag.org addresses', () => {
  it('each answers a permanent redirect to the page carrying its content', async () => {
    // A wrong or missing row sends a reader arriving from Wikipedia or a club
    // site to the not-found page, or to the wrong page.
    const app = createApp();
    const wrong: string[] = [];
    for (const [from, to] of EXPECTED) {
      const res = await request(app).get(from);
      if (res.status !== 301 || res.headers.location !== to) {
        wrong.push(`${from} -> ${res.status} ${String(res.headers.location)} (expected 301 ${to})`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('matches regardless of query string, trailing slash, letter case or HEAD', async () => {
    // Outside pages cite with tracking parameters, a trailing slash or other
    // casing; any of those missing the table would show the not-found page.
    const app = createApp();
    const variants = [
      request(app).get('/movelist?utm_source=wikipedia'),
      request(app).get('/movelist/'),
      request(app).get('/MOVELIST'),
      request(app).get('/reference/-/footbag_net_rules'),
      request(app).head('/movelist'),
    ];
    const results = await Promise.all(variants);
    const seen = results.map((r) => `${r.status} ${String(r.headers.location)}`);
    expect(seen).toEqual([
      '301 /freestyle/tricks',
      '301 /freestyle/tricks',
      '301 /freestyle/tricks',
      '301 /rules/net/footbag-net',
      '301 /freestyle/tricks',
    ]);
  });

  it('an old address not on the list answers the not-found page', async () => {
    // A pattern match instead of a fixed list would redirect addresses with no
    // verified citation or no matching page. The listed neighbour in each pair
    // proves the route is live, so the 404s are not an empty table.
    const app = createApp();
    const listed = await request(app).get('/events/show/1226679678');
    expect(listed.status).toBe(301);
    const unlisted = [
      '/events/show/1711460377',
      '/faq/show/941276901',
      '/clubs/index',
      '/rules/chapter/100',
      '/movelist/extra',
      '/reference/-/Footbag_Net',
    ];
    const statuses = await Promise.all(unlisted.map((p) => request(app).get(p).then((r) => `${p} ${r.status}`)));
    expect(statuses).toEqual(unlisted.map((p) => `${p} 404`));
  });

  it('a redirect lands on a page that renders', async () => {
    // A target naming a page that does not exist turns a working citation into
    // a dead end one hop later.
    const app = createApp();
    const targets = [
      '/freestyle/tricks', '/freestyle/tricks?view=add', '/consecutives',
      '/rules/net/footbag-net', '/rules/golf/footbag-golf', '/rules/freestyle/footbag-freestyle',
      '/hof', '/freestyle/about', '/freestyle/concepts',
      '/events/event_2025_worlds_france', '/clubs/club_new_york',
    ];
    const statuses = await Promise.all(targets.map((t) => request(app).get(t).then((r) => `${t} ${r.status}`)));
    expect(statuses).toEqual(targets.map((t) => `${t} 200`));
  });
});

describe('old and new addresses never collide', () => {
  it('the redirect route answers every listed address before any other route', async () => {
    // Registered after a parameter route, /rules/chapter/400 would be captured
    // as a rule page and /clubs/... as a club key, and the redirect would never run.
    const served = (await loadServedRoutes()).filter((r) => r.method === 'GET');
    const late: string[] = [];
    for (const [from] of EXPECTED) {
      const first = served.find((r) => r.matches(from));
      if (!first || !first.path.split('|').includes(from.toLowerCase())) late.push(`${from} first served by ${first?.path}`);
    }
    expect(late).toEqual([]);
  });

  it('no listed address is also a page of this site', async () => {
    // A listed address equal to a real page's address would hide that page
    // behind a redirect.
    const all = (await loadServedRoutes()).filter((r) => r.method === 'GET');
    const registered = all.filter((r) => r.path.includes('|')).flatMap((r) => r.path.split('|'));
    expect(registered.length).toBeGreaterThan(0);
    const literal = all.filter((r) => !r.path.includes('|') && !r.path.includes(':') && !r.path.includes('*'));
    const clashes = literal.filter((r) => registered.some((from) => r.matches(from))).map((r) => r.path);
    expect(clashes).toEqual([]);
    // Positive control: the same check does find a literal page by its own address.
    expect(literal.some((r) => r.matches('/consecutives'))).toBe(true);
  });

  it('the registered list is exactly the verified list, with no target among its sources', async () => {
    // An extra row would redirect an address nobody verified; a target that is
    // also a source would make a redirect chain.
    const served = (await loadServedRoutes()).filter((r) => r.method === 'GET' && r.path.includes('|'));
    expect(served).toHaveLength(1);
    const registered = new Set(served[0].path.split('|'));
    expect([...registered].sort()).toEqual([...SOURCES].sort());
    const chained = EXPECTED.filter(([, to]) => registered.has(to.split(/[?#]/)[0].toLowerCase()));
    expect(chained).toEqual([]);
  });
});

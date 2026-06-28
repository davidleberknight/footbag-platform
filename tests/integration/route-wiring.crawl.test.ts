/**
 * Route-wiring crawl: every link and form target the app renders must
 * resolve to a registered route for the persona it was rendered to.
 *
 * For each persona (anonymous, member, admin) the crawler starts at the
 * section roots, follows every same-origin href it discovers breadth-first,
 * and fails on:
 *   - a 404 (the page rendered a link to a route that does not exist or is
 *     not reachable by the persona it was rendered for)
 *   - any 5xx
 *   - rendered template artifacts in a 200 HTML body: a stray mustache or
 *     an [object Object] means a template emitted internal syntax (a
 *     short-form Handlebars comment that terminated early renders exactly
 *     this way). JSON data islands are stripped before the check since
 *     nested JSON legitimately contains brace runs.
 *
 * POST form targets are probed with an empty body: any response except 404
 * and 5xx proves the route is wired (422/4xx validation responses are the
 * expected answer to an empty body).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertClub,
  insertTag,
  insertEvent,
  insertHistoricalPerson,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { dbPath } = setTestEnv('3171');
// Mount the /dev persona harness so its catalog page and switch links are
// wiring-checked too (the dev router registers only for development/staging).
process.env.FOOTBAG_ENV = 'development';
// The admin curator upload page touches the curated/media roots at render
// time; point both at tmp so the crawl never reaches repo paths.
const MEDIA_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-crawl-media-'));
process.env.FOOTBAG_MEDIA_DIR = MEDIA_TMP;
process.env.FOOTBAG_CURATED_MEDIA_DIR = MEDIA_TMP;

let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID = 'crawl-member-001';
const ADMIN_ID  = 'crawl-admin-001';

// Hard bound per persona so a link explosion fails fast instead of hanging
// the suite. High enough to cover every section root plus discovered detail
// pages on the small seed corpus; the crawl logs what it visited on failure.
const MAX_PAGES = 250;

const SEED_ROOTS = [
  '/', '/members', '/clubs', '/events', '/media', '/media/browse', '/hof',
  '/bap', '/history', '/freestyle', '/net', '/records', '/rules', '/ifpa',
  '/legal', '/login', '/register', '/password/forgot', '/dev/personas',
];

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, {
    id: MEMBER_ID, slug: 'crawl_member', display_name: 'Crawl Member',
    login_email: 'crawl-member@example.com',
  });
  completeOnboarding(db, MEMBER_ID);
  insertMember(db, {
    id: ADMIN_ID, slug: 'crawl_admin', display_name: 'Crawl Admin',
    login_email: 'crawl-admin@example.com', is_admin: 1,
  });
  completeOnboarding(db, ADMIN_ID);
  insertMember(db, {
    id: 'crawl-hof-001', slug: 'crawl_hof', display_name: 'Crawl Hof',
    login_email: 'crawl-hof@example.com', is_hof: 1,
  });
  completeOnboarding(db, 'crawl-hof-001');

  const clubTag = insertTag(db, {
    tag_normalized: '#club_crawlville', tag_display: '#club_crawlville', standard_type: 'club',
  });
  insertClub(db, { name: 'Crawlville Footbag', city: 'Crawlville', country: 'US', hashtag_tag_id: clubTag });

  insertEvent(db, { title: 'Crawl Open', status: 'published' });

  insertHistoricalPerson(db, { person_name: 'Historic Crawler', hof_member: 1 });

  // FH system member + the catalog FH galleries the freestyle landing links
  // statically. Empty galleries render fine; what matters is that the links
  // the landing renders resolve.
  insertMember(db, {
    id: 'crawl-fh-system', slug: 'crawl_fh', display_name: 'Footbag Hacky', is_system: 1,
  });
  const TS = '2026-01-01T00:00:00.000Z';
  for (const galleryId of [
    'gallery_tricks_of_the_trade',
    'gallery_shred_global',
    'gallery_passback_tutorials',
    'gallery_anz_trikz',
    'gallery_footbag_finland',
    'gallery_footbag_org',
  ]) {
    db.prepare(`
      INSERT INTO member_galleries (
        id, created_at, created_by, updated_at, updated_by, version,
        owner_member_id, name, description, is_default
      ) VALUES (?, ?, 'test', ?, 'test', 1, 'crawl-fh-system', ?, '', 0)
    `).run(galleryId, TS, TS, galleryId.replace(/_/g, ' '));
  }

  // Seed the full canonical persona catalog so every /dev/switch link on
  // /dev/personas resolves to a loadable session.
  const { seedPersona } = await import('../../src/testkit/personaFactory');
  const { CANONICAL_PERSONAS } = await import('../../src/testkit/canonicalPersonas');
  for (const spec of CANONICAL_PERSONAS) {
    seedPersona(db, spec);
  }

  db.close();

  // The admin curator pages exercise disk paths at render time; point the
  // curated root at tmp via the service's explicit test seam.
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.setCuratedRootDirForTests(MEDIA_TMP);

  createApp = await importApp();
});

afterAll(async () => {
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.resetCuratedRootDirForTests();
  fs.rmSync(MEDIA_TMP, { recursive: true, force: true });
  cleanupTestDb(dbPath);
});

interface CrawlFailure {
  persona: string;
  url: string;
  via: string;
  problem: string;
}

function shouldSkip(path: string): boolean {
  if (path.startsWith('/media-store/')) return true;
  if (/^\/admin\/curator\/upload\/jobs\/.+\/events$/.test(path)) return true;
  if (path === '/logout') return true;
  // Harness action: refreshing re-seeds personas mid-crawl, so the crawler
  // skips it; a dedicated test probes it after the crawls complete.
  if (path === '/dev/personas/refresh') return true;
  // Freestyle dictionary detail pages resolve from the seeded trick corpus,
  // which this fixture DB does not carry; their wiring is data-dependent,
  // and the freestyle surface is excluded from this sweep. The freestyle
  // landing itself stays in the seed roots.
  if (/^\/freestyle\/.+/.test(path)) return true;
  return false;
}

// Handlebars HTML-escapes attribute values, so a query-string href renders
// with entities: `=` becomes the numeric reference `&#x3D;`, `&` becomes
// `&amp;`. The raw markup must be decoded back to the real URL before parsing,
// or the `#` inside `&#x3D;` truncates the href at the fragment split and every
// `?key=value` link collapses to `?key`, silently never getting probed.
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function normalize(href: string): string | null {
  const decoded = decodeEntities(href);
  if (!decoded.startsWith('/')) return null;     // external, mailto, anchors
  if (decoded.startsWith('//')) return null;     // protocol-relative external
  const noHash = decoded.split('#')[0];
  return noHash === '' ? null : noHash;
}

function extractTargets(html: string): { gets: string[]; posts: string[] } {
  const gets: string[] = [];
  const posts: string[] = [];
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const p = normalize(m[1]);
    if (p) gets.push(p);
  }
  for (const m of html.matchAll(/<form\b[^>]*>/g)) {
    const tag = m[0];
    const action = /action="([^"]+)"/.exec(tag)?.[1];
    const method = (/method="([^"]+)"/.exec(tag)?.[1] ?? 'get').toLowerCase();
    if (!action) continue;
    const p = normalize(action);
    if (!p) continue;
    if (method === 'post') posts.push(p);
    else gets.push(p);
  }
  return { gets, posts };
}

// Brace runs inside JSON data islands are legitimate; everything else in a
// rendered page must be mustache-free.
function stripJsonIslands(html: string): string {
  return html.replace(/<script type="application\/json"[^>]*>[\s\S]*?<\/script>/g, '');
}

async function crawlAs(
  persona: string,
  cookie: string | null,
): Promise<{ failures: CrawlFailure[]; visited: Set<string> }> {
  const app = createApp();
  const failures: CrawlFailure[] = [];
  const visited = new Set<string>();
  const queue: Array<{ url: string; via: string }> = SEED_ROOTS.map((url) => ({ url, via: '(seed)' }));
  const postProbed = new Set<string>();

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const { url, via } = queue.shift()!;
    if (visited.has(url) || shouldSkip(url)) continue;
    visited.add(url);

    let req = request(app).get(url).redirects(0);
    if (cookie) req = req.set('Cookie', cookie);
    const res = await req;

    if (res.status >= 500) {
      failures.push({ persona, url, via, problem: `GET ${res.status}` });
      continue;
    }
    if (res.status === 404 && via !== '(seed)') {
      // A 404 on a seed root is route-shape knowledge (e.g. /history has no
      // index by design); a 404 on a RENDERED link is a broken target.
      failures.push({ persona, url, via, problem: 'rendered link resolves to 404' });
      continue;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = normalize(String(res.headers.location ?? ''));
      if (loc && !visited.has(loc)) queue.push({ url: loc, via: `${url} (redirect)` });
      continue;
    }
    if (res.status !== 200 || !String(res.headers['content-type'] ?? '').includes('text/html')) {
      continue;
    }

    const body = stripJsonIslands(res.text);
    if (body.includes('[object Object]')) {
      failures.push({ persona, url, via, problem: 'rendered [object Object]' });
    }
    if (/\{\{|\}\}/.test(body)) {
      failures.push({ persona, url, via, problem: 'rendered raw mustache artifact' });
    }

    const { gets, posts } = extractTargets(res.text);
    for (const target of gets) {
      if (!visited.has(target) && !shouldSkip(target)) queue.push({ url: target, via: url });
    }
    for (const target of posts) {
      if (postProbed.has(target) || shouldSkip(target)) continue;
      postProbed.add(target);
      let post = request(app).post(target).redirects(0).type('form');
      if (cookie) post = post.set('Cookie', cookie);
      const postRes = await post.send({});
      if (postRes.status === 404) {
        failures.push({ persona, url: target, via: `form on ${url}`, problem: 'form action resolves to 404' });
      } else if (postRes.status >= 500) {
        failures.push({ persona, url: target, via: `form on ${url}`, problem: `form action POST ${postRes.status}` });
      }
    }
  }

  // Reaching the page budget means coverage was capped: links beyond it were
  // never probed, so an unfollowed broken link could hide in the tail. Fail
  // loudly and raise the budget rather than let truncation pass silently.
  if (visited.size >= MAX_PAGES) {
    failures.push({ persona, url: '(crawl)', via: '(budget)', problem: `hit MAX_PAGES=${MAX_PAGES}; coverage truncated, raise the budget` });
  }

  return { failures, visited };
}

describe('route wiring crawl', () => {
  it('anonymous: every rendered link and form target resolves; no template artifacts', async () => {
    const { failures } = await crawlAs('anonymous', null);
    expect(failures).toEqual([]);
  });

  it('authenticated member: every rendered link and form target resolves; no template artifacts', async () => {
    const cookie = `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
    const { failures } = await crawlAs('member', cookie);
    expect(failures).toEqual([]);
  });

  it('admin: every rendered link and form target resolves; no template artifacts', async () => {
    const cookie = `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
    const { failures, visited } = await crawlAs('admin', cookie);
    expect(failures).toEqual([]);
    // Guards the entity-decode path: a query-string link (the `?as=` carries an
    // HTML-escaped `=`) must be followed with its value intact, not truncated.
    expect(visited.has('/dev/switch?as=t0_fresh')).toBe(true);
    // A login-blocked persona is an exercisable link, not a dead row: its
    // /dev/login target is followed and resolves (it lands on /login).
    expect(visited.has('/dev/login?as=unverified')).toBe(true);
  });

  // Probed after the crawls because a successful refresh re-seeds every
  // persona; the crawler skips it mid-walk for the same reason.
  it('persona refresh form action executes and redirects back to the listing', async () => {
    const app = createApp();
    const res = await request(app).post('/dev/personas/refresh').redirects(0).type('form').send({});
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dev/personas');
  });
});

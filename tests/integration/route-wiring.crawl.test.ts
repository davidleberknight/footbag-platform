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
 * expected answer to an empty body). A POST that redirects (a create that
 * 302s to the resource it made) has its Location enqueued, so a GET page
 * reachable only through a POST is still crawled rather than silently missed.
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
// the suite. High enough to cover every section root plus the freestyle index
// and static pages, the operator QC pages, and discovered detail pages on the
// small seed corpus; the crawl logs what it visited on failure.
const MAX_PAGES = 450;

const SEED_ROOTS = [
  '/', '/members', '/clubs', '/events', '/media', '/media/browse', '/hof',
  '/bap', '/history', '/freestyle', '/net', '/records', '/rules', '/ifpa',
  '/legal', '/login', '/register', '/password/forgot', '/dev/personas',
  // Admin claim form: requireAuth-only, above the admin gate, linked from no
  // page. Anonymous/non-admin see the redirect/gate; the crawl confirms it wires.
  '/admin/bootstrap-claim',
  // Operator QC surface: admin-gated GET pages linked from no crawled page, so
  // seeded directly. Anonymous redirects to /login and a non-admin member gets
  // 403 (both skipped); only the admin persona renders them. Detail pages that
  // need a row id are reached via links from these lists when data exists.
  '/internal/persons/qc', '/internal/persons/browse',
  '/internal/net/team-corrections', '/internal/net/recovery-signals',
  '/internal/net/recovery-candidates', '/internal/net/review/summary',
  '/internal/net/review', '/internal/net/curated', '/internal/net/candidates',
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
  // Freestyle dictionary detail pages resolve a specific trick, set, family, or
  // modifier from the seeded corpus, which this fixture DB does not carry, so
  // their wiring is data-dependent and skipped. The section's index and static
  // pages (landing, tricks index, glossary, operators, about, ...) carry no
  // corpus dependency and are crawled. The flat sets reference table is a
  // literal page, not a per-set detail, so it stays crawled.
  if (/^\/freestyle\/tricks\/.+/.test(path)) return true;
  if (/^\/freestyle\/sets\/(?!reference$).+/.test(path)) return true;
  if (/^\/freestyle\/families\/.+/.test(path)) return true;
  if (/^\/freestyle\/modifier\/.+/.test(path)) return true;
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
      } else if (postRes.status >= 300 && postRes.status < 400) {
        // A create/action POST that 302s to the resource it produced: follow
        // the Location so a GET page reachable only via this POST is crawled.
        const loc = normalize(String(postRes.headers.location ?? ''));
        if (loc && !visited.has(loc)) queue.push({ url: loc, via: `form on ${url} (redirect)` });
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

// The persona-switch route issues a real session cookie on its 302; pulling it
// out lets the crawl render pages AS the switched persona instead of only
// confirming the switch link resolves.
function sessionCookieFrom(setCookie: string[] | string | undefined): string | null {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const c of cookies) {
    const m = /^footbag_session=[^;]+/.exec(c);
    if (m) return m[0];
  }
  return null;
}

async function renderProblem(
  app: ReturnType<typeof createApp>,
  cookie: string,
  url: string,
): Promise<string | null> {
  const res = await request(app).get(url).set('Cookie', cookie).redirects(0);
  if (res.status >= 500) return `GET ${res.status}`;
  if (res.status !== 200) return `expected 200, got ${res.status}`;
  if (!String(res.headers['content-type'] ?? '').includes('text/html')) return 'not html';
  const body = stripJsonIslands(res.text);
  if (body.includes('[object Object]')) return 'rendered [object Object]';
  if (/\{\{|\}\}/.test(body)) return 'rendered raw mustache artifact';
  return null;
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
    // The operator QC pages are admin-gated and linked from no crawled page, so
    // a silently-skipped non-200 would still pass the crawl. Pin that the admin
    // persona actually renders one, proving real coverage past both gates.
    const qc = await request(createApp()).get('/internal/persons/qc').set('Cookie', cookie);
    expect(qc.status).toBe(200);
    // Guards the entity-decode path: a query-string link (the `?as=` carries an
    // HTML-escaped `=`) must be followed with its value intact, not truncated.
    expect(visited.has('/dev/switch?as=t0_fresh')).toBe(true);
    // A login-blocked persona is an exercisable link, not a dead row: its
    // /dev/login target is followed and resolves (it lands on /login).
    expect(visited.has('/dev/login?as=unverified')).toBe(true);
  });

  // Adopting the session cookie the switch route issues renders pages AS each
  // persona, so tier, honor, and club-role conditional surfaces are actually
  // walked rather than only having their switch link confirmed to resolve. A
  // role-diverse, onboarding-complete sample keeps this proportionate; the full
  // route-by-persona authorization matrix lives in its own suite.
  it('each role-distinct persona renders its own conditional surfaces', async () => {
    const app = createApp();
    const personaSlugs = [
      't0_fresh', 't1_paid', 't2_paid', 't3_comped',
      'honors_hof', 'club_leader', 'club_coleader', 'legacy_linked',
    ];
    const failures: CrawlFailure[] = [];
    for (const slug of personaSlugs) {
      const sw = await request(app).get(`/dev/switch?as=${slug}`).redirects(0);
      expect(sw.status, `switch to ${slug} redirects`).toBe(302);
      const cookie = sessionCookieFrom(sw.headers['set-cookie']);
      expect(cookie, `switch to ${slug} issues a session cookie`).toBeTruthy();
      for (const url of ['/', `/members/${slug}`, `/members/${slug}/edit`]) {
        const problem = await renderProblem(app, cookie!, url);
        if (problem) failures.push({ persona: slug, url, via: 'persona-switch walk', problem });
      }
    }
    expect(failures).toEqual([]);
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

// ── Button-destination integrity ─────────────────────────────────────────────
// A button's label is a promise: on any one page, two controls that show the
// SAME label must lead to the SAME place. This catches the class of defect the
// wiring crawl above cannot — a button that resolves fine but does not do what
// its label says, quietly landing the user somewhere else (a "Link My History"
// button that actually searches, or two "Apply" buttons hitting different
// endpoints). The route-resolves check proves the target exists; this proves the
// label does not lie about which target. Checked statically over every rendered
// template so states the crawl never reaches (wizard candidate cards) are covered
// too.
const VIEWS_DIR = path.join(process.cwd(), 'src', 'views');
const ALL_TEMPLATES = fs.globSync('**/*.hbs', { cwd: VIEWS_DIR });

function normalizeDestination(raw: string): string {
  return raw
    .split('?')[0]                                  // query carries per-row ids, not a different page
    .replace(/\{\{[^}]*\}\}/g, ':x')                // Handlebars interpolation → placeholder
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':x')      // Express :params → placeholder
    .replace(/\/$/, '');
}

function normalizeLabel(raw: string): string {
  return raw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

interface LabelledControl { label: string; destination: string }

function extractControls(html: string): LabelledControl[] {
  const controls: LabelledControl[] = [];
  // Form-submit buttons: the form's action is the destination.
  for (const form of html.matchAll(/<form\b[^>]*\baction="([^"]+)"[^>]*>([\s\S]*?)<\/form>/gi)) {
    const destination = normalizeDestination(form[1]);
    for (const btn of form[2].matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)) {
      const label = normalizeLabel(btn[1]);
      if (label) controls.push({ label, destination });
    }
  }
  // Button-styled anchors: a CTA that looks like a button but navigates by href.
  for (const anchor of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (!/\bclass="[^"]*\bbtn\b[^"]*"/i.test(anchor[1])) continue;
    const href = /\bhref="([^"]+)"/i.exec(anchor[1])?.[1];
    if (!href) continue;
    const label = normalizeLabel(anchor[2]);
    if (label) controls.push({ label, destination: normalizeDestination(href) });
  }
  return controls;
}

// An identity-switch verb is legitimately polymorphic: "Switch" means "become
// this identity", and the persona harness offers more than one switch mechanism
// (a seeded persona via /dev/switch, a real claimed member via /dev/build-claim).
// Both honour the label, so a Switch control may fan out to more than one switch
// endpoint without lying about where the click lands. Exempt that label from the
// single-destination promise; every other label still promises one destination.
const LABELS_ALLOWED_MULTIPLE_DESTINATIONS = new Set(['Switch']);

describe('button-destination integrity (every rendered template)', () => {
  it.each(ALL_TEMPLATES)('%s: each button label leads to exactly one destination', (file) => {
    const html = fs.readFileSync(path.join(VIEWS_DIR, file), 'utf8');
    const byLabel = new Map<string, Set<string>>();
    for (const c of extractControls(html)) {
      if (!byLabel.has(c.label)) byLabel.set(c.label, new Set());
      byLabel.get(c.label)!.add(c.destination);
    }
    const liars = [...byLabel.entries()]
      .filter(([label, dests]) => dests.size > 1 && !LABELS_ALLOWED_MULTIPLE_DESTINATIONS.has(label))
      .map(([label, dests]) => `"${label}" -> {${[...dests].join(' , ')}}`);
    expect(
      liars,
      `${file}: a button label must promise one destination; these lead to several:\n  ${liars.join('\n  ')}`,
    ).toEqual([]);
  });
});

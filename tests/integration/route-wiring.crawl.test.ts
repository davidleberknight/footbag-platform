/**
 * Route-wiring crawl: every page the app renders, walked as a visitor, a
 * member, an administrator and the owner of the private-field canaries, and
 * checked by the crawl oracles.
 *
 * Each crawl starts at the section roots and follows every same-origin link,
 * form and asset breadth-first. It fails on:
 *   - a 5xx, or an operator-alert error logged while a request was served;
 *   - a rendered link, form or asset that resolves to 404;
 *   - a rendered link or form the same persona is then refused;
 *   - a redirect that leaves the site, including a path-carrying query
 *     parameter replayed with an off-site value;
 *   - template artifacts, invalid markup, a missing or doubled title or h1;
 *   - a public page without its canonical link and description, an error page
 *     claiming a canonical address, a signed-in page not kept out of indexes;
 *   - a seeded private value shown to a viewer outside its audience.
 * Across the crawls it also proves every served route was reached or carries a
 * reasoned exemption, every sitemap entry is live and indexable, distinct
 * pages carry distinct titles, and every private value does render for its own
 * audience (otherwise the leak check would pass on a value nobody renders).
 *
 * POST form targets are probed with an empty body: any response except 404 and
 * 5xx proves the route is wired. A POST that redirects has its Location
 * enqueued, so a page reachable only through a POST is still crawled.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from '../fixtures/supertestWithOrigin';
import { cleanupTestDb, importApp } from '../fixtures/testDb';
import { createTestSessionJwt } from '../fixtures/factories';
import { loadServedRoutes, type ServedRoute } from '../fixtures/routeTable';
import {
  crawl,
  supertestFetcher,
  switchTo,
  type CrawlPersona,
  type CrawlResult,
} from '../fixtures/crawl/core';
import {
  canariesShown,
  canonicalOf,
  duplicateTitleFindings,
  ledgerFindings,
  pageTitle,
  storyIdsFrom,
  sitemapEntryFindings,
  sitemapPaths,
  unreachedRouteFindings,
  type Canary,
  type Finding,
} from '../fixtures/crawl/oracles';
import { errorPageChecks, pageChecks } from '../fixtures/crawl/pageChecks';
import { canariesFor } from '../fixtures/crawl/canaries';
import { ROUTE_STORIES, STORIES_WITHOUT_ROUTE } from '../fixtures/crawl/routeStories';
import {
  applyFindingExemptions,
  CANARY_CONTROL_EXEMPTIONS,
  CRAWL_FINDING_EXEMPTIONS,
  ROUTE_EXEMPTIONS,
  SITEMAP_FINDING_EXEMPTIONS,
  TITLE_FINDING_EXEMPTIONS,
} from '../fixtures/crawl/exemptions';
import {
  CRAWL_ADMIN_ID,
  CRAWL_MEMBER_ID,
  SEED_ROOTS,
  prepareCrawlEnv,
  seedCrawlFixture,
  shouldSkip,
  teardownCrawlFixture,
} from '../fixtures/crawl/seedCrawlFixture';

const env = prepareCrawlEnv('3171');
const SELF_ORIGIN = 'http://localhost:3171';

let createApp: Awaited<ReturnType<typeof importApp>>;
let canaries: Canary[] = [];
let canaryOwnerId = '';
let served: ServedRoute[] = [];

// Hard bound per persona so a link explosion fails fast instead of hanging the
// suite. The widest run (the administrator, who sees every member record) sits
// near 700 pages with the full persona catalog and the canaries seeded; the
// bound keeps headroom so a persona or two costs nothing while a genuine link
// explosion still trips it. Raise it when the crawl reports the cap, never
// lower it to make a run fit.
const MAX_PAGES = 1000;

/**
 * Ceiling for the case that runs the crawls, derived from the crawls' own
 * budget rather than from how long a walk happens to take here: four walks of
 * up to MAX_PAGES at tens of milliseconds a page, plus markup validation once
 * per distinct body, with margin for a workstation several times slower.
 */
const CRAWL_TIMEOUT_MS = 600_000;

beforeAll(async () => {
  const fixture = await seedCrawlFixture(env);
  canaries = canariesFor(fixture.canaries);
  canaryOwnerId = fixture.canaries.hidden.id;
  createApp = await importApp();
  served = await loadServedRoutes();
});

afterAll(async () => {
  await teardownCrawlFixture(env);
  cleanupTestDb(env.dbPath);
});

async function loggedErrorCounter(): Promise<() => number> {
  const { logger } = await import('../../src/config/logger');
  return () => (vi.isMockFunction(logger.error) ? vi.mocked(logger.error).mock.calls.length : 0);
}

function jwtPersona(name: string, memberId: string, isAdmin = false): CrawlPersona {
  const jwt = createTestSessionJwt({ memberId, role: isAdmin ? 'admin' : 'member' });
  return {
    name, cookie: `__Host-footbag_session=${jwt}`,
    authenticated: true, onboarded: true, memberId, isAdmin,
  };
}

interface CrawlSet {
  byPersona: Map<string, CrawlResult>;
}

// The crawls run once, inside the first case that needs them, so the
// operator-alert spy the shared setup installs per case is in place and every
// logged error is attributed to the request that produced it.
// The canary subjects' own profiles are seeded directly: a member profile is
// reached by search or by a link from somewhere the subject appears, and the
// canaries appear nowhere else.
const CANARY_ROOTS = ['/members/canary_hidden', '/members/canary_hidden/edit', '/members/canary_shown'];

// Personas whose own surfaces the full crawls cannot reach, walked within the
// part of the site that differs for them: a registrant still in the wizard, and
// a club leader on the club pages they lead. Scoping keeps each walk small.
const SCOPED_PERSONAS: ReadonlyArray<{ slug: string; onboarded: boolean; seeds: string[]; scope: RegExp }> = [
  {
    slug: 'onb_unstarted', onboarded: false,
    seeds: ['/', '/register/wizard/personal_details'],
    scope: /^\/(?:register\/wizard(?:\/|$)|$)/,
  },
  {
    slug: 'onb_partial', onboarded: false,
    seeds: ['/register/wizard/legacy_claim'],
    scope: /^\/register\/wizard(?:\/|$)/,
  },
  {
    slug: 'club_leader', onboarded: true,
    seeds: ['/clubs', '/members/club_leader'],
    scope: /^\/(?:clubs|members\/club_leader)(?:[/?]|$)/,
  },
];
const SCOPED_MAX_PAGES = 200;

let crawlSet: Promise<CrawlSet> | null = null;
function crawls(): Promise<CrawlSet> {
  crawlSet ??= (async () => {
    const fetcher = supertestFetcher(createApp());
    const loggedErrorCount = await loggedErrorCounter();
    const common = {
      fetcher, selfOrigin: SELF_ORIGIN, loggedErrorCount, replayOpenRedirects: true,
      pageOracles: pageChecks({ canaries }), errorPageOracles: errorPageChecks,
    };
    const personas: CrawlPersona[] = [
      { name: 'anonymous', cookie: null, authenticated: false, onboarded: false },
      jwtPersona('member', CRAWL_MEMBER_ID),
      jwtPersona('admin', CRAWL_ADMIN_ID, true),
      jwtPersona('canary-owner', canaryOwnerId),
    ];
    const byPersona = new Map<string, CrawlResult>();
    for (const persona of personas) {
      byPersona.set(persona.name, await crawl({
        ...common, persona, seeds: [...SEED_ROOTS, ...CANARY_ROOTS], maxPages: MAX_PAGES, shouldSkip,
      }));
    }
    for (const s of SCOPED_PERSONAS) {
      const cookie = await switchTo(fetcher, s.slug);
      expect(cookie, `switch to ${s.slug} issues a session`).toBeTruthy();
      const persona: CrawlPersona = {
        name: s.slug, cookie, authenticated: true, onboarded: s.onboarded,
        memberId: `member_persona_${s.slug}`,
      };
      byPersona.set(s.slug, await crawl({
        ...common, persona, seeds: s.seeds, maxPages: SCOPED_MAX_PAGES,
        shouldSkip: (p) => shouldSkip(p) || !s.scope.test(p),
      }));
    }
    return { byPersona };
  })();
  return crawlSet;
}

function allFindings(set: CrawlSet): Finding[] {
  return [...set.byPersona.values()].flatMap((r) => r.findings);
}

describe('route wiring crawl', () => {
  it('every rendered page, link, form and asset passes the page oracles for every crawled persona', async () => {
    const set = await crawls();
    const { open, stale } = applyFindingExemptions(allFindings(set), CRAWL_FINDING_EXEMPTIONS);
    expect(open, 'crawl findings').toEqual([]);
    expect(stale.map((e) => e.why), 'finding exemptions that no longer match anything').toEqual([]);
  }, CRAWL_TIMEOUT_MS);

  it('the walk follows HTML-escaped query links and login-blocked persona rows', async () => {
    const admin = (await crawls()).byPersona.get('admin')!;
    // A query-string link carries an HTML-escaped `=`; it must be followed with
    // its value intact, not truncated at the escape.
    expect(admin.visited.has('/dev/switch?as=t0_fresh')).toBe(true);
    // A login-blocked persona is an exercisable link, not a dead row.
    expect(admin.visited.has('/dev/login?as=unverified')).toBe(true);
    // The retired operator surface stays unreachable even for an administrator.
    const cookie = jwtPersona('admin', CRAWL_ADMIN_ID, true).cookie!;
    const retired = await request(createApp()).get('/internal/persons/qc').set('Cookie', cookie);
    expect(retired.status).toBe(404);
  }, CRAWL_TIMEOUT_MS);

  it('every served route is reached by a crawl or carries a reasoned exemption', async () => {
    const set = await crawls();
    const reached: Array<{ method: string; path: string }> = [];
    for (const r of set.byPersona.values()) {
      for (const [p, status] of r.getStatus) if (status !== 404 && status < 500) reached.push({ method: 'GET', path: p });
      for (const [p, status] of r.postStatus) if (status !== 404 && status < 500) reached.push({ method: 'POST', path: p });
    }
    // A router missing from the table would leave every route on it outside
    // the coverage check without a single unreached finding.
    expect([...new Set(served.map((r) => r.router))].sort(), 'routers the coverage check reads')
      .toEqual(['admin', 'dev', 'health', 'ipc', 'public', 'seo']);
    expect(unreachedRouteFindings(served, reached, ROUTE_EXEMPTIONS)).toEqual([]);
  }, CRAWL_TIMEOUT_MS);

  it('distinct public pages carry distinct titles', async () => {
    const anon = (await crawls()).byPersona.get('anonymous')!;
    const pages = anon.pages.map((p) => ({ url: p.url, canonical: canonicalOf(p.res.body), title: pageTitle(p.res.body) }));
    const { open, stale } = applyFindingExemptions(
      duplicateTitleFindings(pages).map((d) => ({ persona: 'anonymous', url: d.url, via: '(titles)', oracle: 'seo' as const, problem: d.problem })),
      TITLE_FINDING_EXEMPTIONS,
    );
    expect(open).toEqual([]);
    expect(stale.map((e) => e.why), 'title exemptions that no longer match anything').toEqual([]);
  }, CRAWL_TIMEOUT_MS);

  it('every private value renders for its own audience, so the leak check is not vacuous', async () => {
    const set = await crawls();
    const shownTo = new Map<string, Set<string>>();
    for (const [name, r] of set.byPersona) {
      if (name === 'anonymous') continue;
      for (const page of r.pages) {
        for (const c of canariesShown(page.res.body, canaries)) {
          const key = `${c.subjectMemberId} ${c.field}`;
          shownTo.set(key, (shownTo.get(key) ?? new Set()).add(name));
        }
      }
    }
    const exempt = new Set(CANARY_CONTROL_EXEMPTIONS.map((e) => e.field));
    const neverShown = canaries
      .filter((c) => !shownTo.has(`${c.subjectMemberId} ${c.field}`) && !exempt.has(c.field))
      .map((c) => `${c.subjectMemberId} ${c.field}`);
    expect(neverShown, 'private values no in-audience viewer ever saw').toEqual([]);
    const staleControls = CANARY_CONTROL_EXEMPTIONS
      .filter((e) => canaries.some((c) => c.field === e.field && shownTo.has(`${c.subjectMemberId} ${c.field}`)))
      .map((e) => e.field);
    expect(staleControls, 'control exemptions for values that now render').toEqual([]);
  }, CRAWL_TIMEOUT_MS);
});

describe('route-to-story ledger', () => {
  // Read from the working tree, because the catalogue under test is the one
  // this checkout serves.
  it('maps every served route to a story and accounts for every story, both ways', () => {
    const catalogue = fs.readFileSync(path.join(process.cwd(), 'docs', 'USER_STORIES.md'), 'utf8');
    const storyIds = storyIdsFrom(catalogue);
    expect(storyIds.length, 'no story headings read from the catalogue').toBeGreaterThan(100);
    expect(ledgerFindings({
      servedRoutes: served.map((r) => `${r.method} ${r.path}`),
      storyIds,
      routeStories: ROUTE_STORIES,
      storiesWithoutRoute: STORIES_WITHOUT_ROUTE,
    })).toEqual([]);
  });
});

describe('sitemap', () => {
  it('lists only live, indexable, non-member pages', async () => {
    const app = createApp();
    const xml = await request(app).get('/sitemap.xml');
    expect(xml.status).toBe(200);
    const paths = sitemapPaths(xml.text, SELF_ORIGIN);
    expect(paths.length, 'sitemap lists no pages').toBeGreaterThan(0);
    const problems: string[] = [];
    const used = new Set<(typeof SITEMAP_FINDING_EXEMPTIONS)[number]>();
    for (const p of paths) {
      const res = await request(app).get(p).redirects(0);
      const location = res.headers.location as string | undefined;
      for (const problem of sitemapEntryFindings(p, res.status, res.text ?? '', location)) {
        const ex = SITEMAP_FINDING_EXEMPTIONS.find((e) => e.entry.test(p) && e.problem.test(problem));
        if (ex) used.add(ex);
        else problems.push(`${p}: ${problem}`);
      }
    }
    expect(problems).toEqual([]);
    const stale = SITEMAP_FINDING_EXEMPTIONS.filter((e) => !used.has(e)).map((e) => e.why);
    expect(stale, 'sitemap exemptions that no longer match anything').toEqual([]);
  });
});

describe('persona harness refresh', () => {
  // Probed on its own because a successful refresh re-seeds every persona; the
  // crawler skips it mid-walk for the same reason.
  it('persona refresh form action executes and redirects back to the listing', async () => {
    await crawls();
    const res = await request(createApp()).post('/dev/personas/refresh').redirects(0).type('form').send({});
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dev/personas');
  }, CRAWL_TIMEOUT_MS);
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
// The templates on disk, which are the ones the application under test
// renders: a template deleted or added in the working tree is checked as it
// stands, not as the last commit left it. Only .hbs files are read, so an
// editor's swap file is never collected.
const ALL_TEMPLATES = (fs.readdirSync(VIEWS_DIR, { recursive: true }) as string[])
  .filter((rel) => rel.endsWith('.hbs'))
  .map((rel) => rel.split(path.sep).join('/'));

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
  // One code path over every template, so one case that names each offending
  // file rather than one case per template.
  it('each button label in every template leads to exactly one destination', () => {
    expect(ALL_TEMPLATES.length, 'no templates found to check').toBeGreaterThan(50);
    const offenders: string[] = [];
    for (const file of ALL_TEMPLATES) {
      const html = fs.readFileSync(path.join(VIEWS_DIR, file), 'utf8');
      const byLabel = new Map<string, Set<string>>();
      for (const c of extractControls(html)) {
        if (!byLabel.has(c.label)) byLabel.set(c.label, new Set());
        byLabel.get(c.label)!.add(c.destination);
      }
      for (const [label, dests] of byLabel) {
        if (dests.size > 1 && !LABELS_ALLOWED_MULTIPLE_DESTINATIONS.has(label)) {
          offenders.push(`${file}: "${label}" -> {${[...dests].join(' , ')}}`);
        }
      }
    }
    expect(
      offenders,
      `a button label must promise one destination; these lead to several:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});

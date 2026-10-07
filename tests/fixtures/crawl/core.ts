/**
 * Crawler core shared by every page crawl.
 *
 * A breadth-first walk over the links, forms and assets a page renders, run as
 * one persona, through an injectable fetcher: the in-process suites pass a
 * supertest fetcher, and a later browser or loopback leg can pass `fetch`
 * without the walk changing. The walk itself decides only what was reached and
 * how each request answered; every judgement about a page is a pure oracle in
 * `oracles.ts`, so each defect class is proven red on a planted page in a unit
 * test rather than trusted from a green crawl.
 *
 * What the walk reports by itself, because only the walk knows how a target
 * was found:
 *   - a server error on a GET, or on the empty-body POST probe of a form;
 *   - an operator-alert error logged while a request was served, attributed to
 *     that request;
 *   - a rendered link, form or asset that resolves to 404;
 *   - a rendered link or form the same persona is then refused (403, a signed-in
 *     visitor sent to log in, an onboarded member sent into the wizard, or a
 *     registrant still onboarding sent into the wizard from outside it);
 *   - a redirect whose Location leaves the site, including a path-carrying
 *     query parameter replayed with an off-site value;
 *   - reaching the page budget, which would truncate coverage silently.
 */
import request from '../supertestWithOrigin';
import type { Express } from 'express';
import {
  type Finding,
  type OracleName,
  openRedirectFinding,
  shownButRefusedFinding,
} from './oracles';

export interface CrawlResponse {
  status: number;
  /** Lower-cased header names; multi-valued headers joined by ', '. */
  headers: Record<string, string>;
  setCookie: string[];
  body: string;
}

export interface Fetcher {
  get(url: string, cookie: string | null): Promise<CrawlResponse>;
  post(url: string, cookie: string | null): Promise<CrawlResponse>;
}

export interface CrawlPersona {
  name: string;
  cookie: string | null;
  /** Holds a session: a login redirect on a rendered link is then a refusal. */
  authenticated: boolean;
  /** Onboarding complete: a wizard redirect on a rendered link is then a refusal. */
  onboarded: boolean;
  /** Member id behind the session, for audience decisions about owned data. */
  memberId?: string;
  isAdmin?: boolean;
}

/** How a queued target was found; decides which oracles apply to its answer. */
export type TargetKind = 'seed' | 'link' | 'form-get' | 'asset' | 'redirect' | 'form-redirect';

export interface PageVisit {
  persona: CrawlPersona;
  url: string;
  via: string;
  res: CrawlResponse;
}

export interface CrawlOptions {
  persona: CrawlPersona;
  fetcher: Fetcher;
  seeds: string[];
  maxPages: number;
  shouldSkip: (path: string) => boolean;
  /** Pure page oracles run over every 200 HTML page. */
  pageOracles?: (visit: PageVisit) => Finding[];
  /** Pure oracles run over every HTML error response (status 400 and up). */
  errorPageOracles?: (visit: PageVisit) => Finding[];
  /** Monotonic count of operator-alert errors logged so far, for attribution. */
  loggedErrorCount?: () => number;
  /** The site's own origin; a Location elsewhere is an open-redirect candidate. */
  selfOrigin: string;
  /** Off-site origins a redirect may legitimately target. */
  allowedRedirectOrigins?: readonly string[];
  /** Replay path-carrying query parameters with an off-site value. */
  replayOpenRedirects?: boolean;
  /**
   * Whether reaching `maxPages` is a finding. True by default, because a capped
   * full crawl silently skips its tail; a deliberately bounded sample (the
   * persona sweep's second hop) sets it false and says so where it does.
   */
  reportBudget?: boolean;
}

export interface CrawlResult {
  findings: Finding[];
  visited: Set<string>;
  /** Every GET the walk issued, with the status it answered. */
  getStatus: Map<string, number>;
  /** Every POST the walk issued, with the status it answered. */
  postStatus: Map<string, number>;
  /** The 200 HTML pages, for cross-page oracles. */
  pages: PageVisit[];
}

// Handlebars HTML-escapes attribute values, so a query-string href renders
// with entities: `=` becomes the numeric reference `&#x3D;`, `&` becomes
// `&amp;`. The raw markup must be decoded back to the real URL before parsing,
// or the `#` inside `&#x3D;` truncates the href at the fragment split and every
// `?key=value` link collapses to `?key`, silently never getting probed.
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** A same-origin path without its fragment, or null for anything else. */
export function normalize(href: string): string | null {
  const decoded = decodeEntities(href);
  if (!decoded.startsWith('/')) return null;     // external, mailto, anchors
  if (decoded.startsWith('//')) return null;     // protocol-relative external
  const noHash = decoded.split('#')[0];
  return noHash === '' ? null : noHash;
}

export interface Targets {
  gets: string[];
  posts: string[];
  /** Same-origin subresources: script and image sources, stylesheet links. */
  assets: string[];
}

/**
 * The same-origin targets a page renders. A form with no action submits to
 * the page itself, so `pageUrl` (when given) stands in for its missing action;
 * without it such a form is never probed and its handler goes unchecked.
 */
export function extractTargets(html: string, pageUrl?: string): Targets {
  const gets: string[] = [];
  const posts: string[] = [];
  const assets: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel="[^"]*\bstylesheet\b/i.test(m[0])) continue;
    const href = /\bhref="([^"]+)"/i.exec(m[0])?.[1];
    const p = href ? normalize(href) : null;
    if (p) assets.push(p);
  }
  for (const m of html.matchAll(/<(?:script|img)\b[^>]*\bsrc="([^"]+)"/gi)) {
    const p = normalize(m[1]);
    if (p) assets.push(p);
  }
  const assetSet = new Set(assets);
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const p = normalize(m[1]);
    if (p && !assetSet.has(p)) gets.push(p);
  }
  for (const m of html.matchAll(/<form\b[^>]*>/g)) {
    const tag = m[0];
    const action = /action="([^"]*)"/.exec(tag)?.[1];
    const method = (/method="([^"]+)"/.exec(tag)?.[1] ?? 'get').toLowerCase();
    if (!action && !(method === 'post' && pageUrl)) continue;
    const p = action ? normalize(action) : pageUrl!.split('?')[0];
    if (!p) continue;
    if (method === 'post') posts.push(p);
    else gets.push(p);
  }
  return { gets, posts, assets };
}

// Brace runs inside JSON data islands are legitimate; everything else in a
// rendered page must be mustache-free.
export function stripJsonIslands(html: string): string {
  return html.replace(/<script type="application\/json"[^>]*>[\s\S]*?<\/script>/g, '');
}

// The persona-switch route issues a real session cookie on its 302; pulling it
// out lets a crawl render pages AS the switched persona.
export function sessionCookieFrom(setCookie: string[] | string | undefined): string | null {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const c of cookies) {
    const m = /^__Host-footbag_session=[^;]+/.exec(c);
    if (m) return m[0];
  }
  return null;
}

/**
 * Becomes a catalog persona through the same switch a tester uses, returning
 * the session cookie it issues, or null when the switch refuses the persona.
 */
export async function switchTo(fetcher: Fetcher, slug: string): Promise<string | null> {
  const res = await fetcher.get(`/dev/switch?as=${encodeURIComponent(slug)}`, null);
  if (res.status !== 302) return null;
  return sessionCookieFrom(res.setCookie);
}

function flattenHeaders(h: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return out;
}

/** In-process fetcher over a booted app; POSTs carry the site Origin. */
export function supertestFetcher(app: Express): Fetcher {
  const shape = (res: { status: number; headers: Record<string, unknown>; text?: string }): CrawlResponse => {
    const raw = res.headers['set-cookie'];
    return {
      status: res.status,
      headers: flattenHeaders(res.headers),
      setCookie: Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [],
      body: res.text ?? '',
    };
  };
  return {
    async get(url, cookie) {
      let req = request(app).get(url).redirects(0);
      if (cookie) req = req.set('Cookie', cookie);
      return shape(await req);
    },
    async post(url, cookie) {
      let req = request(app).post(url).redirects(0).type('form');
      if (cookie) req = req.set('Cookie', cookie);
      return shape(await req.send({}));
    },
  };
}

export function isHtml(res: CrawlResponse): boolean {
  return (res.headers['content-type'] ?? '').includes('text/html');
}

/** Query parameters whose value is a site path: candidates for an open redirect. */
export function pathCarryingParams(url: string): string[] {
  const q = url.indexOf('?');
  if (q < 0) return [];
  const params = new URLSearchParams(url.slice(q + 1));
  const out: string[] = [];
  for (const [k, v] of params) if (v.startsWith('/')) out.push(k);
  return out;
}

const OFFSITE_PROBE = '//evil.example/landing';

export async function crawl(opts: CrawlOptions): Promise<CrawlResult> {
  const { persona, fetcher } = opts;
  const findings: Finding[] = [];
  const visited = new Set<string>();
  const getStatus = new Map<string, number>();
  const postStatus = new Map<string, number>();
  const pages: PageVisit[] = [];
  const replayed = new Set<string>();
  const queue: Array<{ url: string; via: string; kind: TargetKind }> =
    opts.seeds.map((url) => ({ url, via: '(seed)', kind: 'seed' as const }));
  const add = (oracle: OracleName, url: string, via: string, problem: string) =>
    findings.push({ persona: persona.name, url, via, oracle, problem });

  // Every request goes through here so a logged operator alert is attributed
  // to the request that produced it.
  const timed = async (
    verb: 'GET' | 'POST', url: string, via: string,
  ): Promise<CrawlResponse> => {
    const before = opts.loggedErrorCount?.() ?? 0;
    const res = verb === 'GET'
      ? await fetcher.get(url, persona.cookie)
      : await fetcher.post(url, persona.cookie);
    const after = opts.loggedErrorCount?.() ?? 0;
    if (after > before) add('logged-error', url, via, `${verb} logged ${after - before} operator-alert error(s)`);
    return res;
  };

  const checkLocation = (res: CrawlResponse, url: string, via: string): string | null => {
    const location = res.headers.location ?? '';
    const offsite = openRedirectFinding(location, opts.selfOrigin, opts.allowedRedirectOrigins ?? []);
    if (offsite) add('open-redirect', url, via, offsite);
    return normalize(location);
  };

  while (queue.length > 0 && visited.size < opts.maxPages) {
    const { url, via, kind } = queue.shift()!;
    if (visited.has(url) || opts.shouldSkip(url)) continue;
    visited.add(url);

    const res = await timed('GET', url, via);
    getStatus.set(url, res.status);
    if (res.status >= 400 && isHtml(res) && opts.errorPageOracles) {
      for (const f of opts.errorPageOracles({ persona, url, via, res })) findings.push(f);
    }

    if (res.status >= 500) {
      add('server-error', url, via, `GET ${res.status}`);
      continue;
    }
    if (res.status === 404 && kind !== 'seed') {
      // A 404 on a seed root is route-shape knowledge (e.g. /history has no
      // index by design); a 404 on a RENDERED target is a broken target.
      add(kind === 'asset' ? 'dead-asset' : 'dead-link', url, via, `rendered ${kind} resolves to 404`);
      continue;
    }
    if (kind !== 'seed' && kind !== 'asset') {
      const refused = shownButRefusedFinding(res.status, res.headers.location, persona, url);
      if (refused) add('shown-but-refused', url, via, refused);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = checkLocation(res, url, via);
      if (loc && !visited.has(loc)) queue.push({ url: loc, via: `${url} (redirect)`, kind: 'redirect' });
    }

    if (opts.replayOpenRedirects) {
      for (const param of pathCarryingParams(url)) {
        const base = url.split('?')[0];
        const key = `${base}?${param}`;
        if (replayed.has(key)) continue;
        replayed.add(key);
        const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
        params.set(param, OFFSITE_PROBE);
        const probeUrl = `${base}?${params.toString()}`;
        const probe = await timed('GET', probeUrl, `${url} (replayed ${param})`);
        if (probe.status >= 500) add('server-error', probeUrl, url, `GET ${probe.status}`);
        else if (probe.status >= 300 && probe.status < 400) checkLocation(probe, probeUrl, url);
      }
    }

    if (res.status !== 200 || !isHtml(res)) continue;

    const visit: PageVisit = { persona, url, via, res };
    pages.push(visit);
    if (opts.pageOracles) {
      for (const f of opts.pageOracles(visit)) findings.push(f);
    }

    const { gets, posts, assets } = extractTargets(res.body, url);
    for (const target of assets) {
      if (!visited.has(target) && !opts.shouldSkip(target)) queue.push({ url: target, via: url, kind: 'asset' });
    }
    for (const target of gets) {
      if (!visited.has(target) && !opts.shouldSkip(target)) queue.push({ url: target, via: url, kind: 'link' });
    }
    for (const target of posts) {
      if (postStatus.has(target) || opts.shouldSkip(target)) continue;
      const postRes = await timed('POST', target, `form on ${url}`);
      postStatus.set(target, postRes.status);
      const formVia = `form on ${url}`;
      if (postRes.status === 404) {
        add('dead-link', target, formVia, 'form action resolves to 404');
      } else if (postRes.status >= 500) {
        add('server-error', target, formVia, `form action POST ${postRes.status}`);
      } else {
        const refused = shownButRefusedFinding(postRes.status, postRes.headers.location, persona, target);
        if (refused) add('shown-but-refused', target, formVia, `form POST: ${refused}`);
        if (postRes.status >= 300 && postRes.status < 400) {
          // A create/action POST that redirects to the resource it produced:
          // follow the Location so a GET page reachable only via this POST is
          // crawled.
          const loc = checkLocation(postRes, target, formVia);
          if (loc && !visited.has(loc)) queue.push({ url: loc, via: `${formVia} (redirect)`, kind: 'form-redirect' });
        }
      }
    }
  }

  // Reaching the page budget means coverage was capped: links beyond it were
  // never probed, so an unfollowed broken link could hide in the tail. Fail
  // loudly and raise the budget rather than let truncation pass silently.
  if (visited.size >= opts.maxPages && opts.reportBudget !== false) {
    add('budget', '(crawl)', '(budget)', `hit maxPages=${opts.maxPages}; coverage truncated, raise the budget`);
  }

  return { findings, visited, getStatus, postStatus, pages };
}

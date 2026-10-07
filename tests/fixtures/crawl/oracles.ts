/**
 * Pure page oracles for the crawls.
 *
 * Each function takes what one response (or a set of responses) looked like and
 * returns the defects it found, as plain strings that say what a visitor would
 * meet. None of them fetches, seeds or reads the database, so each is proven to
 * go red on a planted page and stay green on a clean one in the oracle unit
 * test, independent of any crawl.
 */
import { HtmlValidate } from 'html-validate';

export type OracleName =
  | 'server-error'
  | 'logged-error'
  | 'dead-link'
  | 'dead-asset'
  | 'shown-but-refused'
  | 'open-redirect'
  | 'template-artifact'
  | 'markup'
  | 'title-h1'
  | 'seo'
  | 'privacy'
  | 'unreached-route'
  | 'budget';

export interface Finding {
  persona: string;
  url: string;
  via: string;
  oracle: OracleName;
  problem: string;
}

// ── Shown but refused ────────────────────────────────────────────────────────

export interface RefusalContext {
  authenticated: boolean;
  onboarded: boolean;
}

/**
 * A rendered link or form the same persona is then refused: the page offered
 * an action its own visitor cannot take. A 403 or 401 is refused outright; a
 * signed-in visitor bounced to log in has been told their session does not
 * count; an onboarded member pushed into the registration wizard has been told
 * they are not a member. A registrant still onboarding pushed into the wizard
 * from a target outside it was offered a member action: the page should have
 * shaped them as a signed-out visitor and offered nothing. The wizard moving a
 * registrant along its own steps is the wizard working, not a refusal.
 */
export function shownButRefusedFinding(
  status: number,
  location: string | undefined,
  ctx: RefusalContext,
  target: string,
): string | null {
  if (status === 403 || status === 401) return `answers ${status} to the persona it was shown to`;
  const loc = location ?? '';
  if (ctx.authenticated && (status === 302 || status === 303) && /^\/login(?:[/?#]|$)/.test(loc)) {
    return `signed-in persona redirected to log in (${status} ${loc})`;
  }
  if (status === 303 && loc.includes('/register/wizard')) {
    if (ctx.onboarded) return `onboarded member redirected into the registration wizard (${loc})`;
    if (ctx.authenticated && !/^\/register\/wizard(?:[/?#]|$)/.test(target)) {
      return `registrant still onboarding offered a member action and redirected into the wizard (${loc})`;
    }
  }
  return null;
}

// ── Open redirect ────────────────────────────────────────────────────────────

/** A Location that leaves the site for an origin nobody allowed. */
export function openRedirectFinding(
  location: string,
  selfOrigin: string,
  allowedOrigins: readonly string[],
): string | null {
  if (!location) return null;
  let target: URL;
  try {
    target = new URL(location, selfOrigin);
  } catch {
    return `unparseable Location ${JSON.stringify(location)}`;
  }
  if (target.origin === new URL(selfOrigin).origin) return null;
  if (allowedOrigins.includes(target.origin)) return null;
  return `redirects off-site to ${target.origin}`;
}

// ── Template artifacts ───────────────────────────────────────────────────────

function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

const BAD_VALUE = '(?:undefined|null|NaN|Invalid Date)';
const WHOLE_TEXT_NODE = new RegExp(`>\\s*${BAD_VALUE}\\s*<`);
const URL_ATTR = /\b(?:href|src|action)="([^"]*)"/g;
const BAD_URL_SEGMENT = /(?:^|[/=?&])(?:undefined|null|NaN)(?:$|[/?&#])/;

/**
 * Internal values leaking into the rendered page: template syntax, a stringified
 * object, an unset value printed as a word, or a link built from an empty or
 * unset value (it goes nowhere, or somewhere other than its label says).
 */
export function templateArtifactFindings(html: string): string[] {
  const out: string[] = [];
  // JSON data islands legitimately hold brace runs; scripts and styles hold
  // code, not rendered text.
  const visible = stripScriptsAndStyles(html);
  if (visible.includes('[object Object]')) out.push('rendered [object Object]');
  if (/\{\{|\}\}/.test(visible)) out.push('rendered raw mustache artifact');
  const word = WHOLE_TEXT_NODE.exec(visible);
  if (word) out.push(`rendered an unset value as text: ${word[0].replace(/\s+/g, ' ')}`);
  for (const m of html.matchAll(URL_ATTR)) {
    const value = m[1];
    // The surrounding markup, so a finding names the element that carries it.
    const at = m.index ?? 0;
    const context = html.slice(Math.max(0, at - 60), at + m[0].length + 60).replace(/\s+/g, ' ');
    if (value === '') {
      out.push(`empty URL attribute: ${context}`);
      continue;
    }
    if (!value.startsWith('/') || value.startsWith('//')) continue;
    const path = value.split(/[?#]/)[0];
    if (BAD_URL_SEGMENT.test(value)) out.push(`URL built from an unset value: ${value} in ${context}`);
    else if (path.length > 1 && (path.endsWith('/') || path.includes('//'))) {
      out.push(`URL with an empty path segment: ${value} in ${context}`);
    }
  }
  return out;
}

// ── Markup validity ──────────────────────────────────────────────────────────

/**
 * Defect-only rules: each one is markup a browser or assistive technology
 * mishandles (duplicate ids break label and fragment targets, a form control
 * with no label is unnamed to a screen reader, misnested elements are
 * re-parented by the browser), never a style preference. Heading-level
 * ordering is left out on purpose: skipped levels are a style judgement here.
 */
export const MARKUP_RULES = {
  'no-dup-id': 'error',
  'no-missing-references': 'error',
  'element-permitted-content': 'error',
  'close-order': 'error',
  'no-dup-attr': 'error',
  'input-missing-label': 'error',
  'empty-heading': 'error',
  'empty-title': 'error',
  'text-content': 'error',
  'wcag/h30': 'error',
  'wcag/h37': 'error',
  'unique-landmark': 'error',
} as const;

let validator: HtmlValidate | null = null;

export function markupFindings(html: string): string[] {
  validator ??= new HtmlValidate({ root: true, extends: [], elements: ['html5'], rules: { ...MARKUP_RULES } });
  const report = validator.validateStringSync(html);
  return report.results.flatMap((r) =>
    r.messages.map((m) => `${m.ruleId} (line ${m.line}): ${m.message}`),
  );
}

// ── Title and h1 ─────────────────────────────────────────────────────────────

/**
 * A browser tab, a bookmark and a search result read the title; a screen reader
 * user jumps to the h1 to find the page's subject. A page needs exactly one of
 * each, and the title must say something.
 */
export function titleAndH1Findings(html: string): string[] {
  const out: string[] = [];
  const titles = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
  if (titles.length !== 1) out.push(`expected one <title>, found ${titles.length}`);
  else if (titles[0][1].trim() === '') out.push('empty <title>');
  const h1s = (html.match(/<h1\b/gi) ?? []).length;
  if (h1s !== 1) out.push(`expected one <h1>, found ${h1s}`);
  return out;
}

export function pageTitle(html: string): string | null {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].trim() : null;
}

export function canonicalOf(html: string): string | null {
  const m = /<link\b[^>]*\brel="canonical"[^>]*\bhref="([^"]*)"/i.exec(html);
  return m ? m[1] : null;
}

// ── Search-engine relations ──────────────────────────────────────────────────

export interface SeoInput {
  status: number;
  html: string;
  /** Served to a visitor with no session, so a search engine sees it. */
  publicPage: boolean;
}

/**
 * Every public page tells a search engine where it lives and what it is about;
 * an error page claims no canonical address, or a search engine would index the
 * error under a real page's URL.
 */
export function seoFindings(input: SeoInput): string[] {
  const out: string[] = [];
  const canonical = canonicalOf(input.html);
  if (input.status >= 400) {
    if (canonical !== null) out.push(`error page (${input.status}) carries a canonical link`);
    return out;
  }
  if (input.status === 200 && input.publicPage) {
    if (!canonical) out.push('public page has no canonical link');
    const desc = /<meta\b[^>]*\bname="description"[^>]*\bcontent="([^"]*)"/i.exec(input.html);
    if (!desc || desc[1].trim() === '') out.push('public page has no meta description');
  }
  return out;
}

/** A page served to a signed-in visitor must be kept out of search indexes. */
export function authenticatedNoindexFinding(
  headers: Record<string, string>,
  html: string,
): string | null {
  const header = headers['x-robots-tag'] ?? '';
  if (/\bnoindex\b/i.test(header)) return null;
  if (/<meta\b[^>]*\bname="robots"[^>]*\bcontent="[^"]*\bnoindex\b/i.test(html)) return null;
  return 'authenticated page carries no noindex directive';
}

/** Two distinct pages sharing one title read as duplicates to a search engine. */
export function duplicateTitleFindings(
  pages: ReadonlyArray<{ url: string; canonical: string | null; title: string | null }>,
): Array<{ url: string; problem: string }> {
  const byTitle = new Map<string, Map<string, string>>();
  for (const p of pages) {
    if (!p.title || !p.canonical) continue;
    const canon = byTitle.get(p.title) ?? new Map<string, string>();
    if (!canon.has(p.canonical)) canon.set(p.canonical, p.url);
    byTitle.set(p.title, canon);
  }
  const out: Array<{ url: string; problem: string }> = [];
  for (const [title, canon] of byTitle) {
    if (canon.size < 2) continue;
    const urls = [...canon.values()].sort();
    out.push({ url: urls[0], problem: `title "${title}" shared by ${canon.size} pages: ${urls.join(', ')}` });
  }
  return out;
}

/** Site paths a sitemap lists, relative to the site's own origin. */
export function sitemapPaths(xml: string, selfOrigin: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const u = new URL(m[1].trim(), selfOrigin);
    out.push(u.pathname + u.search);
  }
  return out;
}

/** A sitemap entry must be a live, indexable, non-member page. */
export function sitemapEntryFindings(
  path: string,
  status: number,
  html: string,
  location?: string,
): string[] {
  const out: string[] = [];
  if (path.startsWith('/members/') || path === '/members') out.push('sitemap lists a member page');
  if (status !== 200) out.push(`sitemap entry answers ${status}${location ? ` to ${location}` : ''}`);
  else if (/<meta\b[^>]*\bname="robots"[^>]*\bcontent="[^"]*\bnoindex\b/i.test(html)) {
    out.push('sitemap lists a page marked noindex');
  }
  return out;
}

// ── Privacy canaries ─────────────────────────────────────────────────────────

/**
 * Who is looking, relative to the member whose data is on the page. `pending`
 * is signed in but has not finished onboarding, so is not yet a member.
 */
export type ViewerClass = 'anonymous' | 'pending' | 'member' | 'owner' | 'admin';

export interface Canary {
  /** Which private field this value sits in, for the finding. */
  field: string;
  subjectMemberId: string;
  /** Every spelling the page could render the value in. */
  forms: readonly string[];
  /** The viewers allowed to see it. */
  audience: ReadonlySet<ViewerClass>;
}

export interface Viewer {
  memberId?: string;
  isAdmin?: boolean;
  authenticated: boolean;
  onboarded: boolean;
}

export function viewerClass(viewer: Viewer, subjectMemberId: string): ViewerClass {
  if (!viewer.authenticated) return 'anonymous';
  if (viewer.memberId === subjectMemberId) return 'owner';
  if (viewer.isAdmin) return 'admin';
  return viewer.onboarded ? 'member' : 'pending';
}

/** A seeded private value rendered to a viewer outside its audience. */
export function privacyLeakFindings(html: string, viewer: Viewer, canaries: readonly Canary[]): string[] {
  const out: string[] = [];
  for (const c of canaries) {
    const cls = viewerClass(viewer, c.subjectMemberId);
    if (c.audience.has(cls)) continue;
    const hit = c.forms.find((f) => html.includes(f));
    if (hit) out.push(`${c.field} of ${c.subjectMemberId} shown to ${cls} viewer (${hit})`);
  }
  return out;
}

/** Canaries a page shows, for the positive controls. */
export function canariesShown(html: string, canaries: readonly Canary[]): Canary[] {
  return canaries.filter((c) => c.forms.some((f) => html.includes(f)));
}

// ── Route-to-story ledger ────────────────────────────────────────────────────

export interface LedgerInput {
  /** Every served route key, `METHOD /path`. */
  servedRoutes: readonly string[];
  /** Every story id the story catalogue declares. */
  storyIds: readonly string[];
  /** Route key to the stories it serves, or a reasoned absence of one. */
  routeStories: Readonly<Record<string, { stories: readonly string[] } | { none: string; why: string }>>;
  /** Stories no route cites, each with its status. */
  storiesWithoutRoute: Readonly<Record<string, { status: string; why: string }>>;
}

/**
 * The ledger holds both ways. Every served route names the story it serves (or
 * why it has none) and every ledger route is still served; every cited story
 * exists; every story is either cited by a route or listed with the reason it
 * has none, never both. A route with no story is unintended scope nobody ruled
 * on; a story no route serves and nobody accounted for is a feature that was
 * meant to ship and silently did not.
 */
export function ledgerFindings(input: LedgerInput): string[] {
  const out: string[] = [];
  const served = new Set(input.servedRoutes);
  const stories = new Set(input.storyIds);
  const cited = new Set<string>();
  for (const route of input.servedRoutes) {
    if (!(route in input.routeStories)) out.push(`served route has no ledger entry: ${route}`);
  }
  for (const [route, entry] of Object.entries(input.routeStories)) {
    if (!served.has(route)) out.push(`ledger entry for a route that is not served: ${route}`);
    if ('stories' in entry) {
      if (entry.stories.length === 0) out.push(`ledger entry names no story: ${route}`);
      for (const id of entry.stories) {
        if (!stories.has(id)) out.push(`ledger cites a story that does not exist: ${route} -> ${id}`);
        cited.add(id);
      }
    }
  }
  for (const id of input.storyIds) {
    const listed = id in input.storiesWithoutRoute;
    if (!cited.has(id) && !listed) out.push(`story neither served by a route nor accounted for: ${id}`);
    if (cited.has(id) && listed) out.push(`story is served by a route and also listed as having none: ${id}`);
  }
  for (const id of Object.keys(input.storiesWithoutRoute)) {
    if (!stories.has(id)) out.push(`story listed as having no route does not exist: ${id}`);
  }
  return out;
}

/** Story ids declared by the catalogue's third-level headings. */
export function storyIdsFrom(markdown: string): string[] {
  return [...markdown.matchAll(/^### ([A-Za-z0-9_]+)\s*$/gm)].map((m) => m[1]);
}

// ── Route coverage ───────────────────────────────────────────────────────────

export interface CoverageRoute {
  method: string;
  path: string;
  matches(requestPath: string): boolean;
}

export type ExemptionReason =
  /** Requested by page script or a browser API, never rendered as a link or form. */
  | 'script-requested'
  /** Called by a machine with its own authentication: a signed webhook, an internal hook. */
  | 'machine-caller'
  /** A long-lived event stream the walk cannot read to completion. */
  | 'event-stream'
  /** Ends the crawling session, so following it would end the walk. */
  | 'session-ending'
  /** Reached only through a link mailed to the member, carrying a one-time token. */
  | 'mailed-token'
  /** Probed by its own case in the same suite, because following it mid-walk would disturb the walk. */
  | 'probed-directly'
  /** A permanent redirect kept for old addresses; nothing current links to it by design. */
  | 'compatibility-redirect'
  /** Rendered only on the page a valid submission returns; the empty-body probe stops at validation. */
  | 'valid-submission-only'
  /** A served page no rendered page links to; whether it stays is a scope ruling for the maintainer. */
  | 'unlinked-page'
  /** Behaviour the test harness exists to show, such as a persona whose login is refused. */
  | 'harness-by-design'
  /** A route the crawl fixture seeds no data or state to reach: a coverage gap, named. */
  | 'fixture-gap'
  /** A real defect the crawl found; the exemption names it until it is fixed. */
  | 'known-defect';

export interface RouteExemption {
  method: string;
  path: string;
  reason: ExemptionReason;
  why: string;
}

/**
 * Every served route is reached by the walk or carries a reasoned exemption, and
 * every exemption still names a served, unreached route. A route nobody reached
 * is a page or action no crawl checked; an exemption left behind after its route
 * became reachable, or was removed, hides the next route that takes its name.
 */
export function unreachedRouteFindings(
  routes: readonly CoverageRoute[],
  reached: ReadonlyArray<{ method: string; path: string }>,
  exemptions: readonly RouteExemption[],
): string[] {
  const out: string[] = [];
  const exempt = new Map(exemptions.map((e) => [`${e.method} ${e.path}`, e]));
  const served = new Set(routes.map((r) => `${r.method} ${r.path}`));
  for (const r of routes) {
    const hit = reached.some((x) =>
      (r.method === 'ALL' || x.method === r.method) && r.matches(x.path.split('?')[0]));
    const key = `${r.method} ${r.path}`;
    if (hit && exempt.has(key)) out.push(`stale exemption: ${key} is reached`);
    if (!hit && !exempt.has(key)) out.push(`unreached route: ${key}`);
  }
  for (const key of exempt.keys()) {
    if (!served.has(key)) out.push(`stale exemption: ${key} is not a served route`);
  }
  return out;
}

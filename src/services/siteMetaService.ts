/**
 * SiteMetaService -- crawler and AI-agent discoverability surfaces (read-only).
 *
 * Serves (all public):
 *   - GET /robots.txt: crawl policy. Production allows every user-agent and points
 *     at the sitemap; every non-production environment disallows all crawling so
 *     staging and development never reach a search index.
 *   - GET /sitemap.xml: every public, indexable URL as an absolute <loc> entry.
 *   - GET /llms.txt: a Markdown map of the site for AI agents.
 *
 * Rendering contract:
 *   - build* methods return plain strings; the route sets the content type.
 *   - Sitemap URLs are absolute, built from config.publicBaseUrl, and cover only
 *     public content: static hubs, plus per-row event, club, net-team, freestyle
 *     trick, set-detail, and modifier-detail, rules, IFPA, and named-gallery
 *     pages. Member and
 *     historical-person profiles are excluded: the member listing is a welcome
 *     page rather than a public directory, and member enumeration is a privacy
 *     boundary. Individual media-item pages are excluded too -- high-volume and
 *     reachable from the named-gallery and browse pages already listed. Auth,
 *     admin, internal, webhook, and health routes are never listed.
 *   - robots.txt allows all crawlers (search engines and AI agents alike) in
 *     production. Private content is kept out of search by per-response noindex
 *     headers and per-page noindex meta, never by naming paths here: a Disallow
 *     line is publicly readable and would advertise the very paths it hides.
 */
import { config } from '../config/env';
import { publicEvents, clubs, netTeams, freestyleTricks, media } from '../db/db';
import { freestyleService } from './freestyleService';
import { listGroupedByDiscipline } from '../lib/rulesLoader';
import { getIfpaDocs } from '../lib/ifpaLoader';

// Public hub and static-content pages with no per-row enumeration. Listed in
// reading order; dynamic detail URLs are appended below.
const STATIC_PUBLIC_PATHS = [
  '/',
  '/events',
  '/clubs',
  '/freestyle',
  '/freestyle/tricks',
  '/freestyle/records',
  '/freestyle/leaders',
  '/freestyle/competition',
  '/freestyle/partnerships',
  '/freestyle/history',
  '/freestyle/about',
  '/freestyle/sets',
  '/freestyle/sets/reference',
  '/freestyle/compositional-sets',
  '/freestyle/glossary',
  '/freestyle/operators',
  '/freestyle/notation-article',
  '/freestyle/observational',
  '/freestyle/insights',
  '/freestyle/learn',
  '/freestyle/start',
  '/freestyle/add-analysis',
  '/freestyle/combo-analysis',
  '/freestyle/media',
  '/freestyle/progression/walking-family',
  '/records',
  '/media',
  '/media/browse',
  '/media/member-galleries',
  '/net',
  '/net/events',
  '/net/teams',
  '/sideline',
  '/hof',
  '/bap',
  '/legal',
  '/rules',
  '/ifpa',
];

function baseUrl(): string {
  return config.publicBaseUrl.replace(/\/+$/, '');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// The public event key is the standardized event hashtag without its leading '#'
// (e.g. '#event_2019_worlds' -> 'event_2019_worlds'), matching the
// GET /events/:eventKey route. Club keys follow the same hashtag-minus-'#' rule.
function keyFromTag(tagNormalized: string): string {
  return tagNormalized.replace('#', '');
}

// Every public, indexable path, deduped (a Set preserves first-insertion order,
// so static hubs lead and dynamic detail URLs follow).
function collectPublicPaths(): string[] {
  const paths = new Set<string>(STATIC_PUBLIC_PATHS);

  // Events: upcoming events, plus every completed event grouped by archive year
  // and the per-year archive pages. Together these are the publicly browseable
  // event set.
  const todayIso = new Date().toISOString().slice(0, 10);
  for (const row of publicEvents.listUpcoming.all(todayIso) as Array<{ tag_normalized: string }>) {
    paths.add(`/events/${keyFromTag(row.tag_normalized)}`);
  }
  for (const yr of publicEvents.listArchiveYears.all() as Array<{ archive_year: number }>) {
    paths.add(`/events/year/${yr.archive_year}`);
    for (const row of publicEvents.listCompletedByYear.all(yr.archive_year) as Array<{ tag_normalized: string }>) {
      paths.add(`/events/${keyFromTag(row.tag_normalized)}`);
    }
  }

  // Clubs: every open (active or inactive) club detail page.
  for (const row of clubs.listOpen.all() as Array<{ tag_normalized: string }>) {
    paths.add(`/clubs/${keyFromTag(row.tag_normalized)}`);
  }

  // Net: every team with at least one canonical appearance.
  for (const row of netTeams.listAll.all() as Array<{ team_id: number | string }>) {
    paths.add(`/net/teams/${row.team_id}`);
  }

  // Freestyle: every active trick in the dictionary.
  for (const row of freestyleTricks.listAll.all() as Array<{ slug: string }>) {
    paths.add(`/freestyle/tricks/${row.slug}`);
  }

  // Freestyle: every canonical set-detail page (parallels the trick pages;
  // alias slugs that redirect are excluded by listSitemapSetSlugs).
  for (const slug of freestyleService.listSitemapSetSlugs()) {
    paths.add(`/freestyle/sets/${slug}`);
  }

  // Freestyle: every modifier-detail page (parallels the set pages; set-first
  // slugs that redirect to a set page are excluded by listSitemapModifierSlugs).
  for (const slug of freestyleService.listSitemapModifierSlugs()) {
    paths.add(`/freestyle/modifier/${slug}`);
  }

  // Freestyle: every first-class family-detail page (parallels the set and
  // modifier pages; minor lineages have no page and are excluded). The bare
  // /freestyle/families redirect is intentionally not listed.
  for (const slug of freestyleService.listSitemapFamilySlugs()) {
    paths.add(`/freestyle/families/${slug}`);
  }

  // Media: every named gallery (curator and member). Individual media-item
  // pages are not enumerated: they are high-volume and already reachable from
  // these gallery pages and the /media/browse surfaces listed above.
  for (const row of media.listAllNamedGalleries.all() as Array<{ id: string }>) {
    paths.add(`/media/${row.id}`);
  }

  // Rules: every rule detail page across all disciplines.
  for (const group of listGroupedByDiscipline()) {
    for (const p of group.pages) {
      paths.add(`/rules/${p.discipline}/${p.slug}`);
    }
  }

  // IFPA: every governance document.
  for (const doc of getIfpaDocs()) {
    paths.add(`/ifpa/${doc.slug}`);
  }

  return [...paths];
}

export const siteMetaService = {
  buildRobotsTxt(): string {
    if (config.footbagEnv === 'production') {
      return ['User-agent: *', 'Allow: /', '', `Sitemap: ${baseUrl()}/sitemap.xml`, ''].join('\n');
    }
    // Staging and development: keep the whole environment out of every index.
    return ['User-agent: *', 'Disallow: /', ''].join('\n');
  },

  buildSitemapXml(): string {
    const base = baseUrl();
    const body = collectPublicPaths()
      .map((p) => `  <url>\n    <loc>${escapeXml(base + p)}</loc>\n  </url>`)
      .join('\n');
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      `${body}\n` +
      '</urlset>\n'
    );
  },

  buildLlmsTxt(): string {
    const b = baseUrl();
    return [
      '# Footbag Worldwide',
      '',
      '> The home of the International Footbag Players Association (IFPA), the worldwide governing body for footbag sports (commonly known as hacky sack). The site covers competitive history, tournament results, the freestyle trick dictionary, world records, clubs, and official rules.',
      '',
      '## Browse',
      '',
      `- [Events](${b}/events): footbag tournaments worldwide, with results and yearly archives.`,
      `- [Clubs](${b}/clubs): footbag clubs and communities by country.`,
      `- [Freestyle](${b}/freestyle): the freestyle trick dictionary, families, and notation.`,
      `- [Freestyle records](${b}/freestyle/records): documented consecutive-completion trick records.`,
      `- [Net](${b}/net): footbag net competition, teams, and events.`,
      `- [Rules](${b}/rules): official IFPA rules for each footbag discipline.`,
      `- [Hall of Fame](${b}/hof): inducted members of the footbag Hall of Fame.`,
      `- [Big Add Posse](${b}/bap): the Big Add Posse freestyle honor roll.`,
      '',
      '## About',
      '',
      `- [IFPA governance](${b}/ifpa): IFPA bylaws, articles, and membership structure.`,
      `- [Legal](${b}/legal): privacy, terms of use, copyright, and trademarks.`,
      '',
    ].join('\n');
  },
};

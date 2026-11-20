/**
 * The fixed list of old footbag.org addresses that answer a permanent redirect.
 *
 * Every other address from the old site answers the standard not-found page.
 * A row is here only because an outside page still cites that old address
 * (a Wikipedia article, a governing body, a club site) and a public page of
 * this site carries what the citing page sends its reader for. The list grows
 * only by a deliberate addition that meets both tests, never by pattern: there
 * is no mapping from old ids to new keys, and no address is redirected into
 * the members-only archive, because a reader arriving from an outside page
 * would meet a sign-in wall and a crawler cannot pass it.
 *
 * Each target is a fixed path on this site, never derived from the request,
 * and is never itself a listed source, so every redirect is a single hop.
 * The bare footbag.org host is sent to www at the edge with its path kept, so
 * the application sees each source on one host only.
 *
 * Keys are lowercase without a trailing slash; `legacyRedirectTarget` folds a
 * request path the same way, matching Express's case-insensitive, slash-tolerant
 * route matching.
 */
const LEGACY_REDIRECTS: Readonly<Record<string, string>> = Object.freeze({
  // The freestyle move list, cited for its list of tricks.
  '/movelist': '/freestyle/tricks',
  // The same move list under its older address, cited for its breakdown by ADD.
  '/freestyle/index.html': '/freestyle/tricks?view=add',
  // The IFPA rulebook chapters, one per sport, cited sport by sport.
  '/rules/chapter/200': '/consecutives',
  '/rules/chapter/300': '/rules/net/footbag-net',
  '/rules/chapter/400': '/rules/golf/footbag-golf',
  '/rules/chapter/500': '/rules/freestyle/footbag-freestyle',
  '/reference/-/footbag_net_rules': '/rules/net/footbag-net',
  // The FAQ on where footbag came from: the 1972 origin and the Hacky Sack brand.
  '/faq/show/941272106': '/hof',
  // The FAQ on what freestyle is: routines to music, alone or in pairs.
  '/faq/show/941275559': '/freestyle/about',
  // The FAQ on world records, which are the consecutive-kicks records.
  '/faq/show/941274599': '/consecutives',
  // The short tutorial on reading Jobs notation.
  '/freestyle/5-minute-notation.html': '/freestyle/concepts#jobs-notation',
  // Event pages cited for their results.
  '/events/show/1741024635': '/events/event_2025_worlds_france',
  '/events/show/1226679678': '/events/event_2009_worlds_germany',
  '/events/show/1646387871': '/events/event_2022_worlds_poland',
  '/events/show/1646855336': '/events/event_2022_22nd_annual_ifpa_european_footbag_championships',
  '/events/show/1668541701': '/events/event_2022_xxii_polish_footbag_championships_warsaw',
  '/events/show/1624971880': '/events/event_2021_21st_ifpa_european_footbag_net_championships',
  '/events/show/1600984774': '/events/event_2020_xx_polish_footbag_championships_warsaw',
  '/worlds2003/results.html': '/events/event_2003_worlds_czech_republic',
  '/worlds96/results.html': '/events/event_1996_worlds_canada',
  '/worlds2011': '/events/event_2011_worlds_finland',
  // The Hall of Fame's founding page.
  '/worlds97/hall-of-fame.html': '/hof',
  // A club's listing, linked from the club's own site.
  '/clubs/show/nyfa': '/clubs/club_new_york',
});

/** The old addresses to register, in the case they are listed. */
export const LEGACY_REDIRECT_PATHS: readonly string[] = Object.keys(LEGACY_REDIRECTS);

/**
 * The redirect target for an old address, or undefined when the address is not
 * listed. The query string is not part of `path`, so it never affects the match.
 */
export function legacyRedirectTarget(path: string): string | undefined {
  const key = path.length > 1 ? path.replace(/\/+$/, '').toLowerCase() : path;
  return Object.prototype.hasOwnProperty.call(LEGACY_REDIRECTS, key)
    ? LEGACY_REDIRECTS[key]
    : undefined;
}

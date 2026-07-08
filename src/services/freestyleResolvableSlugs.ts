import { freestyleTricks, freestyleTrickAliases, FreestyleTrickRow, FreestyleTrickAliasRow } from '../db/db';
import { runSqliteRead } from './sqliteRetry';
import { trickNameToSlug } from './freestyleRecordShaping';

/**
 * The slugs a record's trick name can legitimately resolve to: every active
 * trick slug plus the slugified form of every alias. A record whose
 * trickNameToSlug result is absent here has no trick page, so its link is
 * suppressed (see shapeFreestyleRecord's resolvable-set argument).
 *
 * Built fresh per call — never memoized — because integration tests run against
 * per-test databases; a module-level cache would leak one test's dictionary
 * into the next.
 */
export function getResolvableTrickSlugs(): ReadonlySet<string> {
  const slugs = runSqliteRead('freestyleTricks.listAll', () =>
    (freestyleTricks.listAll.all() as FreestyleTrickRow[]).map(r => r.slug),
  );
  const aliasSlugs = runSqliteRead('freestyleTrickAliases.listAll', () =>
    (freestyleTrickAliases.listAll.all() as FreestyleTrickAliasRow[]).map(r => trickNameToSlug(r.alias_text)),
  );
  return new Set<string>([...slugs, ...aliasSlugs]);
}

/**
 * Resolver from a content-authored trick slug to the ACTIVE canonical slug its
 * link should target, or null when the name resolves nowhere active (render as
 * plain text, never a dead link):
 *
 *   - an active canonical slug resolves to itself;
 *   - a retired structural name whose row is inactive (or absent) but whose
 *     name is an alias of an active canonical resolves to that canonical, so
 *     the rendered link goes straight to the live page with no redirect hop
 *     (internal links stay canonical);
 *   - anything else resolves to null.
 *
 * Built fresh per call, like getResolvableTrickSlugs above, so per-test
 * databases never leak into each other through a module-level cache.
 */
export function buildActiveTrickSlugResolver(): (slug: string) => string | null {
  const active = new Set(runSqliteRead('freestyleTricks.listAll', () =>
    (freestyleTricks.listAll.all() as FreestyleTrickRow[]).map(r => r.slug),
  ));
  const aliasTarget = new Map<string, string>();
  const aliasRows = runSqliteRead('freestyleTrickAliases.listAll', () =>
    freestyleTrickAliases.listAll.all() as FreestyleTrickAliasRow[],
  );
  for (const r of aliasRows) {
    if (active.has(r.trick_slug)) aliasTarget.set(trickNameToSlug(r.alias_text), r.trick_slug);
  }
  return (slug: string) => {
    if (active.has(slug)) return slug;
    return aliasTarget.get(slug) ?? null;
  };
}

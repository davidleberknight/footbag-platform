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

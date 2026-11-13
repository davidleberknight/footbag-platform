/**
 * The freestyle sets as the rebuild seeds them. A route test that renders a set
 * page, the Set Encyclopedia, a set-role operator page, a set gallery's
 * cross-link or the sitemap needs the sets in its database, because the sets live
 * in freestyle_sets and not in code. This seeds the staged sets exactly as the
 * rebuild's seeder does, so the fixture database matches what the pipeline builds.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { STAGED_SETS, type StagedSet } from '../../freestyle/inputs/curator_content/freestyleSets';
import { insertFreestyleSet } from './factories';

/** One staged set, as the rebuild seeds it. */
export function stagedSet(slug: string): StagedSet {
  const s = STAGED_SETS.find((x) => x.slug === slug);
  if (!s) throw new Error(`no staged set "${slug}"`);
  return s;
}

/** Inserts every staged set. */
export function seedStagedSets(db: BetterSqlite3.Database): void {
  for (const s of STAGED_SETS) {
    insertFreestyleSet(db, {
      slug:           s.slug,
      display_name:   s.displayName,
      set_group:      s.setGroup,
      sort_order:     s.sortOrder,
      formula:        s.formula,
      explanation:    s.explanation,
      related_sets:   s.relatedSets,
      held_from_list: s.heldFromList ? 1 : 0,
    });
  }
}

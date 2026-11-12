/**
 * The freestyle family roster as the rebuild seeds it. A route test that renders
 * anything grouped by family (a family page, the family view, a trick's family
 * chip or ladder, search, the sitemap, a copy link to a family page) needs the
 * roster in its database, because the roster lives in freestyle_families and not
 * in code. This seeds the staged roster exactly as the rebuild's seeder does, so
 * the fixture database matches what the pipeline builds.
 */
import type BetterSqlite3 from 'better-sqlite3';
import {
  STAGED_FAMILIES,
  STAGED_FAMILY_SUBLABELS,
  type StagedFamily,
} from '../../freestyle/inputs/curator_content/freestyleFamilies';
import { insertFreestyleFamily, insertFreestyleFamilySublabel } from './factories';

/** One staged family, as the rebuild seeds it. */
export function stagedFamily(slug: string): StagedFamily {
  const f = STAGED_FAMILIES.find((s) => s.slug === slug);
  if (!f) throw new Error(`no staged family "${slug}"`);
  return f;
}

/** Inserts the whole staged roster and its folded labels, roots before branches. */
export function seedStagedFamilies(db: BetterSqlite3.Database): void {
  const rootsFirst = [...STAGED_FAMILIES].sort((a, b) =>
    Number(a.parentSlug !== null) - Number(b.parentSlug !== null));
  for (const f of rootsFirst) {
    insertFreestyleFamily(db, {
      slug:                   f.slug,
      display_name:           f.displayName,
      parent_slug:            f.parentSlug,
      tier:                   f.tier,
      sort_order:             f.sortOrder,
      hook:                   f.hook,
      description:            f.description,
      plain_language_reading: f.plainLanguageReading,
      importance:             f.importance,
      how_to_recognize:       f.howToRecognize,
      related_family_slugs:   f.relatedFamilySlugs,
      shared_structure:       f.sharedStructure,
      trick_page_note:        f.trickPageNote,
    });
  }
  for (const [label, family] of STAGED_FAMILY_SUBLABELS) insertFreestyleFamilySublabel(db, label, family);
}

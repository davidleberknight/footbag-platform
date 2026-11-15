/**
 * The A to Z glossary as the rebuild seeds it. A route test that renders
 * /freestyle/glossary, or drives the glossary editor, needs the entries in its
 * database, because they live in freestyle_glossary_terms and not in code. This
 * seeds the staged entries exactly as the rebuild's seeder does, so the fixture
 * database matches what the pipeline builds.
 */
import type BetterSqlite3 from 'better-sqlite3';
import {
  STAGED_GLOSSARY_TERMS,
  type StagedGlossaryTerm,
} from '../../freestyle/inputs/curator_content/freestyleGlossaryTerms';
import { insertFreestyleGlossaryTerm } from './factories';

/** One staged glossary entry, as the rebuild seeds it. */
export function stagedGlossaryTerm(slug: string): StagedGlossaryTerm {
  const t = STAGED_GLOSSARY_TERMS.find((x) => x.slug === slug);
  if (!t) throw new Error(`no staged glossary term "${slug}"`);
  return t;
}

/** Inserts every staged glossary entry. */
export function seedStagedGlossary(db: BetterSqlite3.Database): void {
  for (const t of STAGED_GLOSSARY_TERMS) {
    insertFreestyleGlossaryTerm(db, {
      slug:       t.slug,
      term:       t.term,
      definition: t.definition,
      aliases:    t.aliases ?? [],
      more_href:  t.moreHref ?? null,
      more_label: t.moreLabel ?? null,
    });
  }
}

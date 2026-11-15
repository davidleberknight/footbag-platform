/**
 * The freestyle operators as the rebuild seeds them. A route test that renders the
 * operators page, a modifier page, Freestyle Concepts or a trick page's operator
 * facts needs the operators in its database, because they live in
 * freestyle_operators and not in code. This seeds the staged operators exactly as
 * the rebuild's seeder does, so the fixture database matches what the pipeline
 * builds. A modifier's browse placement needs no seeding here: the modifier factory
 * gives each modifier the placement the pipeline seeds for it.
 */
import type BetterSqlite3 from 'better-sqlite3';
import {
  STAGED_OPERATORS,
  STAGED_MODIFIER_BROWSE,
  type StagedOperator,
} from '../../freestyle/inputs/curator_content/freestyleOperators';
import { insertFreestyleOperator, insertFreestyleTrickModifier } from './factories';

/** One staged operator, as the rebuild seeds it. */
export function stagedOperator(slug: string): StagedOperator {
  const o = STAGED_OPERATORS.find((x) => x.slug === slug);
  if (!o) throw new Error(`no staged operator "${slug}"`);
  return o;
}

/**
 * Inserts every staged operator, and a modifier-registry row for every placed
 * modifier the test has not inserted itself, carrying the placement the pipeline
 * seeds. A page that links a modifier into the browse views reads that row, and
 * the built database holds one for every placed modifier.
 */
export function seedStagedOperatorsAndModifiers(db: BetterSqlite3.Database): void {
  seedStagedOperators(db);
  const exists = db.prepare('SELECT 1 FROM freestyle_trick_modifiers WHERE slug = ?');
  for (const b of STAGED_MODIFIER_BROWSE) {
    if (!exists.get(b.slug)) insertFreestyleTrickModifier(db, { slug: b.slug });
  }
}

/** Inserts every staged operator. */
export function seedStagedOperators(db: BetterSqlite3.Database): void {
  for (const o of STAGED_OPERATORS) {
    insertFreestyleOperator(db, {
      slug:                 o.slug,
      name:                 o.name,
      kind:                 o.kind,
      definition:           o.definition,
      decomposition:        o.decomposition,
      decomposition_note:   o.decompositionNote,
      worked_examples:      o.workedExamples,
      source_note:          o.sourceNote,
      confirmation_pending: o.confirmationPending ? 1 : 0,
      page_group:           o.pageGroup,
      page_order:           o.pageOrder,
    });
  }
}

/**
 * The curator columns a trick row carries after the rebuild seeds it, as
 * insertFreestyleTrick overrides. A route test that renders a trick's Difficulty
 * line, its expanded notation, its fallback modifiers or a foundational move's
 * execution notation seeds the row with these columns, so the fixture row
 * matches what the pipeline builds:
 *
 *   - the staged formula's breakdown, operators and expanded notation, shaped by
 *     the seeder's own breakdown rule;
 *   - a foundational move's execution notation, which the dictionary load
 *     stores and the landing page's core-trick list repeats;
 *   - a formula's execution notation, which the seeder writes only where the
 *     dictionary left the column empty, as it is in a fixture row.
 */
import type BetterSqlite3 from 'better-sqlite3';
import { RESOLVED_ADD_FORMULAS } from '../../freestyle/inputs/curator_content/freestyleResolvedFormulas';
import { derivationBreakdown } from '../../freestyle/loaders/28a_seed_curator_content';
import { CORE_TRICK_SPEC } from '../../src/content/freestyleLandingContent';
import { insertFreestyleTrick, type FreestyleTrickOverrides } from './factories';

export interface StagedFormulaColumns {
  add_derivation:    string;
  formula_operator:  string;
  expanded_notation: string | null;
}

export function stagedFormulaColumns(slug: string): StagedFormulaColumns {
  const formula = RESOLVED_ADD_FORMULAS.find((f) => f.slug === slug);
  if (!formula) throw new Error(`no staged formula for "${slug}"`);
  return {
    add_derivation:    derivationBreakdown(formula.derivation),
    formula_operator:  formula.operator,
    expanded_notation: formula.expandedNotation ?? null,
  };
}

/** Every curator column the rebuild would leave on this trick's row; empty for
 *  a trick it leaves none on. */
export function pipelineColumns(slug: string): {
  add_derivation?: string;
  formula_operator?: string;
  expanded_notation?: string | null;
  operational_notation?: string;
} {
  const formula = RESOLVED_ADD_FORMULAS.find((f) => f.slug === slug);
  const foundation = CORE_TRICK_SPEC.find((s) => s.slug === slug);
  const notation = foundation?.operationalNotation ?? formula?.operationalNotation;
  return {
    ...(formula ? stagedFormulaColumns(slug) : {}),
    ...(notation ? { operational_notation: notation } : {}),
  };
}

/** insertFreestyleTrick with the curator columns the rebuild would add; an
 *  override the test passes still wins. */
export function insertTrickAsRebuilt(
  db: BetterSqlite3.Database,
  o: FreestyleTrickOverrides & { slug: string },
): string {
  return insertFreestyleTrick(db, { ...pipelineColumns(o.slug), ...o });
}

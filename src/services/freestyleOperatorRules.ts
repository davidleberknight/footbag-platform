/**
 * freestyleOperatorRules: the rules every freestyle operator must meet, and the
 * rules for a modifier's place in the browse-by-modifier view, applied by the
 * editors before a save and by the rebuild seeder before it writes. One home, so
 * what the seeder accepts the editors can save unchanged, and the other way round.
 *
 * An operator's slug is lowercase letters, digits and underscores and names one
 * operator only; it may equal a modifier's slug, and then the two describe the
 * same thing. Its name and definition are present, its kind is one of the fixed
 * kinds, and its operators-page group, when it has one, is a group the page
 * defines and comes with a whole-number position. A modifier's browse group, when
 * it has one, is a group the browse view defines, and its position is a whole
 * number. Pure: no database, no I/O.
 */
import { isOperatorIndexAxis } from '../content/freestyleOperatorIndex';
import { isModifierCluster } from '../content/freestyleModifierClusters';

export const OPERATOR_KINDS = [
  'core', 'set', 'body', 'compound-set', 'compound-body', 'historical-nickname', 'quantifier',
] as const;
export type OperatorKind = (typeof OPERATOR_KINDS)[number];

export const OPERATOR_SLUG_PATTERN = /^[a-z0-9_]+$/;

/** The parts of an operator the rules read. */
export interface OperatorRuleInput {
  slug:       string;
  name:       string;
  kind:       string;
  definition: string;
  pageGroup:  string | null;
  pageOrder:  number | null;
}

/** One broken rule, tied to the operator and the field that breaks it. */
export interface OperatorRuleProblem {
  slug:    string;
  field:   'slug' | 'name' | 'kind' | 'definition' | 'pageGroup';
  message: string;
}

/** Whether a kind is one an operator may have. */
export function isOperatorKind(kind: string): boolean {
  return (OPERATOR_KINDS as readonly string[]).includes(kind);
}

/** Every rule the operators break, in input order. Empty when they are sound. */
export function operatorProblems(operators: readonly OperatorRuleInput[]): OperatorRuleProblem[] {
  const problems: OperatorRuleProblem[] = [];
  const seen = new Set<string>();
  for (const o of operators) {
    if (!OPERATOR_SLUG_PATTERN.test(o.slug)) {
      problems.push({ slug: o.slug, field: 'slug', message: 'An operator slug uses only lowercase letters, digits and underscores.' });
    }
    if (seen.has(o.slug)) {
      problems.push({ slug: o.slug, field: 'slug', message: `"${o.slug}" is already an operator.` });
    }
    seen.add(o.slug);
    if (!o.name.trim()) problems.push({ slug: o.slug, field: 'name', message: 'An operator has a name.' });
    if (!o.definition.trim()) problems.push({ slug: o.slug, field: 'definition', message: 'An operator has a definition.' });
    if (!isOperatorKind(o.kind)) problems.push({ slug: o.slug, field: 'kind', message: 'Choose a kind from the list.' });
    if (o.pageGroup === null) {
      if (o.pageOrder !== null) {
        problems.push({ slug: o.slug, field: 'pageGroup', message: 'A position on the operators page needs a group to be in.' });
      }
    } else if (!isOperatorIndexAxis(o.pageGroup)) {
      problems.push({ slug: o.slug, field: 'pageGroup', message: 'Choose an operators-page group from the list.' });
    } else if (o.pageOrder === null || !Number.isInteger(o.pageOrder)) {
      problems.push({ slug: o.slug, field: 'pageGroup', message: 'An operator on the operators page needs a whole-number position.' });
    }
  }
  return problems;
}

/** A modifier's place in the browse-by-modifier view. */
export interface ModifierBrowseInput {
  group: string | null;
  order: number | null;
}

/** Every problem with one modifier's browse placement. Empty when it is sound. */
export function modifierBrowseProblems(b: ModifierBrowseInput): string[] {
  const problems: string[] = [];
  if (b.group !== null && !isModifierCluster(b.group)) problems.push('Choose a browse group from the list.');
  if (b.order !== null && !Number.isInteger(b.order)) problems.push('A browse position is a whole number.');
  return problems;
}

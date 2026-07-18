/**
 * freestyleOperatorIndex.ts
 * =========================
 *
 * Presentation grouping for the /freestyle/operators compact index: which
 * modifiers appear under each movement-system axis, in display order. The page
 * carries only relationship, body, and no-plant modifiers; set primitives (the
 * set systems like pixie, fairy, atomic, barraging) are first-class objects
 * of the Set Encyclopedia and are intentionally excluded here, so the same
 * concept is never presented as both a set and an operator on two surfaces.
 *
 * This is reversible presentation config. It does NOT change the trick-browse
 * axis membership in `freestyleMovementSystems.ts`, the `trick_family` data, or
 * any taxonomy; it only decides the order and grouping of index rows. Per-row
 * data (name, ADD weight, notation, status) is resolved at render time from the
 * `freestyle_trick_modifiers` table, the feel cards, the operator reference, and
 * the canonical-set formulas.
 */

export interface OperatorIndexAxis {
  axisKey:       string;
  axisName:      string;
  /** Short chip shown on each row as the "type": Set / Entry / Body / No-plant. */
  typeLabel:     string;
  modifierSlugs: readonly string[];
  /**
   * True for the provisional / historical group: rows whose definition is
   * unresolved or that have no teaching guide yet. The page renders these in a
   * section visibly separate from the ratified operators, so an unresolved name
   * is never presented as an equivalent of an established operator.
   */
  provisional?:  boolean;
}

// Established operators grouped by their structural role, using the movement
// doctrine (each definition in freestyleOperatorReference.ts), not visual
// convenience. Roles: how the operator relates to the entry and side, whether it
// rotates the body, passes the head or body through, prepares the base with a
// set, or suspends the plant. Tapping prepends a preparatory toe-set dex ahead of
// the base, so it is a set/preparatory operator, not a body-rotation or
// head-passage modifier. Symposium is a no-plant leg discipline. Set primitives
// (pixie, fairy, atomic, barraging and the other set systems) stay first-class
// objects of the Set Encyclopedia and are intentionally excluded here, so the
// same concept is never presented as both a set and an operator on two surfaces.
export const OPERATOR_INDEX_AXES: readonly OperatorIndexAxis[] = [
  {
    axisKey:   'entry-side-relationship',
    axisName:  'Entry and side relationship',
    typeLabel: 'Entry',
    modifierSlugs: ['paradox'],
  },
  {
    axisKey:   'body-rotation',
    axisName:  'Body rotation',
    typeLabel: 'Body',
    modifierSlugs: ['spinning', 'gyro', 'inspinning'],
  },
  {
    axisKey:   'head-body-passage',
    axisName:  'Head and body passage',
    typeLabel: 'Body',
    modifierSlugs: ['ducking', 'diving'],
  },
  {
    axisKey:   'set-preparatory',
    axisName:  'Set and preparatory operators',
    typeLabel: 'Set',
    modifierSlugs: ['tapping'],
  },
  {
    axisKey:   'no-plant-suspension',
    axisName:  'No-plant and suspension',
    typeLabel: 'No-plant',
    modifierSlugs: ['symposium'],
  },
  {
    axisKey:   'provisional-historical',
    axisName:  'Provisional and historical vocabulary',
    typeLabel: 'No-plant',
    provisional: true,
    modifierSlugs: ['symple', 'muted', 'flying'],
  },
];

/** Every modifier slug the operators index covers (the known-modifier gate). */
export const OPERATOR_INDEX_SLUGS: ReadonlySet<string> = new Set(
  OPERATOR_INDEX_AXES.flatMap(axis => axis.modifierSlugs),
);

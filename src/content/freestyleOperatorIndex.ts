/**
 * freestyleOperatorIndex.ts
 * =========================
 *
 * The groups of the /freestyle/operators compact index, in display order: each
 * group's key, heading and the short type chip its rows carry. Page prose, kept in
 * code. Which operators a group lists, and in what order, is each operator's own
 * page group and page order in the freestyle_operators table, set in the operator
 * editor. The page carries only relationship, body and no-plant operators; set
 * primitives (pixie, fairy, atomic and the other set systems) are first-class
 * objects of the Set Encyclopedia, so the same concept is never presented as both
 * a set and an operator on two surfaces.
 */

export interface OperatorIndexAxis {
  axisKey:   string;
  axisName:  string;
  /** Short chip shown on each row as the "type": Set / Entry / Body / No-plant. */
  typeLabel: string;
  /**
   * True for the provisional / historical group: rows whose definition is
   * unresolved or that have no teaching guide yet. The page renders these in a
   * section visibly separate from the ratified operators, so an unresolved name
   * is never presented as an equivalent of an established operator.
   */
  provisional?: boolean;
}

// Groups by structural role: how the operator relates to the entry and side,
// whether it rotates the body, passes the head or body through, prepares the base
// with a set, or suspends the plant.
export const OPERATOR_INDEX_AXES: readonly OperatorIndexAxis[] = [
  { axisKey: 'entry-side-relationship', axisName: 'Entry and side relationship', typeLabel: 'Entry' },
  { axisKey: 'body-rotation',           axisName: 'Body rotation',               typeLabel: 'Body' },
  { axisKey: 'head-body-passage',       axisName: 'Head and body passage',       typeLabel: 'Body' },
  { axisKey: 'set-preparatory',         axisName: 'Set and preparatory operators', typeLabel: 'Set' },
  { axisKey: 'no-plant-suspension',     axisName: 'No-plant and suspension',     typeLabel: 'No-plant' },
  {
    axisKey:     'provisional-historical',
    axisName:    'Provisional and historical vocabulary',
    typeLabel:   'No-plant',
    provisional: true,
  },
];

/** Whether a key names one of the operators page's groups. */
export function isOperatorIndexAxis(key: string): boolean {
  return OPERATOR_INDEX_AXES.some((a) => a.axisKey === key);
}

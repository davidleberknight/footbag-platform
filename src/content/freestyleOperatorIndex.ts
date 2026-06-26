/**
 * freestyleOperatorIndex.ts
 * =========================
 *
 * Presentation grouping for the /freestyle/operators compact index: which
 * modifiers appear under each movement-system axis, in display order. The page
 * carries only relationship, body, and no-plant modifiers; set primitives (the
 * uptime systems like pixie, fairy, atomic, barraging) are first-class objects
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
   * Optional educational sub-groupings within the axis. Each entry labels the
   * run of modifiers starting at `firstSlug` (in modifierSlugs order). Pure
   * presentation grouping; changes no taxonomy.
   */
  subFamilies?:  readonly { label: string; firstSlug: string }[];
}

export const OPERATOR_INDEX_AXES: readonly OperatorIndexAxis[] = [
  {
    axisKey:   'entry-topology',
    axisName:  'Cross-body & Entry Topology',
    typeLabel: 'Entry',
    modifierSlugs: ['paradox'],
  },
  {
    axisKey:   'midtime-body',
    axisName:  'Midtime Body Modifiers',
    typeLabel: 'Body',
    // Tapping is intentionally a body modifier here, not a set. The role
    // registry classifies it as an operator (unlike whirling, which the curator
    // pins to the set role), and it is a productive +1 modifier across many
    // bases. Its only set form is a Holden-only reading with no platform
    // canonical, which lives in the Set Encyclopedia and is referenced there as
    // related, so it does not belong with the uptime set systems.
    modifierSlugs: [
      'spinning', 'gyro', 'inspinning',
      'ducking', 'diving', 'weaving', 'zulu',
      'tapping',
    ],
    subFamilies: [
      { label: 'Spin family',          firstSlug: 'spinning' },
      { label: 'Head-movement family', firstSlug: 'ducking' },
      { label: 'Other',                firstSlug: 'tapping' },
    ],
  },
  {
    axisKey:   'no-plant-suspension',
    axisName:  'No-Plant & Suspension',
    typeLabel: 'No-plant',
    modifierSlugs: ['symposium', 'symple', 'muted', 'flying'],
  },
];

/** Every modifier slug the operators index covers (the known-modifier gate). */
export const OPERATOR_INDEX_SLUGS: ReadonlySet<string> = new Set(
  OPERATOR_INDEX_AXES.flatMap(axis => axis.modifierSlugs),
);

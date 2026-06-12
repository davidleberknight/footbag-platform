/**
 * freestyleOperatorIndex.ts
 * =========================
 *
 * Presentation grouping for the /freestyle/operators compact index: which
 * modifiers appear under each movement-system axis, in display order. This
 * mirrors the four axes the page already teaches and is the curated vocabulary
 * cohort (the broad set-primitive composites in `freestyle_trick_modifiers`
 * that are really Set Encyclopedia sets are intentionally excluded here).
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
}

export const OPERATOR_INDEX_AXES: readonly OperatorIndexAxis[] = [
  {
    axisKey:   'set-uptime',
    axisName:  'Set / Uptime Systems',
    typeLabel: 'Set',
    modifierSlugs: [
      'pixie', 'fairy', 'atomic', 'quantum', 'nuclear',
      'barraging', 'furious', 'blurry', 'stepping', 'whirling',
    ],
  },
  {
    axisKey:   'entry-topology',
    axisName:  'Entry Topologies',
    typeLabel: 'Entry',
    modifierSlugs: ['paradox'],
  },
  {
    axisKey:   'midtime-body',
    axisName:  'Midtime Body Modifiers',
    typeLabel: 'Body',
    modifierSlugs: [
      'spinning', 'gyro', 'ducking', 'diving', 'weaving',
      'inspinning', 'tapping', 'zulu',
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

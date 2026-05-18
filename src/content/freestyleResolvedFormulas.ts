/**
 * freestyleResolvedFormulas.ts
 * =============================
 *
 * Curator-published compact formulas for the mechanically-derivable
 * compound tricks where the structural reading is the canonical
 * Red-settled +1 stack pattern (operator(+1) + base(N) = (N+1) ADD).
 *
 * Sprint 1 of the Canonical Formula Resolution sequence. These are
 * the 15 rows from formula_gap_classification.csv that satisfy ALL
 * of:
 *
 *   - Operator is in the settled +1 inventory (paradox, spinning,
 *     ducking, symposium, stepping, atomic, whirling)
 *   - Base is a Red-settled core atom or settled compound (mirage 2,
 *     whirl 3, butterfly 3, osis 3, swirl 3, torque 4, blender 4)
 *   - DB ADD value matches the arithmetic (N+1)
 *   - Zero Wave 2 dependency (no barraging, no blurry transitivity,
 *     no fairy weight, no atomic-family X-dex scope, no compression
 *     intent, no hidden-vs-flat preservation)
 *
 * Per V1 §1 (symbolic representation) + V1 §5 (honest incompleteness)
 * + V1 §6 (no fabricated structure): every row here is a curator-
 * verifiable mechanical composition. Nothing inferred; nothing
 * doctrinal-edge.
 *
 * Surfaces as a compact reference table on /freestyle/add-analysis
 * between §2 (worked examples) and §3 (discrepancy cases). Not a
 * worked-example expansion — the table is reference-density.
 *
 * Reversibility: TypeScript content module per
 * [[feedback_reversible_content_governance]]. To extend in Sprint 2:
 * add more rows; to reclassify a row out (e.g., if a Wave 2 ruling
 * later complicates it): remove the row.
 *
 * After this sprint lands, formula_gap_classification.csv reclassifies
 * these 15 rows from `curator_pending` → `resolved`.
 */

export interface ResolvedFormula {
  /** IFPA canonical slug. Links to /freestyle/tricks/{slug}. */
  slug:        string;
  /** Display name (canonical). */
  name:        string;
  /** Operator token (paradox / spinning / etc.). */
  operator:    string;
  /** Base trick name (mirage / whirl / torque / etc.). */
  base:        string;
  /** Base ADD (numeric). */
  baseAdd:     number;
  /** Total ADD (operator +1 contribution + base). */
  totalAdd:    number;
  /** Curator-published derivation string. */
  derivation:  string;
  /** Settlement provenance (pt-ruling / Red-date / canonical-inventory). */
  provenance:  string;
}

export const RESOLVED_FORMULAS_FRAMING_PROSE =
  "Mechanically-derivable compound formulas where the operator and " +
  "base are both Red-settled. Each row shows the operator's +1 " +
  "contribution stacked on the base's canonical ADD. No Wave 2 " +
  "dependencies; no curator-judgment cases. Sprint 1 of the " +
  "Canonical Formula Resolution sequence — see " +
  "formula_review_queue.md for the broader curator-pending list.";

// Sprint 1 batch (15 rows). All from formula_gap_classification.csv
// where the row was classified `curator_pending` and the +1 stack
// composition is mechanical.
export const RESOLVED_FORMULAS_SPRINT_1: readonly ResolvedFormula[] = [
  {
    slug:        'paradox-mirage',
    name:        'paradox mirage',
    operator:    'paradox',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'paradox(+1) + mirage(2) = 3 ADD',
    provenance:  'paradox = +1 body modifier (canonical inventory); mirage = 2 ADD core atom',
  },
  {
    slug:        'symposium-mirage',
    name:        'symposium mirage',
    operator:    'symposium',
    base:        'mirage',
    baseAdd:     2,
    totalAdd:    3,
    derivation:  'symposium(+1) + mirage(2) = 3 ADD',
    provenance:  'symposium = +1 no-plant body modifier; mirage = 2 ADD core atom',
  },
  {
    slug:        'atomic-butterfly',
    name:        'atomic butterfly',
    operator:    'atomic',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'atomic(+1) + butterfly(3) = 4 ADD',
    provenance:  'atomic = +1 on non-rotational bases; butterfly = 3 ADD core atom',
  },
  {
    slug:        'ducking-butterfly',
    name:        'ducking butterfly',
    operator:    'ducking',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'ducking(+1) + butterfly(3) = 4 ADD',
    provenance:  'ducking = +1 midtime body modifier; butterfly = 3 ADD core atom',
  },
  {
    slug:        'ducking-osis',
    name:        'ducking osis',
    operator:    'ducking',
    base:        'osis',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'ducking(+1) + osis(3) = 4 ADD',
    provenance:  'ducking = +1 midtime body modifier; osis = 3 ADD core atom',
  },
  {
    slug:        'ducking-whirl',
    name:        'ducking whirl',
    operator:    'ducking',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'ducking(+1) + whirl(3) = 4 ADD',
    provenance:  'ducking = +1 midtime body modifier; whirl = 3 ADD core atom',
  },
  {
    slug:        'spinning-butterfly',
    name:        'spinning butterfly',
    operator:    'spinning',
    base:        'butterfly',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'spinning(+1) + butterfly(3) = 4 ADD',
    provenance:  'spinning = +1 midtime body modifier; butterfly = 3 ADD core atom',
  },
  {
    slug:        'spinning-osis',
    name:        'spinning osis',
    operator:    'spinning',
    base:        'osis',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'spinning(+1) + osis(3) = 4 ADD',
    provenance:  'spinning = +1 midtime body modifier; osis = 3 ADD core atom',
  },
  {
    slug:        'stepping-osis',
    name:        'stepping osis',
    operator:    'stepping',
    base:        'osis',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + osis(3) = 4 ADD',
    provenance:  'stepping = +1 set modifier (foot relocation); osis = 3 ADD core atom',
  },
  {
    slug:        'stepping-whirl',
    name:        'stepping whirl',
    operator:    'stepping',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'stepping(+1) + whirl(3) = 4 ADD',
    provenance:  'stepping = +1 set modifier; whirl = 3 ADD core atom',
  },
  {
    slug:        'symposium-whirl',
    name:        'symposium whirl',
    operator:    'symposium',
    base:        'whirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'symposium(+1) + whirl(3) = 4 ADD',
    provenance:  'symposium = +1 no-plant body modifier; whirl = 3 ADD core atom',
  },
  {
    slug:        'whirling-swirl',
    name:        'whirling swirl',
    operator:    'whirling',
    base:        'swirl',
    baseAdd:     3,
    totalAdd:    4,
    derivation:  'whirling(+1) + swirl(3) = 4 ADD',
    provenance:  'whirling = +1 midtime body modifier (post-2026-05-18 Movement System inheritance); swirl = 3 ADD core atom',
  },
  {
    slug:        'paradox-blender',
    name:        'paradox blender',
    operator:    'paradox',
    base:        'blender',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'paradox(+1) + blender(4) = 5 ADD',
    provenance:  'paradox = +1 body modifier; blender = 4 ADD compound (whirling osis)',
  },
  {
    slug:        'paradox-torque',
    name:        'paradox torque',
    operator:    'paradox',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'paradox(+1) + torque(4) = 5 ADD',
    provenance:  'paradox = +1 body modifier; torque = 4 ADD compound (miraging osis, pt11)',
  },
  {
    slug:        'spinning-torque',
    name:        'spinning torque',
    operator:    'spinning',
    base:        'torque',
    baseAdd:     4,
    totalAdd:    5,
    derivation:  'spinning(+1) + torque(4) = 5 ADD',
    provenance:  'spinning = +1 midtime body modifier; torque = 4 ADD compound (miraging osis, pt11)',
  },
];

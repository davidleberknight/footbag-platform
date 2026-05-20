/**
 * freestyleGlossaryAddExamples.ts
 * ================================
 *
 * Curator-authored ADD-accounting worked examples for /freestyle/glossary
 * §8. Five compact educational cards illustrate how ADD math composes
 * for compound tricks, including composite-modifier decomposition,
 * doctrine-pending cases, and atom-level breakdowns.
 *
 * Layer contract:
 *   - Canonical decomposition fields are visible by default.
 *   - Provenance / curator-internal language never renders publicly
 *     (per [[feedback_public_facing_prose]]); pt## / Red / Wave-N
 *     references stay in the .reason field only when surfaced as
 *     short observational notes.
 *   - Status enum encodes resolution state:
 *       'canonical'         — three-way ADD convergence; doctrine settled
 *       'pending-doctrine'  — Red ruling or curator decision still open
 *       'doctrine-locked'   — disagreement exists but is curator-locked
 *
 * Reversibility: TypeScript content module. Five worked examples; the
 * exhaustive coverage lives at /freestyle/add-analysis (Resolved
 * Formulas) and in the workbook governance gate (legacy_data/reports/).
 */

export type GlossaryAddExampleStatus =
  | 'canonical'
  | 'pending-doctrine'
  | 'doctrine-locked';

export interface GlossaryAddExample {
  /** Stable slug; canonical name in the trick dictionary. */
  slug:              string;
  /** Display name (capitalized). */
  displayName:       string;
  /** Compact / chain reading form. */
  compactNotation:   string;
  /** Official ADD value from the dictionary (the curator-locked total). */
  officialAdd:       number;
  /** Human-readable ADD derivation. */
  derivation:        string;
  /** Resolution state. */
  status:            GlossaryAddExampleStatus;
  /** Optional one-line observational note (educational; no provenance). */
  observationalNote: string | null;
}

export const ADD_WORKED_EXAMPLES: readonly GlossaryAddExample[] = [
  {
    slug:              'blur',
    displayName:       'Blur',
    compactNotation:   'stepping paradox mirage',
    officialAdd:       4,
    derivation:        'stepping(+1) + paradox(+1) + mirage(2) = 4 ADD',
    status:            'canonical',
    observationalNote: 'The blurry modifier label is folk shorthand for the stepping+paradox stack. Workbook decomposes composite labels via the MODIFIER_COMPOSITIONS registry to surface the underlying additive structure.',
  },
  {
    slug:              'mobius',
    displayName:       'Mobius',
    compactNotation:   'gyro torque',
    officialAdd:       5,
    derivation:        'gyro(+2 rotational) + torque(4) = 6 ADD [naïve computed]',
    status:            'pending-doctrine',
    observationalNote: 'Computed total exceeds official by 1 — the gyro-on-rotational doctrine has an open question. Mobius is equivalent to spinning ss torque ≡ spinning ss miraging osis (three chain readings; all surface as alt-names on the trick page).',
  },
  {
    slug:              'nuclear',
    displayName:       'Nuclear (modifier)',
    compactNotation:   'paradox + atomic',
    officialAdd:       0,
    derivation:        'curator-pending — nuclear modifier composition awaiting Red ruling',
    status:            'pending-doctrine',
    observationalNote: 'Nuclear shows up as an effective +2 modifier on multiple compounds (sumo, witchdoctor). The exact paradox+atomic decomposition is curator-pending and tracked in the Wave 3 supplement queue.',
  },
  {
    slug:              'quantum',
    displayName:       'Quantum',
    compactNotation:   'toe blur',
    officialAdd:       3,
    derivation:        'quantum atom = TOE > OP IN [DEX] > OP TOE [DEL] = [DEX] + [DEL] + body topology = 3 ADD',
    status:            'canonical',
    observationalNote: 'Quantum is the 4-primitive direction-quadrant matrix counterpart of pixie / fairy / atomic — same compositional weight, different dex direction + leg. The full matrix is documented in §6 Modifiers.',
  },
  {
    slug:              'baroque',
    displayName:       'Baroque',
    compactNotation:   'barraging osis',
    officialAdd:       5,
    derivation:        'barraging(+2) + osis(3) = 5 ADD [composite-modifier pending]',
    status:            'pending-doctrine',
    observationalNote: 'Barraging plays the same composite-modifier role as blurry in the Blur compound. The decomposition into atom-level operators (stepping + ducking? or stepping + paradox?) is awaiting Red review and tracked in the Wave 3 packet.',
  },
];

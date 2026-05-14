/**
 * freestyleSymbolicEquivalences.ts
 *
 * Curator-authored symbolic-equivalence chains for compound freestyle tricks.
 * Each entry expresses pedagogically valuable equivalent readings of a single
 * compound trick. Curator-edited; not generated.
 *
 * Layer-2 source for the trick-page semantic-notation ladder:
 *   Layer 1 — curator notation (parser-tokenized; existing)
 *   Layer 2 — THIS FILE — curated equivalence chain (this file)
 *   Layer 3 — base-lineage phrase (generated from row.base_trick)
 *   Layer 4 — core atom silence
 *   Layer 5b — non-core curation-gap cue
 *
 * Forever-rules:
 *   - Each reading is a flat curator-authored string. No recursive expansion
 *     at render time.
 *   - Order matters: index 0 is the primary/compact reading; later entries
 *     are progressively expanded readings useful for pedagogy. Max 3 readings
 *     per chain (beyond is a glossary worked-example).
 *   - Stopping rules (chain authors observe):
 *       * Stop at any token in CORE_TRICKS.
 *       * Stop at any intermediate operator (atomic / blurry / quantum /
 *         nuclear / barraging / furious / double / whirling / high). Those
 *         operators decompose, but the decomposition lives in the glossary.
 *       * Deeper depth only when curator-authored.
 *   - sourceLabel rendering is 'editorial' const literal; never claims parser
 *     provenance.
 *   - curatorConfirmPending=true entries ship with the rendered pending flag
 *     until Red adjudication locks them.
 *   - Fury is deliberately omitted: pt1 (barraging paradox mirage) vs pt6
 *     (furious paradox mirage) conflict is unresolved. Add after Red rules.
 *   - Royale is lineage-only (no chain authored yet); Layer 3 ("Built on
 *     illusion") will render today from its row.base_trick=illusion.
 *
 * Slug verification: every slug below was verified against the dictionary
 * inputs and Red corrections before locking (2026-05-13). `orbit` is a folk
 * name; its dictionary slug is `reverse-around-the-world`. The seed below
 * uses dictionary-canonical slugs only.
 */

export interface SymbolicEquivalenceChain {
  readonly slug:                  string;
  readonly readings:              readonly string[];
  readonly curatorConfirmPending: boolean;
}

export const SYMBOLIC_EQUIVALENCE_CHAINS: readonly SymbolicEquivalenceChain[] = [
  {
    slug:     'mobius',
    readings: ['gyro torque', 'spinning ss torque', 'spinning ss miraging op osis'],
    curatorConfirmPending: false,   // curator-authored verbatim
  },
  {
    slug:     'toe-blur',
    readings: ['quantum mirage'],
    curatorConfirmPending: false,   // locked by Red pt2: "Toe Blur (3 ADD) = Quantum Mirage"
  },
  {
    slug:     'ripwalk',
    readings: ['stepping butterfly'],
    curatorConfirmPending: true,
  },
  {
    slug:     'dimwalk',
    readings: ['pixie butterfly'],
    curatorConfirmPending: true,
  },
  {
    slug:     'phoenix',
    readings: ['pixie ducking butterfly'],
    curatorConfirmPending: true,
  },
  {
    slug:     'atom-smasher',
    readings: ['atomic mirage'],
    curatorConfirmPending: true,
  },
  {
    slug:     'matador',
    readings: ['nuclear butterfly', 'paradox atomic butterfly'],
    curatorConfirmPending: true,    // Red pt10 locks the deeper reading; pending wider review
  },
  {
    slug:     'paradox-symposium-whirl',
    readings: ['ps whirl'],
    curatorConfirmPending: true,
  },
  {
    slug:     'montage',
    readings: ['spinning ducking paradox symposium whirl'],
    curatorConfirmPending: true,
  },
  {
    slug:     'double-fairy',
    readings: ['double illusion'],
    curatorConfirmPending: true,    // Red pt3 (pending status in red_corrections_consolidated.csv)
  },
  {
    slug:     'double-blender',
    readings: ['whirling blender'],
    curatorConfirmPending: true,    // Red pt3 (pending)
  },
  {
    slug:     'double-spinning-osis',
    readings: ['two spins to osis'],
    curatorConfirmPending: true,    // Red pt3 (pending)
  },
  {
    slug:     'spyro-gyro',
    readings: ['gyro butterfly swirl'],
    curatorConfirmPending: true,    // Red pt2 (pending; treated as flat compositional reading per curator direction)
  },
  // ── Canon-locked compound chains (CANONICAL-SURFACE-REALIGNMENT-1 S2) ──
  // All pt11 / pt1+pt2 / pt2+followup-2026-04 / pt4 locked readings; each
  // entry is one canon-uncontested compositional decomposition. Fury is
  // intentionally absent — its non-rotational reading is Wave-1 Q1c pending.
  {
    slug:     'torque',
    readings: ['miraging osis'],
    curatorConfirmPending: false,   // pt11-locked
  },
  {
    slug:     'blender',
    readings: ['whirling osis'],
    curatorConfirmPending: false,   // pt11-locked
  },
  {
    slug:     'drifter',
    readings: ['miraging clipper'],
    curatorConfirmPending: false,   // pt11-locked
  },
  {
    slug:     'vortex',
    readings: ['gyro drifter'],
    curatorConfirmPending: false,   // pt1+pt2-locked
  },
  {
    slug:     'eggbeater',
    readings: ['atomic legover'],
    curatorConfirmPending: false,   // pt4-locked
  },
  {
    slug:     'omelette',
    readings: ['atomic illusion'],
    curatorConfirmPending: false,   // pt2 + followup-2026-04 locked
  },
];

/**
 * Look up a chain by canonical slug. O(n) is fine at this corpus size.
 * Returns null when no chain is authored for the slug.
 */
export function getSymbolicEquivalenceChain(slug: string): SymbolicEquivalenceChain | null {
  const normalized = slug.trim().toLowerCase();
  return SYMBOLIC_EQUIVALENCE_CHAINS.find(c => c.slug === normalized) ?? null;
}

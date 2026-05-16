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
 * inputs and Red corrections before locking (2026-05-13). Per
 * CORE-ATOM-CANONICAL-RECONCILE-1 (2026-05-15), `orbit` is now a canonical
 * dictionary slug; `reverse-around-the-world` and `reverse-atw` are aliases
 * pointing at it. The seed below uses dictionary-canonical slugs only.
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
  // ── Canon-locked compound chains (CANONICAL-SURFACE-REALIGNMENT-2 NR-1) ──
  // 17 maintainer-approved (2026-05-14) canon-locked readings appended.
  // Each entry's Red source cited; all set curatorConfirmPending=false per
  // maintainer direction. ADD-arithmetic discrepancies (e.g., venom, nemesis
  // surfacing furious-rotational behavior pending Wave-1 Q1c) are tracked
  // separately in the ADD conflict audit; the registry flag is for
  // reader-uncertainty about the reading itself, not for math uncertainty.
  {
    slug:     'flail',
    readings: ['symposium illusion'],
    curatorConfirmPending: false,   // pt6 + followup-2026-04 locked
  },
  {
    slug:     'smudge',
    readings: ['pixie illusion'],
    curatorConfirmPending: false,   // pt7-locked
  },
  {
    slug:     'smoke',
    readings: ['pixie drifter'],
    curatorConfirmPending: false,   // pt8-locked
  },
  {
    slug:     'smog',
    readings: ['pixie double legover'],
    curatorConfirmPending: false,   // pt7-locked
  },
  {
    slug:     'royale',
    readings: ['paradox reverse drifter'],
    curatorConfirmPending: false,   // pt5-locked (= paradox grifter)
  },
  {
    slug:     'flurry',
    readings: ['barraging legover'],
    curatorConfirmPending: false,   // pt4-locked
  },
  {
    slug:     'double-leg-over',
    readings: ['miraging legover'],
    curatorConfirmPending: false,   // pt4-locked (DLO = Miraging Legover)
  },
  {
    slug:     'surge',
    readings: ['surging paradox mirage'],
    curatorConfirmPending: false,   // pt2-locked
  },
  {
    slug:     'surreal',
    readings: ['surging paradox whirl'],
    curatorConfirmPending: false,   // pt2-locked
  },
  {
    slug:     'surgery',
    readings: ['surging symposium reverse whirl'],
    curatorConfirmPending: false,   // pt2-locked
  },
  {
    slug:     'venom',
    readings: ['surging barfly'],
    curatorConfirmPending: false,   // pt2-locked
  },
  {
    slug:     'bigwalk',
    readings: ['surging butterfly'],
    curatorConfirmPending: false,   // pt2-locked
  },
  {
    slug:     'plasma',
    readings: ['quantum double over down'],
    curatorConfirmPending: false,   // pt8-locked
  },
  {
    slug:     'fusion',
    readings: ['atomic double over down'],
    curatorConfirmPending: false,   // pt2-locked
  },
  {
    slug:     'grave-digger',
    readings: ['stepping ss torque'],
    curatorConfirmPending: false,   // pt8-locked (canonical "stepping same-side torque"; ss abbreviation matches registry convention)
  },
  {
    slug:     'nemesis',
    readings: ['furious barfly'],
    curatorConfirmPending: false,   // pt6 + pt8-locked
  },
  {
    slug:     'atomic-torque',
    readings: ['atomic torque'],
    curatorConfirmPending: false,   // pt4-locked (folk-name: silo)
  },
  // ── Whirl-family trivially-named compounds (Slice A2 of 2026-05) ──────
  // These compounds are named by their compositional structure: the name
  // IS the formula. Authoring single-reading chains here gives Family
  // View the same formula visibility ADD View provides — closing the
  // "Notation pending" placeholder gap on cards whose structure is
  // already self-evident from the canonical name. curatorConfirmPending
  // is false because each reading is an identity transformation of the
  // canonical name (no decomposition claim beyond what the name asserts).
  // blurry-whirl carries a second pt11-locked reading (Blurry = Stepping
  // Paradox) for pedagogical compression.
  {
    slug:     'paradox-whirl',
    readings: ['paradox whirl'],
    curatorConfirmPending: false,
  },
  {
    slug:     'spinning-whirl',
    readings: ['spinning whirl'],
    curatorConfirmPending: false,
  },
  {
    slug:     'ducking-whirl',
    readings: ['ducking whirl'],
    curatorConfirmPending: false,
  },
  {
    slug:     'symposium-whirl',
    readings: ['symposium whirl'],
    curatorConfirmPending: false,
  },
  {
    slug:     'stepping-whirl',
    readings: ['stepping whirl'],
    curatorConfirmPending: false,
  },
  {
    slug:     'tapping-whirl',
    readings: ['tapping whirl'],
    curatorConfirmPending: false,
  },
  {
    slug:     'blurry-whirl',
    readings: ['blurry whirl', 'stepping paradox whirl'],
    curatorConfirmPending: false,   // pt11-locked: Blurry = Stepping Paradox
  },
  {
    slug:     'spinning-symposium-whirl',
    readings: ['spinning symposium whirl'],
    curatorConfirmPending: false,
  },
  // ── High-ADD flagship chain (CANONICAL-SURFACE-REALIGNMENT-2 NR-1C) ──
  // Gauntlet is the dictionary's flagship 7-ADD compound. Surfacing two
  // stopping depths on its compact-symbolic-object card demonstrates
  // Blurry-compression pedagogically: the shorter reading
  // ("blurry ducking torque") and the unfolded reading
  // ("stepping ducking paradox torque") are equivalent per pt11's
  // Blurry = Stepping Paradox definition. Same trick, two readings.
  // Sourced from FBORG-AUDIT-1 cross-source agreement (FBORG, FM sample,
  // and DB notation column).
  {
    slug:     'gauntlet',
    readings: ['blurry ducking torque', 'stepping ducking paradox torque'],
    curatorConfirmPending: false,   // pt11-locked via Blurry-compression
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

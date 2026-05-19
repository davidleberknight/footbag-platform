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
  // ── Butterfly-family trivially-named compounds (Slice A3 of 2026-05) ──
  // Curator-authored chains for butterfly-family pilots whose canonical
  // name carries the compositional structure. tripwalk's reading is
  // sourced from the modifier-feel-cards content (quantum entry:
  // "Tripwalk = Stepping Quantum Butterfly"); sidewalk's "near" qualifier
  // is curator doctrine surfaced via the user-spec example list. All
  // tokens are registered in semanticNotationRendering.ts (paradox /
  // ducking / spinning as MODIFIERS; near as SIDE_POSITIONAL; butterfly
  // as BASE_ANCHOR). parkwalk deferred — folk-name compound whose
  // structural decomposition is not yet curator-locked.
  {
    slug:     'atomic-butterfly',
    readings: ['atomic butterfly'],
    curatorConfirmPending: false,
  },
  {
    slug:     'ducking-butterfly',
    readings: ['ducking butterfly'],
    curatorConfirmPending: false,
  },
  {
    slug:     'spinning-butterfly',
    readings: ['spinning butterfly'],
    curatorConfirmPending: false,
  },
  {
    slug:     'tripwalk',
    readings: ['stepping quantum butterfly'],
    curatorConfirmPending: false,   // modifier-feel-cards (quantum) doctrine
  },
  {
    slug:     'sidewalk',
    readings: ['stepping near butterfly'],
    curatorConfirmPending: false,   // user-spec example; 'near' in SIDE_POSITIONAL
  },

  // ── Mirage-family trivially-named compounds (Slice A3 of 2026-05) ─────
  // Curator-authored chains. smear / tap / sumo from user-spec example
  // list (each cites already-established compositional readings; "near"
  // is a registered SIDE_POSITIONAL token). blur / witchdoctor / fury
  // deliberately deferred — blur and witchdoctor are folk-name compounds
  // whose decomposition is not curator-locked; fury was deliberately
  // omitted earlier (pt1 vs pt6 conflict unresolved).
  {
    slug:     'paradox-mirage',
    readings: ['paradox mirage'],
    curatorConfirmPending: false,
  },
  {
    slug:     'symposium-mirage',
    readings: ['symposium mirage'],
    curatorConfirmPending: false,
  },
  {
    slug:     'smear',
    readings: ['pixie mirage'],
    curatorConfirmPending: false,   // user-spec example
  },
  {
    slug:     'tap',
    readings: ['atomic near mirage'],
    curatorConfirmPending: false,   // user-spec example
  },
  {
    slug:     'sumo',
    readings: ['nuclear mirage'],
    curatorConfirmPending: false,   // user-spec example
  },

  // ── Osis-family trivially-named compounds (Slice A3 of 2026-05) ───────
  // Single-modifier-stacked-on-osis decompositions. All tokens already
  // in MODIFIERS + BASE_ANCHORS registries. barraging-osis already
  // pending Red Wave-2 (operator class question); deferred.
  {
    slug:     'ducking-osis',
    readings: ['ducking osis'],
    curatorConfirmPending: false,
  },
  {
    slug:     'spinning-osis',
    readings: ['spinning osis'],
    curatorConfirmPending: false,
  },
  {
    slug:     'stepping-osis',
    readings: ['stepping osis'],
    curatorConfirmPending: false,
  },

  // ── Torque-family trivially-named compounds (Slice A3 of 2026-05) ─────
  // Torque is itself the named compound for miraging osis (existing
  // chain); these stack one modifier onto torque. blurry-torque carries
  // a second pt11-locked reading (Blurry = Stepping Paradox). spinal-tap
  // deferred — folk-name compound whose structural decomposition is not
  // yet curator-locked.
  {
    slug:     'paradox-torque',
    readings: ['paradox torque'],
    curatorConfirmPending: false,
  },
  {
    slug:     'spinning-torque',
    readings: ['spinning torque'],
    curatorConfirmPending: false,   // canonical-name decomposition; mobius is the folk-name (existing chain)
  },
  {
    slug:     'blurry-torque',
    readings: ['blurry torque', 'stepping paradox torque'],
    curatorConfirmPending: false,   // pt11-locked: Blurry = Stepping Paradox
  },

  // ── Dada-curve (Slice A3 of 2026-05) ──────────────────────────────────
  // Per user-spec doctrine: "dada-curve = miraging far symposium butterfly".
  // dada-curve has its own singleton trick_family bucket; the chain
  // surfaces on the trick's individual detail page + ADD view. All
  // tokens registered (miraging in MODIFIERS, far in SIDE_POSITIONAL,
  // symposium in MODIFIERS, butterfly in BASE_ANCHORS).
  {
    slug:     'dada-curve',
    readings: ['miraging far symposium butterfly'],
    curatorConfirmPending: false,   // user-spec doctrine
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
  // ── Slice N (2026-05-16) — branch-family chain coverage ────────────────
  // Closes high-confidence chain gaps in the blender + drifter branch
  // families. Each entry's reading is grounded in a Red ruling or
  // curator-prose statement that predates Slice N. Borderline/uncertain
  // rows (mind-bender, spinal-tap, tombstone, etc.) explicitly held back
  // for follow-up curator authoring. Folk-derived rows (tomahawk,
  // witchdoctor, fury) carry the Slice M unresolved-pill instead.
  {
    slug:     'paradox-blender',
    readings: ['paradox blender', 'paradox whirling op osis'],
    curatorConfirmPending: false,   // tokenizes the canonical name; deeper reading extends blender's pt11-locked 'whirling osis'
  },
  {
    slug:     'food-processor',
    readings: ['blurry blender', 'stepping paradox blender'],
    curatorConfirmPending: false,   // Red-locked: Food Processor = Stepping Paradox Blender (memory: project_freestyle_state RED rulings 2026-05-15)
  },
  {
    slug:     'spender',
    readings: ['spinning paradox blender'],
    curatorConfirmPending: false,   // curator-prose-confirmed in FAMILY_TEXTS['blender']: "spender (Spinning Paradox Blender, 6 ADD)"
  },
  {
    slug:     'paradox-drifter',
    readings: ['paradox drifter', 'paradox miraging clipper'],
    curatorConfirmPending: false,   // tokenizes the canonical name; deeper reading extends drifter's pt11-locked 'miraging clipper'
  },
  // ── Pre-Red Completion Sweep (2026-05-16) — externally-supported chains ──
  // 7 chains grounded by Slice P cross-source audit: each entry has FM+PB
  // agreement (or FM-only with curator-confirm-pending). All readings are
  // structurally clean — they decompose through curator-known operators
  // onto a canonical base trick. No Wave 2 dependencies; no Red-blocked
  // doctrine. Per Slice P findings + RECONCILIATION_AUDIT_PLAN §6.
  //
  // Discipline: each entry is a known-external reading that does not
  // contest any IFPA decomposition. Adding here does NOT promote external
  // vocabulary; it expresses the chain reading IFPA already implies
  // structurally and which FM+PB also encode.
  {
    slug:     'merkon',
    readings: ['spinning legover'],
    curatorConfirmPending: false,   // FM 'Spinning Legover' + PB 'Spinning Legover' agree (Slice P identical)
  },
  {
    slug:     'magellan',
    readings: ['pixie legover'],
    curatorConfirmPending: false,   // FM 'Pixie Legover (same side)' + PB 'Pixie near Legover' agree on pixie+legover; near/same-side = +0 per Red 2026-05-15
  },
  {
    slug:     'parkwalk',
    readings: ['pixie butterfly'],
    curatorConfirmPending: true,   // FM 'Pixie Butterfly (same side)' + PB 'Pixie near Butterfly' agree; parkwalk reads identically to dimwalk — curator verifies whether they are distinct rows or name variants
  },
  {
    slug:     'pigbeater',
    readings: ['pixie eggbeater'],
    curatorConfirmPending: false,   // FM 'Pixie Eggbeater' + PB 'Pixie far Eggbeater' agree (far = +0 per Red 2026-05-15)
  },
  {
    slug:     'mind-bender',
    readings: ['ducking paradox blender'],
    curatorConfirmPending: false,   // FM 'Ducking Paradox Blender' + PB 'Clipper Ducking far Blender' agree on ducking+paradox+blender (Clipper prefix = set-initiator; far = paradox per Red 2026-05-15)
  },
  {
    slug:     'tomahawk',
    readings: ['ducking paradox whirl'],
    curatorConfirmPending: false,   // FM 'Ducking Paradox Whirl' + PB 'Clipper Ducking far Whirl' agree; row removed from UNRESOLVED_COMPOUNDS in this sweep
  },
  {
    slug:     'witchdoctor',
    readings: ['atomic symposium mirage'],
    curatorConfirmPending: true,   // FM 'Atomic Symposium Mirage' only (PB silent); structurally clean but single-source — pill remains in UNRESOLVED_COMPOUNDS pending PB corroboration or Red ruling
  },
  // ── Path A — Slice X follow-on (2026-05-17) ────────────────────────────
  // 5 additional chain entries for existing IFPA rows lacking chains. All
  // structurally clean (operators in IFPA registry; bases in IFPA core
  // ontology; math verified). Multi-source cases use curatorConfirmPending=
  // false; FM-only cases use curatorConfirmPending=true per the witchdoctor
  // precedent.
  {
    slug:     'tombstone',
    readings: ['stepping drifter'],
    curatorConfirmPending: false,   // FM 'Stepping Drifter (same side)' + PB 'Stepping near Drifter' agree; math stepping(+1)+drifter(3)=4 matches DB asserted_adds
  },
  {
    slug:     'paste',
    readings: ['pixie pickup'],
    curatorConfirmPending: false,   // FM 'Pixie Pickup' + PB 'Pixie far Pickup' agree; math pixie(+1)+pickup(2)=3 matches DB asserted_adds
  },
  {
    slug:     'haze',
    readings: ['stepping double-leg-over'],
    curatorConfirmPending: true,   // FM 'Stepping Double Legover' only (PB silent); structurally clean; math stepping(+1)+DLO(3)=4 matches DB asserted_adds
  },
  {
    slug:     'scrambled-eggbeater',
    readings: ['atomic pickup'],
    curatorConfirmPending: true,   // FM 'Atomic Pickup' only (PB silent); math atomic(+1 non-rotational)+pickup(2)=3 matches DB asserted_adds
  },
  {
    slug:     'spinal-tap',
    readings: ['tapping torque'],
    curatorConfirmPending: true,   // FM 'Tapping Torque' only (PB silent); math tapping(+1)+torque(4)=5 matches DB asserted_adds
  },
  // ── Path B — Slice X pilot canonical promotions (2026-05-17) ─────────────
  // 5 new canonical trick rows promoted via red_additions_2026_04_20.csv on
  // the same day. Each entry pairs with the loader-19 insertion; chain
  // readings authored alongside the row so the trick lands publishable
  // (CTPC Principle 1: symbolic representation present from day one).
  {
    slug:     'assassin',
    readings: ['pixie ducking mirage'],
    curatorConfirmPending: false,   // FM 'Pixie Ducking Mirage' + PB 'Pixie Ducking far Mirage' agree (far=+0 positional); math pixie(+1)+ducking(+1)+mirage(2)=4
  },
  {
    slug:     'mantis',
    readings: ['gyro eggbeater'],
    curatorConfirmPending: false,   // FM 'Gyro Eggbeater' + PB 'Spinning near Eggbeater' agree (near=+0 positional); math gyro(+1)+eggbeater(3)=4; Red 2026-05-15 ratified 'gyro' as legit operator
  },
  {
    slug:     'nova',
    readings: ['symposium double-leg-over'],
    curatorConfirmPending: false,   // FM 'Symposium Double Legover' + PB 'Symp. DLO' agree; math symposium(+1)+DLO(3)=4
  },
  {
    slug:     'tapdown',
    readings: ['tapping butterfly'],
    curatorConfirmPending: true,   // FM 'Tapping Butterfly' only (PB silent); math tapping(+1)+butterfly(3)=4; Red 2026-05-15 pt3 tapping=+1
  },
  {
    slug:     'big-apple',
    readings: ['gyro symposium torque'],
    curatorConfirmPending: false,   // FM 'Gyro Symposium Torque' + PB 'Symp. Mobius' agree (mobius unfolds to gyro torque); math gyro(+1)+symposium(+1)+torque(4)=6
  },
  {
    slug:     'rev-whirl',
    readings: ['reverse whirl'],
    curatorConfirmPending: false,   // Sprint 3 resolved: reverse(+0) + whirl(3) = 3 ADD. Curator 2026-05-19: 'reverse whirl == whip'; whip alias preserved on DB row
  },
  {
    slug:     'rev-up',
    readings: ['reverse whirl'],
    curatorConfirmPending: false,   // Sprint 3 resolved: reverse(+0) + whirl(3) = 3 ADD. rev-up shares the structural reading with rev-whirl; folk-name distinction preserved at canonical row level
  },
  {
    slug:     'fury',
    readings: ['furious paradox mirage'],
    curatorConfirmPending: false,   // Red pt6 2026-05-04: Fury = Furious Paradox Mirage (replaces pt4 paradox+barraging+mirage). Math: furious(+2 rot)+paradox(+1)+mirage(2)=5
  },
  {
    slug:     'fog',
    readings: ['stepping paradox double leg over', 'blurry dlo'],
    curatorConfirmPending: false,   // Red pt6 2026-05-04: Fog = Stepping Paradox Double Legover. Math: stepping(+1)+paradox(+1)+dlo(3)=5. Folk alias 'blurry dlo' preserved
  },
  {
    slug:     'pendulum',
    readings: ['toe swing'],
    curatorConfirmPending: false,   // Sprint 5 resolved: toe(1) + swing(1) = 2 ADD. Direction-variant pair with rake (rake reverses element order to swing > toe). Swing-element doctrine curator-locked 2026-05-19
  },
  {
    slug:     'rake',
    readings: ['swing toe'],
    curatorConfirmPending: false,   // Sprint 6 resolved: swing(1) + toe(1) = 2 ADD. Direction-variant pair with pendulum (pendulum is toe > swing). FootbagMoves lists rake at 3 ADD; IFPA curator-locked at 2 per swing-element doctrine — Red review pending
  },
  {
    slug:     'flying-clipper',
    readings: ['flying clipper'],
    curatorConfirmPending: false,   // Sprint 5 resolved: flying(+1) + clipper(1 body kick) = 2 ADD. Folk alias 'jester' preserved on DB row. flying is body-modifier +1; clipper here is the 1-ADD body kick, not clipper-stall surface
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

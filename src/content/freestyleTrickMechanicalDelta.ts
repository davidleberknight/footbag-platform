/**
 * freestyleTrickMechanicalDelta.ts
 * =================================
 *
 * L2,
 * the "mechanical delta" layer. Per the doctrine, L2 is the deepest
 * ontology-work locus: where paradox / x-dex / nuclear / blurry /
 * furious / rotational escalation / hidden topology changes become
 * understandable.
 *
 * Curator-authored prose. One entry per Tier A slug. Atoms (no parent
 * to differ from) carry the "defining mechanical pattern" reading
 * instead.
 *
 * Interpretive traditions:
 *
 * When a topology distinction is read differently by competing
 * shorthand traditions (the classic paradox-mirage case), the
 * `interpretiveTraditions` array carries BOTH readings honestly.
 * Neither is promoted to canonical doctrine. The L2 prose names the
 * tradition without naming individuals (per the public-page
 * depersonalization rule).
 */

export type TopologyKind =
  | 'atom'              // L2 describes the defining pattern (no parent delta)
  | 'paradox'           // paradox topology layer added
  | 'x-dex'             // x-dex escalation
  | 'rotational'        // rotational-with-spin topology
  | 'no-plant'          // suspension / antisymposium topology
  | 'cross-body'        // cross-body terminal / xbody-anchored
  | 'compound'          // compound-of-canonicals
  | 'hidden-topology';  // canonical formula carries the marker without name doing so

export interface TrickInterpretiveTradition {
  reading: string;
  citation: string;
}

export interface TrickMechanicalDelta {
  slug: string;
  /** Slugs of the parent trick(s) this is a mechanical delta from. Empty for atoms. */
  parentSlugs: readonly string[];
  /** 1-3 short paragraphs explaining the mechanical delta or defining pattern. */
  prose: string;
  topologyKind: TopologyKind;
  /**
   * When multiple shorthand traditions describe the topology
   * differently, BOTH readings render here. Never promote either to
   * canonical doctrine.
   */
  interpretiveTraditions?: readonly TrickInterpretiveTradition[];
}

export const TRICK_MECHANICAL_DELTA_ENTRIES: readonly TrickMechanicalDelta[] = [

  // ── Editorial exemplar #1: mirage ───────────────────────────────────
  {
    slug:        'mirage',
    parentSlugs: [],
    prose:
      "Mirage is the atom: there is no parent trick to differ from. Its defining mechanical pattern is the in-to-out dex: the supporting leg swings from inside the bag to outside during a single dex step, with the bag held by the setting toe before and after. The directional flow at the dex moment is in → out, and the leg crossing is under-and-over rather than over-and-under. Nearly every named compound in the modern dictionary transforms this in-to-out pattern rather than building independently.",
    topologyKind: 'atom',
  },

  // ── Editorial exemplar #2: paradox-mirage ───────────────────────────
  {
    slug:        'paradox_mirage',
    parentSlugs: ['mirage'],
    prose:
      "Relative to ordinary mirage, paradox-mirage carries an additional directional transition during the dex cycle. The structural difference is not merely a different starting surface or reversed dex direction: the hip and torso pivot cross-body mid-dex, producing a topology change rather than a directional inversion.\n\n" +
      "Two interpretive traditions describe what is actually happening. The older shorthand reads paradox as an op-side dex from a clipper entry, a simpler reading that captures the surface notation. A newer pedagogical reading frames paradox as a hip-pivot cross-body transition added during the dex cycle, distinguishing it more sharply from \"starting-side variation.\"\n\n" +
      "Both readings produce the same ADD accounting (paradox +1 layered on mirage's 2 ADD = 3 ADD) and the same canonical notation. They differ on what the movement-language is actually tracking: a starting-side label, or a topology event.",
    topologyKind: 'paradox',
    interpretiveTraditions: [
      { reading: "Op-side dex from a clipper entry: paradox as starting-side variation.", citation: "Older shorthand tradition" },
      { reading: "Additional cross-body hip-pivot transition during the dex cycle: paradox as a topology change distinct from starting-side variation.", citation: "Newer pedagogical reading" },
    ],
  },

  // ── Editorial exemplar #3: whirl ────────────────────────────────────
  {
    slug:        'whirl',
    parentSlugs: [],
    prose:
      "Whirl's defining mechanical pattern is a cross-body rotational dex: the support leg circles the bag from the front, up and over, while the original setting leg hops off and the catching foot arrives on a clipper delay. The rotational character (the leg circles rather than swings) distinguishes whirl from non-rotational cross-body moves like butterfly. The terminal is always a clipper stall; the entry can be either clipper or toe. The directional flow at the dex moment is up-and-over rather than under-or-around.",
    topologyKind: 'rotational',
  },

  // ── C1 mirage-descendant batch ─────────────────

  {
    slug:        'blur',
    parentSlugs: ['paradox_mirage'],
    prose:
      "Relative to paradox-mirage, blur extends the dex pattern into a stepping multi-dex sequence. Where paradox-mirage carries a single dex cycle with the paradox hip-pivot threaded through, blur splits the pattern into two dex moments: a first stepping dex displacing the bag laterally, then a second dex with the paradox hip-pivot completing the catch.\n\n" +
      "The stepping operator adds +1 ADD on top of paradox-mirage's 3-ADD chassis, yielding 4 ADD: stepping(+1) + paradox(+1) + mirage(2). The paradox topology persists across both dex moments; the descendants extending this multi-dex axis (fury, blurriest-class compounds) inherit the same threaded hip-pivot signature.\n\n" +
      "Blur is also the cultural-canonical folk name for the stepping-paradox-mirage compound: the operator-board notation often reads as \"blur\" rather than the longer structural decomposition.",
    topologyKind: 'paradox',
  },

  {
    slug:        'fury',
    parentSlugs: ['paradox_mirage'],
    prose:
      "Relative to paradox-mirage, fury adds the furious two-dex set: two same-direction dex steps on the set, with the paradox hip-pivot threaded through the catch end. Where blur adds a single stepping dex onto the paradox-mirage chassis, fury adds the two-dex furious set instead.\n\n" +
      "The furious set carries +2, yielding 5 ADD: furious(+2) + paradox(+1) + mirage(2). Furious is a two-dex uptime set (+2); barraging is a legacy name pattern for this same Furious set, not a separate timing-defined operator.",
    topologyKind: 'paradox',
  },

  {
    slug:        'sumo',
    parentSlugs: ['mirage'],
    prose:
      "Relative to mirage, sumo carries a nuclear modifier and an X-Dex transition. The dex direction shifts to outside-then-inside (the same pattern atom-smasher uses) and the body posture widens into a nuclear stance through the dex cycle.\n\n" +
      "The 5-ADD count exceeds what the standard +2 nuclear rule would produce (nuclear(+2) + mirage(2) = 4 ADD). Sumo's operational notation carries [XDEX] on the far mirage dex, which scores a separate +1; the folk name 'sumo' compresses this detail. Its structural reading is settled at 5 ADD because the notation carries that [XDEX]; the score follows the notation, not the operator-board base math.",
    topologyKind: 'x-dex',
  },

  {
    slug:        'drifter',
    parentSlugs: ['mirage', 'clipper_stall'],
    prose:
      "Drifter combines mirage's in-to-out dex pattern with a clipper-stall terminal. Where mirage returns to a toe delay (same-surface termination), drifter shifts the terminal to a cross-body clipper: the support leg swings under-and-over inside-then-outside, but the catch arrives on the inside surface of the opposite foot rather than the toes.\n\n" +
      "The 3-ADD count reads as either mirage(2) + cross-body-terminal-shift(+1) or clipper-stall(2) + mirage-operator(+1); both decompositions arrive at the same total. The structural signature (mirage's directional dex paired with a clipper-anchored cross-body terminal) anchors the shred lineage of compounds that build on the drifter chassis.",
    topologyKind: 'cross-body',
  },

  {
    slug:        'atom_smasher',
    parentSlugs: ['mirage'],
    prose:
      "Relative to mirage, atom-smasher reverses and stretches the dex direction into an outside-then-inside sequence, the dex its notation marks [XDEX]. Where mirage swings the support leg under-and-over inside-then-outside, atom-smasher swings it in the opposite direction, producing a wider cross-body arc during the dex and recatching on the opposite toe.\n\n" +
      "The atomic operator adds +1, and atom-smasher carries an X-Dex(+1) on the following dex, yielding 4 ADD on the mirage chassis: atomic(+1) + X-Dex(+1) + mirage(2). X-Dex is scored from the [XDEX] flag in the operational notation. Atom Smasher's notation carries it; Sumo's notation also carries [XDEX] on the mirage dex, though the folk name 'sumo' does not surface it.",
    topologyKind: 'x-dex',
  },

  {
    slug:        'barrage',
    parentSlugs: [],
    prose:
      "Barrage is its own mechanical-family anchor. Its defining pattern is two same-side inside dexes performed in sequence: both dexes share direction and surface, distinguishing barrage from compounds that alternate or invert the dex pattern. The 3-ADD count reflects the doubled-dex anchor reading rather than a modifier-on-base compound: barrage stands as a structural primitive in its own right.\n\n" +
      "A naming-disambiguation point matters here: the \"barraging\" modifier (responsible for fury via barraging-paradox-mirage in earlier doctrine, and flurry via barraging-leg-over) is a separate entity from this standalone barrage trick. The shared root reflects compositional-vs-modifier semantics: the same conceptual movement appears as both an atom-class anchor (barrage) and as an operator (barraging) layered on other chassis.",
    topologyKind: 'atom',
  },

  {
    slug:        'blurriest',
    parentSlugs: ['barfly'],
    prose:
      "Relative to barfly (a 4-ADD double-infinity compound), blurriest layers a blurry modifier that adds one more dex moment onto the chassis. The structural signature is a triple-dex sequence (inside-then-outside-then-outside) with a clipper terminal closing the pattern. Where barfly's doubled-infinity character carries two dex cycles, blurriest stacks a third via the blurry operator.\n\n" +
      "The 5-ADD count comes from blurry(+1) + barfly(4). Blurriest is the deepest blurry-class compound in the dictionary: the superlative form of the blurry-naming family, distinct from blur (which sits on the mirage chassis) but kin in naming tradition.",
    topologyKind: 'compound',
  },

  // ── C2 whirl-descendant batch ──────────────────

  {
    slug:        'blender',
    parentSlugs: ['whirl', 'osis'],
    prose:
      "Blender combines two canonical tricks into a single compound. The whirl provides the opening cross-body rotational dex; the osis provides the closing spin-into-clipper terminal. Where each parent is itself a 3-ADD canonical, blender threads them together into a 4-ADD compound: the whirl operator adds the rotational dex onto osis's spin-terminal pattern.\n\n" +
      "Blender is the doctrine's canonical exemplar for compound-of-canonicals topology: two named tricks combine into a recognized third. The compound name (blender) carries its own identity rather than reading as a parameterized whirl or osis: it has been culturally promoted to anchor status. This pattern recurs across the dictionary (torque = quantum-osis; mobius = gyro-torque; spender = compound on blender) and blender is the cleanest demonstration of how two canonicals become a named third.",
    topologyKind: 'compound',
  },

  {
    slug:        'surreal',
    parentSlugs: ['paradox_whirl', 'whirl'],
    prose:
      "Relative to paradox-whirl, surreal layers a surging rotational system that adds a back-spin entry and an additional dex moment onto the chassis. Where paradox-whirl carries a single dex with paradox hip-pivot threaded through, surreal stacks a back-spin body modifier before the dex sequence and continues into a paradox-whirl-style dex to close.\n\n" +
      "The 6-ADD count comes from surging(+2) + paradox(+1) + whirl(3). Surging decomposes to spinning + stepping, a flat +2 on any base. Surreal sits at the top of the rotational-topology ladder: the deepest commonly-named compound on the whirl chassis with multiple modifier layers stacked. The structural signature combines rotational character at three points: whirl's rotational dex, paradox's cross-body hip-pivot, and surging's back-spin entry.",
    topologyKind: 'rotational',
  },

  {
    slug:        'phoenix',
    parentSlugs: ['butterfly'],
    prose:
      "Relative to butterfly (a 3-ADD leg-over to a clipper terminal), phoenix layers two distinct modifiers: a pixie set treatment compressing the opening, and a ducking body modifier folding through the back end. Where butterfly carries a single leg-over dex with clipper terminal, phoenix opens with a pixie-set tightened dex, then folds the body into a duck before the closing outward dex.\n\n" +
      "The 5-ADD count comes from pixie(+1) + ducking(+1) + butterfly(3). Phoenix is one of the cleaner multi-modifier butterfly compounds: the structural signature is two modifiers stacked on a non-trivial chassis, with the modifiers operating on different axes (set treatment + body posture) rather than competing for the same structural slot.",
    topologyKind: 'compound',
  },

  // ── C3 independent-anchor batch ────────────────

  {
    slug:        'osis',
    parentSlugs: [],
    prose:
      "Osis is a core movement atom: there is no parent trick to differ from. Its defining mechanical pattern is a spin-into-clipper-stall: the body spins (front or back) through a body-modifier moment, and the catch arrives on a cross-body clipper. The spin is the structural signature; the cross-body clipper terminal distinguishes osis from same-side spin-terminating compounds.\n\n" +
      "Osis sits alongside mirage and whirl as one of the three foundational dex anchors in the dictionary: mirage is the in-to-out toe-terminating canonical, whirl is the rotational dex with clipper-terminal canonical, and osis is the spin-into-clipper canonical. The three together provide the structural primitives that most compound vocabulary builds on.",
    topologyKind: 'atom',
  },

  {
    slug:        'butterfly',
    parentSlugs: [],
    prose:
      "Butterfly is a core movement atom: there is no parent trick to differ from. Its defining mechanical pattern is a leg-over with cross-body clipper terminal: the support leg passes over the bag (the leg-over signature), and the catch arrives on the inside surface of the opposite foot in a clipper position. The leg-over distinguishes butterfly from rotational-dex compounds (whirl, osis) and from in-to-out dex compounds (mirage).\n\n" +
      "Butterfly sits as the leg-over canonical with a cross-body terminal: where legover (also an atom) terminates on a same-side surface, butterfly terminates on a cross-body clipper. The 3-ADD decomposition reads as a single dex (leg-over) plus a stall (clipper terminal), placing butterfly in the same ADD bucket as whirl and osis.",
    topologyKind: 'atom',
  },

  {
    slug:        'torque',
    parentSlugs: ['osis', 'mirage'],
    prose:
      "Torque combines two canonical tricks into a single compound. The mirage provides the opening inside-then-outside dex; the osis provides the closing spin-into-clipper terminal. Where each parent is itself a canonical (mirage 2 ADD, osis 3 ADD), torque threads them together into a 4-ADD compound: the mirage operator (+1 on the osis chassis) adds the directional dex onto osis's spin-terminal pattern.\n\n" +
      "Torque is a sibling-of-blender in the compound-of-canonicals topology: where blender combines whirl + osis, torque combines mirage + osis. Both demonstrate the same structural pattern (two canonicals → recognized third) but with different parent canonicals on the dex side. Torque anchors a sub-family that blender does not (mobius, paradox-torque, atomic-torque, gauntlet): the compound earned anchor status and became further productive.",
    topologyKind: 'compound',
  },

  {
    slug:        'mobius',
    parentSlugs: ['torque'],
    prose:
      "Relative to torque, mobius layers a gyro modifier that adds a back-spin body-modifier moment to the compound. Where torque combines a mirage-like inward dex with an osis spin-terminal, mobius opens with a gyro back-spin before the dex, threading rotational character through what would otherwise read as a torque-class compound.\n\n" +
      "The structural reading is 'gyro torque': the gyro operator (+1 on rotational character) layered onto torque's 4-ADD chassis, yielding 5 ADD. Mobius sits at the top of the gyro-on-compound-of-canonicals branch, demonstrating that body-modifier layering on an already-compound chassis produces named third-anchor status. The compound name (mobius) carries its own identity rather than reading as 'gyro torque' in the canonical grammar.",
    topologyKind: 'rotational',
  },

  {
    slug:        'ripwalk',
    parentSlugs: ['butterfly'],
    prose:
      "Relative to butterfly, ripwalk extends the leg-over pattern into a stepping multi-dex sequence. Where butterfly carries a single leg-over dex with cross-body clipper terminal, ripwalk splits the pattern into two dex moments: a first stepping dex displacing the bag laterally, then a leg-over closing the compound.\n\n" +
      "The 4-ADD count comes from stepping(+1) + butterfly(3). The DB description encodes the operator as the folk name 'blurry butterfly', reflecting the shred-vocabulary tradition. Ripwalk is the shred-vocabulary root on the butterfly chassis: the leg-over-paired-with-stepping signature anchors a 'walk'-suffixed naming family that extends across the broader shred-class compounds (parkwalk, dimwalk, sidewalk, tapdown, bigwalk, darkwalk).",
    topologyKind: 'paradox',
  },

  {
    slug:        'food_processor',
    parentSlugs: ['blender'],
    prose:
      "Relative to blender (a 4-ADD whirl-osis compound), food-processor layers a blurry-stepping operator that adds a multi-dex extension onto the chassis. Where blender threads a single rotational dex into an osis spin-terminal, food-processor opens with a stepping dex before the rotational moment, then closes through the osis spin-terminal.\n\n" +
      "The 6-ADD count comes from blurry-class operators layered on blender(4). Food-processor demonstrates the blurry-naming tradition reaching into compound-of-canonicals territory: where blur sits on the mirage chassis and blurriest on the barfly chassis, food-processor extends the same naming family onto a compound-of-canonicals chassis. The compound name (food-processor) is among the more visually distinctive folk names in the dictionary: culturally promoted to anchor status without resembling either parent canonical (whirl or osis) or the chassis name (blender).",
    topologyKind: 'compound',
  },

  // ── C4 folk-name rescue exemplar ───────────────

  {
    slug:        'ripstein',
    parentSlugs: [],
    prose:
      "Ripstein's DB row sits as a standalone anchor (no base_trick assigned); structurally, the operational notation reveals a doubled same-side back-swirl reading: CLIP >> SAME BACK SWIRL [DEX] >> SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]. Two reverse-rotational dex moments in sequence, with a cross-body clipper terminal closing the compound.\n\n" +
      "The 4-ADD count is consistent with both readings: as an atom-class anchor (doubled-back-swirl carrying its own family status, parallel to barrage's standalone reading at 3 ADD) and as a derived reading from swirl(3) + doubled-dex(+1). The doctrine accepts the standalone reading per the DB while surfacing the structural-grammar decomposition for compositional understanding.\n\n" +
      "Ripstein is the doctrine's canonical folk-name rescue case. Its DB description, \"Popular freestyle trick.\", was the worst-offending placeholder pattern in the dictionary. The L1-L6 layers recover a meaningful structural reading from the operational notation alone, demonstrating how the trick-detail ontology pipeline salvages culturally-canonical names whose DB rows carry no structural content beyond a folk-name label.",
    topologyKind: 'atom',
  },

] as const;

const ENTRIES_BY_SLUG: ReadonlyMap<string, TrickMechanicalDelta> = new Map(
  TRICK_MECHANICAL_DELTA_ENTRIES.map(e => [e.slug, e]),
);

export function getTrickMechanicalDelta(slug: string): TrickMechanicalDelta | null {
  return ENTRIES_BY_SLUG.get(slug) ?? null;
}

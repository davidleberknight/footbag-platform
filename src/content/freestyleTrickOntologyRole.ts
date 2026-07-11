/**
 * freestyleTrickOntologyRole.ts
 * ==============================
 *
 * L3,
 * "ontology role" layer. Names what broader ontology concept this trick
 * exemplifies.
 *
 * Per §2.4 of the doctrine: L3 and L4 may naturally overlap. When the
 * overlap is genuine on a slug, the curator picks the better-fitting
 * slot and lets the other stay null (sections suppress when empty).
 *
 * Public-prose depersonalization holds: roles name traditions / readings
 * / ideas; individuals only in the glossary acknowledgements paragraph.
 */

export interface TrickOntologyRole {
  slug: string;
  /** Short role descriptor (e.g. "Paradox topology root"). Used as a section eyebrow. */
  role: string;
  /** 1-2 short paragraphs explaining why this trick exemplifies that ontology concept. */
  prose: string;
}

export const TRICK_ONTOLOGY_ROLE_ENTRIES: readonly TrickOntologyRole[] = [

  // ── Editorial exemplar #1: mirage ───────────────────────────────────
  {
    slug: 'mirage',
    role: 'Movement-language entry point',
    prose:
      "Mirage is the foundational in-to-out dex template. The 2-ADD canonical decomposition (one dex, one stall, no body modifier) and the in-to-out directional flow together define the structural shape that paradox, blur, fury, sumo, and surge all transform. Movement-language learners encounter mirage first because every later compound reads as a transformation of its template, not as an independent invention.",
  },

  // ── Editorial exemplar #2: paradox-mirage ───────────────────────────
  {
    slug: 'paradox_mirage',
    role: 'Paradox topology root',
    prose:
      "Paradox-mirage is the foundational exemplar for paradox topology itself. Many compounds in modern shred vocabulary inherit paradox topology from this trick: blur extends the same chassis with a stepping multi-dex pattern; fury extends further with a third dex; sumo escalates with nuclear x-dex; surge layers a rotational character. The paradox topology composes naturally with stepping, rotational, x-dex, and surface modifiers: the persistence of its hip-pivot signature under heavy modifier stacking is what made paradox topology productive.",
  },

  // ── Editorial exemplar #3: whirl ────────────────────────────────────
  {
    slug: 'whirl',
    role: 'Cross-body rotational dex anchor',
    prose:
      "Whirl is the family anchor for cross-body rotational dexes terminating on a clipper stall. The conserved terminal mechanic (clipper-anchored cross-body rotation) defines a family branch that includes blender (whirl-osis compound), pogo (whirl with a no-plant constraint), blistering (whirl with gyro back-spin), and a wider set of rotational siblings. The whirl family is one of the dictionary's most branchy trees, expanding across all five movement-language axes.",
  },

  // ── C1 mirage-descendant batch ─────────────────

  {
    slug: 'blur',
    role: 'Stepping-paradox-mirage root',
    prose:
      "Blur is the foundational compound for the stepping-paradox-mirage lineage. It anchors the multi-dex extension axis on the paradox-mirage chassis and serves as the cultural-canonical \"stepping paradox\" shorthand under which a wider family of multi-dex compounds operates. The persistence of paradox topology under stepping multi-dex extension is what made blur a productive landmark: readers encountering descendants on this chassis recognize them as blur transformations rather than independent inventions.",
  },

  {
    slug: 'fury',
    role: 'Multi-dex paradox extension',
    prose:
      "Fury is the named landmark at the deep end of the multi-dex paradox-mirage extension axis. Where blur adds a single stepping dex onto paradox-mirage, fury layers a furious multi-dex stack: the bag passes through a longer sequence of dex moments before the catch arrives. The named status of fury (rather than a generic \"furious paradox mirage\" reading) signals that the structural depth at 5 ADD has earned its own anchor in the movement-language.",
  },

  {
    slug: 'sumo',
    role: 'X-dex escalation locus',
    prose:
      "Sumo's 5 ADD is explained by the [XDEX] flag in its operational notation. Where most nuclear modifiers add +2 cleanly onto the base ADD, sumo's notation carries an [XDEX] on a dex, which scores a separate +1 above the operator-board base math. Its structural reading is settled at 5 ADD because the notation carries that [XDEX]; the score follows the notation, not the operator name.",
  },

  {
    slug: 'drifter',
    role: 'Terminal-surface-shift exemplar',
    prose:
      "Drifter is the canonical exemplar for terminal-surface shifts on the mirage chassis. Where mirage terminates on a toe delay, drifter shifts the terminal to a clipper stall while preserving the in-to-out dex directionality. This terminal-shift is what anchors the broader shred lineage: compounds built on drifter (paradox-drifter, smoke, vortex, lotus, tombstone, fume, quantum-drifter) all inherit the mirage-dex-into-clipper-terminal structural signature. Drifter's productivity comes from being the cleanest demonstration of how a terminal-surface shift opens a new family branch.",
  },

  {
    slug: 'atom_smasher',
    role: 'X-Dex exemplar',
    prose:
      "Atom-smasher is the canonical exemplar for X-Dex compounds on the mirage chassis; its notation carries [XDEX]. Both atom-smasher and sumo carry [XDEX] in their operational notation; X-Dex is scored from that flag, not from the operator name. The folk name may or may not surface it.",
  },

  {
    slug: 'barrage',
    role: 'Naming-disambiguation exemplar',
    prose:
      "Barrage is the canonical naming-disambiguation case in the doctrine: the trick BARRAGE (a 3-ADD anchor with a doubled same-side dex) is structurally distinct from the two-dex uptime set that produces fury (furious paradox mirage) and flurry (furious leg over). That set is Furious; some rows carry legacy barraging-based names for it, but the set is Furious, not a separate operator. The shared root reflects compositional-vs-naming semantics: the same conceptual movement appears both as a standalone anchor and under a legacy set name. Barrage demonstrates that a single root name can occupy more than one layer in the language.",
  },

  {
    slug: 'blurriest',
    role: 'Blurry-naming superlative',
    prose:
      "Blurriest is the canonical superlative of the blurry-naming tradition. Where blur is the cultural-canonical mid-range entry (stepping-paradox-mirage at 4 ADD), blurriest is the deepest blurry-character compound, a 5-ADD blurry-barfly that stacks maximal blurry character on a non-mirage chassis. The blurry-naming tradition operates as a category label spanning multiple chassis: blur on mirage, blurriest on barfly, blurrage on barrage. Blurriest demonstrates how a naming family can extend across structurally distinct anchors while preserving recognizable lineage.",
  },

  // ── C2 whirl-descendant batch ──────────────────

  {
    slug: 'blender',
    role: 'Compound-of-canonicals exemplar',
    prose:
      "Blender is the canonical exemplar for compound-of-canonicals topology in the doctrine. Two named tricks (whirl + osis) combine into a recognized third, and the compound name (blender) does not parameterize either parent: it has earned its own identity through cultural promotion. The pattern repeats across the dictionary: torque (quantum-osis), mobius (gyro-torque), spender (compound on blender), each promoting a compound reading to anchor status. Blender's role is teaching what compound-of-canonicals means structurally and culturally.",
  },

  {
    slug: 'surreal',
    role: 'Top-of-rotational-ladder exemplar',
    prose:
      "Surreal is the canonical exemplar for the top-of-rotational-topology compound in the dictionary. The compound stacks three layers of rotational character (whirl's rotational dex, paradox's hip-pivot, surging's back-spin) and carries its own folk name rather than reading as a parameterized paradox-whirl extension. Surreal demonstrates how the rotational-topology ladder reaches its named extreme: each modifier layer adds rotational character without losing the recognizable whirl chassis underneath.",
  },

  {
    slug: 'phoenix',
    role: 'Multi-modifier butterfly compound',
    prose:
      "Phoenix is the canonical exemplar for multi-modifier compounds on the butterfly chassis. Where most named butterfly compounds carry a single modifier (ripwalk = stepping butterfly; dimwalk = pixie butterfly; parkwalk = stepping-paradox butterfly), phoenix stacks two distinct modifiers from different axes: a set treatment (pixie) and a body-posture modifier (ducking). The compound's named status reflects the structural cleanness of two-axis modifier stacking: each modifier operates on its own axis without overlapping or competing, demonstrating that the butterfly chassis tolerates multi-axis layering.",
  },

  // ── C3 independent-anchor batch ────────────────

  {
    slug: 'osis',
    role: 'Spin-into-clipper canonical',
    prose:
      "Osis is the foundational canonical for spin-into-clipper compounds. Its 3-ADD decomposition (body spin + cross-body clipper terminal) anchors a substantial family (torque, blender, paradox-osis, spinning-osis, ducking-osis, atomic-osis, pixie-osis, stepping-osis, twirl, aeon-flux, barraging-osis). Where mirage is the in-to-out dex anchor and whirl is the rotational dex anchor, osis is the spin-anchored canonical. The osis chassis composes naturally across all five movement-language axes and seeds two named compound-of-canonicals (torque via mirage; blender via whirl).",
  },

  {
    slug: 'butterfly',
    role: 'Leg-over canonical with clipper terminal',
    prose:
      "Butterfly is the foundational canonical for leg-over compounds with cross-body clipper terminals. Its 3-ADD decomposition anchors one of the dictionary's broadest family trees: the butterfly chassis tolerates more named modifier extensions than nearly any other anchor. The cross-body clipper terminal distinguishes butterfly from legover (same-side terminal) and makes the chassis productive for further compositional layering: single-modifier extensions (ripwalk, dimwalk, parkwalk, atomic-butterfly, ducking-butterfly, gyro-butterfly, spinning-butterfly), multi-modifier compounds (phoenix, yoda, matador, ripped-warrior), and naming-driven extensions (bigwalk, darkwalk, dark-avenue, sidewalk, tripwalk, quantanamera).",
  },

  {
    slug: 'torque',
    role: 'Mirage-osis compound; intermediate-base anchor',
    prose:
      "Torque is the canonical exemplar for an intermediate-base anchor in advanced freestyle. The compound combines two canonicals (mirage + osis) into a 4-ADD recognized third, and the compound name carries its own identity rather than reading as a parameterized osis extension. Torque sits as a sibling of blender (whirl + osis compound): the two together demonstrate that the osis chassis composes with both rotational (whirl) and directional-dex (mirage) operators into named third anchors. Torque's role is being the dictionary's most-used intermediate base in advanced compositions, anchoring its own sub-family (mobius, paradox-torque, atomic-torque, gauntlet).",
  },

  {
    slug: 'mobius',
    role: 'Gyro-torque compound exemplar',
    prose:
      "Mobius is the canonical exemplar for gyro-modifier layering on a compound-of-canonicals chassis. Where torque is itself a compound (mirage + osis), mobius adds gyro on top: the rotational body modifier threading through a chassis that is already two canonicals deep. The compound earned its own name rather than reading as 'gyro torque' in the operator-board grammar, demonstrating the doctrine's cultural promotion pattern: a structurally-readable compound becomes a recognized third anchor when player vocabulary adopts a folk name.",
  },

  {
    slug: 'ripwalk',
    role: 'Shred-vocabulary root on butterfly chassis',
    prose:
      "Ripwalk is the canonical exemplar for shred-vocabulary compounds on the butterfly chassis. The structural reading is stepping-butterfly (folk-named 'blurry butterfly'), and the compound earned its own name in the shred lineage. Ripwalk's role is anchoring the naming tradition: 'walk'-suffixed compounds on the butterfly chassis (parkwalk, sidewalk, dimwalk, tapdown, bigwalk, darkwalk, tripwalk) read as kin in the same lineage even where the structural modifier stacks differ. Ripwalk is the cleanest demonstration of how a single named compound can seed a broader naming tradition across a productive chassis.",
  },

  {
    slug: 'food_processor',
    role: 'Blurry-naming on compound-of-canonicals',
    prose:
      "Food-processor is the canonical exemplar for blurry-naming extension into compound-of-canonicals territory. Where blur (mirage chassis), blurriest (barfly chassis), and blurrage (barrage chassis) demonstrate blurry-naming on single-anchor chassis, food-processor demonstrates the same naming tradition reaching into compound territory: blurry on a whirl-osis compound. The folk name 'food-processor' is among the dictionary's more visually distinctive names: it does not resemble either parent canonical (whirl or osis) or the chassis name (blender), instead inheriting culturally-promoted identity rather than structural-grammar resemblance.",
  },

  // ── C4 folk-name rescue exemplar ───────────────

  {
    slug: 'ripstein',
    role: 'Folk-name rescue exemplar',
    prose:
      "Ripstein is the doctrine's canonical folk-name rescue exemplar: the demonstration case for how the trick-detail ontology pipeline recovers meaningful structural readings from culturally-canonical names whose DB rows carry placeholder descriptions. Before the doctrine, ripstein's DB description, \"Popular freestyle trick.\", was a placeholder pattern carrying zero movement-language content. The L1-L6 layers derive a structural reading from the operational notation (doubled same-side back-swirl with cross-body clipper terminal), surface a 4-ADD decomposition consistent with both atom-class anchor status and derivation from swirl, and connect ripstein to the broader naming-disambiguation conversation (barrage as a parallel doubled-dex atom). Ripstein's role is being the cleanest demonstration of the doctrine's pedagogical promise: a placeholder DB row becomes a movement-language teaching object via curator-authored ontology layers.",
  },

] as const;

const ENTRIES_BY_SLUG: ReadonlyMap<string, TrickOntologyRole> = new Map(
  TRICK_ONTOLOGY_ROLE_ENTRIES.map(e => [e.slug, e]),
);

export function getTrickOntologyRole(slug: string): TrickOntologyRole | null {
  return ENTRIES_BY_SLUG.get(slug) ?? null;
}

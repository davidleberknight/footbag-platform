/**
 * freestyleTrickProgressiveReadings.ts
 * =====================================
 *
 * L6,
 * "progressive equivalence unfolding" layer.
 *
 * A staircase of readings: simple parent → topology transformation →
 * compositional extension → compressed shorthand → descendant systems.
 * Each step earns its place in the staircase.
 *
 * Distinct from the existing equivalence sections (trick-transform,
 * trick-equivalence-topology), which fire mechanically. L6 progressive
 * readings UNFOLD the structure rather than restating notation in
 * different forms.
 */

export interface ProgressiveReadingStage {
  /** Short stage label (e.g. "Simple atom", "Topology transformation"). */
  stage: string;
  /** The reading at this stage. 1-2 sentences. */
  reading: string;
  /** Optional source citation. */
  citation?: string;
}

export interface TrickProgressiveReadings {
  slug: string;
  stages: readonly ProgressiveReadingStage[];
}

export const TRICK_PROGRESSIVE_READINGS_ENTRIES: readonly TrickProgressiveReadings[] = [

  // ── Editorial exemplar #1: mirage ───────────────────────────────────
  {
    slug: 'mirage',
    stages: [
      {
        stage:   'Simple atom',
        reading: "TOE > OP IN [DEX] > OP TOE [DEL]: toe set, opposite-side inward dex, opposite toe delay.",
      },
      {
        stage:   'Topology transformation',
        reading: "Paradox layers a cross-body hip-pivot onto the same in-to-out dex: paradox-mirage.",
      },
      {
        stage:   'Compositional extension',
        reading: "Adding stepping makes the dex pattern multi-step: blur (CLIP > OP IN [DEX] > OP OUT [DEX] >).",
      },
      {
        stage:   'Further extension',
        reading: "A third dex chains over the blur chassis: fury (CLIP > OP IN [DEX] > SAME IN [DEX] > OP IN [DEX] >).",
      },
      {
        stage:   'Compressed shorthand',
        reading: "Sumo names the nuclear-mirage compound at 5 ADD as an x-dex escalation exception, not the standard +2 nuclear rule.",
      },
    ],
  },

  // ── Editorial exemplar #2: paradox-mirage ───────────────────────────
  {
    slug: 'paradox-mirage',
    stages: [
      {
        stage:   'Mirage atom',
        reading: "Ordinary mirage: TOE > OP IN [DEX] > OP TOE [DEL]. Single dex, in-to-out direction, no body-side shift.",
      },
      {
        stage:   'Paradox layer: older reading',
        reading: "Op-side dex from a clipper entry: CLIP > OP OUT [DEX] > OP TOE [DEL] in one shorthand tradition.",
      },
      {
        stage:   'Paradox layer: interpretive reading',
        reading: "Cross-body hip-pivot during the dex cycle. Same notation as the older reading; understood as an added topology rather than starting-side variation.",
      },
      {
        stage:   'ADD accounting',
        reading: "paradox(+1) + mirage(2 ADD) = 3 ADD. The accounting is settled; the structural reading is what varies between traditions.",
      },
      {
        stage:   'Productive descendants',
        reading: "Blur layers stepping multi-dex; fury extends with three dexes; sumo escalates with nuclear x-dex; surreal layers a surging rotational character on paradox-whirl. All inherit paradox topology.",
      },
    ],
  },

  // ── Editorial exemplar #3: whirl ────────────────────────────────────
  {
    slug: 'whirl',
    stages: [
      {
        stage:   'Simple anchor',
        reading: "CLIP > OP IN [DEX] > (same side terminal): cross-body rotational dex circling up-and-over to a clipper terminal.",
      },
      {
        stage:   'Terminal compound',
        reading: "Layering an osis terminal gives blender, the compound whirl-osis.",
      },
      {
        stage:   'Topology intensification',
        reading: "Layering paradox produces paradox-whirl; the rotational character intensifies with the hip-pivot transition.",
      },
      {
        stage:   'Compositional extension',
        reading: "Layering a surging rotational system on paradox-whirl produces surreal, the top of the rotational-topology ladder.",
      },
      {
        stage:   'Family-language summary',
        reading: "Whirl-anchored compounds expand across all five movement-language axes (set / topology / rotational / suspension / surface).",
      },
    ],
  },

  // ── C1 mirage-descendant batch ─────────────────

  {
    slug: 'blur',
    stages: [
      {
        stage:   'Mirage atom',
        reading: "TOE > OP IN [DEX] > OP TOE [DEL]. The 2-ADD in-to-out dex template the chassis builds on.",
      },
      {
        stage:   'Paradox layer',
        reading: "Threading the paradox hip-pivot through the dex produces paradox-mirage: CLIP > OP IN [PDX] [DEX] > OP TOE [DEL]. 3 ADD.",
      },
      {
        stage:   'Stepping multi-dex extension',
        reading: "Splitting the pattern into two dex moments produces blur: CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]. 4 ADD via stepping(+1) + paradox(+1) + mirage(2).",
      },
      {
        stage:   'Compressed shorthand',
        reading: "Blur is the cultural-canonical folk name; \"stepping paradox\" as a shorthand category resolves to blur in player vocabulary.",
      },
      {
        stage:   'Further extension',
        reading: "Layering furious onto the same chassis produces fury, a deeper multi-dex sequence at 5 ADD.",
      },
    ],
  },

  {
    slug: 'fury',
    stages: [
      {
        stage:   'Paradox-mirage chassis',
        reading: "Paradox-mirage: CLIP > OP IN [PDX] [DEX] > OP TOE [DEL]. 3 ADD; the chassis fury extends.",
      },
      {
        stage:   'Stepping sibling',
        reading: "Blur extends the chassis with a single stepping dex: stepping(+1) + paradox(+1) + mirage(2) = 4 ADD. Fury reads as the deeper-multi-dex sibling of blur on the same chassis.",
      },
      {
        stage:   'Furious multi-dex extension',
        reading: "The furious modifier layers a multi-dex stack onto paradox-mirage, producing fury at 5 ADD.",
      },
      {
        stage:   'ADD accounting',
        reading: "furious(+2) + paradox(+1) + mirage(2) = 5 ADD. The +2 for furious applies on bases with rotational character (a doctrine-internal scaling rule); +1 on bases without.",
      },
      {
        stage:   'Doctrine evolution',
        reading: "An earlier reading decomposed fury as paradox + barraging + mirage, arriving at the same 5 ADD via a different operator stack. The furious + paradox + mirage reading is the current canonical chain.",
      },
    ],
  },

  {
    slug: 'sumo',
    stages: [
      {
        stage:   'Mirage atom',
        reading: "Mirage: TOE > OP IN [DEX] > OP TOE [DEL]. 2 ADD; the chassis sumo extends.",
      },
      {
        stage:   'Nuclear modifier',
        reading: "The standard +2 nuclear rule on the mirage chassis would suggest nuclear(+2) + mirage(2) = 4 ADD.",
      },
      {
        stage:   'X-Dex escalation: named exception',
        reading: "Sumo is the doctrine's named exemplar where the standard rule does not hold: an implicit X-Dex transition pushes the ADD to 5 even though the canonical name does not surface the X-Dex explicitly.",
      },
      {
        stage:   'Operational notation',
        reading: "CLIP > SAME OUT [DEX] [PDX] >> OP IN [DEX] [XDEX] > OP TOE [DEL]. The [XDEX] marker carries the named exception in the operational notation; the canonical-name reading is the higher-level folk handle \"sumo\".",
      },
      {
        stage:   'ADD accounting',
        reading: "5 ADD via named X-Dex escalation rather than mechanical operator-board addition. Demonstrates that ADD arithmetic sometimes follows named-exception rules.",
      },
    ],
  },

  {
    slug: 'drifter',
    stages: [
      {
        stage:   'Mirage chassis',
        reading: "Mirage: TOE > OP IN [DEX] > OP TOE [DEL]. The in-to-out dex template with toe terminal.",
      },
      {
        stage:   'Terminal-surface shift',
        reading: "Shifting the terminal from toe to clipper produces drifter: SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]. 3 ADD; same dex pattern, different landing surface.",
      },
      {
        stage:   'ADD accounting',
        reading: "Reads as either mirage(2) + cross-body-terminal-shift(+1) or clipper-stall(2) + mirage-operator(+1); both decompositions arrive at 3 ADD.",
      },
      {
        stage:   'Family-branch entry',
        reading: "Compounds built on the drifter chassis (paradox-drifter, smoke, vortex, lotus, tombstone, fume, quantum-drifter) inherit both the mirage-dex AND the clipper-anchored terminal.",
      },
      {
        stage:   'Family-language summary',
        reading: "Drifter is the cleanest demonstration of how a terminal-surface shift opens a new lineage on an existing dex pattern.",
      },
    ],
  },

  {
    slug: 'atom-smasher',
    stages: [
      {
        stage:   'Mirage atom',
        reading: "Mirage: TOE > OP IN [DEX] > OP TOE [DEL]. 2 ADD; the in-to-out dex template.",
      },
      {
        stage:   'X-Dex reversal',
        reading: "Reversing the dex direction to outside-then-inside produces the X-Dex character: same surfaces, opposite directional flow.",
      },
      {
        stage:   'Atomic operator',
        reading: "Layering atomic onto mirage produces atom-smasher: atomic(+1) plus an explicit X-Dex(+1) on the following dex + mirage(2) = 4 ADD.",
      },
      {
        stage:   'Explicit vs implicit X-Dex',
        reading: "The canonical name surfaces the X-Dex character openly (\"atomic mirage\"). Sumo by contrast names only the nuclear operator while the X-Dex character is implicit and surfaces only in the ADD accounting.",
      },
      {
        stage:   'Pedagogical sibling',
        reading: "Atom-smasher and sumo together demonstrate the explicit-vs-implicit X-Dex distinction in the doctrine.",
      },
    ],
  },

  {
    slug: 'barrage',
    stages: [
      {
        stage:   'Doubled-dex anchor',
        reading: "CLIP > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]. Two same-side inside dexes back-to-back; 3-ADD anchor reading.",
      },
      {
        stage:   'Naming-disambiguation',
        reading: "The trick BARRAGE is structurally distinct from the operator BARRAGING: same root, two layers (anchor and operator).",
      },
      {
        stage:   'Chassis descendants',
        reading: "Compounds layered on barrage (paradox-barrage, blurrage) inherit the doubled-dex structural signature.",
      },
      {
        stage:   'Operator productivity',
        reading: "The barraging modifier produces fury (barraging-paradox-mirage in earlier doctrine) and flurry (barraging-leg-over) on other chassis.",
      },
      {
        stage:   'Family-language summary',
        reading: "Barrage demonstrates that a single name can legitimately operate at both the anchor and operator layers; the language tolerates the dual reading because the structural contexts disambiguate.",
      },
    ],
  },

  {
    slug: 'blurriest',
    stages: [
      {
        stage:   'Barfly chassis',
        reading: "Barfly (4-ADD double-infinity compound on the infinity chassis). The chassis blurriest extends.",
      },
      {
        stage:   'Blurry layer',
        reading: "Layering a blurry modifier onto barfly produces blurriest: CLIP > OP IN [DEX] >> OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]. 5 ADD.",
      },
      {
        stage:   'ADD accounting',
        reading: "blurry(+1) + barfly(4) = 5 ADD.",
      },
      {
        stage:   'Naming-tradition role',
        reading: "Blurriest is the superlative form of the blurry-naming family, the deepest blurry-character compound in the dictionary.",
      },
      {
        stage:   'Cross-chassis kin',
        reading: "Blur (mirage chassis), blurrage (barrage chassis), and blurriest (barfly chassis) are all kin in the blurry-naming tradition while differing in structural base.",
      },
    ],
  },

  // ── C2 whirl-descendant batch ──────────────────

  {
    slug: 'blender',
    stages: [
      {
        stage:   'Whirl atom',
        reading: "Whirl: cross-body rotational dex with clipper terminal; 3 ADD. One parent of the compound.",
      },
      {
        stage:   'Osis atom',
        reading: "Osis: spin-into-clipper; 3 ADD. The other parent of the compound.",
      },
      {
        stage:   'Compound-of-canonicals',
        reading: "Combining whirl's dex with osis's spin-terminal produces blender: SET > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. 4 ADD via whirl(+1 operator) + osis(3), or symmetrically osis(+1 operator) + whirl(3). Both decompositions arrive at the same total.",
      },
      {
        stage:   'Compound name as anchor',
        reading: "The name \"blender\" carries its own identity rather than reading as a parameterized whirl or osis; the compound has been culturally promoted to anchor status.",
      },
      {
        stage:   'Productive descendants',
        reading: "Paradox-blender, food-processor, spender, mind-bender, fender, fender-bender, and others build on the blender chassis: compound-of-canonicals topology itself anchors further compositional layering.",
      },
    ],
  },

  {
    slug: 'surreal',
    stages: [
      {
        stage:   'Whirl atom',
        reading: "Whirl: rotational cross-body dex with clipper terminal; 3 ADD. The chassis.",
      },
      {
        stage:   'Paradox layer',
        reading: "Layering paradox onto whirl produces paradox-whirl: CLIP > SAME IN [PDX] [DEX] > OP CLIP [XBD] [DEL]. 4 ADD; rotational character intensified with hip-pivot transition.",
      },
      {
        stage:   'Surging layer',
        reading: "Layering a surging back-spin system onto paradox-whirl produces surreal: CLIP > (back) SPIN [BOD] > SAME IN [DEX] >> OP FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD] [DEL]. 6 ADD.",
      },
      {
        stage:   'ADD accounting',
        reading: "surging(+2 on rotational character) + paradox(+1) + whirl(3) = 6 ADD.",
      },
      {
        stage:   'Family-language summary',
        reading: "Surreal sits at the top of the rotational-topology ladder; the structural signature stacks rotational character at three distinct movement events while preserving the recognizable whirl chassis.",
      },
    ],
  },

  {
    slug: 'phoenix',
    stages: [
      {
        stage:   'Butterfly atom',
        reading: "Butterfly: leg-over to cross-body clipper; 3 ADD. The chassis.",
      },
      {
        stage:   'Pixie layer',
        reading: "Layering pixie onto butterfly produces dimwalk: pixie(+1) + butterfly(3) = 4 ADD. A set-treatment modifier compressing the opening dex.",
      },
      {
        stage:   'Ducking layer',
        reading: "Stacking ducking on the pixie-butterfly chassis produces phoenix: TOE > SAME IN [DEX] >> DUCK [BOD] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]. 5 ADD.",
      },
      {
        stage:   'ADD accounting',
        reading: "pixie(+1) + ducking(+1) + butterfly(3) = 5 ADD.",
      },
      {
        stage:   'Multi-axis stacking',
        reading: "Phoenix demonstrates two-axis modifier stacking on a non-trivial chassis: set-treatment (pixie) and body-posture (ducking) operating without competing for the same structural slot.",
      },
    ],
  },

  // ── C3 independent-anchor batch ────────────────

  {
    slug: 'osis',
    stages: [
      {
        stage:   'Core atom anchor',
        reading: "Osis: SET > (back or front) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]. 3 ADD; spin-into-cross-body-clipper.",
      },
      {
        stage:   'Position in the canonical trio',
        reading: "Osis is the spin-into-clipper canonical alongside mirage (in-to-out dex) and whirl (rotational dex). Three foundational dex anchors.",
      },
      {
        stage:   'Compound-of-canonicals productivity',
        reading: "Layering whirl produces blender; layering mirage produces torque. Both compound names earn anchor status and seed further productivity.",
      },
      {
        stage:   'Modifier-axis productivity',
        reading: "Body modifiers (ducking, spinning, atomic), the paradox dex relationship, set treatments (pixie), and multi-dex extensions (stepping, barraging) all compose naturally with osis.",
      },
      {
        stage:   'Family-language summary',
        reading: "Osis is one of the most generative anchors in the dictionary; the spin-into-clipper signature persists under heavy modifier stacking.",
      },
    ],
  },

  {
    slug: 'butterfly',
    stages: [
      {
        stage:   'Core atom anchor',
        reading: "Butterfly: SET > SAME or OP OUT [DEX] > OP CLIP [XBD] [DEL]. 3 ADD; leg-over to cross-body clipper.",
      },
      {
        stage:   'Position among atoms',
        reading: "Butterfly is the leg-over canonical with cross-body terminal: distinct from legover (same-side terminal) and from the rotational-dex atoms (whirl, osis).",
      },
      {
        stage:   'Single-modifier productivity',
        reading: "The 4-ADD bucket on the butterfly chassis is the densest in the dictionary: 10+ named single-modifier compounds (ripwalk, dimwalk, parkwalk, atomic-butterfly, ducking-butterfly, gyro-butterfly, spinning-butterfly, sidewalk, tapdown, tripwalk, butterfly-kick).",
      },
      {
        stage:   'Multi-modifier productivity',
        reading: "At 5 ADD, named two-modifier compounds (phoenix, yoda, matador, ripped-warrior, darkwalk, bigwalk, quantanamera) demonstrate that the chassis tolerates multi-axis layering cleanly.",
      },
      {
        stage:   'Family-language summary',
        reading: "Butterfly is one of the dictionary's broadest trees; the leg-over-to-clipper signature persists across most modifier stacks the chassis carries.",
      },
    ],
  },

  {
    slug: 'torque',
    stages: [
      {
        stage:   'Mirage atom',
        reading: "Mirage (2 ADD; in-to-out dex with toe terminal). One parent.",
      },
      {
        stage:   'Osis atom',
        reading: "Osis (3 ADD; spin-into-cross-body-clipper). The other parent.",
      },
      {
        stage:   'Compound-of-canonicals',
        reading: "Combining mirage's dex with osis's spin-terminal produces torque. 4 ADD via mirage(+1 operator) + osis(3), or symmetrically osis(+1 operator) + mirage(2 + cross-body-terminal-shift).",
      },
      {
        stage:   'Sibling compound',
        reading: "Torque (mirage + osis) and blender (whirl + osis) are sibling compounds on the osis chassis with different dex-side canonicals.",
      },
      {
        stage:   'Sub-family anchor',
        reading: "Torque earned its own descendant family (mobius, paradox-torque, atomic-torque, gauntlet): compound-of-canonicals topology can itself anchor further productivity.",
      },
    ],
  },

  {
    slug: 'mobius',
    stages: [
      {
        stage:   'Mirage atom',
        reading: "Mirage (2 ADD). The dex-side parent of torque.",
      },
      {
        stage:   'Osis atom',
        reading: "Osis (3 ADD). The spin-terminal parent of torque.",
      },
      {
        stage:   'Torque chassis',
        reading: "Combining mirage and osis produces torque at 4 ADD (compound-of-canonicals).",
      },
      {
        stage:   'Gyro layer',
        reading: "Layering gyro onto torque produces mobius: CLIP >> (back) SPIN [BOD] >> SAME IN [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]. 5 ADD via gyro(+1) + torque(4).",
      },
      {
        stage:   'Compound name as anchor',
        reading: "Mobius reads as 'gyro torque' structurally, but the compound carries its own name: the cultural-canonical promotion pattern recurs (torque, blender, mobius all earned named identity beyond their operator-board decompositions).",
      },
    ],
  },

  {
    slug: 'ripwalk',
    stages: [
      {
        stage:   'Butterfly atom',
        reading: "Butterfly (3 ADD; leg-over to cross-body clipper). The chassis ripwalk extends.",
      },
      {
        stage:   'Stepping layer',
        reading: "Layering stepping onto butterfly produces ripwalk: the leg-over pattern splits into two dex moments. 4 ADD via stepping(+1) + butterfly(3).",
      },
      {
        stage:   'Folk-name encoding',
        reading: "The DB description encodes the operator as 'blurry butterfly', reflecting the shred-vocabulary tradition where 'blurry' is the folk handle for the stepping-class operator on the chassis.",
      },
      {
        stage:   'Naming-tradition root',
        reading: "Ripwalk anchors the 'walk'-suffixed naming family on the butterfly chassis: parkwalk, sidewalk, dimwalk, tapdown, bigwalk, darkwalk, tripwalk read as kin in the shred lineage.",
      },
      {
        stage:   'Family-language summary',
        reading: "Ripwalk is the cleanest demonstration of how a single named compound can seed a broader naming tradition across a productive chassis.",
      },
    ],
  },

  {
    slug: 'food-processor',
    stages: [
      {
        stage:   'Whirl + osis atoms',
        reading: "The two canonicals that compose blender. Each 3 ADD.",
      },
      {
        stage:   'Blender chassis',
        reading: "Combining whirl and osis produces blender (4 ADD; compound-of-canonicals).",
      },
      {
        stage:   'Blurry layer',
        reading: "Layering blurry-class operators onto blender produces food-processor: CLIP > OP IN [DEX] >> OP FRONT WHIRL [DEX] [PDX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. 6 ADD.",
      },
      {
        stage:   'Naming-tradition reach',
        reading: "Food-processor extends the blurry-naming family from single-anchor chassis (blur on mirage, blurriest on barfly, blurrage on barrage) into compound-of-canonicals territory (blender).",
      },
      {
        stage:   'Visually distinctive folk name',
        reading: "Food-processor's name does not resemble its structural decomposition: the cultural-promotion pattern can produce names entirely orthogonal to the operator-board grammar.",
      },
    ],
  },

  // ── C4 folk-name rescue exemplar ───────────────

  {
    slug: 'ripstein',
    stages: [
      {
        stage:   'Placeholder DB row',
        reading: "Before the doctrine, ripstein's DB description, \"Popular freestyle trick.\", was a placeholder pattern carrying no movement-language content.",
      },
      {
        stage:   'Operational notation as evidence',
        reading: "The op notation reveals a structural reading: CLIP >> SAME BACK SWIRL [DEX] >> SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]. Doubled same-side back-swirl with cross-body clipper terminal.",
      },
      {
        stage:   'Doubled-dex reading',
        reading: "Two reverse-rotational dex moments in sequence, parallel to barrage's doubled-mirage-class reading at 3 ADD, but with rotational rather than linear dexes.",
      },
      {
        stage:   'ADD accounting',
        reading: "4 ADD consistent with both an atom-class anchor reading (doubled-back-swirl as standalone, paralleling barrage) and a derived reading (swirl(3) + doubled-dex(+1)).",
      },
      {
        stage:   'Folk-name rescue pattern',
        reading: "Ripstein demonstrates the doctrine's salvage capacity: culturally-canonical folk names recover meaningful structural readings via the L1-L6 layers when DB rows carry no content.",
      },
      {
        stage:   'Demonstration case',
        reading: "The doctrine's pedagogical promise: a placeholder DB row becomes a movement-language teaching object when the L1-L6 ontology layers are populated.",
      },
    ],
  },

] as const;

const ENTRIES_BY_SLUG: ReadonlyMap<string, TrickProgressiveReadings> = new Map(
  TRICK_PROGRESSIVE_READINGS_ENTRIES.map(e => [e.slug, e]),
);

export function getTrickProgressiveReadings(slug: string): TrickProgressiveReadings | null {
  return ENTRIES_BY_SLUG.get(slug) ?? null;
}

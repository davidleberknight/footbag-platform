/**
 * freestyleGlossaryFamilyCards.ts
 * ================================
 *
 * Curator-authored family card data for the /freestyle/concepts Family
 * Encyclopedia chapter (Core Trick Families), and only that chapter. The family
 * roster, tiers, parents and the teaching text a family page shows live in
 * freestyle_families, read through src/services/freestyleFamilyRegistry.ts; the
 * concepts chapter reads a family's hook and description from there too. What is
 * left here is the chapter's own material, which waits on the concepts-page cut.
 *
 * Each card preserves the #term-{slug} anchor for inbound deep-links
 * from the trick dictionary, history page, and external surfaces
 * (anchor-preservation forever-rule).
 *
 * Layer contract:
 *   - Canonical fields (formula / anchor / descendants) are doctrine.
 *   - Observational notes (network observations) sit under collapsed
 *     [observational] panels.
 *   - The reader scanning the page sees only canonical material unless
 *     they opt in to the deeper panels.
 */

export interface GlossaryFamilyCardObservationalNote {
  /** Short title that surfaces on the collapsed <details> summary. */
  title:   string;
  /** Body prose; rendered inside the panel when expanded. */
  body:    string;
}

export interface GlossaryFamilyCard {
  /** Stable slug; drives the #term-{slug} anchor on the rendered card. */
  slug:               string;
  /** Display name (capitalized; e.g. "Whirl"). */
  displayName:        string;
  /** Canonical compact-form formula (e.g. "CLIP > OP IN [DEX] > OP CLIP [XBD] [DEL]"). */
  canonicalFormula:   string;
  /** Numeric ADD of the family anchor; matches freestyle_tricks.adds. */
  familyAnchorAdds:   number;
  /** Common descendants (3-5 representative members of the family). */
  commonDescendants:  readonly string[];
  /** Sibling families shown on the concepts card (peer ontology anchors). */
  siblingFamilies:    readonly string[];
  /** Notable compounds: named tricks that compose from this family. */
  notableCompounds:   readonly string[];
  /** Optional [observational] panels surfacing network or topology notes. */
  observationalNotes: readonly GlossaryFamilyCardObservationalNote[];
}

// ─────────────────────────────────────────────────────────────────────────
// Root terminal-anchor family cards (the well-documented terminal families;
// the full roster lives in freestyle_families).
// ─────────────────────────────────────────────────────────────────────────

export const ROOT_TERMINAL_FAMILIES: readonly GlossaryFamilyCard[] = [
  {
    slug:              'whirl',
    displayName:       'Whirl',
    canonicalFormula:  'SET > OP IN [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['blurry whirl', 'paradox whirl', 'gyro whirl', 'spinning whirl', 'symposium whirl'],
    siblingFamilies:   ['butterfly', 'osis', 'swirl', 'rev_whirl'],
    notableCompounds:  ['mobius', 'blur', 'stepping paradox whirl'],
    observationalNotes: [
      {
        title: 'One ending, many entries',
        body:  'Blurry Whirl adds the Blurry structure to the same Whirl base, while other family members vary the entry and modifiers around that clipper ending.',
      },
    ],
  },
  {
    slug:              'butterfly',
    displayName:       'Butterfly',
    canonicalFormula:  'SET > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['atomic butterfly', 'pixie butterfly', 'stepping butterfly', 'ducking butterfly'],
    siblingFamilies:   ['whirl', 'osis', 'mirage'],
    notableCompounds:  ['ripwalk', 'dimwalk', 'parkwalk'],
    observationalNotes: [],
  },
  {
    slug:              'down',
    displayName:       'Down',
    // Representative chassis: the double-over-down cell. The family's four
    // variants share the two-outward-dex motif; the set and the performing
    // foot select the variant.
    canonicalFormula:  'TOE > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['fusion', 'scorpions tail', 'superfly', 'dolomite', 'nemesis'],
    siblingFamilies:   ['barfly', 'double_over_down', 'paradon', 'down_double_down'],
    notableCompounds:  ['shooting star', 'venom', 'blurriest', 'cold fusion'],
    observationalNotes: [],
  },
  {
    slug:              'mirage',
    displayName:       'Mirage',
    canonicalFormula:  'SET > OP IN [DEX] > OP TOE [DEL]',
    familyAnchorAdds:  2,
    commonDescendants: ['paradox mirage', 'symposium mirage', 'atomic mirage', 'spinning mirage'],
    siblingFamilies:   ['illusion', 'butterfly', 'osis'],
    notableCompounds:  ['blur', 'smear', 'atomsmasher'],
    observationalNotes: [
      {
        title: 'Mirage / illusion symmetry',
        body:  'Mirage and illusion are reverse-direction siblings with the same return to the setting toe, the canonical example of a direction pair.',
      },
    ],
  },
  {
    slug:              'osis',
    displayName:       'Osis',
    canonicalFormula:  'SET > (back or front) SPIN [BOD] > SAME/OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox osis', 'spinning osis', 'symposium osis', 'atomic osis'],
    siblingFamilies:   ['whirl', 'butterfly', 'swirl'],
    notableCompounds:  ['torque (≡ quantum osis)', 'blender (≡ whirling osis)'],
    observationalNotes: [],
  },
  {
    slug:              'illusion',
    displayName:       'Illusion',
    canonicalFormula:  'SET > OP OUT [DEX] > OP TOE [DEL]',
    familyAnchorAdds:  2,
    commonDescendants: ['paradox illusion', 'spinning illusion', 'ducking illusion', 'atomic illusion'],
    siblingFamilies:   ['mirage', 'pickup', 'legover'],
    notableCompounds:  ['flail', 'blizzard', 'smudge'],
    observationalNotes: [],
  },
  {
    slug:              'legover',
    displayName:       'Legover',
    canonicalFormula:  'SET > OP OUT [DEX] > SAME TOE [DEL]',
    familyAnchorAdds:  2,
    commonDescendants: ['eggbeater', 'double leg over', 'flurry', 'spinning legover'],
    siblingFamilies:   ['illusion', 'pickup', 'mirage'],
    notableCompounds:  ['eggbeater (≡ atomic legover)', 'flurry', 'merkon'],
    observationalNotes: [
      {
        title: 'Root of the leg-over axis',
        body:  'Legover introduces the leg-over body axis (distinct from the hippy axis) as a compositional primitive. Eggbeater is its atomic form (eggbeater ≡ atomic legover); flurry and the double-leg-over extend the lineage.',
      },
    ],
  },
  {
    slug:              'pickup',
    displayName:       'Pickup',
    canonicalFormula:  'SET > OP IN [DEX] > SAME TOE [DEL]',
    familyAnchorAdds:  2,
    commonDescendants: ['double pickup', 'spinning pickup', 'ducking pickup', 'paste'],
    siblingFamilies:   ['mirage', 'illusion', 'legover'],
    notableCompounds:  ['scrambled eggbeater', 'paste', 'legeater'],
    observationalNotes: [
      {
        title: 'Pickup compounds',
        body:  'Pickup anchors paste, legeater, and the spinning / ducking pickup compounds.',
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Branch and lineage families. Each descends from a root via a chain reading;
// whether one has a page is its tier in freestyle_families, not this list.
// ─────────────────────────────────────────────────────────────────────────

export const BRANCH_FAMILIES: readonly GlossaryFamilyCard[] = [
  {
    slug:              'swirl',
    displayName:       'Swirl',
    canonicalFormula:  'SET > SAME OUT [DEX] > SAME CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox swirl', 'hop over swirl', 'butterfly swirl'],
    siblingFamilies:   ['whirl', 'osis'],
    notableCompounds:  ['paradox whirling swirl', 'spyro gyro (≡ gyro butterfly swirl)'],
    observationalNotes: [],
  },
  {
    slug:              'rev_whirl',
    displayName:       'Reverse Whirl',
    canonicalFormula:  'SET > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['hatchet', 'mullet', 'rev-up'],
    siblingFamilies:   ['whirl'],
    notableCompounds:  ['hatchet', 'mullet'],
    observationalNotes: [
      {
        title: 'Whirl ↔ rev-whirl mirror pair',
        body:  'Rev-whirl is the direction-mirror sibling of whirl inside the clipper-terminal matrix: both use the opposite leg and land on an opposite clipper, whirl circling in and rev-whirl circling out. The same-side cells of that matrix are swirl (out) and reverse swirl (in).',
      },
    ],
  },
  {
    slug:              'torque',
    displayName:       'Torque',
    canonicalFormula:  'CLIP > OP IN [DEX] > (BACK) SPIN [BOD] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['paradox torque', 'spinning torque', 'blurry torque', 'gyro torque (≡ mobius)'],
    siblingFamilies:   ['blender', 'drifter'],
    notableCompounds:  ['mobius', 'fury', 'blurry torque'],
    observationalNotes: [
      {
        title: 'First-class branch of osis',
        body:  'Torque ≡ quantum osis, a reading its trick page keeps. Torque is a Family Parent that descends from osis (it conserves the osis terminal), so it renders as a branch under osis while leading its own lineage.',
      },
    ],
  },
  {
    slug:              'blender',
    displayName:       'Blender',
    canonicalFormula:  'SET > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['paradox blender', 'spinning blender', 'symposium blender'],
    siblingFamilies:   ['torque', 'drifter'],
    notableCompounds:  ['food processor (≡ blurry blender)', 'pogo paradox blender'],
    observationalNotes: [
      {
        title: 'First-class branch of osis',
        body:  'Blender ≡ whirling osis. Same pattern as torque: a Family Parent that descends from osis via a chain reading while leading its own lineage. The whirling operator adds the back-spin component.',
      },
    ],
  },
  {
    slug:              'drifter',
    displayName:       'Drifter',
    canonicalFormula:  'SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox drifter', 'gyro drifter'],
    siblingFamilies:   ['torque', 'blender'],
    notableCompounds:  ['vortex (≡ gyro drifter)', 'paradox drifter'],
    observationalNotes: [
      {
        title: 'The miraging clipper name',
        body:  'The legacy "miraging clipper" name for drifter is descriptive mirage-family shorthand, not a scored decomposition.',
      },
    ],
  },
  {
    slug:              'barrage',
    displayName:       'Barrage',
    canonicalFormula:  'CLIP > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox barrage', 'pogo paradox barrage', 'symposium barrage'],
    siblingFamilies:   ['blur'],
    notableCompounds:  ['blurrage (≡ stepping paradox barrage)', 'baroque (≡ furious osis)'],
    observationalNotes: [],
  },
  {
    slug:              'blur',
    displayName:       'Blur',
    canonicalFormula:  'CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['blurry whirl', 'blurry torque', 'blurry blender (food processor)'],
    siblingFamilies:   ['barrage', 'mirage'],
    notableCompounds:  ['food processor', 'blurriest', 'blurry symposium whirl'],
    observationalNotes: [
      {
        title: 'Composite-modifier composition',
        body:  'Blur ≡ stepping paradox mirage. The "blurry" label is folk shorthand for the two-operator stepping + paradox stack; its ADD is resolved as that composition rather than by adding the two modifiers independently.',
      },
    ],
  },
  {
    slug:              'phoenix',
    displayName:       'Phoenix',
    canonicalFormula:  'TOE > SAME IN [DEX] >> DUCK [BOD] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  5,
    commonDescendants: ['paradox phoenix', 'ducking phoenix'],
    siblingFamilies:   ['butterfly', 'osis'],
    notableCompounds:  ['ducking phoenix'],
    observationalNotes: [],
  },
  {
    slug:              'eclipse',
    displayName:       'Eclipse',
    canonicalFormula:  'SET > JUMP [BOD] > SAME/OP INSIDE [DEL] > OP OUT [DEX] > (land)',
    familyAnchorAdds:  3,
    commonDescendants: ['atomic eclipse', 'ducking eclipse', 'gyro eclipse', 'miraging eclipse'],
    siblingFamilies:   ['butterfly_swirl'],
    notableCompounds:  [],
    observationalNotes: [
      {
        title: 'Airborne hop-over',
        body:  'Eclipse lifts the held-stall leg-over chassis of hop-over off the ground: after a jump off the support leg, both the inside-foot held stall and the outward dex happen in flight. Both tricks score the jump; the added outward dex is why eclipse reads as 3 ADD where hop-over reads as 2.',
      },
    ],
  },
  {
    slug:              'dada_curve',
    displayName:       'Dada-Curve',
    canonicalFormula:  'SET >> OP IN [DEX] > (no plant while) OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['gyro dada-curve', 'pixie dada-curve'],
    siblingFamilies:   ['butterfly', 'paradon'],
    notableCompounds:  [],
    observationalNotes: [
      {
        title: 'A butterfly-family branch on a no-plant-while chassis',
        body:  'Dada-Curve is a butterfly-family branch on a no-plant-while chassis that closes on an opposite cross-body clipper. Its full compositional reading uses mirage-family (miraging) language, which is descriptive naming rather than a scored component, so no scored decomposition is stated here.',
      },
    ],
  },
  {
    slug:              'barfly',
    displayName:       'Barfly',
    canonicalFormula:  'CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]',
    familyAnchorAdds:  4,
    commonDescendants: ['gyro barfly', 'pixie barfly', 'spinning barfly', 'stepping barfly'],
    siblingFamilies:   ['butterfly', 'dada_curve'],
    notableCompounds:  ['blurriest', 'superfly'],
    observationalNotes: [
      {
        title: 'A third dex on the same chassis',
        body:  'Barfly anchors the blurry superlative blurriest, which stacks a third dex onto the same double-dex chassis.',
      },
    ],
  },
  {
    slug:              'dyno',
    displayName:       'Dyno',
    canonicalFormula:  'SET > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['fairy dyno', 'miraging dyno', 'pixie dyno', 'stepping dyno'],
    siblingFamilies:   ['osis', 'butterfly_swirl'],
    notableCompounds:  [],
    observationalNotes: [
      {
        title: 'Spin-bearing branch',
        body:  'Dyno is a 4-ADD branch whose signature is a back spin: an outward dex, then a back-spinning body element, then a same-side cross-body clipper. The back spin places it beside osis (its structure carries the tracked folk name Reverse Whirling Osis), and it leads a named branch of its own (fairy, miraging, pixie, and stepping dyno).',
      },
    ],
  },
  {
    slug:              'paradon',
    displayName:       'Paradon',
    canonicalFormula:  'TOE > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['fairy paradon', 'pixie paradon', 'symposium paradon'],
    siblingFamilies:   ['double_over_down', 'dada_curve'],
    notableCompounds:  ['dolomite'],
    observationalNotes: [
      {
        title: 'Toe-set double out-dex',
        body:  'Paradon is a 4-ADD toe-set branch: two opposite-side out dexes circled by the other leg, closing on an opposite cross-body clipper. It sits beside double-over-down, which circles both dexes with the setting leg instead (two same-side out dexes), and feeds named descendants including symposium paradon (folk-named Dolomite).',
      },
    ],
  },
  {
    slug:              'double_over_down',
    displayName:       'Double-Over-Down',
    canonicalFormula:  'TOE > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['down diver', 'gyro double-over-down', 'pixie double-over-down'],
    siblingFamilies:   ['legover', 'paradon'],
    notableCompounds:  ['down diver'],
    observationalNotes: [
      {
        title: 'Neighbors',
        body:  'Double-Over-Down sits beside paradon, which circles with the other leg instead (two opposite-side out dexes), and beside the legover family; its deepest named descendant is the down diver.',
      },
    ],
  },
  {
    slug:              'flurry',
    displayName:       'Flurry',
    canonicalFormula:  'CLIP > OP IN [DEX] > SAME IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['flurricane', 'gyro flurry', 'paradox flurry'],
    siblingFamilies:   ['legover', 'eggbeater', 'double_leg_over'],
    notableCompounds:  ['flurricane'],
    observationalNotes: [
      {
        title: 'Flurry\'s furious-legover lineage',
        body:  'Flurry is the furious-legover counterpart to eggbeater (the atomic legover): both are legover-family branches named by the set operator that builds them, conserving the legover toe-catch terminal.',
      },
    ],
  },
  {
    slug:              'flail',
    displayName:       'Flail',
    canonicalFormula:  'SET > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['atomic flail', 'fairy flail', 'gyro flail', 'paradox flail'],
    siblingFamilies:   ['mirage', 'legover'],
    notableCompounds:  [],
    observationalNotes: [
      {
        title: 'Branch of illusion',
        body:  'Flail ≡ symposium illusion: the symposium (no-plant) operator on the illusion terminal, conserving illusion\'s return to the setting toe.',
      },
    ],
  },
  {
    slug:              'butterfly_swirl',
    displayName:       'Butterfly-Swirl',
    canonicalFormula:  'SET > SAME/OP OUT [DEX] > OP OUT [DEX] > SAME CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['ducking butterfly-swirl', 'gyro butterfly-swirl', 'spinning butterfly-swirl'],
    siblingFamilies:   ['butterfly', 'eclipse'],
    notableCompounds:  [],
    observationalNotes: [
      {
        title: 'Butterfly-entry swirl',
        body:  'Butterfly-Swirl pairs a butterfly-style out-dex with the swirl ending: a same/opposite out-dex precedes a second out dex, which catches on a same-side cross-body clipper. It leads its own branch (gyro / spinning / ducking butterfly-swirl) off the swirl anchor.',
      },
    ],
  },
  {
    slug:              'double_leg_over',
    displayName:       'Double Legover',
    canonicalFormula:  'SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox double-leg-over', 'pixie double-leg-over', 'fairy double-leg-over'],
    siblingFamilies:   ['eggbeater', 'legover'],
    notableCompounds:  ['smog', 'haze', 'predator'],
    observationalNotes: [
      {
        title: 'First-class branch of legover',
        body:  'A Family Parent that descends from legover (it keeps the legover toe catch), rendered as a branch while leading its own lineage.',
      },
    ],
  },
  {
    slug:              'eggbeater',
    displayName:       'Eggbeater',
    canonicalFormula:  'TOE >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox eggbeater', 'gyro eggbeater', 'quantum eggbeater'],
    siblingFamilies:   ['double_leg_over', 'legover'],
    notableCompounds:  ['bedwetter'],
    observationalNotes: [
      {
        title: 'First-class branch of legover',
        body:  'Like double-leg-over, a Family Parent that descends from legover, rendered as a branch while leading its own lineage.',
      },
    ],
  },
  {
    slug:              'inside_stall',
    displayName:       'Inside Stall',
    canonicalFormula:  'SET > OP IN [DEX] > SAME INSIDE [DEL]',
    familyAnchorAdds:  2,
    commonDescendants: ['spinning guay', 'gyro guay', 'ducking guay', 'stepping guay'],
    siblingFamilies:   ['pickup'],
    notableCompounds:  ['guay'],
    observationalNotes: [
      {
        title: 'A terminal surface led by the guay lineage',
        body:  'Inside-stall is a terminal surface identity, distinct from toe and clipper. Its productive lineage is guay, which mirrors pickup\'s pattern (leggy in dex) with the catch swapped to the inside of the foot. Guay and its variants are members of this surface family, not a family of their own.',
      },
    ],
  },
];

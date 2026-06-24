/**
 * freestyleGlossaryFamilyCards.ts
 * ================================
 *
 * Curator-authored family card data for /freestyle/glossary §5 (Core
 * Trick Families). Two cohorts (`kind`):
 *
 *   - 'root-terminal' = parent families: top-level lineages with their
 *     own conserved terminal mechanic. The family base trick IS that
 *     terminal structure in its simplest form.
 *
 *   - 'branch' = descendant lineages & child sub-families: named
 *     compounds that descend from a parent via a chain reading. Some
 *     fold under a parent as child sub-families (torque/blender → osis;
 *     swirl/rev-whirl → whirl); others are productive descendant
 *     lineages in their own right (drifter, barrage). Final tier
 *     assignment is curator-paced; see the glossary fuzzy-boundary note.
 *
 * Each card preserves the #term-{slug} anchor for inbound deep-links
 * from the trick dictionary, history page, and external surfaces
 * (anchor-preservation forever-rule).
 *
 * Reversibility: TypeScript content module. No DB schema change.
 *
 * Layer contract:
 *   - Canonical fields (formula / anchor / descendants) are doctrine.
 *   - Observational notes (network observations) sit under collapsed
 *     [observational] panels.
 *   - The reader scanning the page sees only canonical material unless
 *     they opt in to the deeper panels.
 */

export type GlossaryFamilyCardKind = 'root-terminal' | 'branch';

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
  /** Type-chip text rendered next to the title. */
  kind:               GlossaryFamilyCardKind;
  /** Canonical compact-form formula (e.g. "CLIP > OP IN [DEX] > OP CLIP [XBD] [DEL]"). */
  canonicalFormula:   string;
  /** Numeric ADD of the family anchor; matches freestyle_tricks.adds. */
  familyAnchorAdds:   number;
  /** Common descendants (3-5 representative members of the family). */
  commonDescendants:  readonly string[];
  /** Sibling families (peer ontology anchors). */
  siblingFamilies:    readonly string[];
  /** Notable compounds: named tricks that compose from this family. */
  notableCompounds:   readonly string[];
  /** Optional [observational] panels surfacing network or topology notes. */
  observationalNotes: readonly GlossaryFamilyCardObservationalNote[];
}

// ─────────────────────────────────────────────────────────────────────────
// Root terminal-anchor family cards (the well-documented terminal families;
// the full first-class roster derives from freestylePublicFamilies.ts).
// ─────────────────────────────────────────────────────────────────────────

export const ROOT_TERMINAL_FAMILIES: readonly GlossaryFamilyCard[] = [
  {
    slug:              'whirl',
    displayName:       'Whirl',
    kind:              'root-terminal',
    canonicalFormula:  'CLIP > OP IN [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['blurry whirl', 'paradox whirl', 'gyro whirl', 'spinning whirl', 'symposium whirl'],
    siblingFamilies:   ['butterfly', 'osis', 'swirl', 'rev_whirl'],
    notableCompounds:  ['mobius', 'blur', 'stepping paradox whirl'],
    observationalNotes: [
      {
        title: 'Whirl as central attractor',
        body:  'Network analysis of 22 years of Sick3 sequences shows whirl as the central attractor of the freestyle trick network: sequences converge on it as a stable resolution point. Blurry whirl functions as the most common opening element; the transition blurry whirl → whirl is the most documented two-trick structure in the corpus.',
      },
    ],
  },
  {
    slug:              'butterfly',
    displayName:       'Butterfly',
    kind:              'root-terminal',
    canonicalFormula:  'SET > SAME OUT [DEX] > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['atomic butterfly', 'pixie butterfly', 'stepping butterfly', 'ducking butterfly'],
    siblingFamilies:   ['whirl', 'osis', 'mirage'],
    notableCompounds:  ['ripwalk', 'dimwalk', 'parkwalk'],
    observationalNotes: [],
  },
  {
    slug:              'mirage',
    displayName:       'Mirage',
    kind:              'root-terminal',
    canonicalFormula:  'SET > OP IN [DEX] > OP TOE [DEL]',
    familyAnchorAdds:  2,
    commonDescendants: ['paradox mirage', 'symposium mirage', 'atomic mirage', 'spinning mirage'],
    siblingFamilies:   ['illusion', 'butterfly', 'osis'],
    notableCompounds:  ['blur', 'smear', 'atomsmasher'],
    observationalNotes: [
      {
        title: 'Mirage / illusion symmetry',
        body:  'Mirage and illusion are reverse-direction siblings: mirage takes an opposite-in dex, illusion takes the mirror reverse. Both terminate on an opposite-foot toe delay. The pair is the canonical example of direction-variant family symmetry.',
      },
    ],
  },
  {
    slug:              'osis',
    displayName:       'Osis',
    kind:              'root-terminal',
    canonicalFormula:  'SET > (BACK or FRONT) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox osis', 'spinning osis', 'symposium osis', 'atomic osis'],
    siblingFamilies:   ['whirl', 'butterfly', 'swirl'],
    notableCompounds:  ['torque (≡ miraging osis)', 'blender (≡ whirling osis)'],
    observationalNotes: [],
  },
  {
    slug:              'illusion',
    displayName:       'Illusion',
    kind:              'root-terminal',
    canonicalFormula:  'SET > OP OUT [DEX] > OP TOE [DEL]',
    familyAnchorAdds:  2,
    commonDescendants: ['paradox illusion', 'spinning illusion', 'ducking illusion', 'atomic illusion'],
    siblingFamilies:   ['mirage', 'pickup', 'legover'],
    notableCompounds:  ['flail', 'blizzard', 'smudge'],
    observationalNotes: [
      {
        title: 'Mirror of mirage',
        body:  'Illusion is the out-to-in mirror of mirage: the bag follows the same path, the body the inverse. Both are leggy downtime dexes that finish on an opposite-foot toe delay.',
      },
    ],
  },
  {
    slug:              'legover',
    displayName:       'Legover',
    kind:              'root-terminal',
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
    kind:              'root-terminal',
    canonicalFormula:  'SET > OP IN [DEX] > SAME TOE [DEL]',
    familyAnchorAdds:  2,
    commonDescendants: ['double pickup', 'spinning pickup', 'ducking pickup', 'paste'],
    siblingFamilies:   ['mirage', 'illusion', 'legover'],
    notableCompounds:  ['omelette', 'paste', 'legeater'],
    observationalNotes: [
      {
        title: 'Upward-catching dex',
        body:  'Structurally distinct from mirage despite the same ADD: pickup scoops under the bag, introducing the upward-catching dex axis. It anchors paste, legeater, and the spinning / ducking pickup compounds.',
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Branch and lineage families. Each descends from a root via a chain reading;
// those above the first-class threshold are Family Parents (rendered as a branch
// under their root), those below are Minor Lineages. (kind = 'branch')
// ─────────────────────────────────────────────────────────────────────────

export const BRANCH_FAMILIES: readonly GlossaryFamilyCard[] = [
  {
    slug:              'swirl',
    displayName:       'Swirl',
    kind:              'branch',
    canonicalFormula:  'CLIP > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox swirl', 'hop over swirl', 'butterfly swirl'],
    siblingFamilies:   ['whirl', 'osis'],
    notableCompounds:  ['paradox whirling swirl', 'spyro gyro (≡ gyro butterfly swirl)'],
    observationalNotes: [],
  },
  {
    slug:              'rev_whirl',
    displayName:       'Rev Whirl',
    kind:              'branch',
    canonicalFormula:  'CLIP > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['hatchet', 'mullet', 'rev-up'],
    siblingFamilies:   ['whirl'],
    notableCompounds:  ['hatchet', 'mullet'],
    observationalNotes: [
      {
        title: 'Whirl ↔ rev-whirl mirror pair',
        body:  'Rev-whirl is the direction-mirror sibling of whirl: whirl uses an opposite-in dex, rev-whirl uses an opposite-out dex. The pair is the canonical sibling example: same structural anchor, mirror terminal mechanics.',
      },
    ],
  },
  {
    slug:              'torque',
    displayName:       'Torque',
    kind:              'branch',
    canonicalFormula:  'CLIP > OP IN [DEX] > (BACK) SPIN [BOD] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['paradox torque', 'spinning torque', 'blurry torque', 'gyro torque (≡ mobius)'],
    siblingFamilies:   ['blender', 'drifter'],
    notableCompounds:  ['mobius', 'fury', 'blurry torque'],
    observationalNotes: [
      {
        title: 'First-class branch of osis',
        body:  'Torque ≡ miraging osis under the symbolic-compression doctrine; the lineage is preserved on the torque trick-detail page as a chain reading. Torque is a Family Parent that descends from osis (it conserves the osis terminal), so it renders as a branch under osis while leading its own lineage.',
      },
    ],
  },
  {
    slug:              'blender',
    displayName:       'Blender',
    kind:              'branch',
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
    kind:              'branch',
    canonicalFormula:  'SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox drifter', 'high plains drifter', 'gyro drifter'],
    siblingFamilies:   ['torque', 'blender'],
    notableCompounds:  ['royale (≡ paradox reverse drifter)', 'vortex (≡ gyro drifter)'],
    observationalNotes: [
      {
        title: 'Family Parent from clipper',
        body:  'Drifter ≡ miraging clipper. The mirage operator transforms a clipper-set entry into the drifter terminal; this first-class lineage grows from the clipper-anchored set primitives.',
      },
    ],
  },
  {
    slug:              'barrage',
    displayName:       'Barrage',
    kind:              'branch',
    canonicalFormula:  'CLIP > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox barrage', 'pogo paradox barrage', 'symposium barrage'],
    siblingFamilies:   ['blur'],
    notableCompounds:  ['blurrage (≡ stepping paradox barrage)', 'baroque (≡ barraging osis)'],
    observationalNotes: [],
  },
  {
    slug:              'blur',
    displayName:       'Blur',
    kind:              'branch',
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
    kind:              'branch',
    canonicalFormula:  'SET > (no plant while) SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  5,
    commonDescendants: ['paradox phoenix', 'ducking phoenix'],
    siblingFamilies:   ['butterfly', 'osis'],
    notableCompounds:  ['ducking phoenix'],
    observationalNotes: [],
  },
  {
    slug:              'eclipse',
    displayName:       'Eclipse',
    kind:              'branch',
    canonicalFormula:  'SET > JUMP [BOD] > SAME/OP INSIDE [DEL] > OP OUT [DEX] > (land)',
    familyAnchorAdds:  3,
    commonDescendants: ['atomic eclipse', 'ducking eclipse', 'gyro eclipse', 'miraging eclipse'],
    siblingFamilies:   ['butterfly_swirl'],
    notableCompounds:  [],
    observationalNotes: [
      {
        title: 'Airborne hop-over',
        body:  'Eclipse lifts the held-delay leg-over chassis of hop-over off the ground: after a jump off the support leg, both the inside-foot held delay and the outward dex happen in flight. The jump is a body-bearing scored element, which is why eclipse reads as 3 ADD where its grounded hop-over cousin reads as 2.',
      },
    ],
  },
  {
    slug:              'dada_curve',
    displayName:       'Dada-Curve',
    kind:              'branch',
    canonicalFormula:  'SET >> OP IN [DEX] > (no plant while) OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['gyro dada-curve', 'pixie dada-curve'],
    siblingFamilies:   ['butterfly', 'paradon'],
    notableCompounds:  [],
    observationalNotes: [
      {
        title: 'Miraging far symposium butterfly',
        body:  'Dada-Curve carries a committed equivalence: it reads as a miraging far symposium butterfly, a butterfly-family branch stacking the miraging, far, and symposium operators on a no-plant-while chassis that closes on an opposite cross-body clipper.',
      },
    ],
  },
  {
    slug:              'barfly',
    displayName:       'Barfly',
    kind:              'branch',
    canonicalFormula:  'CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]',
    familyAnchorAdds:  4,
    commonDescendants: ['gyro barfly', 'pixie barfly', 'spinning barfly', 'stepping barfly'],
    siblingFamilies:   ['butterfly', 'dada_curve'],
    notableCompounds:  ['blurriest', 'superfly'],
    observationalNotes: [
      {
        title: 'Double-infinity compound',
        body:  'Barfly is a 4-ADD double-infinity compound: two same-side outward dex cycles run between a clipper entry and an opposite cross-body clipper terminal. It anchors the blurry superlative blurriest, which stacks a third dex onto the same chassis.',
      },
    ],
  },
  {
    slug:              'dyno',
    displayName:       'Dyno',
    kind:              'branch',
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
    kind:              'branch',
    canonicalFormula:  'TOE > OP OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['fairy paradon', 'pixie paradon', 'symposium paradon'],
    siblingFamilies:   ['double_over_down', 'dada_curve'],
    notableCompounds:  ['dolomite'],
    observationalNotes: [
      {
        title: 'Toe-set double out-dex',
        body:  'Paradon is a 4-ADD toe-set branch: an opposite-out dex, then a same-side out dex, closing on an opposite cross-body clipper. It sits beside double-over-down, which repeats the opposite-out dex instead of switching to same-side, and feeds named descendants including symposium paradon (folk-named Dolomite).',
      },
    ],
  },
  {
    slug:              'double_over_down',
    displayName:       'Double-Over-Down',
    kind:              'branch',
    canonicalFormula:  'TOE > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['down diver', 'gyro double-over-down', 'pixie double-over-down'],
    siblingFamilies:   ['legover', 'paradon'],
    notableCompounds:  ['down diver'],
    observationalNotes: [
      {
        title: 'Name is the structure',
        body:  'Double-Over-Down is named for what it does: two opposite-out dexes (the double over) come down onto an opposite cross-body clipper (the down), all from a toe set, for 4 ADD. It sits beside paradon, which switches the second dex to same-side, and beside the legover family; its deepest named descendant is the down diver.',
      },
    ],
  },
  {
    slug:              'flurry',
    displayName:       'Flurry',
    kind:              'branch',
    canonicalFormula:  'CLIP > OP IN [DEX] > SAME IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['flurricane', 'gyro flurry', 'paradox flurry'],
    siblingFamilies:   ['legover', 'eggbeater', 'double_leg_over'],
    notableCompounds:  ['flurricane'],
    observationalNotes: [
      {
        title: 'Flurry\'s barraging-legover lineage',
        body:  'Flurry is the barraging-legover counterpart to eggbeater (the atomic legover): both are legover-family branches named by the set operator that builds them, conserving the legover toe-catch terminal.',
      },
    ],
  },
  {
    slug:              'flail',
    displayName:       'Flail',
    kind:              'branch',
    canonicalFormula:  'SET > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['atomic flail', 'fairy flail', 'gyro flail', 'paradox flail'],
    siblingFamilies:   ['mirage', 'legover'],
    notableCompounds:  [],
    observationalNotes: [
      {
        title: 'Branch of illusion',
        body:  'Flail ≡ symposium illusion: the symposium (no-plant) operator on the illusion terminal, conserving illusion\'s opposite-foot toe delay.',
      },
    ],
  },
  {
    slug:              'butterfly_swirl',
    displayName:       'Butterfly-Swirl',
    kind:              'branch',
    canonicalFormula:  'SET > SAME/OP OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['ducking butterfly-swirl', 'gyro butterfly-swirl', 'spinning butterfly-swirl'],
    siblingFamilies:   ['butterfly', 'eclipse'],
    notableCompounds:  [],
    observationalNotes: [
      {
        title: 'Butterfly-entry swirl',
        body:  'Butterfly-Swirl pairs a butterfly-style out-dex with the back-swirl terminal: a same/opposite out-dex precedes the back swirl, which catches on a same-side cross-body clipper. It leads its own branch (gyro / spinning / ducking butterfly-swirl) off the swirl anchor.',
      },
    ],
  },
  {
    slug:              'double_leg_over',
    displayName:       'Double Legover',
    kind:              'branch',
    canonicalFormula:  'SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox double-leg-over', 'pixie double-leg-over', 'fairy double-leg-over'],
    siblingFamilies:   ['eggbeater', 'legover'],
    notableCompounds:  ['smog', 'haze', 'predator'],
    observationalNotes: [
      {
        title: 'First-class branch of legover',
        body:  'A two-dex legover variant: the leg passes over twice before the toe catch. A Family Parent that descends from legover, rendered as a branch while leading its own lineage.',
      },
    ],
  },
  {
    slug:              'eggbeater',
    displayName:       'Eggbeater',
    kind:              'branch',
    canonicalFormula:  'TOE >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox eggbeater', 'gyro eggbeater', 'quantum eggbeater'],
    siblingFamilies:   ['double_leg_over', 'legover'],
    notableCompounds:  ['bedwetter'],
    observationalNotes: [
      {
        title: 'First-class branch of legover',
        body:  'A double out-dex legover variant. Like double-leg-over, a Family Parent that descends from legover, rendered as a branch while leading its own lineage.',
      },
    ],
  },
  {
    slug:              'inside_stall',
    displayName:       'Inside Stall',
    kind:              'branch',
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

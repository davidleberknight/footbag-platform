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
    siblingFamilies:   ['butterfly', 'osis', 'swirl', 'rev-whirl'],
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
// Descendant lineages & child sub-families. Each descends from a parent
// via a chain reading; some fold under the parent as a sub-family, others
// stand as productive descendant lineages. (kind = 'branch')
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
    slug:              'rev-whirl',
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
        body:  'Rev-whirl is the direction-mirror sibling of whirl: whirl uses an opposite-in dex, rev-whirl uses an opposite-out dex. The pair is the canonical sibling example — same structural anchor, mirror terminal mechanics.',
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
        title: 'Sub-family of osis',
        body:  'Torque ≡ miraging osis under the symbolic-compression doctrine; the lineage is preserved on the torque trick-detail page as a chain reading. Torque folds under osis as a sub-family while remaining a productive lineage in its own right.',
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
        title: 'Sub-family of osis',
        body:  'Blender ≡ whirling osis. Same pattern as torque: a sub-family that folds under osis via a chain reading while staying productive in its own right. The whirling operator adds the back-spin component.',
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
        title: 'Descendant lineage from clipper',
        body:  'Drifter ≡ miraging clipper. The mirage operator transforms a clipper-set entry into the drifter terminal; this productive descendant lineage grows from the clipper-anchored set primitives.',
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
];

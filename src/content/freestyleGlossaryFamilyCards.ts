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

/** One variant cell of a family: its display name and what selects it, in plain words. */
export interface FamilyTeachingVariant {
  name:  string;
  entry: string;
}

/**
 * Reader-facing teaching content for a family page, the reusable contract every
 * family fills in (Down is the first fully-authored exemplar). A family that
 * supplies a teaching block renders the model teaching flow: the hook, what the
 * move is in plain words, why the family matters, how the variants relate and
 * the ruling behind them, a reusable way to think about it, misconceptions, the
 * famous compounds it shows up in, a formal-notation reference, and a memorable
 * takeaway. A family without one renders the compact projection unchanged.
 * Rendered on a public freestyle surface, so the prose carries no individual
 * names, no outside-source names, and no em dashes.
 */
export interface FamilyTeaching {
  /** The "why should I care" hook; also the hero subtitle. */
  hook:                string;
  /** What a watcher SEES, in plain words; never a notation or dex translation. */
  physicalDescription: string;
  /** Why the family matters: the "unrelated tricks become one idea" breakthrough. */
  importance:          string;
  /** One framing line for the variant grid. */
  variantsIntro:       string;
  /** The variant cells: display name plus what selects each. */
  variants:            readonly FamilyTeachingVariant[];
  /** The ruling that makes the variants one family. */
  variantsRuling:      string;
  /** How to recognize one while watching, distinct from how to perform it. */
  howToRecognize:      readonly string[];
  /** The reusable "strip the operators, then name the base" thinking tool. */
  howToThink:          string;
  /** Common misconceptions, each a full sentence. */
  misconceptions:      readonly string[];
  /** Famous compounds that build on the family (trick slugs; dead links are dropped at shape time). */
  seeItIn:             readonly string[];
  /** One framing sentence before the formal-notation reference block. */
  notationIntro:       string;
  /** The one-sentence memorable takeaway that closes the page. */
  takeaway:            string;
  /**
   * One-line plain-language reading of the canonical formula. Present on the
   * formula-first pages: rendered directly under the dominant formula so a
   * reader who cannot parse the notation still gets the move in a sentence.
   */
  plainLanguageReading?: string;
  /**
   * Structural signature: what the family conserves across every member, what
   * may vary, and its nearest neighbors. Replaces the generic "structural model"
   * boilerplate with the exact invariant. When present, the page renders the
   * Structural signature block instead of the variant-intro prose.
   */
  structuralSignature?: {
    /** The one thing every member keeps (the conserved structure + terminal). */
    conserved:        string;
    /** What members are free to vary (sets, operators, preceding movements). */
    mayChange:        string;
    /** The adjacent families and the single axis that separates each. */
    nearestNeighbors: string;
  };
  /**
   * One restrained Atlas-derived relationship: a couple of comparison lines plus
   * a one-line insight naming the axis that draws the family boundary. Rendered
   * as its own compact block; omit when no single comparison genuinely clarifies.
   */
  atlasRelationship?: {
    lines: readonly string[];
    note:  string;
  };
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
  /** Optional reader-facing teaching content; drives the model family-page flow. */
  teaching?:          FamilyTeaching;
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
    canonicalFormula:  'SET > OP IN [DEX] > OP CLIP [XBD] [DEL]',
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
    teaching: {
      hook: 'Whirl became the trick freestyle is built around, because it ends exactly where it begins and lets a combo keep going.',
      physicalDescription:
        'The base whirl circles the leg around the bag, over the top, and lands cross-body on a clipper. It can be entered from a clipper or a toe delay. It is one of the first rotational moves a player owns, and one they never stop using. The whirl family extends that clipper ending through different entries, sets, and modifiers, so not every whirl-family trick starts from a clipper.',
      importance:
        'Whirl became the hub because it starts and ends in the same position, a clipper: you can enter it from almost anything that lands in a clipper and leave it into almost anything that starts from one. That points at something larger about advanced freestyle. Many tricks are valuable not simply because they are hard, but because they leave the player in a position where the next trick is possible. Whirl became central because it returns the player to one of the most reusable positions in the sport, which is a large part of why the clipper became the language advanced freestyle is built on.',
      variantsIntro:
        'Paradox whirl, gyro whirl, spinning whirl, and symposium whirl each add one operator on the way in to the same underlying whirl.',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'From a clipper, back to a clipper.',
        'One circling dex in between.',
        'The bag comes over the top and returns.',
        'Strip the operators and a plain whirl is what remains.',
      ],
      howToThink:
        'Treat whirl as the return point. It became the center of freestyle because it loops back to where it started, so when a combo needs to keep going it often passes through a whirl. Learning it, you start to see the shape of how combos connect.',
      misconceptions: [
        'Whirl is common, but common does not mean basic: it is the hub the rest of the vocabulary connects through.',
        'A whirl is not defined by what comes before it; many combos end in the same whirl.',
        'The harder whirl-family tricks are not separate from whirl; they are a whirl with an operator added.',
      ],
      seeItIn: ['blurry_whirl', 'paradox_whirl', 'gyro_whirl', 'spinning_whirl', 'symposium_whirl'],
      notationIntro:
        'For readers interested in the formal notation, a whirl runs from a clipper through one circling dex back to a clipper: CLIP > OP IN [DEX] > OP CLIP [XBD] [DEL] (3 ADD).',
      takeaway:
        'Whirl is the trick freestyle organized itself around, because it always returns you to where the next move can begin.',
    },
  },
  {
    slug:              'butterfly',
    displayName:       'Butterfly',
    kind:              'root-terminal',
    canonicalFormula:  'SET > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['atomic butterfly', 'pixie butterfly', 'stepping butterfly', 'ducking butterfly'],
    siblingFamilies:   ['whirl', 'osis', 'mirage'],
    notableCompounds:  ['ripwalk', 'dimwalk', 'parkwalk'],
    observationalNotes: [],
    teaching: {
      hook: 'Butterfly is where freestyle starts to feel like freestyle: the trick where players stop stringing together isolated moves and start linking movement.',
      physicalDescription:
        'A Butterfly is a wing-like outward sweep of the foot across the body to a cross-body clipper catch. The base Butterfly is the far/opposite-side form; Butterfly Same Side is the named same-side variant. For many players, Butterfly is the first trick that feels less like an isolated move and more like connected freestyle.',
      importance:
        'Butterfly matters less for its mechanics than for what it changes in a player. Learning Butterfly is often the moment freestyle stops feeling like individual tricks and starts feeling like continuous movement, which is why players often call it the beginning of real freestyle.',
      variantsIntro:
        'Butterfly is a single outward dex swept across the body into a clipper catch. The public dictionary treats Butterfly as the far/opposite-side form by default; Butterfly Same Side is the named same-side variant. It is a foundation rather than a combination: the atom the walking family is built on.',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'A single outward dex swept across the body.',
        'It lands on a cross-body clipper.',
        'The base Butterfly is the far/opposite-side form; Butterfly Same Side names the same-side variant.',
        'If you see one outward sweep flowing into a cross-body clipper, a butterfly is at the core.',
      ],
      howToThink:
        'Think of Butterfly as a foundation, not a finish line. Everything harder is more of the same: atoms linked into runs, operators layered on, more flow held together.',
      misconceptions: [
        'Butterfly is not important for being flashy; it is important for teaching you to flow.',
        'A butterfly is a single atom, not a combination of two separate tricks.',
        'Getting a butterfly is not the finish line; it is the start of thinking in combinations.',
      ],
      seeItIn: ['atomic_butterfly', 'ducking_butterfly', 'stepping_butterfly'],
      notationIntro:
        'For readers interested in the formal notation, the base Butterfly is the far/opposite-side form: SET > OP OUT [DEX] > OP CLIP [XBD] [DEL] (3 ADD). Butterfly Same Side names the same-side variant. Older or compressed notation may describe the wider butterfly shape, but the public dictionary treats Butterfly as far by default.',
      takeaway:
        'Butterfly is where freestyle stops being a list of tricks you can do and starts being movement you can link together.',
    },
  },
  {
    slug:              'down',
    displayName:       'Down',
    kind:              'root-terminal',
    // Representative chassis: the double-over-down cell. The family's four
    // variants share the two-outward-dex motif; the set and the performing
    // foot select the variant.
    canonicalFormula:  'TOE > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['fusion', 'scorpions tail', 'superfly', 'dolomite', 'nemesis'],
    siblingFamilies:   ['barfly', 'double_over_down', 'paradon', 'down_double_down'],
    notableCompounds:  ['shooting star', 'venom', 'blurriest', 'cold fusion'],
    // The one-family ruling now leads the reader-facing teaching flow rather
    // than sitting in a collapsed observational panel.
    observationalNotes: [],
    teaching: {
      hook: 'Barfly, Double-Over-Down, Paradon, and Down-Double-Down look like four different tricks. They are not.',
      physicalDescription:
        'A down is a finishing movement. After two circling dexterities, the bag is brought down and controlled on a clipper stall. The family is named for that distinctive ending, not for the way the trick begins.',
      importance:
        'The realization is bigger than one ending with four entrances: what once looked like four unrelated tricks suddenly becomes one idea. Seeing that Barfly and Paradon share an ending is the kind of breakthrough that reorganizes how you watch the sport, and the compounds built on the family stop looking like unrelated advanced moves.',
      variantsIntro:
        'The four variants are the cells of a simple grid: one axis is the set the move launches from, the other is which leg performs the circling.',
      variants: [
        { name: 'Double-Over-Down', entry: 'Toe set, setting-side leg' },
        { name: 'Paradon',          entry: 'Toe set, other leg' },
        { name: 'Barfly',           entry: 'Clipper set, setting-side leg' },
        { name: 'Down-Double-Down', entry: 'Clipper set, other leg' },
      ],
      variantsRuling:
        'This is not a loose resemblance. By expert ruling the downs are a single structural decomposition, essentially the same move performed from different sets and from different feet. Each cell is its own documented four-ADD base and keeps its own browsable section below, but they are one family.',
      howToRecognize: [
        'Look for the double dex: the leg circles the bag twice.',
        'Watch the finish, not the entry. The bag is brought down onto a clipper.',
        'Ignore the set. It selects the variant, not the family.',
        'Identify which leg performs the dexes to name the exact variant.',
      ],
      howToThink:
        'Strip away the set and the entry operators first, then ask which Down you are looking at. That habit (strip the operators, name the base) is a thinking tool that works across the whole encyclopedia, not just here.',
      misconceptions: [
        'The family is named for how the trick finishes, not how it starts. That is the lesson the four separate names hide.',
        'They are not four different tricks. The names mark the entrance, not four separate skills.',
        'Double-Over-Down and Down-Double-Down are not the same move. They sit in different cells of the grid, use a different foot, and Down-Double-Down launches from a clipper set. The abbreviations look alike; the moves do not.',
        '"Double down" is the generic motif, not a base. Every real down is one of the four named cells.',
      ],
      seeItIn: ['fusion', 'nemesis', 'superfly', 'dolomite'],
      notationIntro:
        'For readers interested in the formal notation, the movement below uses Double-Over-Down as the representative example. The other three variants preserve the same terminal movement while changing the set and which leg performs the dexterities.',
      takeaway:
        'Once you recognize the Down ending, you will stop seeing four different tricks and start seeing one family.',
    },
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
    teaching: {
      hook: 'If you learn one dexterity first, it should be Mirage: the simplest complete dexterity movement, and the idea much of freestyle is built from.',
      physicalDescription:
        'A Mirage is the simplest complete dexterity movement. One leg circles the bag once before it is caught on a toe stall. That is the whole trick, which is why it is usually the first dexterity a player learns.',
      importance:
        'Much of freestyle grows from Mirage. Once you understand it, a large part of the harder material becomes combinations or modifications of the same idea: add an operator, change the surface, or stack it, and you have dozens of tricks that all rest on the mirage you already know.',
      variantsIntro:
        'Mirage is the basic dexterity that much of freestyle grows from. Once you understand it, many more complex tricks become combinations or modifications of the same idea rather than separate skills.',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'One leg circles the bag.',
        'One toe catch.',
        'No extra dexterities.',
        'Remove the modifiers and Mirage is what is left.',
      ],
      howToThink:
        'Naming the mirage underneath a trick is usually most of the work. Use Mirage as your reference point: when a trick looks hard, ask what was done to a mirage to get there, which operator, which surface, or which addition.',
      misconceptions: [
        'Mirage is not just a beginner trick; experienced players build on it constantly.',
        'A mirage is not defined by the set that launches it; the set can change while the mirage stays the same.',
        'Learning fancier tricks does not leave Mirage behind, since those tricks are usually a Mirage with something added.',
      ],
      seeItIn: ['paradox_mirage', 'symposium_mirage', 'spinning_mirage'],
      notationIntro:
        'For readers interested in the formal notation, a mirage is a single dexterity caught on a toe stall: SET > OP IN [DEX] > OP TOE [DEL] (2 ADD). The one dex is the pass around the bag; the toe stall is the catch.',
      takeaway:
        'Once you can recognize the Mirage inside more advanced tricks, freestyle begins to look like one connected system instead of hundreds of unrelated names.',
    },
  },
  {
    slug:              'osis',
    displayName:       'Osis',
    kind:              'root-terminal',
    canonicalFormula:  'SET > (back or front) SPIN [BOD] > SAME/OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox osis', 'spinning osis', 'symposium osis', 'atomic osis'],
    siblingFamilies:   ['whirl', 'butterfly', 'swirl'],
    notableCompounds:  ['torque (≡ quantum osis)', 'blender (≡ whirling osis)'],
    observationalNotes: [],
    teaching: {
      hook: 'Everyone keeps talking about Osis because so much of the advanced vocabulary grows out of it.',
      physicalDescription:
        'Osis is a terminal movement: a spin that resolves into a clipper stall. It is defined by that ending, not by the way the player enters it.',
      importance:
        'Osis is one of the most generative bases in freestyle. It began as a single terminal movement and became a family: add a dexterity on the way in and you get Torque or Blender, and from there Mobius, Spender, Paradox Torque, and many more grow out of the same ending.',
      variantsIntro:
        'Osis is a destination. Advanced tricks that end in an osis are best understood by asking what was added before the osis, rather than treating each trick as unrelated.',
      variants: [],
      variantsRuling:
        'Torque is an osis reached by adding a quantum dex on the way in; Blender, a whirling dex. That shared ending underneath a whole branch is why osis is called a base.',
      howToRecognize: [
        'The spin.',
        'The clipper finish.',
        'Ignore how the trick started.',
        'If removing the modifiers leaves an osis ending, you have identified the base.',
      ],
      howToThink:
        'Think of osis as an ending you arrive at, not a trick you perform one way. When you meet Torque, Blender, or Mobius, ask what got added on the way into the osis. Naming the osis ending first, then the addition, keeps the whole branch organized.',
      misconceptions: [
        'Osis is defined by its terminal movement, not by a particular entry or teaching progression.',
        'The clipper entry some players learn first is one way in, not the definition.',
        'Torque and Blender are not separate from osis; they are osis with a dexterity added.',
      ],
      seeItIn: ['torque', 'blender', 'mobius', 'spender', 'paradox_torque'],
      notationIntro:
        'For readers interested in the formal notation, an osis is a spin into a clipper. In many tricks that clipper is reached across the body. The notation leaves both the spin direction and the catch side open, because they vary and the catch side has not been ruled; what is fixed is the spin resolving into the clipper.',
      takeaway:
        'Once you recognize an osis ending, you will begin recognizing an entire branch of advanced freestyle.',
    },
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
        body:  'Illusion is the out-to-in mirror of mirage: the bag follows the same path, the body the inverse. Both are leggy dexes that finish on an opposite-foot toe delay.',
      },
    ],
    teaching: {
      hook: 'Illusion is the Mirage run the other way, and the pair is where you learn that in freestyle a direction is not a detail: it is a different trick.',
      physicalDescription:
        'An Illusion is a single dexterity caught on a toe stall, like a Mirage, but the leg circles the bag in the opposite direction. The bag can trace nearly the same path while the body does the inverse of what it does in a Mirage. It is one dex and one catch, reversed.',
      importance:
        'The Mirage and Illusion pair is the clearest lesson in one of the sport\'s core habits: reversing the direction of a move does not give you a variation of the same trick, it gives you a new one. Much of the vocabulary doubles this way, the same movement kept and its direction flipped, and once you have felt how different an Illusion is from a Mirage you start to expect the reversed half of everything you learn to be its own skill with its own name.',
      variantsIntro:
        'Paradox illusion, spinning illusion, and ducking illusion each add one operator on the way in to the same underlying illusion, the reversed-dex twin of the mirage.',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'One leg circles the bag.',
        'One toe catch, like a Mirage.',
        'But the circle runs the opposite way.',
        'Strip the operators and a plain illusion is what remains.',
      ],
      howToThink:
        'Use the Mirage and Illusion pair as your reference for direction. When a single dex looks like a Mirage but reads backwards, that is an Illusion, and naming it that way, rather than calling it a strange Mirage, is what keeps the reversed half of the vocabulary organized.',
      misconceptions: [
        'Illusion is not a harder Mirage; it is the same one-dex shape circled the other way.',
        'A direction is not a qualifier on a Mirage; the reversed direction is what makes Illusion its own trick.',
        'Learning the Mirage does not cover the Illusion, even though the frame is shared, because the reversed direction is its own skill.',
      ],
      seeItIn: ['paradox_illusion', 'spinning_illusion', 'ducking_illusion', 'atomic_illusion'],
      notationIntro:
        'For readers interested in the formal notation, an illusion is a single dexterity caught on a toe stall: SET > OP OUT [DEX] > OP TOE [DEL] (2 ADD). It differs from the mirage only in the direction of that one dex.',
      takeaway:
        'Illusion is the Mirage run the other way, and the pair is where freestyle teaches you that a reversed movement is a new trick, not a variation of the old one.',
    },
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
    teaching: {
      hook: 'Legover is where the leg-over motion enters freestyle, the leg passing over the bag, and a whole lineage of tricks grows from it.',
      physicalDescription:
        'A Legover is one outward dexterity followed by a same-side toe stall. Its closest directional neighbor is Illusion: both use an outward dex, but Illusion finishes on the opposite toe. The catch side, not simply the impression of a leg passing over the bag, is what distinguishes the two structurally.',
      importance:
        'Legover occupies one of the four basic single-dex toe positions created by combining dex direction with catch side. It shares its outward direction with Illusion and its same-side catch with Pickup, so three apparently separate tricks become neighboring cells of one movement system. Legover also provides the terminal movement inside more complicated tricks: Double Legover adds an inward dex before it, Eggbeater reaches it through an atomic set, and Flurry places a larger dex sequence in front of the same outward-dex-to-toe resolution.',
      variantsIntro: '',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'The leg passes over the top of the bag.',
        'One dex, caught on the same-side toe.',
        'The same leg that circles is the one that catches.',
        'Strip the operators and a plain legover is what remains.',
      ],
      howToThink:
        'Name the legover underneath first. When a trick sends the leg over the bag to a same-foot catch, treat it as a legover with something added, then name the addition. That keeps the eggbeater, the double-leg-over, and the flurry organized as one lineage instead of three separate skills.',
      misconceptions: [
        'Legover is not defined by the set that launches it; the set can change while the legover stays the same.',
        'The eggbeater is not a separate trick from legover; it is the legover in its atomic form.',
        'Legover is close to the illusion in shape, but the catching foot is different, and that difference is what makes it its own trick.',
      ],
      seeItIn: ['eggbeater', 'double_leg_over', 'flurry', 'spinning_legover'],
      notationIntro:
        'For readers interested in the formal notation, a legover is a single dexterity caught on the same-side toe stall: SET > OP OUT [DEX] > SAME TOE [DEL] (2 ADD). The same-side toe catch is what separates it from the illusion, which catches on the opposite foot.',
      takeaway:
        'Legover is where the leg-over motion enters the vocabulary, and recognizing it is what turns a branch of advanced freestyle into one lineage you can read.',
      plainLanguageReading: 'One outward dexterity, ending on the same-side toe.',
      structuralSignature: {
        conserved:        'An outward dexterity resolving to a same-side toe stall.',
        mayChange:        'The set, the body operator, and the movements preceding the terminal dex.',
        nearestNeighbors: 'Pickup changes the dex direction; Illusion changes the catch side.',
      },
      atlasRelationship: {
        lines: [
          'Legover: OP OUT to SAME TOE',
          'Illusion: OP OUT to OP TOE',
          'Pickup: OP IN to SAME TOE',
        ],
        note: 'The four single-dex toe tricks are the combinations of dex direction and catch side.',
      },
    },
  },
  {
    slug:              'pickup',
    displayName:       'Pickup',
    kind:              'root-terminal',
    canonicalFormula:  'SET > OP IN [DEX] > SAME TOE [DEL]',
    familyAnchorAdds:  2,
    commonDescendants: ['double pickup', 'spinning pickup', 'ducking pickup', 'paste'],
    siblingFamilies:   ['mirage', 'illusion', 'legover'],
    notableCompounds:  ['scrambled eggbeater', 'paste', 'legeater'],
    observationalNotes: [
      {
        title: 'Upward-catching dex',
        body:  'Structurally distinct from mirage despite the same ADD: pickup scoops under the bag, introducing the upward-catching dex axis. It anchors paste, legeater, and the spinning / ducking pickup compounds.',
      },
    ],
    teaching: {
      hook: 'Pickup is the dexterity that scoops under the bag instead of circling over the top, and it opens an axis of freestyle the mirage does not.',
      physicalDescription:
        'A Pickup is one inward dexterity followed by a same-side toe stall. Players often experience it as scooping beneath the bag, but its structural identity is the combination of inward dex direction and same-side catch. Mirage uses the same inward dexterity but finishes on the opposite toe, and that single catch-side change is the cleanest distinction between the two.',
      importance:
        'Pickup completes the same-side half of the basic toe-dex grid. Legover reaches the same toe through an outward dex; Pickup reaches it through an inward dex, which makes Pickup part of a larger movement relationship rather than an isolated scooping trick. The family grows by placing sets and operators before that inward-dex-to-same-toe terminal. Paste is Pixie Pickup, Legeater extends the dex sequence, and Scrambled Eggbeater is the atomic form of Pickup. Omelette belongs to the Illusion line, not the Pickup line.',
      variantsIntro: '',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'The leg scoops under the bag and lifts it.',
        'One dex, caught on the same-side toe.',
        'It carries a mirage\'s ADD but not a mirage\'s motion.',
        'Strip the operators and a plain pickup is what remains.',
      ],
      howToThink:
        'When a single dex reads like a mirage but the bag is lifted from below rather than circled over the top, name it a pickup. Naming the pickup underneath first, then the addition, keeps the scrambled eggbeater, paste, and legeater organized as one scooping lineage.',
      misconceptions: [
        'Pickup is not a mirage variant; it carries the same ADD but scoops under the bag rather than circling over it, which makes it a separate trick.',
        'The scrambled eggbeater is the pickup in its atomic form; the omelette, despite the egg naming, is the atomic illusion and belongs to the illusion line.',
        'Pickup is not defined by the set that launches it; the set can change while the pickup stays the same.',
      ],
      seeItIn: ['scrambled_eggbeater', 'paste', 'spinning_pickup', 'ducking_pickup', 'double_pickup'],
      notationIntro:
        'For readers interested in the formal notation, a pickup is a single inward dexterity caught on the same-side toe stall: SET > OP IN [DEX] > SAME TOE [DEL] (2 ADD). The scoop from below is the movement the notation does not spell out; the catch is the same-side toe.',
      takeaway:
        'Pickup is the scoop-from-below dexterity, and recognizing it opens a branch of freestyle the mirage never reaches.',
      plainLanguageReading: 'One inward dexterity, ending on the same-side toe.',
      structuralSignature: {
        conserved:        'An inward dexterity resolving to a same-side toe stall.',
        mayChange:        'The set, the body operator, and the preceding dex sequence.',
        nearestNeighbors: 'Mirage changes the catch side; Legover changes the dex direction.',
      },
      atlasRelationship: {
        lines: [
          'Pickup: OP IN to SAME TOE',
          'Mirage: OP IN to OP TOE',
          'Legover: OP OUT to SAME TOE',
        ],
        note: 'Mirage changes the catch side; Legover changes the dex direction.',
      },
    },
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
    canonicalFormula:  'SET > SAME OUT [DEX] > SAME CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox swirl', 'hop over swirl', 'butterfly swirl'],
    siblingFamilies:   ['whirl', 'osis'],
    notableCompounds:  ['paradox whirling swirl', 'spyro gyro (≡ gyro butterfly swirl)'],
    observationalNotes: [],
    teaching: {
      hook: 'Swirl is one cell of the clipper-terminal matrix: the same-side leg circles outward and the bag lands on a same-side clipper.',
      physicalDescription:
        'In a swirl the same-side leg (the leg on the side the bag occupies) circles outward around the bag once, and the bag is caught on a same-side clipper. The entry is flexible: it can be set from a clipper, a toe delay, or a plain set; the clipper is the terminus, not the start. The swirl family extends that ending pattern through different entries, sets, and modifiers.',
      importance:
        'Swirl matters because it completes a structural family. Whirl, reverse whirl, swirl, and reverse swirl are the four cells of one clipper-terminal matrix: which leg performs the dexterity (opposite or same side) crossed with which way it circles (in or out). All four launch from a flexible set, all four land on a clipper, and all four score the same three ADD. Seeing the four together turns four separate trick names into one small system.',
      variantsIntro:
        'Swirl occupies the same-side, out-direction cell of the matrix. Like its three siblings it is a base others build on, so its family is swirl with an operator added.',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'The dexterity is performed by the same-side leg, not the opposite leg.',
        'The leg circles outward around the bag.',
        'The catch is a same-side clipper.',
        'Opposite leg circling instead? That is a whirl or reverse whirl. Same leg circling inward? That is a reverse swirl.',
      ],
      howToThink:
        'Hold the four clipper-terminal siblings as one grid: whirl (opposite leg, in), reverse whirl (opposite leg, out), swirl (same leg, out), reverse swirl (same leg, in). Two choices, leg and direction, generate all four. Thinking in cells rather than in isolated names is the start of seeing freestyle as a system you can extend, not just a set of tricks to memorize.',
      misconceptions: [
        'Swirl is not a whirl run backward; the two differ in which leg performs the dexterity, not just its direction.',
        'A swirl is not defined by its entry; the same-side out dexterity into a clipper is what makes it a swirl.',
        'Learning the whirl does not cover the swirl; the same-side dexterity is its own skill.',
      ],
      seeItIn: ['butterfly_swirl', 'spinning_swirl', 'symposium_swirl'],
      notationIntro:
        'For readers interested in the formal notation, a swirl is a same-side out dex into a same-side clipper: SET > SAME OUT [DEX] > SAME CLIP [XBD] [DEL] (3 ADD). Its three matrix siblings differ only in the leg and direction tokens: whirl is SET > OP IN [DEX] > OP CLIP [XBD] [DEL], reverse whirl is SET > OP OUT [DEX] > OP CLIP [XBD] [DEL], and reverse swirl is SET > SAME IN [DEX] > SAME CLIP [XBD] [DEL].',
      takeaway:
        'Swirl is the same-side, out-direction cell of the clipper-terminal matrix: four sibling tricks, one grid of leg times direction.',
    },
  },
  {
    slug:              'rev_whirl',
    displayName:       'Rev Whirl',
    kind:              'branch',
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
    kind:              'branch',
    canonicalFormula:  'CLIP > OP IN [DEX] > (BACK) SPIN [BOD] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['paradox torque', 'spinning torque', 'blurry torque', 'gyro torque (≡ mobius)'],
    siblingFamilies:   ['blender', 'drifter'],
    notableCompounds:  ['mobius', 'fury', 'blurry torque'],
    observationalNotes: [
      {
        title: 'First-class branch of osis',
        body:  'Torque ≡ quantum osis under the symbolic-compression doctrine; the lineage is preserved on the torque trick-detail page as a chain reading. Torque is a Family Parent that descends from osis (it conserves the osis terminal), so it renders as a branch under osis while leading its own lineage.',
      },
    ],
    teaching: {
      hook: 'Torque is an osis with a dexterity added in front, and it is the first doorway into the whole branch of tricks that end in an osis.',
      physicalDescription:
        'A Torque adds one circling dexterity before an osis. The trick still ends the way an osis ends, a spin resolving onto a clipper, but a dex comes first. That added dex, a mirage-style circle in, is the whole difference between a torque and a plain osis.',
      importance:
        'Torque is one of the first places you see the osis working as a base rather than a single trick. Mobius, fury, and the paradox and spinning torques all grow from the same osis ending with a dex in front. Once you can name the osis inside a torque, and then name the dex that was added, the branch stops being a list of hard tricks and becomes one ending you reach different ways.',
      variantsIntro:
        'Paradox torque, spinning torque, and blurry torque each add an operator to the same underlying torque, and its gyro form is the mobius.',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'An osis ending: a spin resolving onto a clipper.',
        'One circling dexterity before the spin.',
        'Strip the operators and a torque is what remains.',
        'A torque is an osis with a dex added in front.',
      ],
      howToThink:
        'Read torque as osis plus a dex. When you meet a mobius or a paradox torque, name the osis ending first, then the dex added to reach it, then the operator on top. Naming it in that order keeps the whole osis branch organized.',
      misconceptions: [
        'Torque is not separate from osis; it is an osis with a dexterity added on the way in.',
        'Mobius is not a new trick unrelated to torque; it is the torque in its gyro form.',
        'The harder torque-family tricks are not their own category; they are a torque with an operator added.',
      ],
      seeItIn: ['mobius', 'paradox_torque', 'spinning_torque', 'fury'],
      notationIntro:
        'For readers interested in the formal notation, a torque adds one dex before the osis spin: CLIP > OP IN [DEX] > (BACK) SPIN [BOD] > OP CLIP [XBD] [DEL] (4 ADD). The OP IN dex in front is the addition; the spin resolving onto the clipper is the osis underneath.',
      takeaway:
        'Torque is the osis with a dex in front, and recognizing it is how a whole branch of advanced freestyle opens up as one ending reached different ways.',
    },
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
    teaching: {
      hook: 'Blender is the torque\'s sibling: another osis reached by adding a dexterity in front, but a different dexterity, and the pair shows how one ending grows a whole branch.',
      physicalDescription:
        'A Blender adds one circling dexterity before an osis, like a torque, but the dex it adds is a whirl-style circle rather than a mirage-style one. The ending is the same osis, a spin onto a clipper; the dex in front is what tells a blender from a torque.',
      importance:
        'Blender sits beside torque as the other main way into the osis. Torque adds a quantum dex, blender a whirling one, and seeing them as a pair is the lesson: once freestyle has a base ending like the osis, the different dexes you can put in front of it generate an entire branch rather than a handful of separate tricks.',
      variantsIntro:
        'Paradox blender, spinning blender, and symposium blender each add an operator to the same underlying blender, and its blurry form is the food processor.',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'An osis ending: a spin resolving onto a clipper.',
        'A whirl-style dexterity in front, where a torque has a mirage-style one.',
        'Strip the operators and a blender is what remains.',
        'A blender is an osis with its own dex added in front.',
      ],
      howToThink:
        'Read torque and blender as the same idea with a different dex in front of the osis. When you meet one, name the osis ending first, then decide which dex was added to reach it. That single question separates the two branches cleanly.',
      misconceptions: [
        'Blender is not a harder torque; it is the same osis ending reached with a different dexterity in front.',
        'The food processor is not a new trick unrelated to blender; it is the blender in its blurry form.',
        'Blender is not separate from osis; it is an osis with a whirling dex added on the way in.',
      ],
      seeItIn: ['paradox_blender', 'spinning_blender', 'symposium_blender', 'food_processor'],
      notationIntro:
        'For readers interested in the formal notation, a blender adds one dex before the osis spin: SET > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL] (4 ADD). It shares the torque\'s shape; the dex it adds in front is what varies between them.',
      takeaway:
        'Blender is the osis reached with a whirling dex in front, the torque\'s twin, and together they show one ending growing an entire branch.',
    },
  },
  {
    slug:              'drifter',
    displayName:       'Drifter',
    kind:              'branch',
    canonicalFormula:  'SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox drifter', 'high plains drifter', 'gyro drifter'],
    siblingFamilies:   ['torque', 'blender'],
    notableCompounds:  ['vortex (≡ gyro drifter)', 'paradox drifter'],
    observationalNotes: [
      {
        title: 'Family Parent from clipper',
        body:  'Drifter is a clipper-anchored base: from the set it takes a single inward dex into a cross-body clipper (SET > OP IN [DEX] > SAME CLIP [XBD]). This first-class lineage grows from the clipper-anchored set primitives. The legacy "miraging clipper" name is descriptive mirage-family shorthand, not a scored decomposition.',
      },
    ],
    teaching: {
      hook: 'Drifter is a clipper reached by adding a dexterity in front, and it seeds a small branch of well-known tricks.',
      physicalDescription:
        'A Drifter is one inward dexterity followed by a same-side clipper stall. Its clearest structural neighbor is Pickup: both use the same inward dexterity and preserve the same-side relationship, but Pickup finishes on a toe while Drifter finishes on a cross-body clipper. That terminal-surface substitution explains Drifter more accurately than treating it as a whirl that begins somewhere else.',
      importance:
        'Drifter demonstrates how a familiar dexterity can seed a new lineage when its terminal surface changes. The inward dex stays recognizable, but moving the catch from toe to clipper introduces cross-body position and creates a base for several compounds. Vortex is Gyro Drifter, and Paradox Drifter adds the paradox relationship to the same chassis. Reverse Drifter is a neighboring lineage with the dex-and-terminal relationship reversed; Royale belongs to that reverse line as Paradox Reverse Drifter, not to the Drifter line.',
      variantsIntro: '',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'One inward circling dexterity.',
        'Caught on a clipper on the same side.',
        'One dex arriving on a clipper, not a full rotational loop.',
        'Strip the operators and a drifter is what remains.',
      ],
      howToThink:
        'Read drifter as a clipper reached with a dex in front. When you meet a royale or a vortex, name the drifter underneath first, then the operator that was added to reach it. That is usually most of the work of reading the trick.',
      misconceptions: [
        'Drifter is not a whirl; a whirl loops the leg all the way around to a clipper, while a drifter is one dex arriving on a clipper.',
        'Vortex is a gyro drifter, a drifter with an operator added; Royale is not a drifter descendant, it sits on the neighboring reverse-drifter line as a paradox reverse drifter.',
        'Drifter is not defined by the set that launches it; the set can change while the drifter stays the same.',
      ],
      seeItIn: ['vortex', 'paradox_drifter', 'high_plains_drifter'],
      notationIntro:
        'For readers interested in the formal notation, a drifter is one inward dexterity caught on a same-side clipper: SET > OP IN [DEX] > SAME CLIP [XBD] [DEL] (3 ADD). The single dex arriving on the clipper is what separates it from the whirl.',
      takeaway:
        'Drifter is a clipper reached with a dex in front, and naming it is how the vortex and its reverse-line neighbor royale stop looking like separate tricks.',
      plainLanguageReading: 'One inward dexterity, ending on the same-side clipper.',
      structuralSignature: {
        conserved:        'An inward dexterity resolving to a same-side clipper.',
        mayChange:        'The entry set, rotation, posture, and paradox relationship.',
        nearestNeighbors: 'Pickup preserves the dex and side relationship but changes the terminal from toe to clipper.',
      },
      atlasRelationship: {
        lines: [
          'Pickup: OP IN to SAME TOE',
          'Drifter: OP IN to SAME CLIP',
        ],
        note: 'The family boundary appears at the terminal surface.',
      },
    },
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
        title: 'A butterfly-family branch on a no-plant-while chassis',
        body:  'Dada-Curve is a butterfly-family branch on a no-plant-while chassis that closes on an opposite cross-body clipper. Its full compositional reading uses mirage-family (miraging) language, which is descriptive naming rather than a scored component, so no scored decomposition is stated here.',
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
    teaching: {
      hook: 'Barfly is one of the downs, and on its own it anchors a small family that stacks onto its double-dex shape.',
      physicalDescription:
        'A Barfly begins from a clipper, carries two outward dexterities through the setting-leg side, and resolves on the opposite clipper. The two dexes and the cross-body terminal form one continuous double-dex structure. Barfly is one member of the Down grid; it is not defined by an additional movement called the down occurring after the two dexes, because the Down identity belongs to the complete double-out-to-clipper topology.',
      importance:
        'Barfly reveals that several famous double-dex tricks differ through a small number of structural variables rather than unrelated movement inventions. Change the set surface or which leg performs the dexes and Barfly moves into a neighboring cell occupied by Double-Over-Down, Paradon, or Double-Down-Down. Its own descendants retain the Barfly chassis while adding sets and operators, including Gyro Barfly, Pixie Barfly, Stepping Barfly, Superfly, and Blurriest.',
      variantsIntro: '',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'Two circling dexterities of the same kind.',
        'The bag comes down onto a clipper across the body.',
        'It is the down that starts from a clipper.',
        'Strip the operators and a barfly is what remains.',
      ],
      howToThink:
        'Read barfly as a down first, then as a base. When you meet a spinning or stepping barfly, name the barfly underneath, then the operator on top. Holding the down reading and the base reading together is what keeps its family and the wider down family from looking like separate collections of tricks.',
      misconceptions: [
        'Barfly is not unrelated to the other downs; it shares their finishing movement.',
        'The blurriest is not a separate trick; it is a barfly with a third dex stacked on.',
        'Barfly is not defined only by its clipper entry; the down ending is what places it in the family.',
      ],
      seeItIn: ['blurriest', 'gyro_barfly', 'spinning_barfly', 'stepping_barfly'],
      notationIntro:
        'For readers interested in the formal notation, a barfly runs two same-side outward dexes into a cross-body clipper: CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD] (4 ADD). The two outward dexes are its signature; the cross-body clipper is the down ending. Its terminal brackets read [DEL] [XBD] rather than the usual [XBD] [DEL]; this reversed order is intentional and curator-preserved, and does not change the ADD value.',
      takeaway:
        'Barfly is one of the downs and a base of its own, and holding both readings is how a corner of the down branch comes together.',
      plainLanguageReading: 'Clipper set, two outward dexterities by the setting leg, opposite-side clipper catch.',
      structuralSignature: {
        conserved:        'A clipper set, a setting-leg double-out sequence, and an opposite clipper terminal.',
        mayChange:        'The preceding set and body operators.',
        nearestNeighbors: 'Double-Over-Down is the toe-set cell; Paradon and Double-Down-Down circle with the other leg.',
      },
      atlasRelationship: {
        lines: [
          'Toe set, setting leg: Double-Over-Down',
          'Toe set, other leg: Paradon',
          'Clipper set, setting leg: Barfly',
          'Clipper set, other leg: Double-Down-Down',
        ],
        note: 'Two variables, the set surface and which leg circles, place Barfly in the four-cell Down grid.',
      },
    },
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
        body:  'Paradon is a 4-ADD toe-set branch: two opposite-side out dexes circled by the other leg, closing on an opposite cross-body clipper. It sits beside double-over-down, which circles both dexes with the setting leg instead (two same-side out dexes), and feeds named descendants including symposium paradon (folk-named Dolomite).',
      },
    ],
  },
  {
    slug:              'double_over_down',
    displayName:       'Double-Over-Down',
    kind:              'branch',
    canonicalFormula:  'TOE > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  4,
    commonDescendants: ['down diver', 'gyro double-over-down', 'pixie double-over-down'],
    siblingFamilies:   ['legover', 'paradon'],
    notableCompounds:  ['down diver'],
    observationalNotes: [
      {
        title: 'Name is the structure',
        body:  'Double-Over-Down is named for what it does: two same-side out dexes (the double over), circled by the setting leg, come down onto an opposite cross-body clipper (the down), all from a toe set, for 4 ADD. It sits beside paradon, which circles with the other leg instead (two opposite-side out dexes), and beside the legover family; its deepest named descendant is the down diver.',
      },
    ],
    teaching: {
      hook: 'Double-Over-Down is the one down whose name is its structure: two dexterities over, and then the down.',
      physicalDescription:
        'A Double-Over-Down begins from a toe set, carries two outward dexterities through the setting-leg side, and resolves on the opposite clipper. Its name does not describe two overs followed by a separate third movement called down; the two dexes and the cross-body clipper resolution together form the Down structure.',
      importance:
        'Double-Over-Down is the clearest entrance to the Down grid. Two variables explain the four principal forms: the set may come from toe or clipper, and the two dexes may be performed by the setting leg or the other leg. This grid connects tricks that older descriptions often presented as unrelated names, and Double-Over-Down also anchors its own descendants, including Gyro Double-Over-Down, Pixie Double-Over-Down, and Down Diver.',
      variantsIntro: '',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'Two outward dexterities in a row, the double over.',
        'The bag then comes down onto a clipper across the body, the down.',
        'It launches from a toe set.',
        'Strip the operators and a double-over-down is what remains.',
      ],
      howToThink:
        'Use double-over-down as your key to the whole down family, because its name is its structure. When you meet a barfly or a paradon, look for the same down ending underneath, then notice what each one changes to reach it: the set it starts from, or the leg that circles.',
      misconceptions: [
        'Double-Over-Down is not unrelated to barfly and paradon; the three share the down ending its name describes.',
        'The down diver is not a separate trick; it is a double-over-down carried a step deeper.',
        'The name is not decoration; the double over and the down are exactly the two parts of the movement.',
      ],
      seeItIn: ['down_diver', 'gyro_double_over_down', 'pixie_double_over_down'],
      notationIntro:
        'For readers interested in the formal notation, a double-over-down runs two same-side outward dexes into a cross-body clipper from a toe set: TOE > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL] (4 ADD). The setting leg circles both dexes (the double over); the cross-body clipper is the down.',
      takeaway:
        'Double-Over-Down is the down whose name is its structure, which makes it the easiest way into the whole down family.',
      plainLanguageReading: 'Toe set, two outward dexterities by the setting leg, opposite-side clipper catch.',
      structuralSignature: {
        conserved:        'A toe set, a setting-leg double-out sequence, and an opposite clipper terminal.',
        mayChange:        'The sets and body operators added before or around the chassis.',
        nearestNeighbors: 'Paradon circles with the other leg; Barfly is the clipper-set cell.',
      },
      atlasRelationship: {
        lines: [
          'Toe set, setting leg: Double-Over-Down',
          'Toe set, other leg: Paradon',
          'Clipper set, setting leg: Barfly',
          'Clipper set, other leg: Double-Down-Down',
        ],
        note: 'Two variables, the set surface and which leg circles, place Double-Over-Down in the four-cell Down grid.',
      },
    },
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
    teaching: {
      hook: 'Double Legover is not a legover done twice; it is an inward dex added in front of a legover, and it grows a branch of its own.',
      physicalDescription:
        'A Double Legover does not repeat the Legover motion twice. It combines two different dex directions, first inward and then outward, before resolving to a same-side toe stall. The final outward dex and toe catch are the Legover-shaped part of the trick, and the preceding inward dex is what extends that terminal movement into Double Legover.',
      importance:
        'Double Legover shows that a family can grow by adding a different movement before its conserved terminal, not only by repeating the base movement. This matters because Double Legover and Eggbeater both contain two dexes and finish alike, but their internal paths differ: Double Legover follows inward then outward, while Eggbeater follows outward then outward, with the first outward event serving as an atomic set.',
      variantsIntro: '',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'An inward dex, then an outward dex.',
        'Two dexes of different directions, not one motion repeated.',
        'Caught on the same-side toe, like a legover.',
        'Strip the operators and a double legover is what remains.',
      ],
      howToThink:
        'Read it as a legover with an inward dex added in front. Name the legover terminal (the outward dex to the same-side toe) first, then the inward dex that leads into it, then any operator on top. That order ties the haze and the predator back to the legover they came from and keeps double legover distinct from the eggbeater.',
      misconceptions: [
        'Double Legover is not two legovers; the first dex is inward and the second is outward, and only the second dex plus the toe catch is the legover shape.',
        'It is not a harder trick from a different family; it is a legover with an inward dex added in front.',
        'The haze and the predator are not unrelated advanced moves; they are a double legover with something added.',
      ],
      seeItIn: ['haze', 'predator', 'paradox_double_leg_over', 'pixie_double_leg_over'],
      notationIntro:
        'For readers interested in the formal notation, a double legover runs two dexes into a same-side toe: SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL] (3 ADD). The two dex tokens are the two passes over the bag; the toe is the catch.',
      takeaway:
        'Double Legover is an inward dex added in front of a legover, and seeing the inward-then-outward path is what separates it from the eggbeater.',
      plainLanguageReading: 'One inward dexterity followed by one outward dexterity, ending on the same-side toe.',
      structuralSignature: {
        conserved:        'An inward dex followed by an outward dex, resolving to a same-side toe.',
        mayChange:        'The set and body operators placed before the two-dex chassis.',
        nearestNeighbors: 'Eggbeater changes the first dex direction and its structural role.',
      },
      atlasRelationship: {
        lines: [
          'Double Legover: OP IN to OP OUT to SAME TOE',
          'Eggbeater: OP OUT (set) to OP OUT to SAME TOE',
        ],
        note: 'Same two-dex length and toe finish; the first dex differs in direction and role.',
      },
    },
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
    teaching: {
      hook: 'Eggbeater is the legover in its atomic form, and it became a base of its own.',
      physicalDescription:
        'Eggbeater is the atomic form of Legover. Its first outward dexterity performs the set role, and the second outward dexterity completes the Legover terminal and returns the bag to the same-side toe. Although the formula contains two outward dexes, Eggbeater is not best understood as Legover performed twice: the two dexes have different jobs, one launches the trick and one resolves it.',
      importance:
        'Eggbeater is a strong example of a set-plus-base composition becoming a recognizable base in its own right. Once established, the whole Eggbeater chassis can receive further operators and sets, producing Paradox Eggbeater, Gyro Eggbeater, Quantum Eggbeater, Pigbeater, and other compounds.',
      variantsIntro: '',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'Two outward circling dexterities in a row.',
        'Launched from an atomic set.',
        'Caught on the same-side toe, like a legover.',
        'Strip the operators and an eggbeater is what remains.',
      ],
      howToThink:
        'Read eggbeater as the atomic legover. When you meet a paradox or gyro eggbeater, name the eggbeater underneath first, then the operator. Keeping the legover in view is what ties this whole branch back to its root.',
      misconceptions: [
        'Eggbeater is not unrelated to the legover; it is the legover in its atomic form.',
        'The paradox, gyro, and quantum eggbeaters are not separate tricks; each is an eggbeater with an operator added.',
        'Eggbeater is not simply a harder legover; the atomic set is what makes it its own base.',
      ],
      seeItIn: ['paradox_eggbeater', 'gyro_eggbeater', 'quantum_eggbeater', 'bedwetter'],
      notationIntro:
        'For readers interested in the formal notation, an eggbeater runs two outward dexes into a same-side toe from an atomic set: TOE >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL] (3 ADD). The two outward dexes are the paired passes; the toe is the catch.',
      takeaway:
        'Eggbeater is the legover in its atomic form, and it shows how a set can turn one base into another that leads a family of its own.',
      plainLanguageReading: 'An atomic outward set flowing into an outward legover dex and a same-side toe catch.',
      structuralSignature: {
        conserved:        'An atomic outward set feeding an outward-dex-to-same-toe terminal.',
        mayChange:        'The operators and additional sets placed around that chassis.',
        nearestNeighbors: 'Double Legover shares the final outward dex and toe catch but begins with an inward dex rather than an atomic outward set.',
      },
      atlasRelationship: {
        lines: [
          'Eggbeater: OP OUT (set) to OP OUT to SAME TOE',
          'Double Legover: OP IN to OP OUT to SAME TOE',
        ],
        note: 'The atomic set stands in for the leading inward dex of double legover.',
      },
    },
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
    teaching: {
      hook: 'Inside-stall is a catch surface of its own, the inside of the foot, and the guay lineage is what lands there.',
      physicalDescription:
        'An inside-stall catches the bag on the inside of the foot rather than the toes or across the body on a clipper. It is a place a trick can end, a third delay surface beside the toe stall and the clipper, reached here by one inward dexterity.',
      importance:
        'Inside-stall matters as a surface, a distinct place to catch, more than as one move. Its productive lineage is the guay, which reaches the inside stall much the way a pickup reaches a toe, and the guay\'s variants all land on the same surface. Recognizing the inside-stall as its own catch, not a kind of toe stall, is what lets that lineage read as one family.',
      variantsIntro:
        'The guay is the base that lands on the inside stall, and its family is guay with an operator added: spinning guay, gyro guay, ducking guay, stepping guay. The inside-stall catch stays the same; the operator is what changes.',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'The bag is caught on the inside of the foot.',
        'Not the toes, and not across the body on a clipper.',
        'The guay is the usual way to reach it.',
        'Strip the operators and a guay landing on the inside stall is what remains.',
      ],
      howToThink:
        'Treat inside-stall as a surface, like the toe or the clipper, and ask what landed on it. The answer is almost always a guay, so name the guay first and then the operator on top.',
      misconceptions: [
        'Inside-stall is not a kind of toe stall; it is its own catch surface.',
        'Guay is not a separate family; it is the lineage that lands on the inside stall.',
        'The surface is descriptive, a place to catch, not a trick in itself.',
      ],
      seeItIn: ['guay', 'spinning_guay', 'gyro_guay', 'ducking_guay'],
      notationIntro:
        'For readers interested in the formal notation, the guay lands one inward dexterity on the inside stall: SET > OP IN [DEX] > SAME INSIDE [DEL] (2 ADD). The SAME INSIDE token is the inside-of-foot catch that names the surface.',
      takeaway:
        'Inside-stall is a catch surface of its own, and the guay lineage is what makes it a productive place to land.',
    },
  },
];

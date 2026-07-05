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
    teaching: {
      hook: 'Whirl became the trick freestyle is built around, because it ends exactly where it begins and lets a combo keep going.',
      physicalDescription:
        'A whirl is a clipper-to-clipper move: from a clipper, the leg circles the bag over the top and brings it back to a clipper. It is one of the first rotational moves a player owns, and one they never stop using.',
      importance:
        'Whirl became the hub because it starts and ends in the same position, a clipper: you can enter it from almost anything that lands in a clipper and leave it into almost anything that starts from one. That points at something larger about advanced freestyle. Many tricks are valuable not simply because they are hard, but because they leave the player in a position where the next trick is possible. Whirl became central because it returns the player to one of the most reusable positions in the sport, which is a large part of why the clipper became the language advanced freestyle is built on.',
      variantsIntro:
        'Whirl is a base other tricks build on. Add an operator on the way in and you get its family: paradox whirl, gyro whirl, spinning whirl, symposium whirl. The whirl underneath stays the same; the operator is what changes.',
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
    canonicalFormula:  'SET > SAME OUT [DEX] > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['atomic butterfly', 'pixie butterfly', 'stepping butterfly', 'ducking butterfly'],
    siblingFamilies:   ['whirl', 'osis', 'mirage'],
    notableCompounds:  ['ripwalk', 'dimwalk', 'parkwalk'],
    observationalNotes: [],
    teaching: {
      hook: 'Butterfly is where freestyle starts to feel like freestyle: the trick where players stop stringing together isolated moves and start linking movement.',
      physicalDescription:
        'A Butterfly links two dexterities into one flight: one leg passes the bag outward, the other passes it back inward, and it lands on a clipper. For many players, Butterfly is the first trick that feels less like an isolated move and more like connected freestyle.',
      importance:
        'Butterfly matters less for its mechanics than for what it changes in a player. Learning Butterfly is often the moment freestyle stops feeling like individual tricks and starts feeling like continuous movement, which is why players often call it the beginning of real freestyle.',
      variantsIntro:
        'Butterfly is two dexterities linked into a single clipper catch. That linking is the point: it is the first place a player builds one movement out of two, which is the pattern the rest of freestyle is made of.',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'Two dexterities, not one.',
        'The legs alternate, one out and one in, in one continuous motion.',
        'It lands on a clipper.',
        'If you see two linked dexes flowing into a clipper, a butterfly is at the core.',
      ],
      howToThink:
        'Think of Butterfly as your first combination. Everything harder is more of the same: more dexterities linked, more operators added, more flow held together.',
      misconceptions: [
        'Butterfly is not important for being flashy; it is important for teaching you to link movement.',
        'A butterfly is not two separate tricks; it is one linked movement.',
        'Getting a butterfly is not the finish line; it is the start of thinking in combinations.',
      ],
      seeItIn: ['atomic_butterfly', 'ducking_butterfly', 'stepping_butterfly'],
      notationIntro:
        'For readers interested in the formal notation, a butterfly links two dexterities into a clipper catch: SET > SAME OUT [DEX] > OP IN [DEX] > SAME CLIP [XBD] [DEL] (3 ADD). The two dex tokens are the linked motions; the clipper is the catch.',
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
    canonicalFormula:  'TOE > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
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
    canonicalFormula:  'SET > (BACK or FRONT) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox osis', 'spinning osis', 'symposium osis', 'atomic osis'],
    siblingFamilies:   ['whirl', 'butterfly', 'swirl'],
    notableCompounds:  ['torque (≡ miraging osis)', 'blender (≡ whirling osis)'],
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
        'Torque is an osis reached by adding a miraging dex on the way in; Blender, a whirling dex. That shared ending underneath a whole branch is why osis is called a base.',
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
        body:  'Illusion is the out-to-in mirror of mirage: the bag follows the same path, the body the inverse. Both are leggy downtime dexes that finish on an opposite-foot toe delay.',
      },
    ],
    teaching: {
      hook: 'Illusion is the Mirage run the other way, and the pair is where you learn that in freestyle a direction is not a detail: it is a different trick.',
      physicalDescription:
        'An Illusion is a single dexterity caught on a toe stall, like a Mirage, but the leg circles the bag in the opposite direction. The bag can trace nearly the same path while the body does the inverse of what it does in a Mirage. It is one dex and one catch, reversed.',
      importance:
        'The Mirage and Illusion pair is the clearest lesson in one of the sport\'s core habits: reversing the direction of a move does not give you a variation of the same trick, it gives you a new one. Much of the vocabulary doubles this way, the same movement kept and its direction flipped, and once you have felt how different an Illusion is from a Mirage you start to expect the reversed half of everything you learn to be its own skill with its own name.',
      variantsIntro:
        'Illusion is a base other tricks build on, the same way Mirage is. Add an operator on the way in and you get its family: paradox illusion, spinning illusion, ducking illusion. The illusion underneath stays the same; the operator is what changes.',
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
        'A Legover is one dexterity caught on a toe stall, like a Mirage, but the performing leg passes over the top of the bag and the same leg catches it. That over-the-bag motion, and the same-foot catch, are what make it a legover rather than one of its neighbors.',
      importance:
        'Legover matters because it introduces a movement other tricks are built out of, not just a single move to own. Its atomic form is the eggbeater, and the double-leg-over and the flurry carry the same leg-over motion forward. Once you can see the legover inside a harder trick, that branch stops looking like unrelated advanced moves and starts looking like one motion with additions on top.',
      variantsIntro:
        'Legover is a base other tricks build on. Add an operator or a set and you get its family: spinning legover, ducking legover, and the eggbeater, which is the legover in its atomic form. The legover underneath stays the same; what is added on top is what changes.',
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
    notableCompounds:  ['omelette', 'paste', 'legeater'],
    observationalNotes: [
      {
        title: 'Upward-catching dex',
        body:  'Structurally distinct from mirage despite the same ADD: pickup scoops under the bag, introducing the upward-catching dex axis. It anchors paste, legeater, and the spinning / ducking pickup compounds.',
      },
    ],
    teaching: {
      hook: 'Pickup is the dexterity that scoops under the bag instead of circling over the top, and it opens an axis of freestyle the mirage does not.',
      physicalDescription:
        'A Pickup is one dexterity caught on a toe stall, and it carries the same ADD as a Mirage, but the leg scoops under the bag and lifts it rather than passing over the top. That scoop-from-below is what makes it a pickup, even though the two tricks look similar at a glance.',
      importance:
        'Pickup matters because it introduces a whole way of catching, from underneath, that other tricks are built out of. Its atomic form is the omelette, and paste and the legeater carry the same scooping motion forward. Learning to see the pickup scoop inside a trick lets you read that axis of the vocabulary as one motion with additions, rather than a set of separate advanced moves.',
      variantsIntro:
        'Pickup is a base other tricks build on. Add an operator or a set and you get its family: spinning pickup, ducking pickup, double pickup, and the omelette, which is the pickup in its atomic form. The pickup underneath stays the same; what is added on top is what changes.',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'The leg scoops under the bag and lifts it.',
        'One dex, caught on the same-side toe.',
        'It carries a mirage\'s ADD but not a mirage\'s motion.',
        'Strip the operators and a plain pickup is what remains.',
      ],
      howToThink:
        'When a single dex reads like a mirage but the bag is lifted from below rather than circled over the top, name it a pickup. Naming the pickup underneath first, then the addition, keeps the omelette, paste, and legeater organized as one scooping lineage.',
      misconceptions: [
        'Pickup is not a mirage variant; it carries the same ADD but scoops under the bag rather than circling over it, which makes it a separate trick.',
        'The omelette is not a separate trick from pickup; it is the pickup in its atomic form.',
        'Pickup is not defined by the set that launches it; the set can change while the pickup stays the same.',
      ],
      seeItIn: ['omelette', 'paste', 'spinning_pickup', 'ducking_pickup', 'double_pickup'],
      notationIntro:
        'For readers interested in the formal notation, a pickup is a single inward dexterity caught on the same-side toe stall: SET > OP IN [DEX] > SAME TOE [DEL] (2 ADD). The scoop from below is the movement the notation does not spell out; the catch is the same-side toe.',
      takeaway:
        'Pickup is the scoop-from-below dexterity, and recognizing it opens a branch of freestyle the mirage never reaches.',
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
    canonicalFormula:  'CLIP > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL]',
    familyAnchorAdds:  3,
    commonDescendants: ['paradox swirl', 'hop over swirl', 'butterfly swirl'],
    siblingFamilies:   ['whirl', 'osis'],
    notableCompounds:  ['paradox whirling swirl', 'spyro gyro (≡ gyro butterfly swirl)'],
    observationalNotes: [],
    teaching: {
      hook: 'Swirl is the whirl run the other way, and it shows one of the ways freestyle grows: by varying a move you already know.',
      physicalDescription:
        'A swirl is a clipper-to-clipper move like the whirl, but the leg takes the bag around the back instead of over the top. Same start, same finish, opposite path.',
      importance:
        'Swirl illustrates one of the ways freestyle expanded. Once players understood a movement, they naturally explored what happened when they changed one dimension of it, and here that dimension is the direction of the circle. Taking a known move and reversing it, rather than inventing something new from scratch, is one of the most productive ways the vocabulary has grown, and the swirl is a clean early example. Its own family, butterfly swirl, spinning swirl, and symposium swirl, is that same habit applied again.',
      variantsIntro:
        'Swirl is the whirl\'s shape with the circling reversed: from a clipper, the leg takes the bag around the back and returns to a clipper. Like the whirl, it is a base others build on, so its family is swirl with an operator added.',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'From a clipper, back to a clipper, like a whirl.',
        'But the bag travels around the back, not over the top.',
        'One circling dex, reversed.',
        'If it looks like a whirl going the other way, it is a swirl.',
      ],
      howToThink:
        'See swirl as variation in action. It is a whirl with one dimension changed, and that habit, taking a move you know and changing a single thing about it, is how much of the vocabulary you will ever learn came to be. Recognizing the whirl and swirl pair is the start of seeing freestyle as a system you can extend, not just a set of tricks to memorize.',
      misconceptions: [
        'Swirl is not a harder whirl; it is the same clipper-to-clipper shape circled the other way.',
        'A swirl is not defined by its entry; the direction of the circle is what makes it a swirl.',
        'Learning the whirl does not cover the swirl; the reversed direction is its own skill, even though the frame is shared.',
      ],
      seeItIn: ['butterfly_swirl', 'spinning_swirl', 'symposium_swirl'],
      notationIntro:
        'For readers interested in the formal notation, a swirl runs from a clipper through one back-circling dex to a clipper: CLIP > OP BACK SWIRL [DEX] > OP CLIP [XBD] [DEL] (3 ADD). It differs from the whirl only in that circling dex.',
      takeaway:
        'Swirl is the whirl run the other way, and it shows how freestyle grows: by taking a movement you already know and varying it.',
    },
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
    teaching: {
      hook: 'Torque is an osis with a dexterity added in front, and it is the first doorway into the whole branch of tricks that end in an osis.',
      physicalDescription:
        'A Torque adds one circling dexterity before an osis. The trick still ends the way an osis ends, a spin resolving onto a clipper, but a dex comes first. That added dex, a mirage-style circle in, is the whole difference between a torque and a plain osis.',
      importance:
        'Torque is one of the first places you see the osis working as a base rather than a single trick. Mobius, fury, and the paradox and spinning torques all grow from the same osis ending with a dex in front. Once you can name the osis inside a torque, and then name the dex that was added, the branch stops being a list of hard tricks and becomes one ending you reach different ways.',
      variantsIntro:
        'Torque is a base other tricks build on. Add an operator and you get its family: paradox torque, spinning torque, blurry torque. Its gyro form is the mobius. The torque underneath stays the same; the operator is what changes.',
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
        'Blender sits beside torque as the other main way into the osis. Torque adds a miraging dex, blender a whirling one, and seeing them as a pair is the lesson: once freestyle has a base ending like the osis, the different dexes you can put in front of it generate an entire branch rather than a handful of separate tricks.',
      variantsIntro:
        'Blender is a base other tricks build on. Add an operator and you get its family: paradox blender, spinning blender, symposium blender. Its blurry form is the food processor. The blender underneath stays the same; the operator is what changes.',
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
    notableCompounds:  ['royale (≡ paradox reverse drifter)', 'vortex (≡ gyro drifter)'],
    observationalNotes: [
      {
        title: 'Family Parent from clipper',
        body:  'Drifter ≡ miraging clipper. The mirage operator transforms a clipper-set entry into the drifter terminal; this first-class lineage grows from the clipper-anchored set primitives.',
      },
    ],
    teaching: {
      hook: 'Drifter is a clipper reached by adding a dexterity in front, and it seeds a small branch of well-known tricks.',
      physicalDescription:
        'A Drifter runs one inward circling dexterity and catches the bag on a clipper on the same side. It ends on a clipper like a whirl, but where a whirl loops from a clipper back to a clipper, a drifter is a single dex arriving on one.',
      importance:
        'Drifter shows the clipper working as a base you reach with a dex in front, the same idea the torque and blender apply to the osis. Two of freestyle\'s more recognizable tricks grow directly from it: the royale and the vortex are both a drifter with an operator added. Recognizing the drifter underneath keeps that small branch reading as one shape.',
      variantsIntro:
        'Drifter is a base other tricks build on. Add an operator and you get its family: paradox drifter, gyro drifter, and the reversed forms. The royale is a drifter reversed with paradox on it; the vortex is a gyro drifter. The drifter underneath stays the same; the operator is what changes.',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'One inward circling dexterity.',
        'Caught on a clipper on the same side.',
        'One dex arriving on a clipper, not a clipper-to-clipper loop.',
        'Strip the operators and a drifter is what remains.',
      ],
      howToThink:
        'Read drifter as a clipper reached with a dex in front. When you meet a royale or a vortex, name the drifter underneath first, then the operator that was added to reach it. That is usually most of the work of reading the trick.',
      misconceptions: [
        'Drifter is not a whirl; a whirl loops from a clipper back to a clipper, while a drifter is one dex arriving on a clipper.',
        'The royale and the vortex are not separate tricks; each is a drifter with an operator added.',
        'Drifter is not defined by the set that launches it; the set can change while the drifter stays the same.',
      ],
      seeItIn: ['royale', 'vortex', 'paradox_drifter', 'gyro_drifter'],
      notationIntro:
        'For readers interested in the formal notation, a drifter is one inward dexterity caught on a same-side clipper: SET > OP IN [DEX] > SAME CLIP [XBD] [DEL] (3 ADD). The single dex arriving on the clipper is what separates it from the whirl.',
      takeaway:
        'Drifter is a clipper reached with a dex in front, and naming it is how the royale and the vortex stop looking like separate tricks.',
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
    teaching: {
      hook: 'Barfly is one of the downs, and on its own it anchors a small family that stacks onto its double-dex shape.',
      physicalDescription:
        'A Barfly runs two circling dexterities of the same kind and brings the bag down onto a clipper across the body. It shares the finishing movement that names the down family, and it is the member of that family that starts from a clipper.',
      importance:
        'Barfly matters in two directions at once. As one of the downs it shares an ending with three tricks that look nothing like it, which is the down family\'s whole lesson. On its own it is a base a small family builds on, including the blurriest, which stacks a third dex onto the same shape. Reading barfly as a down first, then as its own base, is how the down branch stays organized instead of scattering into unrelated moves.',
      variantsIntro:
        'Barfly is a base other tricks build on. Add an operator or a set and you get its family: gyro barfly, pixie barfly, spinning barfly, stepping barfly. The barfly underneath stays the same; what is added on top is what changes.',
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
        'For readers interested in the formal notation, a barfly runs two same-side outward dexes into a cross-body clipper: CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD] (4 ADD). The two outward dexes are its signature; the cross-body clipper is the down ending.',
      takeaway:
        'Barfly is one of the downs and a base of its own, and holding both readings is how a corner of the down branch comes together.',
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
    teaching: {
      hook: 'Double-Over-Down is the one down whose name is its structure: two dexterities over, and then the down.',
      physicalDescription:
        'A Double-Over-Down sends the bag around with two outward dexterities, the double over, and then brings it down onto a clipper across the body, the down. It launches from a toe set. If you can read its name, you can already picture the trick.',
      importance:
        'Double-Over-Down is the clearest window into the down family, because its name spells out the shared ending the whole family is built on. Once you see the two-over-then-down shape here, you can find the same ending inside barfly and paradon, which reach it from a different set or a different leg. It also leads its own line of descendants, the deepest of which is the down diver.',
      variantsIntro:
        'Double-Over-Down is a base other tricks build on. Add an operator or a set and you get its family: gyro double-over-down, pixie double-over-down, and the down diver deeper along. The double-over-down underneath stays the same; what is added on top is what changes.',
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
        'For readers interested in the formal notation, a double-over-down runs two outward dexes into a cross-body clipper from a toe set: TOE > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL] (4 ADD). The two OUT dexes are the double over; the cross-body clipper is the down.',
      takeaway:
        'Double-Over-Down is the down whose name is its structure, which makes it the easiest way into the whole down family.',
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
    teaching: {
      hook: 'Double Legover is a legover done twice: two passes over the bag before the catch, and it grows a branch of its own.',
      physicalDescription:
        'A Double Legover sends the leg over the bag twice, two circling dexterities in a row, before the bag is caught on the same-side toe. It is the legover extended by one more pass, held together as a single movement.',
      importance:
        'Double Legover shows one of the plain ways freestyle grows a lineage: take a base and repeat its motion. The single legover pass becomes two, and that doubled shape then carries its own named descendants, including the haze and the predator. Seeing the legover repeated is what keeps this branch attached to its root instead of floating free.',
      variantsIntro:
        'Double Legover is a base other tricks build on. Add an operator or a set and you get its family: paradox double-leg-over, pixie double-leg-over, fairy double-leg-over. The double legover underneath stays the same; what is added on top is what changes.',
      variants: [],
      variantsRuling: '',
      howToRecognize: [
        'The leg passes over the bag twice.',
        'Two circling dexterities in a row.',
        'Caught on the same-side toe, like a legover.',
        'Strip the operators and a double legover is what remains.',
      ],
      howToThink:
        'Read it as a legover with a second pass added. Name the legover motion first, then the doubling, then any operator on top. That order ties the haze and the predator back to the legover they came from.',
      misconceptions: [
        'Double Legover is not two separate legovers; it is one linked movement with two passes.',
        'It is not a harder trick from a different family; it is the legover motion repeated.',
        'The haze and the predator are not unrelated advanced moves; they are a double legover with something added.',
      ],
      seeItIn: ['haze', 'predator', 'paradox_double_leg_over', 'pixie_double_leg_over'],
      notationIntro:
        'For readers interested in the formal notation, a double legover runs two dexes into a same-side toe: SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL] (3 ADD). The two dex tokens are the two passes over the bag; the toe is the catch.',
      takeaway:
        'Double Legover is the legover motion done twice, and it shows how freestyle grows a lineage by repeating a base rather than inventing a new one.',
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
      hook: 'Eggbeater is the legover in its atomic form, and it became a base other tricks build on in its own right.',
      physicalDescription:
        'An Eggbeater carries the legover\'s over-the-bag motion, launched from an atomic set, which adds a second pass: two outward circling dexterities in a row, caught on the same-side toe. It is the atomic form of the legover that grew into a family.',
      importance:
        'Eggbeater is a clear example of a set turning a base into a new base. Put the atomic set in front of a legover and you get the eggbeater, and the eggbeater then carries its own descendants: paradox eggbeater, gyro eggbeater, quantum eggbeater. Recognizing the legover inside it keeps the two attached, so the eggbeater reads as the legover\'s atomic form rather than an unrelated trick.',
      variantsIntro:
        'Eggbeater is a base other tricks build on. Add an operator and you get its family: paradox eggbeater, gyro eggbeater, quantum eggbeater. The eggbeater underneath stays the same; the operator is what changes.',
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

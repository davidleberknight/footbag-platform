/**
 * Staged freestyle operator content: what each operator is, as the operators
 * page, the modifier pages and the reference pages state it, and where the
 * operators page lists it; and, for each registry modifier, where the trick
 * dictionary's browse-by-modifier view lists it. Loader 28a seeds the operators
 * into freestyle_operators and the browse placement into the modifier registry's
 * browse columns; after that the operator editor and the modifier editor own
 * every value. An operator holds no ADD. The operators-page groups and the browse
 * groups, with their headings, are page prose and stay in code; a group key here
 * names one of them.
 */

export interface StagedOperator {
  slug:                string;
  name:                string;
  /** core, set, body, compound-set, compound-body, historical-nickname or quantifier. */
  kind:                string;
  definition:          string;
  decomposition:       string | null;
  decompositionNote:   string | null;
  workedExamples:      readonly string[];
  sourceNote:          string | null;
  confirmationPending: boolean;
  /** The operators-page group; null = not listed there. */
  pageGroup:           string | null;
  pageOrder:           number | null;
}

/** Where the browse-by-modifier view lists one registry modifier. */
export interface StagedModifierBrowse {
  slug:        string;
  /** The browse group; null = the catch-all group. */
  group:       string | null;
  order:       number | null;
  fullSection: boolean;
}

export const STAGED_OPERATORS: readonly StagedOperator[] = [
  {
    slug: "atomic",
    name: "Atomic",
    kind: "set",
    definition: "A single outward dex realized with a set role, +1: TOE > OP OUT [DEX] > (op-side component). An X-Dex, when present, is a separate +1 marked [XDEX] in the notation, not part of atomic.",
    decomposition: null,
    decompositionNote: "The X-Dex is never inferred from the operator name: some atomic tricks carry an [XDEX] (e.g. Atom Smasher = Atomic Mirage, reading 4) and some do not.",
    workedExamples: ["Atom Smasher = Atomic Mirage"],
    sourceNote: "Operational form from the historical moves reference. Atomic is the outward movement pattern realized with a set role; Illusioning is descriptive standalone-movement language some players used by analogy, not the set and not an equivalent name for Atomic.",
    confirmationPending: false,
    pageGroup: null,
    pageOrder: null,
  },
  {
    slug: "barraging",
    name: "Barraging",
    kind: "historical-nickname",
    definition: "A historical name for the Furious set, not a set or modifier of its own. Furious is the official two-dex set (+2 ADD, two in-direction dexes; operational form CLIP > OP IN [DEX] > SAME IN [DEX] >). Some tricks carry barraging-based names for continuity, but the set is Furious and their decomposition resolves to Furious.",
    decomposition: null,
    decompositionNote: "Barraging is retired as a scored, formula-bearing operator, so no \"barraging\" component presents as a scored decomposition.",
    workedExamples: ["Baroque = Furious Osis", "Fury = Furious Paradox Mirage"],
    sourceNote: "Historical naming, kept for name continuity.",
    confirmationPending: false,
    pageGroup: null,
    pageOrder: null,
  },
  {
    slug: "blurry",
    name: "Blurry",
    kind: "compound-set",
    definition: "The stepping set carrying a paradox, scored as its parts: stepping (+1) and paradox (+1), for +2. A stepping dexterity off the clipper, then the base's own dexterity made paradox. Operational form: CLIP > OP IN [DEX] > OP IN [PDX] [DEX] > (the base continues).",
    decomposition: "stepping paradox",
    decompositionNote: null,
    workedExamples: ["Blurry (Stepping Paradox)"],
    sourceNote: "Decomposition from the historical moves reference.",
    confirmationPending: false,
    pageGroup: null,
    pageOrder: null,
  },
  {
    slug: "diving",
    name: "Diving",
    kind: "core",
    definition: "Diving is a body operator, one of the four kinds of duck: the bag passes from one side of the body over the opposite side of the neck and back down to the side it came from, while the underlying trick is unchanged. It is a +1 body modifier.",
    decomposition: null,
    decompositionNote: null,
    workedExamples: [],
    sourceNote: null,
    confirmationPending: false,
    pageGroup: "head-body-passage",
    pageOrder: 20,
  },
  {
    slug: "double",
    name: "Double",
    kind: "quantifier",
    definition: "A quantifier: the set applied twice in sequence.",
    decomposition: null,
    decompositionNote: null,
    workedExamples: ["Terraging = Double Pixie"],
    sourceNote: "Quantifier: the set applied twice.",
    confirmationPending: true,
    pageGroup: null,
    pageOrder: null,
  },
  {
    slug: "ducking",
    name: "Ducking",
    kind: "core",
    definition: "Ducking is a body operator: the player passes beneath the bag near the apex, so the bag passes around the head and neck while the underlying trick is unchanged. It is a +1 body modifier.",
    decomposition: null,
    decompositionNote: null,
    workedExamples: [],
    sourceNote: null,
    confirmationPending: false,
    pageGroup: "head-body-passage",
    pageOrder: 10,
  },
  {
    slug: "flying",
    name: "Flying",
    kind: "body",
    definition: "A contact or trick performed with the whole body in the air, a no-stall body modifier.",
    decomposition: null,
    decompositionNote: null,
    workedExamples: [],
    sourceNote: null,
    confirmationPending: false,
    pageGroup: "provisional-historical",
    pageOrder: 30,
  },
  {
    slug: "gyro",
    name: "Gyro",
    kind: "core",
    definition: "Gyro is a rotational operator: an approximate half rotation (180°) where spinning is a full turn, leaving the body in a different orientation at the moment the dexterity is performed. It is a +1 body modifier.",
    decomposition: null,
    decompositionNote: null,
    workedExamples: [],
    sourceNote: null,
    confirmationPending: false,
    pageGroup: "body-rotation",
    pageOrder: 20,
  },
  {
    slug: "inspinning",
    name: "Inspinning",
    kind: "body",
    definition: "A forward-rotation spin, distinct in direction from spinning's default back-rotation. Any spin contributes +1 ADD, so inspinning is +1.",
    decomposition: "forward-rotation spin (+1)",
    decompositionNote: null,
    workedExamples: ["Pixie Inspinning (per the legacy reference)"],
    sourceNote: "Attested in the legacy moves reference.",
    confirmationPending: false,
    pageGroup: "body-rotation",
    pageOrder: 30,
  },
  {
    slug: "miraging",
    name: "Miraging",
    kind: "historical-nickname",
    definition: "The historical mirage-family name for a single inward dex, SET > OP IN [DEX] >, describing the inward standalone movement. The dex scores from a trick's own notation; \"miraging\" is not a scored, formula-bearing operator in its own right, and not a launch set. Quantum is the same inward movement pattern realized with a set role, so the name gives way to Quantum only where the movement really is a Quantum set.",
    decomposition: null,
    decompositionNote: "Older sources described miraging as atomic's inward-dex mirror; under current doctrine it is a historical nickname, so no decomposition presents a \"miraging\" scored component, and any X-Dex is a separate +1 marked [XDEX].",
    workedExamples: ["Historically read as Miraging Clipper (Drifter)", "Historically read as Miraging Legover (Double Leg Over)"],
    sourceNote: "Operational form from the historical moves reference. Retained as descriptive standalone inward-movement language, not a launch set.",
    confirmationPending: false,
    pageGroup: null,
    pageOrder: null,
  },
  {
    slug: "muted",
    name: "Muted",
    kind: "body",
    definition: "An active leg held in the air for an entire component without planting. Mostly used for dexes, but applies to other components too.",
    decomposition: null,
    decompositionNote: null,
    workedExamples: [],
    sourceNote: null,
    confirmationPending: false,
    pageGroup: "provisional-historical",
    pageOrder: 20,
  },
  {
    slug: "nuclear",
    name: "Nuclear",
    kind: "compound-set",
    definition: "A +2 set modifier combining paradox's hip pivot with a downtime illusioning dex. Operational form: CLIP > SAME OUT [PDX] [DEX] >.",
    decomposition: "paradox + illusion",
    decompositionNote: null,
    workedExamples: ["Sumo = Nuclear Mirage", "Matador = Nuclear Butterfly"],
    sourceNote: "A settled decomposition.",
    confirmationPending: false,
    pageGroup: null,
    pageOrder: null,
  },
  {
    slug: "paradox",
    name: "Paradox",
    kind: "core",
    definition: "Paradox is a hip and plant relationship applied to a single dexterity: it changes the side relationship between the support leg and that dexterity, so the body switches sides around the dex without adding another dex or changing the set foot. It is a +1 body modifier, and [PDX] co-tags the same dexterity event.",
    decomposition: null,
    decompositionNote: null,
    workedExamples: [],
    sourceNote: null,
    confirmationPending: false,
    pageGroup: "entry-side-relationship",
    pageOrder: 10,
  },
  {
    slug: "quantum",
    name: "Quantum",
    kind: "compound-set",
    definition: "A compressed-atomic set. Operational form: TOE > OP IN [DEX] > (op-side component).",
    decomposition: "compressed atomic",
    decompositionNote: "Historical name: Toe Blur.",
    workedExamples: ["Quantum Mirage = Toe Blur"],
    sourceNote: "Decomposition from historical community usage.",
    confirmationPending: false,
    pageGroup: null,
    pageOrder: null,
  },
  {
    slug: "spinning",
    name: "Spinning",
    kind: "core",
    definition: "Spinning is a body-rotation operator: a full-body 360° rotation carried through the dex moment, with the underlying dexterity unchanged. It is a +1 body modifier, recorded as a rotational body event.",
    decomposition: null,
    decompositionNote: null,
    workedExamples: [],
    sourceNote: null,
    confirmationPending: false,
    pageGroup: "body-rotation",
    pageOrder: 10,
  },
  {
    slug: "symple",
    name: "Symple",
    kind: "historical-nickname",
    definition: "Symposium is the established operator. The historical tokens Symple and symp also appear in source material, but two things are unresolved: whether Symple names a distinct movement, and whether symp means anything beyond an abbreviation of Symposium.",
    decomposition: null,
    decompositionNote: null,
    workedExamples: [],
    sourceNote: null,
    confirmationPending: false,
    pageGroup: "provisional-historical",
    pageOrder: 10,
  },
  {
    slug: "symposium",
    name: "Symposium",
    kind: "core",
    definition: "Symposium is a no-plant leg discipline: the support leg stays off the ground and the setting foot does not replant while the dex is performed. It is a +1 body modifier.",
    decomposition: null,
    decompositionNote: null,
    workedExamples: [],
    sourceNote: null,
    confirmationPending: false,
    pageGroup: "no-plant-suspension",
    pageOrder: 10,
  },
  {
    slug: "tapping",
    name: "Tapping",
    kind: "core",
    definition: "Tapping is a +1 modifier that adds a quick tap ahead of the base trick: a short toe-set dex is prepended, preserving the recognizable base identity. In Tapdown, the Butterfly dex is encoded as SAME OUT rather than its standalone OP OUT coordinate because the inserted tapping dex becomes the most recent side-bearing reference. The leg relation changes; the OUT direction does not.",
    decomposition: null,
    decompositionNote: null,
    workedExamples: [],
    sourceNote: null,
    confirmationPending: false,
    pageGroup: "set-preparatory",
    pageOrder: 10,
  },
  {
    slug: "whirling",
    name: "Whirling",
    kind: "compound-body",
    definition: "An uptime whirl motion: the whirl dexterity is performed during uptime, before the bag reaches its peak. Distinct from miraging and other uptime dexterities because the dex follows the whirl path.",
    decomposition: null,
    decompositionNote: null,
    workedExamples: ["Whirling Swirl", "Double-Blender = Whirling Blender"],
    sourceNote: "A +1 body modifier, seen in tricks such as Whirling Swirl. Mid-chain whirling is represented in two source-attested notation traditions. FootbagMoves writes the rotational dex explicitly, as a side marker plus a mandatory FRONT or BACK qualifier (OP FRONT WHIRL [DEX]); footbag.org may fold the same action into the base dex direction and the following body rotation. Sourced canonical notation is preserved in the register used by its source, and new platform-authored derivations use the explicit FRONT WHIRL register for consistency. Blender provides the direct equivalence between the two encodings; no broader directional conversion should be inferred without source evidence. Neither register writes a bare WHIRL token.",
    confirmationPending: false,
    pageGroup: null,
    pageOrder: null,
  },
];

/**
 * Browse placement for the registry modifiers that have one. A modifier missing
 * here is listed under the catch-all group with no full section of its own.
 */
export const STAGED_MODIFIER_BROWSE: readonly StagedModifierBrowse[] = [
  { slug: "pixie", group: "set-uptime", order: 10, fullSection: false },
  { slug: "fairy", group: "set-uptime", order: 20, fullSection: false },
  { slug: "stepping", group: "set-uptime", order: 30, fullSection: false },
  { slug: "atomic", group: "set-uptime", order: 40, fullSection: false },
  { slug: "quantum", group: "set-uptime", order: 50, fullSection: false },
  { slug: "nuclear", group: "set-uptime", order: 60, fullSection: false },
  { slug: "sailing", group: "set-uptime", order: 70, fullSection: false },
  { slug: "spinning", group: "rotational-body", order: 10, fullSection: true },
  { slug: "gyro", group: "rotational-body", order: 20, fullSection: true },
  { slug: "inspinning", group: "rotational-body", order: 30, fullSection: true },
  { slug: "whirling", group: "rotational-body", order: 40, fullSection: false },
  { slug: "swirling", group: "rotational-body", order: 50, fullSection: false },
  { slug: "symposium", group: "no-plant-timing", order: 10, fullSection: true },
  { slug: "paradox", group: "no-plant-timing", order: 20, fullSection: true },
  { slug: "blurry", group: "no-plant-timing", order: 30, fullSection: false },
  { slug: "furious", group: "no-plant-timing", order: 40, fullSection: false },
  { slug: "pogo", group: "no-plant-timing", order: 60, fullSection: false },
  { slug: "terraging", group: "dexterity-structural", order: 10, fullSection: false },
  { slug: "tapping", group: "dexterity-structural", order: 20, fullSection: true },
  { slug: "ducking", group: "dexterity-structural", order: 30, fullSection: true },
  { slug: "diving", group: "dexterity-structural", order: 40, fullSection: true },
  { slug: "weaving", group: "dexterity-structural", order: 50, fullSection: true },
  { slug: "zulu", group: "dexterity-structural", order: 60, fullSection: true },
];

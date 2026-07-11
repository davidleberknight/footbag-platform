/**
 * freestyleOperatorReference.ts
 *
 * Reference entries for intermediate freestyle operators: the
 * compound/quantifier operators that sit between Tier-1 board primitives
 * (PIX, AT, SPIN, etc.) and the curator-authored equivalence-chain layer.
 *
 * This module is also the single authority for each Tier-1 operator's
 * canonical definition line (TIER1_OPERATOR_DEFINITIONS below). The operators
 * index rows, the modifier teaching pages' "What it is" text, and the
 * glossary's body-modifier reference all derive their definition sentence
 * from that record; they never author a competing definition. Pedagogy
 * (feel cards, progressions, confusions, execution notes) stays local to
 * each surface.
 *
 * Two decomposition layers are documented per operator where authority exists:
 *
 *   - Operational layer: set-notation sequence (CLIP > OP IN [DEX] > etc.)
 *     Authority: legacy notation reference encoded as the moves page.
 *
 *   - Semantic-operator layer: compositional vocabulary
 *     (nuclear = paradox + illusion). Authority: community review + curator
 *     adjudication.
 *
 * The two layers are independent. An entry can be authoritative at one
 * layer and pending at the other; the operational form may exist while
 * the semantic decomposition is still under community review.
 *
 * Forever-rules:
 *   - Curator authority absolute. The codebase carries the corpus; never
 *     auto-derives entries from canonical_name or other parser output.
 *   - Pending entries surface their pending state honestly via the
 *     `decomposition: null` + `pendingNote` pair. Never fabricated.
 *   - Provenance lives in `lineageNote` per entry.
 */

export type OperatorReferenceCategory =
  | 'set'              // a complete set treatment (atomic, blurry, etc.)
  | 'body'             // a body modifier with a reference entry (inspinning);
                       //  Tier-1 body operators carry only a definition line
                       //  here (TIER1_OPERATOR_DEFINITIONS), not a full entry
  | 'compound-set'     // a set treatment that decomposes into other operators
  | 'compound-body'    // a body operator that decomposes into other operators
  | 'historical-nickname' // a legacy/nickname naming pattern (Miraging, Barraging),
                       //  not a canonical set or operator of its own; a downtime-
                       //  analogy name that resolves to an official set
  | 'quantifier';      // a quantifier-style operator (double)

export interface OperatorReferenceEntry {
  slug:                  string;
  name:                  string;
  category:              OperatorReferenceCategory;
  // One-line plain-English meaning; renders directly under the operator name.
  oneLineMeaning:        string;
  // Semantic-operator decomposition string when curator-authoritative; null
  // when the decomposition is still under curator adjudication.
  decomposition:         string | null;
  // Author-visible note explaining a partial / pending decomposition, a
  // documented conflict, or a non-obvious lineage detail. Renders below
  // the decomposition when present. Always null on fully locked entries
  // unless there's a useful caveat to surface.
  pendingNote:           string | null;
  // Curator-curated worked examples (folk-name = compositional reading).
  // Each string is rendered as-is; no recursive expansion at render time.
  workedExamples:        readonly string[];
  // Provenance for the curated content: which legacy reference or community
  // ruling grounds this entry. Renders as a small lineage line.
  lineageNote:           string;
  // True when any field in the entry is still pending curator confirmation
  // (typically when `decomposition` is null OR a documented conflict exists).
  curatorConfirmPending: boolean;
}

// Order matters: rendered top-to-bottom in glossary §3. The order below is
// pedagogical: set-tier operators first, body-tier next, quantifiers last.
export const OPERATOR_REFERENCE_ENTRIES: readonly OperatorReferenceEntry[] = [
  {
    slug:           'atomic',
    name:           'Atomic',
    category:       'set',
    oneLineMeaning: 'A single outward uptime dex, +1: TOE > OP OUT [DEX] > (op-side component). An X-Dex, when present, is a separate +1 marked [XDEX] in the notation, not part of atomic.',
    decomposition:  null,
    pendingNote:    'Atomic is +1. Any X-Dex is a separate +1 scored only where the notation carries [XDEX]; it is not part of atomic and is never inferred from the operator name. Some atomic tricks carry an [XDEX] (e.g. Atom Smasher = Atomic Mirage, reading 4) and some do not.',
    workedExamples: ['Atom Smasher = Atomic Mirage'],
    lineageNote:    'Operational form from the historical moves reference. Atomic is the official uptime set; Illusioning is a historical downtime nickname some players used by analogy, not the set and not an equivalent name for Atomic.',
    curatorConfirmPending: false,
  },
  {
    slug:           'miraging',
    name:           'Miraging',
    category:       'historical-nickname',
    oneLineMeaning: 'The historical mirage-family name for a single inward dex, SET > OP IN [DEX] >. That inward dex scores as a dex from a trick\'s own notation; "miraging" is not a scored, formula-bearing operator in its own right. A descriptive downtime nickname, not a canonical set. Quantum is the official uptime set concept; miraging is not a modern set or a Quantum equivalent, and its terminology is not replaced by Quantum except where the movement is actually a Quantum set.',
    decomposition:  null,
    pendingNote:    'Miraging names a single inward dex, which scores as a dex from a trick\'s own notation; it is retired as a scored, formula-bearing operator, so no decomposition presents a "miraging" scored component. Older sources described it as atomic\'s inward-dex mirror, but under current doctrine miraging is a historical nickname, not a modern set. Any X-Dex is a separate +1 marked [XDEX] in the notation, not part of miraging.',
    workedExamples: ['Historically read as Miraging Clipper (Drifter)', 'Historically read as Miraging Legover (Double Leg Over)'],
    lineageNote:    'Operational form from the historical moves reference. Retained as descriptive or downtime mirage-family language, not a modern set.',
    curatorConfirmPending: false,
  },
  {
    slug:           'blurry',
    name:           'Blurry',
    category:       'compound-set',
    oneLineMeaning: 'A stepping treatment with a paradox-style second dex. Operational form: CLIP > OP IN [DEX] > OP OUT [DEX] > (op side).',
    decomposition:  'stepping paradox',
    pendingNote:    null,
    workedExamples: ['Blurry (Stepping Paradox)'],
    lineageNote:    'Decomposition from the historical moves reference.',
    curatorConfirmPending: false,
  },
  {
    slug:           'quantum',
    name:           'Quantum',
    category:       'compound-set',
    oneLineMeaning: 'A compressed-atomic set. Operational form: TOE > OP IN [DEX] > (op-side component).',
    decomposition:  'compressed atomic',
    pendingNote:    'Historical name: Toe Blur.',
    workedExamples: ['Quantum Mirage = Toe Blur'],
    lineageNote:    'Decomposition from historical community usage.',
    curatorConfirmPending: false,
  },
  {
    slug:           'nuclear',
    name:           'Nuclear',
    category:       'compound-set',
    oneLineMeaning: "A +2 set modifier combining paradox's hip pivot with a downtime illusioning dex. Operational form: CLIP > SAME OUT >.",
    decomposition:  'paradox + illusion',
    pendingNote:    null,
    workedExamples: ['Sumo = Nuclear Mirage', 'Matador = Nuclear Butterfly'],
    lineageNote:    'A settled decomposition.',
    curatorConfirmPending: false,
  },
  {
    slug:           'barraging',
    name:           'Barraging',
    category:       'historical-nickname',
    oneLineMeaning: 'A legacy name pattern for the Furious set, not a canonical set of its own. Furious is the official two-dex uptime set (+2 ADD, two in-direction dexes; operational form CLIP > OP IN [DEX] > SAME IN [DEX] >, historically called high stepping). Some tricks carry barraging-based names by analogy to similar motions; those names persist for continuity, but the set is Furious, and decomposition resolves to Furious.',
    decomposition:  'high stepping',
    pendingNote:    null,
    workedExamples: ['Baroque = Furious Osis', 'Fury = Furious Paradox Mirage'],
    lineageNote:    'A legacy name pattern for the Furious set; Furious is the official two-dex +2 uptime set.',
    curatorConfirmPending: false,
  },
  {
    slug:           'inspinning',
    name:           'Inspinning',
    category:       'body',
    oneLineMeaning: "A forward-rotation spin, distinct in direction from spinning's default back-rotation. Any spin contributes +1 ADD, so inspinning is +1.",
    decomposition:  'forward-rotation spin (+1)',
    pendingNote:    null,
    workedExamples: ['Pixie Inspinning (per the legacy reference)'],
    lineageNote:    'Forward-rotation spin; +1 ADD (any spin = +1).',
    curatorConfirmPending: false,
  },
  {
    slug:           'whirling',
    name:           'Whirling',
    category:       'compound-body',
    oneLineMeaning: 'An uptime whirl motion: the whirl dexterity is performed during uptime, before the bag reaches its peak. Distinct from miraging and other uptime dexterities because the dex follows the whirl path.',
    decomposition:  null,
    pendingNote:    null,
    workedExamples: ['Whirling Swirl', 'Double-Blender = Whirling Blender'],
    lineageNote:    'A +1 body modifier, seen in tricks such as Whirling Swirl.',
    curatorConfirmPending: false,
  },
  {
    slug:           'double',
    name:           'Double',
    category:       'quantifier',
    oneLineMeaning: 'A quantifier: the set applied twice in sequence. Worked example: double pixie = terraging.',
    decomposition:  null,
    pendingNote:    null,
    workedExamples: ['Terraging = Double Pixie'],
    lineageNote:    'Quantifier: the set applied twice.',
    curatorConfirmPending: true,
  },
];

/**
 * Look up an operator entry by slug. Returns null when the slug is not in the
 * reference corpus. O(n) is fine at this corpus size (low dozens).
 */
export function getOperatorReferenceEntry(slug: string): OperatorReferenceEntry | null {
  const normalized = slug.trim().toLowerCase();
  return OPERATOR_REFERENCE_ENTRIES.find(e => e.slug === normalized) ?? null;
}

/**
 * Canonical definition line for one Tier-1 operator. The definition is the
 * structural what-it-is sentence, including the operator's contribution weight;
 * it is authored exactly once, here, and every surface that states what the
 * operator IS renders this string. Surfaces keep their own pedagogy (feel,
 * intuition, progression, confusions) locally; only the definition derives.
 */
export interface Tier1OperatorDefinition {
  slug:       string;
  definition: string;
}

// The Tier-1 operators taught on the operators index and the modifier teaching
// pages. Intermediate operators (atomic, blurry, nuclear, ...) instead carry a
// full OperatorReferenceEntry above, whose oneLineMeaning is their definition.
export const TIER1_OPERATOR_DEFINITIONS: readonly Tier1OperatorDefinition[] = [
  {
    slug: 'paradox',
    definition:
      'Paradox is a hip pivot between two dexes on the same set: it changes the side ' +
      'relationship between the support leg and the dexterity, so the body switches sides ' +
      'around the dex without changing the set foot. It is a +1 body modifier.',
  },
  {
    slug: 'spinning',
    definition:
      'Spinning is a body-rotation operator: a full-body 360° rotation carried through ' +
      'the dex moment, with the underlying dexterity unchanged. It is a +1 body modifier, ' +
      'recorded as a rotational body event.',
  },
  {
    slug: 'gyro',
    definition:
      'Gyro is a rotational operator: an approximate half rotation (180°) where spinning ' +
      'is a full turn, leaving the body in a different orientation at the moment the ' +
      'dexterity is performed. It is a +1 body modifier.',
  },
  {
    slug: 'ducking',
    definition:
      'Ducking is a body operator: the player passes beneath the bag near the apex, so the ' +
      'bag passes around the head and neck while the underlying trick is unchanged. It is a ' +
      '+1 body modifier.',
  },
  {
    slug: 'diving',
    definition:
      'Diving is a body operator: the bag passes over the player, the complement of ducking, ' +
      'while the underlying trick is unchanged. It is a +1 body modifier.',
  },
  {
    slug: 'tapping',
    definition:
      'Tapping is a +1 modifier that adds a quick tap ahead of the base trick: a short ' +
      'toe-set dex is prepended, and the base then runs unchanged.',
  },
  {
    slug: 'symposium',
    definition:
      'Symposium is a no-plant leg discipline: the support leg stays off the ground and the ' +
      'setting foot does not replant while the dex is performed. It is a +1 body modifier.',
  },
];

/**
 * Look up the canonical Tier-1 definition line by slug. Returns null when the
 * operator is not Tier-1 (intermediate operators use their reference entry's
 * oneLineMeaning instead).
 */
export function getTier1OperatorDefinition(slug: string): Tier1OperatorDefinition | null {
  const normalized = slug.trim().toLowerCase();
  return TIER1_OPERATOR_DEFINITIONS.find(d => d.slug === normalized) ?? null;
}

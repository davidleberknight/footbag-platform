/**
 * freestyleOperatorReference.ts
 *
 * Reference entries for intermediate freestyle operators: the
 * compound/quantifier operators that sit between Tier-1 board primitives
 * (PIX, AT, SPIN, etc.) and the curator-authored equivalence-chain layer.
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
  | 'body'             // a body modifier (currently none in this file; Tier-1
                       //  body operators live on the operator board)
  | 'compound-set'     // a set treatment that decomposes into other operators
  | 'compound-body'    // a body operator that decomposes into other operators
  | 'quantifier';      // a quantifier-style operator (double, high)

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
    oneLineMeaning: 'A cross-body uptime set with x-dex character. Operational form: TOE > OP OUT [DEX] > (op-side component).',
    decomposition:  null,
    pendingNote:    'X-Dex fires on the following dex only when it is a far miraging/illusioning move (Atomic or Quantum set — identical trigger); legovers and pickups never carry it. The surface name is the dictionary headline (e.g. Atom Smasher = Atomic Mirage); the dex-by-dex breakdown is pedagogy, not the canonical key.',
    workedExamples: ['Atom Smasher = Atomic Mirage'],
    lineageNote:    'Operational form per the legacy notation reference; X-Dex trigger and presentation curator-adjudicated.',
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
    lineageNote:    'Decomposition per the legacy notation reference parenthetical equivalent.',
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
    lineageNote:    'Decomposition per curator editorial constants and historical community usage.',
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
    lineageNote:    'Curator-adjudicated decomposition.',
    curatorConfirmPending: false,
  },
  {
    slug:           'barraging',
    name:           'Barraging',
    category:       'compound-set',
    oneLineMeaning: 'A high-stepping treatment with two in-direction dexes. Operational form: CLIP > OP IN [DEX] > SAME IN [DEX] >.',
    decomposition:  'high stepping',
    pendingNote:    'The same operator as furious (a two-dex uptime set, +2 ADD); "barraging" is the more explanative name. Worked example: barraging + osis = baroque = 5.',
    workedExamples: ['Fury = Barraging Paradox Mirage', 'Baroque = Barraging Osis'],
    lineageNote:    'Two-dex uptime set (+2 ADD), curator-adjudicated; legacy equivalent name "high stepping".',
    curatorConfirmPending: false,
  },
  {
    slug:           'furious',
    name:           'Furious',
    category:       'compound-set',
    oneLineMeaning: 'A two-dex uptime set (+2 ADD); the same operator as barraging. Operational form: CLIP > OP IN [DEX] > SAME IN [DEX] >.',
    decomposition:  'barraging (two-dex uptime set)',
    pendingNote:    'The same operator as barraging (a two-dex uptime set, +2 ADD); barraging is the more explanative name.',
    workedExamples: ['Fury = Furious Paradox Mirage'],
    lineageNote:    'Two-dex uptime set (+2 ADD), curator-adjudicated; = barraging.',
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
    lineageNote:    'A +1 body modifier, commonly seen in tricks such as Whirling Swirl; per the legacy notation reference Whirl / Swirl variants list.',
    curatorConfirmPending: false,
  },
  {
    slug:           'double',
    name:           'Double',
    category:       'quantifier',
    oneLineMeaning: 'A quantifier operator. Per the legacy Terraging entry, applying a set twice in sequence.',
    decomposition:  'X applied twice (per legacy: Terraging = Double Pixie = TOE > SAME IN [DEX] > SAME IN [DEX] >)',
    pendingNote:    'Generalization across double-fairy = double illusion, double-blender = whirling blender, and double-spinning-osis = two spins to osis may not all follow the simple X-twice pattern. Per-compound community readings supersede the generalization where they differ.',
    workedExamples: [
      'Terraging = Double Pixie',
      'Double-Fairy = Double Illusion',
      'Double-Blender = Whirling Blender',
      'Double-Spinning-Osis = Two Spins to Osis',
    ],
    lineageNote:    'Quantifier semantics per the legacy Terraging entry.',
    curatorConfirmPending: true,
  },
  {
    slug:           'high',
    name:           'High',
    category:       'quantifier',
    oneLineMeaning: 'A quantifier-style operator surfaced in the legacy Barraging = High Stepping equivalence.',
    decomposition:  null,
    pendingNote:    'Semantics under community review. Appears as the "high" prefix in "high stepping" as the legacy equivalent name for barraging.',
    workedExamples: ['Barraging = High Stepping'],
    lineageNote:    'Per the legacy notation reference parenthetical equivalent.',
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

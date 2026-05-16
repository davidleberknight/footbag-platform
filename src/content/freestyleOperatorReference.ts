/**
 * freestyleOperatorReference.ts
 *
 * Reference entries for intermediate freestyle operators — the
 * compound/quantifier operators that sit between Tier-1 board primitives
 * (PIX, AT, SPIN, etc.) and the curator-authored equivalence-chain layer.
 *
 * Two decomposition layers are documented per operator where authority exists:
 *
 *   - Operational layer: set-notation sequence (CLIP > OP IN [DEX] > etc.)
 *     Authority: legacy notation reference encoded as the moves page.
 *
 *   - Semantic-operator layer: compositional vocabulary
 *     (nuclear = paradox + atomic). Authority: community review + curator
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
  | 'body'             // a body modifier (currently none in this file — Tier-1
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
  // Provenance for the curated content — which legacy reference or community
  // ruling grounds this entry. Renders as a small lineage line.
  lineageNote:           string;
  // True when any field in the entry is still pending curator confirmation
  // (typically when `decomposition` is null OR a documented conflict exists).
  curatorConfirmPending: boolean;
}

// Order matters: rendered top-to-bottom in glossary §3. The order below is
// pedagogical — set-tier operators first, body-tier next, quantifiers last.
export const OPERATOR_REFERENCE_ENTRIES: readonly OperatorReferenceEntry[] = [
  {
    slug:           'atomic',
    name:           'Atomic',
    category:       'set',
    oneLineMeaning: 'A cross-body uptime set with x-dex character. Operational form: TOE > OP OUT [DEX] > (op-side component).',
    decomposition:  null,
    pendingNote:    'Primitive at the set-notation level. Deeper mechanical decomposition under community review.',
    workedExamples: ['Atom Smasher = Atomic Mirage'],
    lineageNote:    'Operational form per the legacy notation reference.',
    curatorConfirmPending: true,
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
    oneLineMeaning: "A +2 set modifier combining paradox's hip pivot with atomic's cross-body character. Operational form: CLIP > SAME OUT >.",
    decomposition:  'paradox + atomic',
    pendingNote:    null,
    workedExamples: ['Matador = Nuclear Butterfly'],
    lineageNote:    'Curator-adjudicated decomposition.',
    curatorConfirmPending: false,
  },
  {
    slug:           'barraging',
    name:           'Barraging',
    category:       'compound-set',
    oneLineMeaning: 'A high-stepping treatment with two in-direction dexes. Operational form: CLIP > OP IN [DEX] > SAME IN [DEX] >.',
    decomposition:  'high stepping',
    pendingNote:    'Distinct from furious at the operational level (one fewer dex layer per the legacy reference).',
    workedExamples: ['Fury (one reading) = Barraging Paradox Mirage'],
    lineageNote:    'Decomposition per the legacy notation reference parenthetical equivalent.',
    curatorConfirmPending: false,
  },
  {
    slug:           'furious',
    name:           'Furious',
    category:       'compound-set',
    oneLineMeaning: 'An extended set form. Operational form: CLIP > OP IN [DEX] > SAME IN [DEX] > OP IN [DEX] >.',
    decomposition:  null,
    pendingNote:    'Distinct from barraging at the operational level (one additional OP IN [DEX] layer). +2 ADD weight. Full semantic decomposition under community review; Fury admits two structural readings (barraging paradox mirage and furious paradox mirage).',
    workedExamples: ['Fury (one reading) = Furious Paradox Mirage'],
    lineageNote:    'Operational form per the legacy notation reference; +2 ADD weight.',
    curatorConfirmPending: true,
  },
  {
    slug:           'inspinning',
    name:           'Inspinning',
    category:       'body',
    oneLineMeaning: "A directional variant of spinning that marks forward-rotation orientation, distinct from spinning's default back-rotation reading. +0 ADD (directional only).",
    decomposition:  'forward-rotation spinning (directional variant)',
    pendingNote:    null,
    workedExamples: ['Pixie Inspinning (per the legacy reference)'],
    lineageNote:    'Direction variant of spinning; ADD +0 (directional).',
    curatorConfirmPending: false,
  },
  {
    slug:           'whirling',
    name:           'Whirling',
    category:       'compound-body',
    oneLineMeaning: 'A whirl-family variant operator listed among the Whirl / Swirl variants.',
    decomposition:  null,
    pendingNote:    'Listed in the legacy reference without an operational decomposition. Full semantics under community review.',
    workedExamples: ['Double-Blender = Whirling Blender'],
    lineageNote:    'Per the legacy notation reference Whirl / Swirl variants list; full decomposition not yet documented.',
    curatorConfirmPending: true,
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

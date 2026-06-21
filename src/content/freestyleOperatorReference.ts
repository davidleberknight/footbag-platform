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
    oneLineMeaning: 'A single outward uptime dex, +1: TOE > OP OUT [DEX] > (op-side component). An X-Dex, when present, is a separate conditional event on the following dex, not part of atomic.',
    decomposition:  null,
    pendingNote:    'Atomic is +1; the +2-rotational reading is retired. A separate +1 X-Dex can ride a following dex, but only when that dex is the far form of an eligible receiver (mirage, illusion, whirl, torque, drifter); never infer it from the operator name. Recorded only where the notation already carries [XDEX] (the atomic + X-Dex composite, "atomicX", reads +2, e.g. Atom Smasher = atomicX Mirage = 4).',
    workedExamples: ['Atom Smasher = Atomic Mirage'],
    lineageNote:    'Operational form from the historical moves reference.',
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
    category:       'compound-set',
    oneLineMeaning: 'A two-dex uptime set (+2 ADD) of two in-direction dexes. Also called furious; the historical name is high stepping. Operational form: CLIP > OP IN [DEX] > SAME IN [DEX] >.',
    decomposition:  'high stepping',
    pendingNote:    null,
    workedExamples: ['Baroque = Barraging Osis', 'Fury = Barraging Paradox Mirage'],
    lineageNote:    'A two-dex uptime set worth +2 ADD.',
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

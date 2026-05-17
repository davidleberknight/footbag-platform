/**
 * freestyleAddAnalysisContent.ts
 * ===============================
 *
 * Curator-authored content for the ADD Analysis page (/freestyle/add-analysis).
 * Per Slice X plan + draft prose (exploration/comparative-reconciliation-2026-05/
 * ADD_ANALYSIS_SECTION_PLAN.md + ADD_ANALYSIS_PROSE_DRAFT.md), this module
 * supplies:
 *
 *   §1 How ADD is built — component contribution table
 *   §2 Worked examples (8 tricks)
 *   §3 ADD Discrepancies & Why They Happen (10 ship-now-safe cases +
 *       2 edge-case brief mentions)
 *   §4 Interpretation notes (3 closing paragraphs)
 *
 * Plus: philosophy intro paragraph (per Slice Z §8) and cross-link inventory.
 *
 * Reversibility
 * -------------
 * All content is curator-authored TypeScript per
 * [[feedback_reversible_content_governance]]. No database persistence;
 * no SQL; no schema. Editing this file changes the page immediately on
 * next request.
 *
 * Discipline (per Slice X §10 + Slice Z §10)
 * ------------------------------------------
 *   - No ADD value changes to any canonical row
 *   - No Wave 2 resolutions
 *   - No fabricated formulas
 *   - All 10 discrepancy cases are Red-settled (citations below)
 *   - 5 controversial cases (eggbeater / nemesis / witchdoctor / surreal /
 *     fairy cohort) excluded from this initial pilot
 *   - Wording follows the Slice X §4 lexicon: "differs from", "decomposes
 *     differently", never "wrong"
 */

export interface AddAnalysisComponent {
  /** Pre-shaped label, e.g. "A stall on a recognized catch surface". */
  componentClass: string;
  /** Pre-shaped contribution, e.g. "1 ADD" or "+1 on non-rotational". */
  contribution: string;
  /** Pre-shaped example string. */
  example: string;
}

export interface AddAnalysisWorkedExample {
  trickName:    string;
  /** Slug for /freestyle/tricks/:slug cross-link; null when no detail page. */
  trickSlug:    string | null;
  /** Pre-shaped ADD label, e.g. "1 ADD" / "5 ADD". */
  addLabel:     string;
  /** Pre-shaped components string. */
  components:   string;
  /** One-line "why" prose. */
  whyNote:      string;
}

export interface AddAnalysisDiscrepancyCase {
  caseId:                    string;   // DC-01 .. DC-10
  trickName:                 string;
  trickSlug:                 string | null;
  ifpaAdd:                   string;   // "5"
  externalSourceLabel:       string;   // "footbagmoves"
  externalAdd:               string;
  delta:                     string;   // "-1" / "0" / "+1"
  decompositionDifference:   string;
  pattern:                   string;   // "positional operator" etc.
  ifpaStatusLine:            string;   // "settled by Red 2026-05-11"
}

export interface AddAnalysisEdgeCase {
  trickName:    string;
  trickSlug:    string | null;
  ifpaAdd:      string;
  briefNote:    string;
}

export interface AddAnalysisCrossLink {
  label: string;
  href:  string;
}

export interface AddAnalysisContent {
  philosophyParagraph:    string;
  editorialTruthRule:     string;
  incompletenessNote:     string;
  componentClasses:       readonly AddAnalysisComponent[];
  workedExamples:         readonly AddAnalysisWorkedExample[];
  discrepancyCases:       readonly AddAnalysisDiscrepancyCase[];
  edgeCases:              readonly AddAnalysisEdgeCase[];
  closingParagraphs:      readonly string[];
  crossLinks:             readonly AddAnalysisCrossLink[];
}

// ─────────────────────────────────────────────────────────────────────────
// §0 Philosophy intro (per Slice Z public-philosophy-statement draft)
// ─────────────────────────────────────────────────────────────────────────

const PHILOSOPHY_PARAGRAPH =
  'IFPA attempts to provide a structural reading for every accepted trick. ' +
  'Some readings are exact — settled by community rulings over many years. ' +
  'Some are approximate — readable through known operator vocabulary but ' +
  'not yet curator-locked. Some are observational — names the community ' +
  'uses for tricks whose decomposition is still under discussion. The goal ' +
  'is not to fabricate certainty. The goal is to make the movement ' +
  "language explainable: when a trick is here, we say what we think it's " +
  "made of, and when we're unsure, we say that too.";

// ─────────────────────────────────────────────────────────────────────────
// §1 How ADD is built — component contribution table
// ─────────────────────────────────────────────────────────────────────────

const COMPONENT_CLASSES: readonly AddAnalysisComponent[] = [
  {
    componentClass: 'A stall on a recognized catch surface',
    contribution:   '1 ADD',
    example:        'clipper-stall, toe-stall, neck-stall',
  },
  {
    componentClass: 'A dexterity (one bag-foot interaction)',
    contribution:   '1 ADD',
    example:        'hippy-in, leggy-out, dex variants',
  },
  {
    componentClass: 'A specialized surface (head, shoulder, forehead, etc.)',
    contribution:   '1 ADD',
    example:        'head-stall, shoulder-stall',
  },
  {
    componentClass: 'Paradox / ducking / symposium / spinning / stepping',
    contribution:   '+1 ADD per modifier on most non-rotational bases',
    example:        'paradox + mirage (2) = 3 ADD',
  },
  {
    componentClass: 'Atomic',
    contribution:   '+1 on non-rotational, +2 on rotational',
    example:        'atom-smasher = atomic + mirage + X-dex = 4',
  },
  {
    componentClass: 'Nuclear',
    contribution:   '+2 ADD — structurally = paradox + atomic',
    example:        'per pt10 ruling',
  },
  {
    componentClass: 'Quantum',
    contribution:   '+1 ADD — the compressed form of atomic',
    example:        'per pt10 ruling',
  },
  {
    componentClass: 'Blurry',
    contribution:   '+1 ADD — transitively expands to stepping paradox',
    example:        'per pt11 ruling',
  },
  {
    componentClass: 'Same-side (ss) / far / near / reverse',
    contribution:   '+0 ADD (positional, not difficulty)',
    example:        'per Red 2026-05-11 + 2026-05-15',
  },
];

const EDITORIAL_TRUTH_RULE =
  "When a trick's stated ADD differs from what straight addition produces, " +
  'the stated value is canonical and the additive calculation is diagnostic. ' +
  'This is the IFPA editorial contract.';

const INCOMPLETENESS_NOTE =
  "Some compound tricks are folk-named — they exist in the community but their " +
  "structural decomposition isn't yet curator-confirmed. Those rows carry a " +
  '"pending decomposition refinement" indicator on their dictionary card. ' +
  'They count as full tricks; their structural reading is what’s pending.';

// ─────────────────────────────────────────────────────────────────────────
// §2 Worked examples — 8 tricks, low to high
// ─────────────────────────────────────────────────────────────────────────

const WORKED_EXAMPLES: readonly AddAnalysisWorkedExample[] = [
  {
    trickName:  'Clipper',
    trickSlug:  'clipper',
    addLabel:   '1 ADD',
    components: 'clipper kick (1)',
    whyNote:    'Foundational primitive. No modifier surface; no dexterity.',
  },
  {
    trickName:  'Mirage',
    trickSlug:  'mirage',
    addLabel:   '2 ADD',
    components: 'mirage rotation (2)',
    whyNote:    'One of the foundational rotational anchors. Compounds (paradox-mirage, atom-smasher) build on it.',
  },
  {
    trickName:  'Whirl',
    trickSlug:  'whirl',
    addLabel:   '3 ADD',
    components: 'whirl rotation (3)',
    whyNote:    'The family anchor for ~17 derivative compounds, from 4-ADD entries through compound flagships.',
  },
  {
    trickName:  'Butterfly',
    trickSlug:  'butterfly',
    addLabel:   '3 ADD',
    components: 'butterfly rotation (3)',
    whyNote:    'The 3-ADD anchor for the entire walking-family progression (dimwalk, ripwalk, sidewalk, bigwalk, parkwalk).',
  },
  {
    trickName:  'Osis',
    trickSlug:  'osis',
    addLabel:   '3 ADD',
    components: 'osis rotation (3)',
    whyNote:    'One of the most generative families. Two important branch compounds — Torque and Blender — are its 4-ADD derivatives, each spawning its own family.',
  },
  {
    trickName:  'Torque',
    trickSlug:  'torque',
    addLabel:   '4 ADD',
    components: 'miraging (+1) + osis (3)',
    whyNote:    'Settled by pt11 as the canonical reading of "miraging osis". Anchors its own branch family (paradox-torque, spinning-torque, mobius, gauntlet, atomic-torque, blurry-torque, grave-digger, spinal-tap).',
  },
  {
    trickName:  'Blurry Whirl',
    trickSlug:  'blurry-whirl',
    addLabel:   '5 ADD',
    components: 'stepping (+1) + paradox (+1) + whirl (3)',
    whyNote:    'Settled by pt11 + Wave 1 2026-05-15: blurry transitively expands to stepping paradox. The compressed name "blurry whirl" and the expanded reading describe the same trick at different stopping depths. Both are correct.',
  },
  {
    trickName:  'Mobius',
    trickSlug:  'mobius',
    addLabel:   '5 ADD',
    components: 'gyro torque (gyro +1 + torque 4) = 5  — or deep form spinning ss miraging osis (+1 +0 +1 +3) = 5',
    whyNote:    'Settled by pt11. The dictionary’s flagship multi-depth example. Two valid stopping depths reach the same total. Players say mobius; analysts can unfold to either depth.',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// §3 ADD Discrepancies & Why They Happen — 10 ship-now-safe cases
// ─────────────────────────────────────────────────────────────────────────

const DISCREPANCY_CASES: readonly AddAnalysisDiscrepancyCase[] = [
  {
    caseId:                  'DC-01',
    trickName:               'Hurl (Nuclear ss Whirl)',
    trickSlug:               null,
    ifpaAdd:                 '5',
    externalSourceLabel:     'footbagmoves',
    externalAdd:             '4',
    delta:                   '−1',
    decompositionDifference: 'IFPA counts ss as +0; footbagmoves treats it as ADD-additive in some entries.',
    pattern:                 'positional operator',
    ifpaStatusLine:          'settled by Red 2026-05-11 (SS=+0 universal)',
  },
  {
    caseId:                  'DC-02',
    trickName:               'Barfry (Nuclear ss Butterfly)',
    trickSlug:               null,
    ifpaAdd:                 '5',
    externalSourceLabel:     'footbagmoves',
    externalAdd:             '4',
    delta:                   '−1',
    decompositionDifference: 'Same SS pattern as Hurl, applied to butterfly base.',
    pattern:                 'positional operator',
    ifpaStatusLine:          'settled by Red 2026-05-11',
  },
  {
    caseId:                  'DC-03',
    trickName:               'Godzilla (Nuclear ss Dyno)',
    trickSlug:               null,
    ifpaAdd:                 '6',
    externalSourceLabel:     'footbagmoves',
    externalAdd:             '5',
    delta:                   '−1',
    decompositionDifference: 'Same SS pattern as Hurl, applied to dyno base.',
    pattern:                 'positional operator',
    ifpaStatusLine:          'settled by Red 2026-05-11',
  },
  {
    caseId:                  'DC-04',
    trickName:               'Blurry Whirl ≡ Stepping Paradox Whirl',
    trickSlug:               'blurry-whirl',
    ifpaAdd:                 '5',
    externalSourceLabel:     'IFPA (compressed vs expanded)',
    externalAdd:             '5',
    delta:                   '0',
    decompositionDifference: 'Two readings; one ADD. The compressed form ("blurry whirl") and the expanded form ("stepping paradox whirl") describe the same trick at different stopping depths.',
    pattern:                 'compression vs expansion',
    ifpaStatusLine:          'settled by pt11 + Wave 1 2026-05-15',
  },
  {
    caseId:                  'DC-05',
    trickName:               'Blurry Torque ≡ Stepping Paradox Torque',
    trickSlug:               'blurry-torque',
    ifpaAdd:                 '6',
    externalSourceLabel:     'IFPA (compressed vs expanded)',
    externalAdd:             '6',
    delta:                   '0',
    decompositionDifference: 'Same compression pattern as Blurry Whirl, applied to a compound base (torque = miraging osis).',
    pattern:                 'compression vs expansion (transitive across compound bases)',
    ifpaStatusLine:          'settled by Wave 1 2026-05-15',
  },
  {
    caseId:                  'DC-06',
    trickName:               'Food Processor ≡ Stepping Paradox Blender',
    trickSlug:               'food-processor',
    ifpaAdd:                 '6',
    externalSourceLabel:     'IFPA (compressed vs expanded)',
    externalAdd:             '6',
    delta:                   '0',
    decompositionDifference: 'The folk name is itself a compression. stepping (+1) + paradox (+1) + blender (4) = 6. Blender is itself a compound (whirling osis), so the compression cascades through.',
    pattern:                 'compression vs expansion on a compound base',
    ifpaStatusLine:          'settled by Wave 1 2026-05-15',
  },
  {
    caseId:                  'DC-07',
    trickName:               'Mobius ≡ Gyro Torque ≡ Spinning ss Miraging Osis',
    trickSlug:               'mobius',
    ifpaAdd:                 '5',
    externalSourceLabel:     'IFPA (multi-depth)',
    externalAdd:             '5',
    delta:                   '0',
    decompositionDifference: 'Two valid stopping depths reach the same total. Compact: gyro torque (+1 +4) = 5. Deep: spinning (+1) + ss (+0) + miraging (+1) + osis (3) = 5.',
    pattern:                 'stopping-depth ambiguity',
    ifpaStatusLine:          'settled by pt11',
  },
  {
    caseId:                  'DC-08',
    trickName:               'Atom Smasher ≡ Atomic Mirage',
    trickSlug:               'atom-smasher',
    ifpaAdd:                 '4',
    externalSourceLabel:     'IFPA (hidden mechanism)',
    externalAdd:             '4',
    delta:                   '0',
    decompositionDifference: 'The arithmetic-only reading would be atomic (+1 non-rotational on mirage) + mirage (2) = 3. But atom-smasher carries an implicit X-dex from a toe that adds +1, giving 4.',
    pattern:                 'hidden mechanism (X-dex preservation)',
    ifpaStatusLine:          'settled by Red 2026-05-15 (X-dex carry from a toe)',
  },
  {
    caseId:                  'DC-09',
    trickName:               'Baroque (Barraging Osis)',
    trickSlug:               'barraging-osis',
    ifpaAdd:                 '5',
    externalSourceLabel:     'IFPA (operator class)',
    externalAdd:             '5',
    delta:                   '0',
    decompositionDifference: 'Barraging’s contribution to Baroque is structural — it multiplies the dex count rather than adding as a body modifier. Two dexes (+2) + osis (3) = 5.',
    pattern:                 'operator class (structural dex-multiplier)',
    ifpaStatusLine:          'settled by Wave 1 2026-05-15 (Baroque named ruling)',
  },
  {
    caseId:                  'DC-10',
    trickName:               'Bladerunner (footbagmoves: Atomic Eggbeater)',
    trickSlug:               null,
    ifpaAdd:                 '4',
    externalSourceLabel:     'footbagmoves',
    externalAdd:             '5',
    delta:                   '+1',
    decompositionDifference: "FM names Bladerunner as \"Atomic Eggbeater\". IFPA's eggbeater is already atomic legover (pt4); FM's name applies atomic recursively, IFPA's canonical math doesn't.",
    pattern:                 'recursive operator application',
    ifpaStatusLine:          'settled by pt4 (eggbeater = atomic legover)',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// §3b Edge cases — brief mentions
// ─────────────────────────────────────────────────────────────────────────

const EDGE_CASES: readonly AddAnalysisEdgeCase[] = [
  {
    trickName:  'Sumo (Nuclear Mirage)',
    trickSlug:  'sumo',
    ifpaAdd:    '5',
    briefNote:  'Sumo’s 5 ADD comes via a named X-Dex pt9 exception — pt9 ruled that certain nuclear-mirage compounds carry an implicit X-Dex similar to atom smasher.',
  },
  {
    trickName:  'Genesis (footbagmoves: Furious Whirl)',
    trickSlug:  null,
    ifpaAdd:    '5',
    briefNote:  "Genesis (FM-named \"Furious Whirl\" at 7 ADD) is +2 above IFPA's canonical 5. The +2 traces to FM's earlier rotational-escalation convention which IFPA retired in pt10 (rotational bases get a flat +1 per modifier rather than progressive scaling).",
  },
];

// ─────────────────────────────────────────────────────────────────────────
// §4 Interpretation notes — 3 closing paragraphs
// ─────────────────────────────────────────────────────────────────────────

const CLOSING_PARAGRAPHS: readonly string[] = [
  // Why disagreements exist — 3 recurring reasons
  'Three recurring reasons disagreements exist:',
  'Positional vs additive — same-side, far, near, and reverse are positional cues in IFPA’s framing (Red 2026-05-11). Some external sources count them as ADD-additive.',
  'Compression vs expansion — many tricks have multiple legitimate stopping depths. Players use the shortest folk name; analysts may unfold to deeper structural readings. Both arrive at the same ADD.',
  'Historical evolution — the operator vocabulary has refined over time. Earlier conventions (rotational escalation, recursive atomic application) produce different totals than the modern post-pt10 + pt11 + Wave 1 conventions.',
];

// ─────────────────────────────────────────────────────────────────────────
// Cross-link inventory
// ─────────────────────────────────────────────────────────────────────────

const CROSS_LINKS: readonly AddAnalysisCrossLink[] = [
  { label: 'Trick Dictionary',                 href: '/freestyle/tricks' },
  { label: 'Glossary §7: Symbolic Notation', href: '/freestyle/glossary#symbolic-notation' },
  { label: 'Glossary §10: Traditional Reference', href: '/freestyle/glossary#traditional-reference' },
  { label: 'Freestyle History',                href: '/freestyle/history' },
];

// ─────────────────────────────────────────────────────────────────────────
// Public assembled content
// ─────────────────────────────────────────────────────────────────────────

export const FREESTYLE_ADD_ANALYSIS_CONTENT: AddAnalysisContent = {
  philosophyParagraph: PHILOSOPHY_PARAGRAPH,
  editorialTruthRule:  EDITORIAL_TRUTH_RULE,
  incompletenessNote:  INCOMPLETENESS_NOTE,
  componentClasses:    COMPONENT_CLASSES,
  workedExamples:      WORKED_EXAMPLES,
  discrepancyCases:    DISCREPANCY_CASES,
  edgeCases:           EDGE_CASES,
  closingParagraphs:   CLOSING_PARAGRAPHS,
  crossLinks:          CROSS_LINKS,
};

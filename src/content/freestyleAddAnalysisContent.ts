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

import {
  PASSBACK_ADD_DISAGREEMENTS,
  PASSBACK_ADD_FRAMING_PROSE,
  type AddDisagreementRow,
} from './freestyleAddDisagreements';
export type { AddDisagreementRow };
import {
  RESOLVED_FORMULAS_SPRINT_1,
  RESOLVED_FORMULAS_FRAMING_PROSE,
  type ResolvedFormula,
} from './freestyleResolvedFormulas';
export type { ResolvedFormula };

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
  /**
   * Pre-shaped ADD derivation string. Formula Accountability Slice
   * (2026-05-17): a single explicit additive line showing operator
   * weights → total. Distinct from `components` (free-form attribution
   * prose); derivation is the additive math, components is the structure.
   * Example: 'stepping(+1) + paradox(+1) + whirl(3) = 5 ADD'.
   */
  derivation:   string;
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
  philosophyParagraph:      string;
  editorialTruthRule:       string;
  incompletenessNote:       string;
  componentClasses:         readonly AddAnalysisComponent[];
  workedExamples:           readonly AddAnalysisWorkedExample[];
  discrepancyCases:         readonly AddAnalysisDiscrepancyCase[];
  edgeCases:                readonly AddAnalysisEdgeCase[];
  /** External-source ADD framing prose (PB-vs-IFPA counting reconciliation). */
  passbackAddFraming:       string;
  /** 68 rows: PB name-matched + ADD-claim differs from IFPA canonical. */
  passbackAddDisagreements: readonly AddDisagreementRow[];
  /** Sprint-1 Canonical Formula Resolution: framing prose. */
  resolvedFormulasFraming:  string;
  /** Sprint-1 Canonical Formula Resolution: 15 +1-stack compositions. */
  resolvedFormulas:         readonly ResolvedFormula[];
  closingParagraphs:        readonly string[];
  crossLinks:               readonly AddAnalysisCrossLink[];
}

// ─────────────────────────────────────────────────────────────────────────
// §0 Philosophy intro (per Slice Z public-philosophy-statement draft)
// ─────────────────────────────────────────────────────────────────────────

const PHILOSOPHY_PARAGRAPH =
  'IFPA attempts to provide a structural reading for every accepted trick. ' +
  'Some readings are exact — settled by community rulings over many years. ' +
  'Some are approximate — readable through known operator vocabulary but ' +
  'not yet curator-locked. Some are observational — names the community ' +
  'uses for tricks whose decomposition is still under discussion. Many ' +
  'tricks admit multiple valid structural readings at different stopping ' +
  'depths — the compressed folk name and one or more deeper expansions ' +
  'all describing the same trick. Stopping-depth equivalence is a ' +
  'foundational property of the compositional language, not a discrepancy. ' +
  'The goal is not to fabricate certainty. The goal is to make the movement ' +
  "language explainable: when a trick is here, we say what we think it's " +
  "made of, and when we're unsure, we say that too.";

// ─────────────────────────────────────────────────────────────────────────
// §1 How ADD is built — component contribution table
// ─────────────────────────────────────────────────────────────────────────

const COMPONENT_CLASSES: readonly AddAnalysisComponent[] = [
  // Foundational atomic-flag primitives — the building blocks a
  // foundational trick decomposes into when its operational chain is
  // walked flag-by-flag. Each contributes 1 ADD. Treated as
  // educational accounting (per [[feedback_reversible_content_governance]]),
  // not parser-truth doctrine — the goal is for readers to see where
  // the ADDs come from when reading a foundational trick's name.
  {
    componentClass: 'Stall — a catch on a recognized surface',
    contribution:   '1 ADD',
    example:        'toe-stall, clipper-stall, neck-stall',
  },
  {
    componentClass: 'Dexterity (dex) — one bag-foot interaction',
    contribution:   '1 ADD',
    example:        'inside dex, outside dex, hippy, leggy',
  },
  {
    componentClass: 'Cross-body traversal (xbody) — the bag crosses one plane around the body',
    contribution:   '1 ADD',
    example:        'the kick portion of a clipper; the body-cross in whirl',
  },
  {
    componentClass: 'Spin flag — a rotational primitive in an atom’s flag decomposition',
    contribution:   '1 ADD',
    example:        'osis carries a spin flag (spin(1) + xbod(1) + stall(1) = 3 ADD). Distinct from the spinning body operator, which adds +1 atop a base, and from the rotational-character property of certain atoms, which triggers the atomic +2-rotational rule. Three different concepts; one accounting primitive lives here.',
  },
  {
    componentClass: 'Specialized surface (head, shoulder, forehead, etc.)',
    contribution:   '1 ADD',
    example:        'head-stall, shoulder-stall',
  },
  // Operator / modifier contributions — applied on top of a base
  // trick. Organized below by the four-axis operator-board grouping
  // used on /freestyle/tricks?view=movement-system and in the
  // glossary §6 modifier reference. The axis grouping is a
  // pedagogical / organizational convention — NOT a canonical
  // single-valued taxonomy. Wave-2-gated weightings are marked TBD.
  {
    componentClass: 'Set / Uptime modifiers — pixie, fairy, atomic, quantum, nuclear, blurry, barraging (pedagogical axis, not canonical taxonomy)',
    contribution:   'pixie / fairy / quantum +1; atomic +1 non-rotational / +2 rotational (pt10); nuclear +2 (= paradox + atomic per pt10); blurry +1 implies stepping (Red 2026-05-20: prior paradox-implication retired); barraging +2 (two-dex set; Red 2026-05-20).',
    example:        'atomic + mirage = atom smasher = 4 ADD; barraging + osis = baroque = 5 ADD',
  },
  {
    componentClass: 'Entry-topology modifiers — paradox, symposium (pedagogical axis, not canonical taxonomy)',
    contribution:   '+1 each. These modify the dex-entry position. Paradox itself reads as PDX → CLIP > OP IN [DEX] (clipper set, then a far in-out dex).',
    example:        'paradox + mirage (2) = 3 ADD',
  },
  {
    componentClass: 'Midtime body modifiers — spinning, ducking, diving, swirling, stepping, tapping, gyro, furious, whirling, miraging (pedagogical axis, not canonical taxonomy)',
    contribution:   'mostly +1 on most bases; gyro +1; furious +2 rotational (non-rotational TBD pending Wave 2); whirling / miraging +1 on compatible bases.',
    example:        'spinning + osis = spinning osis = 4 ADD; ducking + whirl = ducking whirl = 4 ADD',
  },
  {
    componentClass: 'Positional / directional cues — same-side (ss) / far / near / reverse / op',
    contribution:   '+0 ADD. Positional cues, not difficulty contributions.',
    example:        'Red 2026-05-11 + 2026-05-15 — SS=+0 universal; far/near/reverse +0 by analogy',
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

// Worked examples — ordered by ascending ADD, showing the additive
// arithmetic explicitly. Foundational atoms (1-3 ADD) decompose into
// the four primitives (stall / dex / xbody / spin); compounds (4-5+)
// stack operators on top of those bases.
//
// Treated as educational accounting (per the philosophy paragraph and
// [[feedback_reversible_content_governance]]) — not parser-truth doctrine.
// The goal is for readers to see WHERE THE ADDS COME FROM when reading
// a trick's name. Where a foundational atom's structural decomposition
// is still under Wave 2 doctrinal discussion, the example shows the
// canonical ADD value and a safe additive reading; the deeper parser
// grammar can refine later without changing the public number.
const WORKED_EXAMPLES: readonly AddAnalysisWorkedExample[] = [
  // ── 1 ADD foundational atoms ──────────────────────────────────────────
  {
    trickName:  'Toe-stall',
    trickSlug:  'toe-stall',
    addLabel:   '1 ADD',
    components: 'One stall on the top of the toe.',
    derivation: 'stall(1) = 1 ADD',
    whyNote:    'The simplest accepted catch — a single recognized stall surface. Foundational primitive for the entire stall-based naming system.',
  },
  {
    trickName:  'Cross-body traversal (xbody primitive)',
    trickSlug:  null,
    addLabel:   '1 ADD',
    components: 'Accounting primitive illustrated via clipper motion — not a canonical named trick. One cross-body traversal in isolation, without a stall finish.',
    derivation: 'xbody(1) = 1 ADD',
    whyNote:    'Establishes xbody as a foundational accounting primitive. The bag crossing one plane around the body contributes 1 ADD wherever it appears — in clipper kicks, in whirl, in butterfly, in osis. Shown here in isolation so the primitive is legible; the canonical clipper-stall trick (xbody + stall = 2 ADD) appears below.',
  },

  // ── 2 ADD foundational atoms (stall + one other primitive) ────────────
  {
    trickName:  'Clipper-stall',
    trickSlug:  'clipper-stall',
    addLabel:   '2 ADD',
    components: 'Cross-body kick + stall.',
    derivation: 'xbody(1) + stall(1) = 2 ADD',
    whyNote:    'The clipper kick (1) finishing on the clipper surface (1). Direct arithmetic; no operators in play.',
  },
  {
    trickName:  'Mirage',
    trickSlug:  'mirage',
    addLabel:   '2 ADD',
    components: 'One dex + one stall. Operational chain: [set] > hippy in dex > op toe.',
    derivation: 'dex(1) + stall(1) = 2 ADD',
    whyNote:    'A dexterity event finishing in a stall — an inward-hippy dex landing on the opposite-side toe. Foundational dexterity primitive (not rotational) that anchors a deep cohort (paradox-mirage, atom-smasher, blur, witchdoctor) via modifier stacks and composite-base readings.',
  },
  {
    trickName:  'Legover',
    trickSlug:  'legover',
    addLabel:   '2 ADD',
    components: 'One dex (over the supporting leg) + one stall.',
    derivation: 'dex(1) + stall(1) = 2 ADD',
    whyNote:    'Same arithmetic as mirage; mechanically the dex passes over the standing leg.',
  },
  {
    trickName:  'Pickup',
    trickSlug:  'pickup',
    addLabel:   '2 ADD',
    components: 'One dex (catching from below) + one stall.',
    derivation: 'dex(1) + stall(1) = 2 ADD',
    whyNote:    'Same arithmetic as mirage; mechanically the dex catches the bag from below.',
  },
  {
    trickName:  'Illusion',
    trickSlug:  'illusion',
    addLabel:   '2 ADD',
    components: 'One dex (with mid-flight rotation) + one stall.',
    derivation: 'dex(1) + stall(1) = 2 ADD',
    whyNote:    'Same arithmetic as mirage. Mechanically distinct (mid-flight rotation through the dex) but the ADD components are identical.',
  },
  {
    trickName:  'Around-the-world (ATW)',
    trickSlug:  'around-the-world',
    addLabel:   '2 ADD',
    components: 'Operational chain: toe > ss(midtime) in dex > ss toe. A single dex that traverses fully around the bag, finishing in a same-side toe stall.',
    derivation: 'full-orbit dex(1) + stall(1) = 2 ADD',
    whyNote:    'A single dex takes the foot fully around the bag, finishing in a stall. Reverse ATW (positional reverse, +0) reaches the same 2 ADD; the "reverse" qualifier is a direction marker, not an ADD-additive operator. Orbit is the curator-confirmed alias for reverse ATW (pending canonicalization).',
  },

  // ── 3 ADD foundational atoms (three primitives) ───────────────────────
  {
    trickName:  'Whirl',
    trickSlug:  'whirl',
    addLabel:   '3 ADD',
    components: 'Operational chain: [set] > leggy in dex > ss clipper. Cross-body + dex + stall walked flag-by-flag.',
    derivation: 'xbody(1) + dex(1) + stall(1) = 3 ADD',
    whyNote:    'A rotational dex with same-side clipper terminal — three flag-counting primitives combine into the foundational rotational atom. Anchors a deep family (paradox-whirl, spinning-whirl, ducking-whirl, blurry-whirl, symposium-whirl, mobius via torque branch).',
  },
  {
    trickName:  'Swirl',
    trickSlug:  'swirl',
    addLabel:   '3 ADD',
    components: 'Operational chain: [set] > leggy xbd out dex > ss clipper. Same three primitives as whirl, opposite rotation direction.',
    derivation: 'xbody(1) + dex(1) + stall(1) = 3 ADD',
    whyNote:    'Same arithmetic as whirl; rotational direction is mechanically opposite. Direction is positional (+0), so swirl and whirl share an ADD total.',
  },
  {
    trickName:  'Butterfly',
    trickSlug:  'butterfly',
    addLabel:   '3 ADD',
    components: 'Operational chain: [set] > hippy out dex > ss clipper. Dex + cross-body + stall walked flag-by-flag.',
    derivation: 'dex(1) + xbody(1) + stall(1) = 3 ADD',
    whyNote:    'Same three primitives as whirl with different entry topology (hippy-out instead of leggy-in). The 3-ADD anchor for the walking-family progression (dimwalk, ripwalk, sidewalk, bigwalk, parkwalk).',
  },
  {
    trickName:  'Osis',
    trickSlug:  'osis',
    addLabel:   '3 ADD',
    components: 'Operational chain: [set] > (downtime) spin > ss clipper. Spin flag + cross-body + stall walked flag-by-flag.',
    derivation: 'spin(1) + xbody(1) + stall(1) = 3 ADD',
    whyNote:    'A spin flag built into the atom — distinct from the spinning body operator (a +1 modifier applied atop a base) and from the rotational-character property that triggers atomic +2-rotational. Three concepts share the word "spin"; osis owns the atomic-flag one. Two major branch compounds — Torque and Blender — are its 4-ADD derivatives, each spawning its own family.',
  },

  // ── Operator visibility — paradox stacked on a base ───────────────────
  {
    trickName:  'Paradox Mirage',
    trickSlug:  'paradox-mirage',
    addLabel:   '3 ADD',
    components: 'Paradox operator (+1) on mirage (2).',
    derivation: 'paradox(+1) + mirage(2) = 3 ADD',
    whyNote:    'Demonstrates how an operator stacks onto a base. Paradox itself reads as PDX → CLIP > OP IN [DEX] (clipper set, then a far in-out dex); on top of mirage it adds +1.',
  },

  // ── 4-5 ADD compounds (operators + bases; Red-settled rulings) ───────
  {
    trickName:  'Torque',
    trickSlug:  'torque',
    addLabel:   '4 ADD',
    components: 'Miraging operator (+1) on osis (3).',
    derivation: 'miraging(+1) + osis(3) = 4 ADD',
    whyNote:    'Settled by pt11 as the canonical reading of "miraging osis". Anchors its own branch family (paradox-torque, spinning-torque, mobius, gauntlet, atomic-torque, blurry-torque, grave-digger, spinal-tap).',
  },
  {
    trickName:  'Atom Smasher',
    trickSlug:  'atom-smasher',
    addLabel:   '4 ADD',
    components: 'Atomic operator (+1) + mirage (2) + implicit X-dex carry (+1).',
    derivation: 'atomic(+1) + mirage(2) + xdex(+1) = 4 ADD',
    whyNote:    'Settled by Red 2026-05-15: atom smasher carries an implicit X-dex from a toe, like paradox. The atomic operator alone adds +1; the X-dex carry adds another +1 above the bare atomic+mirage arithmetic.',
  },
  {
    trickName:  'Blurry Whirl',
    trickSlug:  'blurry-whirl',
    addLabel:   '5 ADD',
    components: 'Stepping (+1) + paradox (+1) + whirl (3).',
    derivation: 'stepping(+1) + paradox(+1) + whirl(3) = 5 ADD',
    whyNote:    'Settled by pt11 + Wave 1 2026-05-15: blurry transitively expands to stepping paradox. The compressed name "blurry whirl" and the expanded reading describe the same trick at different stopping depths. Both are correct.',
  },
  {
    trickName:  'Mobius',
    trickSlug:  'mobius',
    addLabel:   '5 ADD',
    components: 'Gyro operator (+1) on torque (4) — or deep-form unfolding.',
    derivation: 'gyro(+1) + torque(4) = 5 ADD   (deep form: spinning(+1) + ss(+0) + miraging(+1) + osis(3) = 5 ADD)',
    whyNote:    'Settled by pt11. The flagship multi-depth example. Two valid stopping depths reach the same total. Players say mobius; analysts can unfold to either depth.',
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

// External-source ADD framing surfaces as a §3c subsection on
// /freestyle/add-analysis (PassBack-vs-IFPA counting reconciliation
// per Batch C of the PassBack-first ingestion sequence).
export const FREESTYLE_ADD_ANALYSIS_CONTENT: AddAnalysisContent = {
  philosophyParagraph:    PHILOSOPHY_PARAGRAPH,
  editorialTruthRule:     EDITORIAL_TRUTH_RULE,
  incompletenessNote:     INCOMPLETENESS_NOTE,
  componentClasses:       COMPONENT_CLASSES,
  workedExamples:         WORKED_EXAMPLES,
  discrepancyCases:       DISCREPANCY_CASES,
  edgeCases:              EDGE_CASES,
  passbackAddFraming:     PASSBACK_ADD_FRAMING_PROSE,
  passbackAddDisagreements: PASSBACK_ADD_DISAGREEMENTS,
  resolvedFormulasFraming: RESOLVED_FORMULAS_FRAMING_PROSE,
  resolvedFormulas:        RESOLVED_FORMULAS_SPRINT_1,
  closingParagraphs:      CLOSING_PARAGRAPHS,
  crossLinks:             CROSS_LINKS,
};

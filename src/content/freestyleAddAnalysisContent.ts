/**
 * freestyleAddAnalysisContent.ts
 * ===============================
 *
 * Curator-authored content for the ADD Analysis page (/freestyle/add-analysis).
 * This module supplies:
 *
 *   §1 How ADD is built: component contribution table
 *   §2 Worked examples (8 tricks)
 *   §3 ADD Discrepancies & Why They Happen (10 ship-now-safe cases +
 *       2 edge-case brief mentions)
 *   §4 Interpretation notes (3 closing paragraphs)
 *
 * Plus: philosophy intro paragraph and cross-link inventory.
 *
 * Reversibility
 * -------------
 * All content is curator-authored TypeScript: no database persistence,
 * no SQL, no schema. Editing this file changes the page immediately on
 * next request, and the layer can be revised without mutating canonical
 * trick data.
 *
 * Discipline
 * ----------
 *   - No ADD value changes to any canonical row
 *   - No resolutions of still-open doctrinal questions
 *   - No fabricated formulas
 *   - All 10 discrepancy cases are Red-settled (citations below)
 *   - 5 controversial cases (eggbeater / nemesis / witchdoctor / surreal /
 *     fairy cohort) excluded from this initial cohort
 *   - Wording uses the settled lexicon: "differs from", "decomposes
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
   * Pre-shaped ADD derivation string: a single explicit additive line
   * showing operator weights → total. Distinct from `components`
   * (free-form attribution prose); derivation is the additive math,
   * components is the structure.
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
  externalSourceLabel:       string;   // "Outside source"
  externalAdd:               string;
  delta:                     string;   // "-1" / "0" / "+1"
  decompositionDifference:   string;
  pattern:                   string;   // "positional operator" etc.
  ifpaStatusLine:            string;   // rendered IFPA status, e.g. "settled (SS=+0 universal)"
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
  spinNote:                 string;
  componentClasses:         readonly AddAnalysisComponent[];
  workedExamples:           readonly AddAnalysisWorkedExample[];
  osisBranchFraming:        string;
  osisBranch:               readonly AddAnalysisBranchStep[];
  discrepancyCases:         readonly AddAnalysisDiscrepancyCase[];
  edgeCases:                readonly AddAnalysisEdgeCase[];
  /** External-source ADD framing prose (PB-vs-IFPA counting reconciliation). */
  passbackAddFraming:       string;
  /** 68 rows: PB name-matched + ADD-claim differs from IFPA canonical. */
  passbackAddDisagreements: readonly AddDisagreementRow[];
  /** Canonical formula resolution: framing prose. */
  resolvedFormulasFraming:  string;
  /** Canonical formula resolution: the 15 +1-stack compositions. */
  resolvedFormulas:         readonly ResolvedFormula[];
  closingParagraphs:        readonly string[];
  crossLinks:               readonly AddAnalysisCrossLink[];
}

// ─────────────────────────────────────────────────────────────────────────
// §0 Philosophy intro
// ─────────────────────────────────────────────────────────────────────────

const PHILOSOPHY_PARAGRAPH =
  'IFPA attempts to provide a structural reading for every accepted trick. ' +
  'Some readings are exact: settled by community rulings over many years. ' +
  'Some are approximate: readable through known operator vocabulary but ' +
  'not yet settled. Some are observational: names the community ' +
  'uses for tricks whose breakdown is still under discussion. Many ' +
  'tricks admit multiple valid structural readings at different stopping ' +
  'depths: the compressed folk name and one or more deeper expansions ' +
  'all describing the same trick. Stopping-depth equivalence is a ' +
  'foundational property of the movement language system, not a discrepancy. ' +
  'The goal is not to fabricate certainty. The goal is to make the movement ' +
  "language explainable: when a trick is here, we say what we think it's " +
  "made of, and when we're unsure, we say that too.";

// ─────────────────────────────────────────────────────────────────────────
// §1 How ADD is built: component contribution table
// ─────────────────────────────────────────────────────────────────────────

const COMPONENT_CLASSES: readonly AddAnalysisComponent[] = [
  // Foundational atomic-flag primitives, the building blocks a
  // foundational trick decomposes into when its operational chain is
  // walked flag-by-flag. Each contributes 1 ADD. Treated as
  // educational accounting, not parser-truth doctrine; the goal is for
  // readers to see where the ADDs come from when reading a foundational
  // trick's name.
  {
    componentClass: 'Stall: a catch on a recognized surface',
    contribution:   '1 ADD',
    example:        'toe-stall, clipper-stall, neck-stall',
  },
  {
    componentClass: 'Dexterity (dex): one bag-foot interaction',
    contribution:   '1 ADD',
    example:        'inside dex, outside dex, hippy, leggy',
  },
  {
    componentClass: 'Cross-body traversal (xbody): the bag crosses one plane around the body',
    contribution:   '1 ADD',
    example:        'the kick portion of a clipper; the body-cross in whirl',
  },
  {
    componentClass: 'Spin flag: a rotational primitive in an atom’s flag breakdown',
    contribution:   '1 ADD',
    example:        'osis carries a spin flag: spin(1) + xbod(1) + stall(1) = 3 ADD. See the note below on the three meanings of "spin".',
  },
  {
    componentClass: 'Unusual surface: a catch on a body surface other than the standard toe / instep / outstep / knee',
    contribution:   '1 ADD',
    example:        'head-stall, shoulder-stall, cloud (calf), sole-stall, neck-stall',
  },
  // Operator / modifier contributions, applied on top of a base
  // trick. Organized below by the four-axis operator-board grouping
  // used on /freestyle/tricks?view=movement-system and in the
  // glossary §6 modifier reference. The axis grouping is a
  // pedagogical / organizational convention, NOT a canonical
  // single-valued taxonomy. Unresolved-doctrine weightings are marked TBD.
  {
    componentClass: 'Set / Uptime modifiers: pixie, fairy, atomic, quantum, nuclear, blurry, barraging / furious (pedagogical axis, not an official grouping)',
    contribution:   'pixie / fairy / quantum +1; atomic +1 (a separate +1 X-Dex applies only where [XDEX] appears in the notation of the following dex); nuclear +2 (= paradox + illusion); blurry +1 (implies stepping); barraging +2 (a two-dex set; also called furious).',
    example:        'atomic + mirage = atom smasher = 4 ADD; barraging + osis = baroque = 5 ADD',
  },
  {
    componentClass: 'Entry topology: where the entry dex sits relative to the plant foot and the body centreline, covering the same-side/op, near/far, and planted/no-plant relationships (pedagogical axis, not an official grouping)',
    contribution:   'The placement cues themselves are +0 (see positional cues below); the operators that act on the entry are scored. Paradox is the side-switch relationship between the support leg and the dexterity (the dex crosses the centreline, an xbody traversal); +1. When paradox is the entry it reads CLIP > OP IN [DEX] (its cross-body entry-topology case), but it can also occur mid-trick as a later [PDX] dex, so that form is not paradox in every trick. Symposium is the no-plant case: the support leg leaves the ground through the dex; +1.',
    example:        'paradox + mirage (2) = 3 ADD; CLIP > OP IN [DEX] is paradox as an entry topology, not every paradox',
  },
  {
    componentClass: 'Midtime body modifiers: spinning, ducking, diving, swirling, stepping, tapping, gyro, whirling, miraging, flying (pedagogical axis, not an official grouping)',
    contribution:   'mostly +1 on most bases; gyro +1; whirling / miraging +1 on compatible bases; flying +1 (the jump body-action: flying inside, flying outside, flying clipper).',
    example:        'spinning + osis = spinning osis = 4 ADD; ducking + whirl = ducking whirl = 4 ADD; flying + clipper kick = flying clipper = 2 ADD',
  },
  {
    componentClass: 'Positional / directional cues: same-side (ss) / far / near / reverse / op',
    contribution:   '+0 ADD. Positional cues, not difficulty contributions.',
    example:        'same-side, far, near, and reverse all count as +0',
  },
];

const EDITORIAL_TRUTH_RULE =
  "When a trick's stated ADD differs from what straight addition produces, " +
  'the stated value is the official one and the additive calculation is diagnostic. ' +
  'This is the IFPA editorial contract.';

const INCOMPLETENESS_NOTE =
  "Some compound tricks are folk-named: they exist in the community but their " +
  "structural breakdown isn't settled yet. Those rows carry a " +
  '"pending breakdown refinement" indicator on their dictionary card. ' +
  'They count as full tricks; their structural reading is what’s pending.';

// Disambiguates the three things the word "spin" means on this page, so the
// spin-flag primitive, the spinning operator, and the rotational-character rule
// are not read as one concept.
const SPIN_NOTE =
  '"Spin" means three different things here. A spin flag is a rotational ' +
  'primitive inside an atom: osis is spin(1) + xbody(1) + stall(1) = 3. The ' +
  'spinning operator is a body modifier that adds +1 on top of a base, so ' +
  'spinning osis = 4. Rotational character describes atoms like osis, mirage, ' +
  'and whirl, where the body turns or arcs during the dex. It does not change ' +
  'how atomic counts: atomic is +1 on every base. Any extra point comes from a ' +
  'separate [XDEX] component in the notation. Same word, three layers: the flag is part of the atom, ' +
  'the operator is added on top, and rotational character just describes the ' +
  'movement, not a separate scoring rule.';

// ─────────────────────────────────────────────────────────────────────────
// §2 Worked examples: 8 tricks, low to high
// ─────────────────────────────────────────────────────────────────────────

// Worked examples, ordered by ascending ADD, showing the additive
// arithmetic explicitly. Foundational atoms (1-3 ADD) decompose into
// the four primitives (stall / dex / xbody / spin); compounds (4-5+)
// stack operators on top of those bases.
//
// Treated as educational accounting (per the philosophy paragraph),
// not parser-truth doctrine. The goal is for readers to see WHERE THE
// ADDS COME FROM when reading a trick's name. Where a foundational
// atom's structural decomposition is still under doctrinal discussion,
// the example shows the canonical ADD value and a safe additive
// reading; the deeper parser grammar can refine later without changing
// the public number.
const WORKED_EXAMPLES: readonly AddAnalysisWorkedExample[] = [
  // ── 1 ADD foundational atoms ──────────────────────────────────────────
  {
    trickName:  'Toe-stall',
    trickSlug:  'toe_stall',
    addLabel:   '1 ADD',
    components: 'One stall on the top of the toe.',
    derivation: 'stall(1) = 1 ADD',
    whyNote:    'The simplest accepted catch: a single recognized stall surface. Foundational primitive for the entire stall-based naming system.',
  },
  {
    trickName:  'Cross-body traversal (xbody primitive)',
    trickSlug:  null,
    addLabel:   '1 ADD',
    components: 'Accounting primitive illustrated via clipper motion, not an official named trick. One cross-body traversal in isolation, without a stall finish.',
    derivation: 'xbody(1) = 1 ADD',
    whyNote:    'Establishes xbody as a foundational accounting primitive. The bag crossing one plane around the body contributes 1 ADD wherever it appears: in clipper kicks, in whirl, in butterfly, in osis. Shown here in isolation so the primitive is legible; the official clipper-stall trick (xbody + stall = 2 ADD) appears below.',
  },

  // ── 2 ADD foundational atoms (stall + one other primitive) ────────────
  {
    trickName:  'Clipper-stall',
    trickSlug:  'clipper_stall',
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
    whyNote:    'A dexterity event finishing in a stall: an inward-hippy dex landing on the opposite-side toe. Foundational dexterity primitive (not rotational) that anchors a deep cohort (paradox-mirage, atom-smasher, blur, witchdoctor) via modifier stacks and composite-base readings.',
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
    trickSlug:  'around_the_world',
    addLabel:   '2 ADD',
    components: 'Operational chain: toe > ss in dex > ss toe. One dexterity event that travels fully around the bag, finishing on a toe stall.',
    derivation: 'dex(1) + stall(1) = 2 ADD',
    whyNote:    'The foot carries the bag in a complete orbit before the catch. The circular path is what makes it around-the-world, but for the count it is one dexterity finishing in one stall: the same two-component shape as mirage. Reverse ATW reaches the same 2 ADD; "reverse" is a direction marker (+0), not an additive operator. Orbit is the equivalent name for reverse ATW.',
  },

  // ── 3 ADD foundational atoms (three primitives) ───────────────────────
  {
    trickName:  'Whirl',
    trickSlug:  'whirl',
    addLabel:   '3 ADD',
    components: 'Operational chain: [set] > leggy in dex > ss clipper. Cross-body + dex + stall walked flag-by-flag.',
    derivation: 'xbody(1) + dex(1) + stall(1) = 3 ADD',
    whyNote:    'A rotational dex with same-side clipper terminal: three flag-counting primitives combine into the foundational rotational atom. Anchors a deep family (paradox-whirl, spinning-whirl, ducking-whirl, blurry-whirl, symposium-whirl, mobius via torque branch).',
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
    whyNote:    'A spin flag built into the atom: osis owns the spin-flag sense of the word (see the spin note above). Two major branch compounds, Torque and Blender, are its 4-ADD derivatives, each spawning its own family.',
  },

  // ── Operator visibility: paradox stacked on a base ───────────────────
  {
    trickName:  'Paradox Mirage',
    trickSlug:  'paradox_mirage',
    addLabel:   '3 ADD',
    components: 'Paradox operator (+1) on mirage (2).',
    derivation: 'paradox(+1) + mirage(2) = 3 ADD',
    whyNote:    'Demonstrates how an operator stacks onto a base. Paradox is the side-switch relationship between the support leg and the dexterity; as an entry it reads CLIP > OP IN [DEX], but it can also be a later mid-trick [PDX] dex. On top of mirage it adds +1.',
  },

  // ── 4-5 ADD compounds (operators + bases; Red-settled rulings) ───────
  {
    trickName:  'Torque',
    trickSlug:  'torque',
    addLabel:   '4 ADD',
    components: 'Miraging operator (+1) on osis (3).',
    derivation: 'miraging(+1) + osis(3) = 4 ADD',
    whyNote:    'The official reading of "miraging osis". Anchors its own descendant lineage (paradox-torque, spinning-torque, mobius, gauntlet, atomic-torque, blurry-torque, grave-digger, spinal-tap).',
  },
  {
    trickName:  'Atom Smasher',
    trickSlug:  'atom_smasher',
    addLabel:   '4 ADD',
    components: 'Atomic operator (+1) + mirage (2) + a separate [XDEX] component (+1).',
    derivation: 'atomic(+1) + mirage(2) + xdex(+1) = 4 ADD',
    whyNote:    "Atom smasher's operational notation carries [XDEX] on the far mirage dex, contributing +1. The atomic operator alone adds +1; the X-dex carry adds another +1 above the bare atomic+mirage arithmetic.",
  },
  {
    trickName:  'Blurry Whirl',
    trickSlug:  'blurry_whirl',
    addLabel:   '5 ADD',
    components: 'Stepping (+1) + paradox (+1) + whirl (3).',
    derivation: 'stepping(+1) + paradox(+1) + whirl(3) = 5 ADD',
    whyNote:    'Blurry transitively expands to stepping paradox. The compressed name "blurry whirl" and the expanded reading describe the same trick at different stopping depths. Both are correct.',
  },
  {
    trickName:  'Mobius',
    trickSlug:  'mobius',
    addLabel:   '5 ADD',
    components: 'Gyro operator (+1) on torque (4), or deep-form unfolding.',
    derivation: 'gyro(+1) + torque(4) = 5 ADD   (deep form: spinning(+1) + ss(+0) + miraging(+1) + osis(3) = 5 ADD)',
    whyNote:    'The flagship multi-depth example. Two valid stopping depths reach the same total. Players say mobius; analysts can unfold to either depth.',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// §2b Reading a branch: the Osis family (compositional-grammar ladder)
// ─────────────────────────────────────────────────────────────────────────

// One of the cleanest demonstrations of compositional grammar: one atom, three
// operators, a whole lineage. Uses only accepted decompositions; no new doctrine.
export interface AddAnalysisBranchStep {
  trickName: string;
  trickSlug: string;
  reading:   string;   // "miraging Osis"
  total:     string;   // "+1 → 4 ADD"
}

const OSIS_BRANCH_FRAMING =
  'One atom, three operators, a whole lineage. Each step is a single operator ' +
  'on the trick before it: read the name, add the operator, get the number.';

const OSIS_BRANCH_LADDER: readonly AddAnalysisBranchStep[] = [
  { trickName: 'Osis',    trickSlug: 'osis',    reading: 'spin(1) + xbody(1) + stall(1)', total: '3 ADD' },
  { trickName: 'Torque',  trickSlug: 'torque',  reading: 'miraging Osis',                 total: '+1 → 4 ADD' },
  { trickName: 'Blender', trickSlug: 'blender', reading: 'whirling Osis',                  total: '+1 → 4 ADD' },
  { trickName: 'Mobius',  trickSlug: 'mobius',  reading: 'gyro Torque',                    total: '+1 → 5 ADD' },
];

// ─────────────────────────────────────────────────────────────────────────
// §3 ADD Discrepancies & Why They Happen: 10 ship-now-safe cases
// ─────────────────────────────────────────────────────────────────────────

const DISCREPANCY_CASES: readonly AddAnalysisDiscrepancyCase[] = [
  {
    caseId:                  'DC-01',
    trickName:               'Hurl (Nuclear ss Whirl)',
    trickSlug:               null,
    ifpaAdd:                 '5',
    externalSourceLabel:     'Outside source',
    externalAdd:             '4',
    delta:                   '−1',
    decompositionDifference: 'IFPA counts ss as +0; an outside source treats it as ADD-additive in some entries.',
    pattern:                 'positional operator',
    ifpaStatusLine:          'settled (SS=+0 universal)',
  },
  {
    caseId:                  'DC-02',
    trickName:               'Barfry (Nuclear ss Butterfly)',
    trickSlug:               null,
    ifpaAdd:                 '5',
    externalSourceLabel:     'Outside source',
    externalAdd:             '4',
    delta:                   '−1',
    decompositionDifference: 'Same SS pattern as Hurl, applied to butterfly base.',
    pattern:                 'positional operator',
    ifpaStatusLine:          'settled',
  },
  {
    caseId:                  'DC-03',
    trickName:               'Godzilla (Nuclear ss Dyno)',
    trickSlug:               null,
    ifpaAdd:                 '6',
    externalSourceLabel:     'Outside source',
    externalAdd:             '5',
    delta:                   '−1',
    decompositionDifference: 'Same SS pattern as Hurl, applied to dyno base.',
    pattern:                 'positional operator',
    ifpaStatusLine:          'settled',
  },
  {
    caseId:                  'DC-04',
    trickName:               'Blurry Whirl ≡ Stepping Paradox Whirl',
    trickSlug:               'blurry_whirl',
    ifpaAdd:                 '5',
    externalSourceLabel:     'IFPA (compressed vs expanded)',
    externalAdd:             '5',
    delta:                   '0',
    decompositionDifference: 'Two readings; one ADD. The compressed form ("blurry whirl") and the expanded form ("stepping paradox whirl") describe the same trick at different stopping depths.',
    pattern:                 'compression vs expansion',
    ifpaStatusLine:          'settled',
  },
  {
    caseId:                  'DC-05',
    trickName:               'Blurry Torque ≡ Stepping Paradox Torque',
    trickSlug:               'blurry_torque',
    ifpaAdd:                 '6',
    externalSourceLabel:     'IFPA (compressed vs expanded)',
    externalAdd:             '6',
    delta:                   '0',
    decompositionDifference: 'Same compression pattern as Blurry Whirl, applied to a compound base (torque = miraging osis).',
    pattern:                 'compression vs expansion (transitive across compound bases)',
    ifpaStatusLine:          'settled',
  },
  {
    caseId:                  'DC-06',
    trickName:               'Food Processor ≡ Stepping Paradox Blender',
    trickSlug:               'food_processor',
    ifpaAdd:                 '6',
    externalSourceLabel:     'IFPA (compressed vs expanded)',
    externalAdd:             '6',
    delta:                   '0',
    decompositionDifference: 'The folk name is itself a compression. stepping (+1) + paradox (+1) + blender (4) = 6. Blender is itself a compound (whirling osis), so the compression cascades through.',
    pattern:                 'compression vs expansion on a compound base',
    ifpaStatusLine:          'settled',
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
    ifpaStatusLine:          'settled',
  },
  {
    caseId:                  'DC-08',
    trickName:               'Atom Smasher ≡ Atomic Mirage',
    trickSlug:               'atom_smasher',
    ifpaAdd:                 '4',
    externalSourceLabel:     'IFPA (hidden mechanism)',
    externalAdd:             '4',
    delta:                   '0',
    decompositionDifference: "The arithmetic-only reading would be atomic (+1) + mirage (2) = 3. Atom-smasher's notation carries [XDEX] on the mirage dex, adding +1 for 4.",
    pattern:                 'hidden mechanism (X-dex preservation)',
    ifpaStatusLine:          'settled (X-dex carry from a toe)',
  },
  {
    caseId:                  'DC-09',
    trickName:               'Baroque (Barraging Osis)',
    trickSlug:               'barraging_osis',
    ifpaAdd:                 '5',
    externalSourceLabel:     'IFPA (operator class)',
    externalAdd:             '5',
    delta:                   '0',
    decompositionDifference: 'Barraging’s contribution to Baroque is structural: it multiplies the dex count rather than adding as a body modifier. Two dexes (+2) + osis (3) = 5.',
    pattern:                 'operator class (structural dex-multiplier)',
    ifpaStatusLine:          'settled (Baroque named ruling)',
  },
  {
    caseId:                  'DC-10',
    trickName:               'Bladerunner (outside source: Atomic Eggbeater)',
    trickSlug:               null,
    ifpaAdd:                 '4',
    externalSourceLabel:     'Outside source',
    externalAdd:             '5',
    delta:                   '+1',
    decompositionDifference: "FM names Bladerunner as \"Atomic Eggbeater\". IFPA's eggbeater is already atomic legover; FM's name applies atomic recursively, IFPA's official math doesn't.",
    pattern:                 'recursive operator application',
    ifpaStatusLine:          'settled (eggbeater = atomic legover)',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// §3b Edge cases: brief mentions
// ─────────────────────────────────────────────────────────────────────────

const EDGE_CASES: readonly AddAnalysisEdgeCase[] = [
  {
    trickName:  'Sumo (Nuclear Mirage)',
    trickSlug:  'sumo',
    ifpaAdd:    '5',
    briefNote:  "Sumo's 5 ADD reflects the [XDEX] flag in its operational notation.",
  },
  {
    trickName:  'Genesis (outside source: Furious Whirl)',
    trickSlug:  null,
    ifpaAdd:    '5',
    briefNote:  "Genesis (FM-named \"Furious Whirl\" at 7 ADD) is +2 above IFPA's official 5. The +2 traces to FM's earlier rotational-escalation convention which IFPA retired (rotational bases get a flat +1 per modifier rather than progressive scaling).",
  },
];

// ─────────────────────────────────────────────────────────────────────────
// §4 Interpretation notes: 3 closing paragraphs
// ─────────────────────────────────────────────────────────────────────────

const CLOSING_PARAGRAPHS: readonly string[] = [
  // Why disagreements exist: 3 recurring reasons
  'Three recurring reasons disagreements exist:',
  'Positional vs additive: same-side, far, near, and reverse are positional cues in IFPA’s framing. Some external sources count them as ADD-additive.',
  'Compression vs expansion: many tricks have multiple legitimate stopping depths. Players use the shortest folk name; analysts may unfold to deeper structural readings. Both arrive at the same ADD.',
  'Historical evolution: the operator vocabulary has refined over time. Earlier conventions (rotational escalation, recursive atomic application) produce different totals than the modern conventions.',
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
// /freestyle/add-analysis (PassBack-vs-IFPA counting reconciliation).
export const FREESTYLE_ADD_ANALYSIS_CONTENT: AddAnalysisContent = {
  philosophyParagraph:    PHILOSOPHY_PARAGRAPH,
  editorialTruthRule:     EDITORIAL_TRUTH_RULE,
  incompletenessNote:     INCOMPLETENESS_NOTE,
  spinNote:               SPIN_NOTE,
  componentClasses:       COMPONENT_CLASSES,
  workedExamples:         WORKED_EXAMPLES,
  osisBranchFraming:      OSIS_BRANCH_FRAMING,
  osisBranch:             OSIS_BRANCH_LADDER,
  discrepancyCases:       DISCREPANCY_CASES,
  edgeCases:              EDGE_CASES,
  passbackAddFraming:     PASSBACK_ADD_FRAMING_PROSE,
  passbackAddDisagreements: PASSBACK_ADD_DISAGREEMENTS,
  resolvedFormulasFraming: RESOLVED_FORMULAS_FRAMING_PROSE,
  resolvedFormulas:        RESOLVED_FORMULAS_SPRINT_1,
  closingParagraphs:      CLOSING_PARAGRAPHS,
  crossLinks:             CROSS_LINKS,
};

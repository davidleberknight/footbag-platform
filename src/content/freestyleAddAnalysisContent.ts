/**
 * freestyleAddAnalysisContent.ts
 * ===============================
 *
 * Curator-authored content for the ADD Analysis page (/freestyle/add-analysis).
 * This module supplies:
 *
 *   How ADD is built: the bracket rule, the component contribution table and
 *     the short notes beneath it
 *   Worked examples (six tricks, low to high)
 *   Why sources disagree: the three recurring reasons
 *
 * Plus: philosophy intro paragraph and cross-link inventory.
 *
 * The page teaches how to read a formula; the dictionary and the trick pages
 * own the formulas themselves, and the operator reference and Freestyle
 * Concepts own the per-operator detail.
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
 *   - Wording uses the settled lexicon: "differs from", "decomposes
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

export interface AddAnalysisCrossLink {
  label: string;
  href:  string;
}

export interface AddAnalysisContent {
  philosophyParagraph:      string;
  editorialTruthRule:       string;
  incompletenessNote:       string;
  spinNote:                 string;
  bracketRuleNote:          string;
  xdexNote:                 string;
  delayNote:                string;
  compositeNote:            string;
  componentClasses:         readonly AddAnalysisComponent[];
  workedExamples:           readonly AddAnalysisWorkedExample[];
  closingParagraphs:        readonly string[];
  crossLinks:               readonly AddAnalysisCrossLink[];
}

// ─────────────────────────────────────────────────────────────────────────
// Philosophy intro
// ─────────────────────────────────────────────────────────────────────────

const PHILOSOPHY_PARAGRAPH =
  'The IFPA (International Footbag Players Association) attempts to provide a structural reading for every accepted trick. ' +
  'Some readings are exact. ' +
  'Some are approximate: readable through known operator vocabulary but ' +
  'not yet settled. Many ' +
  'tricks admit multiple valid structural readings: ' +
  'the compressed folk name and one or more deeper expansions ' +
  'all describing the same trick. ' +
  "When a trick is here, we say what we think it's " +
  "made of, and when we're unsure, we say that too.";

// ─────────────────────────────────────────────────────────────────────────
// How ADD is built: component contribution table
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
    example:        'toe-stall, neck-stall',
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
    componentClass: 'Spin flag: a rotational component in a base trick’s flag breakdown',
    contribution:   '1 ADD',
    example:        'osis carries a spin flag: spin(1) + xbod(1) + stall(1) = 3 ADD',
  },
  {
    componentClass: 'Unusual surface: a catch on a body surface other than the standard toe / instep / outstep / knee',
    contribution:   '1 ADD',
    example:        'head-stall, shoulder-stall, cloud (calf), sole-stall, neck-stall, thigh catch, pincher',
  },
  // Operator / modifier contributions, applied on top of a base trick. The
  // per-operator detail (X-Dex conditions, composite readings, historical
  // names) lives on the operator reference and in Freestyle Concepts; each
  // row here gives only the component, its score and one example.
  {
    componentClass: 'Set / Uptime modifiers: pixie, fairy, atomic, quantum, nuclear, blurry, furious',
    contribution:   'pixie / fairy / quantum / atomic +1; nuclear +2; furious +2; blurry is scored per trick, not a fixed weight',
    example:        'quantum + osis = torque = 4 ADD',
  },
  {
    componentClass: 'Paradox and symposium: paradox is the side switch between the support leg and the dexterity ([PDX]); symposium is the no-plant dex',
    contribution:   '+1 each',
    example:        'paradox + mirage (2) = 3 ADD',
  },
  {
    componentClass: 'Midtime body modifiers: spinning, ducking, diving, swirling, stepping, tapping, gyro, whirling, flying',
    contribution:   'mostly +1 on most bases',
    example:        'spinning + osis = spinning osis = 4 ADD',
  },
  {
    componentClass: 'Positional / directional cues: same-side (ss) / far / near / reverse / op',
    contribution:   '+0 ADD. Positional cues, not difficulty contributions (near and far are other names for SAME and OP).',
    example:        'same-side, far, near, and reverse all count as +0',
  },
];

const EDITORIAL_TRUTH_RULE =
  "When a trick's stated ADD differs from what straight addition produces, " +
  'the stated value is the official one and the additive calculation is diagnostic.';

const INCOMPLETENESS_NOTE =
  "Some compound tricks are folk-named: they exist in the community but their " +
  "structural breakdown isn't settled yet. Those rows carry a " +
  '"pending breakdown refinement" indicator on their dictionary card. ' +
  'They count as full tricks; their structural reading is what’s pending.';

// Disambiguates the three things the word "spin" means on this page, so the
// spin-flag primitive, the spinning operator, and the rotational-character rule
// are not read as one concept. The template follows it with a link to the
// spinning modifier page.
const SPIN_NOTE =
  '"Spin" means three different things: a spin flag is part of a base trick ' +
  '(osis), the spinning operator adds +1 on top of a base (spinning osis = 4), ' +
  'and rotational character just describes the movement, not a separate ' +
  'scoring rule.';

// The single load-bearing rule of the whole page: the bracketed notation IS the
// ADD, itemized. Stated up front so every worked example below reads as a
// verification of it rather than a separate fact.
const BRACKET_RULE_NOTE =
  "A trick's operational notation is written as a sequence of bracketed " +
  'components, and the number of scoring brackets equals its published ADD. ' +
  'Reading left to right, each one counts one: [DEX] a dexterity, [BOD] a body ' +
  'movement such as a spin or a duck, [XBD] a cross-body traversal, [PDX] a ' +
  'paradox, [DEL] a stall (the catch), [UNS] an unusual-surface catch, and ' +
  '[XDEX] a cross-dex bonus. The notation is not just a description of the ' +
  'movement; it is the score, spelled out. Wherever a page shows the notation ' +
  'and the number together, the brackets and the number agree.';

// The X-Dex is the most misread contributor. The notation decides it, so the
// page states only that rule; the template links to the X-Dex entry in
// Freestyle Concepts, which owns the detail.
const XDEX_NOTE =
  'The X-Dex is a single extra point, scored only where the notation carries ' +
  "an [XDEX] bracket on a dex. It is its own component, never part of a modifier's own weight.";

// The stall is the one bracket a reader tends to assume rather than count, so
// the multiple-stall case (jump-class tricks) is named explicitly. This passage
// is also the single place the prose accounts for the bracket reading DEL: the
// notation abbreviates delay, the older word for the same catch, while every
// trick name and every other surface says stall.
const DELAY_NOTE =
  'A stall is a controlled catch, and it counts one. The notation writes it ' +
  '[DEL], from delay, the older word for the same catch. Most tricks end in a ' +
  'single stall; a jump-class trick catches in mid-flight and again on landing, ' +
  'so it shows two [DEL] brackets and counts both.';

// Composite operators: names that are shorthand for a combination, scored as
// the sum of their parts. One settled example; the operator reference carries
// the rest.
const COMPOSITE_NOTE =
  'A few operator names are shorthand for a combination, and they score as the ' +
  'sum of their parts: Nuclear is a paradox plus a downtime illusion, adding two.';

// ─────────────────────────────────────────────────────────────────────────
// Worked examples: six tricks, low to high
// ─────────────────────────────────────────────────────────────────────────

// Worked examples, ordered by ascending ADD, showing the additive arithmetic
// explicitly. Each teaches a different scoring idea: a single stall, a dex
// plus a stall, three primitives, an operator on a base, an explicit [XDEX],
// and two stopping depths reaching one total. Treated as educational
// accounting, not parser-truth doctrine.
const WORKED_EXAMPLES: readonly AddAnalysisWorkedExample[] = [
  {
    trickName:  'Toe-stall',
    trickSlug:  'toe_stall',
    addLabel:   '1 ADD',
    components: 'One stall on the top of the toe.',
    derivation: 'stall(1) = 1 ADD',
    whyNote:    'The simplest accepted catch: a single recognized stall surface. Foundational primitive for the entire stall-based naming system.',
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
    trickName:  'Whirl',
    trickSlug:  'whirl',
    addLabel:   '3 ADD',
    components: 'Operational chain: [set] > leggy in dex > op clipper. Cross-body + dex + stall walked flag-by-flag.',
    derivation: 'xbody(1) + dex(1) + stall(1) = 3 ADD',
    whyNote:    'A rotational dex with an opposite-side clipper terminal: three scoring components combine into this foundational move. Anchors a deep family (paradox-whirl, spinning-whirl, ducking-whirl, blurry-whirl, symposium-whirl, mobius via torque branch).',
  },
  {
    trickName:  'Paradox Mirage',
    trickSlug:  'paradox_mirage',
    addLabel:   '3 ADD',
    components: 'Paradox operator (+1) on mirage (2).',
    derivation: 'paradox(+1) + mirage(2) = 3 ADD',
    whyNote:    'Demonstrates how an operator stacks onto a base. Paradox is the side-switch relationship between the support leg and the dexterity; as an entry it reads CLIP > OP IN [DEX], but it can also be a later mid-trick [PDX] dex. On top of mirage it adds +1.',
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
    trickName:  'Mobius',
    trickSlug:  'mobius',
    addLabel:   '5 ADD',
    components: 'Gyro operator (+1) on torque (4), or deep-form unfolding.',
    derivation: 'gyro(+1) + torque(4) = 5 ADD   (deep form: spinning(+1) + ss(+0) + quantum(+1) + osis(3) = 5 ADD)',
    whyNote:    'The flagship multi-depth example. Two valid stopping depths reach the same total. Players say mobius; analysts can unfold to either depth.',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Why sources disagree: the three recurring reasons
// ─────────────────────────────────────────────────────────────────────────

const CLOSING_PARAGRAPHS: readonly string[] = [
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
  { label: 'Freestyle Concepts: Trick Naming & Notation', href: '/freestyle/concepts#section-notation' },
  { label: 'Freestyle Concepts: ADD Accounting',          href: '/freestyle/concepts#traditional-reference' },
  { label: 'Freestyle History',                href: '/freestyle/history' },
];

// ─────────────────────────────────────────────────────────────────────────
// Public assembled content
// ─────────────────────────────────────────────────────────────────────────

export const FREESTYLE_ADD_ANALYSIS_CONTENT: AddAnalysisContent = {
  philosophyParagraph:    PHILOSOPHY_PARAGRAPH,
  editorialTruthRule:     EDITORIAL_TRUTH_RULE,
  incompletenessNote:     INCOMPLETENESS_NOTE,
  spinNote:               SPIN_NOTE,
  bracketRuleNote:        BRACKET_RULE_NOTE,
  xdexNote:               XDEX_NOTE,
  delayNote:              DELAY_NOTE,
  compositeNote:          COMPOSITE_NOTE,
  componentClasses:       COMPONENT_CLASSES,
  workedExamples:         WORKED_EXAMPLES,
  closingParagraphs:      CLOSING_PARAGRAPHS,
  crossLinks:             CROSS_LINKS,
};

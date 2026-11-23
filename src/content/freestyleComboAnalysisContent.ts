/**
 * freestyleComboAnalysisContent.ts
 * =================================
 *
 * Page copy for the public `/freestyle/combo-analysis` page: how tricks link
 * into runs. Pure editorial content; no database access.
 *
 * Page sections: run-quality terminology, worked examples, further reading.
 */

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface ComboAnalysisRunQualityEntry {
  /** Anchor id, e.g. 'run-quality-guiltless'. */
  anchorId:   string;
  /** Term as displayed, e.g. 'Guiltless'. */
  term:       string;
  /** One-line definition. */
  definition: string;
}

export interface ComboAnalysisWorkedExample {
  /** Anchor id, e.g. 'example-canonical-pair'. */
  anchorId:    string;
  /** Title, e.g. 'Example 1: Blurry Whirl → Whirl (opener to closer)'. */
  title:       string;
  /** Pre-shaped plain-text diagram. */
  diagram:     string;
  /** Total ADD line, e.g. 'Total: 8 ADD across 2 tricks'. */
  totalLine:   string;
  /** One short prose paragraph: what's happening. */
  whatHappens: string;
  /** Why-it-works bullet points. */
  whyItWorks:  readonly string[];
}

export interface ComboAnalysisCrossLink {
  href:        string;
  label:       string;
  description: string;
}

export interface ComboAnalysisContent {
  runQualityIntro:   string;
  runQualityEntries: readonly ComboAnalysisRunQualityEntry[];
  workedExamples:    readonly ComboAnalysisWorkedExample[];
  crossLinks:        readonly ComboAnalysisCrossLink[];
}

// ─────────────────────────────────────────────────────────────────────────
// Run-quality terminology
// ─────────────────────────────────────────────────────────────────────────

const RUN_QUALITY_INTRO =
  'These describe the difficulty floor of a string, an unbroken chain of linked tricks, ' +
  'not the difficulty of any individual trick. A "guiltless" string means every trick ' +
  'in it cleared the 3-ADD threshold; the first trick below 3 ends the string. The IFPA ' +
  'rules name Tiltless, Guiltless and Tripless; Fearless, Beastly and Godly are community ' +
  'terms that carry the idea higher.';

export const RUN_QUALITY_ENTRIES: readonly ComboAnalysisRunQualityEntry[] = [
  { anchorId: 'run-quality-tiltless',  term: 'Tiltless',  definition: 'Every trick in the string reaches at least ADD 2.' },
  { anchorId: 'run-quality-guiltless', term: 'Guiltless', definition: 'Every trick reaches at least ADD 3.' },
  { anchorId: 'run-quality-tripless',  term: 'Tripless',  definition: 'Every trick reaches at least ADD 4.' },
  { anchorId: 'run-quality-fearless',  term: 'Fearless',  definition: 'Every trick reaches at least ADD 5.' },
  { anchorId: 'run-quality-beastly',   term: 'Beastly',   definition: 'Every trick reaches at least ADD 6.' },
  { anchorId: 'run-quality-godly',     term: 'Godly',     definition: 'Every trick reaches at least ADD 7. Aspirational; rarely sustained.' },
  { anchorId: 'run-quality-genuine',   term: 'Genuine',   definition: 'Guiltless excluding BOP tricks.' },
  { anchorId: 'run-quality-bop',       term: 'BOP',       definition: 'Butterfly, Osis, Paradox Mirage (a named exception set used in Genuine derivation).' },
  { anchorId: 'format-sick3',          term: 'Sick3',     definition: 'A three-trick scored sequence; pure-difficulty format with no execution credit. The cleanest window into maximum-ADD capability.' },
  { anchorId: 'format-shred-30',       term: 'Shred:30',  definition: 'A timed technical scoring format.' },
  { anchorId: 'concept-density',       term: 'Density',   definition: 'Average ADD per trick across a run; the metric that distinguishes concentration from breadth strategies.' },
  { anchorId: 'concept-run',           term: 'Run',       definition: 'A continuous performance unit. Two to three minutes in a routine; three tricks in Sick3; one timed window in Shred:30.' },
];

// ─────────────────────────────────────────────────────────────────────────
// Worked examples
// ─────────────────────────────────────────────────────────────────────────

const WORKED_EXAMPLES: readonly ComboAnalysisWorkedExample[] = [
  {
    anchorId:    'example-canonical-pair',
    title:       'Example 1: Blurry Whirl → Whirl (opener to closer)',
    diagram:     'blurry whirl  →  whirl\n   5 ADD          3 ADD',
    totalLine:   'Total: 8 ADD across 2 tricks (density 4.0)',
    whatHappens: 'The player opens with a high-ADD rotational element (blurry whirl, 5 ADD), then resolves to whirl\'s stable clipper-stall landing.',
    whyItWorks:  [
      'Difficulty announcement: opening with the high-ADD element signals competitive intent immediately. The judge sees the commitment in the first beat.',
      'Risk management: resolving to whirl gives the body a stable termination on a familiar surface. The hardest moment of the combo is also the moment when fatigue is lowest.',
      'Mechanical compatibility: both tricks live in the whirl family; the body position at the end of blurry whirl flows directly into whirl\'s entry.',
    ],
  },
  {
    anchorId:    'example-walking-ladder',
    title:       'Example 2: Smear → Dimwalk → Ripwalk (the walking ladder)',
    diagram:     'smear  →  dimwalk  →  ripwalk  →  (resolution)\n           4 ADD       4 ADD',
    totalLine:   'Total: 8+ ADD across 3+ tricks (density ~3.0)',
    whatHappens: 'A walking-trick chain. Smear opens with a low-ADD movement, dimwalk extends through a 4-ADD throughput, ripwalk continues the walking pattern, and the chain typically resolves to a rotational element afterward.',
    whyItWorks:  [
      'Throughput pacing: dimwalk has high outbound transition count and low inbound count. Players reach for it specifically because it leads somewhere.',
      'Family consistency: the walking family (smear / dimwalk / ripwalk / parkwalk) shares mechanical conventions; chaining within a family reduces cognitive load mid-sequence.',
      'Resolution flexibility: the chain doesn\'t commit to a specific terminus; the player chooses whirl, blur, or another rotational element based on body state at exit.',
    ],
  },
  {
    anchorId:    'example-cross-family-launch',
    title:       'Example 3: Butterfly → Blurry Whirl (cross-family launch)',
    diagram:     'butterfly   →   blurry whirl   →   (resolution)\n  3 ADD            5 ADD',
    totalLine:   'Total: 8+ ADD across 2+ tricks',
    whatHappens: 'Butterfly opens at moderate ADD, then the player escalates immediately to blurry whirl. The chain extends with whatever resolution the body permits.',
    whyItWorks:  [
      'Setup that creates space: butterfly\'s mechanics free the body for the high-rotation entry that blurry whirl demands. Without an entry move, blurry whirl is much harder to initiate cleanly.',
      'Cross-family transition: butterfly and blurry whirl are in different families. The chain demonstrates compositional vocabulary mastery; players prove they can move between movement systems within a single sequence.',
      'Difficulty escalation: unlike Example 1\'s flat 5→3 architecture, this opens at 3 and escalates to 5, a "rising" sequence.',
    ],
  },
  {
    anchorId:    'example-difficulty-stacking',
    title:       'Example 4: Food Processor → Mobius (difficulty stacking)',
    diagram:     'food processor  →  mobius\n   6 ADD             5 ADD',
    totalLine:   'Total: 11 ADD across 2 tricks (density 5.5; no recovery between)',
    whatHappens: 'Two ultra-high-ADD tricks chained back-to-back with no low-ADD recovery between. The player commits to maximum difficulty across both positions.',
    whyItWorks:  [
      'No recovery slot: most high-ADD sequences insert a stabilizer (whirl → whirl, legover → legover) between two hard tricks. This sequence skips that.',
      'Compound fatigue: mobius (gyro torque) demands precise rotational control immediately after food processor (blurry symposium whirl). The transition window is tight.',
      'One-miss collapse: concentration strategy at its extreme. Either both tricks land or the sequence fails entirely.',
    ],
  },
  {
    anchorId:    'example-breadth-via-length',
    title:       'Example 5: A long breadth chain (breadth via length)',
    diagram:     'butterfly → whirl → osis → dimwalk → osis → butterfly → swirl\n    3        3       3        4       3        3         3',
    totalLine:   'Seven tricks of 3 or 4 ADD: the total comes from length.',
    whatHappens: 'No modifier compounds and no maximum-ADD elements: the total comes from sequence length rather than per-trick difficulty.',
    whyItWorks:  [
      'Recovery built in: the two osis positions let the body reset mid-chain.',
      'Rotational anchor: the chain alternates between butterfly-family and whirl/swirl-family elements, keeping rotational continuity.',
      'Composure as the bottleneck: the risk is fatigue or distraction across seven elements, not peak technical demand.',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Further reading
// ─────────────────────────────────────────────────────────────────────────

const CROSS_LINKS: readonly ComboAnalysisCrossLink[] = [
  { href: '/freestyle/add-analysis', label: 'ADD Accounting & Analysis', description: 'how a single trick\'s ADD is built.' },
  { href: '/freestyle/tricks',       label: 'Trick Dictionary',          description: 'every trick, by ADD, family, set or modifier.' },
  { href: '/freestyle/history',      label: 'Freestyle History',         description: 'the eras and the players who shaped them.' },
];

// ─────────────────────────────────────────────────────────────────────────
// Final export
// ─────────────────────────────────────────────────────────────────────────

export const FREESTYLE_COMBO_ANALYSIS_CONTENT: ComboAnalysisContent = {
  runQualityIntro:   RUN_QUALITY_INTRO,
  runQualityEntries: RUN_QUALITY_ENTRIES,
  workedExamples:    WORKED_EXAMPLES,
  crossLinks:        CROSS_LINKS,
};

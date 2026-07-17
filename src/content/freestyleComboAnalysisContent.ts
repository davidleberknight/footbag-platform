/**
 * freestyleComboAnalysisContent.ts
 * =================================
 *
 * Curator content for the public `/freestyle/combo-analysis` page.
 *
 * Mirrors the `freestyleAddAnalysisContent.ts` pattern: pure editorial
 * content modules; no DB access; no parser-derived data; no fabricated
 * formulas.
 *
 * Page architecture:
 *   §1 Philosophy (~150 words)
 *   §2 Run-quality terminology
 *   §3 Sequence architecture
 *   §4 Difficulty architecture
 *   §5 Worked examples (5)
 *   §6 Transition topology
 *   §7 Honesty + uncertainty (caveats)
 *   §8 Cross-references
 *
 * No code edits, no DB writes, no parser exposure. This page operates at
 * the SEQUENCE level above the trick dictionary, parallel to ADD Analysis
 * which operates at the trick-decomposition level.
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

export interface ComboAnalysisArchitectureTerm {
  /** Anchor id within the section, e.g. 'setup-trick'. */
  anchorId:   string;
  /** Term, e.g. 'Setup trick'. */
  term:       string;
  /** One-paragraph definition. */
  definition: string;
}

export interface ComboAnalysisArchitectureSection {
  /** Section anchor id, e.g. 'sequence-architecture'. */
  anchorId:   string;
  /** H3 heading. */
  heading:    string;
  /** Section lede. */
  lede:       string;
  /** Term entries. */
  terms:      readonly ComboAnalysisArchitectureTerm[];
}

export interface ComboAnalysisWorkedExample {
  /** Anchor id, e.g. 'example-blurry-whirl-whirl'. */
  anchorId:    string;
  /** Title, e.g. 'Blurry Whirl → Whirl (the canonical pair)'. */
  title:       string;
  /** Pre-shaped notation diagram (ASCII or plain text). */
  diagram:     string;
  /** Total ADD line, e.g. 'Total: 8 ADD across 2 tricks'. */
  totalLine:   string;
  /** One short prose paragraph: what's happening. */
  whatHappens: string;
  /** Why-it-works bullet points. */
  whyItWorks:  readonly string[];
  /** Concepts surfaced (links to §3/§4 anchors when relevant). */
  conceptsSurfaced: readonly { anchorId: string; label: string }[];
  /** Corpus frequency note. */
  corpusNote:  string;
}

export interface ComboAnalysisTopologyPattern {
  /** Anchor id. */
  anchorId:    string;
  /** Pattern name. */
  name:        string;
  /** One-paragraph definition. */
  definition:  string;
}

export interface ComboAnalysisCrossLink {
  href:        string;
  label:       string;
  description: string;
}

export interface ComboAnalysisContent {
  philosophyParagraphs:  readonly string[];
  runQualityIntro:       string;
  runQualityEntries:     readonly ComboAnalysisRunQualityEntry[];
  architectureSections:  readonly ComboAnalysisArchitectureSection[];
  workedExamples:        readonly ComboAnalysisWorkedExample[];
  topologyIntro:         string;
  topologyPatterns:      readonly ComboAnalysisTopologyPattern[];
  caveats:               readonly string[];
  crossLinks:            readonly ComboAnalysisCrossLink[];
}

// ─────────────────────────────────────────────────────────────────────────
// §1 Philosophy
// ─────────────────────────────────────────────────────────────────────────

const PHILOSOPHY_PARAGRAPHS: readonly string[] = [
  "Freestyle runs are not random collections of tricks. They form structured movement phrases, with setup mechanics, transitions, recovery points, and resolution patterns. The vocabulary players use to talk about these structures has evolved alongside the trick vocabulary itself, and this page documents what's emerged.",
  "This page assumes familiarity with individual tricks (see the Trick Dictionary) and with how ADD is constructed (see ADD Accounting & Analysis). It operates at the level above both: how the tricks combine.",
];

// ─────────────────────────────────────────────────────────────────────────
// §2 Run-quality terminology
// ─────────────────────────────────────────────────────────────────────────

const RUN_QUALITY_INTRO =
  'These describe the difficulty floor of a run (a continuous performance unit), ' +
  'not the difficulty of any individual trick. A "guiltless" run means every trick ' +
  'in it cleared the 3-ADD threshold; the term says nothing about which specific tricks.';

export const RUN_QUALITY_ENTRIES: readonly ComboAnalysisRunQualityEntry[] = [
  { anchorId: 'run-quality-tiltless',  term: 'Tiltless',  definition: 'Every trick in the run reaches at least ADD 2.' },
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
// §3 Sequence architecture + §4 Difficulty architecture
// ─────────────────────────────────────────────────────────────────────────

const SEQUENCE_ARCHITECTURE_TERMS: readonly ComboAnalysisArchitectureTerm[] = [
  {
    anchorId:   'setup-trick',
    term:       'Setup trick',
    definition: 'A lower-difficulty opening that creates favorable body position for what follows. Often a base-trick anchor (butterfly, whirl, mirage) at the start of a chain.',
  },
  {
    anchorId:   'resolution-trick',
    term:       'Resolution trick',
    definition: 'A higher-difficulty rotational landing where the sequence comes to rest. Frequently a clipper-stable element (whirl, swirl, torque) that gives the body a controlled termination.',
  },
  {
    anchorId:   'launch-node',
    term:       'Launch node',
    definition: 'A trick that disproportionately opens combos: players reach for it first when starting a sequence. Blurry whirl is the corpus\'s strongest launch node (hub score 0.695): the most-documented opening trick in 22 years of Sick3 sequences.',
  },
  {
    anchorId:   'attractor',
    term:       'Attractor (terminus)',
    definition: 'A trick that disproportionately closes combos: sequences gravitate to it. Whirl is the corpus\'s strongest attractor (authority score 0.863, PageRank 0.126): more sequences resolve to whirl than to any other trick.',
  },
  {
    anchorId:   'throughput-trick',
    term:       'Throughput trick',
    definition: 'A connector that appears mid-sequence; rarely opens or closes. Dimwalk is the corpus\'s strongest throughput trick (out-degree 23 vs in-degree 15): players reach for it because it leads somewhere.',
  },
  {
    anchorId:   'sink',
    term:       'Sink',
    definition: 'A trick that absorbs sequence flow but rarely chains onward. Swirl tends to behave this way: high authority but low hub score: once players are in swirl, they tend to stay or end there.',
  },
  {
    anchorId:   'pure-terminus',
    term:       'Pure terminus',
    definition: 'A trick that appears at the end of a sequence and almost nowhere else. Superfly is the cleanest example: out-degree 1, nothing reliably follows it.',
  },
  {
    anchorId:   'stabilization',
    term:       'Stabilization',
    definition: 'A move that resets the body to a controlled state mid-sequence. Distinct from resolution: stabilization happens within a chain rather than at its end.',
  },
  {
    anchorId:   'recovery-trick',
    term:       'Recovery trick',
    definition: 'A low-difficulty element inserted between high-difficulty work to reclaim composure. The "I needed a beat" maneuver. Documented examples: whirl → whirl (10×), legover → legover (3×), clipper → clipper (2×).',
  },
];

const DIFFICULTY_ARCHITECTURE_TERMS: readonly ComboAnalysisArchitectureTerm[] = [
  {
    anchorId:   'concentration-strategy',
    term:       'Concentration strategy',
    definition: 'Few tricks (2–3), each averaging 5–6 ADD. The "depth" approach. Reaches high totals through per-trick difficulty rather than length. Risk: one missed trick collapses the sequence. Brad Nelson\'s 15-ADD chain in 3 tricks is the canonical example.',
  },
  {
    anchorId:   'breadth-strategy',
    term:       'Breadth strategy',
    definition: 'More tricks (4–7), each averaging 3–4 ADD. The "length" approach. Reaches high totals through sequence length rather than per-trick difficulty. Risk: an error mid-sequence breaks accumulation. Greg Solis\'s 22-ADD chain in 7 tricks is the corpus maximum.',
  },
  {
    anchorId:   'per-trick-density',
    term:       'Per-trick ADD density',
    definition: 'Average ADD divided by trick count: the metric that distinguishes concentration from breadth. ≥5.0 indicates concentration; ≤3.5 indicates breadth.',
  },
  {
    anchorId:   'sequence-risk',
    term:       'Sequence risk',
    definition: 'The collapse mode appropriate to a given architecture. Concentration risks single-miss collapse; breadth risks accumulation-break.',
  },
  {
    anchorId:   'difficulty-stacking',
    term:       'Difficulty stacking',
    definition: 'Consecutive ultra-high-ADD tricks with no recovery between. Food processor → mobius (6 + 5 = 11 combined ADD) is the documented extreme: 3 instances 2004–2016.',
  },
  {
    anchorId:   'additive-layering',
    term:       'Additive layering',
    definition: 'The principle that compound tricks build ADD by summing operator weights onto a base. See ADD Accounting & Analysis for the per-trick mechanics; here the layering principle scales up to entire sequences.',
  },
  // The plateau and its cause are stated as observations, not settled facts:
  // both the maximum-ADD trend and whether the limit is the body's or a matter
  // of what has been documented are contested, and the reported 9-ADD hit is
  // uncorroborated testimony, so the text hedges and treats 8 as the documented
  // ceiling until the account is confirmed.
  {
    anchorId:   'difficulty-plateau',
    term:       'Difficulty plateau',
    definition: 'The observation that competitive maximum-ADD appears to have plateaued around 2008, with no clearly documented increase since. This may reflect a biomechanical ceiling rather than a scoring choice, though whether the limit is the body\'s or a matter of what has been documented is not settled. Carousel (Surging Ducking Paradox Symposium Whirling Rake) is currently the only video-documented 8-ADD trick. Close contenders are Surging Ducking Paradox Blender and Surging Ducking Paradox Torque. Nine-ADD tricks have been reported but not verified.',
  },
];

const ARCHITECTURE_SECTIONS: readonly ComboAnalysisArchitectureSection[] = [
  {
    anchorId: 'sequence-architecture',
    heading:  'Sequence architecture',
    lede:     'The structural roles tricks play within a chain. These terms describe positional behavior (where in a sequence a trick tends to appear), not what the trick is.',
    terms:    SEQUENCE_ARCHITECTURE_TERMS,
  },
  {
    anchorId: 'difficulty-architecture',
    heading:  'Difficulty architecture',
    lede:     'How difficulty distributes across a run. The two extremes are concentration and breadth; many runs blend both.',
    terms:    DIFFICULTY_ARCHITECTURE_TERMS,
  },
];

// ─────────────────────────────────────────────────────────────────────────
// §5 Worked examples
// ─────────────────────────────────────────────────────────────────────────

const WORKED_EXAMPLES: readonly ComboAnalysisWorkedExample[] = [
  {
    anchorId:    'example-canonical-pair',
    title:       'Example 1: Blurry Whirl → Whirl (the canonical pair)',
    diagram:     'blurry whirl  →  whirl\n   5 ADD          3 ADD',
    totalLine:   'Total: 8 ADD across 2 tricks (density 4.0)',
    whatHappens: 'The player opens with the hardest single rotational element in regular competitive use (blurry whirl, 5 ADD), then resolves to whirl\'s stable clipper-stall landing.',
    whyItWorks:  [
      'Difficulty announcement: opening with the high-ADD element signals competitive intent immediately. The judge sees the commitment in the first beat.',
      'Risk management: resolving to whirl gives the body a stable termination on a familiar surface. The hardest moment of the combo is also the moment when fatigue is lowest.',
      'Mechanical compatibility: both tricks live in the whirl family; the body position at the end of blurry whirl flows directly into whirl\'s entry.',
    ],
    conceptsSurfaced: [
      { anchorId: 'launch-node',          label: 'Launch node (blurry whirl)' },
      { anchorId: 'attractor',            label: 'Attractor (whirl)' },
      { anchorId: 'resolution-trick',     label: 'Resolution trick' },
    ],
    corpusNote: '17 documented appearances across 15 players and 14 events, the single most common two-trick transition in the corpus.',
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
    conceptsSurfaced: [
      { anchorId: 'throughput-trick',     label: 'Throughput trick (dimwalk)' },
      { anchorId: 'setup-trick',          label: 'Setup chain (three setup tricks before resolution)' },
      { anchorId: 'stabilization',        label: 'Stabilization' },
    ],
    corpusNote: 'smear → dimwalk: 7 appearances across 7 players. The walking ladder is well-attested.',
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
    conceptsSurfaced: [
      { anchorId: 'setup-trick',          label: 'Setup trick' },
      { anchorId: 'additive-layering',    label: 'Compositional layering (the modifier on whirl)' },
    ],
    corpusNote: 'butterfly → blurry whirl: 3 documented appearances. Less common than Example 1 but architecturally informative.',
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
    conceptsSurfaced: [
      { anchorId: 'concentration-strategy', label: 'Concentration strategy (extreme)' },
      { anchorId: 'difficulty-stacking',    label: 'Difficulty stacking' },
      { anchorId: 'sequence-risk',          label: 'Sequence risk (single-miss collapse)' },
      { anchorId: 'per-trick-density',      label: 'Per-trick ADD density (5.5)' },
    ],
    corpusNote: '3 documented appearances, all 2004–2016. The architecture exists in the elite tier but doesn\'t dominate.',
  },
  {
    anchorId:    'example-breadth-via-length',
    title:       'Example 5: The 22-ADD Solis Chain (breadth via length)',
    diagram:     'butterfly → whirl → osis → dimwalk → osis → butterfly → swirl\n    3        3       3        4       3        3         3',
    totalLine:   'Total: 22 ADD across 7 tricks (density 3.1), corpus maximum',
    whatHappens: 'Greg Solis, 2008. Seven tricks averaging 3.1 ADD each, no modifier compounds, no maximum-ADD elements: pure breadth strategy taken to its corpus-maximum result.',
    whyItWorks:  [
      'Length over depth: no single trick exceeds 4 ADD; the accumulation comes from sequence length, not from per-trick difficulty.',
      'Recovery built in: multiple positions through legover-family rest points (osis at positions 3 and 5) let the body reset mid-chain.',
      'Rotational anchor: the chain alternates between butterfly-family and whirl/swirl-family elements, maintaining rotational continuity throughout.',
      'Composure as the bottleneck: the collapse mode here is fatigue or distraction across seven elements; the player\'s challenge is sustained focus rather than peak technical demand.',
    ],
    conceptsSurfaced: [
      { anchorId: 'breadth-strategy',  label: 'Breadth strategy (corpus maximum)' },
      { anchorId: 'recovery-trick',    label: 'Recovery trick (osis mid-sequence)' },
      { anchorId: 'per-trick-density', label: 'Per-trick ADD density (3.1)' },
      { anchorId: 'sequence-risk',     label: 'Sequence risk (accumulation-break)' },
    ],
    corpusNote: '1 documented appearance. The corpus-maximum sequence.',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// §6 Transition topology
// ─────────────────────────────────────────────────────────────────────────

const TOPOLOGY_INTRO =
  'The directional flow patterns between tricks. Network observations from 22 years ' +
  'of Sick3 sequences translated to pedagogical language. These patterns are ' +
  'observational: they describe what was recorded, not what players are required to do.';

const TOPOLOGY_PATTERNS: readonly ComboAnalysisTopologyPattern[] = [
  {
    anchorId:   'topology-asymmetric-flow',
    name:       'Asymmetric flow',
    definition: 'The corpus-documented pattern of high-difficulty rotational entries resolving to stable clipper-based terminations. Sequences tend to BEGIN hard and END controlled, not the other way around.',
  },
  {
    anchorId:   'topology-rotational-cluster',
    name:       'Rotational cluster',
    definition: 'Tricks that share rotational mechanics tend to chain together: whirl, torque, and swirl form the dominant rotational cluster. Cross-cluster transitions exist but are less common.',
  },
  {
    anchorId:   'topology-walking-transitions',
    name:       'Walking transitions',
    definition: 'The dimwalk / ripwalk / parkwalk family functions as connector tissue, not as terminals. These tricks rarely appear at sequence start or end; they\'re middle-of-chain throughput.',
  },
  {
    anchorId:   'topology-clipper-stabilization',
    name:       'Clipper stabilization',
    definition: 'The convergence of sequences toward clipper-stall landings. Flow resolves to stable catch surfaces; whirl\'s status as the corpus\'s strongest attractor is partly because it lands on clipper.',
  },
  {
    anchorId:   'topology-ducking-chains',
    name:       'Ducking chains',
    definition: 'Ducking-modified compounds tend to compose with paradox and symposium on the body axis. The ducking-paradox-symposium triad forms a body-modifier cluster that produces distinct compound families.',
  },
  {
    anchorId:   'topology-paradox-chains',
    name:       'Paradox chains',
    definition: 'Paradox-modified compounds form a related cluster: paradox torque, paradox whirl, paradox blender. Peaked 2002–2014; declined afterward, losing competitive share to the blurry family.',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// §7 Caveats
// ─────────────────────────────────────────────────────────────────────────

const CAVEATS: readonly string[] = [
  'Documented patterns reflect the Sick3-format-dominated corpus (395 sequences across 22 years of ADD-scored competition), not all competitive freestyle. Routines and Shred:30 work is sparsely captured.',
  'European competition dominates 2004–2021 documentation; North American coverage from the same period is sparser. Pre-1997 data is partial.',
  'Vocabulary evolved over the corpus window. Some terms have shifted meaning, and some "Tiltless" through "Godly" tier thresholds varied by era and judge.',
  '"Tiltless" through "Godly" tier definitions are community conventions; the specific ADD thresholds were never centrally legislated.',
  'Network metrics (PageRank, hub score, authority score) describe documented transitions (what was recorded), not what players would do or should do.',
];

// ─────────────────────────────────────────────────────────────────────────
// §8 Cross-links
// ─────────────────────────────────────────────────────────────────────────

const CROSS_LINKS: readonly ComboAnalysisCrossLink[] = [
  {
    href:        '/freestyle/add-analysis',
    label:       'ADD Accounting & Analysis',
    description: 'How individual trick ADD values are constructed, with worked examples and discrepancy cases.',
  },
  {
    href:        '/freestyle/history',
    label:       'Freestyle History',
    description: 'Competitive eras, pioneers, the geographic shift, and the two-phase vocabulary story (1985-2008 invention → 2008+ recombination).',
  },
  {
    href:        '/freestyle/tricks',
    label:       'Trick Dictionary',
    description: 'Browse individual tricks by ADD, family, movement system, or topology.',
  },
  {
    href:        '/freestyle/glossary',
    label:       'Freestyle Glossary',
    description: 'Movement-language primer; trick-level vocabulary and operator notation.',
  },
  {
    href:        '/freestyle/insights',
    label:       'Freestyle Insights',
    description: 'Data-driven analytical surfaces; current Sick3 statistics and emerging patterns.',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Final export
// ─────────────────────────────────────────────────────────────────────────

export const FREESTYLE_COMBO_ANALYSIS_CONTENT: ComboAnalysisContent = {
  philosophyParagraphs:  PHILOSOPHY_PARAGRAPHS,
  runQualityIntro:       RUN_QUALITY_INTRO,
  runQualityEntries:     RUN_QUALITY_ENTRIES,
  architectureSections:  ARCHITECTURE_SECTIONS,
  workedExamples:        WORKED_EXAMPLES,
  topologyIntro:         TOPOLOGY_INTRO,
  topologyPatterns:      TOPOLOGY_PATTERNS,
  caveats:               CAVEATS,
  crossLinks:            CROSS_LINKS,
};

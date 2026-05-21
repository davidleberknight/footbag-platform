/**
 * freestyleDerivationPilot.ts
 *
 * P4 pilot content for the derivation-first compositional atlas refactor.
 * Five entries (mobius, blur, paradox, whirl, flurry) demonstrating the
 * five presentation primitives:
 *   - derivation panel (compressed / semantic / expanded / deep / operational
 *     / ADD / ADD-breakdown / family / lineage / related)
 *   - compression card (single trick at multiple locutions)
 *   - equivalence chain (named tricks ≡-linked with source label)
 *   - semantic-depth ladder (inline within derivation panel)
 *   - doctrine note (Reading A / Reading B / Mechanism / Status)
 *
 * Curator-authored TS content per the reversible-content-governance pattern
 * (TS modules over SQL migrations during ontology refinement).
 *
 * Forever-rules:
 *   - Public-facing prose contains no individual-name attribution. Source
 *     labels on equivalence rows are layer-anonymous (historical /
 *     structural / curator-derived / community); doctrine cards surface
 *     readings + mechanism + status without naming who ruled.
 *   - ADD values + breakdown formulas align with the live editorial
 *     surface (freestyleGlossaryAddExamples.ts §8 worked examples). When
 *     the live editorial truth differs from earlier design drafts, the
 *     live editorial truth wins (it is what the rest of the site renders).
 *   - Doctrine status is restricted to four labels:
 *     'resolved' | 'policy-dependent' | 'historical-disagreement' |
 *     'multiple-readings'. Open / pending-doctrine conflicts do not
 *     surface on educational surfaces.
 *   - Source labels on equivalence rows are constrained to four values:
 *     'historical' | 'curator-derived' | 'community' | 'structural'.
 */

export type EquivalenceSource =
  | 'historical'         // Holden Move Sets corpus or other historical source
  | 'curator-derived'    // curator-approved structural equivalence
  | 'community'          // widely-used community shorthand
  | 'structural';        // derived from operator decomposition

export type DoctrineStatus =
  | 'resolved'
  | 'policy-dependent'
  | 'historical-disagreement'
  | 'multiple-readings';

export interface EquivalenceRow {
  /** Left-hand name. */
  left:    string;
  /** Right-hand name (or expansion). */
  right:   string;
  /** Source label rendered as a chip on the row. */
  source:  EquivalenceSource;
  /** Optional one-line "why" rendered below the chain. */
  why?:    string;
}

export interface CompressionRung {
  /** Locution depth marker rendered as visual prefix. */
  depth:  'compressed' | 'semantic' | 'expanded' | 'deep';
  /** The reading text. */
  text:   string;
}

export interface DoctrineNote {
  /** Short title; rendered as the card heading. */
  title:    string;
  /** Reading A: terse one-line statement. */
  readingA: string;
  /** Reading B: terse one-line statement. */
  readingB: string;
  /** Mechanism: what differs between the two readings (one line). */
  mechanism: string;
  /** Status — pre-shaped curator-decision constraint:
   *  only resolved / policy-dependent / historical-disagreement /
   *  multiple-readings surface on educational surfaces. */
  status:   DoctrineStatus;
  /** Optional expandable prose paragraph. Plain text. */
  context?: string;
}

export interface AddLedger {
  /** Canonical ADD value as declared by the curator / dictionary. */
  official:       number;
  /** Naive computed ADD when it disagrees with official (omit when equal). */
  naiveComputed?: number;
  /** One-line description of the ledger derivation. */
  derivation:     string;
  /** Executable accounting formula (Tier-4 educational rendering).
   *  Atom-level breakdown showing how the official ADD is constructed
   *  from primitive components. Format follows the §8 worked-examples
   *  vocabulary (e.g. 'stepping(+1) + paradox(+1) + mirage(2) = 4 ADD'). */
  breakdown:      string;
}

export interface DerivationPanelEntry {
  /** Stable slug used in tests + anchor ids. */
  slug:                string;
  /** Display name (the compressed community form). */
  compressedName:      string;
  /** Entry-kind label rendered in the heading row. */
  kind:                'modifier' | 'trick' | 'family-root';
  /** Optional family-position label (e.g. "Root family · 1 of 6"). */
  familyPosition?:     string;

  /** Semantic-depth ladder rows. Always at least the compressed row.
   *  Order is shallowest-to-deepest (compressed → deep). */
  ladder:              readonly CompressionRung[];
  /** Pre-shaped boolean indicating whether the ladder carries any
   *  'expanded' or 'deep' rungs. Computed at module load by
   *  `withDerivationPanelDerivedFields`. Drives the collapsible
   *  "deeper readings" affordance on the derivation panel partial
   *  (Phase 6 collapse tuning). */
  hasDeepRungs:        boolean;

  /** Operational (Jobs-notation) formula. Curator-authored verbatim. */
  operational:         string;

  /** ADD ledger including the executable breakdown formula. */
  add:                 AddLedger;
  /** Optional doctrine note attached to this entry. */
  doctrine?:           DoctrineNote;

  /** Family classification or operator-effect summary. */
  family:              string;
  /** Inheritance chain (one or more rows). */
  inherits:            readonly string[];
  /** Related structures (equivalence + neighborhood links). */
  related:             readonly string[];

  /** Equivalence chains attached to this entry. May be empty. */
  equivalenceChains:   readonly EquivalenceRow[];

  /** Optional advanced-prose paragraph rendered inside a <details>. */
  advancedProse?:      string;
  /** Optional observational-prose paragraph rendered inside a <details>. */
  observationalProse?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// The five pilot entries
//
// Raw curator-authored entries; the `hasDeepRungs` derived field is
// computed at module export time so templates branch on pre-shaped data.
// ─────────────────────────────────────────────────────────────────────────

type RawDerivationPanelEntry = Omit<DerivationPanelEntry, 'hasDeepRungs'>;

const RAW_DERIVATION_PILOT_ENTRIES: readonly RawDerivationPanelEntry[] = [
  // ─── mobius ─────────────────────────────────────────────────────────
  {
    slug:           'mobius',
    compressedName: 'mobius',
    kind:           'trick',
    ladder: [
      { depth: 'compressed', text: 'mobius' },
      { depth: 'semantic',   text: 'gyro torque' },
      { depth: 'expanded',   text: 'spinning same-side torque' },
      { depth: 'deep',       text: 'spinning same-side miraging osis' },
    ],
    operational:    'CLIP > OP IN [DEX] > (BACK) SPIN [BOD] > OP CLIP [XBD] [DEL]',
    add: {
      official:      5,
      naiveComputed: 6,
      derivation:    'official 5 — rotational continuity reduces the naïve 6 by one (gyro and torque share a single continuous rotational frame)',
      breakdown:     'gyro(+2 rotational) + torque(4) = 6 ADD [naïve computed]',
    },
    doctrine: {
      title:    'mobius — rotational-continuity reading',
      readingA: 'rotational atoms count once per continuous rotation; spin + osis share a single rotational frame',
      readingB: 'each ADD-bearing token contributes independently regardless of frame',
      mechanism: 'rotational-frame continuity, not token count',
      status:    'policy-dependent',
      context:   'The mechanism-not-weight framework applies: when two atoms share an unbroken rotational frame, the frame counts once. The naïve computed value reads each atom independently. The official total is 5; the breakdown above shows the naïve 6 alongside so the reader sees the mechanism.',
    },
    family:   'gyro family (branch: torque)',
    inherits: [
      'torque (mirage-spin lineage)',
      'osis (continuous-rotation base)',
    ],
    related: [
      'blender',
      'spin-mirage',
      'double-osis',
      'gyro-torque (≡ semantic reading)',
    ],
    equivalenceChains: [
      {
        left:   'mobius',
        right:  'gyro torque',
        source: 'community',
        why:    'community shorthand stabilized in mid-2010s tutorials.',
      },
      {
        left:   'gyro torque',
        right:  'spinning same-side torque',
        source: 'structural',
        why:    'gyro decomposes to spinning + same-side at the operator layer.',
      },
    ],
    advancedProse:
      'Mobius is the canonical worked example for the rotational-doctrine ADD reading. The official 5 governs; the naïve 6 is preserved as a teaching artifact so the doctrine can be exhibited rather than narrated.',
    observationalProse:
      'Mobius functions as a topology landmark: the gyro family branches off torque, and mobius is the first entry where the spin-frame continuity rule becomes load-bearing for the ADD breakdown.',
  },

  // ─── blur ───────────────────────────────────────────────────────────
  // Aligned with freestyleGlossaryAddExamples.ts §8: official ADD 4,
  // decomposition is stepping paradox mirage (mirage-based, not legover-
  // based). This is the live editorial truth; the pilot follows it.
  {
    slug:           'blur',
    compressedName: 'blur',
    kind:           'trick',
    ladder: [
      { depth: 'compressed', text: 'blur' },
      { depth: 'semantic',   text: 'stepping paradox mirage' },
      { depth: 'expanded',   text: 'paradox mirage with a stepping operator prefix' },
    ],
    operational: 'TOE > OP IN [DEX] (STEPPING) > OP TOE',
    add: {
      official:   4,
      derivation: 'stepping (+1) and paradox (+1) layered on the mirage atom (2)',
      breakdown:  'stepping(+1) + paradox(+1) + mirage(2) = 4 ADD',
    },
    family:   'paradox-stack (branch of mirage lineage)',
    inherits: [
      'paradox mirage (one paradox-step shallower)',
      'stepping mirage (one stepping-step shallower)',
    ],
    related: [
      'blurry',
      'blurry whirl',
      'blurry osis',
      'blurry torque',
    ],
    equivalenceChains: [
      {
        left:   'blur',
        right:  'blurry',
        source: 'historical',
        why:    'documented in the Holden Move Sets compilation; community-stabilized synonym.',
      },
      {
        left:   'blurry',
        right:  'stepping paradox',
        source: 'structural',
        why:    'expanded structural reading; the blurry modifier label is folk shorthand for the stepping + paradox stack.',
      },
    ],
    advancedProse:
      'Blur is the canonical bridge entry between simple tricks and the full compositional system. The compression ladder (blur → stepping paradox mirage → mirage with both modifiers applied) shows symbolic compression operating at three depths simultaneously. Beginners recognize the name; intermediates read the structural form; advanced readers read the operational formula and the additive breakdown together.',
  },

  // ─── paradox ────────────────────────────────────────────────────────
  {
    slug:           'paradox',
    compressedName: 'paradox',
    kind:           'modifier',
    ladder: [
      { depth: 'compressed', text: 'paradox' },
      { depth: 'expanded',   text: 'inserts an op-in-dex transition before the base trick' },
    ],
    operational: '[base] → [base prefixed by OP IN [DEX]]',
    add: {
      official:   1,
      derivation: '+1 modifier weight; adds one operator step on top of the base',
      breakdown:  'paradox modifier = +1 ADD (op-in-dex transition step)',
    },
    family:   'operator (op-in-dex prefix modifier)',
    inherits: [
      'op-in-dex (the underlying operator step)',
    ],
    related: [
      'stepping (composes cleanly: stepping paradox = blur)',
      'double (composes: paradox double legover, flurry)',
      'spinning (composes: spinning paradox)',
      'ducking (composes: ducking paradox)',
    ],
    equivalenceChains: [
      {
        left:   'paradox',
        right:  'op-in-dex prefix',
        source: 'structural',
        why:    'operator definition: paradox is the named form of the op-in-dex prefix step.',
      },
      {
        left:   'stepping paradox',
        right:  'blur (≡ blurry)',
        source: 'historical',
        why:    'Holden Move Sets compilation + community-stabilized folk synonym.',
      },
    ],
    advancedProse:
      'Paradox is the canonical example of an operator-modifier in the freestyle compositional system. It does not have an independent trick form; it modifies a base. Common compounds: paradox legover, paradox mirage, stepping paradox (= blur), paradox double legover, flurry, blurry whirl.',
  },

  // ─── whirl ──────────────────────────────────────────────────────────
  {
    slug:            'whirl',
    compressedName:  'whirl',
    kind:            'family-root',
    familyPosition:  'Root family · 1 of 6',
    ladder: [
      { depth: 'compressed', text: 'whirl' },
      { depth: 'semantic',   text: 'continuous-rotation surface-stall' },
    ],
    operational: '(FRONT) SPIN [BOD] > CLIP [XBD] [DEL]',
    add: {
      official:   3,
      derivation: 'core atom: cross-body, dex, and stall components combine into the foundational rotational weight',
      breakdown:  'xbody(1) + dex(1) + stall(1) = 3 ADD',
    },
    family:   'whirl (Root)',
    inherits: [],
    related: [
      'rev-whirl (reverse direction; ADD 4)',
      'double-whirl (rotational continuation)',
      'whirling X (the modifier form applied to any base)',
      'torque (gyro family root; first branch off whirl)',
    ],
    equivalenceChains: [
      {
        left:   'whirl',
        right:  '(foundational atom — not further compressible)',
        source: 'structural',
        why:    'one of the 12 core atoms; no shallower reading exists.',
      },
    ],
    observationalProse:
      'Whirl functions as a central attractor in the freestyle ontology: it appears as a connector trick in many run architectures, it anchors the gyro branch family via torque, and it generates the "whirling X" modifier form that applies to any base trick. The branch lineage flows: whirl → torque (gyro family root) → blender, mobius, drifter.',
  },

  // ─── flurry ─────────────────────────────────────────────────────────
  {
    slug:           'flurry',
    compressedName: 'flurry',
    kind:           'trick',
    ladder: [
      { depth: 'compressed', text: 'flurry' },
      { depth: 'semantic',   text: 'double paradox legover' },
      { depth: 'expanded',   text: 'clip > op-in-dex > same-in-dex > op-out-dex > same toe' },
    ],
    operational: 'CLIP > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > SAME TOE',
    add: {
      official:   4,
      derivation: 'one additional paradox-step layered on paradox legover',
      breakdown:  'paradox(+1) + paradox legover(3) = 4 ADD',
    },
    family:   'legover (branch: paradox-stack)',
    inherits: [
      'paradox legover (one paradox-step shallower)',
      'paradox double legover (sibling at same depth)',
    ],
    related: [
      'paradox double legover',
      'paradox legover',
      'ducking flurry',
    ],
    equivalenceChains: [
      {
        left:   'flurry',
        right:  'double paradox legover',
        source: 'structural',
        why:    'expanded structural reading via paradox-stack decomposition.',
      },
    ],
    advancedProse:
      'Flurry is the canonical "all formulas, no prose" pilot entry. The semantic reading (double paradox legover), the operational formula, and the additive breakdown together describe the trick completely; no English explanation is needed. The structure IS the explanation.',
  },
];

/**
 * Public export: raw entries augmented with derived `hasDeepRungs`.
 * Templates branch on `hasDeepRungs` per `template-conventions` rule
 * "branching only on pre-shaped data".
 */
export const DERIVATION_PILOT_ENTRIES: readonly DerivationPanelEntry[] =
  RAW_DERIVATION_PILOT_ENTRIES.map(entry => ({
    ...entry,
    hasDeepRungs: entry.ladder.some(
      r => r.depth === 'expanded' || r.depth === 'deep',
    ),
  }));

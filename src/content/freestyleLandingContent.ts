/**
 * freestyleLandingContent.ts
 *
 * Static content for the freestyle landing page's "The Language of Freestyle
 * Footbag" structure (Batch 2 of the IA realignment).
 *
 * Three exports:
 *   - BASIC_COMPONENTS — six conceptual primitives per the PassBack glossary
 *     (Contact / Set / Dex / Spin / Duck / Delay). Dex carries sub-fields.
 *   - CORE_TRICK_SPEC — eleven irreducible base-trick slugs with their
 *     canonical `≡` equivalence readings. ADD values are joined from
 *     `freestyle_tricks` at service-shape time; this file does not encode
 *     ADD values to prevent drift.
 *   - DEMONSTRATION_SLOTS — five conceptual slots for the curated
 *     demonstration strip. Each slot ships with `curatedMedia: null` so the
 *     curator can backfill via a future patch without code changes.
 *
 * Forever-rules:
 *   - Definitions adapted from `passback-glossary.txt` carry a `source` field
 *     citing the line number. Verbatim wordings are flagged.
 *   - Core-trick `equivalences` are limited to canonical-uncontested readings.
 *     Wave-1-pending and folk-equivalence readings stay OUT of the compact
 *     browse surface (see project_red_consultation_state).
 *   - The compact-object rule (PART H-pre of FREESTYLE_IA_REALIGNMENT_PLAN.md)
 *     governs how these entries render — no educational prose on compact cards.
 */

export interface BasicComponentSubfield {
  label:  string;
  values: readonly string[];
}

export interface BasicComponentSpec {
  key:         string;
  name:        string;
  description: string;
  subfields:   readonly BasicComponentSubfield[];
  source:      string;   // attribution; rendered as a small lineage line if exposed
}

export const BASIC_COMPONENTS: readonly BasicComponentSpec[] = [
  {
    key:         'contact',
    name:        'Contact',
    description: "The moment the bag touches the body. Start and end of most standard tricks. Two main stalls: toe and clipper.",
    subfields:   [],
    source:      'PassBack glossary, pb-ss1 + pb-ss2',
  },
  {
    key:         'set',
    name:        'Set',
    description: "The launch action that initiates a trick — sends the bag into the air.",
    subfields:   [],
    source:      'Set-notation reference (/freestyle/sets)',
  },
  {
    key:         'dex',
    name:        'Dex',
    description: "The leg circling the bag while it's in the air. The most common, 'main' component of trick composition.",
    subfields:   [
      { label: 'Direction',     values: ['in-out', 'out-in'] },
      { label: 'Movement type', values: ['hippy', 'leggy'] },
      { label: 'Support type',  values: ['regular', 'symposium'] },
    ],
    source:      'PassBack glossary, pb-ss1 + pb-ss2',
  },
  {
    key:         'spin',
    name:        'Spin',
    description: "Rotation of the body during a trick.",
    subfields:   [],
    source:      'PassBack glossary, pb-ss1',
  },
  {
    key:         'duck',
    name:        'Duck',
    description: "Head dipping under the bag.",
    subfields:   [],
    source:      'PassBack glossary, pb-ss1',
  },
  {
    key:         'delay',
    name:        'Delay',
    description: "A controlled hold of the bag on a surface (foot, sole, clipper) — the catch.",
    subfields:   [],
    source:      "Freestyle glossary, [DEL] component flag",
  },
];

export interface CoreTrickSpec {
  slug:          string;
  equivalences:  readonly string[];   // empty for atoms with no canonical reading
}

// Eleven irreducible core tricks per the curator-authoritative atom registry
// (project_freestyle_core_atoms) and FREESTYLE_IA_REALIGNMENT_PLAN.md C-2.
// Equivalences are limited to canonical-uncontested readings:
//   - illusion ≡ outside-in mirage (compositional; from freestyle_trick_aliases)
//   - around-the-world ≡ ATW (orthographic alias; from freestyle_trick_aliases)
//   - orbit ≡ reverse around-the-world (per maintainer spec)
// Skipped: legover≡leg-over (orthographic-only), osis≡frigidosis
// (Wave-2-pending), swirl≡reverse-swirl (different trick).
export const CORE_TRICK_SPEC: readonly CoreTrickSpec[] = [
  { slug: 'clipper',          equivalences: [] },
  { slug: 'mirage',           equivalences: [] },
  { slug: 'legover',          equivalences: [] },
  { slug: 'pickup',           equivalences: [] },
  { slug: 'illusion',         equivalences: ['outside-in mirage'] },
  { slug: 'whirl',            equivalences: [] },
  { slug: 'butterfly',        equivalences: [] },
  { slug: 'swirl',            equivalences: [] },
  { slug: 'osis',             equivalences: [] },
  { slug: 'around-the-world', equivalences: ['ATW'] },
  { slug: 'orbit',            equivalences: ['reverse around-the-world'] },
];

export interface DemonstrationSlotSpec {
  key:              string;
  label:            string;
  conceptualIntent: string;
}

// Five curated slots. Each slot's `curatedMedia` ships as null pending curator
// backfill. The template renders a "Curated demonstration pending"
// placeholder when null — no synthesized fallback.
export const DEMONSTRATION_SLOTS: readonly DemonstrationSlotSpec[] = [
  {
    key:              'sam-conlon',
    label:            'Sam Conlon',
    conceptualIntent: 'A historically anchored shred run from one of the modern era\'s defining players.',
  },
  {
    key:              'classic-circle',
    label:            'Classic Circle',
    conceptualIntent: 'A circle demonstration that captures the community-traded, take-turns rhythm of competitive freestyle.',
  },
  {
    key:              'artistic-routine',
    label:            'Artistic Routine',
    conceptualIntent: 'A choreographed-to-music performance that foregrounds composition and presentation.',
  },
  {
    key:              'modern-technical-shred',
    label:            'Modern Technical Shred',
    conceptualIntent: 'A contemporary high-difficulty run that surfaces stacked-modifier compositional density.',
  },
  {
    key:              'educationally-readable-run',
    label:            'Educationally Readable Run',
    conceptualIntent: 'A run where the structural decomposition stays legible — a learner can name the tricks as they happen.',
  },
];

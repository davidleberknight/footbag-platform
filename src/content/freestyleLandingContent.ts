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
 *   - (Demonstrations content lives in the service shaping directly post-
 *     2026-05-14; see freestyleService.getLandingPage for the array.)
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

// SURFACE-COMPRESSION-REALIGNMENT-1 Phase 1 / A: descriptions compressed
// to ≤10 words; the heading + sub-field chips (for Dex) carry the rest of
// the teaching. Source attribution preserved as a vestigial field for
// future re-exposure; not rendered on the public surface.
export const BASIC_COMPONENTS: readonly BasicComponentSpec[] = [
  {
    key:         'contact',
    name:        'Contact',
    description: 'Body touches bag; start and end of most tricks.',
    subfields:   [],
    source:      'PassBack glossary, pb-ss1 + pb-ss2',
  },
  {
    key:         'set',
    name:        'Set',
    description: 'Launch action; sends the bag up.',
    subfields:   [],
    source:      'Set-notation reference (/freestyle/sets)',
  },
  {
    key:         'dex',
    name:        'Dex',
    description: 'Leg circles the bag mid-air; the main composition unit.',
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
    description: 'Body rotates during a trick.',
    subfields:   [],
    source:      'PassBack glossary, pb-ss1',
  },
  {
    key:         'duck',
    name:        'Duck',
    description: 'Head dips under the bag.',
    subfields:   [],
    source:      'PassBack glossary, pb-ss1',
  },
  {
    key:         'delay',
    name:        'Delay',
    description: 'Controlled hold on a surface (the catch).',
    subfields:   [],
    source:      'Freestyle glossary, [DEL] component flag',
  },
];

export interface CoreTrickSpec {
  slug:          string;
  equivalences:  readonly string[];   // empty for atoms with no canonical reading
}

// Eleven irreducible core tricks per the curator-authoritative atom registry
// (project_freestyle_core_atoms) and FREESTYLE_IA_REALIGNMENT_PLAN.md C-2.
//
// SURFACE-COMPRESSION-REALIGNMENT-1 Phase 2 / B (2026-05-14): all
// equivalence arrays empty. The earlier `≡ ATW`, `≡ outside-in mirage`,
// `≡ reverse around-the-world` lines were synonym trivia, not symbolic
// content; their removal lets each card read as a pure foundational
// atom (#slug + ADD), matching the "foundational atom feel" the surface
// promises. Alias resolution still lives in `freestyle_trick_aliases`
// and the glossary; the landing compact-symbolic surface stays silent.
export const CORE_TRICK_SPEC: readonly CoreTrickSpec[] = [
  { slug: 'clipper',          equivalences: [] },
  { slug: 'mirage',           equivalences: [] },
  { slug: 'legover',          equivalences: [] },
  { slug: 'pickup',           equivalences: [] },
  { slug: 'illusion',         equivalences: [] },
  { slug: 'whirl',            equivalences: [] },
  { slug: 'butterfly',        equivalences: [] },
  { slug: 'swirl',            equivalences: [] },
  { slug: 'osis',             equivalences: [] },
  { slug: 'around-the-world', equivalences: [] },
  { slug: 'orbit',            equivalences: [] },
];

// Note: the prior DEMONSTRATION_SLOTS scaffolding (five pre-named conceptual
// slots: Sam Conlon / Classic Circle / Artistic Routine / Modern Technical
// Shred / Educationally Readable Run) was retired in LANDING-AND-TRICKS-QA-
// REALIGNMENT-1 F3 (2026-05-14). The original Batch 2 design misread the
// "Sam Conlon footage" line in the IA-realignment spec as a request for a
// pre-named slot; the maintainer clarified it meant "include Sam Conlon
// footage among the curated demonstrations." The new shape is a plain
// FreestyleDemonstration[] hardcoded in `freestyleService.getLandingPage`
// with curator-authoritative tags; empty array hides the section content.

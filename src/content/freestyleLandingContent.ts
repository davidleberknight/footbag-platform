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
    name:        'Duck / Dive',
    description: 'Head dip or arc; duck/dive/weave/zulu family.',
    subfields:   [],
    source:      'PassBack glossary, pb-ss1; operator-board head-path family',
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
  // Optional override for the rendered `#{...}` tag on the symbolic-object
  // card. Used when the underlying canonical slug is more specific than the
  // community shorthand (e.g. slug=`clipper-stall` but the community calls
  // the foundational atom `clipper`). When omitted, renders `#{slug}`.
  displaySlug?:  string;
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
// CORE-ATOM-CANONICAL-RECONCILE-1 (2026-05-15): the foundational atom for
// "Clipper" is the `clipper-stall` row (ADD 2), not the `clipper` slug
// (ADD 1, "Clipper Kick"). The displaySlug override preserves the
// community-shorthand `#clipper` tag while the underlying slug + anchor
// + click-through resolve to clipper-stall.
// Formula Accountability Slice (2026-05-17): each foundational atom carries
// a short observational reading drawn from the glossary §2/§3 entries.
// Readings are editorially safe (no Wave-2 doctrine commitment, no
// fabricated operational notation). Where the structural form is settled
// per Red rulings, the reading reflects it; where the form remains under
// discussion, a neutral "core atom" label appears so no foundational card
// renders blank against the rich compound cards on the same surface.
//
// Per user 2026-05-17: "if any are doctrine-sensitive, show a neutral
// 'core atom' reading instead of leaving blank."
export const CORE_TRICK_SPEC: readonly CoreTrickSpec[] = [
  // Second equivalence is the foundational ADD-accounting formula (where
  // each ADD comes from). Educational accounting per the foundational-
  // formula slice 2026-05-18 — treated as a teaching abstraction, not
  // parser-truth doctrine. See /freestyle/add-analysis for the full
  // derivation table. Orbit is the curator-confirmed alias for reverse
  // around-the-world (pending DB canonicalization, not Wave-2 blocked);
  // its numeric ADD value displays as em-dash via the addPending path
  // until the canonical row lands, while the formula provides the
  // structural reading.
  { slug: 'clipper-stall',    displaySlug: 'clipper', equivalences: ['core atom — inside-shoe stall',           'xbody(1) + stall(1) = 2 ADD'] },
  { slug: 'mirage',           equivalences: ['core atom — cross-body rotational dex',           'dex(1) + stall(1) = 2 ADD'] },
  { slug: 'legover',          equivalences: ['core atom — dex over the supporting leg',         'dex(1) + stall(1) = 2 ADD'] },
  { slug: 'pickup',           equivalences: ['core atom — dex catching from below',             'dex(1) + stall(1) = 2 ADD'] },
  { slug: 'illusion',         equivalences: ['core atom — dex with mid-flight rotation',        'dex(1) + stall(1) = 2 ADD'] },
  { slug: 'whirl',            equivalences: ['core atom — rotational dex',                      'xbody(1) + dex(1) + stall(1) = 3 ADD'] },
  { slug: 'butterfly',        equivalences: ['core atom — rotational dex on a different beat',  'dex(1) + xbody(1) + stall(1) = 3 ADD'] },
  { slug: 'swirl',            equivalences: ['core atom — reverse-direction rotational dex',    'xbody(1) + dex(1) + stall(1) = 3 ADD'] },
  { slug: 'osis',             equivalences: ['core atom — double-pass rotational dex',          'spin(1) + xbody(1) + stall(1) = 3 ADD'] },
  { slug: 'around-the-world', equivalences: ['core atom — dex with full bag orbit',             'full-orbit dex(1) + stall(1) = 2 ADD'] },
  { slug: 'orbit',            equivalences: ['core atom — alias of reverse around-the-world',   'reverse full-orbit dex(1) + stall(1) = 2 ADD'] },
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

/**
 * freestyleLandingContent.ts
 *
 * Static content for the freestyle landing page's "The Language of Freestyle
 * Footbag" structure.
 *
 * Three exports:
 *   - BASIC_COMPONENTS: six conceptual primitives per the PassBack glossary
 *     (Contact / Set / Dex / Spin / Duck / Delay). Dex carries sub-fields.
 *   - CORE_TRICK_SPEC: twelve irreducible base-trick slugs with their
 *     canonical `≡` equivalence readings. ADD values are joined from
 *     `freestyle_tricks` at service-shape time; this file does not encode
 *     ADD values to prevent drift.
 *   - (Demonstrations content lives in the service shaping directly, not in
 *     this content module.)
 *
 * Forever-rules:
 *   - Definitions adapted from `passback-glossary.txt` carry a `source` field
 *     citing the line number. Verbatim wordings are flagged.
 *   - Core-trick `equivalences` are limited to canonical-uncontested readings.
 *     Pending and folk-equivalence readings stay OUT of the compact
 *     browse surface.
 *   - The compact-object rule governs how these entries render: no
 *     educational prose on compact cards.
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

// Descriptions compressed to ≤10 words; the heading + sub-field chips
// (for Dex) carry the rest of the teaching. Source attribution preserved
// as a vestigial field for future re-exposure; not rendered on the
// public surface.
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
  // Curator-authoritative operational notation per atom. Sourced into the
  // landing's core-tricks grid via shapeCoreTricks (the previous DB-column
  // path is bypassed for atoms). Authored verbatim from the notation
  // normalization brief. Reversible TS content; not DB-coupled.
  operationalNotation: string;
}

// Twelve irreducible core tricks per the curator-authoritative atom registry.
//
// Equivalence arrays are empty: synonym trivia like `≡ ATW`,
// `≡ outside-in mirage`, `≡ reverse around-the-world` is not symbolic
// content, so each card reads as a pure foundational atom (#slug + ADD),
// matching the "foundational atom feel" the surface promises. Alias
// resolution lives in `freestyle_trick_aliases` and the glossary; the
// landing compact-symbolic surface stays silent.
// The foundational atom for "Clipper" is the `clipper-stall` row (ADD 2),
// not the `clipper` slug (ADD 1, "Clipper Kick"). The displaySlug override
// preserves the community-shorthand `#clipper` tag while the underlying
// slug + anchor + click-through resolve to clipper-stall.
// Each foundational atom carries a short observational reading drawn from
// the glossary §2/§3 entries. Readings are editorially safe (no
// unresolved-doctrine commitment, no fabricated operational notation).
// Where the structural form is settled per Red rulings, the reading
// reflects it; where the form remains under discussion, a neutral "core
// atom" label appears so no foundational card renders blank against the
// rich compound cards on the same surface.
//
// Per user direction: "if any are doctrine-sensitive, show a neutral
// 'core atom' reading instead of leaving blank."
export const CORE_TRICK_SPEC: readonly CoreTrickSpec[] = [
  // Second equivalence is the foundational ADD-accounting formula (where
  // each ADD comes from). Educational accounting treated as a teaching
  // abstraction, not parser-truth doctrine. See /freestyle/add-analysis
  // for the full derivation table. Orbit is the curator-confirmed alias
  // for reverse around-the-world (pending DB canonicalization, not
  // blocked on unresolved doctrine); its numeric ADD value displays as
  // em-dash via the addPending path until the canonical row lands, while
  // the formula provides the structural reading.
  { slug: 'toe_stall',        equivalences: ['core atom: foundational single-stall primitive', 'stall(1) = 1 ADD'], operationalNotation: 'SET > SAME TOE [DEL]' },
  { slug: 'clipper_stall',    displaySlug: 'clipper', equivalences: ['core atom: inside-shoe stall',           'xbody(1) + stall(1) = 2 ADD'], operationalNotation: 'SET > OP CLIP [XBD] [DEL]' },
  { slug: 'mirage',           equivalences: ['core atom: cross-body rotational dex',           'dex(1) + stall(1) = 2 ADD'], operationalNotation: 'SET > OP IN [DEX] > OP TOE [DEL]' },
  { slug: 'legover',          equivalences: ['core atom: dex over the supporting leg',         'dex(1) + stall(1) = 2 ADD'], operationalNotation: 'SET > OP OUT [DEX] > SAME TOE [DEL]' },
  { slug: 'pickup',           equivalences: ['core atom: dex catching from below',             'dex(1) + stall(1) = 2 ADD'], operationalNotation: 'SET > OP IN [DEX] > SAME TOE [DEL]' },
  { slug: 'illusion',         equivalences: ['core atom: dex with mid-flight rotation',        'dex(1) + stall(1) = 2 ADD'], operationalNotation: 'SET > OP OUT [DEX] > OP TOE [DEL]' },
  { slug: 'whirl',            equivalences: ['core atom: rotational dex',                      'xbody(1) + dex(1) + stall(1) = 3 ADD'], operationalNotation: 'SET > OP IN [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'butterfly',        equivalences: ['core atom: rotational dex on a different beat',  'dex(1) + xbody(1) + stall(1) = 3 ADD'], operationalNotation: 'SET > OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'swirl',            equivalences: ['core atom: same-side out dex to a clipper',      'xbody(1) + dex(1) + stall(1) = 3 ADD'], operationalNotation: 'SET > SAME OUT [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'osis',             equivalences: ['core atom: double-pass rotational dex',          'spin(1) + xbody(1) + stall(1) = 3 ADD'], operationalNotation: 'SET > (back or front) SPIN [BOD] > SAME/OP CLIP [XBD] [DEL]' },
  { slug: 'around_the_world', equivalences: ['core atom: dex with full bag orbit',             'full-orbit dex(1) + stall(1) = 2 ADD'], operationalNotation: 'TOE > SAME IN/OUT [DEX] > SAME TOE [DEL]' },
  { slug: 'orbit',            equivalences: ['core atom: dex with reverse full bag orbit',      'reverse full-orbit dex(1) + stall(1) = 2 ADD'], operationalNotation: 'TOE > SAME OUT [DEX] > SAME TOE [DEL]' },
];

// Demonstrations are a plain FreestyleDemonstration[] hardcoded in
// `freestyleService.getLandingPage` with curator-authoritative tags; an
// empty array hides the section content.

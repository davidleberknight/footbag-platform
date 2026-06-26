/**
 * Compositional Sets content for /freestyle/compositional-sets.
 *
 * A systematic exploration of how named sets compose from a small
 * grammar: the dictionary-hub companion to the flat reference table
 * at /freestyle/sets (Chris Holden compilation).
 *
 * Design principles (locked):
 *
 * - **Operator cards over notation dumps.** Each member renders as a
 *   visual card with notation + cross-link, not a flat table row.
 * - **Family branching, not flat lists.** Six structural groups; each
 *   carries a curator-authored intro framing the family's grammar.
 * - **Visual ladders for uptime reinterpretation.** §3 surfaces the
 *   "this set IS this trick performed uptime" relationships as
 *   compositional ladders, not paragraphs.
 * - **Holden attribution preserved.** Operational notation strings
 *   are quoted verbatim from Chris Holden's community compilation
 *   (circa 2003).
 * - **No forced canonicalization.** Holden-only entries (slapping,
 *   tapping, bubba, sailing, shooting, flailing, infracting) are
 *   marked status='holden-only'; never promoted to canonical without
 *   curator review.
 * - **Honest conflict surfacing.** Where Holden's decomposition
 *   diverges from later platform analysis (e.g. surging), the ladder
 *   carries an honest "two readings recorded" note rather than
 *   silently picking one.
 *
 * Status field semantics:
 *
 * - 'canonical'        : the set name resolves to a current
 *                        freestyle_tricks dictionary entry; card
 *                        renders a /freestyle/tricks/<slug> link.
 * - 'platform-tracked' : the set appears in platform content modules
 *                        (operatorReference, symbolicEquivalences,
 *                        resolvedFormulas) but is not a standalone
 *                        dictionary entry; card renders without a
 *                        trick link.
 * - 'holden-only'      : Holden's compilation lists this name; the
 *                        platform has no separate canonical or
 *                        tracked treatment. Surfaced honestly as
 *                        community-cited; never promoted.
 *
 * This file is layer-1 content. Service shaping at
 * freestyleService.getCompositionalSetsPage() resolves canonicalSlug
 * against the live dictionary and produces the view-model.
 */

export type CompositionalSetStatus =
  | 'canonical'
  | 'platform-tracked'
  | 'holden-only';

export interface CompositionalSetCard {
  /** Display name (e.g. "Pixie", "Blurry"). */
  name: string;
  /** Operational notation, quoted verbatim from Holden's compilation. */
  notation: string;
  /**
   * Whether this set has a canonical / tracked / Holden-only role.
   * Service resolves 'canonical' from a live dictionary check; this
   * module's hint is curator-locked for the platform-tracked /
   * Holden-only buckets.
   */
  statusHint: CompositionalSetStatus;
  /**
   * Optional brief structural note. One short line, no paragraphs.
   * Used for things like "Holden parenthetical: Double Pixie" or
   * "Holden reads as: Toe set Illusion". Null when no note adds value.
   */
  structuralNote: string | null;
}

export interface CompositionalSetFamily {
  /** Stable anchor key (kebab-case). */
  key: string;
  /** Display heading. */
  name: string;
  /**
   * One- to two-sentence intro framing the family's structural
   * pattern. Movement-language first; no jargon dumps.
   */
  intro: string;
  /** Member cards. */
  members: CompositionalSetCard[];
}

/**
 * Audit-row status code.
 *
 *  - 'aligned'      Holden's notation and decomposition match a platform
 *                   source (operator reference / resolved formulas /
 *                   symbolic equivalences / movement systems) cleanly.
 *  - 'partial'      Notation matches but framing diverges (e.g. Holden
 *                   reads atomic as "Toe set Illusion" decomposition;
 *                   the platform treats atomic as a +1 set primitive).
 *  - 'conflict'     Decompositions substantively disagree (e.g. surging:
 *                   Holden = spinning miraging; platform = spinning +
 *                   stepping).
 *  - 'holden-only'  Listed in Holden's compilation; no platform entry.
 */
export type CompositionalAuditStatus =
  | 'aligned'
  | 'partial'
  | 'conflict'
  | 'holden-only';

export interface CompositionalAuditEntry {
  /** Holden's display name (matches an entry in COMPOSITIONAL_SET_FAMILIES). */
  holdenName: string;
  /**
   * Holden's reading, either the parenthetical structural folk-name
   * ("Stepping Paradox") or a brief summary of the notation pattern.
   */
  holdenReading: string;
  /**
   * Platform reading, the equivalent decomposition or framing from
   * platform content modules. Null when no platform entry exists
   * (status: holden-only).
   */
  platformReading: string | null;
  /** Status code (see above). */
  status: CompositionalAuditStatus;
  /**
   * One-line specific note explaining the divergence or alignment.
   * Public prose; never internal jargon. Null when no note adds value.
   */
  note: string | null;
}

export interface UptimeReinterpretationLadder {
  /** Set / system name (e.g. "miraging", "blurry", "surging"). */
  setName: string;
  /** Set's operational notation (verbatim from Holden where present). */
  setNotation: string;
  /**
   * The uptime-reinterpretation reading in plain language.
   * e.g. "Uptime mirage structure" / "Stepping with a paradox second dex"
   */
  reinterpretation: string;
  /**
   * 2- to 3-line breakdown showing the relationship between the set
   * and its source trick / structural source. Each line is a single
   * short observation; the ladder renders them as visual steps.
   */
  steps: readonly string[];
  /**
   * Source attribution for this reading. e.g. "Per Holden's compilation"
   * or "Per Holden + pt8 platform ruling (aligned)". When the ladder
   * documents a Holden/platform disagreement, both readings are named.
   */
  sourceCitation: string;
  /**
   * Optional honest-conflict note. Non-null when this reading is
   * NOT the only published reading and the disagreement is worth
   * surfacing inline. Used sparingly; the full audit lives in §4.
   */
  conflictNote: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// §2  Six structural families
// ─────────────────────────────────────────────────────────────────────

export const COMPOSITIONAL_SET_FAMILIES: readonly CompositionalSetFamily[] = [
  {
    key:   'single-dex-primitives',
    name:  'Single-dex primitives',
    intro:
      'One set, one dex, terminate. The simplest grammar shapes: every member ' +
      'is a single dexterity step layered over a toe or clip set. These are the ' +
      'building blocks the rest of the language composes from.',
    members: [
      { name: 'Pixie',     notation: 'TOE > SAME IN [DEX] >',                              statusHint: 'platform-tracked', structuralNote: null },
      { name: 'Fairy',     notation: 'TOE > SAME OUT [DEX] >',                             statusHint: 'platform-tracked', structuralNote: null },
      { name: 'Nuclear',   notation: 'CLIP > SAME OUT >',                                  statusHint: 'platform-tracked', structuralNote: 'Holden reads it short; the platform notation is CLIP > SAME OUT [DEX] >.' },
      { name: 'Miraging',  notation: 'SET > OP IN [DEX] >',                                statusHint: 'platform-tracked', structuralNote: 'Reads as uptime mirage structure (see ladder §3).' },
      { name: 'Stepping',  notation: 'CLIP > OP IN [DEX] >',                               statusHint: 'platform-tracked', structuralNote: null },
      { name: 'Quantum',   notation: 'TOE > OP IN [DEX] > (op side component)',            statusHint: 'platform-tracked', structuralNote: 'Holden reads as: compressed atomic.' },
      { name: 'Slapping',  notation: 'TOE > OP IN [DEX] > (same side component)',          statusHint: 'holden-only',       structuralNote: 'Holden\'s compilation; no current platform canonical.' },
      { name: 'Bubba',     notation: 'CLIP > OP OUT [DEX] >',                              statusHint: 'holden-only',       structuralNote: 'Holden\'s compilation; no current platform canonical.' },
      { name: 'Atomic',    notation: 'TOE > OP OUT [DEX] > (op side component)',           statusHint: 'platform-tracked', structuralNote: 'Holden parenthetical: Toe set Illusion.' },
      { name: 'Tapping',   notation: 'TOE > OP OUT [DEX] (plant) > (same side component)', statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: Atomic same side.' },
    ],
  },
  {
    key:   'multi-dex-compounds',
    name:  'Multi-dex compounds',
    intro:
      'Two or more dexterity steps chained over the same set. The compositional ' +
      'core of the language: most named compound sets are a sequence of dex ' +
      'directions, and several have folk-name parenthetical equivalents.',
    members: [
      { name: 'Terraging',   notation: 'TOE > SAME IN [DEX] > SAME IN [DEX] >',                          statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: Double Pixie.' },
      { name: 'Barraging',   notation: 'CLIP > OP IN [DEX] > SAME IN [DEX] >',                           statusHint: 'platform-tracked', structuralNote: 'Holden parenthetical: High Stepping.' },
      { name: 'Sailing',     notation: 'TOE > SAME IN [DEX] > OP OUT [DEX] >',                           statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: Pixie Illusion.' },
      { name: 'Blurry',      notation: 'CLIP > OP IN [DEX] > OP OUT [DEX] > (op side)',                  statusHint: 'platform-tracked', structuralNote: 'Holden parenthetical: Stepping Paradox. Aligns with pt8 platform ruling.' },
      { name: 'Frantic',     notation: 'TOE > SAME IN [DEX] > OP IN [DEX] >',                            statusHint: 'holden-only',       structuralNote: 'Holden reads as: pixie-quantum.' },
      { name: 'Flailing',    notation: 'SET > (no plant while) OP OUT [BOD] [DEX] >',                    statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: Symposium Reverse Miraging.' },
      { name: 'Fairy Atomic',notation: 'TOE > SAME OUT [DEX] > OP OUT [DEX] >',                          statusHint: 'holden-only',       structuralNote: null },
      { name: 'Shooting',    notation: 'CLIP > OP IN [DEX] > OP OUT [PDX][DEX] >',                       statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: Stepping Paradox Illusion.' },
      { name: 'Furious',     notation: 'CLIP > OP IN [DEX] > SAME IN [DEX] >',                           statusHint: 'platform-tracked', structuralNote: 'The same two-dex set as Barraging, the more explanative name; an older three-dex Barraging Paradox Miraging reading is superseded.' },
      { name: 'Infracting',  notation: 'opposite of a Refraction, done as a set',                        statusHint: 'holden-only',       structuralNote: 'Inverse pattern, not a literal grammar string.' },
    ],
  },
  {
    key:   'spinning-family',
    name:  'Spinning family',
    intro:
      'A set followed by a body spin, or a body spin layered into a multi-dex set. ' +
      'Holden lists this family separately because the spin token reads as a ' +
      'midtime body modifier acting on the underlying set\'s grammar.',
    members: [
      { name: 'Fairy Spinning',     notation: 'TOE > SAME OUT [DEX] > (BACK) SPIN [BOD] >',                   statusHint: 'holden-only',       structuralNote: null },
      { name: 'Pixie Inspinning',   notation: 'TOE > SAME IN [DEX] > (FRONT) SPIN [BOD] >',                   statusHint: 'holden-only',       structuralNote: null },
      { name: 'Sonic',              notation: 'CLIP > (BACK) SPIN [BOD] > (BACK) SPIN [BOD] >',               statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: double spinning.' },
      { name: 'Peeking',            notation: 'SET > (BACK) SPIN [BOD] > (BACK) SPIN [BOD] >',                statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: double spinning (SET-led variant).' },
      { name: 'Leaning',            notation: 'CLIP > OP IN [DEX] > (FRONT) SPIN [BOD] >',                    statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: stepping inspinning.' },
      { name: 'Go-Go',              notation: 'CLIP > OP IN [DEX] > (BACK) SPIN [BOD] >',                     statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: stepping backspinning.' },
      { name: 'Surging',            notation: 'SET > (BACK/FRONT) SPIN [BOD] > OP IN [DEX] >',                statusHint: 'platform-tracked', structuralNote: 'Holden reads as: spinning miraging. See ladder §3, where the platform documents a divergent reading.' },
      { name: 'Twinspinning',       notation: 'CLIP > SAME OUT [DEX] > (FRONT) SPIN [BOD] >',                 statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: nuclear inspinning.' },
      { name: 'Neutron',            notation: 'TOE > OP OUT [DEX] > (BACK) SPIN [BOD] > (op side component)', statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: Atomic spin.' },
    ],
  },
  {
    key:   'whirl-swirl-family',
    name:  'Whirl / swirl family',
    intro:
      'Sets that resolve into the whirl or swirl shape: cross-body rotational ' +
      'sets ending on a clipper stall. Several family members are documented ' +
      'symposium or gyro variants of the base whirl pattern.',
    members: [
      { name: 'Swirling',   notation: 'CLIP > SAME BACK/FRONT SWIRL [DEX] >',         statusHint: 'platform-tracked', structuralNote: null },
      { name: 'Whirling',   notation: 'CLIP > OP IN [DEX] > (same side component)',   statusHint: 'platform-tracked', structuralNote: null },
      { name: 'Blazing',    notation: 'CLIP > OP IN [DEX] > (op side component)',     statusHint: 'holden-only',       structuralNote: 'Whirling with the opposite-side terminal component.' },
      { name: 'Scattered',  notation: 'CLIP > OP OUT [DEX] > (same side component)',  statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: Reverse Whirling (same side).' },
      { name: 'Shattered',  notation: 'CLIP > OP OUT [DEX] > (op side component)',    statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: Reverse Whirling (op side).' },
      { name: 'Pogo',       notation: 'CLIP > (no plant while) OP IN [DEX] >',        statusHint: 'platform-tracked', structuralNote: 'Holden parenthetical: Symposium Whirling.' },
      { name: 'Blistering', notation: 'CLIP > OP IN [DEX] > (BACK) SPIN [BOD] >',     statusHint: 'platform-tracked', structuralNote: 'Holden parenthetical: Whirling Gyro.' },
      { name: 'Broken',     notation: 'CLIP > OP OUT [DEX] > (SAME)',                 statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: clipper reverse whirl. Marked * in source.' },
    ],
  },
  {
    key:   'uns-sets',
    name:  'Unusual non-standard (UNS) sets',
    intro:
      'Sets whose initial contact is something other than toe or clip: a pinch, ' +
      'a dragon, a frigidosis. The same dex grammar applies; the entry surface ' +
      'shifts. Holden tracks these as a deliberately separate family.',
    members: [
      { name: 'Finchy',          notation: 'PINCH > SAME OUT [DEX] >',                                              statusHint: 'holden-only', structuralNote: 'Holden parenthetical: Pinching Fairy set.' },
      { name: 'Pixie Pinching',  notation: 'PINCH > SAME IN [DEX] >',                                               statusHint: 'holden-only', structuralNote: null },
      { name: 'Twisted',         notation: 'DRAGON > SAME FRONT SWIRL [DEX] > SAME IN/OUT [PDX][DEX] >',           statusHint: 'holden-only', structuralNote: 'Holden parenthetical: Dragon set Swirling Paradox.' },
      { name: 'Snapping',        notation: 'DRAGON > SAME FRONT SWIRL [DEX] >',                                     statusHint: 'holden-only', structuralNote: 'Holden parenthetical: Dragon set Swirling.' },
      { name: 'Arctic',          notation: 'FRIGIDOSIS > SAME IN [DEX] >',                                          statusHint: 'holden-only', structuralNote: 'Holden parenthetical: frigidosis Pixie.' },
    ],
  },
  {
    key:   'antisymposium-and-components',
    name:  'Antisymposium & components',
    intro:
      'Two adjacent ideas Holden tracks alongside the set families: antisymposium ' +
      '(the setting foot stays on the ground, the inverse discipline to ' +
      'symposium) and component modifiers that show up inside sets but rarely ' +
      'function as standalone set prefixes.',
    members: [
      { name: 'Rooting / Rooted', notation: 'The setting foot is on the ground (antisymposium discipline).',  statusHint: 'holden-only',       structuralNote: 'Movement constraint, not a literal grammar string.' },
      { name: 'Zoid',             notation: 'rooted toe clipper set',                                          statusHint: 'holden-only',       structuralNote: 'Set-name for the antisymposium toe-clip pattern.' },
      { name: 'Ducking',          notation: 'SET > DUCK [BOD] >',                                              statusHint: 'platform-tracked', structuralNote: 'Component modifier: appears inside sets, rarely a standalone set prefix.' },
      { name: 'Diving',           notation: 'SET > DIVE [BOD] >',                                              statusHint: 'platform-tracked', structuralNote: 'Component modifier: appears inside sets.' },
      { name: 'Spinning',         notation: 'SET > (BACK) SPIN [BOD] >',                                       statusHint: 'platform-tracked', structuralNote: 'Component modifier: head of the spinning family above.' },
      { name: 'Inspinning',       notation: 'SET > (FRONT) SPIN [BOD] >',                                      statusHint: 'platform-tracked', structuralNote: 'Component modifier: directional sibling of spinning.' },
      { name: 'Gyro',             notation: 'CLIP > (BACK) SPIN [BOD] > (same dex component)',                 statusHint: 'platform-tracked', structuralNote: 'Component modifier: anchor of the torque-family lineage.' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────
// §3  Uptime-reinterpretation ladders
//
// Each ladder documents the relationship between a named set and its
// trick-structural source. Honest about disagreement where it exists.
// ─────────────────────────────────────────────────────────────────────

export const UPTIME_REINTERPRETATION_LADDERS: readonly UptimeReinterpretationLadder[] = [
  {
    setName:         'miraging',
    setNotation:     'SET > OP IN [DEX] >',
    reinterpretation:'Uptime mirage structure',
    steps: [
      'mirage   (atom)  =  SET > OP IN [DEX] > OP TOE [DEL]',
      'miraging (set)   =  SET > OP IN [DEX] >   (terminal delay omitted; the set continues into the next move)',
      'Reading: the mirage shape compressed into an uptime set. The dex direction and side are preserved; the toe-stall terminal is replaced by the dex into the next move.',
    ],
    sourceCitation:  'Per the platform\'s operational notation system; aligned with Holden\'s basic-set listing.',
    conflictNote:    null,
  },
  {
    setName:         'illusioning',
    setNotation:     'SET > OP OUT [DEX] >   (structurally implied)',
    reinterpretation:'Uptime illusion structure',
    steps: [
      'illusion    (atom) =  SET > OP OUT [DEX] > OP TOE [DEL]',
      'illusioning (set)  =  SET > OP OUT [DEX] >   (structurally analogous to miraging, but not explicitly in Holden\'s compilation)',
      'Reading: the illusion shape compressed into an uptime set form. Surfaced here as a structural symmetry: the platform tracks the trick, not the named uptime form.',
    ],
    sourceCitation:  'Structural inference from the mirage/illusion direction-mirror sibling pair; not in Holden\'s compilation.',
    conflictNote:    'Named "illusioning" is not currently in Holden\'s list or the platform canonical. Surfaced as a structural pattern rather than a documented set name.',
  },
  {
    setName:         'blurry',
    setNotation:     'CLIP > OP IN [DEX] > OP OUT [DEX] >',
    reinterpretation:'Stepping with a paradox second dex',
    steps: [
      'stepping (set)   =  CLIP > OP IN [DEX] >',
      '+ paradox second dex (OP OUT [DEX]) layered on top',
      '=  blurry (compound set) =  CLIP > OP IN [DEX] > OP OUT [DEX] >',
    ],
    sourceCitation:  'Per Holden\'s parenthetical (Blurry = Stepping Paradox) and the pt8 platform ruling. Aligned.',
    conflictNote:    null,
  },
  {
    setName:         'furious',
    setNotation:     'CLIP > OP IN [DEX] > SAME IN [DEX] >',
    reinterpretation:'Folded into Barraging as one two-dex set; the older third-dex reading is superseded',
    steps: [
      'barraging  =  CLIP > OP IN [DEX] > SAME IN [DEX] >',
      'furious is the same set under a retained name, with Barraging the more explanative term',
      'a superseded reading extended this with a third dex (OP IN [DEX]) as "Barraging Paradox Miraging"',
    ],
    sourceCitation:  'Holden compilation; later doctrine folds furious into barraging as one two-dex set.',
    conflictNote:    'The earlier three-dex Barraging Paradox Miraging chain is historical lineage, not current structure.',
  },
  {
    setName:         'surging',
    setNotation:     'SET > (BACK/FRONT) SPIN [BOD] > OP IN [DEX] >',
    reinterpretation:'Two recorded readings; the platform tracks both',
    steps: [
      'Holden\'s reading   =  spinning miraging  (a spin body modifier layered with a miraging-like terminal)',
      'Platform reading   =  spinning stepping  (per later compilation: a spin body modifier layered with a stepping CLIP-direction dex)',
      'Both readings share the SPIN [BOD] entry; they disagree on whether the terminal dex reads as miraging (SET-led) or stepping (CLIP-led).',
    ],
    sourceCitation:  'Holden\'s compilation + later platform analysis (see project memory: passback-dictionary-intake).',
    conflictNote:    'Surfaced as a documented disagreement, not normalized. See §4 (Consistency audit) below for the full Holden / platform comparison.',
  },
];

// ─────────────────────────────────────────────────────────────────────
// §4  Consistency audit: Holden ⇄ platform
//
// Single source of truth for the audit table rendered on
// /freestyle/compositional-sets §4.
//
// Categorization discipline (locked):
//   - Notation match + decomposition match           → 'aligned'
//   - Notation match + decomposition framing differs → 'partial'
//   - Notation OR decomposition substantively differs → 'conflict'
//   - No platform entry at all                        → 'holden-only'
//
// The audit is curatorial transparency, NOT a normalization pass.
// Holden-only entries are NOT promoted to canonical; conflicts are
// NOT silently resolved.
// ─────────────────────────────────────────────────────────────────────

export const COMPOSITIONAL_AUDIT_ENTRIES: readonly CompositionalAuditEntry[] = [
  // ── Aligned (notation + decomposition agree) ─────────────────────────
  {
    holdenName:      'Pixie',
    holdenReading:   'Basic set: TOE > SAME IN [DEX] >',
    platformReading: 'Same notation; +1 set primitive (operator reference, movement systems).',
    status:          'aligned',
    note:            null,
  },
  {
    holdenName:      'Stepping',
    holdenReading:   'Basic set: CLIP > OP IN [DEX] >',
    platformReading: 'Same notation; +1 set primitive (resolved formulas, movement systems).',
    status:          'aligned',
    note:            null,
  },
  {
    holdenName:      'Miraging',
    holdenReading:   'Basic set: SET > OP IN [DEX] >',
    platformReading: 'Same notation; uptime form of the mirage structural reading.',
    status:          'aligned',
    note:            null,
  },
  {
    holdenName:      'Quantum',
    holdenReading:   'TOE > OP IN [DEX] > (op side component); Holden reads as: compressed atomic.',
    platformReading: 'Same notation; operator reference frames as "compressed-atomic set". Decomposition aligns.',
    status:          'aligned',
    note:            null,
  },
  {
    holdenName:      'Blurry',
    holdenReading:   'CLIP > OP IN [DEX] > OP OUT [DEX] >; Holden parenthetical: Stepping Paradox.',
    platformReading: 'Same notation; platform tracks blurry = stepping paradox (the standing ruling on the compound).',
    status:          'aligned',
    note:            'Strong alignment: Holden\'s parenthetical and the platform\'s decomposition match exactly.',
  },
  {
    holdenName:      'Barraging',
    holdenReading:   'CLIP > OP IN [DEX] > SAME IN [DEX] >; Holden parenthetical: High Stepping.',
    platformReading: 'Same notation; platform tracks barraging as the high-stepping multi-dex pattern.',
    status:          'aligned',
    note:            null,
  },
  {
    holdenName:      'Furious',
    holdenReading:   'CLIP > OP IN [DEX] > SAME IN [DEX] > OP IN [DEX] >; Holden parenthetical: Barraging Paradox Miraging.',
    platformReading: 'Folded into Barraging as the same two-dex set, the more explanative name; the earlier three-dex extension reading is superseded.',
    status:          'partial',
    note:            'The three-dex Barraging Paradox Miraging reading is historical lineage; current doctrine treats Furious and Barraging as one set.',
  },
  {
    holdenName:      'Terraging',
    holdenReading:   'TOE > SAME IN [DEX] > SAME IN [DEX] >; Holden parenthetical: Double Pixie.',
    platformReading: 'No standalone platform entry, but the "Double Pixie" structural reading is consistent with pixie\'s notation doubled.',
    status:          'aligned',
    note:            'Decomposition is mechanically aligned with Holden\'s parenthetical; the name itself is Holden\'s.',
  },
  {
    holdenName:      'Pogo',
    holdenReading:   'CLIP > (no plant while) OP IN [DEX] >; Holden parenthetical: Symposium Whirling.',
    platformReading: 'Platform tracks pogo as a whirl-family no-plant variant; decomposition aligns.',
    status:          'aligned',
    note:            null,
  },
  {
    holdenName:      'Blistering',
    holdenReading:   'CLIP > OP IN [DEX] > (BACK) SPIN [BOD] >; Holden parenthetical: Whirling Gyro.',
    platformReading: 'Platform tracks blistering as a whirl-gyro compound; decomposition aligns.',
    status:          'aligned',
    note:            null,
  },
  {
    holdenName:      'Whirling',
    holdenReading:   'CLIP > OP IN [DEX] > (same side component).',
    platformReading: 'Operator reference tracks whirling as a body modifier on whirl bases; notation reading consistent.',
    status:          'aligned',
    note:            null,
  },

  // ── Partial (notation matches; ontological framing diverges) ─────────
  {
    holdenName:      'Atomic',
    holdenReading:   'TOE > OP OUT [DEX] > (op side component); Holden parenthetical: Toe set Illusion.',
    platformReading: 'Same notation; operator reference treats atomic as a primitive +1 set; any X-Dex is a separate [XDEX] component in the notation, not a compressed toe + illusion-class decomposition.',
    status:          'partial',
    note:            'Notation agrees. Holden offers a deeper structural reading (atomic IS a toe set followed by an illusion-class dex); the platform does not formalize that decomposition.',
  },
  {
    holdenName:      'Nuclear',
    holdenReading:   'CLIP > SAME OUT >; Holden lists as a basic single-dex set.',
    platformReading: 'Operator reference frames nuclear as a +2 set modifier combining paradox\'s hip pivot with a downtime illusioning dex.',
    status:          'partial',
    note:            'Notation matches. Holden treats nuclear as a basic; the platform treats it as a compound paradox + illusion stack.',
  },

  // ── Conflict (substantive decomposition disagreement) ────────────────
  {
    holdenName:      'Surging',
    holdenReading:   'SET > (BACK/FRONT) SPIN [BOD] > OP IN [DEX] >; Holden parenthetical: spinning miraging.',
    platformReading: 'Movement-systems module records surging as "decomposes to spinning + stepping" (CLIP-led, not SET-led).',
    status:          'conflict',
    note:            'Both readings share a SPIN body modifier and an OP IN dex direction. They disagree on the entry surface (Holden: any set; platform: stepping\'s CLIP), and therefore on which named set anchors the decomposition.',
  },

  // ── Holden-only (no platform canonical or tracked entry) ─────────────
  // Single-dex Holden basics with no platform entry
  { holdenName: 'Slapping',         holdenReading: 'TOE > OP IN [DEX] > (same side component).',                                platformReading: null, status: 'holden-only', note: 'Same-side-component sibling of quantum. Community-cited; no current platform canonical.' },
  { holdenName: 'Bubba',            holdenReading: 'CLIP > OP OUT [DEX] >.',                                                    platformReading: null, status: 'holden-only', note: 'Reverse-direction sibling of stepping. Community-cited; no current platform canonical.' },
  { holdenName: 'Tapping',          holdenReading: 'TOE > OP OUT [DEX] (plant) > (same side component); Holden: Atomic same side.', platformReading: null, status: 'holden-only', note: null },
  // Multi-dex Holden compounds with no platform entry
  { holdenName: 'Sailing',          holdenReading: 'TOE > SAME IN [DEX] > OP OUT [DEX] >; Holden: Pixie Illusion.',              platformReading: null, status: 'holden-only', note: 'Structural decomposition reads cleanly as pixie + illusion-class second dex; not in current platform canonical.' },
  { holdenName: 'Frantic',          holdenReading: 'TOE > SAME IN [DEX] > OP IN [DEX] >; Holden: pixie-quantum.',                platformReading: null, status: 'holden-only', note: 'Decomposes mechanically to pixie + quantum-direction second dex.' },
  { holdenName: 'Flailing',         holdenReading: 'SET > (no plant while) OP OUT [BOD] [DEX] >; Holden: Symposium Reverse Miraging.', platformReading: null, status: 'holden-only', note: 'Unusual notation with explicit no-plant constraint.' },
  { holdenName: 'Fairy Atomic',     holdenReading: 'TOE > SAME OUT [DEX] > OP OUT [DEX] >.',                                    platformReading: null, status: 'holden-only', note: null },
  { holdenName: 'Shooting',         holdenReading: 'CLIP > OP IN [DEX] > OP OUT [PDX][DEX] >; Holden: Stepping Paradox Illusion.', platformReading: null, status: 'holden-only', note: null },
  { holdenName: 'Infracting',       holdenReading: 'opposite of a Refraction, done as a set.',                                  platformReading: null, status: 'holden-only', note: 'Inverse pattern, not a literal grammar string.' },
  // Spinning family, all Holden-only
  { holdenName: 'Sonic',            holdenReading: 'CLIP > (BACK) SPIN [BOD] > (BACK) SPIN [BOD] >; Holden: double spinning.',  platformReading: null, status: 'holden-only', note: null },
  { holdenName: 'Peeking',          holdenReading: 'SET > (BACK) SPIN [BOD] > (BACK) SPIN [BOD] >; Holden: double spinning (SET-led).', platformReading: null, status: 'holden-only', note: null },
  { holdenName: 'Leaning',          holdenReading: 'CLIP > OP IN [DEX] > (front) SPIN [BOD] >; Holden: stepping inspinning.',   platformReading: null, status: 'holden-only', note: null },
  { holdenName: 'Go-Go',            holdenReading: 'CLIP > OP IN [DEX] > (back) spin [bod] >; Holden: stepping backspinning.',  platformReading: null, status: 'holden-only', note: 'Directional sibling of Leaning.' },
  { holdenName: 'Twinspinning',     holdenReading: 'CLIP > SAME OUT [DEX] > (FRONT) SPIN [BOD] >; Holden: nuclear inspinning.', platformReading: null, status: 'holden-only', note: null },
  { holdenName: 'Neutron',          holdenReading: 'TOE > OP OUT [DEX] > (BACK) SPIN [BOD] > (op side); Holden: Atomic spin.',  platformReading: null, status: 'holden-only', note: null },
  { holdenName: 'Fairy Spinning',   holdenReading: 'TOE > SAME OUT [DEX] > (BACK) SPIN [BOD] >.',                               platformReading: null, status: 'holden-only', note: null },
  { holdenName: 'Pixie Inspinning', holdenReading: 'TOE > SAME IN [DEX] > (FRONT) SPIN [BOD] >.',                               platformReading: null, status: 'holden-only', note: null },
  // Whirl/swirl variants, Holden-only naming distinctions
  { holdenName: 'Blazing',          holdenReading: 'CLIP > OP IN [DEX] > (op side component); whirling op-side variant.',       platformReading: null, status: 'holden-only', note: 'Holden distinguishes blazing from whirling by terminal-component side; the platform does not separate them.' },
  { holdenName: 'Scattered',        holdenReading: 'CLIP > OP OUT [DEX] > (same side); Holden: Reverse Whirling (same side).',  platformReading: null, status: 'holden-only', note: null },
  { holdenName: 'Shattered',        holdenReading: 'CLIP > OP OUT [DEX] > (op side); Holden: Reverse Whirling (op side).',      platformReading: null, status: 'holden-only', note: null },
  { holdenName: 'Broken',           holdenReading: 'CLIP > OP OUT [DEX] > (SAME); Holden: clipper reverse whirl.',              platformReading: 'Platform tracks rev-whirl as canonical; "Broken" itself is the Holden folk synonym.', status: 'holden-only', note: 'Asterisk in Holden\'s source. Name is folk; the underlying reverse-whirl shape is canonical.' },
  // UNS sets, all Holden-only
  { holdenName: 'Finchy',           holdenReading: 'PINCH > SAME OUT [DEX] >; Holden: Pinching Fairy set.',                     platformReading: null, status: 'holden-only', note: null },
  { holdenName: 'Pixie Pinching',   holdenReading: 'PINCH > SAME IN [DEX] >.',                                                  platformReading: null, status: 'holden-only', note: null },
  { holdenName: 'Twisted',          holdenReading: 'DRAGON > SAME FRONT SWIRL [DEX] > SAME IN/OUT [PDX][DEX] >; Holden: Dragon set Swirling Paradox.', platformReading: null, status: 'holden-only', note: null },
  { holdenName: 'Snapping',         holdenReading: 'DRAGON > SAME FRONT SWIRL [DEX] >; Holden: Dragon set Swirling.',           platformReading: null, status: 'holden-only', note: null },
  { holdenName: 'Arctic',           holdenReading: 'FRIGIDOSIS > SAME IN [DEX] >; Holden: frigidosis Pixie.',                   platformReading: null, status: 'holden-only', note: null },
  // Antisymposium, Holden-only conceptual notes
  { holdenName: 'Rooting / Rooted', holdenReading: 'Movement constraint: the setting foot stays on the ground.',                platformReading: null, status: 'holden-only', note: 'Discipline-level note rather than a literal set notation.' },
  { holdenName: 'Zoid',             holdenReading: 'rooted toe clipper set.',                                                   platformReading: null, status: 'holden-only', note: null },
];


/**
 * Compositional Sets content for /freestyle/compositional-sets.
 *
 * A systematic exploration of how named sets compose from a small
 * grammar — the dictionary-hub companion to the flat reference table
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
 *   are quoted verbatim from chrisHoldenSets.txt (community
 *   compilation circa 2003).
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
 * - 'canonical'        — the set name resolves to a current
 *                        freestyle_tricks dictionary entry; card
 *                        renders a /freestyle/tricks/<slug> link.
 * - 'platform-tracked' — the set appears in platform content modules
 *                        (operatorReference, symbolicEquivalences,
 *                        resolvedFormulas) but is not a standalone
 *                        dictionary entry; card renders without a
 *                        trick link.
 * - 'holden-only'      — Holden's compilation lists this name; the
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
   * surfacing inline. Used sparingly — full audit lives in Phase 2c.
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
      'One set, one dex, terminate. The simplest grammar shapes — every member ' +
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
      'core of the language — most named compound sets are a sequence of dex ' +
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
      { name: 'Furious',     notation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > OP IN [DEX] >',             statusHint: 'platform-tracked', structuralNote: 'Holden parenthetical: Barraging Paradox Miraging (see ladder §3).' },
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
      { name: 'Surging',            notation: 'SET > (BACK/FRONT) SPIN [BOD] > OP IN [DEX] >',                statusHint: 'platform-tracked', structuralNote: 'Holden reads as: spinning miraging. See ladder §3 — platform documents a divergent reading.' },
      { name: 'Twinspinning',       notation: 'CLIP > SAME OUT [DEX] > (FRONT) SPIN [BOD] >',                 statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: nuclear inspinning.' },
      { name: 'Neutron',            notation: 'TOE > OP OUT [DEX] > (BACK) SPIN [BOD] > (op side component)', statusHint: 'holden-only',       structuralNote: 'Holden parenthetical: Atomic spin.' },
    ],
  },
  {
    key:   'whirl-swirl-family',
    name:  'Whirl / swirl family',
    intro:
      'Sets that resolve into the whirl or swirl shape — cross-body rotational ' +
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
      'Sets whose initial contact is something other than toe or clip — a pinch, ' +
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
      '(the setting foot stays on the ground — the inverse discipline to ' +
      'symposium) and component modifiers that show up inside sets but rarely ' +
      'function as standalone set prefixes.',
    members: [
      { name: 'Rooting / Rooted', notation: 'The setting foot is on the ground (antisymposium discipline).',  statusHint: 'holden-only',       structuralNote: 'Movement constraint, not a literal grammar string.' },
      { name: 'Zoid',             notation: 'rooted toe clipper set',                                          statusHint: 'holden-only',       structuralNote: 'Set-name for the antisymposium toe-clip pattern.' },
      { name: 'Ducking',          notation: 'SET > DUCK [BOD] >',                                              statusHint: 'platform-tracked', structuralNote: 'Component modifier — appears inside sets, rarely a standalone set prefix.' },
      { name: 'Diving',           notation: 'SET > DIVE [BOD] >',                                              statusHint: 'platform-tracked', structuralNote: 'Component modifier — appears inside sets.' },
      { name: 'Spinning',         notation: 'SET > (BACK) SPIN [BOD] >',                                       statusHint: 'platform-tracked', structuralNote: 'Component modifier — head of the spinning family above.' },
      { name: 'Inspinning',       notation: 'SET > (FRONT) SPIN [BOD] >',                                      statusHint: 'platform-tracked', structuralNote: 'Component modifier — directional sibling of spinning.' },
      { name: 'Gyro',             notation: 'CLIP > (BACK) SPIN [BOD] > (same dex component)',                 statusHint: 'platform-tracked', structuralNote: 'Component modifier — anchor of the torque-family lineage.' },
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
      'Reading: the mirage shape compressed into an uptime set — the dex direction and side are preserved; the toe-stall terminal is replaced by the dex into the next move.',
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
      'Reading: the illusion shape compressed into an uptime set form. Surfaced here as a structural symmetry — the platform tracks the trick, not the named uptime form.',
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
    setNotation:     'CLIP > OP IN [DEX] > SAME IN [DEX] > OP IN [DEX] >',
    reinterpretation:'Barraging-set extended with a third dex',
    steps: [
      'barraging  =  CLIP > OP IN [DEX] > SAME IN [DEX] >',
      '+ third dex (OP IN [DEX]) extending the chain',
      '=  furious   =  CLIP > OP IN [DEX] > SAME IN [DEX] > OP IN [DEX] >',
      'Holden parenthetical reads it as "Barraging Paradox Miraging" — barraging\'s two-dex open, then a paradox sense (the same-in→op-in flip), and a miraging-like terminal.',
    ],
    sourceCitation:  'Per Holden\'s compilation; aligns with platform tracking of furious as a multi-dex chain.',
    conflictNote:    null,
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
    conflictNote:    'Surfaced as a documented disagreement, not normalized. The full audit of Holden/platform divergences is the next slice.',
  },
];

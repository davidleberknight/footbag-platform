/**
 * Curated naming-and-interpretation overlays for trick-detail pages.
 *
 * Renders a "Naming & interpretation" section on the trick-detail page.
 * It carries two kinds of curator note, both surfaced without resolving them:
 *
 *   1. Interpretation note (one move, competing analyses): a canonical reading
 *      (the published structural decomposition) AND one or more historical
 *      readings (community naming traditions that describe the SAME movement
 *      from a different vantage). Both are preserved; neither wins.
 *
 *   2. Terminology note (one label, different moves): the dictionary entry and
 *      a historical footbag.org move share a name but are NOT the same move.
 *      historicalReadings is left empty; the colliding move is described in
 *      structuralNotes, so it is never mislabelled as a "reading" of this trick.
 *
 * The section explains how the readings relate without conflating layers.
 *
 * Pedagogical purpose: a historical derivation describes how a trick
 * was named or first decomposed; it does NOT automatically establish a
 * productive modifier family. Eggbeater is the seed case: the canonical
 * reading is "atomic legover" and the historical reading is
 * "illusion + legover": both describe the same movement, but the
 * historical reading does not make "illusioning" a productive modifier
 * system across the dictionary.
 *
 * LAYER SEPARATION (forever-rule):
 *   This module is editorial overlay only. It does NOT change:
 *     - canonical JOB notation
 *     - canonical ADD values
 *     - aliases (alias slot is for name-form discoverability; this
 *       slot is for naming-tradition interpretation)
 *     - any ontology field (family, base_trick, productivity)
 *     - parser behavior or operational notation
 *     - promotion state
 *   It is an additional pedagogical layer separate from the S5
 *   equivalent-readings slot (which carries atom-level primary
 *   readings, not multi-tradition naming overlays).
 *
 * AUTHORSHIP DISCIPLINE (locked):
 *   - All prose is curator-curated, never auto-generated.
 *   - New entries land by explicit curator decision (one at a time or in a
 *     curator-directed batch). No bulk ingestion, no NLP, no inference.
 *   - A historical reading is published here ONLY when it is widely
 *     attested in the community vocabulary AND its presence on the
 *     trick-detail page would otherwise create confusion about whether
 *     the implied modifier family is productive.
 *   - Structural notes carry the layer-separation framing explicitly:
 *     "both readings describe the same trick" + "the historical reading
 *     does not imply a productive modifier family."
 */

export interface TrickInterpretationEntry {
  /** Canonical trick slug. */
  slug: string;
  /**
   * The published canonical reading: the structural decomposition the
   * rest of the site renders (notation, ADD math, family link).
   * Free-form text; typically a short compositional phrase such as
   * "atomic legover".
   */
  canonicalReading: string;
  /**
   * Historical readings preserved as community/naming-tradition
   * interpretation. Each is a short compositional phrase such as
   * "illusion + legover". Order is curator-meaningful (most widely
   * attested first). Empty for a terminology note, where the colliding
   * move is described in structuralNotes rather than presented as a
   * reading of this trick.
   */
  historicalReadings: readonly string[];
  /**
   * Structural notes that frame the layer separation. Renders as a
   * short bulleted list below the readings. Each note is one sentence.
   * The canonical framing ("both readings describe the same trick" +
   * "historical reading does not imply a productive modifier family")
   * is curator-locked here, not in the template, so the doctrine stays
   * consistent across all entries.
   */
  structuralNotes: readonly string[];
}

export const TRICK_INTERPRETATION_ENTRIES: readonly TrickInterpretationEntry[] = [
  // ── Interpretation notes: one move, competing analyses ──────────────────
  // The canonical reading is the decomposition the rest of the site renders;
  // each historical reading is an equally-valid community analysis of the same
  // movement. Both are preserved; neither is declared the winner.
  {
    slug: 'eggbeater',
    canonicalReading: 'atomic legover',
    historicalReadings: ['illusion + legover'],
    structuralNotes: [
      'Both readings describe the same trick.',
      'The historical "illusion + legover" reading is preserved as community / historical interpretation.',
      'It does not automatically imply that "illusioning" is a productive modifier system across the dictionary.',
    ],
  },
  {
    slug: 'torque',
    canonicalReading: 'miraging osis',
    historicalReadings: ['stepping opposite osis'],
    structuralNotes: [
      'Both readings describe the same move; the difference is in how sources analyze it, not in how it is performed.',
      'The canonical reading decomposes it as a miraging osis; an older reading describes it as a stepping opposite osis.',
    ],
  },
  {
    slug: 'blizzard',
    canonicalReading: 'stepping-far illusion',
    historicalReadings: ['blurry reverse symposium mirage'],
    structuralNotes: [
      'Both readings describe the same move.',
      'The dictionary reads it as a stepping-far illusion; an older community reading describes it as a blurry reverse symposium mirage.',
      'Neither reading is treated as the winner; they are preserved side by side.',
    ],
  },
  {
    slug: 'twirl',
    canonicalReading: 'reverse swirling osis',
    historicalReadings: ['opposite-leg swirling osis'],
    structuralNotes: [
      'Both readings describe the same move.',
      'The disagreement is primarily analytical rather than performative: the readings differ in how the swirl is described, not in what the body does.',
    ],
  },
  // ── Terminology notes: one label, different moves ───────────────────────
  // The dictionary entry and a historical footbag.org move share a name but
  // are NOT the same move. The historical move is described in the notes
  // rather than as a "historical reading", because it is a separate trick,
  // not another analysis of this one. No alias or merge links them.
  {
    slug: 'clipper',
    canonicalReading: 'cross-body inside-foot stall',
    historicalReadings: [],
    structuralNotes: [
      'A different move shares this name: the historical footbag.org "clipper kick" is a jumping inside-foot kick.',
      'This dictionary\'s clipper is a stall, not a kick; the two are distinct moves that share related terminology.',
      'They are not linked by an alias or a merge.',
    ],
  },
  {
    slug: 'butterfly-kick',
    canonicalReading: 'dex-kick with no terminal stall',
    historicalReadings: [],
    structuralNotes: [
      'A different move shares this name: the historical footbag.org "Butterfly Kick" is catch-terminated, ending in a clipper.',
      'This dictionary\'s butterfly-kick has no terminal stall; the two are distinct moves that share the same label.',
      'They are not linked by an alias or a merge.',
    ],
  },
];

/** Slug-keyed lookup helper. Returns null when no entry is curated. */
export function getTrickInterpretation(slug: string): TrickInterpretationEntry | null {
  return TRICK_INTERPRETATION_ENTRIES.find(e => e.slug === slug) ?? null;
}

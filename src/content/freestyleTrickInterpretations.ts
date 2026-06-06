/**
 * Curated naming-and-interpretation overlays for trick-detail pages.
 *
 * Renders a "Naming & interpretation" section on the trick-detail page
 * for tricks where multiple valid readings exist: a canonical reading
 * (the published structural decomposition) AND one or more historical
 * readings (community naming traditions that describe the same movement
 * from a different vantage). The section explains how the readings
 * relate without conflating layers.
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
 *   - New entries land one at a time, by curator decision. No bulk
 *     ingestion, no NLP, no inference. Starts with eggbeater only.
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
   * attested first).
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
];

/** Slug-keyed lookup helper. Returns null when no entry is curated. */
export function getTrickInterpretation(slug: string): TrickInterpretationEntry | null {
  return TRICK_INTERPRETATION_ENTRIES.find(e => e.slug === slug) ?? null;
}

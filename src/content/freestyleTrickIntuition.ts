/**
 * Curated movement-intuition prose for flagship trick-detail pages.
 *
 * Each entry pairs a canonical trick slug with a short, source-attributed
 * description of the body mechanics, timing, and felt experience of the
 * move. Renders as a "Movement intuition" section on the trick-detail
 * page, between "About" (which carries the compositional reading) and
 * "Notation" (which carries the symbolic structure).
 *
 * Pedagogical purpose: bridge the gap between "what the trick IS" and
 * "what the trick FEELS like." Notation and ontology describe the
 * structure; this layer describes the movement.
 *
 * AUTHORSHIP DISCIPLINE (locked):
 *   - All prose is curator-curated, never auto-generated.
 *   - When the source is a published reference (fb.org /newmoves,
 *     Holden compilation, PassBack), the attribution names it
 *     explicitly. Per the NR-1B precedent (pendulum/squeeze
 *     descriptions cited verbatim from fb.org), short verbatim
 *     citation is acceptable when the source's language is the
 *     pedagogically best framing.
 *   - When the prose is adapted or compressed, the attribution says
 *     "Adapted from <source>" rather than implying authorial copying.
 *   - New entries land one at a time, by curator decision; no bulk
 *     ingestion. The map starts with five core-atom flagships
 *     (mirage, whirl, butterfly, osis, illusion) and one compound
 *     flagship (mobius). Future expansion is gated by curator review.
 *
 * LAYER SEPARATION (forever-rule):
 *   This module is editorial PROSE only. It does NOT change:
 *     - canonical JOB notation
 *     - operational notation
 *     - ADD accounting
 *     - any ontology field
 *     - any compositional decomposition
 *   It is an additional pedagogical layer rendered between the
 *   compositional reading and the symbolic notation.
 *
 * Cross-references:
 *   - reference_fborg_newmoves_list (project memory) — the precedent
 *     for verbatim fb.org citation.
 *   - exploration/trick-detail-enrichment-audit-2026-05-23.md — the
 *     audit that motivated this module.
 */

export interface TrickIntuitionEntry {
  /** Canonical trick slug. */
  slug: string;
  /**
   * The movement-intuition prose. One paragraph; describes body
   * mechanics, timing, and felt experience. Avoids notation and
   * ontology jargon.
   */
  prose: string;
  /**
   * Source attribution line. Rendered below the prose. Names the
   * publication explicitly; uses "Per <source>" for verbatim
   * citation, "Adapted from <source>" for compressed or rewritten
   * prose.
   */
  attribution: string;
}

export const TRICK_INTUITION_ENTRIES: readonly TrickIntuitionEntry[] = [
  {
    slug: 'mirage',
    prose:
      'From a toe delay or a clipper delay, set the bag straight up, and swing the support leg from in to out over the footbag, catching it with the setting leg on a toe delay. The set from a clipper delay is easier once you know how to do a clipper. With a toe-set mirage, the support leg has to first swing under, then back over the bag.',
    attribution: 'Per fb.org /newmoves description (2-ADD canonical reference).',
  },
  {
    slug: 'whirl',
    prose:
      'From either a clipper or a toe delay, set the footbag up — then with the support leg circle the footbag from the front up and over the footbag. Hop off the original setting leg as you finish the dexterity and catch the bag on a clipper delay. It is easiest to point your toes down as you circle the bag because this makes it faster and less likely to snag the bag as you circle it.',
    attribution: 'Per fb.org /newmoves description (3-ADD canonical reference).',
  },
  {
    slug: 'butterfly',
    prose:
      'A leg over straight to a clipper delay. From a right toe set the footbag up and slightly towards yourself. Hop off your right leg and pass your left leg over the footbag, then delay the footbag with the inside surface of the right foot in a cross-body position — i.e. a clipper delay.',
    attribution: 'Per fb.org /newmoves description (3-ADD canonical reference).',
  },
  {
    slug: 'osis',
    prose:
      'Spin into a clipper delay. It is easiest to set this from a clipper stall on the other foot or from a toe delay with the other foot straight in front of you (not behind you). From a right toe set, set straight in front of you, about waist high, and turn to the left so the footbag passes behind your back. Keep your head down with your eyes on the footbag until just before it lands on the inside surface of your right foot. Then turn quickly to the left and catch the footbag on a clipper delay.',
    attribution: 'Per fb.org /newmoves description (3-ADD canonical reference).',
  },
  {
    slug: 'illusion',
    prose:
      'From a toe or a clipper delay, set the bag straight up about waist high. As you plant your set leg, bring your support leg up and over the bag from out to in — a reverse miraging motion. Plant the dexterity leg and catch the bag on the toe of the setting foot.',
    attribution: 'Per fb.org /newmoves description (2-ADD canonical reference).',
  },
  {
    slug: 'mobius',
    prose:
      'From a right clipper set, turn so the bag passes behind your back (clockwise), then without planting your right foot, spin into a right-leg mirage and catch the footbag on a left Osis. The structural reading is "gyro torque" — the spinning body modifier carries through a miraging-osis terminal.',
    attribution: 'Per fb.org /newmoves description (5-ADD canonical reference); compositional reading per pt11.',
  },
];

/** Slug-keyed lookup helper. Returns null when no entry is curated. */
export function getTrickIntuition(slug: string): TrickIntuitionEntry | null {
  return TRICK_INTUITION_ENTRIES.find(e => e.slug === slug) ?? null;
}

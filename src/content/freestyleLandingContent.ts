/**
 * freestyleLandingContent.ts
 *
 * The order in which the freestyle pages teach the twelve foundational moves.
 * The order is page copy; everything a page shows about each move (its name,
 * ADD and notation) is read from its dictionary row.
 */

/** The foundational moves, by dictionary slug, in teaching order. The
 *  `clipper_stall` row carries the foundational clipper (the `clipper` slug is
 *  the 1-ADD clipper kick). */
export const FOUNDATIONAL_MOVE_ORDER: readonly string[] = [
  'toe_stall',
  'clipper_stall',
  'mirage',
  'legover',
  'pickup',
  'illusion',
  'whirl',
  'butterfly',
  'swirl',
  'osis',
  'around_the_world',
  'orbit',
];

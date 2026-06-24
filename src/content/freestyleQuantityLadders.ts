/**
 * freestyleQuantityLadders.ts
 * ===========================
 *
 * Quantity ladders: progressions of the SAME base action at increasing
 * repetition count (spin -> double-spin -> triple-spin). These are NOT
 * families and NOT difficulty progressions — they link members that may sit
 * in different `trick_family` values, purely by repetition count.
 *
 * Reversible content overlay. Adding/retiring a ladder or a member is a
 * one-line edit; no DB column, no schema change, no `trick_family` re-home.
 * A member slug that is not active in `freestyle_tricks` renders as a
 * "missing" rung (the resolver flags it via `present: false` at shape time).
 */

export interface QuantityLadder {
  /** Stable ladder key (the base action). */
  readonly ladder: string;
  /** Display label, e.g. "Spin ladder". */
  readonly label: string;
  /** Member slugs in ascending repetition order. */
  readonly members: readonly string[];
  /** One-line WHY: what each rung adds over the previous. */
  readonly rationale: string;
}

export const QUANTITY_LADDERS: readonly QuantityLadder[] = [
  {
    ladder:    'spin',
    label:     'Spin ladder',
    members:   ['spin', 'double_spin', 'triple_spin'],
    rationale: 'Each rung adds one more full 360-degree body rotation between contacts.',
  },
  {
    ladder:    'around_the_world',
    label:     'Around-the-world ladder',
    members:   ['around_the_world', 'double_around_the_world', 'triple_around_the_world'],
    rationale: 'Each rung adds one more full circle of the foot around the bag between toe delays.',
  },
  {
    ladder:    'orbit',
    label:     'Orbit ladder',
    members:   ['orbit', 'double_orbit', 'triple_orbit'],
    rationale: 'Each rung adds one more orbit of the leg around the bag.',
  },
];

const SLUG_TO_LADDER: ReadonlyMap<string, QuantityLadder> = new Map(
  QUANTITY_LADDERS.flatMap(l => l.members.map(m => [m, l] as const)),
);

/** The quantity ladder a trick belongs to, or null when it is not a ladder member. */
export function quantityLadderFor(slug: string): QuantityLadder | null {
  return SLUG_TO_LADDER.get((slug || '').trim()) ?? null;
}

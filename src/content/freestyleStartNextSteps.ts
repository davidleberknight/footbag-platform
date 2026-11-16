/**
 * The six short lessons that close the getting-started page, in reading order.
 *
 * Each teaches one idea about how the vocabulary is organized: what a dex is,
 * a complete trick, an ending that defines a trick, a family, a set, and a
 * modifier. They follow the page's first physical steps rather than replace
 * them. Order and lessons are the curator-set sequence.
 *
 * Reversible TS content module.
 */

/** One lesson as authored: it links to a page, or names a family whose page it
 *  links to while that family has one. */
export type StartNextStepSource =
  | { name: string; lesson: string; href: string }
  | { name: string; lesson: string; familySlug: string };

/** One lesson as rendered: its link, or null when the family has no page. */
export interface StartNextStep {
  name:   string;
  lesson: string;
  href:   string | null;
}

export const START_NEXT_STEPS_INTRO = 'Six short lessons, in order. Start with the first.';

export const START_NEXT_STEPS: readonly StartNextStepSource[] = [
  { name: 'Around the World', lesson: 'the plainest dexterity, one leg circling the bag.',                    href: '/freestyle/tricks/around_the_world' },
  { name: 'Mirage',           lesson: 'a complete trick: set, dexterity and catch.',                         href: '/freestyle/tricks/mirage' },
  { name: 'Butterfly',        lesson: 'a dexterity that ends in a clipper catch behind the other leg.',      familySlug: 'butterfly' },
  { name: 'Whirl',            lesson: 'one ending shared by a whole family of tricks.',                       familySlug: 'whirl' },
  { name: 'Pixie',            lesson: 'a named set that starts many tricks.',                                 href: '/freestyle/sets/pixie' },
  { name: 'Spinning',         lesson: 'a full-body spin layered through a trick.',                            href: '/freestyle/modifier/spinning' },
];

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

export interface StartNextStep {
  name:   string;
  lesson: string;
  href:   string;
}

export const START_NEXT_STEPS_INTRO = 'Six short lessons, in order. Start with the first.';

export const START_NEXT_STEPS: readonly StartNextStep[] = [
  { name: 'Around the World', lesson: 'What a dexterity is: the plainest circling motion in the vocabulary, the same leg orbiting the bag and the same toe catching it.', href: '/freestyle/tricks/around_the_world' },
  { name: 'Mirage',           lesson: 'A complete trick: set, opposite-leg dexterity, and a catch back on the setting toe, the loop much of freestyle builds on.',        href: '/freestyle/tricks/mirage' },
  { name: 'Butterfly',        lesson: 'The catch is structure: the same one-dex idea resolving to a cross-body clipper catch, so how a trick ends is part of what it is.', href: '/freestyle/families/butterfly' },
  { name: 'Whirl',            lesson: 'One structure grows a family: a stable clipper ending inherited by a whole family of variations.',                                 href: '/freestyle/families/whirl' },
  { name: 'Pixie',            lesson: 'Sets are how tricks begin: one named launch structure that opens terraging, sailing, frantic, and more.',                          href: '/freestyle/sets/pixie' },
  { name: 'Spinning',         lesson: 'Modifiers multiply the vocabulary: a full-body rotation layered through a trick, taught with a progression built on the whirl.',   href: '/freestyle/modifier/spinning' },
];

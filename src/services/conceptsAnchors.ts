/**
 * conceptsAnchors.ts
 *
 * Single source of truth for deep-link URLs from the modifier teaching pages into
 * Freestyle Concepts (/freestyle/concepts). The A–Z Glossary at
 * /freestyle/glossary holds only short definitions and is not a deep-link target
 * for these callers.
 *
 * Every link lands on an element the page renders: an id="term-{slug}" anchor for
 * a foundational move or the clipper surface, the Operators and Modifiers section
 * for a modifier, the Timing and Sets section for a launch set, or the Jobs
 * notation subsection. Unknown terms fall back to the bare Concepts URL
 * (fail-graceful).
 *
 * Observational-layer separation: this module produces deep-link URLs only.
 * No DB reads, no canonical mutation. Pure function.
 */

const CONCEPTS_PATH = '/freestyle/concepts';

// Foundational moves and the clipper surface, each anchored by its own
// id="term-{slug}" on the page.
const FOUNDATIONAL_TRICK_TERMS: ReadonlySet<string> = new Set([
  'clipper',
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
]);

// A foundational term whose rendered anchor slug differs from its display form.
// The foundational-moves list anchors each move by its underscore slug
// (id="term-around_the_world"), but callers may pass the spaced or hyphenated
// display name.
const FOUNDATIONAL_ANCHOR_SLUG_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ['around-the-world', 'around_the_world'],
  ['around the world', 'around_the_world'],
  ['around_the_world', 'around_the_world'],
]);

// Modifiers, explained together in the Operators and Modifiers section.
const MODIFIER_TERMS: ReadonlySet<string> = new Set([
  'stepping',
  'paradox',
  'spinning',
  'ducking',
  'symposium',
  'cross-body',
]);

// Launch sets, explained in the Timing and Sets section.
const SET_TERMS: ReadonlySet<string> = new Set([
  'pixie',
  'fairy',
]);

const REFERENCE_SECTION_ANCHORS: ReadonlyMap<string, string> = new Map([
  ['jobs-notation', 'jobs-notation'],
  ['job-notation', 'jobs-notation'],
  ['job notation', 'jobs-notation'],
  ['jobs notation', 'jobs-notation'],
]);

/**
 * Map a term to its deep-link URL on /freestyle/concepts.
 *
 * Falls back to the bare Concepts URL when no anchor exists for the term.
 */
export function conceptsHrefForTerm(term: string): string {
  const normalized = term.trim().toLowerCase();
  const anchorOverride = FOUNDATIONAL_ANCHOR_SLUG_OVERRIDES.get(normalized);
  if (anchorOverride) return `${CONCEPTS_PATH}#term-${anchorOverride}`;
  if (FOUNDATIONAL_TRICK_TERMS.has(normalized)) return `${CONCEPTS_PATH}#term-${normalized}`;
  if (MODIFIER_TERMS.has(normalized)) return `${CONCEPTS_PATH}#section-modifiers`;
  if (SET_TERMS.has(normalized)) return `${CONCEPTS_PATH}#section-timing-sets`;
  const refAnchor = REFERENCE_SECTION_ANCHORS.get(normalized);
  if (refAnchor) return `${CONCEPTS_PATH}#${refAnchor}`;
  return CONCEPTS_PATH;
}

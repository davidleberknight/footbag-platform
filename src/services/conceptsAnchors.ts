/**
 * conceptsAnchors.ts
 *
 * Single source of truth for deep-link URLs from progression / modifier pages
 * into Freestyle Concepts (/freestyle/concepts), the chapter-based reference
 * where each term's in-depth explanation lives. The A–Z Glossary at
 * /freestyle/glossary holds only short definitions and is not a deep-link
 * target for these callers.
 *
 * Two anchor sources exist on the Concepts page:
 *   - Connective panels — id="glossary-panel-{term}" for
 *     paradox, symposium, ducking, spinning, whirl, pixie (richest entries)
 *   - Inline term anchors — id="term-{slug}" for foundational
 *     tricks (butterfly, clipper, mirage, etc.) and the modifier quick-
 *     reference (stepping, paradox, spinning, ducking, symposium, cross-body)
 *
 * Preference order:
 *   1. connective-panel anchor when one exists (richer content)
 *   2. inline term anchor otherwise
 *   3. Bare Concepts URL as fallback for unknown terms (fail-graceful)
 *
 * Observational-layer separation: this module produces deep-link URLs only.
 * No DB reads, no canonical mutation. Pure function.
 */

const CONCEPTS_PATH = '/freestyle/concepts';

const CONNECTIVE_PANEL_TERMS: ReadonlySet<string> = new Set([
  'paradox',
  'symposium',
  'ducking',
  'spinning',
  'whirl',
  'pixie',
]);

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
// The foundational-tricks list anchors each atom by its underscore slug
// (id="term-around_the_world"), but callers may pass the spaced or hyphenated
// display name. Map every written form to the underscore anchor the page emits.
// Single-word atoms (mirage, whirl, orbit) need no entry, and cross-body is
// hyphen-anchored on both sides, so it is intentionally absent.
const FOUNDATIONAL_ANCHOR_SLUG_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ['around-the-world', 'around_the_world'],
  ['around the world', 'around_the_world'],
  ['around_the_world', 'around_the_world'],
]);

// Set-modifier anchors preserved on the Concepts page so that cross-link
// consumers (trick pages, semantic notation tokens) resolve to a defined anchor
// instead of the bare Concepts URL. Pixie and Fairy are set modifiers, not
// irreducible core tricks; they render in a small clarifying subsection of the
// Operators & Modifiers chapter rather than in the foundational-tricks list.
const SET_MODIFIER_ANCHOR_TERMS: ReadonlySet<string> = new Set([
  'pixie',
  'fairy',
]);

const MODIFIER_REFERENCE_TERMS: ReadonlySet<string> = new Set([
  'stepping',
  'paradox',
  'spinning',
  'ducking',
  'symposium',
  'cross-body',
]);

// Reference-section anchors for top-level Concepts subsections that are
// not term-keyed (id="term-{slug}") and not connective-panel-keyed
// (id="glossary-panel-{slug}"). Deep links resolve to the bare anchor.
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
  if (CONNECTIVE_PANEL_TERMS.has(normalized)) {
    return `${CONCEPTS_PATH}#glossary-panel-${normalized}`;
  }
  const anchorOverride = FOUNDATIONAL_ANCHOR_SLUG_OVERRIDES.get(normalized);
  if (anchorOverride) {
    return `${CONCEPTS_PATH}#term-${anchorOverride}`;
  }
  if (
    FOUNDATIONAL_TRICK_TERMS.has(normalized) ||
    MODIFIER_REFERENCE_TERMS.has(normalized) ||
    SET_MODIFIER_ANCHOR_TERMS.has(normalized)
  ) {
    return `${CONCEPTS_PATH}#term-${normalized}`;
  }
  const refAnchor = REFERENCE_SECTION_ANCHORS.get(normalized);
  if (refAnchor) {
    return `${CONCEPTS_PATH}#${refAnchor}`;
  }
  return CONCEPTS_PATH;
}

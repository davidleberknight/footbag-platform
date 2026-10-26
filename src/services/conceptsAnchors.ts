/**
 * conceptsAnchors.ts
 *
 * Single source of truth for deep-link URLs from progression / modifier pages
 * into Freestyle Concepts (/freestyle/concepts), the chapter-based reference
 * where each term's in-depth explanation lives. The A–Z Glossary at
 * /freestyle/glossary holds only short definitions and is not a deep-link
 * target for these callers.
 *
 * Every link lands on the entry that teaches the term: an id="term-{slug}"
 * anchor for foundational tricks (butterfly, clipper, mirage, etc.) and the
 * modifier reference (stepping, paradox, spinning, ducking, symposium,
 * cross-body), a teaching-home override where a term is taught somewhere other
 * than its own term anchor, or a reference-section anchor. Unknown terms fall
 * back to the bare Concepts URL (fail-graceful).
 *
 * The page once carried id="glossary-panel-{term}" connective panels. They are
 * gone, but bookmarks and outside links still use them, so LEGACY_PANEL_TARGETS
 * names the element each old panel id now sits inside; the page renders the old
 * id there, and the deep-link opener reveals it like any other target.
 *
 * Observational-layer separation: this module produces deep-link URLs only.
 * No DB reads, no canonical mutation. Pure function.
 */

const CONCEPTS_PATH = '/freestyle/concepts';

// Terms taught somewhere other than their own term anchor. Pixie's term anchor
// is a one-line set-modifier card; the named-sets entry in Timing & Sets is
// where it is defined as a launch set.
const TEACHING_HOME_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ['pixie', 'term-set-launches'],
]);

/**
 * Old connective-panel ids and the element id each one now renders inside.
 * The Concepts page renders every key as an empty anchor at the start of its
 * target, so a bookmark to the old id lands on the entry that teaches the term.
 */
export const LEGACY_PANEL_TARGETS: ReadonlyMap<string, string> = new Map([
  ['glossary-panel-paradox',   'term-paradox'],
  ['glossary-panel-symposium', 'term-symposium'],
  ['glossary-panel-spinning',  'term-spinning'],
  ['glossary-panel-ducking',   'term-ducking'],
  ['glossary-panel-whirl',     'term-whirl'],
  ['glossary-panel-pixie',     'term-set-launches'],
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
// not term-keyed (id="term-{slug}"). Deep links resolve to the bare anchor.
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
  const home = TEACHING_HOME_OVERRIDES.get(normalized);
  if (home) {
    return `${CONCEPTS_PATH}#${home}`;
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

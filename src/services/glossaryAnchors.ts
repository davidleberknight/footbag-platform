/**
 * glossaryAnchors.ts
 *
 * Single source of truth for deep-link URLs from progression / modifier pages
 * into the freestyle glossary.
 *
 * Two anchor sources exist on the glossary page:
 *   - §13 "Connective glossary panels" — id="glossary-panel-{term}" for
 *     paradox, symposium, ducking, spinning, whirl, pixie (richest entries)
 *   - §3 / §10 inline term anchors — id="term-{slug}" for foundational
 *     tricks (butterfly, clipper, mirage, etc.) and the modifier quick-
 *     reference (stepping, paradox, spinning, ducking, symposium, cross-body)
 *
 * Preference order:
 *   1. §13 connective-panel anchor when one exists (richer content)
 *   2. §3 / §10 inline anchor otherwise
 *   3. Bare glossary URL as fallback for unknown terms (fail-graceful)
 *
 * Observational-layer separation: this module produces deep-link URLs only.
 * No DB reads, no canonical mutation. Pure function.
 */

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
  'around-the-world',
  'orbit',
]);

// Set-modifier anchors preserved on the glossary so that cross-link consumers
// (trick pages, semantic notation tokens) resolve to a defined anchor instead
// of the bare /freestyle/glossary URL. Pixie and Fairy are set modifiers, not
// irreducible core tricks; they render in a small clarifying subsection under
// §10 rather than in the foundational-tricks list.
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

/**
 * Map a glossary term to its deep-link URL on /freestyle/glossary.
 *
 * Falls back to the bare glossary URL when no anchor exists for the term.
 */
export function glossaryHrefForTerm(term: string): string {
  const normalized = term.trim().toLowerCase();
  if (CONNECTIVE_PANEL_TERMS.has(normalized)) {
    return `/freestyle/glossary#glossary-panel-${normalized}`;
  }
  if (
    FOUNDATIONAL_TRICK_TERMS.has(normalized) ||
    MODIFIER_REFERENCE_TERMS.has(normalized) ||
    SET_MODIFIER_ANCHOR_TERMS.has(normalized)
  ) {
    return `/freestyle/glossary#term-${normalized}`;
  }
  return '/freestyle/glossary';
}

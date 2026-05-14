/**
 * coreTrickRegistry.ts
 *
 * Authoritative registry of irreducible atoms in the freestyle ontology.
 * The 12 canonical core tricks per curator direction; the boundary that
 * gates atomic-vs-decomposable rendering decisions on /freestyle/tricks/:slug.
 *
 * Forever-rules:
 *   - A trick is irreducibly atomic ONLY if its slug is in this set.
 *   - Non-membership = decomposable. Missing structural data on a non-core
 *     trick is a curation gap, not proof of atomicity.
 *   - This registry is NOT the same as `FOUNDATIONAL_TRICK_TERMS` in
 *     `glossaryAnchors.ts` — that constant scopes glossary anchor de-duping
 *     and includes terms (clipper, pixie, fairy) that are NOT atoms here.
 *     The two registries have legitimately different scopes and may diverge.
 *   - The "orbit" folk-name in the user's canonical list maps to dictionary
 *     slug `reverse-around-the-world` (no `orbit` slug exists). CORE membership
 *     wins over the dictionary row's `base_trick=around-the-world` assignment
 *     when gating Layer 4a (atom silence) vs Layer 4b (curation gap).
 */

export const CORE_TRICKS: ReadonlySet<string> = new Set([
  'toe-stall',
  'clipper-stall',
  'around-the-world',
  'reverse-around-the-world',   // folk name: "orbit" (rev ATW)
  'legover',
  'pickup',
  'mirage',
  'illusion',
  'butterfly',
  'osis',
  'whirl',
  'swirl',
]);

/**
 * Return true when the slug is an irreducible atom. O(1).
 */
export function isCoreTrick(slug: string): boolean {
  return CORE_TRICKS.has(slug.trim().toLowerCase());
}

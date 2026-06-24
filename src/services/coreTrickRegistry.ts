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
 *   - orbit is a canonical dictionary slug; reverse-around-the-world and
 *     reverse-atw are aliases.
 *     The `clipper_stall` slug carries the foundational atom (community
 *     shorthand `#clipper`); the `clipper` slug is the ADD-1 Clipper Kick,
 *     NOT a core atom.
 */

export const CORE_TRICKS: ReadonlySet<string> = new Set([
  'toe_stall',
  'clipper_stall',
  'around_the_world',
  'orbit',
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

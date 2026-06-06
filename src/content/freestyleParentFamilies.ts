/**
 * freestyleParentFamilies.ts
 * ==========================
 *
 * Parent-family skeleton from the curator's short family ruling pass.
 * Reversible TS content map; NO `freestyle_tricks.trick_family` data is
 * overwritten.
 *
 * What this module does
 * ---------------------
 * The family-view bucketing in freestyleService resolves each row to a family
 * slug (FAMILY_OVERRIDES → trick_family). This module adds ONE more hop: a
 * family-LABEL → PARENT-family map. A child label (e.g. `torque`) resolves to
 * its parent anchor (`osis`), so the child's rows bucket UNDER the parent and
 * the child no longer renders as its own top-level family. Children are
 * therefore subordinate (merged under the parent), not top-level.
 *
 * Scope = ONLY the rulings the curator approved in the short pass:
 *   - 8 parent anchors (R1): mirage, illusion, butterfly, legover, pickup,
 *     whirl (display "Whirl / Swirl"), osis, around-the-world.
 *   - approved merges (R5): osis ← torque/blender/mobius; whirl ← swirl/twirl/
 *     rev-whirl/whirling-swirl; legover ← double-leg-over/guay/eggbeater;
 *     pickup ← double-pickup; around-the-world ← atw/double-around-the-world;
 *     mirage ← paradox-mirage/paradox-illusion.
 *
 * Route-outs (modifier ecosystems, alternative surfaces, foundational surfaces,
 * multi-bag/kick) are handled by RETIRED_FAMILIES in freestyleFamilyOverrides.ts
 * (the existing route-out mechanism), NOT here.
 *
 * Deferred labels (blurry, eclipse, butterfly-swirl, orbit, down/fusion,
 * drifter lineage, folk microfamilies, symposium-pixie/trixie, …) are
 * deliberately ABSENT from this map and from RETIRED_FAMILIES, so they keep
 * rendering as their own family groups, untouched, until the full ruling pass.
 *
 * Reversibility: delete a row here and the child returns to its own family on
 * the next request. No data migration, no schema change.
 */

/** Child family-label → parent anchor slug. */
export const PARENT_FAMILY_OF_LABEL: ReadonlyMap<string, string> = new Map<string, string>([
  // Whirl / Swirl rotational lineage
  ['swirl',          'whirl'],
  ['twirl',          'whirl'],
  ['rev-whirl',      'whirl'],
  ['whirling-swirl', 'whirl'],
  // Osis spin-to-clipper lineage
  ['torque',         'osis'],
  ['blender',        'osis'],
  ['mobius',         'osis'],
  // Legover leggy-over lineage
  ['double-leg-over', 'legover'],
  ['guay',            'legover'],
  ['eggbeater',       'legover'],
  // Pickup lineage
  ['double-pickup',  'pickup'],
  // Around-the-world lineage (atw is an alias-merge of the same lineage)
  ['atw',                     'around-the-world'],
  ['double-around-the-world', 'around-the-world'],
  // Mirage single-compound folds (not their own families)
  ['paradox-mirage',    'mirage'],
  ['paradox-illusion',  'mirage'],
]);

/**
 * Resolve a family label to its parent anchor. Returns the parent when the
 * label is an approved child; otherwise returns the label unchanged (parents,
 * and deferred labels, resolve to themselves).
 */
export function resolveParentFamily(familySlug: string): string {
  return PARENT_FAMILY_OF_LABEL.get(familySlug) ?? familySlug;
}

/**
 * Ordered list of the 8 approved canonical parent anchors. Used to order the
 * family-view sections (parents first; deferred labels render after).
 */
export const PARENT_FAMILY_ORDER: readonly string[] = [
  'mirage',
  'illusion',
  'butterfly',
  'legover',
  'pickup',
  'whirl',
  'osis',
  'around-the-world',
];

/**
 * Parent display-name overrides. Only `whirl` differs from the default
 * capitalize/override resolution: the combined rotational parent reads
 * "Whirl / Swirl". Other parents use the existing display resolver.
 */
export const PARENT_FAMILY_DISPLAY: ReadonlyMap<string, string> = new Map<string, string>([
  ['whirl', 'Whirl / Swirl'],
]);

/** True when the slug is one of the 8 approved canonical parent anchors. */
export function isParentFamily(slug: string): boolean {
  return PARENT_FAMILY_ORDER.includes(slug);
}

/**
 * freestyleFamilyTiers.ts
 * =======================
 *
 * Display-tier classification for the public family roster. This is a
 * PRESENTATION layer over `PUBLIC_DISPLAY_FAMILIES`. It never changes
 * `trick_family` data, roster membership, or any schema; it only decides how a
 * family is shown (first-class section vs a compact minor-lineage band).
 *
 * First-class status is CURATED STRUCTURAL DOCTRINE, not a numeric threshold. A
 * family is first-class because the project has ruled it a teachable lineage,
 * never because its live membership crossed a count. The explicit set below IS
 * that ruling: promoting or demoting a family is a deliberate, per-family edit
 * here, and a lineage does not become first-class merely because its live
 * membership passes some number, nor lose first-class status when membership
 * falls. Displayed member counts are computed live from rendered membership
 * elsewhere and never feed this classification.
 *
 * Three tiers:
 *   - Family Parent              — a curated first-class lineage, taught as a
 *                                  first-class family with its own page.
 *   - Minor Lineage              — a conserved-terminal lineage that is real and
 *                                  browsable but not (currently) first-class.
 *   - Foundational Terminal Surface — a universal catch surface (toe, clipper)
 *                                  that nearly every trick resolves to, too
 *                                  broad to teach as a lineage.
 */

export type FamilyTier =
  | 'family-parent'
  | 'minor-lineage'
  | 'foundational-terminal-surface';

/**
 * The universal catch surfaces. Nearly every trick resolves to one of these, so
 * grouping by them would bury the whole dictionary; they are shown as
 * Foundational Terminal Surfaces and stay outside the ordinary family tiers
 * regardless of how many tricks land on them. A surface is never a first-class
 * family and must not be added to the curated set below.
 */
export const FOUNDATIONAL_TERMINAL_SURFACES: ReadonlySet<string> = new Set([
  'toe_stall',
  'clipper_stall',
]);

/**
 * The curated first-class families, by ruling. Membership in this set is the
 * ONLY thing that makes a family first-class; it is not derived from any count.
 * Preserve this roster as-is; changing it is a per-family, separately-ratified
 * edit, never an automatic consequence of data growth or shrinkage.
 */
export const FIRST_CLASS_FAMILIES: ReadonlySet<string> = new Set([
  'osis', 'whirl', 'legover', 'mirage', 'butterfly', 'down', 'illusion',
  'swirl', 'pickup', 'blender', 'torque', 'double_leg_over', 'drifter',
  'barfly', 'eggbeater', 'double_over_down', 'inside_stall',
]);

export const FAMILY_TIER_LABEL: Readonly<Record<FamilyTier, string>> = {
  'family-parent':                 'Family Parent',
  'minor-lineage':                 'Minor Lineage',
  'foundational-terminal-surface': 'Foundational Terminal Surface',
};

/**
 * Display tier for a family slug. Pure and curated: a foundational surface is
 * always a Foundational Terminal Surface; a slug in the curated first-class set
 * is a Family Parent; everything else is a Minor Lineage. Live member counts
 * never enter this decision.
 */
export function familyTier(slug: string): FamilyTier {
  if (FOUNDATIONAL_TERMINAL_SURFACES.has(slug)) return 'foundational-terminal-surface';
  return FIRST_CLASS_FAMILIES.has(slug) ? 'family-parent' : 'minor-lineage';
}

/**
 * Strict test for the official Family Parents: true only for a curated
 * first-class family, never for a foundational terminal surface. This decides
 * whether a detail-page section reads "<name> Family" (a true official family
 * with its own page) versus "<name> Related" (an adjacency group that is not an
 * official family).
 */
export function isOfficialFamilyParent(slug: string): boolean {
  return !FOUNDATIONAL_TERMINAL_SURFACES.has(slug) && FIRST_CLASS_FAMILIES.has(slug);
}

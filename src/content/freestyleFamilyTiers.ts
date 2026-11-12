/**
 * freestyleFamilyTiers.ts
 * =======================
 *
 * The rules behind a family's display tier, not the tiers themselves: which
 * tier each family holds is curator data in freestyle_families, read through
 * src/services/freestyleFamilyRegistry.ts and edited in the family editor.
 *
 * Tier is curated structural doctrine, not a numeric threshold. A family is a
 * family parent because it has been ruled a teachable lineage, never because its
 * live membership crossed a count, and displayed member counts never feed it.
 *
 * Three tiers:
 *   - Family Parent              — a curated first-class lineage, taught as a
 *                                  first-class family with its own page.
 *   - Minor Lineage              — a conserved-terminal lineage that is real and
 *                                  browsable but not first-class.
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
 * regardless of how many tricks land on them. A surface is never a family
 * parent: the family editor and the seeder both refuse to make one.
 */
export const FOUNDATIONAL_TERMINAL_SURFACES: ReadonlySet<string> = new Set([
  'toe_stall',
  'clipper_stall',
]);

export const FAMILY_TIER_LABEL: Readonly<Record<FamilyTier, string>> = {
  'family-parent':                 'Family Parent',
  'minor-lineage':                 'Minor Lineage',
  'foundational-terminal-surface': 'Foundational Terminal Surface',
};

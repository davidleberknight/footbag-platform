/**
 * freestyleFamilyTiers.ts
 * =======================
 *
 * Display-tier classification for the public family roster. This is a
 * PRESENTATION layer over `PUBLIC_DISPLAY_FAMILIES` and the live
 * `freestyle_tricks.trick_family` counts. It never changes `trick_family`
 * data, roster membership, or any schema; it only decides how a family is
 * shown (first-class section vs a compact minor-lineage band).
 *
 * Three tiers:
 *   - Family Parent              — a conserved-terminal lineage broad enough to
 *                                  teach as a first-class family.
 *   - Minor Lineage              — a conserved-terminal lineage with too few
 *                                  documented descendants to be first-class;
 *                                  still real and browsable.
 *   - Foundational Terminal Surface — a universal catch surface (toe, clipper)
 *                                  that nearly every trick resolves to, too
 *                                  broad to teach as a lineage.
 */

export type FamilyTier =
  | 'family-parent'
  | 'minor-lineage'
  | 'foundational-terminal-surface';

/**
 * Current editorial standard, not an eternal rule. A conserved-terminal family
 * with MORE THAN this many documented descendants is shown as a first-class
 * Family Parent; fewer is shown as a Minor Lineage. Reversible: change this one
 * number to retune which lineages are first-class.
 */
export const FAMILY_PARENT_MIN_DESCENDANTS = 10;

/**
 * The universal catch surfaces. Nearly every trick resolves to one of these, so
 * grouping by them would bury the whole dictionary; they are shown as
 * Foundational Terminal Surfaces and excluded from family status regardless of
 * descendant count.
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

/**
 * Tier from a descendant count + the threshold. Pure: foundational surfaces win
 * regardless of count, otherwise the threshold decides. Used directly where a
 * live count is the right input, and by `familyTier` below for the roster.
 */
export function classifyFamilyTier(slug: string, descendantCount: number): FamilyTier {
  if (FOUNDATIONAL_TERMINAL_SURFACES.has(slug)) return 'foundational-terminal-surface';
  return descendantCount > FAMILY_PARENT_MIN_DESCENDANTS ? 'family-parent' : 'minor-lineage';
}

/**
 * Curated documented-descendant count per public family, the stable metric the
 * tier classification reads. Kept here (not recomputed per request) so a
 * family's tier does not flip with day-to-day membership churn or with the
 * smaller fixtures used in tests; live counts still drive the displayed section
 * and band counts. Current editorial standard, reversible: edit a count as the
 * corpus grows, or edit FAMILY_PARENT_MIN_DESCENDANTS to retune the cut.
 */
export const FAMILY_DESCENDANT_COUNTS: ReadonlyMap<string, number> = new Map([
  ['osis', 84], ['whirl', 74], ['legover', 71], ['mirage', 69], ['butterfly', 48],
  // Down aggregates its four variant branches plus the dod sub-label per the
  // expert ruling (one family, a single structural decomposition with set/foot
  // variants): barfly + double_over_down (+ dod) + paradon + down_double_down.
  ['down', 45],
  ['illusion', 34], ['swirl', 29], ['pickup', 27], ['blender', 22], ['torque', 22],
  ['double_leg_over', 16], ['drifter', 14], ['barfly', 13], ['eggbeater', 13],
  ['double_over_down', 12], ['inside_stall', 11],
  // Reverse Whirl is its own family by curator ruling (a distinct terminal
  // identity, never folded under whirl); ten documented descendants under the
  // root keep it a Minor Lineage.
  ['rev_whirl', 10],
  ['eclipse', 9], ['flail', 9], ['barrage', 8], ['paradon', 6], ['dyno', 5],
  ['down_double_down', 5],
  ['butterfly_swirl', 5], ['dada_curve', 4], ['flurry', 3],
]);

/**
 * Display tier for a public-family slug, read from the curated descendant count.
 * A family not in the count map defaults to Family Parent (shown in full) so a
 * newly-introduced lineage is never silently hidden.
 */
export function familyTier(slug: string): FamilyTier {
  if (FOUNDATIONAL_TERMINAL_SURFACES.has(slug)) return 'foundational-terminal-surface';
  const count = FAMILY_DESCENDANT_COUNTS.get(slug);
  if (count === undefined) return 'family-parent';
  return classifyFamilyTier(slug, count);
}

/**
 * Strict test for the official Family Parents. Unlike `familyTier`, an
 * unrecognised slug is NOT treated as a parent: a slug qualifies only when its
 * curated descendant count is over the threshold. This is what decides whether
 * a detail-page section reads "<name> Family" (a true official family) versus
 * "<name> Related" (an adjacency group that is not an official family).
 */
export function isOfficialFamilyParent(slug: string): boolean {
  const count = FAMILY_DESCENDANT_COUNTS.get(slug);
  return count !== undefined && classifyFamilyTier(slug, count) === 'family-parent';
}

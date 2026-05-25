/**
 * freestyleTrickTier.ts
 * ======================
 *
 * Phase A of the trick-detail ontology doctrine (2026-05-25). Tier
 * registration for the L1-L6 flagship rendering pipeline.
 *
 * Per exploration/trick-detail-ontology-doctrine-2026-05-25/PROPOSAL.md:
 *
 * - Tier A — flagship ontology exemplars. Render L1-L6 (intuition,
 *   mechanical delta, ontology role, productivity, family evolution,
 *   progressive readings). Default-deny: only listed slugs are Tier A.
 *
 * - Tier B — structurally important secondary. Render L1 + L5 only when
 *   authored. Default-deny.
 *
 * - Tier C — implicit default. Pages render the universal shell exactly
 *   as today; no L1-L6 fields. No code change required for Tier C pages.
 *
 * Tier promotion is a single-line edit. Tier demotion is a single-line
 * edit. No mutation of trick rows; no DB change.
 */

/**
 * Tier A slugs — 20 foundational ontology exemplars from the doctrine
 * §5 roster. Editorial exemplars `mirage`, `paradox-mirage`, `whirl`
 * carry the locked editorial template (Phase B); the remaining 17 land
 * in Phase C following the exemplar pattern.
 */
export const TIER_A_SLUGS: ReadonlySet<string> = new Set([
  // Editorial exemplars (Phase B — set the template)
  'mirage',
  'paradox-mirage',
  'whirl',
  // Rest of Tier A roster (Phase C — follow the exemplar template)
  'blur',
  'osis',
  'butterfly',
  'torque',
  'mobius',
  'drifter',
  'barrage',
  'ripwalk',
  'fury',
  'atom-smasher',
  'sumo',
  'surreal',
  'ripstein',
  'food-processor',
  'phoenix',
  'blurriest',
  'blender',
]);

/**
 * Tier B slugs — curator-paced expansion. Empty in Phase A.
 */
export const TIER_B_SLUGS: ReadonlySet<string> = new Set<string>([
  // curator-paced expansion
]);

/** Tier resolution. Returns the assigned tier for the given slug. */
export type TrickTier = 'A' | 'B' | 'C';

export function resolveTrickTier(slug: string): TrickTier {
  if (TIER_A_SLUGS.has(slug)) return 'A';
  if (TIER_B_SLUGS.has(slug)) return 'B';
  return 'C';
}

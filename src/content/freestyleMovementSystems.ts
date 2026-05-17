/**
 * freestyleMovementSystems.ts
 * ============================
 *
 * Curator-authored axis classification for the Movement System browse view.
 * Slice L1 of the 2026-05 dictionary/glossary normalization plan
 * (see exploration/dictionary-glossary-normalization-audit-2026-05/
 * STABILIZATION_PLAN.md §1).
 *
 * Why this layer exists
 * ---------------------
 * The dictionary's legacy browse views (Family / Category / Component /
 * Movement Neighborhoods) each speak a different cut of the same data.
 * Per Slice L0 curator decisions (BROWSE_ARCHITECTURE_AUDIT Q1–Q7), the
 * canonical four-axis Movement System is the ontologically load-bearing
 * browse path — a small, pedagogically-readable ladder that learners can
 * traverse in axis order before encountering full ontology depth.
 *
 * Four axes (curator-confirmed in STABILIZATION_PLAN.md §1, 2026-05-16):
 *   1. Set / Uptime Systems     — set primitives that initiate a trick
 *   2. Entry Topologies         — how the body enters the trick
 *   3. Midtime Body Modifiers   — what the body does during the dex moment
 *   4. No-Plant & Suspension    — discipline modifiers around plant/landing
 *
 * Ontology-layer constraint (per user 2026-05-15): this module classifies
 * MODIFIER ROLE under one of four pedagogical axes; it does not collapse
 * any of the four ontology layers (canonical nomenclature / symbolic
 * decomposition / glossary pedagogy / embodied movement analogy). The
 * axis label is an observational pedagogical grouping; each modifier's
 * canonical role lives in freestyleTrickKindOverrides.
 *
 * Reversibility
 * -------------
 * Per [[feedback_reversible_content_governance]], this lives as TypeScript
 * content while Red Wave 2 (operator-vs-trick boundary) is still in
 * flight. Re-bucketing a modifier is a one-line edit; adding a new axis
 * is one entry; no database/schema change is required for L1–L6.
 */

export interface MovementSystemAxis {
  axisKey:        string;
  axisName:       string;
  axisDefinition: string;
  modifierSlugs:  readonly string[];
}

export const MOVEMENT_SYSTEM_AXES: readonly MovementSystemAxis[] = [
  {
    axisKey:        'set-uptime',
    axisName:       'Set / Uptime Systems',
    axisDefinition:
      'Set primitives that initiate a trick — what the foot does before the base trick ' +
      'begins. Pre-base uptime treatments and compressed-set families.',
    modifierSlugs:  ['pixie', 'fairy', 'atomic', 'stepping', 'surging'],
  },
  {
    axisKey:        'entry-topology',
    axisName:       'Entry Topologies',
    axisDefinition:
      'How the body enters the trick — hip pivots between dexes and same-set side ' +
      'changes. The body changes sides without changing the set foot.',
    modifierSlugs:  ['paradox'],
  },
  {
    axisKey:        'midtime-body',
    axisName:       'Midtime Body Modifiers',
    axisDefinition:
      'What the body does during the dex moment — rotation, head dip, body arc. ' +
      'Modifiers carried through the trick rather than applied at its boundaries.',
    modifierSlugs:  ['spinning', 'ducking', 'diving', 'weaving'],
  },
  {
    axisKey:        'no-plant-suspension',
    axisName:       'No-Plant & Suspension',
    axisDefinition:
      'Discipline modifiers around plant and landing — the support leg stays off the ' +
      'ground or the dex moment carries no plant.',
    modifierSlugs:  ['symposium'],
  },
] as const;

/**
 * Resolve the Movement System axis a modifier belongs to.
 * Returns null when the modifier is not classified under any axis
 * (e.g., blazing, gyro, illusioning, tapping, terraging — explicitly
 * pending curator classification per STABILIZATION_PLAN §1 pilot scope).
 */
export function resolveAxisForModifier(slug: string): MovementSystemAxis | null {
  for (const axis of MOVEMENT_SYSTEM_AXES) {
    if (axis.modifierSlugs.includes(slug)) return axis;
  }
  return null;
}

/** Union of all modifier slugs covered by the Movement System axes. */
export function allMovementSystemModifierSlugs(): string[] {
  return MOVEMENT_SYSTEM_AXES.flatMap(a => [...a.modifierSlugs]);
}

/**
 * freestyleMovementSystems.ts
 * ============================
 *
 * Curator-authored axis classification for the Movement System browse view.
 *
 * Why this layer exists
 * ---------------------
 * The dictionary's legacy browse views (Family / Category / Component /
 * Movement Neighborhoods) each speak a different cut of the same data.
 * Per curator decisions, the
 * canonical four-axis Movement System is the ontologically load-bearing
 * browse path: a small, pedagogically-readable ladder that learners can
 * traverse in axis order before encountering full ontology depth.
 *
 * Four axes (curator-confirmed):
 *   1. Set / Uptime Systems     : set primitives that initiate a trick
 *   2. Entry Topologies         : how the body enters the trick
 *   3. Midtime Body Modifiers   : what the body does during the dex moment
 *   4. No-Plant & Suspension    : discipline modifiers around plant/landing
 *
 * Ontology-layer constraint (per user): this module classifies
 * MODIFIER ROLE under one of four pedagogical axes; it does not collapse
 * any of the four ontology layers (canonical nomenclature / symbolic
 * decomposition / glossary pedagogy / embodied movement analogy). The
 * axis label is an observational pedagogical grouping; each modifier's
 * canonical role lives in freestyleTrickKindOverrides.
 *
 * Reversibility
 * -------------
 * This lives as TypeScript content while the operator-vs-trick boundary
 * is still in flight. Re-bucketing a modifier is a one-line edit; adding
 * a new axis is one entry; no database/schema change is required.
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
      'Set primitives that initiate a trick: what the foot does before the base trick ' +
      'begins. Pre-base uptime treatments, compressed-set families, and ' +
      'compound set modifiers (nuclear = paradox + illusion, quantum = ' +
      'compressed atomic).',
    // Order: pixie / fairy (pre-base uptime compressors); atomic (the outward-dex
    // set); quantum / nuclear; stepping / surging (set-foot relocations);
    // whirling (the whirl dex performed during uptime, before the bag peaks).
    // Miraging is deliberately absent: it is descriptive standalone inward-movement
    // language, not a launch set, so trick pages rely on the modifier row instead
    // of a set-uptime movement-system row.
    modifierSlugs:  ['pixie', 'fairy', 'atomic', 'quantum', 'nuclear', 'stepping', 'surging', 'whirling'],
  },
  {
    axisKey:        'entry-topology',
    axisName:       'Entry Topologies',
    axisDefinition:
      'Where the entry dex sits relative to the plant foot and the body ' +
      'centreline: the same-side/op, near/far, and planted/no-plant ' +
      'relationships. Paradox is the side-switch between the support leg and the ' +
      'dexterity; as an entry it reads opposite-side clipper (CLIP > OP IN [DEX]), ' +
      'its cross-body entry-topology case, but it can also be a later mid-trick dex.',
    modifierSlugs:  ['paradox'],
  },
  {
    axisKey:        'midtime-body',
    axisName:       'Midtime Body Modifiers',
    axisDefinition:
      'What the body does during the dex moment: rotation by tempo (spinning / ' +
      'gyro) or head dip / body arc (ducking / diving / weaving). Modifiers ' +
      'carried through the trick rather than applied at its boundaries.',
    // Order: spinning (full 360°), gyro (half 180°),
    // ducking / diving / weaving (head dip + body arc family).
    modifierSlugs:  ['spinning', 'gyro', 'ducking', 'diving', 'weaving'],
  },
  {
    axisKey:        'no-plant-suspension',
    axisName:       'No-Plant & Suspension',
    axisDefinition:
      'Discipline modifiers around plant and landing: the support leg stays off the ' +
      'ground or the dex moment carries no plant.',
    modifierSlugs:  ['symposium'],
  },
] as const;

/**
 * Resolve the Movement System axis a modifier belongs to.
 * Returns null when the modifier is not classified under any axis.
 *
 * gyro / whirling / nuclear / quantum are classified. Still pending
 * curator classification: barraging (operator class), blurry
 * (transitivity), tapping, furious, blazing, illusioning, terraging.
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

// ─────────────────────────────────────────────────────────────────────────
// Modifier-level educational composition glosses.
//
// A single italic line that surfaces the conserved compositional reading
// of a modifier on the Movement System view, between the modifier-name
// heading and the trick-card stack. Goal: paradox reads as an entry
// topology / compositional system, NOT as a terminal family.
//
// Per-modifier (not per-axis): the axis definition already lives on
// MovementSystemAxis.axisDefinition. The per-modifier gloss gives the
// curator room to expand without re-shaping the axis.
//
// Restraint: pilot = paradox only. Other modifiers stay un-glossed
// (field falls back to null; the template suppresses the row) until
// curator authors them.
//
// Forbidden in this map: parser-wall notation; multi-line prose;
// clickable references; tooltip targets. Single italic line, plain
// text only, no inline tags.
// ─────────────────────────────────────────────────────────────────────────

export const MODIFIER_COMPOSITION_GLOSSES: ReadonlyMap<string, string> = new Map([
  ['paradox',
    'PDX + base: a side-switch between the support leg and the dex, not a terminal family. ' +
    'As an entry it reads clip > op-in dex; it can also be a later mid-trick dex. ' +
    'Compounds: PDX + WHIRL, PDX + TORQUE, PDX + BLENDER.',
  ],
  // 5 additional pilot glosses. Each line stays ≤200 chars per the
  // restraint discipline. No parser tokens; no multi-line essays.
  ['spinning',
    'SPIN + base: a full-body 360° rotation carried through the dex moment. ' +
    'Compounds: SPIN + WHIRL, SPIN + TORQUE, SPIN + OSIS.',
  ],
  ['ducking',
    'DUCK + base: a head dip that lets the bag pass around the neck; head moves toward the bag, bag falls opposite. ' +
    'Compounds: DUCK + WHIRL, DUCK + OSIS.',
  ],
  ['symposium',
    'SYMP + base: the support leg stays off the ground during the dex (no-plant discipline). ' +
    'Compounds: SYMP + WHIRL, SYMP + MIRAGE.',
  ],
  ['stepping',
    'STEP + base: a foot relocation during uptime that compresses or lengthens the set. ' +
    'Blurry = stepping paradox; compounds: STEP + WHIRL, STEP + OSIS.',
  ],
  ['pixie',
    'PIX + base: a compressed pre-base set; tighter motion than stepping. ' +
    'Compounds: PIX + BUTTERFLY (dimwalk), PIX + MIRAGE (smear), PIX + DRIFTER (smoke).',
  ],
  ['fairy',
    'FAIRY + base: an orbit-style set; the bag is set from toe while the leg ' +
    'circles in the outside direction before the next trick, rather than the standard pixie compression. ' +
    'Compounds: FAIRY + MIRAGE, FAIRY + BUTTERFLY.',
  ],
  ['surging',
    'SURGE + base: stepping foot relocation combined with spinning body rotation; ' +
    'a high-energy pre-base treatment that decomposes to spinning + stepping. ' +
    'Compounds: SURGE + WHIRL, SURGE + OSIS.',
  ],
  ['atomic',
    'ATOMIC + base: a launch set adding one outward dexterity before the base, +1. ' +
    'Any X-Dex is a separate +1 marked [XDEX] in the notation; it is not part of atomic and is never inferred. ' +
    'Compounds: ATOMIC + TORQUE, ATOMIC + MIRAGE.',
  ],
  ['quantum',
    'QUANTUM + base: a compressed atomic launch, one inward dexterity before the base, +1. ' +
    'Any X-Dex is a separate +1 marked [XDEX] in the notation, not part of quantum. ' +
    'Compounds: QUANTUM + MIRAGE, QUANTUM + OSIS.',
  ],
  ['nuclear',
    'NUCLEAR + base: a compound set of a paradox plus a downtime illusion, ' +
    'adding two motions before the base. ' +
    'Compounds: NUCLEAR + DRIFTER, NUCLEAR + TORQUE.',
  ],
  ['gyro',
    'GYRO + base: a half (180°) body turn during the dex, ' +
    'spinning and dexing on the same foot that set the bag. ' +
    'Compounds: GYRO + MIRAGE, GYRO + CLIPPER.',
  ],
  ['diving',
    'DIVE + base: the upper body dives over the bag and back during the dex; the bag falls to the same side. ' +
    'Compounds: DIVE + CLIPPER, DIVE + MIRAGE.',
  ],
  ['miraging',
    'MIRAGING + base: a historical mirage-family nickname for a single inward dex ' +
    '(SET > OP IN [DEX]) at the front of the base trick. Descriptive standalone ' +
    'language, not a launch set; specific compound decompositions are held for curator review.',
  ],
  ['whirling',
    'WHIRLING + base: a whirl dex during uptime before the bag peaks, ' +
    'flipping the leading dex direction of the base. ' +
    'Compounds: WHIRLING + MIRAGE, WHIRLING + OSIS.',
  ],
]);

/**
 * Returns the educational composition gloss for a modifier slug, or
 * null when no curator-authored entry exists. Callers render a single
 * italic line above the trick-card stack only when non-null.
 */
export function resolveModifierCompositionGloss(slug: string): string | null {
  return MODIFIER_COMPOSITION_GLOSSES.get(slug) ?? null;
}

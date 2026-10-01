/**
 * freestyleMovementSystems.ts
 * ============================
 *
 * Curator-authored modifier composition glosses: one line per modifier,
 * shown in the "Modifiers on this trick" rows of a trick page.
 *
 * A gloss states the conserved compositional reading of a modifier, so that,
 * for example, paradox reads as an entry relationship and compositional
 * system, not as a terminal family. A modifier with no entry renders no
 * gloss line.
 *
 * Forbidden in this map: parser-wall notation; multi-line prose;
 * clickable references; tooltip targets. Single line, plain text only, no
 * inline tags.
 *
 * This lives as TypeScript content rather than schema so a gloss is a
 * one-line curator edit.
 */

export const MODIFIER_COMPOSITION_GLOSSES: ReadonlyMap<string, string> = new Map([
  ['paradox',
    'PDX + base: a side-switch between the support leg and the dex, not a terminal family. ' +
    'As an entry it reads clip > op-in dex; it can also be a later mid-trick dex. ' +
    'Compounds: PDX + WHIRL, PDX + TORQUE, PDX + BLENDER.',
  ],
  // Each line stays within about 200 characters. No parser tokens; no
  // multi-line essays.
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

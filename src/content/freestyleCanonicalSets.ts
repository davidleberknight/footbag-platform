/**
 * freestyleCanonicalSets.ts
 * ==========================
 *
 * The parts of the Set Encyclopedia that are page prose or routing rather than set
 * data: the set groups a set is listed under, with each group's label and intro,
 * and the redirects for set slugs that are not sets. The sets themselves live in
 * the freestyle_sets table, read through the set registry and edited in the set
 * editor.
 *
 * Forever-rules:
 *
 * - Surface mechanics (sole, cloud, head, etc.) are NOT sets.
 * - Component mechanics (ducking, diving, bare spinning/inspinning,
 *   gyro) are body modifiers, never sets.
 */

export type SetSubtype =
  | 'true-core'
  | 'composite-derived'
  | 'rotational'
  | 'whirl-swirl'
  | 'uns'
  | 'rooted-antisymposium';

// ─────────────────────────────────────────────────────────────────────
// Subtype display metadata
// ─────────────────────────────────────────────────────────────────────

export interface SubtypeSpec {
  key: SetSubtype;
  label: string;
  intro: string;
}

export const SET_SUBTYPE_SPECS: readonly SubtypeSpec[] = [
  {
    key:   'true-core',
    label: 'True core sets',
    intro:
      'Foundational entry primitives: the basic toe and clipper entry surfaces plus the ' +
      'principal single-dex launch structures built from them. Reusable structures the ' +
      'rest of the language composes from.',
  },
  {
    key:   'composite-derived',
    label: 'Composite / derived sets',
    intro:
      'Multi-dex chains and derived entry topologies. Two or more dexes over the same set ' +
      'surface, or a structurally derived reading of a base shape. Named compositional ' +
      'systems built from the core grammar.',
  },
  {
    key:   'rotational',
    label: 'Rotational set systems',
    intro:
      'Named compositional systems carrying a SPIN body token inside the set chain. Not ' +
      'merely "spin + set": these are recognizable systems with their own movement ' +
      'identity.',
  },
  {
    key:   'whirl-swirl',
    label: 'Whirl / swirl-derived systems',
    intro:
      'CLIP-anchored cross-body rotational sets: explicit SWIRL tokens or the whirl ' +
      'family terminal pattern. Several family members are documented symposium / gyro ' +
      'variants of the base whirl shape.',
  },
  {
    key:   'uns',
    label: 'UNS sets (unusual non-standard entry)',
    intro:
      'Sets whose initial contact is something other than TOE or CLIP: pinch, dragon, ' +
      'frigidosis. The dex grammar applies as elsewhere; the entry surface shifts.',
  },
  {
    key:   'rooted-antisymposium',
    label: 'Rooted / antisymposium systems',
    intro:
      'The setting foot stays on the ground (antisymposium discipline). Discipline-level ' +
      'movement constraint applied to a set rather than a literal grammar string.',
  },
] as const;

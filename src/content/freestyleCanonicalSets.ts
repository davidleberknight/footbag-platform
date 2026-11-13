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
 * - Set hashtags use the role-prefix pattern `#set_<slug>` to distinguish
 *   set ontology from trick ontology (`#set_pixie` ≠ `#pixie_mirage`).
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

/**
 * Set-to-set canonical folds. Empty under current doctrine: illusioning and
 * atomic, and furious and barraging, are not treated as one set. Furious is its
 * own set entry, and Illusioning, Miraging, and Barraging are not sets. A media
 * set-tag therefore canonicalizes to itself, never folding one set name into
 * another. Kept as the media and sitemap seam so a future genuine set-to-set fold
 * has one home; a real set is never folded.
 */
export const SET_SLUG_ALIASES: ReadonlyMap<string, string> = new Map();

/**
 * Old /freestyle/sets/:slug routes for a retired concept that is not a confirmed
 * set. Whirling is not a set; the uptime whirling set is Blazing, so the old
 * Whirling set URL lands on the Blazing page. Only the set URL moves: whirling
 * stays a body modifier, and its modifier and trick routes resolve as any
 * modifier's do. A retired nickname that names exactly one canonical set and
 * nothing else (barraging names the Furious set) redirects all its routes to that
 * set page instead, resolved ahead of this map. Only fires for slugs that are not
 * themselves a live canonical set.
 */
export const SET_ROUTE_RETIRED_REDIRECTS: ReadonlyMap<string, string> = new Map([
  ['whirling',    '/freestyle/sets/blazing'],
]);

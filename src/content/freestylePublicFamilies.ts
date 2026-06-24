/**
 * freestylePublicFamilies.ts
 * ==========================
 *
 * The curated PUBLIC-DISPLAY family layer for the Trick Dictionary landing
 * "By family" browse card.
 *
 * This is intentionally distinct from the raw `freestyle_tricks.trick_family`
 * labels (~87 distinct values, many singletons / alias-ish), which are NOT all
 * surfaced publicly. This curated set IS the family system the By-family browse
 * renders directly: the 20 roots plus the 4 derived branches below, and nothing
 * else.
 *
 * The landing menu shows THIS curated set: a human-chosen browse roster of the
 * families worth offering as jump-links from the index. Each entry links to the
 * family-filtered dictionary (`/freestyle/tricks?family={slug}`), which narrows
 * on the raw `trick_family` value (per the family-filter navigation rule), so
 * every entry resolves whether or not the family-VIEW folds it under a parent.
 *
 * Reversible TypeScript content (per the reversible-content-governance rule):
 * editing this list re-shapes the public menu with no schema or DB change. It
 * does NOT change canonical trick membership or family classification.
 *
 * Admission rule (empirical, applied uniformly). A family parent is a terminal lineage that BOTH
 * conserves a terminal identity (descendants preserve a recognizable terminal signature even as
 * modifiers stack on the entry, so paradox-whirl still "is" a whirl) AND has at least 3 recursive
 * descendant tricks. Families are not hand-picked; they emerge from the observed vocabulary topology
 * once that bar is met. Terminal identity is read from each trick's own notation, never from a set or
 * entry label: entry/set systems (pixie, atomic, ...) and entry/orbit atoms are surfaced via the
 * movement-system / glossary layer, not as roots. ATW (around-the-world) is the canonical excluded
 * case: foundational and heavily taught, but used within tricks rather than inherited as a terminal
 * topology. Clusters below 3 descendants stay reachable via ?family= but are not roots.
 *
 * Hierarchy. A family is either a root (its own terminal identity, e.g. whirl, swirl, inside-stall)
 * or a derived branch that inherits a root's identity (a parent set, e.g. torque/blender under osis,
 * double-leg-over/eggbeater under legover). Both are first-class family parents; the `parent` field
 * records the branch relationship for display and drives the By-family browse's
 * root-then-branch section ordering.
 *
 * Counts are derived at render time from active trick membership, never hard-coded here.
 */

export interface PublicDisplayFamily {
  /** Matches a `freestyle_tricks.trick_family` value; drives ?family={slug}. */
  slug:  string;
  /** Display label shown on the card chip. */
  label: string;
  /** Parent family slug when this is a derived branch (e.g. torque under osis); absent for a root. */
  parent?: string;
}

export const PUBLIC_DISPLAY_FAMILIES: readonly PublicDisplayFamily[] = [
  { slug: 'mirage',            label: 'Mirage' },
  { slug: 'illusion',          label: 'Illusion' },
  { slug: 'butterfly',         label: 'Butterfly' },
  { slug: 'legover',           label: 'Legover' },
  { slug: 'pickup',            label: 'Pickup' },
  { slug: 'whirl',             label: 'Whirl' },
  { slug: 'osis',              label: 'Osis' },
  { slug: 'eclipse',           label: 'Eclipse' },
  { slug: 'drifter',           label: 'Drifter' },
  { slug: 'barrage',           label: 'Barrage' },
  { slug: 'dada_curve',        label: 'Dada-Curve' },
  { slug: 'barfly',            label: 'Barfly' },
  { slug: 'dyno',              label: 'Dyno' },
  { slug: 'paradon',           label: 'Paradon' },
  { slug: 'double_over_down',  label: 'Double-Over-Down' },
  { slug: 'flurry',            label: 'Flurry' },
  { slug: 'flail',             label: 'Flail' },
  { slug: 'butterfly_swirl',   label: 'Butterfly-Swirl' },
  // Family Parents (current first-class standard: conserved terminal identity plus more than 10
  // documented descendants; tier lives in freestyleFamilyTiers.ts). swirl and inside-stall are roots
  // (swirl's movement differs from
  // whirl; inside-stall is the surface identity the guay lineage lands into); the others are derived
  // branches that inherit a root's terminal identity, recorded via the parent field.
  { slug: 'swirl',             label: 'Swirl' },
  { slug: 'inside_stall',      label: 'Inside Stall' },
  { slug: 'torque',            label: 'Torque',          parent: 'osis' },
  { slug: 'blender',           label: 'Blender',         parent: 'osis' },
  { slug: 'double_leg_over',   label: 'Double Legover',  parent: 'legover' },
  { slug: 'eggbeater',         label: 'Eggbeater',       parent: 'legover' },
];

/**
 * Sub-label → the family whose terminal ending topology it conserves. A
 * trick_family label that is neither a family above nor listed here is NOT a
 * family: it either has too few descendants to clear the ≥3 floor (rev-whirl,
 * twirl, around-the-world, orbit) or is a universal catch surface above the
 * ceiling (toe-stall, clipper-stall). Such labels do not render in the By-family
 * browse; their rows stay reachable through the raw `?family={slug}` filter.
 *
 * Most folds are derivable from the slug's terminal token (paradox-illusion
 * conserves the illusion terminal). The two marked "curator" are not visible in
 * the slug and come from curator doctrine.
 */
export const SUBLABEL_FAMILY_OF: ReadonlyMap<string, string> = new Map<string, string>([
  ['whirling_swirl',      'swirl'],
  ['mobius',              'torque'],        // curator: a mobius is a torque-family member
  ['guay',                'inside_stall'],  // curator: a guay lands into an inside stall
  ['double_pickup',       'pickup'],
  ['paradox_mirage',      'mirage'],
  ['paradox_illusion',    'illusion'],
  ['reverse_drifter',     'drifter'],
  ['high_plains_drifter', 'drifter'],
]);

const FAMILY_SLUG_SET: ReadonlySet<string> = new Set(PUBLIC_DISPLAY_FAMILIES.map(f => f.slug));

/**
 * Resolve a raw trick_family label to the public family it renders under, or null
 * when the label is not a family (route-out). The 20 roots and 4 branches resolve
 * to themselves; sub-labels fold to the family whose terminal they conserve.
 */
export function resolveDisplayFamily(label: string): string | null {
  if (FAMILY_SLUG_SET.has(label)) return label;
  return SUBLABEL_FAMILY_OF.get(label) ?? null;
}

/**
 * The 24 families in display order: the 20 roots first, then the 4 derived
 * branches, mirroring the glossary's roster-then-descendant-lineage ordering.
 * Drives the top-level section order of the By-family browse.
 */
export const PUBLIC_FAMILY_ORDER: readonly string[] = PUBLIC_DISPLAY_FAMILIES.map(f => f.slug);

/** slug → display label for the 24 families. */
export const PUBLIC_FAMILY_LABEL: ReadonlyMap<string, string> = new Map(
  PUBLIC_DISPLAY_FAMILIES.map(f => [f.slug, f.label] as const),
);

/** slug → parent family label for the 4 derived branches; absent for roots. */
export const PUBLIC_FAMILY_PARENT_LABEL: ReadonlyMap<string, string> = new Map(
  PUBLIC_DISPLAY_FAMILIES
    .filter((f): f is PublicDisplayFamily & { parent: string } => Boolean(f.parent))
    .map(f => [f.slug, PUBLIC_DISPLAY_FAMILIES.find(p => p.slug === f.parent)!.label] as const),
);

/** slug → parent root slug for the 4 derived branches; absent for roots. */
export const PUBLIC_FAMILY_PARENT_OF: ReadonlyMap<string, string> = new Map(
  PUBLIC_DISPLAY_FAMILIES
    .filter((f): f is PublicDisplayFamily & { parent: string } => Boolean(f.parent))
    .map(f => [f.slug, f.parent] as const),
);

/**
 * A family slug plus its ancestor root, if any. A derived branch (e.g. torque)
 * is contained in its parent root (osis): every branch member is also a member
 * of the root, so it renders in both sections. A root returns just itself.
 * Branch parents are always roots, so one level of expansion suffices.
 */
export function familyWithAncestors(slug: string): string[] {
  const parent = PUBLIC_FAMILY_PARENT_OF.get(slug);
  return parent ? [slug, parent] : [slug];
}

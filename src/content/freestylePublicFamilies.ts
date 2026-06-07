/**
 * freestylePublicFamilies.ts
 * ==========================
 *
 * The curated PUBLIC-DISPLAY family layer for the Trick Dictionary landing
 * "By family" browse card.
 *
 * This is intentionally distinct from two other family notions:
 *   - the raw `freestyle_tricks.trick_family` labels (~87 distinct values,
 *     many singletons / alias-ish), which are NOT all surfaced publicly; and
 *   - the 8 canonical PARENT family anchors (freestyleParentFamilies.ts), the
 *     three-tier-doctrine top level.
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
 * records the branch relationship for display. This branch hierarchy is distinct from the broader
 * ?view=family fold in freestyleParentFamilies.ts.
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
  { slug: 'dada-curve',        label: 'Dada-Curve' },
  { slug: 'barfly',            label: 'Barfly' },
  { slug: 'dyno',              label: 'Dyno' },
  { slug: 'paradon',           label: 'Paradon' },
  { slug: 'double-over-down',  label: 'Double-Over-Down' },
  { slug: 'flurry',            label: 'Flurry' },
  { slug: 'flail',             label: 'Flail' },
  { slug: 'butterfly-swirl',   label: 'Butterfly-Swirl' },
  // Promoted family parents (empirical admission: conserved terminal identity plus at least three
  // recursive descendant tricks). swirl and inside-stall are roots (swirl's movement differs from
  // whirl; inside-stall is the surface identity the guay lineage lands into); the others are derived
  // branches that inherit a root's terminal identity, recorded via the parent field.
  { slug: 'swirl',             label: 'Swirl' },
  { slug: 'inside-stall',      label: 'Inside Stall' },
  { slug: 'torque',            label: 'Torque',          parent: 'osis' },
  { slug: 'blender',           label: 'Blender',         parent: 'osis' },
  { slug: 'double-leg-over',   label: 'Double Legover',  parent: 'legover' },
  { slug: 'eggbeater',         label: 'Eggbeater',       parent: 'legover' },
];

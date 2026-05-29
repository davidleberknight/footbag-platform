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
 * Inclusion principle. HARD RULE: a public family root must have MORE THAN 2 active member tricks
 * (>= 3); a 2-or-fewer-member grouping is never a first-class public family root. Beyond that count
 * gate, entries are terminal-identity TOPOLOGY families — a structure the trick
 * lands into, whose recognizable downside signature descendants preserve even as modifiers stack
 * on the entry (paradox-whirl still "is" a whirl). Entry-side dexterity primitives / operators are
 * surfaced via the movement-system / glossary-fundamentals layer, NOT as family roots here. ATW
 * (around-the-world) is the canonical example: foundational and heavily taught, but used within
 * tricks rather than inherited as a terminal topology, so it is intentionally absent below.
 * Sparse derivative micro-clusters (low-count direction-reverses or motifs of a parent family) are
 * likewise excluded as primary roots; they remain reachable via ?family= and would surface in a
 * future minor/derived band rather than as first-class family roots.
 *
 * Order is curator-meaningful (roughly: parent anchors first, then named
 * descendant lineages / notable families). Counts are derived at render time
 * from active trick membership — never hard-coded here.
 */

export interface PublicDisplayFamily {
  /** Matches a `freestyle_tricks.trick_family` value; drives ?family={slug}. */
  slug:  string;
  /** Display label shown on the card chip. */
  label: string;
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
];

/**
 * freestyleTopologyHistograms.ts
 * ==============================
 *
 * Snapshot data for the two glossary histograms (family and entry), measured by
 * the read-only topology audits. Counts are NOT derived from `trick_family`:
 *   - the two grandparent surfaces are landing counts (terminal catch) and set
 *     counts (entry, formula position-0);
 *   - each family's count is its recursive descendant count (its subtree,
 *     branches folded in), which is why Swirl (29) sits above Pickup (27);
 *   - each entry system's count is curated modifier membership.
 *
 * Hard-coded snapshot rather than render-time derivation: it keeps a public page
 * decoupled from the audit's fold/parse logic, and it is reversible TypeScript
 * content. A unit test cross-checks the family head against the live direct
 * counts so trick-data drift fails CI loudly. The render-time width is bucketed
 * by the service; the bars carry no inline style.
 */

export type TopologyHistogramTier = 'surface' | 'family' | 'system';

export interface TopologyHistogramRow {
  /** Display label (matches the family roster / set-system name). */
  label: string;
  /** Measured count (recursive descendants for families; landings for surfaces; membership for systems). */
  count: number;
  /** Visual tier: the two grandparent surfaces read as a distinct band. */
  tier:  TopologyHistogramTier;
}

/** How tricks END: the two terminal surface roots, then the 26 first-class families by recursive descendants. */
export const FAMILY_HISTOGRAM: readonly TopologyHistogramRow[] = [
  { label: 'Clipper Stall',    count: 328, tier: 'surface' },
  { label: 'Toe Stall',        count: 252, tier: 'surface' },
  { label: 'Osis',             count: 84,  tier: 'family' },
  { label: 'Whirl',            count: 74,  tier: 'family' },
  { label: 'Legover',          count: 71,  tier: 'family' },
  { label: 'Mirage',           count: 69,  tier: 'family' },
  { label: 'Butterfly',        count: 48,  tier: 'family' },
  // The Down umbrella aggregates its four variant branches plus the dod
  // sub-label per the expert ruling (one family, a single structural
  // decomposition with set/foot variants).
  { label: 'Down',             count: 45,  tier: 'family' },
  { label: 'Illusion',         count: 34,  tier: 'family' },
  { label: 'Swirl',            count: 29,  tier: 'family' },
  { label: 'Pickup',           count: 27,  tier: 'family' },
  { label: 'Blender',          count: 22,  tier: 'family' },
  { label: 'Torque',           count: 22,  tier: 'family' },
  { label: 'Double Legover',   count: 16,  tier: 'family' },
  { label: 'Drifter',          count: 14,  tier: 'family' },
  { label: 'Barfly',           count: 13,  tier: 'family' },
  { label: 'Eggbeater',        count: 13,  tier: 'family' },
  { label: 'Double-Over-Down', count: 12,  tier: 'family' },
  { label: 'Inside Stall',     count: 11,  tier: 'family' },
  // Reverse Whirl is its own family by curator ruling (a distinct terminal
  // identity, never folded under whirl); ten documented descendants.
  { label: 'Reverse Whirl',    count: 10,  tier: 'family' },
  { label: 'Eclipse',          count: 9,   tier: 'family' },
  { label: 'Flail',            count: 9,   tier: 'family' },
  { label: 'Barrage',          count: 8,   tier: 'family' },
  { label: 'Paradon',          count: 6,   tier: 'family' },
  { label: 'Butterfly-Swirl',  count: 5,   tier: 'family' },
  { label: 'Dyno',             count: 5,   tier: 'family' },
  { label: 'Down-Double-Down', count: 5,   tier: 'family' },
  { label: 'Dada-Curve',       count: 4,   tier: 'family' },
  { label: 'Flurry',           count: 3,   tier: 'family' },
];

/**
 * How tricks BEGIN: the two set surfaces, then the set-timing and set-ecosystem
 * systems. The 'system' tier is a display grouping for the chart, not a canonical
 * operator classification: paradox and symposium are operators by doctrine and
 * appear here only because they shape how a trick enters.
 */
export const ENTRY_HISTOGRAM: readonly TopologyHistogramRow[] = [
  { label: 'Toe set',   count: 207, tier: 'surface' },
  { label: 'Clip set',  count: 197, tier: 'surface' },
  { label: 'Symposium', count: 79,  tier: 'system' },
  { label: 'Paradox',   count: 63,  tier: 'system' },
  { label: 'Pixie',     count: 60,  tier: 'system' },
  { label: 'Fairy',     count: 55,  tier: 'system' },
  { label: 'Stepping',  count: 50,  tier: 'system' },
  { label: 'Quantum',   count: 21,  tier: 'system' },
  { label: 'Atomic',    count: 11,  tier: 'system' },
  { label: 'Blurry',    count: 6,   tier: 'system' },
  { label: 'Nuclear',   count: 6,   tier: 'system' },
  { label: 'Furious',   count: 2,   tier: 'system' },
];

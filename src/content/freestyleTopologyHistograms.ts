/**
 * freestyleTopologyHistograms.ts
 * ==============================
 *
 * The hand-authored parts of the two glossary histograms (family and entry).
 *
 * The two charts are measured differently, and only part of one is measured by a
 * program. The family bars are measured by the service at request time, from the
 * same family membership the dictionary browse renders, so the chart and the
 * browse cannot disagree about how large a family is and a trick published in
 * the app moves its family's bar at once. What lives here is the rest: the
 * grandparent surface bars that head the family chart, and the whole entry chart.
 * Landing counts, set counts and curated modifier membership are separate
 * questions with no live equivalent, and they carry the numbers a curator
 * measured for them.
 *
 * The family chart descends from an earlier read-only topology study, which is
 * where its question came from; its figures are not reproduced, because that
 * study's corpus and procedure were not kept.
 *
 * The render-time bar width is bucketed by the service; the bars carry no inline
 * style.
 */

export type TopologyHistogramTier = 'surface' | 'family' | 'system';

export interface TopologyHistogramRow {
  /** Display label (matches the family roster / set-system name). */
  label: string;
  /** Measured count (family membership for families; landings for surfaces; membership for systems). */
  count: number;
  /** Visual tier: the two grandparent surfaces read as a distinct band. */
  tier:  TopologyHistogramTier;
}

/**
 * The two terminal surfaces that head the family chart.
 *
 * Landing counts: how many tricks resolve onto each surface. A different
 * question from family membership and measured separately, which is why they are
 * hand-authored here while the family bars beneath them are measured live.
 */
export const TERMINAL_SURFACES: readonly TopologyHistogramRow[] = [
  { label: 'Clipper Stall',    count: 328, tier: 'surface' },
  { label: 'Toe Stall',        count: 252, tier: 'surface' },
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

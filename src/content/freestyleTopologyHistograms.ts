/**
 * freestyleTopologyHistograms.ts
 * ==============================
 *
 * The hand-authored part of the family-endings chart on By the Numbers.
 *
 * The family bars are measured by the service at request time, from the same
 * family membership the dictionary browse renders, so the chart and the browse
 * cannot disagree about how large a family is and a trick published in the app
 * moves its family's bar at once. What lives here is the two grandparent surface
 * bars that head the chart: landing counts are a separate question with no live
 * equivalent, and they carry the numbers a curator measured for them.
 */

export type TopologyHistogramTier = 'surface' | 'family';

export interface TopologyHistogramRow {
  /** Display label (matches the family roster name). */
  label: string;
  /** Measured count (family membership for families; landings for surfaces). */
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

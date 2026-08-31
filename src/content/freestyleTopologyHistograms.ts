/**
 * freestyleTopologyHistograms.ts
 * ==============================
 *
 * Data for the two glossary histograms (family and entry).
 *
 * The two charts are measured differently, and only one of them is measured by a
 * program. The family bars come from the dictionary browse's own family
 * membership, generated into a sibling module by a script and checked against a
 * fresh measurement by a database-backed guard, so a change to trick data that
 * nobody carries through fails a build rather than sitting on a public page. The
 * grandparent surface bars that head that chart, and the whole entry chart, are
 * hand-authored: landing counts, set counts and curated modifier membership are
 * separate questions with no live equivalent, and they carry the numbers a
 * curator measured for them.
 *
 * The family numbers descend from an earlier read-only topology study, which is
 * where the chart came from, but they are not that study's figures and no attempt
 * is made to reproduce them. Its corpus and its procedure were not kept, so what
 * it computed cannot be recomputed. It contributed the question; the measurement
 * is now the browse's answer to it, which is also why the chart and the browse
 * can no longer disagree about how large a family is.
 *
 * The render-time bar width is bucketed by the service; the bars carry no inline
 * style.
 */
import {
  FAMILY_HISTOGRAM_ROWS,
  FAMILIES_WITHOUT_A_MEASURED_ROW,
} from './freestyleFamilyHistogram';

/**
 * Public browse families with no measured row, as the measurement reported them.
 *
 * Derived rather than declared. A family renders on the browse only once it has
 * more than two members, so one below that floor has nothing to measure; it is
 * named so an omission anybody can account for is distinguishable from one nobody
 * noticed. Nothing is drawn for it, because a zero would read as a measurement.
 *
 * Reading this from the generated module is what keeps it honest: an entry cannot
 * outlive the gap it describes, because the same run that measures a family is the
 * run that stops listing it here.
 */
export const AWAITING_TOPOLOGY_AUDIT: ReadonlySet<string> =
  new Set(FAMILIES_WITHOUT_A_MEASURED_ROW);

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
 * hand-authored here rather than generated with the bars below them.
 */
const TERMINAL_SURFACES: readonly TopologyHistogramRow[] = [
  { label: 'Clipper Stall',    count: 328, tier: 'surface' },
  { label: 'Toe Stall',        count: 252, tier: 'surface' },
];

/** How tricks END: the two terminal surface roots, then every public browse family by membership. */
export const FAMILY_HISTOGRAM: readonly TopologyHistogramRow[] = [
  ...TERMINAL_SURFACES,
  ...FAMILY_HISTOGRAM_ROWS.map(r => ({ ...r, tier: 'family' as const })),
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

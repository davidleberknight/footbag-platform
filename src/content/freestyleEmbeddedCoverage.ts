/**
 * freestyleEmbeddedCoverage.ts
 * ============================
 *
 * Service-readable mirror of the curator embedded-coverage manifest
 * (legacy_data/tools/trick_video_discovery/embedded_coverage.csv): tricks taught
 * INSIDE another trick's tutorial, with no dedicated clip of their own (e.g.
 * orbit inside the Around The World lesson). The CSV is the curator-edit surface
 * and the source of truth; this module is the TypeScript mirror the public
 * trick-detail rendering reads. A unit test guards the two against drift.
 *
 * Declarative data only: no DB access, no service wiring, no behavior yet.
 *
 * Firewall (same as the direct-coverage and glossary layers): an embedded edge
 * is a PEDAGOGICAL fact about a video ("this trick is shown/taught inside that
 * lesson"), never a STRUCTURAL claim (no equivalence, ADD, decomposition, or
 * family). It must render as indirect coverage that names the host lesson, and
 * for any doctrine-unsettled target it must read as an open/observational
 * reading. Edges are media/trick -> trick coverage, and never mutate canonical
 * trick data.
 */

export interface EmbeddedCoverageEdge {
  /** The trick taught inside another trick's tutorial (no dedicated clip). */
  embeddedSlug: string;
  /** The host trick whose tutorial teaches/shows it. */
  hostSlug: string;
  /** Source of the host tutorial, e.g. 'tt_youtube'. */
  hostSourceId: string;
  /** Curator note describing the embedded relationship. */
  note: string;
}

/**
 * Embedded-coverage edges. Mirrors embedded_coverage.csv row-for-row; keep the
 * two in sync (the drift guard test enforces this).
 */
export const EMBEDDED_COVERAGE: readonly EmbeddedCoverageEdge[] = [
  {
    embeddedSlug: 'orbit',
    hostSlug: 'around-the-world',
    hostSourceId: 'tt_youtube',
    note: 'Orbit is taught inside the TT Around The World tutorial.',
  },
  {
    embeddedSlug: 'illusion',
    hostSlug: 'mirage',
    hostSourceId: 'tt_youtube',
    note: 'Illusion is taught inside the TT Mirage tutorial.',
  },
] as const;

/**
 * Edges grouped by the embedded trick's slug, for per-trick-page lookup
 * ("what is this trick embedded-covered by?"). Derived from EMBEDDED_COVERAGE.
 */
export const EMBEDDED_COVERAGE_BY_SLUG: Readonly<Record<string, readonly EmbeddedCoverageEdge[]>> =
  EMBEDDED_COVERAGE.reduce<Record<string, EmbeddedCoverageEdge[]>>((acc, edge) => {
    (acc[edge.embeddedSlug] ??= []).push(edge);
    return acc;
  }, {});

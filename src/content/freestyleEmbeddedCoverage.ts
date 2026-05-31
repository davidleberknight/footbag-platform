// freestyleEmbeddedCoverage.ts
// ============================
// GENERATED FILE — do not hand-edit.
// Source of truth: legacy_data/tools/trick_video_discovery/embedded_coverage.csv
// Regenerate: python3 legacy_data/scripts/build_embedded_coverage_content.py
//
// Service-readable mirror of the curator embedded-coverage manifest: tricks
// taught INSIDE another trick's tutorial, with no dedicated clip of their own
// (e.g. orbit inside the Around The World lesson).
//
// Firewall: an embedded edge is a PEDAGOGICAL fact about a video ('this trick
// is shown/taught inside that lesson'), never a STRUCTURAL claim (no
// equivalence, ADD, decomposition, or family). It renders as indirect coverage
// that names the host lesson; for a doctrine-unsettled target it must read as
// an open/observational reading. It never mutates canonical trick data.
// Reversible content module per [[feedback_reversible_content_governance]].

export interface EmbeddedCoverageEdge {
  /** The trick taught inside another trick's tutorial (no dedicated clip). */
  readonly embeddedSlug: string;
  /** The host trick whose tutorial teaches/shows it. */
  readonly hostSlug: string;
  /** Source of the host tutorial, e.g. 'tt_youtube'. */
  readonly hostSourceId: string;
  /** Curator note describing the embedded relationship. */
  readonly note: string;
}

export const EMBEDDED_COVERAGE: readonly EmbeddedCoverageEdge[] = [
  { embeddedSlug: 'illusion', hostSlug: 'mirage', hostSourceId: 'tt_youtube', note: 'Illusion is taught inside the TT Mirage tutorial.' },
  { embeddedSlug: 'orbit', hostSlug: 'around-the-world', hostSourceId: 'tt_youtube', note: 'Orbit is taught inside the TT Around The World tutorial.' },
];

/**
 * Edges grouped by the embedded trick's slug, for per-trick-page lookup
 * ('what is this trick embedded-covered by?'). Derived from EMBEDDED_COVERAGE.
 */
export const EMBEDDED_COVERAGE_BY_SLUG: Readonly<Record<string, readonly EmbeddedCoverageEdge[]>> =
  EMBEDDED_COVERAGE.reduce<Record<string, EmbeddedCoverageEdge[]>>((acc, edge) => {
    (acc[edge.embeddedSlug] ??= []).push(edge);
    return acc;
  }, {});

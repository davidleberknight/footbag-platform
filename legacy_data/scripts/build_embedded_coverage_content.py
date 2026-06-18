#!/usr/bin/env python3
"""Generate src/content/freestyleEmbeddedCoverage.ts from the curator manifest.

Reads the embedded-coverage manifest (a trick taught INSIDE another trick's
tutorial, with no dedicated clip of its own) and emits the service-readable
TypeScript mirror the public trick-detail rendering consumes.

Source of truth:
  freestyle/tools/trick_video_discovery/embedded_coverage.csv
    columns: embedded_trick_slug, host_trick_slug, host_source_id, notes

Output:
  src/content/freestyleEmbeddedCoverage.ts  (GENERATED — do not hand-edit)

Deterministic + idempotent: rows are sorted by (embedded_trick_slug,
host_trick_slug); a second run produces byte-identical output. Regenerate
whenever the CSV changes; a unit test guards the committed TS against drift.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CSV = REPO / "freestyle" / "tools" / "trick_video_discovery" / "embedded_coverage.csv"
OUT = REPO / "src" / "content" / "freestyleEmbeddedCoverage.ts"


def esc(s: str) -> str:
    """Escape a string for a single-quoted TS literal."""
    return s.replace("\\", "\\\\").replace("'", "\\'")


def main() -> None:
    with CSV.open(newline="", encoding="utf-8") as f:
        rows = [
            {
                "embeddedSlug": (r.get("embedded_trick_slug") or "").strip(),
                "hostSlug": (r.get("host_trick_slug") or "").strip(),
                "hostSourceId": (r.get("host_source_id") or "").strip(),
                "note": (r.get("notes") or "").strip(),
            }
            for r in csv.DictReader(f)
        ]
    rows = [r for r in rows if r["embeddedSlug"]]
    rows.sort(key=lambda r: (r["embeddedSlug"], r["hostSlug"]))

    lines = [
        "// freestyleEmbeddedCoverage.ts",
        "// ============================",
        "// GENERATED FILE — do not hand-edit.",
        "// Source of truth: freestyle/tools/trick_video_discovery/embedded_coverage.csv",
        "// Regenerate: python3 legacy_data/scripts/build_embedded_coverage_content.py",
        "//",
        "// Service-readable mirror of the curator embedded-coverage manifest: tricks",
        "// taught INSIDE another trick's tutorial, with no dedicated clip of their own",
        "// (e.g. orbit inside the Around The World lesson).",
        "//",
        "// Firewall: an embedded edge is a PEDAGOGICAL fact about a video ('this trick",
        "// is shown/taught inside that lesson'), never a STRUCTURAL claim (no",
        "// equivalence, ADD, decomposition, or family). It renders as indirect coverage",
        "// that names the host lesson; for a doctrine-unsettled target it must read as",
        "// an open/observational reading. It never mutates canonical trick data.",
        "// Reversible content module per [[feedback_reversible_content_governance]].",
        "",
        "export interface EmbeddedCoverageEdge {",
        "  /** The trick taught inside another trick's tutorial (no dedicated clip). */",
        "  readonly embeddedSlug: string;",
        "  /** The host trick whose tutorial teaches/shows it. */",
        "  readonly hostSlug: string;",
        "  /** Source of the host tutorial, e.g. 'tt_youtube'. */",
        "  readonly hostSourceId: string;",
        "  /** Curator note describing the embedded relationship. */",
        "  readonly note: string;",
        "}",
        "",
        "export const EMBEDDED_COVERAGE: readonly EmbeddedCoverageEdge[] = [",
    ]
    for r in rows:
        lines.append(
            "  { "
            f"embeddedSlug: '{esc(r['embeddedSlug'])}', "
            f"hostSlug: '{esc(r['hostSlug'])}', "
            f"hostSourceId: '{esc(r['hostSourceId'])}', "
            f"note: '{esc(r['note'])}' "
            "},"
        )
    lines += [
        "];",
        "",
        "/**",
        " * Edges grouped by the embedded trick's slug, for per-trick-page lookup",
        " * ('what is this trick embedded-covered by?'). Derived from EMBEDDED_COVERAGE.",
        " */",
        "export const EMBEDDED_COVERAGE_BY_SLUG: Readonly<Record<string, readonly EmbeddedCoverageEdge[]>> =",
        "  EMBEDDED_COVERAGE.reduce<Record<string, EmbeddedCoverageEdge[]>>((acc, edge) => {",
        "    (acc[edge.embeddedSlug] ??= []).push(edge);",
        "    return acc;",
        "  }, {});",
        "",
    ]

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(REPO)}: {len(rows)} embedded-coverage edges")


if __name__ == "__main__":
    main()

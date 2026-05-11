#!/usr/bin/env python3
"""build_footbagmoves_inventory.py - F1b staging inventory builder.

Layered on top of parse_footbagmoves_corpus.py (Path C raw extraction parser).
Adds: synthetic external_ids, same-side variant detection, coverage analysis,
paste-fill checklist with first-letter gap heuristic.

Federation-not-adoption: no canonical mutation, no DB writes, no workbook ingest,
no ontology normalization, no alias auto-import, no parser integration.

Outputs (staging only, NOT legacy_data/out/):
    legacy_data/reports/footbagmoves_inventory_staging.csv
    legacy_data/reports/footbagmoves_inventory_duplicates.csv
    legacy_data/reports/footbagmoves_inventory_malformed.csv
    legacy_data/reports/footbagmoves_inventory_missing_notation.csv
    legacy_data/reports/footbagmoves_inventory_same_side.csv
    legacy_data/reports/footbagmoves_inventory_report.md

Usage:
    python3 legacy_data/scripts/build_footbagmoves_inventory.py
    python3 legacy_data/scripts/build_footbagmoves_inventory.py --input-glob 'path/*.txt' --out-dir /tmp/staging
"""

import argparse
import csv
import re
import string
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))
from parse_footbagmoves_corpus import parse_file  # noqa: E402

SAME_SIDE_RE = re.compile(r"\(same[ -]?side\)", re.IGNORECASE)
INVENTORY_VERSION = "1.0"

FM_BAND_TOTALS = {
    1: None,
    2: None,
    3: 114,
    4: 173,
    5: 139,
    6: 75,
    7: 39,
    8: None,
    9: 2,
}

KNOWN_PER_BAND_TOTALS = {v for v in FM_BAND_TOTALS.values() if v is not None}

INVENTORY_FIELDS = [
    "synthetic_external_id",
    "display_name",
    "technical_name",
    "aliases_raw",
    "add_count",
    "operational_notation_raw",
    "video_present",
    "same_side_variant",
    "source_paste_file",
    "source_block_index",
]


def slugify(name: str) -> str:
    s = name.lower()
    s = SAME_SIDE_RE.sub("-same-side", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "unknown"


def is_same_side(display_name: str) -> int:
    return 1 if SAME_SIDE_RE.search(display_name) else 0


def build_external_id(display_name: str, adds: int, counter: Counter) -> str:
    base = f"fm__{slugify(display_name)}__add{adds}"
    counter[base] += 1
    if counter[base] == 1:
        return base
    return f"{base}__d{counter[base]}"


def derive_inventory_rows(parser_rows):
    counter = Counter()
    out = []
    for r in parser_rows:
        ext_id = build_external_id(r["display_name"], int(r["adds"]), counter)
        out.append({
            "synthetic_external_id": ext_id,
            "display_name": r["display_name"],
            "technical_name": r["technical_name"],
            "aliases_raw": r["aliases_raw"],
            "add_count": r["adds"],
            "operational_notation_raw": r["operational_notation_raw"],
            "video_present": r["video_present"],
            "same_side_variant": is_same_side(r["display_name"]),
            "source_paste_file": r["source_file"],
            "source_block_index": r["source_block_index"],
        })
    return out


def find_inventory_duplicates(rows):
    by_norm = defaultdict(list)
    for r in rows:
        key = (r["display_name"].strip().lower(), int(r["add_count"]))
        by_norm[key].append(r)
    dups = []
    for (name, adds), group in by_norm.items():
        if len(group) > 1:
            for r in group:
                dups.append({
                    "normalized_name": name,
                    "add_count": adds,
                    "occurrence_count": len(group),
                    "synthetic_external_id": r["synthetic_external_id"],
                    "display_name": r["display_name"],
                    "source_paste_file": r["source_paste_file"],
                    "source_block_index": r["source_block_index"],
                })
    return dups


def compute_per_file_stats(file_results):
    """file_results: list of (filepath, rows, malformed, moves_found_values)."""
    stats = []
    for fpath, rows, malformed, moves_found_values in file_results:
        anomaly_flags = sorted({v for v in moves_found_values if v not in KNOWN_PER_BAND_TOTALS})
        stats.append({
            "file": fpath.name,
            "row_count": len(rows),
            "malformed_count": len(malformed),
            "moves_found_headers": moves_found_values,
            "anomaly_flags": anomaly_flags,
        })
    return stats


def compute_coverage_by_band(rows):
    """Map adds -> {row_count, fm_total, coverage_pct, letter_histogram}."""
    by_band = defaultdict(list)
    for r in rows:
        by_band[int(r["add_count"])].append(r)
    coverage = {}
    for band, brows in sorted(by_band.items()):
        letters = Counter()
        for r in brows:
            first = r["display_name"][0].upper() if r["display_name"] else "?"
            letters[first] += 1
        fm_total = FM_BAND_TOTALS.get(band)
        pct = (len(brows) / fm_total * 100) if fm_total else None
        coverage[band] = {
            "row_count": len(brows),
            "fm_total": fm_total,
            "coverage_pct": pct,
            "gap": (fm_total - len(brows)) if fm_total else None,
            "letter_histogram": dict(letters),
        }
    return coverage


def build_paste_fill_checklist(coverage):
    """Return list of markdown lines for the curator-facing checklist."""
    lines = []
    lines.append("## Paste-fill checklist (curator-facing)")
    lines.append("")
    lines.append("Use this section to plan the next paste batches. The first-letter histogram identifies alphabetic gaps in the current paste — curator can target those letters when re-opening the FM search UI with Min-Adds = Max-Adds = N.")
    lines.append("")
    priority_order = [5, 4, 3, 6, 7, 8, 9, 1, 2]
    for band in priority_order:
        if band not in coverage:
            continue
        c = coverage[band]
        if c["fm_total"] is None:
            status = "FM total unknown"
        else:
            status = f"{c['row_count']} / {c['fm_total']} ({c['coverage_pct']:.1f}%)"
        gap_str = f", gap: ~{c['gap']} rows" if c["gap"] is not None else ""
        lines.append(f"### ADD-band {band} — {status}{gap_str}")
        lines.append("")
        present = sorted(c["letter_histogram"].items())
        present_letters = set(c["letter_histogram"].keys())
        all_letters = set(string.ascii_uppercase)
        missing_letters = sorted(all_letters - present_letters)
        sparse_letters = sorted([l for l, n in c["letter_histogram"].items() if n <= 2 and l in all_letters])
        lines.append(f"- Letters present: {' '.join(l for l, _ in present)}")
        lines.append(f"- Letters missing entirely: {' '.join(missing_letters) if missing_letters else '(none)'}")
        lines.append(f"- Sparse letters (1-2 rows; possibly partial): {' '.join(sparse_letters) if sparse_letters else '(none)'}")
        if band == 5 and c["coverage_pct"] is not None and c["coverage_pct"] < 50:
            lines.append("- **Recommendation:** SEVERE gap. Paste A-S alphabetic range from FM band-5 search (Min-Adds=5, Max-Adds=5). Append to `footbagmoves-5-6adds.txt` OR split into a new `footbagmoves-5adds.txt` file (recommended for cleaner provenance).")
        elif band == 4 and c["coverage_pct"] is not None and c["coverage_pct"] < 50:
            lines.append("- **Recommendation:** Paste A-O alphabetic range from FM band-4 search (Min-Adds=4, Max-Adds=4). Append to `footbagmoves-4adds.txt`.")
        elif c["gap"] is not None and c["gap"] > 5:
            lines.append(f"- **Recommendation:** Paste rows from missing letters ({' '.join(missing_letters[:5])}...) to close the gap.")
        elif c["gap"] is not None and c["gap"] > 0:
            lines.append(f"- **Recommendation:** Optional — {c['gap']} rows likely missing. Paste-fill only if effort is low.")
        else:
            lines.append("- **Recommendation:** Coverage complete or near-complete. No paste-fill needed.")
        lines.append("")
    lines.append("### Promotion decision criteria")
    lines.append("")
    lines.append("Recommended thresholds before promoting `footbagmoves_inventory_staging.csv` → `legacy_data/out/footbagmoves_inventory.csv`:")
    lines.append("")
    lines.append("- **Band 3:** ≥ 95% coverage (currently ~82%; needs ~5 more rows from missing letters)")
    lines.append("- **Band 4:** ≥ 80% coverage (currently ~36%; needs ~75+ more rows from A-O range)")
    lines.append("- **Band 5:** ≥ 80% coverage (currently ~6.5%; needs ~110+ more rows from A-S range — the principal blocker)")
    lines.append("- **Band 6:** ≥ 95% coverage (currently ~100%; satisfied)")
    lines.append("- **Bands 7-9:** ≥ 90% coverage (currently ~95%+; satisfied)")
    lines.append("")
    lines.append("Promotion is a separate manual step (not automated by this script). Curator decides when coverage is acceptable.")
    return lines


def emit_csv(path, rows, fieldnames):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def emit_report(path, run_meta, file_stats, coverage, dups, malformed, missing_notation, same_side, totals):
    lines = []
    lines.append("# FootbagMoves staging inventory report")
    lines.append("")
    lines.append(f"**Run timestamp (UTC):** {run_meta['utc']}")
    lines.append(f"**Builder version:** {run_meta['version']}")
    lines.append(f"**Output path:** `{run_meta['out_dir']}` (staging only — NOT legacy_data/out/)")
    lines.append("")
    lines.append("**Federation-not-adoption posture preserved:**")
    lines.append("- Raw extraction layer; no ontology normalization.")
    lines.append("- No canonical mutation, no DB writes, no workbook ingest, no parser integration.")
    lines.append("- Synthetic external_ids only; no FM internal IDs (not paste-accessible).")
    lines.append("")
    lines.append("## Per-file extraction snapshot")
    lines.append("")
    lines.append("| File | Rows | Malformed | Moves-found header(s) | Anomaly flag |")
    lines.append("|---|--:|--:|---|---|")
    for fs in file_stats:
        headers_str = ", ".join(str(v) for v in fs["moves_found_headers"]) or "-"
        anomaly = f"**⚠ {fs['anomaly_flags']}**" if fs["anomaly_flags"] else "(none)"
        lines.append(f"| {fs['file']} | {fs['row_count']} | {fs['malformed_count']} | {headers_str} | {anomaly} |")
    lines.append("")
    distinct_anomalies = sorted({v for fs in file_stats for v in fs["anomaly_flags"]})
    if distinct_anomalies:
        lines.append(f"### Anomaly: non-per-band `Moves found` headers detected — values {distinct_anomalies}")
        lines.append("")
        lines.append(f"Known per-band totals: {sorted(KNOWN_PER_BAND_TOTALS)}. Any other value reflects a curator-chosen range-filter or filter-change-mid-paste; not a data error but worth confirming before promotion.")
        lines.append("")
        lines.append("Likely interpretations (per known band totals 3=114, 4=173, 5=139, 6=75, 7=39, 9=2):")
        if 267 in distinct_anomalies:
            lines.append("- **267** ≈ Adds ≥ 5 range (139+75+39+~10+2 ≈ 265). Suggests Min-Adds=5 with no max set.")
        if 426 in distinct_anomalies:
            lines.append("- **426** = 114 + 173 + 139 exactly. Suggests Min-Adds=3, Max-Adds=5 range paste covering bands 3+4+5.")
        for v in distinct_anomalies:
            if v not in {267, 426}:
                lines.append(f"- **{v}** — no known interpretation; curator clarification needed.")
        lines.append("")
        lines.append("**Recommended action:** curator confirms the search-state filter used for each file with an anomalous header before F1b promotion. Per-row Adds values are extracted correctly regardless of header anomaly, so the inventory is internally consistent; the anomaly mainly affects the per-file coverage interpretation.")
        lines.append("")
    lines.append("## Coverage by ADD band")
    lines.append("")
    lines.append("| Band | Rows | FM total | Coverage % | Gap | Letters present |")
    lines.append("|--:|--:|--:|--:|--:|---|")
    for band, c in sorted(coverage.items()):
        fm_total = c["fm_total"] if c["fm_total"] is not None else "?"
        pct = f"{c['coverage_pct']:.1f}%" if c["coverage_pct"] is not None else "?"
        gap = c["gap"] if c["gap"] is not None else "?"
        letters = "".join(sorted(c["letter_histogram"].keys()))
        lines.append(f"| {band} | {c['row_count']} | {fm_total} | {pct} | {gap} | `{letters}` |")
    lines.append("")
    lines.append("## Totals")
    lines.append("")
    lines.append(f"- Total inventory rows: **{totals['total_rows']}**")
    lines.append(f"- With operational notation: **{totals['with_notation']}** ({totals['with_notation_pct']:.1f}%)")
    lines.append(f"- With video: **{totals['with_video']}** ({totals['with_video_pct']:.1f}%)")
    lines.append(f"- With technical_name: **{totals['with_technical']}** ({totals['with_technical_pct']:.1f}%)")
    lines.append(f"- With aliases: **{totals['with_aliases']}** ({totals['with_aliases_pct']:.1f}%)")
    lines.append(f"- Same-side variants: **{totals['same_side_count']}** ({totals['same_side_pct']:.1f}%)")
    lines.append(f"- Missing notation: **{totals['missing_notation_count']}** ({totals['missing_notation_pct']:.1f}%)")
    lines.append(f"- Within-corpus duplicates (name + add_count): **{totals['duplicate_count']}** rows in **{totals['duplicate_group_count']}** groups")
    lines.append(f"- Malformed rows: **{totals['malformed_count']}**")
    lines.append("")
    lines.append("## Same-side cohort")
    lines.append("")
    lines.append(f"Total same-side variants: **{len(same_side)}**. These are FM rows whose display_name carries `(same-side)` or `(same side)` suffix — relevant to the Barfry pt11 \"ss\" semantic question.")
    lines.append("")
    if same_side:
        lines.append("First 10 rows (full set in `footbagmoves_inventory_same_side.csv`):")
        lines.append("")
        lines.append("| synthetic_external_id | display_name | technical_name | add_count | notation? |")
        lines.append("|---|---|---|--:|--:|")
        for r in same_side[:10]:
            tn = r["technical_name"] or "_(empty)_"
            notn = "1" if r["operational_notation_raw"] else "0"
            lines.append(f"| `{r['synthetic_external_id']}` | {r['display_name']} | {tn} | {r['add_count']} | {notn} |")
    lines.append("")
    lines.append("## Duplicate display names (case-insensitive, normalized by name + add_count)")
    lines.append("")
    if not dups:
        lines.append("None.")
    else:
        groups = defaultdict(list)
        for d in dups:
            groups[(d["normalized_name"], d["add_count"])].append(d)
        lines.append(f"Unique duplicate groups: **{len(groups)}** (covering {len(dups)} rows).")
        lines.append("")
        lines.append("| Normalized name | Adds | Count | Files |")
        lines.append("|---|--:|--:|---|")
        for (name, adds), group in sorted(groups.items()):
            files = sorted({g["source_paste_file"] for g in group})
            lines.append(f"| `{name}` | {adds} | {len(group)} | {', '.join(files)} |")
    lines.append("")
    lines.append("## Missing notation")
    lines.append("")
    lines.append(f"Total rows with empty `operational_notation_raw`: **{len(missing_notation)}**.")
    lines.append("")
    lines.append("First 10 rows (full set in `footbagmoves_inventory_missing_notation.csv`):")
    lines.append("")
    if missing_notation:
        lines.append("| synthetic_external_id | display_name | technical_name | add_count |")
        lines.append("|---|---|---|--:|")
        for r in missing_notation[:10]:
            tn = r["technical_name"] or "_(empty)_"
            lines.append(f"| `{r['synthetic_external_id']}` | {r['display_name']} | {tn} | {r['add_count']} |")
    lines.append("")
    lines.append("## Malformed rows")
    lines.append("")
    if not malformed:
        lines.append("None.")
    else:
        lines.append(f"Total: **{len(malformed)}** (see `footbagmoves_inventory_malformed.csv`).")
    lines.append("")
    lines.extend(build_paste_fill_checklist(coverage))
    lines.append("")
    lines.append("## Outputs")
    lines.append("")
    lines.append(f"- `{run_meta['out_dir']}/{run_meta['out_prefix']}.csv` — main inventory (10 fields per row)")
    lines.append(f"- `{run_meta['out_dir']}/footbagmoves_inventory_duplicates.csv` — within-corpus dupes (name + add_count)")
    lines.append(f"- `{run_meta['out_dir']}/footbagmoves_inventory_malformed.csv` — parser-flagged malformed rows")
    lines.append(f"- `{run_meta['out_dir']}/footbagmoves_inventory_missing_notation.csv` — rows with empty `operational_notation_raw`")
    lines.append(f"- `{run_meta['out_dir']}/footbagmoves_inventory_same_side.csv` — same-side variant cohort")
    lines.append(f"- `{run_meta['out_dir']}/footbagmoves_inventory_report.md` — this report")
    lines.append("")
    lines.append("## Contract preservations")
    lines.append("")
    lines.append("- ✓ Federation-not-adoption: synthetic external_ids only; no FM internal IDs imported.")
    lines.append("- ✓ No canonical mutation: writes only to staging path; never to `legacy_data/inputs/noise/`, `database/`, or `legacy_data/out/canonical/`.")
    lines.append("- ✓ No ontology normalization: aliases preserved as raw ` | `-delimited strings.")
    lines.append("- ✓ No DB writes.")
    lines.append("- ✓ No workbook ingest.")
    lines.append("- ✓ No parser hooks: this script imports `parse_footbagmoves_corpus` for parsing only; no integration with `parse_freestyle_notation.py`.")
    lines.append("- ✓ Staging path only — promotion to `legacy_data/out/` is a separate manual step.")
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description="F1b staging inventory builder.")
    ap.add_argument("--input-dir", default="legacy_data/inputs/curated/tricks")
    ap.add_argument("--input-glob", default="footbagmoves-*.txt",
                    help="Glob pattern (relative to input-dir) for FM paste files")
    ap.add_argument("--out-dir", default="legacy_data/reports")
    ap.add_argument("--out-prefix", default="footbagmoves_inventory")
    args = ap.parse_args()

    input_dir = Path(args.input_dir)
    paths = sorted(input_dir.glob(args.input_glob))
    if not paths:
        print(f"[build_footbagmoves_inventory] No input files matched {input_dir}/{args.input_glob}", file=sys.stderr)
        return 1

    file_results = []
    all_parser_rows = []
    all_malformed = []
    for p in paths:
        rows, malformed, moves_found = parse_file(p, "")
        file_results.append((p, rows, malformed, moves_found))
        all_parser_rows.extend(rows)
        all_malformed.extend(malformed)

    inventory_rows = derive_inventory_rows(all_parser_rows)

    file_stats = compute_per_file_stats(file_results)
    coverage = compute_coverage_by_band(inventory_rows)
    dups = find_inventory_duplicates(inventory_rows)
    missing_notation = [r for r in inventory_rows if not r["operational_notation_raw"]]
    same_side = [r for r in inventory_rows if r["same_side_variant"] == 1]

    total_rows = len(inventory_rows)
    totals = {
        "total_rows": total_rows,
        "with_notation": sum(1 for r in inventory_rows if r["operational_notation_raw"]),
        "with_video": sum(1 for r in inventory_rows if r["video_present"] == "1"),
        "with_technical": sum(1 for r in inventory_rows if r["technical_name"]),
        "with_aliases": sum(1 for r in inventory_rows if r["aliases_raw"]),
        "same_side_count": len(same_side),
        "missing_notation_count": len(missing_notation),
        "duplicate_count": len(dups),
        "duplicate_group_count": len({(d["normalized_name"], d["add_count"]) for d in dups}),
        "malformed_count": len(all_malformed),
    }
    for k in ("with_notation", "with_video", "with_technical", "with_aliases", "same_side", "missing_notation"):
        count = totals[f"{k}_count" if k in ("same_side", "missing_notation") else k]
        totals[f"{k}_pct" if k not in ("same_side", "missing_notation") else f"{k}_pct"] = (
            (count / total_rows * 100) if total_rows else 0
        )

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    run_meta = {
        "utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "version": INVENTORY_VERSION,
        "out_dir": str(out_dir),
        "out_prefix": args.out_prefix,
    }

    emit_csv(out_dir / f"{args.out_prefix}.csv", inventory_rows, INVENTORY_FIELDS)

    dup_fields = ["normalized_name", "add_count", "occurrence_count",
                  "synthetic_external_id", "display_name",
                  "source_paste_file", "source_block_index"]
    emit_csv(out_dir / f"{args.out_prefix}_duplicates.csv", dups, dup_fields)

    malformed_fields = ["source_file", "source_add_band", "source_block_index",
                        "anchor_line", "adds", "reason"]
    emit_csv(out_dir / f"{args.out_prefix}_malformed.csv", all_malformed, malformed_fields)

    emit_csv(out_dir / f"{args.out_prefix}_missing_notation.csv", missing_notation, INVENTORY_FIELDS)
    emit_csv(out_dir / f"{args.out_prefix}_same_side.csv", same_side, INVENTORY_FIELDS)

    emit_report(out_dir / f"{args.out_prefix}_report.md",
                run_meta, file_stats, coverage, dups, all_malformed, missing_notation, same_side, totals)

    print(f"[build_footbagmoves_inventory] Wrote 6 artifacts to {out_dir}/")
    print(f"  staging rows: {total_rows}")
    print(f"  duplicates:   {len(dups)}")
    print(f"  malformed:    {len(all_malformed)}")
    print(f"  missing-notn: {len(missing_notation)}")
    print(f"  same-side:    {len(same_side)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

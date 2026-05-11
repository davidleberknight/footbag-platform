#!/usr/bin/env python3
"""parse_footbagmoves_corpus.py - Path C raw extraction parser for FootbagMoves manual-paste files.

Scope (federation-not-adoption):
- Raw corpus parsing only.
- NO ontology normalization, NO alias normalization, NO operational-notation parsing.
- NO canonical mutation, NO DB writes, NO workbook ingestion.
- Output is external evidence with per-row provenance.

Default inputs:
    legacy_data/inputs/curated/tricks/footbagmoves-corpus-add{2..9}.txt

Default outputs:
    legacy_data/out/scraped_footbagmoves.csv
    legacy_data/out/scraped_footbagmoves_report.md
    legacy_data/out/scraped_footbagmoves_malformed.csv
    legacy_data/out/scraped_footbagmoves_duplicates.csv

Usage:
    python3 legacy_data/scripts/parse_footbagmoves_corpus.py
    python3 legacy_data/scripts/parse_footbagmoves_corpus.py --input-glob 'tmp/*.txt' --out-dir /tmp/fm
"""

import argparse
import csv
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ADDS_RE = re.compile(r"^Adds:\s*(\d+)\s*$")
NOTATION_RE = re.compile(r"\s>{1,2}\s")
SEPARATOR_RE = re.compile(r"^/{2,}\s*$")
MOVES_FOUND_RE = re.compile(r"^Moves found:\s*(\d+)\s*$")
NO_VIDEO = "No Video Available"
PARSER_VERSION = "1.0"


def find_header_block_indices(lines):
    """Mark header-block lines (from 'Moves found: N' backwards up to a separator,
    capped at 12 prior lines to bound runaway marking)."""
    header_indices = set()
    for i, raw in enumerate(lines):
        if MOVES_FOUND_RE.match(raw.strip()):
            for j in range(i, max(-1, i - 13), -1):
                if j < 0:
                    break
                if SEPARATOR_RE.match(lines[j].strip()):
                    break
                header_indices.add(j)
    return header_indices


def parse_file(filepath, source_add_band):
    raw_lines = Path(filepath).read_text(encoding="utf-8").splitlines()
    header_indices = find_header_block_indices(raw_lines)

    adds_anchors = []
    for i, line in enumerate(raw_lines):
        if i in header_indices:
            continue
        m = ADDS_RE.match(line)
        if m:
            adds_anchors.append((i, int(m.group(1))))

    moves_found_values = [
        int(MOVES_FOUND_RE.match(line.strip()).group(1))
        for line in raw_lines
        if MOVES_FOUND_RE.match(line.strip())
    ]

    rows = []
    malformed = []

    for block_idx, (anchor_idx, adds_val) in enumerate(adds_anchors):
        name_lines, seen_no_video = _walk_back_for_names(
            raw_lines, header_indices, anchor_idx
        )
        video_present = not seen_no_video

        if not name_lines:
            malformed.append({
                "source_file": filepath.name,
                "source_add_band": source_add_band,
                "source_block_index": block_idx,
                "anchor_line": anchor_idx + 1,
                "adds": adds_val,
                "reason": "no name lines found before Adds: anchor",
            })
            continue

        display_name = name_lines[0]
        technical_name = name_lines[1] if len(name_lines) >= 2 else ""

        aliases_raw = ""
        if " / " in display_name:
            parts = [p.strip() for p in display_name.split(" / ")]
            display_name = parts[0]
            aliases_raw = " | ".join(parts[1:])

        operational_notation_raw = _walk_forward_for_notation(
            raw_lines, header_indices, anchor_idx
        )

        if source_add_band and str(adds_val) != source_add_band:
            malformed.append({
                "source_file": filepath.name,
                "source_add_band": source_add_band,
                "source_block_index": block_idx,
                "anchor_line": anchor_idx + 1,
                "adds": adds_val,
                "reason": f"adds value {adds_val} does not match expected band {source_add_band}",
            })

        rows.append({
            "display_name": display_name,
            "technical_name": technical_name,
            "aliases_raw": aliases_raw,
            "adds": adds_val,
            "operational_notation_raw": operational_notation_raw,
            "video_present": "1" if video_present else "0",
            "source_add_band": source_add_band,
            "source_block_index": block_idx,
            "source_file": filepath.name,
            "anchor_line": anchor_idx + 1,
        })

    return rows, malformed, moves_found_values


def _walk_back_for_names(raw_lines, header_indices, anchor_idx):
    name_lines = []
    seen_no_video = False
    collecting_names = True
    idx = anchor_idx - 1
    while idx >= 0:
        if idx in header_indices:
            idx -= 1
            continue
        stripped = raw_lines[idx].strip()
        if SEPARATOR_RE.match(stripped) or ADDS_RE.match(stripped) or MOVES_FOUND_RE.match(stripped):
            break
        if NOTATION_RE.search(stripped):
            break
        if collecting_names:
            if stripped == "":
                if name_lines:
                    collecting_names = False
                idx -= 1
                continue
            if stripped == NO_VIDEO:
                seen_no_video = True
                if name_lines:
                    break
                idx -= 1
                continue
            name_lines.insert(0, stripped)
            if len(name_lines) >= 2:
                collecting_names = False
            idx -= 1
        else:
            if stripped == "":
                idx -= 1
                continue
            if stripped == NO_VIDEO:
                seen_no_video = True
                break
            break
    return name_lines, seen_no_video


def _walk_forward_for_notation(raw_lines, header_indices, anchor_idx):
    fidx = anchor_idx + 1
    while fidx < len(raw_lines):
        if fidx in header_indices:
            fidx += 1
            continue
        line = raw_lines[fidx]
        stripped = line.strip()
        if stripped == "":
            fidx += 1
            continue
        if SEPARATOR_RE.match(stripped) or ADDS_RE.match(stripped) or MOVES_FOUND_RE.match(stripped):
            return ""
        if stripped == NO_VIDEO:
            return ""
        if NOTATION_RE.search(stripped):
            return line.rstrip()
        return ""
    return ""


def find_duplicates(all_rows):
    by_norm_name = defaultdict(list)
    for r in all_rows:
        key = r["display_name"].strip().lower()
        by_norm_name[key].append(r)
    dups = []
    for key, group in by_norm_name.items():
        if len(group) > 1:
            for r in group:
                dups.append({
                    "normalized_name": key,
                    "occurrence_count": len(group),
                    "display_name": r["display_name"],
                    "technical_name": r["technical_name"],
                    "adds": r["adds"],
                    "source_add_band": r["source_add_band"],
                    "source_file": r["source_file"],
                    "source_block_index": r["source_block_index"],
                    "anchor_line": r["anchor_line"],
                })
    return dups


def emit_csv(path, rows, fieldnames):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def emit_report(path, run_meta, file_stats, malformed, duplicates, all_rows):
    lines = []
    lines.append("# FootbagMoves raw-corpus parse report")
    lines.append("")
    lines.append(f"**Run timestamp (UTC):** {run_meta['utc']}")
    lines.append(f"**Parser version:** {run_meta['parser_version']}")
    lines.append("")
    lines.append("**Federation-not-adoption posture preserved:**")
    lines.append("- Raw extraction only; no ontology normalization.")
    lines.append("- No alias normalization, no operational-notation parsing.")
    lines.append("- No canonical mutation, no DB writes, no workbook ingestion.")
    lines.append("")
    lines.append("## Inputs")
    lines.append("")
    lines.append(f"- Scanned: {len(run_meta['inputs_scanned'])} path(s)")
    lines.append(f"- Present: {len(run_meta['inputs_present'])}")
    lines.append(f"- Missing: {len(run_meta['inputs_missing'])}")
    if run_meta["inputs_missing"]:
        lines.append("")
        lines.append("Missing input files (parser ran on available inputs only):")
        for m in run_meta["inputs_missing"]:
            lines.append(f"- `{m}`")
    lines.append("")
    lines.append("## Per-file extraction counts")
    lines.append("")
    lines.append("| File | Band | Rows | Moves-found header | Match | With notation | With video | Technical-name | Aliased |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for fs in file_stats:
        if fs["moves_found_match"] is True:
            match = "yes"
        elif fs["moves_found_header"] is None:
            match = "n/a"
        else:
            match = f"no (delta {fs['rows_extracted'] - fs['moves_found_header']:+d})"
        lines.append(
            f"| {fs['file']} | {fs['band']} | {fs['rows_extracted']} | "
            f"{fs['moves_found_header'] if fs['moves_found_header'] is not None else '-'} | "
            f"{match} | {fs['with_notation']} | {fs['with_video']} | "
            f"{fs['multi_name']} | {fs['multi_alias']} |"
        )
    lines.append("")
    total_rows = len(all_rows)
    with_notation = sum(1 for r in all_rows if r["operational_notation_raw"] != "")
    with_video = sum(1 for r in all_rows if r["video_present"] == "1")
    multi_name = sum(1 for r in all_rows if r["technical_name"] != "")
    multi_alias = sum(1 for r in all_rows if r["aliases_raw"] != "")
    lines.append("## Totals")
    lines.append("")
    lines.append(f"- Total rows extracted: **{total_rows}**")
    if total_rows:
        lines.append(f"- Rows with operational notation: **{with_notation}** ({100 * with_notation / total_rows:.1f}%)")
        lines.append(f"- Rows with video: **{with_video}** ({100 * with_video / total_rows:.1f}%)")
        lines.append(f"- Rows with technical_name: **{multi_name}** ({100 * multi_name / total_rows:.1f}%)")
        lines.append(f"- Rows with aliases: **{multi_alias}** ({100 * multi_alias / total_rows:.1f}%)")
    lines.append("")
    lines.append("## Malformed rows")
    lines.append("")
    if not malformed:
        lines.append("None.")
    else:
        lines.append(f"Total malformed: **{len(malformed)}** (see `{Path(path).stem.replace('_report', '')}_malformed.csv`).")
        lines.append("")
        lines.append("| File | Band | Anchor line | Block idx | Adds | Reason |")
        lines.append("|---|---|---|---|---|---|")
        for m in malformed:
            lines.append(
                f"| {m['source_file']} | {m['source_add_band']} | {m['anchor_line']} | "
                f"{m['source_block_index']} | {m.get('adds','')} | {m['reason']} |"
            )
    lines.append("")
    lines.append("## Duplicate display names (case-insensitive)")
    lines.append("")
    if not duplicates:
        lines.append("None.")
    else:
        by_name = defaultdict(list)
        for d in duplicates:
            by_name[d["normalized_name"]].append(d)
        lines.append(f"Unique duplicate names: **{len(by_name)}** (covering {len(duplicates)} rows).")
        lines.append("")
        lines.append("| Normalized name | Count | Bands | Files |")
        lines.append("|---|---|---|---|")
        for name, group in sorted(by_name.items()):
            bands = sorted({g["source_add_band"] for g in group if g["source_add_band"]})
            files = sorted({g["source_file"] for g in group})
            lines.append(
                f"| `{name}` | {len(group)} | {', '.join(bands) if bands else '-'} | {', '.join(files)} |"
            )
    lines.append("")
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description="Parse FootbagMoves manual-paste files into a raw CSV corpus.")
    ap.add_argument("--input-dir", default="legacy_data/inputs/curated/tricks")
    ap.add_argument("--input-prefix", default="footbagmoves-corpus-add")
    ap.add_argument("--bands", default="2,3,4,5,6,7,8,9", help="comma-separated ADD bands")
    ap.add_argument("--out-dir", default="legacy_data/out")
    ap.add_argument("--out-name", default="scraped_footbagmoves")
    ap.add_argument("--input-glob", default="legacy_data/inputs/curated/tricks/footbagmoves-*.txt",
                    help="glob pattern for input files (relative to CWD); set to '' to use --input-prefix + --bands instead")
    args = ap.parse_args()

    run_meta = {
        "utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "parser_version": PARSER_VERSION,
        "inputs_scanned": [],
        "inputs_present": [],
        "inputs_missing": [],
    }

    inputs = []
    if args.input_glob:
        for p in sorted(Path(".").glob(args.input_glob)):
            inputs.append((p, ""))
    else:
        for band in args.bands.split(","):
            band = band.strip()
            if not band:
                continue
            inputs.append((Path(args.input_dir) / f"{args.input_prefix}{band}.txt", band))

    for p, _ in inputs:
        run_meta["inputs_scanned"].append(str(p))
    inputs_present = [(p, b) for (p, b) in inputs if p.is_file()]
    run_meta["inputs_present"] = [str(p) for (p, _) in inputs_present]
    run_meta["inputs_missing"] = [str(p) for (p, _) in inputs if not p.is_file()]

    if not inputs_present:
        print("[parse_footbagmoves_corpus] No input files found.", file=sys.stderr)
        print(
            f"  Expected pattern: {args.input_dir}/{args.input_prefix}{{{args.bands}}}.txt",
            file=sys.stderr,
        )
        for m in run_meta["inputs_missing"]:
            print(f"    missing: {m}", file=sys.stderr)
        print("  No outputs emitted.", file=sys.stderr)
        return 1

    all_rows = []
    all_malformed = []
    file_stats = []

    for fpath, band in inputs_present:
        rows, malformed, moves_found_values = parse_file(fpath, band)
        all_rows.extend(rows)
        all_malformed.extend(malformed)
        moves_found_header = moves_found_values[0] if moves_found_values else None
        file_stats.append({
            "file": fpath.name,
            "band": band,
            "rows_extracted": len(rows),
            "moves_found_header": moves_found_header,
            "moves_found_match": (moves_found_header is not None and moves_found_header == len(rows)),
            "with_notation": sum(1 for r in rows if r["operational_notation_raw"] != ""),
            "with_video": sum(1 for r in rows if r["video_present"] == "1"),
            "multi_name": sum(1 for r in rows if r["technical_name"] != ""),
            "multi_alias": sum(1 for r in rows if r["aliases_raw"] != ""),
        })

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    corpus_path = out_dir / f"{args.out_name}.csv"
    malformed_path = out_dir / f"{args.out_name}_malformed.csv"
    duplicates_path = out_dir / f"{args.out_name}_duplicates.csv"
    report_path = out_dir / f"{args.out_name}_report.md"

    corpus_fields = [
        "display_name", "technical_name", "aliases_raw",
        "adds", "operational_notation_raw", "video_present",
        "source_add_band", "source_block_index",
    ]
    emit_csv(corpus_path, all_rows, corpus_fields)

    malformed_fields = [
        "source_file", "source_add_band", "source_block_index",
        "anchor_line", "adds", "reason",
    ]
    emit_csv(malformed_path, all_malformed, malformed_fields)

    duplicates = find_duplicates(all_rows)
    duplicates_fields = [
        "normalized_name", "occurrence_count",
        "display_name", "technical_name", "adds",
        "source_add_band", "source_file", "source_block_index", "anchor_line",
    ]
    emit_csv(duplicates_path, duplicates, duplicates_fields)

    emit_report(report_path, run_meta, file_stats, all_malformed, duplicates, all_rows)

    print("[parse_footbagmoves_corpus] Wrote:")
    print(f"  {corpus_path}  ({len(all_rows)} rows)")
    print(f"  {malformed_path}  ({len(all_malformed)} rows)")
    print(f"  {duplicates_path}  ({len(duplicates)} rows)")
    print(f"  {report_path}")
    if run_meta["inputs_missing"]:
        print(f"  Note: {len(run_meta['inputs_missing'])} input file(s) missing - see report.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

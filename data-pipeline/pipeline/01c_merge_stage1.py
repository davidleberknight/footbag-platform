#!/usr/bin/env python3
"""
01c_merge_stage1.py

Deterministic, validated merge of Stage 1 raw events:
- out/stage1_raw_events_mirror.csv (from 01_parse_mirror.py)
- out/stage1_raw_events_old.csv    (from 01b_import_old_results.py)

Writes:
- out/stage1_raw_events.csv        (merged content)
- out/stage1_merge_summary.json    (counts + schema + collision info)

Policy:
- No guessing. If anything looks unsafe/ambiguous, FAIL (exit non-zero).
- Headers must match exactly (same names, same order); merge is by dicts to avoid
  field shifting. Schema mismatch is a hard error.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple, Optional


@dataclass
class MergeSummary:
    timestamp_utc: str
    mirror_path: str
    old_path: str
    output_path: str
    summary_path: str

    mirror_rows: int
    old_rows: int
    merged_rows: int

    header_mirror: List[str]
    header_old: List[str]
    header_equal: bool

    event_id_column: str
    mirror_event_id_dupes: int
    old_event_id_dupes: int
    cross_source_collisions: int
    cross_collision_examples: List[str]

    mirror_year_minmax: Optional[Tuple[str, str]]
    old_year_minmax: Optional[Tuple[str, str]]

    notes: List[str]


def _year_minmax_from_dicts(rows: List[Dict[str, str]], year_col: Optional[str]) -> Optional[Tuple[str, str]]:
    years = [r.get(year_col, "").strip() for r in rows if r.get(year_col, "").strip()]
    if not years:
        return None

    def _key(v: str):
        try:
            return int(v)
        except Exception:
            return v

    years_sorted = sorted(years, key=_key)
    return (years_sorted[0], years_sorted[-1])


def _assert_post_merge_sanity(
    rows: List[Dict[str, str]],
    event_id_col: str,
) -> None:
    """Assert event_id always populated; old synthetic events have correct source fields."""
    for i, row in enumerate(rows):
        eid = (row.get(event_id_col) or "").strip()
        if not eid:
            raise SystemExit(
                f"Post-merge sanity: row index {i} has empty {event_id_col!r}. "
                "Every row must have event_id populated."
            )
        if eid.startswith("200"):
            layer = (row.get("source_layer") or "").strip()
            if layer != "old_results":
                raise SystemExit(
                    f"Post-merge sanity: old synthetic event {eid!r} (row {i}) has source_layer={layer!r}, "
                    'expected "old_results".'
                )
            src_file = (row.get("source_file") or "").strip()
            if src_file != "OLD_RESULTS.txt":
                raise SystemExit(
                    f"Post-merge sanity: old synthetic event {eid!r} (row {i}) has source_file={src_file!r}, "
                    'expected "OLD_RESULTS.txt".'
                )
            name_raw = (row.get("event_name_raw") or "").strip()
            if not name_raw:
                raise SystemExit(
                    f"Post-merge sanity: old synthetic event {eid!r} (row {i}) has blank event_name_raw."
                )


def main() -> int:
    ap = argparse.ArgumentParser(description="Validated Stage 1 merge for raw events CSVs")
    ap.add_argument("--out-dir", default="out", help="Output directory (default: out)")
    ap.add_argument("--mirror", default=None, help="Path to mirror CSV (default: <out-dir>/stage1_raw_events_mirror.csv)")
    ap.add_argument("--old", default=None, help="Path to stage1_raw_events_old.csv (default: <out-dir>/stage1_raw_events_old.csv)")
    ap.add_argument("--output", default=None, help="Output path (default: <out-dir>/stage1_raw_events.csv)")
    ap.add_argument("--summary", default=None, help="Summary JSON path (default: <out-dir>/stage1_merge_summary.json)")

    ap.add_argument("--event-id-col", default="event_id", help="Event id column name (default: event_id)")
    ap.add_argument("--year-col", default="year", help="Year column name, for reporting only (default: year)")

    ap.add_argument("--allow-cross-collisions", action="store_true",
                    help="Allow event_id collisions between sources (NOT recommended).")
    ap.add_argument("--fail-on-internal-dupes", action="store_true",
                    help="Fail if duplicates exist within either source by event_id (default: warn only).")

    args = ap.parse_args()

    out_dir = Path(args.out_dir)
    mirror_path = Path(args.mirror) if args.mirror else (out_dir / "stage1_raw_events_mirror.csv")
    old_path = Path(args.old) if args.old else (out_dir / "stage1_raw_events_old.csv")
    output_path = Path(args.output) if args.output else (out_dir / "stage1_raw_events.csv")
    summary_path = Path(args.summary) if args.summary else (out_dir / "stage1_merge_summary.json")

    notes: List[str] = []

    if not mirror_path.exists():
        print(f"ERROR: missing mirror CSV: {mirror_path}", file=sys.stderr)
        return 2
    if not old_path.exists():
        print(f"ERROR: missing old CSV: {old_path}", file=sys.stderr)
        return 2

    # Read as dicts so merge is by field name; header must match exactly.
    with mirror_path.open("r", encoding="utf-8", newline="") as f:
        r1 = csv.DictReader(f)
        h1 = list(r1.fieldnames) if r1.fieldnames else []
        mirror_rows_list = list(r1)

    with old_path.open("r", encoding="utf-8", newline="") as f:
        r2 = csv.DictReader(f)
        h2 = list(r2.fieldnames) if r2.fieldnames else []
        old_rows_list = list(r2)

    if h1 != h2:
        print(
            "ERROR: Header mismatch between mirror and old CSV (same names and order required).\n"
            f"  mirror: {h1}\n"
            f"  old:    {h2}",
            file=sys.stderr,
        )
        sys.exit(3)

    mirror_rows = len(mirror_rows_list)
    old_rows = len(old_rows_list)
    rows = mirror_rows_list + old_rows_list
    merged_rows = len(rows)

    # Post-merge sanity: event_id always set; old synthetic events have correct source fields.
    _assert_post_merge_sanity(rows, args.event_id_col)

    # Count event_id dupes and years from dicts
    mirror_ids: Counter = Counter()
    for row in mirror_rows_list:
        eid = (row.get(args.event_id_col) or "").strip()
        if eid:
            mirror_ids[eid] += 1
    old_ids: Counter = Counter()
    for row in old_rows_list:
        eid = (row.get(args.event_id_col) or "").strip()
        if eid:
            old_ids[eid] += 1

    mirror_year_minmax = _year_minmax_from_dicts(mirror_rows_list, args.year_col)
    old_year_minmax = _year_minmax_from_dicts(old_rows_list, args.year_col)

    mirror_internal_dupes = sum(1 for k, v in mirror_ids.items() if v > 1)
    old_internal_dupes = sum(1 for k, v in old_ids.items() if v > 1)

    if (mirror_internal_dupes or old_internal_dupes) and args.fail_on_internal_dupes:
        print(
            f"ERROR: internal event_id duplicates detected "
            f"(mirror unique-dupe-ids={mirror_internal_dupes}, old unique-dupe-ids={old_internal_dupes}).",
            file=sys.stderr,
        )
        return 4
    elif mirror_internal_dupes or old_internal_dupes:
        notes.append(
            f"WARNING: internal event_id duplicates present "
            f"(mirror unique-dupe-ids={mirror_internal_dupes}, old unique-dupe-ids={old_internal_dupes})."
        )

    # Cross-source collisions
    collisions = sorted(set(mirror_ids.keys()) & set(old_ids.keys()))
    collision_examples = collisions[:20]
    if collisions and not args.allow_cross_collisions:
        print(
            f"ERROR: event_id collisions between mirror and old: count={len(collisions)} "
            f"(examples={collision_examples})",
            file=sys.stderr,
        )
        return 5
    elif collisions:
        notes.append(f"WARNING: cross-source event_id collisions allowed: count={len(collisions)}")

    # Write merged using mirror header; extrasaction=raise prevents silent field drops.
    tmp_path = output_path.with_suffix(".csv.tmp")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tmp_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=h1, extrasaction="raise")
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp_path, output_path)

    # Final sanity: merged rows should match sum
    expected = mirror_rows + old_rows
    if merged_rows != expected:
        # This should basically never happen unless weird blank-row handling differs.
        notes.append(f"WARNING: merged row count {merged_rows} != expected {expected}")

    summary = MergeSummary(
        timestamp_utc=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        mirror_path=str(mirror_path),
        old_path=str(old_path),
        output_path=str(output_path),
        summary_path=str(summary_path),

        mirror_rows=mirror_rows,
        old_rows=old_rows,
        merged_rows=merged_rows,

        header_mirror=h1,
        header_old=h2,
        header_equal=True,

        event_id_column=args.event_id_col,
        mirror_event_id_dupes=mirror_internal_dupes,
        old_event_id_dupes=old_internal_dupes,
        cross_source_collisions=len(collisions),
        cross_collision_examples=collision_examples,

        mirror_year_minmax=mirror_year_minmax,
        old_year_minmax=old_year_minmax,

        notes=notes,
    )

    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary.__dict__, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        f"OK: merged {mirror_rows} (mirror) + {old_rows} (old) -> {merged_rows} rows\n"
        f"  output:  {output_path}\n"
        f"  summary: {summary_path}"
    )
    if notes:
        for n in notes:
            print(n)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())


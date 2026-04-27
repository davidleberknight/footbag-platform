"""
QC: snippet_candidates.csv staging integrity.

Read-only checks against the staging CSV (and freestyle_tricks /
freestyle_media_sources from the DB for slug + source_id validation).
Designed to run before any promotion attempt by the generator.

Checks:
  1. missing_trick_slug                — trick_slug empty or not in freestyle_tricks
  2. invalid_timestamp                  — negative seconds or start_seconds >= end_seconds
  3. duplicate_candidate                — same (url, trick_slug, start_seconds) appears more than once
  4. unclear_source                     — source_id not in freestyle_media_sources
  5. signed_off_no_confidence           — reviewer populated but confidence empty
  6. compilation_missing_timestamp      — clip_type='compilation' without start_seconds
  7. unknown_clip_type                  — clip_type non-empty and not in the allowed set
  8. coverage_summary                   — counts: total / by source / by reviewer state

Exit code is always 0 (informational); HARD vs WARN reported in output for triage.

Run from repo root or legacy_data/ with the venv active:
    python legacy_data/pipeline/qc/check_snippet_candidates.py [--db <path>] [--csv <path>]
"""

import argparse
import csv
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
import sys
from collections import Counter
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parents[2]  # qc/ → pipeline/ → legacy_data/ → repo root
DEFAULT_DB = REPO_ROOT / "database" / "footbag.db"
DEFAULT_CSV = REPO_ROOT / "legacy_data" / "tools" / "trick_video_discovery" / "snippet_candidates.csv"

ALLOWED_CLIP_TYPES = {"tutorial", "demo", "record", "slow_mo", "compilation"}
SAMPLE_LIMIT = 5


def _samples(rows: list, limit: int = SAMPLE_LIMIT) -> str:
    if not rows:
        return ""
    out = []
    for r in rows[:limit]:
        out.append("  - " + ", ".join(f"{k}={v!r}" for k, v in r.items()))
    if len(rows) > limit:
        out.append(f"  ... (+{len(rows) - limit} more)")
    return "\n".join(out)


def _maybe_int(s: str) -> int | None:
    s = (s or "").strip()
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="snippet_candidates.csv QC")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to SQLite DB")
    parser.add_argument("--csv", default=str(DEFAULT_CSV), help="Path to snippet_candidates.csv")
    args = parser.parse_args()

    db_path = Path(args.db)
    csv_path = Path(args.csv)
    if not db_path.exists():
        print(f"ERROR: database not found: {db_path}", file=sys.stderr)
        return 1
    if not csv_path.exists():
        print(f"ERROR: candidates CSV not found: {csv_path}", file=sys.stderr)
        return 1

    con = sqlite3.connect(db_path)
    valid_slugs = {r[0] for r in con.execute("SELECT slug FROM freestyle_tricks").fetchall()}
    valid_sources = {r[0] for r in con.execute("SELECT source_id FROM freestyle_media_sources").fetchall()}
    con.close()

    with csv_path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    print("snippet_candidates.csv QC")
    print("=" * 60)
    print(f"  rows: {len(rows)}")
    print(f"  valid trick slugs in DB: {len(valid_slugs)}")
    print(f"  valid source ids in DB: {len(valid_sources)}")

    hard = 0
    warn = 0

    # 1. missing_trick_slug
    bad = [{"row": i+2, "trick_slug": r.get("trick_slug",""), "url": r.get("url","")}
           for i, r in enumerate(rows)
           if not r.get("trick_slug","").strip() or r["trick_slug"].strip() not in valid_slugs]
    print(f"\n[1] missing_trick_slug              {len(bad):>4}   {'HARD' if bad else 'OK'}")
    if bad: hard += 1; print(_samples(bad))

    # 2. invalid_timestamp
    bad = []
    for i, r in enumerate(rows):
        s = _maybe_int(r.get("start_seconds",""))
        e = _maybe_int(r.get("end_seconds",""))
        if (s is not None and s < 0) or (e is not None and e < 0) or (s is not None and e is not None and s >= e):
            bad.append({"row": i+2, "start": s, "end": e, "url": r.get("url","")})
    print(f"\n[2] invalid_timestamp               {len(bad):>4}   {'HARD' if bad else 'OK'}")
    if bad: hard += 1; print(_samples(bad))

    # 3. duplicate_candidate
    keys = Counter(
        (r.get("url","").strip(), r.get("trick_slug","").strip(), r.get("start_seconds","").strip())
        for r in rows
    )
    dup_keys = {k for k, n in keys.items() if n > 1}
    bad = [{"row": i+2, "url": r.get("url",""), "trick_slug": r.get("trick_slug",""), "start": r.get("start_seconds","")}
           for i, r in enumerate(rows)
           if (r.get("url","").strip(), r.get("trick_slug","").strip(), r.get("start_seconds","").strip()) in dup_keys]
    print(f"\n[3] duplicate_candidate             {len(bad):>4}   {'HARD' if bad else 'OK'}")
    if bad: hard += 1; print(_samples(bad))

    # 4. unclear_source
    bad = [{"row": i+2, "source_id": r.get("source_id",""), "url": r.get("url","")}
           for i, r in enumerate(rows)
           if r.get("source_id","").strip() not in valid_sources]
    print(f"\n[4] unclear_source                  {len(bad):>4}   {'HARD' if bad else 'OK'}")
    if bad: hard += 1; print(_samples(bad))

    # 5. signed_off_no_confidence
    bad = [{"row": i+2, "reviewer": r.get("reviewer",""), "url": r.get("url","")}
           for i, r in enumerate(rows)
           if r.get("reviewer","").strip() and not r.get("confidence","").strip()]
    print(f"\n[5] signed_off_no_confidence        {len(bad):>4}   {'HARD' if bad else 'OK'}")
    if bad: hard += 1; print(_samples(bad))

    # 6. compilation_missing_timestamp
    bad = [{"row": i+2, "url": r.get("url",""), "trick_slug": r.get("trick_slug","")}
           for i, r in enumerate(rows)
           if r.get("clip_type","").strip() == "compilation" and not r.get("start_seconds","").strip()]
    print(f"\n[6] compilation_missing_timestamp   {len(bad):>4}   {'HARD' if bad else 'OK'}")
    if bad: hard += 1; print(_samples(bad))

    # 7. unknown_clip_type
    bad = [{"row": i+2, "clip_type": r.get("clip_type",""), "url": r.get("url","")}
           for i, r in enumerate(rows)
           if r.get("clip_type","").strip() and r["clip_type"].strip() not in ALLOWED_CLIP_TYPES]
    print(f"\n[7] unknown_clip_type               {len(bad):>4}   {'WARN' if bad else 'OK'}")
    if bad: warn += 1; print(_samples(bad))

    # 8. coverage_summary
    print(f"\n[8] coverage_summary")
    by_source = Counter(r.get("source_id","") or "(blank)" for r in rows)
    by_state = Counter(
        ("signed_off" if r.get("reviewer","").strip() else "unreviewed")
        for r in rows
    )
    by_clip_type = Counter(r.get("clip_type","") or "(unset)" for r in rows)
    print(f"      total_rows                       {len(rows)}")
    for src, n in sorted(by_source.items()):
        print(f"      by_source[{src}]" + " " * max(0, 24 - len(src)) + f"  {n}")
    for st, n in sorted(by_state.items()):
        print(f"      by_state[{st}]" + " " * max(0, 25 - len(st)) + f"   {n}")
    for ct, n in sorted(by_clip_type.items()):
        print(f"      by_clip_type[{ct}]" + " " * max(0, 21 - len(ct)) + f"   {n}")

    print("\n" + "=" * 60)
    print(f"Summary: hard={hard}  warn={warn}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

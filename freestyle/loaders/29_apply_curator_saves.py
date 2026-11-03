#!/usr/bin/env python3
"""
Apply what curators saved through the admin screens, after every other input.

Before go-live a curation screen on a developer machine writes one small JSON file
per saved item under freestyle/inputs/curator_saves/. Those files are committed,
so a rebuild reproduces the save. Each names its target and only the fields a
curator overrode; a null field is a deliberate clear, which the base inputs have no
way to say. Running last makes the precedence plain: base inputs first, curator
saves on top.

Because a save overrides a value someone could still read in an older CSV, this
step reports every value it overrides, on stdout and in
freestyle/reports/curator_save_overrides.csv, so nobody takes a superseded row for
the authority.

A file it cannot apply stops the rebuild and names the file. Skipping one would
silently lose a curator's work, and a save pointing at a trick that no longer
exists is a decision for somebody to make, not a side effect of a rebuild.

Usage:
    python3 freestyle/loaders/29_apply_curator_saves.py [--db path] [--saves-dir path] [--report path]
"""
from __future__ import annotations

import argparse
import csv
import sqlite3
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from _freestyle_db import open_freestyle_db  # noqa: E402
from _freestyle_db_freshness import CURATOR_SAVES_DIR, read_trick_saves  # noqa: E402

REPORT_FIELDS = ["slug", "field", "base_value", "saved_value"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(REPO_ROOT / "database" / "footbag.db"))
    ap.add_argument("--saves-dir", default=str(CURATOR_SAVES_DIR))
    ap.add_argument("--report", default=str(REPO_ROOT / "freestyle" / "reports" / "curator_save_overrides.csv"))
    args = ap.parse_args()

    try:
        saves = read_trick_saves(Path(args.saves_dir))
    except ValueError as err:
        print(f"ERROR: {err}", file=sys.stderr)
        return 1

    conn = open_freestyle_db(args.db, "29_apply_curator_saves.py")
    conn.execute("PRAGMA foreign_keys = ON")
    overrides: list[tuple[str, str, object, object]] = []
    try:
        with conn:
            for slug, fields in saves.items():
                columns = sorted(fields)
                base = conn.execute(
                    f"SELECT {', '.join(columns)} FROM freestyle_tricks WHERE slug = ?", (slug,)
                ).fetchone()
                if base is None:
                    raise ValueError(
                        f"the curator save for {slug} names a trick the committed inputs no longer "
                        f"produce. Decide which is right: restore the trick, or delete "
                        f"tricks/{slug}.json from the saves folder."
                    )
                for column, base_value in zip(columns, base):
                    if base_value != fields[column]:
                        overrides.append((slug, column, base_value, fields[column]))
                assignments = ", ".join(f"{column} = ?" for column in columns)
                conn.execute(
                    f"UPDATE freestyle_tricks SET {assignments} WHERE slug = ?",
                    [fields[column] for column in columns] + [slug],
                )
    except (ValueError, sqlite3.IntegrityError) as err:
        print(f"ERROR: nothing from the curator saves was applied. {err}", file=sys.stderr)
        return 1
    finally:
        conn.close()

    report = Path(args.report)
    report.parent.mkdir(parents=True, exist_ok=True)
    with report.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(REPORT_FIELDS)
        writer.writerows(overrides)

    print(f"Curator saves applied: {len(saves)} trick(s), {len(overrides)} base value(s) overridden")
    for slug, column, base_value, saved in overrides:
        print(f"  {slug}.{column}: base {base_value!r} overridden by save {saved!r}")
    if overrides:
        print(f"Report: {report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

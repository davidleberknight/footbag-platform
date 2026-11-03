#!/usr/bin/env python3
"""
Apply what curators saved through the admin screens, after every other input.

Before go-live a curation screen on a developer machine writes one small JSON file
per saved item under freestyle/inputs/curator_saves/. Those files are committed,
so a rebuild reproduces the save. A trick's file names its target and only the
fields a curator overrode, with a null field marking a deliberate clear. Sources,
aliases and links are saved as whole records, and removed: true marks one taken
away, since a rebuild would otherwise bring it back from a base input. Running last
makes the precedence plain: base inputs first, curator saves on top.

Because a save overrides a value someone could still read in an older CSV, this
step reports every value it overrides, on stdout and in
freestyle/reports/curator_save_overrides.csv, so nobody takes a superseded row for
the authority.

A file it cannot apply stops the rebuild and names the file, and nothing is applied.
Skipping one would silently lose a curator's work, and a save pointing at a record
that no longer exists is a decision for somebody to make, not a side effect of a
rebuild.

Usage:
    python3 freestyle/loaders/29_apply_curator_saves.py [--db path] [--saves-dir path] [--report path]
"""
from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from _freestyle_db import open_freestyle_db  # noqa: E402
from _freestyle_db_freshness import CURATOR_SAVES_DIR, read_trick_saves  # noqa: E402

REPORT_FIELDS = ["target", "field", "base_value", "saved_value"]

# (folder, table, key columns, value columns). Applied in this order after the
# tricks, because aliases and links reference sources and tricks by foreign key.
RECORD_KINDS = (
    ("sources", "freestyle_trick_sources", ("id",),
     ("source_type", "source_label", "source_url", "retrieved_at", "notes")),
    ("aliases", "freestyle_trick_aliases", ("alias_slug",),
     ("alias_text", "trick_slug", "alias_type", "alias_display", "display_reason",
      "source_id", "provenance_note")),
    ("source_links", "freestyle_trick_source_links", ("trick_slug", "source_id"),
     ("external_url", "asserted_adds")),
    ("modifier_links", "freestyle_trick_modifier_links", ("trick_slug", "modifier_slug", "apply_order"),
     ()),
    ("records", "freestyle_records", ("id",),
     ("record_type", "person_id", "display_name", "trick_name", "sort_name", "adds_count",
      "value_numeric", "value_text", "achieved_date", "date_precision", "source", "confidence",
      "video_url", "video_timecode", "notes", "superseded_by")),
    ("consecutive_records", "consecutive_kicks_records", ("id",),
     ("sort_order", "section", "subsection", "discipline", "year", "rank", "player_1", "player_2",
      "score", "note", "event_date", "event_name", "location")),
)
# A curator's alias says so, the way the application's own save does. The creation
# time is this load's, as it is for every row a loader writes.
LOADED_AT = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
FIXED_COLUMNS = {
    "aliases": {"alias_origin_producer": "curator-application", "created_at": LOADED_AT},
    "records": {"created_at": LOADED_AT, "updated_at": LOADED_AT},
    "consecutive_records": {"created_at": LOADED_AT, "updated_at": LOADED_AT},
}


def apply_trick_saves(conn, saves, overrides):
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


def clear_saved_positions(conn, saves_dir):
    """Lift every saved consecutive row off its display position before applying.

    The position is unique, so two saved rows that swapped places would collide
    midway through otherwise. Each is stored at a unique negative position first,
    and its save then sets the real one.
    """
    for path in sorted((saves_dir / "consecutive_records").glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except ValueError as err:
            raise ValueError(f"{path} is not valid JSON: {err}") from err
        conn.execute(
            "UPDATE consecutive_kicks_records SET sort_order = -rowid - 1 WHERE id = ?",
            (data.get("id"),),
        )


def apply_record(conn, path, kind, table, keys, values, overrides):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as err:
        raise ValueError(f"{path} is not valid JSON: {err}") from err
    if not isinstance(data, dict):
        raise ValueError(f"{path} must hold one record")
    missing = [column for column in keys if column not in data]
    if missing:
        raise ValueError(f"{path} does not name its record: missing {', '.join(missing)}")
    allowed = set(keys) | set(values) | {"removed"}
    unknown = sorted(set(data) - allowed)
    if unknown:
        raise ValueError(f"{path} carries fields a save may not set: {', '.join(unknown)}")

    where = " AND ".join(f"{column} = ?" for column in keys)
    key_values = [data[column] for column in keys]
    target = ":".join(str(v) for v in key_values)
    selected = ", ".join(values) if values else "1"
    base = conn.execute(f"SELECT {selected} FROM {table} WHERE {where}", key_values).fetchone()

    if data.get("removed") is True:
        if base is not None:
            overrides.append((f"{kind}:{target}", "removed", "present", "removed"))
            conn.execute(f"DELETE FROM {table} WHERE {where}", key_values)
        return

    absent = [column for column in values if column not in data]
    if absent:
        raise ValueError(f"{path} is missing {', '.join(absent)}")
    fixed = FIXED_COLUMNS.get(kind, {})
    if base is None:
        columns = list(keys) + list(values) + list(fixed)
        row = key_values + [data[c] for c in values] + list(fixed.values())
        marks = ", ".join("?" for _ in columns)
        try:
            conn.execute(f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({marks})", row)
        except sqlite3.IntegrityError as err:
            raise ValueError(f"{path} could not be applied: {err}. It names a record the "
                             f"committed inputs no longer produce.") from err
        overrides.append((f"{kind}:{target}", "added", None, "present"))
        return
    for column, base_value in zip(values, base):
        if base_value != data[column]:
            overrides.append((f"{kind}:{target}", column, base_value, data[column]))
    if values:
        columns = list(values) + [c for c in fixed if c != "created_at"]
        assignments = ", ".join(f"{column} = ?" for column in columns)
        row = [data[c] for c in values] + [fixed[c] for c in fixed if c != "created_at"]
        try:
            conn.execute(f"UPDATE {table} SET {assignments} WHERE {where}", row + key_values)
        except sqlite3.IntegrityError as err:
            raise ValueError(f"{path} could not be applied: {err}") from err


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(REPO_ROOT / "database" / "footbag.db"))
    ap.add_argument("--saves-dir", default=str(CURATOR_SAVES_DIR))
    ap.add_argument("--report", default=str(REPO_ROOT / "freestyle" / "reports" / "curator_save_overrides.csv"))
    args = ap.parse_args()
    saves_dir = Path(args.saves_dir)

    try:
        saves = read_trick_saves(saves_dir)
    except ValueError as err:
        print(f"ERROR: {err}", file=sys.stderr)
        return 1

    conn = open_freestyle_db(args.db, "29_apply_curator_saves.py")
    conn.execute("PRAGMA foreign_keys = ON")
    overrides: list[tuple[str, str, object, object]] = []
    applied = len(saves)
    try:
        with conn:
            # A saved record may name another saved record as its successor, in any
            # order, so the foreign keys are checked when the whole set commits.
            # The setting lasts only for an open transaction.
            conn.execute("BEGIN")
            conn.execute("PRAGMA defer_foreign_keys = ON")
            clear_saved_positions(conn, saves_dir)
            # Sources first, since a trick's saved source and every link may cite one.
            sources = RECORD_KINDS[0]
            for path in sorted((saves_dir / sources[0]).glob("*.json")):
                apply_record(conn, path, sources[0], sources[1], sources[2], sources[3], overrides)
                applied += 1
            apply_trick_saves(conn, saves, overrides)
            for kind, table, keys, values in RECORD_KINDS[1:]:
                for path in sorted((saves_dir / kind).glob("*.json")):
                    apply_record(conn, path, kind, table, keys, values, overrides)
                    applied += 1
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

    print(f"Curator saves applied: {applied} item(s), {len(overrides)} base value(s) overridden")
    for target, column, base_value, saved in overrides:
        print(f"  {target}.{column}: base {base_value!r} overridden by save {saved!r}")
    if overrides:
        print(f"Report: {report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

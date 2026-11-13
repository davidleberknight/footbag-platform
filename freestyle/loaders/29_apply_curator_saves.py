#!/usr/bin/env python3
"""
Apply what curators saved through the admin screens, after every other input.

Before go-live a curation screen on a developer machine writes one small JSON file
per saved item under freestyle/inputs/curator_saves/. Those files are committed,
so a rebuild reproduces the save. A trick's file names its target and only the
fields a curator overrode, with a null field marking a deliberate clear. Sources,
modifiers, aliases and links are saved as whole records, and removed: true marks one taken
away, since a rebuild would otherwise bring it back from a base input. A family is saved
whole too, with the trick family labels that fold into it, but only ever edited: a family
save naming a family the committed inputs do not produce stops the rebuild. A set is saved
whole and may be one the editor created, so a set save the inputs do not produce is added;
a related set naming no set stops the rebuild. Running last
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

RULING_SAVE_FIELDS = frozenset({
    "authored_notation", "notation_evidence_basis", "notation_derivation_method",
    "notation_convention_id", "notation_provenance_note", "ev_state", "hold_kind",
    "match_type", "final_disposition", "matched_existing_object", "published_trick_slug",
})

# A family save: every column the family editor writes, the two lists as JSON
# arrays, and the trick family labels that fold into the family.
FAMILY_SAVE_COLUMNS = (
    "display_name", "parent_slug", "tier", "sort_order", "hook", "description",
    "plain_language_reading", "importance", "shared_structure", "trick_page_note",
)
FAMILY_SAVE_LISTS = {"how_to_recognize": "how_to_recognize_json",
                     "related_family_slugs": "related_family_slugs_json"}
FAMILY_SAVE_FIELDS = frozenset({"slug", "folded_labels", *FAMILY_SAVE_COLUMNS, *FAMILY_SAVE_LISTS})

# A set save: every column the set editor writes, the related sets as a list of
# {"slug", "label"} objects and the held flag as a boolean.
SET_SAVE_COLUMNS = ("display_name", "set_group", "sort_order", "formula", "explanation")
SET_SAVE_FIELDS = frozenset({"slug", "related_sets", "held_from_list", *SET_SAVE_COLUMNS})

# (folder, table, key columns, value columns). Applied in this order after the
# tricks, because aliases and links reference sources and tricks by foreign key.
RECORD_KINDS = (
    ("sources", "freestyle_trick_sources", ("id",),
     ("source_type", "source_label", "source_url", "retrieved_at", "notes")),
    ("modifiers", "freestyle_trick_modifiers", ("slug",),
     ("modifier_name", "add_bonus", "add_bonus_rotational", "modifier_type", "notes",
      "beginner_note")),
    ("published_tricks", "freestyle_tricks", ("slug",),
     ("canonical_name", "adds", "base_trick", "trick_family", "category", "description",
      "operational_notation", "operational_notation_source", "notation_evidence_basis",
      "notation_derivation_method", "notation_convention_id", "sort_order")),
    ("aliases", "freestyle_trick_aliases", ("alias_slug",),
     ("alias_text", "trick_slug", "alias_type", "alias_display", "display_reason",
      "source_id", "provenance_note")),
    ("source_links", "freestyle_trick_source_links", ("trick_slug", "source_id"),
     ("external_url", "asserted_adds", "asserted_notation")),
    ("modifier_links", "freestyle_trick_modifier_links", ("trick_slug", "modifier_slug", "apply_order"),
     ()),
    ("records", "freestyle_records", ("id",),
     ("record_type", "person_id", "display_name", "trick_name", "sort_name", "adds_count",
      "value_numeric", "value_text", "achieved_date", "date_precision", "source", "confidence",
      "video_url", "video_timecode", "notes", "curator_review_note", "superseded_by")),
    ("consecutive_records", "consecutive_kicks_records", ("id",),
     ("sort_order", "section", "subsection", "discipline", "year", "rank", "player_1", "player_2",
      "score", "note", "event_date", "event_name", "location")),
)
# A curator's alias says so, the way the application's own save does. The creation
# time is this load's, as it is for every row a loader writes.
LOADED_AT = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
FIXED_COLUMNS = {
    "modifiers": {"loaded_at": LOADED_AT},
    "aliases": {"alias_origin_producer": "curator-application", "created_at": LOADED_AT},
    "published_tricks": {"aliases_json": "[]", "review_status": "curated", "is_active": 1, "is_core": 0,
                         "loaded_at": LOADED_AT, "trick_origin_producer": "curator-publication"},
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


def apply_family_saves(conn, saves_dir, overrides):
    """Apply family edits, each with the trick family labels that fold into it.

    A family is only ever edited, never created by a save: one naming a family the
    committed inputs do not produce is a decision for somebody, not something a
    rebuild may add. Only a real change bumps the row's version.
    """
    applied = 0
    for path in sorted((saves_dir / "families").glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except ValueError as err:
            raise ValueError(f"{path} is not valid JSON: {err}") from err
        if not isinstance(data, dict) or data.get("slug") != path.stem:
            raise ValueError(f"{path} must name its own family as slug")
        unknown = sorted(set(data) - FAMILY_SAVE_FIELDS)
        if unknown:
            raise ValueError(f"{path} carries fields a save may not set: {', '.join(unknown)}")
        absent = sorted(FAMILY_SAVE_FIELDS - set(data))
        if absent:
            raise ValueError(f"{path} is missing {', '.join(absent)}")
        slug = data["slug"]
        columns = list(FAMILY_SAVE_COLUMNS) + list(FAMILY_SAVE_LISTS.values())
        values = [data[c] for c in FAMILY_SAVE_COLUMNS] + [
            json.dumps(data[k], ensure_ascii=False, separators=(",", ":")) for k in FAMILY_SAVE_LISTS
        ]
        base = conn.execute(
            f"SELECT {', '.join(columns)} FROM freestyle_families WHERE slug = ?", (slug,)
        ).fetchone()
        if base is None:
            raise ValueError(
                f"the curator save for family {slug} names a family the committed inputs no "
                f"longer produce. Decide which is right: restore the family, or delete "
                f"families/{slug}.json from the saves folder."
            )
        base_labels = [row[0] for row in conn.execute(
            "SELECT label FROM freestyle_family_sublabels WHERE family_slug = ? ORDER BY label", (slug,)
        )]
        saved_labels = sorted(data["folded_labels"])
        changed = [c for c, b, v in zip(columns, base, values) if b != v]
        for column, base_value, saved in zip(columns, base, values):
            if base_value != saved:
                overrides.append((f"families:{slug}", column, base_value, saved))
        if base_labels != saved_labels:
            overrides.append((f"families:{slug}", "folded_labels", base_labels, saved_labels))
        if not changed and base_labels == saved_labels:
            continue
        try:
            if changed:
                assignments = ", ".join(f"{c} = ?" for c in columns)
                conn.execute(
                    f"UPDATE freestyle_families SET {assignments}, updated_at = ?, updated_by = ?, "
                    "version = version + 1 WHERE slug = ?",
                    values + [LOADED_AT, "curator-save", slug],
                )
            if base_labels != saved_labels:
                conn.execute("DELETE FROM freestyle_family_sublabels WHERE family_slug = ?", (slug,))
                for label in saved_labels:
                    conn.execute(
                        "INSERT INTO freestyle_family_sublabels "
                        "(label, family_slug, created_at, created_by, updated_at, updated_by, version) "
                        "VALUES (?, ?, ?, ?, ?, ?, 1)",
                        (label, slug, LOADED_AT, "curator-save", LOADED_AT, "curator-save"),
                    )
        except sqlite3.IntegrityError as err:
            raise ValueError(f"{path} could not be applied: {err}") from err
        applied += 1
    return applied


def apply_set_saves(conn, saves_dir, overrides):
    """Apply set creations and edits.

    A set save is the whole set as the curator left it. A set the committed inputs
    do not produce is one the editor created, so it is inserted; any other is
    updated, and only a real change bumps the row's version. Once every set save
    is in, each related set must name a set, or the rebuild stops: a set page
    would otherwise link to a page that does not exist.
    """
    applied = 0
    for path in sorted((saves_dir / "sets").glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except ValueError as err:
            raise ValueError(f"{path} is not valid JSON: {err}") from err
        if not isinstance(data, dict) or data.get("slug") != path.stem:
            raise ValueError(f"{path} must name its own set as slug")
        unknown = sorted(set(data) - SET_SAVE_FIELDS)
        if unknown:
            raise ValueError(f"{path} carries fields a save may not set: {', '.join(unknown)}")
        absent = sorted(SET_SAVE_FIELDS - set(data))
        if absent:
            raise ValueError(f"{path} is missing {', '.join(absent)}")
        related = data["related_sets"]
        if not isinstance(related, list) or not all(
            isinstance(r, dict) and set(r) == {"slug", "label"}
            and isinstance(r["slug"], str) and isinstance(r["label"], str)
            for r in related
        ):
            raise ValueError(f"{path} must list each related set as a slug and a label")
        if not isinstance(data["held_from_list"], bool):
            raise ValueError(f"{path} must give held_from_list as true or false")
        slug = data["slug"]
        columns = list(SET_SAVE_COLUMNS) + ["related_sets_json", "held_from_list"]
        values = [data[c] for c in SET_SAVE_COLUMNS] + [
            json.dumps(related, ensure_ascii=False, separators=(",", ":")),
            1 if data["held_from_list"] else 0,
        ]
        base = conn.execute(
            f"SELECT {', '.join(columns)} FROM freestyle_sets WHERE slug = ?", (slug,)
        ).fetchone()
        try:
            if base is None:
                conn.execute(
                    f"INSERT INTO freestyle_sets (slug, {', '.join(columns)}, created_at, created_by, "
                    f"updated_at, updated_by, version) VALUES (?, {', '.join('?' for _ in columns)}, "
                    "?, ?, ?, ?, 1)",
                    [slug, *values, LOADED_AT, "curator-save", LOADED_AT, "curator-save"],
                )
                overrides.append((f"sets:{slug}", "added", None, "present"))
            else:
                changed = False
                for column, base_value, saved in zip(columns, base, values):
                    if base_value != saved:
                        overrides.append((f"sets:{slug}", column, base_value, saved))
                        changed = True
                if not changed:
                    continue
                assignments = ", ".join(f"{c} = ?" for c in columns)
                conn.execute(
                    f"UPDATE freestyle_sets SET {assignments}, updated_at = ?, updated_by = ?, "
                    "version = version + 1 WHERE slug = ?",
                    values + [LOADED_AT, "curator-save", slug],
                )
        except sqlite3.IntegrityError as err:
            raise ValueError(f"{path} could not be applied: {err}") from err
        applied += 1

    known = {row[0] for row in conn.execute("SELECT slug FROM freestyle_sets")}
    for slug, related_json in conn.execute("SELECT slug, related_sets_json FROM freestyle_sets ORDER BY slug"):
        for r in json.loads(related_json):
            if r["slug"] not in known:
                raise ValueError(
                    f"set {slug} names {r['slug']} as a related set, and no set has that slug. "
                    f"Decide which is right: restore the set, or edit {slug}'s related sets."
                )
    return applied


def apply_ruling_saves(conn, saves_dir, overrides):
    """Apply notation authoring and publication to the rulings.

    Only a real change bumps the row's version, which tells the ruling loader the
    application has written to it, and a repeat of the same save changes nothing.
    A member's id is not committed, so the author reads as this neutral marker.
    """
    applied = 0
    for path in sorted((saves_dir / "rulings").glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except ValueError as err:
            raise ValueError(f"{path} is not valid JSON: {err}") from err
        candidate = data.get("candidate_id") if isinstance(data, dict) else None
        fields = data.get("fields") if isinstance(data, dict) else None
        if candidate != path.stem or not isinstance(fields, dict):
            raise ValueError(f"{path} must name its own ruling as candidate_id and carry a fields object")
        unknown = sorted(set(fields) - RULING_SAVE_FIELDS)
        if unknown:
            raise ValueError(f"{path} carries fields a save may not set: {', '.join(unknown)}")
        columns = sorted(fields)
        base = conn.execute(
            f"SELECT {', '.join(columns)} FROM freestyle_ev_adjudications WHERE candidate_id = ?",
            (candidate,),
        ).fetchone()
        if base is None:
            raise ValueError(f"{path} names a ruling the committed ledger no longer holds")
        changed = [c for c, b in zip(columns, base) if b != fields[c]]
        if not changed:
            continue
        for column, base_value in zip(columns, base):
            if base_value != fields[column]:
                overrides.append((f"rulings:{candidate}", column, base_value, fields[column]))
        assignments = ", ".join(f"{column} = ?" for column in columns)
        authoring = ", notation_authored_at = ?, notation_authored_by = ?" if "authored_notation" in fields else ""
        extra = [LOADED_AT, "curator-save"] if authoring else []
        try:
            conn.execute(
                f"UPDATE freestyle_ev_adjudications SET {assignments}{authoring}, "
                "updated_at = ?, updated_by = ?, version = version + 1 WHERE candidate_id = ?",
                [fields[c] for c in columns] + extra + [LOADED_AT, "curator-save", candidate],
            )
        except sqlite3.IntegrityError as err:
            raise ValueError(f"{path} could not be applied: {err}") from err
        applied += 1
    return applied


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
            # Sources and published tricks first, since everything after may cite
            # them, and a later edit to a published trick lands on top of it.
            for kind, table, keys, values in RECORD_KINDS[:2]:
                for path in sorted((saves_dir / kind).glob("*.json")):
                    apply_record(conn, path, kind, table, keys, values, overrides)
                    applied += 1
            # Families before the tricks, whose family override names a family.
            applied += apply_family_saves(conn, saves_dir, overrides)
            applied += apply_set_saves(conn, saves_dir, overrides)
            apply_trick_saves(conn, saves, overrides)
            for kind, table, keys, values in RECORD_KINDS[2:]:
                for path in sorted((saves_dir / kind).glob("*.json")):
                    apply_record(conn, path, kind, table, keys, values, overrides)
                    applied += 1
            applied += apply_ruling_saves(conn, saves_dir, overrides)
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

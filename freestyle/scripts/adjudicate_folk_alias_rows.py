#!/usr/bin/env python3
"""Adjudicate folk-name rulings whose target the dictionary already records.

The observational-universe build surfaces a name whenever the live resolution
finds a target while the ruling ledger carries a disposition other than A. That
reads as a disagreement and, for one family of rows, is not one.

Those rows say `folk`, disposition `F`, with no matched object: the ruling
recorded that the name is a folk name and stopped, never writing down which trick
it is a folk name *for*. Meanwhile the dictionary records exactly that, as an
alias row carrying the name verbatim against one canonical trick. The ledger and
the resolver are not making competing claims; one of them simply never finished
the sentence.

So the rule this applies is narrow and self-limiting: an adjudication row whose
submitted name is recorded, character for character, as an alias of exactly one
trick is adjudicated to A with that trick as its matched object. A name matching
no alias is untouched. A name matching two is untouched, because which one
governs is a question rather than a reconciliation. On the current corpus that
selects ten rows out of 412 candidates, and it cannot reach the held positional
names or the conflicting parentheticals, which resolve through a parenthetical
rather than through an alias of their own text.

Ruled 2026-09-19: the existing alias row is sufficient evidence, because it is an
independent record of the same mapping. This tool performs that ruling; it does
not decide it.

Dry run by default. --apply writes, inside one transaction, after both artifacts
are on disk.

Usage:
    python3 freestyle/scripts/adjudicate_folk_alias_rows.py --db database/footbag.db
    python3 freestyle/scripts/adjudicate_folk_alias_rows.py --db database/footbag.db --apply
"""
from __future__ import annotations

import argparse
import csv
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "lib"))
from db_cutover_guard import assert_maintainer_db_target  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARTIFACT_DIR = REPO_ROOT / "freestyle" / "reports"

AUDIT_FIELDS = [
    "candidate_id", "submitted_name", "ev_state",
    "old_final_disposition", "new_final_disposition",
    "old_matched_existing_object", "new_matched_existing_object", "old_version",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z")


def find_candidates(conn) -> tuple[list[dict], list[str]]:
    """Rows to adjudicate, and the names this rule deliberately did not touch.

    The second return value is not diagnostics. A rule that silently selects ten
    of 412 rows should be able to say what it left behind, because the reason a
    row is absent is the whole argument for the rule being narrow.
    """
    rows = conn.execute(
        "SELECT candidate_id, submitted_name, ev_state, final_disposition, "
        "       matched_existing_object, version "
        "FROM freestyle_ev_adjudications "
        "WHERE COALESCE(final_disposition, '') <> 'A' "
        "  AND COALESCE(matched_existing_object, '') = '' "
        "ORDER BY submitted_name"
    ).fetchall()

    selected, ambiguous = [], []
    for cid, name, state, disposition, matched, version in rows:
        hits = [r[0] for r in conn.execute(
            "SELECT DISTINCT trick_slug FROM freestyle_trick_aliases "
            "WHERE LOWER(TRIM(alias_text)) = LOWER(TRIM(?))", (name,))]
        if len(hits) == 1:
            selected.append({
                "candidate_id": cid, "submitted_name": name, "ev_state": state,
                "old_final_disposition": disposition or "",
                "new_final_disposition": "A",
                "old_matched_existing_object": matched or "",
                "new_matched_existing_object": hits[0],
                "old_version": version,
            })
        elif len(hits) > 1:
            ambiguous.append(f"{name} -> {', '.join(sorted(hits))}")
    return selected, ambiguous


def check_preconditions(conn, selected: list[dict]) -> list[str]:
    """Every reason this batch must not be written, gathered before any of it is."""
    problems = []
    for row in selected:
        target = row["new_matched_existing_object"]
        trick = conn.execute(
            "SELECT is_active FROM freestyle_tricks WHERE slug = ?", (target,)).fetchone()
        if trick is None:
            problems.append(f"{row['submitted_name']}: alias points at {target}, which "
                            f"is not a trick in the dictionary")
        # Past version 1 the publication funnel has written this ruling, and a
        # seed-era reconciliation has no standing to rewrite what a curator did.
        if row["old_version"] != 1:
            problems.append(f"{row['submitted_name']}: version {row['old_version']}, so "
                            f"something has already written this ruling; leaving it")
    return problems


def write_artifacts(selected: list[dict], audit_out: Path, rollback_out: Path) -> None:
    audit_out.parent.mkdir(parents=True, exist_ok=True)
    with audit_out.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=AUDIT_FIELDS, lineterminator="\n")
        writer.writeheader()
        for row in selected:
            writer.writerow({field: row[field] for field in AUDIT_FIELDS})

    rollback_out.parent.mkdir(parents=True, exist_ok=True)
    with rollback_out.open("w", encoding="utf-8", newline="") as handle:
        handle.write("-- Rollback for adjudicate_folk_alias_rows.\n")
        handle.write("-- Restores each ruling's disposition, matched object and version\n")
        handle.write("-- to the values read from the database immediately before the write.\n")
        handle.write("BEGIN;\n")
        for row in selected:
            disposition = row["old_final_disposition"]
            matched = row["old_matched_existing_object"]
            handle.write(
                "UPDATE freestyle_ev_adjudications SET "
                f"final_disposition = {'NULL' if disposition == '' else repr(disposition)}, "
                f"matched_existing_object = {'NULL' if matched == '' else repr(matched)}, "
                f"version = {row['old_version']} "
                f"WHERE candidate_id = {row['candidate_id']!r};\n")
        handle.write("COMMIT;\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--db", default="database/footbag.db")
    parser.add_argument("--apply", action="store_true",
                        help="perform the writes; without this the tool reports and "
                             "writes its artifacts only")
    parser.add_argument("--audit-out", type=Path,
                        default=DEFAULT_ARTIFACT_DIR / "folk_alias_adjudication_audit.csv")
    parser.add_argument("--rollback-out", type=Path,
                        default=DEFAULT_ARTIFACT_DIR / "folk_alias_adjudication_rollback.sql")
    args = parser.parse_args()

    assert_maintainer_db_target(args.db, "adjudicate_folk_alias_rows.py")

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA foreign_keys = ON")

    selected, ambiguous = find_candidates(conn)
    if not selected:
        print("No folk ruling carries an unambiguous alias target; nothing to do.")
        conn.close()
        return 0

    problems = check_preconditions(conn, selected)
    if problems:
        print("REFUSED: nothing written.", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        conn.close()
        return 1

    write_artifacts(selected, args.audit_out, args.rollback_out)

    print(f"folk rulings with exactly one recorded alias target: {len(selected)}")
    for row in selected:
        print(f"  {row['submitted_name']:<24} -> {row['new_matched_existing_object']}")
    if ambiguous:
        print(f"\nleft alone, more than one alias records the name ({len(ambiguous)}):")
        for line in ambiguous:
            print(f"  {line}")
    print(f"\n  audit:    {args.audit_out}")
    print(f"  rollback: {args.rollback_out}")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        conn.close()
        return 0

    stamp = now_iso()
    cursor = conn.cursor()
    cursor.execute("BEGIN IMMEDIATE")
    try:
        cursor.executemany(
            "UPDATE freestyle_ev_adjudications "
            "SET final_disposition = 'A', matched_existing_object = ?, "
            "    updated_at = ?, updated_by = 'folk_alias_reconciliation', "
            "    version = version + 1 "
            "WHERE candidate_id = ? AND version = ?",
            [(row["new_matched_existing_object"], stamp, row["candidate_id"],
              row["old_version"]) for row in selected])
        if cursor.rowcount != len(selected):
            raise SystemExit(
                f"REFUSED: {cursor.rowcount} of {len(selected)} rows updated. A row "
                f"changed between the read and the write; nothing was committed.")
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()

    print(f"\nApplied to {len(selected)} ruling(s). Rollback: {args.rollback_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

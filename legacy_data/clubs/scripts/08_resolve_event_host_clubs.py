#!/usr/bin/env python3
"""
08_resolve_event_host_clubs.py

Phase H step 3 — resolve `events.host_club_id` from canonical event rows.

Background: step 08 in `event_results/scripts/` inserts events with
`host_club_id = NULL` by design (clubs don't exist yet at that point in
the pipeline). The cross-track linkage is established later, once both
events and clubs are in the DB: scan `event_results/canonical_input/events.csv`
for the `host_club` text, normalize-match against `clubs.name`, and
UPDATE `events.host_club_id` accordingly. Federation hosts (NHSA, WFA)
and any host whose name has no matching live `clubs` row remain NULL.

Until 2026-05-18 this resolution lived in the dev-convenience
`legacy_data/scripts/load_clubs_seed.py:221-265`, which was removed
from production orchestration in commit 3cc3a97 (Phase H became the
sole creator of live clubs). The UPDATE logic was orphaned along with
the loader; this script restores it as a first-class Phase H step.

Reads:
  - `event_results/canonical_input/events.csv` (produced earlier in
    the pipeline by `pipeline/platform/export_canonical_platform.py`)
  - `clubs` table (created by Phase H step 06)

Writes:
  - `events.host_club_id` (UPDATE only; never INSERTs / DELETEs)

Idempotent: re-running produces no further changes after the first
successful application. All writes land in a single transaction.

Preflight failures exit non-zero with operator-actionable messages:
  - events.csv missing → name the producer script
  - clubs table empty  → name Phase H step 06

Usage (from legacy_data/ or repo root):
    python clubs/scripts/08_resolve_event_host_clubs.py [--db path/to/footbag.db] [--events-csv path/to/events.csv]
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts" / "lib"))
from db_cutover_guard import assert_maintainer_db_target  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _cutover_write_contract import (  # noqa: E402
    CutoverWrite, add_contract_args, report_artifacts, sql_literal,
)


SCRIPT_DIR = Path(__file__).resolve().parent
LEGACY_DATA_ROOT = SCRIPT_DIR.parent.parent  # legacy_data/
DEFAULT_EVENTS_CSV = LEGACY_DATA_ROOT / "event_results" / "canonical_input" / "events.csv"

AUDIT_FIELDS = [
    "action", "event_id", "host_club_text", "old_host_club_id",
    "new_host_club_id", "reason",
]


def make_snapshot(event_ids: set[str]):
    """The stamp columns of exactly the events this run would touch.

    Restricted to the planned ids rather than the whole table: an unrelated
    event edited elsewhere is not a reason to refuse a write that would not
    have touched it, and a check that refuses on movement it does not care
    about is one an operator learns to work around.
    """
    def snapshot(conn):
        return [row for row in conn.execute(
            "SELECT id, host_club_id, updated_at, updated_by FROM events ORDER BY id"
        ) if row[0] in event_ids]
    return snapshot


def rollback_statements(before: list[tuple]) -> list[str]:
    """Put each touched event's host club and stamp back as they were."""
    lines = []
    for event_id, host_club_id, updated_at, updated_by in before:
        lines.append(
            f"UPDATE events SET host_club_id = {sql_literal(host_club_id)}, "
            f"updated_at = {sql_literal(updated_at)}, "
            f"updated_by = {sql_literal(updated_by)} "
            f"WHERE id = {sql_literal(event_id)};")
    return lines


def now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def normalize_name(s: str) -> str:
    """NFKD + strip combining marks + lowercase + drop leading numeric
    prefix ('12. Foo' → 'foo') + collapse non-alphanumerics to single
    spaces. Same shape as the load_clubs_seed.py:227 logic so the lookup
    behavior is preserved across the move."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = re.sub(r"^\d+\.\s*", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1] if __doc__ else "")
    ap.add_argument(
        "--db",
        default=os.environ.get("FOOTBAG_DB_PATH", "database/footbag.db"),
    )
    ap.add_argument(
        "--events-csv",
        default=str(DEFAULT_EVENTS_CSV),
        help="canonical events.csv (default: legacy_data/event_results/canonical_input/events.csv)",
    )
    add_contract_args(ap, audit_default="event_host_clubs_audit.csv",
                      rollback_default="event_host_clubs_rollback.sql")
    args = ap.parse_args()

    # This step writes to events on the same workstation database as its three
    # Phase H siblings, and carried no target guard of its own: it was the one
    # writer here that would still have run against a restored post-cutover
    # snapshot.
    assert_maintainer_db_target(args.db, "08_resolve_event_host_clubs.py")

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        return 1

    events_csv = Path(args.events_csv)
    if not events_csv.exists():
        print(
            f"ERROR: events CSV not found at {events_csv}.",
            file=sys.stderr,
        )
        print(
            "       Produced earlier in the pipeline by "
            "pipeline/platform/export_canonical_platform.py. Re-run "
            "./run_pipeline.sh full (or the canonical-platform export step) "
            "before this script.",
            file=sys.stderr,
        )
        return 1

    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys = ON")

    # Preflight: clubs must exist. Phase H step 06 is the producer.
    clubs_count = con.execute("SELECT COUNT(*) FROM clubs").fetchone()[0]
    if clubs_count == 0:
        print(
            "ERROR: clubs table is empty; nothing to resolve host_club_id "
            "against.",
            file=sys.stderr,
        )
        print(
            "       Run Phase H step 06 first: "
            "python clubs/scripts/06_cutover_pre_populated_clubs.py "
            "(or ./run_pipeline.sh full).",
            file=sys.stderr,
        )
        con.close()
        return 1

    # Build normalized-name → club_id map. On duplicate normalized names,
    # WARN and use the first club_id when sorted alphabetically (deterministic
    # tie-break; the original load_clubs_seed.py path was non-deterministic
    # dict-overwrite). Real-data dupes are unexpected; this is a defensive
    # log path rather than a hard fail.
    name_to_club_ids: dict[str, list[str]] = {}
    for club_id, name in con.execute("SELECT id, name FROM clubs"):
        norm = normalize_name(name)
        if not norm:
            continue
        name_to_club_ids.setdefault(norm, []).append(club_id)
    name_to_club_id: dict[str, str] = {}
    duplicate_groups: list[tuple[str, list[str]]] = []
    for norm, ids in name_to_club_ids.items():
        if len(ids) > 1:
            sorted_ids = sorted(ids)
            duplicate_groups.append((norm, sorted_ids))
            name_to_club_id[norm] = sorted_ids[0]
        else:
            name_to_club_id[norm] = ids[0]
    if duplicate_groups:
        print(
            f"WARN: {len(duplicate_groups)} normalized club name(s) map to "
            f"multiple club_ids; using the alphabetically-first id deterministically.",
            file=sys.stderr,
        )
        for norm, ids in duplicate_groups[:5]:
            print(f"      '{norm}' → {ids[0]} (also: {', '.join(ids[1:])})", file=sys.stderr)
        if len(duplicate_groups) > 5:
            print(f"      ... and {len(duplicate_groups) - 5} more", file=sys.stderr)

    # Read canonical events.csv for host_club text.
    with events_csv.open("r", encoding="utf-8", newline="") as f:
        events_rows = list(csv.DictReader(f))

    ts = now_iso()
    host_unmatched: set[str] = set()
    no_host_text = 0
    not_in_events_table: set[str] = set()
    planned: list[tuple[str, str]] = []
    audit: list[dict] = []

    # The events table decides which rows exist; reading that here rather than
    # inferring it from an UPDATE's rowcount is what lets the plan be written
    # down before the transaction opens.
    current_hosts: dict[str, str | None] = {
        row[0]: row[1] for row in con.execute("SELECT id, host_club_id FROM events")
    }

    for row in events_rows:
        host = (row.get("host_club") or "").strip()
        if not host:
            no_host_text += 1
            continue
        club_id = name_to_club_id.get(normalize_name(host))
        if not club_id:
            host_unmatched.add(host)
            audit.append({
                "action": "skip", "event_id": row.get("event_key", ""),
                "host_club_text": host, "old_host_club_id": "",
                "new_host_club_id": "", "reason": "host name matches no live club",
            })
            continue
        event_key = row["event_key"]
        if event_key not in current_hosts:
            # event_key in canonical_input/events.csv but not in events table.
            # Should not happen on the normal pipeline path; report it.
            not_in_events_table.add(event_key)
            audit.append({
                "action": "skip", "event_id": event_key, "host_club_text": host,
                "old_host_club_id": "", "new_host_club_id": club_id,
                "reason": "event_key absent from the events table",
            })
            continue
        old = current_hosts[event_key]
        planned.append((event_key, club_id))
        audit.append({
            "action": "update" if old != club_id else "restamp",
            "event_id": event_key, "host_club_text": host,
            "old_host_club_id": old or "", "new_host_club_id": club_id,
            "reason": "" if old != club_id else "already resolved to this club",
        })

    planned_ids = {event_key for event_key, _ in planned}
    snapshot = make_snapshot(planned_ids)
    before = snapshot(con)

    contract = CutoverWrite("08_resolve_event_host_clubs.py", args,
                            audit_fields=AUDIT_FIELDS)
    contract.plan(
        con,
        snapshot=snapshot,
        audit_rows=audit,
        rollback_sql=rollback_statements(before),
        rollback_note=("Restores host_club_id and the update stamp on exactly the "
                       "events this run would touch. Events it does not touch are "
                       "absent from this file rather than reset."),
    )
    report_artifacts(contract, len(planned))

    def write(cur) -> None:
        cur.executemany(
            "UPDATE events SET host_club_id = ?, updated_at = ?, "
            "updated_by = 'phase_h_resolve' WHERE id = ?",
            [(club_id, ts, event_key) for event_key, club_id in planned],
        )

    written = contract.apply(con, write)
    host_matched = len(planned) if written else 0

    con.close()

    print(
        f"Resolved host_club_id on {host_matched} events "
        f"({len(planned)} planned); "
        f"{len(host_unmatched)} distinct host_club value(s) unmatched "
        f"(federation hosts + clubs absent from clubs table are expected to be NULL); "
        f"{no_host_text} event rows had no host_club text."
    )
    if not_in_events_table:
        print(
            f"WARN: {len(not_in_events_table)} canonical event_key(s) absent from "
            f"events table; sample: {list(sorted(not_in_events_table))[:5]}",
            file=sys.stderr,
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())

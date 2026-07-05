#!/usr/bin/env python3
"""Apply the reconciliation's proposed historical-person links.

Writes historical_persons.legacy_member_id from the Stage B proposed-link CSV --
each account-to-person link the reconciliation produced and the QC gate cleared.
Dry run by default: it validates, writes the audit CSV and the rollback SQL, and
stops; only --apply performs the writes, inside one transaction.

Safety:
  * refuses production / staging / /srv/footbag targets before opening the DB;
  * validates every precondition before any write -- each person and each legacy
    account exists, no proposal would overwrite an existing different link, no
    proposed account is already linked to a different person (which the partial
    unique index on historical_persons.legacy_member_id rejects anyway), and no
    person or account is proposed twice;
  * writes the audit CSV and the rollback SQL before opening the write
    transaction, so a completed apply is reversible;
  * touches only historical_persons.legacy_member_id -- never the members' claim
    columns (claimed_by_member_id / claimed_at), which live on legacy_members.

This is one of two guarded writes in the apply (the other is the member-row load
in load_legacy_export.py). They are separate processes and separate database
connections, so they are two transactions, each atomic on its own -- not one
transaction across both. Rollback is preserved by the pre-written rollback
artifacts and by running the member load first, so the account rows this write
references already exist.
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
from pathlib import Path

DEFAULT_PROPOSED_CSV = Path("legacy_data/member_data_scripts/out/stage_b_proposed_links.csv")
DEFAULT_AUDIT_CSV = Path("legacy_data/member_data_scripts/out/apply_links_audit.csv")
DEFAULT_ROLLBACK_SQL = Path("legacy_data/member_data_scripts/out/apply_links_rollback.sql")

AUDIT_FIELDS = [
    "historical_person_id", "person_name",
    "old_legacy_member_id", "new_legacy_member_id", "match_signal", "action",
]


def refuse_if_deployed_target(db_path: str) -> None:
    """Abort before opening the DB when the target looks like a deployed
    environment. Positive checks, no force flag -- the real link apply is a
    maintainer-machine cutover step and never runs against production or staging
    (mirrors the load_legacy_export.py guard)."""
    node_env = os.environ.get("NODE_ENV", "")
    footbag_env = os.environ.get("FOOTBAG_ENV", "")
    if (node_env == "production" or footbag_env in ("production", "staging")
            or os.path.abspath(db_path).startswith("/srv/footbag/")):
        print(
            "refusing to apply links: this writer is maintainer-machine only and "
            "never runs against production or staging. Guard tripped by "
            f"NODE_ENV={node_env!r} / FOOTBAG_ENV={footbag_env!r} / --db={db_path!r}.",
            file=sys.stderr,
        )
        sys.exit(1)


def _connect(db_path):
    """Open the database with foreign keys enforced, so a link to a legacy account
    that does not exist fails loudly rather than writing a dangling reference. The
    pragma must be set before any transaction."""
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def read_proposed_links(path: Path) -> list[dict[str, str]]:
    with Path(path).open(encoding="utf-8", newline="") as f:
        return [
            {
                "historical_person_id": (r.get("historical_person_id") or "").strip(),
                "legacy_member_id": (r.get("legacy_member_id") or "").strip(),
                "match_signal": (r.get("match_signal") or "").strip(),
            }
            for r in csv.DictReader(f)
        ]


def _current_links(conn) -> dict[str, str | None]:
    return {pid: lm for pid, lm in conn.execute(
        "SELECT person_id, legacy_member_id FROM historical_persons")}


def validate_preconditions(conn, links: list[dict[str, str]]) -> list[str]:
    """Return human-readable precondition failures; an empty list means the links
    are safe to apply. Reads only."""
    errs: list[str] = []
    hp_ids = {r[0] for r in conn.execute("SELECT person_id FROM historical_persons")}
    current = _current_links(conn)
    lm_ids = {r[0] for r in conn.execute("SELECT legacy_member_id FROM legacy_members")}
    acct_to_person = {lm: pid for pid, lm in current.items() if lm}

    seen_pid: set[str] = set()
    seen_lm: set[str] = set()
    for lk in links:
        pid, lm = lk["historical_person_id"], lk["legacy_member_id"]
        if not pid or not lm:
            errs.append(f"proposed link is missing a person or account id: {lk!r}")
            continue
        if pid not in hp_ids:
            errs.append(f"proposed person is not in historical_persons: {pid}")
        if lm not in lm_ids:
            errs.append(f"proposed legacy account is not in legacy_members: {lm}")
        existing = current.get(pid)
        if existing and existing != lm:
            errs.append(
                f"proposal would overwrite an existing link: person {pid} is "
                f"already linked to account {existing}, proposal names {lm}")
        other = acct_to_person.get(lm)
        if other and other != pid:
            errs.append(
                f"proposed account {lm} is already linked to a different person "
                f"({other}); the partial unique index would reject this")
        if pid in seen_pid:
            errs.append(f"person proposed more than once: {pid}")
        if lm in seen_lm:
            errs.append(f"legacy account proposed more than once: {lm}")
        seen_pid.add(pid)
        seen_lm.add(lm)
    return errs


def plan_changes(conn, links: list[dict[str, str]]):
    """Split proposals into the links that change a person's account
    (old is unlinked) and the no-ops (already linked to that account, e.g. the
    verified-id proposals). Reads only. Returns (changes, noops) where changes is
    [(person_id, old, new, signal)] and noops is [(person_id, value, signal)]."""
    current = _current_links(conn)
    changes = []
    noops = []
    for lk in links:
        pid, new, sig = lk["historical_person_id"], lk["legacy_member_id"], lk["match_signal"]
        old = current.get(pid)
        if old == new:
            noops.append((pid, new, sig))
        else:
            changes.append((pid, old, new, sig))
    return changes, noops


def _person_names(conn) -> dict[str, str]:
    return {pid: (nm or "") for pid, nm in conn.execute(
        "SELECT person_id, person_name FROM historical_persons")}


def write_audit_csv(changes, noops, names: dict[str, str], out_path: Path) -> int:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=AUDIT_FIELDS, lineterminator="\n")
        w.writeheader()
        for pid, old, new, sig in changes:
            w.writerow({
                "historical_person_id": pid, "person_name": names.get(pid, ""),
                "old_legacy_member_id": old or "", "new_legacy_member_id": new,
                "match_signal": sig, "action": "link",
            })
        for pid, val, sig in noops:
            w.writerow({
                "historical_person_id": pid, "person_name": names.get(pid, ""),
                "old_legacy_member_id": val, "new_legacy_member_id": val,
                "match_signal": sig, "action": "already_linked",
            })
    return len(changes) + len(noops)


def _sql_str(value) -> str:
    if value is None or value == "":
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def write_rollback_sql(changes, out_path: Path) -> int:
    """Emit the statement that reverts each changed link to its prior value.
    No-ops change nothing and get no rollback line."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as f:
        f.write("-- Rollback for apply_reconciled_links: restores each linked "
                "person's prior legacy_member_id.\n"
                "-- Apply this file BEFORE apply_members_rollback.sql: reverting "
                "the member load first\n-- would delete accounts these links "
                "still reference.\n")
        f.write("PRAGMA foreign_keys=ON;\n")
        f.write("BEGIN;\n")
        for pid, old, _new, _sig in changes:
            f.write(f"UPDATE historical_persons SET legacy_member_id = {_sql_str(old)} "
                    f"WHERE person_id = {_sql_str(pid)};\n")
        f.write("COMMIT;\n")
    return len(changes)


def apply_links(conn, changes) -> int:
    """Write the changed links in ONE transaction; a failure rolls back the whole
    batch so no partial links are left behind."""
    cur = conn.cursor()
    cur.execute("BEGIN")
    try:
        for pid, _old, new, _sig in changes:
            cur.execute(
                "UPDATE historical_persons SET legacy_member_id = ? WHERE person_id = ?",
                (new, pid))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return len(changes)


def main() -> None:
    ap = argparse.ArgumentParser(description="Apply the Stage B proposed historical-person links.")
    ap.add_argument("--proposed-links", type=Path, default=DEFAULT_PROPOSED_CSV,
                    help="Stage B proposed-link CSV to apply")
    ap.add_argument("--db", type=Path, default=os.environ.get("FOOTBAG_DB_PATH", "database/footbag.db"))
    ap.add_argument("--apply", action="store_true",
                    help="perform the writes; without this flag the writer is a dry run")
    ap.add_argument("--audit-out", type=Path, default=DEFAULT_AUDIT_CSV)
    ap.add_argument("--rollback-out", type=Path, default=DEFAULT_ROLLBACK_SQL)
    args = ap.parse_args()

    refuse_if_deployed_target(str(args.db))

    for p in (args.proposed_links, args.db):
        if not Path(p).exists():
            print(f"error: not found: {p}", file=sys.stderr)
            sys.exit(1)

    links = read_proposed_links(args.proposed_links)
    conn = _connect(args.db)
    try:
        errs = validate_preconditions(conn, links)
        if errs:
            print("refusing to apply links: precondition failures:", file=sys.stderr)
            for e in errs:
                print(f"  - {e}", file=sys.stderr)
            sys.exit(1)

        changes, noops = plan_changes(conn, links)
        names = _person_names(conn)
        # Audit + rollback are written BEFORE any database write, so a completed
        # apply is reversible.
        write_audit_csv(changes, noops, names, Path(args.audit_out))
        write_rollback_sql(changes, Path(args.rollback_out))

        mode = "APPLY" if args.apply else "DRY-RUN (no writes; pass --apply to link)"
        if args.apply:
            apply_links(conn, changes)
    finally:
        conn.close()

    print(f"apply_reconciled_links [{mode}]")
    print(f"  proposed links:        {len(links)}")
    print(f"  new links written:     {len(changes)}")
    print(f"  already linked (noop): {len(noops)}")
    print(f"  audit CSV:    {args.audit_out}")
    print(f"  rollback SQL: {args.rollback_out}")


if __name__ == "__main__":
    main()

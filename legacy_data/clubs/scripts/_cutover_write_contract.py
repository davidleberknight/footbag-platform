#!/usr/bin/env python3
"""The write contract the four club-cutover loaders share.

Phase H runs on the workstation database that already holds the member import
from the frozen legacy dump. That import is one-shot inside the freeze window, so
"rebuild and re-run" is not a recovery for a bad club load at that moment: the
audit CSV and the rollback file are what let one bad phase be undone without
redoing the member load. Hence the contract, which is the design requirement for
bulk loaders: dry run by default, an explicit flag to write, and both artifacts
on disk before anything is mutated.

The contract lives here rather than four times over, because four copies of a
safety rule drift and the copy that drifts is the one nobody reads again.

What a caller does, in order:

    contract = CutoverWrite(script, args, audit_fields=FIELDS)
    contract.plan(conn, snapshot=..., audit_rows=..., rollback_sql=...)
    contract.apply(conn, write)

`plan` reads the database as it stands, renders both artifacts from that exact
state, and remembers a digest of it. This is the part a convention cannot be
trusted with: a rollback file rendered from assumptions rather than from the rows
that are really there is worse than no rollback file, because it reads as safety
while restoring something else. So the rollback statements a caller passes are
built from rows it has just read, and the digest records what it read them from.

`apply` refuses to run at all unless `plan` has: the artifacts cannot be skipped
by forgetting them, only by deleting the call that writes them. It then opens the
write transaction with BEGIN IMMEDIATE, takes the lock before re-reading, and
compares the digest again. A database that moved between the render and the write
gets a refusal rather than a rollback file describing a state that no longer
exists.

None of this second-guesses the post-cutover and deployed-target refusals in
scripts/lib/db_cutover_guard.py, which run earlier and answer a different
question: whether this database may be written at all.
"""
from __future__ import annotations

import csv
import hashlib
import sys
from collections.abc import Callable, Iterable, Mapping, Sequence
from pathlib import Path

LEGACY_DATA_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_DIR = LEGACY_DATA_ROOT / "clubs" / "out"


def add_contract_args(parser, *, audit_default: str, rollback_default: str) -> None:
    """The three flags every loader under this contract carries.

    Dry run is the default rather than the flag, so a loader invoked by hand, by a
    new operator, or by a script nobody re-read writes nothing. The orchestrator
    opts in explicitly, which is the one place the decision to write is made.
    """
    parser.add_argument(
        "--apply", action="store_true",
        help="perform the writes; without this flag the loader plans, writes its "
             "audit and rollback artifacts, and stops")
    parser.add_argument(
        "--audit-out", type=Path, default=ARTIFACT_DIR / audit_default,
        help="where to write the audit CSV of what this run would change")
    parser.add_argument(
        "--rollback-out", type=Path, default=ARTIFACT_DIR / rollback_default,
        help="where to write the SQL that reverts this run")


def sql_literal(value) -> str:
    """A value as SQL text, quoted and escaped, or NULL."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    if text == "":
        return "''"
    return "'" + text.replace("'", "''") + "'"


def _digest(rows: Iterable[Sequence]) -> str:
    """A stable fingerprint of the rows the rollback was rendered from.

    Sorted, so a query without an ORDER BY cannot make an unchanged database look
    changed. Row shape is part of the text, so a column appearing or disappearing
    registers as movement rather than hashing to the same thing.
    """
    lines = sorted("\x1f".join("" if c is None else str(c) for c in row) for row in rows)
    return hashlib.sha256("\x1e".join(lines).encode("utf-8")).hexdigest()


class PreStateMoved(SystemExit):
    """The database changed between rendering the rollback and taking the lock."""


class CutoverWrite:
    def __init__(self, script_name: str, args, *, audit_fields: Sequence[str]) -> None:
        self.script = script_name
        self.applying = bool(getattr(args, "apply", False))
        self.audit_out = Path(args.audit_out)
        self.rollback_out = Path(args.rollback_out)
        self._audit_fields = list(audit_fields)
        self._snapshot: Callable | None = None
        self._pre_digest: str | None = None
        self._planned = False

    def plan(
        self,
        conn,
        *,
        snapshot: Callable[[object], Iterable[Sequence]],
        audit_rows: Sequence[Mapping[str, object]],
        rollback_sql: Sequence[str],
        rollback_note: str,
    ) -> int:
        """Render both artifacts from the state the database is in right now.

        `snapshot` returns the rows this loader is about to disturb. It is read
        here to fingerprint what the rollback describes, and read again under the
        write lock to prove it still describes it.
        """
        self._snapshot = snapshot
        self._pre_digest = _digest(snapshot(conn))

        self.audit_out.parent.mkdir(parents=True, exist_ok=True)
        with self.audit_out.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=self._audit_fields,
                                    lineterminator="\n")
            writer.writeheader()
            for row in audit_rows:
                writer.writerow({field: row.get(field, "") for field in self._audit_fields})

        self.rollback_out.parent.mkdir(parents=True, exist_ok=True)
        with self.rollback_out.open("w", encoding="utf-8", newline="") as handle:
            handle.write(f"-- Rollback for {self.script}.\n")
            handle.write(f"-- {rollback_note}\n")
            handle.write("-- Rendered from the database as it stood before the write, "
                         "not from what the loader intended to find.\n")
            handle.write("PRAGMA foreign_keys=ON;\n")
            handle.write("BEGIN;\n")
            for statement in rollback_sql:
                handle.write(statement.rstrip() + "\n")
            handle.write("COMMIT;\n")

        self._planned = True
        return len(audit_rows)

    def apply(self, conn, write: Callable[[object], None]) -> bool:
        """Perform the planned writes. Returns True when the database was changed.

        Refuses outright if the artifacts were never rendered: a loader that
        writes without them is the failure this contract exists to prevent, and
        the check is here rather than in four callers so that forgetting is not
        one of the available mistakes.
        """
        if not self._planned:
            raise RuntimeError(
                f"{self.script}: apply() before plan(). The audit CSV and rollback "
                "SQL are written by plan(), and nothing may be written to the "
                "database before they exist.")

        if not self.applying:
            print(f"\nDRY RUN — nothing written to the database.")
            print(f"  audit:    {self.audit_out}")
            print(f"  rollback: {self.rollback_out}")
            print(f"  Re-run with --apply to perform the writes.")
            return False

        assert self._snapshot is not None
        cur = conn.cursor()
        # IMMEDIATE, so the lock is held before the re-read: a check that runs
        # without the write lock can pass and be wrong by the time it matters.
        cur.execute("BEGIN IMMEDIATE")
        try:
            if _digest(self._snapshot(conn)) != self._pre_digest:
                raise PreStateMoved(
                    f"REFUSED: {self.script}: the rows this run planned against "
                    f"changed between writing {self.rollback_out} and taking the "
                    "write lock. The rollback file describes a state the database "
                    "is no longer in, so applying it would restore the wrong rows. "
                    "Re-run to plan against the current state.")
            write(cur)
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        print(f"\nApplied. Rollback for this run: {self.rollback_out}")
        return True


def report_artifacts(contract: CutoverWrite, planned: int) -> None:
    """One line each, so an operator reading the pipeline log can find them."""
    print(f"  planned changes:  {planned}")
    print(f"  audit CSV:        {contract.audit_out}")
    print(f"  rollback SQL:     {contract.rollback_out}", flush=True)
    sys.stdout.flush()

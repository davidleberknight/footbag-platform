"""
Script 28: Seed the Emerging Vocabulary adjudication table from the committed
ruling ledger.

Reads:
  freestyle/inputs/observational/EV_FORMULA_IDENTITY_ROWS.csv   (the ruling ledger)
  database/footbag.db
    freestyle_tricks                 (link targets; must already be loaded)

Writes: database/footbag.db
  freestyle_ev_adjudications         — DELETE + INSERT, one row per ruling

What this loader is for. The rulings that decide what each observational name IS
live in a committed CSV a content generator reads. When the rebuild pipeline
retires, that file stops being writable, so the rulings move into the database
first and are proved equivalent there before anything starts reading them from it.
This is that move. It changes no public surface: the generator still reads the CSV
until the authority switch is made deliberately.

Deterministic. Same ledger in, same rows out, in the same order, with the same
ids: candidate_id is derived from the normalized name rather than minted, and the
recorded position is the ledger's own row order. A rerun therefore reproduces the
table exactly, which is what lets the equivalence gate compare a rebuilt database
against the committed generated content. The audit stamps are the exception and
deliberately so: they record when the seed ran, which is what an audit stamp is.

Fail closed. Every refusal below aborts before writing rather than loading a
partial or lossy record:
  * a ledger that is missing, empty, or missing a column the ruling needs;
  * a ruling with an empty field the adjudication cannot be read without;
  * two rulings for one normalized name (the table holds one ruling per name);
  * a trick link naming a slug the dictionary does not have;
  * a post-load count that does not match the ledger.

The trick link. Nine rulings carry their trick row's slug inside free-text prose.
This loader turns that into the real foreign key, which is the whole point of the
column: the link is the durable statement that this ruling and that trick row are
about the same name. It carries no lifecycle claim. Whether the linked name is
still a candidate or is already published is read from the live trick row (held
out with is_active=0 versus live and reviewed), never from the prose that recorded
the link, which has gone stale on two of the nine.

Pipeline ordering: 17 (curated) → 19 (red additions) → 20 (source links) →
21 (footbag.org pending) → this script, because every link target is a trick row
one of those loaders creates.

Run from repo root:
  python freestyle/loaders/28_load_ev_adjudications.py
  python freestyle/loaders/28_load_ev_adjudications.py --db /path/to/footbag.db
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import os.path as _p
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR    = Path(__file__).parent
FREESTYLE_DIR = SCRIPT_DIR.parents[0]
REPO_ROOT     = SCRIPT_DIR.parents[1]

DEFAULT_DB     = REPO_ROOT / "database" / "footbag.db"
DEFAULT_LEDGER = FREESTYLE_DIR / "inputs" / "observational" / "EV_FORMULA_IDENTITY_ROWS.csv"

SEED_ACTOR = "ev-ledger-seed"

# The ledger's columns, and the table column each lands in (identical names: the
# migration renames nothing, so a reader of either can read the other).
LEDGER_COLUMNS = (
    "submitted_name", "normalized_name", "proposed_formula", "matched_existing_object",
    "match_type", "ev_state", "hold_kind", "failure_class", "final_disposition",
    "blocker_subtype", "residual_home", "confidence", "source", "note",
    "object_type", "evidence_state", "blocker_id", "owner",
)

# Without these an adjudication cannot be read at all: what the name is, what was
# decided, what evidence backs it, and who owns the next step.
REQUIRED_NONEMPTY = (
    "submitted_name", "normalized_name", "ev_state", "final_disposition",
    "evidence_state", "object_type", "owner",
)

# The trick row a ruling was recorded against, written into the note as prose
# because there was no column for it.
EXTERNAL_LINK_RE = re.compile(r"external-db-row slug=([a-z0-9_]+)")


def candidate_id_for(normalized_name: str) -> str:
    """A stable surrogate id for a ruling.

    Derived from the normalized name so a rebuild reproduces it, and stored so it
    survives a later correction to that name: the id is the ruling's identity, and
    a corrected spelling must not read as a different adjudication with no history.
    """
    digest = hashlib.sha256(normalized_name.encode("utf-8")).hexdigest()
    return f"ev-{digest[:16]}"


def read_ledger(path: Path) -> list[dict]:
    if not path.exists():
        raise SystemExit(
            f"ERROR: the ruling ledger is missing at {path}. It is committed under "
            f"freestyle/inputs/observational/; restore it before seeding."
        )
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames or []
        missing = [c for c in LEDGER_COLUMNS if c not in header]
        if missing:
            raise SystemExit(
                f"ERROR: the ruling ledger at {path} is missing the column(s) "
                f"{missing}. Seeding would silently drop them from the adjudication "
                f"record."
            )
        rows = [dict(r) for r in reader]

    if not rows:
        raise SystemExit(f"ERROR: the ruling ledger at {path} has no rows.")

    problems: list[str] = []
    seen: dict[str, int] = {}
    for i, r in enumerate(rows, start=1):
        for col in REQUIRED_NONEMPTY:
            if not (r.get(col) or "").strip():
                problems.append(f"  row {i} ({r.get('submitted_name', '?')}): {col} is empty")
        name = r.get("normalized_name") or ""
        if name in seen:
            problems.append(
                f"  row {i} ({r.get('submitted_name', '?')}): normalized name "
                f"'{name}' was already ruled on at row {seen[name]}"
            )
        else:
            seen[name] = i
    if problems:
        raise SystemExit(
            "ERROR: the ruling ledger cannot be seeded as it stands:\n"
            + "\n".join(problems[:20])
            + (f"\n  ... and {len(problems) - 20} more" if len(problems) > 20 else "")
        )
    return rows


def resolve_trick_links(conn: sqlite3.Connection, rows: list[dict]) -> dict[int, str]:
    """Ledger row index -> trick slug, for the rulings that name a trick row.

    A named slug the dictionary does not carry is a refusal, not a dropped link:
    it means either the dictionary loaders have not run against this database, or
    the ruling names a row that no longer exists, and silently seeding a NULL link
    would lose the relationship the migration exists to preserve.
    """
    links: dict[int, str] = {}
    for i, r in enumerate(rows):
        m = EXTERNAL_LINK_RE.search(r.get("note") or "")
        if m:
            links[i] = m.group(1)

    known = {s for (s,) in conn.execute("SELECT slug FROM freestyle_tricks")}
    unknown = sorted({slug for slug in links.values() if slug not in known})
    if unknown:
        raise SystemExit(
            "ERROR: these rulings name a trick row this database does not have:\n"
            + "\n".join(f"  {slug}" for slug in unknown)
            + "\nRun the dictionary loaders first (17, 19, 20, 21), which is the "
              "order freestyle/run_freestyle.sh uses."
        )
    return links


def seed(db_path: Path, ledger_path: Path) -> dict:
    rows = read_ledger(ledger_path)
    stamped_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    sys.path.insert(0, _p.join(_p.dirname(_p.abspath(__file__)), "..", "..", "scripts"))
    from _freestyle_db import open_freestyle_db  # noqa: E402

    conn = open_freestyle_db(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:
            links = resolve_trick_links(conn, rows)

            conn.execute("DELETE FROM freestyle_ev_adjudications")
            conn.executemany(
                """
                INSERT INTO freestyle_ev_adjudications
                  (candidate_id, sequence_no, created_at, created_by, updated_at,
                   updated_by, version,
                   submitted_name, normalized_name, ev_state, final_disposition,
                   evidence_state, object_type, blocker_id, blocker_subtype, hold_kind,
                   matched_existing_object, match_type, note, source, confidence, owner,
                   proposed_formula, failure_class, residual_home, published_trick_slug)
                VALUES (?, ?, ?, ?, ?, ?, 1,
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        candidate_id_for(r["normalized_name"]),
                        i + 1,
                        stamped_at, SEED_ACTOR, stamped_at, SEED_ACTOR,
                        r["submitted_name"], r["normalized_name"], r["ev_state"],
                        r["final_disposition"], r["evidence_state"], r["object_type"],
                        r["blocker_id"], r["blocker_subtype"], r["hold_kind"],
                        r["matched_existing_object"], r["match_type"], r["note"],
                        r["source"], r["confidence"], r["owner"],
                        r["proposed_formula"], r["failure_class"], r["residual_home"],
                        links.get(i),
                    )
                    for i, r in enumerate(rows)
                ],
            )

            loaded = conn.execute(
                "SELECT COUNT(*) FROM freestyle_ev_adjudications"
            ).fetchone()[0]
            linked = conn.execute(
                "SELECT COUNT(*) FROM freestyle_ev_adjudications "
                "WHERE published_trick_slug IS NOT NULL"
            ).fetchone()[0]
            if loaded != len(rows) or linked != len(links):
                raise SystemExit(
                    f"ERROR: the seed did not land whole: {loaded} of {len(rows)} "
                    f"rulings and {linked} of {len(links)} trick links. Nothing was "
                    f"written."
                )

            # Derived, never stored: a linked name that is live and reviewed is
            # published, and one still held out of the dictionary is a candidate.
            # The live trick row is what decides, which is why the prose marker
            # that has gone stale on two of these rulings no longer has a say.
            published, candidates = conn.execute(
                """
                SELECT SUM(CASE WHEN t.is_active = 1 THEN 1 ELSE 0 END),
                       SUM(CASE WHEN t.is_active = 0 THEN 1 ELSE 0 END)
                  FROM freestyle_ev_adjudications a
                  JOIN freestyle_tricks t ON t.slug = a.published_trick_slug
                """
            ).fetchone()
    finally:
        conn.close()

    return {
        "ledger_rows": len(rows),
        "loaded": loaded,
        "linked": linked,
        "linked_published": published or 0,
        "linked_candidates": candidates or 0,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed the Emerging Vocabulary adjudication table from the ruling ledger.",
    )
    parser.add_argument("--db", default=str(DEFAULT_DB))
    parser.add_argument("--ledger-csv", default=str(DEFAULT_LEDGER))
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        sys.exit(2)

    stats = seed(db_path, Path(args.ledger_csv))

    print("Emerging Vocabulary adjudications seeded.")
    print(f"  rulings in the ledger          : {stats['ledger_rows']}")
    print(f"  rulings loaded                 : {stats['loaded']}")
    print(f"  linked to a trick row          : {stats['linked']}")
    print(f"    of those, already published  : {stats['linked_published']}")
    print(f"    of those, still candidates   : {stats['linked_candidates']}")


if __name__ == "__main__":
    main()

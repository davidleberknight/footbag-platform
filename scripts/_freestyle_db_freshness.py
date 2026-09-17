"""
Is the built database current with the committed curator inputs?

WHY THIS EXISTS.

Two kinds of script read the freestyle tables and then commit what they derive:
the symbolic-grammar builder and the observational-universe builder. Both are
manual dev-time steps, run against whatever the developer's database happens to
hold, and neither had any way to tell a current database from a stale one.

A stale one is not obviously wrong. It is fully populated, every query succeeds,
and the artifact that comes out looks exactly like the artifact that should have.
It is simply derived from a dictionary the committed inputs no longer describe,
and once it is committed the repository carries a published artifact that does
not match its own source data. That is a failure nothing downstream can attribute:
the artifact-currency test reports a diff between the committed file and a fresh
regeneration, which reads as "regenerate and commit" when the real answer is
"your database is behind, and regenerating from it commits the wrong thing
again".

The curator ledger is what makes the question cheap to answer. It is a list of
field-level rulings against named tricks, applied near the end of the dictionary
rebuild, so a database that does not carry them is a database that has not
finished being built. Comparing the two is a few thousand indexed lookups and
needs no rebuild to decide.

WHAT THIS IS NOT.

It is not a full equivalence check between the inputs and the database. A
database can disagree with the inputs in ways no correction covers, and this will
not see those. What it catches is the drift that actually happens: a later step
writing a column the ledger owns, and a partial rebuild that ran an earlier
loader without running the corrections again. Both leave the ledger unapplied,
which is what this reads.
"""
import csv
import re
import sqlite3
from collections import OrderedDict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CORRECTIONS_CSV = (
    REPO_ROOT / "freestyle" / "inputs" / "curated" / "tricks" / "red_corrections_2026_04_20.csv"
)

# A new_value of \N clears the column to SQL NULL. The loader's rule; restated
# here only because the comparison has to know what the row asked for.
NULL_CLEAR_SENTINEL = "\\N"

# Slug-valued relationship columns, which the loader normalises on write. A
# comparison against the ledger's raw text would report drift that is not there.
SLUG_VALUED_FIELDS = frozenset({"trick_family", "base_trick"})

# The orchestrator that brings a database up to date, named in every refusal.
REBUILD_COMMAND = "freestyle/run_freestyle.sh"


def trick_name_to_slug(name: str) -> str:
    """The loader's own normalisation, which the whole column is written with."""
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def last_wins_corrections(csv_path: Path = CORRECTIONS_CSV):
    """Every (slug, field) the ledger rules on, carrying the value that survives.

    The ledger is applied in file order, so a later row for the same trick and
    column supersedes an earlier one. A blank new_value means "no correction"
    and is skipped, which is the loader's behaviour and not a choice made here.
    """
    rulings: "OrderedDict[tuple[str, str], str]" = OrderedDict()
    with csv_path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            slug = trick_name_to_slug((row.get("slug") or "").strip())
            field = (row.get("field") or "").strip()
            new_value = (row.get("new_value") or "").strip() or None
            if not slug or not field or new_value is None:
                continue
            rulings[(slug, field)] = new_value
    return rulings


def corrections_not_in_effect(db_path, csv_path: Path = CORRECTIONS_CSV):
    """Rulings the database does not carry, as (slug, field, expected, actual).

    A ruling naming a trick the database does not hold is not drift: nothing
    could have applied it, and whether that trick should exist is a curator
    question. Those are reported by the ledger-hygiene test rather than here.
    """
    rulings = last_wins_corrections(csv_path)
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        columns = {r[1] for r in conn.execute("PRAGMA table_info(freestyle_tricks)")}
        present = {r[0] for r in conn.execute("SELECT slug FROM freestyle_tricks")}
        drift = []
        for (slug, field), declared in rulings.items():
            if slug not in present or field not in columns:
                continue
            actual = conn.execute(
                f'SELECT "{field}" FROM freestyle_tricks WHERE slug = ?', (slug,)
            ).fetchone()[0]
            if declared == NULL_CLEAR_SENTINEL:
                if actual is not None:
                    drift.append((slug, field, "NULL", actual))
                continue
            expected = (
                trick_name_to_slug(declared) if field in SLUG_VALUED_FIELDS else declared
            )
            if ("" if actual is None else str(actual)) != expected:
                drift.append((slug, field, expected, actual))
        return drift
    finally:
        conn.close()


def assert_db_current(db_path, what: str) -> None:
    """Refuse to derive `what` from a database the committed inputs no longer describe.

    Raises SystemExit with a message naming the condition, the artifact that
    would have been wrong, and the command that fixes it. A builder that carried
    on here would write a plausible artifact from stale data, which is worse than
    not running: the output is committed and then believed.
    """
    drift = corrections_not_in_effect(db_path)
    if not drift:
        return

    shown = "\n".join(
        f"      {slug}.{field}: ledger says {expected!r}, database holds {actual!r}"
        for slug, field, expected, actual in drift[:10]
    )
    more = f"\n      ... and {len(drift) - 10} more" if len(drift) > 10 else ""
    raise SystemExit(
        f"REFUSED: {db_path} does not carry {len(drift)} curator ruling(s), so it is\n"
        f"    behind the committed inputs and {what} derived from it would be wrong.\n"
        f"{shown}{more}\n\n"
        f"    The rulings live in the curator ledger and are applied near the end of the\n"
        f"    dictionary rebuild, so a database missing them is one whose rebuild did not\n"
        f"    finish or was re-run in part. Bring it up to date first:\n"
        f"      bash {REBUILD_COMMAND}\n\n"
        f"    Do not edit the ledger to match the database. It is the source, and in the\n"
        f"    case this guard was written for it was already right."
    )

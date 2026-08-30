"""
The complete map of which committed producer should own which trick slug.

A refresh used to clear the trick table and rebuild it. That cannot work once a
row can outlive its inputs: a curator's trick is in no committed file, and each
committed producer's file accounts for only part of the dictionary. What replaces
it is preflight, then upsert, then retire, and all three read from one map built
here before anything is written.

One map, not three. If each producer computed its own retirement set from its own
file, every row another producer created would look stale to it, and the only
thing standing between that and a mass deletion would be the three sets happening
to agree. They are computed together instead, in the order the producers run,
first writer winning, which is the same rule that decides ownership at insert.

The map covers the producers whose authoritative input is a committed file. The
footbag.org intake is not one of them: it inserts the names that resolve to
nothing already in the dictionary, so what it should own is a function of the
dictionary rather than of a file, and it is knowable only after the file-backed
producers have applied. Retirement completes the map from the rows that intake
already owns, which is why it runs last and why nothing it created is ever
mistaken for stale.
"""
from __future__ import annotations

import csv
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _freestyle_ownership import (  # noqa: E402
    BASE_DICTIONARY,
    COMMITTED_PRODUCERS,
    EXPERT_ADDITIONS,
    FOOTBAG_ORG_PENDING,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
INPUTS = REPO_ROOT / "freestyle" / "inputs"
BASE_CSV = INPUTS / "base_dictionary" / "tricks.csv"
ADDITIONS_CSV = INPUTS / "curated" / "tricks" / "red_additions_2026_04_20.csv"

#: The producers whose desired rows come from a committed file, in the order the
#: rebuild runs them. First writer wins, so a slug both files carry belongs to
#: the base dictionary and the overlay only enriches it.
FILE_BACKED_PRODUCERS = (BASE_DICTIONARY, EXPERT_ADDITIONS)


class DesiredMapError(RuntimeError):
    """The committed inputs cannot describe a coherent dictionary."""


class OwnershipSchemaError(RuntimeError):
    """The database has no ownership column, so no stage of a refresh can run."""


def assert_ownership_model_present(conn) -> None:
    """Refuse a database that cannot say who owns a trick row.

    Every function below reads trick_origin_producer, and so does every loader in
    the refresh. A database predating the column cannot be refreshed at all, and
    the useful moment to say so is before the first query rather than inside the
    fourth: SQLite reports which column is missing but not which stage wanted it
    or what an operator should do next, and a caller that lets that surface raw
    turns a known precondition into a stack trace.
    """
    columns = {row[1] for row in conn.execute("PRAGMA table_info(freestyle_tricks)")}
    if not columns:
        raise OwnershipSchemaError(
            "there is no freestyle_tricks table at all")
    if "trick_origin_producer" not in columns:
        raise OwnershipSchemaError(
            "freestyle_tricks has no trick_origin_producer column")


def trick_name_to_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def _read(path: Path, name_field: str) -> list[tuple[str, str]]:
    with path.open(encoding="utf-8") as fh:
        return [(trick_name_to_slug(r[name_field]), r[name_field])
                for r in csv.DictReader(fh) if trick_name_to_slug(r[name_field])]


def build_file_backed_map() -> dict[str, str]:
    """Slug to owning producer, for every row a committed file asks for.

    Raises before any caller can write if the inputs contradict themselves: two
    names in one file that fold to the same slug describe one row twice and there
    is no way to say which the dictionary should hold.
    """
    desired: dict[str, str] = {}
    for producer, path, field in (
        (BASE_DICTIONARY, BASE_CSV, "trick_canon"),
        (EXPERT_ADDITIONS, ADDITIONS_CSV, "canonical_name"),
    ):
        seen: dict[str, str] = {}
        for slug, name in _read(path, field):
            if slug in seen and seen[slug] != name:
                raise DesiredMapError(
                    f"{path.name} names both \"{seen[slug]}\" and \"{name}\", which "
                    f"fold to the same slug \"{slug}\"; the inputs cannot say which "
                    f"row the dictionary should hold."
                )
            seen[slug] = name
            desired.setdefault(slug, producer)
    return desired


def complete_map(conn) -> dict[str, str]:
    """The file-backed map plus what the footbag.org intake already owns.

    The intake's rows are its own by construction: it inserts only names that
    resolve to nothing already in the dictionary, so a row it owns is one no
    curated file accounted for at the time. Reading them back is what makes the
    map complete without duplicating the intake's resolver, and it is why a row
    it created is never mistaken for stale by another producer's retirement.
    """
    desired = build_file_backed_map()
    for (slug,) in conn.execute(
        "SELECT slug FROM freestyle_tricks WHERE trick_origin_producer = ?",
        (FOOTBAG_ORG_PENDING,),
    ):
        desired.setdefault(slug, FOOTBAG_ORG_PENDING)
    return desired


def collisions(conn, desired: dict[str, str]) -> list[tuple[str, str | None, str]]:
    """Desired slugs the committed inputs are not entitled to claim.

    A slug a curator owns, and a slug nobody has classified. Neither may be taken
    by a refresh: the first is somebody's work and the second is a row whose
    origin was never established, and reading either as committed would be the
    refresh deciding something it has no standing to decide.

    Returns (slug, current owner, producer that wanted it), current owner None for
    an unclassified row.
    """
    found: list[tuple[str, str | None, str]] = []
    for slug, producer in sorted(desired.items()):
        row = conn.execute(
            "SELECT trick_origin_producer FROM freestyle_tricks WHERE slug = ?", (slug,)
        ).fetchone()
        if row is None:
            continue
        current = row[0]
        if current is None or current not in COMMITTED_PRODUCERS:
            found.append((slug, current, producer))
    return found


def transfers(conn, desired: dict[str, str]) -> list[tuple[str, str, str]]:
    """Rows whose committed owner has moved, as (slug, from, to).

    An input can legitimately hand a row over. The row keeps its slug and every
    reference to it; only the stamp moves. Rows the overlay merely rewrites are
    not here, because the map still assigns them to the base dictionary.
    """
    moves: list[tuple[str, str, str]] = []
    for slug, wanted in sorted(desired.items()):
        row = conn.execute(
            "SELECT trick_origin_producer FROM freestyle_tricks WHERE slug = ?", (slug,)
        ).fetchone()
        if row is None or row[0] is None:
            continue
        if row[0] in COMMITTED_PRODUCERS and row[0] != wanted:
            moves.append((slug, row[0], wanted))
    return moves


def stale(conn, desired: dict[str, str]) -> list[tuple[str, str]]:
    """Committed rows no committed input asks for any more, as (slug, owner).

    Scoped to rows a committed producer owns. A curator's row and an unclassified
    row are absent from the map too, and neither is stale: the map describes what
    the committed inputs want, not everything the dictionary is allowed to hold.
    """
    out: list[tuple[str, str]] = []
    for slug, producer in conn.execute(
        "SELECT slug, trick_origin_producer FROM freestyle_tricks "
        " WHERE trick_origin_producer IN (?, ?, ?)",
        tuple(sorted(COMMITTED_PRODUCERS)),
    ):
        if slug not in desired:
            out.append((slug, producer))
    return sorted(out)

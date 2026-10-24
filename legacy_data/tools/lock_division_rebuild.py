"""
lock_division_rebuild.py

Shared mechanics for the per-event patches that rebuild whole divisions of the
frozen placements lock from an event's source text.

A rebuild names the divisions it replaces and how many rows each holds now, and
lists the rows that replace them. The rows of those divisions are removed and the
new rows written where the first removed row stood; every other line of the file
is copied through byte for byte. Nothing is written unless every check passes.

Identity is never decided here. A player row names its person id, and the id must
be a persons-truth record whose canon the row asserts; a row with no id is left
unresolved. A team row carries its members' names, which the export resolves
through the shared alias resolver as it does for every team.

A second run stops on the removed-row counts; checking out the lock file is the
rollback.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PBP = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"
PT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"


@dataclass(frozen=True)
class Player:
    place: int
    name: str
    person_id: str = ""


@dataclass(frozen=True)
class Team:
    place: int
    members: tuple[str, ...]


@dataclass(frozen=True)
class Division:
    name: str
    category: str
    coverage: str
    entries: tuple


def _emit(row: list[str]) -> str:
    buf = io.StringIO()
    csv.writer(buf, lineterminator="").writerow(row)
    return buf.getvalue()


def _canons() -> dict[str, str]:
    with open(PT, newline="", encoding="utf-8") as f:
        return {r["effective_person_id"]: r["person_canon"] for r in csv.DictReader(f)}


def build_rows(header: list[str], event_id: str, year: str, divisions: list[Division],
               canons: dict[str, str]) -> list[str]:
    """The replacement lines for the given divisions, checked against persons truth."""
    out = []
    for div in divisions:
        for e in div.entries:
            row = {h: "" for h in header}
            row.update(event_id=event_id, year=year, division_canon=div.name,
                       division_category=div.category, place=str(e.place),
                       coverage_flag=div.coverage)
            if isinstance(e, Team):
                row.update(competitor_type="team", person_canon="__NON_PERSON__",
                           team_display_name=" / ".join(e.members))
            else:
                if e.person_id:
                    if e.person_id not in canons:
                        raise AssertionError(f"{div.name} p{e.place}: {e.person_id} is not a persons-truth record")
                    if canons[e.person_id] != e.name:
                        raise AssertionError(f"{div.name} p{e.place}: {e.person_id} is "
                                             f"{canons[e.person_id]!r}, not {e.name!r}")
                row.update(competitor_type="player", person_id=e.person_id, person_canon=e.name,
                           person_unresolved="" if e.person_id else "1", norm=e.name.lower())
            out.append(_emit([row[h] for h in header]))
    return out


def rebuild(event_id: str, year: str, replaces: dict[str, int], divisions: list[Division]) -> None:
    """Replace the rows of `replaces` (division -> current row count) for one event."""
    raw = PBP.read_bytes().decode("utf-8")
    if "\r\n" in raw:
        raise AssertionError(f"{PBP.name}: expected LF line endings")
    lines = raw.split("\n")
    header = next(csv.reader([lines[0]]))
    hits: dict[str, list[int]] = {d: [] for d in replaces}
    for i, line in enumerate(lines[1:], 1):
        if not line.startswith(event_id + ","):
            continue
        r = dict(zip(header, next(csv.reader([line]))))
        if r["division_canon"] in hits:
            hits[r["division_canon"]].append(i)
    for div, expected in replaces.items():
        if len(hits[div]) != expected:
            raise AssertionError(f"{event_id} {div!r}: {len(hits[div])} rows, expected {expected} "
                                 "(already rebuilt?)")
    new = build_rows(header, event_id, year, divisions, _canons())
    taken = {next(csv.reader([ln]))[2] for ln in lines[1:] if ln.startswith(event_id + ",")}
    added = [d.name for d in divisions if d.name not in replaces and d.name in taken]
    if added:
        raise AssertionError(f"{event_id}: {added} already in the lock; name it in replaces")
    doomed = sorted(i for idx in hits.values() for i in idx)
    if doomed:
        first = doomed[0]
    else:
        # A division the lock lacks altogether goes after the event's last row.
        event_rows = [i for i, ln in enumerate(lines) if ln.startswith(event_id + ",")]
        if not event_rows:
            raise AssertionError(f"{event_id}: no rows in the lock to place the new division beside")
        first = event_rows[-1] + 1
    doomed_set = set(doomed)
    kept = [ln for i, ln in enumerate(lines) if i not in doomed_set]
    at = first - sum(1 for i in doomed if i < first)
    kept[at:at] = new
    PBP.write_text("\n".join(kept), encoding="utf-8")
    print(f"{PBP.name}: event {event_id}: {len(doomed)} rows in "
          f"{len(replaces)} division(s) replaced by {len(new)}")

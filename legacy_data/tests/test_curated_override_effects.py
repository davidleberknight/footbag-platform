"""
test_curated_override_effects.py
================================

Curated overrides are proved by their effect, not by being read.

A wired consumer proves a file is opened. It does not prove the directives
inside it took effect, and that gap is what let a correction file sit unapplied
while looking connected: the reader was there, the grep found it, and nothing
asserted that the data said what the file demanded.

So each test below takes one override file, reads the directives out of it, and
asserts the state those directives demand is the state the canonical data is in.
Expectations are derived from the override rows rather than written as counts,
so a directive added to any of these files extends the assertion instead of
silently sitting outside it.

**The artifact these read is the committed one**, under
`event_results/canonical_input/`, which a fresh clone has. The build tree under
`out/` is ignored, so a test reading it would pass on the machine that last ran
the pipeline and say nothing anywhere else. What is asserted here is therefore
the last published canonical state, which is the strongest claim available until
the canonical artifacts are regenerated against the current curated inputs.

One file per test on purpose: junk events and known-broken events both assert
absence, and a single combined test would let either file's coverage vanish
behind the other's.

Run from repo root:
    python -m pytest legacy_data/tests/test_curated_override_effects.py -v
"""
import csv
import json
from pathlib import Path

LEGACY = Path(__file__).resolve().parents[1]
OVERRIDES = LEGACY / "overrides"
CANONICAL = LEGACY / "event_results" / "canonical_input"


def _rows(path: Path) -> list[dict]:
    assert path.exists(), (
        f"{path} is missing. This is committed data that a fresh clone carries, so its "
        f"absence means the checkout is incomplete rather than that the test should skip."
    )
    with open(path, newline="", encoding="utf-8", errors="replace") as handle:
        return list(csv.DictReader(handle))


def _events() -> list[dict]:
    events = _rows(CANONICAL / "events.csv")
    assert events, "the committed canonical events file is empty, so nothing was checked"
    return events


def _legacy_ids(events: list[dict]) -> set[str]:
    return {(e.get("legacy_event_id") or "").strip() for e in events}


def test_coverage_flag_override_reaches_the_discipline_row():
    directives = _rows(OVERRIDES / "coverage_flag_overrides.csv")
    assert directives, "no coverage-flag directives, so this test checked nothing"

    disciplines = _rows(CANONICAL / "event_disciplines.csv")
    assert disciplines, "the committed discipline file is empty, so nothing was checked"
    by_pair = {(d["event_key"], d["discipline_key"]): d for d in disciplines}

    wrong = []
    for d in directives:
        row = by_pair.get((d["event_key"], d["discipline_key"]))
        if row is None:
            wrong.append(f"{d['event_key']}/{d['discipline_key']}: no such discipline row")
        elif (row.get("coverage_flag") or "").strip() != d["coverage_flag_override"].strip():
            wrong.append(
                f"{d['event_key']}/{d['discipline_key']}: want "
                f"{d['coverage_flag_override']!r}, canonical carries "
                f"{row.get('coverage_flag')!r}")
    assert not wrong, (
        f"{len(wrong)} coverage-flag override(s) did not reach the canonical data: "
        + "; ".join(wrong))


def test_event_location_overrides_reach_the_canonical_city():
    with open(OVERRIDES / "events_overrides.jsonl", encoding="utf-8") as handle:
        directives = [json.loads(line) for line in handle if line.strip()]
    assert directives, "no event overrides, so this test checked nothing"

    events = _events()
    by_legacy = {(e.get("legacy_event_id") or "").strip(): e for e in events}

    # Only the directives whose event survived into the canonical set can be
    # checked. Many name events that junk or known-broken removes on purpose, and
    # an absent event is not a failed override.
    checkable = [
        d for d in directives
        if d.get("event_id") in by_legacy and (d.get("location") or "").strip()
    ]
    assert checkable, (
        "no location directive names an event present in the canonical data, so this "
        "test checked nothing. Either the overrides or the canonical set moved.")

    wrong = []
    for d in checkable:
        event = by_legacy[d["event_id"]]
        city = (event.get("city") or "").strip().lower()
        want = (d["location"] or "").split(",")[0].strip().lower()
        # The directive carries a free-text location and the canonical row carries
        # a city, so one contains the other rather than matching exactly.
        if not city or (want not in city and city not in want):
            wrong.append(f"{d['event_id']}: directive {d['location']!r} against city "
                         f"{event.get('city')!r}")
    assert not wrong, (
        f"{len(wrong)} of {len(checkable)} location override(s) did not reach the "
        "canonical city: " + "; ".join(wrong))


def test_junk_events_are_absent_from_the_canonical_set():
    directives = _rows(OVERRIDES / "junk_events.csv")
    assert directives, "no junk directives, so this test checked nothing"

    present = _legacy_ids(_events())
    survivors = sorted(r["event_id"] for r in directives if r["event_id"].strip() in present)
    assert not survivors, (
        f"{len(survivors)} event(s) marked junk are still in the canonical set: {survivors}. "
        "A junked event is a placeholder or a narrative page rather than results, so its "
        "presence means the exclusion did not take effect.")


def test_known_broken_events_are_absent_from_the_canonical_set():
    # Deliberately separate from the junk test even though both assert absence.
    # The two files are different judgements, one that a page carries no results
    # and one that its results cannot be parsed correctly, and folding them into
    # one assertion would let either file lose its coverage unnoticed.
    directives = _rows(OVERRIDES / "known_broken_events.csv")
    assert directives, "no known-broken directives, so this test checked nothing"

    present = _legacy_ids(_events())
    survivors = sorted(r["event_id"] for r in directives if r["event_id"].strip() in present)
    assert not survivors, (
        f"{len(survivors)} event(s) marked known-broken are still in the canonical set: "
        f"{survivors}. Their source pages parse into results that are wrong rather than "
        "absent, so presence is worse than a gap.")


def test_person_merge_survivors_are_present():
    directives = _rows(OVERRIDES / "person_merges.csv")
    assert directives, "no person merges, so this test checked nothing"

    persons = _rows(CANONICAL / "persons.csv")
    assert persons, "the committed persons file is empty, so nothing was checked"
    ids = {p["person_id"] for p in persons}

    missing = sorted(r["survivor_person_id"] for r in directives
                     if r["survivor_person_id"] not in ids)
    assert not missing, (
        f"{len(missing)} merge survivor(s) are absent from the canonical persons: {missing}. "
        "A merge that retires a duplicate onto a survivor who is not there loses the person "
        "entirely.")


def test_merged_names_resolve_to_exactly_one_person():
    directives = _rows(OVERRIDES / "person_merges.csv")
    assert directives, "no person merges, so this test checked nothing"

    persons = _rows(CANONICAL / "persons.csv")
    by_name: dict[str, list[str]] = {}
    for p in persons:
        by_name.setdefault(p["person_name"], []).append(p["person_id"])

    # A retired name may be absent entirely, which is the shape a merge takes when
    # the builder stopped emitting the stub, or it may be the surviving row's own
    # name. What it may never be is two rows, which is the duplicate the merge exists
    # to remove.
    wrong = []
    for r in directives:
        name = r["retired_name"]
        ids = by_name.get(name, [])
        if len(ids) > 1:
            wrong.append(f"{name!r} is carried by {len(ids)} person rows")
        elif len(ids) == 1 and ids[0] != r["survivor_person_id"]:
            wrong.append(f"{name!r} resolves to {ids[0][:8]}, not to the survivor "
                         f"{r['survivor_person_id'][:8]}")
    assert not wrong, (
        f"{len(wrong)} merged name(s) did not consolidate onto their survivor: "
        + "; ".join(wrong))

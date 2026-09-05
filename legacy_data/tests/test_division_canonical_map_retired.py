"""The retired division-name map, and the division distinctions it would have erased.

`overrides/division_canonical_map.csv` proposed 59 rewrites of a competition
division's name onto a single "canonical" one: `advanced singles net` onto
`Open Singles Net`, `ultra doubles net` onto `Open Doubles Net`, `golf` onto
`Open Golf`. No script ever read it, and it was never edited after the commit
that created it.

It could not be wired, because its rewrites are unconditional. An event that ran
Open, Advanced and Ultra as three separate net divisions really did run three,
and the map sends two of them onto the third. The canonicalizer keeps the
division the source recorded, and the remediation stage promotes a division to
the Open name only where evidence for that event supports it, so the distinction
survives wherever it was real.

This pins the distinctions rather than the file: that the tiers still stand apart
at the events that ran them, and that the three truncated stems the map invented
are still not discipline names. Those are the claims that would have to stop
being true before retiring the map could have cost anything.
"""
from __future__ import annotations

import csv
import subprocess
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
_OVERRIDES = _ROOT / "legacy_data" / "overrides"
_DISCIPLINES = (_ROOT / "legacy_data" / "event_results" / "canonical_input"
                / "event_disciplines.csv")
_PARTICIPANTS = (_ROOT / "legacy_data" / "event_results" / "canonical_input"
                 / "event_result_participants.csv")

RETIRED = _OVERRIDES / "division_canonical_map.csv"

# Divisions the retired map sent onto another division, at events that ran both.
# Named individually, because each pair is a distinction a literal application
# would have destroyed. The tiers are the point: an event running Advanced and
# Ultra as separate net divisions really did run two, and the map sends both
# onto one.
COEXISTING = [
    ("1984_worlds_golden_wfa", "Advanced Singles Net", "Ultra Singles Net"),
    ("1984_worlds_golden_wfa", "Advanced Doubles Net", "Ultra Doubles Net"),
    ("1984_worlds_golden_wfa", "Women's Ultra Singles Net", "Women's Singles Net"),
    ("1982_worlds_oregon_city", "Singles Net", "Intermediate Singles Net"),
    ("1982_worlds_oregon_city", "Doubles Net", "Intermediate Doubles Net"),
    # The prefixed spelling is a real division here and carries competitors, so
    # this event is also the counterexample to any rule that would strip it.
    ("1984_worlds_golden_fbw", "Advanced Singles Net", "Open Singles Net"),
]

# Events whose pre-1985 merge left a second, empty copy of a competition under an
# `open_`-prefixed key, removed at source. Named because the same prefixed key on
# the FBW event below is a real division: the mixture is a property of which
# events were merged, not of the key.
MERGE_ARTEFACT_EVENTS = [
    "1982_worlds_oregon_city",
    "1983_worlds_boulder_wfa",
    "1983_worlds_boulder_nhsa",
    "1984_worlds_golden_wfa",
]

# The event that must keep its prefixed divisions, with a competitor proving why.
PROTECTED_EVENT = "1984_worlds_golden_fbw"

# Competitors whose placements must survive under the copy that kept them. One
# per affected event, taken from the division the empty copy shadowed.
SURVIVING_PLACEMENTS = [
    ("1982_worlds_oregon_city", "singles_net", "Kenny Shults"),
    ("1983_worlds_boulder_wfa", "singles_net", "Kenny Shults"),
    (PROTECTED_EVENT, "open_singles_net", "Bruce Guettich"),
]

# Targets the map proposed that name no division anywhere. Each is a family stem
# with the event's own qualifier cut off, so adopting one would have replaced a
# real division name with a fragment.
INVENTED_STEMS = [
    "Intermediate Singles Consecutive",
    "Open Doubles Distance",
    "Women's Doubles Distance",
]


def _disciplines() -> list[dict]:
    with _DISCIPLINES.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def test_the_retired_file_is_gone():
    assert not RETIRED.exists(), (
        "division_canonical_map.csv is back. Its rewrites are unconditional and "
        "would merge divisions that events ran separately; division naming is "
        "settled in the canonicalizer and, where evidence supports it, the "
        "remediation stage."
    )


def test_nothing_in_the_repository_reads_it():
    """The reason it could be retired without a migration: it was never wired.

    Searched across the executable tree rather than one directory, because a
    reader anywhere would make this a live input rather than a dead file.
    """
    hit = subprocess.run(
        ["grep", "-rl", "division_canonical_map",
         str(_ROOT / "legacy_data"), str(_ROOT / "scripts"), str(_ROOT / "src"),
         "--include=*.py", "--include=*.sh", "--include=*.ts"],
        capture_output=True, text=True,
    ).stdout.split()
    # This test names the file, so it finds itself and nothing else.
    others = [h for h in hit if Path(h).name != Path(__file__).name]
    assert not others, f"something now reads the retired override: {others}"


@pytest.mark.skipif(not _DISCIPLINES.exists(),
                    reason="the canonical discipline data is not present here")
@pytest.mark.parametrize("event_key, division, target", COEXISTING)
def test_the_divisions_the_map_would_have_merged_still_stand_apart(
    event_key, division, target,
):
    """Both names present at one event is what makes the merge destructive.

    If the pair ever collapses into one division, that is either a real change
    in the archive or a regression, and either way the reasoning that retired
    the map needs revisiting before anything relies on it again.
    """
    names = {d["discipline_name"] for d in _disciplines()
             if d["event_key"] == event_key}
    assert division in names, f"{event_key} no longer runs {division!r}"
    assert target in names, f"{event_key} no longer runs {target!r}"


@pytest.mark.skipif(not _DISCIPLINES.exists(),
                    reason="the canonical discipline data is not present here")
@pytest.mark.parametrize("event_key", MERGE_ARTEFACT_EVENTS)
def test_the_merge_leaves_no_second_empty_copy_of_a_competition(event_key):
    """One name per competition slot at the events the pre-1985 merge touched.

    The merge appended a loser discipline whenever its key was absent from the
    winner's set, comparing keys as exact strings, so a prefixed spelling and a
    bare one both survived and the results page showed a second, empty section
    for the same competition. The copy holding the competitors is the one that
    stays.
    """
    prefixed = sorted(d["discipline_key"] for d in _disciplines()
                      if d["event_key"] == event_key
                      and d["discipline_key"].startswith("open_"))
    assert not prefixed, (
        f"{event_key} carries {prefixed}, which the merge left as empty duplicate "
        "sections. Removing them is a source-side correction; if they are back, "
        "the correction stopped firing."
    )


@pytest.mark.skipif(not _DISCIPLINES.exists(),
                    reason="the canonical discipline data is not present here")
def test_the_event_whose_prefixed_divisions_are_real_keeps_them():
    """Why the correction above is a named list and never a rule about the key.

    This event spells real divisions with the prefix, and they carry
    competitors. A rule that stripped the prefix wherever it appeared would take
    this event's results with it.
    """
    prefixed = sorted(d["discipline_key"] for d in _disciplines()
                      if d["event_key"] == PROTECTED_EVENT
                      and d["discipline_key"].startswith("open_"))
    assert prefixed, (
        f"{PROTECTED_EVENT} has lost its prefixed divisions. They are real here "
        "and hold placements; a correction aimed at the empty duplicates "
        "elsewhere has over-reached."
    )


@pytest.mark.skipif(not _PARTICIPANTS.exists(),
                    reason="the canonical participant data is not present here")
@pytest.mark.parametrize("event_key, discipline_key, competitor", SURVIVING_PLACEMENTS)
def test_the_surviving_copy_still_carries_its_competitors(
    event_key, discipline_key, competitor,
):
    """Removing an empty duplicate must never cost a placement.

    The empty copy held result rows with nobody attached; every competitor sat
    under the copy that stays. If one of these disappears, the wrong copy was
    removed.
    """
    with _PARTICIPANTS.open(encoding="utf-8") as fh:
        names = {p["display_name"] for p in csv.DictReader(fh)
                 if p["event_key"] == event_key
                 and p["discipline_key"] == discipline_key}
    assert competitor in names, (
        f"{competitor!r} is no longer recorded in {event_key}/{discipline_key}"
    )


@pytest.mark.skipif(not _DISCIPLINES.exists(),
                    reason="the canonical discipline data is not present here")
@pytest.mark.parametrize("stem", INVENTED_STEMS)
def test_the_stems_the_map_proposed_are_not_division_names(stem):
    """The map's target had the qualifier cut off the real division name.

    A bare stem appearing would mean the archive had adopted the truncation, and
    the claim that these targets name nothing would no longer hold.
    """
    names = {d["discipline_name"] for d in _disciplines()}
    assert stem not in names, (
        f"{stem!r} is now a division name. The retired map proposed it as a "
        "target; if the archive has adopted it, that reasoning is stale."
    )
    fuller = sorted(n for n in names if n.startswith(stem) and n != stem)
    assert fuller, (
        f"nothing extends {stem!r} any more, so the map's target is no longer "
        "explainable as a truncation of a real division name"
    )

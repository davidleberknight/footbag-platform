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

RETIRED = _OVERRIDES / "division_canonical_map.csv"

# Divisions the retired map sent onto another division, at events that ran both.
# Named individually, because each pair is a distinction a literal application
# would have destroyed.
COEXISTING = [
    ("1984_worlds_golden_wfa", "Advanced Singles Net", "Open Singles Net"),
    ("1984_worlds_golden_wfa", "Ultra Singles Net", "Open Singles Net"),
    ("1984_worlds_golden_wfa", "Advanced Doubles Net", "Open Doubles Net"),
    ("1984_worlds_golden_wfa", "Ultra Doubles Net", "Open Doubles Net"),
    ("1984_worlds_golden_wfa", "Women's Ultra Singles Net", "Women's Singles Net"),
    ("1984_worlds_golden_wfa", "Golf", "Open Golf"),
    ("1982_worlds_oregon_city", "Singles Net", "Open Singles Net"),
    ("1982_worlds_oregon_city", "Doubles Net", "Open Doubles Net"),
    ("1982_worlds_oregon_city", "Golf", "Open Golf"),
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

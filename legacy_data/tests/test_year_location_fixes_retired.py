"""The retired per-year location override, and the locations it used to claim.

`overrides/year_location_fixes.csv` asserted that 1983 was Portland, Oregon and
1984 was Boulder, Colorado, each "confirmed by subject-matter expert". No script
ever read it, and both rows were mis-keyed by one year: Portland is the 1982
championship and Boulder is the 1983 pair, which the era's authoritative results
file corroborates by carrying separate 1983 NHSA and 1983 WFA sections.

Year-only addressing is what broke. It assumes one World Championships per year,
and from 1981 several federations ran their own in the same year, so a year names
no single event to locate. The event-keyed `location_overrides.csv` landed in the
same commit and is the mechanism that survived.

The expert's city claims are not lost by retiring the file: both are already what
the canonical data says. This pins that, so a future rebuild cannot quietly move
them, and pins that the file stays gone rather than returning as a second home
for locations the wired override already owns.
"""
from __future__ import annotations

import csv
import subprocess
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
_OVERRIDES = _ROOT / "legacy_data" / "overrides"
_EVENTS = _ROOT / "legacy_data" / "event_results" / "canonical_input" / "events.csv"

RETIRED = _OVERRIDES / "year_location_fixes.csv"
SUCCESSOR = _OVERRIDES / "location_overrides.csv"

# What the retired file claimed, and where those cities actually sit.
CLAIMED_CITIES = {"Portland": "1982", "Boulder": "1983"}


def _events() -> list[dict]:
    with _EVENTS.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def test_the_retired_file_is_gone():
    assert not RETIRED.exists(), (
        "year_location_fixes.csv is back. Its rows are mis-keyed by a year and "
        "year-only addressing cannot name one event once several federations ran "
        "championships in the same year; location corrections belong in the "
        "event-keyed override."
    )


def test_nothing_in_the_repository_reads_it():
    """The reason it could be retired without a migration: it was never wired.

    Searched across the executable tree rather than one directory, because a
    reader anywhere would make this a live input rather than a dead file.
    """
    hit = subprocess.run(
        ["grep", "-rl", "year_location_fixes",
         str(_ROOT / "legacy_data"), str(_ROOT / "scripts"), str(_ROOT / "src"),
         "--include=*.py", "--include=*.sh", "--include=*.ts"],
        capture_output=True, text=True,
    ).stdout.split()
    # This test names the file, so it finds itself and nothing else.
    others = [h for h in hit if Path(h).name != Path(__file__).name]
    assert not others, f"something now reads the retired override: {others}"


def test_the_event_keyed_successor_is_still_wired():
    # Retiring the old file is only safe because the mechanism it duplicated
    # survives. If this stops being read, location corrections have no home.
    assert SUCCESSOR.exists()
    readers = subprocess.run(
        ["grep", "-rl", "location_overrides", str(_ROOT / "legacy_data"),
         "--include=*.py"],
        capture_output=True, text=True,
    ).stdout.split()
    assert readers, "nothing reads location_overrides.csv any more"


def test_the_successor_is_keyed_on_the_event_not_the_year():
    # The whole reason one file replaced the other.
    with SUCCESSOR.open(encoding="utf-8") as fh:
        columns = csv.DictReader(fh).fieldnames or []
    assert "event_id" in columns
    assert "year" not in columns


def _era_worlds(events: list[dict]) -> list[dict]:
    """The World Championships of the era the retired file addressed.

    Scoped deliberately. Both cities host events across the whole archive — a US
    Open in Portland, a symposium in Boulder — so a claim about the archive
    entire would be false. The retired file spoke about championships in the
    early 1980s, and that is the population its claims are true of.
    """
    return [e for e in events
            if e["event_key"][:4].isdigit()
            and 1980 <= int(e["event_key"][:4]) <= 1985
            and "worlds" in e["event_key"]]


@pytest.mark.skipif(not _EVENTS.exists(),
                    reason="the canonical event data is not present here")
@pytest.mark.parametrize("city, year", sorted(CLAIMED_CITIES.items()))
def test_each_claimed_city_still_sits_where_the_archive_puts_it(city, year):
    """The expert's two city claims, asserted against the data that already
    carries them. Retiring the file loses nothing while these hold."""
    matching = [e for e in _era_worlds(_events()) if (e.get("city") or "").strip() == city]
    assert matching, f"no championship of this era is located in {city} any more"
    years = {e["event_key"][:4] for e in matching}
    assert years == {year}, (
        f"{city} now hosts championships in {sorted(years)}, not only {year}. The "
        "retired file's claim was mis-keyed by one year against exactly this "
        "placement, so a change here means that reading needs revisiting."
    )


@pytest.mark.skipif(not _EVENTS.exists(),
                    reason="the canonical event data is not present here")
def test_the_year_the_retired_file_named_holds_no_event_in_that_city():
    """The other half of the mis-keying, stated positively.

    Applying the file literally would have moved every 1983 event to Portland and
    every 1984 event to Boulder. Neither city belongs to either year.
    """
    events = _era_worlds(_events())
    for city, claimed_year in (("Portland", "1983"), ("Boulder", "1984")):
        wrong = [e["event_key"] for e in events
                 if e["event_key"].startswith(claimed_year)
                 and (e.get("city") or "").strip() == city]
        assert not wrong, f"{claimed_year} now has a {city} championship: {wrong}"


@pytest.mark.skipif(not _EVENTS.exists(),
                    reason="the canonical event data is not present here")
def test_the_events_the_file_would_have_overwritten_keep_their_locations():
    """Named individually, because these are the rows a literal application of
    the retired file would have corrupted."""
    by_key = {e["event_key"]: e for e in _events()}
    expected = {
        "1983_worlds_golden":       "Golden",
        "1983_worlds_boulder_nhsa": "Boulder",
        "1983_worlds_boulder_wfa":  "Boulder",
        "1983_worlds_oregon_city":  "Oregon City",
        "1984_worlds_golden_fbw":   "Golden",
        "1984_worlds_golden_wfa":   "Golden",
        "1984_worlds_oregon_city":  "Oregon City",
        "1982_worlds_portland":     "Portland",
    }
    for key, city in expected.items():
        assert key in by_key, f"{key} is no longer in the canonical events"
        assert (by_key[key].get("city") or "").strip() == city, (
            f"{key} moved to {by_key[key].get('city')!r}, expected {city!r}")

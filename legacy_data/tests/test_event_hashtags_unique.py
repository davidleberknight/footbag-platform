"""Every event's displayed hashtag is its own.

Event hashtags follow #event_{year}_{event_slug} and are meant to be globally
unique, because a member tags media by typing the hashtag the page shows. Two
events of one year and name produced one displayed hashtag, so media tagged with
it reached only the first; the second carried a hidden key nobody could type.

Run from repo root:
    python -m pytest legacy_data/tests/test_event_hashtags_unique.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_SCRIPT = (Path(__file__).resolve().parents[1] / "event_results" / "scripts"
           / "08_load_mvfp_seed_full_to_sqlite.py")
_spec = importlib.util.spec_from_file_location("mvfp_seed_loader_hashtags", _SCRIPT)
loader = importlib.util.module_from_spec(_spec)
sys.modules["mvfp_seed_loader_hashtags"] = loader
_spec.loader.exec_module(loader)


def _event(key: str, year: str, slug: str) -> dict:
    return {"event_key": key, "year": year, "event_slug": slug}


def test_two_events_sharing_a_name_get_distinct_hashtags():
    # Defect caught: media tagged for one event landing on its namesake.
    tags = loader.event_hashtags([
        _event("1982_worlds_portland", "1982", "world_footbag_championships"),
        _event("1982_worlds_golden", "1982", "1982_world_footbag_championships"),
    ], set())
    assert tags == {"1982_worlds_golden": "#event_1982_world_footbag_championships",
                    "1982_worlds_portland": "#event_1982_world_footbag_championships_2"}


def test_numbering_follows_the_event_keys_not_the_file_order():
    # Defect caught: a rebuild swapping two events' hashtags.
    rows = [_event("b_event", "2020", "basque_open"), _event("a_event", "2020", "basque_open")]
    assert loader.event_hashtags(rows, set()) == loader.event_hashtags(list(reversed(rows)), set())


def test_a_hashtag_already_stored_is_not_reused():
    # Defect caught: an event taking a hashtag another tag already holds.
    tags = loader.event_hashtags([_event("e", "2020", "basque_open")], {"#event_2020_basque_open"})
    assert tags == {"e": "#event_2020_basque_open_2"}


def test_a_distinct_event_keeps_its_plain_hashtag():
    assert loader.event_hashtags([_event("e", "2025", "beaver_open")], set()) == {
        "e": "#event_2025_beaver_open"}

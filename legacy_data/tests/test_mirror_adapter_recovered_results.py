"""
The mirror adapter's hand-recovered results overrides are curated input: a
missing file stops the build rather than silently dropping the corrections it
carries, and a present file loads every row it holds.

Run from repo root:
    python -m pytest legacy_data/tests/test_mirror_adapter_recovered_results.py -v
"""
import importlib.util
import json
import sys
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "pipeline" / "adapters" / "mirror_results_adapter.py"
_spec = importlib.util.spec_from_file_location("mirror_results_adapter", _SCRIPT)
adapter = importlib.util.module_from_spec(_spec)
sys.modules["mirror_results_adapter"] = adapter
_spec.loader.exec_module(adapter)


def test_a_missing_recovered_results_file_stops_the_build(tmp_path):
    missing = tmp_path / "overrides" / "recovered_results.jsonl"
    with pytest.raises(FileNotFoundError, match="Required override file missing"):
        adapter._load_recovered_results_overrides(missing)


def test_a_present_recovered_results_file_loads_every_row(tmp_path):
    path = tmp_path / "recovered_results.jsonl"
    rows = [{"event_id": "857879540", "results_block_raw_override": "1. A"},
            {"event_id": "1770923654", "results_block_raw_override": "1. B"}]
    path.write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
    assert adapter._load_recovered_results_overrides(path) == {
        "857879540": "1. A", "1770923654": "1. B"}


# A recovered event with a single winner: two lines, under the five-line minimum.
_SHORT_RESULTS = "Open Singles Net:\n1. Player One"
# A cancellation page: three lines of prose, no placement lines.
_CANCELLATION = "Cancelled due to weather.\nSee you next year.\nThanks all."


def test_a_short_recovered_event_keeps_its_results():
    # Without this, a curated recovery of a small event is silently dropped again.
    recovered = {"1000000001": _SHORT_RESULTS}
    assert adapter.has_results_after_recovery("1000000001", _SHORT_RESULTS, recovered, 5)


def test_a_short_unrecovered_page_is_still_dropped():
    # Without this, a cancellation or prose page would surface as an event with results.
    recovered = {"1000000001": _SHORT_RESULTS}
    assert not adapter.has_results_after_recovery("1000000002", _CANCELLATION, recovered, 5)
    assert not adapter.has_results_after_recovery("1000000002", _SHORT_RESULTS, recovered, 5)


def test_an_empty_recovered_block_does_not_count_as_results():
    # Without this, a blank curated entry would put an empty event on the site.
    recovered = {"1000000001": "   "}
    assert not adapter.has_results_after_recovery("1000000001", "   ", recovered, 5)

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

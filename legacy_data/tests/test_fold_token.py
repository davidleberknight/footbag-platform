"""The pipeline folds slugs and hashtags exactly as the app does.

Both sides read one probe list (`tests/fixtures/foldTokenProbes.json`, which the app's own
test also reads) and one letter table, so an event tag the pipeline builds is the token the
app would make from the same name.

Run from repo root:
    python -m pytest legacy_data/tests/test_fold_token.py -v
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location(
    "pipeline_fold_token", _REPO / "legacy_data" / "pipeline" / "fold_token.py"
)
fold = importlib.util.module_from_spec(_spec)
sys.modules["pipeline_fold_token"] = fold
_spec.loader.exec_module(fold)

_PROBES = json.loads((_REPO / "tests" / "fixtures" / "foldTokenProbes.json").read_text(encoding="utf-8"))
_TABLE = json.loads(fold.TABLE_PATH.read_text(encoding="utf-8"))["map"]


def test_every_probe_folds_to_the_token_the_app_expects():
    # Defect caught: an event tag the pipeline builds differing from the app's token.
    wrong = [f"{p['input']} -> {fold.fold_token(p['input'])} (expected {p['token']})"
             for p in _PROBES if fold.fold_token(p["input"]) != p["token"]]
    assert wrong == []


def test_every_letter_mapping_of_the_standard_table_is_applied():
    # Defect caught: the table not being read, which the decomposing probes would hide.
    wrong = [ch for ch, out in _TABLE.items()
             if any(c.isalnum() and c.isascii() for c in out)
             and fold.fold_token(f"a{ch}b") != fold.fold_token(f"a{out}b")]
    assert wrong == []

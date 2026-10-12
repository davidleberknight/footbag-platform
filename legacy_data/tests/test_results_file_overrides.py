"""
test_results_file_overrides.py
==============================

Each row of `overrides/results_file_overrides.csv` is a hand correction to one
event's results, carried as a text file that replaces (or prepends to) the
results block the canonicalize stage parses.

Why this exists. The stage used to skip a row whose file was missing, so every
build published the uncorrected results while the override list made the event
look corrected; 105 correction files sat missing that way, unnoticed. A missing
target now stops the build with an error naming the file, and every committed
row must point at a file the checkout carries.

Run from repo root:
    python -m pytest legacy_data/tests/test_results_file_overrides.py -v
"""
from __future__ import annotations

import csv
import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY = REPO_ROOT / "legacy_data"
SCRIPT = LEGACY / "pipeline" / "02_canonicalize_results.py"
OVERRIDE_LIST = LEGACY / "overrides" / "results_file_overrides.csv"


def _load():
    spec = importlib.util.spec_from_file_location("canonicalize_results", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


canon = _load()


def test_a_missing_correction_file_stops_the_build(tmp_path):
    # Defect caught: an event's hand correction silently not applied, so the
    # published results revert to the uncorrected mirror text.
    overrides = {"123": {"file": "legacy_data/event_results/123.txt", "replace": True}}
    with pytest.raises(FileNotFoundError) as err:
        canon.apply_results_file_override("123", "raw", overrides=overrides, root=tmp_path)
    assert "123" in str(err.value) and "123.txt" in str(err.value)


def test_a_replacing_correction_discards_the_raw_block_and_its_comments(tmp_path):
    # Defect caught: the uncorrected results, or the file's provenance comments,
    # leaking into the parsed results.
    (tmp_path / "event_results").mkdir()
    (tmp_path / "event_results" / "7.txt").write_text(
        "# provenance note\nOpen Singles\n1. Corrected Name\n", encoding="utf-8")
    overrides = {"7": {"file": "legacy_data/event_results/7.txt", "replace": True}}
    out = canon.apply_results_file_override("7", "1. Wrong Name", overrides=overrides, root=tmp_path)
    assert "Corrected Name" in out
    assert "Wrong Name" not in out and "provenance" not in out


def test_a_supplementing_correction_keeps_the_raw_block_after_it(tmp_path):
    # Defect caught: a supplement replacing results it was meant to add to.
    (tmp_path / "s.txt").write_text("Extra Division\n1. Added Name\n", encoding="utf-8")
    overrides = {"8": {"file": "s.txt", "replace": False}}
    out = canon.apply_results_file_override("8", "1. Mirror Name", overrides=overrides, root=tmp_path)
    assert out.index("Added Name") < out.index("Mirror Name")


def test_an_event_without_a_correction_is_unchanged(tmp_path):
    assert canon.apply_results_file_override(
        "9", "1. Mirror Name", overrides={}, root=tmp_path) == "1. Mirror Name"


def test_every_listed_correction_file_is_present_in_the_checkout():
    # Defect caught: a committed override row whose file never reached the
    # checkout, which would stop every canonical rebuild.
    with open(OVERRIDE_LIST, newline="", encoding="utf-8") as handle:
        rows = [r for r in csv.DictReader(handle) if r["event_id"].strip()]
    assert rows, "the override list is empty, so nothing was checked"
    missing = []
    for r in rows:
        rel = r["file"].strip()
        rel = rel[len("legacy_data/"):] if rel.startswith("legacy_data/") else rel
        path = LEGACY / rel
        if not path.exists() or not path.read_text(encoding="utf-8").strip():
            missing.append(f"{r['event_id']}: {r['file']}")
    assert not missing, f"{len(missing)} correction file(s) missing or empty: " + "; ".join(missing)

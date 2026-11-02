"""Tests for the check that a person name in the canonical output is only a name.

A decorated name misses the alias lookup, so the seed build mints a second person
and one player's results split across two history pages. The check must catch each
decoration, and it must stay quiet about real names, which carry accents,
apostrophes and hyphens and can begin with the word Gold.
"""
import csv
import importlib.util
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "pipeline" / "qc" / "check_participant_name_text.py"
_spec = importlib.util.spec_from_file_location("check_participant_name_text", _SCRIPT)
qc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(qc)


def _write(path, column, names):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[column])
        writer.writeheader()
        writer.writerows({column: n} for n in names)


def _run(monkeypatch, canonical_dir):
    monkeypatch.setattr("sys.argv", ["check", "--canonical-dir", str(canonical_dir)])
    return qc.main()


@pytest.mark.parametrize("name, problem", [
    ("\U0001F947 Wiktor Debski", "a symbol glyph"),
    ("Wiktor \U0001F948 Debski", "a symbol glyph"),
    ("Gold: Kenny Shults", "a medal prefix"),
    ("Silver:Kana Kubota", "a medal prefix"),
    ("bronze : Bruce Li", "a medal prefix"),
    ("\x96 Natacha Mercure", "a control character"),
    (" Natacha Mercure", "untrimmed whitespace"),
    ("Natacha Mercure ", "untrimmed whitespace"),
])
def test_a_decorated_name_is_named_as_the_problem_it_is(name, problem):
    # Defect caught: a decoration that keeps a name out of the alias lookup passes.
    assert qc.name_problem(name) == problem


@pytest.mark.parametrize("name", [
    "Sławek Brzeziński", "Paully O'Reilly", "Marie-Lou Roy", "Gold Smith", "Goldie Hawn", "José Ángel", "Unknown", "",
])
def test_a_real_name_passes(name):
    # Defect caught: the gate blocks every build on an ordinary name.
    assert qc.name_problem(name) is None


def test_a_clean_canonical_set_passes(tmp_path, monkeypatch, capsys):
    _write(tmp_path / "event_result_participants.csv", "display_name", ["Sławek Brzeziński"])
    _write(tmp_path / "persons.csv", "person_name", ["Marie-Lou Roy"])
    assert _run(monkeypatch, tmp_path) == 0
    assert "STATUS: PASS" in capsys.readouterr().out


def test_a_decorated_participant_fails_and_is_listed_with_its_count(tmp_path, monkeypatch, capsys):
    # Defect caught: the participant file is not read, or a failure names nothing to fix.
    _write(tmp_path / "event_result_participants.csv", "display_name",
           ["Gold: Kenny Shults", "Gold: Kenny Shults", "Kenny Shults"])
    _write(tmp_path / "persons.csv", "person_name", ["Kenny Shults"])
    assert _run(monkeypatch, tmp_path) == 1
    out = capsys.readouterr().out
    assert "'Gold: Kenny Shults' carries a medal prefix (x2)" in out
    assert "STATUS: FAIL" in out


def test_a_decorated_person_fails(tmp_path, monkeypatch):
    # Defect caught: the persons file is not read, so a decorated person row passes.
    _write(tmp_path / "event_result_participants.csv", "display_name", ["Kenny Shults"])
    _write(tmp_path / "persons.csv", "person_name", ["\U0001F949 Kenny Shults"])
    assert _run(monkeypatch, tmp_path) == 1


def test_a_missing_file_stops_and_names_its_producer(tmp_path, monkeypatch, capsys):
    # Defect caught: a stage reading no file passes silently, checking nothing.
    _write(tmp_path / "persons.csv", "person_name", ["Kenny Shults"])
    assert _run(monkeypatch, tmp_path) == 2
    assert "export_canonical_platform.py" in capsys.readouterr().out


def test_a_file_without_its_name_column_stops(tmp_path, monkeypatch):
    # Defect caught: a renamed column leaves every row unread and the check green.
    _write(tmp_path / "event_result_participants.csv", "name", ["Gold: Kenny Shults"])
    _write(tmp_path / "persons.csv", "person_name", ["Kenny Shults"])
    assert _run(monkeypatch, tmp_path) == 2

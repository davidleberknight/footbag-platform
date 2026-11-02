"""The canonical export strips what a result list puts ahead of a name.

A medal emoji, a medal word or a dash left on a name misses the alias lookup, so the
seed build mints a second person and the player's results split across two history
pages. The exporter is driven through its real command line against synthetic inputs.
"""
from __future__ import annotations

import csv

import pytest

from canonical_export_sandbox import build_sandbox, default_output_dir, run


def _export_display_name(tmp_path, display_name):
    script = build_sandbox(tmp_path)
    canonical = script.parent.parent.parent / "out" / "canonical"
    source = canonical / "event_result_participants.csv"
    with open(source, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
        fields = list(rows[0].keys())
    rows[0]["display_name"] = display_name
    rows[0]["person_id"] = ""
    with open(source, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    result = run(script)
    assert result.returncode == 0, result.stderr
    with open(default_output_dir(script) / "event_result_participants.csv", newline="", encoding="utf-8") as f:
        first = next(r for r in csv.DictReader(f)
                     if (r["discipline_key"], r["placement"], r["participant_order"]) == ("singles_freestyle", "1", "1")
                     and r["event_key"] == "1998_worlds")
    return first["display_name"]


@pytest.mark.parametrize("raw, expected", [
    ("\U0001F947 Wiktor Debski", "Wiktor Debski"),
    ("\U0001F949Pawel Rozek", "Pawel Rozek"),
    ("Gold: Kenny Shults", "Kenny Shults"),
    ("Silver:Kana Kubota", "Kana Kubota"),
    ("\x96 Natacha Mercure", "Natacha Mercure"),
])
def test_a_decorated_name_reaches_the_output_as_the_name(tmp_path, raw, expected):
    # Defect caught: the decoration survives, so the player gets a second person.
    assert _export_display_name(tmp_path, raw) == expected


@pytest.mark.parametrize("name", ["Gold Smith", "Goldie Hawn", "Silverio Reyes", "José Ángel"])
def test_a_real_name_is_left_alone(tmp_path, name):
    # Defect caught: a name that merely begins with a medal word loses its first part.
    assert _export_display_name(tmp_path, name) == name


def test_a_name_that_was_only_decoration_becomes_unknown(tmp_path):
    # Defect caught: an empty name reaches the output as a blank participant.
    assert _export_display_name(tmp_path, "Gold:") == "Unknown"

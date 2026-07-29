"""Tests for the character-loss duplicate-person check.

The check exists because a dropped accented letter splits a real player's
competition record into a second person row nobody can claim. It has to find
that shape in both directions, because the surviving name is sometimes the
more damaged of the two, and it has to stay quiet about a pair a human has
already ruled on, or the same questions are re-asked on every pipeline run.
"""
import csv
import importlib.util
import sys
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "pipeline" / "qc" / "check_character_loss_pairs.py"
_spec = importlib.util.spec_from_file_location("check_character_loss_pairs", _SCRIPT)
qc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(qc)

TRUTH_COLUMNS = [
    "effective_person_id", "person_canon", "player_ids_seen", "player_names_seen",
    "aliases", "alias_statuses", "notes", "source", "person_canon_clean",
    "person_canon_clean_reason", "aliases_presentable", "exclusion_reason",
    "last_token", "norm_key", "legacyid",
]
REGISTER_COLUMNS = [
    "pair_id", "alias_name", "canon_name", "alias_pid", "canon_pid",
    "alias_placements", "canon_placements", "combined_placements", "co_event_count",
    "alias_country", "canon_country", "likely_pattern", "risk_level",
    "evidence_needed", "status", "notes",
]

ORPHAN_SOURCE = "patch_v53:unresolved_canonical_participant"


def _person(pid, name, *, source="overrides+data", player_ids="", legacyid=""):
    row = {c: "" for c in TRUTH_COLUMNS}
    row.update({
        "effective_person_id": pid,
        "person_canon": name,
        "person_canon_clean": name,
        "source": source,
        "player_ids_seen": player_ids,
        "legacyid": legacyid,
    })
    return row


def _truth(tmp_path, rows):
    path = tmp_path / "Persons_Truth_Final.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=TRUTH_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return path


def _register(tmp_path, rows=()):
    path = tmp_path / "identity_review_queue.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=REGISTER_COLUMNS)
        writer.writeheader()
        for row in rows:
            full = {c: "" for c in REGISTER_COLUMNS}
            full.update(row)
            writer.writerow(full)
    return path


def _run(truth, register):
    argv = sys.argv
    sys.argv = ["check_character_loss_pairs.py", "--truth", str(truth), "--register", str(register)]
    try:
        return qc.main()
    finally:
        sys.argv = argv


REAL_PLAYER = _person(
    "8a15006e", "Przemyslaw Pietrzycki",
    player_ids="1c1f4073", legacyid="79990.0",
)
LOST_LETTER_COPY = _person("96b84e1f", "Przemysaw Pietrzycki", source=ORPHAN_SOURCE)


def test_a_lost_letter_copy_of_a_real_player_is_reported(tmp_path):
    truth = _truth(tmp_path, [REAL_PLAYER, LOST_LETTER_COPY])
    assert _run(truth, _register(tmp_path)) == 1


def test_a_clean_roster_passes(tmp_path):
    truth = _truth(tmp_path, [REAL_PLAYER, _person("cd863f34", "Radek Turek")])
    assert _run(truth, _register(tmp_path)) == 0


def test_the_damaged_name_is_found_when_it_is_the_longer_of_the_two(tmp_path):
    """The surviving spelling is sometimes the more truncated one."""
    truth = _truth(tmp_path, [
        _person("2002626c", "Rados Turek", player_ids="09ee238b", legacyid="77780.0"),
        _person("4ced0cc7", "Radosaw Turek", source=ORPHAN_SOURCE),
    ])
    assert _run(truth, _register(tmp_path)) == 1


def test_a_pair_already_ruled_on_by_person_id_is_not_reported_again(tmp_path):
    truth = _truth(tmp_path, [REAL_PLAYER, LOST_LETTER_COPY])
    register = _register(tmp_path, [{
        "pair_id": "R-11", "alias_pid": "96b84e1f", "canon_pid": "8a15006e",
        "status": "REVIEW",
    }])
    assert _run(truth, register) == 0


def test_a_pair_already_ruled_on_by_name_is_not_reported_again(tmp_path):
    """Older register rows recorded the two names and left the ids blank."""
    truth = _truth(tmp_path, [REAL_PLAYER, LOST_LETTER_COPY])
    register = _register(tmp_path, [{
        "pair_id": "R-92", "alias_name": "Przemysaw Pietrzycki",
        "canon_name": "Przemyslaw Pietrzycki", "status": "RESOLVED",
    }])
    assert _run(truth, register) == 0


def test_a_row_that_can_be_claimed_is_not_treated_as_an_orphan(tmp_path):
    """A copy carrying a legacy account link is a different question entirely."""
    truth = _truth(tmp_path, [
        REAL_PLAYER,
        _person("96b84e1f", "Przemysaw Pietrzycki", source=ORPHAN_SOURCE, legacyid="80001.0"),
    ])
    assert _run(truth, _register(tmp_path)) == 0


def test_an_initialled_form_is_left_alone(tmp_path):
    """Three or more lost characters is a different question, not this one."""
    truth = _truth(tmp_path, [
        _person("aaaaaaaa", "Matt Quint", player_ids="1c1f4073"),
        _person("bbbbbbbb", "M Quint", source=ORPHAN_SOURCE),
    ])
    assert _run(truth, _register(tmp_path)) == 0


def test_an_absent_truth_file_is_a_skip(tmp_path):
    assert _run(tmp_path / "nothing.csv", _register(tmp_path)) == 0


def test_an_absent_register_is_not_an_error(tmp_path):
    truth = _truth(tmp_path, [REAL_PLAYER, _person("cd863f34", "Radek Turek")])
    assert _run(truth, tmp_path / "nothing.csv") == 0

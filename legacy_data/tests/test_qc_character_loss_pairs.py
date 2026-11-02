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
        "status": "DIFFERENT",
    }])
    assert _run(truth, register) == 0


def test_a_split_twin_carrying_player_ids_is_reported(tmp_path):
    # Defect caught: a lost-letter twin minted with player ids of its own, and
    # no account link, passing unseen while it splits a real player's record.
    truth = _truth(tmp_path, [
        REAL_PLAYER,
        _person("71b15435", "Przemysaw Pietrzycki", player_ids="7a28d48e"),
    ])
    assert _run(truth, _register(tmp_path)) == 1


def test_a_pair_still_under_review_is_reported(tmp_path):
    # Defect caught: a register row recording only that a pair awaits a
    # ruling letting the blocking check pass, so an unruled identity ships.
    truth = _truth(tmp_path, [REAL_PLAYER, LOST_LETTER_COPY])
    for status in ("REVIEW", "DO_NOT_MERGE_YET"):
        register = _register(tmp_path, [{
            "pair_id": "R-11", "alias_pid": "96b84e1f", "canon_pid": "8a15006e",
            "status": status,
        }])
        assert _run(truth, register) == 1, status


def test_a_cannot_tell_ruling_settles_the_pair(tmp_path):
    """An honest 'the evidence cannot tell' passes the check without a merge."""
    truth = _truth(tmp_path, [REAL_PLAYER, LOST_LETTER_COPY])
    register = _register(tmp_path, [{
        "pair_id": "R-11", "alias_pid": "96b84e1f", "canon_pid": "8a15006e",
        "status": "CANNOT_TELL",
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


def test_a_copy_holding_an_account_is_reported(tmp_path):
    # Defect caught: a player's results sit on one record and their account on
    # another, so claiming the account never reaches the results.
    truth = _truth(tmp_path, [
        REAL_PLAYER,
        _person("96b84e1f", "Przemysaw Pietrzycki", source=ORPHAN_SOURCE, legacyid="80001.0"),
    ])
    assert _run(truth, _register(tmp_path)) == 1


def test_names_that_differ_only_by_an_accent_are_reported(tmp_path):
    # Defect caught: an accented twin normalizes to the same name, so a check
    # looking only for lost characters passes it unseen.
    truth = _truth(tmp_path, [
        _person("aaaa0001", "Daniel Sebek"),
        _person("aaaa0002", "Daniel Šebek", legacyid="43636.0"),
    ])
    assert _run(truth, _register(tmp_path)) == 1


def test_names_that_differ_only_by_a_stroke_letter_are_reported(tmp_path):
    # Defect caught: the shared normalization leaves the Polish stroke l alone, so
    # this twin compares as a different letter rather than a lost accent.
    truth = _truth(tmp_path, [
        _person("aaaa0003", "Rafal Andryka"),
        _person("aaaa0004", "Rafał Andryka", legacyid="66397.0"),
    ])
    assert _run(truth, _register(tmp_path)) == 1


def test_one_person_row_never_pairs_with_itself(tmp_path):
    # Defect caught: comparing names of equal length matching a row against
    # itself, so every roster fails the gate.
    truth = _truth(tmp_path, [_person("aaaa0005", "Daniel Šebek", legacyid="43636.0")])
    assert _run(truth, _register(tmp_path)) == 0


def test_a_ruling_keyed_on_an_accented_spelling_settles_the_folded_pair(tmp_path):
    # Defect caught: a ruled pair asked again on every run because the register's
    # spelling and the row's folded name never compare equal.
    truth = _truth(tmp_path, [
        _person("aaaa0003", "Rafal Andryka"),
        _person("aaaa0004", "Rafał Andryka", legacyid="66397.0"),
    ])
    register = _register(tmp_path, [{
        "pair_id": "R-90", "alias_name": "Rafał Andryka", "canon_name": "Rafal Andryka",
        "status": "SAME",
    }])
    assert _run(truth, register) == 0


MASTER_COLUMNS = ["master_person_id", "person_id", "person_name",
                  "matched_historical_person_id", "legacy_member_id"]


def _master(tmp_path, rows):
    path = tmp_path / "persons_master.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=MASTER_COLUMNS)
        writer.writeheader()
        for row in rows:
            full = {c: "" for c in MASTER_COLUMNS}
            full.update(row)
            writer.writerow(full)
    return path


def _run_with_master(truth, register, master):
    argv = sys.argv
    sys.argv = ["check_character_loss_pairs.py", "--truth", str(truth),
                "--register", str(register), "--persons-master", str(master)]
    try:
        return qc.main()
    finally:
        sys.argv = argv


def test_two_provisional_people_in_the_persons_master_are_compared(tmp_path):
    # Defect caught: duplicates among people with accounts and no results escape,
    # because the identity lock holds only people with results.
    truth = _truth(tmp_path, [_person("cd863f34", "Radek Turek")])
    master = _master(tmp_path, [
        {"master_person_id": "master_person::a1", "person_name": "Daniel Sebek"},
        {"master_person_id": "master_person::a2", "person_name": "Daniel Šebek",
         "legacy_member_id": "43636"},
    ])
    assert _run_with_master(truth, _register(tmp_path), master) == 1
    # The same lock alone has nothing to report, so the master is what found them.
    assert _run(truth, _register(tmp_path)) == 0


def test_a_provisional_person_is_compared_with_the_lock(tmp_path):
    # Defect caught: a provisional twin of a player with results, leaving the
    # account and the results on two records.
    truth = _truth(tmp_path, [_person("aaaa0003", "Rafal Andryka")])
    master = _master(tmp_path, [
        {"master_person_id": "master_person::a3", "person_name": "Rafał Andryka",
         "legacy_member_id": "66397"},
    ])
    assert _run_with_master(truth, _register(tmp_path), master) == 1


def test_a_master_row_repeating_a_lock_person_is_judged_by_the_lock(tmp_path):
    # Defect caught: the master repeats every lock person, sometimes under a stale
    # spelling, and that spelling raises a pair the lock itself does not hold.
    truth = _truth(tmp_path, [
        _person("aaaa0003", "Rafal Andryka"),
        _person("aaaa0006", "Radek Turek"),
    ])
    master = _master(tmp_path, [
        {"master_person_id": "master_person::a4", "person_id": "aaaa0006",
         "person_name": "Rafał Andryka"},
    ])
    assert _run_with_master(truth, _register(tmp_path), master) == 0


def test_a_provisional_row_matched_to_a_person_is_not_a_twin(tmp_path):
    # Defect caught: a provisional row already reconciled to its historical person
    # being raised for a ruling that has already been made.
    truth = _truth(tmp_path, [_person("aaaa0003", "Rafal Andryka")])
    master = _master(tmp_path, [
        {"master_person_id": "master_person::a5", "person_name": "Rafał Andryka",
         "matched_historical_person_id": "aaaa0003"},
    ])
    assert _run_with_master(truth, _register(tmp_path), master) == 0


def test_a_missing_persons_master_stops_the_run_and_names_its_producer(tmp_path, capsys):
    # Defect caught: a stage asked to read the master passing silently because the
    # master was never built, leaving provisional duplicates unchecked.
    truth = _truth(tmp_path, [_person("cd863f34", "Radek Turek")])
    assert _run_with_master(truth, _register(tmp_path), tmp_path / "nothing.csv") == 2
    assert "05_build_persons_master.py" in capsys.readouterr().err


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

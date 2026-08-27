"""Names the legacy database stored in an encoding nobody recorded.

Some members' names survive intact in the dump's plain column but were written in
a codepage the export never named, so every rule that reads them as Western
European sees unrelated letters. Read back with the right codepage they are
ordinary Polish, Czech, Bulgarian and Russian names. Read with the wrong one they
are letter-shaped nonsense, which is why the codepage is recorded by a human once
per member rather than guessed at run time: for at least one of these members two
candidates both produce well-formed letters and only one produces a real name, so
a scoring rule would choose wrongly without ever failing.

The decode itself is exact. The stored text is encoded straight back to the bytes
it came from and decoded with the named codepage. Nothing is inferred, replaced or
moved, and a value that still carries a destroyed character is refused, because
naming an encoding cannot bring back a byte that is already gone.

The names themselves are not written down here. These tests use synthetic values
and the curated file's own shape; the delivered inventory is asserted by count.
"""
from __future__ import annotations

import csv
import importlib.util
import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
_MDS = _ROOT / "legacy_data" / "member_data_scripts"
if str(_MDS) not in sys.path:
    sys.path.insert(0, str(_MDS))

_spec = importlib.util.spec_from_file_location(
    "extract_legacy_members", _MDS / "extract_legacy_members.py")
ex = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ex)

OVERRIDES = _ROOT / "legacy_data" / "overrides" / "member_name_encodings.csv"
PROBLEMS = _MDS / "out" / "legacy_members_encoding_problems.csv"

# The audited partition of the delivered inventory. Members and values are
# different counts and both are pinned, because the recoverable groups hold more
# values than members: a member can have a damaged given name, patronymic and
# surname all at once.
TOTAL_MEMBERS, TOTAL_VALUES = 31, 47
RECOVERABLE_MEMBERS, RECOVERABLE_VALUES = 26, 42
DESTROYED_MEMBERS, DESTROYED_VALUES = 5, 5

BY_CODEPAGE_MEMBERS = {"cp1250": 14, "cp1251": 3, "iso8859-5": 9}
BY_CODEPAGE_VALUES = {"cp1250": 14, "cp1251": 6, "iso8859-5": 22}

# The five whose names lost a character before the dump was taken. They are not
# in the curated file and never will be.
DESTROYED_IDS = {"64656", "65997", "66007", "79457", "83072"}


def _curated() -> list[dict]:
    with OVERRIDES.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


# ── the audited totals ───────────────────────────────────────────────────────

def test_the_partition_accounts_for_every_value():
    assert RECOVERABLE_MEMBERS + DESTROYED_MEMBERS == TOTAL_MEMBERS
    assert RECOVERABLE_VALUES + DESTROYED_VALUES == TOTAL_VALUES


def test_the_codepage_groups_sum_to_the_recoverable_totals():
    # The check that catches the arithmetic slip: members and values differ per
    # group, so a subtotal copied from the wrong column shows up here.
    assert sum(BY_CODEPAGE_MEMBERS.values()) == RECOVERABLE_MEMBERS
    assert sum(BY_CODEPAGE_VALUES.values()) == RECOVERABLE_VALUES


def test_a_group_never_has_fewer_values_than_members():
    for cp, members in BY_CODEPAGE_MEMBERS.items():
        assert BY_CODEPAGE_VALUES[cp] >= members, cp


# ── the curated file ─────────────────────────────────────────────────────────

def test_the_curated_file_covers_exactly_the_recoverable_members():
    rows = _curated()
    assert len(rows) == RECOVERABLE_MEMBERS
    assert len({r["legacy_member_id"] for r in rows}) == RECOVERABLE_MEMBERS


def test_the_curated_file_groups_match_the_audited_counts():
    rows = _curated()
    seen: dict[str, int] = {}
    for r in rows:
        seen[r["codepage"]] = seen.get(r["codepage"], 0) + 1
    assert seen == BY_CODEPAGE_MEMBERS


def test_no_destroyed_member_is_given_a_codepage():
    # Naming an encoding cannot restore a byte that is gone. Listing one of these
    # would assert a repair that did not happen.
    assert {r["legacy_member_id"] for r in _curated()} & DESTROYED_IDS == set()


def test_every_curated_codepage_is_one_a_human_may_name():
    assert {r["codepage"] for r in _curated()} <= ex.ALLOWED_CODEPAGES


def test_the_curated_file_records_no_names():
    # It carries an account id and an encoding. A name in it would put personal
    # data in a file whose whole purpose is to avoid needing one.
    text = OVERRIDES.read_text(encoding="utf-8")
    assert text.isascii(), "a non-ASCII character suggests a name was written in"


def test_the_loader_reads_the_codepage_and_the_fields():
    loaded = ex.load_member_name_encodings(OVERRIDES)
    assert len(loaded) == RECOVERABLE_MEMBERS
    assert loaded["70559"] == ("cp1250", frozenset({"MemberLastName"}))
    assert loaded["81506"] == ("cp1251", frozenset(
        {"MemberFirstName", "MemberMiddleName", "MemberLastName"}))
    assert loaded["82685"] == ("iso8859-5", frozenset(
        {"MemberFirstName", "MemberLastName"}))


def test_a_member_whose_other_name_is_already_correct_lists_only_the_damaged_one():
    # The case that makes the field list load-bearing rather than documentation.
    # This member's given name was written in an unrecorded codepage; the surname
    # was not, and it holds a letter both codepages define, so re-reading it would
    # decode cleanly to the WRONG letter and look repaired.
    codepage, fields = ex.load_member_name_encodings(OVERRIDES)["82881"]
    assert fields == frozenset({"MemberFirstName"})

    # The surname's plain column as the dump stores it. Its unicode column is
    # already correct, so the ordinary rules resolve it and the curator did not
    # list it. Forced through this member's codepage anyway it decodes cleanly to
    # a different letter, so it would come out looking repaired and be wrong.
    stored_surname_plain = "Janou¹ek"
    forced = ex.decode_through_codepage(stored_surname_plain, codepage)
    assert forced is not None and forced != "Janoušek", (
        "this fixture exists because forcing the codepage here produces a clean "
        "but wrong letter; if that stops being true the field list is no longer "
        "protecting anything")
    # And the resolver leaves it alone, because the field was not named.
    value, how = ex._resolve_pair(stored_surname_plain, "Janoušek", None)
    assert value == "Janoušek"
    assert how != ex.SELECTED_CURATED


def test_every_curated_member_names_at_least_one_field():
    for mid, (_cp, fields) in ex.load_member_name_encodings(OVERRIDES).items():
        assert fields, mid


def test_an_unknown_codepage_stops_the_extract(tmp_path):
    p = tmp_path / "bad.csv"
    p.write_text("legacy_member_id,codepage,fields,note\n1,cp9999,given,x\n",
                 encoding="utf-8")
    with pytest.raises(SystemExit, match="cp9999"):
        ex.load_member_name_encodings(p)


def test_an_unknown_field_token_stops_the_extract(tmp_path):
    p = tmp_path / "bad.csv"
    p.write_text("legacy_member_id,codepage,fields,note\n1,cp1250,nickname,x\n",
                 encoding="utf-8")
    with pytest.raises(SystemExit, match="nickname"):
        ex.load_member_name_encodings(p)


def test_naming_no_field_stops_the_extract(tmp_path):
    # A row with a codepage and no field repairs nothing while looking decided.
    p = tmp_path / "bad.csv"
    p.write_text("legacy_member_id,codepage,fields,note\n1,cp1250,,x\n",
                 encoding="utf-8")
    with pytest.raises(SystemExit):
        ex.load_member_name_encodings(p)


def test_a_missing_file_means_nobody_has_a_codepage(tmp_path):
    assert ex.load_member_name_encodings(tmp_path / "absent.csv") == {}


# ── the decode is exact ──────────────────────────────────────────────────────

@pytest.mark.parametrize("stored, codepage, expected", [
    # Central European: the stroke and ogonek letters Polish and Czech need.
    ("Staroñ", "cp1250", "Staroń"),
    ("Micha³", "cp1250", "Michał"),
    ("Zarêbski", "cp1250", "Zarębski"),
    ("Vojtìch", "cp1250", "Vojtěch"),
    # Cyrillic, two different encodings that are not interchangeable.
    ("Èâàíîâà", "cp1251",
     "Иванова"),
    ("¸ÒÐÝÞÒ", "iso8859-5",
     "Иванов"),
])
def test_a_named_codepage_decodes_exactly(stored, codepage, expected):
    assert ex.decode_through_codepage(stored, codepage) == expected


def test_the_two_cyrillic_encodings_are_not_interchangeable():
    # The reason the codepage is curated per member rather than assumed for the
    # script: the same bytes read the other way are letters, just not a name.
    russian = "¸ÒÐÝÞÒ"
    assert ex.decode_through_codepage(russian, "iso8859-5") == "Иванов"
    assert ex.decode_through_codepage(russian, "cp1251") != "Иванов"


def test_a_destroyed_character_refuses_the_decode():
    # The line the ruling draws. A question mark standing where a byte was lost
    # survives any decode, and a repair that carried it forward would be
    # asserting a name nobody can read.
    #
    # The first three are pure ASCII once the lost byte is gone, so re-reading
    # them changes nothing and they are refused for that reason alone. The fourth
    # is the one that needs the rule: it carries a byte the codepage really does
    # remap, so the decode produces a different string and still carries the loss.
    assert ex.decode_through_codepage("Ale?", "cp1250") is None
    assert ex.decode_through_codepage("Tomá?", "cp1250") is None
    assert ex.decode_through_codepage("?krabal", "cp1250") is None

    both = "Tomá?¹"
    assert both.encode("cp1252").decode("cp1250") != both, (
        "this fixture is meant to change under the decode; if it stops doing so "
        "it no longer tests the destroyed-character rule")
    assert ex.decode_through_codepage(both, "cp1250") is None


def test_text_that_cannot_round_trip_is_refused():
    # Already-correct Unicode does not encode back to single bytes, so there is
    # nothing to re-read and the decode stands aside.
    assert ex.decode_through_codepage("Иванов", "cp1251") is None
    assert ex.decode_through_codepage("", "cp1250") is None


def test_plain_ascii_is_left_exactly_as_it_is():
    # The property that matters for everyone not in the curated file: a clean
    # name must come through untouched whatever else changes.
    for name in ("Smith", "O'Brien", "Anne-Marie", "van der Berg"):
        assert ex.decode_through_codepage(name, "cp1250") is None
        value, how = ex._resolve_pair(name, name, "cp1250")
        assert value == name
        assert how != ex.SELECTED_CURATED


# ── the resolver honours the ruling ──────────────────────────────────────────

def test_a_curated_member_resolves_through_the_named_codepage():
    value, how = ex._resolve_pair("Staroñ", "StaroÅ", "cp1250")
    assert value == "Staroń"
    assert how == ex.SELECTED_CURATED


def test_without_a_codepage_the_earlier_rules_still_decide():
    # Nothing changes for a member the curator did not rule on.
    value, how = ex._resolve_pair("Staroñ", "StaroÅ", None)
    assert how != ex.SELECTED_CURATED


def test_a_curated_codepage_never_forces_a_damaged_value_through():
    # An override on a value that also lost a character must stand aside rather
    # than publish a name still carrying the loss.
    value, how = ex._resolve_pair("Ale?", "AleÂ?", "cp1250")
    assert "?" in value
    assert how != ex.SELECTED_CURATED


def test_clean_unicode_columns_are_untouched_by_an_override():
    value, how = ex._resolve_pair("Jan Kowalski", "Jan Kowalski", "cp1250")
    assert value == "Jan Kowalski"
    assert how != ex.SELECTED_CURATED


# ── the five stay unresolved, deliberately ───────────────────────────────────

@pytest.mark.skipif(not PROBLEMS.exists(),
                    reason="the delivered extract is operator-supplied and absent here")
def test_the_delivered_inventory_still_matches_the_audit():
    with PROBLEMS.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    assert len(rows) == TOTAL_VALUES
    assert len({r["legacy_member_id"] for r in rows}) == TOTAL_MEMBERS


@pytest.mark.skipif(not PROBLEMS.exists(),
                    reason="the delivered extract is operator-supplied and absent here")
def test_every_destroyed_member_is_in_the_inventory_and_out_of_the_override():
    with PROBLEMS.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    inventory = {r["legacy_member_id"] for r in rows}
    assert DESTROYED_IDS <= inventory
    # Their route is the admin help request, which exists precisely because a
    # member whose stored surname cannot match needs a human rather than a
    # failed self-serve match. Leaving them here is what routes them.
    assert DESTROYED_IDS & {r["legacy_member_id"] for r in _curated()} == set()


@pytest.mark.skipif(not PROBLEMS.exists(),
                    reason="the delivered extract is operator-supplied and absent here")
def test_every_destroyed_value_still_carries_its_lost_character():
    with PROBLEMS.open(newline="", encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh)
                if r["legacy_member_id"] in DESTROYED_IDS]
    assert len(rows) == DESTROYED_VALUES
    for r in rows:
        assert "?" in r["stored_plain_column"], r["legacy_member_id"]

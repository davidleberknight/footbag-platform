"""
test_bootstrap_leader_signals.py
================================

Pins the signal-computation contract for
`clubs/scripts/04a_compute_bootstrap_leader_signals.py`.

Two layers:

  1. Unit tests against the pure-function compute_*() entry points — each
     signal type gets explicit positive + negative cases plus edge handling
     (missing column, empty string, case folding, word-boundary correctness).

  2. End-to-end integration test that invokes the script as a subprocess
     against a minimal fixture set written to a tmp dir, then asserts the
     emitted CSV shape, row count, signal coverage, and idempotency.

Run from repo root:
    python -m pytest legacy_data/tests/test_bootstrap_leader_signals.py -v
"""
from __future__ import annotations

import csv
import json
import subprocess
import sys
import importlib.util
from collections import Counter
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "legacy_data" / "clubs" / "scripts" / "04a_compute_bootstrap_leader_signals.py"


# Dynamic import — the script filename starts with a digit, so the standard
# `from clubs.scripts.04a_compute_bootstrap_leader_signals import ...` form
# fails. spec_from_file_location is the canonical workaround.
def _load_module():
    spec = importlib.util.spec_from_file_location(
        "bootstrap_leader_signals", SCRIPT_PATH
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


mod = _load_module()


# ─── unit tests: listed_contact ─────────────────────────────────────────────


def test_listed_contact_matches_when_leader_is_club_contact():
    leader = {"mirror_member_id": "12345"}
    club = {"contact_member_id": "12345"}
    is_present, payload = mod.compute_listed_contact(leader, club)
    assert is_present == 1
    assert payload["matched"] is True
    assert payload["contact_member_id"] == "12345"


def test_listed_contact_no_match_on_different_ids():
    leader = {"mirror_member_id": "12345"}
    club = {"contact_member_id": "99999"}
    is_present, _ = mod.compute_listed_contact(leader, club)
    assert is_present == 0


def test_listed_contact_no_match_when_contact_empty():
    leader = {"mirror_member_id": "12345"}
    club = {"contact_member_id": ""}
    is_present, _ = mod.compute_listed_contact(leader, club)
    assert is_present == 0


def test_listed_contact_no_match_when_leader_mid_empty():
    leader = {"mirror_member_id": ""}
    club = {"contact_member_id": "12345"}
    is_present, _ = mod.compute_listed_contact(leader, club)
    assert is_present == 0


# ─── unit tests: affiliation ────────────────────────────────────────────────


def test_affiliation_present_when_count_positive():
    counts = Counter({("club-a", "777"): 1})
    leader = {"club_key": "club-a", "mirror_member_id": "777"}
    is_present, payload = mod.compute_affiliation(leader, counts)
    assert is_present == 1
    assert payload["affiliation_rows"] == 1


def test_affiliation_absent_when_count_zero():
    counts = Counter()
    leader = {"club_key": "club-a", "mirror_member_id": "777"}
    is_present, payload = mod.compute_affiliation(leader, counts)
    assert is_present == 0
    assert payload["affiliation_rows"] == 0


def test_affiliation_counts_multiple_rows():
    counts = Counter({("club-a", "777"): 3})
    leader = {"club_key": "club-a", "mirror_member_id": "777"}
    _, payload = mod.compute_affiliation(leader, counts)
    assert payload["affiliation_rows"] == 3


# ─── unit tests: hosting (person-level: club hosting year ∈ person window) ──


def test_hosting_present_when_hosting_year_in_person_window():
    club = {"name": "Club A"}
    person = {"first_year": "2018", "last_year": "2024"}
    hosting_years = {"club a": {2021}}
    is_present, payload = mod.compute_hosting(club, person, hosting_years)
    assert is_present == 1
    assert payload["scope"] == "person_level"
    assert payload["matched_years"] == [2021]


def test_hosting_absent_when_hosting_year_outside_person_window():
    club = {"name": "Club A"}
    person = {"first_year": "2008", "last_year": "2015"}
    hosting_years = {"club a": {2021}}
    is_present, _ = mod.compute_hosting(club, person, hosting_years)
    assert is_present == 0


def test_hosting_absent_when_club_never_hosted():
    club = {"name": "Club A"}
    person = {"first_year": "2010", "last_year": "2024"}
    is_present, payload = mod.compute_hosting(club, person, {})
    assert is_present == 0
    assert payload["club_hosted_years"] == 0


def test_hosting_absent_when_person_window_missing():
    club = {"name": "Club A"}
    is_present, _ = mod.compute_hosting(club, None, {"club a": {2021}})
    assert is_present == 0


def test_hosting_window_boundaries_inclusive():
    club = {"name": "Club A"}
    person = {"first_year": "2018", "last_year": "2024"}
    # Both endpoints count; a year between also counts.
    assert mod.compute_hosting(club, person, {"club a": {2018}})[0] == 1
    assert mod.compute_hosting(club, person, {"club a": {2024}})[0] == 1
    assert mod.compute_hosting(club, person, {"club a": {2017}})[0] == 0
    assert mod.compute_hosting(club, person, {"club a": {2025}})[0] == 0


# ─── unit tests: roster (person-level: leader on the club's member roster) ──


def test_roster_present_when_leader_on_roster():
    leader = {"club_key": "club-a", "mirror_member_id": "100"}
    roster = {"club-a": {"100", "200"}}
    is_present, payload = mod.compute_roster(leader, roster)
    assert is_present == 1
    assert payload["on_roster"] is True
    assert payload["scope"] == "person_level"
    assert payload["roster_size"] == 2


def test_roster_absent_when_leader_not_on_roster():
    leader = {"club_key": "club-a", "mirror_member_id": "999"}
    roster = {"club-a": {"100", "200"}}
    assert mod.compute_roster(leader, roster)[0] == 0


def test_roster_absent_when_club_has_no_roster():
    leader = {"club_key": "club-z", "mirror_member_id": "100"}
    assert mod.compute_roster(leader, {})[0] == 0


def test_roster_absent_when_leader_mid_blank():
    leader = {"club_key": "club-a", "mirror_member_id": ""}
    assert mod.compute_roster(leader, {"club-a": {"100"}})[0] == 0


# ─── unit tests: roster/hosting map builders ────────────────────────────────


def test_build_roster_by_club_groups_member_ids():
    members = [
        {"legacy_club_key": "club-a", "mirror_member_id": "100"},
        {"legacy_club_key": "club-a", "mirror_member_id": "200"},
        {"legacy_club_key": "club-b", "mirror_member_id": "300"},
        {"legacy_club_key": "", "mirror_member_id": "x"},   # skipped (no key)
    ]
    roster = mod.build_roster_by_club(members)
    assert roster["club-a"] == {"100", "200"}
    assert roster["club-b"] == {"300"}
    assert "" not in roster


def test_build_hosting_years_applies_alias_and_groups_years():
    events = [
        {"host_club": "Club A", "year": "2019"},
        {"host_club": "Club A", "year": "2021"},
        {"host_club": "Sole Purpose Footbag Club", "year": "2015"},
    ]
    aliases = {"sole purpose footbag club": "sole purpose"}
    years = mod.build_hosting_years_by_name(events, aliases)
    assert years["club a"] == {2019, 2021}
    # Aliased host_club is remapped to the club's normalized name.
    assert years["sole purpose"] == {2015}


# ─── unit tests: mirror_text (regex word-boundary against normalized desc) ──


def test_mirror_text_matches_whole_name():
    leader = {"person_name": "Camilo Moreno"}
    club = {"description": "Founded by Camilo Moreno in 2014."}
    is_present, payload = mod.compute_mirror_text(leader, club)
    assert is_present == 1
    assert payload["matched"] is True
    assert payload["person_name_norm"] == "camilo moreno"


def test_mirror_text_word_boundary_rejects_partial_match():
    # "Smithfield" must NOT match a search for "Smith".
    leader = {"person_name": "John Smith"}
    club = {"description": "Founded in Smithfield-on-Stour."}
    is_present, _ = mod.compute_mirror_text(leader, club)
    assert is_present == 0


def test_mirror_text_case_insensitive_via_norm_name():
    leader = {"person_name": "ALAIN CUSTOVIC"}
    club = {"description": "alain custovic — founding member"}
    is_present, _ = mod.compute_mirror_text(leader, club)
    assert is_present == 1


def test_mirror_text_treats_hyphen_as_space():
    # norm_name replaces '-' with ' ', so "Pieds-a-Gilles" normalizes to
    # the same token sequence as "pieds a gilles".
    leader = {"person_name": "Jean-Paul"}
    club = {"description": "Jean Paul Founded This Club"}
    is_present, payload = mod.compute_mirror_text(leader, club)
    assert is_present == 1
    assert payload["person_name_norm"] == "jean paul"


def test_mirror_text_empty_inputs():
    assert mod.compute_mirror_text({"person_name": ""}, {"description": ""})[0] == 0
    assert mod.compute_mirror_text({"person_name": "John"}, {"description": ""})[0] == 0
    assert mod.compute_mirror_text({"person_name": ""}, {"description": "John"})[0] == 0


# ─── unit tests: recent_activity (OR across 3 club years + person last_year) ─


def test_recent_activity_present_when_club_recent():
    club = {"last_updated_year": "2024", "last_hosted_year": "", "max_affiliated_member_last_year": ""}
    person = {"last_year": "1995"}
    is_present, payload = mod.compute_recent_activity(club, person)
    assert is_present == 1
    assert payload["club_recent"] is True
    assert payload["person_recent"] is False
    assert payload["anchor_year"] == 2020


def test_recent_activity_present_when_person_recent():
    club = {"last_updated_year": "2010", "last_hosted_year": "2005", "max_affiliated_member_last_year": "2008"}
    person = {"last_year": "2023"}
    is_present, payload = mod.compute_recent_activity(club, person)
    assert is_present == 1
    assert payload["club_recent"] is False
    assert payload["person_recent"] is True


def test_recent_activity_absent_when_neither_recent():
    club = {"last_updated_year": "2010", "last_hosted_year": "2005", "max_affiliated_member_last_year": "2008"}
    person = {"last_year": "1999"}
    is_present, payload = mod.compute_recent_activity(club, person)
    assert is_present == 0
    assert payload["club_recent"] is False
    assert payload["person_recent"] is False


def test_recent_activity_boundary_2020_inclusive():
    # Anchor is >= 2020, so 2020 itself counts.
    club = {"last_updated_year": "2020", "last_hosted_year": "", "max_affiliated_member_last_year": ""}
    person = {"last_year": ""}
    is_present, _ = mod.compute_recent_activity(club, person)
    assert is_present == 1


def test_recent_activity_handles_missing_person():
    club = {"last_updated_year": "2024", "last_hosted_year": "", "max_affiliated_member_last_year": ""}
    is_present, _ = mod.compute_recent_activity(club, None)
    assert is_present == 1


def test_recent_activity_handles_all_blank():
    is_present, _ = mod.compute_recent_activity({}, None)
    assert is_present == 0


# ─── unit tests: geographic_alignment (country-only equality) ───────────────


def test_geographic_alignment_matches_on_country_equality():
    club = {"country": "Denmark"}
    person = {"country": "Denmark"}
    is_present, payload = mod.compute_geographic_alignment(club, person)
    assert is_present == 1
    assert payload["matched"] is True


def test_geographic_alignment_case_insensitive():
    club = {"country": "denmark"}
    person = {"country": "DENMARK"}
    is_present, _ = mod.compute_geographic_alignment(club, person)
    assert is_present == 1


def test_geographic_alignment_no_match_different_countries():
    club = {"country": "Denmark"}
    person = {"country": "Finland"}
    is_present, _ = mod.compute_geographic_alignment(club, person)
    assert is_present == 0


def test_geographic_alignment_absent_when_either_blank():
    assert mod.compute_geographic_alignment({"country": ""}, {"country": "Denmark"})[0] == 0
    assert mod.compute_geographic_alignment({"country": "Denmark"}, {"country": ""})[0] == 0
    assert mod.compute_geographic_alignment({"country": ""}, {"country": ""})[0] == 0


def test_geographic_alignment_handles_missing_person():
    is_present, _ = mod.compute_geographic_alignment({"country": "Denmark"}, None)
    assert is_present == 0


# ─── compute_signals_for_leader: full 7-signal emission contract ────────────


def test_compute_signals_emits_exactly_seven_signals_in_order():
    leader = {
        "club_key": "club-x",
        "mirror_member_id": "111",
        "role": "leader",
        "person_id": "p-1",
        "person_name": "Test Person",
    }
    club = {
        "country": "Canada",
        "description": "",
        "contact_member_id": "111",
        "linkable_member_count": "10",
        "hosted_event_count": "2",
        "ever_hosted": "1",
        "last_hosted_year": "2023",
        "last_updated_year": "2024",
        "max_affiliated_member_last_year": "2022",
    }
    person = {"person_id": "p-1", "country": "Canada",
              "first_year": "2010", "last_year": "2024"}
    rows = mod.compute_signals_for_leader(leader, club, person, Counter(), {}, {})

    assert [r["signal_type"] for r in rows] == [
        "listed_contact", "affiliation", "hosting", "roster",
        "mirror_text", "recent_activity", "geographic_alignment",
    ]
    assert all(r["club_key"] == "club-x" for r in rows)
    assert all(r["mirror_member_id"] == "111" for r in rows)
    assert all(r["role"] == "leader" for r in rows)
    assert all(r["source"] == mod.SOURCE_LABEL for r in rows)


def test_compute_signals_payload_json_is_valid_and_deterministic():
    leader = {
        "club_key": "club-x", "mirror_member_id": "111", "role": "leader",
        "person_id": "p-1", "person_name": "Test Person",
    }
    club = {
        "country": "Canada", "description": "", "contact_member_id": "",
        "linkable_member_count": "0", "hosted_event_count": "0",
        "ever_hosted": "0", "last_hosted_year": "", "last_updated_year": "",
        "max_affiliated_member_last_year": "",
    }
    rows = mod.compute_signals_for_leader(leader, club, None, Counter(), {}, {})
    for r in rows:
        parsed = json.loads(r["signal_payload_json"])
        assert isinstance(parsed, dict)
    # Run twice; bytes must be identical (sort_keys=True invariant).
    rows2 = mod.compute_signals_for_leader(leader, club, None, Counter(), {}, {})
    assert [r["signal_payload_json"] for r in rows] == \
           [r["signal_payload_json"] for r in rows2]


# ─── end-to-end: subprocess invocation against fixture CSVs ─────────────────


@pytest.fixture
def fixture_dir(tmp_path: Path) -> Path:
    """Write a minimal but realistic set of input CSVs to a tmp dir and
    return the dir. The fixture exercises every signal in both is_present=1
    and is_present=0 branches across two leaders."""
    leaders = [
        # Leader-A: matches contact, has affiliation, club hosts, roster=10,
        # name in desc, recent, country aligned → all 7 signals = 1.
        {
            "club_key": "club-a", "club_name": "Club A",
            "person_id": "p-a", "person_name": "Alpha Person",
            "mirror_member_id": "100", "role": "leader",
            "status": "provisional", "affiliation_confidence_score": "0.9",
            "club_confidence_score": "0.9", "selection_rank": "1",
            "selection_reason": "top_matched_linkable_affiliation",
        },
        # Leader-B: not the contact, no affiliation row (orphan; rare but
        # tests the path), club does NOT host, roster=3, name absent from
        # desc, not recent, country mismatch → all 7 signals = 0.
        {
            "club_key": "club-b", "club_name": "Club B",
            "person_id": "p-b", "person_name": "Beta Person",
            "mirror_member_id": "200", "role": "leader",
            "status": "provisional", "affiliation_confidence_score": "0.7",
            "club_confidence_score": "0.7", "selection_rank": "1",
            "selection_reason": "top_matched_linkable_affiliation",
        },
    ]
    candidates = [
        {
            "club_key": "club-a", "name": "Club A", "city": "Toronto",
            "country": "Canada",
            "contact_email": "", "contact_member_id": "100",
            "external_url": "",
            "description": "Founded by Alpha Person; meets weekly.",
            "created": "", "last_updated": "",
            "member_rows": "20", "unique_member_names": "20",
            "mirror_member_id_count": "20", "linkable_member_count": "10",
            "hosted_event_count": "3", "ever_hosted": "1",
            "last_hosted_year": "2023",
            "max_affiliated_member_last_year": "2022",
            "contact_member_last_year": "2024",
            "created_year": "2010", "last_updated_year": "2024",
            "R1": "1", "R2": "1", "R3": "1", "R4": "1", "R5": "1",
            "R6": "1", "R7": "1", "R8": "1", "R9": "1", "R10": "1",
            "contact_signal_substitute_applied": "0",
            "category": "pre_populate",
            "confidence_score": "0.95", "bootstrap_eligible": "1",
        },
        {
            "club_key": "club-b", "name": "Club B", "city": "Paris",
            "country": "France",
            "contact_email": "", "contact_member_id": "999",
            "external_url": "",
            "description": "Sleepy and quiet; founded a long time ago.",
            "created": "", "last_updated": "",
            "member_rows": "3", "unique_member_names": "3",
            "mirror_member_id_count": "3", "linkable_member_count": "3",
            "hosted_event_count": "0", "ever_hosted": "0",
            "last_hosted_year": "",
            "max_affiliated_member_last_year": "2008",
            "contact_member_last_year": "2009",
            "created_year": "2002", "last_updated_year": "2009",
            "R1": "0", "R2": "0", "R3": "0", "R4": "0", "R5": "0",
            "R6": "0", "R7": "0", "R8": "0", "R9": "0", "R10": "0",
            "contact_signal_substitute_applied": "0",
            "category": "pre_populate",
            "confidence_score": "0.5", "bootstrap_eligible": "1",
        },
    ]
    affiliations = [
        # Leader-A has one affiliation row → affiliation signal = 1.
        {
            "club_key": "club-a", "club_name": "Club A",
            "mirror_member_id": "100", "display_name": "Alpha Person",
            "alias": "", "member_name_raw": "Alpha Person",
            "member_name_norm": "alpha person",
            "matched_person_id": "p-a", "matched_person_name": "Alpha Person",
            "linkable_for_clubs": "1", "match_status": "MATCHED",
            "affiliation_confidence_score": "0.9",
            "inferred_role": "leader",
        },
        # Leader-B has no affiliation row → affiliation signal = 0.
    ]
    persons = [
        {
            "person_id": "p-a", "person_name": "Alpha Person",
            "person_name_norm": "alpha person",
            "ifpa_member_id": "", "country": "Canada",
            "first_year": "2010", "last_year": "2024",
            "membership_status": "", "membership_expiration": "",
            "membership_tier_provisional": "",
            "source_results_person": "1",
            "source_membership_linked": "0",
            "source_membership_only": "0",
            "linkable_for_clubs": "1",
        },
        {
            "person_id": "p-b", "person_name": "Beta Person",
            "person_name_norm": "beta person",
            "ifpa_member_id": "", "country": "Germany",
            "first_year": "2000", "last_year": "2005",
            "membership_status": "", "membership_expiration": "",
            "membership_tier_provisional": "",
            "source_results_person": "1",
            "source_membership_linked": "0",
            "source_membership_only": "0",
            "linkable_for_clubs": "1",
        },
    ]

    def write(name: str, rows: list[dict]) -> None:
        path = tmp_path / name
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)

    club_members = [
        # Alpha is on club-a's roster → roster signal = 1 for Leader-A.
        {"legacy_club_key": "club-a", "mirror_member_id": "100",
         "display_name": "Alpha Person", "alias": ""},
        {"legacy_club_key": "club-a", "mirror_member_id": "150",
         "display_name": "Someone Else", "alias": ""},
        # club-b's roster does NOT list Beta (200) → roster signal = 0.
        {"legacy_club_key": "club-b", "mirror_member_id": "201",
         "display_name": "Not Beta", "alias": ""},
    ]
    events = [
        # Club A hosted in 2021, inside Alpha's [2010, 2024] → hosting = 1.
        # Club B never hosted → hosting = 0 for Leader-B.
        {"host_club": "Club A", "year": "2021"},
    ]

    write("club_bootstrap_leaders.csv", leaders)
    write("legacy_club_candidates.csv", candidates)
    write("legacy_person_club_affiliations.csv", affiliations)
    write("persons_enriched_for_clubs.csv", persons)
    write("club_members.csv", club_members)
    write("events.csv", events)
    return tmp_path


def _run_script(fixture_dir: Path, out_path: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [
            sys.executable, str(SCRIPT_PATH),
            "--leaders-csv",      str(fixture_dir / "club_bootstrap_leaders.csv"),
            "--candidates-csv",   str(fixture_dir / "legacy_club_candidates.csv"),
            "--affiliations-csv", str(fixture_dir / "legacy_person_club_affiliations.csv"),
            "--persons-csv",      str(fixture_dir / "persons_enriched_for_clubs.csv"),
            "--club-members-csv", str(fixture_dir / "club_members.csv"),
            "--events-csv",       str(fixture_dir / "events.csv"),
            "--out-csv",          str(out_path),
        ],
        capture_output=True, text=True, check=False,
    )


def _read_out(out_path: Path) -> list[dict]:
    with out_path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def test_end_to_end_emits_seven_signals_per_leader(fixture_dir: Path, tmp_path: Path):
    out_path = tmp_path / "club_bootstrap_leader_signals.csv"
    result = _run_script(fixture_dir, out_path)
    assert result.returncode == 0, (
        f"script failed.\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )

    rows = _read_out(out_path)
    assert len(rows) == 14  # 2 leaders × 7 signals

    by_leader = {}
    for r in rows:
        by_leader.setdefault((r["club_key"], r["mirror_member_id"]), []).append(r)

    assert set(by_leader.keys()) == {("club-a", "100"), ("club-b", "200")}
    for sigs in by_leader.values():
        assert sorted(r["signal_type"] for r in sigs) == sorted(mod.SIGNAL_ORDER)


def test_end_to_end_signal_values_for_high_evidence_leader(fixture_dir: Path, tmp_path: Path):
    """Leader-A is constructed so every signal must fire."""
    out_path = tmp_path / "out.csv"
    _run_script(fixture_dir, out_path)
    rows = _read_out(out_path)

    a_signals = {r["signal_type"]: r for r in rows if r["club_key"] == "club-a"}
    for signal_type in mod.SIGNAL_ORDER:
        assert a_signals[signal_type]["is_present"] == "1", (
            f"club-a signal {signal_type!r} should be present"
        )


def test_end_to_end_signal_values_for_no_evidence_leader(fixture_dir: Path, tmp_path: Path):
    """Leader-B is constructed so every signal must be absent."""
    out_path = tmp_path / "out.csv"
    _run_script(fixture_dir, out_path)
    rows = _read_out(out_path)

    b_signals = {r["signal_type"]: r for r in rows if r["club_key"] == "club-b"}
    for signal_type in mod.SIGNAL_ORDER:
        assert b_signals[signal_type]["is_present"] == "0", (
            f"club-b signal {signal_type!r} should be absent"
        )


def test_end_to_end_payload_json_is_parseable(fixture_dir: Path, tmp_path: Path):
    out_path = tmp_path / "out.csv"
    _run_script(fixture_dir, out_path)
    rows = _read_out(out_path)
    for r in rows:
        parsed = json.loads(r["signal_payload_json"])
        assert isinstance(parsed, dict)


def test_end_to_end_idempotent(fixture_dir: Path, tmp_path: Path):
    """Running the script twice produces byte-identical output."""
    out1 = tmp_path / "out1.csv"
    out2 = tmp_path / "out2.csv"
    assert _run_script(fixture_dir, out1).returncode == 0
    assert _run_script(fixture_dir, out2).returncode == 0
    assert out1.read_bytes() == out2.read_bytes()


def test_end_to_end_actionable_error_on_missing_input(tmp_path: Path):
    """Per invariant 8: missing input must produce a non-zero exit and an
    operator-actionable error message."""
    result = subprocess.run(
        [
            sys.executable, str(SCRIPT_PATH),
            "--leaders-csv",      str(tmp_path / "does_not_exist.csv"),
            "--candidates-csv",   str(tmp_path / "x.csv"),
            "--affiliations-csv", str(tmp_path / "x.csv"),
            "--persons-csv",      str(tmp_path / "x.csv"),
            "--out-csv",          str(tmp_path / "out.csv"),
        ],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode != 0
    assert "ERROR" in result.stderr
    assert "does_not_exist.csv" in result.stderr

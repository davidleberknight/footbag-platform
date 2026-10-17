"""
test_club_candidates_carry_seed_state.py
========================================

The club-candidate builder carries each seed club's state into the candidates
file the enrichment loader reads.

Why this exists. A club the old site never made real becomes one when a member
confirms it during onboarding, and that promotion takes the candidate's own state
first. The seed records a state for every US and Canadian club, but the builder
once copied city and country and left the state behind, so every such member was
asked a question the data already settles, and the test site's claim tool had to
invent an answer.

Runs the builder's main() on small fixture inputs in a temporary directory; the
committed and generated club files are never read or written.

Run from repo root:
    python -m pytest legacy_data/tests/test_club_candidates_carry_seed_state.py -v
"""
from __future__ import annotations

import csv
import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
BUILDER = REPO_ROOT / "legacy_data" / "clubs" / "scripts" / "02_build_legacy_club_candidates.py"


def _load_builder():
    # The filename starts with a digit, so it is imported by path.
    spec = importlib.util.spec_from_file_location("build_legacy_club_candidates", BUILDER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _write(path: Path, header: list[str], rows: list[dict]) -> Path:
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=header, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return path


@pytest.fixture
def built_candidates(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, dict]:
    builder = _load_builder()
    seed_header = [
        "legacy_club_key", "name", "city", "region", "country", "contact_member_id",
        "external_url", "description", "created", "last_updated",
    ]
    clubs = _write(tmp_path / "clubs.csv", seed_header, [
        {"legacy_club_key": "9000001", "name": "Stated Club", "city": "Portland",
         "region": "Oregon", "country": "United States"},
        {"legacy_club_key": "9000002", "name": "Stateless Club", "city": "Helsinki",
         "region": "", "country": "Finland"},
    ])
    members = _write(tmp_path / "club_members.csv",
                     ["legacy_club_key", "mirror_member_id", "display_name", "alias"], [])
    persons = _write(tmp_path / "persons.csv",
                     ["person_id", "person_name", "person_name_norm", "last_year",
                      "linkable_for_clubs"], [])
    events = _write(tmp_path / "events.csv", ["event_key", "year", "host_club"], [])

    out_dir = tmp_path / "out"
    monkeypatch.setattr(builder, "CLUBS_CSV", clubs)
    monkeypatch.setattr(builder, "CLUB_MEMBERS_CSV", members)
    monkeypatch.setattr(builder, "PERSON_UNIVERSE_CSV", persons)
    monkeypatch.setattr(builder, "EVENTS_CSV", events)
    monkeypatch.setattr(builder, "AFFILIATIONS_CSV", tmp_path / "absent_affiliations.csv")
    # The committed overrides name real club keys these fixtures do not hold.
    monkeypatch.setattr(builder, "load_classification_overrides", lambda: {})
    monkeypatch.setattr(builder, "load_club_duplicate_overrides", lambda: set())
    monkeypatch.setattr(builder, "OUT_DIR", out_dir)
    monkeypatch.setattr(builder, "OUT_CSV", out_dir / "legacy_club_candidates.csv")

    builder.main([])

    with (out_dir / "legacy_club_candidates.csv").open(encoding="utf-8") as fh:
        return {row["club_key"]: row for row in csv.DictReader(fh)}


def test_the_seed_state_reaches_the_candidate(built_candidates: dict[str, dict]) -> None:
    assert built_candidates["9000001"].get("region") == "Oregon", (
        "a seed club's state did not reach its candidate row, so promotion would ask the member for it"
    )


def test_a_club_with_no_state_stays_blank(built_candidates: dict[str, dict]) -> None:
    assert built_candidates["9000002"].get("region") == ""

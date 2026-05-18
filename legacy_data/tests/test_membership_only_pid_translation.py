"""
test_membership_only_pid_translation.py
========================================

Unit tests for ``translate_membership_only_pid()`` in
``legacy_data/event_results/scripts/09_load_enrichment_to_sqlite.py``.

Background
----------
``clubs/scripts/01_build_club_person_universe.py`` emits
``membership_only::<sha1(name_norm)[:16]>`` IDs for membership-only
persons. ``persons/scripts/05_build_persons_master.py`` emits
``master_person::<sha1('master|' + source_types + '|' + name_norm)[:16]>``
for the same people. The two ID generators are independent, so the
``legacy_person_club_affiliations.matched_person_id`` FK to
``historical_persons.person_id`` misses for these rows and the loader
silently NULLs the link. This translation bridges the gap at loader
time by keying on the normalized name (consistent across both
upstream scripts).

The contract is small and pure: four input-shape outcomes.

Run from repo root:
    python -m pytest legacy_data/tests/test_membership_only_pid_translation.py -v
"""
from pathlib import Path
import importlib.util
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
LOADER_PATH = (
    REPO_ROOT / "legacy_data" / "event_results" / "scripts"
    / "09_load_enrichment_to_sqlite.py"
)


def _load_translate_function():
    """Import ``translate_membership_only_pid`` from the loader script.

    The script is on a numeric-prefixed path (``09_load_...``) so we
    load it via importlib rather than a normal import statement.
    """
    spec = importlib.util.spec_from_file_location(
        "loader_09",
        LOADER_PATH,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["loader_09"] = module
    spec.loader.exec_module(module)
    return module.translate_membership_only_pid


translate_membership_only_pid = _load_translate_function()


def test_translated_single_match() -> None:
    """Happy path: a membership_only::* ID with a unique name_norm match
    in persons_master returns the master_person::* ID + ``translated``.
    Mirrors the 41 / 42 drift victims in the live DB."""
    provisional_map = {"eric burton": ["master_person::74b6bba57d61a37a"]}
    known = {"master_person::74b6bba57d61a37a"}

    result_pid, outcome = translate_membership_only_pid(
        matched_pid="membership_only::abc123",
        member_name_norm="eric burton",
        provisional_name_to_pid=provisional_map,
        known_person_ids=known,
    )

    assert outcome == "translated"
    assert result_pid == "master_person::74b6bba57d61a37a"


def test_no_match_when_name_absent_from_persons_master() -> None:
    """When the name_norm has no PROVISIONAL row in persons_master,
    outcome is ``no_match``; caller falls back to NULL. Mirrors the 1
    orphan case (egoitz zelai) where the upstream persons-pipeline
    didn't promote the membership_only person to a master_person row."""
    provisional_map = {"someone else": ["master_person::aaa"]}
    known = {"master_person::aaa"}

    result_pid, outcome = translate_membership_only_pid(
        matched_pid="membership_only::abc123",
        member_name_norm="egoitz zelai",
        provisional_name_to_pid=provisional_map,
        known_person_ids=known,
    )

    assert outcome == "no_match"
    assert result_pid == ""


def test_ambiguous_when_multiple_provisional_share_name_norm() -> None:
    """When two distinct PROVISIONAL persons share the same name_norm
    (rare but possible: master_person_id depends on source_types so
    same name + different source_types → two rows), outcome is
    ``ambiguous`` and caller falls back to NULL. Never silently picks."""
    provisional_map = {
        "john smith": [
            "master_person::aaa1111111111111",
            "master_person::bbb2222222222222",
        ]
    }
    known = {
        "master_person::aaa1111111111111",
        "master_person::bbb2222222222222",
    }

    result_pid, outcome = translate_membership_only_pid(
        matched_pid="membership_only::xyz",
        member_name_norm="john smith",
        provisional_name_to_pid=provisional_map,
        known_person_ids=known,
    )

    assert outcome == "ambiguous"
    assert result_pid == ""


def test_not_applicable_for_non_membership_only_id() -> None:
    """A matched_pid that is not a ``membership_only::*`` ID (e.g. a
    canonical UUID or an unrecognized prefix) is left untranslated;
    caller preserves the existing fallback path. Guards against
    accidentally re-routing legitimate canonical IDs through the
    translation."""
    provisional_map = {"any name": ["master_person::aaa"]}
    known = {"master_person::aaa"}

    result_pid, outcome = translate_membership_only_pid(
        matched_pid="63cda333-9780-5bb4-a4f1-7618bf7fe937",
        member_name_norm="any name",
        provisional_name_to_pid=provisional_map,
        known_person_ids=known,
    )

    assert outcome == "not_applicable"
    assert result_pid == "63cda333-9780-5bb4-a4f1-7618bf7fe937"


def test_translation_target_must_be_loaded_in_historical_persons() -> None:
    """If persons_master has a name_norm → master_person_id entry but
    that master_person_id is NOT in known_person_ids (e.g. it was
    QC-skipped or dedup-skipped during the persons load), outcome is
    ``no_match`` (effectively the candidate is unreachable). Guards
    against translating to a non-existent FK target."""
    provisional_map = {"eric burton": ["master_person::not_loaded"]}
    known: set[str] = set()  # nothing loaded into historical_persons

    result_pid, outcome = translate_membership_only_pid(
        matched_pid="membership_only::abc123",
        member_name_norm="eric burton",
        provisional_name_to_pid=provisional_map,
        known_person_ids=known,
    )

    assert outcome == "no_match"
    assert result_pid == ""


def test_empty_member_name_norm_is_no_match() -> None:
    """Affiliation row with empty member_name_norm cannot be translated;
    outcome is ``no_match``. Pre-empts a dict.get('') lookup that
    happens to collide with an empty-name entry."""
    provisional_map = {"someone": ["master_person::aaa"]}
    known = {"master_person::aaa"}

    result_pid, outcome = translate_membership_only_pid(
        matched_pid="membership_only::abc123",
        member_name_norm="",
        provisional_name_to_pid=provisional_map,
        known_person_ids=known,
    )

    assert outcome == "no_match"
    assert result_pid == ""

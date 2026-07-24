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

The loader contract is small and pure: four input-shape outcomes. Both the
loader bridge and the two ID generators derive the name key from the one
canonical normalizer (``pipeline.identity.alias_resolver.normalize_name``);
these tests also pin that shared-key contract, so an accent-only or
spaced-hyphen spelling can never split one person across the two generators.

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


# The canonical normalizer both ID generators and the club/member join key
# derive their name key from. It sits at a clean package path, so a plain
# import works once legacy_data is importable.
sys.path.insert(0, str(REPO_ROOT / "legacy_data"))
from pipeline.identity.alias_resolver import normalize_name  # noqa: E402


def _load_attr(module_name: str, script_relpath: str, attr: str):
    """Load a single attribute from a numeric-prefixed pipeline script, which
    cannot be reached with a normal import statement."""
    spec = importlib.util.spec_from_file_location(
        module_name, REPO_ROOT / "legacy_data" / script_relpath
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return getattr(module, attr)


stable_membership_only_id = _load_attr(
    "club_person_universe",
    "clubs/scripts/01_build_club_person_universe.py",
    "stable_membership_only_id",
)
stable_master_person_id = _load_attr(
    "persons_master",
    "persons/scripts/05_build_persons_master.py",
    "stable_master_person_id",
)


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


# ── Canonical name-key contract ──────────────────────────────────────────
# Both ID generators and the club/member join derive their key from the one
# canonical normalizer, so a name written with accents, or with a spaced vs
# bare hyphen, collapses to a single key and the bridge cannot miss on a
# cosmetic spelling difference.


def test_normalize_folds_combining_mark_diacritics() -> None:
    """A name and its accent-stripped spelling normalize to one key, so
    accent-only variants resolve to the same person."""
    assert normalize_name("Bélanger") == "belanger"
    assert normalize_name("Bélanger") == normalize_name("Belanger")
    assert normalize_name("Julio García") == normalize_name("Julio Garcia")


def test_normalize_maps_spaced_and_bare_hyphen_to_one_key() -> None:
    """A hyphenated name resolves the same whether the source spells it with a
    bare hyphen, a spaced hyphen, or doubled separators."""
    for variant in ("Jean-Pierre", "Jean - Pierre", "Jean  -  Pierre",
                    "Jean- Pierre"):
        assert normalize_name(variant) == "jean pierre"


def test_normalize_is_idempotent() -> None:
    """Normalizing an already-normalized key returns it unchanged."""
    for raw in ("Bélanger", "Jean - Pierre", "Rafał", ""):
        once = normalize_name(raw)
        assert normalize_name(once) == once


def test_stroke_letters_are_not_transliterated() -> None:
    """NFKD folds combining-mark diacritics but leaves non-decomposable stroke
    letters intact; reconciling those to a base letter is the alias layer's
    job, not this normalizer's. The key stays consistent across both id-mint
    sides, so no bridge miss is introduced for these names."""
    assert normalize_name("Rafał") == "rafał"
    assert normalize_name("Bjørn") == "bjørn"
    assert normalize_name("Rafał") != normalize_name("Rafal")


def test_both_id_generators_collapse_accent_and_hyphen_variants_identically() -> None:
    """Given the canonical key, the membership-only and master-person ID
    generators each map accent and spaced-hyphen variants of a name to a single
    ID, so the two independent generators stay in step."""
    a, b = "Jean-Pierre Bélanger", "Jean - Pierre Belanger"
    ka, kb = normalize_name(a), normalize_name(b)
    assert ka == kb
    assert stable_membership_only_id(ka) == stable_membership_only_id(kb)
    assert stable_master_person_id(ka, "CLUB") == stable_master_person_id(kb, "CLUB")


def test_club_member_join_key_equals_canonical_person_key() -> None:
    """The club/member affiliation join keys a raw member name through the same
    canonical normalizer that produced the person universe key, so an accented
    member name joins its accent-stripped person row."""
    member_side = normalize_name("Sébastien Prahin")    # club roster spelling
    person_side = normalize_name("Sebastien Prahin")    # person universe spelling
    assert member_side == person_side == "sebastien prahin"


def test_spaced_hyphen_variants_bridge_through_shared_canonical_key() -> None:
    """A membership-only affiliation whose member name uses a spaced hyphen
    resolves to the master-person row minted from the bare-hyphen spelling,
    because both sides share the one canonical key. This is the spaced-hyphen
    case the bridge must resolve to a non-NULL link."""
    master_id = stable_master_person_id(normalize_name("Jean-Pierre"), "CLUB")
    provisional_map = {normalize_name("Jean-Pierre"): [master_id]}
    known = {master_id}

    result_pid, outcome = translate_membership_only_pid(
        matched_pid=stable_membership_only_id(normalize_name("Jean - Pierre")),
        member_name_norm=normalize_name("Jean - Pierre"),
        provisional_name_to_pid=provisional_map,
        known_person_ids=known,
    )
    assert outcome == "translated"
    assert result_pid == master_id

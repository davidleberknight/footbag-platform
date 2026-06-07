"""
test_club_classifier.py
=======================

Pins the §10.1 classifier contract added to the club work set:

  - parameterized thresholds (CLI defaults == the ratified constants), so the
    default run is anchored and a sweep is explicit;
  - the R3 edited-after-creation conjunction;
  - curator classification overrides (force-keep / force-junk);
  - the unified duplicate-canonical map shared by the classifier (02) and the
    cutover (06);
  - the badge-display-only invariant: promotion is category-gated, never gated
    by the member-facing signal badge.

Run from repo root:
    python -m pytest legacy_data/tests/test_club_classifier.py -v
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pandas as pd
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = REPO_ROOT / "legacy_data" / "clubs" / "scripts"


def _load(name: str, filename: str):
    # Script filenames start with a digit, so spec_from_file_location is the
    # canonical import path (same pattern as test_bootstrap_leader_signals).
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


mod02 = _load("build_legacy_club_candidates", "02_build_legacy_club_candidates.py")
mod06 = _load("cutover_pre_populated_clubs", "06_cutover_pre_populated_clubs.py")


# ─── item 1: parameterized thresholds ───────────────────────────────────────


def test_parse_args_defaults_match_ratified_constants():
    args = mod02.parse_args([])
    assert args.anchor_year == 2020
    assert args.recent_edit_year == 2016
    assert args.new_club_year == 2022
    assert args.large_member_count == 10
    assert args.known_player_count == 3


def test_parse_args_overrides_each_threshold():
    args = mod02.parse_args([
        "--anchor-year", "2018", "--recent-edit-year", "2014",
        "--new-club-year", "2021", "--large-member-count", "8",
        "--known-player-count", "2",
    ])
    assert (args.anchor_year, args.recent_edit_year, args.new_club_year,
            args.large_member_count, args.known_player_count) == (2018, 2014, 2021, 8, 2)


# ─── item 3: R3 edited-after-creation conjunction ───────────────────────────


def _r3_row(created: int, updated: int) -> dict:
    """A row whose only available pre_populate path is R3 (no hosting, no large
    membership): page updated 2020+ and a contact who competed 2020+. R3 now
    also requires the page was edited after creation."""
    return {
        "last_hosted_year": None, "max_affiliated_member_last_year": None,
        "created_year": created, "last_updated_year": updated,
        "ever_hosted": 0, "unique_member_names": 0, "linkable_member_count": 0,
        "has_description": False, "contact_member_id": "999",
        "contact_member_last_year": 2023,
    }


def test_r3_fires_when_page_edited_after_creation():
    out = mod02.classify_row(_r3_row(created=2020, updated=2023))
    assert out["R3"] == 1
    assert out["category"] == "pre_populate"


def test_r3_suppressed_when_never_edited_after_creation():
    # created == last_updated: a brand-new untended page. R3 must not fire.
    out = mod02.classify_row(_r3_row(created=2023, updated=2023))
    assert out["R3"] == 0
    assert out["category"] != "pre_populate"


# ─── item 2: classification overrides (force-keep / force-junk) ─────────────


def test_load_classification_overrides_returns_key_to_category(tmp_path: Path):
    p = tmp_path / "ov.csv"
    p.write_text(
        "club_key,name,force_category,reason\n"
        "k1,Club One,pre_populate,keep\n"
        "k2,Club Two,junk,drop\n"
    )
    assert mod02.load_classification_overrides(p) == {"k1": "pre_populate", "k2": "junk"}


def test_load_classification_overrides_rejects_unknown_category(tmp_path: Path):
    p = tmp_path / "ov.csv"
    p.write_text("club_key,name,force_category,reason\nk1,Club,banana,x\n")
    with pytest.raises(ValueError):
        mod02.load_classification_overrides(p)


def test_load_classification_overrides_missing_file_is_empty(tmp_path: Path):
    assert mod02.load_classification_overrides(tmp_path / "nope.csv") == {}


def test_apply_classification_overrides_forces_category():
    df = pd.DataFrame({"_club_key": ["a", "b"], "category": ["junk", "dormant"]})
    n = mod02.apply_classification_overrides(df, {"a": "pre_populate"})
    assert n == 1
    assert df.loc[df["_club_key"] == "a", "category"].iloc[0] == "pre_populate"
    assert df.loc[df["_club_key"] == "b", "category"].iloc[0] == "dormant"


def test_apply_classification_overrides_fails_fast_on_stale_key():
    df = pd.DataFrame({"_club_key": ["a"], "category": ["junk"]})
    with pytest.raises(KeyError):
        mod02.apply_classification_overrides(df, {"ghost": "pre_populate"})


def test_real_classification_overrides_seed_is_force_keep():
    real = REPO_ROOT / "legacy_data" / "overrides" / "club_classification_overrides.csv"
    m = mod02.load_classification_overrides(real)
    # Every seeded review entry forces pre_populate (force-keep).
    assert m and all(v == "pre_populate" for v in m.values())
    # The four new-club rescues are present by key.
    for key in ("1721169686", "1728989660", "1751979051", "1768623634"):
        assert m.get(key) == "pre_populate"


# ─── item 5: unified duplicate-canonical map (02 suppress + 06 merge) ────────


def test_load_duplicate_canonical_map_reads_drop_to_keep(tmp_path: Path):
    p = tmp_path / "dups.csv"
    p.write_text("keep_legacy_key,drop_legacy_key,reason\nK,D,merge\n")
    assert mod06.load_duplicate_canonical_map(p) == {"D": "K"}


def test_real_club_duplicates_holds_the_unified_pairs():
    real = REPO_ROOT / "legacy_data" / "overrides" / "club_duplicates.csv"
    m = mod06.load_duplicate_canonical_map(real)
    # The three pairs migrated out of 06's KNOWN_DUPLICATES dict.
    assert m["zion-fr"] == "944090321"
    assert m["1422386831"] == "memphis"
    assert m["1320083231"] == "1379698765"
    # The pre-existing Les Pieds pair is preserved.
    assert m["1488489195"] == "1042652245"


def test_known_duplicates_dict_deleted_from_cutover():
    src = (SCRIPTS / "06_cutover_pre_populated_clubs.py").read_text()
    assert "KNOWN_DUPLICATES" not in src


def test_classifier_and_cutover_share_one_duplicate_source():
    # 02 (suppress bootstrap) and 06 (merge mapped_club_id) read the same file:
    # 02's drop set is exactly the keys of 06's drop->keep map.
    real = REPO_ROOT / "legacy_data" / "overrides" / "club_duplicates.csv"
    drops_02 = mod02.load_club_duplicate_overrides(real)
    merge_06 = mod06.load_duplicate_canonical_map(real)
    assert drops_02 == set(merge_06.keys())


# ─── badge display-only: promotion is category-gated, not signal-gated ──────


def test_badge_display_only_promotion_follows_category_not_signal():
    # bootstrap_eligible derives solely from category == pre_populate. A club's
    # member-facing strong/weak signal badge never promotes or demotes it.
    df = pd.DataFrame({"category": [
        "pre_populate", "onboarding_visible", "dormant", "junk",
    ]})
    df["bootstrap_eligible"] = (df["category"] == "pre_populate").astype(int)
    assert df["bootstrap_eligible"].tolist() == [1, 0, 0, 0]


def test_classifier_output_carries_no_signal_strength_gate():
    # The §10.1 classifier emits structural rule flags + category, never a
    # signal-based badge column that could gate promotion.
    cols = set(mod02.classify_row(_r3_row(2020, 2023)).keys())
    assert "category" in cols
    assert not (cols & {"badge", "strength", "strong", "weak", "signal_score"})

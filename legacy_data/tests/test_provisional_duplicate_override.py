"""
test_provisional_duplicate_override.py
======================================

Pins the curated duplicate-account override that merges one person's several
legacy accounts into one archival identity, and the guard that refuses to build
an archival identity carrying candidates nobody has ruled on.

Background
----------
A person who registered on the legacy site more than once reaches the provisional
stage as one candidate per account, because the candidate key is the account id.
The archival id minted downstream hashes the normalized name together with the
source-type string, so two accounts holding the same name collapse into a single
row and the enrichment loader keeps whichever arrived first. That is the right
answer when the accounts are one person and the wrong answer when they are two
people who share a name: the second person's record disappears, whoever claims
first takes the survivor, and the at-most-one-member-per-person index makes that
permanent.

Only a human can tell those apart, so the ruling lives in
``overrides/provisional_person_duplicates.csv``, which no pipeline stage writes,
and the retired accounts are pointed at the kept account before identities are
minted. Anything still sharing an archival id after that is unruled and stops the
build.

Schema: ``keep_mirror_member_id,drop_mirror_member_id,reason``. The reason column
records the evidence for audit and drives nothing.

Tests covered
-------------
  1. ``load_duplicate_account_overrides`` parses the CSV into retired -> kept,
     skips a row missing either id, and returns nothing for a missing file.
  2. Account ids compare by their digits, so the curated ``66932`` matches a
     column a CSV round-trip rendered as ``66932.0``.
  3. ``apply_duplicate_account_overrides`` re-points the retired rows onto the
     kept account and marks them, so the merged identity keeps the kept
     account's displayed name.
  4. An override naming an account the rosters no longer carry stops the run
     rather than silently merging nothing.
  5. ``assert_no_fused_provisional_persons`` passes on distinct ids and stops the
     build when one archival id carries more than one candidate.
  6. The committed override file parses and names distinct accounts.

Run from repo root:
    legacy_data/footbag_venv/bin/python -m pytest \\
        legacy_data/tests/test_provisional_duplicate_override.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pandas as pd
import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
CANDIDATES_SCRIPT = (
    REPO_ROOT / "legacy_data" / "persons" / "provisional" / "scripts"
    / "02_build_provisional_identity_candidates.py"
)
MASTER_SCRIPT = (
    REPO_ROOT / "legacy_data" / "persons" / "scripts" / "05_build_persons_master.py"
)
COMMITTED_OVERRIDES = (
    REPO_ROOT / "legacy_data" / "overrides" / "provisional_person_duplicates.csv"
)


def _load(path: Path, name: str):
    """Import a numerically-prefixed pipeline script by path."""
    sys.path.insert(0, str(REPO_ROOT / "legacy_data"))
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def candidates():
    return _load(CANDIDATES_SCRIPT, "build_provisional_identity_candidates")


@pytest.fixture(scope="module")
def master():
    return _load(MASTER_SCRIPT, "build_persons_master")


def _write_overrides(tmp_path: Path, rows: str) -> Path:
    path = tmp_path / "provisional_person_duplicates.csv"
    path.write_text(
        "keep_mirror_member_id,drop_mirror_member_id,reason\n" + rows,
        encoding="utf-8",
    )
    return path


def _roster(pairs) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {"person_name": name, "mirror_member_id": member_id}
            for member_id, name in pairs
        ]
    )


def test_overrides_parse_into_retired_to_kept(candidates, tmp_path):
    path = _write_overrides(
        tmp_path,
        "111,222,one person who registered twice\n"
        "333,444,another\n",
    )
    assert candidates.load_duplicate_account_overrides(path) == {
        "222": "111",
        "444": "333",
    }


def test_row_missing_either_account_rules_nothing(candidates, tmp_path):
    path = _write_overrides(
        tmp_path,
        "111,,no retired account named\n"
        ",222,no kept account named\n"
        "333,444,complete\n",
    )
    assert candidates.load_duplicate_account_overrides(path) == {"444": "333"}


def test_missing_file_merges_nothing(candidates, tmp_path):
    assert candidates.load_duplicate_account_overrides(tmp_path / "absent.csv") == {}


def test_account_ids_compare_by_their_digits(candidates):
    assert candidates.norm_member_id("66932.0") == "66932"
    assert candidates.norm_member_id(66932) == "66932"
    assert candidates.norm_member_id("  66932 ") == "66932"
    assert candidates.norm_member_id("") == ""


def test_retired_account_is_repointed_and_marked(candidates):
    df = _roster([("111.0", "Kept Name"), ("222.0", "kept name"), ("999.0", "Other")])

    n_merged = candidates.apply_duplicate_account_overrides(df, {"222": "111"})

    assert n_merged == 1
    assert list(df["mirror_member_id"]) == ["111.0", "111.0", "999.0"]
    assert list(df["_retired_account"]) == [False, True, False]


def test_no_overrides_leaves_every_row_alone(candidates):
    df = _roster([("111.0", "Kept Name"), ("222.0", "Other")])

    assert candidates.apply_duplicate_account_overrides(df, {}) == 0
    assert list(df["mirror_member_id"]) == ["111.0", "222.0"]
    assert list(df["_retired_account"]) == [False, False]


def test_stale_override_stops_the_run(candidates):
    df = _roster([("111.0", "Kept Name"), ("999.0", "Other")])

    with pytest.raises(SystemExit) as excinfo:
        candidates.apply_duplicate_account_overrides(df, {"222": "111"})

    assert "222 -> 111" in str(excinfo.value)


def _provisional_rows(pairs) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {"master_person_id": person_id, "person_name": name}
            for person_id, name in pairs
        ]
    )


def test_distinct_identities_pass_the_guard(master):
    rows = _provisional_rows(
        [("master_person::aaa", "One Person"), ("master_person::bbb", "Another")]
    )

    master.assert_no_fused_provisional_persons(rows)


def test_empty_input_passes_the_guard(master):
    master.assert_no_fused_provisional_persons(pd.DataFrame())


def test_unruled_shared_identity_stops_the_build(master):
    rows = _provisional_rows(
        [
            ("master_person::aaa", "Same Name"),
            ("master_person::aaa", "Same Name"),
            ("master_person::bbb", "Another"),
        ]
    )

    with pytest.raises(SystemExit) as excinfo:
        master.assert_no_fused_provisional_persons(rows)

    message = str(excinfo.value)
    assert "master_person::aaa" in message
    assert "provisional_person_duplicates.csv" in message


def test_committed_overrides_name_distinct_accounts(candidates):
    pairs = candidates.load_duplicate_account_overrides(COMMITTED_OVERRIDES)

    assert pairs, "the committed override file records no rulings"
    for retired, kept in pairs.items():
        assert retired != kept
    assert not set(pairs) & set(pairs.values()), (
        "an account is both retired and kept, so the merge target depends on row order"
    )

"""A roster-derived person carries the legacy account its roster row links to.

A club roster or membership row names the member's legacy account, and the
provisional identity built from it is keyed by that account. The persons master
list carries the account through, so the account's repaired name can reach the
person later; an identity keyed only by a name carries none.

Run from repo root:
    python -m pytest legacy_data/tests/test_roster_person_account_link.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
MASTER_SCRIPT = REPO_ROOT / "legacy_data" / "persons" / "scripts" / "05_build_persons_master.py"
CANDIDATES_SCRIPT = (REPO_ROOT / "legacy_data" / "persons" / "provisional" / "scripts"
                     / "02_build_provisional_identity_candidates.py")


def _load(path: Path, name: str):
    sys.path.insert(0, str(REPO_ROOT / "legacy_data"))
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _candidate(identity: str, name: str, account: str) -> dict:
    return {"provisional_identity_id": identity, "canonical_candidate_name": name,
            "canonical_candidate_name_norm": name.lower(), "source_types": "CLUB",
            "staged_row_count": "1", "membership_row_count": "0", "club_row_count": "1",
            "mirror_member_id_count": "1" if account else "0", "mirror_member_id": account,
            "confidence": "medium", "promotion_status": "STAGED",
            "matched_historical_person_id": "", "matched_historical_person_name": "",
            "match_status": "", "match_rule": "", "match_score": "", "candidate_count": "",
            "review_needed": ""}


def test_the_persons_master_carries_the_roster_account():
    # Defect caught: the account link dropped, so a repaired account name has no
    # way to reach the roster person.
    master = _load(MASTER_SCRIPT, "build_persons_master_account_link")
    rows = master.build_provisional_rows(pd.DataFrame([
        _candidate("prov_identity::a", "Qxyzzy Alphaplayer", "70001"),
        _candidate("prov_identity::b", "Qxyzzy Betaplayer", ""),
    ]), pd.DataFrame())
    by_name = dict(zip(rows["person_name"], rows["legacy_member_id"]))
    assert by_name == {"Qxyzzy Alphaplayer": "70001", "Qxyzzy Betaplayer": ""}


def test_an_identity_keyed_by_an_account_records_that_account(tmp_path, monkeypatch):
    # Defect caught: the candidate step grouping rows by an account and then
    # discarding which account it was.
    cands = _load(CANDIDATES_SCRIPT, "build_provisional_candidates_account_link")
    src = tmp_path / "provisional_persons_master.csv"
    pd.DataFrame([
        {"person_name": "Qxyzzy Alphaplayer", "person_name_norm": "qxyzzy alphaplayer",
         "source_type": "CLUB", "mirror_member_id": "70001.0"},
        {"person_name": "Qxyzzy Betaplayer", "person_name_norm": "qxyzzy betaplayer",
         "source_type": "MEMBERSHIP", "mirror_member_id": ""},
    ]).to_csv(src, index=False)
    out = tmp_path / "provisional_identity_candidates.csv"
    monkeypatch.setattr(cands, "IN", src)
    monkeypatch.setattr(cands, "OUT", out)
    monkeypatch.setattr(cands, "load_duplicate_account_overrides", lambda *a, **k: {})
    cands.main()
    got = pd.read_csv(out, dtype=str).fillna("")
    assert dict(zip(got["canonical_candidate_name"], got["mirror_member_id"])) == {
        "Qxyzzy Alphaplayer": "70001", "Qxyzzy Betaplayer": ""}

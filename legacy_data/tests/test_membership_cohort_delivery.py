"""The membership-only person cohort's audited partition for the delivered dump.

Separate from the adjudication contract tests on purpose. Those fix the rules and
hold for any source; these count what the rules find in the dump currently
delivered. A later delivery can legitimately change every number here without any
rule having weakened, and when it does these counts are re-audited rather than
relaxed.

The generic gate and this audit answer different questions. The gate refuses a
load in which any cohort person is neither proposed nor ruled on, whatever the
numbers are. This says whether today's known partition has moved.

The dump is operator-supplied and reachable only where a maintainer has put it, so
these skip where it is absent. A run that declares it owns one fails instead.
"""
import csv
import importlib.util
import os
import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
_SCRIPTS = _ROOT / "legacy_data" / "member_data_scripts"

REQUIRE_ENV = "FOOTBAG_REQUIRE_DUMP"

# The audited partition for the delivery in hand.
#
# Four membership names that once entered this cohort no longer reach it: they
# were the same humans as canonical people under a different spelling, and the
# curated consolidation now resolves them upstream, so the provisional builder
# never emits a stub for them. They needed a disposition only for as long as they
# existed as separate identities. Every person still awaiting one holds no site
# account, which is why the duplicate bucket below is empty rather than small.
COHORT = 268
STAGE_B_PROPOSALS = 152
STAGE_B_REVIEW_ROWS = 0
EXPLICIT_DISPOSITIONS = 116


def _load(name):
    if name in sys.modules:
        return sys.modules[name]
    if str(_SCRIPTS) not in sys.path:
        sys.path.insert(0, str(_SCRIPTS))
    spec = importlib.util.spec_from_file_location(name, _SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


rlm = _load("reconcile_legacy_members")
plh = _load("person_link_hold")


def _require(reason: str):
    if os.environ.get(REQUIRE_ENV, "").strip() == "1":
        pytest.fail(f"{REQUIRE_ENV}=1 declares this run owns a delivery: {reason}")
    pytest.skip(reason)


@pytest.fixture(scope="module")
def delivery():
    """The cohort as the reconciler sees it against the delivered dump."""
    members_csv = _SCRIPTS / "out" / "legacy_members_final.csv"
    db = _ROOT / "database" / "footbag.db"
    if not members_csv.is_file():
        _require(f"no extracted member CSV at {members_csv}; run "
                 "run_legacy_members.sh --extract first")
    if not db.is_file():
        _require(f"no built database at {db}")
    with members_csv.open(encoding="utf-8", newline="") as f:
        accounts = list(csv.DictReader(f))
    hps = rlm.read_historical_persons(db)
    cohort = rlm.membership_provisional_person_ids(hps)
    if not cohort:
        _require("the built database carries no membership-provisional persons")
    proposed, review = rlm.build_stage_b(accounts, hps)
    descriptors = rlm._build_person_disposition_descriptors(
        proposed, review, accounts, hps, cohort_person_ids=cohort)
    return {
        "cohort": cohort,
        "proposed": {p["historical_person_id"] for p in proposed} & cohort,
        "review": {r["historical_person_id"] for r in review} & cohort,
        "awaiting": descriptors,
    }


def test_the_cohort_is_the_audited_size(delivery):
    assert len(delivery["cohort"]) == COHORT


def test_stage_b_resolves_the_audited_share_unambiguously(delivery):
    assert len(delivery["proposed"]) == STAGE_B_PROPOSALS


def test_no_cohort_person_sits_in_the_review_queue(delivery):
    # A review row inside this cohort is unresolved and would block the final
    # load. None exist today; if one appears, it needs a ruling, not a relaxation.
    assert len(delivery["review"]) == STAGE_B_REVIEW_ROWS


def test_the_remainder_needs_an_explicit_disposition(delivery):
    assert len(delivery["awaiting"]) == EXPLICIT_DISPOSITIONS


def test_the_partition_covers_the_whole_cohort(delivery):
    # The arithmetic is the point: every cohort person is either resolved
    # mechanically or waiting on a human, with nobody in neither bucket.
    assert STAGE_B_PROPOSALS + EXPLICIT_DISPOSITIONS == COHORT
    accounted = delivery["proposed"] | {d["candidate_person_id"] for d in delivery["awaiting"]}
    assert accounted == delivery["cohort"]


def test_a_drafted_disposition_set_satisfies_the_gate(tmp_path, delivery):
    # End to end: the proposal tool's output loads, validates against the live
    # boundary, and closes the cohort.
    import subprocess

    out = tmp_path / "dispositions.csv"
    r = subprocess.run(
        [sys.executable, str(_SCRIPTS / "propose_person_dispositions.py"),
         "--members-csv", str(_SCRIPTS / "out" / "legacy_members_final.csv"),
         "--db", str(_ROOT / "database" / "footbag.db"), "--out", str(out)],
        capture_output=True, text=True, cwd=str(_ROOT))
    assert r.returncode == 0, r.stderr
    holds = plh.load_holds(out)
    assert len(holds) == EXPLICIT_DISPOSITIONS
    by_decision = {}
    for h in holds:
        by_decision[h.decision] = by_decision.get(h.decision, 0) + 1
    # No duplicate bucket: a membership name that is really a canonical person
    # under another spelling is consolidated upstream and never reaches the
    # cohort, so nothing is left here to rule on. The check below still stands,
    # because a duplicate arriving again would be a new identity conflict and
    # must name the person it duplicates rather than being waved through.
    assert by_decision == {plh.NO_ACCOUNT: EXPLICIT_DISPOSITIONS}
    for h in holds:
        if h.decision == plh.DUPLICATE_PERSON:
            assert h.duplicate_of_person_id, h
    plh.assert_every_person_dispositioned(delivery["awaiting"], holds)

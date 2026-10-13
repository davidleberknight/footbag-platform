#!/usr/bin/env python3
"""The audited results for the delivered member data, checked on the machine
that holds it.

The behaviour of the member scripts is pinned by the ordinary test suite on
synthetic data, which holds for any delivery. This checks something else: what
those rules found in the delivery actually in hand, so a later run that moves
any of it has to say so rather than drifting quietly. When a new delivery
legitimately changes a figure, it is re-audited and updated here, never relaxed.

It reads only data that is not part of the project: the vetted members CSV the
legacy refresh wrote into the private checkout, the recorded rulings there, the
member intake's own output and the built database. That is why it runs from the
real-data row of the test runner rather than from the test suite, which judges
committed files only.

Output is counts and PASS/FAIL lines only: no member id, name or address is
ever printed, because the runner withholds and fails any output carrying an
address. Exit status is 0 when every check passes and 1 otherwise.

Usage:
    audit_member_data.py [--db PATH]
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MDS = ROOT / "legacy_data" / "member_data_scripts"
PRIVATE = ROOT / "footbag_private_repo"
DELIVERED_MEMBERS = PRIVATE / "legacy-export" / "members" / "members.csv"
DISPOSITIONS = PRIVATE / "private_data" / "stage_a_overrides" / "member_row_dispositions.csv"
FINAL_MEMBERS = MDS / "out" / "legacy_members_final.csv"

if str(MDS) not in sys.path:
    sys.path.insert(0, str(MDS))


def _load(name: str):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, MDS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


# ── the audited figures for the delivery in hand ─────────────────────────────

EXPORT_RECORDS = 33_665

# The uncovered member rows: the system fixture account, absent from the export
# by design and covered by design, so it needs no recorded ruling (a historical
# person depends on it, which is why it stays); and two club-roster contacts whose
# accounts were created after the export snapshot, each carrying a recorded keep.
UNCOVERED_ROWS = 3
FIXTURE_ID = "STUB_FOOTBAG_HACKY"
FIXTURE_PERSON = "person_272d84cba03638d83876f8c5"
EXCLUSIONS = MDS / "out" / "legacy_export_exclusions.csv"

# The name-encoding repair. Members and field values are different counts: a
# member can have several fields repaired, and a member can have one field
# repaired and another left in the residue, so the two populations overlap.
AFFECTED_NAME_MEMBERS = 161
BY_CLEAN_COMPANION = 131
BY_REVERSAL = 6
BY_UNDAMAGED_COMPANION = 2
BLOCKED_IN_REPAIR_CLASS = 0
BY_CURATED_CODEPAGE = 26
AFFECTED_CITY_MEMBERS = 0
RESIDUAL_PROBLEM_VALUES = 5
RESIDUAL_PROBLEM_MEMBERS = 5
# The five whose names lost a character before the dump was taken. Naming an
# encoding cannot restore it, so they are never in the curated codepage file.
DESTROYED_IDS = {"64656", "65997", "66007", "79457", "83072"}
# Two members recovered from an intact companion column because the preferred
# value carries a destroyed character, and one repaired as far as the evidence
# allows and still listed as unresolved.
RECOVERED_FROM_COMPANION = {"37326": "Aleksi Öhman", "81189": "Ulrike Häßler"}
PARTLY_REPAIRED = ("83072", "Marek Barnabá?", "BarnabÃ¡?")

# The membership-only person cohort. Every person is either resolved
# mechanically or waiting on an explicit ruling, with nobody in neither bucket.
COHORT = 267
STAGE_B_PROPOSALS = 234
STAGE_B_REVIEW_ROWS = 25
EXPLICIT_DISPOSITIONS = 33


class AuditFailure(Exception):
    """A check's finding. The message carries counts only."""


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise AuditFailure(message)


def require(path: Path, what: str) -> None:
    if not path.is_file():
        raise AuditFailure(f"{what} is missing; it is expected under {path.parent.name}/")


def _rows(path: Path) -> list[dict]:
    csv.field_size_limit(10_000_000)
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


# ── the checks ───────────────────────────────────────────────────────────────

def check_delivery_size(ctx: dict) -> str:
    n = len(ctx["delivered"])
    expect(n == EXPORT_RECORDS,
           f"the delivered export holds {n} records, not the audited {EXPORT_RECORDS}; "
           "re-audit rather than adjusting the figures")
    return f"{n} records"


def check_uncovered_row_ruling(ctx: dict) -> str:
    """Every uncovered row in the built database carries a decision, except the
    system fixture, which is covered by design. The disposition file is read when
    present; its absence is not a failure, only an undecided row is."""
    mrd = _load("member_row_disposition")
    rur = _load("report_uncovered_member_rows")
    uncovered = rur.collect(ctx["db"], rur.read_exclusions(EXCLUSIONS))
    holds = mrd.load_dispositions(DISPOSITIONS)
    try:
        mrd.apply_dispositions(uncovered, holds)
        mrd.assert_every_uncovered_row_dispositioned(uncovered, holds)
    except mrd.MemberRowDispositionError:
        undecided = sum(1 for u in uncovered
                        if u["legacy_member_id"] not in mrd.SYSTEM_FIXTURE_IDS
                        and u["legacy_member_id"] not in {h.legacy_member_id for h in holds})
        raise AuditFailure(
            f"{len(uncovered)} uncovered rows, {undecided} with no recorded decision, "
            f"{len(holds)} recorded; a recorded decision may also be stale") from None
    expect(len(uncovered) == UNCOVERED_ROWS,
           f"{len(uncovered)} uncovered rows, audited {UNCOVERED_ROWS}")
    fixture = next((u for u in uncovered if u["legacy_member_id"] == FIXTURE_ID), None)
    expect(fixture is not None, "the system fixture row is not among the uncovered rows")
    expect(FIXTURE_PERSON in fixture["dependent_person_ids"],
           "the historical person the system fixture exists for no longer depends on it")
    return f"{len(uncovered)} uncovered rows, {len(holds)} recorded, the system fixture covered by design"


def check_name_encoding_repair(ctx: dict) -> str:
    ex = _load("extract_legacy_members")
    encodings = ex.load_member_name_encodings()
    names = {ex.SELECTED_COMPANION: set(), ex.SELECTED_REVERSED: set(),
             ex.SELECTED_UNDAMAGED: set(), ex.SELECTED_LEFT: set(),
             ex.SELECTED_CURATED: set()}
    city_members: set[str] = set()
    problems: list[dict] = []
    real_name: dict[str, str] = {}
    still_double = 0
    for rec in ctx["delivered"]:
        mid = ex._val(rec, "MemberID")
        cp, fields = encodings.get(mid, (None, frozenset()))
        audit = ex.audit_record_encoding(rec, cp, fields)
        for base, how in audit["outcomes"].items():
            if how == ex.SELECTED_UNICODE:
                continue
            if base in ("MemberFirstName", "MemberMiddleName", "MemberLastName"):
                names[how].add(mid)
            elif base == "MemberCity":
                city_members.add(mid)
        problems.extend(audit["problems"])
        name = ex.map_record(rec, None, encodings, {})["real_name"]
        real_name[mid] = name
        if name and ex._undouble(name) is not None and "?" not in name:
            still_double += 1

    repaired = set().union(*names.values())
    expect(len(repaired) == AFFECTED_NAME_MEMBERS,
           f"{len(repaired)} members' names repaired, audited {AFFECTED_NAME_MEMBERS}")
    for how, audited in ((ex.SELECTED_COMPANION, BY_CLEAN_COMPANION),
                         (ex.SELECTED_REVERSED, BY_REVERSAL),
                         (ex.SELECTED_UNDAMAGED, BY_UNDAMAGED_COMPANION),
                         (ex.SELECTED_LEFT, BLOCKED_IN_REPAIR_CLASS),
                         (ex.SELECTED_CURATED, BY_CURATED_CODEPAGE)):
        expect(len(names[how]) == audited,
               f"{len(names[how])} members resolved by '{how}', audited {audited}")
    expect(len(city_members) == AFFECTED_CITY_MEMBERS,
           f"{len(city_members)} members' cities need repair, audited {AFFECTED_CITY_MEMBERS}")

    problem_ids = {p["legacy_member_id"] for p in problems}
    expect(len(problems) == RESIDUAL_PROBLEM_VALUES and len(problem_ids) == RESIDUAL_PROBLEM_MEMBERS,
           f"{len(problems)} residual values on {len(problem_ids)} members, audited "
           f"{RESIDUAL_PROBLEM_VALUES} on {RESIDUAL_PROBLEM_MEMBERS}")
    # The residue is the destroyed names, left out of the curated file so an
    # administrator's help request is their route, and still visibly damaged.
    expect(DESTROYED_IDS <= problem_ids, "a destroyed name is missing from the residue")
    expect(not DESTROYED_IDS & set(encodings), "a destroyed name was given a codepage")
    for p in problems:
        expect("?" in p["stored_plain_column"], "a residual value no longer carries its lost character")
        if p["column"] in ("MemberFirstName", "MemberMiddleName", "MemberLastName"):
            expect("?" in real_name[p["legacy_member_id"]],
                   "a residual name reaches the output without its visible damage")
    expect(problem_ids != repaired, "the residue and the repaired population read as one")

    mid, expected_name, stored_unicode = PARTLY_REPAIRED
    listed = [p for p in problems if p["legacy_member_id"] == mid]
    expect(real_name.get(mid) == expected_name and len(listed) == 1
           and listed[0]["resolution"] == ex.SELECTED_COMPANION
           and listed[0]["stored_unicode_column"] == stored_unicode,
           "the partly repaired name is not both repaired and still listed")
    for rid, expected in RECOVERED_FROM_COMPANION.items():
        expect(real_name.get(rid) == expected, "a companion-column recovery did not reach the output")
    expect(still_double == 0, f"{still_double} repaired names still carry a double encoding")
    return (f"{len(repaired)} names repaired, {len(problems)} residual values "
            f"on {len(problem_ids)} members")


def check_membership_cohort(ctx: dict) -> str:
    rlm = _load("reconcile_legacy_members")
    plh = _load("person_link_hold")
    require(FINAL_MEMBERS, "the member intake's final CSV (run_legacy_members.sh --extract)")
    accounts = _rows(FINAL_MEMBERS)
    hps = rlm.read_historical_persons(ctx["db"])
    cohort = rlm.membership_provisional_person_ids(hps)
    proposed, review = rlm.build_stage_b(accounts, hps)
    awaiting = rlm._build_person_disposition_descriptors(
        proposed, review, accounts, hps, cohort_person_ids=cohort)
    proposed_ids = {p["historical_person_id"] for p in proposed} & cohort
    review_ids = {r["historical_person_id"] for r in review} & cohort

    expect(len(cohort) == COHORT, f"cohort of {len(cohort)}, audited {COHORT}")
    expect(len(proposed_ids) == STAGE_B_PROPOSALS,
           f"{len(proposed_ids)} resolved unambiguously, audited {STAGE_B_PROPOSALS}")
    expect(len(review_ids) == STAGE_B_REVIEW_ROWS,
           f"{len(review_ids)} in the review queue, audited {STAGE_B_REVIEW_ROWS}")
    expect(len(awaiting) == EXPLICIT_DISPOSITIONS,
           f"{len(awaiting)} awaiting a ruling, audited {EXPLICIT_DISPOSITIONS}")
    accounted = proposed_ids | {d["candidate_person_id"] for d in awaiting}
    expect(accounted == cohort, f"{len(cohort - accounted)} cohort people in neither bucket")

    # End to end: the proposal tool's draft loads, validates against the live
    # boundary and closes the cohort, flagging every person under review.
    with tempfile.TemporaryDirectory(prefix="footbag-audit-") as tmp:
        out = Path(tmp) / "dispositions.csv"
        r = subprocess.run(
            [sys.executable, str(MDS / "propose_person_dispositions.py"),
             "--members-csv", str(FINAL_MEMBERS), "--db", str(ctx["db"]), "--out", str(out)],
            capture_output=True, text=True, cwd=str(ROOT), timeout=600)
        expect(r.returncode == 0, f"the disposition proposal tool exited {r.returncode}")
        holds = plh.load_holds(out)
    expect(len(holds) == EXPLICIT_DISPOSITIONS,
           f"{len(holds)} drafted dispositions, audited {EXPLICIT_DISPOSITIONS}")
    expect(all(h.decision == plh.NO_ACCOUNT for h in holds),
           "a drafted disposition is not 'no account'")
    flagged = {h.candidate_person_id for h in holds if h.note.startswith("REVIEW BEFORE KEEPING")}
    expect(flagged == review_ids, "the drafts flagged for review differ from the review queue")
    plh.assert_every_person_dispositioned(awaiting, holds)
    return f"cohort {len(cohort)}: {len(proposed_ids)} proposed, {len(awaiting)} awaiting a ruling"


CHECKS = [
    ("delivered export size", check_delivery_size),
    ("uncovered member row ruling", check_uncovered_row_ruling),
    ("name encoding repair", check_name_encoding_repair),
    ("membership-only cohort", check_membership_cohort),
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", type=Path, default=ROOT / "database" / "footbag.db")
    args = ap.parse_args()

    failed = 0
    ctx: dict = {"db": args.db}
    try:
        require(DELIVERED_MEMBERS, "the vetted members CSV (refresh_legacy_repo_data.py)")
        require(args.db, "the built database")
        ctx["delivered"] = _rows(DELIVERED_MEMBERS)
    except AuditFailure as err:
        print(f"FAIL member-data audits: {err}")
        return 1
    for name, check in CHECKS:
        try:
            print(f"PASS {name}: {check(ctx)}")
        except AuditFailure as err:
            failed += 1
            print(f"FAIL {name}: {err}")
        except Exception as err:  # noqa: BLE001
            # Another module's error can quote a member id or name, so only its
            # kind is printed.
            failed += 1
            print(f"FAIL {name}: stopped by {type(err).__name__}; run the check "
                  "by hand on this machine to see the detail")
    print(f"member-data audits: {len(CHECKS) - failed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

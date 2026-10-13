#!/usr/bin/env python3
"""The audited results for the delivered member data, checked on the machine
that holds it.

The behaviour of the member scripts is pinned by the ordinary test suite on
synthetic data, which holds for any delivery. This checks something else: what
those rules found in the delivery actually in hand, so a later run that moves
any of it has to say so rather than drifting quietly. The audited figures live
beside the published member CSV in the private checkout, not in this file, so a
new delivery is re-audited as a data edit there and this code does not change.
A figure is re-audited when a delivery legitimately moves it, never relaxed.

It reads only data that is not part of the project: the vetted members CSV the
legacy refresh wrote into the private checkout, the audited figures and recorded
rulings there, the member intake's own output and the built database. That is
why it runs from the member runner after an apply, from the real-data row of the
test runner and from a production deploy that ships a database, rather than
from the test suite, which judges committed files only.

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
import json
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MDS = ROOT / "legacy_data" / "member_data_scripts"
PRIVATE = ROOT / "footbag_private_repo"
DELIVERED_MEMBERS = PRIVATE / "legacy-export" / "members" / "members.csv"
FIGURES = PRIVATE / "legacy-publish" / "audit" / "audited_figures.json"
DISPOSITIONS = PRIVATE / "private_data" / "stage_a_overrides" / "member_row_dispositions.csv"
PERSON_LINK_HOLDS = PRIVATE / "private_data" / "stage_a_overrides" / "person_link_holds.csv"
FINAL_MEMBERS = MDS / "out" / "legacy_members_final.csv"
CANONICAL_PERSONS = ROOT / "legacy_data" / "event_results" / "canonical_input" / "persons.csv"

if str(MDS) not in sys.path:
    sys.path.insert(0, str(MDS))


def _load(name: str, where: Path = MDS):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, where / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


# The system fixture account is absent from the export by design and covered by
# design, so it needs no recorded ruling; a historical person depends on it, which
# is why it stays. It is fixed by design rather than by the delivery, so it lives
# here and not with the audited figures.
FIXTURE_ID = "STUB_FOOTBAG_HACKY"
FIXTURE_PERSON = "person_272d84cba03638d83876f8c5"
EXCLUSIONS = MDS / "out" / "legacy_export_exclusions.csv"

# Every historical person whose curated account assertion is not backed by an
# account the export imported. Test-persona accounts are left to the residue
# audit, which refuses them on a production ship; counted here they would fail
# every developer database the persona harness has seeded.
UNBACKED_ASSERTIONS = """
SELECT hp.legacy_member_id
FROM historical_persons hp
LEFT JOIN legacy_members lm ON lm.legacy_member_id = hp.legacy_member_id
WHERE hp.legacy_member_id IS NOT NULL
  AND (lm.legacy_member_id IS NULL
       OR COALESCE(lm.import_source, '') NOT IN ('legacy_site_data', 'test'))
"""


class AuditFailure(Exception):
    """A check's finding. The message carries counts only."""


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise AuditFailure(message)


def figure(ctx: dict, *keys: str):
    """One audited figure. A missing one fails the check rather than defaulting,
    because a default would pass a delivery nobody audited."""
    value = ctx["figures"]
    for key in keys:
        if not isinstance(value, dict) or key not in value:
            raise AuditFailure(f"the audited figure {'.'.join(keys)} is missing from "
                               f"{FIGURES.name}; re-audit the delivery and record it")
        value = value[key]
    return value


def load_figures(path: Path) -> dict:
    require(path, "the audited figures")
    try:
        figures = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        raise AuditFailure(f"{path.name} is not valid JSON") from None
    expect(isinstance(figures, dict), f"{path.name} does not hold an object of figures")
    return figures


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
    audited = figure(ctx, "export_records")
    expect(n == audited,
           f"the delivered export holds {n} records, not the audited {audited}; "
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
    audited = figure(ctx, "uncovered_rows")
    expect(len(uncovered) == audited, f"{len(uncovered)} uncovered rows, audited {audited}")
    fixture = next((u for u in uncovered if u["legacy_member_id"] == FIXTURE_ID), None)
    expect(fixture is not None, "the system fixture row is not among the uncovered rows")
    expect(FIXTURE_PERSON in fixture["dependent_person_ids"],
           "the historical person the system fixture exists for no longer depends on it")
    return f"{len(uncovered)} uncovered rows, {len(holds)} recorded, the system fixture covered by design"


def check_name_encoding_repair(ctx: dict) -> str:
    """Members and field values are different counts: a member can have several
    fields repaired, and a member can have one field repaired and another left in
    the residue, so the two populations overlap. The destroyed names lost a
    character before the dump was taken; naming an encoding cannot restore it, so
    they are never in the curated codepage file. Two members are recovered from an
    intact companion column because the preferred value carries a destroyed
    character, and one is repaired as far as the evidence allows and still listed
    as unresolved."""
    def fig(key: str):
        return figure(ctx, "name_encoding", key)

    destroyed_ids = set(fig("destroyed_ids"))
    recovered_from_companion = fig("recovered_from_companion")
    partly = fig("partly_repaired")
    ex = _load("publish_legacy_repo_data", ROOT / "legacy_data" / "scripts")
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
    affected = fig("affected_name_members")
    expect(len(repaired) == affected,
           f"{len(repaired)} members' names repaired, audited {affected}")
    for how, key in ((ex.SELECTED_COMPANION, "by_clean_companion"),
                     (ex.SELECTED_REVERSED, "by_reversal"),
                     (ex.SELECTED_UNDAMAGED, "by_undamaged_companion"),
                     (ex.SELECTED_LEFT, "blocked_in_repair_class"),
                     (ex.SELECTED_CURATED, "by_curated_codepage")):
        audited = fig(key)
        expect(len(names[how]) == audited,
               f"{len(names[how])} members resolved by '{how}', audited {audited}")
    cities = fig("affected_city_members")
    expect(len(city_members) == cities,
           f"{len(city_members)} members' cities need repair, audited {cities}")

    problem_ids = {p["legacy_member_id"] for p in problems}
    values, members = fig("residual_problem_values"), fig("residual_problem_members")
    expect(len(problems) == values and len(problem_ids) == members,
           f"{len(problems)} residual values on {len(problem_ids)} members, audited "
           f"{values} on {members}")
    # The residue is the destroyed names, left out of the curated file so an
    # administrator's help request is their route, and still visibly damaged.
    expect(destroyed_ids <= problem_ids, "a destroyed name is missing from the residue")
    expect(not destroyed_ids & set(encodings), "a destroyed name was given a codepage")
    for p in problems:
        expect("?" in p["stored_plain_column"], "a residual value no longer carries its lost character")
        if p["column"] in ("MemberFirstName", "MemberMiddleName", "MemberLastName"):
            expect("?" in real_name[p["legacy_member_id"]],
                   "a residual name reaches the output without its visible damage")
    expect(problem_ids != repaired, "the residue and the repaired population read as one")

    mid = partly.get("legacy_member_id")
    listed = [p for p in problems if p["legacy_member_id"] == mid]
    expect(real_name.get(mid) == partly.get("name") and len(listed) == 1
           and listed[0]["resolution"] == ex.SELECTED_COMPANION
           and listed[0]["stored_unicode_column"] == partly.get("stored_unicode"),
           "the partly repaired name is not both repaired and still listed")
    for rid, expected in recovered_from_companion.items():
        expect(real_name.get(rid) == expected, "a companion-column recovery did not reach the output")
    expect(still_double == 0, f"{still_double} repaired names still carry a double encoding")
    return (f"{len(repaired)} names repaired, {len(problems)} residual values "
            f"on {len(problem_ids)} members")


def check_membership_cohort(ctx: dict) -> str:
    rlm = _load("reconcile_legacy_members")
    plh = _load("person_link_hold")
    def fig(key: str):
        return figure(ctx, "membership_cohort", key)

    cohort_size, proposals = fig("cohort"), fig("stage_b_proposals")
    review_rows, explicit = fig("stage_b_review_rows"), fig("explicit_dispositions")
    require(FINAL_MEMBERS, "the member intake's final CSV (run_legacy_members.sh --load)")
    accounts = _rows(FINAL_MEMBERS)
    hps = rlm.read_historical_persons(ctx["db"])
    cohort = rlm.membership_provisional_person_ids(hps)
    proposed, review = rlm.build_stage_b(accounts, hps)
    awaiting = rlm._build_person_disposition_descriptors(
        proposed, review, accounts, hps, cohort_person_ids=cohort)
    proposed_ids = {p["historical_person_id"] for p in proposed} & cohort
    review_ids = {r["historical_person_id"] for r in review} & cohort

    expect(len(cohort) == cohort_size, f"cohort of {len(cohort)}, audited {cohort_size}")
    expect(len(proposed_ids) == proposals,
           f"{len(proposed_ids)} resolved unambiguously, audited {proposals}")
    expect(len(review_ids) == review_rows,
           f"{len(review_ids)} in the review queue, audited {review_rows}")
    expect(len(awaiting) == explicit,
           f"{len(awaiting)} awaiting a ruling, audited {explicit}")
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
    expect(len(holds) == explicit,
           f"{len(holds)} drafted dispositions, audited {explicit}")
    expect(all(h.decision == plh.NO_ACCOUNT for h in holds),
           "a drafted disposition is not 'no account'")
    flagged = {h.candidate_person_id for h in holds if h.note.startswith("REVIEW BEFORE KEEPING")}
    expect(flagged == review_ids, "the drafts flagged for review differ from the review queue")
    plh.assert_every_person_dispositioned(awaiting, holds)
    return f"cohort {len(cohort)}: {len(proposed_ids)} proposed, {len(awaiting)} awaiting a ruling"


def check_historical_person_assertions(ctx: dict) -> str:
    """Each historical person's legacy_member_id is a curated assertion that the
    competitor held that account. Each must resolve to an account the export
    imported, or carry a recorded decision; the system fixture is covered by
    design. The population is measured from the canonical persons rather than the
    built database, because the proposed links land in the same column with no
    mark of where they came from."""
    mrd = _load("member_row_disposition")
    plh = _load("person_link_hold")
    require(EXCLUSIONS, "the member load's exclusions record (run_legacy_members.sh --load --apply)")
    require(CANONICAL_PERSONS, "the canonical persons CSV (run_pipeline.sh canonical_only)")
    decided = {d.legacy_member_id for d in mrd.load_dispositions(DISPOSITIONS)} | mrd.SYSTEM_FIXTURE_IDS

    con = sqlite3.connect(f"file:{ctx['db']}?mode=ro", uri=True)
    try:
        unbacked = {r[0] for r in con.execute(UNBACKED_ASSERTIONS)}
        asserted_people = dict(con.execute(
            "SELECT person_id, legacy_member_id FROM historical_persons "
            "WHERE legacy_member_id IS NOT NULL"))
        shared = con.execute(
            "SELECT COUNT(*) FROM (SELECT legacy_member_id FROM historical_persons "
            "WHERE legacy_member_id IS NOT NULL GROUP BY legacy_member_id "
            "HAVING COUNT(*) > 1)").fetchone()[0]
    finally:
        con.close()
    asserted = set(asserted_people.values())

    expect(not unbacked - decided,
           f"{len(unbacked - decided)} historical-person links point at an account the export "
           "did not import, with no recorded decision")

    population = len({r["member_id"].strip() for r in _rows(CANONICAL_PERSONS)
                      if r.get("member_id", "").strip()}) + 1
    audited = figure(ctx, "historical_person_assertions")
    expect(population == audited,
           f"{population} account assertions in the canonical persons, audited {audited}; "
           "explain the difference and re-audit")

    expect(shared == 0, f"{shared} legacy accounts are asserted by more than one person")

    dropped = [r for r in _rows(EXCLUSIONS)
               if r["legacy_member_id"] in asserted and r["pulled_back"] != "1"
               and r["legacy_member_id"] not in decided]
    conflicts = sum(1 for r in dropped if r["exclusion_rule"] == "user_id_conflict")
    expect(conflicts == 0,
           f"{conflicts} asserted accounts dropped as a shared login id, with no recorded decision")
    expect(not dropped,
           f"{len(dropped)} asserted accounts dropped by the load and not pulled back, "
           "with no recorded decision")

    no_account = {h.candidate_person_id for h in plh.load_holds(PERSON_LINK_HOLDS)
                  if h.decision == plh.NO_ACCOUNT}
    contradicted = no_account & set(asserted_people)
    expect(not contradicted,
           f"{len(contradicted)} people ruled to hold no account carry an account assertion")
    return (f"{population} assertions audited, {len(asserted)} links in the database, "
            f"{len(unbacked)} on an account the export did not import, each decided")


CHECKS = [
    ("delivered export size", check_delivery_size),
    ("uncovered member row ruling", check_uncovered_row_ruling),
    ("name encoding repair", check_name_encoding_repair),
    ("membership-only cohort", check_membership_cohort),
    ("historical-person account assertions", check_historical_person_assertions),
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
        ctx["figures"] = load_figures(FIGURES)
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

#!/usr/bin/env python3
"""Re-fit the recorded Stage B account rulings to a new legacy delivery.

The person-link holds and the review-group resolutions are each bound by a
fingerprint of their whole decision boundary: their own facts (the accounts, the
candidate people, the match facts) and the frozen input boundary, which is the set
of every reconcilable account in the delivery. A delivery that only adds unrelated
accounts therefore stales every one of them, although nothing a ruling rests on
changed, and the load stops at the first. This tool tells the two cases apart, so a
person rules only on what actually changed.

For every ruling it recomputes the fingerprint the load expects today, and the one
the same facts give under the boundary of the delivery the rulings were fitted to.
Each ruling is then one of:

  current                  the fingerprint matches today's; nothing to do
  restamp_boundary_only    only the delivery boundary moved; its own facts hold
  local_facts_changed      its accounts, candidates or match facts changed: a
                           person re-adjudicates it
  group_or_candidate_gone  the proposal, person or review group it rules on no
                           longer exists: a question for a person, never dropped

The Stage A and entitlement rulings carry no delivery boundary and are checked as
the load checks them; a mismatch there also needs a person.

The fitted boundary is the one recorded beside the rulings (FITTED_EXPORT.tsv),
written by the last --apply that left nothing for a person. With none recorded it
is computed from the published member CSV as committed in the private checkout at
the commit that last changed the ruling files, and the run says so.

Dry run by default: it writes only a report under the git-ignored out/ folder,
account and person ids and statuses only, no names. --apply replaces the fingerprint
of each restamp_boundary_only row and nothing else on the line, never adds or deletes
a row, and records the fitted boundary only when no ruling is left for a person. A
maintainer reviews the diff in the private checkout and commits it there.

Exit status: 0 when every ruling is current (after --apply, current or restamped);
1 when anything is left to restamp or for a person; 2 on an input error.

Usage:
    refit_rulings.py [--apply] [--members-csv PATH] [--db PATH]
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import reconcile_legacy_members as rlm  # noqa: E402
import person_link_hold as plh  # noqa: E402

PRIVATE = ROOT / "footbag_private_repo"
OVERRIDES = PRIVATE / "private_data" / "stage_a_overrides"
EXPORT_MEMBERS = PRIVATE / "legacy-export" / "members" / "members.csv"
PUBLISHED_REL = "legacy-publish/legacy_members.csv"
FITTED_NAME = "FITTED_EXPORT.tsv"
DEFAULT_MEMBERS_CSV = HERE / "out" / "legacy_members_final.csv"
DEFAULT_REPORT = HERE / "out" / "refit_report.csv"

CURRENT = "current"
RESTAMP = "restamp_boundary_only"
CHANGED = "local_facts_changed"
GONE = "group_or_candidate_gone"
STAGE_A_MISMATCH = "stage_a_ruling_mismatch"
NEEDS_PERSON = {CHANGED, GONE, STAGE_A_MISMATCH}

REPORT_FIELDS = ["file", "ruling", "status", "stored_fingerprint", "fitted_fingerprint"]


@dataclass
class Item:
    file: str
    ruling: str
    status: str
    stored: str = ""
    fitted: str = ""


def judge(stored: str, today: str | None, prior: str | None) -> tuple[str, str]:
    """(status, the fingerprint the load expects today)."""
    if today is None:
        return GONE, ""
    if stored == today:
        return CURRENT, today
    if prior is not None and stored == prior:
        return RESTAMP, today
    return CHANGED, today


def _ids(ids) -> str:
    return "|".join(sorted(ids))


def fit_stage_b(accounts: list[dict], hps: list[dict], view, holds: list,
                resolutions: list, prior_boundary: str | None) -> tuple[list[Item], dict]:
    """Classify every Stage B ruling against today's delivery. Computed through the
    same descriptor builders the load uses, so a restamped fingerprint is exactly the
    one the load will expect."""
    universe = view.logical_accounts if view is not None else accounts
    provenance = view.provenance if view is not None else {}
    proposed, review = rlm.build_stage_b(universe, hps)

    def links(boundary):
        return {(d["survivor_account_ids"], d["candidate_person_id"]): d
                for d in rlm._build_link_hold_descriptors(
                    proposed, accounts, hps, provenance, boundary=boundary)}

    today_links = links(None)
    prior_links = links(prior_boundary) if prior_boundary else {}
    items: list[Item] = []
    held: set = set()
    for h in holds:
        if h.decision != plh.HOLD_LINK:
            continue
        key = (h.survivor_account_ids, h.candidate_person_id)
        today = today_links.get(key, {}).get("fingerprint")
        prior = prior_links.get(key, {}).get("fingerprint")
        status, fitted = judge(h.fingerprint, today, prior)
        if status in (CURRENT, RESTAMP):
            held.add(key)
        items.append(Item("person_link_holds.csv",
                          f"hold_link {_ids(h.survivor_account_ids)} -> {h.candidate_person_id}",
                          status, h.fingerprint, fitted))
    # The person rulings and the review groups are judged against the proposals the
    # load is left with once the valid holds have suppressed theirs.
    kept = [d["proposal"] for k, d in today_links.items() if k not in held]

    cohort = rlm.membership_provisional_person_ids(hps)

    def people(boundary):
        return {d["candidate_person_id"]: d for d in rlm._build_person_disposition_descriptors(
            kept, review, accounts, hps, cohort_person_ids=cohort, boundary=boundary)}

    today_people = people(None)
    prior_people = people(prior_boundary) if prior_boundary else {}
    ruled_people: set[str] = set()
    for h in holds:
        if not h.is_person_scoped:
            continue
        ruled_people.add(h.candidate_person_id)
        d_today = today_people.get(h.candidate_person_id)
        d_prior = prior_people.get(h.candidate_person_id)
        status, fitted = judge(
            h.fingerprint,
            d_today["fingerprint_for"](h.boundary_target) if d_today else None,
            d_prior["fingerprint_for"](h.boundary_target) if d_prior else None)
        items.append(Item("person_link_holds.csv", f"{h.decision} {h.candidate_person_id}",
                          status, h.fingerprint, fitted))

    def groups(boundary):
        return {d["account_ids"]: d for d in rlm._build_review_resolution_descriptors(
            review, kept, accounts, view, boundary=boundary)}

    today_groups = groups(None)
    prior_groups = groups(prior_boundary) if prior_boundary else {}
    for r in resolutions:
        status, fitted = judge(
            r.fingerprint, today_groups.get(r.account_ids, {}).get("fingerprint"),
            prior_groups.get(r.account_ids, {}).get("fingerprint"))
        items.append(Item("review_resolutions.csv", f"{r.outcome} {_ids(r.account_ids)}",
                          status, r.fingerprint, fitted))

    ruled_groups = {r.account_ids for r in resolutions}
    open_counts = {
        "review_groups_without_a_resolution": sum(1 for k in today_groups
                                                  if k not in ruled_groups),
        "cohort_people_awaiting_a_disposition": sum(1 for p in today_people
                                                    if p not in ruled_people),
    }
    return items, open_counts


def restamp(path: Path, items: list[Item]) -> int:
    """Replace each restamped fingerprint in place. Only the 64 hex characters
    change; every other byte of the file, its order and its line endings stay."""
    data = path.read_bytes()
    changed = 0
    for it in items:
        old, new = it.stored.encode(), it.fitted.encode()
        if data.count(old) != 1:
            raise SystemExit(f"refit_rulings: {path.name}: the fingerprint for '{it.ruling}' "
                             "is not unique in the file; nothing was written")
        data = data.replace(old, new)
        changed += 1
    path.write_bytes(data)
    return changed


def boundary_of_rows(rows: list[dict]) -> str:
    return rlm._boundary_fingerprint(rows)


def read_rows(text: str) -> list[dict]:
    return list(csv.DictReader(io.StringIO(text)))


def prior_boundary(overrides: Path) -> tuple[str | None, str]:
    fitted = overrides / FITTED_NAME
    if fitted.is_file():
        rec = dict(line.split("\t", 1) for line in fitted.read_text(encoding="utf-8").splitlines()
                   if "\t" in line)
        if rec.get("boundary_fingerprint"):
            return rec["boundary_fingerprint"], f"recorded in {FITTED_NAME}"
    # The rulings were fitted to the delivery that was published when they were last
    # committed, so that commit's published member CSV gives their boundary. HEAD is
    # not it: a new delivery is usually committed before its rulings are re-fitted.
    rel = overrides.relative_to(PRIVATE).as_posix() if overrides.is_relative_to(PRIVATE) \
        else "private_data/stage_a_overrides"
    last = subprocess.run(["git", "-C", str(PRIVATE), "log", "-1", "--format=%H", "--", rel],
                          capture_output=True, text=True, timeout=120)
    commit = last.stdout.strip() if last.returncode == 0 else ""
    r = subprocess.run(["git", "-C", str(PRIVATE), "show", f"{commit}:{PUBLISHED_REL}"],
                       capture_output=True, text=True, timeout=120) if commit else None
    if r is None or r.returncode != 0:
        return None, ("none recorded, and no published member CSV at the commit that last "
                      "changed the rulings, so no ruling can be restamped")
    return (boundary_of_rows(read_rows(r.stdout)),
            f"computed from the published member CSV at {commit[:7]}, the commit that last "
            "changed the rulings")


def write_report(path: Path, items: list[Item]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(REPORT_FIELDS)
        for it in items:
            w.writerow([it.file, it.ruling, it.status, it.stored, it.fitted])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true",
                    help="restamp the boundary-only rulings and record the fitted boundary")
    ap.add_argument("--members-csv", type=Path, default=DEFAULT_MEMBERS_CSV,
                    help="the honours-joined member CSV the load reads "
                         "(written by run_legacy_members.sh --load)")
    ap.add_argument("--db", type=Path, default=ROOT / "database" / "footbag.db")
    ap.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = ap.parse_args(argv)

    overrides = OVERRIDES
    holds_path = overrides / "person_link_holds.csv"
    resolutions_path = overrides / "review_resolutions.csv"
    stage_a_path = overrides / "stage_a_adjudication.csv"
    for need, producer in ((args.members_csv, "run_legacy_members.sh --load"),
                           (args.db, "./run_dev.sh --all-data (it builds historical_persons)")):
        if not need.is_file():
            print(f"refit_rulings: {need} is missing; produce it with {producer}. "
                  "Nothing was written.", file=sys.stderr)
            return 2
    if not overrides.is_dir():
        print(f"refit_rulings: no recorded rulings at {overrides}; nothing to re-fit.")
        return 0

    with args.members_csv.open(encoding="utf-8", newline="") as f:
        accounts = list(csv.DictReader(f))
    hps = rlm.read_historical_persons(args.db)
    items: list[Item] = []
    try:
        holds = rlm.load_person_link_holds(holds_path)
        resolutions = rlm.load_review_resolutions(resolutions_path)
    except Exception as e:  # the loaders raise their own error classes
        print(f"refit_rulings: a ruling file is malformed: {e}. Nothing was written.",
              file=sys.stderr)
        return 2
    view = None
    try:
        view = rlm.build_stage_a_survivor_view(
            accounts, claimed_ids=rlm._claimed_ids_from_db(args.db),
            overrides=rlm.load_stage_a_overrides(stage_a_path),
            entitlement_dispositions=rlm.load_entitlement_dispositions(
                overrides / "entitlement_dispositions.csv"))
    except Exception as e:  # noqa: BLE001 - an override mismatch is a ruling question
        items.append(Item("stage_a_adjudication.csv / entitlement_dispositions.csv",
                          f"Stage A plan: {type(e).__name__}: {e}", STAGE_A_MISMATCH))

    boundary, source = prior_boundary(overrides)
    print(f"refit_rulings: fitted boundary {source}")
    if view is not None:
        stage_b, open_counts = fit_stage_b(accounts, hps, view, holds, resolutions, boundary)
        items += stage_b
    else:
        open_counts = {}

    counts: dict[str, int] = {}
    for it in items:
        counts[it.status] = counts.get(it.status, 0) + 1
    write_report(args.report, items)
    print(f"refit_rulings: {len(items)} rulings: "
          + ", ".join(f"{n} {s}" for s, n in sorted(counts.items())))
    for name, n in open_counts.items():
        print(f"  open: {n} {name.replace('_', ' ')}")
    for it in items:
        if it.status in NEEDS_PERSON:
            print(f"  needs a person: {it.file}: {it.ruling} ({it.status})")
    print(f"  report: {args.report}")

    restamps = [it for it in items if it.status == RESTAMP]
    left_for_person = [it for it in items if it.status in NEEDS_PERSON]
    if not args.apply:
        if restamps:
            print(f"  {len(restamps)} ruling(s) only need restamping: re-run with --apply.")
        return 1 if (restamps or left_for_person) else 0

    for name in ("person_link_holds.csv", "review_resolutions.csv"):
        mine = [it for it in restamps if it.file == name]
        if mine:
            print(f"  restamped {restamp(overrides / name, mine)} in {name}")
    if left_for_person:
        print(f"refit_rulings: {len(left_for_person)} ruling(s) need a person; the fitted "
              "boundary is not recorded until they are re-adjudicated.")
        return 1
    export_sha = (hashlib.sha256(EXPORT_MEMBERS.read_bytes()).hexdigest()
                  if EXPORT_MEMBERS.is_file() else "")
    (overrides / FITTED_NAME).write_text(
        f"boundary_fingerprint\t{rlm._boundary_fingerprint(accounts)}\n"
        f"export_members_csv_sha256\t{export_sha}\n", encoding="utf-8")
    print(f"refit_rulings: every ruling fits this delivery; recorded {FITTED_NAME}. "
          "Review the diff in the private checkout and commit it there.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

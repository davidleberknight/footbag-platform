#!/usr/bin/env python3
"""Draft person-scoped disposition rows for a maintainer to review and commit.

Stage B says nothing about a person it cannot propose a link for, so those rows sit
between "nobody holds an account" and "nobody has looked", and a load cannot tell
which. This proposes a disposition for each, with the fingerprint that binds it to
the evidence, so a maintainer reviews prose rather than computing hashes.

It decides nothing on its own. Every row it writes is a proposal to be read,
edited or deleted, and it is the maintainer who moves them into the adjudication
file in the private checkout. Output is a pure function of the database and the
member CSV, so re-running over unchanged input rewrites the same file.

Two dispositions are drafted:

  no_account        no valid account bears this person's name.
  duplicate_person  another person row is the same human, on the evidence that the
                    two names agree once stroke letters are folded, or that the one
                    account bearing the name is already held by that other row.
                    Stroke letters are deliberately not folded by the canonical
                    normalization, which is why these survive as separate rows.

A duplicate is also drafted when the only valid account a variant of the name
reaches (the same first and last name with a middle name or initial added) is held
by another person row, which is the same human.

With --rulings it instead writes the decisions a maintainer made, one per person,
each with the fingerprint the load expects, so a ruling is recorded without
computing a hash by hand. The rulings file has the columns candidate_person_id,
decision, target (the duplicated person id, or the held account id), reason and
note. A person not awaiting a disposition, or an unknown decision, refuses.

With --stage-a-rulings it writes duplicate-account rulings instead: rows for the
Stage A adjudication file, from a file with the columns decision
(approve_same_person or do_not_merge), account_ids (pipe-separated) and note.
Each fingerprint is computed from the group exactly as the build forms it, over
the raw account values, and the rulings are put through the build's own planner
beside those already recorded (--overrides), so one that would not apply refuses
here rather than at the load. Pass the same member CSV, --proposed-links and
--entitlement-dispositions the merge dry run reads; --db is not needed.

Usage (from the repository root):
    python3 legacy_data/member_data_scripts/propose_person_dispositions.py \\
        --members-csv legacy_data/member_data_scripts/out/legacy_members_final.csv \\
        --db database/footbag.db \\
        --out legacy_data/member_data_scripts/out/person_dispositions_proposed.csv \\
        [--rulings RULINGS.csv]
    python3 legacy_data/member_data_scripts/propose_person_dispositions.py \\
        --members-csv legacy_data/member_data_scripts/out/legacy_members_final.csv \\
        --proposed-links legacy_data/member_data_scripts/out/stage_b_proposed_links.csv \\
        --overrides <private checkout>/private_data/stage_a_overrides/stage_a_adjudication.csv \\
        --entitlement-dispositions <the recorded entitlement dispositions> \\
        --stage-a-rulings RULINGS.csv \\
        --out legacy_data/member_data_scripts/out/stage_a_rulings_fingerprinted.csv
"""
from __future__ import annotations

import argparse
import csv
import sqlite3
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline" / "identity"))

import entitlement_disposition as ed  # noqa: E402
import person_link_hold as plh  # noqa: E402
import reconcile_legacy_members as rlm  # noqa: E402
import stage_a_overrides as sao  # noqa: E402

# Letters that carry no combining mark, so the canonical normalization leaves them
# alone by design. Folding them here is evidence for a duplicate, never a rewrite:
# the duplicate row keeps its own spelling and simply stops being independent.
STROKE_LETTERS = str.maketrans({
    "ł": "l", "Ł": "l", "ø": "o", "Ø": "o", "đ": "d", "Đ": "d",
    "ħ": "h", "Ħ": "h", "ŧ": "t", "Ŧ": "t", "ı": "i", "ß": "ss",
})

OUT_FIELDS = ("decision", "survivor_account_ids", "candidate_person_id",
              "reason", "fingerprint", "note", plh.DUPLICATE_TARGET_FIELD)


def write_rows(out: Path, rows: list[dict]) -> None:
    rows.sort(key=lambda r: (r["decision"], r["candidate_person_id"]))
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=OUT_FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def fold(name: str) -> str:
    folded = rlm.normalize_name(name or "").translate(STROKE_LETTERS)
    return "".join(c for c in unicodedata.normalize("NFKD", folded)
                   if not unicodedata.combining(c))


RULING_FIELDS = ("candidate_person_id", "decision", "target", "reason", "note")


def rows_from_rulings(path: Path, descriptors: list[dict]) -> list[dict]:
    """The maintainer's decisions as fingerprinted disposition rows."""
    by_id = {d["candidate_person_id"]: d for d in descriptors}
    rows: list[dict] = []
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None or set(RULING_FIELDS) - set(reader.fieldnames):
            raise SystemExit(f"--rulings needs the columns {RULING_FIELDS}")
        for i, r in enumerate(reader, start=2):
            pid, decision = r["candidate_person_id"].strip(), r["decision"].strip()
            target, reason, note = r["target"].strip(), r["reason"].strip(), r["note"].strip()
            d = by_id.get(pid)
            if d is None:
                raise SystemExit(f"--rulings line {i}: {pid} is not awaiting a disposition")
            if reason not in plh.REASONS_BY_DECISION.get(decision, frozenset()):
                raise SystemExit(f"--rulings line {i}: reason {reason!r} does not belong "
                                 f"to decision {decision!r}")
            hold = plh.PersonLinkHold(
                decision, frozenset({target}) if decision == plh.ACCOUNT_HOLDER else frozenset(),
                pid, reason, "0" * 64, note,
                target if decision == plh.DUPLICATE_PERSON else "")
            rows.append({
                "decision": decision,
                "survivor_account_ids": target if decision == plh.ACCOUNT_HOLDER else "",
                "candidate_person_id": pid,
                "reason": reason,
                "fingerprint": d["fingerprint_for"](hold.boundary_target),
                "note": note,
                plh.DUPLICATE_TARGET_FIELD: hold.duplicate_of_person_id,
            })
    return rows


STAGE_A_RULING_FIELDS = ("decision", "account_ids", "note")


def stage_a_rows_from_rulings(path: Path, accounts: list[dict], links: dict[str, str],
                              existing: list, entitlements: list) -> list[dict]:
    """The maintainer's duplicate-account decisions as adjudication rows, each
    fingerprinted from the group exactly as the build forms it, over the raw
    account values. Every row is then put through the build's own planner
    beside the rulings already recorded, so a ruling that would not apply is
    refused here rather than at the load."""
    groups = {frozenset((a.get("legacy_member_id") or "").strip() for a in g.accounts): g
              for g in rlm.build_stage_a_groups(accounts)}
    rows: list[dict] = []
    new: list = []
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None or set(STAGE_A_RULING_FIELDS) - set(reader.fieldnames):
            raise SystemExit(f"--stage-a-rulings needs the columns {STAGE_A_RULING_FIELDS}")
        for i, r in enumerate(reader, start=2):
            decision, note = r["decision"].strip(), r["note"].strip()
            if decision not in (sao.APPROVE, sao.DO_NOT_MERGE):
                raise SystemExit(f"--stage-a-rulings line {i}: decision {decision!r} is not "
                                 f"{sao.APPROVE} or {sao.DO_NOT_MERGE}")
            try:
                ids = sao.parse_account_ids(r["account_ids"])
            except sao.OverrideError as e:
                raise SystemExit(f"--stage-a-rulings line {i}: {e}") from e
            group = groups.get(ids)
            if group is None:
                raise SystemExit(f"--stage-a-rulings line {i}: no duplicate-account group "
                                 f"has exactly accounts {sorted(ids)}")
            base = rlm.evaluate_merge_group(group, links)
            fingerprint = sao.group_fingerprint(
                ids, group.match_key, base.action, base.reason,
                {(a.get("country") or "").strip() for a in group.accounts})
            expected = sao.disposition(base.action, base.reason)
            new.append(sao.Override(decision, ids, expected, fingerprint, note))
            rows.append({"decision": decision, "account_ids": "|".join(sorted(ids)),
                         "expected_disposition": expected, "fingerprint": fingerprint,
                         "note": note})
    try:
        rlm.plan_auto_merges(accounts, links_by_account=links, overrides=existing + new,
                             entitlement_dispositions=entitlements)
    except (sao.OverrideError, ed.EntitlementDispositionError) as e:
        raise SystemExit(f"--stage-a-rulings: these rulings would not apply: {e}") from e
    rows.sort(key=lambda r: (r["decision"], r["account_ids"]))
    return rows


def middle_name_holder(name: str, pid: str, accounts: list[dict],
                       linked_by_account: dict, nicknames) -> dict | None:
    """The other person holding the one valid account a variant of this name
    reaches, when the account's name is this name with a middle part added."""
    agreeing = [a for a in rlm._valid_rows(accounts)
                if rlm.name_match.names_agree(name, a.get("real_name") or "", nicknames)]
    if len(agreeing) != 1:
        return None
    acct = agreeing[0]
    want = rlm.name_match.fold_name_words(name)
    got = rlm.name_match.fold_name_words(acct.get("real_name") or "")
    if len(got) <= len(want) or got[0] != want[0] or got[-1] != want[-1]:
        return None
    holder = linked_by_account.get((acct.get("legacy_member_id") or "").strip())
    if holder is None or (holder.get("person_id") or "") == pid:
        return None
    return holder


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--members-csv", required=True, type=Path)
    ap.add_argument("--db", type=Path, help="required except with --stage-a-rulings")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--rulings", type=Path,
                    help="write the maintainer's decisions instead of drafting")
    ap.add_argument("--stage-a-rulings", type=Path,
                    help="write the maintainer's duplicate-account decisions instead")
    ap.add_argument("--proposed-links", type=Path,
                    help="with --stage-a-rulings: the Stage B proposed links the build reads")
    ap.add_argument("--overrides", type=Path,
                    help="with --stage-a-rulings: the duplicate-account rulings already recorded")
    ap.add_argument("--entitlement-dispositions", type=Path,
                    help="with --stage-a-rulings: the recorded entitlement dispositions")
    args = ap.parse_args()

    with args.members_csv.open(encoding="utf-8", newline="") as f:
        accounts = list(csv.DictReader(f))
    if args.stage_a_rulings:
        try:
            existing = sao.load_overrides(args.overrides)
            entitlements = rlm.load_entitlement_dispositions(args.entitlement_dispositions)
        except (sao.OverrideError, ed.EntitlementDispositionError) as e:
            raise SystemExit(f"--stage-a-rulings: {e}") from e
        links = rlm.load_links_by_account(args.proposed_links) if args.proposed_links else {}
        stage_a = stage_a_rows_from_rulings(args.stage_a_rulings, accounts, links,
                                            existing, entitlements)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        with args.out.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=sao.OVERRIDE_FIELDS, lineterminator="\n")
            w.writeheader()
            w.writerows(stage_a)
        print(f"propose_person_dispositions -> {args.out}: {len(stage_a)} duplicate-account "
              f"ruling(s) fingerprinted; add them to the adjudication file and confirm with "
              f"reconcile_legacy_members.py --dry-run-merge")
        return 0
    if args.db is None:
        ap.error("--db is required")
    hps = rlm.read_historical_persons(args.db)
    proposed, review = rlm.build_stage_b(accounts, hps)
    descriptors = rlm._build_person_disposition_descriptors(
        proposed, review, accounts, hps,
        cohort_person_ids=rlm.membership_provisional_person_ids(hps))
    if args.rulings:
        rows = rows_from_rulings(args.rulings, descriptors)
        write_rows(args.out, rows)
        print(f"propose_person_dispositions -> {args.out}: {len(rows)} ruling(s) fingerprinted")
        return 0
    nicknames = rlm.name_match.load_nicknames()

    by_id = {(hp.get("person_id") or ""): hp for hp in hps}
    review_accounts: dict[str, set[str]] = {}
    for r in review:
        review_accounts.setdefault(r["historical_person_id"], set()).add(r["legacy_member_id"])
    linked_by_account = {(hp.get("legacy_member_id") or "").strip(): hp for hp in hps
                         if (hp.get("legacy_member_id") or "").strip()}
    by_fold: dict[str, list[dict]] = {}
    for hp in hps:
        by_fold.setdefault(fold(hp.get("person_name") or ""), []).append(hp)

    rows: list[dict] = []
    for d in descriptors:
        pid = d["candidate_person_id"]
        name = by_id[pid].get("person_name") or ""

        # An account bearing this name that another person already holds is the
        # strongest duplicate evidence there is: one account, one human.
        holder = None
        for mid in sorted(d["account_ids_bearing_name"]):
            other = linked_by_account.get(mid)
            if other and (other.get("person_id") or "") != pid:
                holder = other
                break
        middle = None if holder else middle_name_holder(
            name, pid, accounts, linked_by_account, nicknames)
        if middle is not None:
            target = middle.get("person_id") or ""
            rows.append({
                "decision": plh.DUPLICATE_PERSON,
                "survivor_account_ids": "",
                "candidate_person_id": pid,
                "reason": plh.DUPLICATE_MIDDLE_NAME_VARIANT,
                "fingerprint": d["fingerprint_for"](target),
                "note": (f"Same human as {target}: the only valid account a variant of "
                         f"this name reaches carries this name with a middle part added, "
                         f"and that row holds it."),
                plh.DUPLICATE_TARGET_FIELD: target,
            })
            continue
        twin = holder or next(
            (o for o in by_fold.get(fold(name), [])
             if (o.get("person_id") or "") != pid), None)

        if twin is not None:
            target = twin.get("person_id") or ""
            same_normalized = rlm.normalize_name(name) == rlm.normalize_name(
                twin.get("person_name") or "")
            reason = (plh.DUPLICATE_STROKE_LETTER_VARIANT if not same_normalized
                      and fold(name) == fold(twin.get("person_name") or "")
                      else plh.DUPLICATE_SPELLING_VARIANT)
            note = (f"Same human as {target}: the two spellings agree once stroke "
                    f"letters are folded, which the canonical normalization does not do."
                    if reason == plh.DUPLICATE_STROKE_LETTER_VARIANT else
                    f"Same human as {target}: the one account bearing this name is "
                    f"already held by that row, and the spellings differ by a typo.")
            rows.append({
                "decision": plh.DUPLICATE_PERSON,
                "survivor_account_ids": "",
                "candidate_person_id": pid,
                "reason": reason,
                "fingerprint": d["fingerprint_for"](target),
                "note": note,
                plh.DUPLICATE_TARGET_FIELD: target,
            })
            continue

        candidates = sorted(review_accounts.get(pid, ()))
        note = ("No valid account in the delivered member population bears this "
                "name. The person is retained as an archival record and holds no "
                "site account.")
        if candidates:
            # A variant of the name reaches accounts, just not one unambiguously,
            # so "no account bears this name" would be false. The draft says so,
            # and the maintainer rules on the candidates before keeping the row.
            note = (f"REVIEW BEFORE KEEPING: accounts {', '.join(candidates)} bear a "
                    f"variant of this name and none resolved uniquely. Keep this row "
                    f"only if none of them is this person.")
        rows.append({
            "decision": plh.NO_ACCOUNT,
            "survivor_account_ids": "",
            "candidate_person_id": pid,
            "reason": plh.NO_VALID_ACCOUNT_IN_MEMBER_POPULATION,
            "fingerprint": d["fingerprint_for"](""),
            "note": note,
            plh.DUPLICATE_TARGET_FIELD: "",
        })

    write_rows(args.out, rows)

    counts: dict[str, int] = {}
    for r in rows:
        counts[r["decision"]] = counts.get(r["decision"], 0) + 1
    print(f"propose_person_dispositions -> {args.out}")
    print(f"  persons awaiting a disposition: {len(descriptors)}")
    for decision in sorted(counts):
        print(f"    {decision:18} {counts[decision]}")
    print("  These are drafts. Review them, then move the rows a maintainer accepts "
          "into the adjudication file in the private checkout.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

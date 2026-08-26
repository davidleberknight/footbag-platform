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

Usage (from the repository root):
    python3 legacy_data/member_data_scripts/propose_person_dispositions.py \\
        --members-csv legacy_data/member_data_scripts/out/legacy_members_final.csv \\
        --db database/footbag.db \\
        --out legacy_data/member_data_scripts/out/person_dispositions_proposed.csv
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

import person_link_hold as plh  # noqa: E402
import reconcile_legacy_members as rlm  # noqa: E402

# Letters that carry no combining mark, so the canonical normalization leaves them
# alone by design. Folding them here is evidence for a duplicate, never a rewrite:
# the duplicate row keeps its own spelling and simply stops being independent.
STROKE_LETTERS = str.maketrans({
    "ł": "l", "Ł": "l", "ø": "o", "Ø": "o", "đ": "d", "Đ": "d",
    "ħ": "h", "Ħ": "h", "ŧ": "t", "Ŧ": "t", "ı": "i", "ß": "ss",
})

OUT_FIELDS = ("decision", "survivor_account_ids", "candidate_person_id",
              "reason", "fingerprint", "note", plh.DUPLICATE_TARGET_FIELD)


def fold(name: str) -> str:
    folded = rlm.normalize_name(name or "").translate(STROKE_LETTERS)
    return "".join(c for c in unicodedata.normalize("NFKD", folded)
                   if not unicodedata.combining(c))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--members-csv", required=True, type=Path)
    ap.add_argument("--db", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    with args.members_csv.open(encoding="utf-8", newline="") as f:
        accounts = list(csv.DictReader(f))
    hps = rlm.read_historical_persons(args.db)
    proposed, review = rlm.build_stage_b(accounts, hps)
    descriptors = rlm._build_person_disposition_descriptors(
        proposed, review, accounts, hps,
        cohort_person_ids=rlm.membership_provisional_person_ids(hps))

    by_id = {(hp.get("person_id") or ""): hp for hp in hps}
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

        rows.append({
            "decision": plh.NO_ACCOUNT,
            "survivor_account_ids": "",
            "candidate_person_id": pid,
            "reason": plh.NO_VALID_ACCOUNT_IN_MEMBER_POPULATION,
            "fingerprint": d["fingerprint_for"](""),
            "note": "No valid account in the delivered member population bears this "
                    "name. The person is retained as an archival record and holds no "
                    "site account.",
            plh.DUPLICATE_TARGET_FIELD: "",
        })

    rows.sort(key=lambda r: (r["decision"], r["candidate_person_id"]))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=OUT_FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)

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

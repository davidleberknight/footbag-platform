#!/usr/bin/env python3
"""Fill is_hof / is_bap on the members export CSV by identity-join to the honor
rosters through the canonical person layer.

  is_hof — ID-join: the curated `hof.csv` carries a resolved `person_id` per
           honoree; join person_id -> historical_persons.legacy_member_id and
           flag that legacy account. No fuzzy name-matching.
  is_bap — `bap_data_updated.csv` is a name list only (no person_id). Match each
           BAP name (NFKC + lowercase normalized) against historical_persons
           person_name + aliases + name_variants, take ONLY unambiguous single
           matches, then ID-join person -> legacy_member_id. Ambiguous and
           unmatched names are reported, never guessed.

Both honors land via the person -> legacy_member_id link, so a flag only ever
attaches to the account a resolved person is linked to. Reads the DB and rosters
read-only; writes only the output CSV. Honorees that resolve to a person with no
legacy account, or that do not resolve at all, are reported for M12 / admin
follow-up (a wrong flag mis-grants a membership tier at claim).

The person -> legacy_member_id link comes from the database, where only the
already-attributed accounts carry it. Run after the reconciliation has proposed
more account links but before those links are written, pass --proposed-links to
overlay the proposed person -> account links on top of the database ones, so an
honoree whose account was linked only by a proposal still carries the honor to
that account in the output.
"""
from __future__ import annotations

import argparse
import csv
import re
import sqlite3
import unicodedata
from pathlib import Path


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", (s or "")).lower().strip()
    return re.sub(r"\s+", " ", s)


def _person_indexes(db: Path):
    """Return (name_norm -> {person_id}), (person_id -> legacy_member_id),
    (variant_norm -> canonical_norm)."""
    con = sqlite3.connect(str(db))
    name2pids: dict[str, set[str]] = {}
    pid2legacy: dict[str, str] = {}
    for pid, nm, al, lm in con.execute(
        "SELECT person_id, person_name, aliases, legacy_member_id FROM historical_persons"
    ):
        pid2legacy[pid] = lm
        for cand in [nm] + (re.split(r"[|;,]", al) if al else []):
            key = norm(cand)
            if key:
                name2pids.setdefault(key, set()).add(pid)
    variant2canon = {}
    try:
        for cn, vn in con.execute(
            "SELECT canonical_normalized, variant_normalized FROM name_variants"
        ):
            variant2canon[norm(vn)] = norm(cn)
    except sqlite3.OperationalError:
        pass
    con.close()
    return name2pids, pid2legacy, variant2canon


def hof_legacy_ids(hof_csv: Path, pid2legacy: dict) -> dict:
    """is_hof via the curated person_id. Returns counts + the flagged set."""
    flagged, person_no_legacy, no_person = set(), 0, 0
    with hof_csv.open(encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            pid = (r.get("person_id") or "").strip()
            if not pid:
                no_person += 1
                continue
            lm = pid2legacy.get(pid)
            if lm:
                flagged.add(lm)
            else:
                person_no_legacy += 1
    return {"flagged": flagged, "person_no_legacy": person_no_legacy, "no_person": no_person}


def bap_legacy_ids(bap_csv: Path, name2pids, pid2legacy, variant2canon) -> dict:
    """is_bap via name -> historical_persons -> legacy_member_id (unambiguous)."""
    flagged, ambiguous, unmatched, person_no_legacy = set(), [], [], 0
    with bap_csv.open(encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            name = r.get("name") or r.get("full_name") or ""
            key = norm(name)
            pids = name2pids.get(key)
            if not pids and key in variant2canon:
                pids = name2pids.get(variant2canon[key])
            if not pids:
                unmatched.append(name)
            elif len(pids) > 1:
                ambiguous.append(name)
            else:
                lm = pid2legacy.get(next(iter(pids)))
                if lm:
                    flagged.add(lm)
                else:
                    person_no_legacy += 1
    return {"flagged": flagged, "ambiguous": ambiguous,
            "unmatched": unmatched, "person_no_legacy": person_no_legacy}


def overlay_proposed_links(pid2legacy: dict, proposed_csv: Path) -> int:
    """Extend the person -> legacy_member_id map with the reconciliation's
    proposed links, so an honoree linked to an account only by a proposal (not
    yet written to the database) still carries its honor to that account. Returns
    the number of proposed links overlaid. Reads the proposals only."""
    n = 0
    with proposed_csv.open(encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            hp = (r.get("historical_person_id") or "").strip()
            lm = (r.get("legacy_member_id") or "").strip()
            if hp and lm:
                pid2legacy[hp] = lm
                n += 1
    return n


def apply_honors(members_csv: Path, db: Path, hof_csv: Path, bap_csv: Path, out_csv: Path,
                 proposed_links: Path | None = None) -> dict:
    name2pids, pid2legacy, variant2canon = _person_indexes(db)
    overlaid = overlay_proposed_links(pid2legacy, proposed_links) if proposed_links else 0
    hof = hof_legacy_ids(hof_csv, pid2legacy)
    bap = bap_legacy_ids(bap_csv, name2pids, pid2legacy, variant2canon)
    hof_ids, bap_ids = hof["flagged"], bap["flagged"]

    with members_csv.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        fields = list(reader.fieldnames or [])
        rows = list(reader)
    for col in ("is_hof", "is_bap"):
        if col not in fields:
            raise SystemExit(f"error: members CSV has no {col} column")

    hof_hits = bap_hits = 0
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        for r in rows:
            mid = r["legacy_member_id"].strip()
            r["is_hof"] = "1" if mid in hof_ids else "0"
            r["is_bap"] = "1" if mid in bap_ids else "0"
            hof_hits += r["is_hof"] == "1"
            bap_hits += r["is_bap"] == "1"
            w.writerow(r)

    return {
        "proposed_links_overlaid": overlaid,
        "hof_flagged": hof_hits,
        "hof_person_no_legacy": hof["person_no_legacy"],
        "hof_no_person": hof["no_person"],
        "bap_flagged": bap_hits,
        "bap_ambiguous": bap["ambiguous"],
        "bap_unmatched": bap["unmatched"],
        "bap_person_no_legacy": bap["person_no_legacy"],
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--members-csv", required=True, type=Path)
    ap.add_argument("--db", required=True, type=Path)
    ap.add_argument("--hof-csv", type=Path,
                    default=Path("legacy_data/inputs/hof.csv"))
    ap.add_argument("--bap-csv", type=Path,
                    default=Path("legacy_data/inputs/bap_data_updated.csv"))
    ap.add_argument("--proposed-links", type=Path, default=None,
                    help="Stage B proposed account-to-person links to overlay before "
                         "flagging (re-run after reconciliation; pre-apply)")
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()
    required = [args.members_csv, args.db, args.hof_csv, args.bap_csv]
    if args.proposed_links is not None:
        required.append(args.proposed_links)
    for p in required:
        if not p.is_file():
            raise SystemExit(f"error: not found: {p}")

    s = apply_honors(args.members_csv, args.db, args.hof_csv, args.bap_csv, args.out,
                     proposed_links=args.proposed_links)
    print(f"extract_legacy_honors -> {args.out}")
    if args.proposed_links is not None:
        print(f"  proposed links overlaid before flagging: {s['proposed_links_overlaid']}")
    print(f"  is_hof flagged (person_id ID-join):  {s['hof_flagged']}")
    print(f"    HoF person resolved, no legacy:    {s['hof_person_no_legacy']}")
    print(f"    HoF honoree unresolved (no pid):   {s['hof_no_person']}")
    print(f"  is_bap flagged (name -> person -> legacy): {s['bap_flagged']}")
    print(f"    BAP matched person, no legacy:     {s['bap_person_no_legacy']}")
    print(f"    BAP ambiguous (not flagged):       {len(s['bap_ambiguous'])} {s['bap_ambiguous'][:5]}")
    print(f"    BAP unmatched (not flagged):       {len(s['bap_unmatched'])} {s['bap_unmatched'][:5]}")


if __name__ == "__main__":
    main()

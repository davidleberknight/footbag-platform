#!/usr/bin/env python3
"""M12 — a-priori honors-flag validation.

Cross-checks the derived is_hof / is_bap flags on the members export against the
authoritative honor rosters, because a wrong flag mis-grants a Tier 2 membership
grant at claim. Reuses the `extract_legacy_honors` resolution, then:

  - emits a per-honoree CURATION WORKLIST (every roster honoree that did NOT
    land on a flagged account, with the reason: resolved-but-no-legacy-account,
    unresolved, ambiguous, or a roster anomaly);
  - runs INTEGRITY checks that exit non-zero: every is_hof / is_bap flag in the
    export traces back to a roster honoree (no flag without provenance), and
    every hof.csv person_id exists in historical_persons.

Two sources for the flags being checked. The member load checks the export CSV
before it loads it. The database mode (--flags-from-db) checks the flags as
loaded into legacy_members, so the real-data test row and the deploy can judge
the database they are about to rely on; it prints counts only, never a member id
or name, because its output reaches test logs.

Validates the captured-roster derivation only (no network). A live diff against
footbaghalloffame.net / bigaddposse.com to catch roster staleness is a separate,
opt-in step.
"""
from __future__ import annotations

import argparse
import csv
import importlib.util
import sqlite3
import sys
from pathlib import Path

_ELH = Path(__file__).resolve().parent / "extract_legacy_honors.py"
_spec = importlib.util.spec_from_file_location("extract_legacy_honors", _ELH)
elh = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(elh)


def flags_from_csv(members_csv: Path) -> tuple[set[str], set[str]]:
    with members_csv.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    return ({r["legacy_member_id"].strip() for r in rows if r.get("is_hof", "").strip() == "1"},
            {r["legacy_member_id"].strip() for r in rows if r.get("is_bap", "").strip() == "1"})


def flags_from_db(db: Path) -> tuple[set[str], set[str]]:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        hof = {r[0] for r in con.execute("SELECT legacy_member_id FROM legacy_members WHERE is_hof = 1")}
        bap = {r[0] for r in con.execute("SELECT legacy_member_id FROM legacy_members WHERE is_bap = 1")}
    finally:
        con.close()
    return hof, bap


def run(members_csv: Path | None, db: Path, hof_csv: Path, bap_csv: Path,
        worklist_out: Path | None, flags: tuple[set[str], set[str]] | None = None):
    name2pids, pid2legacy, variant2canon = elh._person_indexes(db)

    worklist: list[dict] = []        # honor, name, status, detail
    anomalies: list[str] = []        # hard errors -> non-zero exit
    # The same findings counted by kind, for output that must carry no id or name.
    anomaly_counts: dict[str, int] = {}

    # ---- HoF: per-honoree status from the curated person_id ----
    hof_expected: set[str] = set()
    with hof_csv.open(encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            name = (r.get("full_name") or r.get("name") or "").strip()
            pid = (r.get("person_id") or "").strip()
            if not pid:
                worklist.append({"honor": "hof", "name": name,
                                 "status": "unresolved", "detail": "no person_id in hof.csv"})
            elif pid not in pid2legacy:
                anomalies.append(f"hof person_id {pid} ({name}) not in historical_persons")
                anomaly_counts["hof person absent from historical_persons"] = \
                    anomaly_counts.get("hof person absent from historical_persons", 0) + 1
                worklist.append({"honor": "hof", "name": name,
                                 "status": "anomaly", "detail": f"person_id {pid} absent from persons"})
            elif not pid2legacy[pid]:
                worklist.append({"honor": "hof", "name": name,
                                 "status": "no_legacy_account", "detail": "person has no legacy_member_id"})
            else:
                hof_expected.add(pid2legacy[pid])

    # ---- BAP: per-honoree status from name resolution ----
    bap_expected: set[str] = set()
    with bap_csv.open(encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            name = (r.get("name") or r.get("full_name") or "").strip()
            key = elh.norm(name)
            pids = name2pids.get(key) or name2pids.get(variant2canon.get(key, ""))
            if not pids:
                worklist.append({"honor": "bap", "name": name,
                                 "status": "unmatched", "detail": "no historical_persons match"})
            elif len(pids) > 1:
                worklist.append({"honor": "bap", "name": name,
                                 "status": "ambiguous", "detail": f"{len(pids)} persons share this name"})
            else:
                lm = pid2legacy.get(next(iter(pids)))
                if lm:
                    bap_expected.add(lm)
                else:
                    worklist.append({"honor": "bap", "name": name,
                                     "status": "no_legacy_account", "detail": "matched person has no legacy_member_id"})

    # ---- reverse / integrity: flags in the export must trace to a roster ----
    actual_hof, actual_bap = flags if flags is not None else flags_from_csv(members_csv)

    for label, actual, expected in (("is_hof", actual_hof, hof_expected),
                                    ("is_bap", actual_bap, bap_expected)):
        orphan = sorted(actual - expected)
        if orphan:
            anomalies.append(f"{len(orphan)} {label} flag(s) with no roster trace (e.g. {orphan[:5]})")
            anomaly_counts[f"{label} flag with no roster trace"] = len(orphan)
        drift = sorted(expected - actual)
        if drift:
            anomalies.append(f"{len(drift)} roster-expected {label} flag(s) missing from export (e.g. {drift[:5]})")
            anomaly_counts[f"roster-expected {label} flag missing"] = len(drift)

    if worklist_out:
        worklist_out.parent.mkdir(parents=True, exist_ok=True)
        with worklist_out.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=["honor", "name", "status", "detail"], lineterminator="\n")
            w.writeheader()
            w.writerows(sorted(worklist, key=lambda x: (x["honor"], x["status"], x["name"])))

    return {
        "hof_flagged": len(actual_hof), "bap_flagged": len(actual_bap),
        "worklist": worklist, "anomalies": anomalies, "anomaly_counts": anomaly_counts,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--members-csv", type=Path,
                     help="the honors-filled members export CSV")
    src.add_argument("--flags-from-db", action="store_true",
                     help="check the flags as loaded into legacy_members in --db; counts only")
    ap.add_argument("--db", required=True, type=Path)
    ap.add_argument("--hof-csv", type=Path, default=Path("legacy_data/inputs/hof.csv"))
    ap.add_argument("--bap-csv", type=Path, default=Path("legacy_data/inputs/bap_data_updated.csv"))
    ap.add_argument("--worklist-out", type=Path, default=None,
                    help="write the per-honoree curation worklist CSV here")
    args = ap.parse_args()
    for p in (args.members_csv, args.db, args.hof_csv, args.bap_csv):
        if p is not None and not p.is_file():
            raise SystemExit(f"error: not found: {p}")

    if args.flags_from_db:
        s = run(None, args.db, args.hof_csv, args.bap_csv, None, flags_from_db(args.db))
        print(f"honours flags as loaded: is_hof {s['hof_flagged']}, is_bap {s['bap_flagged']}")
        for kind, n in sorted(s["anomaly_counts"].items()):
            print(f"  FAIL {kind}: {n}")
        n_anom = sum(s["anomaly_counts"].values())
        print("PASS honours flags trace to the rosters" if not n_anom
              else f"FAIL honours flags: {n_anom} mismatch(es)")
        sys.exit(1 if n_anom else 0)

    s = run(args.members_csv, args.db, args.hof_csv, args.bap_csv, args.worklist_out)
    from collections import Counter
    by = Counter((w["honor"], w["status"]) for w in s["worklist"])
    print("M12 honors-flag validation")
    print(f"  is_hof flagged: {s['hof_flagged']} | is_bap flagged: {s['bap_flagged']}")
    print("  curation worklist (honorees not landed on a flagged account):")
    for (honor, status), n in sorted(by.items()):
        print(f"    {honor} {status}: {n}")
    if s["anomalies"]:
        print("  INTEGRITY ANOMALIES:")
        for a in s["anomalies"]:
            print(f"    - {a}")
    n_anom = len(s["anomalies"])
    print("\n" + ("integrity OK" if not n_anom else f"{n_anom} anomaly(ies)"))
    sys.exit(1 if n_anom else 0)


if __name__ == "__main__":
    main()

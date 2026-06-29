#!/usr/bin/env python3
"""Read-only dry-run of the HoF / BAP honor resolution against the current
database, written as a curator worklist.

The production honor backfill (extract_legacy_honors.py) fills is_hof / is_bap on
the dump-derived members export at cutover. Before that dump exists, this report
runs the SAME resolution logic against the data already loaded so the resolution
can be proven and any gaps surfaced early: which honorees resolve to a member
account, which land on no account, and which names are ambiguous or unmatched and
need a curator decision. It writes no database rows and produces no member export.

It reuses the resolution functions from extract_legacy_honors so the dry-run and
the real backfill can never diverge. Output carries only public HoF / BAP roster
names (Sensitivity 1) and opaque legacy_member_id values, never member real names,
emails, or other personal fields, and is written under legacy_data/reports/, which
is not committed.
"""
from __future__ import annotations

import argparse
import csv
import sqlite3
import sys
from pathlib import Path

# extract_legacy_honors lives beside this script; reuse its resolution verbatim.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_legacy_honors import (  # noqa: E402
    _person_indexes,
    bap_legacy_ids,
    hof_legacy_ids,
)


def current_member_ids(db: Path) -> set[str]:
    con = sqlite3.connect(str(db))
    ids = {r[0] for r in con.execute("SELECT legacy_member_id FROM legacy_members")}
    con.close()
    return ids


def hof_worklist(hof_csv: Path, pid2legacy: dict, present: set[str]) -> dict:
    """Per-row HoF status so the worklist names the honorees that do not land on
    a current member account (the rows a curator must chase before cutover)."""
    landed, no_legacy_names, no_pid_names, not_present_names = [], [], [], []
    with hof_csv.open(encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            name = (r.get("full_name") or r.get("name") or "").strip()
            pid = (r.get("person_id") or "").strip()
            if not pid:
                no_pid_names.append(name)
                continue
            lm = pid2legacy.get(pid)
            if not lm:
                no_legacy_names.append(name)
            elif lm in present:
                landed.append(name)
            else:
                not_present_names.append(name)
    return {
        "landed": landed,
        "no_legacy": no_legacy_names,
        "no_pid": no_pid_names,
        "not_present": not_present_names,
    }


def render(lines: list[str], title: str, names: list[str]) -> None:
    lines.append(f"### {title} ({len(names)})")
    lines.append("")
    if names:
        lines.extend(f"- {n}" for n in sorted(names))
    else:
        lines.append("_none_")
    lines.append("")


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", type=Path, default=repo_root / "database/footbag.db")
    ap.add_argument("--hof-csv", type=Path, default=repo_root / "legacy_data/inputs/hof.csv")
    ap.add_argument("--bap-csv", type=Path, default=repo_root / "legacy_data/inputs/bap_data_updated.csv")
    ap.add_argument("--out", type=Path,
                    default=repo_root / "legacy_data/reports/legacy_member_honors_resolution.md")
    args = ap.parse_args()
    for p in (args.db, args.hof_csv, args.bap_csv):
        if not p.is_file():
            raise SystemExit(f"error: not found: {p}")

    name2pids, pid2legacy, variant2canon = _person_indexes(args.db)
    present = current_member_ids(args.db)
    hof = hof_legacy_ids(args.hof_csv, pid2legacy)
    bap = bap_legacy_ids(args.bap_csv, name2pids, pid2legacy, variant2canon)
    hof_wl = hof_worklist(args.hof_csv, pid2legacy, present)

    hof_flagged_present = len(hof["flagged"] & present)
    bap_flagged_present = len(bap["flagged"] & present)

    lines: list[str] = []
    lines.append("# Legacy member honor resolution (read-only dry-run)")
    lines.append("")
    lines.append(
        "Resolution of the HoF / BAP rosters against the data currently in the "
        "database, using the production resolution logic. No flags were written. "
        "`legacy_members` is currently mirror-seeded, so a flagged honoree only "
        "lands when the resolved person carries a `legacy_member_id` that exists "
        "in the current table; at cutover the same resolution runs against the "
        "real member dump."
    )
    lines.append("")
    lines.append(f"- `legacy_members` rows in DB: {len(present)}")
    lines.append("")
    lines.append("## Hall of Fame")
    lines.append("")
    lines.append(f"- Resolved to a member account (flagged): {len(hof['flagged'])}")
    lines.append(f"- Of those, present in current `legacy_members`: {hof_flagged_present}")
    lines.append(f"- Honoree resolved to a person with no linked member account: {hof['person_no_legacy']}")
    lines.append(f"- Honoree row with no `person_id` in `hof.csv`: {hof['no_person']}")
    lines.append("")
    render(lines, "HoF worklist: resolved person has no linked member account", hof_wl["no_legacy"])
    render(lines, "HoF worklist: no person_id in roster", hof_wl["no_pid"])
    render(lines, "HoF worklist: linked member account not in current table", hof_wl["not_present"])
    lines.append("## Big Add Posse")
    lines.append("")
    lines.append(f"- Resolved to a member account (flagged): {len(bap['flagged'])}")
    lines.append(f"- Of those, present in current `legacy_members`: {bap_flagged_present}")
    lines.append(f"- Matched a person with no linked member account: {bap['person_no_legacy']}")
    lines.append("")
    render(lines, "BAP worklist: ambiguous names (matched 2+ persons, never flagged)", bap["ambiguous"])
    render(lines, "BAP worklist: unmatched names (no person match)", bap["unmatched"])

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"report_legacy_member_honors -> {args.out}")
    print(f"  HoF flagged={len(hof['flagged'])} present={hof_flagged_present} "
          f"no_legacy={hof['person_no_legacy']} no_pid={hof['no_person']}")
    print(f"  BAP flagged={len(bap['flagged'])} present={bap_flagged_present} "
          f"ambiguous={len(bap['ambiguous'])} unmatched={len(bap['unmatched'])}")


if __name__ == "__main__":
    main()

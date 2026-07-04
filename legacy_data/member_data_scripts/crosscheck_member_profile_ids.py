#!/usr/bin/env python3
"""Read-only cross-check that the member IDs carried by member accounts match the
numeric IDs used in the old footbag.org profile-page URLs (`/members/profile/<id>/`).

A claimed legacy account and every old profile-link redirect depend on those two
ID spaces agreeing. This compares, read-only:

  A  legacy_members.legacy_member_id          (the member account IDs)
  B  mirror_member_id from club rosters        (IDs parsed out of profile URLs)
  C  historical_persons.legacy_member_id       (the result-attribution -> account link)

and reports the gaps: profile-URL IDs with no member account (a link that would
break), and account-link IDs with no member row (a result attribution pointing at
nothing). `legacy_members` is currently mirror-seeded from these same profile URLs,
so today A largely derives from B and high overlap is expected; the check is the
reusable harness that becomes decisive when A is the real dump's MemberID column.

Writes no database rows. All values are opaque numeric IDs; no names or personal
fields are emitted. Output is written under legacy_data/reports/, which is not
committed.
"""
from __future__ import annotations

import argparse
import csv
import sqlite3
from pathlib import Path


def ids_from_csv(path: Path, col: str) -> set[str]:
    out: set[str] = set()
    with path.open(encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            v = (r.get(col) or "").strip()
            if v:
                out.add(v)
    return out


def sample(s: set[str], n: int = 15) -> list[str]:
    return sorted(s)[:n]


def compare_id_sets(a_account: set[str], b_profile: set[str], c_hp: set[str]) -> dict:
    """Gaps between member-account IDs (A), profile-URL IDs (B), and the
    result-attribution links (C). profile_orphans and hp_orphans are the two
    that signal a real problem: a profile link or an attribution that points at
    no member account."""
    return {
        "profile_orphans": b_profile - a_account,
        "hp_orphans": c_hp - a_account,
        "account_only": a_account - b_profile,
        "profile_resolved": b_profile & a_account,
        "hp_resolved": c_hp & a_account,
    }


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", type=Path, default=repo_root / "database/footbag.db")
    ap.add_argument("--club-members-csv", type=Path,
                    default=repo_root / "legacy_data/seed/club_members.csv")
    ap.add_argument("--out", type=Path,
                    default=repo_root / "legacy_data/reports/member_id_profile_url_crosscheck.md")
    args = ap.parse_args()
    for p in (args.db, args.club_members_csv):
        if not p.is_file():
            raise SystemExit(f"error: not found: {p}")

    con = sqlite3.connect(str(args.db))
    a_account = {r[0] for r in con.execute("SELECT legacy_member_id FROM legacy_members")}
    c_hp = {r[0] for r in con.execute(
        "SELECT legacy_member_id FROM historical_persons WHERE legacy_member_id IS NOT NULL "
        "AND TRIM(legacy_member_id) != ''")}
    con.close()

    b_profile = ids_from_csv(args.club_members_csv, "mirror_member_id")
    profile_sources = ["club rosters (club_members.csv)"]

    gaps = compare_id_sets(a_account, b_profile, c_hp)
    profile_orphans = gaps["profile_orphans"]     # profile URL exists, no member account
    hp_orphans = gaps["hp_orphans"]               # result attribution points at no member row
    account_only = gaps["account_only"]           # member account not seen in any profile URL

    lines: list[str] = []
    lines.append("# Member ID vs profile-URL cross-check (read-only)")
    lines.append("")
    lines.append("Profile-URL ID sources: " + "; ".join(profile_sources) + ".")
    lines.append("")
    lines.append("| Set | Meaning | Count |")
    lines.append("|---|---|---|")
    lines.append(f"| A | member account IDs (`legacy_members`) | {len(a_account)} |")
    lines.append(f"| B | profile-URL IDs (`/members/profile/<id>/`) | {len(b_profile)} |")
    lines.append(f"| C | result-attribution links (`historical_persons.legacy_member_id`) | {len(c_hp)} |")
    lines.append(f"| B ∩ A | profile URLs that resolve to a member account | {len(b_profile & a_account)} |")
    lines.append(f"| C ∩ A | attribution links backed by a member row | {len(c_hp & a_account)} |")
    lines.append("")
    lines.append("## Gaps")
    lines.append("")
    lines.append(f"- **Profile URLs with no member account (B \\ A): {len(profile_orphans)}** "
                 "— an old profile link that would resolve to nothing.")
    lines.append(f"  sample: {sample(profile_orphans)}")
    lines.append(f"- **Attribution links with no member row (C \\ A): {len(hp_orphans)}** "
                 "— a result attribution pointing at no member account (should be empty if the FK holds).")
    lines.append(f"  sample: {sample(hp_orphans)}")
    lines.append(f"- Member accounts not seen in any profile URL (A \\ B): {len(account_only)} "
                 "— expected for members who are not on a mirrored club roster; informational.")
    lines.append("")
    lines.append("At cutover, re-run with A sourced from the real dump's MemberID column: "
                 "B \\ A then names dump rows whose profile URL has no account, and the assumption "
                 "that dump MemberIDs equal profile-URL IDs is confirmed when B \\ A is empty or "
                 "fully explained.")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"crosscheck_member_profile_ids -> {args.out}")
    print(f"  A(accounts)={len(a_account)} B(profile-URLs)={len(b_profile)} C(attribution)={len(c_hp)}")
    print(f"  profile URLs with no account (B\\A)={len(profile_orphans)}  "
          f"attribution with no account (C\\A)={len(hp_orphans)}")


if __name__ == "__main__":
    main()

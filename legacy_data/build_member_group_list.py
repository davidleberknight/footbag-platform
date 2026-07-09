#!/usr/bin/env python3
"""Builds a per-member list of footbag.org group memberships.

Reads the scraper's two output CSVs (group_members.csv and
group_settings.csv) and writes one row per (member, group) pair: the
member's name and profile ID, plus the group's ID, committee name, and
keyword. Sorted by member name so each member's groups list together.

Groups with 0 or 1 total members are skipped entirely, using the
groups/edit-derived `member_count` column in group_settings.csv (not a
recount of group_members.csv rows) as the authoritative member count.
"""
from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from pathlib import Path


def load_group_info(settings_path: Path) -> dict[str, dict]:
    info: dict[str, dict] = {}
    with settings_path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            member_count_raw = (row.get("member_count") or "").strip()
            info[row["group_id"]] = {
                "committee_name": row.get("CommitteeName", ""),
                "committee_keyword": row.get("CommitteeKeyword", ""),
                "member_count": int(member_count_raw) if member_count_raw.isdigit() else 0,
            }
    return info


def build_member_group_rows(members_path: Path, settings_path: Path) -> list[dict]:
    group_info = load_group_info(settings_path)

    members_by_group: dict[str, list[dict]] = defaultdict(list)
    with members_path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            members_by_group[row["group_id"]].append(row)

    rows: list[dict] = []
    for group_id, info in group_info.items():
        if info["member_count"] <= 1:
            continue
        for member in members_by_group.get(group_id, []):
            rows.append({
                "member_name": member["member_name"],
                "member_profile_id": member["member_profile_id"],
                "group_id": group_id,
                "committee_name": info["committee_name"],
                "committee_keyword": info["committee_keyword"],
            })

    rows.sort(key=lambda r: (r["member_name"].lower(), int(r["group_id"])))
    return rows


def write_member_groups_csv(path: Path, rows: list[dict]) -> None:
    fieldnames = ["member_name", "member_profile_id", "group_id", "committee_name", "committee_keyword"]
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--members-in", type=Path, default=Path("group_members.csv"))
    parser.add_argument("--settings-in", type=Path, default=Path("group_settings.csv"))
    parser.add_argument("--out", type=Path, default=Path("member_groups.csv"))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    rows = build_member_group_rows(args.members_in, args.settings_in)
    write_member_groups_csv(args.out, rows)
    member_count = len({row["member_profile_id"] for row in rows})
    print(f"Wrote {len(rows)} membership row(s) across {member_count} member(s) to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

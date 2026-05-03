#!/usr/bin/env python3
"""
patch_pt_v63_split_vu_brothers.py

Splits the conflated Vu-brother identity by removing the spurious 'Tu Vu'
entry from Tuan Vu's aliases_presentable list. Tu (Huge) and Tuan (Disco
Ninja) are distinct BAP members; both PT rows already exist with the
correct effective_person_id, but Tuan's row carried 'Tu Vu' as an alias,
which combined with overrides/person_aliases.csv routing 'Tu Vu' to
Tuan's pid caused all of Tu Vu's incoming placements to merge into Tuan
and overwrote Tuan's BAP nickname (Disco Ninja) with Tu's (Huge).

The companion alias-routing fix landed in overrides/person_aliases.csv
(retargeting 'Tu Vu' from 28565dd0 to c50fb80d). This patch enforces the
identity-split invariant on the canonical PT lock so the alias is no
longer reintroduced from the lock when the resolver rebuilds.

Scope (per user direction 2026-05-04):
  - Only remove 'Tu Vu' from Tuan Vu's aliases_presentable.
  - Do NOT touch player_ids_seen — placement re-attribution is Phase 2
    via patch_placements_*.
  - Do NOT add new aliases — those will be added once normalization is
    confirmed to resolve correctly without them.

Does not change row count. v62 had 4091 rows; v63 has 4091.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v63_split_vu_brothers.py
"""

from __future__ import annotations

import csv
import re
import shutil
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PT_IN  = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v62.csv"
PT_OUT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v63.csv"
PT_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"

TUAN_PID = "28565dd0-2196-5404-bf23-6cf0617ce79b"  # Tuan Vu (Disco Ninja)
SPURIOUS_ALIAS = "Tu Vu"                             # actually Tu Vu (Huge), the brother

_TRANSLITERATE = str.maketrans("łŁøØđĐðÞŋ", "lLoOdDdTn")


def _norm_for_sort(s: str) -> str:
    s = (s or "").replace("�", "").replace("­", "")
    s = s.translate(_TRANSLITERATE)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.lower().strip())


def strip_alias(aliases_field: str, doomed: str) -> tuple[str, bool]:
    """Remove `doomed` from a pipe-separated aliases string. Returns (new, changed)."""
    parts = [p.strip() for p in (aliases_field or "").split("|")]
    out = [p for p in parts if p and p != doomed]
    new = " | ".join(out)
    return new, new != aliases_field


def main() -> None:
    if not PT_IN.exists():
        print(f"ERROR: {PT_IN} not found", file=sys.stderr); sys.exit(1)

    with open(PT_IN, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None
        rows = list(reader)

    print(f"v62 input rows: {len(rows)}")

    target = next((r for r in rows if r["effective_person_id"] == TUAN_PID), None)
    if target is None:
        print(f"ERROR: target pid {TUAN_PID} (Tuan Vu) not found in v62", file=sys.stderr)
        sys.exit(2)

    before = target.get("aliases_presentable", "")
    after, changed = strip_alias(before, SPURIOUS_ALIAS)
    if not changed:
        print(f"NOTE: aliases_presentable on {TUAN_PID} did not contain '{SPURIOUS_ALIAS}'; v63 will be byte-identical to v62", file=sys.stderr)
    else:
        print(f"  Tuan Vu aliases_presentable:")
        print(f"    before: {before}")
        print(f"    after:  {after}")
        target["aliases_presentable"] = after

    rows.sort(key=lambda r: _norm_for_sort(r.get("person_canon", "")))

    with open(PT_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    # Update version-free latest to match (per identity-lock refactor 2026-04-27).
    shutil.copyfile(PT_OUT, PT_VERSION_FREE)

    print(f"\nOutput: {PT_OUT}")
    print(f"        {PT_VERSION_FREE} (version-free latest, copied from v63)")
    print(f"  v62 rows: {len(rows)}  v63 rows: {len(rows)}  delta: 0 (cell-edit only)")


if __name__ == "__main__":
    main()

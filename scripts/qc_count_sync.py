#!/usr/bin/env python3
"""Count-sync QC between the live Trick Dictionary (DB) and the Emerging
Vocabulary snapshot. Read-only. Run after every dictionary reload.

Guards:
  - the public trick count uses the isTrickRow definition (excludes set /
    modifier / multi-bag / non-trick rows); reports it against the raw active count
  - ADD coverage: every trick must carry a numeric ADD, else it is counted by the
    hero but dropped from the By-ADD view (hero != ADD-bucket sum)
  - layer separation: no observational-universe slug may be canonical-published

Exits non-zero on a hard violation (ADD gap or overlap). isTrickRow is
approximated by category here (the service resolves it via resolveTrickKind on
the slug); the trick total matches, the notation split is within ~2.
"""
import re
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DB = REPO / "database/footbag.db"
OBS = REPO / "src/content/freestyleObservationalUniverse.ts"
NON_TRICK = {"set", "modifier", "multi-bag"}


def is_numeric(adds) -> bool:
    return bool(adds) and bool(re.fullmatch(r"\d+", str(adds).strip()))


def main() -> int:
    con = sqlite3.connect(DB)
    rows = con.execute(
        "SELECT slug, adds, category, operational_notation "
        "FROM freestyle_tricks WHERE is_active = 1"
    ).fetchall()
    tricks = [r for r in rows if r[2] not in NON_TRICK]
    notated = sum(1 for r in tricks if r[3] and r[3].strip())
    add_missing = [r[0] for r in tricks if not is_numeric(r[1])]

    obs_slugs = set(re.findall(r'"slug":\s*"([^"]+)"', OBS.read_text()))
    canonical = {r[0] for r in tricks}
    overlap = sorted(obs_slugs & canonical)

    print(f"documented tricks (isTrickRow): {len(tricks)}   (raw active rows: {len(rows)}; "
          f"non-trick excluded: {len(rows) - len(tricks)})")
    print(f"notation coverage: {notated}/{len(tricks)} "
          f"({100 * notated / len(tricks):.0f}%); notation-less: {len(tricks) - notated}")
    print(f"ADD coverage: {len(tricks) - len(add_missing)}/{len(tricks)}")
    print(f"observational slugs: {len(obs_slugs)}; overlap with canonical: {len(overlap)}")

    failed = False
    if add_missing:
        print(f"  FAIL: {len(add_missing)} trick(s) lack a numeric ADD (dropped from By-ADD view): "
              f"{add_missing[:10]}")
        failed = True
    if overlap:
        print(f"  FAIL: {len(overlap)} observational slug(s) are canonical-published "
              f"(layer-separation breach): {overlap[:10]}")
        failed = True
    if not failed:
        print("  OK: ADD coverage 100%, layer separation clean.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

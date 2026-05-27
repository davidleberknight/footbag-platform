"""
W9b — Apply 5 more stepping compound promotions (Cat A, multi-modifier
and modifier-on-canonical-compound).

Continues the stepping ecosystem opened in W9a. All five base tricks are
already canonical in DB; no folk-name collision; no doctrine block.

  stepping-superfly          6 ADD = stepping(+1) + superfly(5)
  stepping-symposium-mirage  4 ADD = stepping(+1) + symposium(+1) + mirage(2)
  stepping-butterfly-swirl   5 ADD = stepping(+1) + butterfly-swirl(4)
  stepping-double-over-down  5 ADD = stepping(+1) + double-over-down(4)
  stepping-symposium-whirl   5 ADD = stepping(+1) + symposium(+1) + whirl(3)

Sibling chassis: stepping leading-[DEX] pattern (SKILL.md §B.3) — prefix
base's body with `CLIP > OP IN [DEX] >`, dropping the base's leading SET
or TOE entry and preserving its bracket chain.

Skipped from this batch:
  - stepping-drifter (= tombstone folk canonical; already in DB)
  - stepping-grifter / stepping-reverse-swirl / stepping-diving-mirage /
    stepping-diving-butterfly / stepping-motion (base trick not yet
    canonical in DB; deferred until bases land)
  - stepping-baroque / stepping-massacre (folk names with unclear
    decomposition; deferred for curator)
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W9B_ROWS = [
    (
        "stepping-superfly", 6, "superfly", "stepping",
        "Stepping modifier on superfly base. 6 ADD = stepping(+1) + superfly(5); JOB CLIP > OP IN [DEX] >> (no plant while) SAME OUT [DEX] [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]. Stepping leading-[DEX] chassis prefixed to superfly's no-plant body chain.",
        "W9b stepping 2026-05-27: stepping leading-[DEX] chassis + superfly's no-plant body chain. 6 brackets matches 6 ADD.",
    ),
    (
        "stepping-symposium-mirage", 4, "mirage", "stepping|symposium",
        "Stepping + symposium on mirage base. 4 ADD = stepping(+1) + symposium(+1) + mirage(2); JOB CLIP > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]. Stepping leading-[DEX] chassis prefixed to symposium-mirage's no-plant body event + mirage's toe terminal.",
        "W9b stepping 2026-05-27: stepping leading-[DEX] chassis + symposium-mirage chain. 4 brackets matches 4 ADD.",
    ),
    (
        "stepping-butterfly-swirl", 5, "butterfly-swirl", "stepping",
        "Stepping modifier on butterfly-swirl base. 5 ADD = stepping(+1) + butterfly-swirl(4); JOB CLIP > OP IN [DEX] > SAME/OP OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]. Stepping leading-[DEX] chassis prefixed to butterfly-swirl's out-dex + back-swirl + same-clip terminal.",
        "W9b stepping 2026-05-27: stepping leading-[DEX] chassis + butterfly-swirl chain. 5 brackets matches 5 ADD.",
    ),
    (
        "stepping-double-over-down", 5, "double-over-down", "stepping",
        "Stepping modifier on double-over-down base. 5 ADD = stepping(+1) + double-over-down(4); JOB CLIP > OP IN [DEX] > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]. Stepping leading-[DEX] chassis prefixed to double-over-down's two-OUT-dex + cross-body-clipper chain.",
        "W9b stepping 2026-05-27: stepping leading-[DEX] chassis + double-over-down chain. 5 brackets matches 5 ADD.",
    ),
    (
        "stepping-symposium-whirl", 5, "whirl", "stepping|symposium",
        "Stepping + symposium on whirl base. 5 ADD = stepping(+1) + symposium(+1) + whirl(3); JOB CLIP > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]. Stepping leading-[DEX] chassis prefixed to symposium-whirl's no-plant body event + cross-body-clipper terminal.",
        "W9b stepping 2026-05-27: stepping leading-[DEX] chassis + symposium-whirl chain. 5 brackets matches 5 ADD.",
    ),
]

W9B_CORRECTIONS = [
    ("stepping-superfly", "notation", "STEPPING SUPERFLY",
     "W9b 2026-05-27: JOB per mechanical uppercase rule."),
    ("stepping-superfly", "operational_notation",
     "CLIP > OP IN [DEX] >> (no plant while) SAME OUT [DEX] [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W9b 2026-05-27: stepping leading-[DEX] + superfly's no-plant body chain. 6 brackets matches 6 ADD."),

    ("stepping-symposium-mirage", "notation", "STEPPING SYMPOSIUM MIRAGE",
     "W9b 2026-05-27: JOB per mechanical uppercase rule."),
    ("stepping-symposium-mirage", "operational_notation",
     "CLIP > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]",
     "W9b 2026-05-27: stepping leading-[DEX] + symposium-mirage chain. 4 brackets matches 4 ADD."),

    ("stepping-butterfly-swirl", "notation", "STEPPING BUTTERFLY SWIRL",
     "W9b 2026-05-27: JOB per mechanical uppercase rule."),
    ("stepping-butterfly-swirl", "operational_notation",
     "CLIP > OP IN [DEX] > SAME/OP OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]",
     "W9b 2026-05-27: stepping leading-[DEX] + butterfly-swirl chain. 5 brackets matches 5 ADD."),

    ("stepping-double-over-down", "notation", "STEPPING DOUBLE OVER DOWN",
     "W9b 2026-05-27: JOB per mechanical uppercase rule."),
    ("stepping-double-over-down", "operational_notation",
     "CLIP > OP IN [DEX] > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W9b 2026-05-27: stepping leading-[DEX] + double-over-down chain. 5 brackets matches 5 ADD."),

    ("stepping-symposium-whirl", "notation", "STEPPING SYMPOSIUM WHIRL",
     "W9b 2026-05-27: JOB per mechanical uppercase rule."),
    ("stepping-symposium-whirl", "operational_notation",
     "CLIP > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]",
     "W9b 2026-05-27: stepping leading-[DEX] + symposium-whirl chain. 5 brackets matches 5 ADD."),
]


def name_exists_in_additions(canonical_name: str) -> bool:
    with ADD_CSV.open(encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            if row["canonical_name"] == canonical_name:
                return True
    return False


def correction_exists(slug: str, column: str) -> bool:
    with COR_CSV.open(encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            if len(row) >= 2 and row[0] == slug and row[1] == column:
                return True
    return False


def main() -> None:
    add_skipped = 0
    add_appended = 0
    with ADD_CSV.open("a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        for canonical, adds, base, modifier_links, desc, note in W9B_ROWS:
            if name_exists_in_additions(canonical):
                add_skipped += 1
                continue
            w.writerow([
                canonical, adds, base, "compound", "", modifier_links,
                desc, "expert_reviewed", "1", note,
            ])
            add_appended += 1

    cor_skipped = 0
    cor_appended = 0
    with COR_CSV.open("a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        for slug, column, new_val, note in W9B_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()

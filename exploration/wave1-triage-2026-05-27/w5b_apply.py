"""
W5b — Apply 5 more fairy compound promotions.

Sibling chassis (fairy direction-flip from pixie counterparts):
  - pixie-double-leg-over (W3b)        → fairy-double-leg-over
  - pixie-symposium-mirage             → fairy-symposium-mirage
  - pixie-symposium-eggbeater (W3b)    → fairy-symposium-eggbeater
  - pixie-symposium-whirl (W3a)        → fairy-symposium-whirl
  - darkwalk (= pixie-diving-near-butterfly) → fairy-diving-butterfly

Fairy flip rule: first dex direction changes from SAME IN (pixie) to
SAME OUT (fairy). Everything else in the chassis is preserved.

Multi-modifier rows use pipe-separated modifier_links per the
fairy-ducking-X convention; fairy-double-leg-over (single modifier)
leaves modifier_links blank per fairy-eggbeater / fairy-legover pattern.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W5B_ROWS = [
    # (canonical, adds, base, modifier_links, description, note)
    (
        "fairy-double-leg-over", 4, "double-leg-over", "",
        "Fairy modifier on double-leg-over base. 4 ADD = fairy(+1) + double-leg-over(3); JOB TOE > SAME OUT [DEX] > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL].",
        "W5b fairy 2026-05-27: fairy direction-flip of pixie-double-leg-over (W3b). Fairy first dex = SAME OUT vs pixie's SAME IN. 4 brackets matches 4 ADD.",
    ),
    (
        "fairy-symposium-mirage", 4, "mirage", "fairy|symposium",
        "Fairy + symposium on mirage base. 4 ADD = fairy(+1) + symposium(+1) + mirage(2); JOB TOE > SAME OUT [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL].",
        "W5b fairy 2026-05-27: fairy direction-flip of pixie-symposium-mirage. 4 brackets matches 4 ADD.",
    ),
    (
        "fairy-symposium-eggbeater", 5, "eggbeater", "fairy|symposium",
        "Fairy + symposium on eggbeater base. 5 ADD = fairy(+1) + symposium(+1) + eggbeater(3); JOB TOE > SAME OUT [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL].",
        "W5b fairy 2026-05-27: fairy direction-flip of pixie-symposium-eggbeater (W3b). 5 brackets matches 5 ADD.",
    ),
    (
        "fairy-symposium-whirl", 5, "whirl", "fairy|symposium",
        "Fairy + symposium on whirl base. 5 ADD = fairy(+1) + symposium(+1) + whirl(3); JOB TOE > SAME OUT [DEX] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL].",
        "W5b fairy 2026-05-27: fairy direction-flip of pixie-symposium-whirl (W3a). 5 brackets matches 5 ADD.",
    ),
    (
        "fairy-diving-butterfly", 5, "butterfly", "fairy|diving",
        "Fairy + diving on butterfly base. 5 ADD = fairy(+1) + diving(+1) + butterfly(3); JOB TOE > SAME OUT [DEX] >> DIVE [BOD] >> SAME OUT [DEX] > OP CLIP [XBD] [DEL].",
        "W5b fairy 2026-05-27: fairy direction-flip of darkwalk (= pixie-diving-near-butterfly). 5 brackets matches 5 ADD.",
    ),
]

W5B_CORRECTIONS = [
    ("fairy-double-leg-over", "notation", "FAIRY DOUBLE LEG OVER",
     "W5b 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-double-leg-over", "operational_notation",
     "TOE > SAME OUT [DEX] > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W5b 2026-05-27: fairy direction-flip of pixie-double-leg-over chassis. 4 brackets matches 4 ADD."),

    ("fairy-symposium-mirage", "notation", "FAIRY SYMPOSIUM MIRAGE",
     "W5b 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-symposium-mirage", "operational_notation",
     "TOE > SAME OUT [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]",
     "W5b 2026-05-27: fairy direction-flip of pixie-symposium-mirage chassis. 4 brackets matches 4 ADD."),

    ("fairy-symposium-eggbeater", "notation", "FAIRY SYMPOSIUM EGGBEATER",
     "W5b 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-symposium-eggbeater", "operational_notation",
     "TOE > SAME OUT [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W5b 2026-05-27: fairy direction-flip of pixie-symposium-eggbeater chassis. 5 brackets matches 5 ADD."),

    ("fairy-symposium-whirl", "notation", "FAIRY SYMPOSIUM WHIRL",
     "W5b 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-symposium-whirl", "operational_notation",
     "TOE > SAME OUT [DEX] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]",
     "W5b 2026-05-27: fairy direction-flip of pixie-symposium-whirl chassis. 5 brackets matches 5 ADD."),

    ("fairy-diving-butterfly", "notation", "FAIRY DIVING BUTTERFLY",
     "W5b 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-diving-butterfly", "operational_notation",
     "TOE > SAME OUT [DEX] >> DIVE [BOD] >> SAME OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W5b 2026-05-27: fairy direction-flip of darkwalk chassis. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W5B_ROWS:
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
        for slug, column, new_val, note in W5B_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()

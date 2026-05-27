"""
W8b — Apply 5 more ducking compound promotions (doctrine-clean).

Extends ducking into paradox-X multi-modifier compounds + cross-family
stepping/spinning ducking variants:

  ducking-paradox-whirl              5 ADD = ducking(+1) + paradox(+1) + whirl(3)
  ducking-paradox-drifter            5 ADD = ducking(+1) + paradox(+1) + drifter(3)
  ducking-paradox-flail              5 ADD = ducking(+1) + paradox(+1) + flail(3)
  stepping-ducking-double-leg-over   5 ADD = stepping(+1) + ducking(+1) + double-leg-over(3)
  spinning-ducking-butterfly         5 ADD = spinning(+1) + ducking(+1) + butterfly(3)

Sibling chassis:
  - ducking-paradox-illusion / ducking-paradox-mirage (canonical at
    4 ADD; CLIP > DUCK [BOD] > <paradox dex> > <terminal>) → ducking-
    paradox-{whirl,drifter,flail}
  - stepping-ducking-mirage (DK-1; CLIP > OP IN [DEX] > DUCK [BOD] >
    <base dex> > <terminal>) → stepping-ducking-double-leg-over
  - spinning-ducking-mirage (W6c; CLIP > (back) SPIN [BOD] > DUCK [BOD] >
    <base dex+terminal>) → spinning-ducking-butterfly

ducking-paradox-flail has triple [BOD] front (ducking + flail's no-plant +
paradox merged with flail's dex marker). Slug stepping-ducking-double-
leg-over uses full-form per DB convention (matches double-leg-over
canonical slug, parallel to W5b fairy-double-leg-over).

No doctrine-token contamination in any W8b slug.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W8B_ROWS = [
    (
        "ducking-paradox-whirl", 5, "whirl", "ducking|paradox",
        "Ducking + paradox on whirl base. 5 ADD = ducking(+1) + paradox(+1) + whirl(3); JOB CLIP > DUCK [BOD] > OP IN [PDX] [DEX] > OP CLIP [XBD] [DEL].",
        "W8b ducking 2026-05-27: ducking-paradox-mirage chassis (CLIP > DUCK [BOD] > OP IN [PDX] [DEX] > <terminal>) with whirl's cross-body clipper terminator. 5 brackets matches 5 ADD.",
    ),
    (
        "ducking-paradox-drifter", 5, "drifter", "ducking|paradox",
        "Ducking + paradox on drifter base. 5 ADD = ducking(+1) + paradox(+1) + drifter(3); JOB CLIP > DUCK [BOD] > OP IN [PDX] [DEX] > SAME CLIP [XBD] [DEL].",
        "W8b ducking 2026-05-27: ducking-paradox chassis + drifter's same-clip terminator. 5 brackets matches 5 ADD.",
    ),
    (
        "ducking-paradox-flail", 5, "flail", "ducking|paradox",
        "Ducking + paradox on flail base. 5 ADD = ducking(+1) + paradox(+1) + flail(3); JOB TOE > DUCK [BOD] > (no plant while) OP OUT [PDX] [BOD] [DEX] > OP TOE [DEL]. Combines paradox marker with flail's no-plant body+dex.",
        "W8b ducking 2026-05-27: ducking + flail chassis with paradox marker merged into flail's no-plant dex. Triple-bracket dex group [PDX] [BOD] [DEX]. 5 brackets matches 5 ADD.",
    ),
    (
        "stepping-ducking-double-leg-over", 5, "double-leg-over", "stepping|ducking",
        "Stepping + ducking on double-leg-over base. 5 ADD = stepping(+1) + ducking(+1) + double-leg-over(3); JOB CLIP > OP IN [DEX] > DUCK [BOD] > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]. Source-named 'Stepping Ducking DLO'; slug normalized to double-leg-over full-form per DB convention.",
        "W8b ducking 2026-05-27: stepping-ducking-mirage chassis + double-leg-over's two-dex chain + same-toe terminal. 5 brackets matches 5 ADD.",
    ),
    (
        "spinning-ducking-butterfly", 5, "butterfly", "spinning|ducking",
        "Spinning + ducking on butterfly base. 5 ADD = spinning(+1) + ducking(+1) + butterfly(3); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL].",
        "W8b ducking 2026-05-27: spinning-ducking chassis + butterfly's OP OUT dex + cross-body clipper terminator. 5 brackets matches 5 ADD.",
    ),
]

W8B_CORRECTIONS = [
    ("ducking-paradox-whirl", "notation", "DUCKING PARADOX WHIRL",
     "W8b 2026-05-27: JOB per mechanical uppercase rule."),
    ("ducking-paradox-whirl", "operational_notation",
     "CLIP > DUCK [BOD] > OP IN [PDX] [DEX] > OP CLIP [XBD] [DEL]",
     "W8b 2026-05-27: ducking-paradox chassis + whirl cross-clip terminal. 5 brackets matches 5 ADD."),

    ("ducking-paradox-drifter", "notation", "DUCKING PARADOX DRIFTER",
     "W8b 2026-05-27: JOB per mechanical uppercase rule."),
    ("ducking-paradox-drifter", "operational_notation",
     "CLIP > DUCK [BOD] > OP IN [PDX] [DEX] > SAME CLIP [XBD] [DEL]",
     "W8b 2026-05-27: ducking-paradox chassis + drifter same-clip terminal. 5 brackets matches 5 ADD."),

    ("ducking-paradox-flail", "notation", "DUCKING PARADOX FLAIL",
     "W8b 2026-05-27: JOB per mechanical uppercase rule."),
    ("ducking-paradox-flail", "operational_notation",
     "TOE > DUCK [BOD] > (no plant while) OP OUT [PDX] [BOD] [DEX] > OP TOE [DEL]",
     "W8b 2026-05-27: ducking + flail chassis with paradox marker on no-plant dex. 5 brackets matches 5 ADD."),

    ("stepping-ducking-double-leg-over", "notation", "STEPPING DUCKING DOUBLE LEG OVER",
     "W8b 2026-05-27: JOB per mechanical uppercase rule."),
    ("stepping-ducking-double-leg-over", "operational_notation",
     "CLIP > OP IN [DEX] > DUCK [BOD] > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W8b 2026-05-27: stepping-ducking chassis + double-leg-over chain. 5 brackets matches 5 ADD."),

    ("spinning-ducking-butterfly", "notation", "SPINNING DUCKING BUTTERFLY",
     "W8b 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-butterfly", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W8b 2026-05-27: spinning-ducking chassis + butterfly OP OUT dex + cross-clip terminal. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W8B_ROWS:
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
        for slug, column, new_val, note in W8B_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()

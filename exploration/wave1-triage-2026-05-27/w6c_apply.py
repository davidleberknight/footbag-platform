"""
W6c — Apply 5 more spinning compound promotions.

Extends spinning into drifter + ducking-X compound bases:

  spinning-drifter            4 ADD = spinning(+1) + drifter(3)
  spinning-ducking-mirage     4 ADD = spinning(+1) + ducking(+1) + mirage(2)
  spinning-ducking-illusion   4 ADD = spinning(+1) + ducking(+1) + illusion(2)
  spinning-ducking-pickup     4 ADD = spinning(+1) + ducking(+1) + pickup(2)
  spinning-ducking-legover    4 ADD = spinning(+1) + ducking(+1) + legover(2)

Sibling chassis pattern: spinning + body-modifier follows the
spinning-symposium-whirl precedent (CLIP > (back) SPIN [BOD] > <body-event
bracket> > <base dex+terminal>). For ducking-X compounds: spinning's
back-spin comes first, then DUCK [BOD], then base trick's dex+terminal.

Replaced spinning-clipper from the proposed W6c list (already canonical
in DB at 3 ADD).
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W6C_ROWS = [
    (
        "spinning-drifter", 4, "drifter", "",
        "Spinning modifier on drifter base. 4 ADD = spinning(+1) + drifter(3); JOB CLIP > (back) SPIN [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL].",
        "W6c spinning 2026-05-27: spinning chassis + drifter's IN-dex + same-clip terminator. 4 brackets matches 4 ADD.",
    ),
    (
        "spinning-ducking-mirage", 4, "mirage", "spinning|ducking",
        "Spinning + ducking on mirage base. 4 ADD = spinning(+1) + ducking(+1) + mirage(2); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [DEX] > OP TOE [DEL].",
        "W6c spinning 2026-05-27: spinning-symposium-X chassis pattern with DUCK [BOD] instead of (no plant while) symposium body event. spinning spin first, then ducking dip, then base dex + terminal. 4 brackets matches 4 ADD.",
    ),
    (
        "spinning-ducking-illusion", 4, "illusion", "spinning|ducking",
        "Spinning + ducking on illusion base. 4 ADD = spinning(+1) + ducking(+1) + illusion(2); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP OUT [DEX] > OP TOE [DEL].",
        "W6c spinning 2026-05-27: same chassis as spinning-ducking-mirage with illusion's OP OUT dex (vs mirage's OP IN). 4 brackets matches 4 ADD.",
    ),
    (
        "spinning-ducking-pickup", 4, "pickup", "spinning|ducking",
        "Spinning + ducking on pickup base. 4 ADD = spinning(+1) + ducking(+1) + pickup(2); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [DEX] > SAME TOE [DEL].",
        "W6c spinning 2026-05-27: spinning-ducking chassis with pickup's same-toe terminator (vs mirage's op-toe). 4 brackets matches 4 ADD.",
    ),
    (
        "spinning-ducking-legover", 4, "legover", "spinning|ducking",
        "Spinning + ducking on legover base. 4 ADD = spinning(+1) + ducking(+1) + legover(2); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP OUT [DEX] > SAME TOE [DEL].",
        "W6c spinning 2026-05-27: spinning-ducking chassis with legover's OP OUT dex + same-toe terminator. 4 brackets matches 4 ADD.",
    ),
]

W6C_CORRECTIONS = [
    ("spinning-drifter", "notation", "SPINNING DRIFTER",
     "W6c 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-drifter", "operational_notation",
     "CLIP > (back) SPIN [BOD] > OP IN [DEX] > SAME CLIP [XBD] [DEL]",
     "W6c 2026-05-27: spinning chassis + drifter chain. 4 brackets matches 4 ADD."),

    ("spinning-ducking-mirage", "notation", "SPINNING DUCKING MIRAGE",
     "W6c 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-mirage", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [DEX] > OP TOE [DEL]",
     "W6c 2026-05-27: spinning + DUCK [BOD] + mirage chassis. 4 brackets matches 4 ADD."),

    ("spinning-ducking-illusion", "notation", "SPINNING DUCKING ILLUSION",
     "W6c 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-illusion", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP OUT [DEX] > OP TOE [DEL]",
     "W6c 2026-05-27: spinning-ducking chassis + illusion OUT-dex + op-toe terminator. 4 brackets matches 4 ADD."),

    ("spinning-ducking-pickup", "notation", "SPINNING DUCKING PICKUP",
     "W6c 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-pickup", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [DEX] > SAME TOE [DEL]",
     "W6c 2026-05-27: spinning-ducking chassis + pickup same-toe terminal. 4 brackets matches 4 ADD."),

    ("spinning-ducking-legover", "notation", "SPINNING DUCKING LEGOVER",
     "W6c 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-legover", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP OUT [DEX] > SAME TOE [DEL]",
     "W6c 2026-05-27: spinning-ducking chassis + legover OUT-dex + same-toe terminal. 4 brackets matches 4 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W6C_ROWS:
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
        for slug, column, new_val, note in W6C_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()

"""
W6d — Apply 5 more spinning compound promotions.

Extends spinning-ducking-X across clipper/osis/whirl/blender bases +
adds spinning-symposium-eggbeater:

  spinning-ducking-clipper      4 ADD = spinning(+1) + ducking(+1) + clipper-stall(2)
  spinning-ducking-osis         5 ADD = spinning(+1) + ducking(+1) + osis(3)   [triple BOD]
  spinning-ducking-whirl        5 ADD = spinning(+1) + ducking(+1) + whirl(3)
  spinning-ducking-blender      6 ADD = spinning(+1) + ducking(+1) + blender(4) [triple BOD]
  spinning-symposium-eggbeater  5 ADD = spinning(+1) + symposium(+1) + eggbeater(3)

Sibling chassis (W6c pattern): spinning + ducking-X = CLIP > (back) SPIN
[BOD] > DUCK [BOD] > <base trick's dex+terminal>. For osis and blender,
the base trick carries its own back-spin, producing TRIPLE [BOD]
construction (spinning's spin + ducking's dip + base's spin).

spinning-symposium-eggbeater uses the spinning-symposium-X chassis
(CLIP > (back) SPIN [BOD] > (no plant while) OP OUT [BOD] [DEX] > ...)
substituting eggbeater's two-OP-OUT-dex chain.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W6D_ROWS = [
    (
        "spinning-ducking-clipper", 4, "clipper-stall", "spinning|ducking",
        "Spinning + ducking on clipper-stall base. 4 ADD = spinning(+1) + ducking(+1) + clipper-stall(2); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP CLIP [XBD] [DEL].",
        "W6d spinning 2026-05-27: spinning-ducking chassis collapsed to clipper terminal (no inner dex; clipper-stall has none). 4 brackets ([BOD] [BOD] [XBD] [DEL]) matches 4 ADD.",
    ),
    (
        "spinning-ducking-osis", 5, "osis", "spinning|ducking",
        "Spinning + ducking on osis base. 5 ADD = spinning(+1) + ducking(+1) + osis(3); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Triple-body-event compound (spinning's spin + ducking's dip + osis's own back-spin).",
        "W6d spinning 2026-05-27: spinning-ducking chassis with osis's body-spin in the dex slot. Triple [BOD] per the stepping-ducking-osis + pixie-ducking-osis precedent. 5 brackets matches 5 ADD.",
    ),
    (
        "spinning-ducking-whirl", 5, "whirl", "spinning|ducking",
        "Spinning + ducking on whirl base. 5 ADD = spinning(+1) + ducking(+1) + whirl(3); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL].",
        "W6d spinning 2026-05-27: spinning-ducking chassis + whirl's IN-dex + cross-body clipper terminator. 5 brackets matches 5 ADD.",
    ),
    (
        "spinning-ducking-blender", 6, "blender", "spinning|ducking",
        "Spinning + ducking on blender base. 6 ADD = spinning(+1) + ducking(+1) + blender(4); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Triple-body-event compound.",
        "W6d spinning 2026-05-27: spinning-ducking chassis + blender's IN-dex + own back-spin + same-clip terminator. Triple [BOD]. 6 brackets matches 6 ADD.",
    ),
    (
        "spinning-symposium-eggbeater", 5, "eggbeater", "spinning|symposium",
        "Spinning + symposium on eggbeater base. 5 ADD = spinning(+1) + symposium(+1) + eggbeater(3); JOB CLIP > (back) SPIN [BOD] > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL].",
        "W6d spinning 2026-05-27: spinning-symposium-whirl chassis + eggbeater's two-OP-OUT-dex chain + same-toe terminal. 5 brackets matches 5 ADD.",
    ),
]

W6D_CORRECTIONS = [
    ("spinning-ducking-clipper", "notation", "SPINNING DUCKING CLIPPER",
     "W6d 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-clipper", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP CLIP [XBD] [DEL]",
     "W6d 2026-05-27: spinning-ducking chassis collapsed to clipper terminal. 4 brackets matches 4 ADD."),

    ("spinning-ducking-osis", "notation", "SPINNING DUCKING OSIS",
     "W6d 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-osis", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W6d 2026-05-27: spinning-ducking chassis + osis's body-spin. Triple [BOD]. 5 brackets matches 5 ADD."),

    ("spinning-ducking-whirl", "notation", "SPINNING DUCKING WHIRL",
     "W6d 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-whirl", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]",
     "W6d 2026-05-27: spinning-ducking chassis + whirl IN-dex + cross-body clipper terminator. 5 brackets matches 5 ADD."),

    ("spinning-ducking-blender", "notation", "SPINNING DUCKING BLENDER",
     "W6d 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-blender", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W6d 2026-05-27: spinning-ducking chassis + blender chassis. Triple [BOD]. 6 brackets matches 6 ADD."),

    ("spinning-symposium-eggbeater", "notation", "SPINNING SYMPOSIUM EGGBEATER",
     "W6d 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-symposium-eggbeater", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W6d 2026-05-27: spinning-symposium-whirl chassis + eggbeater's two-OP-OUT-dex chain. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W6D_ROWS:
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
        for slug, column, new_val, note in W6D_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()

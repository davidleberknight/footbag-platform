"""
W6e — Apply 5 more spinning compound promotions.

Closes out the structural spinning ecosystem with symposium variants
and the double-spinning set:

  spinning-symposium-illusion  4 ADD = spinning(+1) + symposium(+1) + illusion(2)
  spinning-symposium-pickup    4 ADD = spinning(+1) + symposium(+1) + pickup(2)
  double-spinning-clipper      4 ADD = double-spinning(+2) + clipper-stall(2)
  double-spinning-osis         5 ADD = double-spinning(+2) + osis(3)  [triple BOD]
  double-spinning-whirl        5 ADD = double-spinning(+2) + whirl(3)

double-spinning treats as spinning(+1) applied twice (= +2 weight). Holden
references "Sonic (double spinning)" / "Peeking (double spinning)" as
open-terminator SET systems — neither folk name is canonical in DB, so
the bare structural double-spinning-X slug is safe.

double-spinning-osis uses TRIPLE [BOD] (two double-spinning back-spins
+ osis's own back-spin), parallel to spinning-ducking-osis's triple [BOD]
chassis in W6d.

modifier_links left blank for double-spinning-X rows since
"double-spinning" is not a registered modifier in freestyle_trick_modifiers
(same convention as inspinning / twinspinning).
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W6E_ROWS = [
    (
        "spinning-symposium-illusion", 4, "illusion", "spinning|symposium",
        "Spinning + symposium on illusion base. 4 ADD = spinning(+1) + symposium(+1) + illusion(2); JOB CLIP > (back) SPIN [BOD] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL].",
        "W6e spinning 2026-05-27: spinning-symposium-mirage chassis with illusion's OP OUT direction. 4 brackets matches 4 ADD.",
    ),
    (
        "spinning-symposium-pickup", 4, "pickup", "spinning|symposium",
        "Spinning + symposium on pickup base. 4 ADD = spinning(+1) + symposium(+1) + pickup(2); JOB CLIP > (back) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > SAME TOE [DEL].",
        "W6e spinning 2026-05-27: spinning-symposium-mirage chassis with pickup's same-toe terminator (vs mirage's op-toe). 4 brackets matches 4 ADD.",
    ),
    (
        "double-spinning-clipper", 4, "clipper-stall", "",
        "Double-spinning compound on clipper-stall base. 4 ADD = double-spinning(+2) + clipper-stall(2); JOB CLIP > (back) SPIN [BOD] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Sonic structural form.",
        "W6e spinning 2026-05-27: double back-spin set + same-clipper terminator (matches spinning-clipper's SAME CLIP convention). Holden's folk name 'Sonic' for this set system is not canonical. 4 brackets matches 4 ADD.",
    ),
    (
        "double-spinning-osis", 5, "osis", "",
        "Double-spinning compound on osis base. 5 ADD = double-spinning(+2) + osis(3); JOB CLIP > (back) SPIN [BOD] > (back) SPIN [BOD] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]. Triple back-spin compound.",
        "W6e spinning 2026-05-27: double-spinning set + osis's own back-spin = TRIPLE [BOD], parallel to W6d spinning-ducking-osis triple-BOD convention. 5 brackets matches 5 ADD.",
    ),
    (
        "double-spinning-whirl", 5, "whirl", "",
        "Double-spinning compound on whirl base. 5 ADD = double-spinning(+2) + whirl(3); JOB CLIP > (back) SPIN [BOD] > (back) SPIN [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL].",
        "W6e spinning 2026-05-27: double-spinning set + whirl's IN-dex + cross-body clipper terminator. 5 brackets matches 5 ADD.",
    ),
]

W6E_CORRECTIONS = [
    ("spinning-symposium-illusion", "notation", "SPINNING SYMPOSIUM ILLUSION",
     "W6e 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-symposium-illusion", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]",
     "W6e 2026-05-27: spinning-symposium-mirage chassis with illusion OUT-dex. 4 brackets matches 4 ADD."),

    ("spinning-symposium-pickup", "notation", "SPINNING SYMPOSIUM PICKUP",
     "W6e 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-symposium-pickup", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > SAME TOE [DEL]",
     "W6e 2026-05-27: spinning-symposium chassis with pickup same-toe terminator. 4 brackets matches 4 ADD."),

    ("double-spinning-clipper", "notation", "DOUBLE SPINNING CLIPPER",
     "W6e 2026-05-27: JOB per mechanical uppercase rule."),
    ("double-spinning-clipper", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W6e 2026-05-27: double back-spin + same-clipper terminator. 4 brackets matches 4 ADD."),

    ("double-spinning-osis", "notation", "DOUBLE SPINNING OSIS",
     "W6e 2026-05-27: JOB per mechanical uppercase rule."),
    ("double-spinning-osis", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (back) SPIN [BOD] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W6e 2026-05-27: triple back-spin (double-spinning + osis's own spin). 5 brackets matches 5 ADD."),

    ("double-spinning-whirl", "notation", "DOUBLE SPINNING WHIRL",
     "W6e 2026-05-27: JOB per mechanical uppercase rule."),
    ("double-spinning-whirl", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (back) SPIN [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]",
     "W6e 2026-05-27: double back-spin + whirl's IN-dex + cross-body clipper. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W6E_ROWS:
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
        for slug, column, new_val, note in W6E_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()

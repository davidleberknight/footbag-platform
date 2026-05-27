"""
W9e — Apply 5 fairy-X compound promotions (Cat A extensions).

Pivots to fairy ecosystem. W5 already promoted 30 fairy rows; these 5
are remaining doctrine-clean Cat A extensions on canonical bases not yet
covered. All five base tricks canonical in DB; no folk-name collision;
no doctrine block.

  fairy-dyno              5 ADD = fairy(+1) + dyno(4)
  fairy-twirl             5 ADD = fairy(+1) + twirl(4)
  fairy-mobius            6 ADD = fairy(+1) + mobius(5)
  fairy-double-over-down  5 ADD = fairy(+1) + double-over-down(4)
  fairy-butterfly-swirl   5 ADD = fairy(+1) + butterfly-swirl(4)

Chassis: fairy prefix `TOE > SAME OUT [DEX] >` (matches W5 canonicals
fairy-legover / -pickup / -clipper / -eggbeater / -ducking-butterfly).

Slug normalization: source "Fairy DOD" → `fairy-double-over-down` per
slug-norm rules.

Skipped from this batch:
  - fairy-beater / fairy-tale / fairy-ripstein / fairy-zulu-* —
    folk names without clear structural decomposition
  - fairy-crossbody-rake (exotic rake ecosystem; deferred)
  - fairy-guay (guay's pre-canonical op shorthand precludes derivation)
  - fairy-torque = forque (folk canonical, already covered via W5)
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W9E_ROWS = [
    (
        "fairy-dyno", 5, "dyno", "fairy",
        "Fairy modifier on dyno base. 5 ADD = fairy(+1) + dyno(4); JOB TOE > SAME OUT [DEX] > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]. Fairy prefix chassis (TOE > SAME OUT [DEX] >) + dyno's OUT-dex + back-spin + same-clip terminal.",
        "W9e fairy 2026-05-27: fairy prefix chassis + dyno chain. 5 brackets matches 5 ADD.",
    ),
    (
        "fairy-twirl", 5, "twirl", "fairy",
        "Fairy modifier on twirl base. 5 ADD = fairy(+1) + twirl(4); JOB TOE > SAME OUT [DEX] >> SAME FRONT SWIRL [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]. Fairy prefix chassis + twirl's front-swirl + back-spin + cross-body clipper terminal.",
        "W9e fairy 2026-05-27: fairy prefix chassis + twirl chain. 5 brackets matches 5 ADD.",
    ),
    (
        "fairy-mobius", 6, "mobius", "fairy",
        "Fairy modifier on mobius base. 6 ADD = fairy(+1) + mobius(5); JOB TOE > SAME OUT [DEX] >> (back) SPIN [BOD] >> SAME IN [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]. Fairy prefix chassis + mobius's back-spin + IN-dex + front-spin + cross-body clipper terminal.",
        "W9e fairy 2026-05-27: fairy prefix chassis + mobius chain. 6 brackets matches 6 ADD.",
    ),
    (
        "fairy-double-over-down", 5, "double-over-down", "fairy",
        "Fairy modifier on double-over-down base. 5 ADD = fairy(+1) + double-over-down(4); JOB TOE > SAME OUT [DEX] > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]. Fairy prefix chassis + DOD's two-OUT-dex chain + cross-body clipper terminal. Source-named 'Fairy DOD'; slug normalized to double-over-down full-form.",
        "W9e fairy 2026-05-27: fairy prefix chassis + double-over-down chain. 5 brackets matches 5 ADD.",
    ),
    (
        "fairy-butterfly-swirl", 5, "butterfly-swirl", "fairy",
        "Fairy modifier on butterfly-swirl base. 5 ADD = fairy(+1) + butterfly-swirl(4); JOB TOE > SAME OUT [DEX] > SAME/OP OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]. Fairy prefix chassis + butterfly-swirl's OUT-dex + back-swirl + same-clip terminal.",
        "W9e fairy 2026-05-27: fairy prefix chassis + butterfly-swirl chain. 5 brackets matches 5 ADD.",
    ),
]

W9E_CORRECTIONS = [
    ("fairy-dyno", "notation", "FAIRY DYNO",
     "W9e 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-dyno", "operational_notation",
     "TOE > SAME OUT [DEX] > OP OUT [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]",
     "W9e 2026-05-27: fairy prefix + dyno chain. 5 brackets matches 5 ADD."),

    ("fairy-twirl", "notation", "FAIRY TWIRL",
     "W9e 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-twirl", "operational_notation",
     "TOE > SAME OUT [DEX] >> SAME FRONT SWIRL [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W9e 2026-05-27: fairy prefix + twirl chain. 5 brackets matches 5 ADD."),

    ("fairy-mobius", "notation", "FAIRY MOBIUS",
     "W9e 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-mobius", "operational_notation",
     "TOE > SAME OUT [DEX] >> (back) SPIN [BOD] >> SAME IN [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W9e 2026-05-27: fairy prefix + mobius chain. 6 brackets matches 6 ADD."),

    ("fairy-double-over-down", "notation", "FAIRY DOUBLE OVER DOWN",
     "W9e 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-double-over-down", "operational_notation",
     "TOE > SAME OUT [DEX] > OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W9e 2026-05-27: fairy prefix + double-over-down chain. 5 brackets matches 5 ADD."),

    ("fairy-butterfly-swirl", "notation", "FAIRY BUTTERFLY SWIRL",
     "W9e 2026-05-27: JOB per mechanical uppercase rule."),
    ("fairy-butterfly-swirl", "operational_notation",
     "TOE > SAME OUT [DEX] > SAME/OP OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]",
     "W9e 2026-05-27: fairy prefix + butterfly-swirl chain. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W9E_ROWS:
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
        for slug, column, new_val, note in W9E_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()

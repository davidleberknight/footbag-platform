"""
W9j — Apply 5 chassis-derivable multi-modifier compound promotions
(mix Cat A + Cat C doctrine-clean).

Continues the W9 wave's multi-modifier sweep. All five chassis derive
from existing canonicals + recent W9h/W9i precedents; no chassis design
speculation. All source-attested (footbagmoves).

  spinning-paradox-double-leg-over             5 ADD = spinning(+1) + paradox(+1) + DLO(3)
  pixie-ducking-double-leg-over                5 ADD = pixie(+1) + ducking(+1) + DLO(3)
  spinning-ducking-symposium-double-over-down  7 ADD = spinning(+1) + ducking(+1) + symposium(+1) + DOD(4)
  spinning-ducking-paradox-symposium-mirage    6 ADD = spinning(+1) + ducking(+1) + paradox(+1) + symposium(+1) + mirage(2)
  gyro-ducking-symposium-torque                7 ADD = gyro(+1) + ducking(+1) + symposium(+1) + torque(4)

Chassis derivations:
  - spinning-paradox-double-leg-over: spinning-paradox-mirage canonical
    (4 ADD) + swap mirage terminal for DLO's two-OUT-dex chain.
  - pixie-ducking-double-leg-over: pixie-ducking-legover canonical
    (4 ADD: `TOE > SAME IN [DEX] >> DUCK [BOD] >> OP OUT [DEX]
    > SAME TOE [DEL]`) + swap legover terminal for DLO chain.
  - spinning-ducking-symposium-double-over-down: spinning prefix +
    ducking DUCK [BOD] + symposium [BOD] no-plant injection on DOD's
    first OUT-dex + DOD's body + cross-body clipper terminal.
  - spinning-ducking-paradox-symposium-mirage: W9i
    spinning-ducking-paradox-symposium-whirl chassis with mirage
    terminal (OP TOE [DEL]) replacing whirl's cross-body clipper.
  - gyro-ducking-symposium-torque: W7c gyro-symposium-torque canonical
    (6 ADD: `CLIP > (back) SPIN [BOD] > (no plant while) SAME IN [BOD]
    [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]`) + DUCK [BOD]
    insertion between gyro's back-spin and the symposium event.

Slug normalization: pixie-ducking-double-legover (triage) →
pixie-ducking-double-leg-over (DB convention).

Source attestation: all 5 in triage (footbagmoves).
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W9J_ROWS = [
    (
        "spinning-paradox-double-leg-over", 5, "double-leg-over", "spinning|paradox",
        "Spinning + paradox on double-leg-over base. 5 ADD = spinning(+1) + paradox(+1) + double-leg-over(3); JOB CLIP > (back) SPIN [BOD] > OP IN [PDX] [DEX] > OP OUT [DEX] > SAME TOE [DEL]. Chassis: spinning-paradox-mirage canonical + swap mirage terminal for DLO's two-OUT-dex chain.",
        "W9j multi-modifier 2026-05-27: spinning-paradox-mirage chassis + DLO terminal. 5 brackets matches 5 ADD.",
    ),
    (
        "pixie-ducking-double-leg-over", 5, "double-leg-over", "pixie|ducking",
        "Pixie + ducking on double-leg-over base. 5 ADD = pixie(+1) + ducking(+1) + double-leg-over(3); JOB TOE > SAME IN [DEX] >> DUCK [BOD] >> OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]. Chassis: pixie-ducking-legover canonical + swap legover terminal for DLO chain.",
        "W9j multi-modifier 2026-05-27: pixie-ducking-legover chassis + DLO terminal. 5 brackets matches 5 ADD.",
    ),
    (
        "spinning-ducking-symposium-double-over-down", 7, "double-over-down", "spinning|ducking|symposium",
        "Spinning + ducking + symposium on double-over-down base. 7 ADD = spinning(+1) + ducking(+1) + symposium(+1) + double-over-down(4); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]. Chassis: spinning prefix + ducking DUCK [BOD] + symposium [BOD] no-plant on DOD's first OUT-dex + DOD's body chain. Stack=4.",
        "W9j multi-modifier 2026-05-27: spinning-ducking-symposium chassis on DOD base. Triple-[BOD] front + DOD chain. 7 brackets matches 7 ADD.",
    ),
    (
        "spinning-ducking-paradox-symposium-mirage", 6, "mirage", "spinning|ducking|paradox|symposium",
        "Spinning + ducking + paradox + symposium on mirage base. 6 ADD = spinning(+1) + ducking(+1) + paradox(+1) + symposium(+1) + mirage(2); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP TOE [DEL]. Chassis: W9i spinning-ducking-paradox-symposium-whirl with mirage terminal (OP TOE [DEL]) replacing whirl's cross-body clipper. Stack=4.",
        "W9j multi-modifier 2026-05-27: W9i spinning-ducking-paradox-symposium-whirl chassis + mirage OP TOE terminal. 6 brackets matches 6 ADD.",
    ),
    (
        "gyro-ducking-symposium-torque", 7, "torque", "gyro|ducking|symposium",
        "Gyro + ducking + symposium on torque base. 7 ADD = gyro(+1) + ducking(+1) + symposium(+1) + torque(4); JOB CLIP > (back) SPIN [BOD] > DUCK [BOD] > (no plant while) SAME IN [BOD] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]. Chassis: W7c gyro-symposium-torque + DUCK [BOD] insertion between gyro's back-spin and the symposium event. Quadruple-[BOD] sequence (gyro back-spin + ducking dip + symposium body + torque back-spin).",
        "W9j multi-modifier 2026-05-27: gyro-symposium-torque chassis (W7c) + ducking insertion. Quadruple-[BOD]. 7 brackets matches 7 ADD.",
    ),
]

W9J_CORRECTIONS = [
    ("spinning-paradox-double-leg-over", "notation", "SPINNING PARADOX DOUBLE LEG OVER",
     "W9j 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-paradox-double-leg-over", "operational_notation",
     "CLIP > (back) SPIN [BOD] > OP IN [PDX] [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W9j 2026-05-27: spinning-paradox-mirage chassis + DLO terminal. 5 brackets matches 5 ADD."),

    ("pixie-ducking-double-leg-over", "notation", "PIXIE DUCKING DOUBLE LEG OVER",
     "W9j 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-ducking-double-leg-over", "operational_notation",
     "TOE > SAME IN [DEX] >> DUCK [BOD] >> OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W9j 2026-05-27: pixie-ducking-legover chassis + DLO terminal. 5 brackets matches 5 ADD."),

    ("spinning-ducking-symposium-double-over-down", "notation", "SPINNING DUCKING SYMPOSIUM DOUBLE OVER DOWN",
     "W9j 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-symposium-double-over-down", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W9j 2026-05-27: spinning-ducking-symposium chassis on DOD base. Stack=4. 7 brackets matches 7 ADD."),

    ("spinning-ducking-paradox-symposium-mirage", "notation", "SPINNING DUCKING PARADOX SYMPOSIUM MIRAGE",
     "W9j 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-ducking-paradox-symposium-mirage", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP TOE [DEL]",
     "W9j 2026-05-27: W9i spinning-ducking-paradox-symposium-whirl chassis + mirage terminal. Stack=4. 6 brackets matches 6 ADD."),

    ("gyro-ducking-symposium-torque", "notation", "GYRO DUCKING SYMPOSIUM TORQUE",
     "W9j 2026-05-27: JOB per mechanical uppercase rule."),
    ("gyro-ducking-symposium-torque", "operational_notation",
     "CLIP > (back) SPIN [BOD] > DUCK [BOD] > (no plant while) SAME IN [BOD] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W9j 2026-05-27: gyro-symposium-torque chassis + ducking insertion. 7 brackets matches 7 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W9J_ROWS:
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
        for slug, column, new_val, note in W9J_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()

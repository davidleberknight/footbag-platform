"""
W4a — Apply 3 clean atomic compound promotions.

Pilot batch for Wave 4 (Atomic). The 52 atomic Cat-A triage candidates
include heavy folk-alias overlap with existing canonical rows:

  atomic-mirage              = atom-smasher (canonical 4 ADD)
  atomic-legover             = eggbeater (canonical 3 ADD)
  atomic-pickup              = omelette (canonical 3 ADD; pt2 vs pt6 conflict)
  atomic-double-over-down    = fusion (canonical 5 ADD)
  atomic-symposium-mirage    = witchdoctor (canonical 5 ADD)
  atomic-dlo                 = predator (canonical 4 ADD)
  atomic-ducking-whirl       = ego (canonical 6 ADD)

Plus the rotational-atomic-X-Dex doctrine question (Wave-2 Q3, open):
atomic on rotational bases (whirl / blender / swirl / drifter / torque /
mirage etc.) contributes +2 ADD via a hidden X-Dex carry. The notation
representation of that carry remains curator-sensitive.

W4a lands the 3 unambiguous atomic + non-rotational-compound-base rows
where the atomic-butterfly chassis pattern applies cleanly:

  atomic-flail     4 ADD = atomic(+1) + flail(3)
  atomic-barrage   4 ADD = atomic(+1) + barrage(3)
  atomic-clipper   3 ADD = atomic(+1) + clipper-stall(2)

Sibling chassis: atomic-butterfly (TOE > OP OUT [DEX] > <base dex+terminal>).
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W4A_ROWS = [
    (
        "atomic-flail", 4, "flail",
        "Atomic modifier on flail base. 4 ADD = atomic(+1) + flail(3); JOB TOE > OP OUT [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]. Non-rotational base; atomic = +1.",
        "W4a atomic pilot 2026-05-27: atomic-butterfly chassis (TOE > OP OUT [DEX] > <base>) with flail's no-plant body+dex pair + toe terminator. 4 brackets matches 4 ADD.",
    ),
    (
        "atomic-barrage", 4, "barrage",
        "Atomic modifier on barrage base. 4 ADD = atomic(+1) + barrage(3); JOB TOE > OP OUT [DEX] > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]. Non-rotational base (barrage is double-dex mirage; no rotational body event).",
        "W4a atomic pilot 2026-05-27: atomic-butterfly chassis with barrage's SAME IN double-dex chain + toe terminator. 4 brackets ([DEX] [DEX] [DEX] [DEL]) matches 4 ADD.",
    ),
    (
        "atomic-clipper", 3, "clipper-stall",
        "Atomic modifier on clipper-stall base. 3 ADD = atomic(+1) + clipper-stall(2); JOB TOE > OP OUT [DEX] > OP CLIP [XBD] [DEL].",
        "W4a atomic pilot 2026-05-27: atomic dex prefixed to clipper-stall terminal (no inner dex; atomic's single OP OUT dex leads directly into the cross-body clipper). 3 brackets matches 3 ADD.",
    ),
]

W4A_CORRECTIONS = [
    ("atomic-flail", "notation", "ATOMIC FLAIL",
     "W4a 2026-05-27: JOB per mechanical uppercase rule."),
    ("atomic-flail", "operational_notation",
     "TOE > OP OUT [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]",
     "W4a 2026-05-27: atomic-butterfly chassis + flail's no-plant body+dex + toe terminator. 4 brackets matches 4 ADD."),

    ("atomic-barrage", "notation", "ATOMIC BARRAGE",
     "W4a 2026-05-27: JOB per mechanical uppercase rule."),
    ("atomic-barrage", "operational_notation",
     "TOE > OP OUT [DEX] > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]",
     "W4a 2026-05-27: atomic-butterfly chassis + barrage's SAME IN double-dex chain + toe terminator. 4 brackets matches 4 ADD."),

    ("atomic-clipper", "notation", "ATOMIC CLIPPER",
     "W4a 2026-05-27: JOB per mechanical uppercase rule."),
    ("atomic-clipper", "operational_notation",
     "TOE > OP OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W4a 2026-05-27: atomic dex prefixed to clipper-stall terminal (cross-body clipper). 3 brackets matches 3 ADD."),
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
        for canonical, adds, base, desc, note in W4A_ROWS:
            if name_exists_in_additions(canonical):
                add_skipped += 1
                continue
            w.writerow([
                canonical, adds, base, "compound", "", "",
                desc, "expert_reviewed", "1", note,
            ])
            add_appended += 1

    cor_skipped = 0
    cor_appended = 0
    with COR_CSV.open("a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        for slug, column, new_val, note in W4A_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()

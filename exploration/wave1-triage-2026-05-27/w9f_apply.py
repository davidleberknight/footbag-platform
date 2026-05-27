"""
W9f — Apply 5 mixed-cohort Cat A compound promotions
(pixie / spinning / spinning-paradox / quantum extensions).

Surveys past 237 remaining doctrine-clean Cat A candidates and picks
the 5 cleanest with verified sibling-chassis derivation. All five
bases canonical in DB; no folk-name collision; no doctrine block.

  pixie-mobius              6 ADD = pixie(+1) + mobius(5)
  pixie-barfly              5 ADD = pixie(+1) + barfly(4)
  spinning-paradox-drifter  5 ADD = spinning(+1) + paradox(+1) + drifter(3)
  spinning-superfly         6 ADD = spinning(+1) + superfly(5)
  quantum-eclipse           4 ADD = quantum(+1) + eclipse(3)

Chassis:
  - pixie: `TOE > SAME IN [DEX] >` (W3 canonical prefix per
    pixie-legover / -eggbeater / -paradon).
  - spinning: `CLIP > (back) SPIN [BOD] >` (W6 canonical prefix).
  - spinning-paradox: keeps OP direction on first dex (per
    spinning-paradox-mirage / -illusion W6 canonicals — pre-spin
    consumes paradox's direction-flip rule).
  - quantum-eclipse: jump-class double-[DEL] terminal (per
    pixie-eclipse / atomic-eclipse / miraging-eclipse precedent).
    Modifier promotes eclipse's `(land)` annotation to scored
    `OP TOE [DEL]`.

Skipped from this batch:
  - pixie-clipper (ambiguous: pixie-opposite-clipper and
    pixie-same-clipper both already canonical)
  - pixie-da-da-curve (da-da-curve not in DB as standalone canonical)
  - pixie-illusion = sailing (set-system, not a trick)
  - inspinning-guay (guay's pre-canonical op shorthand)
  - fairy-ducking-double-leg-over (already in red_additions)
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W9F_ROWS = [
    (
        "pixie-mobius", 6, "mobius", "pixie",
        "Pixie modifier on mobius base. 6 ADD = pixie(+1) + mobius(5); JOB TOE > SAME IN [DEX] >> (back) SPIN [BOD] >> SAME IN [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]. Pixie prefix chassis + mobius's gyro-torque chain (back-spin + IN-dex + front-spin + cross-body clipper terminal).",
        "W9f pixie 2026-05-27: pixie prefix chassis + mobius chain. 6 brackets matches 6 ADD.",
    ),
    (
        "pixie-barfly", 5, "barfly", "pixie",
        "Pixie modifier on barfly base. 5 ADD = pixie(+1) + barfly(4); JOB TOE > SAME IN [DEX] >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]. Pixie prefix chassis + barfly's no-plant two-OUT-dex chain + cross-body clipper terminal.",
        "W9f pixie 2026-05-27: pixie prefix chassis + barfly chain. 5 brackets matches 5 ADD.",
    ),
    (
        "spinning-paradox-drifter", 5, "drifter", "spinning|paradox",
        "Spinning + paradox on drifter base. 5 ADD = spinning(+1) + paradox(+1) + drifter(3); JOB CLIP > (back) SPIN [BOD] > OP IN [PDX] [DEX] > SAME CLIP [XBD] [DEL]. Spinning-paradox chassis (keeps OP direction per spinning-paradox-mirage / -illusion precedent) + drifter's cross-body clipper terminal.",
        "W9f spinning 2026-05-27: spinning-paradox chassis + drifter terminal. Pre-spin consumes paradox's direction-flip rule. 5 brackets matches 5 ADD.",
    ),
    (
        "spinning-superfly", 6, "superfly", "spinning",
        "Spinning modifier on superfly base. 6 ADD = spinning(+1) + superfly(5); JOB CLIP > (back) SPIN [BOD] >> (no plant while) SAME OUT [DEX] [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]. Spinning prefix chassis + superfly's no-plant body+dex chain + cross-body clipper terminal.",
        "W9f spinning 2026-05-27: spinning prefix chassis + superfly chain. 6 brackets matches 6 ADD.",
    ),
    (
        "quantum-eclipse", 4, "eclipse", "quantum",
        "Quantum modifier on eclipse base. 4 ADD = quantum(+1) + eclipse(3); JOB TOE > OP IN [DEX] (JUMP) [BOD] > OP INSIDE [DEL] > OP TOE [DEL]. Jump-class chassis with double-[DEL] terminal (mid-flight inside-stall + landing toe-stall, per pixie-eclipse / atomic-eclipse / miraging-eclipse precedent); modifier promotes eclipse's (land) annotation to scored OP TOE [DEL].",
        "W9f quantum 2026-05-27: jump-class chassis with double-[DEL] terminal + quantum's leading OP IN [DEX]. 4 brackets matches 4 ADD.",
    ),
]

W9F_CORRECTIONS = [
    ("pixie-mobius", "notation", "PIXIE MOBIUS",
     "W9f 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-mobius", "operational_notation",
     "TOE > SAME IN [DEX] >> (back) SPIN [BOD] >> SAME IN [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]",
     "W9f 2026-05-27: pixie prefix + mobius chain. 6 brackets matches 6 ADD."),

    ("pixie-barfly", "notation", "PIXIE BARFLY",
     "W9f 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-barfly", "operational_notation",
     "TOE > SAME IN [DEX] >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]",
     "W9f 2026-05-27: pixie prefix + barfly chain. 5 brackets matches 5 ADD."),

    ("spinning-paradox-drifter", "notation", "SPINNING PARADOX DRIFTER",
     "W9f 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-paradox-drifter", "operational_notation",
     "CLIP > (back) SPIN [BOD] > OP IN [PDX] [DEX] > SAME CLIP [XBD] [DEL]",
     "W9f 2026-05-27: spinning-paradox chassis + drifter terminal. 5 brackets matches 5 ADD."),

    ("spinning-superfly", "notation", "SPINNING SUPERFLY",
     "W9f 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-superfly", "operational_notation",
     "CLIP > (back) SPIN [BOD] >> (no plant while) SAME OUT [DEX] [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W9f 2026-05-27: spinning prefix + superfly chain. 6 brackets matches 6 ADD."),

    ("quantum-eclipse", "notation", "QUANTUM ECLIPSE",
     "W9f 2026-05-27: JOB per mechanical uppercase rule."),
    ("quantum-eclipse", "operational_notation",
     "TOE > OP IN [DEX] (JUMP) [BOD] > OP INSIDE [DEL] > OP TOE [DEL]",
     "W9f 2026-05-27: jump-class chassis + quantum's leading OP IN [DEX]. 4 brackets matches 4 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W9F_ROWS:
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
        for slug, column, new_val, note in W9F_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()

"""
W9o — Apply 5 multi-modifier compound promotions (chassis-derivable
across paradox-symposium / miraging-symposium / tapping-symposium /
atomic+miraging / pixie+miraging extensions).

All chassis derive from W9 wave precedents + existing canonicals; no
new chassis design. All source-attested (footbagmoves / passback).

  miraging-symposium-double-over-down  6 ADD = miraging(+1) + symposium(+1) + DOD(4)
  paradox-symposium-eggbeater          5 ADD = paradox(+1) + symposium(+1) + eggbeater(3)
  tapping-symposium-whirl              5 ADD = tapping(+1) + symposium(+1) + whirl(3)
  atomic-miraging-butterfly            5 ADD = atomic(+1) + miraging(+1) + butterfly(3)
  pixie-miraging-flail                 5 ADD = pixie(+1) + miraging(+1) + flail(3)

Chassis derivations:
  - miraging-symposium-double-over-down: W9k miraging prefix
    (OP IN [DEX]) + W9n symposium-double-over-down chassis combined.
  - paradox-symposium-eggbeater: paradox-symposium-mirage canonical
    (4 ADD) chassis with mirage terminal swapped for eggbeater's two-
    OUT-dex chain; direction SAME OUT per W9d paradox-eggbeater
    precedent.
  - tapping-symposium-whirl: W9l tapping prefix (TOE > OP OUT [DEX] >>)
    + symposium-whirl canonical body.
  - atomic-miraging-butterfly: atomic-butterfly canonical (4 ADD;
    non-rotational, atomic = +1 per W4a) + miraging OP IN [DEX]
    injection between atomic prefix and butterfly's OUT-dex.
  - pixie-miraging-flail: W3 pixie prefix (TOE > SAME IN [DEX]) +
    W9k miraging OP IN [DEX] injection + flail's no-plant body.
    First DB compound stacking pixie+miraging; chassis composition
    is mechanical (pixie is entry-side, miraging is dex-injection,
    no conflict).

Source attestation: all 5 in triage corpus.
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W9O_ROWS = [
    (
        "miraging-symposium-double-over-down", 6, "double-over-down", "miraging|symposium",
        "Miraging + symposium on double-over-down base. 6 ADD = miraging(+1) + symposium(+1) + double-over-down(4); JOB SET > OP IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]. Chassis: W9k miraging prefix + W9n symposium-double-over-down chassis combined.",
        "W9o multi-modifier 2026-05-27: W9k miraging + W9n symposium-DOD chassis. 6 brackets matches 6 ADD.",
    ),
    (
        "paradox-symposium-eggbeater", 5, "eggbeater", "paradox|symposium",
        "Paradox + symposium on eggbeater base. 5 ADD = paradox(+1) + symposium(+1) + eggbeater(3); JOB CLIP (plant) > (no plant while) SAME OUT [PDX] [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL]. Chassis: paradox-symposium-mirage canonical chassis with mirage terminal swapped for eggbeater's two-OUT-dex chain; direction SAME OUT per W9d paradox-eggbeater precedent.",
        "W9o multi-modifier 2026-05-27: paradox-symposium-mirage chassis + eggbeater chain with SAME OUT direction. 5 brackets matches 5 ADD.",
    ),
    (
        "tapping-symposium-whirl", 5, "whirl", "tapping|symposium",
        "Tapping + symposium on whirl base. 5 ADD = tapping(+1) + symposium(+1) + whirl(3); JOB TOE > OP OUT [DEX] >> (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]. Chassis: W9l tapping prefix + symposium-whirl canonical body.",
        "W9o multi-modifier 2026-05-27: W9l tapping prefix + symposium-whirl chain. 5 brackets matches 5 ADD.",
    ),
    (
        "atomic-miraging-butterfly", 5, "butterfly", "atomic|miraging",
        "Atomic + miraging on butterfly base. 5 ADD = atomic(+1) + miraging(+1) + butterfly(3); JOB TOE > OP OUT [DEX] > OP IN [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]. Chassis: atomic-butterfly canonical (4 ADD; non-rotational, atomic = +1 per W4a) + miraging OP IN [DEX] injection between atomic prefix and butterfly's OUT-dex.",
        "W9o multi-modifier 2026-05-27: atomic-butterfly canonical + miraging dex injection (non-rotational base). 5 brackets matches 5 ADD.",
    ),
    (
        "pixie-miraging-flail", 5, "flail", "pixie|miraging",
        "Pixie + miraging on flail base. 5 ADD = pixie(+1) + miraging(+1) + flail(3); JOB TOE > SAME IN [DEX] > OP IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]. Chassis: W3 pixie prefix (TOE > SAME IN [DEX]) + W9k miraging OP IN [DEX] injection + flail's no-plant body. First DB compound stacking pixie+miraging; chassis composition is mechanical (pixie is entry-side, miraging is dex-injection, no conflict).",
        "W9o multi-modifier 2026-05-27: pixie prefix + miraging injection + flail body. First pixie+miraging stack. 5 brackets matches 5 ADD.",
    ),
]

W9O_CORRECTIONS = [
    ("miraging-symposium-double-over-down", "notation", "MIRAGING SYMPOSIUM DOUBLE OVER DOWN",
     "W9o 2026-05-27: JOB per mechanical uppercase rule."),
    ("miraging-symposium-double-over-down", "operational_notation",
     "SET > OP IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W9o 2026-05-27: W9k miraging + W9n symposium-DOD chassis. 6 brackets matches 6 ADD."),

    ("paradox-symposium-eggbeater", "notation", "PARADOX SYMPOSIUM EGGBEATER",
     "W9o 2026-05-27: JOB per mechanical uppercase rule."),
    ("paradox-symposium-eggbeater", "operational_notation",
     "CLIP (plant) > (no plant while) SAME OUT [PDX] [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W9o 2026-05-27: paradox-symposium-mirage chassis + eggbeater chain. 5 brackets matches 5 ADD."),

    ("tapping-symposium-whirl", "notation", "TAPPING SYMPOSIUM WHIRL",
     "W9o 2026-05-27: JOB per mechanical uppercase rule."),
    ("tapping-symposium-whirl", "operational_notation",
     "TOE > OP OUT [DEX] >> (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]",
     "W9o 2026-05-27: W9l tapping prefix + symposium-whirl chain. 5 brackets matches 5 ADD."),

    ("atomic-miraging-butterfly", "notation", "ATOMIC MIRAGING BUTTERFLY",
     "W9o 2026-05-27: JOB per mechanical uppercase rule."),
    ("atomic-miraging-butterfly", "operational_notation",
     "TOE > OP OUT [DEX] > OP IN [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]",
     "W9o 2026-05-27: atomic-butterfly canonical + miraging dex injection. 5 brackets matches 5 ADD."),

    ("pixie-miraging-flail", "notation", "PIXIE MIRAGING FLAIL",
     "W9o 2026-05-27: JOB per mechanical uppercase rule."),
    ("pixie-miraging-flail", "operational_notation",
     "TOE > SAME IN [DEX] > OP IN [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]",
     "W9o 2026-05-27: pixie prefix + miraging injection + flail body. First pixie+miraging stack. 5 brackets matches 5 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W9O_ROWS:
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
        for slug, column, new_val, note in W9O_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()

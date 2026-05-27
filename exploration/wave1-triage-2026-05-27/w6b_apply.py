"""
W6b — Apply 5 more spinning compound promotions.

Continues the W6a chassis pattern (CLIP > (back) SPIN [BOD] > <base>)
across stall / guay / barfly / symposium-mirage / double-leg-over bases:

  spinning-toe-stall          2 ADD = spinning(+1) + toe-stall(1)
  spinning-guay               3 ADD = spinning(+1) + guay(2)
  spinning-barfly             5 ADD = spinning(+1) + barfly(4)
  spinning-symposium-mirage   4 ADD = spinning(+1) + symposium(+1) + mirage(2)
  spinning-double-leg-over    4 ADD = spinning(+1) + double-leg-over(3)

spinning-symposium-mirage uses the spinning-symposium-whirl chassis
(CLIP > (back) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > ...)
with mirage's op-toe terminator.

spinning-barfly preserves barfly's unusual [DEL] [XBD] terminal bracket
order (vs the more common [XBD] [DEL]); 4-base ADD = DEX + DEX + DEL +
XBD becomes 5 ADD with the spinning [BOD] prefix.

Deferred from this batch: spinning-flapper (flapper not yet canonical).
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ADD_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
COR_CSV = REPO_ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

W6B_ROWS = [
    (
        "spinning-toe-stall", 2, "toe-stall", "",
        "Spinning modifier on toe-stall base. 2 ADD = spinning(+1) + toe-stall(1); JOB CLIP > (back) SPIN [BOD] > OP TOE [DEL]. Minimal spinning compound (body-spin then toe catch).",
        "W6b spinning 2026-05-27: spinning chassis collapsed to toe terminator (toe-stall has no inner dex). 2 brackets matches 2 ADD.",
    ),
    (
        "spinning-guay", 3, "guay", "",
        "Spinning modifier on guay base. 3 ADD = spinning(+1) + guay(2); JOB CLIP > (back) SPIN [BOD] > OP IN [DEX] > SAME INSIDE [DEL]. Guay terminal = same-side inside stall (vs pickup's same-toe).",
        "W6b spinning 2026-05-27: spinning chassis with guay's OP IN dex + same-side inside-stall terminator. 3 brackets matches 3 ADD.",
    ),
    (
        "spinning-barfly", 5, "barfly", "",
        "Spinning modifier on barfly base. 5 ADD = spinning(+1) + barfly(4); JOB CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]. Preserves barfly's unusual [DEL] [XBD] terminal order.",
        "W6b spinning 2026-05-27: spinning chassis + barfly's two-SAME-OUT-dex chain + barfly-style terminal bracket order. 5 brackets matches 5 ADD.",
    ),
    (
        "spinning-symposium-mirage", 4, "mirage", "spinning|symposium",
        "Spinning + symposium on mirage base. 4 ADD = spinning(+1) + symposium(+1) + mirage(2); JOB CLIP > (back) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL].",
        "W6b spinning 2026-05-27: spinning-symposium-whirl chassis (CLIP > (back) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > <terminal>) substituting mirage's op-toe terminator. 4 brackets matches 4 ADD.",
    ),
    (
        "spinning-double-leg-over", 4, "double-leg-over", "",
        "Spinning modifier on double-leg-over base. 4 ADD = spinning(+1) + double-leg-over(3); JOB CLIP > (back) SPIN [BOD] > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL].",
        "W6b spinning 2026-05-27: spinning chassis + double-leg-over chassis. 4 brackets matches 4 ADD.",
    ),
]

W6B_CORRECTIONS = [
    ("spinning-toe-stall", "notation", "SPINNING TOE STALL",
     "W6b 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-toe-stall", "operational_notation",
     "CLIP > (back) SPIN [BOD] > OP TOE [DEL]",
     "W6b 2026-05-27: minimal spinning compound (spin + toe stall). 2 brackets matches 2 ADD."),

    ("spinning-guay", "notation", "SPINNING GUAY",
     "W6b 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-guay", "operational_notation",
     "CLIP > (back) SPIN [BOD] > OP IN [DEX] > SAME INSIDE [DEL]",
     "W6b 2026-05-27: spinning chassis + guay's IN-dex + inside-stall terminator. 3 brackets matches 3 ADD."),

    ("spinning-barfly", "notation", "SPINNING BARFLY",
     "W6b 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-barfly", "operational_notation",
     "CLIP > (back) SPIN [BOD] > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]",
     "W6b 2026-05-27: spinning chassis + barfly's two-SAME-OUT-dex chain + [DEL] [XBD] terminal. 5 brackets matches 5 ADD."),

    ("spinning-symposium-mirage", "notation", "SPINNING SYMPOSIUM MIRAGE",
     "W6b 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-symposium-mirage", "operational_notation",
     "CLIP > (back) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]",
     "W6b 2026-05-27: spinning-symposium-whirl chassis with mirage's op-toe terminator. 4 brackets matches 4 ADD."),

    ("spinning-double-leg-over", "notation", "SPINNING DOUBLE LEG OVER",
     "W6b 2026-05-27: JOB per mechanical uppercase rule."),
    ("spinning-double-leg-over", "operational_notation",
     "CLIP > (back) SPIN [BOD] > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]",
     "W6b 2026-05-27: spinning chassis + double-leg-over chassis. 4 brackets matches 4 ADD."),
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
        for canonical, adds, base, modifier_links, desc, note in W6B_ROWS:
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
        for slug, column, new_val, note in W6B_CORRECTIONS:
            if correction_exists(slug, column):
                cor_skipped += 1
                continue
            w.writerow([slug, column, "", new_val, note])
            cor_appended += 1

    print(f"red_additions:    appended {add_appended}, skipped {add_skipped} (already present)")
    print(f"red_corrections:  appended {cor_appended}, skipped {cor_skipped} (already present)")


if __name__ == "__main__":
    main()

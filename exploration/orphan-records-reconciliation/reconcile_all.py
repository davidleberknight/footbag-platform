#!/usr/bin/env python3
"""Reconcile every freestyle record trick-name against the canonical dictionary.

Generalizes the Penske worked example to all of freestyle_records. For each
distinct record name, resolve via trick_name first, then the structured
sort_name as a fallback, against freestyle_tricks (slug + canonical_name) and
freestyle_trick_aliases. Classify as:

  canonical          - resolves to an active freestyle_tricks.slug
  alias              - resolves via freestyle_trick_aliases
  scoring-category   - a run-quality tier (record_type = *_dex, or "Unique *")
  orphan             - no canonical or alias match on either name

Read-only. Emits a summary, the orphan cleanup list ranked by record impact,
and writes orphan_records.csv next to this script. Drives the orphan-record-
names IP item; resolution mirrors what a trick-detail page uses to link records.
"""
import csv
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "database/footbag.db"
OUT = Path(__file__).resolve().parent / "orphan_records.csv"


def slugify(name: str) -> str:
    if not name:
        return ""
    s = name.lower().strip()
    s = re.sub(r"\([^)]*\)", " ", s)       # drop parenthetical qualifiers (op)/(ducking)/(ss)
    s = s.replace("'", "").replace("’", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def main() -> None:
    con = sqlite3.connect(str(DB))
    trick_slugs = {s for (s,) in con.execute(
        "SELECT slug FROM freestyle_tricks WHERE is_active = 1")}
    canon_by_norm = {}
    for s, n in con.execute("SELECT slug, canonical_name FROM freestyle_tricks WHERE is_active = 1"):
        canon_by_norm.setdefault(slugify(n), s)
    alias_to_trick = {}
    for aslug, atext, tslug in con.execute(
            "SELECT alias_slug, alias_text, trick_slug FROM freestyle_trick_aliases"):
        alias_to_trick[aslug] = tslug
        alias_to_trick.setdefault(slugify(atext), tslug)

    def resolve(name):
        norm = slugify(name)
        if not norm:
            return None
        if norm in trick_slugs:
            return ("canonical", norm)
        if norm in canon_by_norm:
            return ("canonical", canon_by_norm[norm])
        if norm in alias_to_trick:
            return ("alias", alias_to_trick[norm])
        return None

    records = con.execute(
        "SELECT trick_name, sort_name, record_type, COUNT(*) "
        "FROM freestyle_records GROUP BY trick_name, sort_name, record_type"
    ).fetchall()

    counts = {"canonical": 0, "alias": 0, "scoring-category": 0, "orphan": 0}
    rec_counts = dict(counts)
    orphans = []
    classified = []
    for tname, sname, rtype, n in records:
        if rtype.endswith("_dex") or (tname or "").lower().startswith("unique"):
            status, target, via = "scoring-category", "(run-quality tier)", "-"
        else:
            r = resolve(tname)
            via = "trick_name"
            if not r:
                r = resolve(sname)
                via = "sort_name"
            if r:
                status, target = r
            else:
                status, target, via = "orphan", "", "-"
        counts[status] += 1
        rec_counts[status] += n
        classified.append((tname, sname, rtype, n, status, target, via))
        if status == "orphan":
            orphans.append((tname, sname, n))

    print(f"# Orphan record-names reconcile ({len(records)} name-groups, "
          f"{sum(n for *_ , n, _, _, _ in [(c[0], c[1], c[2], c[3], c[4], c[5], c[6]) for c in classified])} records)\n")
    print("By distinct name-group:")
    for k, v in counts.items():
        print(f"  {k:18} {v}")
    print("\nBy record rows (impact):")
    for k, v in rec_counts.items():
        print(f"  {k:18} {v}")

    orphans.sort(key=lambda o: -o[2])
    print(f"\n## Orphans ({len(orphans)} names), ranked by record count\n")
    print("| Record name | Structured (sort_name) | Records |")
    print("|---|---|---|")
    for tname, sname, n in orphans:
        print(f"| {tname} | {sname or ''} | {n} |")

    with open(OUT, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["trick_name", "sort_name", "record_type", "records",
                    "status", "canonical_target", "matched_via"])
        for row in sorted(classified, key=lambda c: (c[4] != "orphan", -c[3])):
            w.writerow(row)
    print(f"\nwrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

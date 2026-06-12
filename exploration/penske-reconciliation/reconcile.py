#!/usr/bin/env python3
"""Reconcile Jim Penske's documented trick-consecutive records against the
canonical freestyle dictionary.

For each record trick-name, classify it as:
  canonical          - resolves directly to a freestyle_tricks.slug / canonical_name
  alias              - resolves via freestyle_trick_aliases to a canonical trick
  scoring-category   - a run-quality record tier (Unique Fearless / Beastly / 3-Dex),
                       not a named trick (record_type = trick_consecutive_dex)
  orphan             - a folk / personal name with no canonical or alias match

Read-only. Emits a Markdown table to stdout. A worked example of the broader
"orphan record names" reconciliation.
"""
import re
import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parents[2] / "database/footbag.db"
PLAYER = "Jim Penske"


def slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"\(op\)", "", s)          # drop the operator-form marker
    s = s.replace("'", "").replace("’", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def main() -> None:
    con = sqlite3.connect(str(DB))
    trick_slugs = {s for (s,) in con.execute(
        "SELECT slug FROM freestyle_tricks WHERE is_active = 1")}
    canon_by_norm = {slugify(n): s for (s, n) in con.execute(
        "SELECT slug, canonical_name FROM freestyle_tricks WHERE is_active = 1")}
    alias_to_trick = {}
    for aslug, atext, tslug in con.execute(
            "SELECT alias_slug, alias_text, trick_slug FROM freestyle_trick_aliases"):
        alias_to_trick[aslug] = tslug
        alias_to_trick[slugify(atext)] = tslug

    records = con.execute(
        "SELECT trick_name, record_type, COUNT(*) FROM freestyle_records "
        "WHERE display_name = ? GROUP BY trick_name, record_type ORDER BY trick_name",
        (PLAYER,)).fetchall()

    rows = []
    counts = {"canonical": 0, "alias": 0, "scoring-category": 0, "orphan": 0}
    for name, rtype, n in records:
        norm = slugify(name)
        if rtype == "trick_consecutive_dex" or name.lower().startswith("unique"):
            status, target = "scoring-category", "(run-quality tier, not a trick)"
        elif norm in trick_slugs:
            status, target = "canonical", norm
        elif norm in canon_by_norm:
            status, target = "canonical", canon_by_norm[norm]
        elif norm in alias_to_trick:
            status, target = "alias", alias_to_trick[norm]
        else:
            status, target = "orphan", ""
        counts[status] += 1
        rows.append((name, rtype, status, target))

    print(f"# Jim Penske record reconciliation ({len(records)} record names)\n")
    print(f"canonical={counts['canonical']}  alias={counts['alias']}  "
          f"scoring-category={counts['scoring-category']}  orphan={counts['orphan']}\n")
    print("| Record name | Record type | Status | Canonical target |")
    print("|---|---|---|---|")
    for name, rtype, status, target in rows:
        print(f"| {name} | {rtype} | **{status}** | {target} |")


if __name__ == "__main__":
    main()

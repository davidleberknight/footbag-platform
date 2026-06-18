"""
Load the symbolic-grammar observational layer into the database.

Reads the committed symbolic-grammar CSVs and DELETE+INSERTs them into the
symbolic_* tables that symbolicGrammarService reads at runtime (replacing the
old read-the-CSV-files-at-runtime path). Idempotent; honest counters.

Reads:  exploration/symbolic-grammar-2/*.csv   (committed; relocating these into
        freestyle/ is a separate follow-up)
Writes: database/footbag.db
          symbolic_equivalence_clusters
          symbolic_group_membership
          symbolic_movement_archetypes
          symbolic_topology_groups
          symbolic_modifier_groups
          symbolic_glossary_crosslinks

Usage (from repo root, venv active):
  python freestyle/loaders/26_load_symbolic_grammar.py --db database/footbag.db
"""
from __future__ import annotations

import argparse
import csv
import sqlite3
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parents[1]
DEFAULT_DB = REPO_ROOT / "database" / "footbag.db"
CSV_DIR = REPO_ROOT / "exploration" / "symbolic-grammar-2"

# (csv filename, table, columns) — columns match both the CSV header and the
# schema table; the service reads every value as a string.
SPECS = [
    ("symbolic_equivalence_clusters.csv", "symbolic_equivalence_clusters",
     ["cluster_id", "cluster_label", "symbolic_normalization", "member_trick_slugs",
      "ifpa_decomposition_variance", "add_range", "anchor_topology_group", "notes",
      "review_status"]),
    ("symbolic_group_membership.csv", "symbolic_group_membership",
     ["trick_slug", "symbolic_group_id", "membership_reason", "confidence", "source"]),
    ("movement_archetype_registry.csv", "symbolic_movement_archetypes",
     ["archetype_id", "archetype_label", "uptime_pattern", "midtime_pattern",
      "downtime_pattern", "anchor_topology_group", "anchor_modifier_groups",
      "member_examples", "min_adds", "max_adds", "educational_value", "notes"]),
    ("symbolic_topology_groups.csv", "symbolic_topology_groups",
     ["symbolic_group_id", "display_name", "classification_axis", "description",
      "representative_examples", "confidence_level", "source_basis", "review_status"]),
    ("symbolic_modifier_groups.csv", "symbolic_modifier_groups",
     ["symbolic_group_id", "display_name", "classification_axis", "description",
      "representative_examples", "confidence_level", "source_basis", "review_status"]),
    ("glossary_crosslinks.csv", "symbolic_glossary_crosslinks",
     ["crosslink_id", "term_a", "term_b", "relationship", "cluster", "source",
      "notes", "educational_value"]),
]


def load(conn: sqlite3.Connection) -> dict[str, int]:
    counts: dict[str, int] = {}
    cur = conn.cursor()
    for filename, table, columns in SPECS:
        path = CSV_DIR / filename
        if not path.exists():
            raise FileNotFoundError(f"Missing symbolic-grammar CSV: {path}")
        cur.execute(f"DELETE FROM {table}")
        placeholders = ", ".join("?" for _ in columns)
        col_list = ", ".join(columns)
        inserted = 0
        with path.open(newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                cur.execute(
                    f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})",
                    [(row.get(c) or "") for c in columns],
                )
                inserted += 1
        counts[table] = inserted
    return counts


def main() -> None:
    ap = argparse.ArgumentParser(description="Load the symbolic-grammar layer into the DB")
    ap.add_argument("--db", default=str(DEFAULT_DB))
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    try:
        counts = load(conn)
        conn.commit()
    finally:
        conn.close()

    for table, n in counts.items():
        print(f"  {table}: {n}")
    print(f"Loaded {sum(counts.values())} symbolic-grammar rows into {args.db}")


if __name__ == "__main__":
    main()

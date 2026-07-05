"""
Wave 0 — Append corpus-delta names to RECONCILIATION.csv as state-3 observational rows.

Governance (per the 2026-05-26 user direction):
  - governance_state = '3 Observationally represented'
  - populate `sources` + `n_sources` only
  - leave doctrine / JOB / ADD / aliases / promotion fields BLANK
  - do NOT split slash-alt pairs (e.g. "84 / Wiggle Walk")
  - do NOT resolve parentheticals (e.g. "Butterfly (same side)")
  - do NOT promote anything
  - do NOT infer aliases

Three-phase chunking by source:
  --chunk=footbagmoves   → appends FM-only + (FM-includes-other-sources)
  --chunk=fborg          → appends fborg-only + (fborg-includes-passback)
  --chunk=passback       → appends remaining passback-only rows

Routing rule (after re-extract diff against the current RECONCILIATION.csv):
each delta row is assigned to the FIRST chunk that "owns" any of its
source labels in the priority order [footbagmoves, fborg, passback].
This guarantees idempotency — once a chunk has landed, re-extracting
will move the absorbed rows out of the delta (they're now in recon).

Idempotent: re-running a chunk skips rows already present in
RECONCILIATION.csv (matched by normalized name OR normalized slug).

Run:
  python3 exploration/wave0-reconciliation-expansion-2026-05-26/wave0_apply.py --chunk=footbagmoves
  python3 exploration/wave0-reconciliation-expansion-2026-05-26/wave0_apply.py --chunk=passback
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RECON_CSV = REPO_ROOT / "exploration/vocabulary-reconciliation-audit-2026-05-21/RECONCILIATION.csv"
CORPUS_ALL = Path(__file__).resolve().parent / "corpus_names_all.csv"

# 19 columns in RECONCILIATION.csv:
COLUMNS = [
    "name", "slug", "governance_state", "issue_type",
    "sources", "n_sources", "source_adds", "in_db",
    "equivalent_to", "doctrine_status", "publication_status",
    "parse_confidence", "add_confidence", "family",
    "primary_operator", "add_formula", "parser_notes",
    "unresolved_questions", "provenance_notes",
]

QUOTE_CHARS = '"\'“”‘’`'
WS_RE = re.compile(r"\s+")
SLUG_DROP_RE = re.compile(r"[^a-z0-9 -]+")


def normalize(name: str) -> str:
    """Match the extractor's normalization rule exactly."""
    n = name.strip().lower()
    for q in QUOTE_CHARS:
        n = n.replace(q, "")
    n = n.replace("-", " ")
    n = WS_RE.sub(" ", n)
    return n.strip()


def slugify(name: str) -> str:
    """Kebab-case slug. Strips quotes/punctuation, collapses whitespace, hyphenates.

    Examples:
      "Around the World"               → "around-the-world"
      'double-dex "Pixie"'             → "double-dex-pixie"
      "84 / Wiggle Walk"               → "84-wiggle-walk"
      "Butterfly (same side)"          → "butterfly-same-side"
    """
    s = name.strip().lower()
    for q in QUOTE_CHARS:
        s = s.replace(q, "")
    # Replace any non-[a-z0-9 -] with space (handles /, (, ), ., ,, etc).
    s = SLUG_DROP_RE.sub(" ", s)
    s = WS_RE.sub(" ", s).strip()
    s = s.replace(" ", "-")
    s = re.sub(r"-+", "-", s)
    return s.strip("-")


def load_reconciliation_keys() -> set[str]:
    """Return normalized-key set for every existing row (by name + slug)."""
    keys: set[str] = set()
    with RECON_CSV.open(encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            for field in ("name", "slug"):
                v = (row.get(field) or "").strip()
                if v:
                    keys.add(normalize(v))
    return keys


def load_corpus() -> list[dict[str, str]]:
    """Read the extractor's per-name output."""
    rows: list[dict[str, str]] = []
    with CORPUS_ALL.open(encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            rows.append(row)
    return rows


def build_row(name: str, sources_pipe: str, n_sources: int) -> list[str]:
    """Construct a 19-column reconciliation row honoring the W0 governance.

    Per the 2026-05-26 user direction: populate name/slug/state/sources/n_sources/in_db
    and leave EVERYTHING ELSE blank. No issue_type tagging, no provenance_notes,
    no publication_status='none' placeholder — the corpus_delta.csv audit trail
    is the curator's reference.
    """
    return [
        name,                                    # name
        slugify(name),                           # slug
        "3 Observationally represented",         # governance_state
        "",                                      # issue_type
        sources_pipe,                            # sources
        str(n_sources),                          # n_sources
        "",                                      # source_adds
        "False",                                 # in_db
        "",                                      # equivalent_to
        "",                                      # doctrine_status
        "",                                      # publication_status
        "",                                      # parse_confidence
        "",                                      # add_confidence
        "",                                      # family
        "",                                      # primary_operator
        "",                                      # add_formula
        "",                                      # parser_notes
        "",                                      # unresolved_questions
        "",                                      # provenance_notes
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--chunk", required=True,
                        choices=["footbagmoves", "fborg", "stanford", "passback"])
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be appended; do not write.")
    args = parser.parse_args()

    existing = load_reconciliation_keys()
    corpus = load_corpus()

    # Partition by source via fixed priority. Earlier chunks "absorb" any
    # row whose source set includes that label.
    CHUNK_ORDER = ["footbagmoves", "fborg", "stanford", "passback"]
    chunked: dict[str, list[list[str]]] = {c: [] for c in CHUNK_ORDER}
    skipped_already_present = 0

    for row in corpus:
        if row.get("in_reconciliation") == "yes":
            continue
        norm = row["normalized"]
        if norm in existing:
            skipped_already_present += 1
            continue

        name = row["best_display"]
        sources_str = row["sources"]
        source_set = set(sources_str.split("|")) if sources_str else set()
        n_sources = len(source_set)
        sources_pipe = "|".join(sorted(source_set))

        new_row = build_row(name, sources_pipe, n_sources)

        # Route to the FIRST priority-order chunk that owns one of the sources.
        for chunk_label in CHUNK_ORDER:
            if chunk_label in source_set:
                chunked[chunk_label].append(new_row)
                break

    chunk_rows = chunked[args.chunk]
    other_count = sum(len(rs) for k, rs in chunked.items() if k != args.chunk)

    print(f"Chunk={args.chunk}")
    print(f"  rows to append : {len(chunk_rows)}")
    print(f"  rows in OTHER chunk (held for next run): {other_count}")
    print(f"  rows skipped (already-present race-check): {skipped_already_present}")

    if args.dry_run:
        print("\n--dry-run: not appending. Sample 5 rows:")
        for r in chunk_rows[:5]:
            print(f"  {r[0]:<40s} | {r[1]:<40s} | sources={r[4]}")
        return 0

    if not chunk_rows:
        print("Nothing to append.")
        return 0

    before_lines = sum(1 for _ in RECON_CSV.open(encoding="utf-8"))
    with RECON_CSV.open("a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        for r in chunk_rows:
            w.writerow(r)
    after_lines = sum(1 for _ in RECON_CSV.open(encoding="utf-8"))
    delta_lines = after_lines - before_lines

    print(f"\nAppended {delta_lines} lines (RECONCILIATION.csv {before_lines} → {after_lines}).")
    if delta_lines != len(chunk_rows):
        print(f"WARNING: line delta ({delta_lines}) != rows ({len(chunk_rows)}). "
              "Possible embedded-newline in a name; investigate.")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

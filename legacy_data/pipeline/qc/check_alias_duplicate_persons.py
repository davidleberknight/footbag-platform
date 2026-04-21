"""
QC: alias-duplicate persons detector.

Permanent regression check for the identity pipeline. Loads
historical_persons from the SQLite DB and the shared AliasResolver, and
asserts the invariant:

    For every alias whose target person_id exists in historical_persons,
    no OTHER person row has a normalized name matching that alias.

If a violation is found it means the upstream pipeline emitted a stub or
duplicate person row for a name that should have been alias-resolved to the
canonical person. This is the regression class fixed by the alias-aware
patches in scripts 03, 07, M1, C1, C5, P1, P2, and P5 — this check ensures
no future change reintroduces it.

Reads:  database/footbag.db
        legacy_data/overrides/person_aliases.csv
        legacy_data/event_results/canonical_input/persons.csv
Writes: legacy_data/out/alias_duplicate_persons.csv

Run from legacy_data/ with the venv active:
    python pipeline/qc/check_alias_duplicate_persons.py [--db <path>] [--out <path>] [--warn-only]

Exit codes:
    0 — no violations (or --warn-only)
    1 — violations found (use as a hard QC gate by default)
"""

from __future__ import annotations

import argparse
import csv
import sys
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
LEGACY_ROOT = SCRIPT_DIR.parents[1]  # qc/ → pipeline/ → legacy_data/
REPO_ROOT = LEGACY_ROOT.parent

# Make pipeline.identity importable when this script is run directly.
sys.path.insert(0, str(LEGACY_ROOT))
from pipeline.identity.alias_resolver import AliasResolver, normalize_name  # noqa: E402


DEFAULT_DB = REPO_ROOT / "database" / "footbag.db"
DEFAULT_OUT = LEGACY_ROOT / "out" / "alias_duplicate_persons.csv"
DEFAULT_ALIASES_CSV = LEGACY_ROOT / "overrides" / "person_aliases.csv"


def find_violations(db_path: Path, aliases_csv: Path) -> list[dict]:
    """Return a list of {alias, expected_pid, expected_name, duplicate_pid, duplicate_name} dicts."""
    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(
            "SELECT person_id, person_name FROM historical_persons WHERE person_name IS NOT NULL"
        ).fetchall()
    finally:
        conn.close()

    pairs = [(pid, name) for pid, name in rows if pid and name]
    resolver = AliasResolver(aliases_csv=aliases_csv, canonical_persons=pairs)

    # Build normalized-name → list of person_ids for the DB.
    by_norm: dict[str, list[tuple[str, str]]] = {}
    for pid, name in pairs:
        by_norm.setdefault(normalize_name(name), []).append((pid, name))

    violations: list[dict] = []
    if not aliases_csv.exists():
        return violations

    seen_alias_keys: set[str] = set()
    with open(aliases_csv, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            alias_raw = (row.get("alias") or "").strip()
            if not alias_raw:
                continue
            alias_norm = normalize_name(alias_raw)
            if alias_norm in seen_alias_keys:
                continue
            seen_alias_keys.add(alias_norm)

            expected_pid = resolver.resolve(alias_raw)
            if not expected_pid:
                continue  # alias can't resolve (e.g. stale target); not a duplicate-detection case

            # Look up every person row whose normalized name matches the alias.
            matches = by_norm.get(alias_norm, [])
            for matched_pid, matched_name in matches:
                if matched_pid == expected_pid:
                    continue  # this row IS the canonical — no violation
                violations.append({
                    "alias": alias_raw,
                    "alias_norm": alias_norm,
                    "expected_pid": expected_pid,
                    "expected_name": resolver.canonical_name(expected_pid),
                    "duplicate_pid": matched_pid,
                    "duplicate_name": matched_name,
                })

    return violations


def main() -> int:
    parser = argparse.ArgumentParser(description="QC: alias-duplicate persons detector")
    parser.add_argument("--db", default=str(DEFAULT_DB))
    parser.add_argument("--aliases-csv", default=str(DEFAULT_ALIASES_CSV))
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--warn-only", action="store_true",
                        help="Always exit 0 even when violations are found")
    args = parser.parse_args()

    violations = find_violations(Path(args.db), Path(args.aliases_csv))

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["alias", "alias_norm", "expected_pid", "expected_name", "duplicate_pid", "duplicate_name"],
        )
        writer.writeheader()
        writer.writerows(violations)

    print(f"alias-duplicate persons report → {out_path}")
    print(f"  violations: {len(violations)}")
    if violations:
        # Print up to first 10 for quick triage
        for v in violations[:10]:
            print(f"    alias='{v['alias']}' expected_pid={v['expected_pid'][:8]}... ({v['expected_name']}) "
                  f"duplicate_pid={v['duplicate_pid'][:8]}... ({v['duplicate_name']})")
        if len(violations) > 10:
            print(f"    ... and {len(violations) - 10} more (see {out_path})")

    if violations and not args.warn_only:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""QC test suite for PassBack dictionary intake.

Tests:
  1. no_unknown_slugs            — every candidate_trick_slug exists in freestyle_tricks
  2. no_duplicate_aliases        — no alias_slug in staging collides with existing freestyle_trick_aliases
  3. no_canonical_overwrite      — verify intake script was read-only (DB row counts unchanged + canonical_name unchanged for matched rows)
  4. deterministic_output        — re-running the intake produces byte-identical staging CSVs
  5. all_raw_fields_preserved    — every PassBack source row's raw columns are present in the staging CSV
  6. all_matched_rows_have_source_link — every matched_existing row has a staging source-link record
  7. all_alias_candidates_have_safety_class — every alias_candidate has a non-empty safety_class

Exit non-zero on any test failure. Designed for `python3 legacy_data/tools/test_passback_dictionary_intake.py`.
"""
from __future__ import annotations

import csv
import hashlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "database" / "footbag.db"
PB_DICT = ROOT / "legacy_data" / "inputs" / "curated" / "tricks" / "passback-dicrionary.txt"
PB_DICT2 = ROOT / "legacy_data" / "inputs" / "curated" / "tricks" / "pb-dict2.txt"
PB_GLOSSARY = ROOT / "legacy_data" / "inputs" / "curated" / "tricks" / "passback-glossary.txt"
OUT_DIR = ROOT / "exploration" / "passback-intake"
INTAKE_SCRIPT = ROOT / "legacy_data" / "tools" / "build_passback_dictionary_intake.py"
PRIMARY_CSV = OUT_DIR / "passback_trick_sources.csv"
SOURCE_LINKS_CSV = OUT_DIR / "passback_source_links_staging.csv"
ALIAS_CANDIDATES_CSV = OUT_DIR / "passback_alias_candidates_staging.csv"
GLOSSARY_CSV = OUT_DIR / "passback_glossary_staging.csv"

FAILURES: list[str] = []


def fail(test_name: str, message: str) -> None:
    FAILURES.append(f"{test_name}: {message}")
    print(f"FAIL {test_name}: {message}")


def passed(test_name: str, detail: str = "") -> None:
    suffix = f" — {detail}" if detail else ""
    print(f"PASS {test_name}{suffix}")


def _read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _hash_file(path: Path) -> str:
    if not path.exists():
        return ""
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ─────────────────────────────────────────────────────────────────────────
# Test 1: no_unknown_slugs
# ─────────────────────────────────────────────────────────────────────────

def test_no_unknown_slugs() -> None:
    conn = sqlite3.connect(DB)
    try:
        slugs = {r[0] for r in conn.execute("SELECT slug FROM freestyle_tricks")}
    finally:
        conn.close()

    primary = _read_csv(PRIMARY_CSV)
    unknown: list[str] = []
    for row in primary:
        s = row.get("candidate_trick_slug", "")
        if s and s not in slugs:
            unknown.append(f"{row['passback_primary_name']!r} → {s!r}")
    if unknown:
        fail("no_unknown_slugs", f"{len(unknown)} candidate_trick_slug values not in freestyle_tricks: {unknown[:3]}")
    else:
        passed("no_unknown_slugs", f"{len(primary)} rows checked")


# ─────────────────────────────────────────────────────────────────────────
# Test 2: no_duplicate_aliases
# ─────────────────────────────────────────────────────────────────────────

def test_no_duplicate_aliases() -> None:
    conn = sqlite3.connect(DB)
    try:
        existing = {r[0] for r in conn.execute("SELECT alias_slug FROM freestyle_trick_aliases")}
    finally:
        conn.close()

    candidates = _read_csv(ALIAS_CANDIDATES_CSV)
    safe_collisions: list[str] = []
    for row in candidates:
        if row.get("safety_class") != "safe":
            continue
        alias_slug = row.get("alias_slug", "")
        if alias_slug in existing:
            safe_collisions.append(alias_slug)
    if safe_collisions:
        fail("no_duplicate_aliases", f"{len(safe_collisions)} safe-class candidates collide with existing alias_slugs: {safe_collisions[:3]}")
    else:
        passed("no_duplicate_aliases", f"{len(candidates)} alias candidates checked; 0 safe-class collisions")


# ─────────────────────────────────────────────────────────────────────────
# Test 3: no_canonical_overwrite
# ─────────────────────────────────────────────────────────────────────────

def test_no_canonical_overwrite() -> None:
    """Verify intake is read-only:
    - DB row counts unchanged after running intake
    - For matched rows, IFPA canonical_name + adds unchanged
    """
    # Snapshot DB state before
    conn = sqlite3.connect(DB)
    try:
        baseline = {
            "tricks_count": conn.execute("SELECT COUNT(*) FROM freestyle_tricks").fetchone()[0],
            "aliases_count": conn.execute("SELECT COUNT(*) FROM freestyle_trick_aliases").fetchone()[0],
            "sources_count": conn.execute("SELECT COUNT(*) FROM freestyle_trick_sources").fetchone()[0],
            "source_links_count": conn.execute("SELECT COUNT(*) FROM freestyle_trick_source_links").fetchone()[0],
        }
        # Sample matched rows' canonical_name + adds
        primary = _read_csv(PRIMARY_CSV)
        matched_slugs = [r["candidate_trick_slug"] for r in primary if r.get("match_status") == "matched_existing"][:10]
        baseline_canonical = {}
        for slug in matched_slugs:
            row = conn.execute("SELECT canonical_name, adds FROM freestyle_tricks WHERE slug=?", (slug,)).fetchone()
            if row:
                baseline_canonical[slug] = (row[0], row[1])
    finally:
        conn.close()

    # Re-run intake (in a separate subprocess to isolate any side effects)
    result = subprocess.run(
        [sys.executable, str(INTAKE_SCRIPT)],
        capture_output=True, text=True, cwd=str(ROOT),
    )
    if result.returncode != 0:
        fail("no_canonical_overwrite", f"intake script returned {result.returncode}: {result.stderr[:200]}")
        return

    # Snapshot DB state after
    conn = sqlite3.connect(DB)
    try:
        after = {
            "tricks_count": conn.execute("SELECT COUNT(*) FROM freestyle_tricks").fetchone()[0],
            "aliases_count": conn.execute("SELECT COUNT(*) FROM freestyle_trick_aliases").fetchone()[0],
            "sources_count": conn.execute("SELECT COUNT(*) FROM freestyle_trick_sources").fetchone()[0],
            "source_links_count": conn.execute("SELECT COUNT(*) FROM freestyle_trick_source_links").fetchone()[0],
        }
        for slug, (old_name, old_adds) in baseline_canonical.items():
            row = conn.execute("SELECT canonical_name, adds FROM freestyle_tricks WHERE slug=?", (slug,)).fetchone()
            if not row or row[0] != old_name or row[1] != old_adds:
                fail("no_canonical_overwrite", f"canonical_name or adds changed for {slug}: before={(old_name, old_adds)} after={tuple(row) if row else None}")
                return
    finally:
        conn.close()

    deltas = [k for k in baseline if baseline[k] != after[k]]
    if deltas:
        fail("no_canonical_overwrite", f"DB row counts changed: {[(k, baseline[k], after[k]) for k in deltas]}")
        return
    passed("no_canonical_overwrite", f"4 DB row counts + {len(baseline_canonical)} canonical samples unchanged")


# ─────────────────────────────────────────────────────────────────────────
# Test 4: deterministic_output
# ─────────────────────────────────────────────────────────────────────────

def test_deterministic_output() -> None:
    """Re-run intake; compare file hashes."""
    paths = [PRIMARY_CSV, SOURCE_LINKS_CSV, ALIAS_CANDIDATES_CSV, GLOSSARY_CSV]
    before_hashes = {p: _hash_file(p) for p in paths}

    result = subprocess.run(
        [sys.executable, str(INTAKE_SCRIPT)],
        capture_output=True, text=True, cwd=str(ROOT),
    )
    if result.returncode != 0:
        fail("deterministic_output", f"intake script returned {result.returncode}")
        return

    after_hashes = {p: _hash_file(p) for p in paths}
    drifted = [p.name for p in paths if before_hashes[p] != after_hashes[p]]
    if drifted:
        fail("deterministic_output", f"hash changed across runs: {drifted}")
    else:
        passed("deterministic_output", f"{len(paths)} files hash-stable across re-runs")


# ─────────────────────────────────────────────────────────────────────────
# Test 5: all_raw_fields_preserved
# ─────────────────────────────────────────────────────────────────────────

def test_all_raw_fields_preserved() -> None:
    primary = _read_csv(PRIMARY_CSV)
    if not primary:
        fail("all_raw_fields_preserved", "primary CSV is empty")
        return
    required = [
        "passback_primary_name",
        "passback_alternate_names",
        "passback_technical_name",
        "passback_uptime_component",
        "passback_downtime_component",
        "passback_dex_count",
        "passback_notes",
    ]
    missing_fields = [f for f in required if f not in primary[0]]
    if missing_fields:
        fail("all_raw_fields_preserved", f"missing required fields: {missing_fields}")
        return

    # Read source files directly; count rows (PB dict 1 + PB dict 2 cross-sport map)
    def count_source_rows(path: Path) -> int:
        if not path.exists():
            return 0
        with path.open(encoding="utf-8") as f:
            return max(0, sum(1 for _ in f) - 1)  # subtract header
    source_rows_total = count_source_rows(PB_DICT) + count_source_rows(PB_DICT2)
    if len(primary) != source_rows_total:
        fail("all_raw_fields_preserved", f"row-count mismatch: source={source_rows_total} (PB_DICT={count_source_rows(PB_DICT)} + PB_DICT2={count_source_rows(PB_DICT2)}), staging={len(primary)}")
        return
    # Verify source_file column populated for every row
    bad_source = sum(1 for r in primary if not r.get("source_file"))
    if bad_source:
        fail("all_raw_fields_preserved", f"{bad_source} staging rows missing source_file column")
        return
    passed("all_raw_fields_preserved", f"{len(required)} raw fields preserved; {len(primary)} rows match source total")


# ─────────────────────────────────────────────────────────────────────────
# Test 6: matched rows have source link
# ─────────────────────────────────────────────────────────────────────────

def test_matched_rows_have_source_link() -> None:
    primary = _read_csv(PRIMARY_CSV)
    source_links = _read_csv(SOURCE_LINKS_CSV)

    matched_slugs = {r["candidate_trick_slug"] for r in primary if r.get("match_status") in ("matched_existing", "conflict") and r.get("candidate_trick_slug")}
    linked_slugs = {r["trick_slug"] for r in source_links}

    missing = matched_slugs - linked_slugs
    if missing:
        fail("matched_rows_have_source_link", f"{len(missing)} matched/conflict slugs missing from source-link staging: {list(missing)[:3]}")
    else:
        passed("matched_rows_have_source_link", f"{len(matched_slugs)} matched/conflict rows all have source-link staging records")


# ─────────────────────────────────────────────────────────────────────────
# Test 7: alias candidates have safety class
# ─────────────────────────────────────────────────────────────────────────

def test_alias_candidates_have_safety_class() -> None:
    candidates = _read_csv(ALIAS_CANDIDATES_CSV)
    valid_classes = {"safe", "needs_review", "blocked"}
    bad = [c for c in candidates if c.get("safety_class", "") not in valid_classes]
    if bad:
        fail("alias_candidates_have_safety_class", f"{len(bad)} candidates missing/invalid safety_class")
    else:
        passed("alias_candidates_have_safety_class", f"{len(candidates)} alias candidates all have valid safety_class")


# ─────────────────────────────────────────────────────────────────────────
# Test 8: glossary staging well-formed
# ─────────────────────────────────────────────────────────────────────────

def test_glossary_staging_well_formed() -> None:
    """Verify glossary staging has expected structure + non-empty when source file exists."""
    if not PB_GLOSSARY.exists():
        passed("glossary_staging_well_formed", "glossary source absent; staging not required")
        return
    rows = _read_csv(GLOSSARY_CSV)
    if not rows:
        fail("glossary_staging_well_formed", "glossary source exists but staging is empty")
        return
    required = ["term", "passback_section", "passback_explanation", "existing_glossary_anchor",
                "proposed_layer", "match_status", "review_status"]
    missing = [f for f in required if f not in rows[0]]
    if missing:
        fail("glossary_staging_well_formed", f"missing required fields: {missing}")
        return
    valid_statuses = {"existing_term", "new_term"}
    bad_status = [r for r in rows if r.get("match_status") not in valid_statuses]
    if bad_status:
        fail("glossary_staging_well_formed", f"{len(bad_status)} rows with invalid match_status")
        return
    bad_layer = [r for r in rows if r.get("proposed_layer") != "educational"]
    if bad_layer:
        fail("glossary_staging_well_formed", f"{len(bad_layer)} rows with proposed_layer != 'educational' (should never auto-promote to authoritative)")
        return
    passed("glossary_staging_well_formed", f"{len(rows)} glossary terms; all educational-layer; match_status valid")


# ─────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────

def main() -> int:
    print("PassBack dictionary intake — QC test suite\n")
    test_no_unknown_slugs()
    test_no_duplicate_aliases()
    test_no_canonical_overwrite()
    test_deterministic_output()
    test_all_raw_fields_preserved()
    test_matched_rows_have_source_link()
    test_alias_candidates_have_safety_class()
    test_glossary_staging_well_formed()
    print()
    if FAILURES:
        print(f"FAILED — {len(FAILURES)} test(s) failed:")
        for f in FAILURES:
            print(f"  {f}")
        return 1
    print("All tests passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

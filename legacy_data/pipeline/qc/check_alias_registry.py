#!/usr/bin/env python3
"""
QC: alias registry validator.

Validates legacy_data/overrides/person_aliases.csv for structural integrity,
referential integrity against canonical persons, and Bucket-2-class conflicts
(same normalized alias resolving to distinct pids that both have participant
refs). Emits a line-numbered artifact CSV for actionable fixing.

Modes:
    --mode preflight  Fast. No canonical-output dependency; file-only checks
                      (UTF-8 decode, header, schema, UUID format, blank alias,
                      exact-duplicate rows).
    --mode gate       Full. Loads canonical persons.csv and
                      event_result_participants.csv to assert referential
                      integrity and detect alias conflicts.

Normalization matches pipeline.identity.alias_resolver.normalize_name — we do
not introduce a second normalizer.

Artifact: out/qc_alias_registry.csv with columns
    file_line, alias, person_id, person_canon, problem_code, detail

Exit codes:
    0  no hard failures
    1  hard failures found
"""

from __future__ import annotations

import argparse
import csv
import sys
import uuid
from collections import Counter, defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
LEGACY_ROOT = SCRIPT_DIR.parents[1]  # qc/ → pipeline/ → legacy_data/

sys.path.insert(0, str(LEGACY_ROOT))
from pipeline.identity.alias_resolver import normalize_name  # noqa: E402


DEFAULT_ALIASES_CSV = LEGACY_ROOT / "overrides" / "person_aliases.csv"
DEFAULT_PERSONS_CSV = LEGACY_ROOT / "out" / "canonical" / "persons.csv"
DEFAULT_PARTICIPANTS_CSV = LEGACY_ROOT / "out" / "canonical" / "event_result_participants.csv"
DEFAULT_OUT = LEGACY_ROOT / "out" / "qc_alias_registry.csv"

# Codes that cause the process to exit 1 (hard fail).
# Per spec: hard-fail on malformed UUID, blank alias, missing canonical target
# pid, or conflicting normalized alias with multiple live pids. File-level
# failures (missing, unreadable, malformed schema) are also hard — without
# them we cannot validate anything.
#
# "missing_canonical_pid" is reserved for rows that are TRULY unresolvable:
# neither person_id nor normalized person_canon maps to any canonical person.
# Rows whose person_id is stale but whose person_canon still resolves are
# tolerated by pipeline.identity.alias_resolver (it rebinds via person_canon
# lookup), so we report them as WARN under a softer code.
#
# Exact-duplicate rows are data-hygiene only and also report as WARN.
HARD_CODES = frozenset({
    "alias_file_missing",
    "utf8_decode_error",
    "missing_required_column",
    "blank_alias",
    "malformed_uuid",
    "missing_canonical_pid",
    "alias_conflict",
})

ARTIFACT_COLUMNS = ["file_line", "alias", "person_id", "person_canon", "problem_code", "detail"]


def _is_valid_uuid(s: str) -> bool:
    if not s:
        return False
    try:
        uuid.UUID(s)
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def _row_stub(r: dict) -> dict:
    return {
        "file_line": r.get("file_line", ""),
        "alias": r.get("alias", ""),
        "person_id": r.get("person_id", ""),
        "person_canon": r.get("person_canon", ""),
    }


def _record(problems: list, row: dict | None, code: str, detail: str, file_line: int | str = "") -> None:
    if row is None:
        problems.append({
            "file_line": file_line,
            "alias": "",
            "person_id": "",
            "person_canon": "",
            "problem_code": code,
            "detail": detail,
        })
    else:
        problems.append({**_row_stub(row), "problem_code": code, "detail": detail})


def _load_alias_rows(path: Path) -> tuple[list[dict], list[str]] | None:
    """Return (rows, header) or None on UTF-8 failure.

    rows: list of {file_line, alias, person_id, person_canon, status, notes}
    Line numbers are 1-indexed; header is line 1, first data row is line 2.
    """
    try:
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            header = reader.fieldnames or []
            rows = []
            for i, raw in enumerate(reader, start=2):
                rows.append({
                    "file_line": i,
                    "alias": (raw.get("alias") or "").strip(),
                    "person_id": (raw.get("person_id") or "").strip(),
                    "person_canon": (raw.get("person_canon") or "").strip(),
                    "status": (raw.get("status") or "").strip(),
                    "notes": (raw.get("notes") or "").strip(),
                })
        return rows, header
    except UnicodeDecodeError:
        return None


def _load_canonical(path: Path) -> tuple[set[str], set[str]]:
    """Return (pids, normalized_person_names) from canonical persons.csv."""
    pids: set[str] = set()
    norm_names: set[str] = set()
    if not path.exists():
        return pids, norm_names
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            pid = (r.get("person_id") or "").strip()
            name = (r.get("person_name") or r.get("person_canon") or "").strip()
            if pid:
                pids.add(pid)
            if name:
                norm_names.add(normalize_name(name))
    return pids, norm_names


def _load_pids_with_refs(path: Path) -> set[str]:
    """pids that appear in event_result_participants.csv, as a singleton person_id
    or inside a pipe-separated team_person_key. Excludes __NON_PERSON__ sentinel."""
    refs: set[str] = set()
    if not path.exists():
        return refs
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            pid = (r.get("person_id") or "").strip()
            if pid and pid != "__NON_PERSON__":
                refs.add(pid)
            team_key = (r.get("team_person_key") or "").strip()
            if team_key:
                for p in team_key.split("|"):
                    p = p.strip()
                    if p and p != "__NON_PERSON__":
                        refs.add(p)
    return refs


def _run_structural_checks(rows: list[dict], problems: list) -> None:
    """Checks that don't need canonical — run in both modes."""
    seen_exact: dict[tuple, int] = {}
    for r in rows:
        if not r["alias"]:
            _record(problems, r, "blank_alias", "alias field is empty")

        if not _is_valid_uuid(r["person_id"]):
            _record(problems, r, "malformed_uuid",
                    f"person_id not a valid UUID: {r['person_id']!r}")

        key = (r["alias"], r["person_id"], r["person_canon"])
        first = seen_exact.get(key)
        if first is not None:
            _record(problems, r, "duplicate_row",
                    f"exact duplicate of line {first}")
        else:
            seen_exact[key] = r["file_line"]


def _run_gate_checks(
    rows: list[dict],
    canonical_pids: set[str],
    canonical_norm_names: set[str],
    participant_pids: set[str],
    problems: list,
) -> None:
    """Referential + conflict checks. Assumes canonical_pids is non-empty."""
    # 1. Every row must resolve to some canonical person. The resolver prefers
    #    person_canon lookup and falls back to person_id (see alias_resolver).
    #    HARD if neither resolves; WARN if pid is stale but canon resolves.
    for r in rows:
        pid = r["person_id"]
        if not pid or not _is_valid_uuid(pid):
            continue  # UUID problem already reported in structural checks
        if pid in canonical_pids:
            continue
        canon_norm = normalize_name(r["person_canon"])
        if canon_norm and canon_norm in canonical_norm_names:
            _record(problems, r, "stale_pid_canon_resolves",
                    f"person_id {pid} not in canonical persons.csv, but "
                    f"person_canon '{r['person_canon']}' resolves — resolver "
                    f"rebinds via person_canon fallback")
        else:
            _record(problems, r, "missing_canonical_pid",
                    f"person_id {pid} not in canonical persons.csv and "
                    f"person_canon '{r['person_canon']}' does not resolve either")

    # 2. Same normalized alias resolving to ≥2 distinct pids, where ≥2 of those
    #    pids have participant refs = hard Bucket-2 conflict.
    by_norm: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if r["alias"] and _is_valid_uuid(r["person_id"]):
            by_norm[normalize_name(r["alias"])].append(r)

    for norm_alias, cluster in by_norm.items():
        pids = {r["person_id"] for r in cluster}
        if len(pids) < 2:
            continue
        live_pids = sorted(p for p in pids if p in participant_pids)
        if len(live_pids) < 2:
            # Only one side has participant refs; not the Bucket-2 class.
            continue
        detail = (
            f"normalized alias '{norm_alias}' points at {len(pids)} distinct pids; "
            f"{len(live_pids)} of those have participant refs: {','.join(live_pids)}"
        )
        for r in cluster:
            _record(problems, r, "alias_conflict", detail)


def _write_artifact(out_csv: Path, problems: list) -> None:
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    problems_sorted = sorted(
        problems,
        key=lambda p: (
            p.get("problem_code", ""),
            int(p["file_line"]) if str(p.get("file_line", "")).isdigit() else 10**9,
        ),
    )
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ARTIFACT_COLUMNS)
        w.writeheader()
        for p in problems_sorted:
            w.writerow({k: p.get(k, "") for k in ARTIFACT_COLUMNS})


def _print_summary(mode: str, problems: list, out_csv: Path) -> int:
    counts = Counter(p["problem_code"] for p in problems)
    hard_count = sum(n for c, n in counts.items() if c in HARD_CODES)
    warn_count = sum(n for c, n in counts.items() if c not in HARD_CODES)

    print(f"\n=== alias-registry QC ({mode}) ===")
    print(f"artifact: {out_csv}")
    print(f"problem rows: {len(problems)}  (hard={hard_count}, other={warn_count})")
    if counts:
        for code, n in counts.most_common():
            tag = "HARD" if code in HARD_CODES else "WARN"
            print(f"  [{tag}] {code}: {n}")
    if hard_count:
        print(f"STATUS: FAIL  ({hard_count} hard failures)")
        return 1
    print("STATUS: PASS")
    return 0


def run(mode: str, aliases_csv: Path, persons_csv: Path, participants_csv: Path, out_csv: Path) -> int:
    problems: list[dict] = []

    if not aliases_csv.exists():
        _record(problems, None, "alias_file_missing", f"{aliases_csv} not found", file_line=0)
        _write_artifact(out_csv, problems)
        return _print_summary(mode, problems, out_csv)

    loaded = _load_alias_rows(aliases_csv)
    if loaded is None:
        _record(problems, None, "utf8_decode_error",
                f"{aliases_csv} is not valid UTF-8", file_line=0)
        _write_artifact(out_csv, problems)
        return _print_summary(mode, problems, out_csv)

    rows, header = loaded
    missing_cols = [c for c in ("alias", "person_id") if c not in (header or [])]
    if missing_cols:
        _record(problems, None, "missing_required_column",
                f"header missing required columns: {missing_cols}", file_line=1)
        _write_artifact(out_csv, problems)
        return _print_summary(mode, problems, out_csv)

    _run_structural_checks(rows, problems)

    if mode == "gate":
        canonical_pids, canonical_norm_names = _load_canonical(persons_csv)
        if not canonical_pids:
            _record(problems, None, "missing_canonical_pid",
                    f"canonical persons.csv missing or empty: {persons_csv}",
                    file_line=0)
        else:
            participant_pids = _load_pids_with_refs(participants_csv)
            _run_gate_checks(rows, canonical_pids, canonical_norm_names,
                             participant_pids, problems)

    _write_artifact(out_csv, problems)
    return _print_summary(mode, problems, out_csv)


def main() -> int:
    ap = argparse.ArgumentParser(description="Alias registry QC validator.")
    ap.add_argument("--mode", choices=["preflight", "gate"], required=True)
    ap.add_argument("--aliases-csv", type=Path, default=DEFAULT_ALIASES_CSV)
    ap.add_argument("--persons-csv", type=Path, default=DEFAULT_PERSONS_CSV)
    ap.add_argument("--participants-csv", type=Path, default=DEFAULT_PARTICIPANTS_CSV)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    return run(args.mode, args.aliases_csv, args.persons_csv, args.participants_csv, args.out)


if __name__ == "__main__":
    sys.exit(main())

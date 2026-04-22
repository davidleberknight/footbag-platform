#!/usr/bin/env python3
"""
QC: hardcoded name-override contradiction detector.

Scans legacy_data/pipeline/historical/export_historical_csvs.py for
hardcoded name-override dicts (currently _HONOR_OVERRIDES) and compares
each `raw_name → hardcoded_display_name` entry against what the shared
AliasResolver would return for the same raw name.

A contradiction is any case where the alias-file path resolves to a
canonical person whose display name differs from the hardcoded target
display name. The class of bug this catches: a hardcoded override
silently overruling a deliberate alias-file remap (for example, the
`"red husted": "Red Fred Husted"` override contradicting an alias
`Red Husted → Ethan Husted`).

Artifact: out/qc_hardcoded_override_conflicts.csv
    raw_name, hardcoded_target, alias_target, source_file, source_line, detail

Exit codes:
    0  no contradictions
    1  contradictions found (intended as severity=warn in run_qc.py)
"""

from __future__ import annotations

import argparse
import ast
import csv
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
LEGACY_ROOT = SCRIPT_DIR.parents[1]

sys.path.insert(0, str(LEGACY_ROOT))
from pipeline.identity.alias_resolver import load_default_resolver, normalize_name  # noqa: E402

DEFAULT_SOURCE = LEGACY_ROOT / "pipeline" / "historical" / "export_historical_csvs.py"
DEFAULT_OUT = LEGACY_ROOT / "out" / "qc_hardcoded_override_conflicts.csv"

# Name-override dicts to scan. Keys are variable names in the source file.
# Each dict is expected to be {normalized_raw_name: canonical_display_name}.
# Add to this list if new override dicts are introduced.
OVERRIDE_DICT_NAMES = {"_HONOR_OVERRIDES"}

ARTIFACT_COLUMNS = ["raw_name", "hardcoded_target", "alias_target",
                    "source_file", "source_line", "detail"]


def parse_override_dicts(source_path: Path) -> list[tuple[str, str, str, int]]:
    """Return [(dict_name, raw_key, hardcoded_value, lineno), ...] for every
    string-to-string entry in any dict literal assigned to a known override
    variable name."""
    src = source_path.read_text()
    tree = ast.parse(src, filename=str(source_path))
    out: list[tuple[str, str, str, int]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        if not isinstance(node.value, ast.Dict):
            continue
        target_names = {t.id for t in node.targets if isinstance(t, ast.Name)}
        if not (target_names & OVERRIDE_DICT_NAMES):
            # AnnAssign uses a different path; also scan annotated assignments
            continue
        dict_name = next(iter(target_names & OVERRIDE_DICT_NAMES))
        for k, v in zip(node.value.keys, node.value.values):
            if (isinstance(k, ast.Constant) and isinstance(v, ast.Constant)
                    and isinstance(k.value, str) and isinstance(v.value, str)):
                out.append((dict_name, k.value, v.value, k.lineno))

    # Also handle annotated assignments like: `_HONOR_OVERRIDES: dict[str,str] = {...}`
    for node in ast.walk(tree):
        if not isinstance(node, ast.AnnAssign):
            continue
        if not isinstance(node.value, ast.Dict):
            continue
        if not isinstance(node.target, ast.Name):
            continue
        if node.target.id not in OVERRIDE_DICT_NAMES:
            continue
        dict_name = node.target.id
        for k, v in zip(node.value.keys, node.value.values):
            if (isinstance(k, ast.Constant) and isinstance(v, ast.Constant)
                    and isinstance(k.value, str) and isinstance(v.value, str)):
                out.append((dict_name, k.value, v.value, k.lineno))

    return out


def check(source_path: Path, out_csv: Path) -> int:
    if not source_path.exists():
        print(f"ERROR: source file not found: {source_path}", file=sys.stderr)
        _write_artifact(out_csv, [])
        return 1

    try:
        entries = parse_override_dicts(source_path)
    except SyntaxError as e:
        print(f"ERROR: could not parse {source_path}: {e}", file=sys.stderr)
        _write_artifact(out_csv, [])
        return 1

    if not entries:
        print(f"No override dicts found in {source_path.name} "
              f"(looked for: {sorted(OVERRIDE_DICT_NAMES)})")
        _write_artifact(out_csv, [])
        return 0

    resolver = load_default_resolver()
    source_rel = source_path.relative_to(LEGACY_ROOT) if source_path.is_absolute() else source_path

    problems: list[dict] = []
    scanned = 0
    for dict_name, raw_key, hardcoded_display, lineno in entries:
        scanned += 1
        alias_pid = resolver.resolve(raw_key)
        if alias_pid is None:
            continue
        alias_canon = resolver.canonical_name(alias_pid)
        if not alias_canon:
            continue
        if normalize_name(alias_canon) == normalize_name(hardcoded_display):
            continue
        problems.append({
            "raw_name": raw_key,
            "hardcoded_target": hardcoded_display,
            "alias_target": alias_canon,
            "source_file": str(source_rel),
            "source_line": lineno,
            "detail": (f"{dict_name} maps '{raw_key}' → '{hardcoded_display}', "
                       f"but alias resolver returns '{alias_canon}' (pid {alias_pid})"),
        })

    _write_artifact(out_csv, problems)

    print(f"\n=== hardcoded-override contradiction check ===")
    print(f"artifact: {out_csv}")
    print(f"source:   {source_path}")
    print(f"entries scanned: {scanned}  contradictions: {len(problems)}")
    for p in problems:
        print(f"  [WARN] {p['source_file']}:{p['source_line']} "
              f"'{p['raw_name']}' hardcoded='{p['hardcoded_target']}' "
              f"alias='{p['alias_target']}'")
    print("STATUS: " + ("FAIL" if problems else "PASS"))
    return 1 if problems else 0


def _write_artifact(out_csv: Path, problems: list[dict]) -> None:
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    problems_sorted = sorted(problems, key=lambda p: (p["source_file"], p["source_line"]))
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ARTIFACT_COLUMNS)
        w.writeheader()
        for p in problems_sorted:
            w.writerow({k: p.get(k, "") for k in ARTIFACT_COLUMNS})


def main() -> int:
    ap = argparse.ArgumentParser(description="Hardcoded-override contradiction QC check.")
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE,
                    help="Source file to scan for override dicts")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    return check(args.source, args.out)


if __name__ == "__main__":
    sys.exit(main())

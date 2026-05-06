#!/usr/bin/env python3
"""Script 28: QC the BAP coverage. READ-ONLY hard fail.

Audits `legacy_data/inputs/bap_data_updated.csv` against historical_persons.

Unlike HOF, the BAP source CSV has no person_id column — every BAP row
relies entirely on alias-first name resolution via `_match_honor()` in
`export_historical_csvs.py:1421-1438` (no pid fallback). That makes BAP
strictly more exposed to alias-misrouting bugs than HOF.

Hard failures (exit 1):
  - bap_unresolved
      CSV name does not match any PT canonical / aliases_presentable /
      person_aliases.csv / Person_Display_Names_v1.csv entry. The loader
      drops the row silently; bap_member never lands.
  - bap_pid_not_in_db
      Name resolved to a pid, but no historical_persons row exists at
      that pid (post-canonical-export filter dropped it).
  - bap_flag_off
      Name resolved to a pid that exists in DB, but bap_member=0.
  - bap_misroute
      Alias-first resolution lands on pid_A while a DIFFERENT pid_B has
      the same canonical name in PT. Same pattern as the HOF
      Heather Cook → Heather Thomas / Jay Moldenhauer → Moldenhauser
      misroutes that 27_qc_alias_misrouting.py was built to catch.
  - bap_split_identity
      DB pid carrying bap_member=1 coexists with a non-BAP pid sharing
      the same canonical name; conservative stub-vs-real gate
      (min event_count ≤ 1) excludes two-real-personas false positives.

Warnings (do not fail the run):
  - empty_name              — CSV row has empty name field
  - name_mismatch           — CSV name differs from DB person_name for the
                              resolved pid
  - bap_nickname_missing    — CSV has nickname but DB bap_nickname is empty
  - bap_nickname_mismatch   — CSV nickname differs from DB bap_nickname
  - bap_year_mismatch       — CSV year_inducted differs from DB
                              bap_induction_year
  - orphan_bap_flag         — DB row carries bap_member=1 but no CSV row
                              normalizes to its person_name
  - stale_legacy_csv_only   — name appears in older bap_data.csv but not
                              in authoritative bap_data_updated.csv

Read-only. No data writes; no schema/UI/gallery/media work.

Usage:
  python legacy_data/event_results/scripts/28_qc_bap_coverage.py
  python legacy_data/event_results/scripts/28_qc_bap_coverage.py --db /path/to/footbag.db

Exit 0 iff no hard failures; 1 on hard failures; 2 on missing inputs.
"""
from __future__ import annotations

import argparse
import ast
import csv
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT  = SCRIPT_DIR.parents[2]

DEFAULT_DB              = REPO_ROOT / "database" / "footbag.db"
DEFAULT_BAP             = REPO_ROOT / "legacy_data" / "inputs" / "bap_data_updated.csv"
DEFAULT_BAP_LEGACY      = REPO_ROOT / "legacy_data" / "inputs" / "bap_data.csv"
DEFAULT_PT              = REPO_ROOT / "legacy_data" / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"
DEFAULT_PERSON_ALIASES  = REPO_ROOT / "legacy_data" / "overrides" / "person_aliases.csv"
DEFAULT_PDN             = REPO_ROOT / "legacy_data" / "inputs" / "identity_lock" / "Person_Display_Names_v1.csv"
DEFAULT_HONOR_SOURCE    = REPO_ROOT / "legacy_data" / "pipeline" / "historical" / "export_historical_csvs.py"


def load_honor_overrides(source_path: Path) -> dict[str, str]:
    """Extract _HONOR_OVERRIDES dict from the loader source.

    Replicates the fallback step in _match_honor()'s resolution chain
    (export_historical_csvs.py:1396-1419). Reads via ast so the audit
    stays in sync if entries are added/removed without re-coding here.
    """
    if not source_path.exists():
        return {}
    tree = ast.parse(source_path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        # Source uses annotated form: `_HONOR_OVERRIDES: dict[str, str] = {...}`
        if isinstance(node, ast.AnnAssign):
            if isinstance(node.target, ast.Name) and node.target.id == "_HONOR_OVERRIDES":
                if node.value is not None:
                    try:
                        return ast.literal_eval(node.value)
                    except (ValueError, SyntaxError):
                        return {}
        # Also handle plain `_HONOR_OVERRIDES = {...}` for resilience.
        elif isinstance(node, ast.Assign):
            for tgt in node.targets:
                if isinstance(tgt, ast.Name) and tgt.id == "_HONOR_OVERRIDES":
                    try:
                        return ast.literal_eval(node.value)
                    except (ValueError, SyntaxError):
                        return {}
    return {}


def norm(s: str) -> str:
    """Lowercase, collapse whitespace, strip — matches the audit-side
    normalization used by 27_qc_alias_misrouting.py."""
    return " ".join((s or "").lower().split())


def parse_pipe(field_value: str) -> list[str]:
    return [p.strip() for p in (field_value or "").split("|") if p.strip()]


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--db",                default=str(DEFAULT_DB))
    ap.add_argument("--bap-csv",           default=str(DEFAULT_BAP))
    ap.add_argument("--bap-legacy-csv",    default=str(DEFAULT_BAP_LEGACY))
    ap.add_argument("--pt",                default=str(DEFAULT_PT))
    ap.add_argument("--person-aliases",    default=str(DEFAULT_PERSON_ALIASES))
    ap.add_argument("--pdn",               default=str(DEFAULT_PDN))
    ap.add_argument("--honor-source",      default=str(DEFAULT_HONOR_SOURCE),
                    help="Path to export_historical_csvs.py for _HONOR_OVERRIDES extraction")
    ap.add_argument("--max-warn", type=int, default=20,
                    help="Max warnings to print per category (default: 20)")
    args = ap.parse_args()

    for label, p in (("DB", args.db), ("BAP CSV", args.bap_csv),
                     ("PT", args.pt)):
        if not Path(p).exists():
            print(f"ERROR: {label} not found: {p}", file=sys.stderr)
            return 2

    # ── Load PT (canonical → pid; player_names_seen + aliases_presentable
    #    contribute alternate forms) ──────────────────────────────────────
    pt_canon_to_pid: dict[str, str]   = {}
    pt_pid_to_canon: dict[str, str]   = {}
    pt_pid_source: dict[str, str]     = {}
    pt_canon_pids:  dict[str, list[str]] = defaultdict(list)  # name → [pids] (multi)
    name_index:     dict[str, str]    = {}   # normalized name → pid (alias-first overrides)

    with open(args.pt, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            pid    = r["effective_person_id"].strip()
            canon  = r.get("person_canon", "").strip()
            source = r.get("source", "").strip()
            if not pid:
                continue
            pt_pid_to_canon[pid] = canon
            pt_pid_source[pid]   = source
            if canon:
                ncanon = norm(canon)
                pt_canon_to_pid[ncanon] = pid           # first-write wins for primary lookup
                pt_canon_pids[ncanon].append(pid)
                name_index.setdefault(ncanon, pid)
            for n in parse_pipe(r.get("player_names_seen", "")):
                name_index.setdefault(norm(n), pid)
            for a in parse_pipe(r.get("aliases_presentable", "")):
                if len(a) > 3:
                    name_index.setdefault(norm(a), pid)

    # ── Load person_aliases.csv (alias-first OVERRIDES name_index) ──────
    if Path(args.person_aliases).exists():
        with open(args.person_aliases, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                a   = norm(r.get("alias", ""))
                pid = (r.get("person_id") or "").strip()
                if a and pid:
                    name_index[a] = pid

    # ── Load PDN (overrides name_index) ─────────────────────────────────
    if Path(args.pdn).exists():
        with open(args.pdn, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                a   = norm(r.get("display_name", ""))
                pid = (r.get("effective_person_id") or "").strip()
                if a and pid:
                    name_index[a] = pid

    # ── Load DB historical_persons rows ─────────────────────────────────
    con = sqlite3.connect(args.db)
    con.row_factory = sqlite3.Row
    try:
        db_by_pid: dict[str, dict] = {}
        for r in con.execute(
            "SELECT person_id, person_name, bap_member, bap_nickname, "
            "bap_induction_year, hof_member, event_count "
            "FROM historical_persons"
        ):
            db_by_pid[r["person_id"]] = {
                "person_name": r["person_name"] or "",
                "bap_member": int(r["bap_member"] or 0),
                "bap_nickname": r["bap_nickname"] or "",
                "bap_induction_year": str(r["bap_induction_year"] or ""),
                "hof_member": int(r["hof_member"] or 0),
                "event_count": int(r["event_count"] or 0),
            }
    finally:
        con.close()

    db_canon_to_bap_pid: dict[str, str] = {}
    for pid, d in db_by_pid.items():
        if d["bap_member"]:
            db_canon_to_bap_pid[norm(d["person_name"])] = pid

    # ── Load BAP source CSVs ────────────────────────────────────────────
    bap_rows: list[dict] = []
    with open(args.bap_csv, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            bap_rows.append({
                "name": (r.get("name") or "").strip(),
                "nickname": (r.get("nickname") or "").strip(),
                "year": (r.get("year_inducted") or "").strip(),
            })

    legacy_names: set[str] = set()
    if Path(args.bap_legacy_csv).exists():
        with open(args.bap_legacy_csv, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                n = (r.get("name") or "").strip()
                if n:
                    legacy_names.add(norm(n))

    # ── Load _HONOR_OVERRIDES (fallback resolution path) ────────────────
    honor_overrides = load_honor_overrides(Path(args.honor_source))

    # ── Audit ───────────────────────────────────────────────────────────
    hard: dict[str, list[str]] = defaultdict(list)
    warn: dict[str, list[str]] = defaultdict(list)
    csv_names_normalized: set[str] = set()
    resolved_csv_pids: set[str]    = set()

    for row in bap_rows:
        name = row["name"]
        nick = row["nickname"]
        year = row["year"]

        if not name:
            warn["empty_name"].append(f"row with empty name (nickname={nick!r}, year={year!r})")
            continue

        nname = norm(name)
        csv_names_normalized.add(nname)

        # Resolution chain matching _match_honor():
        #   1. name_index (approximates _ALIAS_RESOLVER.resolve)
        #   2. _HONOR_OVERRIDES fallback (raw_name.lower → canonical → pid)
        resolved_pid = name_index.get(nname)
        resolve_path = "name_index" if resolved_pid else None
        if resolved_pid is None:
            override_canon = honor_overrides.get(nname)
            if override_canon:
                resolved_pid = pt_canon_to_pid.get(norm(override_canon))
                resolve_path = "honor_override"
        canonical_pid = pt_canon_to_pid.get(nname)

        if resolved_pid is None:
            hard["bap_unresolved"].append(
                f"'{name}' (nick={nick!r}, year={year}) — no PT canonical / aliases / "
                f"PDN / _HONOR_OVERRIDES match"
            )
            continue

        # Misroute: canonical-name match exists at a different pid.
        # Only flagged when alias-first (name_index) wins over canonical
        # match — honor_override-driven resolution is intentional remap.
        if (canonical_pid and resolved_pid != canonical_pid
                and resolve_path == "name_index"):
            hard["bap_misroute"].append(
                f"'{name}' (year={year}) — alias-first resolved to {resolved_pid[:8]} "
                f"(canon={pt_pid_to_canon.get(resolved_pid, '')!r}) but PT canonical "
                f"match at {canonical_pid[:8]} (canon={pt_pid_to_canon.get(canonical_pid, '')!r})"
            )
            continue

        db_row = db_by_pid.get(resolved_pid)
        if db_row is None:
            hard["bap_pid_not_in_db"].append(
                f"'{name}' — resolved to pid={resolved_pid[:8]} but not in historical_persons"
            )
            continue

        if not db_row["bap_member"]:
            hard["bap_flag_off"].append(
                f"'{name}' — resolved to pid={resolved_pid[:8]} ('{db_row['person_name']}') "
                f"but bap_member=0"
            )
            continue

        resolved_csv_pids.add(resolved_pid)

        # Soft warnings on detail mismatch
        if norm(db_row["person_name"]) != nname:
            warn["name_mismatch"].append(
                f"'{name}' (csv) vs '{db_row['person_name']}' (db) for pid={resolved_pid[:8]}"
            )
        if nick and not db_row["bap_nickname"]:
            warn["bap_nickname_missing"].append(
                f"'{name}' — csv nickname={nick!r} but DB bap_nickname is empty"
            )
        elif nick and db_row["bap_nickname"] != nick:
            warn["bap_nickname_mismatch"].append(
                f"'{name}' — csv={nick!r} db={db_row['bap_nickname']!r}"
            )
        if year and str(db_row["bap_induction_year"]) != year:
            warn["bap_year_mismatch"].append(
                f"'{name}' — csv={year!r} db={db_row['bap_induction_year']!r}"
            )

    # ── Orphan BAP flags: DB pid carries bap=1 but no CSV row resolves to it ──
    for pid, d in db_by_pid.items():
        if not d["bap_member"]:
            continue
        if pid not in resolved_csv_pids:
            warn["orphan_bap_flag"].append(
                f"DB pid={pid[:8]} canon='{d['person_name']}' has bap_member=1 "
                f"but no bap_data_updated.csv row resolves to this pid"
            )

    # ── Stale legacy: names in old bap_data.csv but not in updated CSV ──
    for nname in sorted(legacy_names - csv_names_normalized):
        warn["stale_legacy_csv_only"].append(
            f"name {nname!r} in bap_data.csv but absent from bap_data_updated.csv"
        )

    # ── Split-identity: BAP pid coexists with non-BAP pid sharing canonical ──
    for nname, pid_list in pt_canon_pids.items():
        if len(pid_list) < 2:
            continue
        bap_pids: list[str]   = []
        nobap_pids: list[str] = []
        for p in pid_list:
            if p not in db_by_pid:
                continue
            (bap_pids if db_by_pid[p]["bap_member"] else nobap_pids).append(p)
        if not bap_pids or not nobap_pids:
            continue
        for bp in bap_pids:
            for np in nobap_pids:
                ev_b = db_by_pid[bp]["event_count"]
                ev_n = db_by_pid[np]["event_count"]
                if min(ev_b, ev_n) > 1:
                    continue   # two real personas — not a stub-vs-real split
                hard["bap_split_identity"].append(
                    f"BAP pid={bp[:8]} (canon={db_by_pid[bp]['person_name']!r}, "
                    f"events={ev_b}) likely == non-BAP pid={np[:8]} "
                    f"(canon={db_by_pid[np]['person_name']!r}, events={ev_n})"
                )

    # ── Report ──────────────────────────────────────────────────────────
    n_hard = sum(len(v) for v in hard.values())
    n_warn = sum(len(v) for v in warn.values())

    print("=" * 72)
    print(f"BAP coverage QC — {len(bap_rows)} bap_data_updated.csv rows | "
          f"{len(db_by_pid)} historical_persons")
    print("=" * 72)

    print(f"\nHARD FAILURES: {n_hard}")
    if n_hard:
        for code in ("bap_unresolved", "bap_pid_not_in_db", "bap_flag_off",
                     "bap_misroute", "bap_split_identity"):
            items = hard.get(code, [])
            if items:
                print(f"  {code} ({len(items)}):", file=sys.stderr)
                for m in items:
                    print(f"    - {m}", file=sys.stderr)

    print(f"\nWARNINGS: {n_warn}")
    if n_warn:
        for code in ("empty_name", "name_mismatch", "bap_nickname_missing",
                     "bap_nickname_mismatch", "bap_year_mismatch",
                     "orphan_bap_flag", "stale_legacy_csv_only"):
            items = warn.get(code, [])
            if items:
                print(f"  {code} ({len(items)}):")
                cap = max(0, args.max_warn)
                for m in items[:cap]:
                    print(f"    - {m}")
                if len(items) > cap:
                    print(f"    ... ({len(items) - cap} more; rerun with --max-warn N)")

    print()
    if n_hard:
        print(f"FAIL: {n_hard} hard failure(s); {n_warn} warning(s).", file=sys.stderr)
        return 1
    print(f"PASS: 0 hard failures; {n_warn} warning(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

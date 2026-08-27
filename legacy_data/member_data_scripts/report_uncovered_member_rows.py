#!/usr/bin/env python3
"""Report the legacy_members rows the export did not cover, and check their rulings.

A row still carrying a non-authoritative provenance after the export load is one
the export did not cover. The ruling is that this does not halt the cutover, so
this runs beside the load rather than inside it: it reports, it validates the
recorded decisions against current evidence, and with --require-dispositions it
refuses when a row has none. Nothing here writes to the database, and recording a
clear decision is not performing it.

Uncovered is defined by what the row is not, rather than by any one bootstrap
label, so relabelling the local seed cannot quietly empty the report.

Usage (from the repository root):
    python3 legacy_data/member_data_scripts/report_uncovered_member_rows.py \\
        --db database/footbag.db \\
        --exclusions legacy_data/member_data_scripts/out/legacy_export_exclusions.csv \\
        --dispositions <private>/member_row_dispositions.csv \\
        --out legacy_data/member_data_scripts/out/uncovered_member_rows.csv
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import member_row_disposition as mrd  # noqa: E402

AUTHORITATIVE = "legacy_site_data"
OUT_FIELDS = ("legacy_member_id", "import_source", "exclusion_rule", "pulled_back",
              "dependent_person_ids", "display_name", "fingerprint",
              "decision", "reason")


def read_exclusions(path: Path | None) -> dict[str, dict[str, str]]:
    """legacy_member_id -> {exclusion_rule, pulled_back}, from the loader's own
    provenance file. Absent means the load has not run here, which is reported
    rather than guessed at: without it no survivor can be attributed."""
    if path is None or not path.exists():
        return {}
    with path.open(encoding="utf-8", newline="") as f:
        return {r["legacy_member_id"]: r for r in csv.DictReader(f)}


def boundary_of(rows: list[dict]) -> str:
    """One-way fingerprint of the uncovered population as a whole, so a ruling made
    against one shape of the report does not silently carry into another."""
    canonical = "\x1f".join(sorted(
        f"{r['legacy_member_id']}|{r['import_source']}" for r in rows))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def collect(db: Path, exclusions: dict[str, dict[str, str]]) -> list[dict]:
    conn = sqlite3.connect(str(db))
    conn.row_factory = sqlite3.Row
    try:
        rows = [dict(r) for r in conn.execute(
            "SELECT legacy_member_id, display_name, import_source FROM legacy_members "
            "WHERE COALESCE(import_source, '') <> ? ORDER BY legacy_member_id",
            (AUTHORITATIVE,))]
        dependants: dict[str, list[str]] = {}
        for r in conn.execute(
                "SELECT legacy_member_id, person_id FROM historical_persons "
                "WHERE legacy_member_id IS NOT NULL AND legacy_member_id <> ''"):
            dependants.setdefault(r["legacy_member_id"], []).append(r["person_id"])
    finally:
        conn.close()

    boundary = boundary_of(rows)
    out: list[dict] = []
    for r in rows:
        mid = r["legacy_member_id"]
        exc = exclusions.get(mid, {})
        rule = exc.get("exclusion_rule", "not_in_export")
        pulled = exc.get("pulled_back", "0") == "1"
        deps = sorted(dependants.get(mid, []))
        out.append({
            "legacy_member_id": mid,
            "import_source": r["import_source"] or "",
            "exclusion_rule": rule,
            "pulled_back": pulled,
            "dependent_person_ids": deps,
            "display_name": r["display_name"] or "",
            "fingerprint": mrd.uncovered_boundary_fingerprint(
                mid, r["import_source"] or "", rule, pulled, deps, boundary),
        })
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", required=True, type=Path)
    ap.add_argument("--exclusions", type=Path, default=None,
                    help="the loader's per-id exclusion provenance; without it a "
                         "survivor cannot be attributed to the rule that dropped it")
    ap.add_argument("--dispositions", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--require-dispositions", action="store_true",
                    help="refuse when an uncovered row carries no recorded decision. "
                         "The pre-cutover checks set this; the cutover load does not, "
                         "because an uncovered row must not halt it.")
    args = ap.parse_args()

    if not args.db.is_file():
        raise SystemExit(f"error: database not found: {args.db}")

    exclusions = read_exclusions(args.exclusions)
    uncovered = collect(args.db, exclusions)
    dispositions = mrd.load_dispositions(args.dispositions)

    try:
        audit = mrd.apply_dispositions(uncovered, dispositions)
        if args.require_dispositions:
            mrd.assert_every_uncovered_row_dispositioned(uncovered, dispositions)
    except mrd.MemberRowDispositionError as e:
        print(f"error: member-row disposition failed closed: {e}", file=sys.stderr)
        return 2

    decided = {a["legacy_member_id"]: a for a in audit}
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        with args.out.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=OUT_FIELDS, lineterminator="\n")
            w.writeheader()
            for u in uncovered:
                a = decided.get(u["legacy_member_id"], {})
                w.writerow({
                    **{k: u[k] for k in ("legacy_member_id", "import_source",
                                         "exclusion_rule", "display_name", "fingerprint")},
                    "pulled_back": "1" if u["pulled_back"] else "0",
                    "dependent_person_ids": "|".join(u["dependent_person_ids"]),
                    "decision": a.get("decision", ""),
                    "reason": a.get("reason", ""),
                })

    by_source: dict[str, int] = {}
    for u in uncovered:
        by_source[u["import_source"]] = by_source.get(u["import_source"], 0) + 1
    print("uncovered legacy_members rows (not carrying the authoritative provenance)")
    print(f"  total:                    {len(uncovered)}")
    for src in sorted(by_source):
        print(f"    import_source {src or '(null)'}:".ljust(28) + f"{by_source[src]}")
    print(f"  carrying a decision:      {len(audit)}")
    print(f"  awaiting a decision:      {len(uncovered) - len(audit)}")
    with_deps = sum(1 for u in uncovered if u["dependent_person_ids"])
    print(f"  a historical person depends on: {with_deps}")
    if not exclusions:
        print("  note: no exclusion provenance supplied, so every row is reported as "
              "not_in_export rather than attributed to the rule that dropped it")
    if args.out:
        print(f"  written to:               {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

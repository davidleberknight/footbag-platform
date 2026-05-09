"""
Build an XLSX reconciliation workbook between Footbag.org and the IFPA
freestyle dictionary.

Read-only. Composes from existing artifacts:
  - legacy_data/reports/freestyle_dict_coverage_diff.csv (254 fborg rows)
  - legacy_data/reports/structural_alias_adjudication.csv (per-row policy verdict)
  - database/footbag.db (canonical-side fields for matched rows)

Output:
  - legacy_data/reports/fborg_reconciliation.xlsx

Adjudication routing:
  - 6 explicitly James-pre-decided tricks (Triple ATW, Double ATW Sole,
    Blender, Butterfly Swirl, Barfly, Down Double Down) get
    james_decision pre-filled and needs_red=no, regardless of the
    adjudicator's verdict.
  - Otherwise needs_red follows the adjudicator's verdict (true Red
    backlog is preserved as-is per James's standing instruction).

Does not modify any ontology data, CSVs, or DB.
"""
import argparse
import csv
import re
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_DIFF        = REPO / "legacy_data" / "reports" / "freestyle_dict_coverage_diff.csv"
DEFAULT_ADJUDICATION = REPO / "legacy_data" / "reports" / "structural_alias_adjudication.csv"
DEFAULT_DB          = REPO / "database" / "footbag.db"
DEFAULT_OUT         = REPO / "legacy_data" / "reports" / "fborg_reconciliation.xlsx"

# James-pre-decided overrides. Match on lowercased external_name.
# Each entry: lowercased_name → (decision, comment).
JAMES_PRE_DECIDED: dict[str, tuple[str, str]] = {
    "triple around the world":     ("valid productive variant (not standalone canonical)",
                                    "James direct adjudication: treated as a valid productive variant of around-the-world, not a standalone canonical named trick under current dictionary policy (§10)."),
    "double around the world heel":("valid productive variant (not standalone canonical)",
                                    "James direct adjudication: treated as a valid productive variant of around-the-world (with heel-stall ending), not a standalone canonical named trick under current dictionary policy (§10)."),
    "blender":                     ("canonical (existing)",
                                    "James direct adjudication: blender is an active canonical row in IFPA dictionary."),
    "butterfly swirl":             ("canonical-candidate (provisional)",
                                    "James direct adjudication: community-named compound; promote to canonical pending notation/ADD review."),
    "barfly":                      ("canonical (existing)",
                                    "James direct adjudication: barfly is an active canonical row in IFPA dictionary."),
    "down double down":            ("blocked by down-family policy",
                                    "James direct adjudication: defer until down-family policy ruling — see red-followup-down-family-2026-05.md."),
}


def parse_int(value: str | None) -> int | None:
    if not value: return None
    try: return int(value)
    except (ValueError, TypeError): return None


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return s or "unknown"


def load_canonical(db: sqlite3.Connection) -> dict[str, dict]:
    """slug → {name, adds, notation, description, is_active, review_status}."""
    rows = db.execute(
        """SELECT slug, canonical_name, adds, notation, description, is_active, review_status
           FROM freestyle_tricks"""
    ).fetchall()
    out = {}
    for slug, name, adds, notation, descr, is_active, status in rows:
        out[slug] = {
            "name":          name,
            "adds":          parse_int(adds) if adds else None,
            "notation":      notation or "",
            "description":   descr or "",
            "is_active":     bool(is_active),
            "review_status": status or "",
        }
    return out


def load_adjudication(path: Path) -> dict[str, dict]:
    """slug → adjudication row dict."""
    out = {}
    with path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            out[r["slug"]] = r
    return out


def derive_recon_status(diff_row: dict, adj_row: dict | None) -> tuple[str, str]:
    """Return (reconciliation_status, comment). Maps adjudicator + diff
    state into a single status field plus a human comment."""
    match_type = diff_row.get("match_type", "")
    if match_type == "exact canonical":
        return ("matched_canonical",
                "Footbag.org name matches an active IFPA canonical row.")
    if match_type == "likely structural alias":
        slug = diff_row.get("canonical_slug") or "?"
        return ("structural_alias_inline",
                f"Footbag.org name decomposes structurally to canonical `{slug}`; render as Common alias on the canonical row in Deep Dive.")
    if match_type != "no match":
        return ("unknown_match_type", f"diff match_type={match_type!r}")

    # match_type = "no match" → use adjudicator verdict
    if adj_row is None:
        return ("fborg_only",
                "No IFPA canonical match; trick only exists on Footbag.org. Provisional slug generated; no canonical row created.")

    cls = adj_row.get("auto_classification", "UNRESOLVED")
    decomposition = adj_row.get("decomposition", "") or ""
    reason = adj_row.get("reason", "") or ""
    if cls == "PRODUCTIVE-MULTIPLICITY-NON-CANONICAL":
        return ("productive_multiplicity_non_canonical",
                f"Productive multiplicity ({decomposition}); per CANONICALIZATION_POLICY §10 default, no canonical row earned.")
    if cls == "STRUCTURAL-ALIAS-FULL":
        return ("structural_alias_full",
                f"Decomposition: {decomposition}. Render as alias on the decomposition's canonical.")
    if cls == "STRUCTURAL-ALIAS-VIA-ALTNAME":
        return ("structural_alias_via_altname",
                f"External name is community shorthand; alt-name documents structural recipe ({decomposition}).")
    if cls == "STRUCTURAL-ALIAS-ADD-CONFLICT":
        return ("add_conflict",
                f"Decomposition resolves but ADD math disagrees: {decomposition}. {reason}")
    if cls == "POLICY-BLOCKED-DOWN":
        return ("policy_blocked_down",
                f"Down-family policy not yet settled. Deferred. {reason}")
    if cls == "PRODUCTIVE-MULTIPLICITY-BASE-UNRESOLVABLE":
        return ("productive_multiplicity_base_unresolved",
                f"Count-prefix pattern but base unresolved: {decomposition}.")
    if cls == "CANONICAL-CANDIDATE-NAMED-IDENTITY":
        return ("canonical_candidate",
                f"Strong evidence ({adj_row.get('evidence_score','?')}); community-named identity; pending Red.")
    if cls == "EXTERNAL-ONLY-DESCRIPTIVE":
        return ("external_only",
                "Trick only exists on Footbag.org as low-evidence external entry. Provisional slug; no canonical action.")
    if cls == "UNRESOLVED":
        return ("unresolved",
                "Adjudicator could not classify with confidence. Pending Red.")
    return (cls.lower(), f"Auto-classification: {cls}.")


def _normalize_name_key(name: str) -> str:
    """Lowercase + drop hyphens / whitespace runs so 'Down Double-Down'
    and 'down double down' collapse to the same key."""
    return re.sub(r"[\s\-]+", " ", (name or "").lower()).strip()


def adjudication_for(name: str, recon_status: str, adj_row: dict | None) -> tuple[str, str, str]:
    """Return (james_decision, james_notes, needs_red).

    Pre-fills james_decision for the 6 explicitly-named tricks per the
    user's "James can directly adjudicate" list. Otherwise leaves it
    blank and routes to Red according to the adjudicator's verdict
    (preserving the existing Red queue).
    """
    key = _normalize_name_key(name)
    pre_decided_norm = {_normalize_name_key(k): v for k, v in JAMES_PRE_DECIDED.items()}
    if key in pre_decided_norm:
        decision, note = pre_decided_norm[key]
        return (decision, note, "no")

    auto_resolvable = (adj_row or {}).get("auto_resolvable", "")
    needs_red_field = (adj_row or {}).get("needs_red", "")
    if auto_resolvable == "yes":
        return ("", "", "no")
    if needs_red_field.startswith("yes"):
        return ("", "", "yes")
    # No adjudication entry (typically because it matched canonical) → no Red.
    return ("", "", "no")


def build_workbook(
    diff_path: Path, adj_path: Path, db_path: Path, out_path: Path,
) -> None:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    db = sqlite3.connect(str(db_path))
    canonical = load_canonical(db)
    db.close()

    adjudication = load_adjudication(adj_path)

    with diff_path.open(newline="", encoding="utf-8") as f:
        diff_rows = list(csv.DictReader(f))

    columns = [
        # Footbag.org side
        ("showmove_id",          12),
        ("fborg_name",           28),
        ("fborg_url",            32),
        ("fborg_ADD",             6),
        ("fborg_notation",       40),
        ("fborg_description",    48),
        ("fborg_alt_name",       22),
        ("has_video",             8),
        # IFPA side
        ("ifpa_slug",            22),
        ("ifpa_name",            22),
        ("ifpa_ADD",              6),
        ("ifpa_notation",        40),
        ("ifpa_description",     40),
        ("ifpa_status",          12),
        # Reconciliation
        ("match_type",           18),
        ("reconciliation_status",26),
        ("evidence_score",        6),
        ("comment",              60),
        # Adjudication
        ("james_decision",       38),
        ("james_notes",          48),
        ("needs_red",             8),
        ("red_status",           24),
    ]

    wb = Workbook()
    ws = wb.active
    ws.title = "Reconciliation"

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="2A4D70")
    align_top   = Alignment(vertical="top", wrap_text=True)

    fborg_only_fill   = PatternFill("solid", fgColor="FFF2CC")
    needs_red_fill    = PatternFill("solid", fgColor="F4CCCC")
    pre_decided_fill  = PatternFill("solid", fgColor="D9EAD3")
    matched_fill      = PatternFill("solid", fgColor="E8F0F7")

    for idx, (name, width) in enumerate(columns, start=1):
        c = ws.cell(row=1, column=idx, value=name)
        c.font = header_font
        c.fill = header_fill
        c.alignment = Alignment(horizontal="left", vertical="center")
        ws.column_dimensions[get_column_letter(idx)].width = width
    ws.freeze_panes = "A2"
    ws.row_dimensions[1].height = 22

    summary = {"matched": 0, "fborg_only": 0, "needs_red": 0, "pre_decided": 0}

    for diff in diff_rows:
        external_name = diff.get("external_name", "")
        external_slug = diff.get("external_slug") or slugify(external_name)
        canonical_slug = diff.get("canonical_slug") or ""
        canonical_match = (diff.get("canonical_match") == "yes")

        ifpa_row = canonical.get(canonical_slug) if canonical_match else None
        ifpa_status = (
            ("active" if ifpa_row["is_active"] else "pending")
            if ifpa_row else "not_in_dict"
        )

        adj_row = adjudication.get(external_slug)
        recon_status, comment = derive_recon_status(diff, adj_row)

        james_decision, james_notes, needs_red = adjudication_for(
            external_name, recon_status, adj_row
        )
        red_status = (adj_row or {}).get("auto_classification", "")

        # Provisional slug for fborg_only / unresolved cases.
        ifpa_slug_out = canonical_slug if canonical_match else f"(provisional) {external_slug}"

        evidence = diff.get("evidence_score") or ""

        row_values = [
            diff.get("external_showmove_id", ""),
            external_name,
            diff.get("external_url", ""),
            parse_int(diff.get("external_ADD", "")) or "",
            diff.get("external_notation", ""),
            diff.get("external_description", ""),
            diff.get("external_alt_name", ""),
            "yes" if diff.get("media_present") == "yes" or diff.get("has_media") == "yes" else "no",
            ifpa_slug_out,
            (ifpa_row or {}).get("name", ""),
            (ifpa_row or {}).get("adds") if ifpa_row else "",
            (ifpa_row or {}).get("notation", ""),
            (ifpa_row or {}).get("description", ""),
            ifpa_status,
            diff.get("match_type", ""),
            recon_status,
            parse_int(evidence) if evidence else "",
            comment,
            james_decision,
            james_notes,
            needs_red,
            red_status,
        ]

        target_row = ws.max_row + 1
        for col_idx, val in enumerate(row_values, start=1):
            c = ws.cell(row=target_row, column=col_idx, value=val)
            c.alignment = align_top

        # Whole-row highlight by category.
        if james_decision:
            fill = pre_decided_fill
            summary["pre_decided"] += 1
        elif needs_red == "yes":
            fill = needs_red_fill
            summary["needs_red"] += 1
        elif recon_status in ("fborg_only", "external_only"):
            fill = fborg_only_fill
            summary["fborg_only"] += 1
        elif canonical_match:
            fill = matched_fill
            summary["matched"] += 1
        else:
            fill = None
        if fill is not None:
            for col_idx in range(1, len(columns) + 1):
                ws.cell(row=target_row, column=col_idx).fill = fill

    # Summary sheet.
    s = wb.create_sheet("Summary")
    s["A1"] = "Footbag.org × IFPA reconciliation — counts"
    s["A1"].font = Font(bold=True, size=14)
    s["A3"] = "Total rows"; s["B3"] = len(diff_rows)
    s["A4"] = "Matched canonical"; s["B4"] = summary["matched"]
    s["A5"] = "External-only (fborg_only)"; s["B5"] = summary["fborg_only"]
    s["A6"] = "James pre-decided"; s["B6"] = summary["pre_decided"]
    s["A7"] = "Needs Red"; s["B7"] = summary["needs_red"]
    s["A8"] = "Other (structural-alias / productive-multiplicity / policy-blocked / unresolved)"
    s["B8"] = len(diff_rows) - sum(summary.values())
    s["A10"] = "Color legend (Reconciliation sheet rows):"; s["A10"].font = Font(bold=True)
    s["A11"] = "Light blue: matched_canonical"; s["A11"].fill = matched_fill
    s["A12"] = "Yellow: fborg_only / external_only"; s["A12"].fill = fborg_only_fill
    s["A13"] = "Green: James pre-decided (Triple ATW, etc.)"; s["A13"].fill = pre_decided_fill
    s["A14"] = "Red: needs Red review"; s["A14"].fill = needs_red_fill
    s.column_dimensions["A"].width = 70
    s.column_dimensions["B"].width = 12

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)
    print(f"Wrote: {out_path}")
    print("By category:")
    print(f"  matched_canonical:    {summary['matched']}")
    print(f"  fborg_only:           {summary['fborg_only']}")
    print(f"  james_pre_decided:    {summary['pre_decided']}")
    print(f"  needs_red:            {summary['needs_red']}")
    print(f"  other:                {len(diff_rows) - sum(summary.values())}")
    print(f"  total:                {len(diff_rows)}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--diff",          default=str(DEFAULT_DIFF))
    ap.add_argument("--adjudication",  default=str(DEFAULT_ADJUDICATION))
    ap.add_argument("--db",            default=str(DEFAULT_DB))
    ap.add_argument("--out",           default=str(DEFAULT_OUT))
    args = ap.parse_args()

    for label, p in [("diff", args.diff), ("adjudication", args.adjudication), ("db", args.db)]:
        if not Path(p).exists():
            print(f"ERROR: {label} not found at {p}", file=sys.stderr)
            return 1

    build_workbook(Path(args.diff), Path(args.adjudication), Path(args.db), Path(args.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())

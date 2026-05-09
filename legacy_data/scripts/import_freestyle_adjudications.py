"""
Validate and apply James-adjudicated reconciliation decisions to the
platform DB.

Reads:
  legacy_data/freestyle_reconciliation/james_adjudications.csv

Writes (only with --apply):
  database/footbag.db
    - freestyle_tricks               (ADD_CANONICAL: INSERT)
    - freestyle_trick_aliases        (ADD_ALIAS: INSERT)

Always writes a QC report:
  legacy_data/freestyle_reconciliation/import_qc_report.md

Default mode is dry-run (preview + QC report; no DB write). `--apply`
commits inside a single transaction; on validation failure for any
row the entire batch aborts (all-or-nothing).

Supported decisions:
  ADD_CANONICAL       — add a new freestyle_tricks row
  ADD_ALIAS           — add an alias on an existing canonical
  PRODUCTIVE_VARIANT  — record in QC report only (no DB change)
  PROVISIONAL         — record in QC report only (deferred)
  REJECT              — record in QC report only (explicit reject)

Validation rules (per decision):

  ADD_CANONICAL
    - target_canonical_slug matches ^[a-z][a-z0-9-]*$
    - slug not already in freestyle_tricks (no duplicate)
    - target_canonical_name non-empty
    - target_canonical_adds is an integer 0..15 OR the literal 'modifier'
    - alias_text not set (use ADD_ALIAS for that)

  ADD_ALIAS
    - target_canonical_slug exists in freestyle_tricks AND is_active=1
    - alias_text non-empty; lower-cased + slugified key not already
      present in freestyle_trick_aliases
    - alias_type ∈ {common, abbreviation, historical, notation};
      defaults to 'common' when blank
    - chain check: alias_text doesn't itself match an existing canonical
      slug (would create A→B where A is already canonical)

  All write decisions:
    - showmove_id present (provenance link to source row)
    - decision token must be exactly one of the supported tokens

Provenance:
  Every applied row carries `source_id='james-adjudication-YYYY-MM-DD'`
  on freestyle_trick_aliases via freestyle_trick_sources upsert. New
  freestyle_tricks rows get review_status='expert_reviewed' and a note
  in the description trail.
"""
import argparse
import csv
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_CSV   = REPO / "legacy_data" / "freestyle_reconciliation" / "james_adjudications.csv"
DEFAULT_DB    = REPO / "database" / "footbag.db"
DEFAULT_QC    = REPO / "legacy_data" / "freestyle_reconciliation" / "import_qc_report.md"

SLUG_RE = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")

VALID_DECISIONS    = {"ADD_CANONICAL", "ADD_ALIAS",
                      "PRODUCTIVE_VARIANT", "PROVISIONAL", "REJECT"}
VALID_ALIAS_TYPES  = {"common", "abbreviation", "historical", "notation"}


def slugify_alias(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ─── Validation ────────────────────────────────────────────────────────────


class Issue:
    """Single validation issue. severity ∈ {error, warn}."""
    def __init__(self, severity: str, sid: str, decision: str, msg: str):
        self.severity = severity
        self.sid = sid
        self.decision = decision
        self.msg = msg

    def __str__(self) -> str:
        return f"[{self.severity.upper()}] showmove={self.sid} decision={self.decision}: {self.msg}"


def parse_adds(value: str) -> tuple[bool, str | None]:
    """Returns (is_valid, normalized_string). Accepts integer 0..15 or 'modifier'."""
    v = (value or "").strip()
    if not v: return (False, None)
    if v.lower() == "modifier": return (True, "modifier")
    try:
        n = int(v)
        if 0 <= n <= 15: return (True, str(n))
        return (False, None)
    except ValueError:
        return (False, None)


def validate_row(
    row: dict,
    canonical_slugs: set[str],
    canonical_active: set[str],
    alias_slugs: set[str],
) -> tuple[list[Issue], dict | None]:
    """Validate one CSV row. Returns (issues, normalized_row_or_None).
    `normalized_row_or_None` is the row with cleaned values when valid;
    None when the row should be skipped/errored.
    """
    issues: list[Issue] = []
    sid      = (row.get("showmove_id") or "").strip()
    decision = (row.get("decision") or "").strip().upper()

    if not decision:
        return ([], None)   # blank decision = pending, skip silently

    if decision not in VALID_DECISIONS:
        issues.append(Issue("error", sid, decision,
            f"unknown decision token; expected one of {sorted(VALID_DECISIONS)}"))
        return (issues, None)
    if not sid:
        issues.append(Issue("error", sid, decision,
            "showmove_id is required for any non-blank decision"))
        return (issues, None)

    norm = {k: (v or "").strip() for k, v in row.items()}
    norm["decision"] = decision

    if decision == "ADD_CANONICAL":
        slug = norm.get("target_canonical_slug", "")
        name = norm.get("target_canonical_name", "")
        adds_raw = norm.get("target_canonical_adds", "")
        if not slug:
            issues.append(Issue("error", sid, decision, "target_canonical_slug required"))
        elif not SLUG_RE.match(slug):
            issues.append(Issue("error", sid, decision, f"target_canonical_slug {slug!r} invalid (must match ^[a-z][a-z0-9-]*$)"))
        elif slug in canonical_slugs:
            issues.append(Issue("error", sid, decision, f"target_canonical_slug {slug!r} already exists in freestyle_tricks"))
        if not name:
            issues.append(Issue("error", sid, decision, "target_canonical_name required"))
        ok_adds, normalized_adds = parse_adds(adds_raw)
        if not ok_adds:
            issues.append(Issue("error", sid, decision, f"target_canonical_adds {adds_raw!r} invalid (expected integer 0..15 or 'modifier')"))
        else:
            norm["target_canonical_adds"] = normalized_adds
        if norm.get("alias_text"):
            issues.append(Issue("warn", sid, decision,
                "alias_text set on ADD_CANONICAL; ignored. Use ADD_ALIAS for alias-only writes."))

    elif decision == "ADD_ALIAS":
        slug       = norm.get("target_canonical_slug", "")
        alias_text = norm.get("alias_text", "")
        alias_type = norm.get("alias_type", "") or "common"
        if not slug:
            issues.append(Issue("error", sid, decision, "target_canonical_slug required (the canonical the alias points to)"))
        elif slug not in canonical_active:
            issues.append(Issue("error", sid, decision, f"target_canonical_slug {slug!r} not an active canonical"))
        if not alias_text:
            issues.append(Issue("error", sid, decision, "alias_text required"))
        else:
            ak = slugify_alias(alias_text)
            if not ak:
                issues.append(Issue("error", sid, decision, f"alias_text {alias_text!r} normalises to empty slug"))
            elif ak in alias_slugs:
                issues.append(Issue("error", sid, decision, f"alias slug {ak!r} (from alias_text {alias_text!r}) already in freestyle_trick_aliases"))
            elif ak in canonical_slugs:
                issues.append(Issue("error", sid, decision,
                    f"alias_text {alias_text!r} normalises to {ak!r} which is itself a canonical slug — would create an alias chain (forbidden)"))
            norm["_alias_slug"] = ak
        if alias_type not in VALID_ALIAS_TYPES:
            issues.append(Issue("error", sid, decision,
                f"alias_type {alias_type!r} invalid; expected one of {sorted(VALID_ALIAS_TYPES)}"))
        norm["alias_type"] = alias_type

    elif decision in {"PRODUCTIVE_VARIANT", "PROVISIONAL", "REJECT"}:
        # No DB write; documentation only.
        if not norm.get("notes"):
            issues.append(Issue("warn", sid, decision,
                "notes are recommended for documentation-only decisions; left blank"))

    return (issues, norm if not any(i.severity == "error" for i in issues) else None)


# ─── DB loaders + appliers ─────────────────────────────────────────────────


def load_canonical_state(con: sqlite3.Connection) -> tuple[set[str], set[str], set[str]]:
    """Returns (all_slugs, active_slugs, alias_slugs)."""
    all_slugs    = {r[0] for r in con.execute("SELECT slug FROM freestyle_tricks")}
    active_slugs = {r[0] for r in con.execute("SELECT slug FROM freestyle_tricks WHERE is_active=1")}
    alias_slugs  = {r[0] for r in con.execute("SELECT alias_slug FROM freestyle_trick_aliases")}
    return (all_slugs, active_slugs, alias_slugs)


def ensure_source(con: sqlite3.Connection, source_id: str, ts: str) -> None:
    con.execute(
        """INSERT OR IGNORE INTO freestyle_trick_sources
           (id, source_type, source_label, retrieved_at, notes)
           VALUES (?, 'expert', ?, ?, 'James adjudication batch')""",
        (source_id, "James reconciliation adjudications", ts),
    )


def apply_add_canonical(con: sqlite3.Connection, row: dict, ts: str) -> None:
    """Insert new freestyle_tricks row. Uses review_status='expert_reviewed'
    to mark James-adjudicated additions; appends a provenance note in the
    description trail (or sets if blank)."""
    base_descr = row.get("target_canonical_description") or ""
    sid = row.get("showmove_id") or ""
    provenance = f"[james-adjudication {today_str()} from footbag.org #{sid}]"
    description = (base_descr + (" " if base_descr else "") + provenance).strip()
    con.execute(
        """INSERT INTO freestyle_tricks
             (slug, canonical_name, adds, base_trick, trick_family, category,
              description, notation, review_status, is_core, is_active,
              sort_order, loaded_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'expert_reviewed', 0, 1, 0, ?, ?)""",
        (
            row["target_canonical_slug"],
            row["target_canonical_name"],
            row["target_canonical_adds"],
            row.get("target_canonical_base_trick") or row["target_canonical_slug"],
            row.get("target_canonical_family") or row["target_canonical_slug"],
            "compound",
            description,
            row.get("target_canonical_notation") or None,
            ts, ts,
        ),
    )


def apply_add_alias(con: sqlite3.Connection, row: dict, ts: str, source_id: str) -> None:
    con.execute(
        """INSERT INTO freestyle_trick_aliases
             (alias_slug, alias_text, trick_slug, alias_type, source_id, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            row["_alias_slug"],
            row["alias_text"],
            row["target_canonical_slug"],
            row["alias_type"],
            source_id,
            row.get("notes") or None,
            ts,
        ),
    )


# ─── QC report ─────────────────────────────────────────────────────────────


def write_qc_report(
    qc_path: Path,
    total_rows: int,
    by_decision: dict[str, int],
    issues: list[Issue],
    applied: dict[str, list[str]],
    skipped: list[tuple[str, str, str]],
    documentary: dict[str, list[tuple[str, str, str]]],
    apply_mode: bool,
) -> None:
    """Writes a markdown QC report covering the import run."""
    qc_path.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    mode = "APPLIED" if apply_mode else "DRY-RUN"
    lines.append(f"# James adjudications import — {mode} ({today_str()})\n")
    lines.append(f"- Total rows in CSV: **{total_rows}**")
    lines.append(f"- Mode: **{mode}**\n")
    lines.append(f"## Decisions parsed\n")
    if by_decision:
        lines.append("| Decision | Count |\n|---|---:|")
        for d in sorted(by_decision):
            lines.append(f"| `{d}` | {by_decision[d]} |")
    else:
        lines.append("(no decisions filled in yet)")
    lines.append("")
    lines.append(f"## Validation issues\n")
    if not issues:
        lines.append("None.")
    else:
        errors = [i for i in issues if i.severity == "error"]
        warns  = [i for i in issues if i.severity == "warn"]
        lines.append(f"- Errors: **{len(errors)}**")
        lines.append(f"- Warnings: **{len(warns)}**\n")
        if errors:
            lines.append("### Errors")
            for i in errors:
                lines.append(f"- {i}")
            lines.append("")
        if warns:
            lines.append("### Warnings")
            for i in warns:
                lines.append(f"- {i}")
            lines.append("")
    label = "Applied to DB" if apply_mode else "Would be applied to DB (dry-run preview)"
    lines.append(f"## {label}\n")
    for kind in ("ADD_CANONICAL", "ADD_ALIAS"):
        block = applied.get(kind, [])
        lines.append(f"- {kind}: **{len(block)}**")
        for line in block:
            lines.append(f"  - {line}")
    lines.append("")
    lines.append(f"## Documentary decisions (recorded only)\n")
    total_doc = sum(len(v) for v in documentary.values())
    lines.append(f"Total: {total_doc}")
    for kind, rows in documentary.items():
        if not rows: continue
        lines.append(f"\n### {kind}")
        for sid, name, note in rows:
            lines.append(f"- `{sid}` ({name}): {note or '(no note)'}")
    lines.append(f"\n## Skipped rows\n")
    if not skipped:
        lines.append("None.")
    else:
        for sid, reason, name in skipped:
            lines.append(f"- `{sid}` ({name}): {reason}")
    qc_path.write_text("\n".join(lines) + "\n")


# ─── Main ──────────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv",    default=str(DEFAULT_CSV))
    ap.add_argument("--db",     default=str(DEFAULT_DB))
    ap.add_argument("--qc-out", default=str(DEFAULT_QC))
    ap.add_argument("--apply",  action="store_true", help="Commit changes (default: dry-run)")
    args = ap.parse_args()

    csv_path = Path(args.csv); db_path = Path(args.db); qc_path = Path(args.qc_out)
    if not csv_path.exists():
        print(f"ERROR: CSV not found at {csv_path}", file=sys.stderr); return 1
    if not db_path.exists():
        print(f"ERROR: DB not found at {db_path}", file=sys.stderr); return 1

    con = sqlite3.connect(str(db_path)); con.execute("PRAGMA foreign_keys = ON")
    canonical_slugs, canonical_active, alias_slugs = load_canonical_state(con)

    rows = []
    with csv_path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    issues_total: list[Issue] = []
    by_decision: dict[str, int] = {}
    skipped: list[tuple[str, str, str]] = []
    valid_rows: list[dict] = []

    # Ensure no duplicate-slug requests within the batch.
    intra_batch_slugs: set[str] = set()
    intra_batch_aliases: set[str] = set()

    for r in rows:
        sid = (r.get("showmove_id") or "").strip()
        name = (r.get("fborg_name") or "").strip()
        issues, norm = validate_row(r, canonical_slugs, canonical_active, alias_slugs)
        issues_total.extend(issues)
        decision = (r.get("decision") or "").strip().upper()
        if not decision:
            continue
        by_decision[decision] = by_decision.get(decision, 0) + 1
        if norm is None:
            skipped.append((sid, "; ".join(i.msg for i in issues if i.severity == "error"), name))
            continue
        # Intra-batch duplicate guard.
        if decision == "ADD_CANONICAL":
            slug = norm["target_canonical_slug"]
            if slug in intra_batch_slugs:
                issues_total.append(Issue("error", sid, decision,
                    f"target_canonical_slug {slug!r} appears more than once in this CSV batch"))
                skipped.append((sid, "duplicate slug within batch", name))
                continue
            intra_batch_slugs.add(slug)
        elif decision == "ADD_ALIAS":
            ak = norm.get("_alias_slug", "")
            if ak in intra_batch_aliases:
                issues_total.append(Issue("error", sid, decision,
                    f"alias slug {ak!r} appears more than once in this CSV batch"))
                skipped.append((sid, "duplicate alias slug within batch", name))
                continue
            intra_batch_aliases.add(ak)
        valid_rows.append(norm)

    has_errors = any(i.severity == "error" for i in issues_total)
    apply_mode = args.apply and not has_errors
    applied: dict[str, list[str]] = {"ADD_CANONICAL": [], "ADD_ALIAS": []}
    documentary: dict[str, list[tuple[str, str, str]]] = {
        "PRODUCTIVE_VARIANT": [], "PROVISIONAL": [], "REJECT": [],
    }

    ts = now_iso()
    source_id = f"james-adjudication-{today_str()}"

    if apply_mode:
        try:
            con.execute("BEGIN")
            ensure_source(con, source_id, ts)
            for r in valid_rows:
                d = r["decision"]
                sid = r.get("showmove_id", "")
                name = r.get("fborg_name", "")
                if d == "ADD_CANONICAL":
                    apply_add_canonical(con, r, ts)
                    applied["ADD_CANONICAL"].append(
                        f"{r['target_canonical_slug']} (adds={r['target_canonical_adds']}) ← fborg #{sid} ({name})"
                    )
                elif d == "ADD_ALIAS":
                    apply_add_alias(con, r, ts, source_id)
                    applied["ADD_ALIAS"].append(
                        f"{r['alias_text']!r} → {r['target_canonical_slug']} ({r['alias_type']}) ← fborg #{sid}"
                    )
                elif d in documentary:
                    documentary[d].append((sid, name, r.get("notes", "")))
            con.commit()
        except Exception as e:
            con.rollback()
            print(f"ERROR during apply: {e}", file=sys.stderr)
            return 1
    else:
        # Dry-run: still populate the documentary block for reporting,
        # and the applied-block as a preview of what WOULD happen.
        for r in valid_rows:
            d = r["decision"]
            sid = r.get("showmove_id", "")
            name = r.get("fborg_name", "")
            if d == "ADD_CANONICAL":
                applied["ADD_CANONICAL"].append(
                    f"(would add) {r['target_canonical_slug']} (adds={r['target_canonical_adds']}) ← fborg #{sid} ({name})"
                )
            elif d == "ADD_ALIAS":
                applied["ADD_ALIAS"].append(
                    f"(would add) {r['alias_text']!r} → {r['target_canonical_slug']} ({r['alias_type']}) ← fborg #{sid}"
                )
            elif d in documentary:
                documentary[d].append((sid, name, r.get("notes", "")))

    write_qc_report(qc_path, len(rows), by_decision, issues_total, applied, skipped,
                    documentary, apply_mode)
    con.close()

    print(f"Wrote QC report: {qc_path}")
    print(f"Mode: {'APPLIED' if apply_mode else 'DRY-RUN' + (' (errors blocked apply)' if args.apply and has_errors else '')}")
    print(f"Decisions parsed: {sum(by_decision.values())}")
    print(f"  ADD_CANONICAL:      {by_decision.get('ADD_CANONICAL', 0)}")
    print(f"  ADD_ALIAS:          {by_decision.get('ADD_ALIAS', 0)}")
    print(f"  PRODUCTIVE_VARIANT: {by_decision.get('PRODUCTIVE_VARIANT', 0)}")
    print(f"  PROVISIONAL:        {by_decision.get('PROVISIONAL', 0)}")
    print(f"  REJECT:             {by_decision.get('REJECT', 0)}")
    print(f"Validation: {sum(1 for i in issues_total if i.severity == 'error')} errors, "
          f"{sum(1 for i in issues_total if i.severity == 'warn')} warnings")
    print(f"Skipped rows: {len(skipped)}")
    if has_errors and args.apply:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

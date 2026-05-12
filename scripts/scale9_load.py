#!/usr/bin/env python3
"""SCALE-9 prose load.

Parses SCALE9_PROSE_DRAFTS.md, generates apply CSV + pre-state audit + rollback SQL,
then applies UPDATEs to populate short_description / execution_summary / learning_notes /
prerequisite_notes on the 12 SCALE-9 slugs inside a single transaction.

Per .claude/rules/db-write-safety.md.
"""
import csv
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "database" / "footbag.db"
DRAFTS = ROOT / "exploration" / "freestyle-notation-grammar" / "SCALE9_PROSE_DRAFTS.md"
APPLY_CSV = ROOT / "exploration" / "freestyle-notation-grammar" / "SCALE9_PROSE_APPLY.csv"
REPORTS = ROOT / "legacy_data" / "reports" / "scale9"
AUDIT_PRE = REPORTS / "scale9_load_audit_pre.csv"
ROLLBACK_SQL = REPORTS / "scale9_load_rollback.sql"

SLUGS = [
    "barfly", "superfly", "nemesis", "sumo", "vortex", "whirling-swirl",
    "tapping-whirl", "plasma", "surreal", "illusion", "double-leg-over", "dyno",
]
FIELDS = ["short_description", "execution_summary", "learning_notes", "prerequisite_notes"]


def parse_drafts(text: str) -> dict[str, dict[str, str]]:
    """Parse markdown drafts; return {slug: {field: text}}."""
    rows: dict[str, dict[str, str]] = {}
    # Each row block opens with "## N. slug — N ADD..." and runs to the next "## " heading or "## Cadence" tail.
    # Split using lookahead so we keep the header line.
    blocks = re.split(r"(?=^## \d+\. )", text, flags=re.MULTILINE)
    for block in blocks:
        m = re.match(r"^## \d+\. (\S+) ", block)
        if not m:
            continue
        slug = m.group(1)
        if slug not in SLUGS:
            continue
        rec: dict[str, str] = {}
        for field in FIELDS:
            # Match "**field**\n\n<content>" with content running until the next "**" header or end-of-block.
            pat = rf"\*\*{field}\*\*\n(.+?)(?=\n\*\*(?:short_description|execution_summary|learning_notes|prerequisite_notes|Rationale\.)\*\*|\n## |\n---|\Z)"
            fm = re.search(pat, block, re.DOTALL)
            if not fm:
                raise RuntimeError(f"missing field {field} for slug {slug}")
            content = fm.group(1).strip()
            # em-dash -> --
            content = content.replace("—", "--")
            # collapse multiple blank lines to single \n\n (paragraph break)
            content = re.sub(r"\n{3,}", "\n\n", content)
            rec[field] = content
        rows[slug] = rec
    return rows


def write_apply_csv(rows: dict[str, dict[str, str]]) -> None:
    APPLY_CSV.parent.mkdir(parents=True, exist_ok=True)
    with APPLY_CSV.open("w", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(["slug"] + FIELDS)
        for slug in SLUGS:
            w.writerow([slug] + [rows[slug][field] for field in FIELDS])
    print(f"wrote {APPLY_CSV} ({len(rows)} rows)")


def write_pre_state_audit(conn: sqlite3.Connection) -> dict[str, dict[str, str | None]]:
    REPORTS.mkdir(parents=True, exist_ok=True)
    cur = conn.cursor()
    pre: dict[str, dict[str, str | None]] = {}
    with AUDIT_PRE.open("w", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(["slug"] + FIELDS)
        for slug in SLUGS:
            row = cur.execute(
                "SELECT short_description, execution_summary, learning_notes, prerequisite_notes "
                "FROM freestyle_tricks WHERE slug = ?",
                (slug,),
            ).fetchone()
            if row is None:
                raise RuntimeError(f"slug not found in DB: {slug}")
            pre[slug] = dict(zip(FIELDS, row))
            w.writerow([slug] + ["" if v is None else v for v in row])
    print(f"wrote {AUDIT_PRE}")
    return pre


def write_rollback_sql(pre: dict[str, dict[str, str | None]]) -> None:
    """Rollback restores pre-state. For NULL pre-state, sets columns to NULL."""
    lines = ["-- Rollback SCALE-9 bridge-diversification (12 rows)", "BEGIN TRANSACTION;"]
    for slug in SLUGS:
        parts = []
        for field in FIELDS:
            v = pre[slug][field]
            if v is None:
                parts.append(f"{field}=NULL")
            else:
                escaped = v.replace("'", "''")
                parts.append(f"{field}='{escaped}'")
        lines.append(
            f"UPDATE freestyle_tricks SET {', '.join(parts)} WHERE slug='{slug}';"
        )
    lines.append("COMMIT;")
    ROLLBACK_SQL.write_text("\n".join(lines) + "\n")
    print(f"wrote {ROLLBACK_SQL}")


def apply_updates(conn: sqlite3.Connection, rows: dict[str, dict[str, str]]) -> int:
    cur = conn.cursor()
    cur.execute("BEGIN")
    changed = 0
    for slug in SLUGS:
        rec = rows[slug]
        result = cur.execute(
            """
            UPDATE freestyle_tricks
            SET short_description = ?,
                execution_summary = ?,
                learning_notes    = ?,
                prerequisite_notes = ?
            WHERE slug = ?
            """,
            (rec["short_description"], rec["execution_summary"],
             rec["learning_notes"], rec["prerequisite_notes"], slug),
        )
        if result.rowcount != 1:
            conn.rollback()
            raise RuntimeError(f"UPDATE for slug {slug} affected {result.rowcount} rows (expected 1)")
        changed += 1
    conn.commit()
    return changed


def main() -> int:
    apply = "--apply" in sys.argv
    if not DRAFTS.exists():
        print(f"missing drafts: {DRAFTS}", file=sys.stderr)
        return 2
    rows = parse_drafts(DRAFTS.read_text())
    missing = [s for s in SLUGS if s not in rows]
    if missing:
        print(f"missing slugs in drafts: {missing}", file=sys.stderr)
        return 2
    write_apply_csv(rows)

    conn = sqlite3.connect(DB)
    try:
        pre = write_pre_state_audit(conn)
        write_rollback_sql(pre)
        if not apply:
            print("\nDry-run only (pass --apply to execute UPDATEs).")
            return 0
        n = apply_updates(conn, rows)
        print(f"\nApplied {n} UPDATE statements in single transaction.")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

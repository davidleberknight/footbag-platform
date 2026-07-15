"""
Script 27: Load legacy footbag.org Member Tips into freestyle_trick_tips.

Reads:
  freestyle/inputs/footbag_org_member_tips.ndjson   (committed, already
  sanitized/deduped/empty-dropped by legacy_data/scripts/extract_footbag_org_member_tips.py)

Writes: database/footbag.db
  - freestyle_trick_tips (DELETE + INSERT, scoped to source='footbag_org_moves2')

Maps each legacy trick name to a modern freestyle_tricks slug, alias-aware
(canonical name, slug, aliases_json, and the freestyle_trick_aliases table).
Tips whose legacy trick cannot be mapped are preserved in a review artifact
(freestyle/reports/member_tips_unmatched.json, gitignored) rather than dropped.

display_order is chronological per trick (earliest legacy creation first).

Doctrine: tips are display-only community advice. This loader never touches
descriptions, notation, ADDs, family, parser output, or first-class eligibility.

Idempotent: scoped DELETE + INSERT in a single transaction; safe to re-run.
Must run AFTER the dictionary loaders (17, 19, 20, 21) so all slugs exist.
Run from the repo root:
    python freestyle/loaders/27_load_trick_tips.py [--db <path>]
"""
from __future__ import annotations

import argparse
import json
import re
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
FREESTYLE_ROOT = SCRIPT_DIR.parent
TIPS_NDJSON = FREESTYLE_ROOT / "inputs" / "footbag_org_member_tips.ndjson"
REPORTS_DIR = FREESTYLE_ROOT / "reports"
DEFAULT_DB = FREESTYLE_ROOT.parent / "database" / "footbag.db"
SOURCE = "footbag_org_moves2"


def name_to_slug(name: str) -> str:
    slug = (name or "").lower()
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    return slug.strip("_")


def kebab(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")


# Curator bucket classification for freestyle tips whose legacy name does not
# yet map to a canonical slug. These two small sets are curator judgments from
# the recovery audit, NOT data and NOT trick mappings: they only route a tip
# into a more specific review bucket. Net tips are detected from move_type.
# Keyed by lowercased legacy trick name.
FRONTIER_UNRESOLVED = {
    "pogo op whirling swirl",   # blocked on the pogo operator (inactive / doctrine-deferred)
}
AMBIGUOUS_UNRESOLVED = {
    "atomic double over down",  # a canonical ('fusion') may exist but is unconfirmed; do not guess
}


def classify(tip: dict, idx: dict[str, str]) -> tuple[str, str]:
    """Return (status, trick_slug) for a tip.

    published          -> canonical slug (rendered publicly)
    future_net         -> 'unresolved:net:<name>'  (net technique, preserved for future net pages)
    unresolved_frontier-> 'unresolved:<name>'      (blocked on a deferred operator/doctrine)
    unresolved_ambiguous-> 'unresolved:<name>'     (a plausible canonical exists but unconfirmed)
    unresolved_freestyle-> 'unresolved:<name>'     (real freestyle trick simply not authored yet)
    """
    name = tip.get("legacy_trick_name", "")
    slug = idx.get(name_to_slug(name))
    if slug:
        return ("published", slug)
    if tip.get("move_type") == "n":
        return ("future_net", "unresolved:net:" + kebab(name))
    key = name.lower().strip()
    if key in FRONTIER_UNRESOLVED:
        return ("unresolved_frontier", "unresolved:" + kebab(name))
    if key in AMBIGUOUS_UNRESOLVED:
        return ("unresolved_ambiguous", "unresolved:" + kebab(name))
    return ("unresolved_freestyle", "unresolved:" + kebab(name))


def build_slug_index(conn: sqlite3.Connection) -> dict[str, str]:
    """normalized name/alias -> canonical slug, alias-aware, active tricks only.

    Only active tricks (and aliases pointing at active tricks) are indexed, so a
    tip whose only match is a retired trick resolves through the surviving
    trick's alias, or falls to the unresolved: convention, instead of landing on
    a slug hidden from every public surface.
    """
    idx: dict[str, str] = {}
    for slug, name, aliases_json in conn.execute(
        "SELECT slug, canonical_name, aliases_json FROM freestyle_tricks WHERE is_active = 1"
    ):
        idx.setdefault(name_to_slug(slug), slug)
        idx.setdefault(name_to_slug(name), slug)
        if aliases_json:
            try:
                for a in json.loads(aliases_json):
                    key = name_to_slug(a if isinstance(a, str) else a.get("alias", ""))
                    if key:
                        idx.setdefault(key, slug)
            except (json.JSONDecodeError, AttributeError):
                pass
    # the dedicated alias table (covers aliases not mirrored into aliases_json)
    try:
        for alias_slug, trick_slug in conn.execute(
            "SELECT a.alias_slug, a.trick_slug FROM freestyle_trick_aliases a "
            "JOIN freestyle_tricks t ON t.slug = a.trick_slug WHERE t.is_active = 1"
        ):
            if alias_slug:
                idx.setdefault(name_to_slug(alias_slug), trick_slug)
    except sqlite3.OperationalError:
        pass
    return idx


def main() -> None:
    ap = argparse.ArgumentParser(description="Load legacy footbag.org Member Tips.")
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    ap.add_argument("--tips", type=Path, default=TIPS_NDJSON)
    ap.add_argument("--review-out", type=Path, default=REPORTS_DIR / "member_tips_unmatched.json",
                    help="Where to write the unmatched-tips review artifact (gitignored by default).")
    args = ap.parse_args()

    if not args.db.exists():
        raise SystemExit(f"ERROR: database not found: {args.db}")
    if not args.tips.exists():
        raise SystemExit(
            f"ERROR: tips artifact not found: {args.tips}\n"
            "Run legacy_data/scripts/extract_footbag_org_member_tips.py first."
        )

    tips = [json.loads(line) for line in args.tips.read_text(encoding="utf-8").splitlines() if line.strip()]

    # Open through the shared guard so a direct run refuses a post-cutover database.
    import os.path as _p
    import sys as _s
    _s.path.insert(0, _p.join(_p.dirname(_p.abspath(__file__)), "..", "..", "scripts"))
    from _freestyle_db import open_freestyle_db
    conn = open_freestyle_db(str(args.db))
    conn.execute("PRAGMA foreign_keys = ON")
    idx = build_slug_index(conn)

    # Classify every tip into a bucket. All buckets are PRESERVED in the table
    # (no tip is discarded); only status='published' rows reach public pages.
    classified: list[dict] = []
    for t in tips:
        status, slug = classify(t, idx)
        classified.append({**t, "trick_slug": slug, "status": status})

    # display_order: per slug, earliest legacy creation first
    by_slug: dict[str, list[dict]] = defaultdict(list)
    for r in classified:
        by_slug[r["trick_slug"]].append(r)
    loaded_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    insert_rows: list[tuple] = []
    for slug, rows in by_slug.items():
        rows.sort(key=lambda r: (r.get("created_at_legacy") or 0, r["legacy_hint_id"]))
        for order, r in enumerate(rows):
            insert_rows.append((
                slug, r["legacy_hint_id"], r["legacy_move_id"], r["tip_text"],
                r.get("created_at_legacy"), r.get("modified_at_legacy"),
                order, r["status"], SOURCE, loaded_at,
            ))

    with conn:
        conn.execute("DELETE FROM freestyle_trick_tips WHERE source = ?", (SOURCE,))
        conn.executemany(
            """
            INSERT INTO freestyle_trick_tips
              (trick_slug, legacy_hint_id, legacy_move_id, tip_text,
               created_at_legacy, modified_at_legacy, display_order, status,
               source, loaded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            insert_rows,
        )

    # counts per bucket
    buckets = ["published", "unresolved_freestyle", "unresolved_frontier",
               "unresolved_ambiguous", "future_net"]
    by_status: dict[str, list[dict]] = defaultdict(list)
    for r in classified:
        by_status[r["status"]].append(r)
    counts = {b: len(by_status.get(b, [])) for b in buckets}
    published_slugs = {r["trick_slug"] for r in by_status.get("published", [])}

    # Review artifact: every non-published tip, grouped by bucket then slug, so a
    # future curator can remap an unresolved slug to a canonical trick (or stand
    # up the net pages) without re-running discovery. reports/ is gitignored.
    def group(bucket: str) -> dict[str, list[dict]]:
        out: dict[str, list[dict]] = defaultdict(list)
        for r in by_status.get(bucket, []):
            out[r["trick_slug"]].append({
                "legacy_hint_id": r["legacy_hint_id"],
                "legacy_move_id": r["legacy_move_id"],
                "legacy_trick_name": r.get("legacy_trick_name", ""),
                "tip_text": r["tip_text"],
            })
        return out

    review_path = args.review_out
    review_path.parent.mkdir(parents=True, exist_ok=True)
    review_path.write_text(json.dumps({
        "summary": counts,
        "note": "Non-published tips are preserved here and in freestyle_trick_tips "
                "(status-gated, no public render). Remap an unresolved slug to a "
                "canonical trick once authored; stand up net pages for future_net.",
        "unresolved_freestyle": group("unresolved_freestyle"),
        "unresolved_frontier": group("unresolved_frontier"),
        "unresolved_ambiguous": group("unresolved_ambiguous"),
        "future_net_content": group("future_net"),
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    conn.close()

    print("── Member Tips load ────────────────────────────────────")
    print(f"  total tips (artifact)        : {len(tips)}")
    print(f"  active imported (published)  : {counts['published']}  ({len(published_slugs)} tricks)")
    print(f"  unresolved freestyle         : {counts['unresolved_freestyle']}")
    print(f"  unresolved frontier          : {counts['unresolved_frontier']}")
    print(f"  unresolved ambiguous         : {counts['unresolved_ambiguous']}")
    print(f"  future net (excluded)        : {counts['future_net']}")
    print(f"  (empty/duplicate tips were dropped at extraction time)")
    print(f"  review artifact              : {review_path}")
    print("────────────────────────────────────────────────────────")


if __name__ == "__main__":
    main()

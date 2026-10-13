#!/usr/bin/env python3
"""Extract legacy footbag.org "Member Tips" into a committed normalized artifact.

Reads the moves2 tables of the vetted legacy export in the private checkout,
which the legacy refresh writes, and emits a clean NDJSON snapshot under
freestyle/inputs/ that the freestyle rebuild loads. It is NOT part of the
rebuild (which never reads outside freestyle/inputs/); rerun it explicitly after
a refresh changes the moves2 tables, the same way the footbag.org move scraper
is an explicit --live step.

Source table: moves2.movehints (community technique advice per move).
  HintID, MoveID, MemberID, HintTitle, HintText, HintCreated, HintModified, HintPriority
Joined to moves2.moves for the legacy move name (slug mapping happens later, in
the loader, against the live dictionary so it stays alias-aware).

Normalization applied here so the committed artifact is clean:
  - drop empty tips (no text after sanitize)
  - dedupe exact-duplicate text within a single move (keep the earliest)
  - sanitize legacy HTML (br/p to newlines, strip remaining tags, unescape)
  - normalize line breaks and whitespace
  - discard HintTitle (an auto-truncated preview, not a real title)
  - author member names are intentionally NOT carried (v1 stores no public names)

Output row: {legacy_hint_id, legacy_move_id, legacy_trick_name, move_type,
             tip_text, created_at_legacy, modified_at_legacy}
(move_type 'f'=freestyle, 'n'=net; the loader buckets net tips separately.)
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import re
from pathlib import Path

# The moves2 folder of the vetted export, reached through the private checkout's
# symlink at the repo root.
DEFAULT_SOURCE = (
    Path(__file__).resolve().parents[2]
    / "footbag_private_repo" / "legacy-export" / "moves2"
)
DEFAULT_OUT = (
    Path(__file__).resolve().parents[2]
    / "freestyle"
    / "inputs"
    / "footbag_org_member_tips.ndjson"
)


def read_table(source: Path, name: str) -> list[dict]:
    """Rows of one export CSV as dicts keyed by column name. A SQL NULL arrives
    as an empty field."""
    path = source / name
    if not path.is_file():
        raise SystemExit(
            f"ERROR: {path} not found. Run legacy_data/scripts/refresh_legacy_repo_data.py "
            "to write the legacy export into the private checkout, then re-run.")
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


_TAG_RE = re.compile(r"<[^>]+>")
_BR_RE = re.compile(r"<\s*br\s*/?\s*>", re.IGNORECASE)
_BLOCK_RE = re.compile(r"<\s*/?\s*(p|div|li|ul|ol)\b[^>]*>", re.IGNORECASE)
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def sanitize(text: str) -> str:
    """Strip legacy HTML to plain text; normalize line breaks and whitespace.
    Redacts email addresses: tip text flows verbatim into a committed public
    artifact and onward to the public trick page, and no contact field may
    reach a public surface."""
    if not text:
        return ""
    t = _BR_RE.sub("\n", text)
    t = _BLOCK_RE.sub("\n", t)
    t = _TAG_RE.sub("", t)          # drop any remaining tags
    t = html.unescape(t)
    # after unescape, so entity-encoded addresses are caught too
    t = _EMAIL_RE.sub("[email removed]", t)
    t = t.replace("\r\n", "\n").replace("\r", "\n")
    # collapse runs of spaces/tabs; trim each line; cap blank-line runs at one
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in t.split("\n")]
    out_lines: list[str] = []
    blank = False
    for ln in lines:
        if ln == "":
            if not blank and out_lines:
                out_lines.append("")
            blank = True
        else:
            out_lines.append(ln)
            blank = False
    return "\n".join(out_lines).strip()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE,
                    help="The moves2 folder of the vetted legacy export, holding "
                         "moves.csv and movehints.csv.")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT,
                    help="Committed NDJSON artifact to write.")
    args = ap.parse_args()

    # MoveType is 'f' freestyle or 'n' net; a move without one counts as freestyle.
    move_name: dict[int, str] = {}
    move_type: dict[int, str] = {}
    for row in read_table(args.source, "moves.csv"):
        try:
            mid = int(row["MoveID"])
        except ValueError:
            continue
        move_name[mid] = row["Name"]
        if row.get("MoveType"):
            move_type[mid] = row["MoveType"]

    # Curated corrections for known-stale legacy `moves.Name` values. Move 209's
    # Name is "Clipper", but the move is Spinning Clipper (its tips page heading
    # reads "Tips for Spinning Clipper"); left as-is the tip collides onto the
    # bare "clipper" kick. The stable legacy move ID is authoritative here.
    CURATED_MOVE_NAME_OVERRIDES = {209: "Spinning Clipper"}
    move_name.update(CURATED_MOVE_NAME_OVERRIDES)

    total = 0
    dropped_empty = 0
    dropped_duplicate = 0
    seen_per_move: dict[int, set[str]] = {}
    out_rows: list[dict] = []
    for row in read_table(args.source, "movehints.csv"):
        total += 1
        hint_id = int(row["HintID"])
        move_id = int(row["MoveID"])
        text = sanitize(row["HintText"])
        if not text:
            dropped_empty += 1
            continue
        key = re.sub(r"\s+", " ", text.lower()).strip()
        bucket = seen_per_move.setdefault(move_id, set())
        if key in bucket:
            dropped_duplicate += 1
            continue
        bucket.add(key)
        out_rows.append({
            "legacy_hint_id": hint_id,
            "legacy_move_id": move_id,
            "legacy_trick_name": move_name.get(move_id, ""),
            "move_type": move_type.get(move_id, "f"),  # 'f' freestyle | 'n' net
            "tip_text": text,
            "created_at_legacy": int(row["HintCreated"] or 0) or None,
            "modified_at_legacy": int(row["HintModified"] or 0) or None,
        })

    # stable order: by move, then earliest creation, then hint id
    out_rows.sort(key=lambda r: (r["legacy_move_id"],
                                 r["created_at_legacy"] or 0,
                                 r["legacy_hint_id"]))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as fh:
        for r in out_rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    distinct_moves = len({r["legacy_move_id"] for r in out_rows})
    named = sum(1 for r in out_rows if r["legacy_trick_name"])
    print("── Member Tips extraction ──────────────────────────────")
    print(f"  source                : {args.source}")
    print(f"  movehints rows read   : {total}")
    print(f"  dropped (empty)       : {dropped_empty}")
    print(f"  dropped (duplicate)   : {dropped_duplicate}")
    print(f"  tips written          : {len(out_rows)}")
    print(f"  distinct legacy moves : {distinct_moves}")
    print(f"  rows w/ legacy name   : {named}/{len(out_rows)}")
    print(f"  output                : {args.out}")
    print("────────────────────────────────────────────────────────")


if __name__ == "__main__":
    main()

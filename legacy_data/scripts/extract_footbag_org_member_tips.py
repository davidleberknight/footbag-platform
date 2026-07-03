#!/usr/bin/env python3
"""Extract legacy footbag.org "Member Tips" into a committed normalized artifact.

One-time provenance tool. Reads the legacy moves2 SQL dump from the Steve
Goldberg clone (outside this repo) and emits a clean NDJSON snapshot under
freestyle/inputs/ that the freestyle rebuild loads. It is NOT part of the
rebuild (which never reads outside freestyle/inputs/); rerun it explicitly when
the legacy source changes, the same way the footbag.org move scraper is an
explicit --live step.

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
import html
import json
import os
import re
from pathlib import Path

# The dump root is operator-supplied, never a committed machine path: the
# FOOTBAG_LEGACY_DUMP_ROOT environment variable, else the git-ignored
# footbag.org symlink at the repo root.
_DUMP_ROOT = Path(
    os.environ.get("FOOTBAG_LEGACY_DUMP_ROOT")
    or Path(__file__).resolve().parents[2] / "footbag.org"
)
DEFAULT_SOURCE = _DUMP_ROOT / "moves2" / "backups" / "latest.sql"
DEFAULT_OUT = (
    Path(__file__).resolve().parents[2]
    / "freestyle"
    / "inputs"
    / "footbag_org_member_tips.ndjson"
)


def parse_value_tuples(sql_text: str, table: str) -> list[list[str]]:
    """Return raw field lists for every row of `INSERT INTO `table` VALUES (...)`.

    Respects single-quoted strings and backslash escapes used by mysqldump.
    """
    rows: list[list[str]] = []
    for m in re.finditer(r"INSERT INTO `%s` VALUES " % re.escape(table), sql_text):
        i = m.end()
        depth = 0
        in_quote = False
        escaped = False
        start = None
        while i < len(sql_text):
            ch = sql_text[i]
            if escaped:
                escaped = False
                i += 1
                continue
            if ch == "\\" and in_quote:
                escaped = True
                i += 1
                continue
            if ch == "'":
                in_quote = not in_quote
            if not in_quote:
                if ch == "(":
                    if depth == 0:
                        start = i + 1
                    depth += 1
                elif ch == ")":
                    depth -= 1
                    if depth == 0 and start is not None:
                        rows.append(_split_fields(sql_text[start:i]))
                elif ch == ";" and depth == 0:
                    break
            i += 1
    return rows


def _split_fields(tuple_body: str) -> list[str]:
    out: list[str] = []
    cur: list[str] = []
    in_quote = False
    escaped = False
    for ch in tuple_body:
        if escaped:
            cur.append(ch)
            escaped = False
            continue
        if ch == "\\" and in_quote:
            escaped = True
            cur.append(ch)
            continue
        if ch == "'":
            in_quote = not in_quote
            cur.append(ch)
            continue
        if ch == "," and not in_quote:
            out.append("".join(cur))
            cur = []
            continue
        cur.append(ch)
    out.append("".join(cur))
    return out


def unquote(v: str) -> str:
    v = v.strip()
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1]
        v = (
            v.replace("\\'", "'")
            .replace('\\"', '"')
            .replace("\\n", "\n")
            .replace("\\r", "\r")
            .replace("\\t", "\t")
            .replace("\\\\", "\\")
        )
    return v


_TAG_RE = re.compile(r"<[^>]+>")
_BR_RE = re.compile(r"<\s*br\s*/?\s*>", re.IGNORECASE)
_BLOCK_RE = re.compile(r"<\s*/?\s*(p|div|li|ul|ol)\b[^>]*>", re.IGNORECASE)


def sanitize(text: str) -> str:
    """Strip legacy HTML to plain text; normalize line breaks and whitespace."""
    if not text:
        return ""
    t = _BR_RE.sub("\n", text)
    t = _BLOCK_RE.sub("\n", t)
    t = _TAG_RE.sub("", t)          # drop any remaining tags
    t = html.unescape(t)
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
                    help="Path to the legacy moves2 SQL dump (clone).")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT,
                    help="Committed NDJSON artifact to write.")
    args = ap.parse_args()

    if not args.source.exists():
        raise SystemExit(f"ERROR: legacy source not found: {args.source}")

    raw = args.source.read_bytes().decode("latin-1")

    # moves: MoveID(0), Name(2), MoveType(16) — 'f' freestyle, 'n' net
    move_name: dict[int, str] = {}
    move_type: dict[int, str] = {}
    for f in parse_value_tuples(raw, "moves"):
        if len(f) > 2:
            try:
                mid = int(unquote(f[0]))
            except ValueError:
                continue
            move_name[mid] = unquote(f[2])
            if len(f) > 16:
                move_type[mid] = unquote(f[16])

    # movehints: HintID(0) MoveID(1) MemberID(2) HintTitle(3) HintText(4)
    #            HintCreated(5) HintModified(6) HintPriority(7)
    total = 0
    dropped_empty = 0
    dropped_duplicate = 0
    seen_per_move: dict[int, set[str]] = {}
    out_rows: list[dict] = []
    for f in parse_value_tuples(raw, "movehints"):
        if len(f) < 8:
            continue
        total += 1
        hint_id = int(unquote(f[0]))
        move_id = int(unquote(f[1]))
        text = sanitize(unquote(f[4]))
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
            "created_at_legacy": int(unquote(f[5]) or 0) or None,
            "modified_at_legacy": int(unquote(f[6]) or 0) or None,
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

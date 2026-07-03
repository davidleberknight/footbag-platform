#!/usr/bin/env python3
"""Extract legacy footbag.org `moves` metadata into a committed artifact.

One-time provenance/preservation tool (sibling to the Member Tips extractor).
Reads the legacy moves2 SQL dump from the Steve Goldberg clone (outside this
repo) and emits a clean NDJSON snapshot of the `moves` table under
freestyle/inputs/ so the recoverable freestyle metadata is no longer
clone-dependent. NOT part of the rebuild; rerun explicitly when the source
changes (same posture as the --live move scraper).

Why this exists: the committed footbag.org move snapshot (the scraper output)
carries only name/ADD/notation/description-fragments. The legacy `moves` table
additionally holds pronunciation, folk nicknames, per-trick world records (and
holder), demonstration-clip references, and fuller human descriptions. Those are
the inputs to the deferred recovery work (pronunciation, description
reconciliation, alias cross-check, records). They are public freestyle reference
data, not member PII, so they are committed (unlike the gitignored
legacy_archive/parsed/ NDJSON). Author member ids are NOT carried.

Source table moves2.moves (col indexes):
  MoveID(0) OldMoveID(1) Name(2) Modifier(3) NickName(4) Pronunciation(5)
  Family(6) AddCount(7) BOA(8) Notation(9) Description(10) IsFundamental(11)
  Video(12) Priority(13) Modified(14) Created(15) MoveType(16) MoveRecord(17)
  MoveRecordHolderID(18) MoveRecordHolderName(19)
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
    / "freestyle" / "inputs" / "footbag_org_moves_metadata.ndjson"
)

_TAG = re.compile(r"<[^>]+>")
_BR = re.compile(r"<\s*br\s*/?\s*>", re.IGNORECASE)
_BLOCK = re.compile(r"<\s*/?\s*(p|div|li|ul|ol)\b[^>]*>", re.IGNORECASE)


def parse_value_tuples(text: str, table: str) -> list[list[str]]:
    rows: list[list[str]] = []
    for m in re.finditer(r"INSERT INTO `%s` VALUES " % re.escape(table), text):
        i = m.end(); depth = 0; inq = False; esc = False; start = None
        while i < len(text):
            c = text[i]
            if esc: esc = False; i += 1; continue
            if c == "\\" and inq: esc = True; i += 1; continue
            if c == "'": inq = not inq
            if not inq:
                if c == "(":
                    if depth == 0: start = i + 1
                    depth += 1
                elif c == ")":
                    depth -= 1
                    if depth == 0 and start is not None:
                        rows.append(_split(text[start:i]))
                elif c == ";" and depth == 0:
                    break
            i += 1
    return rows


def _split(body: str) -> list[str]:
    out: list[str] = []; cur: list[str] = []; inq = False; esc = False
    for c in body:
        if esc: cur.append(c); esc = False; continue
        if c == "\\" and inq: esc = True; cur.append(c); continue
        if c == "'": inq = not inq; cur.append(c); continue
        if c == "," and not inq: out.append("".join(cur)); cur = []; continue
        cur.append(c)
    out.append("".join(cur)); return out


def unquote(v: str) -> str:
    v = v.strip()
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1].replace("\\'", "'").replace('\\"', '"').replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t").replace("\\\\", "\\")
    return v


def clean(text: str) -> str:
    if not text:
        return ""
    t = _BR.sub("\n", text)
    t = _BLOCK.sub("\n", t)
    t = _TAG.sub("", t)
    t = html.unescape(t).replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in t.split("\n")]
    out: list[str] = []; blank = False
    for ln in lines:
        if ln == "":
            if not blank and out: out.append("")
            blank = True
        else:
            out.append(ln); blank = False
    return "\n".join(out).strip()


def ival(v: str) -> int | None:
    v = unquote(v).strip()
    try:
        return int(v) if v not in ("", "NULL") else None
    except ValueError:
        return None


def sval(v: str) -> str:
    return clean(unquote(v))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    if not args.source.exists():
        raise SystemExit(f"ERROR: legacy source not found: {args.source}")

    raw = args.source.read_bytes().decode("latin-1")
    rows = [r for r in parse_value_tuples(raw, "moves") if len(r) >= 20]

    out_rows: list[dict] = []
    for f in rows:
        out_rows.append({
            "legacy_move_id": ival(f[0]),
            "name": sval(f[2]),
            "modifier": sval(f[3]),
            "nickname": sval(f[4]),
            "pronunciation": sval(f[5]),
            "family": sval(f[6]),
            "add_count": ival(f[7]),
            "boa": sval(f[8]),
            "notation": sval(f[9]),
            "description": sval(f[10]),
            "is_fundamental": 1 if ival(f[11]) else 0,
            "video": sval(f[12]),
            "move_type": sval(f[16]) or "f",
            "move_record": ival(f[17]),
            "move_record_holder_name": sval(f[19]),
            # author/holder member ids intentionally NOT carried
        })
    out_rows.sort(key=lambda r: r["legacy_move_id"] or 0)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as fh:
        for r in out_rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    def nz(field: str) -> int:
        return sum(1 for r in out_rows if r[field] not in ("", 0, None))

    print("── moves metadata extraction ───────────────────────────")
    print(f"  source                : {args.source}")
    print(f"  moves rows            : {len(out_rows)}")
    print(f"  with pronunciation    : {nz('pronunciation')}")
    print(f"  with nickname         : {nz('nickname')}")
    print(f"  with description      : {nz('description')}")
    print(f"  with notation         : {nz('notation')}")
    print(f"  with video ref        : {nz('video')}")
    print(f"  with per-trick record : {nz('move_record')}")
    print(f"  move_type=n (net)     : {sum(1 for r in out_rows if r['move_type'] == 'n')}")
    print(f"  output                : {args.out}")
    print("────────────────────────────────────────────────────────")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Atlas research (read-only): historical Sick 3 corpus extraction.

Scans the footbag.org mirror event pages (and reports coverage limits) for
three-trick Sick 3 sequences. Preserves every raw source record; canonical
resolution is recorded alongside, never in place of, the raw names.
Research-only; writes only to ./out/.
"""
import csv
import html
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).parent
REPO = HERE.parents[1]
DB = REPO / "database" / "footbag.db"
MIRROR = REPO / "legacy_data" / "mirror_footbag_org" / "www.footbag.org" / "events" / "show"
EVENTS_CSV = REPO / "legacy_data" / "event_results" / "canonical_input" / "events.csv"
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)

TAG_RE = re.compile(r"<[^>]+>")
# A trick token: capitalized word-ish run (allows digits, apostrophes, hyphens, inner spaces).
TRICK = r"[A-Z][A-Za-z0-9'/-]*(?:[ .][A-Z0-9][A-Za-z0-9'/-]*)*"
SEQ_GT = re.compile(rf"({TRICK})\s*>\s*({TRICK})\s*>\s*({TRICK})")
SEQ_COMMA = re.compile(rf"({TRICK})\s*,\s*({TRICK})\s*,\s*(?:and\s+)?({TRICK})")
TOTAL_RE = re.compile(r"[=(]\s*(\d{1,2})\s*(?:ADD|add|Add|pts?|points?)?\s*\)?")
PLACE_RE = re.compile(r"\b(1st|2nd|3rd|4th|5th|first|second|third)\b[:.)]?", re.I)
NAME_BEFORE = re.compile(r"([A-Z][a-z]+(?: [A-Z][a-zA-Z'\-]+)+)\s*[:(\-]?\s*$")

STOPWORDS = {
    # Words that start false "trick" captures in prose.
    "The", "And", "For", "With", "All", "Results", "Contest", "Sick", "Open",
    "Intermediate", "Women", "Men", "Finals", "Prelims", "Saturday", "Sunday",
}
# Event-format vocabulary: a captured token containing any of these is a
# schedule/format list entry (e.g. "Sick3 > Shred30 > Circle Contest"), not a trick.
FORMAT_WORDS = re.compile(
    r"\b(contest|shred ?30|shred30|sick ?\d|routines?|circle|request|freestyle|"
    r"foursquare|four square|net|golf|guts|distance|big \d|last man|standing|"
    r"consecutive|doubles|singles|workshop|clinic)\b", re.I)


def page_text(p: Path) -> str:
    raw = p.read_text(encoding="utf-8", errors="replace")
    txt = html.unescape(raw)
    txt = re.sub(r"<br\s*/?>", "\n", txt, flags=re.I)
    txt = re.sub(r"</(p|div|li|tr|h\d)>", "\n", txt, flags=re.I)
    txt = TAG_RE.sub(" ", txt)
    txt = re.sub(r"[ \t]+", " ", txt)
    return txt


def sick_blocks(txt: str):
    """Lines within a window after any 'sick' mention (results blobs are line-oriented)."""
    lines = txt.split("\n")
    hits = [i for i, ln in enumerate(lines) if re.search(r"\bsick[- ]?\d?\b", ln, re.I)]
    keep = set()
    for i in hits:
        for j in range(max(0, i - 1), min(len(lines), i + 15)):
            keep.add(j)
    return [(i, lines[i].strip()) for i in sorted(keep) if lines[i].strip()]


def plausible(t: str) -> bool:
    w = t.split()
    if not w or w[0] in STOPWORDS or len(t) > 40:
        return False
    if FORMAT_WORDS.search(t):
        return False
    return not t.isupper() or len(w) <= 3


def load_resolver(con):
    canon, compact = {}, {}
    for r in con.execute("SELECT slug, canonical_name, adds FROM freestyle_tricks WHERE is_active=1"):
        canon[norm(r[1])] = (r[0], r[2])
        canon.setdefault(norm(r[0]), (r[0], r[2]))
        compact.setdefault(norm(r[1]).replace(" ", ""), (r[0], r[2]))
    alias = {}
    for r in con.execute(
        """SELECT a.alias_text, a.trick_slug, t.adds FROM freestyle_trick_aliases a
             JOIN freestyle_tricks t ON t.slug = a.trick_slug AND t.is_active=1"""
    ):
        alias.setdefault(norm(r[0]), (r[1], r[2]))
        compact.setdefault(norm(r[0]).replace(" ", ""), (r[1], r[2]))
    return canon, alias, compact


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def resolve(raw: str, canon, alias, compact):
    k = norm(raw)
    if k in canon:
        return canon[k][0], canon[k][1], "canonical"
    if k in alias:
        return alias[k][0], alias[k][1], "alias"
    # light heuristics: PS -> paradox symposium; run-together spellings
    k2 = re.sub(r"^(ps) ", "paradox symposium ", k)
    if k2 in canon:
        return canon[k2][0], canon[k2][1], "canonical-expanded"
    if k2 in alias:
        return alias[k2][0], alias[k2][1], "alias-expanded"
    kc = k.replace(" ", "")
    if kc in compact:
        return compact[kc][0], compact[kc][1], "compact"
    return "", "", "unresolved"


def main() -> int:
    if not MIRROR.exists():
        print("mirror absent; cannot extract", file=sys.stderr)
        return 1
    # legacy event id -> (event_key, year, title)
    events = {}
    with EVENTS_CSV.open(encoding="utf-8") as f:
        for row in csv.reader(f):
            if len(row) > 3 and row[1].isdigit():
                events[row[1]] = (row[0], row[2], row[3])

    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    canon, alias, compact = load_resolver(con)

    records = []
    pages_scanned = 0
    pages_with_seq = set()
    for page in sorted(MIRROR.glob("*/index.html")):
        legacy_id = page.parent.name
        txt = page_text(page)
        if not re.search(r"\bsick", txt, re.I):
            continue
        pages_scanned += 1
        for lineno, line in sick_blocks(txt):
            for pat, sep in ((SEQ_GT, ">"), (SEQ_COMMA, ",")):
                for m in pat.finditer(line):
                    t1, t2, t3 = (m.group(1).strip(), m.group(2).strip(), m.group(3).strip())
                    if not (plausible(t1) and plausible(t2) and plausible(t3)):
                        continue
                    # player: nearest capitalized full name before the match on this line
                    pre = line[: m.start()]
                    nm = NAME_BEFORE.search(pre.strip())
                    player = nm.group(1) if nm else ""
                    place = ""
                    pm = PLACE_RE.search(pre)
                    if pm:
                        place = pm.group(1)
                    post = line[m.end(): m.end() + 24]
                    tot = TOTAL_RE.search(post)
                    ev = events.get(legacy_id, ("", "", ""))
                    rec = {
                        "source_id": f"mirror:events/show/{legacy_id}",
                        "event_key": ev[0], "event_year": ev[1], "event_title": ev[2],
                        "page_line": lineno, "separator": sep,
                        "player": player, "placement": place,
                        "raw_trick_1": t1, "raw_trick_2": t2, "raw_trick_3": t3,
                        "raw_total": tot.group(1) if tot else "",
                        "source_line": line[:300],
                    }
                    for n in (1, 2, 3):
                        slug, add, conf = resolve(rec[f"raw_trick_{n}"], canon, alias, compact)
                        rec[f"canon_{n}"] = slug
                        rec[f"canon_{n}_add"] = add
                        rec[f"conf_{n}"] = conf
                    adds = [rec[f"canon_{n}_add"] for n in (1, 2, 3)]
                    rec["current_total_add"] = (
                        sum(int(a) for a in adds) if all(str(a).isdigit() for a in adds) else ""
                    )
                    rec["resolution"] = (
                        "full" if all(rec[f"conf_{n}"] != "unresolved" for n in (1, 2, 3))
                        else "partial" if any(rec[f"conf_{n}"] != "unresolved" for n in (1, 2, 3))
                        else "none"
                    )
                    records.append(rec)
                    pages_with_seq.add(legacy_id)

    cat_path = OUT / "sick3_source_catalog.csv"
    if records:
        with cat_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(records[0].keys()))
            w.writeheader()
            w.writerows(records)

    # Normalized unique sequences (keyed by resolved slugs when full, else raw-norm).
    seqs = defaultdict(list)
    for r in records:
        key = (
            (r["canon_1"], r["canon_2"], r["canon_3"]) if r["resolution"] == "full"
            else (norm(r["raw_trick_1"]), norm(r["raw_trick_2"]), norm(r["raw_trick_3"]))
        )
        seqs[(r["resolution"] == "full", key)].append(r)
    seq_rows = []
    for (is_full, key), rs in sorted(seqs.items(), key=lambda kv: -len(kv[1])):
        seq_rows.append({
            "resolved": "yes" if is_full else "no",
            "t1": key[0], "t2": key[1], "t3": key[2],
            "occurrences": len(rs),
            "players": "|".join(sorted({r["player"] for r in rs if r["player"]})),
            "events": "|".join(sorted({r["event_key"] or r["source_id"] for r in rs})),
            "current_total_add": rs[0]["current_total_add"],
            "raw_examples": " // ".join(sorted({f"{r['raw_trick_1']}>{r['raw_trick_2']}>{r['raw_trick_3']}" for r in rs})[:2]),
        })
    with (OUT / "sick3_sequences.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(seq_rows[0].keys()) if seq_rows else ["none"])
        w.writeheader()
        w.writerows(seq_rows)

    res = Counter(r["resolution"] for r in records)
    print(f"pages mentioning sick: {pages_scanned}; pages yielding sequences: {len(pages_with_seq)}")
    print(f"raw source records: {len(records)}; unique normalized sequences: {len(seq_rows)}")
    print(f"resolution: {dict(res)}")
    uniq_full = sum(1 for s in seq_rows if s["resolved"] == "yes")
    print(f"fully-resolved unique sequences: {uniq_full}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

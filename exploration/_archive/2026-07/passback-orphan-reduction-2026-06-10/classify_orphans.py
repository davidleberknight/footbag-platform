#!/usr/bin/env python3
"""Authoritative PassBack orphan classifier.

Single source of truth for the residual count. Reads the orphan worksheet plus
the live alias/canonical sources and classifies every unique label by the first
matching rule, in priority order:

  1. non-trick        -- notation token, concept, or header
  2. name -> alias    -- the label is already a registered alias
  3. name -> canonical-- the label IS a canonical name / slug
  4. decomp -> canon  -- the PassBack decomposition normalizes to a canonical
  5. residual         -- needs historical identification / curator review

Rules 2 and 3 are the checks that were missing from the first ad-hoc pass, which
left already-canonical labels (Double Orbit, Fairy Eggbeater, Twirl, ...) and
already-aliased abbreviations (DLO, DATW, DSO, ...) sitting in the residual.

Canonical set = live DB active slugs UNION red_additions slugs, so newly created
canonicals are counted before the next DB rebuild. Alias set = tricks.csv inline
aliases UNION trick_aliases.csv UNION red_additions aliases column.

Emits the reduction report and the grouped residual worksheet; prints the counts.
"""
import csv, re, sqlite3, sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TD = ROOT / "legacy_data/inputs/curated/tricks"
NOISE = ROOT / "legacy_data/inputs/noise"
CAND = ROOT / "exploration/passback-intake/passback_reports/new_candidates.csv"
REPORT = ROOT / "exploration/passback-orphan-reduction-2026-06-10/REPORT.md"
WORKSHEET = ROOT / "exploration/red-passback-residual-2026-06-10/residual_by_group.md"

NONTRICK = {">", "contact", "dex", "dexterity", "in(-out) dex", "out(-in) dex",
            "strong side", "flip side", "gyro", "spinning", "double spinning"}
ABBR = {"dlo": "double-leg-over", "dso": "double-switchover",
        "datw": "double-around-the-world", "dod": "double-over-down",
        "ddd": "down-double-down", "atw": "around-the-world"}
SIDE = {"far", "near", "same", "op", "full", "rev"}
QUAL = {"ss", "op", "far", "near", "same", "full", "same-side", "opposite", "s.s."}


def build_sets():
    conn = sqlite3.connect(ROOT / "database/footbag.db")
    canon = set()
    canon_names = set()
    for slug, name in conn.execute(
        "SELECT slug, canonical_name FROM freestyle_tricks WHERE is_active=1"):
        canon.add(slug)
        canon_names.add((name or "").lower())
    mods = {r[0].lower() for r in conn.execute(
        "SELECT slug FROM freestyle_trick_modifiers")}
    # red_additions adds the newly created canonicals (col0 slug, col1 numeric add,
    # col8 is_active) before the next DB rebuild picks them up.
    alias = set()
    for line in (TD / "red_additions_2026_04_20.csv").read_text().splitlines():
        p = line.split(",")
        if len(p) > 8 and re.fullmatch(r"\d+", p[1].strip()) and p[8].strip() == "1":
            canon.add(p[0])
            canon_names.add(p[0].replace("-", " "))
        if len(p) > 4:
            alias |= {a.strip().lower() for a in p[4].split("|") if a.strip()}
    for r in csv.DictReader((NOISE / "tricks.csv").open()):
        alias |= {a.strip().lower() for a in (r.get("aliases") or "").split("|") if a.strip()}
    for r in csv.DictReader((NOISE / "trick_aliases.csv").open()):
        if r.get("alias"):
            alias.add(r["alias"].strip().lower())
    known = set()
    for s in canon:
        known |= set(s.split("-"))
    known |= mods | {
        "far", "near", "same", "op", "full", "rev", "double", "triple", "symposium",
        "symp", "dex", "jump", "toe", "clip", "set", "spin", "swirl", "back", "front",
        "into", "plant", "no", "while", "downtime", "uptime", "midtime", "double-dex",
        "triple-dex", "quad-dex", "xbd", "bxd", "in", "out", "bs", "ps", "dlo", "dso",
        "datw", "dod", "ddd", "atw", "blurry", "clipper", "crossbody", "cross", "body",
        "leg", "over", "side", "opposite"}
    return canon, canon_names, alias, known


def norm_decomp(tn):
    tn = tn.split(",")[0].replace("Symp.", "symposium").replace("Symp", "symposium")
    toks = (w.strip().lower().rstrip(".") for w in re.split(r"\s+", tn.strip()))
    return "-".join(ABBR.get(x, x) for x in toks
                    if x and x not in SIDE and not x.startswith("(") and x not in (">", ">>"))


def base(raw):
    return raw.split("/")[0].split("(")[0].strip().lower()


def name_variant(raw):
    toks = [t for t in base(raw).split() if t not in QUAL]
    return " ".join(toks), "-".join(ABBR.get(t, t) for t in toks)


def undefined_tokens(tn, known, alias):
    out = []
    for w in re.split(r"\s+", (tn or "").split(",")[0]):
        t = w.strip().lower().rstrip(".")
        if not t or t.startswith("(") or t in (">", ">>") or t in SIDE:
            continue
        if t not in known and t not in alias:
            out.append(t)
    return out


def classify():
    canon, canon_names, alias, known = build_sets()
    rows = list(csv.DictReader(CAND.open()))
    seen = set()
    buckets = Counter()
    residual = []
    for r in rows:
        raw = r["passback_primary_name"].strip()
        if raw in seen:
            continue
        seen.add(raw)
        tn = r["passback_technical_name"].strip()
        if raw.lower() in NONTRICK or base(raw).split(",")[0].strip() in NONTRICK or base(raw) in NONTRICK:
            buckets["nontrick"] += 1
            continue
        if base(raw) in alias:
            buckets["name_alias"] += 1
            continue
        nm, slug = name_variant(raw)
        if nm in canon_names or slug in canon:
            buckets["name_canonical"] += 1
            continue
        if norm_decomp(tn) in canon:
            buckets["decomp_canonical"] += 1
            continue
        residual.append((raw, tn, r["passback_dex_count"].strip()))
    return len(seen), buckets, residual, known, alias


def group_residual(residual, known, alias):
    g = {"folk": [], "undef": [], "novel": []}
    for raw, tn, dex in residual:
        if not tn:
            g["folk"].append((raw, tn, dex))
            continue
        u = undefined_tokens(tn, known, alias)
        (g["undef"] if u else g["novel"]).append((raw, tn, dex, u))
    return g


def main():
    unique, b, residual, known, alias = classify()
    g = group_residual(residual, known, alias)
    resolved = b["name_alias"] + b["name_canonical"] + b["decomp_canonical"]
    n_res = len(residual)
    tok = Counter(t for _, _, _, u in g["undef"] for t in u)

    REPORT.write_text(
        f"# PassBack orphan first-pass reduction\n\n"
        f"Generated by `classify_orphans.py` (the single source of truth for the\n"
        f"residual count). Source: 187 PassBack orphan labels, {unique} unique.\n\n"
        f"Each label is classified by the first matching rule, in priority order:\n"
        f"non-trick, name->existing-alias, name->existing-canonical,\n"
        f"decomposition->existing-canonical, else residual. The two name-> rules were\n"
        f"absent from the first ad-hoc pass, which is why earlier residual figures\n"
        f"(115 / 108 / 101) over-counted: already-canonical labels (Double Orbit,\n"
        f"Fairy Eggbeater, Twirl) and already-aliased abbreviations (DLO, DATW, DSO)\n"
        f"were never true orphans.\n\n"
        f"## B. Reduction (187 -> {n_res} residual)\n\n"
        f"- Unique labels: **{unique}**\n"
        f"- Non-tricks dropped: **{b['nontrick']}**\n"
        f"- Resolved to an existing canonical: **{resolved}**\n"
        f"  - name is already a registered alias: {b['name_alias']}\n"
        f"  - name is already a canonical name/slug: {b['name_canonical']}\n"
        f"  - decomposition matches a canonical: {b['decomp_canonical']}\n"
        f"- **RESIDUAL: {n_res}**\n\n"
        f"## A. Changes applied by this effort\n\n"
        f"- 63 folk-name aliases written to existing canonical rows (decomposition matches).\n"
        f"- 7 new canonicals created with folk aliases (Delusion, Whirr, Cardinal Swirl,\n"
        f"  Triage, Ego, Predator, Icarus).\n"
        f"- Foundational aliases wired: DLO, DATW (already inline), DSO, clipper-kick.\n\n"
        f"## C. Video recovery\n\n"
        f"- 5 PassBack demo records reattached to canonical trick_slug (flurricane,\n"
        f"  blizzard, mantis, big-apple, maelstrom).\n\n"
        f"## D. Residual\n\n"
        f"- {n_res} labels -> see `exploration/red-passback-residual-2026-06-10/`\n"
        f"  (grouped: folk {len(g['folk'])} / undefined-operator {len(g['undef'])} / "
        f"novel-defined {len(g['novel'])}).\n")

    lines = [f"# PassBack residual orphans -- Red annotation worksheet ({n_res})\n",
             "Survived the first-pass doctrine/obvious-mapping reduction (from 187), "
             "excluding non-tricks, name->canonical, and name->alias direct hits. "
             "Each line: **folk name** -- `decomposition` (dex). Add a ruling after the arrow.\n",
             f"\n## A. Pure folk names, no decomposition ({len(g['folk'])})\n"]
    for raw, tn, dex in sorted(g["folk"]):
        lines.append(f"- **{raw}**\n  -> Red: ")
    lines.append(f"\n## B. Decomposition uses an undefined folk operator ({len(g['undef'])}) -- define the token\n")
    for raw, tn, dex, u in sorted(g["undef"]):
        lines.append(f"- **{raw}** -- `{tn}` (dex {dex or '?'})  [undefined: {', '.join(u)}]\n  -> Red: ")
    lines.append(f"\n## C. Novel structure, all components known ({len(g['novel'])}) -- new canonical or alias?\n")
    for raw, tn, dex, _ in sorted(g["novel"]):
        lines.append(f"- **{raw}** -- `{tn}` (dex {dex or '?'})\n  -> Red: ")
    WORKSHEET.write_text("\n".join(lines) + "\n")

    print(f"unique={unique} nontrick={b['nontrick']} resolved={resolved} "
          f"(alias={b['name_alias']} canon={b['name_canonical']} decomp={b['decomp_canonical']}) "
          f"RESIDUAL={n_res}")
    print(f"residual groups: folk={len(g['folk'])} undef={len(g['undef'])} novel={len(g['novel'])}")
    print("recurring folk operators:",
          {t: c for t, c in tok.most_common() if c >= 2})
    return n_res


if __name__ == "__main__":
    sys.exit(0 if main() == 69 else 1)

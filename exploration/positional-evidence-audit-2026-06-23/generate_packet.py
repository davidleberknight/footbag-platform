#!/usr/bin/env python3
"""Build the promotion packet for the 34 PROMOTION-READY positional variants
plus alias rows for the 8 FALSE POSITIVES. Read-only over the DB/corpus; writes
ONLY packet artifacts under this exploration folder (never the live pipeline CSVs).
No descriptions authored, nothing loaded.
"""
from __future__ import annotations
import csv, re, sqlite3
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CU = REPO / "exploration/phase-e-implementation-2026-05-28/CLASSIFIED_UNIVERSE.csv"
GATED = Path(__file__).resolve().parent / "ev_rerun_gated.csv"
DB = REPO / "database/footbag.db"
HERE = Path(__file__).resolve().parent
PKT = HERE / "PROMOTION_PACKET.md"
RA = HERE / "packet_red_additions.csv"
RC = HERE / "packet_red_corrections.csv"
AL = HERE / "packet_alias_additions.csv"

SIDE = {"ss", "near", "far", "op", "opp", "opposite", "same", "side", "same-side", "opposite-side"}
RECEIVERS = {"mirage", "illusion", "whirl", "torque", "drifter"}
REAL = ("footbagmoves", "fborg", "stanford", "passback")
BRACKETS = ("[DEX]", "[BOD]", "[XBD]", "[PDX]", "[DEL]", "[UNS]", "[XDEX]")
PLACEHOLDER = re.compile(r"^(popular freestyle trick|.+\bmodified\b.+|.+-modified.+)\.?$", re.I)


def slugify(s):
    s = re.sub(r"\((?:ss|op|opp|opposite|near|far|same[ -]side)\)", "", s, flags=re.I)
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


def trick_name_to_slug(name):
    # mirror of trickNameToSlug: strip ONLY a trailing positional parenthetical
    name = re.sub(r"\s*\((?:ss|op|opp|opposite|near|far|same[ -]side)\)\s*$", "", name, flags=re.I)
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", name.lower()))


def strip_side(slug):
    return "-".join(x for x in slug.split("-") if x not in SIDE)


def pside(n):
    n = " " + n.lower().replace("-", " ") + " "
    if re.search(r"same\s+side|\bsame\b|\bss\b|\bnear\b", n):
        return "same"
    if re.search(r"\bfar\b|\bopposite\b|\bopp\b|\bop\b", n):
        return "far"
    return None


def dex_indices(toks):
    out = []
    for i, t in enumerate(toks):
        if "[DEX]" in t:
            for j in range(i - 1, max(-1, i - 6), -1):
                if toks[j] in ("SAME/OP", "OP", "SAME"):
                    out.append((j, "AMBIG" if toks[j] == "SAME/OP" else toks[j])); break
    return out


def derive(op, side):
    want = "SAME" if side == "same" else "OP"
    opp = "OP" if want == "SAME" else "SAME"
    toks = op.split()
    di = dex_indices(toks)
    targets = [j for j, m in di if m == opp] + [j for j, m in di if m == "AMBIG"]
    if len(targets) != 1:
        return None
    toks[targets[0]] = want
    return " ".join(toks)


def main():
    names_by = defaultdict(list)
    src_by_name = {}
    for r in csv.DictReader(open(CU)):
        src_by_name[r["name"]] = ((r["sources"] or "") + "," + (r["source_corpus"] or "")).lower()

    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    base = {}
    for s, cn, op, adds, bt, fam, desc, act in con.execute(
        "SELECT slug, canonical_name, operational_notation, adds, base_trick, trick_family, description, is_active FROM freestyle_tricks"):
        base[s] = dict(cn=cn, op=op or "", adds=adds, bt=bt, fam=fam, desc=desc or "", act=act)
    active_notation = {s: d["op"] for s, d in base.items() if d["act"] == 1 and d["op"]}
    in_system = set()
    for s, d in base.items():
        if d["act"] == 1 and pside(s):
            in_system.add((strip_side(s), pside(s)))
    for (a,) in con.execute("SELECT alias_slug FROM freestyle_trick_aliases"):
        if a and pside(a):
            in_system.add((strip_side(a), pside(a)))
    con.close()

    # rebuild bucket-A variants with their attested corpus names
    variants = defaultdict(lambda: {"names": [], "redundant": False})
    for r in csv.DictReader(open(GATED)):
        if r["bucket"] != "A":
            continue
        key = (r["base"], r["asserted_side"])
        variants[key]["names"].append(r["name"])
        if "redundant" in r["detail"]:
            variants[key]["redundant"] = True

    ready, fps = [], []
    for (b, side), v in variants.items():
        if v["redundant"] or b not in base or base[b]["act"] != 1 or not base[b]["op"]:
            continue
        if side == "far" and any(t in RECEIVERS for t in b.split("-")):
            continue
        if not any(any(k in src_by_name.get(nm, "") for k in REAL) for nm in v["names"]):
            continue
        if (b, side) in in_system:
            continue
        op = base[b]["op"]
        derived = derive(op, side)
        if not derived:
            continue
        # FALSE POSITIVE detection runs BEFORE the description gate, so all 8 are caught.
        dup = None
        for s2, op2 in active_notation.items():
            if s2 != b and op2.strip() == derived.strip():
                dup = s2; break
        if dup:
            fps.append((b, side, v["names"], dup))
            continue
        d = base[b]["desc"].strip()
        if not d or PLACEHOLDER.match(d):
            continue   # NEEDS-DESCRIPTION (11) — excluded from the PROMOTION-READY 34
        ready.append((b, side, v["names"], derived))

    def canon_name(b, side):
        bn = base[b]["cn"].replace("-", " ").title()
        return (f"Far {bn}" if side == "far" else f"{bn} Same Side")

    def srcs(names):
        toks = set()
        for nm in names:
            for k in REAL:
                if k in src_by_name.get(nm, ""):
                    toks.add({"footbagmoves": "FM", "fborg": "FB", "stanford": "SG", "passback": "PB"}[k])
        return "|".join(sorted(toks))

    # ---- packet artifacts ----
    ra_rows, rc_rows, packet = [], [], []
    for b, side, names, derived in sorted(ready):
        cn = canon_name(b, side)
        vslug = trick_name_to_slug(cn)
        add = base[b]["adds"]
        bracket = sum(derived.count(t) for t in BRACKETS)
        fam = base[b]["fam"]
        override = fam if fam and fam != b else ""   # loader-19 default = base_trick(=b); override when family != b
        all_aliases = sorted({nm for nm in names if nm.lower() != cn.lower()})
        # drop alias forms whose slug collapses to the base (trailing parenthetical) — they would
        # collide with the base canonical's slug; keep the rest.
        aliases = [a for a in all_aliases if trick_name_to_slug(a) != b]
        dropped = [a for a in all_aliases if trick_name_to_slug(a) == b]
        collide = bool(dropped) or vslug == b
        ra_rows.append([cn, add, b, "compound", "|".join(aliases), "", "", "pending", "0",
                        "Positional variant (relative-side doctrine 2026-06-23); slug/naming PENDING REVIEW"])
        rc_rows.append([vslug, "operational_notation", "", derived,
                        "Derived: base notation with the target dex flipped per the relative-side doctrine 2026-06-23"])
        if override:
            rc_rows.append([vslug, "trick_family", b, override,
                            "Loader-19 transitive-family override: inherit base structural family 2026-06-23"])
        packet.append(dict(cn=cn, vslug=vslug, src=srcs(names), notation=derived, add=add, bracket=bracket,
                           base=b, fam=fam, override=override or "(none)", aliases=", ".join(aliases) or "(none)",
                           collide=collide))

    active_slugs = {s for s, d in base.items() if d["act"] == 1}
    al_rows, al_dropped = [], []
    for b, side, names, dup in sorted(fps):
        for nm in sorted(set(names)):
            aslug = trick_name_to_slug(nm)
            if aslug in active_slugs:
                # parenthetical form collapses onto an active canonical -> cannot alias it
                al_dropped.append([nm, aslug, dup]); continue
            al_rows.append([aslug, nm, dup, "structural_equivalent",
                            "Positional form equals existing canonical (relative-side doctrine 2026-06-23)"])

    with RA.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["canonical_name", "adds", "base_trick", "category", "aliases", "modifier_links",
                    "description", "review_status", "is_active", "review_note"])
        w.writerows(ra_rows)
    with RC.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["slug", "field", "old_value", "new_value", "source_note"])
        w.writerows(rc_rows)
    with AL.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["alias_slug", "alias_text", "trick_slug", "alias_type", "note"])
        w.writerows(al_rows)

    L = []
    L.append("# Promotion packet — 34 positional variants (2026-06-23)\n")
    L.append("Read-only. Packet artifacts written under this folder only; the live "
             "`red_additions`/`red_corrections`/alias CSVs were NOT modified. Nothing loaded, "
             "no descriptions authored.\n")
    L.append(f"- red_additions rows: `packet_red_additions.csv` ({len(ra_rows)})")
    L.append(f"- red_corrections rows: `packet_red_corrections.csv` ({len(rc_rows)})")
    L.append(f"- alias additions (false positives): `packet_alias_additions.csv` ({len(al_rows)})\n")
    L.append("## Per-trick detail\n")
    L.append("| proposed canonical | slug | src | base_trick | family | override | ADD (=brackets) | aliases | slug-collision |")
    L.append("|---|---|---|---|---|---|:--:|---|:--:|")
    for p in packet:
        L.append(f"| {p['cn']} | `{p['vslug']}` | {p['src']} | `{p['base']}` | `{p['fam']}` | "
                 f"`{p['override']}` | {p['add']} (={p['bracket']}) | {p['aliases']} | {'YES' if p['collide'] else ''} |")
    L.append("")
    L.append("## Derived notation per trick\n")
    for p in packet:
        L.append(f"- `{p['vslug']}`: `{p['notation']}`")
    L.append("")
    L.append("## Existing-equivalent check\n")
    L.append("All 34 passed the structural-duplicate check (no active canonical shares the derived "
             "notation). The 8 false positives that DID collide are routed to alias additions.\n")
    L.append("## ROWS REQUIRING HUMAN REVIEW\n")
    L.append("1. **Slug / naming convention (GATES THE WHOLE BATCH).** Trailing-parenthetical "
             "positional forms (`X (same side)`, `X (far)`) collapse to the BASE slug under "
             "`trickNameToSlug`, so every distinct identity here uses an infix/prefix canonical "
             "(`Far X` / `X Same Side`). The frozen slug-normalization note says positional "
             "qualifiers \"don't change slug\" — which conflicts with minting these distinct slugs. "
             "Confirm the positional slug convention before loading; the proposed slugs assume the "
             "infix form is allowed.")
    L.append(f"2. **Descriptions omitted (all 34).** Per instruction no descriptions were authored; "
             f"every red_additions row has an empty `description` and `review_status=pending`, "
             f"`is_active=0`. A human must supply descriptions or accept structure-only rendering "
             f"before activation.")
    L.append(f"3. **Family overrides ({sum(1 for p in packet if p['override']!='(none)')}).** Loader-19 "
             f"would default `trick_family` to the variant's `base_trick`; the paired red_corrections "
             f"`trick_family` rows override to the base's structural family. Verify each.")
    L.append(f"4. **Dropped colliding aliases ({sum(1 for p in packet if p['collide'])} variants).** "
             f"Attested `X (same side)` alias spellings were dropped because their slug collides with "
             f"the base; only non-colliding spellings (`X ss`, `Far X`) were kept.")
    if al_dropped:
        L.append(f"5. **False-positive alias collisions ({len(al_dropped)}).** These parenthetical FP "
                 f"spellings collapse onto an ALREADY-ACTIVE canonical and were NOT emitted (adding "
                 f"them would re-point the base trick). Need a human call:")
        for nm, aslug, dup in al_dropped:
            L.append(f"   - `{nm}` -> slug `{aslug}` (active) ; intended equivalent `{dup}`")
    PKT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"ready={len(ready)} fps={len(fps)} | red_additions={len(ra_rows)} red_corrections={len(rc_rows)} aliases={len(al_rows)}")
    print(f"slug-collision rows: {sum(1 for p in packet if p['collide'])}")
    print(f"family-override rows: {sum(1 for p in packet if p['override']!='(none)')}")
    print(f"wrote {PKT.name}, {RA.name}, {RC.name}, {AL.name}")


if __name__ == "__main__":
    main()

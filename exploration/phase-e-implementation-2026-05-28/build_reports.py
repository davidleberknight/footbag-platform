#!/usr/bin/env python3
"""Phase E — deterministic report layer (Goals 2, 4, 5).

Read-only. Consumes CLASSIFIED_UNIVERSE.csv (from classify_universe.py) + the
live DB (for decomposition-equivalence overlap) and emits:

  P2 (overlap elimination):
    overlap_removal_candidates.csv        — observational names already covered by canon
    observational_duplicate_clusters.csv  — lexical-duplicate / cross-source same-name clusters
    OVERLAP_REPORT.md

  P4 (doctrine-block concentration):
    doctrine_blocked.csv                  — every doctrine-blocked name + ecosystem + blocking question
    DOCTRINE_BLOCK_REPORT.md

  P5 (promotion shortlist, 5 tiers):
    promotion_tier1_mechanical.csv
    promotion_tier2_curator_review.csv
    promotion_tier3_doctrine_blocked.csv
    promotion_tier4_observational_only.csv
    promotion_tier5_junk.csv
    alias_collapse_candidates.csv         — category-B names (collapse, not promote)
    ecosystem_promotion_queues.csv        — Tier1+Tier2 grouped by ecosystem
    PROMOTION_TIERS.md

No silent merges (overlap clusters are FLAGGED, never collapsed). No promotion.
No fabricated JOB/ADD/structure. Tiering is purely a function of the already-
computed, data-derived classification columns.
"""
from __future__ import annotations

import csv
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DB = REPO / "database/footbag.db"
OUT_DIR = Path(__file__).resolve().parent
UNIVERSE = OUT_DIR / "CLASSIFIED_UNIVERSE.csv"

_PAREN_RE = re.compile(r"\([^)]*\)")
_WS_RE = re.compile(r"\s+")

# Which Red ruling unblocks each doctrine ecosystem (from the doctrine framework
# + Red packets; report-side annotation only, no doctrine decided here).
BLOCKING_QUESTION = {
    "blurry-furious": "Red Q1.A — does `blurry`/`furious` carry +2 on rotational bases?",
    "weaving":        "weaving movement ruling pending",
    "pogo":           "pogo structural/ADD ruling pending (Red Wave-3 Q3)",
    "shooting":       "shooting structural ruling pending",
    "rail-rooted":    "rooted structural ruling pending",
}


def norm_overlap(s: str) -> str:
    s = _PAREN_RE.sub("", s or "").strip().lower()
    for ch in "*'.\"“”‘’`":
        s = s.replace(ch, "")
    s = s.replace("-", " ")
    return _WS_RE.sub(" ", s).strip()


def load_db_keys():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    rows = list(db.execute("SELECT slug, canonical_name, aliases_json FROM freestyle_tricks"))
    aliases = list(db.execute("SELECT alias_text, alias_slug FROM freestyle_trick_aliases"))
    db.close()
    slugs = {r["slug"] for r in rows}
    names = {norm_overlap(r["canonical_name"]) for r in rows}
    alias = set()
    for r in rows:
        try:
            for a in json.loads(r["aliases_json"] or "[]"):
                alias.add(norm_overlap(a))
        except Exception:
            pass
    for a in aliases:
        alias.add(norm_overlap(a["alias_text"]))
        alias.add(norm_overlap(a["alias_slug"]))
    alias.discard("")
    return slugs, names, alias


def write_csv(path: Path, rows: list[dict], cols: list[str]):
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, quoting=csv.QUOTE_ALL, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def main() -> None:
    with UNIVERSE.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    db_slugs, db_names, db_alias = load_db_keys()

    # convenience views
    def is_obs(r):           # not resolved into canon
        return r["in_db_live"] == "False" and not r["governance_state"].startswith("1")

    # ── P2: overlap elimination ──────────────────────────────────────────────
    removal = []
    for r in rows:
        if r["governance_state"].startswith("1"):
            continue  # canonical rows are not "observational overlaps"
        equiv = (r.get("equivalent_to") or "").strip()
        equiv_head = equiv.split("(")[0].strip().rstrip(";,").strip()
        equiv_in_db = bool(equiv_head) and (
            norm_overlap(equiv_head) in db_names
            or norm_overlap(equiv_head) in db_alias
            or equiv_head in db_slugs)
        overlaps = r["overlaps_canonical"] == "True" or equiv_in_db
        if not overlaps:
            continue
        kinds = []
        if r["slug_overlap"] == "True":
            kinds.append("exact-slug")
        if r["name_overlap"] == "True":
            kinds.append("normalized-name")
        if r["alias_overlap"] == "True":
            kinds.append("canonical-alias")
        if equiv_in_db:
            kinds.append("decomposition-equivalence")
        if r["retired_family"] == "yes":
            kinds.append("retired-family")
        removal.append({**r, "overlap_kinds": "|".join(kinds) or "in-db"})
    write_csv(OUT_DIR / "overlap_removal_candidates.csv", removal,
              ["name", "slug", "governance_state", "category", "source_corpus",
               "overlap_kinds", "equivalent_to", "ecosystems"])

    # observational duplicate clusters (lexical collisions among unresolved names)
    by_norm: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if is_obs(r):
            by_norm[norm_overlap(r["name"])].append(r)
    dup_clusters = []
    for key, members in by_norm.items():
        if len(members) > 1:
            dup_clusters.append({
                "normalized": key,
                "n_members": len(members),
                "names": " | ".join(sorted(m["name"] for m in members)),
                "sources": "|".join(sorted({m["source_corpus"] for m in members})),
                "note": "FLAG ONLY — confirm before any merge",
            })
    # cross-source same-name (n_sources>=2) is the cleanest dup signal
    multi_src = [r for r in rows if is_obs(r) and (r.get("n_sources") or "0").isdigit()
                 and int(r["n_sources"]) >= 2]
    dup_clusters.sort(key=lambda c: -c["n_members"])
    write_csv(OUT_DIR / "observational_duplicate_clusters.csv", dup_clusters,
              ["normalized", "n_members", "names", "sources", "note"])

    # ── P4: doctrine-block concentration ─────────────────────────────────────
    doctrine_rows = [r for r in rows if r["category"] == "D" and is_obs(r)]
    eco_block: Counter[str] = Counter()
    primary_block: Counter[str] = Counter()  # one bucket per row (first doctrine eco)
    doctrine_out = []
    DOCTRINE_ECOS = ["blurry-furious", "weaving", "pogo", "shooting", "rail-rooted"]
    for r in doctrine_rows:
        ecos = [e for e in r["ecosystems"].split("|") if e]
        for e in ecos:
            eco_block[e] += 1
        primary = next((e for e in DOCTRINE_ECOS if e in ecos), (ecos[0] if ecos else "other"))
        primary_block[primary] += 1
        doctrine_out.append({**r, "primary_block_ecosystem": primary,
                             "blocking_question": BLOCKING_QUESTION.get(primary, "curator/Red ruling pending")})
    write_csv(OUT_DIR / "doctrine_blocked.csv", doctrine_out,
              ["name", "slug", "source_corpus", "ecosystems",
               "primary_block_ecosystem", "blocking_question"])

    # ── P5: promotion tiers ──────────────────────────────────────────────────
    tiers: dict[str, list[dict]] = {f"tier{i}": [] for i in range(1, 6)}
    alias_collapse = []
    for r in rows:
        if not is_obs(r):
            continue
        cat = r["category"]
        ecos = [e for e in r["ecosystems"].split("|") if e]
        pub = (r.get("publication_status") or "").strip()
        if cat == "B":
            alias_collapse.append(r)
        elif cat == "E":
            tiers["tier5"].append(r)
        elif cat in ("D", "PENDING-SYMBOLIC", "POLICY-DEPENDENT", "AMBIGUOUS"):
            tiers["tier3"].append(r)
        elif cat == "A" and pub == "first_class_ready":
            tiers["tier1"].append(r)
        elif cat == "C":
            tiers["tier2"].append(r)
        elif cat == "A" and ecos:
            tiers["tier2"].append(r)          # A0-derivable; needs derivation + review
        elif cat == "A":
            tiers["tier4"].append(r)          # bare folk name, no compositional structure
        else:
            tiers["tier4"].append(r)
    tier_files = {
        "tier1": "promotion_tier1_mechanical.csv",
        "tier2": "promotion_tier2_curator_review.csv",
        "tier3": "promotion_tier3_doctrine_blocked.csv",
        "tier4": "promotion_tier4_observational_only.csv",
        "tier5": "promotion_tier5_junk.csv",
    }
    pcols = ["name", "slug", "governance_state", "category", "source_corpus",
             "ecosystems", "parent_family", "completeness", "publication_status",
             "parse_confidence", "add_confidence"]
    for t, fn in tier_files.items():
        write_csv(OUT_DIR / fn, tiers[t], pcols)
    write_csv(OUT_DIR / "alias_collapse_candidates.csv", alias_collapse, pcols)

    # ecosystem promotion queues (Tier1 + Tier2)
    queue_rows = []
    for t in ("tier1", "tier2"):
        for r in tiers[t]:
            for e in ([x for x in r["ecosystems"].split("|") if x] or ["(none)"]):
                queue_rows.append({"ecosystem": e, "tier": t, "name": r["name"],
                                   "slug": r["slug"], "source_corpus": r["source_corpus"]})
    queue_rows.sort(key=lambda q: (q["ecosystem"], q["tier"], q["name"].lower()))
    write_csv(OUT_DIR / "ecosystem_promotion_queues.csv", queue_rows,
              ["ecosystem", "tier", "name", "slug", "source_corpus"])

    # ── report markdown ──────────────────────────────────────────────────────
    def md_table(counter, head1, head2):
        out = [f"| {head1} | {head2} |", "|---|---:|"]
        for k, n in (counter.most_common() if isinstance(counter, Counter) else counter):
            out.append(f"| {k} | {n} |")
        return "\n".join(out)

    (OUT_DIR / "OVERLAP_REPORT.md").write_text(
        "# P2 — Overlap elimination\n\n"
        f"- **{len(removal)}** observational names overlap canon and are removal/flag candidates "
        "(should NOT appear on the Emerging Vocabulary surface).\n"
        f"- **{len(dup_clusters)}** lexical-duplicate clusters among unresolved names "
        f"(covering {sum(c['n_members'] for c in dup_clusters)} rows); "
        f"**{len(multi_src)}** names appear in 2+ sources.\n\n"
        "Overlap-kind distribution (a row may carry several):\n\n"
        + md_table(Counter(k for r in removal for k in r["overlap_kinds"].split("|")), "kind", "rows")
        + "\n\nNo merges performed — every cluster is flagged for curator confirmation.\n"
        "Files: `overlap_removal_candidates.csv`, `observational_duplicate_clusters.csv`.\n",
        encoding="utf-8")

    (OUT_DIR / "DOCTRINE_BLOCK_REPORT.md").write_text(
        "# P4 — Doctrine-block concentration\n\n"
        f"- **{len(doctrine_rows)}** observational names are doctrine-blocked (category D).\n"
        "- Blockage is concentrated: a handful of ecosystems hold the overwhelming majority.\n\n"
        "Primary block ecosystem (one bucket per name) + unblock-potential:\n\n"
        + md_table(primary_block, "primary ecosystem", "names freed if ruled")
        + "\n\nBlocking question per dominant cluster:\n\n"
        + "\n".join(f"- **{e}** ({primary_block.get(e,0)}): {BLOCKING_QUESTION[e]}" for e in DOCTRINE_ECOS if primary_block.get(e))
        + "\n\nFile: `doctrine_blocked.csv`.\n",
        encoding="utf-8")

    tier_counts = [(t, len(tiers[t])) for t in ("tier1", "tier2", "tier3", "tier4", "tier5")]
    (OUT_DIR / "PROMOTION_TIERS.md").write_text(
        "# P5 — Promotion shortlist (5 tiers)\n\n"
        "Tiers cover only UNRESOLVED observational names (in_db_live=False, not canonical). "
        "Category-B alias names are routed to alias-collapse, not a promotion tier.\n\n"
        "| Tier | Meaning | Names |\n|---|---|---:|\n"
        f"| 1 mechanical | category A + publication_status=first_class_ready | {len(tiers['tier1'])} |\n"
        f"| 2 curator-review | A0-derivable (A+ecosystem) + structural (C) | {len(tiers['tier2'])} |\n"
        f"| 3 doctrine-blocked | D + pending-symbolic + policy + ambiguous | {len(tiers['tier3'])} |\n"
        f"| 4 observational-only | bare folk names, no compositional structure | {len(tiers['tier4'])} |\n"
        f"| 5 junk | category E (weak-source / parser leftover) | {len(tiers['tier5'])} |\n"
        f"| (alias-collapse) | category B — collapse to canon, do not promote | {len(alias_collapse)} |\n\n"
        "Tier 1 is promotable now; Tier 2 is the A0-extrapolation backlog (Goal 3 derives "
        "provisional JOB/ADD, then curator review); Tier 3 waits on the doctrine rulings in "
        "`DOCTRINE_BLOCK_REPORT.md`.\n\n"
        "Files: `promotion_tier{1..5}_*.csv`, `alias_collapse_candidates.csv`, "
        "`ecosystem_promotion_queues.csv`.\n",
        encoding="utf-8")

    # ── stdout summary ──
    print("P2 overlap:")
    print(f"  removal/flag candidates (overlap canon): {len(removal)}")
    print(f"  duplicate clusters: {len(dup_clusters)} (multi-source names: {len(multi_src)})")
    print("P4 doctrine:")
    print(f"  doctrine-blocked names: {len(doctrine_rows)}")
    for e in DOCTRINE_ECOS:
        if primary_block.get(e):
            print(f"    {e:<16s} {primary_block[e]}")
    print(f"    other:            {sum(n for k,n in primary_block.items() if k not in DOCTRINE_ECOS)}")
    print("P5 promotion tiers:")
    for t, n in tier_counts:
        print(f"  {t}: {n}")
    print(f"  alias-collapse: {len(alias_collapse)}")
    print("\nWrote P2/P4/P5 CSVs + OVERLAP_REPORT.md + DOCTRINE_BLOCK_REPORT.md + PROMOTION_TIERS.md")


if __name__ == "__main__":
    main()

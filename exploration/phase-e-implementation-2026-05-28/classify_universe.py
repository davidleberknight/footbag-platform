#!/usr/bin/env python3
"""Phase E — unified full-corpus classifier (Goal 1).

Read-only. Treats the existing RECONCILIATION.csv (the 2,460-name universe
spine) as authoritative for NAMES, and recomputes every data-derivable
classification column FRESH against the live DB + deterministic name logic:

  - governance state (carried from the spine)
  - triage category A-F (mirror of wave1-triage-2026-05-27/triage_classifier.py)
  - ecosystem membership (same mirror)
  - parent-family resolution + retired-family flag
    (mirror of src/content/freestyleParentFamilies.ts + freestyleFamilyOverrides.ts)
  - in_db_live / promoted   — recomputed from the LIVE DB (captures W1-W9 promotions)
  - overlap-with-canonical flags (slug / normalized-name / alias)
  - source corpus attribution + n_sources
  - completeness flag        — makes the stale-blank-column problem VISIBLE

Why a non-destructive enrich (not a regenerate): RECONCILIATION.csv is assembled
from SYMBOLIC_GRAMMAR_MASTER.csv (rich columns) PLUS wave0_apply.py appends
(blank rich columns by design). Regenerating from the master alone would drop the
~1,700 Wave-0 names. So we read the spine and layer fresh, data-derived columns
on top, writing a NEW file. RECONCILIATION.csv is never touched.

Deep parse/add/notation confidence for the blank Wave-0 rows is NOT invented here
(that is the A0 extrapolation pipeline, Goal 3); rows missing it are flagged
completeness='name-only' so the gap is explicit rather than silent.

Outputs (this script's own directory):
  CLASSIFIED_UNIVERSE.csv   — every spine row + recomputed columns
  classification_summary.txt

No DB mutation. No promotion. No name collapse. No fabricated structure.
"""
from __future__ import annotations

import csv
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
RECON_CSV = REPO / "exploration/vocabulary-reconciliation-audit-2026-05-21/RECONCILIATION.csv"
CORPUS_ALL = REPO / "exploration/wave0-reconciliation-expansion-2026-05-26/corpus_names_all.csv"
DB = REPO / "database/footbag.db"
OUT_DIR = Path(__file__).resolve().parent

# ── Mirror: family skeleton (src/content/freestyleParentFamilies.ts) ──────────
PARENT_FAMILY_OF_LABEL = {
    "swirl": "whirl", "twirl": "whirl", "rev-whirl": "whirl", "whirling-swirl": "whirl",
    "torque": "osis", "blender": "osis", "mobius": "osis",
    "double-leg-over": "legover", "guay": "legover", "eggbeater": "legover",
    "double-pickup": "pickup",
    "atw": "around-the-world", "double-around-the-world": "around-the-world",
    "paradox-mirage": "mirage", "paradox-illusion": "mirage",
}
PARENT_FAMILY_ORDER = [
    "mirage", "illusion", "butterfly", "legover",
    "pickup", "whirl", "osis", "around-the-world",
]
# Mirror: FAMILY_OVERRIDES one-way redirects (freestyleFamilyOverrides.ts)
FAMILY_OVERRIDES = {
    "rev-whirl": "rev-whirl", "hatchet": "rev-whirl", "mullet": "rev-whirl",
    "high-plains-drifter": "drifter", "rev-up": "rev-up",
}
# Mirror: RETIRED_FAMILIES (route-outs — NOT productive parent families)
RETIRED_FAMILIES = {
    "clipper-stall", "clipper", "toe-stall",
    "pixie", "fairy", "atomic", "quantum", "surging", "terrage", "spyro",
    "pogo", "rooted", "sailing", "shooting", "furious",
    "cross-body-sole-stall", "sole-stall", "heel-stall", "sole-kick",
    "inside-stall", "outside-stall", "head-stall", "neck-stall", "shoulder-stall",
    "forehead-stall", "cloud-stall", "cloud-kick", "knee-stall", "dragonfly-kick",
    "flying-inside", "flying-outside",
    "2-bag-juggling", "3-bag-juggling", "spin", "double-spin", "double-knee",
    "knee-clipper",
}


def resolve_parent_family(fam: str) -> str:
    fam = FAMILY_OVERRIDES.get(fam, fam)
    return PARENT_FAMILY_OF_LABEL.get(fam, fam)


# ── Mirror: triage classifier (wave1-triage-2026-05-27/triage_classifier.py) ──
DOCTRINE_TOKENS = {
    "blurry", "blurriest", "blurrier", "blurrage", "furious", "nuclear",
    "illusioning", "shooting", "weaving", "rooted", "antisymposium", "pogo",
}
TRIVIAL_KICK_RE = re.compile(r"^(toe|heel|inside|outside|knee|shoulder)\s*(kick|delay)$", re.I)
SLASH_ALT_RE = re.compile(r"\s*/\s*")
PAREN_FOLKNAME_RE = re.compile(r"^[^(]+\([^)]+\)\s*$")
DIRECTIONAL_PAREN_RE = re.compile(
    r"\((same\s*side|ss|op|opposite\s*side|far|near|reverse|rev|in|out)\)", re.I)
CANONICAL_MODIFIERS = {
    "atomic", "ducking", "fairy", "gyro", "spyro", "inspinning", "paradox",
    "pixie", "quantum", "spinning", "stepping", "symposium", "whirling",
    "surging", "blistering", "miraging", "barraging", "tapping", "slapping",
}
DIRECTIONAL_TOKENS = {
    "far", "near", "reverse", "op", "ss", "op-side", "same-side",
    "double", "triple", "backside", "frontside", "alpine",
}
ECOSYSTEMS = {
    "ducking": ["ducking"], "fairy": ["fairy"], "pixie": ["pixie"],
    "stepping": ["stepping"], "symposium": ["symposium", "symp."],
    "spinning": ["spinning"], "gyro-spyro": ["gyro", "spyro"],
    "inspinning": ["inspinning"], "atomic": ["atomic", "atom"], "quantum": ["quantum"],
    "whirl-swirl": ["whirl", "swirl"], "blender-torque": ["blender", "torque"],
    "dlo-double-down": ["dlo", "double down", "double-down", "dso", "double over down"],
    "eclipse-hop-over": ["eclipse", "hop-over", "hopover", "hop over"],
    "weaving": ["weaving"], "pogo": ["pogo"], "rail-rooted": ["rail", "rooted"],
    "blurry-furious": ["blurry", "furious", "nuclear"], "shooting": ["shooting"],
    "dragon-rake": ["dragon", "rake"], "paradox": ["paradox"],
}


def normalize(name: str) -> str:
    n = name.strip().lower()
    for q in '"\'“”‘’`':
        n = n.replace(q, "")
    return re.sub(r"\s+", " ", n).strip()


def name_tokens(name: str) -> list[str]:
    return re.findall(r"[a-zA-Z]+", name.lower())


def classify(name: str) -> tuple[str, dict[str, str]]:
    """Triage category. Priority F → D → B → E → C → A (exact mirror)."""
    signals: dict[str, str] = {}
    norm = normalize(name)
    tokens = set(name_tokens(name))
    orig = name.strip()
    if TRIVIAL_KICK_RE.match(orig):
        signals["match"] = "trivial-kick-or-delay"
        return "F", signals
    doctrine_hit = tokens & DOCTRINE_TOKENS
    if doctrine_hit:
        signals["doctrine_tokens"] = "|".join(sorted(doctrine_hit))
        return "D", signals
    if SLASH_ALT_RE.search(name):
        signals["match"] = "slash-alt-pair"
        return "B", signals
    if PAREN_FOLKNAME_RE.match(orig):
        if DIRECTIONAL_PAREN_RE.search(orig):
            signals["paren_kind"] = "directional-qualifier"
        else:
            signals["match"] = "folk-name-with-parenthetical-reading"
            return "B", signals
    stripped = orig
    if not stripped or len(stripped) < 2:
        signals["match"] = "too-short"
        return "E", signals
    if stripped.startswith("(") and stripped.endswith(")") and stripped.count("(") == 1:
        signals["match"] = "parenthetical-only-row"
        return "E", signals
    if stripped == stripped.lower():
        grammar_shorthand = {"ss", "op", "xbd", "del", "bod", "pdx", "dex"}
        if tokens & grammar_shorthand and not (tokens & CANONICAL_MODIFIERS):
            signals["match"] = "lowercase-grammar-shorthand"
            return "E", signals
    parser_leaks = {
        "components of sets, but not neccesssarily sets",
        "diving", "video moves", "fundamental moves", "footbag moves",
    }
    if norm in parser_leaks:
        signals["match"] = "known-parser-leak"
        return "E", signals
    mod_hits = tokens & CANONICAL_MODIFIERS
    dir_hits = tokens & DIRECTIONAL_TOKENS
    stack_depth = len(mod_hits) + len(dir_hits)
    if stack_depth >= 3:
        signals["stack_depth"] = str(stack_depth)
        signals["modifiers"] = "|".join(sorted(mod_hits))
        if dir_hits:
            signals["directionals"] = "|".join(sorted(dir_hits))
        return "C", signals
    if mod_hits:
        signals["modifiers"] = "|".join(sorted(mod_hits))
    signals["stack_depth"] = str(stack_depth)
    return "A", signals


def assign_ecosystems(name: str) -> list[str]:
    norm = normalize(name)
    return [eco for eco, triggers in ECOSYSTEMS.items() if any(t in norm for t in triggers)]


# ── Overlap normalization (for DB membership matching) ────────────────────────
_PAREN_RE = re.compile(r"\([^)]*\)")
_WS_RE = re.compile(r"\s+")


def norm_overlap(s: str) -> str:
    s = _PAREN_RE.sub("", s or "")
    s = s.strip().lower()
    for ch in "*'.\"“”‘’`":
        s = s.replace(ch, "")
    s = s.replace("-", " ")
    return _WS_RE.sub(" ", s).strip()


def source_corpus(sources: str) -> str:
    """Collapse the pipe/comma source string to a single corpus tag."""
    s = (sources or "").lower()
    parts = {p.strip() for p in re.split(r"[|,]", s) if p.strip()}
    if not parts:
        return "unknown"
    if len(parts) > 1:
        return "multi"
    only = next(iter(parts))
    for key in ("stanford", "passback", "footbagmoves", "fborg", "ifpa", "curator"):
        if key in only:
            return "ifpa-canonical" if key == "ifpa" else key
    return only


def main() -> None:
    # ── live DB (read-only) ──
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    rows = list(db.execute(
        "SELECT slug, canonical_name, aliases_json, trick_family, category, "
        "review_status, is_active FROM freestyle_tricks"))
    alias_rows = list(db.execute(
        "SELECT alias_slug, alias_text, trick_slug FROM freestyle_trick_aliases"))
    db.close()

    db_slugs = {r["slug"] for r in rows}
    db_name_norm = {norm_overlap(r["canonical_name"]) for r in rows}
    trick_family_by_slug = {r["slug"]: (r["trick_family"] or "") for r in rows}
    promoted_slugs = {r["slug"] for r in rows if r["is_active"] == 1}
    db_alias_norm: set[str] = set()
    for r in rows:
        try:
            for a in json.loads(r["aliases_json"] or "[]"):
                db_alias_norm.add(norm_overlap(a))
        except Exception:
            pass
    for a in alias_rows:
        db_alias_norm.add(norm_overlap(a["alias_text"]))
        db_alias_norm.add(norm_overlap(a["alias_slug"]))
    db_alias_norm.discard("")

    # ── spine ──
    with RECON_CSV.open(encoding="utf-8", errors="replace") as f:
        spine = list(csv.DictReader(f))

    out_rows = []
    cat_counter: Counter[str] = Counter()
    gov_counter: Counter[str] = Counter()
    comp_counter: Counter[str] = Counter()
    corpus_counter: Counter[str] = Counter()
    drift_now_canonical = 0          # CSV in_db=False but live DB has it
    overlap_state3 = 0               # state-3 rows that overlap canon (dedup candidates)
    retired_flagged = 0
    doctrine_by_eco: dict[str, int] = defaultdict(int)
    source_pair_counter: Counter[str] = Counter()

    for r in spine:
        name = r["name"]
        slug = r["slug"]
        gov = r["governance_state"]
        nnorm = norm_overlap(name)

        slug_overlap = slug in db_slugs
        name_overlap = nnorm in db_name_norm
        alias_overlap = nnorm in db_alias_norm
        in_db_live = slug_overlap or name_overlap or alias_overlap
        promoted = slug in promoted_slugs

        # family / parent / retired (skeleton-correct)
        fam = trick_family_by_slug.get(slug, "")
        parent = resolve_parent_family(fam) if fam else ""
        retired = (fam in RETIRED_FAMILIES) or (parent in RETIRED_FAMILIES) if fam else False
        if retired:
            retired_flagged += 1

        # category
        if gov.startswith("1"):
            category = "CANONICAL"
        elif in_db_live:
            category = "PROMOTED"          # spine still says observational, DB has it now
        elif gov.startswith("3"):
            category, _ = classify(name)
        elif gov.startswith("2"):
            category = "ALIASED"
        elif gov.startswith("4"):
            category = "PENDING-SYMBOLIC"
        elif gov.startswith("5"):
            category = "POLICY-DEPENDENT"
        elif gov.startswith("7"):
            category = "AMBIGUOUS"
        else:
            category = "OTHER"

        ecosystems = assign_ecosystems(name)

        rich = any((r.get("parse_confidence"), r.get("add_confidence"),
                    r.get("doctrine_status"), r.get("publication_status")))
        if in_db_live:
            completeness = "canonical"
        elif rich:
            completeness = "full"
        else:
            completeness = "name-only"

        corpus = source_corpus(r.get("sources", ""))

        # metrics
        gov_counter[gov[:1] or "?"] += 1
        cat_counter[category] += 1
        comp_counter[completeness] += 1
        corpus_counter[corpus] += 1
        if (r.get("in_db", "").strip().lower() in ("false", "")) and in_db_live and not gov.startswith("1"):
            drift_now_canonical += 1
        if gov.startswith("3") and in_db_live:
            overlap_state3 += 1
        if category == "D":
            for eco in ecosystems:
                doctrine_by_eco[eco] += 1
        try:
            ns = int(r.get("n_sources") or 0)
        except ValueError:
            ns = 0
        if ns >= 2:
            source_pair_counter[corpus] += 1

        o = dict(r)
        o.update({
            "category": category,
            "ecosystems": "|".join(ecosystems),
            "parent_family": parent,
            "retired_family": "yes" if retired else "",
            "in_db_live": "True" if in_db_live else "False",
            "promoted": "True" if promoted else "False",
            "overlaps_canonical": "True" if in_db_live else "False",
            "slug_overlap": "True" if slug_overlap else "False",
            "name_overlap": "True" if name_overlap else "False",
            "alias_overlap": "True" if alias_overlap else "False",
            "completeness": completeness,
            "source_corpus": corpus,
        })
        out_rows.append(o)

    # ── write CLASSIFIED_UNIVERSE.csv ──
    extra = ["category", "ecosystems", "parent_family", "retired_family",
             "in_db_live", "promoted", "overlaps_canonical", "slug_overlap",
             "name_overlap", "alias_overlap", "completeness", "source_corpus"]
    base_cols = list(spine[0].keys())
    cols = base_cols + [c for c in extra if c not in base_cols]
    with (OUT_DIR / "CLASSIFIED_UNIVERSE.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, quoting=csv.QUOTE_ALL, extrasaction="ignore")
        w.writeheader()
        w.writerows(out_rows)

    # ── summary ──
    lines = []
    lines.append("Phase E — unified classification summary")
    lines.append("=" * 50)
    lines.append(f"Total universe rows: {len(out_rows)}")
    lines.append("")
    lines.append("Governance state (first digit):")
    for k in sorted(gov_counter):
        lines.append(f"  state {k}: {gov_counter[k]}")
    lines.append("")
    lines.append("Category (A-F for state-3; CANONICAL/PROMOTED/etc for the rest):")
    for k, n in cat_counter.most_common():
        lines.append(f"  {k:<18s} {n}")
    lines.append("")
    lines.append("Completeness:")
    for k, n in comp_counter.most_common():
        lines.append(f"  {k:<12s} {n}")
    lines.append("")
    lines.append("Live-DB reconciliation:")
    lines.append(f"  rows whose live DB membership differs from the spine's stale in_db")
    lines.append(f"    (spine=observational but now canonical — W1-W9 drift): {drift_now_canonical}")
    lines.append(f"  state-3 rows that OVERLAP canon (dedup/removal candidates): {overlap_state3}")
    lines.append(f"  rows whose resolved family is a retired route-out: {retired_flagged}")
    lines.append("")
    lines.append("Source corpus:")
    for k, n in corpus_counter.most_common():
        lines.append(f"  {k:<16s} {n}")
    lines.append("")
    lines.append("Doctrine-block (category D) concentration by ecosystem:")
    for eco, n in sorted(doctrine_by_eco.items(), key=lambda kv: -kv[1]):
        lines.append(f"  {eco:<18s} {n}")
    summary = "\n".join(lines)
    (OUT_DIR / "classification_summary.txt").write_text(summary + "\n", encoding="utf-8")
    print(summary)
    print(f"\nWrote CLASSIFIED_UNIVERSE.csv ({len(out_rows)} rows) + classification_summary.txt")


if __name__ == "__main__":
    main()

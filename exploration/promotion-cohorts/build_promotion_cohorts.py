#!/usr/bin/env python3
"""
build_promotion_cohorts.py
==========================

Promotion-cohort + easy-JOB-backfill analyzer. Reads:

  - exploration/symbolic-master/symbolic_trick_master_YYYY-MM-DD.csv
  - database/footbag.db (modifier_links + modifier weights)

Emits:

  - exploration/promotion-cohorts/promotion_cohorts_YYYY-MM-DD.csv
        cohort-level rows with quality metrics
  - exploration/promotion-cohorts/easy_job_backfill_candidates_YYYY-MM-DD.csv
        per-trick rows where JOB notation is mechanically derivable
        from base + modifier without doctrine work

This is a read-only research utility. No DB writes, no UI changes,
no canonical promotions. The output is curator review surface.
"""

from __future__ import annotations

import csv
import glob
import json
import sqlite3
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MASTER_GLOB = ROOT / "exploration" / "symbolic-master" / "symbolic_trick_master_*.csv"
DB_PATH = ROOT / "database" / "footbag.db"
OUT_DIR = ROOT / "exploration" / "promotion-cohorts"
TODAY = date.today().isoformat()


# ───────────────────────────────────────────────────────────────────────────
# Inputs
# ───────────────────────────────────────────────────────────────────────────


def load_master() -> list[dict]:
    matches = sorted(glob.glob(str(MASTER_GLOB)))
    if not matches:
        print(f"FATAL: no master CSV found under {MASTER_GLOB}", file=sys.stderr)
        sys.exit(1)
    latest = matches[-1]
    print(f"Reading master CSV: {Path(latest).relative_to(ROOT)}")
    with open(latest, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    print(f"  -> {len(rows)} rows")
    return rows


def load_modifier_links() -> tuple[dict[str, list[str]], dict[str, dict]]:
    """Returns ({trick_slug: [modifier_slugs]}, {modifier_slug: {bonus, type}})."""
    if not DB_PATH.exists():
        return {}, {}
    conn = sqlite3.connect(str(DB_PATH))
    links: dict[str, list[str]] = defaultdict(list)
    for trick, mod in conn.execute(
        "SELECT trick_slug, modifier_slug FROM freestyle_trick_modifier_links ORDER BY trick_slug, apply_order"
    ):
        links[trick].append(mod)
    mods: dict[str, dict] = {}
    for slug, bonus, bonus_rot, mtype in conn.execute(
        "SELECT slug, add_bonus, add_bonus_rotational, modifier_type FROM freestyle_trick_modifiers"
    ):
        mods[slug] = {"add_bonus": bonus, "add_bonus_rotational": bonus_rot, "modifier_type": mtype}
    conn.close()
    return dict(links), mods


def load_base_op_notation() -> dict[str, str]:
    """Map base trick slug -> operational_notation (canonical bracket form
    when present). Used to detect base-has-JOB for backfill candidates."""
    if not DB_PATH.exists():
        return {}
    conn = sqlite3.connect(str(DB_PATH))
    out: dict[str, str] = {}
    for slug, op in conn.execute(
        "SELECT slug, operational_notation FROM freestyle_tricks WHERE is_active = 1"
    ):
        if op and op.strip():
            out[slug] = op.strip()
    conn.close()
    return out


def load_tracked_names_fm() -> dict[str, str]:
    """Parse src/content/freestyleTrackedNames.ts for FM-format operational
    notation. Returns {slug: fm_string}. Lightweight regex parser;
    deterministic since the file is auto-generated."""
    src = ROOT / "src" / "content" / "freestyleTrackedNames.ts"
    if not src.exists():
        return {}
    import re
    pattern = re.compile(
        r"slug:\s*'([^']+)'[^}]*operationalNotation:\s*'([^']+)'",
        re.DOTALL,
    )
    out: dict[str, str] = {}
    for m in pattern.finditer(src.read_text(encoding="utf-8")):
        slug, fm = m.group(1), m.group(2)
        out[slug] = fm
    return out


# ───────────────────────────────────────────────────────────────────────────
# Cohort assignment
# ───────────────────────────────────────────────────────────────────────────


# Hierarchical cohort assignment: each row gets at most one primary
# cohort, based on the first matching rule. Ordering matters - more
# specific cohorts come first.
COHORT_RULES = [
    # Set-modifier families (entry-surface convention)
    ("fairy",         lambda mods, family, _shorthand: "fairy" in mods),
    ("pixie",         lambda mods, family, _shorthand: "pixie" in mods),
    ("quantum",       lambda mods, family, _shorthand: "quantum" in mods),
    ("nuclear",       lambda mods, family, _shorthand: "nuclear" in mods),
    ("atomic",        lambda mods, family, _shorthand: "atomic" in mods),
    # Body-modifier families
    ("gyro",          lambda mods, family, _shorthand: "gyro" in mods),
    ("spinning",      lambda mods, family, _shorthand: "spinning" in mods),
    ("ducking",       lambda mods, family, _shorthand: "ducking" in mods),
    ("symposium",     lambda mods, family, _shorthand: "symposium" in mods),
    ("stepping",      lambda mods, family, _shorthand: "stepping" in mods),
    ("paradox",       lambda mods, family, _shorthand: "paradox" in mods),
    ("tapping",       lambda mods, family, _shorthand: "tapping" in mods),
    ("blurry",        lambda mods, family, _shorthand: "blurry" in mods),
    ("barraging",     lambda mods, family, _shorthand: "barraging" in mods),
    ("whirling",      lambda mods, family, _shorthand: "whirling" in mods),
    # Base-family descendants (no modifier match)
    ("whirl-descendants",   lambda mods, family, _shorthand: family == "whirl"),
    ("swirl-descendants",   lambda mods, family, _shorthand: family == "swirl"),
    ("mirage-descendants",  lambda mods, family, _shorthand: family == "mirage"),
    ("butterfly-descendants", lambda mods, family, _shorthand: family == "butterfly"),
    ("osis-descendants",    lambda mods, family, _shorthand: family == "osis"),
    ("legover-descendants", lambda mods, family, _shorthand: family == "legover"),
    ("torque-descendants",  lambda mods, family, _shorthand: family == "torque"),
    ("blender-descendants", lambda mods, family, _shorthand: family == "blender"),
    ("clipper-descendants", lambda mods, family, _shorthand: family in ("clipper", "clipper-stall")),
    ("drifter-descendants", lambda mods, family, _shorthand: family == "drifter"),
    # Shorthand-only signal cohorts
    ("stanford-double-dex", lambda mods, family, shorthand: _double_dex_only(shorthand)),
    ("stanford-spin-compounds", lambda mods, family, shorthand: _has_spin(shorthand)),
    ("stanford-duck-dive",  lambda mods, family, shorthand: _has_duck_or_dive(shorthand)),
]


def _double_dex_only(components: list[str]) -> bool:
    """Two-dex shorthand with no body modifier and a clean set."""
    dex_count = sum(1 for c in components if "dex" in c)
    has_body = any(c in {"duck", "dive", "forward-spin", "backward-spin", "no-plant-while"} for c in components)
    return dex_count == 2 and not has_body


def _has_spin(components: list[str]) -> bool:
    return any(c in ("forward-spin", "backward-spin") for c in components)


def _has_duck_or_dive(components: list[str]) -> bool:
    return any(c in ("duck", "dive") for c in components)


def assign_cohort(modifier_links: list[str], family: str, components: list[str]) -> str:
    mods = set(modifier_links)
    for name, rule in COHORT_RULES:
        if rule(mods, family, components):
            return name
    return "other"


# ───────────────────────────────────────────────────────────────────────────
# Risk tier + backfill detection
# ───────────────────────────────────────────────────────────────────────────


COMPOSITE_MODIFIER_FLAG = {
    # These modifiers expand into multi-token sequences or carry
    # unresolved doctrine; the curator's "needs review" bucket.
    "blurry", "surging", "furious", "gyro",
}
# Whirl-family base ambiguity, inspinning composite, etc.
DOCTRINE_SENSITIVE_BASES = {
    "blender",  # paradox-blender base needs blender JOB confirmation
    "drifter",  # reverse-drifter JOB chained
    "high-plains-drifter",
}


def classify_risk(
    modifiers: list[str],
    base: str,
    has_op_notation: bool,
    base_has_op_notation: bool,
    parseable: bool,
    publication_status: str,
) -> str:
    """LOW / MEDIUM / HIGH risk classifier."""
    if publication_status == "stanford_only_unpublished" and not parseable:
        return "HIGH"
    if any(m in COMPOSITE_MODIFIER_FLAG for m in modifiers):
        return "HIGH"
    if base and base in DOCTRINE_SENSITIVE_BASES and not base_has_op_notation:
        return "HIGH"
    if len(modifiers) >= 3:
        return "MEDIUM"
    if not base or not base_has_op_notation:
        # Base trick has no published JOB - can't mechanically derive.
        return "MEDIUM"
    if has_op_notation:
        return "LOW"  # already complete
    if base_has_op_notation and len(modifiers) <= 2 and parseable:
        return "LOW"
    return "MEDIUM"


def is_backfill_candidate(
    publication_status: str,
    op_notation: str,
    modifiers: list[str],
    base: str,
    base_has_op_notation: bool,
    fm_has_notation: bool,
    stanford_parseable: bool,
) -> tuple[bool, str]:
    """A row is a JOB-backfill candidate when its canonical
    operational_notation is empty AND at least one of these sources
    can fill it without doctrine work:
      1. modifier-stack: modifier_links + base.JOB (the strict path)
      2. FM source: a parens-form JOB authored in freestyleTrackedNames
      3. Stanford: parseable shorthand authored in stanford-2.txt

    Returns (is_candidate, source_label).
    """
    if publication_status != "canonical":
        return (False, "")
    if op_notation:
        return (False, "")
    if any(m in COMPOSITE_MODIFIER_FLAG for m in modifiers):
        return (False, "composite-modifier-hold")

    # Path 1: modifier-stack mechanical
    if modifiers and base and base_has_op_notation:
        return (True, "modifier-stack")
    # Path 2: FM source authored
    if fm_has_notation:
        return (True, "fm-source")
    # Path 3: Stanford parseable
    if stanford_parseable:
        return (True, "stanford-parseable")
    return (False, "")


def suggest_job(
    modifiers: list[str],
    base: str,
    base_op_notation: str,
    mod_table: dict[str, dict],
) -> tuple[str, str, str]:
    """Return (suggested_job, confidence, derivation_note).

    Convention: prepend each modifier in apply_order as the
    entry-position token in canonical-bracket form. The exact entry
    position varies per modifier; for a *suggestion* we surface the
    structure and explicitly flag the curator-locked rule slot.
    """
    if not modifiers or not base_op_notation:
        return ("", "low", "missing inputs")

    # Single-modifier compounds: most reliable.
    if len(modifiers) == 1:
        mod = modifiers[0]
        # Conservative suggestion - we DO NOT auto-insert into the
        # canonical form; we annotate with the modifier+base pattern.
        suggested = f"<MOD:{mod.upper()}> > {base_op_notation}"
        return (suggested, "medium", f"{mod} prepended to {base} JOB; curator chooses entry-position token")

    # Two-modifier: order-sensitive; curator should review.
    if len(modifiers) == 2:
        m1, m2 = modifiers
        suggested = f"<MOD:{m1.upper()}> > <MOD:{m2.upper()}> > {base_op_notation}"
        return (suggested, "low", f"two-modifier stack ({m1} + {m2}); curator confirms ordering")

    return ("", "low", "more than two modifiers; curator-authored required")


# ───────────────────────────────────────────────────────────────────────────
# Aggregate cohort metrics
# ───────────────────────────────────────────────────────────────────────────


def aggregate_cohorts(rows: list[dict]) -> list[dict]:
    """Reduce per-trick rows to cohort-level rows with quality stats."""
    buckets: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        buckets[r["cohort"]].append(r)

    out: list[dict] = []
    for cohort_name, members in sorted(buckets.items(), key=lambda kv: -len(kv[1])):
        canonical = [m for m in members if m["publication_status"] == "canonical"]
        stanford_only = [m for m in members if m["publication_status"] == "stanford_only_unpublished"]
        has_op = [m for m in canonical if m["operational_notation"]]
        backfill_ready = [m for m in members if m["is_backfill_candidate"] == "true"]
        parseable = [m for m in members if m["stanford_parseable"] == "true"]
        low_risk = [m for m in members if m["risk_tier"] == "LOW"]
        medium_risk = [m for m in members if m["risk_tier"] == "MEDIUM"]
        high_risk = [m for m in members if m["risk_tier"] == "HIGH"]

        # readiness score: higher = more bulk-promotable
        n = len(members)
        readiness = (
            (len(low_risk) * 3) +
            (len(parseable) * 1) +
            (len(has_op) * 2) -
            (len(high_risk) * 4)
        ) / max(n, 1)

        notation_quality = (len(has_op) / max(len(canonical), 1)) if canonical else 0.0
        shorthand_coverage = (len(parseable) / max(n, 1)) if n else 0.0
        source_agreement = (len([m for m in members if m["shorthand_status"] == "stanford_canonical_match"]) / max(n, 1)) if n else 0.0

        out.append({
            "cohort_name":           cohort_name,
            "trick_count":           n,
            "canonical_count":       len(canonical),
            "stanford_only_count":   len(stanford_only),
            "has_op_notation":       len(has_op),
            "backfill_candidates":   len(backfill_ready),
            "parseable_shorthand":   len(parseable),
            "risk_low":              len(low_risk),
            "risk_medium":           len(medium_risk),
            "risk_high":             len(high_risk),
            "notation_quality":      f"{notation_quality:.2f}",
            "shorthand_coverage":    f"{shorthand_coverage:.2f}",
            "source_agreement":      f"{source_agreement:.2f}",
            "promotion_readiness":   f"{readiness:.2f}",
            "example_slugs":         "|".join([m["slug"] for m in members[:5]]),
        })

    out.sort(key=lambda c: -float(c["promotion_readiness"]))
    return out


# ───────────────────────────────────────────────────────────────────────────
# Output
# ───────────────────────────────────────────────────────────────────────────


COHORT_COLUMNS = [
    "cohort_name", "trick_count", "canonical_count", "stanford_only_count",
    "has_op_notation", "backfill_candidates", "parseable_shorthand",
    "risk_low", "risk_medium", "risk_high",
    "notation_quality", "shorthand_coverage", "source_agreement",
    "promotion_readiness", "example_slugs",
]

BACKFILL_COLUMNS = [
    "slug", "current_status", "family", "base_trick", "modifiers",
    "source_notation_canonical_bracket", "source_notation_fm",
    "source_notation_stanford", "suggested_job", "suggested_job_confidence",
    "derived_from", "parser_status", "doctrine_risk",
    "official_add", "cohort",
]


def main() -> int:
    master = load_master()
    mod_links, mod_weights = load_modifier_links()
    base_op = load_base_op_notation()
    fm_notation = load_tracked_names_fm()
    print(f"  -> {sum(len(v) for v in mod_links.values())} modifier links across {len(mod_links)} tricks")
    print(f"  -> {len(base_op)} bases with authored JOB notation")
    print(f"  -> {len(fm_notation)} tracked-name FM-format JOB strings")

    enriched: list[dict] = []
    for r in master:
        slug = r["slug"]
        modifiers = mod_links.get(slug, [])
        components = json.loads(r["stanford_components"]) if r["stanford_components"] else []
        family = r["family"]
        base = r["base_trick"]
        op_notation = r["operational_notation"]
        publication_status = r["publication_status"]
        parseable = r["stanford_parseable"] == "true"
        base_has_op = base in base_op

        fm_op = fm_notation.get(slug, "")
        cohort = assign_cohort(modifiers, family, components)
        risk = classify_risk(modifiers, base, bool(op_notation), base_has_op, parseable, publication_status)
        is_backfill, backfill_source = is_backfill_candidate(
            publication_status, op_notation, modifiers, base, base_has_op,
            bool(fm_op), parseable,
        )
        if is_backfill and backfill_source == "modifier-stack":
            suggested_job, suggested_confidence, derivation = suggest_job(
                modifiers, base, base_op.get(base, ""), mod_weights,
            )
        elif is_backfill and backfill_source == "fm-source":
            suggested_job, suggested_confidence, derivation = (
                fm_op, "fm-authored", "FM-format JOB from trackedNames; curator re-brackets for canonical-bracket form",
            )
        elif is_backfill and backfill_source == "stanford-parseable":
            stanford_str = r["stanford_symbolic"]
            suggested_job, suggested_confidence, derivation = (
                f"<STANFORD:{stanford_str}>", "stanford-only",
                "Stanford shorthand parseable; curator translates to canonical-bracket per token map",
            )
        else:
            suggested_job, suggested_confidence, derivation = ("", "", "")

        enriched.append({
            **r,
            "cohort":                 cohort,
            "modifiers_list":         "|".join(modifiers),
            "risk_tier":              risk,
            "is_backfill_candidate":  "true" if is_backfill else "false",
            "backfill_source":        backfill_source,
            "fm_op_notation":         fm_op,
            "suggested_job":          suggested_job,
            "suggested_job_confidence": suggested_confidence,
            "derivation_note":        derivation,
        })

    # Backfill candidate rows
    backfill_rows: list[dict] = []
    for r in enriched:
        if r["is_backfill_candidate"] != "true":
            continue
        # parser_status: heuristic. Mark as 'clean' when stanford
        # parseable AND single-or-double modifier AND base has op.
        modifiers = r["modifiers_list"].split("|") if r["modifiers_list"] else []
        if len(modifiers) <= 1 and r["stanford_parseable"] == "true":
            parser_status = "parser-clean"
        elif len(modifiers) <= 2:
            parser_status = "parser-needs-review"
        else:
            parser_status = "parser-complex"

        doctrine_risk = "low" if r["risk_tier"] == "LOW" else "medium"
        backfill_rows.append({
            "slug":                              r["slug"],
            "current_status":                    r["publication_status"],
            "family":                            r["family"],
            "base_trick":                        r["base_trick"],
            "modifiers":                         r["modifiers_list"],
            "source_notation_canonical_bracket": r["operational_notation"],
            "source_notation_fm":                r["fm_op_notation"],
            "source_notation_stanford":          r["stanford_symbolic"],
            "suggested_job":                     r["suggested_job"],
            "suggested_job_confidence":          r["suggested_job_confidence"],
            "derived_from":                      r["derivation_note"],
            "parser_status":                     parser_status,
            "doctrine_risk":                     doctrine_risk,
            "official_add":                      r["official_add"],
            "cohort":                            r["cohort"],
        })

    cohort_rows = aggregate_cohorts(enriched)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cohort_csv = OUT_DIR / f"promotion_cohorts_{TODAY}.csv"
    with cohort_csv.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COHORT_COLUMNS)
        w.writeheader()
        for row in cohort_rows:
            w.writerow(row)
    print(f"Wrote {cohort_csv.relative_to(ROOT)} ({len(cohort_rows)} cohorts)")

    backfill_csv = OUT_DIR / f"easy_job_backfill_candidates_{TODAY}.csv"
    backfill_rows.sort(key=lambda r: (r["doctrine_risk"], r["parser_status"], r["slug"]))
    with backfill_csv.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=BACKFILL_COLUMNS)
        w.writeheader()
        for row in backfill_rows:
            w.writerow(row)
    print(f"Wrote {backfill_csv.relative_to(ROOT)} ({len(backfill_rows)} candidates)")

    # Summary stats
    print("\n=== Summary ===")
    print(f"Total master rows analysed: {len(enriched)}")
    print(f"Cohorts identified:         {len(cohort_rows)}")
    print(f"Backfill candidates:        {len(backfill_rows)}")
    risk_dist = defaultdict(int)
    for r in enriched:
        risk_dist[r["risk_tier"]] += 1
    print(f"Risk distribution:          {dict(risk_dist)}")
    print()
    print("Top 10 cohorts by promotion-readiness:")
    for c in cohort_rows[:10]:
        print(f"  {c['cohort_name']:35s} n={c['trick_count']:3d} ready={c['promotion_readiness']:>6s} backfill={c['backfill_candidates']:3d}")

    return 0


if __name__ == "__main__":
    sys.exit(main())

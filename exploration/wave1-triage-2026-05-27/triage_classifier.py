"""
Wave 1 — Structured triage of the post-W0 state-3 observational corpus.

Read-only classifier. For each row in RECONCILIATION.csv whose governance_state
starts with '3', assigns:

  - one primary category (A safe-promote / B alias / C structural-expansion /
                          D doctrine-sensitive / E weak-source / F trivial)
  - zero or more ecosystem tags
  - a per-row signal trace for auditability

Outputs to exploration/wave1-triage-2026-05-27/:

  triage_classified.csv          — every state-3 row + category + ecosystems
  by_category/A-safe.csv         — Category A subset
  by_category/B-alias.csv        — Category B subset
  by_category/C-structural.csv   — Category C subset
  by_category/D-doctrine.csv     — Category D subset
  by_category/E-weak.csv         — Category E subset
  by_category/F-trivial.csv      — Category F subset
  by_ecosystem/<name>.csv        — per-ecosystem subsets
  summary.txt                    — counts by category + ecosystem

No writes to RECONCILIATION.csv. No promotion. No alias inference. No ontology
invention. Pure mechanical classification per the 2026-05-27 user direction.
"""
from __future__ import annotations

import csv
import re
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RECON_CSV = REPO_ROOT / "exploration/vocabulary-reconciliation-audit-2026-05-21/RECONCILIATION.csv"
OUT_DIR = Path(__file__).resolve().parent

# ── Category D: doctrine-sensitive tokens (per 2026-05-27 user instruction) ──
# Any state-3 row whose normalized name contains one of these tokens lands in
# Category D quarantine — promotion is blocked pending curator/Red resolution.
DOCTRINE_TOKENS = {
    "blurry", "blurriest", "blurrier", "blurrage", "blurrier",
    "furious",
    "nuclear",
    "illusioning",
    "shooting",
    "weaving",
    "rooted", "antisymposium",
    "pogo",
}

# ── Category F: trivial primitive-contact patterns ──
# Bare body-surface kicks/delays where no compositional structure is present.
# Per the kick-canonical-vocabulary-scope governance rule.
TRIVIAL_KICK_RE = re.compile(
    r"^(toe|heel|inside|outside|knee|shoulder)\s*(kick|delay)$",
    re.IGNORECASE,
)

# ── Category B: alias / compression signals ──
# Slash-pair (folk-alt linking): "Aeon Flux / Nucleosis"
# Parenthetical-structural-reading: "Atom Smasher (Atomic Mirage)" — folk + struct
SLASH_ALT_RE = re.compile(r"\s*/\s*")
PAREN_FOLKNAME_RE = re.compile(r"^[^(]+\([^)]+\)\s*$")

# ── Category E: weak-source signals ──
# - All-lowercase or all-uppercase short names (likely parser leftovers)
# - Names with structural-grammar shorthand ('ss', 'op', 'xbd' as standalone tokens
#   without surrounding canonical-modifier context — these are notation fragments)
# - Names with NO recognizable ecosystem token AND <= 2 alphabetic tokens
PARSER_LEFTOVER_RE = re.compile(r"^[\s\-]*$|^[(]")  # whitespace/dashes only OR starts with '('

# ── Modifier vocabulary for stack-depth counting (Category C threshold) ──
# Canonical modifier-class tokens. A name with 3+ stacked modifiers is treated
# as a structural expansion variant (Category C), warranting ecosystem-coherent
# curator review rather than mechanical bulk promotion.
CANONICAL_MODIFIERS = {
    "atomic", "ducking", "fairy", "gyro", "spyro",
    "inspinning", "paradox", "pixie", "quantum",
    "spinning", "stepping", "symposium", "whirling",
    "surging", "blistering", "miraging", "barraging",
    "tapping", "slapping",
}

# Positional / directional / count tokens that contribute to "stack depth"
# but only when paired with canonical modifiers.
DIRECTIONAL_TOKENS = {
    "far", "near", "reverse", "op", "ss", "op-side", "same-side",
    "double", "triple", "backside", "frontside", "alpine",
}

# ── Ecosystem grouping ──
# Maps each ecosystem to the trigger tokens that signal membership. A row can
# belong to multiple ecosystems (e.g. "fairy ducking butterfly" → fairy AND
# ducking AND butterfly-family). Used for per-ecosystem report partitioning.
ECOSYSTEMS: dict[str, list[str]] = {
    "ducking":             ["ducking"],
    "fairy":               ["fairy"],
    "pixie":               ["pixie"],
    "stepping":            ["stepping"],
    "symposium":           ["symposium", "symp."],
    "spinning":            ["spinning"],
    "gyro-spyro":          ["gyro", "spyro"],
    "inspinning":          ["inspinning"],
    "atomic":              ["atomic", "atom"],
    "quantum":             ["quantum"],
    "whirl-swirl":         ["whirl", "swirl"],
    "blender-torque":      ["blender", "torque"],
    "dlo-double-down":     ["dlo", "double down", "double-down", "dso", "double over down"],
    "eclipse-hop-over":    ["eclipse", "hop-over", "hopover", "hop over"],
    "weaving":             ["weaving"],
    "pogo":                ["pogo"],
    "rail-rooted":         ["rail", "rooted"],
    "blurry-furious":      ["blurry", "furious", "nuclear"],
    "shooting":            ["shooting"],
    "dragon-rake":         ["dragon", "rake"],
    "paradox":             ["paradox"],
}


def normalize(name: str) -> str:
    n = name.strip().lower()
    for q in '"\'“”‘’`':
        n = n.replace(q, "")
    return re.sub(r"\s+", " ", n).strip()


def name_tokens(name: str) -> list[str]:
    """Split a name into lowercase alphabetic tokens for stack-depth counting."""
    return re.findall(r"[a-zA-Z]+", name.lower())


# ── Classification ───────────────────────────────────────────────────────

# Parentheticals that signal a DIRECTIONAL/POSITIONAL modifier (Cat A annotation
# variant), NOT a folk-alt reading. Names like "Fairy DLO (ss)" or "Atomic
# Legover (same side)" carry a directional qualifier — they are NOT Cat B
# aliases; the parenthetical is part of the directional descriptor.
DIRECTIONAL_PAREN_RE = re.compile(
    r"\((same\s*side|ss|op|opposite\s*side|far|near|reverse|rev|in|out)\)",
    re.IGNORECASE,
)


def classify(name: str) -> tuple[str, dict[str, str]]:
    """Returns (category_letter, signal-trace dict).

    Priority order: F → D → B → E → C → A.

    D before E so doctrine-sensitive rows are not silently swallowed by the
    weak-source check (e.g. "Nuclear ss Butterfly" → D, not E).
    B before E so legitimate folk-alt pairs are not lost to E.
    """
    signals: dict[str, str] = {}
    norm = normalize(name)
    tokens = set(name_tokens(name))
    orig = name.strip()

    # ── F: trivial primitive-contact ──
    if TRIVIAL_KICK_RE.match(orig):
        signals["match"] = "trivial-kick-or-delay-without-structure"
        return "F", signals

    # ── D: doctrine-sensitive token (must check before E so D wins) ──
    doctrine_hit = tokens & DOCTRINE_TOKENS
    if doctrine_hit:
        signals["doctrine_tokens"] = "|".join(sorted(doctrine_hit))
        return "D", signals

    # ── B: alias / compression / synonym ──
    # Slash-pair indicates a folk-alt link.
    if SLASH_ALT_RE.search(name):
        signals["match"] = "slash-alt-pair"
        return "B", signals
    # Parenthetical reading. Distinguish:
    #   "Atom Smasher (Atomic Mirage)"  → folk-name + structural reading → B
    #   "Fairy DLO (ss)"                → directional qualifier         → not B
    if PAREN_FOLKNAME_RE.match(orig):
        if DIRECTIONAL_PAREN_RE.search(orig):
            signals["paren_kind"] = "directional-qualifier"
            # Don't classify as B; fall through to A/C.
        else:
            signals["match"] = "folk-name-with-parenthetical-reading"
            return "B", signals

    # ── E: weak-source / parser leftover (after D so doctrine wins) ──
    stripped = orig
    if not stripped or len(stripped) < 2:
        signals["match"] = "too-short"
        return "E", signals
    # Starts with "(" — parenthetical-only entry (parser leftover).
    if stripped.startswith("(") and stripped.endswith(")") and stripped.count("(") == 1:
        signals["match"] = "parenthetical-only-row"
        return "E", signals
    # Original-case check: all-lowercase original (not the normalized copy)
    # combined with grammar-shorthand-only tokens = parser leftover style.
    if stripped == stripped.lower():
        grammar_shorthand = {"ss", "op", "xbd", "del", "bod", "pdx", "dex"}
        if tokens & grammar_shorthand and not (tokens & CANONICAL_MODIFIERS):
            signals["match"] = "lowercase-grammar-shorthand"
            return "E", signals
    # Known parser-leak strings.
    parser_leaks = {
        "components of sets, but not neccesssarily sets",
        "diving", "video moves", "fundamental moves", "footbag moves",
    }
    if norm in parser_leaks:
        signals["match"] = "known-parser-leak"
        return "E", signals

    # ── C: structural-expansion variant (3+ modifier stack) ──
    mod_hits = tokens & CANONICAL_MODIFIERS
    dir_hits = tokens & DIRECTIONAL_TOKENS
    stack_depth = len(mod_hits) + len(dir_hits)
    if stack_depth >= 3:
        signals["stack_depth"] = str(stack_depth)
        signals["modifiers"] = "|".join(sorted(mod_hits))
        if dir_hits:
            signals["directionals"] = "|".join(sorted(dir_hits))
        return "C", signals

    # ── A: default safe-mechanical-promotion candidate ──
    if mod_hits:
        signals["modifiers"] = "|".join(sorted(mod_hits))
    signals["stack_depth"] = str(stack_depth)
    return "A", signals


def assign_ecosystems(name: str) -> list[str]:
    """Return all ecosystems this name participates in."""
    norm = normalize(name)
    eco: list[str] = []
    for eco_name, triggers in ECOSYSTEMS.items():
        if any(t in norm for t in triggers):
            eco.append(eco_name)
    return eco


# ── Main ──

def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "by_category").mkdir(exist_ok=True)
    (OUT_DIR / "by_ecosystem").mkdir(exist_ok=True)

    # Read state-3 rows.
    state3_rows: list[dict[str, str]] = []
    with RECON_CSV.open(encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            if row["governance_state"].startswith("3"):
                state3_rows.append(row)

    # Classify each row.
    classified: list[dict[str, str]] = []
    cat_counter: Counter[str] = Counter()
    eco_counter: Counter[str] = Counter()
    cat_by_eco: dict[str, Counter[str]] = defaultdict(Counter)

    for row in state3_rows:
        name = row["name"]
        category, signals = classify(name)
        ecosystems = assign_ecosystems(name)

        out = {
            "name":      name,
            "slug":      row["slug"],
            "sources":   row["sources"],
            "category":  category,
            "ecosystems": "|".join(ecosystems),
            "signal_trace": ";".join(f"{k}={v}" for k, v in signals.items()),
        }
        classified.append(out)
        cat_counter[category] += 1
        for eco in ecosystems:
            eco_counter[eco] += 1
            cat_by_eco[eco][category] += 1

    # ── Outputs ──

    # Single per-row CSV.
    fieldnames = ["name", "slug", "sources", "category", "ecosystems", "signal_trace"]
    with (OUT_DIR / "triage_classified.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(classified)

    # By-category subsets.
    cat_labels = {
        "A": "A-safe", "B": "B-alias", "C": "C-structural",
        "D": "D-doctrine", "E": "E-weak", "F": "F-trivial",
    }
    for cat, label in cat_labels.items():
        rows = [r for r in classified if r["category"] == cat]
        with (OUT_DIR / "by_category" / f"{label}.csv").open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
            w.writeheader()
            w.writerows(rows)

    # By-ecosystem subsets.
    for eco in sorted(eco_counter.keys()):
        rows = [r for r in classified if eco in r["ecosystems"].split("|")]
        with (OUT_DIR / "by_ecosystem" / f"{eco}.csv").open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
            w.writeheader()
            w.writerows(rows)

    # Summary report.
    with (OUT_DIR / "summary.txt").open("w", encoding="utf-8") as f:
        f.write(f"Wave 1 — Triage classification summary\n")
        f.write("=" * 50 + "\n\n")
        f.write(f"Total state-3 observational rows: {len(state3_rows)}\n\n")
        f.write("By category:\n")
        for cat in "ABCDEF":
            n = cat_counter.get(cat, 0)
            pct = 100 * n / len(state3_rows) if state3_rows else 0
            f.write(f"  {cat}  {n:>5d}  ({pct:>5.1f}%)  {cat_labels[cat]}\n")
        rows_no_eco = sum(1 for r in classified if not r["ecosystems"])
        f.write(f"\nRows with NO ecosystem tag: {rows_no_eco} ({100*rows_no_eco/len(state3_rows):.1f}%)\n")
        f.write("\nBy ecosystem (with category breakdown):\n")
        for eco, count in eco_counter.most_common():
            cats = cat_by_eco[eco]
            cat_str = " ".join(f"{c}={cats[c]}" for c in "ABCDEF" if cats[c] > 0)
            f.write(f"  {eco:<22s}  total={count:>4d}   {cat_str}\n")

    print(f"Total state-3 rows: {len(state3_rows)}")
    print(f"By category: {dict(cat_counter)}")
    print(f"Outputs in: {OUT_DIR}")


if __name__ == "__main__":
    main()

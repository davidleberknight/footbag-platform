#!/usr/bin/env python3
"""ADD-conflict audit -- compare stated vs computed ADD across IFPA / PassBack / FM.

Reads:
  - database/footbag.db                                        (freestyle_tricks: 161 rows)
  - exploration/footbagmoves-federation/FM_MATH_DIVERGENCES.csv (23 rows; pre-classified)
  - exploration/passback-intake/passback_trick_sources.csv     (283 rows; passback_dex_count)
  - src/content/freestyleOperatorReference.ts                  (NF-2A operators; pendingNote / decomposition)

Writes (to exploration/add-conflict-audit/):
  - ADD_CONFLICT_MATRIX.csv  : one row per (trick, source) tuple where a comparison exists

Read-only. Deterministic. No DB mutation.

Per ADD_FORMULA_ASSUMPTIONS.md: stated ADD is preserved; computed ADD is diagnostic only.
Per feedback_frequency_not_authority.md: computed ADD is evidence, not authority.
"""
from __future__ import annotations

import csv
import re
import sqlite3
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DB = REPO / "database/footbag.db"
FM_DIV = REPO / "exploration/footbagmoves-federation/FM_MATH_DIVERGENCES.csv"
PB_TRICKS = REPO / "exploration/passback-intake/passback_trick_sources.csv"
OUT_DIR = REPO / "exploration/add-conflict-audit"

# --- formula table (mirrors ADD_FORMULA_ASSUMPTIONS.md) -------------------

BASE_ADD = {
    "around-the-world": 2, "atw": 2,
    "butterfly": 3,
    "clipper": 1, "clipper-stall": 1,
    "fairy": 2,                       # base-only; fairy-as-modifier is q4_blocked
    "guay": 2,
    "illusion": 2,
    "legover": 2,
    "mirage": 2,
    "osis": 3,
    "pickup": 2,
    "pixie": 2,                       # base; pixie-as-modifier is +1
    "swirl": 3,
    "whirl": 3,
    "eggbeater": 3,
    "drifter": 3,
    "torque": 4,
    "blender": 4,
    "dyno": 4,
    "reverse-drifter": 4,
    "tap": 3,                         # per FM_MATH_DIVERGENCES 'Tap Dance' row
}

# Tier-1 + locked modifiers
MOD_LOCKED = {
    "ducking": 1, "paradox": 1, "spinning": 1, "stepping": 1,
    "symposium": 1, "symp": 1, "symp.": 1, "symple": 1,
    "tapping": 1, "diving": 1,
    "pixie": 1, "quantum": 1,
    "nuclear": 2,
    "blurry": 1,
    "miraging": 1, "whirling": 1, "illusioning": 1,
    "terraging": 3,
    "barraging": 1,
}

# Atomic is policy-dependent on base rotational class.
ROTATIONAL_BASES = {"whirl", "swirl", "torque", "drifter", "blender", "dyno", "reverse-drifter"}

# Q4-blocked / unresolved
Q4_OPS = {
    "fairy", "gyro", "blazing", "surging", "railing", "flailing",
    "splicing", "surfing", "twinspinning", "jolimont", "smiling",
    "spyro", "bubba", "neutron", "dragon",
    "sailing", "slaying", "frantic", "phasing", "leaning", "hyper",
    "pogo", "quasi", "riffing", "slicing", "furious",
}

# Zero-weight operators (positional, directional, temporal, quantifier).
ZERO_OPS = {
    "ss", "far", "near", "op", "os", "set",
    "reverse", "inspinning",
    "uptime", "downtime", "midtime", "rooted",
    "double", "triple", "full",
}

TEMPORAL_RE = re.compile(r"\((uptime|downtime|midtime|rooted|no plant while)\)", re.IGNORECASE)


# --- helpers ---------------------------------------------------------------

def norm(t: str) -> str:
    return t.strip().lower().rstrip(",.;:")


def tokenize(tn: str) -> list[str]:
    if not tn:
        return []
    s = TEMPORAL_RE.sub(" ", tn.strip())
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[>›⟫]", " ", s)
    tokens = re.split(r"[\s,/]+", s)
    return [t for t in tokens if t.strip()]


def compute_add_from_tokens(tokens: list[str]) -> tuple[int | None, str, list[str]]:
    """Compute ADD from a token list. Returns (value, formula, unresolved_tokens)."""
    if not tokens:
        return None, "", []
    # Last non-zero-op token is the base; remaining are modifiers.
    # We walk left-to-right, accumulating modifier weights; the rightmost
    # non-modifier non-zero-op token is the base.
    base_token = None
    modifiers: list[tuple[str, int]] = []
    unresolved: list[str] = []
    for t in reversed(tokens):
        n = norm(t)
        if n in BASE_ADD and base_token is None:
            base_token = n
            break
    if base_token is None:
        return None, "no recognized base", [norm(t) for t in tokens if norm(t) not in MOD_LOCKED and norm(t) not in ZERO_OPS]

    base_add = BASE_ADD[base_token]
    is_rotational_base = base_token in ROTATIONAL_BASES
    formula_parts = []

    for t in tokens:
        n = norm(t)
        if n == base_token:
            formula_parts.append(f"{n}({base_add})")
            continue
        if n in ZERO_OPS:
            formula_parts.append(f"{n}(+0)")
            continue
        if n in MOD_LOCKED:
            w = MOD_LOCKED[n]
            formula_parts.append(f"{n}(+{w})")
            modifiers.append((n, w))
            continue
        if n == "atomic":
            w = 2 if is_rotational_base else 1
            formula_parts.append(f"atomic(+{w} {'rot' if is_rotational_base else 'non-rot'})")
            modifiers.append(("atomic", w))
            continue
        if n in Q4_OPS:
            unresolved.append(n)
            formula_parts.append(f"{n}(?)")
            continue
        # Unknown token; treat as suffix part of base or noise.
        unresolved.append(n)
        formula_parts.append(f"{n}(?)")

    if unresolved:
        return None, " + ".join(formula_parts) + " = unresolved", unresolved

    total = base_add + sum(w for _, w in modifiers)
    return total, " + ".join(formula_parts) + f" = {total}", []


def coerce_int(v) -> int | None:
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() in {"modifier", "?"}:
        return None
    try:
        return int(s)
    except (ValueError, TypeError):
        return None


# --- corpus loading --------------------------------------------------------

def load_ifpa() -> list[dict]:
    conn = sqlite3.connect(str(DB))
    conn.row_factory = sqlite3.Row
    rows = list(conn.execute(
        "SELECT slug, adds, base_trick, notation, computed_adds, "
        "computed_add_formula, add_formula_status, review_status "
        "FROM freestyle_tricks"
    ))
    conn.close()
    return [dict(r) for r in rows]


def load_fm_divergences() -> list[dict]:
    with FM_DIV.open() as f:
        return list(csv.DictReader(f))


def load_passback() -> list[dict]:
    with PB_TRICKS.open() as f:
        return list(csv.DictReader(f))


# --- classification --------------------------------------------------------

def classify(our_stated, our_computed, ext_stated, ext_computed, unresolved, source) -> tuple[str, str, bool, str]:
    """Return (difference_type, severity, red_needed, recommended_action)."""
    if unresolved:
        return ("unresolved-tokens", "medium", True, "defer; needs operator definition for: " + ",".join(unresolved))

    # IFPA internal stated vs computed
    if source == "ifpa-internal":
        if our_stated is None or our_computed is None:
            return ("incomplete", "low", False, "no comparison possible")
        if our_stated == our_computed:
            return ("agree-internal", "low", False, "no action")
        return ("internal-stated-vs-computed", "high", True,
                f"Red review: stated={our_stated}, formula gives {our_computed}")

    # FM divergence
    if source == "fm":
        if ext_stated is None and ext_computed is None:
            return ("fm-no-numbers", "low", False, "no action")
        # FM stated vs IFPA stated
        if our_stated is not None and ext_stated is not None and our_stated != ext_stated:
            # Cross-reference: is FM's reading internally coherent?
            if ext_computed is not None and ext_computed == our_stated:
                return ("fm-stated-vs-its-formula", "medium", False,
                        "FM-internal: their stated disagrees with their decomposition; IFPA aligns with formula. Accept divergence.")
            return ("fm-vs-ifpa-stated", "medium", False,
                    "federation_math_divergence per existing matrix; accept-as-folk-evidence")
        return ("agree-fm", "low", False, "no action")

    # PassBack -- dex_count is NOT ADD
    if source == "passback":
        # Always metric-mismatch for raw stated comparison.
        if ext_stated is not None and our_stated is not None and ext_stated != our_stated:
            # Their stated is dex_count, not ADD. Compare structurally only.
            if ext_computed == our_stated:
                return ("pb-metric-mismatch-structurally-agree", "low", False,
                        "PassBack dex_count differs from ADD (different metric); IFPA-computed-on-PB-notation matches IFPA stated")
            return ("pb-metric-mismatch-structural-disagree", "medium", False,
                    "PassBack dex_count vs IFPA ADD; PB decomposition diverges structurally too")
        return ("agree-pb-structural", "low", False, "no action")

    return ("unknown", "low", False, "no action")


# --- build matrix ----------------------------------------------------------

def build_matrix() -> list[dict]:
    ifpa = load_ifpa()
    fm_div = load_fm_divergences()
    pb = load_passback()

    ifpa_by_slug = {r["slug"]: r for r in ifpa}
    rows = []

    # === Source 1: IFPA internal (stated vs DB-computed vs our re-computed) ===
    for r in ifpa:
        slug = r["slug"]
        adds = coerce_int(r["adds"])
        db_computed = coerce_int(r["computed_adds"])
        notation = (r["notation"] or "").strip()
        tokens = tokenize(notation) if notation else []
        our_computed, formula, unresolved = compute_add_from_tokens(tokens) if tokens else (None, "", [])
        # Prefer DB-computed when present; cross-check with ours
        effective_computed = db_computed if db_computed is not None else our_computed
        diff_type, severity, red, action = classify(
            adds, effective_computed, None, None, unresolved, "ifpa-internal"
        )
        rows.append({
            "trick_slug": slug,
            "external_name": "",
            "source": "ifpa-internal",
            "our_stated_add": "" if adds is None else adds,
            "our_computed_add": "" if effective_computed is None else effective_computed,
            "external_stated_add": "",
            "external_computed_add": "",
            "formula_used": r["computed_add_formula"] or formula or "",
            "operator_tokens": "|".join(tokens),
            "difference_type": diff_type,
            "severity": severity,
            "recommended_action": action,
            "red_needed": "yes" if red else "no",
            "notes": (r["add_formula_status"] or "") + (
                "" if not unresolved else f" [unresolved: {','.join(unresolved)}]"
            ),
        })

    # === Source 2: FM divergences ===
    for r in fm_div:
        fm_term = r["fm_term"]
        fm_desc = r["fm_description"]
        fm_stated = coerce_int(r["fm_add"])
        ifpa_stated_from_matrix = coerce_int(r["ifpa_add"])
        ifpa_interp = r["canonical_ifpa_interpretation"]
        disposition = r["disposition"]

        # Compute from FM's technical_name (description includes the decomposition string).
        tokens = tokenize(fm_desc)
        fm_computed, formula, unresolved = compute_add_from_tokens(tokens)

        # Cross-reference IFPA stated -- try to match fm_term to an IFPA slug or alias.
        ifpa_slug = ""
        normalized = re.sub(r"\s*\(.*?\)\s*", "", fm_term).strip().lower().replace(" ", "-")
        if normalized in ifpa_by_slug:
            ifpa_slug = normalized
            ifpa_stated_actual = coerce_int(ifpa_by_slug[normalized]["adds"])
        else:
            ifpa_stated_actual = ifpa_stated_from_matrix

        diff_type, severity, red, action = classify(
            ifpa_stated_actual, None, fm_stated, fm_computed, unresolved, "fm"
        )
        # Annotate disposition from existing matrix (don't re-classify what's already known).
        notes = f"matrix_disposition: {disposition}"
        if r.get("notes"):
            notes += f"; {r['notes'][:120]}"

        rows.append({
            "trick_slug": ifpa_slug,
            "external_name": fm_term,
            "source": "fm",
            "our_stated_add": "" if ifpa_stated_actual is None else ifpa_stated_actual,
            "our_computed_add": "" if fm_computed is None else fm_computed,  # we use SAME formula on their decomp
            "external_stated_add": "" if fm_stated is None else fm_stated,
            "external_computed_add": "" if fm_computed is None else fm_computed,
            "formula_used": formula,
            "operator_tokens": "|".join(tokens),
            "difference_type": diff_type,
            "severity": severity,
            "recommended_action": action,
            "red_needed": "yes" if red else "no",
            "notes": notes,
        })

    # === Source 3: PassBack (only rows that map to a known IFPA slug) ===
    for r in pb:
        pb_name = r["passback_primary_name"]
        pb_dex = coerce_int(r["passback_dex_count"])
        pb_tech = r["passback_technical_name"]
        match_status = r["match_status"]
        candidate_slug = r["candidate_trick_slug"]

        if match_status not in ("matched_existing", "compact_slug_match") or not candidate_slug:
            continue
        if candidate_slug not in ifpa_by_slug:
            continue

        ifpa_stated = coerce_int(ifpa_by_slug[candidate_slug]["adds"])
        tokens = tokenize(pb_tech) if pb_tech else []
        pb_computed, formula, unresolved = compute_add_from_tokens(tokens) if tokens else (None, "", [])

        diff_type, severity, red, action = classify(
            ifpa_stated, None, pb_dex, pb_computed, unresolved, "passback"
        )
        rows.append({
            "trick_slug": candidate_slug,
            "external_name": pb_name,
            "source": "passback",
            "our_stated_add": "" if ifpa_stated is None else ifpa_stated,
            "our_computed_add": "" if ifpa_stated is None else ifpa_stated,
            "external_stated_add": "" if pb_dex is None else f"{pb_dex} (dex_count)",
            "external_computed_add": "" if pb_computed is None else pb_computed,
            "formula_used": formula,
            "operator_tokens": "|".join(tokens),
            "difference_type": diff_type,
            "severity": severity,
            "recommended_action": action,
            "red_needed": "yes" if red else "no",
            "notes": f"pb_dex_count vs ifpa_adds metric mismatch is expected (dex_count != ADD)",
        })

    return rows


# --- writers ---------------------------------------------------------------

def write_matrix(rows: list[dict]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / "ADD_CONFLICT_MATRIX.csv"
    fields = [
        "trick_slug", "external_name", "source",
        "our_stated_add", "our_computed_add",
        "external_stated_add", "external_computed_add",
        "formula_used", "operator_tokens",
        "difference_type", "severity",
        "recommended_action", "red_needed", "notes",
    ]
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} rows to {out}")


def main() -> None:
    rows = build_matrix()
    write_matrix(rows)
    # Print bucket summary for the immediate run.
    from collections import Counter
    diff_counts = Counter(r["difference_type"] for r in rows)
    print("\ndifference_type buckets:")
    for k, v in diff_counts.most_common():
        print(f"  {k}: {v}")
    red_yes = sum(1 for r in rows if r["red_needed"] == "yes")
    print(f"\nrows flagged red_needed=yes: {red_yes}")


if __name__ == "__main__":
    main()

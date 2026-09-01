"""
Structural parser for freestyle trick names: a tokenizer and role mapper that
decomposes a canonical name into its base, its operators, and an arithmetic
check of the ADD value the dictionary asserts for it.

Coverage: every active non-modifier row in the dictionary. There is no family
restriction; `--families` narrows a run for debugging and is empty by default.
Policy-bearing tokens are parsed rather than filtered out, and the row says so
through its status.

What it does NOT cover is per-token rather than per-family. An operator scores
only where the dictionary registry carries a weight for it or a ruling defines
its contribution; anything else scores nothing and says so on the row, through
either an unresolved-token entry or a parse warning naming the token. Reading a
row's warnings is therefore the way to tell a genuine disagreement from a gap in
what has been ruled. A trailing core-family token is the case worth knowing about
(see TERMINAL_REPLACEMENT_ADDS).

Contract, and the reason this stays a report rather than a source of truth:
  - the asserted `adds` on freestyle_tricks is AUTHORITATIVE.
  - computed_adds is DIAGNOSTIC ONLY and never overrides editorial truth.
  - the status field describes the relationship between the two; it never
    promotes the computed value to canonical.
  - a weight is never inferred backwards from a row's asserted value. Any
    single row's total would yield one, which is precisely what makes it
    worthless as evidence.

Every parsed row lands in exactly one status:
  exact_modifier_derived — decomposed into base plus operators; computed agrees
                           with asserted, which is a structural confirmation
  exact_self_atom        — the name resolved to a single canonical whose own
                           asserted value was used; agreement is tautological
  approximate            — parse complete, computed disagrees with asserted
  unresolved             — a token did not classify, or the base carries no
                           asserted value, so no total was computed
  policy_dependent       — parse complete but carries a policy-bearing token

Outputs, written to --out-dir (default freestyle/reports/):
  parser_phase2_parses.json          per-row parse JSON, every row
  parser_add_conflict_report.md      rows whose computed value disagrees
  parser_coverage_report.md          status distribution and unresolved tokens
  parser_policy_dependent_queue.md   rows held on a policy token

Usage:
  python3 freestyle/scripts/parse_freestyle_notation.py
  python3 freestyle/scripts/parse_freestyle_notation.py --families whirl,butterfly
  python3 freestyle/scripts/parse_freestyle_notation.py --apply

Default mode writes reports only. `--apply` additionally writes the five derived
columns (jobs_notation_raw, structural_parse_json, computed_add_formula,
computed_adds, add_formula_status) and never `adds` or `notation`. The rebuild
runs it with --apply as one of its stages, so these columns are refreshed from
the committed dictionary rather than hand-maintained.
"""
import argparse
import json
import re
import sqlite3
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

REPO        = Path(__file__).resolve().parents[2]
DEFAULT_DB  = REPO / "database" / "footbag.db"
DEFAULT_OUT_DIR = REPO / "freestyle" / "reports"

PARSER_VERSION = "2.5"  # Phase 2.5: descriptive vs add_contributing role split, status vocabulary refinement, rotational-escalation policy warning

DEFAULT_TARGET_FAMILIES: set[str] = set()  # empty → no family filter (full corpus)
# Currently inert for ADD: every registered modifier has add_bonus == add_bonus_rotational,
# so this set produces no weight differential. Kept only as a structural hook.
ROTATIONAL_BASES = {"whirl", "mirage", "torque", "swirl"}

# Terminal-replacement operators, and what each contributes.
#
# A name can carry a second core-family token after a complete base trick. That
# trailing token is not a second base; it is an operator acting on the base's
# terminal, and it scores only where doctrine has ruled what it does. Swirl is
# the one ruling so far: appending Swirl to a trick that ends in a clipper delay
# replaces that terminal clip with one additional dex into a cross-body clipper
# delay, and scores one more than the base. Reverse Swirl is the same rule with
# the appended dex directed inward, and tokenizes to the same `swirl`.
#
# A trailing token that is absent here contributes nothing, which is a statement
# about it rather than an oversight. A trailing `dragon` names the set the trick
# is entered from, an entry surface rather than an appended terminal, so it adds
# no dex; `swirl dragon` scores as swirl does. Anything else trailing is an
# operator whose contribution nobody has defined, and an undefined operator must
# stay undefined: the weight it would need is inferable from the asserted total
# of any single row, which is exactly why inferring it would be worthless. Those
# rows record a warning naming the token instead, so the gap is visible on the
# row rather than being absorbed silently into a number that looks computed.
TERMINAL_REPLACEMENT_ADDS = {"swirl": 1}

# Role registries. Hard-coded for now; the registered modifiers in
# freestyle_trick_modifiers are cross-checked at startup so any modifier
# that's in the DB but not classified here surfaces as a warning rather
# than a silent skip.
SET_TOKENS = {
    # Barraging is deliberately absent: it is a historical name for Furious and
    # expands to it, the way surging does, rather than routing as a set of its own.
    # Barraging is deliberately absent: it is a historical name for Furious and
    # expands to it, the way surging does, rather than routing as a set of its own.
    "atomic", "pixie", "fairy", "pogo", "rooted", "furious",
    # Registered set operators from the freestyle_trick_modifiers registry
    # (modifier_type='set'); weights come from the registry, this set only
    # routes the token to the set role bucket.
    "floating", "railing", "sailing", "splicing", "surfing", "warping",
    # Phase 2: policy-bearing tokens still classify by primary role.
    "quantum", "nuclear", "shooting",
}
ROTATION_TOKENS = {
    "spinning", "inspinning", "swirling", "whirling", "gyro",
}
MODIFIER_TOKENS = {
    "ducking", "stepping", "symposium", "paradox", "tapping",
    "blazing", "weaving", "zulu", "miraging", "diving",
    "blurry", "terraging", "xdex", "backside",
}
# D2: direction-structural shorthand. Distinct from rotation (which
# names a body-spin modifier). Direction-only variants alter mechanics
# without implying an ADD bonus.
DIRECTION_TOKENS = {
    "rev", "reverse",
}
# D3: delay-surface vocabulary. Standard stall surfaces.
DELAY_SURFACE_TOKENS = {
    "clipper", "toe", "inside", "heel", "outside",
}
# D3: non-standard / unusual surfaces.
UNUSUAL_SURFACE_TOKENS = {
    "sole", "knee", "head", "neck", "shoulder", "forehead", "cloud",
}
# Tokens whose ADD weight or ontology placement is policy-dependent.
# Per James 2026-05-09: parse the row into its primary role bucket, AND
# tag the policy concern in policy_tokens. Status = policy_dependent.
POLICY_TOKENS = {
    "nuclear", "quantum", "down",
}
# Tokens that are not operators in their own right, and what each stands for.
#
# The expansion carries the token's real components, and each expanded component
# scores from the registry as it always does, so nothing here introduces a weight
# of its own. The descriptive layer keeps both halves: the component it expanded
# to, and `expanded_from` naming the token actually written in the name.
#
# Surging is a composite: it names a spin and a step together, so it decomposes
# to both rather than being registered as a third thing.
#
# Barraging is a historical name for the Furious set rather than a set of its
# own, and it is retired as an independently scored operator. It expands to
# Furious so it draws Furious's registered two-dex contribution. Registering a
# weight against the historical spelling instead would give the same numbers and
# assert something the doctrine denies: that barraging is an operator.
VIRTUAL_EXPANSIONS = {
    "surging":   [("rotation", "spinning"), ("modifier", "stepping")],
    "barraging": [("set", "furious")],
}


# ─── Tokenizer ─────────────────────────────────────────────────────────────


def normalize_name(s: str) -> str:
    """Lowercase + NFKC unicode normalize. Stable for tokenization."""
    return unicodedata.normalize("NFKC", s).lower()


def tokenize(name: str) -> list[dict]:
    """Split on whitespace + hyphens; preserve span offsets back to the
    raw input for highlighting. Returns [{token, span_start, span_end}]."""
    norm = normalize_name(name)
    tokens: list[dict] = []
    for m in re.finditer(r"[a-z0-9]+", norm):
        tokens.append({
            "token":      m.group(0),
            "span_start": m.start(),
            "span_end":   m.end(),
        })
    return tokens


# ─── Role mapper ───────────────────────────────────────────────────────────


def classify_token(tok: str, core_families: set[str]) -> tuple[str, str]:
    """Return (role, normalized_token). Role is one of:
       set, rotation, modifier, directionality, delay_surface,
       unusual_surface, core_family, virtual, unresolved.

    Policy-token tagging is orthogonal to role and handled separately
    in parse_trick — a token can land in BOTH a role bucket AND
    policy_tokens (e.g., quantum → set + policy_tokens).
    """
    if tok in VIRTUAL_EXPANSIONS:        return ("virtual",         tok)
    if tok in SET_TOKENS:                return ("set",             tok)
    if tok in ROTATION_TOKENS:           return ("rotation",        tok)
    if tok in MODIFIER_TOKENS:           return ("modifier",        tok)
    if tok in DIRECTION_TOKENS:          return ("directionality",  tok)
    if tok in DELAY_SURFACE_TOKENS:      return ("delay_surface",   tok)
    if tok in UNUSUAL_SURFACE_TOKENS:    return ("unusual_surface", tok)
    if tok in core_families:             return ("core_family",     tok)
    return ("unresolved", tok)


def _empty_descriptive_layer() -> dict:
    """Descriptive layer: every per-token role bucket + unresolved_tokens.
    Preserved across D1 self-atom collapse — survives as the visualization
    record of what the parser saw."""
    return {
        "core_family":      [],
        "set":              [],
        "rotation":         [],
        "modifier":         [],
        "delay_surface":    [],
        "directionality":   [],
        "unusual_surface":  [],
        "unresolved_tokens": [],
    }


def _empty_contributing_layer() -> dict:
    """Add-contributing layer: only role buckets that feed compute_formula.
    Self-atom rows have core_family populated and other buckets empty.
    Excludes unresolved_tokens (which never contribute to ADD math)."""
    return {
        "core_family":      [],
        "set":              [],
        "rotation":         [],
        "modifier":         [],
        "delay_surface":    [],
        "directionality":   [],
        "unusual_surface":  [],
    }


def parse_trick(
    name: str,
    canonical_slug: str,
    canonicals_by_slug: dict[str, dict],
    core_families: set[str],
) -> dict:
    """Run the role mapper on `name` and return the structural-parse dict.

    Role buckets live in two parallel layers, because what the parser saw
    and what it is willing to do arithmetic on are different questions.
      descriptive_roles      — what the parser classified per token. Drives
                               visualization, semantic filtering and
                               cross-family lenses, and survives the atom
                               collapse below intact.
      add_contributing_roles — what compute_formula reads. On a row that
                               collapsed to a self-canonical atom this holds
                               the atom alone and the other buckets are empty.
    Where no collapse happened the two layers are identical. Where one did,
    the descriptive layer still shows the per-token reading, so a row that
    was subsumed can still be inspected for what it was made of.
    """
    descriptive = _empty_descriptive_layer()
    parse: dict = {
        "descriptive_roles":      descriptive,
        "add_contributing_roles": _empty_contributing_layer(),
        "policy_tokens":          [],
        "additive_flags":         [],
        "parse_warnings":         [],
        "parser_version":         PARSER_VERSION,
        "parsed_at":              datetime.now(timezone.utc).isoformat(),
        "parse_source":           "name_decomposition",
    }

    # Multi-token atom guard: if a different canonical's name (after
    # space→hyphen) matches the input name, treat that one as a single
    # core_family unit rather than decomposing into parts.
    name_as_slug = re.sub(r"\s+", "-", normalize_name(name))
    if name_as_slug in canonicals_by_slug and name_as_slug != canonical_slug:
        atom_record = {
            "token":          name_as_slug,
            "span_start":     0,
            "span_end":       len(name),
            "atom_resolved":  True,
        }
        descriptive["core_family"].append(atom_record)
        parse["add_contributing_roles"]["core_family"].append(atom_record)
        parse["parse_warnings"].append("inferred_self_canonical_atom")
        parse["raw_token_count"] = 1
        parse["resolved_token_count"] = 1
        return parse

    tokens = tokenize(name)
    parse["raw_token_count"] = len(tokens)
    resolved = 0

    for t in tokens:
        role, val = classify_token(t["token"], core_families)
        record = {"token": val, "span_start": t["span_start"], "span_end": t["span_end"]}
        if role == "virtual":
            parse["additive_flags"].append("virtual_modifier_expanded")
            for expanded_role, expanded_tok in VIRTUAL_EXPANSIONS[val]:
                descriptive[expanded_role].append({
                    **record, "token": expanded_tok, "expanded_from": val,
                })
            resolved += 1
        elif role == "unresolved":
            descriptive["unresolved_tokens"].append({
                **record, "reason": "not in any registry",
            })
        else:
            descriptive[role].append(record)
            resolved += 1
        # Orthogonal: policy-token tag. A token in POLICY_TOKENS retains
        # its primary role classification AND gets recorded here.
        if val in POLICY_TOKENS:
            parse["policy_tokens"].append(val)
            parse["parse_warnings"].append(f"policy_token_encountered:{val}")

    parse["resolved_token_count"] = resolved

    # Self-canonical atom recognition: the row's own slug is a registered
    # canonical, so the name is treated as one unit carrying that canonical's
    # asserted value rather than being decomposed into parts.
    # Triggers:
    #   (a) No token classified as core_family (pure self-atom).
    #   (b) Per-token classification produced unresolved_tokens AND the
    #       row's canonical_slug is itself a registered canonical.
    # When D1 fires it populates ONLY add_contributing_roles.core_family
    # with the atom; descriptive_roles preserves the original per-token
    # classifications so visualization can render them.
    needs_atom = canonical_slug in core_families and (
        not descriptive["core_family"] or descriptive["unresolved_tokens"]
    )
    if needs_atom:
        # Atom owns the ADD-contributing layer.
        parse["add_contributing_roles"]["core_family"] = [{
            "token":         canonical_slug,
            "span_start":    0,
            "span_end":      len(name),
            "atom_resolved": True,
        }]
        # Descriptive layer is preserved as-is (key Phase-2.5 win):
        # role buckets that classified retain their content; unresolved_tokens
        # also retain their content (visualization can show what the parser
        # saw before the atom subsumed everything). The signal that subsumption
        # occurred lives in additive_flags.
        if descriptive["unresolved_tokens"]:
            parse["additive_flags"].append("atom_subsumed_unresolved_tokens")
        parse["parse_warnings"].append("inferred_self_canonical_atom")
    else:
        # No D1: contributing layer mirrors descriptive layer for the
        # role buckets it carries (excludes unresolved_tokens — those
        # never contribute to ADD math).
        for role_name in parse["add_contributing_roles"]:
            parse["add_contributing_roles"][role_name] = list(descriptive[role_name])

    if descriptive["unresolved_tokens"] and not needs_atom:
        # Unresolved tokens that weren't subsumed by D1 indicate a real
        # parser-coverage gap that blocks ADD math.
        parse["parse_warnings"].append("unresolved_tokens_present")

    return parse


# ─── ADD math ──────────────────────────────────────────────────────────────


# Scoring-flag brackets in operational notation (bracket count == ADD). Mirrors
# src/lib/freestyleNotation.ts: [set]/paren pre-states and the non-scoring [KICK]
# marker are ignored.
_SCORING_BRACKET_RE = re.compile(r"\[(BOD|DEX|XBD|DEL|UNS|PDX|XDEX)\]", re.IGNORECASE)


def count_scoring_brackets(op_notation: str) -> int:
    return len(_SCORING_BRACKET_RE.findall(op_notation or ""))


def compute_formula(
    parse: dict,
    canonicals_by_slug: dict[str, dict],
    modifier_weights: dict[str, dict],
    op_notation: str = "",
) -> tuple[int | None, str | None, list[str]]:
    """Returns (computed_adds, formula_string, warnings).
    Returns (None, None, []) when the formula cannot be computed.

    Reads the post-collapse `add_contributing_roles` layer. The returned
    warning strings are for the caller to append to parse_warnings, and
    carry one thing today: a name whose trailing core-family token no
    ruling gives a contribution. See TERMINAL_REPLACEMENT_ADDS for what
    that means and why such a token scores nothing rather than a weight
    inferred from the row it sits on.

    A rotational base selects each modifier's rotational bonus over its
    flat one, and the formula string labels the swap. No warning follows,
    because every registered modifier currently carries the same value in
    both columns, so the selection changes no arithmetic and there is
    nothing yet to warn about.

    Caller is responsible for status determination.
    """
    contrib = parse.get("add_contributing_roles", {})
    cf_list = contrib.get("core_family", [])
    if not cf_list:
        return (None, None, [])
    base_slug = cf_list[0]["token"]
    base = canonicals_by_slug.get(base_slug)
    if not base or base.get("adds") is None:
        return (None, None, [])

    base_adds = base["adds"]
    is_rotational = base_slug in ROTATIONAL_BASES

    # Self-atom rows: the slug IS the trick. Use base.adds directly.
    if cf_list[0].get("atom_resolved"):
        return (base_adds, f"{base_slug}({base_adds}) [self-atom] = {base_adds}", [])

    bonus = 0
    contributions: list[str] = []
    warnings: list[str] = []

    def add_contribution(tok: str) -> None:
        nonlocal bonus
        m = modifier_weights.get(tok)
        if not m: return
        weight = m["add_bonus_rotational"] if is_rotational else m["add_bonus"]
        bonus += weight
        rot_used = is_rotational and m["add_bonus_rotational"] != m["add_bonus"]
        rot_label = " rot" if rot_used else ""
        contributions.append(f"{tok}(+{weight}{rot_label})")
        # All registered modifiers carry equal add_bonus and add_bonus_rotational,
        # so the rotational column adds no differential and weight selection above
        # is effectively flat. The parser does not infer an X-Dex bonus; named
        # compounds carry their asserted ADD from the dictionary.

    for s in contrib.get("set", []):       add_contribution(s["token"])
    for r in contrib.get("rotation", []):  add_contribution(r["token"])
    for m in contrib.get("modifier", []):  add_contribution(m["token"])

    desc = parse.get("descriptive_roles", {})
    if desc.get("unresolved_tokens") and not cf_list[0].get("atom_resolved"):
        # Unresolved tokens in a non-atom row would skew ADD math.
        return (None, None, [])

    # Miraging is a retired historical nickname for a single downtime inward dex.
    # It carries no operator weight (it is not a registered modifier), so the
    # name-token sum undercounts a miraging compound by exactly that dex. Doctrine:
    # a miraging dex scores from the trick's own notation, so source the total from
    # the operational-notation scoring brackets, which already include it. This
    # never revives miraging as a scored operator. Self-atom rows (miraging_kick)
    # returned above and are unaffected; every miraging compound's bracket count
    # equals its asserted ADD.
    mod_tokens = [m.get("token") for m in contrib.get("modifier", [])]
    if "miraging" in mod_tokens:
        brackets = count_scoring_brackets(op_notation)
        if brackets > 0:
            return (brackets,
                    f"notation-scored, includes the miraging downtime inward dex = {brackets}",
                    [])

    # Every core-family token after the first is an operator on the base's
    # terminal, not a second base. Scoring only the first is what left a name
    # like `montage swirl` computing its base alone and reading one under the
    # asserted value, on a row whose trailing token the parser had in fact
    # recognized. Score each trailing token by what doctrine gives it, and say
    # so on the row when doctrine gives it nothing.
    for extra in cf_list[1:]:
        tok = extra["token"]
        if tok in TERMINAL_REPLACEMENT_ADDS:
            weight = TERMINAL_REPLACEMENT_ADDS[tok]
            bonus += weight
            contributions.append(f"{tok}(+{weight} terminal)")
        else:
            warnings.append(f"terminal_token_without_defined_contribution:{tok}")

    formula_parts = contributions + [f"{base_slug}({base_adds})"]
    formula = " + ".join(formula_parts) + f" = {base_adds + bonus}"
    return (base_adds + bonus, formula, warnings)


# ─── DB I/O ────────────────────────────────────────────────────────────────


def load_canonicals(con: sqlite3.Connection) -> dict[str, dict]:
    """slug → {name, adds(int|None), family, base, category, is_active, notation}."""
    rows = con.execute(
        """SELECT slug, canonical_name, adds, base_trick, trick_family, category,
                  is_active, notation, operational_notation
           FROM freestyle_tricks"""
    ).fetchall()
    out = {}
    for slug, name, adds, base, family, category, is_active, notation, op_notation in rows:
        try:
            adds_int = int(adds) if adds and adds != "modifier" else None
        except (ValueError, TypeError):
            adds_int = None
        out[slug] = {
            "name":      name,
            "adds":      adds_int,
            "base":      base or slug,
            "family":    family or slug,
            "category":  category or "",
            "is_active": bool(is_active),
            "notation":  notation or "",
            "operational_notation": op_notation or "",
        }
    return out


def load_modifier_weights(con: sqlite3.Connection) -> dict[str, dict]:
    """slug → {add_bonus, add_bonus_rotational, modifier_type}."""
    rows = con.execute(
        """SELECT slug, add_bonus, add_bonus_rotational, modifier_type
           FROM freestyle_trick_modifiers"""
    ).fetchall()
    out = {}
    for slug, ab, abr, mtype in rows:
        out[slug.lower()] = {
            "add_bonus": ab,
            "add_bonus_rotational": abr,
            "modifier_type": mtype,
        }
    return out


def has_policy_token(name: str, notation: str) -> bool:
    """Cheap pre-filter: does the name or notation contain a policy token?"""
    lower = (name + " " + (notation or "")).lower()
    return any(re.search(rf"\b{tok}\b", lower) for tok in POLICY_TOKENS)


# ─── QC report ─────────────────────────────────────────────────────────────


def _header(rows: list[dict], title: str, body: str) -> list[str]:
    by_status: dict[str, int] = {}
    for r in rows:
        by_status[r["add_formula_status"]] = by_status.get(r["add_formula_status"], 0) + 1
    out = [
        f"# {title}\n",
        f"- Parser version: `{PARSER_VERSION}`",
        f"- Total rows in corpus: **{len(rows)}**",
        f"- Status distribution: " + " · ".join(f"`{s}`={by_status.get(s, 0)}" for s in ("exact_modifier_derived","exact_self_atom","approximate","unresolved","policy_dependent")),
        "",
        body,
        "",
    ]
    return out


def write_add_conflict_report(rows: list[dict], path: Path) -> None:
    """Approximate rows: parse complete, computed != asserted. Editorial review."""
    targets = [r for r in rows if r["add_formula_status"] == "approximate"]
    body = (
        "Rows below have a complete structural parse, but the computed ADD does "
        "NOT equal the asserted ADD. These are NOT errors — the asserted ADD remains "
        "editorial truth. Each row indicates either (a) a missing modifier weight, "
        "(b) a Red-endorsed exception (e.g. ADD-only activation per CANONICALIZATION_POLICY §3), "
        "or (c) a parser-grammar refinement opportunity. Sent to James's queue first per Phase-2 D4."
    )
    lines = _header(rows, "Parser ADD-conflict report", body)
    if not targets:
        lines.append("(no approximate rows in current corpus)")
    else:
        lines.append("| Slug | Name | Family | Asserted | Computed | Formula | Warnings |")
        lines.append("|---|---|---|---:|---:|---|---|")
        for r in sorted(targets, key=lambda x: (x["family"], x["slug"])):
            warnings = ", ".join(r["structural_parse_json"].get("parse_warnings", []))
            lines.append(
                f"| `{r['slug']}` | {r['name']} | {r['family']} | "
                f"{r['asserted_adds']} | {r['computed_adds']} | `{r['computed_add_formula']}` | {warnings} |"
            )
    path.write_text("\n".join(lines) + "\n")


def write_coverage_report(rows: list[dict], path: Path) -> None:
    """Unresolved rows + parser-coverage gaps. Grammar-extension candidates."""
    targets = [r for r in rows if r["add_formula_status"] == "unresolved"]
    body = (
        "Rows whose tokens could not be classified against the role registries. "
        "Each is a candidate for either (a) adding to a registry, "
        "(b) self-canonical-atom recognition (D1 already on; surfacing rows that still didn't resolve), "
        "(c) directional / surface vocabulary extension, or "
        "(d) a future Red review."
    )
    lines = _header(rows, "Parser coverage report", body)
    if not targets:
        lines.append("(no unresolved rows in current corpus)")
    else:
        lines.append("| Slug | Name | Family | Unresolved tokens | Warnings |")
        lines.append("|---|---|---|---|---|")
        for r in sorted(targets, key=lambda x: (x["family"], x["slug"])):
            desc = r["structural_parse_json"].get("descriptive_roles", {})
            unresolved = [t["token"] for t in desc.get("unresolved_tokens", [])]
            warnings = ", ".join(r["structural_parse_json"].get("parse_warnings", []))
            lines.append(
                f"| `{r['slug']}` | {r['name']} | {r['family']} | "
                f"{', '.join(unresolved) or '(base.adds missing)'} | {warnings} |"
            )
    path.write_text("\n".join(lines) + "\n")


def write_policy_dependent_queue(rows: list[dict], path: Path) -> None:
    """Policy-dependent rows: parse complete but contains tokens whose ADD weights
    or ontology placement is contested. Drives Red follow-up packets."""
    targets = [r for r in rows if r["add_formula_status"] == "policy_dependent"]
    body = (
        "Rows whose structural parse resolves cleanly but contain tokens "
        "(quantum, nuclear, down-family) with contested "
        "ADD weights or ontology placement. Per Phase-2 D4 these flow into "
        "James's review queue first; only distilled policy questions should "
        "escalate to Red. Per James 2026-05-09: parse output IS preserved "
        "(don't pretend ADD certainty, but don't suppress structural value either)."
    )
    lines = _header(rows, "Parser policy-dependent queue", body)
    if not targets:
        lines.append("(no policy_dependent rows in current corpus)")
    else:
        lines.append("| Slug | Name | Family | Asserted | Computed | Policy tokens | Formula |")
        lines.append("|---|---|---|---:|---:|---|---|")
        for r in sorted(targets, key=lambda x: (x["family"], x["slug"])):
            policy_tokens = ", ".join(r["structural_parse_json"].get("policy_tokens", []))
            lines.append(
                f"| `{r['slug']}` | {r['name']} | {r['family']} | "
                f"{r['asserted_adds']} | {r['computed_adds']} | {policy_tokens} | "
                f"`{r['computed_add_formula']}` |"
            )
    path.write_text("\n".join(lines) + "\n")


# ─── Main ──────────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db",       default=str(DEFAULT_DB))
    ap.add_argument("--out-dir",  default=str(DEFAULT_OUT_DIR))
    ap.add_argument("--families", default="",
                    help="Comma-separated list of trick_family values to include. "
                         "Default: empty = full corpus (all active non-modifier rows).")
    ap.add_argument("--apply", action="store_true",
                    help="Write structural_parse_json + computed_* fields to DB. "
                         "NEVER touches `adds` or `notation`. Default: dry-run. "
                         "Per D5: writes for `exact` and `approximate`; skips `unresolved`. "
                         "`policy_dependent` rows also write (parse + flagged status).")
    args = ap.parse_args()

    families = {f.strip() for f in args.families.split(",") if f.strip()}
    db_path = Path(args.db)
    out_dir = Path(args.out_dir)
    if not db_path.exists():
        print(f"ERROR: DB not found at {db_path}", file=sys.stderr)
        return 1

    # Open through the shared guard so a direct run refuses a post-cutover database.
    import os.path as _p
    import sys as _s
    _s.path.insert(0, _p.join(_p.dirname(_p.abspath(__file__)), "..", "..", "scripts"))
    from _freestyle_db import open_freestyle_db
    con = open_freestyle_db(str(db_path))
    canonicals = load_canonicals(con)
    modifier_weights = load_modifier_weights(con)

    # Set of all canonical slugs treated as recognizable family-core tokens
    # for parse classification. Modifier-role tokens (set/rotation/modifier)
    # also remain here so D1 self-atom recognition can resolve modifier-
    # reference rows like 'atomic', 'fairy', 'pogo' as their own canonicals
    # without needing a separate exception path.
    family_canonical_tokens: set[str] = set()
    for slug, info in canonicals.items():
        if not info["is_active"]:
            continue
        if info["category"] == "modifier":
            continue
        family_canonical_tokens.add(slug)

    # Sanity-check: every registered modifier is classified.
    unclassified = [m for m in modifier_weights
                    if m not in (MODIFIER_TOKENS | SET_TOKENS | ROTATION_TOKENS)]
    if unclassified:
        print(f"WARN: {len(unclassified)} registered modifiers are not classified into "
              f"a role bucket: {sorted(unclassified)}", file=sys.stderr)

    # Build corpus. Phase 2: full active dictionary by default.
    corpus: list[tuple[str, dict]] = []
    for slug, info in canonicals.items():
        if not info["is_active"]:
            continue
        if info["category"] == "modifier":
            continue
        if families and info["family"] not in families:
            continue
        corpus.append((slug, info))

    print(f"Parser v{PARSER_VERSION} — {len(corpus)} rows in corpus")
    print(f"  families: {sorted(families) if families else '(all)'}")
    print(f"  policy rows: included with policy_dependent status")

    # Run parser.
    rows: list[dict] = []
    for slug, info in corpus:
        parse = parse_trick(info["name"], slug, canonicals, family_canonical_tokens)
        computed, formula, formula_warnings = compute_formula(
            parse, canonicals, modifier_weights, info.get("operational_notation", "")
        )
        asserted = info["adds"]

        parse["parse_warnings"].extend(formula_warnings)

        # Status determination — Phase-2.5 vocabulary:
        #   1. unresolved          — no usable parse (supersedes everything)
        #   2. policy_dependent    — parse OK, contains policy-bearing tokens
        #   3. approximate         — parse OK, math disagrees with asserted
        #   4. exact_self_atom     — parse OK, atom-resolved, computed == asserted
        #                            (tautological agreement)
        #   5. exact_modifier_derived — parse OK, modifier-decomposed,
        #                            computed == asserted (structural confirmation)
        desc_unresolved = parse["descriptive_roles"].get("unresolved_tokens", [])
        cf_contrib = parse["add_contributing_roles"]["core_family"]
        atom_subsumed = bool(cf_contrib and cf_contrib[0].get("atom_resolved"))
        # Unresolved tokens block the parse only when they weren't subsumed
        # by a self-canonical atom (D1).
        if computed is None or (desc_unresolved and not atom_subsumed):
            status = "unresolved"
        elif parse.get("policy_tokens"):
            status = "policy_dependent"
        elif asserted is not None and computed != asserted:
            status = "approximate"
            parse["parse_warnings"].append(
                f"approximate_add_formula:computed={computed},asserted={asserted}"
            )
        else:
            # Math agrees. Distinguish self-atom tautology from modifier-derived
            # structural confirmation.
            cf = parse["add_contributing_roles"]["core_family"]
            if cf and cf[0].get("atom_resolved"):
                status = "exact_self_atom"
            else:
                status = "exact_modifier_derived"

        rows.append({
            "slug":     slug,
            "name":     info["name"],
            "family":   info["family"],
            "asserted_adds":           asserted,
            "computed_adds":           computed,
            "computed_add_formula":    formula,
            "add_formula_status":      status,
            "structural_parse_json":   parse,
        })

    # Write JSON output (full parse for every row, regardless of status).
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "parser_phase2_parses.json"
    json_path.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n")

    # Write the three QC reports per PROPOSAL §7.3.
    add_conflict_path  = out_dir / "parser_add_conflict_report.md"
    coverage_path      = out_dir / "parser_coverage_report.md"
    policy_queue_path  = out_dir / "parser_policy_dependent_queue.md"
    write_add_conflict_report(rows, add_conflict_path)
    write_coverage_report(rows, coverage_path)
    write_policy_dependent_queue(rows, policy_queue_path)

    # Optional: apply parses to the new DB columns. Never touches `adds`
    # or `notation`. Idempotent; same row → same parse → same write.
    # Per D5: write for `exact` and `approximate`. Skip `unresolved`
    # (no stable parse to persist). Also write for `policy_dependent`
    # (parse is valid; status field flags the policy concern).
    applied = skipped = 0
    if args.apply:
        with con:
            for r in rows:
                if r["add_formula_status"] == "unresolved":
                    skipped += 1
                    continue
                con.execute(
                    """UPDATE freestyle_tricks
                       SET jobs_notation_raw    = COALESCE(jobs_notation_raw, notation),
                           structural_parse_json = ?,
                           computed_add_formula  = ?,
                           computed_adds         = ?,
                           add_formula_status    = ?
                       WHERE slug = ?""",
                    (
                        json.dumps(r["structural_parse_json"], ensure_ascii=False),
                        r["computed_add_formula"],
                        r["computed_adds"],
                        r["add_formula_status"],
                        r["slug"],
                    ),
                )
                applied += 1
        print(f"  --apply: wrote {applied} parses; skipped {skipped} unresolved.")

    con.close()

    # Stdout summary.
    by_status: dict[str, int] = {}
    for r in rows:
        by_status[r["add_formula_status"]] = by_status.get(r["add_formula_status"], 0) + 1
    print("Status breakdown:")
    for s in ("exact_modifier_derived", "exact_self_atom", "approximate", "unresolved", "policy_dependent"):
        print(f"  {s:<24s} {by_status.get(s, 0)}")
    print(f"Wrote: {json_path.name}, {add_conflict_path.name}, {coverage_path.name}, {policy_queue_path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

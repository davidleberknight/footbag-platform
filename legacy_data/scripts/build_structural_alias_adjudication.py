"""
Structural-alias adjudication for unresolved freestyle coverage gaps.

Read-only. Applies already-decided ontology policy (CANONICALIZATION_POLICY.md
§10 productive multiplicity; freestyle-dictionary-surface skill §4 structural
alias 5-category taxonomy; §1 canonical vs alias distinction; §9 freeze /
defer-over-speculate bias) to the unresolved external-source rows produced by
build_freestyle_dict_coverage_diff.py.

Inputs:
  legacy_data/reports/freestyle_dict_coverage_diff.csv
  database/footbag.db (freestyle_tricks, freestyle_trick_aliases,
                       freestyle_trick_modifiers, freestyle_records)

Outputs:
  legacy_data/reports/structural_alias_adjudication.csv
  legacy_data/reports/structural_alias_adjudication.md

Decision tree (first match wins):

  1. RED-DECIDED-NON-CANONICAL — name appears on Red pt3's explicit reject
     list (Double Fairy, Double Blender, Double Spinning Osis). Auto.

  2. PRODUCTIVE-MULTIPLICITY-NON-CANONICAL — count-prefix on a canonical base
     AND name is not in the stabilized allow-list. Per §10 default. Auto.

  3. PRODUCTIVE-MULTIPLICITY-BASE-UNRESOLVABLE — count-prefix but base does
     not resolve to canonical or alias. Needs Red.

  4. STRUCTURAL-ALIAS-FULL — leading tokens are registered modifiers, last
     token is an active canonical, ADD math computes. Auto-classify; the
     external row is an alias-shaped reference, no canonical needed.

  5. STRUCTURAL-ALIAS-ADD-CONFLICT — decomposition resolves but ADD math
     does not match source. Per §3 ADD-math conflict protocol, needs Red.

  6. POLICY-BLOCKED-DOWN — description, alt-name, or notation indicates a
     down / double-down / plant pattern. The down family is deferred at
     the canonical layer; cannot resolve until policy unblocks. Needs Red.

  7. CANONICAL-CANDIDATE-NAMED-IDENTITY — single-token or community-fixed
     name; high evidence (records present, full notation, evidence ≥ 9).
     Needs Red.

  8. EXTERNAL-ONLY-DESCRIPTIVE — corpus has it; weak evidence (no records,
     no description, evidence ≤ 4). Treat as informational coverage only,
     not canonical-bound. Auto.

  9. UNRESOLVED — fall-through. Needs Red.

Per CANONICALIZATION_POLICY §9: "Default = ask Red. Bias toward fewer rows.
Deferred over speculated." When in doubt the script chooses UNRESOLVED.

Does not modify any ontology data, CSVs, schema, or DB rows.
"""
import argparse
import csv
import os
import re
import sqlite3
import sys
from pathlib import Path

REPO        = Path(__file__).resolve().parents[2]
DEFAULT_DIFF = REPO / "legacy_data" / "reports" / "freestyle_dict_coverage_diff.csv"
DEFAULT_DB   = REPO / "database" / "footbag.db"
DEFAULT_OUT_DIR = REPO / "legacy_data" / "reports"

# Red pt3 explicit non-canonical names (§10 listed).
RED_REJECTED_NAMES = {
    "double fairy",
    "double blender",
    "double spinning osis",
}

# §10 stabilized canonical multiplicities (already in dictionary).
STABILIZED_MULTIPLICITY_NAMES = {
    "double leg over",
    "double-leg-over",
    "double around the world",
    "double-around-the-world",
    "double spin",
    "double-spin",
}

# Down-family policy markers; appearance in description / alt-name / notation
# OR in the trick name itself fires the policy block. Word boundaries keep
# matches off "downward" / "shutdown" / etc.
DOWN_MARKERS_REGEX = re.compile(
    r"\b(double[-\s]?over[-\s]?down|down[-\s]?double[-\s]?down|"
    r"spinning\s+down|double\s+down|down[-\s]?diver|"
    r"down\s*\(plant\)|\(\s*plant\s*\))",
    re.IGNORECASE,
)

# Surging modeling rule (skill §2): surging = spinning + stepping; treat as
# a virtual modifier that decomposes into two real modifiers for ADD math.
VIRTUAL_MODIFIERS = {
    "surging": ("spinning", "stepping"),
}

# Modifier ADD-bonus column to use when the base is "rotational" (skill defn:
# mirage, whirl, torque). Approximate via family hints; defaults to non-rot.
ROTATIONAL_BASE_FAMILIES = {"whirl", "mirage", "torque", "swirl"}


def load_canonical(db: sqlite3.Connection) -> dict[str, dict]:
    """slug → {name, adds, family, base, is_active}. Only active rows."""
    rows = db.execute(
        """SELECT slug, canonical_name, adds, base_trick, trick_family, category
           FROM freestyle_tricks WHERE is_active=1"""
    ).fetchall()
    out = {}
    for slug, name, adds, base, family, category in rows:
        try:
            adds_int = int(adds) if adds else None
        except (ValueError, TypeError):
            adds_int = None
        out[slug] = {
            "name": name,
            "adds": adds_int,
            "base": base or slug,
            "family": family or slug,
            "category": category or "",
        }
    return out


def load_aliases(db: sqlite3.Connection) -> dict[str, str]:
    """alias-name (lowercased) → canonical slug."""
    rows = db.execute(
        "SELECT alias_text, trick_slug FROM freestyle_trick_aliases"
    ).fetchall()
    return {alias.lower().strip(): slug for alias, slug in rows}


def load_modifiers(db: sqlite3.Connection) -> dict[str, dict]:
    """slug → {add_bonus, add_bonus_rotational, modifier_type}."""
    rows = db.execute(
        """SELECT slug, modifier_name, add_bonus, add_bonus_rotational, modifier_type
           FROM freestyle_trick_modifiers"""
    ).fetchall()
    out = {}
    for slug, name, ab, abr, mtype in rows:
        out[slug.lower()] = {
            "name": name,
            "add_bonus": ab,
            "add_bonus_rotational": abr,
            "type": mtype,
        }
    return out


def normalize_name_tokens(name: str) -> list[str]:
    """Lowercase, strip punctuation/quotes, split on whitespace + hyphens."""
    cleaned = re.sub(r"[‘’“”'\"`]", "", name.lower())
    cleaned = re.sub(r"[^a-z0-9\-\s]", " ", cleaned)
    return [t for t in re.split(r"[\s\-]+", cleaned) if t]


def find_base_match(
    tokens: list[str], canonical: dict, aliases: dict
) -> tuple[str | None, int, str]:
    """Try suffixes of `tokens` from longest to shortest; return
    (base_slug, n_tokens_consumed, source) where source is 'canonical' /
    'alias' / 'name'. Returns (None, 0, '') on no match.
    """
    for take in range(len(tokens), 0, -1):
        suffix = " ".join(tokens[-take:])
        slug_form = "-".join(tokens[-take:])
        # Exact slug match
        if slug_form in canonical:
            return slug_form, take, "canonical"
        # Canonical name match (lowercased)
        for slug, info in canonical.items():
            if info["name"].lower() == suffix:
                return slug, take, "name"
        # Alias hit
        if suffix in aliases:
            return aliases[suffix], take, "alias"
    return None, 0, ""


def expand_modifier(token: str) -> list[str]:
    """Expand virtual modifiers (e.g. surging → [spinning, stepping])."""
    return list(VIRTUAL_MODIFIERS.get(token, [token]))


def attempt_decomposition(
    name: str,
    tokens: list[str],
    canonical: dict,
    aliases: dict,
    modifiers: dict,
) -> dict:
    """Attempt to split tokens into [<modifiers...>] + <base>. Returns:
        {found: bool, base_slug, base_name, modifier_slugs (after virtual
         expansion), modifier_tokens (raw), expected_adds, all_tokens_used}.
    """
    base_slug, n_consumed, base_source = find_base_match(tokens, canonical, aliases)
    if not base_slug:
        return {"found": False}

    leading = tokens[: len(tokens) - n_consumed]
    if not leading:
        # Whole name is the base / alias — not a structural alias decomposition.
        return {"found": False, "_pure_base": True, "base_slug": base_slug}

    # Each leading token must be a modifier (or virtual modifier).
    modifier_slugs: list[str] = []
    modifier_tokens: list[str] = []
    for tok in leading:
        norm = tok
        # Strip "-ing" if base form is registered (e.g. "miraging" → "mirage"
        # for cases where the gerund maps to a registered modifier).
        candidates = [norm]
        if norm.endswith("ing") and len(norm) > 4:
            candidates.append(norm[:-3])  # "tapping" → "tappin" (no), but
            candidates.append(norm[:-3] + "e")  # try "miraging" → "mirage"
        match = next((c for c in candidates if c in modifiers or c in VIRTUAL_MODIFIERS), None)
        if match is None:
            return {"found": False, "_failed_modifier": tok}
        modifier_tokens.append(tok)
        modifier_slugs.extend(expand_modifier(match))

    base = canonical.get(base_slug)
    if not base or base["adds"] is None:
        return {"found": False, "_base_no_adds": True, "base_slug": base_slug}

    is_rotational = base["family"] in ROTATIONAL_BASE_FAMILIES
    bonus = 0
    for slug in modifier_slugs:
        m = modifiers.get(slug)
        if not m:
            return {"found": False, "_unknown_modifier": slug}
        bonus += m["add_bonus_rotational"] if is_rotational else m["add_bonus"]

    return {
        "found": True,
        "base_slug": base_slug,
        "base_name": base["name"],
        "base_source": base_source,
        "base_adds": base["adds"],
        "modifier_slugs": modifier_slugs,
        "modifier_tokens": modifier_tokens,
        "expected_adds": base["adds"] + bonus,
        "is_rotational": is_rotational,
    }


def evidence_int(row: dict, key: str) -> int:
    val = row.get(key, "0")
    try:
        return int(val) if val else 0
    except ValueError:
        return 0


def has_down_marker(row: dict) -> tuple[bool, str]:
    """Return (matched?, reason-string). Checks name, description, alt-name, notation."""
    fields = [
        ("name",        row.get("external_name", "")),
        ("description", row.get("external_description", "")),
        ("alt-name",    row.get("external_alt_name", "")),
        ("notation",    row.get("external_notation", "")),
    ]
    for label, text in fields:
        if text and DOWN_MARKERS_REGEX.search(text):
            return True, f"down-marker in {label}: '{DOWN_MARKERS_REGEX.search(text).group(0)}'"
    return False, ""


def adjudicate(row: dict, canonical: dict, aliases: dict, modifiers: dict) -> dict:
    """Apply the decision tree to one unresolved row."""
    name = row["external_name"]
    name_lower = name.lower().strip()
    tokens = normalize_name_tokens(name)
    evidence = evidence_int(row, "evidence_score")
    source_adds = None
    try:
        source_adds = int(row.get("external_ADD") or 0) or None
    except ValueError:
        source_adds = None
    has_records = row.get("has_records") == "yes"
    has_notation = row.get("has_external_notation") == "yes"
    has_description = row.get("has_external_description") == "yes"

    # 1. Red-decided non-canonical.
    if name_lower in RED_REJECTED_NAMES:
        return {
            "auto_classification":  "PRODUCTIVE-MULTIPLICITY-NON-CANONICAL",
            "auto_resolvable":      "yes",
            "decomposition":        "n/a (Red pt3 explicit non-canonical)",
            "reason":               "Red pt3 listed this name as 'NOT canonical' — already-decided, no row.",
            "ontology_coverage":    "External coverage only; no canonical row, no alias.",
            "needs_red":            "no",
        }

    is_pm   = row.get("is_productive_multiplicity") == "yes"
    pm_note = row.get("multiplicity_note", "")
    base_resolves_phrase = "is an active canonical"
    base_unresolved_phrase = "does NOT resolve to a canonical or alias"

    # 2. Productive multiplicity with canonical base + not stabilized.
    if is_pm and base_resolves_phrase in pm_note:
        if name_lower in STABILIZED_MULTIPLICITY_NAMES:
            # Already canonical in our dictionary — shouldn't be unresolved.
            # Defensive fall-through.
            pass
        else:
            return {
                "auto_classification":  "PRODUCTIVE-MULTIPLICITY-NON-CANONICAL",
                "auto_resolvable":      "yes",
                "decomposition":        f"{row.get('multiplicity_prefix','')} × {row.get('multiplicity_base_name','')}",
                "reason":               "Per CANONICALIZATION_POLICY §10: count-prefix describes repetition; not canonical unless community usage stabilizes a distinct name. Base resolves; no Red endorsement of this exact name on file.",
                "ontology_coverage":    f"Base canonical present; this row stays as is_active=0 external residue.",
                "needs_red":            "no",
            }

    # 3. Productive multiplicity with unresolved base.
    if is_pm and base_unresolved_phrase in pm_note:
        return {
            "auto_classification":  "PRODUCTIVE-MULTIPLICITY-BASE-UNRESOLVABLE",
            "auto_resolvable":      "no",
            "decomposition":        f"{row.get('multiplicity_prefix','')} × {row.get('multiplicity_base_name','')} (base does not resolve)",
            "reason":               "Detector flagged count-prefix but base lacks canonical or alias coverage; classification depends on whether the base itself merits canonical treatment.",
            "ontology_coverage":    "Neither prefix nor base has dictionary coverage.",
            "needs_red":            "yes (resolve base first)",
        }

    # 6 (early). Down-family policy block.
    blocked, reason = has_down_marker(row)
    if blocked:
        return {
            "auto_classification":  "POLICY-BLOCKED-DOWN",
            "auto_resolvable":      "no",
            "decomposition":        "deferred — down-family canonical state unresolved",
            "reason":               f"Down-family is not canonicalized; {reason}. Per §9, defer over speculate.",
            "ontology_coverage":    "No down/down-double-down canonical exists.",
            "needs_red":            "yes (down-family policy needs to be settled first)",
        }

    # 4 / 5. Structural alias attempt — primary on external_name.
    decomp = attempt_decomposition(name, tokens, canonical, aliases, modifiers)
    if decomp.get("found"):
        decomp_str = (
            " + ".join(decomp["modifier_tokens"])
            + f" + {decomp['base_name']} = {decomp['expected_adds']} ADD"
        )
        if source_adds is not None and source_adds == decomp["expected_adds"]:
            return {
                "auto_classification":  "STRUCTURAL-ALIAS-FULL",
                "auto_resolvable":      "yes",
                "decomposition":        decomp_str,
                "reason":               "Name decomposes as registered modifiers + active canonical base; ADD math matches source. Per skill §4 'Structural alias' category — render in Deep Dive alongside the decomposition; no canonical row earned.",
                "ontology_coverage":    f"Base canonical: {decomp['base_slug']}; modifiers all registered.",
                "needs_red":            "no",
            }
        else:
            return {
                "auto_classification":  "STRUCTURAL-ALIAS-ADD-CONFLICT",
                "auto_resolvable":      "no",
                "decomposition":        decomp_str
                                        + (f" (source ADD={source_adds})" if source_adds else ""),
                "reason":               "Structural decomposition resolves but ADD math disagrees with source. Per §3 ADD-math conflict, needs adjudication (deferred or ADD-only override).",
                "ontology_coverage":    f"Base canonical: {decomp['base_slug']}; modifiers registered.",
                "needs_red":            "yes (ADD reconciliation)",
            }

    # 4b. Fallback: alt_name decomposes. The source's alt_name documents the
    # structural recipe, while external_name is a community-named handle. The
    # external row is named-identity-bound but the decomposition is fully
    # mapped through registered modifiers + an active canonical base. Per
    # skill §4 + §6: this is the strongest "Common alias on the canonical
    # decomposition" candidate. Without record corroboration, defer; with
    # records, escalate to canonical-candidate.
    alt_name = (row.get("external_alt_name") or "").strip()
    if alt_name:
        alt_tokens = normalize_name_tokens(alt_name)
        alt_decomp = attempt_decomposition(alt_name, alt_tokens, canonical, aliases, modifiers)
        if alt_decomp.get("found"):
            alt_str = (
                " + ".join(alt_decomp["modifier_tokens"])
                + f" + {alt_decomp['base_name']} = {alt_decomp['expected_adds']} ADD"
            )
            add_matches = source_adds is not None and source_adds == alt_decomp["expected_adds"]
            if has_records:
                # Record-corroborated community name with documented decomposition:
                # canonical-candidate territory (cf. Atomic Legover / Eggbeater).
                return {
                    "auto_classification":  "CANONICAL-CANDIDATE-NAMED-IDENTITY",
                    "auto_resolvable":      "no",
                    "decomposition":        f"{name} ↔ {alt_str}",
                    "reason":               "Community-named row (records present) with alt-name documenting full structural decomposition. Skill §4 puts this in canonical-candidate territory pending Red endorsement.",
                    "ontology_coverage":    f"Decomposition resolves to base `{alt_decomp['base_slug']}`; modifiers registered. No canonical for the community name yet.",
                    "needs_red":            "yes (canonical-row decision)",
                }
            elif add_matches:
                # Decomposition is clean; community handle is the row's
                # external_name; no record signal. Per §9 bias to fewer
                # rows: treat as alias on the decomposition's canonical
                # path; auto-resolve as structural alias via alt-name.
                return {
                    "auto_classification":  "STRUCTURAL-ALIAS-VIA-ALTNAME",
                    "auto_resolvable":      "yes",
                    "decomposition":        f"{name} ↔ {alt_str}",
                    "reason":               "External row's alt-name documents the structural decomposition (modifiers + canonical base, ADD math matches). External name is community shorthand. Per §9 + §10, no canonical row earned without record corroboration.",
                    "ontology_coverage":    f"Decomposition resolves to base `{alt_decomp['base_slug']}`; modifiers registered.",
                    "needs_red":            "no",
                }
            else:
                # alt-name decomposes but ADD disagrees → defer.
                return {
                    "auto_classification":  "STRUCTURAL-ALIAS-ADD-CONFLICT",
                    "auto_resolvable":      "no",
                    "decomposition":        f"{name} ↔ {alt_str} (source ADD={source_adds})",
                    "reason":               "Alt-name decomposes but ADD math disagrees. Per §3, needs adjudication.",
                    "ontology_coverage":    f"Decomposition base: `{alt_decomp['base_slug']}`.",
                    "needs_red":            "yes (ADD reconciliation)",
                }

    # 7. Strong canonical-candidate signal.
    if has_records and has_notation and has_description and evidence >= 9:
        return {
            "auto_classification":  "CANONICAL-CANDIDATE-NAMED-IDENTITY",
            "auto_resolvable":      "no",
            "decomposition":        "no clean structural decomposition",
            "reason":               "High-evidence row (records + notation + description, evidence ≥ 9) with name that does not decompose via registered modifiers. Candidate for canonical row pending Red.",
            "ontology_coverage":    "No structural coverage; isolated external entry.",
            "needs_red":            "yes (canonical-row decision)",
        }

    # 8. External-only descriptive (low evidence).
    if (not has_records) and evidence <= 4:
        return {
            "auto_classification":  "EXTERNAL-ONLY-DESCRIPTIVE",
            "auto_resolvable":      "yes",
            "decomposition":        "n/a",
            "reason":               f"Weak signal (no records; evidence={evidence}). External corpus mention only; per §9 bias toward fewer rows, surface in coverage-diff but no canonical action.",
            "ontology_coverage":    "External-only.",
            "needs_red":            "no",
        }

    # 9. Fall-through.
    return {
        "auto_classification":  "UNRESOLVED",
        "auto_resolvable":      "no",
        "decomposition":        "n/a",
        "reason":               "Decision rules did not produce a confident classification (mid-evidence, no clean decomposition, no policy block). Per §9, default to ask Red.",
        "ontology_coverage":    f"Evidence: {evidence}; records: {'yes' if has_records else 'no'}; notation: {'yes' if has_notation else 'no'}; description: {'yes' if has_description else 'no'}.",
        "needs_red":            "yes",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--diff", default=str(DEFAULT_DIFF), help="Coverage-diff CSV path")
    ap.add_argument("--db",   default=str(DEFAULT_DB),   help="SQLite DB path")
    ap.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="Output dir for adjudication CSV + MD")
    args = ap.parse_args()

    diff_path = Path(args.diff)
    db_path   = Path(args.db)
    out_dir   = Path(args.out_dir)
    if not diff_path.exists():
        print(f"ERROR: coverage-diff CSV not found at {diff_path}", file=sys.stderr)
        return 1
    if not db_path.exists():
        print(f"ERROR: DB not found at {db_path}", file=sys.stderr)
        return 1
    out_dir.mkdir(parents=True, exist_ok=True)

    db = sqlite3.connect(str(db_path))
    canonical = load_canonical(db)
    aliases   = load_aliases(db)
    modifiers = load_modifiers(db)
    db.close()

    with open(diff_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    unresolved = [r for r in rows if r.get("match_type") == "no match"]
    print(f"Loaded {len(rows)} coverage-diff rows; {len(unresolved)} unresolved.")
    print(f"Canonical: {len(canonical)} active; aliases: {len(aliases)}; modifiers: {len(modifiers)}.")

    out_rows: list[dict] = []
    for row in unresolved:
        verdict = adjudicate(row, canonical, aliases, modifiers)
        out_rows.append({
            "name":                row["external_name"],
            "slug":                row["external_slug"],
            "ADD":                 row.get("external_ADD", ""),
            "url":                 row.get("external_url", ""),
            "evidence_score":      row.get("evidence_score", ""),
            "auto_classification": verdict["auto_classification"],
            "auto_resolvable":     verdict["auto_resolvable"],
            "decomposition":       verdict["decomposition"],
            "reason":              verdict["reason"],
            "ontology_coverage":   verdict["ontology_coverage"],
            "needs_red":           verdict["needs_red"],
            "diff_classified_pattern": row.get("classified_pattern", ""),
        })

    csv_path = out_dir / "structural_alias_adjudication.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
        writer.writeheader()
        writer.writerows(out_rows)

    # Counts.
    counts: dict[str, int] = {}
    auto_yes = auto_no = 0
    for r in out_rows:
        counts[r["auto_classification"]] = counts.get(r["auto_classification"], 0) + 1
        if r["auto_resolvable"] == "yes":
            auto_yes += 1
        else:
            auto_no += 1

    md = []
    md.append("# Structural-alias adjudication report\n")
    md.append("Read-only. Applies already-decided ontology policy "
              "(CANONICALIZATION_POLICY §1, §3, §6, §9, §10 + freestyle-dictionary-surface skill §4) "
              "to the unresolved external coverage rows from the coverage-diff. "
              "No CSV / DB / ontology writes.\n")
    md.append("## Inputs\n")
    md.append(f"- Coverage-diff: `{diff_path.relative_to(REPO)}` ({len(rows)} rows; {len(unresolved)} unresolved)")
    md.append(f"- DB: `{db_path.relative_to(REPO)}` "
              f"(canonical {len(canonical)}, aliases {len(aliases)}, modifiers {len(modifiers)})\n")
    md.append("## Auto-resolvability\n")
    md.append(f"- Auto-resolvable (no Red needed): **{auto_yes}**")
    md.append(f"- Needs human review: **{auto_no}**\n")
    md.append("## Counts by classification\n")
    md.append("| Classification | n |")
    md.append("|---|---|")
    for k in sorted(counts.keys(), key=lambda k: -counts[k]):
        md.append(f"| `{k}` | {counts[k]} |")
    md.append("")
    md.append("## Strongest auto-resolvable cases (highest evidence)\n")
    auto_resolvable = [r for r in out_rows if r["auto_resolvable"] == "yes"]
    auto_resolvable.sort(key=lambda r: -int(r["evidence_score"] or 0))
    md.append("| Evidence | Classification | Name | Decomposition |")
    md.append("|---|---|---|---|")
    for r in auto_resolvable[:15]:
        md.append(
            f"| {r['evidence_score']} | `{r['auto_classification']}` | "
            f"{r['name']} | {r['decomposition']} |"
        )
    md.append("")
    md.append("## Cases blocked by unresolved policy (down-family)\n")
    blocked = [r for r in out_rows if r["auto_classification"] == "POLICY-BLOCKED-DOWN"]
    if blocked:
        md.append("| Name | ADD | Evidence | Trigger |")
        md.append("|---|---|---|---|")
        for r in sorted(blocked, key=lambda r: -int(r["evidence_score"] or 0)):
            md.append(f"| {r['name']} | {r['ADD']} | {r['evidence_score']} | {r['reason']} |")
    else:
        md.append("(none)")
    md.append("")
    md.append("## Cases still needing Red\n")
    red = [r for r in out_rows if r["auto_resolvable"] == "no"
           and r["auto_classification"] != "POLICY-BLOCKED-DOWN"]
    md.append(f"Total: **{len(red)}** rows. Top-evidence sample:\n")
    md.append("| Evidence | Classification | Name | Reason |")
    md.append("|---|---|---|---|")
    for r in sorted(red, key=lambda r: -int(r["evidence_score"] or 0))[:15]:
        md.append(
            f"| {r['evidence_score']} | `{r['auto_classification']}` | "
            f"{r['name']} | {r['reason']} |"
        )
    md.append("")
    md.append("## Outputs\n")
    md.append(f"- CSV: `{csv_path.relative_to(REPO)}`")
    md.append("")

    md_path = out_dir / "structural_alias_adjudication.md"
    md_path.write_text("\n".join(md))

    print(f"Wrote: {csv_path}")
    print(f"Wrote: {md_path}")
    print(f"Auto-resolvable: {auto_yes} / {len(out_rows)}")
    print("By classification:")
    for k in sorted(counts.keys(), key=lambda k: -counts[k]):
        print(f"  {k:<48s} {counts[k]:>4d}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

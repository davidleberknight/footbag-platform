"""
Phase 1 parser MVP — narrow target families, dry-run only.

Builds a tiny tokenizer + role mapper that decomposes
freestyle trick names into the structural-parse JSON shape proposed in
exploration/freestyle-notation-grammar/PROPOSAL.md §2. Restricted to
six target families and excludes policy-dependent tokens so we can
evaluate parser behavior on stable ground before committing to a full
grammar engine.

Targets:
  whirl, butterfly, mirage, illusion, legover, osis

Excludes from this MVP (handled in later phases):
  nuclear, quantum, backside, shooting, down-family

Outputs (read-only by default; no DB writes):
  legacy_data/reports/parser_mvp_dry_run.json   — per-row parse JSON
  legacy_data/reports/parser_mvp_coverage.md    — QC coverage report

Failure classification — every row lands in exactly one bucket:
  exact            — parse complete; computed_adds == asserted_adds
  approximate      — parse complete; computed_adds != asserted_adds
  unresolved       — at least one token didn't classify, OR base.adds missing
  policy_dependent — policy-token detected (shouldn't occur in MVP corpus
                     because we filter; flagged defensively)

Important contract (locked-in 2026-05-09):
  - asserted `adds` from freestyle_tricks remains AUTHORITATIVE.
  - computed_adds is DIAGNOSTIC ONLY. Never overrides editorial truth.
  - status field documents the relationship; it does not promote the
    computed value to canonical.

Usage:
  python3 scripts/parse_freestyle_notation.py
  python3 scripts/parse_freestyle_notation.py --include-policy-dependent
  python3 scripts/parse_freestyle_notation.py --families whirl,butterfly
  python3 scripts/parse_freestyle_notation.py --apply   # writes to DB columns

`--apply` is intentionally lazy: it only writes to the new Phase-0 columns
(jobs_notation_raw, structural_parse_json, computed_add_formula,
computed_adds, add_formula_status) — never to `adds` or `notation`.
Default mode emits reports only.
"""
import argparse
import json
import re
import sqlite3
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

REPO        = Path(__file__).resolve().parent.parent
DEFAULT_DB  = REPO / "database" / "footbag.db"
DEFAULT_OUT_DIR = REPO / "legacy_data" / "reports"

PARSER_VERSION = "1.0-mvp"

DEFAULT_TARGET_FAMILIES = {"whirl", "butterfly", "mirage", "illusion", "legover", "osis"}
ROTATIONAL_BASES = {"whirl", "mirage", "torque", "swirl"}

# Role registries. Hard-coded for the MVP; the registered modifiers in
# freestyle_trick_modifiers are cross-checked at startup so any modifier
# that's in the DB but not classified here surfaces as a parser-coverage
# warning rather than a silent skip.
SET_TOKENS = {
    "atomic", "pixie", "fairy", "pogo", "rooted",
}
ROTATION_TOKENS = {
    "spinning", "inspinning", "swirling", "whirling", "gyro",
}
MODIFIER_TOKENS = {
    "ducking", "stepping", "symposium", "paradox", "tapping",
    "blazing", "weaving", "barraging", "miraging", "diving",
    "blurry", "terraging",
}
# Tokens whose ADD weight is ontology/Red-policy dependent. Rows
# containing any of these (in name OR notation OR alt-name) are skipped
# from the MVP corpus by default.
POLICY_TOKENS = {
    "nuclear", "quantum", "backside", "shooting", "down",
}
# Virtual modifier expansions per skill §2 (surging = spinning + stepping).
VIRTUAL_EXPANSIONS = {
    "surging": [("rotation", "spinning"), ("modifier", "stepping")],
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
       set, rotation, modifier, core_family, policy, virtual, unresolved.
    """
    if tok in VIRTUAL_EXPANSIONS:    return ("virtual", tok)
    if tok in POLICY_TOKENS:         return ("policy", tok)
    if tok in SET_TOKENS:            return ("set", tok)
    if tok in ROTATION_TOKENS:       return ("rotation", tok)
    if tok in MODIFIER_TOKENS:       return ("modifier", tok)
    if tok in core_families:         return ("core_family", tok)
    return ("unresolved", tok)


def parse_trick(
    name: str,
    canonical_slug: str,
    canonicals_by_slug: dict[str, dict],
    core_families: set[str],
) -> dict:
    """Run the role mapper on `name`. Returns the structural-parse dict
    described in PROPOSAL.md §2."""
    parse: dict = {
        "core_family":      [],
        "set":              [],
        "rotation":         [],
        "modifier":         [],
        "delay_surface":    [],
        "directionality":   [],
        "unusual_surface":  [],
        "additive_flags":   [],
        "special_cases":    [],
        "unresolved_tokens":[],
        "parser_version":   PARSER_VERSION,
        "parsed_at":        datetime.now(timezone.utc).isoformat(),
        "parse_source":     "name_decomposition",
    }

    # Multi-token atom guard: if the canonical_slug itself is a hyphenated
    # multi-word canonical (e.g. 'double-leg-over'), preserve it as a
    # single core_family unit rather than decomposing into parts.
    multi_token_canonicals: set[str] = {
        s for s in canonicals_by_slug if "-" in s
    }
    name_as_slug = re.sub(r"\s+", "-", normalize_name(name))
    if name_as_slug in multi_token_canonicals and name_as_slug != canonical_slug:
        # The full name resolves to a different multi-token canonical.
        # Treat as single core_family token.
        parse["core_family"].append({
            "token":          name_as_slug,
            "span_start":     0,
            "span_end":       len(name),
            "atom_resolved":  True,
        })
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
                parse[expanded_role].append({
                    **record, "token": expanded_tok, "expanded_from": val,
                })
            resolved += 1
        elif role == "policy":
            parse["special_cases"].append(val)
            parse["additive_flags"].append("policy_dependent_token_present")
            resolved += 1
        elif role == "unresolved":
            parse["unresolved_tokens"].append({
                **record, "reason": "not in any registry",
            })
        else:
            parse[role].append(record)
            resolved += 1

    parse["resolved_token_count"] = resolved
    return parse


# ─── ADD math ──────────────────────────────────────────────────────────────


def compute_formula(
    parse: dict,
    canonicals_by_slug: dict[str, dict],
    modifier_weights: dict[str, dict],
) -> tuple[int | None, str | None, str]:
    """Returns (computed_adds, formula_string, formula_status_hint).
    formula_status_hint is what the row WOULD be if the only signal were
    the parse — 'exact' or 'approximate' is decided by the caller after
    comparing computed vs asserted.
    """
    cf_list = parse.get("core_family", [])
    if not cf_list:
        return (None, None, "unresolved")
    base_slug = cf_list[0]["token"]
    base = canonicals_by_slug.get(base_slug)
    if not base or base.get("adds") is None:
        return (None, None, "unresolved")

    base_adds = base["adds"]
    is_rotational = base_slug in ROTATIONAL_BASES

    bonus = 0
    contributions: list[str] = []

    def add_contribution(tok: str, kind: str) -> bool:
        nonlocal bonus
        m = modifier_weights.get(tok)
        if not m:
            return False
        weight = m["add_bonus_rotational"] if is_rotational else m["add_bonus"]
        bonus += weight
        contributions.append(f"{tok}(+{weight}{' rot' if is_rotational and m['add_bonus_rotational'] != m['add_bonus'] else ''})")
        return True

    for s in parse.get("set", []):
        add_contribution(s["token"], "set")
    for r in parse.get("rotation", []):
        add_contribution(r["token"], "rotation")
    for m in parse.get("modifier", []):
        add_contribution(m["token"], "modifier")

    if parse.get("unresolved_tokens"):
        return (None, None, "unresolved")

    # Policy-dependent token short-circuits status; computed is approximate
    # at best. For the MVP we exclude these rows from corpus, but defensive.
    if parse.get("special_cases"):
        formula = " + ".join(contributions + [f"{base_slug}({base_adds})"]) + f" = {base_adds + bonus}"
        return (base_adds + bonus, formula, "policy_dependent")

    formula_parts = contributions + [f"{base_slug}({base_adds})"]
    formula = " + ".join(formula_parts) + f" = {base_adds + bonus}"
    computed = base_adds + bonus
    return (computed, formula, "computed_ok")


# ─── DB I/O ────────────────────────────────────────────────────────────────


def load_canonicals(con: sqlite3.Connection) -> dict[str, dict]:
    """slug → {name, adds(int|None), family, base, category, is_active, notation}."""
    rows = con.execute(
        """SELECT slug, canonical_name, adds, base_trick, trick_family, category,
                  is_active, notation
           FROM freestyle_tricks"""
    ).fetchall()
    out = {}
    for slug, name, adds, base, family, category, is_active, notation in rows:
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


def write_qc_report(rows: list[dict], qc_path: Path) -> None:
    qc_path.parent.mkdir(parents=True, exist_ok=True)
    by_status: dict[str, list[dict]] = {}
    for r in rows:
        by_status.setdefault(r["add_formula_status"], []).append(r)

    lines: list[str] = []
    lines.append(f"# Parser MVP coverage report\n")
    lines.append(f"- Parser version: `{PARSER_VERSION}`")
    lines.append(f"- Total rows attempted: **{len(rows)}**")
    lines.append(f"- Target families: {sorted(DEFAULT_TARGET_FAMILIES)}\n")
    lines.append("## Status distribution\n")
    lines.append("| Status | Count |\n|---|---:|")
    for status in ("exact", "approximate", "unresolved", "policy_dependent"):
        lines.append(f"| `{status}` | {len(by_status.get(status, []))} |")
    lines.append("")

    if by_status.get("approximate"):
        lines.append("## ADD math conflicts (computed != asserted)\n")
        lines.append("These are NOT errors — the asserted ADD is editorial truth. "
                     "Each row below indicates either (a) a parser-grammar gap, "
                     "(b) a Red-endorsed exception (e.g. ADD-only activation per CANONICALIZATION_POLICY §3), "
                     "or (c) a missing modifier weight. Surface for editorial review.\n")
        lines.append("| Slug | Asserted | Computed | Formula |")
        lines.append("|---|---:|---:|---|")
        for r in sorted(by_status["approximate"], key=lambda x: (x["family"], x["slug"])):
            lines.append(f"| `{r['slug']}` | {r['asserted_adds']} | {r['computed_adds']} | `{r['computed_add_formula']}` |")
        lines.append("")

    if by_status.get("unresolved"):
        lines.append("## Unresolved (parser couldn't decompose)\n")
        lines.append("Tokens not matched against the role registries. Each is a candidate "
                     "for adding to a registry OR for a future Red review.\n")
        lines.append("| Slug | Name | Unresolved tokens |")
        lines.append("|---|---|---|")
        for r in sorted(by_status["unresolved"], key=lambda x: (x["family"], x["slug"])):
            unresolved = [t["token"] for t in r["structural_parse_json"].get("unresolved_tokens", [])]
            lines.append(f"| `{r['slug']}` | {r['name']} | {', '.join(unresolved) or '(base or modifier weight missing)'} |")
        lines.append("")

    if by_status.get("policy_dependent"):
        lines.append("## Policy-dependent (defensive — should be 0 in MVP corpus)\n")
        for r in by_status["policy_dependent"]:
            lines.append(f"- `{r['slug']}` ({r['name']}): contains {r['structural_parse_json'].get('special_cases', [])}")
        lines.append("")

    if by_status.get("exact"):
        lines.append("## Exact parses\n")
        lines.append("Parse complete; computed equals asserted. These rows are candidates "
                     "for Phase-2 backfill into structural_parse_json + computed_add_formula.\n")
        lines.append("| Slug | Name | Asserted | Computed | Formula |")
        lines.append("|---|---|---:|---:|---|")
        for r in sorted(by_status["exact"], key=lambda x: (x["family"], int(x["asserted_adds"]) if x["asserted_adds"] else 0, x["slug"])):
            lines.append(f"| `{r['slug']}` | {r['name']} | {r['asserted_adds']} | {r['computed_adds']} | `{r['computed_add_formula']}` |")
        lines.append("")

    qc_path.write_text("\n".join(lines) + "\n")


# ─── Main ──────────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db",       default=str(DEFAULT_DB))
    ap.add_argument("--out-dir",  default=str(DEFAULT_OUT_DIR))
    ap.add_argument("--families", default=",".join(sorted(DEFAULT_TARGET_FAMILIES)),
                    help="Comma-separated list of trick_family values to include")
    ap.add_argument("--include-policy-dependent", action="store_true",
                    help="Include rows containing policy tokens (defensive testing only)")
    ap.add_argument("--apply", action="store_true",
                    help="Write structural_parse_json + computed_* fields to DB. "
                         "NEVER touches `adds` or `notation`. Default: dry-run.")
    args = ap.parse_args()

    families = {f.strip() for f in args.families.split(",") if f.strip()}
    db_path = Path(args.db)
    out_dir = Path(args.out_dir)
    if not db_path.exists():
        print(f"ERROR: DB not found at {db_path}", file=sys.stderr)
        return 1

    con = sqlite3.connect(str(db_path))
    canonicals = load_canonicals(con)
    modifier_weights = load_modifier_weights(con)

    # Set of all canonical slugs treated as recognizable family-core tokens
    # for parse classification. Includes names AND slugs.
    family_canonical_tokens: set[str] = set()
    for slug, info in canonicals.items():
        if not info["is_active"]:
            continue
        if info["category"] == "modifier":
            continue
        family_canonical_tokens.add(slug)
        # Also add space-separated form (e.g. 'around-the-world' canonical_name
        # tokenizes to ['around','the','world'] — multi-token atom check
        # in parse_trick handles this).
    # Drop any token that's also in modifier registries; modifier wins.
    family_canonical_tokens -= MODIFIER_TOKENS | SET_TOKENS | ROTATION_TOKENS

    # Sanity-check: every registered modifier is classified.
    unclassified = [m for m in modifier_weights
                    if m not in (MODIFIER_TOKENS | SET_TOKENS | ROTATION_TOKENS)]
    if unclassified:
        print(f"WARN: {len(unclassified)} registered modifiers are not classified into "
              f"a role bucket: {sorted(unclassified)}", file=sys.stderr)

    # Build corpus.
    corpus: list[tuple[str, dict]] = []
    for slug, info in canonicals.items():
        if not info["is_active"]:
            continue
        if info["category"] == "modifier":
            continue
        if info["family"] not in families:
            continue
        if not args.include_policy_dependent and has_policy_token(info["name"], info["notation"]):
            continue
        corpus.append((slug, info))

    print(f"Parser MVP — {len(corpus)} rows in corpus")
    print(f"  families: {sorted(families)}")
    print(f"  policy filter: {'OFF' if args.include_policy_dependent else 'ON'}")

    # Run parser.
    rows: list[dict] = []
    for slug, info in corpus:
        parse = parse_trick(info["name"], slug, canonicals, family_canonical_tokens)
        computed, formula, hint = compute_formula(parse, canonicals, modifier_weights)
        asserted = info["adds"]

        # Status determination.
        if parse.get("special_cases"):
            status = "policy_dependent"
        elif parse.get("unresolved_tokens") or computed is None:
            status = "unresolved"
        elif asserted is not None and computed == asserted:
            status = "exact"
        else:
            status = "approximate"

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

    # Write JSON output.
    json_path = out_dir / "parser_mvp_dry_run.json"
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n")

    # Write QC report.
    qc_path = out_dir / "parser_mvp_coverage.md"
    write_qc_report(rows, qc_path)

    # Optional: apply parses to the new DB columns. Never touches `adds`
    # or `notation`. Idempotent; same row → same parse → same write.
    if args.apply:
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        with con:
            for r in rows:
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
        print(f"  --apply: wrote parses to {len(rows)} freestyle_tricks rows")

    con.close()

    # Stdout summary.
    by_status: dict[str, int] = {}
    for r in rows:
        by_status[r["add_formula_status"]] = by_status.get(r["add_formula_status"], 0) + 1
    print("Status breakdown:")
    for s in ("exact", "approximate", "unresolved", "policy_dependent"):
        print(f"  {s:<18s} {by_status.get(s, 0)}")
    print(f"Wrote: {json_path}")
    print(f"Wrote: {qc_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

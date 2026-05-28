#!/usr/bin/env python3
"""Phase E — A0 compound-notation extrapolation engine (Goal 3).

Read-only. Runs the EXISTING, validated parser (scripts/parse_freestyle_notation.py)
over the UNRESOLVED OBSERVATIONAL names in CLASSIFIED_UNIVERSE.csv to produce a
structurally-interpreted, confidence-scored, provenance-stamped reading for each.

Binding contract (reinforced 2026-05-28):
  - Every output row carries observationally_extrapolated=true.
  - NOTHING is written to the DB. We import the parser's pure functions and run
    them in-memory over names; we NEVER call --apply (which writes canon columns).
  - No parser-derived value becomes canonical. The asserted/canonical layer is
    untouched.
  - Goal = maximize HONEST structural coverage, not "solve every trick." A name
    that cannot be derived is a CLASSIFIED FAILURE, not a forced guess.
  - parser-confidence and doctrine-confidence are SEPARATE columns.
  - Five distinct layers are emitted as independent flags:
      structurally_readable / mechanically_derivable / doctrine_stable /
      observationally_extrapolated / culturally_canonical
  - No fabricated JOB. The parser derives a decomposition + provisional ADD; it
    does NOT generate JOB notation (that needs curator-gated chassis
    substitution). job_status='deferred' on every row.

Front-ends: a single NL-compound tokenizer covers all four sources, because the
Stanford-source names in this corpus are already decoded English (e.g. "Atomic
Ducking Torque"), not raw shorthand. A Stanford cipher decoder would only be
needed if raw shorthand (Z.+0-0+X) were ingested — not the case here.

Outputs (this directory):
  A0_EXTRAPOLATION.csv    — one row per unresolved observational name
  A0_REPORT.md            — coverage + failure-class breakdown + caveats
"""
from __future__ import annotations

import csv
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts"))
import parse_freestyle_notation as P  # noqa: E402  (validated backend; pure fns only)

DB = REPO / "database/footbag.db"
OUT_DIR = Path(__file__).resolve().parent
UNIVERSE = OUT_DIR / "CLASSIFIED_UNIVERSE.csv"

# Doctrine-compression / contested tokens — separate from parser resolution.
COMPRESSION_TOKENS = {"blurry", "blurriest", "blurrier", "furious", "nuclear"}
DOCTRINE_TOKENS = COMPRESSION_TOKENS | {"weaving", "pogo", "shooting", "rooted", "illusioning"}
DIRECTIONAL_SHORTHAND = {"ss", "op", "far", "near", "rev", "reverse", "alpine", "backside", "frontside"}

# Conservative whole-word abbreviation expansions (per the slug-normalization
# rule). Applied to the pre-parenthetical text only. Nothing speculative.
ABBREV = [
    (r"\bdouble leg over\b", "double leg over"),
    (r"\bdlo\b", "double leg over"),
    (r"\bdod\b", "double over down"),
    (r"\bdatw\b", "double around the world"),
    (r"\batw\b", "around the world"),
    (r"\bsymp\.?\b", "symposium"),
    (r"\bpdx\b", "paradox"),
    (r"\bps\b", "paradox symposium"),
    (r"\bps whirl\b", "paradox symposium whirl"),
]
_PAREN_RE = re.compile(r"\s*\(.*$")  # drop the first '(' and everything after

# Positional qualifiers that carry +0 ADD and are not base/modifier tokens.
# Stripping them is the documented slug-normalization rule (SS / (same side) /
# (op) / far / near don't change the structural slug). NOT fabrication: these
# do not contribute to the base+modifier ADD decomposition. `reverse`/`rev` are
# DELIBERATELY kept — direction is structural (rev-whirl is a distinct family).
_DIRECTIONAL_NOISE_RE = re.compile(
    r"\b(same\s+side|opposite\s+side|same|opposite|side|ss|op|far|near)\b")


def clean_for_parse(name: str) -> str:
    s = name.strip()
    s = _PAREN_RE.sub("", s).strip()      # drop folk-name / qualifier parentheticals
    s = s.lower()
    for pat, repl in ABBREV:
        s = re.sub(pat, repl, s)
    s = _DIRECTIONAL_NOISE_RE.sub(" ", s)  # drop +0 positional qualifiers
    return re.sub(r"\s+", " ", s).strip()


def main() -> None:
    con = sqlite3.connect(str(DB))
    canonicals = P.load_canonicals(con)
    modifier_weights = P.load_modifier_weights(con)
    con.close()
    core_families = {s for s, i in canonicals.items()
                     if i["is_active"] and i["category"] != "modifier"}

    with UNIVERSE.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    # Candidate set: every UNRESOLVED observational name.
    candidates = [r for r in rows
                  if r["in_db_live"] == "False" and not r["governance_state"].startswith("1")]

    out = []
    fc_counter: Counter[str] = Counter()
    layer_counter: Counter[str] = Counter()
    reclassified_tier4 = 0  # bare-folk in P5 but actually structurally readable

    for r in candidates:
        name = r["name"]
        cleaned = clean_for_parse(name)
        tokens_present = set(re.findall(r"[a-z]+", cleaned))

        if not cleaned:
            # whole name was a parenthetical / empty → opaque
            parse = None
            computed = formula = None
        else:
            # sentinel slug ensures D1 self-atom (canonical-only) never fires here
            parse = P.parse_trick(cleaned, f"__obs__{r['slug']}", canonicals, core_families)
            computed, formula, _ = P.compute_formula(parse, canonicals, modifier_weights)

        # extract structure
        if parse:
            desc = parse["descriptive_roles"]
            base_tokens = [t["token"] for t in desc["core_family"]]
            mod_tokens = ([t["token"] for t in desc["set"]]
                          + [t["token"] for t in desc["rotation"]]
                          + [t["token"] for t in desc["modifier"]])
            unresolved = [t["token"] for t in desc["unresolved_tokens"]]
            policy = list(parse.get("policy_tokens", []))
        else:
            base_tokens, mod_tokens, unresolved, policy = [], [], [], []

        # modifier-weight coverage (a classified modifier with no weight = silent
        # under-count → NOT mechanically derivable)
        missing_weights = [m for m in mod_tokens if m not in modifier_weights]

        # ── five layers (independent) ──
        structurally_readable = bool(base_tokens) and len(base_tokens) == 1 and not unresolved
        mechanically_derivable = (structurally_readable and computed is not None
                                  and not missing_weights and not policy)
        doctrine_stable = not (tokens_present & DOCTRINE_TOKENS) and not policy
        observationally_extrapolated = True
        culturally_canonical = False  # candidate set excludes in_db rows by construction

        # ── confidences (kept separate) ──
        if mechanically_derivable:
            parser_conf = "high"
        elif structurally_readable:
            parser_conf = "medium"   # structure understood, ADD not closed
        elif base_tokens or mod_tokens:
            parser_conf = "low"      # partial resolution
        else:
            parser_conf = "none"
        if policy:
            doctrine_conf = "policy-dependent"
        elif tokens_present & DOCTRINE_TOKENS:
            doctrine_conf = "blocked"
        else:
            doctrine_conf = "stable"

        # ── failure class (single primary, priority-ordered) ──
        source_adds_raw = (r.get("source_adds") or "").strip()
        src_vals = {v.strip() for v in source_adds_raw.split(",") if v.strip()}
        fc = ""
        if mechanically_derivable:
            fc = ""  # success
        elif not cleaned or (not base_tokens and not mod_tokens):
            fc = "folk-name-opacity"
        elif tokens_present & COMPRESSION_TOKENS:
            fc = "compression-ambiguity"
        elif len(base_tokens) > 1:
            fc = "ambiguous-terminal-mechanic"
        elif not base_tokens and mod_tokens:
            fc = "ambiguous-terminal-mechanic"  # modifiers but no identifiable base
        elif unresolved and (set(unresolved) & DIRECTIONAL_SHORTHAND):
            fc = "unresolved-directional-syntax"
        elif unresolved or missing_weights:
            fc = "unknown-modifier-token"
        elif structurally_readable and computed is None:
            fc = "impossible-ADD-reconciliation"  # base.adds missing
        elif (computed is not None and len(src_vals) == 1
              and src_vals != {str(computed)}):
            fc = "impossible-ADD-reconciliation"  # computed conflicts w/ source claim
        elif len(src_vals) > 1:
            fc = "conflicting-source-expansions"
        else:
            fc = "parser-ambiguity"
        if fc:
            fc_counter[fc] += 1
        else:
            fc_counter["(derived)"] += 1

        # honest reclassification signal: P5 sent bare-eco A rows to Tier 4, but
        # some are actually structurally readable once parsed
        if r["category"] == "A" and not r["ecosystems"] and structurally_readable:
            reclassified_tier4 += 1

        layer_counter[f"structurally_readable={structurally_readable}"] += 1
        layer_counter[f"mechanically_derivable={mechanically_derivable}"] += 1

        out.append({
            "name": name,
            "slug": r["slug"],
            "source_corpus": r["source_corpus"],
            "provenance": r.get("sources", ""),
            "cleaned_for_parse": cleaned,
            "base_trick": "|".join(base_tokens),
            "modifier_stack": "|".join(mod_tokens),
            "decomposition": formula or "",
            "provisional_add": "" if computed is None else str(computed),
            "job_status": "deferred:chassis-substitution-required",
            "parser_confidence": parser_conf,
            "doctrine_confidence": doctrine_conf,
            "structurally_readable": str(structurally_readable),
            "mechanically_derivable": str(mechanically_derivable),
            "doctrine_stable": str(doctrine_stable),
            "observationally_extrapolated": "true",
            "culturally_canonical": "false",
            "unresolved_tokens": "|".join(unresolved),
            "missing_modifier_weights": "|".join(missing_weights),
            "failure_class": fc,
            "source_adds": source_adds_raw,
        })

    cols = ["name", "slug", "source_corpus", "provenance", "cleaned_for_parse",
            "base_trick", "modifier_stack", "decomposition", "provisional_add",
            "job_status", "parser_confidence", "doctrine_confidence",
            "structurally_readable", "mechanically_derivable", "doctrine_stable",
            "observationally_extrapolated", "culturally_canonical",
            "unresolved_tokens", "missing_modifier_weights", "failure_class",
            "source_adds"]
    with (OUT_DIR / "A0_EXTRAPOLATION.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(out)

    # ── metrics ──
    n = len(out)
    mech = sum(1 for o in out if o["mechanically_derivable"] == "True")
    struct = sum(1 for o in out if o["structurally_readable"] == "True")
    stable = sum(1 for o in out if o["doctrine_stable"] == "True")
    pc = Counter(o["parser_confidence"] for o in out)
    dc = Counter(o["doctrine_confidence"] for o in out)

    def pct(x):
        return f"{100*x/n:.1f}%" if n else "0%"

    report = []
    report.append("# P3 — A0 compound-notation extrapolation")
    report.append("")
    report.append(f"Ran the validated parser (scripts/parse_freestyle_notation.py, "
                  f"pure functions, in-memory, **DB never written**) over **{n}** unresolved "
                  "observational names. Every row carries `observationally_extrapolated=true`; "
                  "no value is canonical; JOB is deferred (no fabrication).")
    report.append("")
    report.append("## Coverage (the five layers, independent)")
    report.append("")
    report.append("| Layer | Count | % of candidates |")
    report.append("|---|---:|---:|")
    report.append(f"| structurally_readable (1 base, all tokens placed) | {struct} | {pct(struct)} |")
    report.append(f"| mechanically_derivable (structure + closed ADD, all weights known) | {mech} | {pct(mech)} |")
    report.append(f"| doctrine_stable (no doctrine/policy token) | {stable} | {pct(stable)} |")
    report.append(f"| observationally_extrapolated | {n} | 100% |")
    report.append(f"| culturally_canonical | 0 | 0% (canonical rows excluded by construction) |")
    report.append("")
    report.append("Parser confidence (independent of doctrine):")
    report.append("")
    report.append("| parser_confidence | count |")
    report.append("|---|---:|")
    for k in ("high", "medium", "low", "none"):
        report.append(f"| {k} | {pc.get(k,0)} |")
    report.append("")
    report.append("Doctrine confidence (independent of parser):")
    report.append("")
    report.append("| doctrine_confidence | count |")
    report.append("|---|---:|")
    for k in ("stable", "blocked", "policy-dependent"):
        report.append(f"| {k} | {dc.get(k,0)} |")
    report.append("")
    report.append("## Failure classes")
    report.append("")
    report.append("| failure_class | count |")
    report.append("|---|---:|")
    for k, v in fc_counter.most_common():
        report.append(f"| {k} | {v} |")
    report.append("")
    report.append("These classes are the actionable backlog: `unknown-modifier-token` + "
                  "`missing_modifier_weights` drive parser/registry evolution (e.g. `inspinning` "
                  "has no weight row); `compression-ambiguity` + `impossible-ADD-reconciliation` "
                  "drive doctrine prioritization; `folk-name-opacity` is the observational-only "
                  "residual; `conflicting-source-expansions` is the cross-source watch-list.")
    report.append("")
    report.append("## Caveats (honest scope)")
    report.append("")
    report.append(f"- **{reclassified_tier4}** names that P5 put in Tier 4 (\"observational-only\", "
                  "bare folk) are in fact structurally readable once parsed — the A0 pass "
                  "reclassifies them upward, confirming the Tier-4 over-inclusion caveat.")
    report.append("- `mechanically_derivable` requires the BASE trick to be a known canonical with "
                  "a known ADD AND every modifier to have a registered weight. A correct structure "
                  "with an unregistered modifier (e.g. `inspinning`) is `structurally_readable` but "
                  "NOT `mechanically_derivable` — surfaced, not silently zero-counted.")
    report.append("- JOB notation is intentionally NOT generated. Provisional ADD + decomposition "
                  "are derived; JOB requires curator-gated chassis substitution (separate slice).")
    report.append("- Stanford names in this corpus are already decoded English, so one NL "
                  "tokenizer covers all sources; a cipher decoder is future-only.")
    (OUT_DIR / "A0_REPORT.md").write_text("\n".join(report) + "\n", encoding="utf-8")

    # ── stdout ──
    print(f"A0 over {n} unresolved observational names:")
    print(f"  structurally_readable : {struct} ({pct(struct)})")
    print(f"  mechanically_derivable: {mech} ({pct(mech)})")
    print(f"  doctrine_stable       : {stable} ({pct(stable)})")
    print(f"  parser_confidence     : {dict(pc)}")
    print(f"  doctrine_confidence   : {dict(dc)}")
    print(f"  Tier-4 reclassified up: {reclassified_tier4}")
    print("  failure classes:")
    for k, v in fc_counter.most_common():
        print(f"    {k:<32s} {v}")
    print("\nWrote A0_EXTRAPOLATION.csv + A0_REPORT.md")


if __name__ == "__main__":
    main()

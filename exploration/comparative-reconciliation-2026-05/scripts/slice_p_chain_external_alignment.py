#!/usr/bin/env python3
"""
Slice P — Symbolic-Equivalence Cross-Source Audit
==================================================

For each entry in the IFPA chain registry (freestyleSymbolicEquivalences.ts),
locate the matching footbagmoves (FM) and Passback (PB) row by name/alias
and compare the symbolic reading. Classify each pair as identical /
equivalent-shorthand / equivalent-structural / divergent / external-only /
our-only / no-data.

Also identify FM/PB rows that supply a structural reading for an IFPA trick
that LACKS a chain entry — these become candidates for a future Slice N+1
authoring pass.

CRITICAL DISCIPLINE
-------------------
This script does NOT author chain entries, does NOT change content modules,
and does NOT make any DB writes. It produces a CSV queue of cross-source
alignment observations for curator triage. Per Slice P plan: queue only.

Inputs
------
  - src/content/freestyleSymbolicEquivalences.ts (regex-parsed)
  - exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv
  - exploration/passback-intake/passback_reports/matched_existing.csv
  - exploration/passback-intake/passback_trick_sources.csv
  - database/footbag.db (read-only, for slugs lacking chain entries)

Outputs
-------
  - exploration/comparative-reconciliation-2026-05/chain_external_alignment.csv
  - exploration/comparative-reconciliation-2026-05/SLICE_P_FINDINGS.md
"""
import csv
import re
import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DB_PATH   = REPO_ROOT / "database" / "footbag.db"
CHAINS_TS = REPO_ROOT / "src" / "content" / "freestyleSymbolicEquivalences.ts"
FM_CSV    = REPO_ROOT / "exploration" / "footbagmoves-federation" / "SYMBOLIC_GRAMMAR_MASTER.csv"
PB_MATCH  = REPO_ROOT / "exploration" / "passback-intake" / "passback_reports" / "matched_existing.csv"
PB_SOURCE = REPO_ROOT / "exploration" / "passback-intake" / "passback_trick_sources.csv"
OUT_DIR   = REPO_ROOT / "exploration" / "comparative-reconciliation-2026-05"
CSV_OUT   = OUT_DIR / "chain_external_alignment.csv"
MD_OUT    = OUT_DIR / "SLICE_P_FINDINGS.md"

# ─────────────────────────────────────────────────────────────────────────
# IFPA chain registry parser (regex-based — the TS file is hand-written and
# follows a consistent format).
# ─────────────────────────────────────────────────────────────────────────

CHAIN_ENTRY_RE = re.compile(
    r"\{\s*"
    r"slug:\s*'(?P<slug>[a-z0-9-]+)',\s*"
    r"readings:\s*\[(?P<readings>[^\]]+)\],\s*"
    r"curatorConfirmPending:\s*(?P<pending>true|false)",
    re.DOTALL,
)
READING_RE = re.compile(r"'([^']*)'")


def parse_ifpa_chains(ts_path):
    text = ts_path.read_text()
    chains = []
    for match in CHAIN_ENTRY_RE.finditer(text):
        slug = match.group("slug")
        readings_block = match.group("readings")
        readings = [r.strip() for r in READING_RE.findall(readings_block)]
        chains.append({
            "slug":     slug,
            "readings": readings,
            "pending":  match.group("pending") == "true",
        })
    return chains


# ─────────────────────────────────────────────────────────────────────────
# Name normalization + tokenization
# ─────────────────────────────────────────────────────────────────────────

PUNCT_RE = re.compile(r"[^\w\s-]")


def normalize_name(s):
    """'Atom Smasher' → 'atom-smasher'; '  spinning  TORQUE ' → 'spinning-torque'."""
    if not s:
        return ""
    s = s.strip().lower()
    s = PUNCT_RE.sub(" ", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def tokens_of(reading):
    """'spinning ss miraging op osis' → ['spinning', 'ss', 'miraging', 'op', 'osis']."""
    if not reading:
        return []
    s = reading.strip().lower()
    s = PUNCT_RE.sub(" ", s)
    return [t for t in s.split() if t]


# Tokens we treat as 'operational' connective vocabulary; their presence
# in a candidate reading means we are comparing operational notation
# rather than educational shorthand.
OPERATIONAL_MARKERS = {
    "dex", "del", "xdex", "xbd", "bod", "op", "ss", "same",
    "in", "out", "front", "toe", "clip", "pdx", "duck",
}

EDUCATIONAL_MARKERS = {
    # operator/modifier vocabulary in educational compositional readings
    "spinning", "ducking", "diving", "weaving", "symposium", "paradox",
    "stepping", "tapping", "barraging", "blazing", "gyro", "illusioning",
    "atomic", "pixie", "fairy", "furious", "pogo", "quantum", "rooted",
    "sailing", "shooting", "surging", "nuclear", "blurry", "whirling",
    "miraging", "double", "high", "stepping-paradox", "stepping",
}


def reading_dialect(reading):
    """Returns 'operational' / 'educational' / 'mixed' / 'unknown' based on
    presence of operational vs educational marker vocabulary."""
    toks = set(tokens_of(reading))
    op = bool(toks & OPERATIONAL_MARKERS)
    ed = bool(toks & EDUCATIONAL_MARKERS)
    if op and not ed:
        return "operational"
    if ed and not op:
        return "educational"
    if op and ed:
        return "mixed"
    return "unknown"


def compare_readings(ifpa_readings, external_reading):
    """Returns (alignment, divergence_type).

    alignment ∈ {
      'identical',                  # token-equal to one of our readings
      'equivalent-shorthand',       # same token set, different order/extra
      'equivalent-structural',      # different vocab but same structural shape
      'operational-dialect',        # external uses op-notation; not directly comparable
      'divergent',                  # substantially different
      'external-only',              # IFPA has no reading at all
      'our-only',                   # external has no reading
      'no-data',                    # neither has a reading
    }
    """
    has_ifpa = bool(ifpa_readings)
    has_ext  = bool(external_reading and external_reading.strip())

    if not has_ifpa and not has_ext:
        return ("no-data", "both-empty")
    if has_ifpa and not has_ext:
        return ("our-only", "external-missing")
    if has_ext and not has_ifpa:
        return ("external-only", "ifpa-missing")

    ext_dialect = reading_dialect(external_reading)
    if ext_dialect == "operational":
        return ("operational-dialect", "external-uses-op-notation")

    ext_tokens = tokens_of(external_reading)
    for our_reading in ifpa_readings:
        our_tokens = tokens_of(our_reading)
        if ext_tokens == our_tokens:
            return ("identical", "token-equal")
        if set(ext_tokens) == set(our_tokens):
            return ("equivalent-shorthand", "same-set-different-order")
        # Substring containment: external reading sits inside ours or vice versa.
        if set(ext_tokens).issubset(set(our_tokens)) or set(our_tokens).issubset(set(ext_tokens)):
            return ("equivalent-shorthand", "containment-overlap")

    # If we got here: external has tokens but they don't equal/superset any
    # of our readings.
    return ("divergent", "different-token-set")


# ─────────────────────────────────────────────────────────────────────────
# Load external data
# ─────────────────────────────────────────────────────────────────────────

def load_fm():
    """FM rows indexed by normalized move_name + alternate_names."""
    fm_by_slug = {}
    with FM_CSV.open() as f:
        reader = csv.DictReader(f)
        for row in reader:
            move_name = (row.get("move_name") or "").strip()
            if not move_name:
                continue
            for candidate in [move_name] + [
                n.strip() for n in (row.get("alternate_names") or "").split("|") if n.strip()
            ]:
                slug = normalize_name(candidate)
                if slug and slug not in fm_by_slug:
                    fm_by_slug[slug] = {
                        "move_name":             move_name,
                        "technical_name":        row.get("technical_name", "").strip(),
                        "symbolic_notation_raw": row.get("symbolic_notation_raw", "").strip(),
                        "parsed_symbol_sequence": row.get("parsed_symbol_sequence", "").strip(),
                        "source_adds":           row.get("source_adds", "").strip(),
                        "derived_adds":          row.get("derived_adds", "").strip(),
                    }
    return fm_by_slug


def load_pb():
    """PB rows indexed by candidate_trick_slug + normalized_primary_name."""
    pb_by_slug = {}
    for path in [PB_MATCH, PB_SOURCE]:
        if not path.exists():
            continue
        with path.open() as f:
            reader = csv.DictReader(f)
            for row in reader:
                primary = (row.get("normalized_primary_name") or "").strip().lower()
                trick_slug = (row.get("candidate_trick_slug") or "").strip()
                tech = (row.get("passback_technical_name") or "").strip()
                if not tech:
                    continue
                for key in [trick_slug, primary]:
                    slug = normalize_name(key)
                    if slug and slug not in pb_by_slug:
                        pb_by_slug[slug] = {
                            "primary_name":      row.get("passback_primary_name", "").strip(),
                            "alternate_names":   row.get("passback_alternate_names", "").strip(),
                            "technical_name":    tech,
                            "uptime_component":  row.get("passback_uptime_component", "").strip(),
                            "downtime_component":row.get("passback_downtime_component", "").strip(),
                            "dex_count":         row.get("passback_dex_count", "").strip(),
                        }
    return pb_by_slug


def load_db_tricks():
    """Live IFPA dictionary slugs → (canonical_name, adds, base_trick)."""
    if not DB_PATH.exists():
        return {}
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        rows = conn.execute(
            "SELECT slug, canonical_name, adds, base_trick, trick_family "
            "FROM freestyle_tricks WHERE is_active=1"
        ).fetchall()
    finally:
        conn.close()
    return {
        r[0]: {
            "slug":           r[0],
            "canonical_name": r[1],
            "adds":           r[2],
            "base_trick":     r[3],
            "trick_family":   r[4],
        } for r in rows
    }


# ─────────────────────────────────────────────────────────────────────────
# Build the alignment rows
# ─────────────────────────────────────────────────────────────────────────

CSV_COLUMNS = [
    "slug",
    "ifpa_readings",
    "fm_technical_name",
    "fm_symbolic_notation_raw",
    "pb_technical_name",
    "alignment_fm",
    "divergence_type_fm",
    "alignment_pb",
    "divergence_type_pb",
    "fm_present",
    "pb_present",
    "ifpa_chain_present",
    "candidate_new_chain_entry",
    "pending_red",
    "curator_action",
    "notes",
]


def build_alignment_rows(chains, fm, pb, db_tricks):
    rows = []
    seen_slugs = set()

    # Phase A: every IFPA chain entry.
    for c in chains:
        slug = c["slug"]
        seen_slugs.add(slug)
        fm_row = fm.get(slug)
        pb_row = pb.get(slug)

        fm_reading = fm_row["technical_name"] if fm_row else ""
        pb_reading = pb_row["technical_name"] if pb_row else ""

        align_fm, div_fm = compare_readings(c["readings"], fm_reading)
        align_pb, div_pb = compare_readings(c["readings"], pb_reading)

        # pending_red: any chain row whose alignment is divergent or whose
        # external sources surface a Red Wave 2 dependency token (blurry,
        # fairy, barraging, surging on non-canonical compounds, etc.)
        readings_text = " ".join(c["readings"]).lower()
        external_text = (fm_reading + " " + pb_reading).lower()
        red_terms = ("blurry", "fairy", "barraging", "stepping-paradox", "stepping paradox")
        pending_red = (
            align_fm == "divergent" or align_pb == "divergent"
            or any(t in readings_text or t in external_text for t in red_terms)
            or c["pending"]
        )

        rows.append({
            "slug":                       slug,
            "ifpa_readings":              " | ".join(c["readings"]),
            "fm_technical_name":          fm_reading,
            "fm_symbolic_notation_raw":   (fm_row or {}).get("symbolic_notation_raw", ""),
            "pb_technical_name":          pb_reading,
            "alignment_fm":               align_fm,
            "divergence_type_fm":         div_fm,
            "alignment_pb":               align_pb,
            "divergence_type_pb":         div_pb,
            "fm_present":                 "true" if fm_row else "false",
            "pb_present":                 "true" if pb_row else "false",
            "ifpa_chain_present":         "true",
            "candidate_new_chain_entry":  "false",
            "pending_red":                "true" if pending_red else "false",
            "curator_action":             "",
            "notes":                      "",
        })

    # Phase B: IFPA trick rows that LACK a chain entry but have a reading
    # in FM or PB — Slice N+1 candidates.
    for slug, t in db_tricks.items():
        if slug in seen_slugs:
            continue
        if t.get("base_trick") == slug:
            continue  # base trick itself; rarely needs a chain
        fm_row = fm.get(slug)
        pb_row = pb.get(slug)
        if not (fm_row or pb_row):
            continue

        fm_reading = (fm_row or {}).get("technical_name", "")
        pb_reading = (pb_row or {}).get("technical_name", "")
        # Skip when external sources also have no technical reading.
        if not (fm_reading or pb_reading):
            continue

        # If FM's technical_name is essentially the same as our slug (e.g.
        # IFPA has 'paradox-whirl', FM technical_name = 'Paradox Whirl'),
        # the chain would add no semantic value — skip.
        if fm_reading and normalize_name(fm_reading) == slug:
            fm_reading = ""
        if pb_reading and normalize_name(pb_reading) == slug:
            pb_reading = ""
        if not (fm_reading or pb_reading):
            continue

        # Educational dialect only — operational op-notation candidates are
        # not adoption candidates here (they live on the trick-detail page).
        fm_ok = fm_reading and reading_dialect(fm_reading) in ("educational", "unknown")
        pb_ok = pb_reading and reading_dialect(pb_reading) in ("educational", "unknown")
        if not (fm_ok or pb_ok):
            continue

        readings_text = (fm_reading + " " + pb_reading).lower()
        red_terms = ("blurry", "fairy", "barraging", "stepping-paradox", "stepping paradox")
        pending_red = any(t in readings_text for t in red_terms)

        rows.append({
            "slug":                       slug,
            "ifpa_readings":              "",
            "fm_technical_name":          fm_reading,
            "fm_symbolic_notation_raw":   (fm_row or {}).get("symbolic_notation_raw", ""),
            "pb_technical_name":          pb_reading,
            "alignment_fm":               "external-only" if fm_reading else "",
            "divergence_type_fm":         "ifpa-missing-chain" if fm_reading else "",
            "alignment_pb":               "external-only" if pb_reading else "",
            "divergence_type_pb":         "ifpa-missing-chain" if pb_reading else "",
            "fm_present":                 "true" if fm_row else "false",
            "pb_present":                 "true" if pb_row else "false",
            "ifpa_chain_present":         "false",
            "candidate_new_chain_entry":  "true",
            "pending_red":                "true" if pending_red else "false",
            "curator_action":             "",
            "notes":                      "",
        })

    return rows


# ─────────────────────────────────────────────────────────────────────────
# Output writers
# ─────────────────────────────────────────────────────────────────────────

def write_csv(rows):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with CSV_OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def md_cell(s):
    """Escape pipe so it doesn't break markdown table cells, and trim
    long strings for legibility."""
    if not s:
        return "—"
    s = s.replace("|", "\\|")
    if len(s) > 110:
        s = s[:107] + "…"
    return s


def write_summary(rows, chains, fm, pb, db_tricks):
    chain_rows     = [r for r in rows if r["ifpa_chain_present"] == "true"]
    candidate_rows = [r for r in rows if r["candidate_new_chain_entry"] == "true"]

    # Alignment distribution
    align_count = {}
    for r in chain_rows:
        for col in ("alignment_fm", "alignment_pb"):
            v = r[col]
            if v:
                align_count[v] = align_count.get(v, 0) + 1

    # FM / PB coverage of IFPA chains
    fm_covered = sum(1 for r in chain_rows if r["fm_present"] == "true")
    pb_covered = sum(1 for r in chain_rows if r["pb_present"] == "true")
    no_external = sum(
        1 for r in chain_rows
        if r["fm_present"] == "false" and r["pb_present"] == "false"
    )

    pending_red_chains = [r for r in chain_rows if r["pending_red"] == "true"]
    pending_red_cands  = [r for r in candidate_rows if r["pending_red"] == "true"]

    lines = [
        "# Slice P — Symbolic-Equivalence Cross-Source Audit — Findings",
        "",
        "Generated by `scripts/slice_p_chain_external_alignment.py`. Compares "
        f"each entry in the IFPA chain registry ({len(chains)} chains) against "
        f"footbagmoves ({len(fm)} unique slugs) and Passback "
        f"({len(pb)} unique slugs). No content changes; no auto-authoring.",
        "",
        "## Headline metrics",
        "",
        f"- **IFPA chains audited**: {len(chain_rows)}",
        f"- **FM coverage of IFPA chains**: {fm_covered}/{len(chain_rows)} "
        f"({100*fm_covered//max(len(chain_rows),1)}%)",
        f"- **Passback coverage of IFPA chains**: {pb_covered}/{len(chain_rows)} "
        f"({100*pb_covered//max(len(chain_rows),1)}%)",
        f"- **Chains with no external coverage** (FM + PB both absent): {no_external}",
        f"- **IFPA rows lacking a chain but with an external reading** "
        f"(Slice N+1 candidates): {len(candidate_rows)}",
        f"- **Chain rows flagged pending_red**: {len(pending_red_chains)}",
        f"- **Slice N+1 candidate rows flagged pending_red**: {len(pending_red_cands)}",
        "",
        "## Alignment distribution (chain-row IFPA↔external comparisons)",
        "",
        "| Alignment | Count |",
        "|---|---|",
    ]
    for k, v in sorted(align_count.items(), key=lambda x: -x[1]):
        lines.append(f"| `{k}` | {v} |")

    # Divergent rows — highest curator value
    divergent_rows = [
        r for r in chain_rows
        if "divergent" in (r["alignment_fm"], r["alignment_pb"])
    ]
    if divergent_rows:
        lines += [
            "",
            "## Divergent alignments (IFPA chain ≠ external reading)",
            "",
            "Each row below is a chain whose IFPA reading does NOT match the "
            "external source's structural reading. These are the highest-",
            "value curator-triage rows: external sources are encoding a "
            "different structural decomposition.",
            "",
            "| Slug | IFPA reading(s) | FM technical_name | PB technical_name | Divergent on |",
            "|---|---|---|---|---|",
        ]
        for r in divergent_rows[:30]:
            fm_align = r['alignment_fm']
            pb_align = r['alignment_pb']
            divergent_side = []
            if fm_align == "divergent": divergent_side.append("FM")
            if pb_align == "divergent": divergent_side.append("PB")
            lines.append(
                f"| `{r['slug']}` | {md_cell(r['ifpa_readings'])} | "
                f"{md_cell(r['fm_technical_name'])} | "
                f"{md_cell(r['pb_technical_name'])} | "
                f"{'/'.join(divergent_side)} |"
            )
        if len(divergent_rows) > 30:
            lines.append(f"| ... | _(+{len(divergent_rows)-30} more in CSV)_ | | | |")

    # Slice N+1 candidates — second-priority output
    if candidate_rows:
        lines += [
            "",
            "## Slice N+1 chain candidates (IFPA-row lacks chain; FM/PB supplies reading)",
            "",
            f"{len(candidate_rows)} IFPA rows have no chain entry but an external "
            "source supplies a structural reading we could adopt. **Curator must "
            "verify each reading independently** — external sources may carry "
            "compression conventions IFPA hasn't ratified.",
            "",
            "| Slug | FM technical_name | PB technical_name | pending_red |",
            "|---|---|---|---|",
        ]
        for r in candidate_rows[:30]:
            lines.append(
                f"| `{r['slug']}` | {md_cell(r['fm_technical_name'])} | "
                f"{md_cell(r['pb_technical_name'])} | {r['pending_red']} |"
            )
        if len(candidate_rows) > 30:
            lines.append(f"| ... | _(+{len(candidate_rows)-30} more in CSV)_ | | |")

    # IFPA-only chains (we have a reading; FM + PB both absent)
    our_only_chains = [
        r for r in chain_rows
        if r["fm_present"] == "false" and r["pb_present"] == "false"
    ]
    if our_only_chains:
        lines += [
            "",
            "## IFPA-only chains (no external corroboration)",
            "",
            f"{len(our_only_chains)} chains have neither an FM nor a PB row. "
            "These are IFPA-internal curator decisions or rows external "
            "sources don't track.",
            "",
        ]
        for r in our_only_chains[:30]:
            readings_display = r['ifpa_readings'].replace(' | ', '; ')
            lines.append(f"- `{r['slug']}` — `{readings_display}`")
        if len(our_only_chains) > 30:
            lines.append(f"- _(+{len(our_only_chains)-30} more)_")

    lines += [
        "",
        "## Alignment classification glossary",
        "",
        "| Alignment | Definition |",
        "|---|---|",
        "| `identical` | IFPA reading and external reading tokenize to the same sequence |",
        "| `equivalent-shorthand` | Same token set, different order or containment overlap |",
        "| `operational-dialect` | External uses op-notation (DEX/DEL/BOD/XBD tokens); not directly comparable |",
        "| `divergent` | Different token sets — structural decompositions disagree |",
        "| `external-only` | External source has reading; IFPA chain registry lacks one |",
        "| `our-only` | IFPA has chain; external source has no technical-name reading |",
        "| `no-data` | Neither side has a structural reading |",
        "",
        "## Discipline preserved",
        "",
        "- ❌ No auto-authoring of chain entries",
        "- ❌ No content-module edits",
        "- ❌ No DB writes",
        "- ❌ No claim that any external reading IS the correct decomposition",
        "- ❌ Operational notation NOT proposed as a chain reading (op-dialect "
        "rows are flagged but not promoted)",
        "- ❌ No Red Wave 2 resolution",
        "",
        "## Pending Red Wave 2 (do NOT resolve in this slice)",
        "",
        f"{len(pending_red_chains)} chain rows + {len(pending_red_cands)} "
        "candidate rows carry `pending_red=true`. Triggers: divergent "
        "alignment, presence of blurry / fairy / barraging / stepping-"
        "paradox vocabulary in either side. Wave 2 packet covers these.",
        "",
        "## Next slice",
        "",
        "**Slice Q — ADD-Divergence Reclassification.** Will re-categorize "
        "the existing FM_MATH_DIVERGENCES.csv + ADD_CONFLICT_MATRIX.csv "
        "through the post-Slice-M lens (branch-family-implicit, "
        "compressed-vs-expanded-reading, hidden-dex-discrepancy, etc.).",
        "",
    ]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MD_OUT.write_text("\n".join(lines))


# ─────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────

def main():
    if not CHAINS_TS.exists():
        print(f"ERROR: chain registry not found at {CHAINS_TS}", file=sys.stderr)
        sys.exit(1)
    if not FM_CSV.exists():
        print(f"ERROR: FM master CSV not found at {FM_CSV}", file=sys.stderr)
        sys.exit(1)

    chains    = parse_ifpa_chains(CHAINS_TS)
    fm        = load_fm()
    pb        = load_pb()
    db_tricks = load_db_tricks()

    rows = build_alignment_rows(chains, fm, pb, db_tricks)
    write_csv(rows)
    write_summary(rows, chains, fm, pb, db_tricks)

    print(f"Slice P parsed {len(chains)} IFPA chains")
    print(f"  FM rows loaded: {len(fm)} unique slugs")
    print(f"  PB rows loaded: {len(pb)} unique slugs")
    print(f"  DB tricks loaded: {len(db_tricks)}")
    print(f"  Output rows: {len(rows)} → {CSV_OUT}")
    print(f"  Summary → {MD_OUT}")


if __name__ == "__main__":
    main()

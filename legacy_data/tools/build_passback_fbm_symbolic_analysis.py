#!/usr/bin/env python3
"""PassBack + FootbagMoves symbolic-corpus analysis (Phase A: mechanical).

Reads:
  - freestyle/inputs/observational/SYMBOLIC_GRAMMAR_MASTER.csv (679 rows, FM+PB combined)
  - exploration/passback-intake/passback_trick_sources.csv (283 PB rows, augments SG-MASTER)
  - exploration/footbagmoves-federation/OPERATOR_INVENTORY.csv (55 operators with curator status)

Writes (to exploration/passback-fbm-symbolic-analysis/):
  - OPERATOR_FREQUENCY_INVENTORY.csv : per-operator counts split by source; curator status carried through
  - DECOMPOSITION_MOTIFS.csv         : per-motif counts (modifier stack depth, positional usage, etc.)
  - STOPPING_DEPTH_DISTRIBUTION.csv  : per-row decomposition depth + unresolved-token presence

Design constraints:
  - Read-only. No DB access. No mutation of any source file.
  - Deterministic. Re-runs produce identical output.
  - Frequency framed as evidence (observed_count, evidence_class), never as promotion_signal.
  - Curator status carried alongside frequency on every operator row so the reader cannot
    mistake recurrence for ontology legitimacy.
"""
from __future__ import annotations

import csv
import re
from collections import Counter, defaultdict
from pathlib import Path

# --- paths -----------------------------------------------------------------

REPO = Path(__file__).resolve().parents[2]
SG_MASTER = REPO / "freestyle/inputs/observational/SYMBOLIC_GRAMMAR_MASTER.csv"
PB_TRICKS = REPO / "exploration/passback-intake/passback_trick_sources.csv"
OP_INV    = REPO / "exploration/footbagmoves-federation/OPERATOR_INVENTORY.csv"
OUT_DIR   = REPO / "exploration/passback-fbm-symbolic-analysis"

# --- operator vocabulary ---------------------------------------------------
# Curator-status buckets (forces the reader to read frequency in context).

# Operators that hold a Red-confirmed ADD ruling or are otherwise canonical-locked.
LOCKED_OPS = {
    "ducking", "paradox", "spinning", "stepping", "symposium", "symp.", "symp", "symple",
    "tapping", "pixie", "quantum", "atomic", "nuclear", "blurry",
    "whirling", "miraging",
    "ss", "rooted",
}

# Operators present in the inventory but carrying unresolved ambiguity or pt12-bound math.
PENDING_RED_OPS = {
    "far", "near", "op", "os", "set",
    "uptime", "downtime", "midtime",
    "reverse", "inspinning",
    "sailing", "slaying", "frantic", "phasing", "leaning", "hyper", "pogo",
    "quasi", "riffing", "slicing",
}

# FM-vocab operators that are explicitly Q4-blocked (no IFPA add_bonus row).
Q4_BLOCKED_OPS = {
    "fairy", "gyro", "blazing", "surging", "furious", "barraging", "railing",
    "flailing", "terraging", "splicing", "surfing", "twinspinning", "jolimont",
    "smiling", "spyro", "bubba", "neutron", "dragon",
}

# Quantifiers — observed but distinct semantic class.
QUANTIFIERS = {"double", "triple", "quadruple", "double-dex", "triple-dex", "full"}

# Surface/contact tokens that frequently appear in technical_name strings.
SURFACE_TOKENS = {
    "toe", "clipper", "clip", "inside", "outside", "sole", "knee", "heel",
    "calf", "thigh", "shin", "head", "neck", "shoulder",
    "xbd", "set",
}

# Operational-notation leakage tokens (when technical_name carries operational form).
OPERATIONAL_TOKENS = {
    "leggy", "in", "out", "dex", "del", "bod", "pdx", "xdex", "xbd",
    ">", ">>", "›", "⟫",
}

# Temporal/state parenthesized tokens.
TEMPORAL_RE = re.compile(r"\((uptime|downtime|midtime|rooted|no plant while)\)", re.IGNORECASE)

# --- helpers ---------------------------------------------------------------

def norm(tok: str) -> str:
    t = tok.strip().lower()
    t = t.rstrip(",.;:")
    return t


def classify_operator(tok: str) -> str:
    """Return curator-status bucket for an operator token.

    Returns one of: locked, pending_red, q4_blocked, quantifier, surface,
    operational, temporal, base_or_unknown.
    """
    n = norm(tok)
    if not n:
        return "blank"
    if n in LOCKED_OPS:
        return "locked"
    if n in PENDING_RED_OPS:
        return "pending_red"
    if n in Q4_BLOCKED_OPS:
        return "q4_blocked"
    if n in QUANTIFIERS:
        return "quantifier"
    if n in SURFACE_TOKENS:
        return "surface"
    if n in OPERATIONAL_TOKENS:
        return "operational"
    return "base_or_unknown"


def evidence_class(count: int) -> str:
    """Convert a raw count into a descriptive evidence label.

    NOT a promotion signal. Used purely so the reader can scan the inventory
    without being numbed by raw integers.
    """
    if count >= 20:
        return "high_recurrence"
    if count >= 5:
        return "moderate_recurrence"
    if count >= 2:
        return "low_recurrence"
    return "singleton"


def tokenize_technical_name(tn: str) -> tuple[list[str], list[str]]:
    """Tokenize a technical_name string into (tokens, temporal_flags).

    Strips parenthesized temporal flags first (recorded separately), then splits the
    remainder on whitespace and punctuation. Preserves multi-hyphen tokens like
    'double-dex'.
    """
    if not tn or not tn.strip():
        return [], []

    s = tn.strip()

    # Extract temporal flags.
    temporals = [m.group(1).lower() for m in TEMPORAL_RE.finditer(s)]
    s = TEMPORAL_RE.sub(" ", s)

    # Drop other parenthesized content (e.g. "(archaic)", parser annotations).
    s = re.sub(r"\([^)]*\)", " ", s)

    # Replace operational arrow chars with spaces so they don't glue tokens.
    s = re.sub(r"[>›⟫]", " ", s)

    # Split on whitespace + commas + slashes (multi-name slashes).
    tokens = re.split(r"[\s,/]+", s)
    # Filter blanks; preserve hyphenated tokens (double-dex etc.).
    tokens = [t for t in tokens if t.strip()]

    return tokens, temporals


# --- corpus loading --------------------------------------------------------

def load_sg_master() -> list[dict]:
    rows = []
    with SG_MASTER.open() as f:
        for row in csv.DictReader(f):
            rows.append({
                "source": row["source"],           # "footbagmoves" | "passback"
                "source_file": row["source_file"],
                "move_name": row["move_name"].strip(),
                "technical_name": row["technical_name"].strip(),
                "parsed_symbol_sequence": row.get("parsed_symbol_sequence", "").strip(),
                "unresolved_tokens": row.get("unresolved_tokens", "").strip(),
                "parse_confidence": row.get("parse_confidence", "").strip(),
                "source_adds": row.get("source_adds", "").strip(),
                "derived_adds": row.get("derived_adds", "").strip(),
                "derived_symbolic_family": row.get("derived_symbolic_family", "").strip(),
                "derived_topology_family": row.get("derived_topology_family", "").strip(),
            })
    return rows


def load_pb_augment(sg_move_names: set[str]) -> list[dict]:
    """Load PassBack trick_sources rows that are NOT already in SG-MASTER.

    SG-MASTER already includes 106 PassBack rows. We augment with the remainder
    of passback_trick_sources.csv (283 rows total) so the corpus is deduplicated.
    """
    rows = []
    with PB_TRICKS.open() as f:
        for row in csv.DictReader(f):
            move = row["passback_primary_name"].strip()
            if not move:
                continue
            if move.lower() in {m.lower() for m in sg_move_names}:
                continue
            tn = row["passback_technical_name"].strip()
            rows.append({
                "source": "passback_augment",
                "source_file": row["source_file"],
                "move_name": move,
                "technical_name": tn,
                "parsed_symbol_sequence": "",
                "unresolved_tokens": "",
                "parse_confidence": "",
                "source_adds": row["passback_dex_count"].strip(),
                "derived_adds": "",
                "derived_symbolic_family": "",
                "derived_topology_family": "",
            })
    return rows


# --- analyses --------------------------------------------------------------

def operator_frequency_inventory(corpus: list[dict]) -> list[dict]:
    """Per-operator frequency split by source. Includes curator status."""
    # source-keyed token counters
    counts_by_source: dict[str, Counter] = defaultdict(Counter)
    classify_by_token: dict[str, str] = {}

    for row in corpus:
        tn = row["technical_name"]
        tokens, temporals = tokenize_technical_name(tn)
        for t in tokens:
            n = norm(t)
            if not n:
                continue
            counts_by_source[row["source"]][n] += 1
            if n not in classify_by_token:
                classify_by_token[n] = classify_operator(n)
        for t in temporals:
            counts_by_source[row["source"]][t] += 1
            classify_by_token[t] = "pending_red"  # temporals are pending_red class per OPERATOR_INVENTORY

    # build unified rows
    all_tokens = set()
    for c in counts_by_source.values():
        all_tokens.update(c.keys())

    out_rows = []
    for tok in sorted(all_tokens):
        fm_count = counts_by_source.get("footbagmoves", Counter()).get(tok, 0)
        pb_count = (counts_by_source.get("passback", Counter()).get(tok, 0)
                    + counts_by_source.get("passback_augment", Counter()).get(tok, 0))
        total = fm_count + pb_count
        bucket = classify_by_token.get(tok, "base_or_unknown")
        out_rows.append({
            "operator_token": tok,
            "curator_status": bucket,
            "fm_observed_count": fm_count,
            "pb_observed_count": pb_count,
            "total_observed_count": total,
            "evidence_class": evidence_class(total),
            "note": _operator_note(tok, bucket),
        })

    # Sort: locked first, then pending_red, then q4_blocked, then by count desc within bucket.
    bucket_order = {
        "locked": 0, "pending_red": 1, "q4_blocked": 2,
        "quantifier": 3, "surface": 4, "operational": 5, "base_or_unknown": 6, "blank": 7,
    }
    out_rows.sort(key=lambda r: (bucket_order.get(r["curator_status"], 99),
                                  -r["total_observed_count"], r["operator_token"]))
    return out_rows


def _operator_note(tok: str, bucket: str) -> str:
    """Short, deterministic note tying the token back to known curator state."""
    notes = {
        "ss": "Red 2026-05-11 ruling: +0 ADD",
        "nuclear": "pt10 ruling: Paradox Atomic set; FM-IFPA -1 delta on Nuclear-ss rows",
        "atomic": "pt10 ruling: +1 non-rotational / +2 rotational",
        "blurry": "pt11 ruling: +1 flat; pt12 open on Blurry Whirl / Blurry Torque",
        "whirling": "pt11 ruling: Whirling = Whirl + Osis composition",
        "miraging": "pt11 ruling: Miraging = Mirage + base composition",
        "rooted": "pt8 ruling: 0 ADD",
        "sailing": "FM Sets def: Pixie Atomic (recursive)",
        "slaying": "FM Sets def: Symp Sailing → Symp Pixie Atomic (3-deep recursion)",
        "slicing": "FM polysemy: two distinct Sets-tab definitions; FM curation issue",
        "fairy": "Q4 batch; no IFPA add_bonus row",
        "furious": "pt6 ruling on Fury=5; FM uses 'Furious Mirage' single-modifier reading",
        "barraging": "FM-vocab Q4; recurrent but no IFPA add_bonus row",
    }
    return notes.get(tok, "")


def decomposition_motifs(corpus: list[dict]) -> list[dict]:
    """Catalog structural motifs by counting per-row token-class signatures."""
    motif_counts: Counter = Counter()
    motif_examples: dict[tuple, list[str]] = defaultdict(list)

    for row in corpus:
        tn = row["technical_name"]
        if not tn:
            continue
        tokens, temporals = tokenize_technical_name(tn)
        if not tokens:
            continue
        classes = [classify_operator(t) for t in tokens]
        # Compress consecutive same-class tokens into a class-sequence signature.
        sig = []
        for c in classes:
            if not sig or sig[-1] != c:
                sig.append(c)
        sig_t = tuple(sig)
        # Adorn with temporal prefix if present.
        if temporals:
            sig_t = ("temporal",) + sig_t
        motif_counts[sig_t] += 1
        if len(motif_examples[sig_t]) < 3:
            motif_examples[sig_t].append(f"{row['move_name']}: {tn}")

    out_rows = []
    for sig, n in motif_counts.most_common():
        out_rows.append({
            "motif_signature": " → ".join(sig),
            "depth": len(sig),
            "observed_count": n,
            "evidence_class": evidence_class(n),
            "examples": " | ".join(motif_examples[sig]),
        })
    return out_rows


def stopping_depth_distribution(corpus: list[dict]) -> list[dict]:
    """Per-row decomposition depth + which class the decomposition terminates in.

    'Depth' = number of distinct modifier/positional classes in technical_name.
    'Terminal class' = class of the final token (where decomposition stops).
    """
    out_rows = []
    for row in corpus:
        tn = row["technical_name"]
        if not tn:
            continue
        tokens, temporals = tokenize_technical_name(tn)
        if not tokens:
            continue
        classes = [classify_operator(t) for t in tokens]
        modifier_classes = {"locked", "pending_red", "q4_blocked"}
        modifier_count = sum(1 for c in classes if c in modifier_classes)
        positional_count = sum(1 for t in tokens if norm(t) in {"ss", "far", "near", "op", "os", "set"})
        quantifier_count = sum(1 for c in classes if c == "quantifier")
        terminal_token = tokens[-1]
        terminal_class = classify_operator(terminal_token)
        has_unresolved = any(c == "q4_blocked" for c in classes)
        has_operational_leak = any(c == "operational" for c in classes)

        out_rows.append({
            "source": row["source"],
            "move_name": row["move_name"],
            "technical_name": tn,
            "token_count": len(tokens),
            "modifier_count": modifier_count,
            "positional_count": positional_count,
            "quantifier_count": quantifier_count,
            "terminal_token": terminal_token,
            "terminal_class": terminal_class,
            "has_temporal_flag": "yes" if temporals else "no",
            "has_q4_blocked_token": "yes" if has_unresolved else "no",
            "has_operational_leak": "yes" if has_operational_leak else "no",
            "source_adds": row.get("source_adds", ""),
            "derived_adds": row.get("derived_adds", ""),
        })

    # Sort by source then move_name for stable diff-ability.
    out_rows.sort(key=lambda r: (r["source"], r["move_name"]))
    return out_rows


# --- writers ---------------------------------------------------------------

def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        path.write_text("")
        return
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def write_summary(corpus: list[dict], op_rows: list[dict],
                  motif_rows: list[dict], depth_rows: list[dict]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    summary = OUT_DIR / "PHASE_A_SUMMARY.md"
    fm_n = sum(1 for r in corpus if r["source"] == "footbagmoves")
    pb_n = sum(1 for r in corpus if r["source"] == "passback")
    pb_aug = sum(1 for r in corpus if r["source"] == "passback_augment")
    with_tn = sum(1 for r in corpus if r["technical_name"])
    by_bucket = Counter(r["curator_status"] for r in op_rows)

    body = [
        "# Phase A mechanical analysis -- summary",
        "",
        "Frequency in the tables below is OBSERVED evidence, not a promotion signal. "
        "See `feedback_frequency_not_authority.md` and the multi-axis NF-2A scoring "
        "(Phase B2) before drawing operator-promotion conclusions.",
        "",
        "## Corpus",
        "",
        f"- footbagmoves rows: {fm_n}",
        f"- passback rows (in SG-MASTER): {pb_n}",
        f"- passback augment rows (additional from trick_sources.csv): {pb_aug}",
        f"- total rows: {len(corpus)}",
        f"- rows with technical_name string: {with_tn}",
        "",
        "## Operator inventory shape",
        "",
        f"- distinct operator tokens: {len(op_rows)}",
        f"- locked (curator-confirmed): {by_bucket.get('locked', 0)}",
        f"- pending_red (in inventory with ambiguity): {by_bucket.get('pending_red', 0)}",
        f"- q4_blocked (FM-vocab, no IFPA add_bonus): {by_bucket.get('q4_blocked', 0)}",
        f"- quantifiers: {by_bucket.get('quantifier', 0)}",
        f"- surface tokens: {by_bucket.get('surface', 0)}",
        f"- operational-notation leakage: {by_bucket.get('operational', 0)}",
        f"- base or unknown (terminal): {by_bucket.get('base_or_unknown', 0)}",
        "",
        "## Motifs",
        "",
        f"- distinct motif signatures: {len(motif_rows)}",
        f"- top motif: {motif_rows[0]['motif_signature']} (n={motif_rows[0]['observed_count']})" if motif_rows else "- no motifs",
        "",
        "## Stopping depth",
        "",
        f"- rows with depth>=4 tokens: {sum(1 for r in depth_rows if r['token_count']>=4)}",
        f"- rows hitting a q4_blocked token: {sum(1 for r in depth_rows if r['has_q4_blocked_token']=='yes')}",
        f"- rows with operational-notation leakage: {sum(1 for r in depth_rows if r['has_operational_leak']=='yes')}",
        "",
        "Outputs in this directory:",
        "",
        "- OPERATOR_FREQUENCY_INVENTORY.csv",
        "- DECOMPOSITION_MOTIFS.csv",
        "- STOPPING_DEPTH_DISTRIBUTION.csv",
        "",
        "Synthesis docs (Phase B) reference these CSVs by row, not by re-listing.",
    ]
    summary.write_text("\n".join(body) + "\n")


# --- main ------------------------------------------------------------------

def main() -> None:
    sg = load_sg_master()
    sg_names = {r["move_name"] for r in sg if r["move_name"]}
    pb_aug = load_pb_augment(sg_names)
    corpus = sg + pb_aug

    op_rows = operator_frequency_inventory(corpus)
    motif_rows = decomposition_motifs(corpus)
    depth_rows = stopping_depth_distribution(corpus)

    write_csv(OUT_DIR / "OPERATOR_FREQUENCY_INVENTORY.csv", op_rows)
    write_csv(OUT_DIR / "DECOMPOSITION_MOTIFS.csv", motif_rows)
    write_csv(OUT_DIR / "STOPPING_DEPTH_DISTRIBUTION.csv", depth_rows)
    write_summary(corpus, op_rows, motif_rows, depth_rows)

    print(f"corpus rows: {len(corpus)} (fm={sum(1 for r in corpus if r['source']=='footbagmoves')}, "
          f"pb={sum(1 for r in corpus if r['source']=='passback')}, "
          f"pb_aug={sum(1 for r in corpus if r['source']=='passback_augment')})")
    print(f"operators: {len(op_rows)}")
    print(f"motifs: {len(motif_rows)}")
    print(f"depth rows: {len(depth_rows)}")
    print(f"wrote outputs to: {OUT_DIR}")


if __name__ == "__main__":
    main()

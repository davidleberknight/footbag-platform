"""
Build an XLSX reconciliation workbook between Footbag.org and the IFPA
freestyle dictionary, with evidence-density scoring and source-lineage
tracking.

Read-only. Composes from existing artifacts:
  - legacy_data/reports/freestyle_dict_coverage_diff.csv  (corpus rows)
  - legacy_data/reports/structural_alias_adjudication.csv (policy verdict)
  - database/footbag.db                                   (canonical + media)

Output:
  - legacy_data/reports/fborg_reconciliation.xlsx
    - sheet "Reconciliation": one row per corpus entry + evidence/lineage
    - sheet "Summary":         routing counts + color legend
    - sheet "Evidence Summary": evidence-shape distributions

Architecture (source-agnostic):

  The SOURCES registry below lists every external/internal evidence
  source the workbook tracks. Adding a future source (e.g. when the
  ~569-trick Footbagmoves.com corpus arrives) is an entry append +
  extending the presence-detection in `evaluate_evidence` — no
  schema/column-shape redesign needed. Each source contributes a
  presence flag column (`evidence_<id>`) and feeds into lineage and
  scoring.

Routing (evidence-aware, 2026-05-09 revision):

  A row is routed based on (confidence band, conflict signal):
    HIGH/MEDIUM + no conflict   → auto_resolved | james_reviewable
    HIGH/MEDIUM + conflict      → needs_red
    LOW         + no conflict   → provisional_candidate
    LOW         + conflict      → quarantine

  `provisional_candidate` and `quarantine` are new states that prevent
  bare-evidence corpus rows from inflating the Red queue. James-
  pre-decided overrides bypass routing entirely.

  Footbag.org rows are valid external evidence by default. Missing-
  from-IFPA never alone implies low validity — it implies coverage
  gap, which the evidence band makes explicit.

Does not modify any ontology data, CSVs, or DB.
"""
import argparse
import csv
import re
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_DIFF        = REPO / "legacy_data" / "reports" / "freestyle_dict_coverage_diff.csv"
DEFAULT_ADJUDICATION = REPO / "legacy_data" / "reports" / "structural_alias_adjudication.csv"
DEFAULT_DB          = REPO / "database" / "footbag.db"
DEFAULT_OUT         = REPO / "legacy_data" / "reports" / "fborg_reconciliation.xlsx"

# James-pre-decided overrides. Match on lowercased external_name.
# Each entry: lowercased_name → (decision, comment).
JAMES_PRE_DECIDED: dict[str, tuple[str, str]] = {
    "triple around the world":     ("valid productive variant (not standalone canonical)",
                                    "James direct adjudication: treated as a valid productive variant of around-the-world, not a standalone canonical named trick under current dictionary policy (§10)."),
    "double around the world heel":("valid productive variant (not standalone canonical)",
                                    "James direct adjudication: treated as a valid productive variant of around-the-world (with heel-stall ending), not a standalone canonical named trick under current dictionary policy (§10)."),
    "blender":                     ("canonical (existing)",
                                    "James direct adjudication: blender is an active canonical row in IFPA dictionary."),
    "butterfly swirl":             ("canonical-candidate (provisional)",
                                    "James direct adjudication: community-named compound; promote to canonical pending notation/ADD review."),
    "barfly":                      ("canonical (existing)",
                                    "James direct adjudication: barfly is an active canonical row in IFPA dictionary."),
    "down double down":            ("blocked by down-family policy",
                                    "James direct adjudication: defer until down-family policy ruling — see red-followup-down-family-2026-05.md."),
}


# ─── Evidence model ─────────────────────────────────────────────────────────
#
# `SOURCES` is the source-agnostic registry. Each entry: (id, label,
# strength). `strength` is the lineage priority used to pick
# `strongest_source` — higher wins. It is INDEPENDENT of scoring weight.
# To onboard a future source (Footbagmoves.com, Erik Chan's Foundations,
# Polini's Pointers, etc.), append one entry here and extend
# `evaluate_evidence` to populate its presence flag.
SOURCES: list[tuple[str, str, int]] = [
    ("fborg",     "Footbag.org",                    10),
    ("anztrikz",  "Anz' Trikz",                     20),
    ("passback",  "Passback records",               30),
    ("tt",        "Tricks of the Trade",            40),
    ("ifpa",      "IFPA dictionary (canonical)",    50),
    ("red",       "Red endorsement",                60),
    # Future sources go here, e.g.:
    # ("fbmoves",  "Footbagmoves.com",               25),
]
SOURCE_IDS = [s[0] for s in SOURCES]
SOURCE_LABEL = {s[0]: s[1] for s in SOURCES}
SOURCE_STRENGTH = {s[0]: s[2] for s in SOURCES}

# Scoring weights — independent of source registry. The keys here are
# evidence kinds (some align 1:1 with source ids; others — like
# `structural_parse`, `jobs_notation`, `video`, `multiple_sources` —
# are derived signals).
SCORE_WEIGHTS: dict[str, int] = {
    "ifpa":              5,   # existing IFPA canonical match
    "structural_parse":  3,   # structural decomposition resolves
    "jobs_notation":     2,   # row carries Jobs notation
    "tt":                3,   # TT video evidence
    "passback":          2,   # passback record evidence
    "red":               5,   # Red-endorsed (review_status='expert_reviewed')
    "video":             1,   # any video media linked
    "multiple_sources":  2,   # presence count ≥ 2
}

# Confidence band thresholds (against `evidence_total_score`). Tuned so
# that matched-canonical + Jobs notation crosses into HIGH and bare
# name-only rows fall into LOW. Mid-band catches documented but
# unverified rows (notation present, no corroboration).
CONFIDENCE_HIGH_MIN   = 7
CONFIDENCE_MEDIUM_MIN = 2

CONFIDENCE_LABELS = ("LOW", "MEDIUM", "HIGH")


def parse_int(value: str | None) -> int | None:
    if not value: return None
    try: return int(value)
    except (ValueError, TypeError): return None


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return s or "unknown"


def load_canonical(db: sqlite3.Connection) -> dict[str, dict]:
    """slug → {name, adds, notation, description, is_active, review_status}."""
    rows = db.execute(
        """SELECT slug, canonical_name, adds, notation, description, is_active, review_status
           FROM freestyle_tricks"""
    ).fetchall()
    out = {}
    for slug, name, adds, notation, descr, is_active, status in rows:
        out[slug] = {
            "name":          name,
            "adds":          parse_int(adds) if adds else None,
            "notation":      notation or "",
            "description":   descr or "",
            "is_active":     bool(is_active),
            "review_status": status or "",
        }
    return out


# Map from media-system source_id (as stored in freestyle_media_assets)
# to evidence-source registry id. Adding a new media source means adding
# its source_id here. Sources not in this map don't contribute to
# per-source presence flags but DO still light `evidence_video`.
MEDIA_SOURCE_MAP: dict[str, str] = {
    "tt_youtube":            "tt",
    "anz_trikz":             "anztrikz",
    "passback_records":      "passback",
    # Future expansion goes here, e.g.:
    # "fbmoves":               "fbmoves",
}


def load_trick_source_index(db: sqlite3.Connection) -> dict[str, set[str]]:
    """slug → set of evidence-source ids that have a media link to it.
    Source ids are mapped through MEDIA_SOURCE_MAP; unmapped media
    source_ids contribute only via `evidence_video`."""
    out: dict[str, set[str]] = {}
    rows = db.execute("""
        SELECT DISTINCT l.entity_id, a.source_id
        FROM freestyle_media_links l
        JOIN freestyle_media_assets a ON a.id = l.media_id
        WHERE l.entity_type = 'trick'
    """).fetchall()
    for slug, source_id in rows:
        out.setdefault(slug, set())
        ev_id = MEDIA_SOURCE_MAP.get(source_id)
        if ev_id:
            out[slug].add(ev_id)
    return out


def load_trick_video_set(db: sqlite3.Connection) -> set[str]:
    """slugs that have at least one video media link (any source).
    Independent of MEDIA_SOURCE_MAP — drives evidence_video."""
    rows = db.execute("""
        SELECT DISTINCT l.entity_id
        FROM freestyle_media_links l
        JOIN freestyle_media_assets a ON a.id = l.media_id
        WHERE l.entity_type = 'trick' AND a.media_type = 'video'
    """).fetchall()
    return {r[0] for r in rows}


def evaluate_evidence(
    diff_row: dict,
    adj_row: dict | None,
    canonical_row: dict | None,
    trick_sources: dict[str, set[str]],
    video_set: set[str],
) -> dict:
    """Compute the full evidence + lineage record for one corpus row.

    Returns a dict with:
      evidence_<id> ('yes'/'no') for each id in SOURCE_IDS
      evidence_jobs_notation, evidence_structural_parse,
      evidence_existing_ifpa, evidence_video, evidence_multiple_sources
      evidence_total_score (int)
      evidence_confidence ('LOW'/'MEDIUM'/'HIGH')
      first_seen_source (corpus driver — fborg today; future: fbmoves)
      strongest_source  (highest-strength source where evidence present)
      supporting_sources (comma-joined list, strength-desc order)
    """
    canonical_match = (diff_row.get("canonical_match") == "yes")
    canonical_slug  = diff_row.get("canonical_slug") or ""
    external_slug   = diff_row.get("external_slug") or ""
    target_slugs    = {s for s in (canonical_slug, external_slug) if s}

    # Collect all evidence-source ids present on any candidate slug.
    sources_present: set[str] = set()
    for slug in target_slugs:
        sources_present |= trick_sources.get(slug, set())

    # fborg presence — every corpus row in this driver is a Footbag.org row.
    sources_present.add("fborg")
    # ifpa presence — matched against an active canonical row.
    if canonical_match:
        sources_present.add("ifpa")
    # Red endorsement — via canonical row's review_status.
    if canonical_match and canonical_row and canonical_row.get("review_status") == "expert_reviewed":
        sources_present.add("red")
    # Passback evidence — also light if the diff CSV flags `has_records=yes`,
    # which catches record evidence even when no media row exists.
    if diff_row.get("has_records") == "yes":
        sources_present.add("passback")

    # Derived signals.
    has_jobs_notation     = diff_row.get("has_external_notation") == "yes"
    has_video             = (
        diff_row.get("has_media") == "yes" or
        diff_row.get("media_present") == "yes" or
        any(slug in video_set for slug in target_slugs)
    )
    auto_classification   = (adj_row or {}).get("auto_classification", "") or ""
    structural_parse_ok   = auto_classification in (
        "STRUCTURAL-ALIAS-FULL",
        "STRUCTURAL-ALIAS-VIA-ALTNAME",
    )

    # Multiple-sources flag (≥ 2 evidence-source ids present).
    multiple_sources = len(sources_present) >= 2

    # Score: presence flags weighted per SCORE_WEIGHTS.
    score = 0
    if "ifpa"     in sources_present: score += SCORE_WEIGHTS["ifpa"]
    if structural_parse_ok:           score += SCORE_WEIGHTS["structural_parse"]
    if has_jobs_notation:             score += SCORE_WEIGHTS["jobs_notation"]
    if "tt"       in sources_present: score += SCORE_WEIGHTS["tt"]
    if "passback" in sources_present: score += SCORE_WEIGHTS["passback"]
    if "red"      in sources_present: score += SCORE_WEIGHTS["red"]
    if has_video:                     score += SCORE_WEIGHTS["video"]
    if multiple_sources:              score += SCORE_WEIGHTS["multiple_sources"]

    # Confidence band.
    if score >= CONFIDENCE_HIGH_MIN:
        confidence = "HIGH"
    elif score >= CONFIDENCE_MEDIUM_MIN:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    # Lineage.
    first_seen_source = "fborg"   # corpus driver; will branch when fbmoves ingestion lands
    present_sorted = sorted(sources_present, key=lambda s: -SOURCE_STRENGTH.get(s, 0))
    strongest_source = present_sorted[0] if present_sorted else ""
    supporting_sources = ", ".join(present_sorted)

    record = {
        "evidence_total_score":        score,
        "evidence_confidence":         confidence,
        "evidence_jobs_notation":      "yes" if has_jobs_notation else "no",
        "evidence_structural_parse":   "yes" if structural_parse_ok else "no",
        "evidence_existing_ifpa":      "yes" if "ifpa" in sources_present else "no",
        "evidence_video":              "yes" if has_video else "no",
        "evidence_multiple_sources":   "yes" if multiple_sources else "no",
        "first_seen_source":           first_seen_source,
        "strongest_source":            strongest_source,
        "supporting_sources":          supporting_sources,
    }
    for sid in SOURCE_IDS:
        record[f"evidence_{sid}"] = "yes" if sid in sources_present else "no"
    return record


def load_adjudication(path: Path) -> dict[str, dict]:
    """slug → adjudication row dict."""
    out = {}
    with path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            out[r["slug"]] = r
    return out


def derive_recon_status(diff_row: dict, adj_row: dict | None) -> tuple[str, str]:
    """Return (reconciliation_status, comment). Maps adjudicator + diff
    state into a single status field plus a human comment.

    Policy revision (2026-05-09): Footbag.org rows are valid external
    evidence by default. Unmatched rows get `fborg_supported_missing`
    rather than the older `external_only` / `fborg_only` framing,
    UNLESS a specific structural verdict (productive-multiplicity,
    structural-alias, policy-block, ADD-conflict, etc.) applies.
    """
    match_type = diff_row.get("match_type", "")
    if match_type == "exact canonical":
        return ("matched_canonical",
                "Footbag.org name matches an active IFPA canonical row.")
    if match_type == "likely structural alias":
        slug = diff_row.get("canonical_slug") or "?"
        return ("structural_alias_inline",
                f"Footbag.org name decomposes structurally to canonical `{slug}`; render as Common alias on the canonical row in Deep Dive.")
    if match_type != "no match":
        return ("unknown_match_type", f"diff match_type={match_type!r}")

    # match_type = "no match" → use adjudicator verdict, falling through
    # to fborg_supported_missing when no specific structural verdict applies.
    cls = (adj_row or {}).get("auto_classification", "")
    decomposition = (adj_row or {}).get("decomposition", "") or ""
    reason = (adj_row or {}).get("reason", "") or ""

    if cls == "PRODUCTIVE-MULTIPLICITY-NON-CANONICAL":
        return ("productive_multiplicity_non_canonical",
                f"Productive multiplicity ({decomposition}); per CANONICALIZATION_POLICY §10 default, no canonical row earned. Treated as a valid productive variant.")
    if cls == "STRUCTURAL-ALIAS-FULL":
        return ("structural_alias_full",
                f"Decomposition: {decomposition}. Render as alias on the decomposition's canonical.")
    if cls == "STRUCTURAL-ALIAS-VIA-ALTNAME":
        return ("structural_alias_via_altname",
                f"External name is community shorthand; alt-name documents structural recipe ({decomposition}).")
    if cls == "STRUCTURAL-ALIAS-ADD-CONFLICT":
        return ("add_conflict",
                f"Decomposition resolves but ADD math disagrees: {decomposition}. {reason}")
    if cls == "POLICY-BLOCKED-DOWN":
        return ("policy_blocked_down",
                f"Down-family policy not yet settled. Deferred. {reason}")
    if cls == "PRODUCTIVE-MULTIPLICITY-BASE-UNRESOLVABLE":
        return ("productive_multiplicity_base_unresolved",
                f"Count-prefix pattern but base unresolved: {decomposition}.")
    if cls == "CANONICAL-CANDIDATE-NAMED-IDENTITY":
        return ("canonical_candidate",
                f"Strong evidence ({(adj_row or {}).get('evidence_score','?')}); community-named identity; pending dictionary-policy decision on canonical elevation.")

    # Default for unmatched rows (including EXTERNAL-ONLY-DESCRIPTIVE,
    # UNRESOLVED, and rows with no adjudication entry): valid external
    # evidence missing from IFPA. James-reviewable.
    return ("fborg_supported_missing",
            "Documented on Footbag.org but not yet present in the IFPA dictionary. Treated as valid external evidence; James-reviewable for whether to add a canonical / alias / leave-as-external entry.")


def _normalize_name_key(name: str) -> str:
    """Lowercase + drop hyphens / whitespace runs so 'Down Double-Down'
    and 'down double down' collapse to the same key."""
    return re.sub(r"[\s\-]+", " ", (name or "").lower()).strip()


# Reconciliation statuses that constitute a confirmed conflict signal —
# these route to Red. Everything else under match_type=no match is
# treated as valid external evidence and routes to james_reviewable.
CONFIRMED_CONFLICT_STATUSES = {
    "add_conflict",                              # ADD math disagrees
    "policy_blocked_down",                       # dictionary policy uncertainty
    "productive_multiplicity_base_unresolved",   # base-canonical question
    "canonical_candidate",                       # canonical-elevation question
}


AUTO_RESOLVED_STATUSES = {
    "matched_canonical",
    "structural_alias_inline",
    "productive_multiplicity_non_canonical",
    "structural_alias_full",
    "structural_alias_via_altname",
}


def adjudication_for(
    name: str,
    recon_status: str,
    diff_row: dict,
    adj_row: dict | None,
    evidence: dict,
) -> tuple[str, str, str]:
    """Return (james_decision, james_notes, routing).

    Routing values (2026-05-09 evidence-aware revision):
      - 'pre_decided'           — James-pre-decided override applies.
      - 'auto_resolved'         — matched / structural-alias / productive-
                                  multiplicity per already-decided policy.
      - 'james_reviewable'      — HIGH/MEDIUM evidence, no conflict, not
                                  auto-resolvable. James can directly
                                  adjudicate without Red.
      - 'needs_red'             — HIGH/MEDIUM evidence + confirmed
                                  conflict signal.
      - 'provisional_candidate' — LOW evidence, no conflict. Hold for
                                  more evidence before promoting or
                                  asking Red.
      - 'quarantine'            — LOW evidence + conflict. Defer until
                                  evidence improves; not Red-worthy yet.

    Policy preserved:
      - Footbag.org rows are valid external evidence by default.
      - Red review reserved ONLY for genuine ambiguity/conflict at
        HIGH/MEDIUM evidence.
      - Missing-from-IFPA never alone implies low validity.
    """
    # 1. Pre-decided overrides.
    key = _normalize_name_key(name)
    pre_decided_norm = {_normalize_name_key(k): v for k, v in JAMES_PRE_DECIDED.items()}
    if key in pre_decided_norm:
        decision, note = pre_decided_norm[key]
        return (decision, note, "pre_decided")

    has_adds_conflict = (diff_row.get("adds_conflict") or "").lower().startswith("yes")
    has_status_conflict = recon_status in CONFIRMED_CONFLICT_STATUSES
    has_conflict = has_adds_conflict or has_status_conflict

    confidence = evidence["evidence_confidence"]

    # 2. Conflict path — split by evidence band.
    if has_conflict:
        if confidence == "LOW":
            return ("", "", "quarantine")
        # HIGH/MEDIUM evidence + confirmed conflict → Red.
        return ("", "", "needs_red")

    # 3. No-conflict, auto-resolvable categories (matched / structural / mult).
    if recon_status in AUTO_RESOLVED_STATUSES:
        return ("", "", "auto_resolved")

    # 4. No-conflict, no auto-resolution: split by evidence band.
    if confidence == "LOW":
        return ("", "", "provisional_candidate")
    return ("", "", "james_reviewable")


def build_workbook(
    diff_path: Path, adj_path: Path, db_path: Path, out_path: Path,
) -> None:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    db = sqlite3.connect(str(db_path))
    canonical     = load_canonical(db)
    trick_sources = load_trick_source_index(db)
    video_set     = load_trick_video_set(db)
    db.close()

    adjudication = load_adjudication(adj_path)

    with diff_path.open(newline="", encoding="utf-8") as f:
        diff_rows = list(csv.DictReader(f))

    # Column layout. Source-presence columns are generated from SOURCES
    # so adding a future source extends the registry, not the list here.
    source_cols = [(f"evidence_{sid}", 8) for sid in SOURCE_IDS]
    columns = [
        # Footbag.org side
        ("showmove_id",          12),
        ("fborg_name",           28),
        ("fborg_url",            32),
        ("fborg_ADD",             6),
        ("fborg_notation",       40),
        ("fborg_description",    48),
        ("fborg_alt_name",       22),
        ("has_video",             8),
        # IFPA side
        ("ifpa_slug",            22),
        ("ifpa_name",            22),
        ("ifpa_ADD",              6),
        ("ifpa_notation",        40),
        ("ifpa_description",     40),
        ("ifpa_status",          12),
        # Reconciliation
        ("match_type",           18),
        ("reconciliation_status",30),
        # Evidence: per-source presence + derived signals
        *source_cols,
        ("evidence_jobs_notation",     8),
        ("evidence_structural_parse",  8),
        ("evidence_existing_ifpa",     8),
        ("evidence_video",             8),
        ("evidence_multiple_sources",  8),
        ("evidence_total_score",       6),
        ("evidence_confidence",       10),
        # Lineage
        ("first_seen_source",         12),
        ("strongest_source",          12),
        ("supporting_sources",        38),
        # Comment + adjudication
        ("comment",                   60),
        ("routing",                   22),
        ("james_decision",            38),
        ("james_notes",               48),
        ("red_status",                24),
    ]

    wb = Workbook()
    ws = wb.active
    ws.title = "Reconciliation"

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="2A4D70")
    align_top   = Alignment(vertical="top", wrap_text=True)

    james_review_fill  = PatternFill("solid", fgColor="FFF2CC")  # yellow
    needs_red_fill     = PatternFill("solid", fgColor="F4CCCC")  # red
    pre_decided_fill   = PatternFill("solid", fgColor="D9EAD3")  # green
    matched_fill       = PatternFill("solid", fgColor="E8F0F7")  # light blue
    auto_resolved_fill = PatternFill("solid", fgColor="EFEFEF")  # neutral gray
    provisional_fill   = PatternFill("solid", fgColor="FCE5CD")  # peach (LOW + no conflict)
    quarantine_fill    = PatternFill("solid", fgColor="D5A6BD")  # mauve (LOW + conflict)

    for idx, (name, width) in enumerate(columns, start=1):
        c = ws.cell(row=1, column=idx, value=name)
        c.font = header_font
        c.fill = header_fill
        c.alignment = Alignment(horizontal="left", vertical="center")
        ws.column_dimensions[get_column_letter(idx)].width = width
    ws.freeze_panes = "A2"
    ws.row_dimensions[1].height = 22

    summary = {
        "auto_resolved":         0,
        "james_reviewable":      0,
        "needs_red":             0,
        "pre_decided":           0,
        "provisional_candidate": 0,
        "quarantine":            0,
    }
    # Cross-tab counters for the Evidence Summary sheet.
    confidence_counts:  dict[str, int] = {c: 0 for c in CONFIDENCE_LABELS}
    strongest_counts:   dict[str, int] = {sid: 0 for sid in SOURCE_IDS}
    strongest_counts[""] = 0   # row with no sources present (defensive)
    routing_x_confidence: dict[tuple[str, str], int] = {}
    overlap_counts:     dict[str, int] = {}
    conflict_counts = {"none": 0, "adds_conflict": 0, "policy_blocked_down": 0,
                       "canonical_candidate": 0, "productive_mult_base_unresolved": 0,
                       "structural_alias_add_conflict": 0, "other_conflict": 0}

    for diff in diff_rows:
        external_name = diff.get("external_name", "")
        external_slug = diff.get("external_slug") or slugify(external_name)
        canonical_slug = diff.get("canonical_slug") or ""
        canonical_match = (diff.get("canonical_match") == "yes")

        ifpa_row = canonical.get(canonical_slug) if canonical_match else None
        ifpa_status = (
            ("active" if ifpa_row["is_active"] else "pending")
            if ifpa_row else "not_in_dict"
        )

        adj_row = adjudication.get(external_slug)
        recon_status, comment = derive_recon_status(diff, adj_row)

        evidence = evaluate_evidence(diff, adj_row, ifpa_row, trick_sources, video_set)

        james_decision, james_notes, routing = adjudication_for(
            external_name, recon_status, diff, adj_row, evidence
        )
        red_status = (adj_row or {}).get("auto_classification", "")

        # Provisional slug for unmatched rows (fborg_supported_missing etc.).
        ifpa_slug_out = canonical_slug if canonical_match else f"(provisional) {external_slug}"

        row_values = [
            diff.get("external_showmove_id", ""),
            external_name,
            diff.get("external_url", ""),
            parse_int(diff.get("external_ADD", "")) or "",
            diff.get("external_notation", ""),
            diff.get("external_description", ""),
            diff.get("external_alt_name", ""),
            "yes" if diff.get("media_present") == "yes" or diff.get("has_media") == "yes" else "no",
            ifpa_slug_out,
            (ifpa_row or {}).get("name", ""),
            (ifpa_row or {}).get("adds") if ifpa_row else "",
            (ifpa_row or {}).get("notation", ""),
            (ifpa_row or {}).get("description", ""),
            ifpa_status,
            diff.get("match_type", ""),
            recon_status,
            # Evidence presence (per-source in registry order)
            *(evidence[f"evidence_{sid}"] for sid in SOURCE_IDS),
            # Evidence: derived signals
            evidence["evidence_jobs_notation"],
            evidence["evidence_structural_parse"],
            evidence["evidence_existing_ifpa"],
            evidence["evidence_video"],
            evidence["evidence_multiple_sources"],
            evidence["evidence_total_score"],
            evidence["evidence_confidence"],
            # Lineage
            evidence["first_seen_source"],
            evidence["strongest_source"],
            evidence["supporting_sources"],
            # Comment + adjudication
            comment,
            routing,
            james_decision,
            james_notes,
            red_status,
        ]

        target_row = ws.max_row + 1
        for col_idx, val in enumerate(row_values, start=1):
            c = ws.cell(row=target_row, column=col_idx, value=val)
            c.alignment = align_top

        # Whole-row highlight by routing.
        if routing == "pre_decided":
            fill = pre_decided_fill
        elif routing == "needs_red":
            fill = needs_red_fill
        elif routing == "james_reviewable":
            fill = james_review_fill
        elif routing == "provisional_candidate":
            fill = provisional_fill
        elif routing == "quarantine":
            fill = quarantine_fill
        elif routing == "auto_resolved" and canonical_match:
            fill = matched_fill
        elif routing == "auto_resolved":
            fill = auto_resolved_fill
        else:
            fill = None
        summary[routing] = summary.get(routing, 0) + 1
        if fill is not None:
            for col_idx in range(1, len(columns) + 1):
                ws.cell(row=target_row, column=col_idx).fill = fill

        # Cross-tab accumulators for the Evidence Summary sheet.
        confidence_counts[evidence["evidence_confidence"]] = confidence_counts.get(evidence["evidence_confidence"], 0) + 1
        strongest_counts[evidence["strongest_source"]] = strongest_counts.get(evidence["strongest_source"], 0) + 1
        routing_x_confidence[(routing, evidence["evidence_confidence"])] = (
            routing_x_confidence.get((routing, evidence["evidence_confidence"]), 0) + 1
        )
        # Conflict-type accumulator.
        if (diff.get("adds_conflict") or "").lower().startswith("yes"):
            conflict_counts["adds_conflict"] += 1
        elif recon_status == "policy_blocked_down":
            conflict_counts["policy_blocked_down"] += 1
        elif recon_status == "canonical_candidate":
            conflict_counts["canonical_candidate"] += 1
        elif recon_status == "productive_multiplicity_base_unresolved":
            conflict_counts["productive_mult_base_unresolved"] += 1
        elif recon_status == "add_conflict":
            conflict_counts["structural_alias_add_conflict"] += 1
        elif recon_status in CONFIRMED_CONFLICT_STATUSES:
            conflict_counts["other_conflict"] += 1
        else:
            conflict_counts["none"] += 1
        # Source-overlap signature (sorted, comma-joined).
        overlap_counts[evidence["supporting_sources"]] = (
            overlap_counts.get(evidence["supporting_sources"], 0) + 1
        )

    # Summary sheet.
    s = wb.create_sheet("Summary")
    s["A1"] = "Footbag.org × IFPA reconciliation — counts"
    s["A1"].font = Font(bold=True, size=14)
    s["A3"] = "Total rows"; s["B3"] = len(diff_rows)
    s["A4"] = "Auto-resolved (matched / structural-alias / productive-multiplicity)"
    s["B4"] = summary["auto_resolved"]
    s["A5"] = "James-reviewable (HIGH/MEDIUM evidence, no conflict)"
    s["B5"] = summary["james_reviewable"]
    s["A6"] = "Provisional candidate (LOW evidence, no conflict)"
    s["B6"] = summary["provisional_candidate"]
    s["A7"] = "James pre-decided"
    s["B7"] = summary["pre_decided"]
    s["A8"] = "Needs Red review (HIGH/MEDIUM evidence + confirmed conflict)"
    s["B8"] = summary["needs_red"]
    s["A9"] = "Quarantine (LOW evidence + conflict)"
    s["B9"] = summary["quarantine"]
    s["A10"] = "Unrouted (defensive — should be 0)"
    s["B10"] = len(diff_rows) - sum(summary.values())

    s["A12"] = "Routing policy (evidence-aware, 2026-05-09):"; s["A12"].font = Font(bold=True)
    s["A13"] = "Footbag.org rows are valid external evidence by default. A row's routing depends on (confidence band, conflict signal):"
    s["A14"] = "  HIGH/MEDIUM + no conflict   → auto_resolved | james_reviewable"
    s["A15"] = "  HIGH/MEDIUM + conflict      → needs_red"
    s["A16"] = "  LOW         + no conflict   → provisional_candidate"
    s["A17"] = "  LOW         + conflict      → quarantine"
    s["A18"] = "Confirmed conflict signals: ADD math conflict, down-family policy deferral, productive-multiplicity base unresolved, canonical-elevation question."

    s["A20"] = "Color legend (Reconciliation sheet rows):"; s["A20"].font = Font(bold=True)
    s["A21"] = "Light blue: matched canonical (auto_resolved)"; s["A21"].fill = matched_fill
    s["A22"] = "Gray: structural-alias / productive-multiplicity (auto_resolved)"; s["A22"].fill = auto_resolved_fill
    s["A23"] = "Yellow: james_reviewable (HIGH/MEDIUM evidence, no conflict)"; s["A23"].fill = james_review_fill
    s["A24"] = "Peach: provisional_candidate (LOW evidence, no conflict)"; s["A24"].fill = provisional_fill
    s["A25"] = "Green: James pre-decided"; s["A25"].fill = pre_decided_fill
    s["A26"] = "Red: needs_red (HIGH/MEDIUM evidence + conflict)"; s["A26"].fill = needs_red_fill
    s["A27"] = "Mauve: quarantine (LOW evidence + conflict)"; s["A27"].fill = quarantine_fill
    s.column_dimensions["A"].width = 80
    s.column_dimensions["B"].width = 12

    # ─── Evidence Summary sheet ─────────────────────────────────────────────
    es = wb.create_sheet("Evidence Summary")
    es["A1"] = "Evidence-density and lineage distributions"
    es["A1"].font = Font(bold=True, size=14)

    row = 3
    es.cell(row=row, column=1, value="Counts by confidence band").font = Font(bold=True); row += 1
    es.cell(row=row, column=1, value="Confidence"); es.cell(row=row, column=2, value="Count")
    es.cell(row=row, column=1).font = Font(bold=True); es.cell(row=row, column=2).font = Font(bold=True); row += 1
    for c in ("HIGH", "MEDIUM", "LOW"):
        es.cell(row=row, column=1, value=c)
        es.cell(row=row, column=2, value=confidence_counts.get(c, 0))
        row += 1

    row += 1
    es.cell(row=row, column=1, value="Counts by strongest_source").font = Font(bold=True); row += 1
    es.cell(row=row, column=1, value="Source"); es.cell(row=row, column=2, value="Count")
    es.cell(row=row, column=1).font = Font(bold=True); es.cell(row=row, column=2).font = Font(bold=True); row += 1
    # Sort by registry strength (highest first), then count desc.
    for sid in sorted(SOURCE_IDS, key=lambda s: -SOURCE_STRENGTH[s]):
        n = strongest_counts.get(sid, 0)
        if n == 0: continue
        es.cell(row=row, column=1, value=f"{sid} — {SOURCE_LABEL[sid]}")
        es.cell(row=row, column=2, value=n)
        row += 1
    if strongest_counts.get("", 0):
        es.cell(row=row, column=1, value="(no source — defensive)")
        es.cell(row=row, column=2, value=strongest_counts[""])
        row += 1

    row += 1
    es.cell(row=row, column=1, value="Counts by routing").font = Font(bold=True); row += 1
    es.cell(row=row, column=1, value="Routing"); es.cell(row=row, column=2, value="Count")
    es.cell(row=row, column=1).font = Font(bold=True); es.cell(row=row, column=2).font = Font(bold=True); row += 1
    for r in ("auto_resolved", "james_reviewable", "provisional_candidate",
              "pre_decided", "needs_red", "quarantine"):
        es.cell(row=row, column=1, value=r)
        es.cell(row=row, column=2, value=summary.get(r, 0))
        row += 1

    row += 1
    es.cell(row=row, column=1, value="Counts by conflict type").font = Font(bold=True); row += 1
    es.cell(row=row, column=1, value="Conflict type"); es.cell(row=row, column=2, value="Count")
    es.cell(row=row, column=1).font = Font(bold=True); es.cell(row=row, column=2).font = Font(bold=True); row += 1
    for k, v in sorted(conflict_counts.items(), key=lambda kv: (-kv[1], kv[0])):
        es.cell(row=row, column=1, value=k)
        es.cell(row=row, column=2, value=v)
        row += 1

    row += 1
    es.cell(row=row, column=1, value="Routing × confidence cross-tab").font = Font(bold=True); row += 1
    es.cell(row=row, column=1, value="Routing"); es.cell(row=row, column=2, value="Confidence"); es.cell(row=row, column=3, value="Count")
    for col in (1, 2, 3): es.cell(row=row, column=col).font = Font(bold=True)
    row += 1
    for (rt, conf), n in sorted(routing_x_confidence.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        es.cell(row=row, column=1, value=rt)
        es.cell(row=row, column=2, value=conf)
        es.cell(row=row, column=3, value=n)
        row += 1

    row += 1
    es.cell(row=row, column=1, value="Top source-overlap signatures (combinations of sources present)").font = Font(bold=True); row += 1
    es.cell(row=row, column=1, value="Sources present"); es.cell(row=row, column=2, value="Count")
    es.cell(row=row, column=1).font = Font(bold=True); es.cell(row=row, column=2).font = Font(bold=True); row += 1
    for sig, n in sorted(overlap_counts.items(), key=lambda kv: -kv[1])[:25]:
        es.cell(row=row, column=1, value=sig or "(none)")
        es.cell(row=row, column=2, value=n)
        row += 1

    es.column_dimensions["A"].width = 60
    es.column_dimensions["B"].width = 14
    es.column_dimensions["C"].width = 14

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)
    print(f"Wrote: {out_path}")
    print("By routing:")
    print(f"  auto_resolved:         {summary['auto_resolved']}")
    print(f"  james_reviewable:      {summary['james_reviewable']}")
    print(f"  provisional_candidate: {summary['provisional_candidate']}")
    print(f"  james_pre_decided:     {summary['pre_decided']}")
    print(f"  needs_red:             {summary['needs_red']}")
    print(f"  quarantine:            {summary['quarantine']}")
    unrouted = len(diff_rows) - sum(summary.values())
    if unrouted: print(f"  UNROUTED (bug?):       {unrouted}")
    print(f"  total:                 {len(diff_rows)}")
    print("By confidence:")
    for c in ("HIGH", "MEDIUM", "LOW"):
        print(f"  {c:<7s}              {confidence_counts.get(c, 0)}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--diff",          default=str(DEFAULT_DIFF))
    ap.add_argument("--adjudication",  default=str(DEFAULT_ADJUDICATION))
    ap.add_argument("--db",            default=str(DEFAULT_DB))
    ap.add_argument("--out",           default=str(DEFAULT_OUT))
    args = ap.parse_args()

    for label, p in [("diff", args.diff), ("adjudication", args.adjudication), ("db", args.db)]:
        if not Path(p).exists():
            print(f"ERROR: {label} not found at {p}", file=sys.stderr)
            return 1

    build_workbook(Path(args.diff), Path(args.adjudication), Path(args.db), Path(args.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())

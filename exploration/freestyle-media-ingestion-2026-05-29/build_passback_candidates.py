"""
PassBack candidate extraction (staging-only, read-only).

Consumes the existing PassBack dictionary intake staging
(`exploration/passback-intake/passback_trick_sources.csv`, 240 rows) plus
read-only cross-checks against `database/footbag.db`, and emits the seven
curator-review candidate CSVs defined in PASSBACK_INGESTION_PLAN.md section 2.

GOVERNANCE (enforced by construction):
  - Read-only on the DB (opened mode=ro). No DB writes, ever.
  - No promotion. Unresolved tricks are queued, not created (Red Wave 2 gated).
  - Frequency is evidence, not authority: a PassBack title never auto-promotes
    to a canonical name / alias / operator / formula.
  - Surging is decomposed to spinning + stepping (never a standalone operator).

Outputs: exploration/freestyle-media-ingestion-2026-05-29/candidates/*.csv + README.md

Run from repo root:  python3 exploration/freestyle-media-ingestion-2026-05-29/build_passback_candidates.py
"""

import csv
import re
import sqlite3
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
INTAKE_CSV = REPO_ROOT / "exploration" / "passback-intake" / "passback_trick_sources.csv"
DB_PATH = REPO_ROOT / "database" / "footbag.db"
OUT_DIR = Path(__file__).resolve().parent / "candidates"


def normalize(name: str) -> str:
    s = (name or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


# Token -> registered-modifier slug. Gerund / abbreviated forms seen in PassBack
# technical names mapped onto the canonical modifier registry. Surging is special
# (decomposes); unrecognized -ing tokens are flagged as unregistered candidates.
OPERATOR_FORMS = {
    "spinning": "spinning", "miraging": "miraging", "symp": "symposium",
    "symposium": "symposium", "pixie": "pixie", "fairy": "fairy",
    "ducking": "ducking", "diving": "diving", "atomic": "atomic",
    "stepping": "stepping", "nuclear": "nuclear", "whirling": "whirling",
    "swirling": "swirling", "barraging": "barraging", "blurry": "blurry",
    "tapping": "tapping", "gyro": "gyro", "quantum": "quantum",
    "terraging": "terraging", "weaving": "weaving", "backside": "backside",
    "blazing": "blazing", "furious": "furious", "pogo": "pogo",
    "rooted": "rooted", "shooting": "shooting",
}
SURGING_DECOMP = ["spinning", "stepping"]
POSITIONALS = {"far", "near", "full", "rev", "reverse", "ss", "op", "double", "triple", "single"}


def load_db():
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        active = {}
        for slug, fam, adds, base, cat in conn.execute(
            "SELECT slug, trick_family, adds, base_trick, category FROM freestyle_tricks WHERE is_active=1"
        ):
            active[slug] = {"family": fam, "adds": adds, "base": base, "category": cat}
        canon_to_slug = {
            normalize(cn): slug
            for slug, cn in conn.execute(
                "SELECT slug, canonical_name FROM freestyle_tricks WHERE is_active=1"
            )
        }
        alias_to_slug = {
            a: t for a, t in conn.execute(
                "SELECT alias_slug, trick_slug FROM freestyle_trick_aliases"
            )
        }
        modifiers = {row[0] for row in conn.execute("SELECT slug FROM freestyle_trick_modifiers")}
        tutorials = list(conn.execute(
            "SELECT id, caption FROM media_items WHERE source_id='passback_tutorials' ORDER BY id"
        ))
        return active, canon_to_slug, alias_to_slug, modifiers, tutorials
    finally:
        conn.close()


def resolve_slug(row, active, canon_to_slug, alias_to_slug):
    """Robust re-match. Returns (slug_or_None, path)."""
    cand = (row.get("candidate_trick_slug") or "").strip()
    if cand and cand in active:
        return cand, "intake_match"
    norm = (row.get("normalized_primary_name") or "").strip() or normalize(row.get("passback_primary_name", ""))
    if norm in active:
        return norm, "recovered_slug"
    if norm in alias_to_slug and alias_to_slug[norm] in active:
        return alias_to_slug[norm], "recovered_alias"
    if norm in canon_to_slug:
        return canon_to_slug[norm], "recovered_canonical"
    return None, "unresolved"


def parse_operators(technical_name, modifiers):
    """Returns (registered_ops, unregistered_op_candidates, surging_flag)."""
    registered, unregistered = [], []
    surging = False
    tokens = re.split(r"[\s,]+", (technical_name or "").lower())
    for tok in tokens:
        t = tok.strip(".()\"'")
        if not t or t in POSITIONALS:
            continue
        if t == "surging":
            surging = True
            for d in SURGING_DECOMP:
                if d not in registered:
                    registered.append(d)
            continue
        if t in OPERATOR_FORMS:
            slug = OPERATOR_FORMS[t]
            if slug in modifiers and slug not in registered:
                registered.append(slug)
            elif slug not in modifiers and slug not in unregistered:
                unregistered.append(slug)
        elif t.endswith("ing") and len(t) > 5:
            # operator-shaped token not in the registry (e.g. illusioning,
            # twisting, flailing): candidate unregistered operator, flag for curator.
            if t not in unregistered:
                unregistered.append(t)
    return registered, unregistered, surging


def split_readings(technical_name):
    """A comma in a technical name separates alternate readings of the same trick."""
    return [r.strip() for r in (technical_name or "").split(",") if r.strip()]


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    active, canon_to_slug, alias_to_slug, modifiers, tutorials = load_db()

    with INTAKE_CSV.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    linkage, unresolved, combos, operators, family, progression = [], [], [], [], [], []
    recovered = []  # Bucket 6 fix: intake said new_candidate, DB re-check found a slug.

    for row in rows:
        name = (row.get("passback_primary_name") or "").strip()
        tech = (row.get("passback_technical_name") or "").strip()
        dex = (row.get("passback_dex_count") or "").strip()
        intake_status = (row.get("match_status") or "").strip()
        slug, path = resolve_slug(row, active, canon_to_slug, alias_to_slug)

        if slug:
            fam = active[slug]["family"]
            linkage.append({
                "passback_name": name, "resolved_slug": slug, "resolution_path": path,
                "proposed_trick_tag": f"#{slug}",
                "proposed_family_tag": f"#family-{fam}" if fam else "",
                "dex_vs_ifpa_add": (row.get("passback_dex_count_vs_ifpa_adds") or "").strip(),
                "linkage_note": "media-tag linkage candidate (needs taxonomy module + Dave coord)",
            })
            if fam:
                family.append({"resolved_slug": slug, "trick_family": fam, "proposed_family_tag": f"#family-{fam}"})
            base = active[slug]["base"]
            if base and base != slug and base in active:
                progression.append({
                    "compound_slug": slug, "prerequisite_base_slug": base,
                    "proxy_note": "structural prerequisite (learn base first); NOT true PassBack learn-order",
                })
            if path != "intake_match":
                recovered.append({"passback_name": name, "recovered_slug": slug, "via": path,
                                  "intake_said": intake_status})
        else:
            unresolved.append({
                "passback_name": name, "technical_name": tech,
                "uptime_component": (row.get("passback_uptime_component") or "").strip(),
                "downtime_component": (row.get("passback_downtime_component") or "").strip(),
                "dex_count": dex, "notes": (row.get("passback_notes") or "").strip(),
                "gate": "Red Wave 2 (no promotion until grammar questions rule)",
            })

        # Combo decomposition: any technical name with >1 reading or >1 component.
        readings = split_readings(tech)
        if len(readings) > 1 or (" " in tech and tech):
            for i, reading in enumerate(readings or [tech]):
                combos.append({
                    "passback_name": name, "reading_index": i,
                    "ordered_components": " > ".join(re.split(r"\s+", reading.strip())),
                    "raw_reading": reading,
                })

        # Operator extraction.
        reg, unreg, surging = parse_operators(tech, modifiers)
        if reg or unreg or surging:
            operators.append({
                "passback_name": name, "registered_operators": "|".join(reg),
                "unregistered_operator_candidates": "|".join(unreg),
                "surging_decomposed": "yes" if surging else "",
                "raw_technical_name": tech,
            })

    # Target 7: tutorial-series grouping from the live PassBack instructional media.
    series = [{
        "media_id": mid, "caption": cap, "proposed_kind_tag": "#kind-series",
        "proposed_series_tag": "#series-passback-methodology",
    } for mid, cap in tutorials]

    def write(fname, fieldnames, data):
        with (OUT_DIR / fname).open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fieldnames, lineterminator="\n")
            w.writeheader()
            w.writerows(data)

    write("01_trick_linkage_candidates.csv",
          ["passback_name", "resolved_slug", "resolution_path", "proposed_trick_tag",
           "proposed_family_tag", "dex_vs_ifpa_add", "linkage_note"], linkage)
    write("02_unresolved_trick_queue.csv",
          ["passback_name", "technical_name", "uptime_component", "downtime_component",
           "dex_count", "notes", "gate"], unresolved)
    write("03_combo_decomposition_candidates.csv",
          ["passback_name", "reading_index", "ordered_components", "raw_reading"], combos)
    write("04_operator_extraction_candidates.csv",
          ["passback_name", "registered_operators", "unregistered_operator_candidates",
           "surging_decomposed", "raw_technical_name"], operators)
    write("05_progression_candidates.csv",
          ["compound_slug", "prerequisite_base_slug", "proxy_note"], progression)
    write("06_family_linkage_candidates.csv",
          ["resolved_slug", "trick_family", "proposed_family_tag"], family)
    write("07_tutorial_series_grouping.csv",
          ["media_id", "caption", "proposed_kind_tag", "proposed_series_tag"], series)

    # Distinct unregistered operator candidates across the corpus.
    unreg_all = sorted({u for r in operators for u in (r["unregistered_operator_candidates"].split("|") if r["unregistered_operator_candidates"] else [])})

    readme = OUT_DIR / "README.md"
    readme.write_text(
        "# PassBack candidate extraction outputs\n\n"
        "Staging-only, read-only. Generated by `../build_passback_candidates.py` from "
        f"`exploration/passback-intake/passback_trick_sources.csv` ({len(rows)} rows = "
        "passback-dicrionary.txt 240 + pb-dict2.txt 42) + read-only "
        "`database/footbag.db`. No DB writes, no promotion.\n\n"
        "**Red Wave 2 gate:** the unresolved-trick queue (02) is the promotion backlog and stays "
        "blocked until the grammar questions rule. Trick/family linkage (01/06) are media-tag "
        "candidates that could proceed before the gate, but still need the taxonomy module "
        "(ARCHITECTURE section 6) and Dave-track coordination.\n\n"
        "## Counts\n\n"
        f"- 01 trick linkage candidates: {len(linkage)}\n"
        f"- 02 unresolved trick queue (Red Wave 2 gated): {len(unresolved)}\n"
        f"- 03 combo decomposition candidates (rows): {len(combos)}\n"
        f"- 04 operator extraction candidates: {len(operators)}\n"
        f"- 05 progression candidates (structural prerequisite proxy): {len(progression)}\n"
        f"- 06 family linkage candidates: {len(family)}\n"
        f"- 07 tutorial series grouping (media items): {len(series)}\n\n"
        "## Matcher-recovery (Bucket 6 fix)\n\n"
        f"{len(recovered)} rows the intake marked `new_candidate` actually resolve to an existing "
        "active slug on DB re-check (alias / canonical / slug). These must NOT be treated as new "
        "tricks. Recovered:\n\n"
        + ("".join(f"- {r['passback_name']} -> {r['recovered_slug']} (via {r['via']})\n" for r in recovered) or "- (none)\n")
        + "\n## Unregistered operator candidates surfaced (curator decision needed)\n\n"
        + (", ".join(unreg_all) if unreg_all else "(none)") + "\n\n"
        "Surging is auto-decomposed to spinning + stepping per the dictionary-skill rule; it is "
        "never emitted as a standalone operator.\n"
    )

    print(f"linkage={len(linkage)} unresolved={len(unresolved)} combos={len(combos)} "
          f"operators={len(operators)} progression={len(progression)} family={len(family)} "
          f"series={len(series)} recovered={len(recovered)}")
    print(f"unregistered operator candidates: {unreg_all}")


if __name__ == "__main__":
    main()

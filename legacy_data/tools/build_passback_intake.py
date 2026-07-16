#!/usr/bin/env python3
"""
build_passback_intake.py

Generate PassBack-style staging CSVs for the video term inventory + alias
candidates + set candidates + snippet evidence lane.

Source video: https://www.youtube.com/watch?v=u9S7zixV3Yw  (PassBack Set List)

Constraint (per user direction 2026-05-04):
  - NO writes to production dictionary tables.
  - All output is staging-only under repo-root curated/.
  - Unknown / ambiguous labels stay status='needs_review' or 'conflicts';
    do NOT silently reconcile.

Inputs:
  - SQLite DB at database/footbag.db (read-only) for current state.

Outputs (created under repo-root curated/):
  - curated/freestyle_media/video_term_inventory.csv
  - curated/freestyle_media/video_snippet_candidates.csv
  - curated/freestyle_sets/set_candidates.csv
  - curated/freestyle_tricks/trick_alias_candidates.csv

Run:
  .venv/bin/python tools/build_passback_intake.py
"""

from __future__ import annotations

import csv
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB   = ROOT / "database" / "footbag.db"
OUT_MEDIA = ROOT / "curated" / "freestyle_media"
OUT_SETS  = ROOT / "curated" / "freestyle_sets"
OUT_TRICKS = ROOT / "curated" / "freestyle_tricks"

SOURCE_URL = "https://www.youtube.com/watch?v=u9S7zixV3Yw"
SOURCE_ID  = "passback_set_list_u9S7zixV3Yw"

# ---------------------------------------------------------------------------
# Authoritative inputs from PassBack ("the set list" + named tricks + misc)
# ---------------------------------------------------------------------------

# PassBack video listed 67 "sets"; user 2026-05-04 directs us to drop "Toe"
# and "Clipper" (not actually sets — dictionary classifications stand). The
# raw list below reflects that correction. 1 dup ("Spinning") deduped on load.
PASSBACK_SETS_RAW: list[str] = [
    "Atomic", "Delusional", "Fairy", "Frantic", "Fusing",
    "Illusioning", "Inside Atomic", "Inside Pixie", "Inside Quantum",
    "Levitating", "Moshing", "Neo", "Phasing", "Pixie", "Quantum",
    "Sailing", "Terraging", "Wiggling", "Symposium",
    "Flailing", "Flaring", "Floating", "Hyper", "Jolimont", "Pogo",
    "Popping", "Rooted Atomic", "Rooted Fairy", "Rooted Quantum", "Slaying",
    "Splicing", "Surfing", "Symp Frantic", "Symp Furious", "Tasing",
    "Warping", "Wontomic", "Wonton",
    "Blazing", "Furious", "Hopping", "Nuclear", "Null", "Quasi", "Rifling",
    "Shattering", "Shooting", "Sliding", "Smiling", "Stepping", "Swirling",
    "Spinning", "Airing", "Blistering", "Double Spinning", "Fairy Spinning",
    "Inspinning", "Leaning", "Neutron", "Pixie Spinning", "Radiative",
    "Slicing", "Spinning",  # dup — dedup below
    "Surging", "Twinspinning",
]

# Pixie-decomposed compounds — staged as snippet candidates, NOT new tricks.
# (PassBack treats these as compositions, not new canonical tricks.)
PASSBACK_PIXIE_COMPOUNDS: list[tuple[str, list[str]]] = [
    ("Pixie Legover",          ["pixie", "legover"]),
    ("Pixie Same Side Drifter",["pixie", "same-side", "drifter"]),
    ("Pixie Far Swirl",        ["pixie", "far", "swirl"]),
    ("Pixie Over Down",        ["pixie", "over-down"]),
    ("Pixie Gyro Toe",         ["pixie", "gyro", "toe"]),
    ("Pixie Diving Whirl",     ["pixie", "diving", "whirl"]),
    ("Pixie Whirl Kick",       ["pixie", "whirl", "kick"]),
    ("Pixie Ducking Blender",  ["pixie", "ducking", "blender"]),
    ("Pixie Ducking Guay",     ["pixie", "ducking", "guay"]),
]

# Named trick equivalences from PassBack. User 2026-05-04 directs us to:
#   - DROP magellan: keep our existing magellan = pixie + legover; do not
#     stage PassBack's pixie+ATW reinterpretation.
#   - DROP assassin: do not stage assasi → assassin alias.
PASSBACK_NAMED_TRICKS: list[dict] = [
    {
        "canonical_name": "Porque",
        "aliases": ["Pixie Torque"],
        "structure": ["pixie", "torque"],
        "notes": "PassBack equivalence: Porque = Pixie Torque.",
    },
    {
        "canonical_name": "Pigbeater",
        "aliases": ["Pixie Eggbeater"],
        "structure": ["pixie", "eggbeater"],
        "notes": "PassBack equivalence: Pigbeater = Pixie Eggbeater.",
    },
]

# Misc snippets (no decomposition asserted by PassBack; just labels in passing).
# Entries already covered under pixie_compounds (pixie-over-down, pixie-ducking-guay)
# are intentionally omitted to keep the inventory deduped.
PASSBACK_MISC_SNIPPETS: list[dict] = [
    {"term": "Smudge Kick", "structure": [], "notes": "Mentioned as a kick variant; structure unspecified."},
    {"term": "Alpine Smog", "structure": [], "notes": "Named compound; structure unspecified."},
]

# Sets PassBack lists that the user has explicitly confirmed are sets, even
# when the dictionary disagrees. Used to upgrade the status flag from
# 'conflicts_classification' to 'confirmed_set_dict_disagrees'.
USER_CONFIRMED_SETS: set[str] = {"surging"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def slugify(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def load_state() -> dict:
    if not DB.exists():
        print(f"ERROR: {DB} not found", file=sys.stderr)
        sys.exit(1)
    con = sqlite3.connect(str(DB))
    con.row_factory = sqlite3.Row
    state = {
        "active_slugs": {r[0] for r in con.execute(
            "SELECT slug FROM freestyle_tricks WHERE is_active=1 AND category != 'modifier'"
        )},
        "all_slugs": {r[0] for r in con.execute("SELECT slug FROM freestyle_tricks")},
        "modifier_slugs": {r[0] for r in con.execute(
            "SELECT slug FROM freestyle_tricks WHERE category='modifier'"
        )},
        "modifier_names": {r[0] for r in con.execute(
            "SELECT modifier_name FROM freestyle_trick_modifiers"
        )},
        "modifier_adds": {r[0]: (r[1], r[2], r[3]) for r in con.execute(
            "SELECT modifier_name, add_bonus, add_bonus_rotational, modifier_type "
            "FROM freestyle_trick_modifiers"
        )},
        "aliases": {r[0]: r[1] for r in con.execute(
            "SELECT alias_slug, trick_slug FROM freestyle_trick_aliases"
        )},
        "trick_meta": {r["slug"]: dict(r) for r in con.execute(
            "SELECT slug, canonical_name, adds, base_trick, category, "
            "       description, review_status, is_active "
            "FROM freestyle_tricks"
        )},
    }
    con.close()
    return state


def lookup(state: dict, label: str) -> dict:
    """Return classification info for a raw label.

    Resolves through trick slugs, modifier-rule names, and aliases.
    """
    s = slugify(label)
    out = {
        "term_slug": s,
        "matched_slug": None,
        "matched_kind": None,         # 'active_trick' | 'inactive_trick' | 'modifier_rule' | 'modifier_slug' | 'alias' | None
        "matched_canonical": None,
        "matched_adds": None,
        "matched_category": None,
    }
    if s in state["active_slugs"]:
        meta = state["trick_meta"][s]
        out.update(matched_slug=s, matched_kind="active_trick",
                   matched_canonical=meta["canonical_name"],
                   matched_adds=meta["adds"], matched_category=meta["category"])
        return out
    if s in state["modifier_slugs"]:
        out.update(matched_slug=s, matched_kind="modifier_slug",
                   matched_canonical=s, matched_category="modifier")
        return out
    if s in state["modifier_names"]:
        out.update(matched_slug=s, matched_kind="modifier_rule",
                   matched_canonical=s, matched_category="modifier")
        return out
    if s in state["aliases"]:
        target = state["aliases"][s]
        out.update(matched_slug=target, matched_kind="alias",
                   matched_canonical=state["trick_meta"].get(target, {}).get("canonical_name"))
        return out
    if s in state["all_slugs"]:
        meta = state["trick_meta"][s]
        out.update(matched_slug=s, matched_kind="inactive_trick",
                   matched_canonical=meta["canonical_name"],
                   matched_adds=meta["adds"], matched_category=meta["category"])
        return out
    return out


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------

def build_set_candidates(state: dict, sets_dedup: list[str]) -> list[dict]:
    rows: list[dict] = []
    for label in sets_dedup:
        info = lookup(state, label)
        s = info["term_slug"]
        # exists as modifier?
        is_mod = (s in state["modifier_slugs"]) or (s in state["modifier_names"])
        is_trick = (s in state["active_slugs"]) or (s in state["all_slugs"]) or (s in state["aliases"])
        # status
        if is_mod:
            status = "known_modifier"
        elif s in USER_CONFIRMED_SETS:
            status = "confirmed_set_dict_disagrees"
        elif info["matched_kind"] == "active_trick":
            # PassBack labels it a SET, but our dictionary has it as a TRICK
            status = "conflicts_classification"
        elif info["matched_kind"] in ("inactive_trick", "alias"):
            status = "conflicts_classification"
        else:
            status = "new"
        rows.append({
            "set_slug": s,
            "set_name": label,
            "source_url": SOURCE_URL,
            "source_id": SOURCE_ID,
            "exists_as_modifier": "Y" if is_mod else "N",
            "exists_as_trick":    "Y" if (info["matched_kind"] in ("active_trick","inactive_trick","alias")) else "N",
            "our_existing_slug":  info["matched_slug"] or "",
            "our_existing_kind":  info["matched_kind"] or "",
            "status": status,
            "notes": _notes_for_set(label, info, is_mod),
        })
    return rows


def _notes_for_set(label: str, info: dict, is_mod: bool) -> str:
    s = info["term_slug"]
    if is_mod:
        return f"Already a modifier in dictionary ({info['matched_kind']})."
    if s in USER_CONFIRMED_SETS:
        return (f"User-confirmed 2026-05-04: '{label}' is a SET. Dictionary "
                f"currently has slug '{info['matched_slug']}' as "
                f"category={info['matched_category']!r}; dictionary update pending.")
    if info["matched_kind"] == "active_trick":
        return (f"PassBack labels '{label}' a SET, but dictionary has slug "
                f"'{info['matched_slug']}' as category={info['matched_category']!r}. "
                "Needs human adjudication.")
    if info["matched_kind"] == "inactive_trick":
        return (f"Dictionary has inactive slug '{info['matched_slug']}' "
                f"(category={info['matched_category']!r}). Pending review.")
    if info["matched_kind"] == "alias":
        return f"Already an alias for '{info['matched_slug']}' in dictionary."
    return "Not in dictionary; new candidate set."


def build_alias_candidates(state: dict) -> list[dict]:
    rows: list[dict] = []
    for nt in PASSBACK_NAMED_TRICKS:
        canonical_slug = slugify(nt["canonical_name"])
        canon_info = lookup(state, nt["canonical_name"])
        existing = canon_info["matched_kind"] in ("active_trick","inactive_trick","alias","modifier_slug","modifier_rule")
        # ADD math from structure
        adds_proposed = _adds_from_structure(state, nt["structure"])
        # determine conflict
        conflict = ""
        status = "proposed"
        if canon_info["matched_kind"] == "active_trick":
            existing_meta = state["trick_meta"][canon_info["matched_slug"]]
            existing_struct = _structure_of(state, canon_info["matched_slug"])
            if existing_struct and existing_struct != nt["structure"]:
                status = "conflicts"
                conflict = (
                    f"existing slug '{canon_info['matched_slug']}' "
                    f"adds={existing_meta['adds']}, base={existing_meta['base_trick']}; "
                    f"PassBack structure={'+'.join(nt['structure'])}"
                )
            else:
                status = "matches_existing"
        for alias in nt["aliases"]:
            rows.append({
                "alias_slug": slugify(alias),
                "alias_name": alias,
                "target_slug": canonical_slug,
                "target_canonical_name": nt["canonical_name"],
                "target_exists_in_dict": "Y" if existing else "N",
                "structure_proposed": "+".join(nt["structure"]),
                "adds_proposed": adds_proposed if adds_proposed is not None else "",
                "source_url": SOURCE_URL,
                "source_id": SOURCE_ID,
                "status": status,
                "conflict_with": conflict,
                "notes": nt["notes"],
            })
    return rows


def _structure_of(state: dict, slug: str) -> list[str] | None:
    """Recover an existing trick's modifier+base structure from DB columns."""
    con = sqlite3.connect(str(DB))
    try:
        mods = [r[0] for r in con.execute(
            "SELECT modifier_slug FROM freestyle_trick_modifier_links WHERE trick_slug=?",
            (slug,))]
    finally:
        con.close()
    base = state["trick_meta"].get(slug, {}).get("base_trick")
    if not base:
        return None
    if mods:
        return mods + [base]
    return [base]


def _adds_from_structure(state: dict, tokens: list[str]) -> int | None:
    total = 0
    seen_base = False
    for t in tokens:
        if t in state["modifier_adds"]:
            total += state["modifier_adds"][t][0]  # add_bonus
            continue
        if t in state["active_slugs"]:
            adds = state["trick_meta"][t]["adds"]
            try:
                total += int(adds)
                seen_base = True
                continue
            except (TypeError, ValueError):
                return None
        # unresolved token — abort math
        return None
    return total if seen_base else None


def build_term_inventory(state: dict, sets_dedup: list[str],
                         pixie_compounds, named, misc) -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()

    def add(label: str, source_type: str, info: dict, structure: str, notes: str):
        slug = info["term_slug"]
        if slug in seen:
            return
        seen.add(slug)
        rows.append(_inv_row(label, source_type, info, structure, notes))

    # 1) Sets
    for label in sets_dedup:
        info = lookup(state, label)
        add(label, "set_list", info, structure="", notes="")

    # 2) Pixie compounds (snippet evidence form)
    for label, structure in pixie_compounds:
        info = lookup(state, label)
        add(label, "pixie_compound", info,
            structure="+".join(structure),
            notes="PassBack pixie-decomposition; staged as snippet.")

    # 3) Named tricks
    for nt in named:
        info = lookup(state, nt["canonical_name"])
        add(nt["canonical_name"], "named_trick", info,
            structure="+".join(nt["structure"]),
            notes=nt["notes"])
        for a in nt["aliases"]:
            ai = lookup(state, a)
            add(a, "named_trick_alias", ai,
                structure="+".join(nt["structure"]),
                notes=f"Alias of {nt['canonical_name']!r} per PassBack.")

    # 4) Misc snippets — only those not already inventoried above.
    for m in misc:
        info = lookup(state, m["term"])
        add(m["term"], "misc_snippet", info,
            structure="+".join(m["structure"]),
            notes=m["notes"])
    return rows


def _inv_row(label: str, source_type: str, info: dict, structure: str, notes: str) -> dict:
    if info["matched_kind"] == "active_trick":
        classification = "trick"
        status = "known"
    elif info["matched_kind"] == "modifier_slug":
        classification = "modifier"
        status = "known"
    elif info["matched_kind"] == "modifier_rule":
        classification = "modifier"
        status = "known"
    elif info["matched_kind"] == "alias":
        classification = "alias"
        status = "known"
    elif info["matched_kind"] == "inactive_trick":
        classification = "trick"
        status = "pending"
    else:
        classification = ""
        status = "needs_review"
    return {
        "term": label,
        "term_slug": info["term_slug"],
        "source_url": SOURCE_URL,
        "source_id": SOURCE_ID,
        "source_type": source_type,
        "classification": classification,
        "our_slug_match": info["matched_slug"] or "",
        "our_match_kind": info["matched_kind"] or "",
        "matched_canonical": info["matched_canonical"] or "",
        "matched_adds": info["matched_adds"] or "",
        "matched_category": info["matched_category"] or "",
        "structure_proposed": structure,
        "status": status,
        "notes": notes,
    }


def build_snippet_candidates(state: dict, pixie_compounds, named, misc) -> list[dict]:
    rows: list[dict] = []
    # PassBack snippet candidates carry no proposed compound difficulty. The
    # adds_proposed value is optional staging metadata; a computed compound sum on
    # an unreviewed decomposition candidate must not ride into promotion or be read
    # as a difficulty claim, so every snippet row emits adds_proposed blank. The
    # canonical ADD lives on the matched trick row, never here.
    seq = 0
    seen: set[str] = set()
    for label, structure in pixie_compounds:
        s = slugify(label)
        if s in seen:
            continue
        seen.add(s)
        seq += 1
        info = lookup(state, label)
        rows.append({
            "snippet_id": f"passback_{seq:03d}_{slugify(label)}",
            "term": label,
            "term_slug": slugify(label),
            "source_url": SOURCE_URL,
            "source_id": SOURCE_ID,
            "start_seconds": "",
            "end_seconds": "",
            "structure_decomposition": "+".join(structure),
            "adds_proposed": "",
            "our_slug_match": info["matched_slug"] or "",
            "our_match_kind": info["matched_kind"] or "",
            "status": "needs_review" if info["matched_kind"] is None else "known",
            "notes": "Pixie-decomposed compound from PassBack.",
        })
    for nt in named:
        s = slugify(nt["canonical_name"])
        if s in seen:
            continue
        seen.add(s)
        seq += 1
        info = lookup(state, nt["canonical_name"])
        rows.append({
            "snippet_id": f"passback_{seq:03d}_{slugify(nt['canonical_name'])}",
            "term": nt["canonical_name"],
            "term_slug": slugify(nt["canonical_name"]),
            "source_url": SOURCE_URL,
            "source_id": SOURCE_ID,
            "start_seconds": "",
            "end_seconds": "",
            "structure_decomposition": "+".join(nt["structure"]),
            "adds_proposed": "",
            "our_slug_match": info["matched_slug"] or "",
            "our_match_kind": info["matched_kind"] or "",
            "status": _named_status(state, nt, info),
            "notes": nt["notes"],
        })
    for m in misc:
        s = slugify(m["term"])
        if s in seen:
            continue
        seen.add(s)
        seq += 1
        info = lookup(state, m["term"])
        rows.append({
            "snippet_id": f"passback_{seq:03d}_{slugify(m['term'])}",
            "term": m["term"],
            "term_slug": slugify(m["term"]),
            "source_url": SOURCE_URL,
            "source_id": SOURCE_ID,
            "start_seconds": "",
            "end_seconds": "",
            "structure_decomposition": "+".join(m["structure"]),
            "adds_proposed": "",
            "our_slug_match": info["matched_slug"] or "",
            "our_match_kind": info["matched_kind"] or "",
            "status": "needs_review" if info["matched_kind"] is None else "known",
            "notes": m["notes"],
        })
    return rows


def _named_status(state: dict, nt: dict, info: dict) -> str:
    if info["matched_kind"] == "active_trick":
        existing_struct = _structure_of(state, info["matched_slug"])
        if existing_struct and existing_struct != nt["structure"]:
            return "conflicts"
        return "matches_existing"
    return "needs_review"


# ---------------------------------------------------------------------------
# QC
# ---------------------------------------------------------------------------

def run_qc(inventory, snippets, sets_rows, alias_rows) -> list[str]:
    findings: list[str] = []

    # Duplicate slugs within each surface
    for label, rows, key in [
        ("video_term_inventory.csv", inventory, "term_slug"),
        ("video_snippet_candidates.csv", snippets, "snippet_id"),
        ("set_candidates.csv", sets_rows, "set_slug"),
        ("trick_alias_candidates.csv", alias_rows, "alias_slug"),
    ]:
        seen: dict[str, int] = {}
        for r in rows:
            seen[r[key]] = seen.get(r[key], 0) + 1
        dups = [(k, v) for k, v in seen.items() if v > 1]
        if dups:
            findings.append(f"DUPLICATE_KEYS in {label}: {dups}")

    # Missing source_url
    for label, rows in [
        ("video_term_inventory.csv", inventory),
        ("video_snippet_candidates.csv", snippets),
        ("set_candidates.csv", sets_rows),
        ("trick_alias_candidates.csv", alias_rows),
    ]:
        miss = [r for r in rows if not r.get("source_url")]
        if miss:
            findings.append(f"MISSING_SOURCE_URL in {label}: {len(miss)} rows")

    # Missing classification on inventory
    miss_class = [r for r in inventory if r["status"] == "needs_review" and not r["classification"]]
    if miss_class:
        findings.append(
            f"NEEDS_REVIEW_NO_CLASSIFICATION in video_term_inventory.csv: "
            f"{len(miss_class)} rows (expected; needs human attention)"
        )

    # Alias targets that don't exist
    missing_targets = [r for r in alias_rows if r["target_exists_in_dict"] == "N"]
    if missing_targets:
        findings.append(
            f"ALIAS_TARGETS_NEW in trick_alias_candidates.csv: "
            f"{len(missing_targets)} rows propose canonical not yet in dict "
            f"({[r['target_slug'] for r in missing_targets]})"
        )

    # Conflict markers (informational, not errors)
    conflicts = [r for r in alias_rows if r["status"] == "conflicts"]
    if conflicts:
        findings.append(
            f"ALIAS_CONFLICTS: {len(conflicts)} rows "
            f"({[r['alias_slug']+'→'+r['target_slug'] for r in conflicts]})"
        )

    return findings


# ---------------------------------------------------------------------------
# Writers
# ---------------------------------------------------------------------------

def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    state = load_state()

    # Dedup the set list (order-preserving)
    seen = set()
    sets_dedup: list[str] = []
    for s in PASSBACK_SETS_RAW:
        if s in seen:
            continue
        seen.add(s)
        sets_dedup.append(s)

    pixie_dedup_seen = set()
    pixie_compounds: list[tuple[str, list[str]]] = []
    for label, struct in PASSBACK_PIXIE_COMPOUNDS:
        k = slugify(label)
        if k in pixie_dedup_seen:
            continue
        pixie_dedup_seen.add(k)
        pixie_compounds.append((label, struct))

    sets_rows  = build_set_candidates(state, sets_dedup)
    alias_rows = build_alias_candidates(state)
    inventory  = build_term_inventory(state, sets_dedup, pixie_compounds,
                                      PASSBACK_NAMED_TRICKS,
                                      PASSBACK_MISC_SNIPPETS)
    snippets   = build_snippet_candidates(state, pixie_compounds,
                                          PASSBACK_NAMED_TRICKS,
                                          PASSBACK_MISC_SNIPPETS)

    write_csv(OUT_MEDIA / "video_term_inventory.csv", inventory, [
        "term", "term_slug", "source_url", "source_id", "source_type",
        "classification", "our_slug_match", "our_match_kind",
        "matched_canonical", "matched_adds", "matched_category",
        "structure_proposed", "status", "notes",
    ])
    write_csv(OUT_MEDIA / "video_snippet_candidates.csv", snippets, [
        "snippet_id", "term", "term_slug", "source_url", "source_id",
        "start_seconds", "end_seconds", "structure_decomposition",
        "adds_proposed", "our_slug_match", "our_match_kind",
        "status", "notes",
    ])
    write_csv(OUT_SETS / "set_candidates.csv", sets_rows, [
        "set_slug", "set_name", "source_url", "source_id",
        "exists_as_modifier", "exists_as_trick",
        "our_existing_slug", "our_existing_kind", "status", "notes",
    ])
    write_csv(OUT_TRICKS / "trick_alias_candidates.csv", alias_rows, [
        "alias_slug", "alias_name", "target_slug", "target_canonical_name",
        "target_exists_in_dict", "structure_proposed", "adds_proposed",
        "source_url", "source_id", "status", "conflict_with", "notes",
    ])

    findings = run_qc(inventory, snippets, sets_rows, alias_rows)

    # ---- coverage report ----
    n_sets_known_mod  = sum(1 for r in sets_rows if r["status"] == "known_modifier")
    n_sets_conflict   = sum(1 for r in sets_rows if r["status"] == "conflicts_classification")
    n_sets_confirmed  = sum(1 for r in sets_rows if r["status"] == "confirmed_set_dict_disagrees")
    n_sets_new        = sum(1 for r in sets_rows if r["status"] == "new")
    n_inv_known       = sum(1 for r in inventory if r["status"] == "known")
    n_inv_pending     = sum(1 for r in inventory if r["status"] == "pending")
    n_inv_needs_rev   = sum(1 for r in inventory if r["status"] == "needs_review")

    print("=== PassBack intake — coverage report ===")
    print(f"Source: {SOURCE_URL}")
    print()
    print(f"Sets ({len(sets_rows)} unique):")
    print(f"  known_modifier:               {n_sets_known_mod}")
    print(f"  confirmed_set_dict_disagrees: {n_sets_confirmed}")
    print(f"  conflicts_classification:     {n_sets_conflict}")
    print(f"  new:                          {n_sets_new}")
    print()
    print(f"Term inventory ({len(inventory)} rows):")
    print(f"  known:        {n_inv_known}")
    print(f"  pending:      {n_inv_pending}")
    print(f"  needs_review: {n_inv_needs_rev}")
    print()
    print(f"Snippets:        {len(snippets)}")
    print(f"Alias proposals: {len(alias_rows)}")
    print()
    print("=== QC findings ===")
    if not findings:
        print("  (none)")
    else:
        for f_ in findings:
            print(f"  - {f_}")
    print()
    print("=== Outputs ===")
    print(f"  {OUT_MEDIA  / 'video_term_inventory.csv'}     ({len(inventory)} rows)")
    print(f"  {OUT_MEDIA  / 'video_snippet_candidates.csv'} ({len(snippets)} rows)")
    print(f"  {OUT_SETS   / 'set_candidates.csv'}           ({len(sets_rows)} rows)")
    print(f"  {OUT_TRICKS / 'trick_alias_candidates.csv'}   ({len(alias_rows)} rows)")


if __name__ == "__main__":
    main()

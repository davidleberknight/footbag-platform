#!/usr/bin/env python3
"""SYMBOLIC-GRAMMAR-2: build educational symbolic-grammar integration layer.

Generates Tasks A/B/C/F/G of the SG-2 brief from IFPA dictionary state +
SYMBOLIC-GRAMMAR-1 outputs + GRAMMAR-GLOSSARY-1 outputs + PassBack-intake data.

Outputs (all under freestyle/symbolic_grammar/):
  Task A — 5 group CSVs:
    symbolic_topology_groups.csv
    symbolic_modifier_groups.csv
    symbolic_contact_groups.csv
    symbolic_dex_groups.csv
    symbolic_execution_patterns.csv
  Task B — symbolic_group_membership.csv (every IFPA pilot row × its symbolic groups)
  Task C — symbolic_equivalence_clusters.csv (mechanical equivalence families)
  Task F — symbolic_vs_ifpa_family_analysis.csv (cross-cut analysis)
  Task G — movement_archetype_registry.csv (reusable execution shapes)

Tasks D (glossary crosslinks) + E (navigation prototypes) are hand-authored,
not script-generated; they require textual / UX reasoning.

Read-only on DB. No DB writes. No canonical mutation. Deterministic output.

Per SYMBOLIC_GRAMMAR_2_DESIGN.md §constraints.
"""
from __future__ import annotations

import csv
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "database" / "footbag.db"
SG1_MASTER = ROOT / "freestyle" / "inputs" / "observational" / "SYMBOLIC_GRAMMAR_MASTER.csv"
OUT_DIR = ROOT / "freestyle" / "symbolic_grammar"


# ─────────────────────────────────────────────────────────────────────────
# Group definitions (Task A)
# ─────────────────────────────────────────────────────────────────────────

# Topology groups — shape-based (where the kick lands, what the body does)
TOPOLOGY_GROUPS = [
    ("butterfly-wing-topology", "Butterfly wing topology", "topology",
     "Tricks whose execution traces butterfly's outside-wing motion with cross-body clipper recovery.",
     "butterfly, ripwalk, dimwalk, sidewalk, bigwalk, parkwalk, phoenix, dada-curve, matador"),
    ("whirl-rotational-topology", "Whirl rotational topology", "topology",
     "Tricks whose primary uptime mechanic is a full-body rotational dex on the whirl arc.",
     "whirl, spinning-whirl, ducking-whirl, paradox-whirl, stepping-whirl, atomic-whirl, hatchet"),
    ("swirl-rotational-topology", "Swirl rotational topology", "topology",
     "Mirror of whirl topology: reverse-direction rotational dex.",
     "swirl, whirling-swirl, paradon-swirl"),
    ("osis-rotational-topology", "Osis rotational topology", "topology",
     "Tricks whose primary uptime mechanic is the osis hippy-in-dex extended arc.",
     "osis, stepping-osis, ducking-osis, miraging-osis (=torque)"),
    ("torque-rotational-topology", "Torque rotational topology", "topology",
     "Torque = miraging osis canonical reading; rotational topology variant.",
     "torque, spinning-torque, atomic-torque, blurry-torque, mobius"),
    ("blender-rotational-topology", "Blender rotational topology", "topology",
     "Blender = whirling osis canonical reading; rotational topology variant.",
     "blender, paradox-blender, spender, food-processor"),
    ("legover-topology", "Legover topology", "topology",
     "Tricks whose primary uptime mechanic is a single leg-pass over the bag.",
     "legover, eggbeater, pigbeater, scrambled-eggbeater, flurry, smog"),
    ("pickup-topology", "Pickup topology", "topology",
     "Tricks whose primary uptime mechanic is an under-foot scoop from below.",
     "pickup, paste, legeater, scrambled-eggbeater, omelette"),
    ("mirage-topology", "Mirage hippy-in-dex topology", "topology",
     "Tricks whose primary uptime dex is mirage's in-to-out hippy motion.",
     "mirage, smear, blur, atom-smasher, sumo, paradox-mirage, stepping-mirage"),
    ("illusion-topology", "Illusion hippy-out-dex topology", "topology",
     "Tricks whose primary uptime dex is illusion's out-to-in hippy motion (mirror of mirage).",
     "illusion, smudge, flail"),
    ("drifter-miraging-clipper-topology", "Drifter (miraging-clipper) topology", "topology",
     "Drifter = miraging clipper canonical reading; topology mirror of clipper-stall family.",
     "drifter, reverse-drifter, paradox-drifter, smoke, royale"),
    ("atw-leg-circle-topology", "ATW leg-circle topology", "topology",
     "Tricks whose primary uptime mechanic is a full-circle leg pass around the bag.",
     "around-the-world, double-around-the-world, reverse-around-the-world"),
    ("barfly-double-loop-topology", "Barfly double-loop topology", "topology",
     "Two-infinity-loop body pattern (barfly base).",
     "barfly, superfly, nemesis, venom, barfry"),
    ("double-dex-topology", "Double-dex topology", "topology",
     "Two consecutive dex flicks; no body action between them.",
     "barrage, barfly, barfry, bubba-beater"),
    ("multi-dex-topology", "Multi-dex topology", "topology",
     "Three-or-more dex chain; rapid sequential dex sequence.",
     "enterrage, flaming-homer, flurry, flog"),
    ("xdex-topology", "X-Dex topology (full-circle dex variant)", "topology",
     "Tricks whose compound carries an XDEX (full-circle dex) flag; pt1 narrow scope.",
     "atom-smasher, witchdoctor, sumo, merlin"),
    ("unusual-surface-topology", "Unusual-surface topology", "topology",
     "Tricks whose final contact lands on a non-standard surface (flapper/sole/cloud/head/knee).",
     "buttersole, ricochet, singularity"),
    ("stall-1add-topology", "1-ADD stall topology", "topology",
     "Pure delay surface; no dex; foundational primitives.",
     "toe-stall, clipper, inside-stall, outside-stall, heel-stall, sole-kick, spin, spyro"),
]

# Modifier groups — what modifier marker the trick carries
MODIFIER_GROUPS = [
    ("spinning-family", "Spinning modifier family", "modifier", "+1 flat per pt10; rotational body modifier.",
     "spinning-whirl, spinning-osis, spinning-clipper, spinning-torque, spender, montage"),
    ("paradox-family", "Paradox modifier family", "modifier", "+1 universal body modifier; in-then-out dex pair structure.",
     "paradox-mirage, paradox-whirl, paradox-blender, paradox-drifter, paradox-symposium-whirl"),
    ("pixie-family", "Pixie modifier family", "modifier", "+1 universal set modifier; compact dex variant.",
     "smear, dimwalk, smoke, phoenix, paste, pigbeater, smudge, magellan, parkwalk"),
    ("ducking-family", "Ducking modifier family", "modifier", "+1 body modifier; duck head movement.",
     "ducking-whirl, ducking-osis, ducking-butterfly, ducking-clipper, mind-bender, phoenix, montage"),
    ("diving-family", "Diving modifier family", "modifier", "+1 body modifier; dive head movement.",
     "hatchet, red-ribbon"),
    ("symposium-family", "Symposium modifier family", "modifier", "+1 no-plant-while body modifier.",
     "matador, mullet, montage, spinal-tap, symposium-whirl, symposium-mirage, superfly"),
    ("stepping-family", "Stepping modifier family", "modifier", "+1 body modifier; step action between dexes.",
     "ripwalk, sidewalk, stepping-osis, stepping-whirl, surreal, blur, grave-digger, surge"),
    ("tapping-family", "Tapping modifier family", "modifier", "+1 foot-pattern modifier; distinct from stepping per pt3.",
     "tap, spinal-tap, tapping-whirl"),
    ("atomic-family", "Atomic modifier family", "modifier", "+1 non-rotational / +2 rotational set modifier.",
     "scrambled-eggbeater, atomic-butterfly, atom-smasher, atomic-torque, eggbeater"),
    ("furious-family", "Furious modifier family", "modifier", "+1 non-rotational / +2 rotational set primitive (parallel to atomic).",
     "fury, nemesis"),
    ("quantum-family", "Quantum modifier family", "modifier", "+1 universal set modifier per pt10.",
     "tripwalk, legeater, plasma"),
    ("nuclear-family", "Nuclear modifier family", "modifier", "+2 set modifier; paradox+atomic structure per pt10.",
     "matador, sumo, hurl, barfry"),
    ("gyro-family", "Gyro modifier family", "modifier", "+1 body-axial rotation modifier.",
     "mobius, vortex"),
    ("whirling-family", "Whirling modifier family", "modifier", "+1 rotation modifier; flat per pt10.",
     "whirling-swirl, blender (whirling-osis)"),
    ("barraging-family", "Barraging modifier family", "modifier", "+1 universal body modifier.",
     "jani-walker (barraging-butterfly), flurry (barraging-legover; data-debt), barraging-osis (deferred)"),
    ("blurry-family", "Blurry modifier family", "modifier", "+1 flat per pt11; set modifier.",
     "blur, blurry-whirl, blurry-torque, blurriest, food-processor"),
    ("miraging-family", "Miraging modifier family", "modifier", "+1 body modifier; underlies torque/drifter/DLO canonical decompositions.",
     "torque (miraging-osis), drifter (miraging-clipper), DLO (miraging-legover)"),
]

# Contact groups — where the trick starts + finishes
CONTACT_GROUPS = [
    ("toe-start", "Toe-stall start", "contact-position", "Trick begins from a toe-stall plant.",
     "atomsmasher, mirage, whirl, blaze, etc. (~172 FM rows)"),
    ("clipper-start", "Clipper-stall start", "contact-position", "Trick begins from a clipper-stall plant.",
     "barrage, barfly, barfry, alex-zerbe, etc. (~188 FM rows)"),
    ("set-start", "Set-start (bracketed-notation rows)", "contact-position", "Generic set surface; bracket-notation style.",
     "butterfly, flail (~4-10 rows)"),
    ("toe-ending", "Toe finish", "contact-position", "Trick ends on a toe stall (op-toe or same-toe with DEL).",
     "atomsmasher, mirage, whirl, blaze"),
    ("clipper-ending", "Clipper finish (xbd recovery)", "contact-position", "Trick ends on a clipper stall (op-clip or same-clip with XBD).",
     "butterfly, phoenix, ripwalk, alex-zerbe"),
    ("flapper-ending", "Flapper / unusual-surface finish", "contact-position", "Trick ends on a non-standard surface.",
     "buttersole, ricochet"),
]

# Dex groups — how the dex moment is mechanically executed
DEX_GROUPS = [
    ("hippy-in-dex", "Hippy in-to-out dex", "dex-mechanic", "Hip-driven inside-to-outside dex motion (mirage canonical).",
     "mirage, smear, blur, atom-smasher, sumo"),
    ("hippy-out-dex", "Hippy out-to-in dex", "dex-mechanic", "Hip-driven outside-to-inside dex motion (illusion canonical).",
     "illusion, smudge, flail"),
    ("leggy-pass", "Leggy pass (over-the-bag)", "dex-mechanic", "Leg pass over the bag without full circle (legover canonical).",
     "legover, eggbeater, pigbeater, scrambled-eggbeater"),
    ("leggy-circle", "Leggy circle (full-circle leg pass)", "dex-mechanic", "Full-circle leg pass around the bag (ATW canonical).",
     "around-the-world, double-around-the-world"),
    ("under-foot-scoop", "Under-foot scoop", "dex-mechanic", "Foot reaches under bag from below to lift it (pickup canonical).",
     "pickup, paste, legeater, scrambled-eggbeater"),
    ("wing-motion-dex", "Wing-motion dex (butterfly arc)", "dex-mechanic", "Outside-wing dex with cross-body recovery (butterfly canonical).",
     "butterfly, ripwalk, sidewalk, dimwalk, parkwalk, dada-curve, matador"),
    ("front-spin-dex", "Front spin dex (whirl)", "dex-mechanic", "Rotational dex with body spinning forward.",
     "whirl, spinning-whirl, hatchet"),
    ("back-spin-dex", "Back spin dex (swirl)", "dex-mechanic", "Rotational dex with body spinning backward.",
     "swirl, whirling-swirl"),
    ("op-out-dex", "Opposite-side outside dex", "dex-mechanic", "Opposite-side outside dex flick.",
     "butterfly's primary dex moment"),
    ("same-out-dex", "Same-side outside dex", "dex-mechanic", "Same-side outside dex flick.",
     "barfly's double-loop, barrage uptime"),
]

# Execution patterns — multi-beat / structural-flag groupings
EXECUTION_PATTERNS = [
    ("directional-reverse-pair", "Directional-reverse pair (direction-is-structural)", "compositional",
     "Two-row canonical equivalence: same kick mechanics, opposite directional travel. Distinct dictionary rows.",
     "drifter/reverse-drifter, whirl/rev-whirl"),
    ("productive-multiplicity-stabilized", "Productive-multiplicity stabilized doubling (pt8 §10)", "compositional",
     "Community-stabilized 'double X' exceptions earning their own canonical row.",
     "double-leg-over, double-around-the-world, double-spin"),
    ("stated-ADD-without-stated-structure", "Stated-ADD-without-stated-structure (§3.2 policy class)", "compositional",
     "Rows whose asserted ADD does not reduce to modifier+base arithmetic; row-level reading.",
     "nemesis, jani-walker, bullwhip"),
    ("same-side-execution", "Same-side execution (ss qualifier)", "positional",
     "Tricks with same-side execution direction; ss=+0 per pt12.",
     "sidewalk, parkwalk, ripstein, dada-curve"),
    ("no-plant-while-symposium", "No-plant-while pre-state (symposium)", "temporal",
     "Tricks whose execution holds a support-leg-off-ground beat.",
     "alex-zerbe, montage, superfly, matador, mullet"),
    ("rooted-pre-state", "Rooted pre-state (held position)", "temporal",
     "Tricks executed without support-leg plant; pt8 rooted set.",
     "railwalk (FM), small cohort"),
    ("recursive-set-name", "Recursive set-name substructure", "compositional",
     "Notation begins with another canonical trick name as the set-source.",
     "Dragonstein (Dragon-prefix), Arcwalk (Frigidosis-prefix)"),
    ("uptime-dex-downtime-butterfly", "Uptime dex + downtime butterfly", "compositional",
     "Movement archetype: dex flick in uptime, butterfly wing in downtime; common in stepping/pixie compounds.",
     "ripwalk, dimwalk, sidewalk, parkwalk, phoenix"),
    ("uptime-dex-downtime-osis", "Uptime dex + downtime osis", "compositional",
     "Movement archetype: dex flick in uptime, osis extended arc in downtime.",
     "stepping-osis, ducking-osis, ripped-warrior"),
    ("double-dex-clipper-ending", "Double-dex with clipper ending", "compositional",
     "Two-dex chain finishing on cross-body clipper.",
     "barrage, barfly, barfry, bubba-beater"),
    ("spinning-drifter-rotational", "Spinning + drifter rotational topology", "compositional",
     "Spinning modifier on drifter base; produces miraging-clipper rotational variant.",
     "alex-zerbe, smoke (when spun)"),
]


# ─────────────────────────────────────────────────────────────────────────
# Data loaders (read-only)
# ─────────────────────────────────────────────────────────────────────────

def load_ifpa_state() -> dict:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    try:
        active: list[dict] = []
        for row in conn.execute(
            "SELECT slug, canonical_name, base_trick, trick_family, adds, "
            "category, computed_adds, add_formula_status, "
            "(CASE WHEN short_description IS NOT NULL AND short_description!='' THEN 1 ELSE 0 END) AS is_pilot "
            "FROM freestyle_tricks WHERE is_active=1"
        ):
            active.append({
                "slug": row["slug"],
                "canonical_name": row["canonical_name"] or "",
                "base_trick": row["base_trick"] or "",
                "trick_family": row["trick_family"] or "",
                "adds": row["adds"],
                "category": row["category"] or "",
                "computed_adds": row["computed_adds"],
                "add_formula_status": row["add_formula_status"] or "",
                "is_pilot": bool(row["is_pilot"]),
            })

        mod_links: dict[str, list[str]] = defaultdict(list)
        for row in conn.execute("SELECT trick_slug, modifier_slug FROM freestyle_trick_modifier_links"):
            mod_links[row["trick_slug"]].append(row["modifier_slug"])

        mod_stubs: set[str] = set()
        for row in conn.execute("SELECT slug FROM freestyle_trick_modifiers"):
            mod_stubs.add(row["slug"])

        return {"tricks": active, "modifier_links": dict(mod_links), "modifier_stubs": mod_stubs}
    finally:
        conn.close()


def load_sg1_master() -> dict[str, dict]:
    """Return {move_name_normalized: row_dict} from SYMBOLIC_GRAMMAR_MASTER.csv."""
    out: dict[str, dict] = {}
    if not SG1_MASTER.exists():
        return out
    with SG1_MASTER.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            key = row["move_name"].lower().strip().replace(" ", "-")
            out[key] = row
    return out


# ─────────────────────────────────────────────────────────────────────────
# Group-writer helpers
# ─────────────────────────────────────────────────────────────────────────

GROUP_FIELDS = [
    "symbolic_group_id",
    "display_name",
    "classification_axis",
    "description",
    "representative_examples",
    "confidence_level",
    "source_basis",
    "review_status",
]


def write_groups_csv(rows: list[tuple], path: Path, source_basis: str) -> None:
    """Each row is (group_id, display_name, axis, description, examples)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=GROUP_FIELDS, quoting=csv.QUOTE_ALL)
        w.writeheader()
        for group_id, display_name, axis, description, examples in rows:
            w.writerow({
                "symbolic_group_id": group_id,
                "display_name": display_name,
                "classification_axis": axis,
                "description": description,
                "representative_examples": examples,
                "confidence_level": "high",
                "source_basis": source_basis,
                "review_status": "observational",
            })


# ─────────────────────────────────────────────────────────────────────────
# Task A — group inventory
# ─────────────────────────────────────────────────────────────────────────

def write_group_csvs() -> None:
    write_groups_csv(TOPOLOGY_GROUPS, OUT_DIR / "symbolic_topology_groups.csv",
                     "SYMBOLIC-GRAMMAR-1 topology families + GRAMMAR-GLOSSARY-1 decomposition registry + CORE_TRICK_SYMBOLIC_TABLE")
    write_groups_csv(MODIFIER_GROUPS, OUT_DIR / "symbolic_modifier_groups.csv",
                     "freestyle_trick_modifiers + SCALE pilot-cohort memory + SYMBOLIC_FAMILY_REGISTRY")
    write_groups_csv(CONTACT_GROUPS, OUT_DIR / "symbolic_contact_groups.csv",
                     "OPERATIONAL_NOTATION_GRAMMAR.md F0 token inventory + SYMBOLIC_GRAMMAR_MASTER first-token frequency")
    write_groups_csv(DEX_GROUPS, OUT_DIR / "symbolic_dex_groups.csv",
                     "CORE_TRICK_SYMBOLIC_TABLE James-shorthand format + PassBack glossary Dex Styles section")
    write_groups_csv(EXECUTION_PATTERNS, OUT_DIR / "symbolic_execution_patterns.csv",
                     "CANONICALIZATION_POLICY §3.2 + §10 + memory pt-rulings + SYMBOLIC-GRAMMAR-1 master operator tags")


# ─────────────────────────────────────────────────────────────────────────
# Task B — group membership
# ─────────────────────────────────────────────────────────────────────────

MEMBERSHIP_FIELDS = [
    "trick_slug",
    "symbolic_group_id",
    "membership_reason",
    "confidence",
    "source",
]


def derive_topology_for_trick(t: dict, mod_links: dict[str, list[str]]) -> list[tuple[str, str]]:
    """Return [(group_id, reason)] for topology memberships."""
    out: list[tuple[str, str]] = []
    slug = t["slug"]
    base = t["base_trick"]
    family = t["trick_family"]
    adds = t["adds"]

    # 1-ADD stall topology
    if adds is not None:
        try:
            if int(adds) <= 1 and (t["category"] in ("body", "set", "compound") or "stall" in slug or "kick" in slug):
                out.append(("stall-1add-topology", f"{adds}-ADD primitive contact/stall"))
        except (ValueError, TypeError):
            pass

    # Base-trick → topology mapping
    base_topology_map = {
        "butterfly": "butterfly-wing-topology",
        "whirl": "whirl-rotational-topology",
        "swirl": "swirl-rotational-topology",
        "osis": "osis-rotational-topology",
        "torque": "torque-rotational-topology",
        "blender": "blender-rotational-topology",
        "legover": "legover-topology",
        "pickup": "pickup-topology",
        "mirage": "mirage-topology",
        "illusion": "illusion-topology",
        "drifter": "drifter-miraging-clipper-topology",
        "reverse-drifter": "drifter-miraging-clipper-topology",
        "around-the-world": "atw-leg-circle-topology",
        "atw": "atw-leg-circle-topology",
        "barfly": "barfly-double-loop-topology",
    }
    if base in base_topology_map:
        out.append((base_topology_map[base], f"base_trick={base}"))

    # Slug-based topology heuristics (where base_trick is empty or self)
    if not base or base == slug:
        if slug in base_topology_map:
            out.append((base_topology_map[slug], f"slug={slug}"))

    # Multi-dex / double-dex topology (rough heuristic: names with "barr" or "double-dex")
    if "barr" in slug or slug in ("barrage", "barfly", "barfry"):
        out.append(("double-dex-topology", "barrage/barfly canonical double-dex pattern"))

    # Unusual-surface topology
    if slug in ("buttersole", "ricochet", "singularity"):
        out.append(("unusual-surface-topology", "non-standard recovery surface"))

    return out


def derive_modifier_memberships(t: dict, mod_links: dict[str, list[str]]) -> list[tuple[str, str]]:
    """Return [(group_id, reason)] from modifier_links table."""
    out: list[tuple[str, str]] = []
    slug = t["slug"]
    modifiers = mod_links.get(slug, [])
    for m in modifiers:
        group_id = f"{m}-family"
        # Only emit if we defined the group in MODIFIER_GROUPS
        if any(g[0] == group_id for g in MODIFIER_GROUPS):
            out.append((group_id, f"modifier_link={m}"))
    return out


def derive_contact_memberships(t: dict) -> list[tuple[str, str]]:
    """Derive contact-group memberships from canonical_name + family heuristics."""
    out: list[tuple[str, str]] = []
    name = t["canonical_name"].lower()
    # The IFPA tricks don't carry direct contact-pattern info; we use canonical-name
    # heuristics + family signals. This is conservative.
    if any(w in name for w in ("toe", "blur", "mirage", "atom-smasher", "smear")):
        out.append(("toe-ending", "compound terminates in toe-stall via canonical-name pattern"))
    if "clip" in name or "butterfly" in name or "wing" in name or t["base_trick"] == "butterfly":
        out.append(("clipper-ending", "compound terminates in clipper-stall via wing-motion or canonical-name pattern"))
    return out


def derive_dex_memberships(t: dict) -> list[tuple[str, str]]:
    """Derive dex-mechanic group memberships from base_trick."""
    out: list[tuple[str, str]] = []
    base = t["base_trick"]
    base_dex_map = {
        "mirage": "hippy-in-dex",
        "illusion": "hippy-out-dex",
        "legover": "leggy-pass",
        "around-the-world": "leggy-circle",
        "pickup": "under-foot-scoop",
        "butterfly": "wing-motion-dex",
        "whirl": "front-spin-dex",
        "swirl": "back-spin-dex",
    }
    if base in base_dex_map:
        out.append((base_dex_map[base], f"base_trick={base}"))
    # Also: if the slug itself IS one of these primitives
    if not base or base == t["slug"]:
        if t["slug"] in base_dex_map:
            out.append((base_dex_map[t["slug"]], f"slug={t['slug']} (foundation)"))
    return out


def derive_execution_memberships(t: dict, mod_links: dict[str, list[str]]) -> list[tuple[str, str]]:
    """Derive execution-pattern memberships from slug/family rules."""
    out: list[tuple[str, str]] = []
    slug = t["slug"]
    # Direction-variant pairs
    if slug in ("reverse-drifter", "rev-whirl", "rev-up"):
        out.append(("directional-reverse-pair", f"{slug} is reverse-direction variant"))
    if slug in ("drifter", "whirl"):
        out.append(("directional-reverse-pair", f"{slug} is anchor of direction-variant pair"))
    # Multiplicity exceptions
    if slug in ("double-leg-over", "double-around-the-world", "double-spin"):
        out.append(("productive-multiplicity-stabilized", "pt8 §10 community-stabilized doubling"))
    # §3.2 policy class
    if slug in ("nemesis", "jani-walker", "bullwhip"):
        out.append(("stated-ADD-without-stated-structure", "CANONICALIZATION_POLICY §3.2"))
    # Same-side cohort (canonical-name pattern)
    if "(same side)" in t["canonical_name"] or "same-side" in slug:
        out.append(("same-side-execution", "same-side qualifier in canonical_name or slug"))
    # Symposium / no-plant-while
    symposium_modifiers = mod_links.get(slug, [])
    if "symposium" in symposium_modifiers:
        out.append(("no-plant-while-symposium", "modifier_link=symposium"))
    # Movement archetypes
    base = t["base_trick"]
    mods = mod_links.get(slug, [])
    if base == "butterfly" and any(m in ("stepping", "pixie", "ducking") for m in mods):
        out.append(("uptime-dex-downtime-butterfly", f"{'/'.join(mods)} + butterfly archetype"))
    if base == "osis" and any(m in ("stepping", "ducking", "spinning") for m in mods):
        out.append(("uptime-dex-downtime-osis", f"{'/'.join(mods)} + osis archetype"))
    if slug in ("barrage", "barfly", "barfry", "bubba-beater"):
        out.append(("double-dex-clipper-ending", f"{slug} is double-dex+clip exemplar"))
    return out


def write_membership_csv(state: dict) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    for t in state["tricks"]:
        # Skip modifier-stub rows (per modifier-public-visibility rule)
        if t["slug"] in state["modifier_stubs"]:
            continue
        memberships: list[tuple[str, str, str, str]] = []
        for g, r in derive_topology_for_trick(t, state["modifier_links"]):
            memberships.append((g, r, "high", "topology heuristic"))
        for g, r in derive_modifier_memberships(t, state["modifier_links"]):
            memberships.append((g, r, "high", "freestyle_trick_modifier_links"))
        for g, r in derive_contact_memberships(t):
            memberships.append((g, r, "medium", "canonical-name heuristic"))
        for g, r in derive_dex_memberships(t):
            memberships.append((g, r, "high", "base_trick mapping"))
        for g, r in derive_execution_memberships(t, state["modifier_links"]):
            memberships.append((g, r, "high", "execution-pattern rule"))
        # Dedup
        seen = set()
        for group_id, reason, conf, src in memberships:
            key = (t["slug"], group_id)
            if key in seen:
                continue
            seen.add(key)
            rows.append({
                "trick_slug": t["slug"],
                "symbolic_group_id": group_id,
                "membership_reason": reason,
                "confidence": conf,
                "source": src,
            })
    # Stable sort
    rows.sort(key=lambda r: (r["trick_slug"], r["symbolic_group_id"]))
    with (OUT_DIR / "symbolic_group_membership.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=MEMBERSHIP_FIELDS, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(rows)
    return len(rows)


# ─────────────────────────────────────────────────────────────────────────
# Task C — equivalence clusters
# ─────────────────────────────────────────────────────────────────────────

EQUIVALENCE_FIELDS = [
    "cluster_id",
    "cluster_label",
    "symbolic_normalization",
    "member_trick_slugs",
    "ifpa_decomposition_variance",
    "add_range",
    "anchor_topology_group",
    "notes",
    "review_status",
]


# Clusters defined manually based on observational analysis. Each list of slugs
# corresponds to active IFPA dictionary rows; modifier-stub rows + non-existent
# slugs are filtered at emit time.
EQUIVALENCE_CLUSTERS = [
    ("wing-on-butterfly", "Wing motion on butterfly base", "modifier + butterfly",
     "butterfly, ripwalk, sidewalk, dimwalk, bigwalk, parkwalk, phoenix, dada-curve, matador, tripwalk, arcwalk",
     "stepping/pixie/nuclear/quantum/self-atom; ADD 3-5", "3-5",
     "butterfly-wing-topology",
     "All members share butterfly wing-motion mechanic + cross-body clipper recovery. IFPA decompositions vary; symbolic topology is identical."),
    ("hippy-in-on-mirage", "Hippy-in dex on mirage base", "modifier + mirage",
     "mirage, smear, blur, atom-smasher, sumo, witchdoctor, paradox-mirage, stepping-paradox-mirage",
     "pixie/atomic+xdex/nuclear+xdex/stepping+paradox; ADD 2-5", "2-5",
     "mirage-topology",
     "Mirage's canonical in-to-out hippy-dex preserved across modifier stacks."),
    ("hippy-out-on-illusion", "Hippy-out dex on illusion base", "modifier + illusion",
     "illusion, smudge, flail",
     "pixie/symposium; ADD 2-3", "2-3",
     "illusion-topology",
     "Mirror of hippy-in family; out-to-in directional travel."),
    ("rotational-on-whirl", "Rotational dex on whirl base", "modifier + whirl",
     "whirl, spinning-whirl, ducking-whirl, paradox-whirl, stepping-whirl, atomic-whirl, hatchet, symposium-whirl, paradox-symposium-whirl, spinning-symposium-whirl",
     "single-modifier 4-ADD / multi-modifier 5-6-ADD; rotational set", "3-6",
     "whirl-rotational-topology",
     "All members preserve whirl's rotational arc; modifier stacking produces compound family of 10+ pilot rows."),
    ("rotational-on-osis", "Rotational dex on osis base", "modifier + osis",
     "osis, stepping-osis, ducking-osis, ripped-warrior, spinning-osis",
     "stepping/ducking/spinning + osis; ADD 3-5", "3-5",
     "osis-rotational-topology",
     "Osis hippy-in-extended preserved across modifier stacks."),
    ("rotational-on-torque", "Rotational dex on torque base", "modifier + torque",
     "torque, spinning-torque, atomic-torque, blurry-torque, mobius",
     "Torque = miraging-osis canonical; modifiers add rotational mass.", "4-7",
     "torque-rotational-topology",
     "Mobius surfaces the recursive-equivalence pattern: gyro-torque (folk) = spinning ss torque (Sets-tab) = spinning ss miraging op osis (deep)."),
    ("rotational-on-blender", "Rotational dex on blender base", "modifier + blender",
     "blender, paradox-blender, spender, food-processor",
     "Blender = whirling-osis canonical; modifiers add rotational mass.", "4-6",
     "blender-rotational-topology",
     "Food-processor pt12-blocked pending Red transitive-blurry Q."),
    ("leg-pass-on-legover", "Leg pass on legover base", "modifier + legover",
     "legover, eggbeater, pigbeater, scrambled-eggbeater, smog, flurry",
     "atomic/pixie+atomic/atomic+pickup overlap/barraging; ADD 2-4; flurry surfaces §3.2 data-debt", "2-4",
     "legover-topology",
     "Eggbeater = atomic-legover canonical per pt4."),
    ("scoop-on-pickup", "Under-foot scoop on pickup base", "modifier + pickup",
     "pickup, paste, legeater, pigbeater, scrambled-eggbeater, omelette",
     "pixie/quantum/atomic/illusioning-pending; ADD 2-3", "2-3",
     "pickup-topology",
     "Omelette's illusioning modifier is dictionary-flagged data-debt."),
    ("circle-on-atw", "Leg circle on around-the-world base", "modifier + ATW",
     "around-the-world, double-around-the-world, reverse-around-the-world",
     "Self-atoms only; pt8 multiplicity exception (datw); direction variant (reverse-atw)", "2-3",
     "atw-leg-circle-topology",
     "Triple-ATW and orbit not in IFPA dictionary."),
    ("drifter-direction-variants", "Drifter direction-variant pair", "drifter / reverse-drifter",
     "drifter, reverse-drifter, paradox-drifter, smoke, royale",
     "Direction-canonical rule; same kick shape opposite travel", "3-4",
     "drifter-miraging-clipper-topology",
     "Anchor row for direction-variant canonical-row pattern."),
    ("whirl-direction-variants", "Whirl direction-variant pair", "whirl / rev-whirl",
     "whirl, rev-whirl, rev-up",
     "Direction-canonical rule; same kick shape opposite rotational sense", "3",
     "whirl-rotational-topology",
     "Second canonical direction-variant pair (after drifter)."),
    ("policy-3-2-trio", "§3.2 stated-ADD-without-stated-structure trio", "row-asserted (no modifier+base arithmetic)",
     "nemesis, jani-walker, bullwhip",
     "Three published §3.2 policy-class exemplars at pilot tier; row-level ADD assertion", "5-6",
     "(cross-cuts topology)",
     "CANONICALIZATION_POLICY §3.2 published list."),
    ("multiplicity-doubling-trio", "Pt8 stabilized multiplicity doubling trio", "double X",
     "double-leg-over, double-around-the-world, double-spin",
     "Three community-stabilized doubling exceptions per pt8 §10", "2-3",
     "(cross-cuts topology)",
     "Double-spin remains non-pilot; other two are SCALE-9 / SCALE-11 pilots."),
    ("barfly-double-loop-cohort", "Barfly double-infinity cohort", "modifier + barfly",
     "barfly, superfly, nemesis, venom, barfry",
     "Modifier compounds preserving the double-loop pattern; nemesis surfaces §3.2 furious-rotational accounting", "4-7",
     "barfly-double-loop-topology",
     "Strongest single-base modifier-bridge cohort outside whirl."),
    ("unusual-surface-cohort", "Unusual-surface recovery cohort", "(uptime mechanics) + flapper/sole/cloud",
     "buttersole, ricochet, singularity",
     "UNS flag in operational notation; appears to carry implicit +1 ADD in source rulings", "3-5",
     "unusual-surface-topology",
     "Three-row cohort; small but stable."),
    ("blurry-pt12-cluster", "Blurry transitive-expansion cluster (pt12 Red-blocked)", "blurry + X (transitive)",
     "blur, blurry-whirl, blurry-torque, food-processor, blurriest",
     "All pt12-blocked pending Red Q1 transitive-blurry ruling", "4-6",
     "(cross-cuts topology)",
     "Five Red-blocked rows; promotion gated by pt12 resolution."),
    ("walking-family-complete", "Walking-family complete cohort", "stepping/pixie + butterfly (-walk pattern)",
     "ripwalk, sidewalk, bigwalk, dimwalk, parkwalk",
     "5/5 -walk family pilots; closes the butterfly-walking topology", "4-5",
     "butterfly-wing-topology",
     "Complete walking-family cohort at pilot after SCALE-11."),
]


def write_equivalence_clusters_csv(state: dict) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    active_slugs = {t["slug"] for t in state["tricks"]}
    rows = []
    for cluster_id, label, normalization, members_raw, variance, add_range, anchor, notes in EQUIVALENCE_CLUSTERS:
        members = [m.strip() for m in members_raw.split(",")]
        # Filter to active IFPA rows; non-active members surface as a side-note
        active_members = [m for m in members if m in active_slugs]
        inactive_members = [m for m in members if m not in active_slugs]
        member_str = ", ".join(active_members)
        if inactive_members:
            notes_with_inactive = f"{notes} Members not in active IFPA dictionary: {', '.join(inactive_members)}."
        else:
            notes_with_inactive = notes
        rows.append({
            "cluster_id": cluster_id,
            "cluster_label": label,
            "symbolic_normalization": normalization,
            "member_trick_slugs": member_str,
            "ifpa_decomposition_variance": variance,
            "add_range": add_range,
            "anchor_topology_group": anchor,
            "notes": notes_with_inactive,
            "review_status": "observational",
        })
    rows.sort(key=lambda r: r["cluster_id"])
    with (OUT_DIR / "symbolic_equivalence_clusters.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=EQUIVALENCE_FIELDS, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(rows)
    return len(rows)


# ─────────────────────────────────────────────────────────────────────────
# Task F — IFPA family × symbolic-topology cross-cut analysis
# ─────────────────────────────────────────────────────────────────────────

ANALYSIS_FIELDS = [
    "ifpa_trick_family",
    "ifpa_family_size",
    "active_pilot_count",
    "distinct_topology_groups_spanned",
    "primary_topology_group",
    "members_in_primary_topology",
    "topology_coherence_score",
    "cross_cutting_topologies",
    "sample_members",
    "diagnostic_notes",
]


def write_family_analysis_csv(state: dict, memberships: list[dict]) -> int:
    """For each IFPA trick_family, compute symbolic-topology coherence + spread."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # Build {family: [trick]} mapping
    family_tricks: dict[str, list[dict]] = defaultdict(list)
    for t in state["tricks"]:
        if t["slug"] in state["modifier_stubs"]:
            continue
        family_tricks[t["trick_family"]].append(t)

    # Re-derive memberships indexed by slug → set of topology group_ids
    slug_topologies: dict[str, set] = defaultdict(set)
    topology_group_ids = {g[0] for g in TOPOLOGY_GROUPS}
    # We need to actually have memberships passed in; use the script-generated CSV
    # to be safe, but it's easier to recompute inline:
    for t in state["tricks"]:
        if t["slug"] in state["modifier_stubs"]:
            continue
        for g, _r in derive_topology_for_trick(t, state["modifier_links"]):
            slug_topologies[t["slug"]].add(g)

    rows = []
    for family, tricks in family_tricks.items():
        if not family:
            continue
        size = len(tricks)
        pilot_count = sum(1 for t in tricks if t["is_pilot"])
        topology_counts: Counter[str] = Counter()
        for t in tricks:
            for tg in slug_topologies.get(t["slug"], set()):
                topology_counts[tg] += 1
        distinct = len(topology_counts)
        if topology_counts:
            primary, primary_n = topology_counts.most_common(1)[0]
        else:
            primary, primary_n = "(none)", 0
        coherence = (primary_n / size) if size > 0 else 0.0
        cross_cutting = ", ".join(t for t, _ in topology_counts.most_common() if t != primary)
        sample = ", ".join(t["slug"] for t in tricks[:5])

        diagnostic_parts = []
        if size == 1:
            diagnostic_parts.append("singleton family")
        if coherence == 1.0 and size > 1:
            diagnostic_parts.append("perfectly coherent (single topology)")
        elif coherence < 0.5 and size > 1:
            diagnostic_parts.append("scattered across multiple topologies")
        if pilot_count == 0:
            diagnostic_parts.append("no pilot members")
        elif pilot_count == size:
            diagnostic_parts.append("fully pilot")

        rows.append({
            "ifpa_trick_family": family,
            "ifpa_family_size": size,
            "active_pilot_count": pilot_count,
            "distinct_topology_groups_spanned": distinct,
            "primary_topology_group": primary,
            "members_in_primary_topology": primary_n,
            "topology_coherence_score": round(coherence, 3),
            "cross_cutting_topologies": cross_cutting,
            "sample_members": sample,
            "diagnostic_notes": "; ".join(diagnostic_parts),
        })
    rows.sort(key=lambda r: (-r["ifpa_family_size"], r["ifpa_trick_family"]))
    with (OUT_DIR / "symbolic_vs_ifpa_family_analysis.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ANALYSIS_FIELDS, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(rows)
    return len(rows)


# ─────────────────────────────────────────────────────────────────────────
# Task G — movement archetype registry
# ─────────────────────────────────────────────────────────────────────────

ARCHETYPE_FIELDS = [
    "archetype_id",
    "archetype_label",
    "uptime_pattern",
    "midtime_pattern",
    "downtime_pattern",
    "anchor_topology_group",
    "anchor_modifier_groups",
    "member_examples",
    "min_adds",
    "max_adds",
    "educational_value",
    "notes",
]


ARCHETYPES = [
    ("uptime-dex-downtime-butterfly", "Uptime dex + downtime butterfly wing",
     "set-into-dex", "(none or brief)", "butterfly-wing-finish",
     "butterfly-wing-topology", "stepping|pixie|ducking|atomic|nuclear|quantum",
     "ripwalk, dimwalk, sidewalk, bigwalk, parkwalk, phoenix, dada-curve, matador, tripwalk",
     3, 5,
     "high: common movement shape; teaches wing-motion + step/dex coordination",
     "All members share butterfly downtime finish; modifier varies uptime expression."),
    ("uptime-dex-downtime-osis", "Uptime dex + downtime osis arc",
     "set-into-dex", "(modifier mid-arc)", "osis-extended-arc",
     "osis-rotational-topology", "stepping|ducking|spinning",
     "stepping-osis, ducking-osis, ripped-warrior",
     4, 5,
     "high: teaches osis hippy-in extended pattern with body modifier inserted",
     "Stepping-osis and ducking-osis form a clean cohort."),
    ("double-dex-clipper-ending", "Double dex chain → cross-body clipper",
     "set-dex-dex", "(none)", "clipper-cross-body-recovery",
     "double-dex-topology", "(none; double-dex is the primary signal)",
     "barrage, barfly, barfry, bubba-beater",
     3, 5,
     "high: teaches sequential dex coordination + cross-body recovery",
     "Foundational double-dex pattern; precedent for multi-dex chains."),
    ("spinning-drifter-rotational", "Spinning + drifter rotational topology",
     "spinning-set", "spin-body", "miraging-clipper-finish",
     "drifter-miraging-clipper-topology", "spinning",
     "alex-zerbe, smoke (when spun), reverse-drifter (mirror)",
     3, 5,
     "medium: teaches spinning on a miraging-clipper base; narrower cohort",
     "Drifter's canonical decomposition is miraging-clipper; spinning adds rotational mass."),
    ("butterfly-wing-topology-anchor", "Butterfly wing-motion topology (no modifier)",
     "set-into-wing-arc", "(none)", "cross-body-clipper",
     "butterfly-wing-topology", "(none; base anchor)",
     "butterfly (3-ADD anchor)",
     3, 3,
     "high: foundation for the largest modifier-cohort in the dictionary",
     "Single-row anchor; modifier compounds branch out from here."),
    ("whirl-rotational-topology-anchor", "Whirl rotational topology (no modifier)",
     "set-into-rotational-dex", "(rotation)", "toe-stall-finish",
     "whirl-rotational-topology", "(none; base anchor)",
     "whirl (3-ADD anchor)",
     3, 3,
     "high: foundation for a 10+ row modifier cohort",
     "Single-row anchor; whirl-family compounds are the largest cohort in pilot tier."),
    ("recursive-set-name-substructure", "Recursive set-name substructure",
     "(named-trick)-prefix", "(varies)", "(varies)",
     "(cross-cuts topology)", "(varies)",
     "Dragonstein, Arcwalk (FM corpus)",
     4, 6,
     "low (educational): illustrates that named tricks can function as set-sources for compounds; not commonly named in IFPA",
     "Parser-side observational pattern surfaced in SYMBOLIC-GRAMMAR-1; not enforced in IFPA canonical."),
    ("direction-variant-pair-archetype", "Direction-variant pair (canonical-row by direction)",
     "(base mechanic, natural direction)", "(none)", "(natural recovery)",
     "(anchor + reverse pair)", "(none)",
     "drifter/reverse-drifter, whirl/rev-whirl",
     3, 3,
     "high: teaches the direction-is-structural canonical-row rule",
     "Two pilot pairs at SCALE-11 establish the pattern."),
    ("xdex-named-compound", "X-Dex named compound (pt1 narrow)",
     "set-into-hippy-in-dex", "(none)", "X-Dex flick + toe-stall-finish",
     "xdex-topology", "atomic|nuclear",
     "atom-smasher, witchdoctor, sumo, merlin",
     3, 6,
     "medium: teaches the X-Dex full-circle dex variant; pt1 narrowed to specific named tricks",
     "FM uses XDEX broadly; IFPA narrows per pt1 ruling. Federation_math_divergence source."),
    ("policy-3-2-row-asserted", "§3.2 row-asserted ADD compound",
     "(complex compound)", "(modifier-modifier interaction)", "(varies)",
     "(cross-cuts topology)", "(varies)",
     "nemesis, jani-walker, bullwhip",
     5, 6,
     "high: teaches the row-level ADD assertion pattern when modifier+base arithmetic does not close cleanly",
     "Three published §3.2 exemplars; trio complete at pilot tier."),
    ("multiplicity-doubling-archetype", "Stabilized multiplicity doubling",
     "(base-mechanic ×2)", "(no reset between)", "(opposite-side delay)",
     "(cross-cuts topology)", "(none; doubling is the primary signal)",
     "double-leg-over, double-around-the-world, double-spin",
     2, 3,
     "medium: teaches the pt8 community-stabilized doubling exception pattern",
     "Three stabilized cases; productive-multiplicity otherwise rejected."),
]


def write_archetype_registry(state: dict) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = []
    for archetype_id, label, uptime, midtime, downtime, anchor_topology, anchor_modifiers, members, min_adds, max_adds, edu, notes in ARCHETYPES:
        rows.append({
            "archetype_id": archetype_id,
            "archetype_label": label,
            "uptime_pattern": uptime,
            "midtime_pattern": midtime,
            "downtime_pattern": downtime,
            "anchor_topology_group": anchor_topology,
            "anchor_modifier_groups": anchor_modifiers,
            "member_examples": members,
            "min_adds": min_adds,
            "max_adds": max_adds,
            "educational_value": edu,
            "notes": notes,
        })
    rows.sort(key=lambda r: r["archetype_id"])
    with (OUT_DIR / "movement_archetype_registry.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ARCHETYPE_FIELDS, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(rows)
    return len(rows)


# ─────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────

def main() -> int:
    state = load_ifpa_state()
    write_group_csvs()
    n_memberships = write_membership_csv(state)
    # Read back memberships for analysis pass
    memberships = []
    with (OUT_DIR / "symbolic_group_membership.csv").open(encoding="utf-8") as f:
        memberships = list(csv.DictReader(f))
    n_clusters = write_equivalence_clusters_csv(state)
    n_families = write_family_analysis_csv(state, memberships)
    n_archetypes = write_archetype_registry(state)

    n_topology = len(TOPOLOGY_GROUPS)
    n_modifier = len(MODIFIER_GROUPS)
    n_contact = len(CONTACT_GROUPS)
    n_dex = len(DEX_GROUPS)
    n_exec = len(EXECUTION_PATTERNS)

    print("SYMBOLIC-GRAMMAR-2 build complete")
    print()
    print("Task A — group inventory:")
    print(f"  symbolic_topology_groups.csv       {n_topology:>3d} rows")
    print(f"  symbolic_modifier_groups.csv       {n_modifier:>3d} rows")
    print(f"  symbolic_contact_groups.csv        {n_contact:>3d} rows")
    print(f"  symbolic_dex_groups.csv            {n_dex:>3d} rows")
    print(f"  symbolic_execution_patterns.csv    {n_exec:>3d} rows")
    print()
    print(f"Task B — symbolic_group_membership.csv  {n_memberships:>4d} memberships across {len([t for t in state['tricks'] if t['slug'] not in state['modifier_stubs']])} non-modifier rows")
    print(f"Task C — symbolic_equivalence_clusters.csv  {n_clusters:>3d} clusters")
    print(f"Task F — symbolic_vs_ifpa_family_analysis.csv  {n_families:>3d} IFPA families analyzed")
    print(f"Task G — movement_archetype_registry.csv  {n_archetypes:>3d} archetypes")
    print()
    print(f"Outputs at: {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

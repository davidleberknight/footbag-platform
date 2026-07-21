#!/usr/bin/env python3
"""
build_trick_reconciliation_workbook.py

Reconciliation workbook comparing IFPA canonical trick data against three
external sources: footbag.org (`exploration/fborg/*.txt`), PassBack
(`legacy_data/inputs/curated/tricks/passback-dicrionary.txt`), and
FootbagMoves (`legacy_data/inputs/curated/tricks/footbagmoves-*adds.txt`).

Scope (per curator direction 2026-05-19):
  - Reconciliation worksheet only. NOT a website feature.
  - Does NOT canonicalize new tricks.
  - Does NOT publish external formulas as IFPA truth.
  - Does NOT resolve doctrine automatically.

Governance role: this workbook is the truth-maintenance governance gate for the
freestyle dictionary: new ingestion from external observational sources,
including the PassBack observational layer and FootbagMoves, remains blocked
until the workbook's per-field statuses are coherent under curator direction.
The hold and disagreement registries used to generate this workbook are
curator-authored constants maintained in this script; do not duplicate them in
memory or secondary status documents. For open doctrine questions and held
readings, freestyle/doctrine/RED_QUEUE.md and RED_RULINGS.md are the only live
truth.

Output:
  legacy_data/reports/trick_reconciliation.csv
  legacy_data/reports/trick_reconciliation_summary.md

Each CSV row covers one commonly-covered trick/name and surfaces:
  IFPA canonical name, compact notation (chain reading), full movement
  formula (operational notation), ADD formula, computed ADD count,
  official ADD count, plus external sources' formula+ADD, plus a
  cross-source status code + curator notes + curator action queue.
"""
from __future__ import annotations

import csv
import re
import sqlite3
from collections import defaultdict
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
DB_PATH   = REPO_ROOT / "database" / "footbag.db"
FBORG_DIR = REPO_ROOT / "exploration" / "fborg"
PB_PATH   = REPO_ROOT / "legacy_data" / "inputs" / "curated" / "tricks" / "passback-dicrionary.txt"
FM_DIR    = REPO_ROOT / "legacy_data" / "inputs" / "curated" / "tricks"

CORE_TRICK_SPEC_PATH       = REPO_ROOT / "src" / "content" / "freestyleLandingContent.ts"
SYMBOLIC_EQUIVALENCES_PATH = REPO_ROOT / "src" / "content" / "freestyleSymbolicEquivalences.ts"
RESOLVED_FORMULAS_PATH     = REPO_ROOT / "src" / "content" / "freestyleResolvedFormulas.ts"

OUT_CSV = REPO_ROOT / "legacy_data" / "reports" / "trick_reconciliation.csv"
OUT_MD  = REPO_ROOT / "legacy_data" / "reports" / "trick_reconciliation_summary.md"

# ── Reconciliation list ────────────────────────────────────────────────────
# ~75 commonly-covered tricks/names. Each entry is the IFPA canonical slug
# (or a placeholder slug when IFPA hasn't canonicalized the name yet). The
# script tolerates absent IFPA rows and records them as "missing_ifpa".
TRICK_LIST: list[str] = [
    # 12 core atoms
    "toe-stall", "clipper-stall", "mirage", "legover", "pickup",
    "illusion", "butterfly", "whirl", "swirl", "osis",
    "around-the-world", "orbit",

    # Direction-variants + reverse-positional pairs
    "rev-whirl", "rev-up", "reverse-mirage", "reverse-legover",

    # Compound flagships
    "torque", "mobius", "blender", "drifter", "eggbeater",
    "atom-smasher", "pendulum", "rake", "barrage", "barfly",
    "double-down",

    # Paradox compounds
    "paradox-mirage", "paradox-illusion", "paradox-osis",
    "paradox-whirl", "paradox-symposium-whirl",

    # Symposium compounds
    "symposium-mirage", "symposium-illusion", "symposium-whirl",
    "symposium-butterfly", "symposium-osis",

    # Pixie compounds
    "pixie-mirage", "pixie-butterfly", "pixie-illusion",
    "pixie-osis", "pixie-whirl", "dimwalk",

    # Atomic / quantum / nuclear / fairy compounds
    "atomic-butterfly", "atomic-osis", "atomic-mirage",
    "quantum-mirage", "nuclear-mirage", "fairy-mirage",

    # Spinning / gyro / whirling compounds
    "spinning-whirl", "spinning-osis", "spinning-butterfly",
    "spinning-mirage", "gyro-torque", "gyro-osis", "gyro-whirl",

    # Stepping / blurry compounds
    "stepping-butterfly", "ripwalk",
    "stepping-paradox-whirl", "blurry-whirl", "blurry-torque",
    "blistering",

    # Ducking / diving compounds
    "ducking-mirage", "ducking-whirl", "ducking-butterfly",
    "ducking-clipper", "ducking-illusion",

    # Set-primitive named compounds
    "pixie", "fairy", "atomic", "quantum", "nuclear", "symposium",

    # Misc commonly named
    "dlo", "datw", "dyno", "gauntlet", "montage", "sidewalk",
    "bigwalk", "dada-curve", "surging", "vortex",
    "smear", "fury", "hatchet", "mullet", "double-spin",
    "food-processor", "baroque", "tomahawk",
]

# ── Cross-source name aliases ──────────────────────────────────────────────
# IFPA slug → list of names commonly used in external sources. The matchers
# below search by lowercased prefix-or-substring on this list against each
# source's own indexing.
NAME_ALIASES: dict[str, list[str]] = {
    "toe-stall":          ["Toe Stall", "Toe Delay", "Toe Stall*"],
    "clipper-stall":      ["Clipper", "Clipper Stall", "Clipper*"],
    "clipper":            ["Clipper Kick", "Clipper-Kick"],  # NOT bare 'Clipper'; per CORE-ATOM-CANONICAL-RECONCILE-1 bare 'Clipper' = clipper-stall (2 ADD); clipper slug (1 ADD body kick) only matches explicit Kick forms. Fixes 2026-05-19 workbook bug: clipper was getting external=2 (the stall) as a name-collision-induced ADD disagreement
    "around-the-world":   ["ATW", "Around the World", "Around the World*"],
    "orbit":              ["Orbit", "Reverse Around the World", "Reverse ATW", "Reverse-ATW"],
    "mirage":             ["Mirage", "Mirage*"],
    "legover":            ["Leg Over", "Legover", "Leg Over*"],
    "pickup":             ["Pickup", "Reverse Legover", "Reverse Leg Over"],
    "illusion":           ["Illusion", "Reverse Mirage"],
    "butterfly":          ["Butterfly", "Butterfly*"],
    "whirl":              ["Whirl", "Whirl*"],
    "swirl":              ["Swirl", "Swirl*"],
    "osis":               ["Osis", "Osis*"],
    "rev-whirl":          ["Rev Whirl", "Rev-Whirl", "Reverse Whirl"],
    "rev-up":             ["Rev Up", "Rev-Up"],
    "reverse-mirage":     ["Reverse Mirage", "Illusion"],
    "reverse-legover":    ["Reverse Legover", "Pickup"],
    "torque":             ["Torque"],
    "mobius":             ["Mobius", "Möbius", "Gyro Torque"],
    "blender":            ["Blender"],
    "drifter":            ["Drifter"],
    "eggbeater":          ["Eggbeater", "Egg Beater"],
    "atom-smasher":       ["Atom Smasher", "Atomsmasher", "Atom-Smasher"],
    "pendulum":           ["Pendulum"],
    "rake":               ["Rake"],
    "barrage":            ["Barrage"],
    "barfly":             ["Barfly"],
    "double-down":        ["Double Down", "Down Double Down", "DDD"],
    "paradox-mirage":     ["Paradox Mirage", "Paradox\nMirage", "Pdx Mirage"],
    "paradox-illusion":   ["Paradox Illusion", "Paradox\nIllusion", "Pdx Illusion"],
    "paradox-osis":       ["Paradox Osis", "Pdx Osis"],
    "paradox-whirl":      ["Paradox Whirl", "PDX Whirl", "Pdx Whirl"],
    "paradox-symposium-whirl": ["Paradox Symposium Whirl", "PS Whirl", "Pdx Symp Whirl"],
    "symposium-mirage":   ["Symposium Mirage", "Symp Mirage", "Symp. Mirage"],
    "symposium-illusion": ["Symposium Illusion", "Symp Illusion"],
    "symposium-whirl":    ["Symposium Whirl", "Symp Whirl"],
    "symposium-butterfly":["Symposium Butterfly"],
    "symposium-osis":     ["Symposium Osis"],
    "pixie-mirage":       ["Pixie Mirage"],
    "pixie-butterfly":    ["Pixie Butterfly"],
    "pixie-illusion":     ["Pixie Illusion"],
    "pixie-osis":         ["Pixie Osis"],
    "pixie-whirl":        ["Pixie Whirl"],
    "dimwalk":            ["Dimwalk", "Pixie Butterfly"],
    "atomic-butterfly":   ["Atomic Butterfly"],
    "atomic-osis":        ["Atomic Osis"],
    "atomic-mirage":      ["Atomic Mirage", "Atomsmasher"],
    "quantum-mirage":     ["Quantum Mirage", "Toe Blur"],
    "nuclear-mirage":     ["Nuclear Mirage"],
    "fairy-mirage":       ["Fairy Mirage"],
    "spinning-whirl":     ["Spinning Whirl"],
    "spinning-osis":      ["Spinning Osis"],
    "spinning-butterfly": ["Spinning Butterfly"],
    "spinning-mirage":    ["Spinning Mirage"],
    "gyro-torque":        ["Gyro Torque", "Mobius"],
    "gyro-osis":          ["Gyro Osis"],
    "gyro-whirl":         ["Gyro Whirl"],
    "stepping-butterfly": ["Stepping Butterfly", "Ripwalk"],
    "ripwalk":            ["Ripwalk", "Stepping Butterfly"],
    "stepping-paradox-whirl": ["Stepping Paradox Whirl", "Blurry Whirl"],
    "blurry-whirl":       ["Blurry Whirl", "Stepping Paradox Whirl"],
    "blurry-torque":      ["Blurry Torque", "Stepping Paradox Torque"],
    "blistering":         ["Blistering", "Gyro Whirling Set"],
    "ducking-mirage":     ["Ducking Mirage"],
    "ducking-whirl":      ["Ducking Whirl"],
    "ducking-butterfly":  ["Ducking Butterfly"],
    "ducking-clipper":    ["Ducking Clipper"],
    "ducking-illusion":   ["Ducking Illusion"],
    "pixie":              ["Pixie"],
    "fairy":              ["Fairy"],
    "atomic":             ["Atomic"],
    "quantum":            ["Quantum"],
    "nuclear":            ["Nuclear"],
    "symposium":          ["Symposium"],
    "dlo":                ["DLO", "Double Legover", "Double Leg Over"],
    "datw":               ["DATW", "Double ATW", "Double Around the World"],
    "dyno":               ["Dyno"],
    "gauntlet":           ["Gauntlet"],
    "montage":            ["Montage"],
    "sidewalk":           ["Sidewalk"],
    "bigwalk":            ["Bigwalk", "Big Walk"],
    "dada-curve":         ["Dada Curve", "Dada-Curve"],
    "surging":            ["Surging", "Surge"],
    "vortex":             ["Vortex"],
    "smear":              ["Smear", "Pixie Mirage"],
    "fury":               ["Fury"],
    "hatchet":            ["Hatchet"],
    "mullet":             ["Mullet"],
    "double-spin":        ["Double Spin", "Double-Spin"],
    "food-processor":     ["Food Processor", "Stepping Paradox Blender"],
    "baroque":            ["Baroque", "Barraging Osis", "Barroque"],
    "tomahawk":           ["Tomahawk"],

    # ── Extended aliases (audit corpus 2026-05-19) ─────────────────────────
    # Added from the 9-audit fborg reconciliation corpus (multiplier doctrine
    # / Job notation / fundamentalmoves / paradoxMoves / gyroMoves /
    # blurryMoves / pixieMoves / footbag-sets / Add-Categories). Improves
    # workbook fborg/PB/FM source-match rates from ~10-44% to higher.

    # Body / surface primitives (existing DB rows; missing alias entries).
    "spin":               ["Spin"],
    "double-spin":        ["Double Spin", "Double-Spin"],
    "spyro":              ["Spyro"],
    "hop-over":           ["Hop Over", "Hop-Over", "Hopover"],
    "walk-over":          ["Walk Over", "Walk-Over", "Walkover"],
    "flying-inside":      ["Flying Inside", "Flying-Inside"],
    "flying-outside":     ["Flying Outside", "Flying-Outside"],
    "flying-clipper":     ["Flying Clipper", "Jester"],
    "inside-stall":       ["Inside Stall", "Inside Delay"],
    "outside-stall":      ["Outside Stall", "Outside Delay"],

    # Folk-named compounds in DB needing alias entries (fundamentalmoves /
    # paradoxMoves / gyroMoves / blurryMoves / pixieMoves audits).
    "blur":               ["Blur", "Stepping Paradox Mirage", "Pdx Blur", "Paradox Blur"],
    "royale":             ["Royale", "Paradox Reverse Drifter"],
    "fog":                ["Fog", "Stepping Paradox Double Leg Over"],
    "surge":              ["Surge", "Surging Paradox Mirage"],
    "surreal":            ["Surreal", "Surging Paradox Whirl"],
    "paradon":            ["Paradon"],
    "big-apple":          ["Big Apple", "Gyro Symposium Torque", "Big-Apple"],
    "magellan":           ["Magellan", "Pixie Legover", "Pixie Same Legover"],
    "terrage":            ["Terrage", "Double Pixie"],
    "terraging":          ["Terraging", "Double Pixie"],
    "smudge":             ["Smudge", "Pixie Illusion"],
    "smog":               ["Smog", "Pixie Double Legover", "Pixie Double Leg Over"],
    "smoke":              ["Smoke", "Pixie Drifter"],
    "parkwalk":           ["Parkwalk", "Pixie Same Side Butterfly"],
    "sailing":            ["Sailing", "Pixie Illusion"],
    "atomic":             ["Atomic", "Toe Set Illusion"],
    "blurry":             ["Blurry", "Stepping Paradox"],

    # Modifier-class rows (modifier table + tricks table category='modifier').
    # Mostly won't match external sources but adds completeness for filtering.
    "barraging":          ["Barraging", "High Stepping"],
    "blazing":            ["Blazing"],
    "ducking":            ["Ducking"],
    "diving":             ["Diving"],
    "gyro":               ["Gyro"],
    "miraging":           ["Miraging"],
    "paradox":            ["Paradox"],
    "spinning":           ["Spinning"],
    "stepping":           ["Stepping"],
    "swirling":           ["Swirling"],
    "tapping":            ["Tapping", "Atomic Same Side"],
    "whirling":           ["Whirling"],
    "pogo":               ["Pogo", "Symposium Whirling"],
    "rooted":             ["Rooted", "Rooting"],
    "furious":            ["Furious", "Barraging Paradox Miraging"],
    "shooting":           ["Shooting", "Stepping Paradox Illusion"],

    # Paradox-family folk names NOT in DB (paradoxMoves audit; placeholder
    # slugs for matching against external sources).
    "voodoo":             ["Voodoo", "Paradox Symposium Blur"],
    "blizzard":           ["Blizzard", "Stepping Paradox Illusion"],
    "blurrage":           ["Blurrage", "Stepping Paradox Barrage"],
    "bedwetter":          ["Bedwetter", "Stepping Paradox Eggbeater"],
    "blurry-drifter":     ["Blurry Drifter", "Stepping Paradox Drifter"],
    "lotus":              ["Lotus", "Spinning Paradox Drifter"],
    "whirlwind":          ["Whirlwind", "Spinning Paradox Symposium Whirl"],
    "marius":             ["Marius", "Spinning Paradox Torque"],
    "paratoxic":          ["Paratoxic", "Paradox Miraging Symposium Whirl"],
    "symposium-tomahawk": ["Symposium Tomahawk", "Ducking Paradox Symposium Whirl"],
    "paradox-high-plains-drifter": ["Paradox High Plains Drifter", "Paradox Double Drifter"],
    "paradox-drifter":    ["Paradox Drifter"],
    "paradox-blender":    ["Paradox Blender", "Paradox Whirling Op Osis"],
    "paradox-torque":     ["Paradox Torque"],
    "paradox-blur":       ["Paradox Blur"],
    "paradox-barrage":    ["Paradox Barrage"],
    "paradox-blizzard":   ["Paradox Blizzard"],
    "paradox-double-leg-over": ["Paradox Double Leg Over", "Paradox Double Legover"],
    "paradox-symposium-mirage": ["Paradox Symposium Mirage"],
    "spinning-paradox-illusion": ["Spinning Paradox Illusion"],
    "spinning-paradox-mirage": ["Spinning Paradox Mirage"],
    "spinning-paradox-whirl": ["Spinning Paradox Whirl"],
    "inspinning-paradox-illusion": ["Inspinning Paradox Illusion"],
    "inspinning-paradox-mirage": ["Inspinning Paradox Mirage"],
    "pogo-paradox-mirage": ["Pogo Paradox Mirage"],
    "pogo-paradox-barrage": ["Pogo Paradox Barrage"],
    "pogo-paradox-drifter": ["Pogo Paradox Drifter"],
    "pogo-paradox-eggbeater": ["Pogo Paradox Eggbeater"],
    "pogo-paradox-whirl": ["Pogo Paradox Whirl"],
    "pogo-paradox-blender": ["Pogo Paradox Blender", "Pogo Op Blender"],
    "pogo-paradox-torque": ["Pogo Paradox Torque", "Pogo Op Torque"],
    "pogo-paradox-dada-curve": ["Pogo Paradox Da Da Curve", "Pogo Op Da Da Curve"],
    "pogo-paradox-whirling-swirl": ["Pogo Paradox Whirling Swirl", "Pogo Op Whirling Swirl"],
    "spinning-paradox-blender": ["Spinning Paradox Blender"],
    "blurry-symposium-whirl": ["Blurry Symposium Whirl", "Stepping Paradox Symposium Whirl"],
    "blurry-whirling-swirl": ["Blurry Whirling Swirl", "Stepping Paradox Whirling Swirl"],
    "stepping-ducking-paradox-blender": ["Stepping Ducking Paradox Blender"],
    "paradox-whirling-swirl": ["Paradox Whirling Swirl"],
    "paradox-blurry-whirl": ["Paradox Blurry Whirl"],
    "paradox-ripwalk":    ["Paradox Ripwalk"],
    "paradox-dada-curve": ["Paradox Da Da Curve"],
    "avalanche":          ["Avalanche", "Stepping Ducking Paradox Illusion"],
    "spike-hammer":       ["Spike Hammer", "Stepping Ducking Paradox Mirage", "Spike-Hammer"],
    "symposium-blizzard": ["Symposium Blizzard"],
    "symposium-blur":     ["Symposium Blur"],
    "stepping-ps-whirling-x-body-rake": ["Stepping P.S. Whirling x-body Rake"],

    # Gyro family folk names + structural (gyroMoves audit).
    "spyro-gyro":         ["Spyro Gyro", "Gyro Butterfly Swirl"],
    "flurricane":         ["Flurricane", "Gyro Flurry"],
    "gyro-butterfly":     ["Gyro Butterfly"],
    "gyro-drifter":       ["Gyro Drifter", "Vortex"],
    "inspinning-same-side-illusion": ["Inspinning Same Side Illusion"],
    "inspinning-same-side-mirage": ["Inspinning Same Side Mirage"],
    "inspinning-same-side-butterfly": ["Inspinning Same Side Butterfly"],

    # Pixie family folk names + structural (pixieMoves audit).
    "yoda":               ["Yoda", "Pixie Ripwalk"],
    "pixie-leg-over":     ["Pixie Leg Over", "Pixie Legover"],
    "pixie-same-side-illusion": ["Pixie Same Side Illusion"],
    "pixie-double-over-down": ["Pixie Double Over Down"],
    "pixie-paradon":      ["Pixie Paradon"],
    "pixie-eclipse":      ["Pixie Eclipse"],
    "pixie-swirl":        ["Pixie Swirl"],
    "symposium-pixie":    ["Symposium Pixie"],
    "pixie-opposite-clipper": ["Pixie Opposite Clipper"],
    "pixie-same-clipper": ["Pixie Same Clipper"],
    "backside-symposium-smear": ["Backside Symposium Smear", "Pixie Symposium Mirage"],

    # Set primitives + compound operators (footbag-sets audit).
    "slapping":           ["Slapping"],
    "bubba":              ["Bubba"],
    "frantic":            ["Frantic", "Pixie-Quantum"],
    "flailing":           ["Flailing", "Symposium Reverse Miraging"],
    "fairy-atomic":       ["Fairy Atomic"],
    "infracting":         ["Infracting"],
    "fairy-spinning":     ["Fairy Spinning"],
    "pixie-inspinning":   ["Pixie Inspinning"],
    "sonic":              ["Sonic", "Double Spinning"],
    "peeking":            ["Peeking"],
    "leaning":            ["Leaning", "Stepping Inspinning"],
    "go-go":              ["Go-Go", "Stepping Backspinning"],
    "twinspinning":       ["Twinspinning", "Nuclear Inspinning"],
    "neutron":            ["Neutron", "Atomic Spin"],
    "scattered":          ["Scattered"],
    "shattered":          ["Shattered"],
    "broken":             ["Broken", "Clipper Reverse Whirl"],
    "inspinning":         ["Inspinning"],

    # Add-Categories audit (Down Diver Down trick + structural patterns).
    "down-diver-down":    ["Down Diver Down"],
}


# ── IFPA loaders ───────────────────────────────────────────────────────────

def load_ifpa_db_rows() -> dict[str, dict]:
    """Pull active trick rows from the platform DB. Returns slug → row dict."""
    if not DB_PATH.exists():
        return {}
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    rows = {}
    cur = con.execute("""
        SELECT slug, canonical_name, adds, base_trick, trick_family,
               category, notation, operational_notation
        FROM freestyle_tricks
        WHERE is_active = 1
    """)
    for r in cur:
        rows[r["slug"]] = dict(r)
    con.close()
    return rows


def load_core_trick_spec() -> dict[str, str]:
    """Slug → curator-authored operational notation. Regex-parses the TS module."""
    text = CORE_TRICK_SPEC_PATH.read_text(encoding="utf-8")
    result = {}
    # Match each entry on one line: { slug: 'X', ..., operationalNotation: 'Y' }
    pattern = re.compile(
        r"\{\s*slug:\s*'([^']+)'.*?operationalNotation:\s*'([^']+)'\s*\}",
        re.DOTALL,
    )
    for m in pattern.finditer(text):
        result[m.group(1)] = m.group(2)
    return result


def load_symbolic_equivalences() -> dict[str, list[str]]:
    """Slug → list of chain readings (compact compositional notation)."""
    text = SYMBOLIC_EQUIVALENCES_PATH.read_text(encoding="utf-8")
    result: dict[str, list[str]] = {}
    # Each entry is a multi-line block. Capture slug + readings array.
    pattern = re.compile(
        r"\{\s*slug:\s*'([^']+)',\s*readings:\s*\[([^\]]+)\]",
        re.DOTALL,
    )
    for m in pattern.finditer(text):
        slug = m.group(1)
        readings_raw = m.group(2)
        readings = re.findall(r"'([^']+)'", readings_raw)
        result[slug] = readings
    return result


def load_resolved_formulas() -> dict[str, dict]:
    """Slug → {derivation, totalAdd, baseAdd, operator, base}. From all sprints."""
    text = RESOLVED_FORMULAS_PATH.read_text(encoding="utf-8")
    result: dict[str, dict] = {}
    # Each formula block spans multiple lines; capture each field.
    pattern = re.compile(
        r"\{\s*"
        r"slug:\s*'([^']+)',\s*"
        r"name:\s*'([^']+)',\s*"
        r"operator:\s*'([^']+)',\s*"
        r"base:\s*'([^']+)',\s*"
        r"baseAdd:\s*(\d+),\s*"
        r"totalAdd:\s*(\d+),\s*"
        r"derivation:\s*'([^']+)',",
        re.DOTALL,
    )
    for m in pattern.finditer(text):
        result[m.group(1)] = {
            "name":       m.group(2),
            "operator":   m.group(3),
            "base":       m.group(4),
            "baseAdd":    int(m.group(5)),
            "totalAdd":   int(m.group(6)),
            "derivation": m.group(7),
        }
    return result


# ── footbag.org loader ─────────────────────────────────────────────────────

# Pattern: an entry begins with a Name line; the next non-blank line is an
# ADD line like "N adds" or "N add"; then optionally a CAPS Jobs-notation
# line; then prose.

ADD_LINE_RE = re.compile(r"^(\d+)\s*adds?\b", re.IGNORECASE)
# Jobs notation lines are mostly uppercase + `>` `[BRACKETS]` `()` and a
# handful of lowercase tokens like 'or' / 'ss' / 'op'. Heuristic: contains
# `>` and at least one bracketed flag, with most words in caps.
JOBS_NOTATION_RE = re.compile(
    r"^[A-Z\[\]\>\(\)\s/,.]+(?:\[[A-Z]+\])"
)


def looks_like_name_part(s: str) -> bool:
    """Heuristic: a fborg name fragment is a short line with no terminal period,
    no leading bracket (which marks component-flag lines), and not the
    'Video demonstration available!' chrome line."""
    if not s:
        return False
    if s.startswith("["):
        return False  # component flags
    if s.lower().startswith("video demonstration"):
        return False
    if s.endswith("."):
        return False  # prose
    if len(s) > 60:
        return False  # prose
    if "add" in s.lower() and re.match(r"^\d+\s*add", s.lower()):
        return False  # ADD line
    return True


def parse_fborg_file(path: Path) -> dict[str, dict]:
    """Parse one fborg .txt file. Returns name → {add, notation}."""
    if not path.exists():
        return {}
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    result: dict[str, dict] = {}
    i = 0
    while i < len(lines):
        # Look for an ADD line.
        line = lines[i].strip()
        m = ADD_LINE_RE.match(line)
        if m:
            add_value = int(m.group(1))
            # Walk back: collect consecutive non-blank lines that look like
            # name fragments. Stop at the first non-name-like line (blank,
            # flags, prose, prior ADD line). Cap at 3 fragments to bound
            # accidental merges.
            name_lines: list[str] = []
            j = i - 1
            while j >= 0 and len(name_lines) < 3:
                t = lines[j].strip()
                if not t:
                    break
                if not looks_like_name_part(t):
                    break
                name_lines.insert(0, t)
                j -= 1
            name = " ".join(name_lines).strip().rstrip("*").strip()
            # Strip footnote `*` markers embedded inside the name (e.g. 'Blur*',
            # 'Mobius*', 'Torque*'). The trailing-only strip above misses cases
            # where `*` lives on the primary token but is followed by an alt-name
            # parenthetical: 'Blur* (Stepping Paradox Mirage)'.
            name = name.replace("*", "")
            name = re.sub(r"\s+", " ", name).strip()
            # Notation = first line after the ADD line that looks like Jobs
            # notation (CAPS + brackets + arrows).
            notation = ""
            k = i + 1
            while k < len(lines) and k < i + 4:
                t = lines[k].strip()
                if not t:
                    k += 1
                    continue
                # Check for notation pattern: contains `>` AND brackets, mostly caps.
                if ">" in t and "[" in t and "]" in t:
                    # Crude all-caps-ish check.
                    upper_ratio = sum(1 for c in t if c.isupper()) / max(1, sum(1 for c in t if c.isalpha()))
                    if upper_ratio > 0.4:
                        notation = t
                        break
                k += 1
            entry = {"add": add_value, "notation": notation, "source_file": path.name}
            result[name] = entry
            # Register parenthetical-paired alt-names as additional lookup keys.
            # fborg convention puts the canonical alt on a separate line, joined
            # to the primary as 'Primary (Alt)'. Split here so NAME_ALIASES can
            # match either form without carrying parenthetical-aware entries.
            paren_match = re.match(r"^(.+?)\s*\(([^)]+)\)\s*$", name)
            if paren_match:
                primary = paren_match.group(1).strip()
                alt     = paren_match.group(2).strip()
                if primary and primary not in result:
                    result[primary] = entry
                if alt and alt not in result:
                    result[alt] = entry
            i += 1
        else:
            i += 1
    return result


def parse_fborg_all() -> dict[str, dict]:
    """Combine all fborg files into a single name → entry dict."""
    combined: dict[str, dict] = {}
    if not FBORG_DIR.exists():
        return combined
    for path in sorted(FBORG_DIR.glob("*.txt")):
        file_entries = parse_fborg_file(path)
        for name, entry in file_entries.items():
            # Prefer first occurrence; record source file.
            if name not in combined:
                combined[name] = entry
    return combined


# ── PassBack loader ────────────────────────────────────────────────────────

def parse_passback() -> list[dict]:
    """Parse PassBack TSV dictionary. Returns list of {nickname, technical, uptime, downtime, dex_count}."""
    if not PB_PATH.exists():
        return []
    entries = []
    with PB_PATH.open(encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            entries.append({
                "nickname":  (row.get("Nickname(s) / Primary Name(s)") or "").strip(),
                "technical": (row.get("Technical Name(s) / Description") or "").strip(),
                "uptime":    (row.get("Uptime Component") or "").strip(),
                "downtime":  (row.get("Downtime Component") or "").strip(),
                "dex_count": (row.get("Dex Count") or "").strip(),
                "notes":     (row.get("Notes") or "").strip(),
            })
    return entries


# ── FootbagMoves loader ────────────────────────────────────────────────────

FM_ADD_RE = re.compile(r"^Adds:\s*(\d+)")


def parse_fm_file(path: Path) -> list[dict]:
    """Parse one FM file. Returns list of {name, alt, add, notation}."""
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8", errors="ignore")
    # Split into entries by double-blank-line.
    chunks = re.split(r"\n\s*\n+", text)
    entries = []
    for chunk in chunks:
        lines = [l.strip() for l in chunk.splitlines() if l.strip()]
        if not lines:
            continue
        # First line: name.
        # Look for an "Adds: N" line in the chunk.
        add_idx = None
        add_value: Optional[int] = None
        for idx, l in enumerate(lines):
            m = FM_ADD_RE.match(l)
            if m:
                add_idx = idx
                add_value = int(m.group(1))
                break
        if add_value is None:
            continue
        name = lines[0]
        alt = lines[1] if add_idx and add_idx > 1 else ""
        # Notation: first line after the Adds line that contains '>' or '(DEX)'.
        notation = ""
        for l in lines[add_idx + 1:]:
            if ">" in l or "(DEX)" in l:
                notation = l
                break
        entries.append({"name": name, "alt": alt, "add": add_value, "notation": notation})
    return entries


def parse_fm_all() -> dict[str, dict]:
    """Combine FM files into name → entry dict.

    Register both the primary name and the entry's `alt` field (FM's
    canonical alt-name; e.g. 'Atomsmasher' alt='Atomic Mirage') as
    independent lookup keys pointing at the same entry. Strips parenthetical
    qualifiers from the primary name (e.g. 'Atomic Butterfly (same side)' ->
    also matches 'Atomic Butterfly') so NAME_ALIASES need not carry
    qualifier-aware variants.
    """
    combined: dict[str, dict] = {}
    if not FM_DIR.exists():
        return combined
    for path in sorted(FM_DIR.glob("footbagmoves-*adds.txt")):
        for e in parse_fm_file(path):
            name = e["name"]
            if name and name not in combined:
                combined[name] = e
            # Register the alt-name (FM's canonical alt) as an independent key.
            alt = e.get("alt", "")
            if alt and alt not in combined:
                combined[alt] = e
            # Strip trailing parenthetical qualifier ('(same side)', '(toe set)')
            # and register the bare-name form when distinct.
            bare = re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()
            if bare and bare != name and bare not in combined:
                combined[bare] = e
    return combined


# ── Cross-source name matching ─────────────────────────────────────────────

def normalize_name(s: str) -> str:
    """Lowercase + strip + collapse whitespace + drop punctuation marks.

    Hyphens are folded to spaces so hyphenated DB canonical_name forms
    ('high-plains-drifter', 'knee-clipper') match the spaced external-source
    forms ('High Plains Drifter', 'Knee Clipper') without needing per-slug
    NAME_ALIASES entries.
    """
    s = s.lower().strip().rstrip("*").strip()
    s = re.sub(r"[.,/\\\\]", "", s)
    s = s.replace("-", " ")
    s = re.sub(r"\s+", " ", s)
    return s


def lookup_external(aliases: list[str], by_name: dict[str, dict]) -> Optional[dict]:
    """Find the first alias that matches by normalized name."""
    norm_keys = {normalize_name(k): v for k, v in by_name.items()}
    for alias in aliases:
        norm = normalize_name(alias)
        if norm in norm_keys:
            return norm_keys[norm]
    return None


def lookup_passback(aliases: list[str], pb_rows: list[dict]) -> Optional[dict]:
    """Find PassBack entry by nickname OR technical-name match.

    PB nickname column uses both ',' and '/' as alias separators
    (e.g. 'DDD/Down Double Down', 'GDLO ("gee-dee-ell-oh"), Whale Tail').
    Parenthetical qualifiers (e.g. 'Fairy (archaic)') are stripped so the
    bare folk-name participates in matching.
    """
    target_norms = {normalize_name(a) for a in aliases}
    for r in pb_rows:
        nick_parts = re.split(r"[,/]", r["nickname"])
        for raw in nick_parts:
            np = normalize_name(re.sub(r"\s*\([^)]*\)\s*", "", raw))
            if np in target_norms:
                return r
    return None


# ── Row builder ────────────────────────────────────────────────────────────

STATUS_AGREEMENT          = "agreement"
STATUS_ADD_DISAGREEMENT   = "add_disagreement"
STATUS_DOCTRINE_LOCKED    = "add_disagreement_doctrine_locked"
STATUS_FORMULA_DISAGREE   = "formula_disagreement"
STATUS_NAME_ALIAS_DIFF    = "name_alias_disagreement"
STATUS_MISSING_IFPA       = "missing_ifpa_formula"
STATUS_MISSING_EXTERNAL   = "missing_external_formula"
STATUS_UNRESOLVED         = "unresolved_red_pending"
STATUS_NOT_FOUND          = "not_found_anywhere"
STATUS_ALIAS_OF_CANONICAL = "alias_of_canonical"
STATUS_DERIVABLE_STRUCTURAL = "derivable_structural_form"
STATUS_DERIVED_ADD_MISMATCH = "derived_add_mismatch"
STATUS_WAVE2_BLOCKED_ROW = "wave2_blocked"
STATUS_CURATOR_HOLD = "curator_hold"

# Row-level holds for slugs that have no clear doctrine and shouldn't be
# flagged as missing_ifpa_formula. Each entry carries:
#   - status:  STATUS_WAVE2_BLOCKED_ROW (Red Wave 2/3 cascade) OR
#              STATUS_CURATOR_HOLD (curator-paced decision required)
#   - reason:  one-line explanation for the workbook + future curator
ROW_LEVEL_HOLDS: dict[str, dict[str, str]] = {
    # Wave 2/3-cascade holds
    "bullwhip":    {
        "status": STATUS_WAVE2_BLOCKED_ROW,
        "reason": "Red pt8 'Base trick is Gyro' pending glossary alignment; cross-references Wave 3 Q2 (spin/gyro axis) + Q6.C (down-diver-down). Structure deferred.",
    },
    "double-down": {
        "status": STATUS_WAVE2_BLOCKED_ROW,
        "reason": "No canonical row; canonicalization decision per CANONICALIZATION_POLICY §10 + Wave 2 Q4 (double operator) + Wave 3 Q6.C (Down Diver Down).",
    },
    "terrage": {
        "status": STATUS_WAVE2_BLOCKED_ROW,
        "reason": "Double Pixie tangle: source ADD=3 vs DB ADD=4; 3-audit counting-frame issue (terrage 4 / terraging 3 / terraging modifier +3); pending Wave 2 Q4 (barraging operator class) + multiplier audit MR-2d.",
    },
    # Curator-pending holds
    "jani-walker": {
        "status": STATUS_CURATOR_HOLD,
        "reason": "Red pt8 did NOT endorse fb.org 'Barraging Butterfly'; structure unresolved with no alternative proposed. Red supplement consultation needed.",
    },
    "guay": {
        "status": STATUS_CURATOR_HOLD,
        "reason": "Operational form needs curator confirmation: 'Pickup dexterity finished with an inside delay' — dex direction + terminal not pinned. Shape: TOE > {SAME|OP} IN [DEX] > OP INSIDE [DEL].",
    },
    "reaper": {
        "status": STATUS_CURATOR_HOLD,
        "reason": "Two-dex compound from clipper-stall to toe; shape clear but dex directions (in/in, in/out, out/in, out/out) not pinned. Shape: CLIP > {IN|OUT} [DEX] > {IN|OUT} [DEX] > OP TOE [DEL].",
    },
    "refraction": {
        "status": STATUS_CURATOR_HOLD,
        "reason": "Red pt6 confirmed 3 ADD + dex category but no structural decomposition; 3-ADD dex-class atom is structurally unusual (most dex atoms are 2 ADD); likely contains 2 dex segments internally.",
    },
    "datw": {
        "status": STATUS_WAVE2_BLOCKED_ROW,
        "reason": "Double Around the World abbreviation; canonicalization pending Wave 2 Q4 (double operator semantics) + multiplier audit MR-1. No DB row; modern doctrine doesn't canonicalize 'double-X' as a separate row per CANONICALIZATION_POLICY §10.",
    },
    "blistering": {
        "status": STATUS_CURATOR_HOLD,
        "reason": "Red 2026-05-15: 'Blistering = Gyro Whirling Set' — set-class descriptor, not a trick. Curator decides whether to canonicalize as set-primitive (matching pixie/fairy/atomic/quantum pattern) or remove from TRICK_LIST scope as a set-class term.",
    },
    "nuclear": {
        "status": STATUS_CURATOR_HOLD,
        "reason": "Set-primitive name (per nuclear(+2) modifier classification) without a canonical DB row. Curator decides whether to model like pixie/fairy/atomic/quantum (with DB row) or treat as modifier-prefix only.",
    },
}

# Placeholder slugs that name a derivable structural form (modifier + base
# atom) without a canonical DB row. Per multiplier doctrine + CANONICALIZATION
# _POLICY.md §10, these compositions exist as operator chains but modern
# doctrine doesn't canonicalize each one as a separate row. The derivation
# string documents the math.
DERIVABLE_STRUCTURAL_FORMS: dict[str, str] = {
    "atomic-osis":         "atomic(+1) + osis(3) = 4 ADD",
    "ducking-illusion":    "ducking(+1) + illusion(2) = 3 ADD",
    "ducking-mirage":      "ducking(+1) + mirage(2) = 3 ADD",
    "fairy-mirage":        "fairy(+1) + mirage(2) = 3 ADD",
    "gyro-osis":           "gyro(+1) + osis(3) = 4 ADD",
    "gyro-whirl":          "gyro(+1) + whirl(3) = 4 ADD",
    "nuclear-mirage":      "nuclear(+2) + mirage(2) = 4 ADD",
    "paradox-illusion":    "paradox(+1) + illusion(2) = 3 ADD",
    "paradox-osis":        "paradox(+1) + osis(3) = 4 ADD",
    "pixie-butterfly":     "pixie(+1) + butterfly(2) = 3 ADD",
    "pixie-illusion":      "pixie(+1) + illusion(2) = 3 ADD",
    "pixie-mirage":        "pixie(+1) + mirage(2) = 3 ADD",
    "pixie-osis":          "pixie(+1) + osis(3) = 4 ADD",
    "pixie-whirl":         "pixie(+1) + whirl(3) = 4 ADD",
    "quantum-mirage":      "quantum(+1) + mirage(2) = 3 ADD",
    "spinning-mirage":     "spinning(+1) + mirage(2) = 3 ADD",
    "symposium-butterfly": "symposium(+1) + butterfly(2) = 3 ADD",
    "symposium-illusion":  "symposium(+1) + illusion(2) = 3 ADD",
    "symposium-osis":      "symposium(+1) + osis(3) = 4 ADD",
}

# Placeholder slugs that are doctrinally aliases of canonical DB rows.
# Workbook lists them as separate rows (per user direction: "expose the full
# active canonical surface") but they don't need their own canonicalization —
# their data lives on the canonical row they alias. Curator-authored map.
PLACEHOLDER_ALIASES: dict[str, str] = {
    "atomic-mirage":          "atom-smasher",        # Sprint 4: atom-smasher = atomic mirage + x-dex
    "gyro-torque":            "mobius",              # mobius chain reading 'gyro torque'
    "stepping-butterfly":     "ripwalk",             # ripwalk chain reading 'stepping butterfly'
    "stepping-paradox-whirl": "blurry-whirl",        # blurry-whirl chain reading (Red pt11)
    "reverse-mirage":         "illusion",            # Red 2026-05-11: mirage ≠ illusion (direction is structural)
    "reverse-legover":        "pickup",              # Red 2026-05-11: legover ≠ pickup
    "dlo":                    "double-leg-over",     # DLO = abbreviation for Double Leg Over
    "baroque":                "barraging-osis",      # Red 2026-05-15: Baroque (Barraging Osis) = Two dexes + Osis = 5 ADD
}

# Doctrine-locked ADD disagreements (curator + Red have settled the doctrine
# even though external sources publish a different ADD). Distinct from open
# add_disagreement (which awaits curator review). Adding a slug here closes
# the discrepancy as workbook-resolved without changing the IFPA ADD or
# suppressing the discrepancy data.
DOCTRINE_LOCKED_DISAGREEMENTS: dict[str, str] = {
    "atom-smasher": "Red 2026-05-15: Atom Smasher carries x-dex/paradox-like contribution from toe; IFPA=4 vs FM=3 doctrinally settled at IFPA=4 (Sprint 4 resolved formula).",
    "rake":         "Curator-locked 2026-05-19 swing-element doctrine: rake = swing(1) + toe(1) = 2 ADD (Sprint 6 resolved formula). FootbagMoves lists rake at 3 ADD; IFPA value locked at 2 — Red review pending but workbook treats as doctrine-locked at IFPA value.",
}

# Per-field status enum (workbook coverage gate; curator direction 2026-05-19).
# Every workbook value field gets a status flag. Filterable/sortable for
# governance review.
FIELD_PRESENT        = "present"
FIELD_MISSING        = "missing"
FIELD_NOT_APPLICABLE = "not_applicable"
FIELD_UNRESOLVED     = "unresolved"
FIELD_NEEDS_CURATOR  = "needs_curator"
FIELD_WAVE2_BLOCKED  = "wave2_blocked"
FIELD_SOURCE_ABSENT  = "source_absent"

# Non-compositional primitive slugs treated as not-applicable for
# operational/job notation. These are intrinsic body OR set primitives
# without compositional structure — typically 0-2 ADD irreducible movements.
# Originally body-primitive-only; expanded 2026-05-19 to include zero-ADD
# set primitives (pogo, rooted) per Add-Categories audit framing.
NON_COMPOSITIONAL_PRIMITIVE_SLUGS = frozenset({
    # Body primitives (intrinsic body motion; 1-2 ADD).
    "spin", "double-spin", "spyro",
    "hop-over", "walk-over",
    "flying-inside", "flying-outside",
    # Zero-ADD set primitives (no-plant / rooted set conventions; 0 ADD).
    "pogo", "rooted",
})

# Slugs flagged as Wave 2-blocked (operational/doctrinal questions pending Red
# Wave 2 adjudication). Surfaced across the 9-audit corpus (2026-05-19).
# Note: rev-up was previously listed but Sprint 3 resolved formula
# ('reverse(+0) + whirl(3) = 3 ADD') settled the decomposition; only the
# folk-distinction-from-rev-whirl question remains, which is curator-paced
# not Red-blocked. atom-smasher moved to DOCTRINE_LOCKED_DISAGREEMENTS.
WAVE2_BLOCKED_SLUGS = frozenset({
    "tomahawk",       # paradox-doctrine divergence vs modern chain reading
})


def compute_field_status(
    value: str,
    slug: str,
    *,
    source_available: bool = True,
    field_kind: str = "ifpa",
) -> str:
    """Compute per-field status enum.

    field_kind: 'ifpa' (curator-authored) / 'pb' / 'fborg' / 'fm' / 'computed'.
    source_available: whether the external source matched this row at all.

    Returns one of FIELD_* enum values.
    """
    # Wave 2-blocked rows: doctrinal questions pending Red confirmation.
    if slug in WAVE2_BLOCKED_SLUGS:
        return FIELD_WAVE2_BLOCKED if not value else FIELD_PRESENT

    # External source fields: absent source → source_absent.
    if field_kind in {"pb", "fborg", "fm"} and not source_available:
        return FIELD_SOURCE_ABSENT

    # Body primitives don't have compositional structure → notation fields N/A.
    # (Applies to job/full notation, ADD formulas — not to canonical name/aliases.)
    if slug in NON_COMPOSITIONAL_PRIMITIVE_SLUGS and field_kind == "ifpa-notation":
        return FIELD_NOT_APPLICABLE if not value else FIELD_PRESENT

    if value:
        return FIELD_PRESENT
    return FIELD_MISSING


def load_db_aliases(db_path: Path) -> dict[str, list[str]]:
    """Load aliases per trick slug from freestyle_trick_aliases."""
    if not db_path.exists():
        return {}
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    aliases_by_slug: dict[str, list[str]] = defaultdict(list)
    cur = con.execute("""
        SELECT trick_slug, alias_text
        FROM freestyle_trick_aliases
        ORDER BY trick_slug, alias_text
    """)
    for r in cur:
        aliases_by_slug[r["trick_slug"]].append(r["alias_text"])
    con.close()
    return dict(aliases_by_slug)


def load_db_modifier_links(db_path: Path) -> dict[str, list[str]]:
    """Load modifier_slug list per trick slug from freestyle_trick_modifier_links."""
    if not db_path.exists():
        return {}
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    links: dict[str, list[str]] = defaultdict(list)
    cur = con.execute("""
        SELECT trick_slug, modifier_slug
        FROM freestyle_trick_modifier_links
        ORDER BY trick_slug, modifier_slug
    """)
    for r in cur:
        links[r["trick_slug"]].append(r["modifier_slug"])
    con.close()
    return dict(links)


def load_db_modifiers(db_path: Path) -> dict[str, dict]:
    """Load modifier table — slug → {add_bonus, add_bonus_rotational, modifier_type}."""
    if not db_path.exists():
        return {}
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    result: dict[str, dict] = {}
    cur = con.execute("""
        SELECT slug, add_bonus, add_bonus_rotational, modifier_type
        FROM freestyle_trick_modifiers
    """)
    for r in cur:
        result[r["slug"]] = dict(r)
    con.close()
    return result


# Core atoms that have rotational character (used for atomic / furious +2 bonus).
# Per Add-Categories doctrine + modifier table: atomic/furious add +1 on
# non-rotational bases, +2 on rotational bases. Curator-authored.
ROTATIONAL_BASE_SLUGS = frozenset({
    "mirage", "whirl", "swirl", "osis", "torque", "blender",
    "illusion",  # mirage's reverse atom; rotational by symmetry
})

# Composite-modifier decompositions: folk-name shorthand modifier labels
# whose ADD math should derive from a multi-atom stack rather than the
# single DB row's add_bonus, scoped to a trick-slug allowlist.
#
# Red-explicit only. Red pt8 ratified 'blurry = stepping paradox' for the
# four enumerated compounds (Blurry Whirl = Stepping Paradox Whirl = 5;
# Blurry Torque = Stepping Paradox Torque = 6; Food Processor =
# Stepping Paradox Blender = 6; Blur = Stepping Paradox Mirage = 4). The
# DB modifier table preserves 'blurry' as a +1 row because chain readings,
# glossary entries, and other curator-facing surfaces still reference it
# as a single label; the decomposition runs only inside derive_add_math
# and only for the targeted trick slugs.
#
# Trick-slug allowlist is load-bearing: blurriest (= blurry barfly per DB)
# uses 'blurry' as a single +1 dex-prefix on a 2-dex barfly base, NOT as
# the two-atom stepping+paradox stack. Universal application to all
# blurry-X compounds would mis-derive blurriest.
#
# Restraint: nemesis (furious = barraging + paradox = +2) is Red-IMPLICIT
# via parallel structure and awaits explicit Red confirmation; sumo
# (nuclear composition) is the genuine open Wave 3 Q7 candidate. Neither
# lives here until curator/Red resolves them.
MODIFIER_COMPOSITIONS: dict[str, dict] = {
    "blurry": {
        "atoms": ["stepping", "paradox"],
        "targets": frozenset({
            "blur",
            "blurry-whirl",
            "blurry-torque",
            "food-processor",
        }),
    },
}


def derive_chain_reading(
    base_trick: Optional[str],
    modifier_slugs: list[str],
    db_rows: dict[str, dict],
) -> Optional[str]:
    """Derive a compositional chain reading from base + modifiers.

    Returns e.g. 'atomic butterfly' for slug=atomic-butterfly with
    base_trick=butterfly, modifier_slugs=['atomic']. Returns None when
    derivation isn't possible (missing base, missing canonical_name, etc.).
    """
    if not base_trick or not modifier_slugs:
        return None
    base_row = db_rows.get(base_trick)
    if not base_row:
        return None
    base_name = base_row.get("canonical_name") or base_trick
    parts = list(modifier_slugs) + [base_name]
    return " ".join(parts)


def derive_add_math(
    trick_slug: Optional[str],
    base_trick: Optional[str],
    modifier_slugs: list[str],
    db_rows: dict[str, dict],
    modifier_table: dict[str, dict],
) -> tuple[Optional[str], Optional[int]]:
    """Derive ADD formula derivation string + computed ADD from base+modifier stack.

    Returns (derivation_string, total_add) or (None, None) when derivation
    isn't possible. Uses rotational bonus when base is in ROTATIONAL_BASE_SLUGS.
    Expands a modifier into its atomic decomposition when the
    (modifier, trick) pair appears in MODIFIER_COMPOSITIONS.
    """
    if not base_trick or not modifier_slugs:
        return None, None
    base_row = db_rows.get(base_trick)
    if not base_row:
        return None, None
    base_add = base_row.get("adds")
    if base_add is None:
        return None, None
    try:
        base_add = int(base_add)
    except (TypeError, ValueError):
        return None, None

    is_rotational = base_trick in ROTATIONAL_BASE_SLUGS
    parts: list[str] = []
    total = base_add
    for mod_slug in modifier_slugs:
        composition = MODIFIER_COMPOSITIONS.get(mod_slug)
        if composition and trick_slug in composition["targets"]:
            atom_slugs = composition["atoms"]
        else:
            atom_slugs = [mod_slug]
        for atom_slug in atom_slugs:
            mod = modifier_table.get(atom_slug)
            if not mod:
                return None, None
            bonus = mod["add_bonus_rotational"] if is_rotational else mod["add_bonus"]
            parts.append(f"{atom_slug}(+{bonus})")
            total += bonus

    parts.append(f"{base_trick}({base_add})")
    return f"{' + '.join(parts)} = {total} ADD", total


def build_row(
    slug: str,
    db_rows: dict[str, dict],
    core_specs: dict[str, str],
    chains: dict[str, list[str]],
    resolved: dict[str, dict],
    fborg: dict[str, dict],
    pb_rows: list[dict],
    fm: dict[str, dict],
    db_aliases: dict[str, list[str]],
    db_modifier_links: dict[str, list[str]],
    modifier_table: dict[str, dict],
) -> dict:
    aliases = NAME_ALIASES.get(slug, [slug])
    db = db_rows.get(slug)

    ifpa_canonical_name   = db["canonical_name"] if db else ""
    # Aliases column: pipe-joined alias_text list from DB.
    aliases_list = db_aliases.get(slug, [])
    ifpa_aliases = " | ".join(aliases_list)
    # Family column: trick_family from DB (curator-authored taxonomy).
    ifpa_family = (db["trick_family"] if db and db.get("trick_family") else "")
    # Compact notation = first chain reading (compositional shorthand) when
    # available; falls back to DB.notation (curator-authored compact form
    # like 'PIXIE' / 'STEPPING PARADOX MIRAGE') when no chain reading exists;
    # finally falls back to derivation from base_trick + modifier_links (e.g.
    # base=butterfly + modifiers=[atomic] → 'atomic butterfly'). Curator
    # workbook fix 2026-05-19: surface DB.notation + derive from modifier
    # stack to lift false-negative compact_status=missing on derivable rows.
    chain_readings = chains.get(slug, [])
    modifier_slugs = db_modifier_links.get(slug, [])
    if chain_readings:
        ifpa_compact_notation = chain_readings[0]
    elif db and db.get("notation"):
        ifpa_compact_notation = db["notation"]
    else:
        derived = derive_chain_reading(
            db.get("base_trick") if db else None,
            modifier_slugs,
            db_rows,
        )
        ifpa_compact_notation = derived if derived else ""
    # Full movement formula = curator-authored op-notation for atoms;
    # DB operational_notation column otherwise.
    ifpa_full_formula = core_specs.get(slug) or (db["operational_notation"] if db and db.get("operational_notation") else "")
    # Job-style operational notation = Ben Job 1995 grammar form (distinct
    # from ATAM full formula). Curator-paced authoring; mostly empty initially.
    # No source layer currently authors Job-style; leave blank pending
    # curator decision per job_glossary_integration_plan.md.
    ifpa_job_notation = ""
    # ADD formula = curator-published derivation (Sprint resolved formula)
    # when settled; falls back to runtime derivation from base_trick +
    # modifier_links + modifier table when not authored. Sprint formulas
    # take precedence (they carry curator-authored doctrine + nuance like
    # x-dex contributions); derivation is the modifier-stack fallback.
    resolved_entry = resolved.get(slug)
    if resolved_entry:
        ifpa_add_formula  = resolved_entry["derivation"]
        ifpa_computed_add = str(resolved_entry["totalAdd"])
    else:
        derived_formula, derived_total = derive_add_math(
            slug,
            db.get("base_trick") if db else None,
            modifier_slugs,
            db_rows,
            modifier_table,
        )
        ifpa_add_formula  = derived_formula if derived_formula else ""
        ifpa_computed_add = str(derived_total) if derived_total is not None else ""
    ifpa_official_add = (db["adds"] if db and db.get("adds") is not None else "")

    # External lookups.
    fborg_entry = lookup_external(aliases, fborg)
    fm_entry    = lookup_external(aliases, fm)
    pb_entry    = lookup_passback(aliases, pb_rows)

    fborg_formula = fborg_entry["notation"] if fborg_entry else ""
    fborg_add     = str(fborg_entry["add"]) if fborg_entry else ""
    fm_formula    = fm_entry["notation"] if fm_entry else ""
    fm_add        = str(fm_entry["add"]) if fm_entry else ""
    pb_formula    = pb_entry["technical"] if pb_entry else ""
    # PB does not publish ADD directly; its "Dex Count" is structural, not
    # canonical ADD. Leave pb_add blank by design; record the dex count in
    # the discrepancy notes for transparency.
    pb_add = ""

    # Status computation.
    notes: list[str] = []
    action: list[str] = []
    external_adds_present = [a for a in [fborg_add, fm_add] if a]

    if slug in ROW_LEVEL_HOLDS:
        # Slug is on the row-level hold registry. Override default
        # missing_ifpa_formula classification with the explicit hold status +
        # reason. Each hold entry documents the blocking condition (Wave 2/3
        # cascade, Red declined, or curator-paced structural decision).
        hold = ROW_LEVEL_HOLDS[slug]
        status = hold["status"]
        notes.append(f"row-level hold: {hold['reason']}")
        action.append("no action — see hold reason; pending curator/Red decision")
    elif not db and slug in PLACEHOLDER_ALIASES:
        # Placeholder slug is a doctrinally-confirmed alias of a canonical row.
        # The canonical row holds the data; this placeholder exists only to
        # surface the external-source naming.
        status = STATUS_ALIAS_OF_CANONICAL
        notes.append(f"placeholder slug — alias of canonical '{PLACEHOLDER_ALIASES[slug]}'")
        action.append(f"no action — see canonical row '{PLACEHOLDER_ALIASES[slug]}'")
    elif not db and slug in DERIVABLE_STRUCTURAL_FORMS:
        # Placeholder slug names a derivable structural form (modifier + base).
        # Modern doctrine doesn't canonicalize each one as a separate row;
        # the derivation is documented in DERIVABLE_STRUCTURAL_FORMS.
        status = STATUS_DERIVABLE_STRUCTURAL
        notes.append(f"derivable structural form: {DERIVABLE_STRUCTURAL_FORMS[slug]}")
        action.append("no action — derivable from modifier + base; modern doctrine does not canonicalize structural-form names")
    elif not db and not fborg_entry and not pb_entry and not fm_entry:
        status = STATUS_NOT_FOUND
        notes.append("trick name not located in IFPA DB or any external source")
        action.append("confirm spelling / alias / promote to dictionary if curator-confirmed")
    elif not db:
        status = STATUS_MISSING_IFPA
        notes.append("no active IFPA row; external sources may describe a community-named trick not yet canonicalized")
        action.append("curator decision: canonicalize or document as observational")
    elif slug in NON_COMPOSITIONAL_PRIMITIVE_SLUGS or (db and db.get("category") == "modifier"):
        # Non-compositional primitive rows (body primitives + zero-ADD set
        # primitives) OR DB-category='modifier' rows (operator-layer storage
        # for barraging / blazing / ducking / gyro / miraging / paradox /
        # spinning / stepping / swirling / tapping / terraging / whirling /
        # illusioning / etc.) have no compositional structure; operational/
        # compact notation is not_applicable, not missing. Defer to
        # external-coverage check if external sources match; else treat as
        # agreement-by-omission (the row's IFPA ADD or modifier identity is
        # canonical even without notation fields).
        if external_adds_present and ifpa_official_add:
            ifpa_n = str(ifpa_official_add)
            diffs = [a for a in external_adds_present if a != ifpa_n]
            if diffs:
                status = STATUS_ADD_DISAGREEMENT
                notes.append(f"ADD disagreement — IFPA={ifpa_n}; external={external_adds_present}")
                action.append("review ADD discrepancy with curator/Red")
            else:
                status = STATUS_AGREEMENT
        else:
            status = STATUS_AGREEMENT
        note_kind = "modifier-as-trick row" if (db and db.get("category") == "modifier") else "body primitive"
        notes.append(f"{note_kind} — notation fields not_applicable")
    elif not ifpa_full_formula and not ifpa_compact_notation:
        # Row-level missing check uses ifpa_compact_notation (chain reading OR
        # DB.notation fallback) rather than chain_readings alone, so set
        # primitives + surface stalls with DB.notation aren't false-flagged.
        status = STATUS_MISSING_IFPA
        notes.append("IFPA row active but no operational notation + no compact notation")
        action.append("author compact + full formula for this row")
    elif not (fborg_entry or fm_entry or pb_entry):
        status = STATUS_MISSING_EXTERNAL
        notes.append("IFPA covers this trick but no external source matched on common aliases")
        action.append("verify alias list / spelling against external sources")
    elif external_adds_present and ifpa_official_add:
        # Compare adds.
        ifpa_n = str(ifpa_official_add)
        diffs = [a for a in external_adds_present if a != ifpa_n]
        if diffs:
            if slug in DOCTRINE_LOCKED_DISAGREEMENTS:
                status = STATUS_DOCTRINE_LOCKED
                notes.append(f"ADD disagreement — IFPA={ifpa_n}; external={external_adds_present} (doctrine-locked at IFPA value)")
                action.append("no action — doctrine-locked")
            else:
                status = STATUS_ADD_DISAGREEMENT
                notes.append(f"ADD disagreement — IFPA={ifpa_n}; external={external_adds_present}")
                action.append("review ADD discrepancy with curator/Red")
        else:
            status = STATUS_AGREEMENT
    else:
        status = STATUS_AGREEMENT

    # Derivation-vs-official ADD mismatch detection. Surfaces rows where the
    # modifier-stack derivation produces a different ADD than the curator-
    # locked official value — e.g., blurry compounds where blurry=+1 modifier
    # math diverges from official ADD because blurry structurally adds +2
    # (stepping+paradox per Red pt11). This signals a counting-frame doctrine
    # question. Applied AFTER agreement/disagreement check; promotes
    # STATUS_AGREEMENT to STATUS_DERIVED_ADD_MISMATCH when relevant.
    if (
        status == STATUS_AGREEMENT
        and not resolved_entry  # Sprint formulas are curator-locked; trust them
        and ifpa_computed_add
        and ifpa_official_add
        and str(ifpa_computed_add) != str(ifpa_official_add)
    ):
        status = STATUS_DERIVED_ADD_MISMATCH
        notes.append(
            f"derivation-vs-official mismatch: derived={ifpa_computed_add} "
            f"vs official={ifpa_official_add} — counting-frame doctrine question"
        )
        action.append("review derivation vs official ADD with curator/Red")

    # Companion notes seeded for specific cases.
    companion_notes: dict[str, str] = {
        "rake":         "Companion to 'pendulum' — check whether external sources treat them as same or distinct.",
        "pendulum":     "Companion to 'rake' — see rake row for paired discrepancy.",
        "orbit":        "Documented as 'reverse around-the-world'; pending DB canonicalization (no active row expected).",
        "rev-up":       "Sprint 3 resolved formula: reverse(+0) + whirl(3) = 3 ADD. Chain reading 'reverse whirl' (shared with rev-whirl per Sprint 3 doctrine). Folk-name distinction preserved at canonical row level; in UNRESOLVED_COMPOUNDS for self-bucket family override 2026-05-19.",
        "rev-whirl":    "Sprint 3 resolved formula: reverse(+0) + whirl(3) = 3 ADD. Chain reading 'reverse whirl'. Curator 2026-05-19: 'reverse whirl == whip' — whip preserved as DB alias. Stage A sibling family anchor (Slice J 2026-05-16).",
        "torque":       "Curator chain reading 'miraging osis'. Compare with mobius (gyro torque).",
        "mobius":       "Curator chain reading 'gyro torque'. Cross-check with torque row.",
        "eggbeater":    "Folk-named; check decomposition agreement across PB/FM/footbag.org.",
        "paradox-mirage": "+1 operator stack settled per RESOLVED_ADD_FORMULAS.",
        "paradox-symposium-whirl": "Multi-operator chain; +1+1 stack on whirl (Sprint 2).",
        "symposium-whirl": "Compare with paradox-symposium-whirl decomposition.",
        "smear":        "Sprint 3 resolution: PIX + MIRAGE.",
        "ripwalk":      "Sprint 3 resolution: STEP + BUTTERFLY (operator-board lede).",
        "blurry-whirl": "Red 2026-05-15: Blurry Whirl = Stepping Paradox Whirl = 5 ADD.",
        "blurry-torque":"Red 2026-05-15: Blurry Torque = Stepping Paradox Torque = 6 ADD.",
        "food-processor":"Red 2026-05-15: Food Processor = Stepping Paradox Blender = 6 ADD.",
        "atom-smasher": "Red 2026-05-15: Atom Smasher carries X-dex like paradox from a toe.",
        "double-spin":  "2026-05-19 emergency slice added to freestyleTrickKindOverrides.ts: filtered from canonical TRICK browse views (ADD / family / movement-system / topology / category); DB row stays active for operator-layer surfaces (glossary / movement-system as modifier). Body primitive per CANONICALIZATION_POLICY.md §C + §10 (Red pt3 stabilized); does not require operational notation.",
        "tomahawk":     "Pre-Red sweep 2026-05-16 removed UNRESOLVED_COMPOUNDS pill; FM='Ducking Paradox Whirl', PB='Clipper Ducking far Whirl'.",
    }
    if slug in companion_notes:
        notes.append(f"COMPANION: {companion_notes[slug]}")

    if pb_entry and pb_entry.get("dex_count"):
        notes.append(f"pb_dex_count={pb_entry['dex_count']}")

    # Per-field status computation. Each value field gets an explicit enum
    # (present / missing / not_applicable / unresolved / needs_curator /
    # wave2_blocked / source_absent). Curator direction 2026-05-19: workbook
    # is governance gate — no blank should be ambiguous.
    name_status         = compute_field_status(ifpa_canonical_name, slug)
    aliases_status      = compute_field_status(ifpa_aliases, slug)
    family_status       = compute_field_status(ifpa_family, slug)
    compact_status      = compute_field_status(ifpa_compact_notation, slug, field_kind="ifpa-notation")
    full_status         = compute_field_status(ifpa_full_formula, slug, field_kind="ifpa-notation")
    job_status          = (
        FIELD_NOT_APPLICABLE if slug in NON_COMPOSITIONAL_PRIMITIVE_SLUGS
        else (FIELD_PRESENT if ifpa_job_notation else FIELD_NEEDS_CURATOR)
    )
    add_formula_status  = compute_field_status(ifpa_add_formula, slug, field_kind="ifpa-notation")
    computed_add_status = compute_field_status(ifpa_computed_add, slug, field_kind="computed")
    official_add_status = compute_field_status(ifpa_official_add, slug)
    # External-source status: present when the source's entry was matched
    # AND provides at least one usable data field (formula OR add). Reflects
    # source COVERAGE of this row, not just notation publication. FM in
    # particular publishes ADD claims without operational notation; treating
    # those rows as 'source_absent' was a false negative. Curator fix 2026-05-19.
    def source_status(entry_matched: bool, *fields: str) -> str:
        if slug in WAVE2_BLOCKED_SLUGS and not entry_matched:
            return FIELD_WAVE2_BLOCKED
        if not entry_matched:
            return FIELD_SOURCE_ABSENT
        if any(fields):
            return FIELD_PRESENT
        return FIELD_MISSING
    pb_status    = source_status(bool(pb_entry), pb_formula, pb_add,
                                 pb_entry.get("nickname", "") if pb_entry else "")
    fborg_status = source_status(bool(fborg_entry), fborg_formula, fborg_add)
    fm_status    = source_status(bool(fm_entry), fm_formula, fm_add)

    return {
        "slug":                   slug,
        "ifpa_canonical_name":    ifpa_canonical_name,
        "name_status":            name_status,
        "ifpa_aliases":           ifpa_aliases,
        "aliases_status":         aliases_status,
        "ifpa_family":            ifpa_family,
        "family_status":          family_status,
        "ifpa_compact_notation":  ifpa_compact_notation,
        "compact_status":         compact_status,
        "ifpa_full_formula":      ifpa_full_formula,
        "full_status":            full_status,
        "ifpa_job_notation":      ifpa_job_notation,
        "job_status":             job_status,
        "ifpa_add_formula":       ifpa_add_formula,
        "add_formula_status":     add_formula_status,
        "ifpa_computed_add":      ifpa_computed_add,
        "computed_add_status":    computed_add_status,
        "ifpa_official_add":      ifpa_official_add,
        "official_add_status":    official_add_status,
        "pb_formula":             pb_formula,
        "pb_add":                 pb_add,
        "pb_status":              pb_status,
        "fborg_formula":          fborg_formula,
        "fborg_add":               fborg_add,
        "fborg_status":           fborg_status,
        "fm_formula":             fm_formula,
        "fm_add":                  fm_add,
        "fm_status":              fm_status,
        "status":                 status,
        "discrepancy_notes":      " | ".join(notes),
        "curator_action":         " | ".join(action),
    }


# ── CSV + summary writers ──────────────────────────────────────────────────

CSV_COLUMNS = [
    "slug",
    "ifpa_canonical_name",
    "name_status",
    "ifpa_aliases",
    "aliases_status",
    "ifpa_family",
    "family_status",
    "ifpa_compact_notation",
    "compact_status",
    "ifpa_full_formula",
    "full_status",
    "ifpa_job_notation",
    "job_status",
    "ifpa_add_formula",
    "add_formula_status",
    "ifpa_computed_add",
    "computed_add_status",
    "ifpa_official_add",
    "official_add_status",
    "pb_formula",
    "pb_add",
    "pb_status",
    "fborg_formula",
    "fborg_add",
    "fborg_status",
    "fm_formula",
    "fm_add",
    "fm_status",
    "status",
    "discrepancy_notes",
    "curator_action",
]


def write_csv(rows: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def write_summary(rows: list[dict], path: Path) -> None:
    by_status: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_status[r["status"]].append(r)

    lines: list[str] = []
    lines.append("# Trick Notation + ADD Reconciliation Summary")
    lines.append("")
    lines.append(f"Source CSV: `legacy_data/reports/trick_reconciliation.csv` ({len(rows)} rows)")
    lines.append("")
    lines.append("Generated by `legacy_data/scripts/build_trick_reconciliation_workbook.py`. Reconciliation worksheet only; does NOT publish external formulas as IFPA truth; does NOT canonicalize new tricks.")
    lines.append("")

    lines.append("## Status distribution")
    lines.append("")
    lines.append("| Status | Count |")
    lines.append("|---|---:|")
    for status in sorted(by_status.keys()):
        lines.append(f"| `{status}` | {len(by_status[status])} |")
    lines.append("")

    # Top discrepancies — ADD disagreements first, then formula/missing-external.
    lines.append("## Top discrepancies")
    lines.append("")
    top_discrepancies = (
        by_status.get(STATUS_ADD_DISAGREEMENT, [])
        + by_status.get(STATUS_FORMULA_DISAGREE, [])
        + by_status.get(STATUS_NAME_ALIAS_DIFF, [])
    )
    if not top_discrepancies:
        lines.append("_None surfaced this pass._")
    else:
        lines.append("| Slug | Status | IFPA ADD | fborg ADD | FM ADD | Notes |")
        lines.append("|---|---|---|---|---|---|")
        for r in top_discrepancies[:30]:
            notes_short = r["discrepancy_notes"][:80]
            lines.append(f"| `{r['slug']}` | {r['status']} | {r['ifpa_official_add']} | {r['fborg_add']} | {r['fm_add']} | {notes_short} |")
    lines.append("")

    # Missing-IFPA rows.
    lines.append("## Missing IFPA formula (curator-author queue)")
    lines.append("")
    missing_ifpa = by_status.get(STATUS_MISSING_IFPA, [])
    if not missing_ifpa:
        lines.append("_None surfaced this pass._")
    else:
        for r in missing_ifpa:
            lines.append(f"- **`{r['slug']}`** — {r['discrepancy_notes']}")
            if r["curator_action"]:
                lines.append(f"  - Action: {r['curator_action']}")
    lines.append("")

    # Missing-external (IFPA row exists but no external match).
    lines.append("## Missing external coverage")
    lines.append("")
    missing_ext = by_status.get(STATUS_MISSING_EXTERNAL, [])
    if not missing_ext:
        lines.append("_None._")
    else:
        for r in missing_ext:
            lines.append(f"- `{r['slug']}` — {r['ifpa_canonical_name']}")
    lines.append("")

    # Not found anywhere.
    not_found = by_status.get(STATUS_NOT_FOUND, [])
    if not_found:
        lines.append("## Not found in any source (likely alias/spelling drift)")
        lines.append("")
        for r in not_found:
            lines.append(f"- `{r['slug']}`")
        lines.append("")

    # Companion-note callouts surfaced from the brief.
    lines.append("## Companion-note callouts")
    lines.append("")
    for slug in ["rake", "pendulum", "orbit", "rev-up", "rev-whirl",
                 "torque", "mobius", "eggbeater", "paradox-mirage",
                 "paradox-symposium-whirl", "atom-smasher", "double-spin"]:
        match = next((r for r in rows if r["slug"] == slug), None)
        if not match:
            continue
        lines.append(f"### {slug}")
        lines.append("")
        lines.append(f"- IFPA name: `{match['ifpa_canonical_name'] or '—'}`")
        lines.append(f"- IFPA compact: `{match['ifpa_compact_notation'] or '—'}`")
        lines.append(f"- IFPA formula: `{match['ifpa_full_formula'] or '—'}`")
        lines.append(f"- IFPA ADD: `{match['ifpa_official_add'] or '—'}`")
        lines.append(f"- PB formula: `{match['pb_formula'] or '—'}`")
        lines.append(f"- fborg formula: `{match['fborg_formula'] or '—'}` ({match['fborg_add'] or '—'} ADD)")
        lines.append(f"- FM formula: `{match['fm_formula'] or '—'}` ({match['fm_add'] or '—'} ADD)")
        lines.append(f"- Status: **{match['status']}**")
        if match["discrepancy_notes"]:
            lines.append(f"- Notes: {match['discrepancy_notes']}")
        lines.append("")

    # Curator review queue.
    lines.append("## Curator review queue (prioritized)")
    lines.append("")
    priority_buckets = [
        ("ADD disagreements",          by_status.get(STATUS_ADD_DISAGREEMENT, [])),
        ("Missing IFPA formula",       missing_ifpa),
        ("Formula disagreements",      by_status.get(STATUS_FORMULA_DISAGREE, [])),
        ("Name/alias disagreements",   by_status.get(STATUS_NAME_ALIAS_DIFF, [])),
        ("Not found anywhere",         not_found),
    ]
    queue_idx = 1
    for bucket_name, bucket_rows in priority_buckets:
        if not bucket_rows:
            continue
        lines.append(f"### {bucket_name} ({len(bucket_rows)})")
        lines.append("")
        for r in bucket_rows:
            lines.append(f"{queue_idx}. **`{r['slug']}`** — {r['curator_action'] or r['discrepancy_notes']}")
            queue_idx += 1
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("**Constraints honored:**")
    lines.append("- No canonicalization of new tricks from this workbook.")
    lines.append("- No external formula adopted as IFPA truth.")
    lines.append("- No doctrine resolution automated.")
    lines.append("- This worksheet is read-only audit input for curator triage.")
    lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")


# ── Main ───────────────────────────────────────────────────────────────────

def main() -> int:
    db_rows         = load_ifpa_db_rows()
    db_aliases      = load_db_aliases(DB_PATH)
    db_modifier_links = load_db_modifier_links(DB_PATH)
    modifier_table  = load_db_modifiers(DB_PATH)
    core_specs      = load_core_trick_spec()
    chains      = load_symbolic_equivalences()
    resolved    = load_resolved_formulas()
    fborg       = parse_fborg_all()
    pb_rows     = parse_passback()
    fm          = parse_fm_all()

    # Per curator direction 2026-05-19: workbook becomes the governance gate.
    # Scope = ALL active canonical DB rows (was previously curated TRICK_LIST
    # subset). Union with TRICK_LIST to preserve placeholder slugs for
    # not-yet-canonical names (e.g., 'reverse-mirage', 'pixie-mirage') that
    # surface from external sources.
    all_active_slugs = set(db_rows.keys())
    placeholder_slugs = set(TRICK_LIST) - all_active_slugs
    full_scope = sorted(all_active_slugs | placeholder_slugs)

    rows = [
        build_row(slug, db_rows, core_specs, chains, resolved, fborg, pb_rows, fm,
                  db_aliases, db_modifier_links, modifier_table)
        for slug in full_scope
    ]

    write_csv(rows, OUT_CSV)
    write_summary(rows, OUT_MD)

    # Console summary.
    from collections import Counter
    status_counts = Counter(r["status"] for r in rows)
    print(f"Reconciliation workbook written: {OUT_CSV}")
    print(f"Summary report written:           {OUT_MD}")
    print()
    print(f"Total tricks reconciled: {len(rows)}")
    print(f"  Active DB rows:        {len(all_active_slugs)}")
    print(f"  Placeholder slugs:     {len(placeholder_slugs)}")
    print("Status distribution:")
    for status in sorted(status_counts.keys()):
        print(f"  {status:30s} {status_counts[status]:>3}")
    print()
    # Per-field status distribution (workbook coverage gate).
    print("Per-field status distribution:")
    field_status_cols = [
        "name_status", "aliases_status", "family_status",
        "compact_status", "full_status", "job_status",
        "add_formula_status", "computed_add_status", "official_add_status",
        "pb_status", "fborg_status", "fm_status",
    ]
    for col in field_status_cols:
        col_counts = Counter(r[col] for r in rows)
        coverage = col_counts.get(FIELD_PRESENT, 0)
        total = len(rows)
        pct = (100 * coverage / total) if total else 0
        print(f"  {col:24s} {coverage:>3}/{total} present ({pct:.0f}%)")
    print()
    print(f"IFPA DB active rows loaded:        {len(db_rows)}")
    print(f"IFPA DB aliases loaded:            {sum(len(v) for v in db_aliases.values())} ({len(db_aliases)} tricks)")
    print(f"IFPA core-trick spec entries:      {len(core_specs)}")
    print(f"IFPA chain readings loaded:        {len(chains)}")
    print(f"IFPA resolved-formula entries:     {len(resolved)}")
    print(f"footbag.org entries parsed:        {len(fborg)}")
    print(f"PassBack entries parsed:           {len(pb_rows)}")
    print(f"FootbagMoves entries parsed:       {len(fm)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

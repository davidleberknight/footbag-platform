"""
Wave 0 — Reconciliation expansion extractor (READ-ONLY).

Walks the source corpora (footbagmoves-*.txt, passback-dicrionary.txt,
pb-dict2.txt) and produces:

  - corpus_names_all.csv    — every name extracted, with source attribution
  - reconciliation_index.csv — every name currently in RECONCILIATION.csv
  - corpus_delta.csv        — corpus names NOT in reconciliation
                              (the W0 promotion-to-state-3 candidate list)
  - summary.txt             — per-source counts + delta size

No writes to RECONCILIATION.csv. No writes to DB. Pure diff.

Run from repo root:
  python3 exploration/wave0-reconciliation-expansion-2026-05-26/extract_corpus_names.py
"""
from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CORPUS_DIR = REPO_ROOT / "legacy_data/inputs/curated/tricks"
RECON_CSV = REPO_ROOT / "exploration/vocabulary-reconciliation-audit-2026-05-21/RECONCILIATION.csv"
OUT_DIR = Path(__file__).resolve().parent

# Files to extract names from. (path-relative-to-repo-root, parser-kind, source-label).
# Most paths are relative to legacy_data/inputs/curated/tricks/; fborg paths
# resolve under exploration/fborg/.
SOURCES = [
    # FootbagMoves corpus.
    ("legacy_data/inputs/curated/tricks/footbagmoves-3adds.txt",   "fm",       "footbagmoves"),
    ("legacy_data/inputs/curated/tricks/footbagmoves-3-4adds.txt", "fm",       "footbagmoves"),
    ("legacy_data/inputs/curated/tricks/footbagmoves-4adds.txt",   "fm",       "footbagmoves"),
    ("legacy_data/inputs/curated/tricks/footbagmoves-5adds.txt",   "fm",       "footbagmoves"),
    ("legacy_data/inputs/curated/tricks/footbagmoves-5-6adds.txt", "fm",       "footbagmoves"),
    ("legacy_data/inputs/curated/tricks/footbagmoves-sample.txt",  "fm",       "footbagmoves"),
    # PassBack corpus.
    ("legacy_data/inputs/curated/tricks/passback-dicrionary.txt",  "pb_dict",  "passback"),
    ("legacy_data/inputs/curated/tricks/pb-dict2.txt",             "pb_dict2", "passback"),
    # Footbag.org corpus — ADD-bucketed move lists.
    ("exploration/fborg/fborg-1add.txt",                           "fborg_ad", "fborg"),
    ("exploration/fborg/fborg-2add.txt",                           "fborg_ad", "fborg"),
    ("exploration/fborg/fborg-3add.txt",                           "fborg_ad", "fborg"),
    ("exploration/fborg/fborg-4add.txt",                           "fborg_ad", "fborg"),
    ("exploration/fborg/fborg-5add.txt",                           "fborg_ad", "fborg"),
    ("exploration/fborg/fborg-6add.txt",                           "fborg_ad", "fborg"),
    ("exploration/fborg/fborg-7add.txt",                           "fborg_ad", "fborg"),
    # Footbag.org corpus — family / topic move lists (same format as fborg-Nadd).
    ("exploration/fborg/paradoxMoves.txt",                         "fborg_ad", "fborg"),
    ("exploration/fborg/pixieMoves.txt",                           "fborg_ad", "fborg"),
    ("exploration/fborg/gyroMoves.txt",                            "fborg_ad", "fborg"),
    ("exploration/fborg/blurryMoves.txt",                          "fborg_ad", "fborg"),
    ("exploration/fborg/fundamentalmoves.txt",                     "fborg_ad", "fborg"),
    ("exploration/fborg/moves-on-video.txt",                       "fborg_ad", "fborg"),
    ("exploration/fborg/paradox-tutorial.txt",                     "fborg_ad", "fborg"),
    # Footbag.org corpus — sets files (Name: notation colon format).
    ("exploration/fborg/footbag-sets-fborg.txt",                   "fborg_sets", "fborg"),
    ("exploration/fborg/chrisHoldenSets.txt",                      "fborg_sets", "fborg"),
    # Stanford shorthand corpus — Ben Lynn's compact notation list.
    ("exploration/stanford/stanford-2.txt",                        "stanford",   "stanford"),
]

# Excluded files (reference docs / token dictionaries, not name lists):
#   exploration/fborg/JobsNotation.txt
#   exploration/fborg/Add-Categories-move-elements.txt
#   exploration/stanford/stanford-1.txt  — shorthand token dictionary, not a trick list

# Files explicitly EXCLUDED with reason:
#   passback-glossary.txt    — glossary terms, not trick names
#   passback-media.txt       — media inventory, not trick names
#   red-correction-*.txt     — Red rulings, not name lists
#   red_corrections_*.csv    — schema corrections
#   red_additions_*.csv      — already in DB / promoted
#   external_name_mappings.csv      — name-mapping table
#   fm_alias_terminology_extract.csv — alias mapping

# ── Normalization ───────────────────────────────────────────────────────

ADDS_RE = re.compile(r"^Adds:\s+\d+\s*$")
WHITESPACE_RE = re.compile(r"\s+")


QUOTE_CHARS = '"\'“”‘’`'


def normalize(name: str) -> str:
    """Case-insensitive, whitespace-collapsed, quote-stripped key for diffing.

    Equates:
      "Around the World" ≡ "around the world" ≡ "around-the-world"
      'double-dex "Pixie"' ≡ "double dex pixie"
    """
    n = name.strip().lower()
    for q in QUOTE_CHARS:
        n = n.replace(q, "")
    n = n.replace("-", " ")
    n = WHITESPACE_RE.sub(" ", n)
    return n.strip()


# ── Per-format parsers ─────────────────────────────────────────────────

def parse_fm(path: Path) -> list[str]:
    """FM format:

        TrickName
        OptionalAltReading
        Adds: N

        notation chain (or "No Video Available")

    Strategy: every line that ends with "Adds: N" tells us the line(s)
    above it are names. Take the line immediately above. Optionally take
    the line two above (alt reading) — those are real folk/structural
    names too.

    Skips the boilerplate top of each file (Search / Min-Adds / etc.).
    """
    names: list[str] = []
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    for i, line in enumerate(lines):
        if not ADDS_RE.match(line):
            continue
        # Walk backward, collecting non-empty non-boilerplate lines until
        # we hit a blank or another Adds: header.
        candidates: list[str] = []
        j = i - 1
        while j >= 0:
            prev = lines[j].strip()
            if not prev:
                break
            if ADDS_RE.match(prev):
                break
            # Skip the page boilerplate that may bleed in.
            if prev in {
                "Footbag Freestyle Moves", "Search", "Search by Name...",
                "Min-Adds", "Max-Adds", "Level", "All", "Video Only",
                "No Video Available", "Showing", "of",
            }:
                break
            candidates.insert(0, prev)
            j -= 1
        # Filter: drop very long candidates (probably descriptions).
        for c in candidates:
            if 2 <= len(c) <= 80 and not c.startswith("("):
                names.append(c)
    return names


PHASE_PREFIX_RE = re.compile(r"^\((uptime|downtime|midtime)\)\s+", re.IGNORECASE)


def _split_pb_technical_col(cell: str) -> list[str]:
    """PassBack col 2 conventions:

    - Comma-separated alternatives:  "Atomic Ducking far Mirage, Alpine Atomsmasher"
    - Phase-prefix annotations:      "(downtime) Whirling Osis"
    - Embedded notation chains:      "leggy in dex>op toe"  → not a name; drop
    - Quoted folk-name highlights:   'double-dex "Pixie"'    → strip the quotes

    Returns the list of legitimate name candidates extracted from a single cell.
    """
    out: list[str] = []
    for part in cell.split(","):
        p = part.strip()
        # Strip phase prefix.
        p = PHASE_PREFIX_RE.sub("", p)
        # Strip surrounding ASCII or smart quotes used as folk-name highlights.
        p = p.strip().strip('"').strip("'").strip("“”‘’").strip()
        # Drop raw-notation alternates (they contain the `>` operator).
        if ">" in p:
            continue
        # Drop all-lowercase entries — those are structural shorthand,
        # not display names (e.g. "leggy in dex").
        if p and p == p.lower() and not any(ch.isdigit() for ch in p):
            continue
        if p and 2 <= len(p) <= 80:
            out.append(p)
    return out


def parse_pb_dict(path: Path) -> list[str]:
    """passback-dicrionary.txt — tab-separated.

      col 1 = Nickname / Primary Name  (a folk name)
      col 2 = Technical Name(s) / Description  — may be comma-separated and may
              carry (uptime)/(downtime)/(midtime) phase prefixes

    Both columns produce name candidates; first line is the header.
    """
    names: list[str] = []
    with path.open(encoding="utf-8", errors="replace") as f:
        next(f, None)  # skip header
        for line in f:
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 2:
                continue
            # Col 1: single folk name (typically clean).
            c1 = cols[0].strip()
            if c1 and 2 <= len(c1) <= 80:
                names.append(c1)
            # Col 2: structural reading(s), comma-split + phase-strip.
            names.extend(_split_pb_technical_col(cols[1]))
    return names


def parse_pb_dict2(path: Path) -> list[str]:
    """pb-dict2.txt — tab-separated footbag-trick / football-trick / notes.
    Only col 1 (footbag-trick name) is in our scope. Skip header.
    """
    names: list[str] = []
    with path.open(encoding="utf-8", errors="replace") as f:
        next(f, None)  # header
        for line in f:
            cols = line.rstrip("\n").split("\t")
            if not cols:
                continue
            c = cols[0].strip()
            # Skip symbol-only row from this dict (e.g. ">").
            if not c or len(c) < 2 or len(c) > 80:
                continue
            if c in {">", "-", "(", ")"}:
                continue
            names.append(c)
    return names


FBORG_ADDS_RE = re.compile(r"^\s*\d+\s+adds?\b", re.IGNORECASE)
BRACKET_TAG_LINE_RE = re.compile(r"^\s*(\[[a-z]+\]\s*)+$", re.IGNORECASE)
# Pronunciation guides: short, all-lowercase, no spaces, contain apostrophe
# or hyphen. e.g. "ba-razh'", "shoo-eep", "kah-thoom".
# IMPORTANT: no IGNORECASE flag. TitleCase tokens (Paratoxic, Nemesis) must
# NOT match — they're trick names, not pronunciation guides.
PRONUNCIATION_RE = re.compile(r"^[a-z'\-‘’]{2,30}$")

# Fborg page boilerplate that should never be a trick name.
FBORG_BOILERPLATE = {
    "footbag worldwide", "freestyle move list", "freestyle",
    "discover more", "footbag", "video demonstration available!",
    "no video available", "1-add moves", "2-add moves", "3-add moves",
    "4-add moves", "5-add moves", "6-add moves", "7-add moves",
    "paradox moves", "pixie moves", "gyro moves", "blurry moves",
    "fundamental moves", "video moves", "paradox tutorial",
}


def _is_fborg_boilerplate(line: str) -> bool:
    s = line.strip().lower()
    if not s:
        return True
    if s in FBORG_BOILERPLATE:
        return True
    if s.startswith("footbag worldwide"):
        return True
    if s.startswith("footbag worldwide:"):
        return True
    return False


def _is_bracket_tag_line(line: str) -> bool:
    return bool(BRACKET_TAG_LINE_RE.match(line.strip()))


def _is_notation_line(line: str) -> bool:
    """Lines that contain JOB notation (uppercase tokens, `>` chains).

    Examples: 'SET > OP IN [DEX] > OP TOE [DEL]', 'CLIP > SAME OUT [DEX] >'.
    """
    s = line.strip()
    if not s:
        return False
    if ">" not in s:
        return False
    # Heuristic: notation lines have uppercase tokens and > separators; the
    # trick name is mostly title-case. A line with > and uppercase letters
    # and brackets is almost certainly notation.
    return True


def _is_pronunciation(line: str) -> bool:
    """A pronunciation guide is all-lowercase, no spaces, contains an
    apostrophe or hyphen (so trick names that happen to be a single
    lowercase word — unusual but possible — don't get suppressed)."""
    s = line.strip()
    if not s or " " in s:
        return False
    if not PRONUNCIATION_RE.match(s):
        return False
    return any(ch in s for ch in "'-‘’")


def parse_fborg_ad(path: Path) -> list[str]:
    """fborg ADD-bucketed move list + family move lists. Format per move:

        Name (or two-line name continuation)
        [pronunciation guide]
        N adds <tab>
        [JOB notation chain — sometimes absent on 1-add moves]
        [Description — sometimes absent on 1-add inline-form moves]

        [bracket-tag line: [dex] [del]]

    1-add inline form (everything on one line):
        Name
        1 add <tab> Description text <tab> [dex]

    Strategy: locate each `^\d+ add[s]?` line. Walk backward over non-blank
    non-boilerplate lines that are NOT pronunciation, NOT notation, NOT
    bracket-tag lines. Concatenate those (in original order) with space —
    handles the multi-line name case ("Paradox" / "Illusion" → "Paradox
    Illusion"). Strip trailing `*` footnote markers.
    """
    names: list[str] = []
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    for i, line in enumerate(lines):
        if not FBORG_ADDS_RE.match(line):
            continue
        # Walk backward, collecting candidate name fragments.
        candidates: list[str] = []
        j = i - 1
        while j >= 0:
            prev = lines[j].rstrip()
            stripped = prev.strip()
            if not stripped:
                break
            if FBORG_ADDS_RE.match(stripped):
                break
            if _is_fborg_boilerplate(stripped):
                # Boilerplate ends the name-fragment chain.
                break
            if _is_notation_line(stripped):
                # Notation lines belong to the PREVIOUS entry's body, not
                # to the trick name. Stop here.
                break
            if _is_bracket_tag_line(stripped):
                # Bracket-tag line — also belongs to the previous entry.
                break
            if _is_pronunciation(stripped):
                # Skip but continue walking; the name is one line further up.
                j -= 1
                continue
            # Cap the search: don't collect 5+ lines (prose runs).
            if len(candidates) >= 3:
                break
            # Strip leading/trailing footnote markers.
            stripped = stripped.strip("*").strip()
            candidates.insert(0, stripped)
            j -= 1
        if not candidates:
            continue
        # Concatenate multi-line names with space.
        name = " ".join(candidates).strip()
        name = re.sub(r"\s+", " ", name)
        if 2 <= len(name) <= 80:
            names.append(name)
    return names


def parse_fborg_sets(path: Path) -> list[str]:
    """chrisHoldenSets.txt / footbag-sets-fborg.txt format:

        SetName: NOTATION CHAIN
        Pixie: TOE > SAME IN [DEX] >

    Some lines are section headers without notation (e.g. 'Spinning:').
    A few entries don't fit (e.g. 'Infracting: opposite of a Refraction').

    Take the substring before the FIRST colon. Skip blank lines, intro
    prose (no colon), and entries that produce empty names.
    """
    names: list[str] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if not s or ":" not in s:
            continue
        # Take everything before the first colon as the candidate name.
        name = s.split(":", 1)[0].strip()
        # Strip leading/trailing footnote markers ('*' = "tentative" in
        # Holden's compilation).
        name = name.strip("*").strip()
        if 2 <= len(name) <= 80:
            names.append(name)
    return names


# Stanford notation lines are dense with shorthand symbols (`. + - * & ! ^`)
# plus single-letter tokens and digits. A line is "Stanford notation" if it
# contains any of those Stanford-only symbols.
STANFORD_NOTATION_CHARS = set(".+-*&!^|")
STANFORD_ADD_HEADER_RE = re.compile(r"^\d+\s+ADD\s*$", re.IGNORECASE)


def parse_stanford(path: Path) -> list[str]:
    """stanford-2.txt — Ben Lynn's Stanford-shorthand list. Format:

        <ADD section header, e.g. "2 ADD">

        <notation chain, e.g. "Z.+1+Z">

        <Trick Name, e.g. "Around The World (ATW)">

        <notation chain>

        <Trick Name>

    Strategy: any line that contains a Stanford-notation symbol
    (.+-*&!^|) is notation and skipped. ADD section headers (\\d+ ADD) and
    blank lines are skipped. The remaining lines are trick names.
    """
    names: list[str] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if not s:
            continue
        if STANFORD_ADD_HEADER_RE.match(s):
            continue
        # Reject lines that contain any Stanford-only notation symbol.
        if any(ch in STANFORD_NOTATION_CHARS for ch in s):
            continue
        # Skip the file preamble (long descriptive sentences).
        if len(s) > 80:
            continue
        # Must start with a letter or digit (trick names occasionally start
        # with a digit, e.g. "84"). Length floor 2 to drop stray characters.
        if not s[0].isalnum():
            continue
        if len(s) < 2:
            continue
        names.append(s)
    return names


PARSERS = {
    "fm":         parse_fm,
    "pb_dict":    parse_pb_dict,
    "pb_dict2":   parse_pb_dict2,
    "fborg_ad":   parse_fborg_ad,
    "fborg_sets": parse_fborg_sets,
    "stanford":   parse_stanford,
}


# ── Reconciliation index ───────────────────────────────────────────────

def load_reconciliation_index() -> dict[str, str]:
    """name_normalized → display_name for everything in RECONCILIATION.csv."""
    index: dict[str, str] = {}
    with RECON_CSV.open(encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get("name") or "").strip()
            slug = (row.get("slug") or "").strip()
            if name:
                index[normalize(name)] = name
            if slug:
                index[normalize(slug)] = name or slug
    return index


# ── Main ───────────────────────────────────────────────────────────────

def main() -> None:
    recon_index = load_reconciliation_index()

    # Extract from corpora; track per-name source attribution.
    name_sources: dict[str, dict[str, set[str]]] = defaultdict(lambda: {"sources": set(), "files": set(), "raw_displays": set()})
    per_file_counts: list[tuple[str, int, int]] = []

    for rel_path, kind, source_label in SOURCES:
        path = REPO_ROOT / rel_path
        if not path.exists():
            print(f"WARN: missing {path}")
            continue
        raw_names = PARSERS[kind](path)
        unique_norm = set()
        for n in raw_names:
            norm = normalize(n)
            unique_norm.add(norm)
            name_sources[norm]["sources"].add(source_label)
            name_sources[norm]["files"].add(path.name)
            name_sources[norm]["raw_displays"].add(n)
        per_file_counts.append((path.name, len(raw_names), len(unique_norm)))

    # Compute delta: corpus names not in reconciliation.
    corpus_norms = set(name_sources.keys())
    recon_norms = set(recon_index.keys())
    delta_norms = sorted(corpus_norms - recon_norms)
    both_norms = corpus_norms & recon_norms

    # ── Write outputs ──
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # corpus_names_all.csv — every corpus name with provenance.
    with (OUT_DIR / "corpus_names_all.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["normalized", "best_display", "sources", "files", "in_reconciliation"])
        for norm in sorted(corpus_norms):
            displays = sorted(name_sources[norm]["raw_displays"])
            best = displays[0]
            srcs = "|".join(sorted(name_sources[norm]["sources"]))
            files = "|".join(sorted(name_sources[norm]["files"]))
            in_recon = "yes" if norm in recon_norms else "no"
            w.writerow([norm, best, srcs, files, in_recon])

    # reconciliation_index.csv — flat dump of recon names.
    with (OUT_DIR / "reconciliation_index.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["normalized", "display_name"])
        for norm in sorted(recon_norms):
            w.writerow([norm, recon_index[norm]])

    # corpus_delta.csv — names in corpus but not in reconciliation.
    with (OUT_DIR / "corpus_delta.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["normalized", "best_display", "sources", "files"])
        for norm in delta_norms:
            displays = sorted(name_sources[norm]["raw_displays"])
            best = displays[0]
            srcs = "|".join(sorted(name_sources[norm]["sources"]))
            files = "|".join(sorted(name_sources[norm]["files"]))
            w.writerow([norm, best, srcs, files])

    # summary.txt
    with (OUT_DIR / "summary.txt").open("w", encoding="utf-8") as f:
        f.write("Wave 0 — Reconciliation expansion summary\n")
        f.write("=" * 50 + "\n\n")
        f.write("Per-file extraction:\n")
        for filename, raw, unique in per_file_counts:
            f.write(f"  {filename:<35s}  {raw:>5d} raw  {unique:>5d} unique-after-norm\n")
        f.write("\n")
        f.write(f"Corpus total unique normalized names: {len(corpus_norms)}\n")
        f.write(f"Reconciliation index size:            {len(recon_norms)}\n")
        f.write(f"Names in BOTH:                        {len(both_norms)}\n")
        f.write(f"Delta (corpus ∖ reconciliation):      {len(delta_norms)}\n")
        f.write("\n")
        delta_by_source: dict[str, int] = defaultdict(int)
        for norm in delta_norms:
            for s in name_sources[norm]["sources"]:
                delta_by_source[s] += 1
        f.write("Delta by source attribution:\n")
        for s, c in sorted(delta_by_source.items()):
            f.write(f"  {s:<20s}  {c:>5d}\n")
        f.write("\n")
        f.write("First 30 delta entries (sample):\n")
        for norm in delta_norms[:30]:
            displays = sorted(name_sources[norm]["raw_displays"])
            f.write(f"  {displays[0]}\n")

    # Stdout summary so the runner sees it.
    print(f"Corpus unique names:    {len(corpus_norms)}")
    print(f"Reconciliation index:   {len(recon_norms)}")
    print(f"Names in both:          {len(both_norms)}")
    print(f"DELTA (to add):         {len(delta_norms)}")
    print()
    print("Outputs:")
    for p in ["corpus_names_all.csv", "reconciliation_index.csv", "corpus_delta.csv", "summary.txt"]:
        print(f"  {OUT_DIR / p}")


if __name__ == "__main__":
    main()

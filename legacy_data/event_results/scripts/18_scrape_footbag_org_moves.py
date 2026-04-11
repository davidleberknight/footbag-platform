"""
Script 18: Scrape freestyle move corpus from footbag.org (1–7 ADD).

Reads:  http://www.footbag.org/newmoves/list/{1..7}  (no auth required)
Writes:
  out/scraped_footbag_moves.csv       — full scraped corpus
  out/scraped_footbag_moves_audit.txt — comparison against current tricks.csv

Does NOT modify the database or any seed files.
Review the CSV and audit before running any load step.

Usage (from legacy_data/ with venv active):
  python event_results/scripts/18_scrape_footbag_org_moves.py
  python event_results/scripts/18_scrape_footbag_org_moves.py --delay 1.0
"""

import argparse
import csv
import html
import re
import sys
import time
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT  = SCRIPT_DIR.parents[3]
TRICKS_CSV = SCRIPT_DIR.parents[1] / "inputs" / "noise" / "tricks.csv"
OUT_DIR    = SCRIPT_DIR.parents[1] / "out"
OUT_CSV    = OUT_DIR / "scraped_footbag_moves.csv"
OUT_AUDIT  = OUT_DIR / "scraped_footbag_moves_audit.txt"

BASE_URL   = "http://www.footbag.org/newmoves/list/{}"
MOVE_URL   = "http://www.footbag.org/newmoves/showmove/{}"

# ---------------------------------------------------------------------------
# Name → slug
# ---------------------------------------------------------------------------

def name_to_slug(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


# ---------------------------------------------------------------------------
# Family/category inference from name tokens and notation tags
# ---------------------------------------------------------------------------

FAMILY_KEYWORDS = [
    # order matters — more specific first
    ("blender",    "blender"),
    ("torque",     "torque"),
    ("blurry whirl", "whirl"),
    ("symposium whirl", "whirl"),
    ("ducking whirl",   "whirl"),
    ("stepping whirl",  "whirl"),
    ("paradox whirl",   "whirl"),
    ("spinning whirl",  "whirl"),
    ("tapping whirl",   "whirl"),
    ("tomahawk",        "whirl"),
    ("rev whirl",       "whirl"),
    ("rev up",          "whirl"),
    ("reverse whirl",   "whirl"),
    ("whirl",           "whirl"),
    ("ripwalk",         "butterfly"),
    ("dimwalk",         "butterfly"),
    ("parkwalk",        "butterfly"),
    ("blurry butterfly","butterfly"),
    ("ducking butterfly","butterfly"),
    ("spinning butterfly","butterfly"),
    ("atomic butterfly", "butterfly"),
    ("butterfly",        "butterfly"),
    ("food processor",   "blender"),
    ("blurry blender",   "blender"),
    ("paradox blender",  "blender"),
    ("blurry torque",    "torque"),
    ("paradox torque",   "torque"),
    ("atomic torque",    "torque"),
    ("spinning torque",  "torque"),
    ("mobius",           "torque"),
    ("gauntlet",         "torque"),
    ("marius",           "torque"),
    ("silo",             "torque"),
    ("ducking osis",     "osis"),
    ("spinning osis",    "osis"),
    ("stepping osis",    "osis"),
    ("barraging osis",   "osis"),
    ("baroque",          "osis"),
    ("osis",             "osis"),
    ("drifter",          "clipper"),
    ("ducking clipper",  "clipper"),
    ("spinning clipper", "clipper"),
    ("weaving clipper",  "clipper"),
    ("paradox drifter",  "clipper"),
    ("clipper",          "clipper"),
    ("blur",             "mirage"),
    ("smear",            "mirage"),
    ("atom smasher",     "mirage"),
    ("atomsmasher",      "mirage"),
    ("paradox mirage",   "mirage"),
    ("mirage",           "mirage"),
    ("eggbeater",        "legover"),
    ("flurry",           "legover"),
    ("fog",              "legover"),
    ("legover",          "legover"),
    ("leg over",         "legover"),
    ("around the world", "atw"),
    ("reverse atw",      "atw"),
    ("ratw",             "atw"),
    ("datw",             "atw"),
    ("double atw",       "atw"),
]

CATEGORY_FROM_TAGS = {
    # When a notation has only [DEL] or [XBD][DEL] with no motion — base delay
    # We can't reliably derive category from tags alone; use name heuristics
}

def infer_family(name: str) -> str | None:
    lower = name.lower()
    for keyword, family in FAMILY_KEYWORDS:
        if keyword in lower:
            return family
    return None


def infer_category(name: str, tags_str: str, notation: str) -> str:
    """Rough category inference from name and notation tags."""
    lower = name.lower()
    tags  = tags_str.lower()
    # Modifier tricks — no ADD value or ADD shown as "modifier"
    modifier_names = {
        "ducking", "spinning", "paradox", "symposium", "atomic",
        "stepping", "gyro", "tapping", "blazing", "barraging",
        "weaving", "diving", "swirling", "miraging", "whirling",
        "blurry", "fairy", "pixie", "quantum", "nuclear",
    }
    if lower.strip() in modifier_names:
        return "modifier"
    # Body moves — primarily [BOD] with no [DEX]
    if "[bod]" in tags and "[dex]" not in tags and "[xbd]" not in tags:
        return "body"
    # Set moves — primarily [set] tag hint, or name contains set/fairy/pixie
    if lower in {"pixie", "fairy"}:
        return "set"
    # Unusual surface
    if "[uns]" in tags and "[dex]" not in tags:
        return "unusual"
    # Cross-body: has [xbd]
    if "[xbd]" in tags and "[dex]" not in tags and "[bod]" not in tags:
        return "dex"   # simple cross-body dex (clipper, legover)
    # Compound: has multiple elements
    if "[bod]" in tags and "[dex]" in tags:
        return "compound"
    if "[pdx]" in tags:
        return "compound"
    if "[dex]" in tags:
        return "compound"
    if "[xbd]" in tags:
        return "dex"
    return "other"


# ---------------------------------------------------------------------------
# HTML parsing helpers
# ---------------------------------------------------------------------------

def clean(text: str) -> str:
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def strip_tags(html_str: str) -> str:
    return re.sub(r"<[^>]+>", "", html_str)


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (footbag-platform research)"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode("latin-1")


# ---------------------------------------------------------------------------
# Parse one ADD-level list page
# ---------------------------------------------------------------------------

def parse_list_page(add: int, html_body: str, source_url: str) -> list[dict]:
    """
    Parse a footbag.org /newmoves/list/{add} page.

    Each trick block looks like:
      <a href=/newmoves/showmove/NNN>Trick Name</a>
      ... N adds ...
      <table bgcolor=#eeeeee ...><tr><td><font size=-1>NOTATION</font></td></tr></table>
      <p>Description text here.</p>
      ... category tags in last column ...
    """
    tricks = []

    # Split into trick blocks by horizontal rule
    blocks = re.split(r"<tr><td colspan=5><hr></td></tr>", html_body)

    for block in blocks:
        # Extract showmove link + name
        m = re.search(r'<a href=/newmoves/showmove/(\d+)>([^<]+)</a>', block)
        if not m:
            continue
        showmove_id = int(m.group(1))
        raw_name    = clean(strip_tags(m.group(2)))
        if not raw_name:
            continue
        # Skip navigation/UI artifacts that leak through the link pattern
        if re.search(r'video|demonstration|available|return to|click here', raw_name, re.I):
            continue

        # Alternative name in parentheses (e.g., "Gauntlet\n(Stepping Ducking Paradox Torque)")
        alt_name_m = re.search(r'\(([^)]+)\)', block[:500])
        alt_name   = clean(strip_tags(alt_name_m.group(1))) if alt_name_m else None
        # If alt_name looks like "N adds" discard it
        if alt_name and re.match(r'^\d+ adds?$', alt_name, re.I):
            alt_name = None

        # Notation — inside the eeeeee table
        notation_m = re.search(
            r'<table[^>]+bgcolor=#eeeeee[^>]*>.*?<font size=-1>(.*?)</font>',
            block, re.DOTALL | re.IGNORECASE,
        )
        notation = clean(strip_tags(notation_m.group(1))) if notation_m else ""

        # Category tags summary (last column — font with just [xxx] tokens)
        tags_m = re.search(r'<font size=-1>(\[(?:dex|bod|pdx|xbd|del|uns)[^\]]*\](?:\s*\[[^\]]+\])*)</font>', block)
        tags_str = clean(tags_m.group(1)) if tags_m else ""

        # Description — text after the notation eeeeee table, before next <table or end
        # Grab the text after the </table><p> block
        desc = ""
        desc_m = re.search(
            r'</table>\s*<p>\s*(.*?)(?:</font>|<p><b>|$)',
            block, re.DOTALL | re.IGNORECASE,
        )
        if desc_m:
            raw_desc = desc_m.group(1)
            # Strip HTML tags and clean up
            desc = clean(strip_tags(raw_desc))
            # Truncate at member tips markers
            for marker in ["Member Tips", "Video demonstration", "more tips", "Add your tip"]:
                idx = desc.find(marker)
                if idx > 0:
                    desc = desc[:idx].strip()
        # Some descriptions are inside the main cell without a <p> wrapper
        if not desc and notation:
            # Try broader pattern: text after the notation table
            broad_m = re.search(
                r'bgcolor=#eeeeee.*?</table>\s*<p>\s*([^<]{20,})',
                block, re.DOTALL | re.IGNORECASE,
            )
            if broad_m:
                desc = clean(broad_m.group(1))

        family_hint  = infer_family(raw_name)
        category_hint = infer_category(raw_name, tags_str, notation)

        tricks.append({
            "source_name":    raw_name,
            "alt_name":       alt_name or "",
            "add_value":      str(add),
            "showmove_id":    str(showmove_id),
            "source_url":     MOVE_URL.format(showmove_id),
            "notation":       notation,
            "tags_summary":   tags_str,
            "description":    desc,
            "family_hint":    family_hint or "",
            "category_hint":  category_hint,
        })

    return tricks


# ---------------------------------------------------------------------------
# Audit: compare scraped corpus against current tricks.csv
# ---------------------------------------------------------------------------

def load_current_tricks(csv_path: Path) -> list[dict]:
    with csv_path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def normalise(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def audit(scraped: list[dict], current: list[dict]) -> str:
    lines = []
    lines.append("=" * 72)
    lines.append("AUDIT: scraped footbag.org corpus vs current tricks.csv")
    lines.append("=" * 72)
    lines.append(f"Scraped total : {len(scraped)} tricks")
    lines.append(f"Current total : {len(current)} tricks")
    lines.append("")

    # Build lookup maps for current
    current_by_norm  = {normalise(r["trick_canon"]): r for r in current}
    current_aliases  = {}
    for r in current:
        for alias in (r.get("aliases") or "").split("|"):
            alias = alias.strip()
            if alias:
                current_aliases[normalise(alias)] = r

    exact_matches   = []
    alias_matches   = []
    new_tricks      = []
    ambiguous       = []

    for s in scraped:
        sn = normalise(s["source_name"])
        an = normalise(s["alt_name"]) if s["alt_name"] else None

        if sn in current_by_norm:
            exact_matches.append((s["source_name"], current_by_norm[sn]["trick_canon"]))
        elif an and an in current_by_norm:
            alias_matches.append((s["source_name"], f"alt_name matches canonical: {current_by_norm[an]['trick_canon']}"))
        elif sn in current_aliases:
            alias_matches.append((s["source_name"], f"source_name matches alias of: {current_aliases[sn]['trick_canon']}"))
        elif an and an in current_aliases:
            alias_matches.append((s["source_name"], f"alt_name matches alias of: {current_aliases[an]['trick_canon']}"))
        else:
            # Check for partial matches (one is substring of the other)
            partial = []
            for cn, cr in current_by_norm.items():
                if (sn in cn or cn in sn) and abs(len(sn) - len(cn)) < 8:
                    partial.append(cr["trick_canon"])
            if partial:
                ambiguous.append((s["source_name"], s["add_value"], "partial match: " + ", ".join(partial[:3])))
            else:
                new_tricks.append((s["source_name"], s["add_value"], s["category_hint"], s["family_hint"]))

    lines.append(f"EXACT MATCHES  ({len(exact_matches)}):")
    for scraped_name, cur_name in sorted(exact_matches):
        match_note = "" if normalise(scraped_name) == normalise(cur_name) else f"  [case/punct diff: '{cur_name}']"
        lines.append(f"  {scraped_name}{match_note}")

    lines.append("")
    lines.append(f"ALIAS / ALT-NAME MATCHES  ({len(alias_matches)}):")
    for scraped_name, note in sorted(alias_matches):
        lines.append(f"  {scraped_name}  →  {note}")

    lines.append("")
    lines.append(f"AMBIGUOUS / PARTIAL MATCHES  ({len(ambiguous)}):")
    for scraped_name, add_val, note in sorted(ambiguous):
        lines.append(f"  [{add_val} ADD] {scraped_name}  →  {note}")

    lines.append("")
    lines.append(f"NEW TRICKS (not in current dict)  ({len(new_tricks)}):")
    for add_val in range(1, 8):
        batch = [(n, c, f) for n, a, c, f in new_tricks if a == str(add_val)]
        if batch:
            lines.append(f"  --- {add_val} ADD ---")
            for name, cat, fam in sorted(batch):
                fam_str = f"  family:{fam}" if fam else ""
                lines.append(f"    {name}  [{cat}]{fam_str}")

    lines.append("")
    lines.append("=" * 72)
    lines.append("ADD BREAKDOWN (scraped):")
    for add in range(1, 8):
        count = sum(1 for s in scraped if s["add_value"] == str(add))
        lines.append(f"  {add} ADD: {count} tricks")

    lines.append("")
    lines.append("NOTATION COVERAGE:")
    with_notation = sum(1 for s in scraped if s["notation"].strip())
    lines.append(f"  Tricks with notation : {with_notation} / {len(scraped)}")
    no_notation   = [s["source_name"] for s in scraped if not s["notation"].strip()]
    if no_notation:
        lines.append(f"  Missing notation     : {', '.join(no_notation[:10])}" +
                     (f" ... +{len(no_notation)-10} more" if len(no_notation) > 10 else ""))

    lines.append("")
    lines.append("NOTATION LEGEND (Jobs' system):")
    lines.append("  CLIP         = clipper delay (cross-body inside delay)")
    lines.append("  SET          = set kick (bag tossed up for next element)")
    lines.append("  TOE          = toe delay")
    lines.append("  HEEL         = heel delay")
    lines.append("  INSIDE       = inside surface delay")
    lines.append("  OP           = opposite (opposite leg/foot from the current delay)")
    lines.append("  SAME         = same (same leg/foot as current delay)")
    lines.append("  IN           = inside direction (leg circles in to out)")
    lines.append("  OUT          = outside direction (leg circles out to in)")
    lines.append("  SPIN         = body rotation (360 turn)")
    lines.append("  DUCK         = ducking body element")
    lines.append("  JUMP         = jump body element")
    lines.append("  DIVE         = diving body element")
    lines.append("  SWIRL        = swirl motion (leg swing)")
    lines.append("  (no plant while) = continuous motion, no weight transfer")
    lines.append("  [DEX]        = dexterity component (leg passes over/under bag)")
    lines.append("  [BOD]        = body component (rotation or positional)")
    lines.append("  [PDX]        = paradox component (hip pivot variant)")
    lines.append("  [XBD]        = cross-body delay (catching leg behind support)")
    lines.append("  [DEL]        = delay/stall surface")
    lines.append("  [UNS]        = unusual surface (sole, heel, etc.)")
    lines.append("  >            = sequence separator (next element in the trick)")
    lines.append("=" * 72)

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape footbag.org freestyle move corpus")
    parser.add_argument("--delay", type=float, default=0.5,
                        help="Seconds between HTTP requests (default: 0.5)")
    parser.add_argument("--add-levels", type=str, default="1,2,3,4,5,6,7",
                        help="Comma-separated ADD levels to scrape (default: 1,2,3,4,5,6,7)")
    args = parser.parse_args()

    add_levels = [int(x.strip()) for x in args.add_levels.split(",")]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    all_tricks: list[dict] = []

    for add in add_levels:
        url = BASE_URL.format(add)
        print(f"Fetching {url} ...", flush=True)
        try:
            html_body = fetch(url)
        except Exception as e:
            print(f"  ERROR fetching ADD {add}: {e}", file=sys.stderr)
            continue
        tricks = parse_list_page(add, html_body, url)
        print(f"  Parsed {len(tricks)} tricks")
        all_tricks.extend(tricks)
        if args.delay > 0 and add < add_levels[-1]:
            time.sleep(args.delay)

    # Write output CSV
    fieldnames = [
        "source_name", "alt_name", "add_value", "showmove_id",
        "source_url", "notation", "tags_summary",
        "description", "family_hint", "category_hint",
    ]
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_tricks)
    print(f"\nWrote {len(all_tricks)} tricks to: {OUT_CSV}")

    # Audit against current tricks.csv
    current_tricks = load_current_tricks(TRICKS_CSV) if TRICKS_CSV.exists() else []
    audit_text = audit(all_tricks, current_tricks)
    with OUT_AUDIT.open("w", encoding="utf-8") as f:
        f.write(audit_text)
    print(f"Wrote audit to:  {OUT_AUDIT}")
    print()
    # Print summary to stdout
    for line in audit_text.split("\n")[:30]:
        print(line)
    print("...")
    print("(Full audit in file above)")


if __name__ == "__main__":
    main()

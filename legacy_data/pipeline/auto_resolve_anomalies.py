#!/usr/bin/env python3
"""
auto_resolve_anomalies.py

Cross-references MISSING_PARTNER anomalies against mirror HTML to extract
partner names automatically. Outputs proposed corrections for human review.

Usage (from legacy_data/):
    .venv/bin/python pipeline/auto_resolve_anomalies.py
    .venv/bin/python pipeline/auto_resolve_anomalies.py --apply  # append to team_corrections.csv

Outputs:
    out/auto_resolved_corrections.csv   — proposed corrections for review
    stdout: summary of resolved vs unresolved
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKLIST_CSV = ROOT / "out" / "team_anomaly_worklist.csv"
EVENTS_CSV = ROOT / "out" / "canonical" / "events.csv"
PARTICIPANTS_CSV = ROOT / "out" / "canonical" / "event_result_participants.csv"
CORRECTIONS_CSV = ROOT / "inputs" / "team_corrections.csv"
MIRROR_DIR = ROOT / "mirror_footbag_org" / "www.footbag.org" / "events" / "show"
OUT_CSV = ROOT / "out" / "auto_resolved_corrections.csv"

csv.field_size_limit(10 * 1024 * 1024)


def _norm(s: str) -> str:
    """Normalize for comparison: strip accents, lowercase, collapse whitespace."""
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^\w\s]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip().lower()


def _strip_location(name: str) -> str:
    """Strip trailing parenthetical location annotations."""
    return re.sub(r'\s*\(.*$', '', name).strip()


def _extract_doubles_pairs(html_text: str) -> list[dict]:
    """Extract doubles pairs from mirror HTML text.

    Handles common formats:
    - "1\\tPlayer A\\tPlayer B"  (tab-separated)
    - "1. Player A / Player B"   (slash-separated)
    - "1. Player A (LOC) Player B (LOC)"  (location-annotated)
    - "1. Player A  Player B"  (whitespace-separated with sufficient gap)
    """
    pairs = []
    lines = html_text.split('\n')

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Skip non-placement lines
        # Must start with a number (placement)
        m_place = re.match(r'^(\d{1,3})\s*[.\-)\t]\s*(.+)', line)
        if not m_place:
            # Also try: just number + tab
            m_place = re.match(r'^(\d{1,3})\t(.+)', line)
        if not m_place:
            continue

        placement = int(m_place.group(1))
        rest = m_place.group(2).strip()

        if not rest:
            continue

        # Strategy 1: Tab-separated (like 2009 French)
        tab_parts = rest.split('\t')
        tab_parts = [p.strip() for p in tab_parts if p.strip()]
        if len(tab_parts) >= 2:
            name_a = _strip_location(tab_parts[0])
            name_b = _strip_location(tab_parts[1])
            if name_a and name_b and len(name_a) > 1 and len(name_b) > 1:
                pairs.append({
                    'placement': placement,
                    'player_a': name_a,
                    'player_b': name_b,
                    'method': 'tab',
                })
                continue

        # Strategy 2: Slash-separated "Player A / Player B"
        if ' / ' in rest:
            slash_parts = rest.split(' / ', 1)
            name_a = _strip_location(slash_parts[0].strip())
            name_b = _strip_location(slash_parts[1].strip())
            if name_a and name_b and len(name_a) > 1 and len(name_b) > 1:
                pairs.append({
                    'placement': placement,
                    'player_a': name_a,
                    'player_b': name_b,
                    'method': 'slash',
                })
                continue

        # Strategy 3: Location-annotated "Player A (LOC) Player B (LOC)"
        # or "Player A (LOC)  Player B (LOC)" with extra spaces
        loc_pattern = re.findall(r'([A-Z][a-zA-ZÀ-ÿ\-\'. ]+?)\s*\([^)]*\)', rest)
        if len(loc_pattern) >= 2:
            name_a = loc_pattern[0].strip()
            name_b = loc_pattern[1].strip()
            if name_a and name_b and len(name_a) > 1 and len(name_b) > 1:
                pairs.append({
                    'placement': placement,
                    'player_a': name_a,
                    'player_b': name_b,
                    'method': 'location',
                })
                continue

        # Strategy 4: Wide whitespace gap "Player A     Player B"
        wide_gap = re.split(r'\s{3,}', rest)
        wide_gap = [p.strip() for p in wide_gap if p.strip()]
        if len(wide_gap) >= 2:
            name_a = _strip_location(wide_gap[0])
            name_b = _strip_location(wide_gap[1])
            if name_a and name_b and len(name_a) > 1 and len(name_b) > 1:
                pairs.append({
                    'placement': placement,
                    'player_a': name_a,
                    'player_b': name_b,
                    'method': 'whitespace',
                })
                continue

    return pairs


def _find_doubles_sections(html_path: str) -> dict[str, str]:
    """Find doubles discipline sections in mirror HTML, return {discipline_hint: raw_text}."""
    with open(html_path, encoding='utf-8', errors='replace') as f:
        content = f.read()

    # Extract ALL pre blocks and concatenate (some events have multiple)
    pre_matches = re.findall(r'<pre[^>]*>(.*?)</pre>', content, re.DOTALL | re.IGNORECASE)
    if not pre_matches:
        return {}

    text = '\n'.join(pre_matches)
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Decode HTML entities
    import html as _html
    text = _html.unescape(text)

    # Split into sections by headers (lines that look like division names)
    sections: dict[str, str] = {}
    current_header = None
    current_lines: list[str] = []

    for line in text.split('\n'):
        stripped = line.strip()
        if not stripped:
            continue

        # Heuristic: a header line has no leading digit, isn't too long,
        # and contains keywords suggesting a discipline section
        is_header = (
            not re.match(r'^\d', stripped)
            and len(stripped) < 80
            and not stripped.startswith('(')
            and re.search(r'(doubles|double|net|freestyle|golf|routines|circle|shred|sick|results)', stripped, re.I)
        )

        # Also catch generic headers that are all-caps or title-case short lines
        if not is_header and not re.match(r'^\d', stripped) and len(stripped) < 50:
            words = stripped.split()
            if len(words) <= 8 and any(w[0].isupper() for w in words if w):
                is_header = True

        # Capture ALL discipline sections (not just doubles) —
        # the matching logic will pair them with anomalies by slug
        if is_header:
            if current_header and current_lines:
                sections[current_header] = '\n'.join(current_lines)
            current_header = stripped
            current_lines = []
        elif current_header:
            current_lines.append(line)

    if current_header and current_lines:
        sections[current_header] = '\n'.join(current_lines)

    return sections


def _slug(s: str) -> str:
    s = s.replace("'", "").replace("\u2019", "")
    return re.sub(r"[^a-z0-9]+", "_", s.lower().strip()).strip("_")


def _name_match(canon_name: str, mirror_name: str) -> bool:
    """Check if canonical name matches mirror name (fuzzy)."""
    cn = _norm(canon_name)
    mn = _norm(mirror_name)
    if cn == mn:
        return True
    # Check if one is a substring of the other
    if cn in mn or mn in cn:
        return True
    # Check surname match
    cn_parts = cn.split()
    mn_parts = mn.split()
    if cn_parts and mn_parts and cn_parts[-1] == mn_parts[-1]:
        return True
    return False


def main():
    parser = argparse.ArgumentParser(description="Auto-resolve MISSING_PARTNER anomalies from mirror")
    parser.add_argument("--apply", action="store_true",
                        help="Append resolved corrections to team_corrections.csv")
    args = parser.parse_args()

    # Load event metadata
    eid_map: dict[str, str] = {}  # event_key → legacy_event_id
    with open(EVENTS_CSV, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            eid_map[row['event_key']] = row.get('legacy_event_id', '')

    # Load existing corrections to avoid duplicates
    existing: set[tuple[str, str, str]] = set()
    if CORRECTIONS_CSV.exists():
        with open(CORRECTIONS_CSV, newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                existing.add((row['event_key'], _slug(row['discipline_key']), row['placement']))

    # Load anomalies
    anomalies: list[dict] = []
    with open(WORKLIST_CSV, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            if row['anomaly_type'] == 'MISSING_PARTNER':
                anomalies.append(row)

    print(f"Loaded {len(anomalies)} MISSING_PARTNER anomalies")

    # Group anomalies by event
    by_event: dict[str, list[dict]] = defaultdict(list)
    for a in anomalies:
        by_event[a['event_key']].append(a)

    resolved = []
    unresolved = []
    skipped_existing = 0
    no_mirror = 0
    no_doubles_section = 0

    for event_key, event_anomalies in sorted(by_event.items()):
        eid = eid_map.get(event_key, '')
        if not eid:
            no_mirror += len(event_anomalies)
            continue

        mirror_path = MIRROR_DIR / eid / "index.html"
        if not mirror_path.exists():
            no_mirror += len(event_anomalies)
            continue

        # Find doubles sections in mirror
        sections = _find_doubles_sections(str(mirror_path))
        if not sections:
            no_doubles_section += len(event_anomalies)
            continue

        # Extract all pairs from all doubles sections
        all_pairs: dict[str, list[dict]] = {}
        for header, text in sections.items():
            pairs = _extract_doubles_pairs(text)
            if pairs:
                all_pairs[header] = pairs

        if not all_pairs:
            no_doubles_section += len(event_anomalies)
            continue

        # Try to match each anomaly
        for a in event_anomalies:
            disc_slug = _slug(a['discipline'])
            pl = a['placement']
            player = a['original_display'].split('(')[0].strip()  # strip location

            # Skip if already corrected
            if (event_key, disc_slug, pl) in existing:
                skipped_existing += 1
                continue

            # Find matching section by discipline name similarity
            best_match = None
            for header, pairs in all_pairs.items():
                header_slug = _slug(header)
                # Check if discipline slug overlaps with header
                if disc_slug in header_slug or header_slug in disc_slug:
                    # Look for matching placement
                    for pair in pairs:
                        if str(pair['placement']) == str(pl):
                            # Check if one of the names matches our known player
                            if _name_match(player, pair['player_a']):
                                best_match = {
                                    'partner': pair['player_b'],
                                    'player_confirmed': pair['player_a'],
                                    'method': pair['method'],
                                    'mirror_header': header,
                                }
                                break
                            elif _name_match(player, pair['player_b']):
                                best_match = {
                                    'partner': pair['player_a'],
                                    'player_confirmed': pair['player_b'],
                                    'method': pair['method'],
                                    'mirror_header': header,
                                }
                                break
                    if best_match:
                        break

            # If no match by slug, try fuzzy section matching
            if not best_match:
                for header, pairs in all_pairs.items():
                    for pair in pairs:
                        if str(pair['placement']) == str(pl):
                            if _name_match(player, pair['player_a']):
                                best_match = {
                                    'partner': pair['player_b'],
                                    'player_confirmed': pair['player_a'],
                                    'method': pair['method'] + '+fuzzy_section',
                                    'mirror_header': header,
                                }
                                break
                            elif _name_match(player, pair['player_b']):
                                best_match = {
                                    'partner': pair['player_a'],
                                    'player_confirmed': pair['player_b'],
                                    'method': pair['method'] + '+fuzzy_section',
                                    'mirror_header': header,
                                }
                                break
                    if best_match:
                        break

            if best_match:
                partner = best_match['partner']
                # Quality filters — reject bad parses
                reject = False
                # Partner is a number or placement fragment
                if re.match(r'^\d+\.?$', partner.strip()):
                    reject = True
                # Partner is too short (single char)
                if len(partner.strip()) <= 1:
                    reject = True
                # Partner contains HTML entities or tags
                if '&' in partner or '<' in partner:
                    reject = True
                # Partner is same as player (self-match)
                if _norm(partner) == _norm(player):
                    reject = True
                # Partner looks like a location/score, not a name
                if re.match(r'^[\d\-]+$', partner.strip()):
                    reject = True
                # Partner contains slash (mis-parsed team)
                if '/' in partner:
                    reject = True
                # Player or partner contains prize money ($)
                if '$' in partner or '$' in player:
                    reject = True

                if not reject:
                    resolved.append({
                        'event_key': event_key,
                        'discipline_key': a['discipline'],
                        'placement': pl,
                        'original_display': a['original_display'],
                        'corrected_player_a': player,
                        'corrected_player_b': partner,
                        'correction_type': 'MISSING_PARTNER',
                        'source_note': f"Auto-resolved from mirror ({best_match['method']}): {best_match['mirror_header']}",
                        'active': '1',
                        'verification_level': 'auto_mirror',
                        'verified_by': '',
                        'confidence': 'HIGH',
                    })
                else:
                    unresolved.append(a)
                    continue
            else:
                unresolved.append(a)

    # Write proposed corrections
    fieldnames = [
        'event_key', 'discipline_key', 'placement', 'original_display',
        'corrected_player_a', 'corrected_player_b', 'correction_type',
        'source_note', 'active', 'verification_level', 'verified_by', 'confidence',
    ]
    with open(OUT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(resolved)

    # Summary
    sep = '=' * 72
    print()
    print(sep)
    print("  AUTO-RESOLVE RESULTS")
    print(sep)
    print()
    print(f"  Resolved:           {len(resolved)}")
    print(f"  Unresolved:         {len(unresolved)}")
    print(f"  Skipped (existing): {skipped_existing}")
    print(f"  No mirror HTML:     {no_mirror}")
    print(f"  No doubles section: {no_doubles_section}")
    print()

    if resolved:
        print("Resolved by event:")
        event_counts = defaultdict(int)
        for r in resolved:
            event_counts[r['event_key']] += 1
        for ek, count in sorted(event_counts.items(), key=lambda x: -x[1]):
            print(f"  ({count:>2}) {ek}")
        print()

        print("Sample resolved:")
        for r in resolved[:10]:
            print(f"  {r['event_key']} P{r['placement']} {r['discipline_key']}")
            print(f"    {r['corrected_player_a']} / {r['corrected_player_b']}  [{r['source_note'][:60]}]")
        print()

    print(f"Output: {OUT_CSV}")
    print(sep)

    if args.apply and resolved:
        with open(CORRECTIONS_CSV, 'a', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writerows(resolved)
        print(f"\n  ✓ Appended {len(resolved)} corrections to {CORRECTIONS_CSV}")


if __name__ == '__main__':
    main()

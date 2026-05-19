#!/usr/bin/env python3
"""
04a_compute_bootstrap_leader_signals.py

Computes per-(bootstrap_leader × signal_type) evidence rows from existing
Phase D outputs. Emits one row per (leader × signal_type) — seven signal
types per leader. The output backs the platform's `club_bootstrap_leader_signals`
table; the loader is a separate, deferred step.

Inputs (all produced earlier in Phase D):
  clubs/out/club_bootstrap_leaders.csv          (script 04)
  clubs/out/legacy_club_candidates.csv          (script 02)
  clubs/out/legacy_person_club_affiliations.csv (script 03)
  clubs/out/persons_enriched_for_clubs.csv      (script 01)

Output:
  clubs/out/club_bootstrap_leader_signals.csv

Columns: club_key, mirror_member_id, role, signal_type, is_present,
         signal_payload_json, source

Signal taxonomy (matches schema CHECK constraint, minus `tier_signal` which
is deferred behind the legacy data dump blocker):

  Structural (gate-bearing in the schema's intent):
    - listed_contact   leader's mirror_member_id == club's contact_member_id
    - affiliation      leader appears in the affiliations CSV for this club
    - hosting          club has hosted at least one event (club-level scope)
    - roster           club has >= 5 linkable members
    - mirror_text      leader's normalized name matches \b<name>\b in club desc

  Modifier (context-only):
    - recent_activity  club-side year(s) OR person-side last_year >= 2020
    - geographic_alignment  club.country == person.country (case-insensitive)
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUT_DIR = REPO_ROOT / "legacy_data" / "clubs" / "out"

DEFAULT_LEADERS_CSV       = DEFAULT_OUT_DIR / "club_bootstrap_leaders.csv"
DEFAULT_CANDIDATES_CSV    = DEFAULT_OUT_DIR / "legacy_club_candidates.csv"
DEFAULT_AFFILIATIONS_CSV  = DEFAULT_OUT_DIR / "legacy_person_club_affiliations.csv"
DEFAULT_PERSONS_CSV       = DEFAULT_OUT_DIR / "persons_enriched_for_clubs.csv"
DEFAULT_OUT_CSV           = DEFAULT_OUT_DIR / "club_bootstrap_leader_signals.csv"

# Provenance label written to `source` for every emitted row.
SOURCE_LABEL = "pipeline_04a"

# Active-player anchor: matches script 02's ACTIVE_PLAYER_YEAR. A club or
# person counts as "recently active" iff any anchor year reaches this floor.
ANCHOR_YEAR = 2020

# Roster floor: matches the 5-member co-leader depth gate at
# clubs/scripts/04_build_club_bootstrap_leaders.py:156.
ROSTER_THRESHOLD = 5

OUTPUT_COLUMNS = [
    "club_key",
    "mirror_member_id",
    "role",
    "signal_type",
    "is_present",
    "signal_payload_json",
    "source",
]

# Stable iteration order for emitted signals per leader.
SIGNAL_ORDER = [
    "listed_contact",
    "affiliation",
    "hosting",
    "roster",
    "mirror_text",
    "recent_activity",
    "geographic_alignment",
]


# ─── shared normalization (mirrors clubs/scripts/03 line 27) ────────────────


def norm_text(x) -> str:
    return " ".join(str(x or "").strip().split())


def norm_name(x) -> str:
    return norm_text(x).lower().replace("-", " ")


def norm_country(x) -> str:
    return norm_text(x).lower()


def safe_int(x):
    s = norm_text(x)
    if not s:
        return None
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return None


def to_bool_int(x) -> int:
    n = safe_int(x)
    return 1 if n == 1 else 0


# ─── signal computations (each returns (is_present, payload_dict)) ──────────


def compute_listed_contact(leader: dict, club: dict) -> tuple[int, dict]:
    club_contact = norm_text(club.get("contact_member_id", ""))
    leader_mid = norm_text(leader.get("mirror_member_id", ""))
    matched = bool(club_contact) and bool(leader_mid) and club_contact == leader_mid
    return (
        int(matched),
        {
            "contact_member_id": club_contact,
            "matched": matched,
        },
    )


def compute_affiliation(
    leader: dict, affiliation_counts: Counter
) -> tuple[int, dict]:
    key = (norm_text(leader.get("club_key", "")), norm_text(leader.get("mirror_member_id", "")))
    count = int(affiliation_counts.get(key, 0))
    return (
        int(count > 0),
        {"affiliation_rows": count},
    )


def compute_hosting(club: dict) -> tuple[int, dict]:
    ever = to_bool_int(club.get("ever_hosted", ""))
    hosted_count = safe_int(club.get("hosted_event_count", "")) or 0
    return (
        ever,
        {
            "hosted_event_count": hosted_count,
            "scope": "club_level",
        },
    )


def compute_roster(club: dict) -> tuple[int, dict]:
    linkable = safe_int(club.get("linkable_member_count", "")) or 0
    return (
        int(linkable >= ROSTER_THRESHOLD),
        {
            "linkable_member_count": linkable,
            "threshold": ROSTER_THRESHOLD,
        },
    )


def compute_mirror_text(leader: dict, club: dict) -> tuple[int, dict]:
    person_name_norm = norm_name(leader.get("person_name", ""))
    desc_norm = norm_name(club.get("description", ""))
    if not person_name_norm or not desc_norm:
        return (
            0,
            {"matched": False, "person_name_norm": person_name_norm},
        )
    pattern = r"\b" + re.escape(person_name_norm) + r"\b"
    matched = bool(re.search(pattern, desc_norm))
    return (
        int(matched),
        {"matched": matched, "person_name_norm": person_name_norm},
    )


def compute_recent_activity(club: dict, person: dict | None) -> tuple[int, dict]:
    club_years = [
        safe_int(club.get("last_updated_year", "")),
        safe_int(club.get("last_hosted_year", "")),
        safe_int(club.get("max_affiliated_member_last_year", "")),
    ]
    club_recent = any(y is not None and y >= ANCHOR_YEAR for y in club_years)
    person_year = safe_int((person or {}).get("last_year", ""))
    person_recent = bool(person_year is not None and person_year >= ANCHOR_YEAR)
    return (
        int(club_recent or person_recent),
        {
            "club_recent": club_recent,
            "person_recent": person_recent,
            "anchor_year": ANCHOR_YEAR,
        },
    )


def compute_geographic_alignment(
    club: dict, person: dict | None
) -> tuple[int, dict]:
    club_country_raw = norm_text(club.get("country", ""))
    person_country_raw = norm_text((person or {}).get("country", ""))
    cc = norm_country(club_country_raw)
    pc = norm_country(person_country_raw)
    matched = bool(cc) and bool(pc) and cc == pc
    return (
        int(matched),
        {
            "club_country": club_country_raw,
            "person_country": person_country_raw,
            "matched": matched,
        },
    )


# ─── orchestrator ───────────────────────────────────────────────────────────


def _read_csv(path: Path, label: str, required: set[str]) -> list[dict]:
    if not path.exists():
        raise SystemExit(
            f"ERROR: required input not found: {path}\n"
            f"  ({label} is produced by an earlier Phase D step; "
            f"run ./run_pipeline.sh full or the producing script directly.)"
        )
    with path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if rows:
        missing = required - set(rows[0].keys())
        if missing:
            raise SystemExit(
                f"ERROR: {label} missing required columns: {sorted(missing)}"
            )
    return rows


def compute_signals_for_leader(
    leader: dict,
    club: dict,
    person: dict | None,
    affiliation_counts: Counter,
) -> list[dict]:
    """Emit one dict per signal_type for the given leader. Pure function;
    no I/O. Used both by main() and by unit tests."""
    club_key   = norm_text(leader.get("club_key", ""))
    mirror_mid = norm_text(leader.get("mirror_member_id", ""))
    role       = norm_text(leader.get("role", ""))

    computed = {
        "listed_contact":       compute_listed_contact(leader, club),
        "affiliation":          compute_affiliation(leader, affiliation_counts),
        "hosting":              compute_hosting(club),
        "roster":               compute_roster(club),
        "mirror_text":          compute_mirror_text(leader, club),
        "recent_activity":      compute_recent_activity(club, person),
        "geographic_alignment": compute_geographic_alignment(club, person),
    }

    out = []
    for signal_type in SIGNAL_ORDER:
        is_present, payload = computed[signal_type]
        out.append({
            "club_key":            club_key,
            "mirror_member_id":    mirror_mid,
            "role":                role,
            "signal_type":         signal_type,
            "is_present":          int(is_present),
            "signal_payload_json": json.dumps(
                payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
            ),
            "source":              SOURCE_LABEL,
        })
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("--leaders-csv",      type=Path, default=DEFAULT_LEADERS_CSV)
    ap.add_argument("--candidates-csv",   type=Path, default=DEFAULT_CANDIDATES_CSV)
    ap.add_argument("--affiliations-csv", type=Path, default=DEFAULT_AFFILIATIONS_CSV)
    ap.add_argument("--persons-csv",      type=Path, default=DEFAULT_PERSONS_CSV)
    ap.add_argument("--out-csv",          type=Path, default=DEFAULT_OUT_CSV)
    args = ap.parse_args(argv)

    leaders = _read_csv(
        args.leaders_csv,
        "club_bootstrap_leaders.csv",
        {"club_key", "person_id", "person_name", "mirror_member_id", "role"},
    )
    candidates = _read_csv(
        args.candidates_csv,
        "legacy_club_candidates.csv",
        {
            "club_key", "country", "description", "contact_member_id",
            "linkable_member_count", "hosted_event_count", "ever_hosted",
            "last_hosted_year", "last_updated_year",
            "max_affiliated_member_last_year",
        },
    )
    affiliations = _read_csv(
        args.affiliations_csv,
        "legacy_person_club_affiliations.csv",
        {"club_key", "mirror_member_id"},
    )
    persons = _read_csv(
        args.persons_csv,
        "persons_enriched_for_clubs.csv",
        {"person_id", "country", "last_year"},
    )

    clubs_by_key = {norm_text(r["club_key"]): r for r in candidates}
    persons_by_id = {norm_text(r["person_id"]): r for r in persons}

    affiliation_counts: Counter = Counter()
    for r in affiliations:
        key = (norm_text(r.get("club_key", "")), norm_text(r.get("mirror_member_id", "")))
        if key[0] and key[1]:
            affiliation_counts[key] += 1

    out_rows: list[dict] = []
    missing_clubs: list[str] = []
    missing_persons: list[str] = []

    for leader in leaders:
        club_key = norm_text(leader.get("club_key", ""))
        pid      = norm_text(leader.get("person_id", ""))

        club = clubs_by_key.get(club_key)
        if club is None:
            missing_clubs.append(club_key)
            continue
        person = persons_by_id.get(pid)
        if person is None:
            # Not fatal — recent_activity / geographic_alignment can still
            # be computed (they emit `is_present=0` against an absent
            # person), but the gap is worth reporting.
            missing_persons.append(pid)

        out_rows.extend(
            compute_signals_for_leader(leader, club, person, affiliation_counts)
        )

    out_rows.sort(key=lambda r: (
        r["club_key"], r["mirror_member_id"], r["role"], r["signal_type"]
    ))

    args.out_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.out_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=OUTPUT_COLUMNS)
        w.writeheader()
        w.writerows(out_rows)

    leader_count = len(leaders) - len(missing_clubs)
    expected = leader_count * len(SIGNAL_ORDER)

    print(f"Wrote {len(out_rows):,} rows to {args.out_csv}")
    print()
    print("Summary:")
    print(f"  leaders in:                {len(leaders):>5}")
    print(f"  leaders with club:         {leader_count:>5}")
    print(f"  signals per leader:        {len(SIGNAL_ORDER):>5}")
    print(f"  expected rows:             {expected:>5}")
    print(f"  emitted rows:              {len(out_rows):>5}")
    if missing_clubs:
        print(f"  WARN: missing club rows for {len(missing_clubs)} leader club_keys: "
              f"{sorted(set(missing_clubs))[:5]}")
    if missing_persons:
        print(f"  WARN: missing person rows for {len(missing_persons)} leader person_ids")

    return 0


if __name__ == "__main__":
    sys.exit(main())

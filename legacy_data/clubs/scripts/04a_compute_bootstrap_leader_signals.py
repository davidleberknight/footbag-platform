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

Signal taxonomy (matches the schema CHECK constraint):

  Structural (gate-bearing in the schema's intent):
    - listed_contact   leader's mirror_member_id == club's contact_member_id
    - affiliation      leader appears in the affiliations CSV for this club
    - hosting          club has hosted at least one event (club-level scope)
    - roster           club has >= 5 linkable members
    - mirror_text      leader's normalized name matches \b<name>\b in club desc

  Modifier (context-only):
    - tier_signal      leader's legacy account held any paid membership (ever-paid
                       Tier 2, ever-paid Tier 1 Lifetime, or Tier 1 Annual active
                       at cutover), joined by mirror_member_id against the
                       extractor's legacy_members_final.csv. The file is
                       dump-dependent and not produced by run_pipeline.sh; when it
                       is absent the signal degrades to is_present=0 with
                       member_tier_data_available=false and one run-level warning
                       (it is context-only and never gates classification). A
                       file that is present but malformed / duplicate-keyed fails
                       loudly.
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
DEFAULT_CLUB_MEMBERS_CSV  = REPO_ROOT / "legacy_data" / "seed" / "club_members.csv"
DEFAULT_EVENTS_CSV        = REPO_ROOT / "legacy_data" / "out" / "canonical" / "events.csv"
# The extractor output carrying the per-account paid-tier flags. Dump-dependent
# and not produced by run_pipeline.sh, so the tier signal degrades gracefully
# when it is absent (see load_member_tiers / compute_tier_signal).
DEFAULT_MEMBER_TIERS_CSV  = (
    REPO_ROOT / "legacy_data" / "member_data_scripts" / "out" / "legacy_members_final.csv")
DEFAULT_OUT_CSV           = DEFAULT_OUT_DIR / "club_bootstrap_leader_signals.csv"

# The three paid-tier flags read from the member export, in payload order.
TIER_FLAG_COLUMNS = (
    "legacy_ever_paid_tier2",
    "legacy_ever_paid_tier1_lifetime",
    "legacy_tier1_annual_active_at_cutover",
)
# Payload keys, dropping the legacy_ prefix for readability.
TIER_PAYLOAD_KEYS = (
    "ever_paid_tier2",
    "ever_paid_tier1_lifetime",
    "tier1_annual_active_at_cutover",
)

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
    "tier_signal",
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


def load_host_club_aliases() -> dict[str, str]:
    """Host-club alias table owned by script 02 (the club/events hosting
    attribution authority): event-host normalized name -> club normalized
    name, for host_club text that does not normalize-equal a club name.
    Imported so the person-level hosting signal credits the same clubs 02
    does; if 02 is not importable, returns no aliases (a few alias-only clubs
    then miss hosting-year credit, never a crash).
    """
    try:
        import importlib
        mod = importlib.import_module("02_build_legacy_club_candidates")
        return dict(getattr(mod, "HOST_CLUB_ALIASES", {}))
    except Exception:
        return {}


def build_roster_by_club(club_members: list[dict]) -> dict[str, set[str]]:
    """Map legacy_club_key -> set of mirror_member_id on that club's legacy
    member roster (club_members.csv). Backs the person-level roster signal."""
    roster: dict[str, set[str]] = {}
    for r in club_members:
        ck = norm_text(r.get("legacy_club_key", ""))
        mid = norm_text(r.get("mirror_member_id", ""))
        if ck and mid:
            roster.setdefault(ck, set()).add(mid)
    return roster


def build_hosting_years_by_name(
    events: list[dict], aliases: dict[str, str]
) -> dict[str, set[int]]:
    """Map club normalized-name -> set of years the club hosted IFPA events,
    from canonical events.csv (host_club joined on normalized name, with the
    script-02 alias remap applied). Backs the person-level hosting signal."""
    years: dict[str, set[int]] = {}
    for e in events:
        key = norm_name(e.get("host_club", ""))
        if not key:
            continue
        key = aliases.get(key, key)
        y = safe_int(e.get("year", ""))
        if y is not None:
            years.setdefault(key, set()).add(y)
    return years


def _parse_tier_flag(value, mid: str, column: str, path: Path) -> bool:
    """A paid-tier flag is exactly '0' or '1' (the extractor always emits one).
    Anything else is malformed source data and fails loudly."""
    v = norm_text(value)
    if v == "1":
        return True
    if v == "0":
        return False
    raise SystemExit(
        f"ERROR: {path}: malformed tier flag {column}={value!r} for "
        f"legacy_member_id {mid!r} (expected '0' or '1')"
    )


def load_member_tiers(path: Path) -> tuple[dict[str, dict[str, bool]], bool]:
    """Map legacy_member_id -> {payload_key: bool} for the three paid-tier flags,
    plus a boolean saying whether the source file was available.

    The file is dump-dependent and not produced by run_pipeline.sh. Its ABSENCE
    is the only graceful case: it returns ({}, False) so the tier signal degrades
    to a benign is_present=0. A file that IS present but has an invalid schema, a
    malformed flag value, or a duplicate legacy_member_id fails loudly -- graceful
    degradation never masks a corrupt source."""
    if not path.exists():
        return {}, False
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        cols = set(reader.fieldnames or [])
        required = {"legacy_member_id", *TIER_FLAG_COLUMNS}
        missing = required - cols
        if missing:
            raise SystemExit(
                f"ERROR: {path} is present but missing required tier column(s): "
                f"{sorted(missing)}. The tier source is corrupt; graceful "
                "degradation applies only when the whole file is absent."
            )
        out: dict[str, dict[str, bool]] = {}
        for row in reader:
            mid = norm_text(row.get("legacy_member_id", ""))
            if not mid:
                continue  # an id-less row can never match a leader
            if mid in out:
                raise SystemExit(
                    f"ERROR: {path}: duplicate legacy_member_id {mid!r}; the tier "
                    "source must carry one row per account."
                )
            out[mid] = {
                pk: _parse_tier_flag(row.get(col, ""), mid, col, path)
                for pk, col in zip(TIER_PAYLOAD_KEYS, TIER_FLAG_COLUMNS)
            }
    return out, True


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


def compute_hosting(
    club: dict,
    person: dict | None,
    hosting_years_by_name: dict[str, set[int]],
) -> tuple[int, dict]:
    """Person-level: the club hosted an IFPA event in a year that falls within
    this person's active competitive window [first_year, last_year]. The bare
    club-level ever_hosted is not enough; the hosting must overlap the person's
    years for the signal to credit this specific leader."""
    host_years = hosting_years_by_name.get(norm_name(club.get("name", "")), set())
    first_year = safe_int((person or {}).get("first_year", ""))
    last_year = safe_int((person or {}).get("last_year", ""))
    if first_year is not None and last_year is not None:
        matched = sorted(y for y in host_years if first_year <= y <= last_year)
    else:
        matched = []
    return (
        int(bool(matched)),
        {
            "matched_years": matched,
            "person_window": [first_year, last_year],
            "club_hosted_years": len(host_years),
            "scope": "person_level",
        },
    )


def compute_roster(
    leader: dict, roster_by_club: dict[str, set[str]]
) -> tuple[int, dict]:
    """Person-level: the club's legacy member roster (club_members.csv) lists
    this leader as a member. The bare club-level "club has >= N members" is not
    enough; the leader must be on the roster for the signal to credit them."""
    club_key = norm_text(leader.get("club_key", ""))
    leader_mid = norm_text(leader.get("mirror_member_id", ""))
    roster = roster_by_club.get(club_key, set())
    on_roster = bool(leader_mid) and leader_mid in roster
    return (
        int(on_roster),
        {
            "on_roster": on_roster,
            "roster_size": len(roster),
            "scope": "person_level",
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


def compute_tier_signal(
    leader: dict,
    tier_by_member_id: dict[str, dict[str, bool]],
    tier_data_available: bool,
) -> tuple[int, dict]:
    """Context-only: the leader's legacy account held any paid membership. When
    the source file was absent the signal is a benign is_present=0 flagged
    member_tier_data_available=false. When present, the payload records whether
    the member id matched a row and each of the three paid-tier flags; is_present
    is 1 iff any flag is set."""
    if not tier_data_available:
        return (0, {"member_tier_data_available": False})
    mid = norm_text(leader.get("mirror_member_id", ""))
    rec = tier_by_member_id.get(mid)
    flags = rec if rec is not None else {pk: False for pk in TIER_PAYLOAD_KEYS}
    is_present = int(any(flags[pk] for pk in TIER_PAYLOAD_KEYS))
    payload = {"member_tier_data_available": True, "matched": rec is not None}
    payload.update({pk: flags[pk] for pk in TIER_PAYLOAD_KEYS})
    return (is_present, payload)


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
    roster_by_club: dict[str, set[str]],
    hosting_years_by_name: dict[str, set[int]],
    tier_by_member_id: dict[str, dict[str, bool]] | None = None,
    tier_data_available: bool = False,
) -> list[dict]:
    """Emit one dict per signal_type for the given leader. Pure function;
    no I/O. Used both by main() and by unit tests."""
    club_key   = norm_text(leader.get("club_key", ""))
    mirror_mid = norm_text(leader.get("mirror_member_id", ""))
    role       = norm_text(leader.get("role", ""))

    computed = {
        "listed_contact":       compute_listed_contact(leader, club),
        "affiliation":          compute_affiliation(leader, affiliation_counts),
        "hosting":              compute_hosting(club, person, hosting_years_by_name),
        "roster":               compute_roster(leader, roster_by_club),
        "mirror_text":          compute_mirror_text(leader, club),
        "tier_signal":          compute_tier_signal(
            leader, tier_by_member_id or {}, tier_data_available),
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
    ap.add_argument("--club-members-csv", type=Path, default=DEFAULT_CLUB_MEMBERS_CSV)
    ap.add_argument("--events-csv",       type=Path, default=DEFAULT_EVENTS_CSV)
    ap.add_argument("--member-tiers-csv", type=Path, default=DEFAULT_MEMBER_TIERS_CSV)
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
            "club_key", "name", "country", "description", "contact_member_id",
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
        {"person_id", "country", "first_year", "last_year"},
    )
    club_members = _read_csv(
        args.club_members_csv,
        "club_members.csv",
        {"legacy_club_key", "mirror_member_id"},
    )
    events = _read_csv(
        args.events_csv,
        "events.csv",
        {"host_club", "year"},
    )
    tier_by_member_id, tier_data_available = load_member_tiers(args.member_tiers_csv)

    clubs_by_key = {norm_text(r["club_key"]): r for r in candidates}
    persons_by_id = {norm_text(r["person_id"]): r for r in persons}
    roster_by_club = build_roster_by_club(club_members)
    hosting_years_by_name = build_hosting_years_by_name(events, load_host_club_aliases())

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
            compute_signals_for_leader(
                leader, club, person, affiliation_counts,
                roster_by_club, hosting_years_by_name,
                tier_by_member_id, tier_data_available,
            )
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
    if not tier_data_available:
        print(f"  WARN: member tier source absent ({args.member_tiers_csv}); tier_signal "
              "is_present=0 (member_tier_data_available=false) for every leader. Produce it "
              "with run_legacy_members.sh --extract (needs the dump) for real tier values.")
    else:
        print(f"  tier source:               {args.member_tiers_csv} "
              f"({len(tier_by_member_id):,} accounts)")

    return 0


if __name__ == "__main__":
    sys.exit(main())

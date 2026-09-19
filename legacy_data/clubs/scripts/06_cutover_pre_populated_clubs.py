#!/usr/bin/env python3
"""
06_cutover_pre_populated_clubs.py

IP Item 3a — pre-populated clubs cutover.

For each `legacy_club_candidates` row with `bootstrap_eligible = 1` (the
41 `category=pre_populate` rows from the §10.1 classifier), ensure the
matching live `clubs` row exists and set `legacy_club_candidates.mapped_club_id`
to that `clubs.id`. The mapping is the audit link that lets bootstrap
leaders (item 3b) attach by FK to `clubs.id`.

Scope (per IP constraints):
  - Eligible rows only (`bootstrap_eligible=1`). onboarding_visible,
    dormant, and junk candidates are not touched.
  - No leaders loaded here (item 3b deferred).
  - No schema changes.
  - No classifier rule changes.

Idempotent: re-running produces no changes after the first successful
application. Relies on `load_clubs_seed.py` having already created the
41 matching `clubs` rows (via `scripts/reset-local-db.sh`); on a clean
install that hasn't seeded clubs, the script falls back to inserting
full club + tag rows using the legacy seed CSV.

All DB writes land in a single transaction.

Usage (from legacy_data/ or repo root):
    python clubs/scripts/06_cutover_pre_populated_clubs.py [--db path/to/footbag.db]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import os
import re
import sys
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts" / "lib"))
from db_cutover_guard import assert_maintainer_db_target  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from club_curation import load_club_duplicate_pairs  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _cutover_write_contract import (  # noqa: E402
    CutoverWrite, add_contract_args, report_artifacts, sql_literal,
)


AUDIT_FIELDS = [
    "action", "legacy_club_key", "club_id", "tag_id", "club_name",
    "old_mapped_club_id", "new_mapped_club_id", "reason",
]

TAG_INSERT_SQL = """
    INSERT OR IGNORE INTO tags
      (id, created_at, created_by, updated_at, updated_by, version,
       tag_normalized, tag_display, is_standard, standard_type)
    VALUES (?, ?, 'cutover_06', ?, 'cutover_06', 1, ?, ?, 1, 'club')
"""

CLUB_INSERT_SQL = """
    INSERT OR IGNORE INTO clubs
      (id, created_at, created_by, updated_at, updated_by, version,
       name, description, city, region, country,
       external_url, external_url_validated_at,
       external_url_quarantine_reason, status, hashtag_tag_id)
    VALUES (?, ?, 'cutover_06', ?, 'cutover_06', 1,
            ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
"""

STAMP_SQL = """
    UPDATE legacy_club_candidates
    SET mapped_club_id = ?,
        updated_at = ?,
        updated_by = 'cutover_06',
        version = version + 1
    WHERE legacy_club_key = ?
"""


class CutoverPlan:
    """What this run would write, decided before anything is written.

    The loop that fills this used to discover half of it by attempting the
    writes: whether a club row existed, whether a stamp was a no-op. Those are
    now read and simulated, because a plan that only exists as a sequence of
    attempted statements cannot be written to a file before the transaction.
    """

    def __init__(self) -> None:
        self.tag_inserts: list[tuple] = []
        self.club_inserts: list[tuple] = []
        self.stamps: list[tuple] = []
        self.audit: list[dict] = []
        self.before_candidates: list[tuple] = []
        self.counters: dict[str, int] = {}
        self.candidates_seen = 0
        self.missing_seed: list[str] = []


def make_snapshot(candidate_keys: set[str], club_ids: set[str], tag_ids: set[str]):
    """The rows this run would disturb: the candidates it would stamp, and the
    presence of the club and tag ids it would insert."""
    def snapshot(conn):
        rows = [("candidate",) + tuple(row) for row in conn.execute(
            "SELECT legacy_club_key, mapped_club_id, updated_at, updated_by, version "
            "FROM legacy_club_candidates ORDER BY legacy_club_key"
        ) if row[0] in candidate_keys]
        rows += [("club", row[0]) for row in conn.execute(
            "SELECT id FROM clubs ORDER BY id") if row[0] in club_ids]
        rows += [("tag", row[0]) for row in conn.execute(
            "SELECT id FROM tags ORDER BY id") if row[0] in tag_ids]
        return rows
    return snapshot


def rollback_statements(plan: CutoverPlan) -> list[str]:
    """Undo in the order the foreign keys allow: unstamp the candidates that
    point at the new clubs, then drop those clubs, then the tags they carried."""
    lines = []
    for key, mapped, updated_at, updated_by, version in plan.before_candidates:
        lines.append(
            f"UPDATE legacy_club_candidates SET mapped_club_id = {sql_literal(mapped)}, "
            f"updated_at = {sql_literal(updated_at)}, "
            f"updated_by = {sql_literal(updated_by)}, "
            f"version = {sql_literal(version)} "
            f"WHERE legacy_club_key = {sql_literal(key)};")
    for row in plan.club_inserts:
        lines.append(f"DELETE FROM clubs WHERE id = {sql_literal(row[0])};")
    for row in plan.tag_inserts:
        lines.append(f"DELETE FROM tags WHERE id = {sql_literal(row[0])};")
    return lines


SCRIPT_DIR = Path(__file__).resolve().parent
LEGACY_DATA_ROOT = SCRIPT_DIR.parent.parent  # legacy_data/
SEED_CSV = LEGACY_DATA_ROOT / "seed" / "clubs.csv"
# URL safety verdicts produced at data-prep time by `npm run verify:seed-urls`,
# so the cutover stamps validated_at/quarantine without any runtime URL callout.
VERDICTS_CSV = LEGACY_DATA_ROOT / "seed" / "clubs_url_verdicts.csv"
DUPLICATE_OVERRIDES_CSV = LEGACY_DATA_ROOT / "overrides" / "club_duplicates.csv"


def load_duplicate_canonical_map(path: Path = DUPLICATE_OVERRIDES_CSV) -> dict[str, str]:
    """Confirmed duplicate pairs as retired key -> kept key, so a merge points at
    the canonical club. Parsing lives in the shared club-curation module: the
    classifier, the affiliation builder, this cutover and the seed loader all read
    the one curated file, and a second copy of the parsing is how one of them
    drifts from the ruling the others honour.
    """
    return load_club_duplicate_pairs(path)


def load_url_verdicts(path: Path = VERDICTS_CSV) -> dict[str, dict[str, str | None]]:
    """Map legacy_club_key -> {external_url, validated_at, quarantine_reason}.

    A verdict is applied only when its external_url still matches the seed row,
    so a URL changed since the last verify run is treated as unverified. Missing
    file -> empty map (every URL loads unverified and the public read hides it).
    """
    if not path.exists():
        return {}
    out: dict[str, dict[str, str | None]] = {}
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            key = (row.get("legacy_club_key") or "").strip()
            if not key:
                continue
            out[key] = {
                "external_url": row.get("external_url") or "",
                "validated_at": (row.get("validated_at") or "") or None,
                "quarantine_reason": (row.get("quarantine_reason") or "") or None,
            }
    return out

_CLASSIFICATION_ORDER = {
    'pre_populate': 0, 'onboarding_visible': 1, 'dormant': 2, 'junk': 3,
}


def now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def stable_id(prefix: str, *parts: str) -> str:
    """Deterministic id. Must match load_clubs_seed.py to reuse existing rows."""
    raw = "||".join(str(p) for p in parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]
    return f"{prefix}_{digest}"


# Tag-generation helpers duplicated from load_clubs_seed.py so the cutover
# script can INSERT a club + tag from scratch on a DB where load_clubs_seed
# has not yet run. On the normal path (reset-local-db.sh runs load_clubs_seed
# first), INSERT OR IGNORE no-ops and this logic is unused.
_PRE_NFKD_MAP = str.maketrans({
    'Ł': 'L', 'ł': 'l', 'Ø': 'O', 'ø': 'o', 'Đ': 'D', 'đ': 'd',
})


def slugify(text: str) -> str:
    text = (text or "").translate(_PRE_NFKD_MAP)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return re.sub(r"_+", "_", text).strip("_")


_REDUNDANT_SUFFIXES = [
    "_de_footbag_net_club", "_de_footbag_club", "_de_footbag",
    "_footbag_net_club", "_hacky_sack_club", "_footbag_club", "_footbag",
    "_club", "_fc",
]


def strip_redundant_suffix(slug: str) -> str:
    for suffix in _REDUNDANT_SUFFIXES:
        if slug.endswith(suffix):
            trimmed = slug[: -len(suffix)].strip("_")
            if trimmed:
                return trimmed
    return slug


def _clean_club_name(name: str) -> str:
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)
    name = re.sub(r"^the\s+", "", name, flags=re.IGNORECASE)
    return name.strip()


def extract_primary_city(city: str) -> str:
    """Take the first city from multi-city values. Returns '' if empty."""
    if not city or not city.strip():
        return ''
    city = re.sub(r'\s*\([^)]*\)\s*', ' ', city)
    parts = re.split(r'\s*/\s*|\s+-\s+|\s+&\s+|\s+and\s+', city.strip(), flags=re.IGNORECASE)
    return parts[0].strip() if parts else ''


def make_tag_normalized(name: str, country: str, city: str, seen: set[str]) -> str:
    """Generate unique #club_{slug} using city-first cascade."""
    name_slug = strip_redundant_suffix(slugify(_clean_club_name(name)))
    country_slug = slugify(country)
    primary_city = extract_primary_city(city)
    city_slug = slugify(primary_city)

    if not city_slug or city_slug == country_slug:
        candidates = [
            f"#club_{name_slug}",
            f"#club_{country_slug}_{name_slug}",
        ]
    else:
        candidates = [
            f"#club_{city_slug}",
            f"#club_{country_slug}_{city_slug}",
            f"#club_{country_slug}_{city_slug}_{name_slug}",
        ]

    for c in candidates:
        if c not in seen:
            return c
    base = candidates[-1]
    suffix = 2
    while f"{base}_{suffix}" in seen:
        suffix += 1
    return f"{base}_{suffix}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument(
        "--db",
        default=os.environ.get("FOOTBAG_DB_PATH", "database/footbag.db"),
    )
    add_contract_args(ap, audit_default="club_cutover_audit.csv",
                      rollback_default="club_cutover_rollback.sql")
    args = ap.parse_args()

    assert_maintainer_db_target(args.db, "06_cutover_pre_populated_clubs.py")

    db_path = Path(args.db)
    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        return 1
    if not SEED_CSV.exists():
        print(f"ERROR: clubs seed CSV not found at {SEED_CSV}", file=sys.stderr)
        print("       Run legacy_data/scripts/extract_clubs.py first.", file=sys.stderr)
        return 1

    # Index seed/clubs.csv by legacy_club_key for on-demand full-row fallback
    with open(SEED_CSV, newline="", encoding="utf-8") as f:
        seed_by_key = {r["legacy_club_key"]: r for r in csv.DictReader(f)}

    url_verdicts = load_url_verdicts(VERDICTS_CSV)

    ts = now_iso()
    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys = ON")

    def plan_cutover():
        """Decide every write without making one.

        Returns an exit code when the run should stop before writing anything,
        and otherwise the plan. The early exits below are the original
        preflights, unchanged: they are reasons not to write at all, which is
        now simply the value this function hands back.
        """
        plan = CutoverPlan()

        # Iterate all candidates (not just bootstrap_eligible). Linkage is
        # written for every candidate whose clubs row exists. Fallback INSERT
        # of a missing clubs row is restricted to bootstrap_eligible=1 (the
        # prod cutover contract); other candidates that lack a matching clubs
        # row are skipped without error. In prod this iterates 1037 rows;
        # only 41 take the fallback INSERT path. In dev (load_clubs_seed.py
        # already created all 311 clubs) the 311 matching candidates get
        # mapped_club_id stamped here, no fallback INSERT runs.
        all_candidates = con.execute(
            """
            SELECT legacy_club_key, display_name, city, country, bootstrap_eligible,
                   classification, mapped_club_id, updated_at, updated_by, version
            FROM legacy_club_candidates
            ORDER BY legacy_club_key
            """
        ).fetchall()
        # The stamp's own no-op predicate, read rather than attempted: a stamp
        # already pointing at the right club changes nothing, and that has to be
        # known here for the audit to say so before the write.
        current_mapping = {row[0]: row[6] for row in all_candidates}
        candidate_before = {row[0]: (row[0], row[6], row[7], row[8], row[9])
                            for row in all_candidates}

        if not all_candidates:
            print(
                "ERROR: legacy_club_candidates is empty; nothing to cut over.",
                file=sys.stderr,
            )
            print(
                "       Phase H requires Phase G enrichment to populate "
                "legacy_club_candidates first. Confirm "
                "event_results/scripts/09_load_enrichment_to_sqlite.py ran "
                "against a fresh legacy_club_candidates.csv.",
                file=sys.stderr,
            )
            return 1

        # Pre-flight: distinguish "Phase G classifier didn't run" (CI smoke
        # fixture skips it; reset-local-db.sh on a sparse local mirror also
        # skips it) from "Phase G ran but emitted 0 eligible" (real
        # regression). The seed loader (load_club_members_seed.py) inserts
        # candidates with classification='dormant' as a default; Phase G's
        # classifier (clubs/scripts/02_build_legacy_club_candidates.py)
        # promotes the eligible cohort to 'pre_populate' / 'onboarding_visible'
        # and demotes some to 'junk'. If every candidate is still 'dormant',
        # the classifier never refined the defaults — exit cleanly. If any
        # candidate carries a non-dormant classification but no row is
        # bootstrap_eligible, the classifier ran and regressed — fail-fast.
        non_dormant_count = sum(1 for r in all_candidates if r[5] != 'dormant')
        eligible_count    = sum(1 for r in all_candidates if r[4])

        if non_dormant_count == 0:
            print(
                "  → Phase H: skipping pre-populate cutover (Phase G "
                "classifier did not run; every candidate still carries "
                "the seed-default classification='dormant').",
                file=sys.stderr,
            )
            print(
                "       This is the expected state in CI smoke fixtures "
                "and sparse local mirrors. Run "
                "clubs/scripts/02_build_legacy_club_candidates.py to "
                "populate classifications.",
                file=sys.stderr,
            )
            return 0

        if eligible_count == 0:
            print(
                "ERROR: legacy_club_candidates has 0 bootstrap_eligible=1 "
                "rows; Phase H would produce zero pre_populate clubs.",
                file=sys.stderr,
            )
            print(
                "       Phase G classifier ran (non-dormant classifications "
                "exist) but no candidates are eligible. The §10.1 classifier "
                "rules regressed silently. Confirm "
                "clubs/scripts/02_build_legacy_club_candidates.py classifier "
                "rules and the input clubs CSV.",
                file=sys.stderr,
            )
            return 1

        # Preflight: detect missing seed-CSV rows for eligible candidates
        # BEFORE any writes. Without this, the main loop below partially
        # commits clubs + tags + mapped_club_id stamps for eligible
        # candidates that DO have seed rows, then returns 1 at the end with
        # the missing ones reported — leaving the DB in a half-cutover
        # state (some pre_populate clubs exist, some don't). Fail-fast here
        # keeps Phase H writes atomic across the bootstrap-eligible cohort.
        preflight_missing_seed: list[str] = []
        for _candidate in all_candidates:
            _legacy_key, _bootstrap_eligible = _candidate[0], _candidate[4]
            if not _bootstrap_eligible:
                continue
            _club_id = stable_id("club", _legacy_key)
            _club_exists = con.execute(
                "SELECT 1 FROM clubs WHERE id = ?", (_club_id,)
            ).fetchone() is not None
            if not _club_exists and _legacy_key not in seed_by_key:
                preflight_missing_seed.append(_legacy_key)

        if preflight_missing_seed:
            print(
                f"ERROR: {len(preflight_missing_seed)} eligible candidate(s) "
                f"missing from seed CSV ({SEED_CSV}):",
                file=sys.stderr,
            )
            for k in preflight_missing_seed[:10]:
                print(f"    {k}", file=sys.stderr)
            if len(preflight_missing_seed) > 10:
                print(
                    f"    ... and {len(preflight_missing_seed) - 10} more",
                    file=sys.stderr,
                )
            print(
                "       Eligible candidates without seed rows would leave "
                "mapped_club_id NULL, which FK-fails downstream in "
                "07_load_bootstrap_leaders.py. Resolve the seed/clubs.csv "
                "gap before re-running. No partial writes performed.",
                file=sys.stderr,
            )
            return 1

        # Cascade ordering: bootstrap_eligible first, then classification
        # priority, then alphabetical. Higher-priority clubs claim shorter slugs.
        all_candidates.sort(key=lambda r: (
            0 if r[4] else 1,
            _CLASSIFICATION_ORDER.get(r[5], 99),
            (r[1] or '').lower(),
        ))

        # Prime slug-collision space for the fallback INSERT path.
        existing_tags = {
            r[0]
            for r in con.execute(
                "SELECT tag_normalized FROM tags WHERE standard_type = 'club'"
            )
        }
        for _candidate in all_candidates:
            existing_tags.add(f"#club_{slugify(_candidate[3] or '')}")

        # Simulated as the loop goes, because an earlier iteration's planned club
        # is what a later duplicate's canonical-exists check has to see. Reading
        # the database each time would answer for the state before this run.
        clubs_present = {r[0] for r in con.execute("SELECT id FROM clubs")}
        tags_present = {r[0] for r in con.execute("SELECT id FROM tags")}

        clubs_inserted = 0
        clubs_existed = 0
        tags_inserted = 0
        mappings_written = 0
        mappings_unchanged = 0
        candidates_skipped_no_club = 0
        duplicates_merged = 0
        duplicates_unmapped = 0
        missing_seed: list[str] = []

        dup_map = load_duplicate_canonical_map()

        def stamp(legacy_key: str, club_id: str) -> bool:
            """Plan the mapped_club_id stamp, answering whether it changes anything.

            Idempotent exactly as the UPDATE was: a candidate already pointing at
            this club is left alone, and says so in the audit rather than being
            rewritten to the same value with a bumped version.
            """
            if current_mapping.get(legacy_key) == club_id:
                return False
            plan.stamps.append((club_id, ts, legacy_key))
            plan.before_candidates.append(candidate_before[legacy_key])
            current_mapping[legacy_key] = club_id
            return True

        for _candidate in all_candidates:
            (legacy_key, display_name, city, country, bootstrap_eligible,
             _classification) = _candidate[:6]
            # Dedup: if this is a known duplicate (entry B), point at
            # entry A's club row instead. No tag/club INSERT for B.
            canonical_key = dup_map.get(legacy_key)
            if canonical_key is not None:
                canonical_club_id = stable_id("club", canonical_key)
                # The merge only means something when the canonical (keep) club
                # was promoted to a clubs row. When both rows in a duplicate pair
                # classify below pre_populate, neither is promoted, so there is no
                # clubs row to point at; stamping mapped_club_id here would
                # FK-fail. Leave the duplicate unmapped, exactly like any other
                # non-promoted candidate: it still surfaces through onboarding.
                if canonical_club_id not in clubs_present:
                    duplicates_unmapped += 1
                    plan.audit.append({
                        "action": "skip", "legacy_club_key": legacy_key,
                        "club_id": canonical_club_id, "tag_id": "",
                        "club_name": display_name or "",
                        "old_mapped_club_id": current_mapping.get(legacy_key) or "",
                        "new_mapped_club_id": "",
                        "reason": "duplicate whose canonical club was not promoted",
                    })
                    continue
                if stamp(legacy_key, canonical_club_id):
                    duplicates_merged += 1
                    plan.audit.append({
                        "action": "stamp", "legacy_club_key": legacy_key,
                        "club_id": canonical_club_id, "tag_id": "",
                        "club_name": display_name or "",
                        "old_mapped_club_id": candidate_before[legacy_key][1] or "",
                        "new_mapped_club_id": canonical_club_id,
                        "reason": "duplicate merged onto the canonical club",
                    })
                continue

            club_id = stable_id("club", legacy_key)
            tag_id = stable_id("tag", "club", legacy_key)

            # Does the clubs row already exist? Common case after load_clubs_seed.
            club_exists = club_id in clubs_present

            if not club_exists:
                if not bootstrap_eligible:
                    # Non-eligible candidate with no matching clubs row: skip
                    # without error. This is the normal prod case for 996
                    # non-pre_populate candidates.
                    candidates_skipped_no_club += 1
                    continue

                # Fallback: create from seed CSV (first-run scenario for
                # bootstrap-eligible candidates).
                seed_row = seed_by_key.get(legacy_key)
                if not seed_row:
                    missing_seed.append(legacy_key)
                    continue

                tag_normalized = make_tag_normalized(
                    seed_row["name"],
                    seed_row["country"],
                    seed_row["city"],
                    existing_tags,
                )
                existing_tags.add(tag_normalized)

                if tag_id not in tags_present:
                    plan.tag_inserts.append(
                        (tag_id, ts, ts, tag_normalized, tag_normalized))
                    tags_present.add(tag_id)
                    tags_inserted += 1

                # Club contact is leader-supplied during onboarding, never
                # carried from the legacy seed, so no legacy contact email is
                # written onto live clubs.
                # External-URL safety verdict (data-prep time; see VERDICTS_CSV).
                # Applied only when the verdict still matches this row's URL; an
                # unmatched or absent verdict leaves the columns NULL so the
                # public read hides the URL until it is verified.
                ext_url = seed_row.get("external_url") or None
                verdict = url_verdicts.get(legacy_key)
                ext_validated_at = None
                ext_quarantine = None
                if ext_url and verdict and verdict["external_url"] == ext_url:
                    ext_validated_at = verdict["validated_at"]
                    ext_quarantine = verdict["quarantine_reason"]

                plan.club_inserts.append((
                    club_id, ts, ts,
                    seed_row["name"],
                    seed_row.get("description", ""),
                    seed_row["city"],
                    seed_row.get("region") or None,
                    seed_row["country"],
                    ext_url,
                    ext_validated_at,
                    ext_quarantine,
                    tag_id,
                ))
                clubs_present.add(club_id)
                clubs_inserted += 1
                plan.audit.append({
                    "action": "insert_club", "legacy_club_key": legacy_key,
                    "club_id": club_id, "tag_id": tag_id,
                    "club_name": seed_row["name"],
                    "old_mapped_club_id": current_mapping.get(legacy_key) or "",
                    "new_mapped_club_id": club_id,
                    "reason": "bootstrap-eligible candidate with no live club row",
                })
            else:
                clubs_existed += 1

            # Stamp mapped_club_id for every candidate whose clubs row exists.
            if stamp(legacy_key, club_id):
                mappings_written += 1
                plan.audit.append({
                    "action": "stamp", "legacy_club_key": legacy_key,
                    "club_id": club_id, "tag_id": "",
                    "club_name": display_name or "",
                    "old_mapped_club_id": candidate_before[legacy_key][1] or "",
                    "new_mapped_club_id": club_id, "reason": "",
                })
            else:
                mappings_unchanged += 1

        plan.candidates_seen = len(all_candidates)
        plan.missing_seed = missing_seed
        plan.counters = {
            "clubs_inserted": clubs_inserted,
            "clubs_existed": clubs_existed,
            "tags_inserted": tags_inserted,
            "mappings_written": mappings_written,
            "mappings_unchanged": mappings_unchanged,
            "duplicates_merged": duplicates_merged,
            "duplicates_unmapped": duplicates_unmapped,
            "candidates_skipped_no_club": candidates_skipped_no_club,
        }
        return plan

    outcome = plan_cutover()
    if isinstance(outcome, int):
        con.close()
        return outcome
    plan = outcome

    contract = CutoverWrite("06_cutover_pre_populated_clubs.py", args,
                            audit_fields=AUDIT_FIELDS)
    contract.plan(
        con,
        snapshot=make_snapshot(
            {key for _club, _ts, key in plan.stamps},
            {row[0] for row in plan.club_inserts},
            {row[0] for row in plan.tag_inserts},
        ),
        audit_rows=plan.audit,
        rollback_sql=rollback_statements(plan),
        rollback_note=("Unstamps the candidates this run would map, then removes the "
                       "club rows it would create and the tags they carry, in that "
                       "order because the foreign keys point that way. Clubs and tags "
                       "that were already there are not touched."),
    )
    report_artifacts(
        contract,
        len(plan.club_inserts) + len(plan.tag_inserts) + len(plan.stamps),
    )

    def write(cur) -> None:
        cur.executemany(TAG_INSERT_SQL, plan.tag_inserts)
        cur.executemany(CLUB_INSERT_SQL, plan.club_inserts)
        cur.executemany(STAMP_SQL, plan.stamps)

    written = contract.apply(con, write)

    con.close()

    counters = plan.counters
    clubs_inserted = counters["clubs_inserted"] if written else 0
    clubs_existed = counters["clubs_existed"]
    tags_inserted = counters["tags_inserted"] if written else 0
    mappings_written = counters["mappings_written"] if written else 0
    mappings_unchanged = counters["mappings_unchanged"]
    duplicates_merged = counters["duplicates_merged"] if written else 0
    duplicates_unmapped = counters["duplicates_unmapped"]
    candidates_skipped_no_club = counters["candidates_skipped_no_club"]
    missing_seed = plan.missing_seed

    print("Club cutover (live clubs + linkage) complete:")
    print(f"  candidates seen:           {plan.candidates_seen}")
    print(f"  clubs rows planned:        {len(plan.club_inserts)}")
    print(f"  candidate stamps planned:  {len(plan.stamps)}")
    print(f"  clubs rows inserted:       {clubs_inserted}")
    print(f"  clubs rows pre-existed:    {clubs_existed}")
    print(f"  tags rows inserted:        {tags_inserted}")
    print(f"  candidate mappings written: {mappings_written}")
    print(f"  candidate mappings unchanged (already set): {mappings_unchanged}")
    print(f"  duplicates merged (entry B → entry A): {duplicates_merged}")
    print(f"  duplicates left unmapped (canonical not promoted): {duplicates_unmapped}")
    print(f"  non-eligible candidates skipped (no matching clubs row): {candidates_skipped_no_club}")
    if missing_seed:
        print(
            f"ERROR: {len(missing_seed)} eligible candidate(s) missing from "
            f"seed CSV ({SEED_CSV}):",
            file=sys.stderr,
        )
        for k in missing_seed[:10]:
            print(f"    {k}", file=sys.stderr)
        if len(missing_seed) > 10:
            print(f"    ... and {len(missing_seed) - 10} more", file=sys.stderr)
        print(
            "       Eligible candidates without seed rows leave "
            "mapped_club_id NULL, which FK-fails downstream in "
            "07_load_bootstrap_leaders.py. Resolve the seed/clubs.csv gap "
            "before re-running.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

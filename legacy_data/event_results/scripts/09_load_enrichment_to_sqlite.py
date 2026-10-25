#!/usr/bin/env python3
"""
09_load_enrichment_to_sqlite.py

Loads legacy enrichment pipeline outputs into the footbag platform SQLite DB.
Must run AFTER 08_load_mvfp_seed_full_to_sqlite.py (canonical data already present).

Inputs (paths relative to legacy_data/ unless absolute):
  persons/out/persons_master.csv
  clubs/out/legacy_club_candidates.csv
  clubs/out/legacy_person_club_affiliations.csv

Loads:
  1. historical_persons       — provisional persons (person_type = PROVISIONAL)
  2. legacy_club_candidates   — all 311 mirror-derived club candidates
  3. legacy_person_club_affiliations — scored person→club affiliation graph

Deferred (not loaded here):
  club_bootstrap_leaders — requires live clubs rows (FK NOT NULL to clubs.id).
  Clubs are publicly accessible at /clubs. Creating them is a deliberate next step.

Usage:
  python event_results/scripts/09_load_enrichment_to_sqlite.py \\
    --db path/to/footbag.db \\
    --persons-csv persons/out/persons_master.csv \\
    --candidates-csv clubs/out/legacy_club_candidates.csv \\
    --affiliations-csv clubs/out/legacy_person_club_affiliations.csv
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import sys
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts" / "lib"))
from db_cutover_guard import assert_maintainer_db_target  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # legacy_data/
from pipeline.identity.name_damage import (  # noqa: E402
    NAME_PENDING_ACCOUNT_REPAIR, UNKNOWN_NAME, roster_name_damage,
)


# ---------------------------------------------------------------------------
# Utilities (mirror script 08 style)
# ---------------------------------------------------------------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stable_id(prefix: str, *parts: str) -> str:
    raw = "||".join(str(p) for p in parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]
    return f"{prefix}_{digest}"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        return [{k: (v if v is not None else "") for k, v in row.items()} for row in reader]


def opt_int(val: str) -> int | None:
    v = val.strip()
    if not v:
        return None
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None


def opt_float(val: str) -> float | None:
    v = val.strip()
    if not v:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def opt_str(val: str) -> str | None:
    v = val.strip()
    return v if v else None


# Allowed values for legacy_club_candidates.classification, matching the
# CHECK constraint in database/schema.sql. Kept in sync with the CSV producer
# at clubs/scripts/02_build_legacy_club_candidates.py.
ALLOWED_CLASSIFICATIONS = frozenset({
    "pre_populate", "onboarding_visible", "dormant", "junk",
})


def norm_classification(raw: str) -> str:
    """Normalise a CSV classification value: trim + lowercase. Empty stays empty."""
    return (raw or "").strip().lower()


def parse_bool_col(value: str) -> int:
    v = value.strip().lower()
    if v in ("", "n", "0", "false"):
        return 0
    if v in ("y", "1", "true"):
        return 1
    raise ValueError(f"Unrecognised boolean value: {value!r}")


def normalize_role(role: str) -> str:
    """Normalise CSV role values to DB CHECK values (co_leader → co-leader)."""
    return role.strip().replace("_", "-")


def refuse_unloaded(lost: dict[str, int]) -> None:
    """Stop the load, before anything is committed, when a row the person and club
    pipelines produced could not be stored. Rows set aside by a deliberate rule (a
    name that is not a person, a duplicate of a stored row) are not losses and are
    only counted."""
    if any(lost.values()):
        raise SystemExit("09 aborted: rows that would not load; nothing was committed: "
                         + ", ".join(f"{reason} {n}" for reason, n in lost.items() if n))


def translate_membership_only_pid(
    matched_pid: str,
    member_name_norm: str,
    provisional_name_to_pid: dict[str, list[str]],
    known_person_ids: set[str],
) -> tuple[str, str]:
    """Resolve a ``membership_only::*`` matched_person_id to its
    corresponding ``master_person::*`` ID via normalized-name lookup
    against the just-loaded PROVISIONAL persons.

    Background: ``clubs/scripts/01_build_club_person_universe.py`` emits
    ``f"membership_only::{sha1(name_norm)[:16]}"`` IDs for membership-only
    persons; ``persons/scripts/05_build_persons_master.py`` emits
    ``f"master_person::{sha1('master|' + source_types + '|' + name_norm)[:16]}"``
    for the same people. The two ID generators are independent and
    produce different IDs for the same person, so the affiliations FK to
    historical_persons.person_id misses and the historical_person_id
    column ends up NULL. This function bridges the gap at loader time by
    keying on the normalized name, which is consistent across both
    upstream scripts because both derive it from the canonical
    alias_resolver.normalize_name.

    Returns ``(translated_pid, outcome)`` where outcome ∈
    ``{translated, no_match, ambiguous, not_applicable}``.

      * ``translated``     — single unambiguous PROVISIONAL match found
                              and present in historical_persons; caller
                              should use ``translated_pid``.
      * ``no_match``       — no PROVISIONAL row in persons_master shares
                              the affiliation's name_norm; caller falls
                              back to NULL.
      * ``ambiguous``      — multiple PROVISIONAL rows share the
                              name_norm (rare; would mean two distinct
                              provisional persons collide); caller falls
                              back to NULL rather than guess.
      * ``not_applicable`` — matched_pid is not a ``membership_only::*``
                              ID; caller should keep the existing
                              fallback path unchanged.
    """
    if not matched_pid.startswith("membership_only::"):
        return matched_pid, "not_applicable"
    if not member_name_norm:
        return "", "no_match"
    candidates = provisional_name_to_pid.get(member_name_norm, [])
    loaded = [c for c in candidates if c in known_person_ids]
    if len(loaded) == 1:
        return loaded[0], "translated"
    if len(loaded) == 0:
        return "", "no_match"
    return "", "ambiguous"


import re as _re
import unicodedata as _unicodedata


def _norm_name(name: str) -> str:
    """Strip diacritics, lowercase, collapse whitespace, remove periods."""
    nfkd = _unicodedata.normalize("NFKD", name)
    stripped = "".join(c for c in nfkd if not _unicodedata.combining(c))
    s = stripped.lower().strip().replace(".", "")
    return _re.sub(r"\s+", " ", s)


def _aggressive_norm(name: str) -> str:
    """Drop middle names/initials — keep first + last word only."""
    s = _norm_name(name)
    parts = s.split()
    if len(parts) > 2:
        return f"{parts[0]} {parts[-1]}"
    return s


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Load enrichment CSVs into footbag SQLite DB")
    parser.add_argument("--db", required=True, help="Path to footbag.db")
    parser.add_argument("--persons-csv",      required=True)
    parser.add_argument("--candidates-csv",   required=True)
    parser.add_argument("--affiliations-csv", required=True)
    args = parser.parse_args()

    assert_maintainer_db_target(args.db, "09_load_enrichment_to_sqlite.py")

    db_path          = Path(args.db)
    persons_csv      = Path(args.persons_csv)
    candidates_csv   = Path(args.candidates_csv)
    affiliations_csv = Path(args.affiliations_csv)

    for p in [db_path, persons_csv, candidates_csv, affiliations_csv]:
        if not p.exists():
            raise FileNotFoundError(f"Required file not found: {p}")

    ts          = now_iso()
    system_user = "system:enrichment_seed"

    persons_rows      = read_csv(persons_csv)
    candidates_rows   = read_csv(candidates_csv)
    affiliations_rows = read_csv(affiliations_csv)

    print(f"Persons master:       {len(persons_rows):,} rows")
    print(f"Club candidates:      {len(candidates_rows):,} rows")
    print(f"Person affiliations:  {len(affiliations_rows):,} rows")

    # Pre-load validation: every candidate row must carry a recognised
    # classification. Fail fast before any DB write so a bad CSV does not
    # blow away the existing legacy_club_candidates table mid-transaction.
    _bad_classifications: list[tuple[str, str]] = []
    for _row in candidates_rows:
        _val = norm_classification(_row.get("category", ""))
        if _val not in ALLOWED_CLASSIFICATIONS:
            _bad_classifications.append((_row.get("club_key", "?"), _row.get("category", "")))
    if _bad_classifications:
        print(
            f"ERROR: {len(_bad_classifications)} row(s) in {candidates_csv} have "
            f"unrecognised category. Allowed: {sorted(ALLOWED_CLASSIFICATIONS)}",
            file=sys.stderr,
        )
        for _key, _val in _bad_classifications[:20]:
            print(f"  club_key={_key!r}: category={_val!r}", file=sys.stderr)
        if len(_bad_classifications) > 20:
            print(f"  ... and {len(_bad_classifications) - 20} more", file=sys.stderr)
        raise SystemExit(1)

    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")

        # ------------------------------------------------------------------
        # Step 1 — Provisional persons → historical_persons
        # ------------------------------------------------------------------
        print("\nLoading provisional persons → historical_persons...")

        # Refresh PROVISIONAL rows only. CANONICAL rows are owned by script 08
        # (which DELETE+INSERTs them from the MVFP seed); leaving them intact
        # is required so this step stays safe when run standalone (e.g.
        # `run_pipeline.sh enrichment_only`). The prior no-DELETE path silently
        # dropped updates to existing PROVISIONAL rows when the provisional
        # persons master CSV was regenerated. DELETE runs BEFORE the dedup
        # set is built so the set contains only CANONICAL-owned names; otherwise
        # stale PROVISIONAL names would mask themselves and the insert loop
        # would produce zero rows on re-invocation.
        #
        # legacy_person_club_affiliations is the leaf child of BOTH the
        # PROVISIONAL persons cleared here and the legacy_club_candidates
        # cleared in Step 2, and neither FK cascades. Clear that child up front
        # so both parent DELETEs succeed when re-run over a populated DB; a fresh
        # DB has nothing to delete and is unaffected. It is rebuilt in Step 3.
        conn.execute("DELETE FROM legacy_person_club_affiliations")
        _prov_deleted = conn.execute(
            "DELETE FROM historical_persons WHERE source_scope = 'PROVISIONAL'"
        ).rowcount
        if _prov_deleted:
            print(f"  Cleared {_prov_deleted:,} prior PROVISIONAL rows (CANONICAL preserved).")

        # Build normalized-name index of canonical persons already in DB
        # so we can skip provisional persons that duplicate them.
        _existing_rows = conn.execute(
            "SELECT person_name FROM historical_persons"
        ).fetchall()
        _existing_norm: set[str] = set()
        _existing_aggressive: set[str] = set()
        for (pn,) in _existing_rows:
            if pn:
                _existing_norm.add(_norm_name(pn))
                _existing_aggressive.add(_aggressive_norm(pn))

        provisional_raw = [r for r in persons_rows if r.get("person_type", "") == "PROVISIONAL"]
        # A provisional person comes from a club roster or the membership list,
        # so the row is a real person and loads with its name as written. A name
        # the source damaged in encoding is never stored as the person's name.
        # When the roster row links to a legacy account, the person loads under
        # the unknown-name placeholder with that link, and the damaged source
        # text is kept in notes as unresolved: the account's repaired name, from
        # the member load, replaces it. With no account link there is no route to
        # a repaired name, and the load stops. A name that duplicates an existing
        # canonical person is that person, and is counted.
        persons_garbled: list[str] = []
        persons_name_pending = 0
        persons_dedup_skipped = 0
        provisional = []
        for r in provisional_raw:
            pn = r.get("person_name", "").strip()
            damage = roster_name_damage(pn)
            if damage:
                if not (r.get("legacy_member_id") or "").strip():
                    persons_garbled.append(r.get("master_person_id", "").strip())
                    continue
                r = {**r, "person_name": UNKNOWN_NAME,
                     "notes": f"{NAME_PENDING_ACCOUNT_REPAIR} ({damage}): {pn}"}
                persons_name_pending += 1
                provisional.append(r)
                continue
            if _norm_name(pn) in _existing_norm or _aggressive_norm(pn) in _existing_aggressive:
                persons_dedup_skipped += 1
                continue
            provisional.append(r)
        print(f"  PROVISIONAL rows: {len(provisional):,} (CANONICAL rows skipped — already loaded by script 08)")
        if persons_name_pending:
            print(f"  Name pending its legacy account's repair: {persons_name_pending}")
        if persons_garbled:
            print(f"  ERROR: {len(persons_garbled)} name(s) damaged in encoding with no legacy "
                  f"account to repair them from: {persons_garbled}")
        if persons_dedup_skipped:
            print(f"  Dedup filter: {persons_dedup_skipped} duplicate(s) of existing canonical persons skipped")

        persons_inserted = 0
        persons_no_id    = 0
        persons_refused  = 0
        persons_ignored  = 0

        for row in provisional:
            pid = row["master_person_id"].strip()
            if not pid:
                persons_no_id += 1
                continue

            try:
                cur = conn.execute(
                    """
                    INSERT OR IGNORE INTO historical_persons (
                      person_id, person_name, legacy_member_id,
                      country, first_year, last_year,
                      bap_member, bap_nickname, bap_induction_year,
                      hof_member, hof_induction_year,
                      notes, source, source_scope
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        pid,
                        row["person_name"].strip(),
                        opt_str(row.get("legacy_member_id", "")),
                        opt_str(row.get("country", "")),
                        opt_int(row.get("first_year", "")),
                        opt_int(row.get("last_year", "")),
                        parse_bool_col(row.get("bap_member", "0")),
                        opt_str(row.get("bap_nickname", "")),
                        opt_int(row.get("bap_induction_year", "")),
                        parse_bool_col(row.get("hof_member", "0")),
                        opt_int(row.get("hof_induction_year", "")),
                        opt_str(row.get("notes", "")),
                        opt_str(row.get("source_types", "")),
                        row.get("person_type", "PROVISIONAL").strip(),
                    ),
                )
                # cur.rowcount is 1 if the row was inserted, 0 if INSERT OR
                # IGNORE silently skipped (e.g. PK collision with a CANONICAL
                # row of the same person_id). Raw `+= 1` would double-count
                # the ignored case.
                if cur.rowcount:
                    persons_inserted += 1
                else:
                    persons_ignored += 1
            except sqlite3.IntegrityError as e:
                print(f"  ERROR: person {pid!r} refused — {e}")
                persons_refused += 1

        print(
            f"  Inserted: {persons_inserted:,}  "
            f"Ignored (PK collision with CANONICAL): {persons_ignored:,}  "
            f"No person id: {persons_no_id:,}  "
            f"Refused by the database: {persons_refused:,}"
        )

        # Build name_norm → master_person_id map for the just-loaded PROVISIONAL
        # cohort. Consumed by the affiliations loop below to bridge the
        # membership_only::* → master_person::* ID drift between
        # clubs/scripts/01 and persons/scripts/05 (same person, two different
        # ID generators). See translate_membership_only_pid() docstring.
        provisional_name_to_pid: dict[str, list[str]] = {}
        for r in provisional:
            nn  = (r.get("person_name_norm") or "").strip()
            mid = (r.get("master_person_id")  or "").strip()
            if nn and mid:
                provisional_name_to_pid.setdefault(nn, []).append(mid)

        # ------------------------------------------------------------------
        # Step 2 — Legacy club candidates → legacy_club_candidates
        # ------------------------------------------------------------------
        print("\nLoading club candidates → legacy_club_candidates...")

        # Refresh both enrichment tables from the fresh CSV. The prior
        # INSERT OR IGNORE-only pattern silently skipped every existing
        # legacy_club_key on re-runs, leaving upstream classifier changes
        # (e.g. bootstrap_eligible) stranded at stale DB values.
        # The affiliations child (FK: legacy_person_club_affiliations
        # .legacy_club_candidate_id → legacy_club_candidates.id) was already
        # cleared before Step 1, so the parent has no remaining FK references.
        conn.execute("DELETE FROM legacy_club_candidates")

        # Build key → id map for use in step 3
        candidate_id_map: dict[str, str] = {}

        candidates_inserted = 0
        candidates_no_key   = 0
        candidates_duplicate_key = 0
        candidates_refused  = 0

        for row in candidates_rows:
            club_key = row["club_key"].strip()
            if not club_key:
                candidates_no_key += 1
                continue

            lcc_id = stable_id("lcc", club_key)
            candidate_id_map[club_key] = lcc_id

            # Defensive normalisation (pre-load already validated). Empty maps
            # to None so a missing value surfaces as a clean NOT NULL violation
            # instead of a silent CHECK failure on empty string. Anything that
            # somehow slipped past pre-load is logged before the INSERT attempt.
            _classification_raw = row.get("category", "")
            _classification = norm_classification(_classification_raw)
            if not _classification:
                import sys
                print(
                    f"  WARN: candidate {club_key!r} has empty category; "
                    f"INSERT will fail NOT NULL",
                    file=sys.stderr,
                )
                _classification_to_bind = None
            elif _classification not in ALLOWED_CLASSIFICATIONS:
                import sys
                print(
                    f"  WARN: candidate {club_key!r} category="
                    f"{_classification_raw!r} normalised={_classification!r} "
                    f"not in allowed set; INSERT will fail CHECK",
                    file=sys.stderr,
                )
                _classification_to_bind = _classification
            else:
                _classification_to_bind = _classification

            try:
                cur = conn.execute(
                    """
                    INSERT OR IGNORE INTO legacy_club_candidates (
                      id, created_at, created_by, updated_at, updated_by, version,
                      legacy_club_key, display_name, city, region, country,
                      confidence_score, mapped_club_id, bootstrap_eligible,
                      classification,
                      contact_signal_substitute_applied,
                      last_hosted_year, max_affiliated_member_last_year,
                      contact_member_last_year, created_year, last_updated_year,
                      unique_member_names, linkable_member_count, ever_hosted,
                      -- Live-content fields published onto the club at promotion.
                      -- external_url is the raw extracted value; it is validated
                      -- before going live (external_url_validated_at / quarantine
                      -- columns stay NULL here). Club contact is leader-supplied,
                      -- not carried from the legacy seed.
                      description, external_url
                    ) VALUES (
                      ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                      ?,
                      ?, ?, ?, ?, ?, ?, ?, ?,
                      ?, ?
                    )
                    """,
                    (
                        lcc_id, ts, system_user, ts, system_user,
                        club_key,
                        row["name"].strip(),
                        opt_str(row.get("city", "")),
                        opt_str(row.get("region", "")),
                        opt_str(row.get("country", "")),
                        opt_float(row.get("confidence_score", "")),
                        # mapped_club_id is owned by Phase H (06_cutover_pre_populated_clubs.py),
                        # which stamps it once the live clubs row exists. Writing it here
                        # violates the FK in prod, where clubs rows are created later.
                        None,
                        parse_bool_col(row.get("bootstrap_eligible", "0")),
                        _classification_to_bind,
                        parse_bool_col(row.get("contact_signal_substitute_applied", "0")),
                        opt_int(row.get("last_hosted_year", "")),
                        opt_int(row.get("max_affiliated_member_last_year", "")),
                        opt_int(row.get("contact_member_last_year", "")),
                        opt_int(row.get("created_year", "")),
                        opt_int(row.get("last_updated_year", "")),
                        opt_int(row.get("unique_member_names", "")),
                        opt_int(row.get("linkable_member_count", "")),
                        parse_bool_col(row.get("ever_hosted", "0")),
                        row.get("description") or "",
                        opt_str(row.get("external_url", "")),
                    ),
                )
                # cur.rowcount reports actual DB writes; raw += 1 would count
                # IGNORE'd collisions as inserts (bug would be masked only
                # because Step 2 now DELETEs the table up front, but kept
                # for honest accounting in case of future pattern changes).
                if cur.rowcount:
                    candidates_inserted += 1
                else:
                    # A second row for a club key already loaded; its values
                    # would be dropped, so this is a producer defect.
                    candidates_duplicate_key += 1
            except sqlite3.IntegrityError as e:
                print(f"  ERROR: candidate {club_key!r} refused — {e}")
                candidates_refused += 1

        print(f"  Inserted: {candidates_inserted:,}  No club key: {candidates_no_key:,}  "
              f"Duplicate club key: {candidates_duplicate_key:,}  "
              f"Refused by the database: {candidates_refused:,}")

        # ------------------------------------------------------------------
        # Step 3 — Person-club affiliations → legacy_person_club_affiliations
        # ------------------------------------------------------------------
        print("\nLoading affiliations → legacy_person_club_affiliations...")

        affiliations_inserted  = 0
        affiliations_duplicate = 0
        affiliations_no_identity = 0
        affiliations_refused   = 0
        affiliations_fk_miss   = 0
        affiliations_pid_fallback = 0
        affiliations_pid_translated = 0

        # Pre-load all person_ids present in historical_persons (CANONICAL already
        # loaded by script 08; PROVISIONAL just loaded above).  Matched person IDs
        # that reference membership-only provisional IDs not yet loaded (e.g.
        # membership_only::*) will be treated as unmatched — use legacy_member_id only.
        known_person_ids: set[str] = {
            row[0]
            for row in conn.execute("SELECT person_id FROM historical_persons").fetchall()
        }

        for row in affiliations_rows:
            club_key       = row["club_key"].strip()
            mirror_id      = row.get("mirror_member_id", "").strip()
            matched_pid    = row.get("matched_person_id", "").strip()
            member_name_norm = (row.get("member_name_norm") or "").strip()
            display_name   = row.get("display_name", "").strip()
            inferred_role  = normalize_role(row.get("inferred_role", "member"))
            conf           = opt_float(row.get("affiliation_confidence_score", ""))

            lcc_id = candidate_id_map.get(club_key)
            if not lcc_id:
                affiliations_fk_miss += 1
                continue

            # If matched_person_id is not present in historical_persons, attempt
            # the membership_only::* → master_person::* translation before
            # falling back to legacy_member_id only (avoids losing the FK
            # for the 41 / 42 drift victims where the same person carries
            # different IDs upstream — see translate_membership_only_pid()).
            if matched_pid and matched_pid not in known_person_ids:
                translated_pid, outcome = translate_membership_only_pid(
                    matched_pid, member_name_norm,
                    provisional_name_to_pid, known_person_ids,
                )
                if outcome == "translated":
                    affiliations_pid_translated += 1
                    matched_pid = translated_pid
                else:
                    # no_match, ambiguous, or not_applicable (a non-
                    # membership_only::* ID that's still unloaded) — all
                    # land at NULL like before. Counter is observable.
                    affiliations_pid_fallback += 1
                    matched_pid = ""

            # At least one of historical_person_id or legacy_member_id must be set
            historical_pid = matched_pid if matched_pid else None
            legacy_mid     = mirror_id   if mirror_id   else None

            if historical_pid is None and legacy_mid is None:
                affiliations_no_identity += 1
                continue

            # Stable deterministic ID: keyed on club + member/person + role
            lpca_key = matched_pid or mirror_id
            lpca_id  = stable_id("lpca", club_key, lpca_key, inferred_role)

            # resolution_status intentionally OMITTED — schema DEFAULT 'pending'
            # applies. Inferred enrichment rows arrive as 'pending' and
            # transition to 'confirmed_current' only when the member confirms
            # current affiliation via the onboarding wizard (DATA_MODEL §4.25).
            try:
                cur = conn.execute(
                    """
                    INSERT OR IGNORE INTO legacy_person_club_affiliations (
                      id, created_at, created_by, updated_at, updated_by, version,
                      historical_person_id, legacy_member_id,
                      legacy_club_candidate_id, inferred_role,
                      confidence_score,
                      display_name
                    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        lpca_id, ts, system_user, ts, system_user,
                        historical_pid,
                        legacy_mid,
                        lcc_id,
                        inferred_role,
                        conf,
                        opt_str(display_name),
                    ),
                )
                if cur.rowcount:
                    affiliations_inserted += 1
                else:
                    # The same club, person and role already loaded: a roster
                    # that lists one member twice is one affiliation.
                    affiliations_duplicate += 1
            except sqlite3.IntegrityError as e:
                print(f"  ERROR: affiliation {lpca_id!r} refused — {e}")
                affiliations_refused += 1

        print(f"  Inserted: {affiliations_inserted:,}  "
              f"Duplicate (same club, person and role): {affiliations_duplicate:,}  "
              f"No person or member id: {affiliations_no_identity:,}  "
              f"Refused by the database: {affiliations_refused:,}  "
              f"Missing candidate FK: {affiliations_fk_miss:,}  "
              f"PID translated (membership_only::* → master_person::*): "
              f"{affiliations_pid_translated:,}  "
              f"PID fallback (unresolved): {affiliations_pid_fallback:,}")
        refuse_unloaded({
            "provisional person whose name is damaged in encoding": len(persons_garbled),
            "provisional person with no id": persons_no_id,
            "provisional person refused by the database": persons_refused,
            "club candidate with no key": candidates_no_key,
            "second club candidate row for one key": candidates_duplicate_key,
            "club candidate refused by the database": candidates_refused,
            "affiliation with no person or member id": affiliations_no_identity,
            "affiliation refused by the database": affiliations_refused,
            "affiliation to a club with no candidate row": affiliations_fk_miss,
        })

        conn.commit()

        # ------------------------------------------------------------------
        # Row counts
        # ------------------------------------------------------------------
        print("\nDatabase row counts (enrichment tables):")
        for table in [
            "historical_persons",
            "legacy_club_candidates",
            "legacy_person_club_affiliations",
        ]:
            count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            print(f"  {table}: {count:,}")

        provisional_count = conn.execute(
            "SELECT COUNT(*) FROM historical_persons WHERE source_scope = 'PROVISIONAL'"
        ).fetchone()[0]
        print(f"  historical_persons (PROVISIONAL only): {provisional_count:,}")

    print("\nNote: club_bootstrap_leaders not loaded.")
    print("      Requires live clubs rows (FK NOT NULL). Next step: create clubs from")
    print("      bootstrap-eligible candidates, then load bootstrap leaders.")
    print("\nDone.")


if __name__ == "__main__":
    main()

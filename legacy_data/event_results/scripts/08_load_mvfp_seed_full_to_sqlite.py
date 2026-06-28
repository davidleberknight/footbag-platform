#!/usr/bin/env python3
"""
Load full MVFP seed CSVs into the actual Footbag platform SQLite schema.

Usage:
  python legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py \
    --db database/footbag.db \
    --seed-dir legacy_data/event_results/seed/mvfp_full
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import shutil
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stable_id(prefix: str, *parts: str) -> str:
    raw = "||".join(str(p) for p in parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]
    return f"{prefix}_{digest}"


def parse_bool_col(value: str) -> int:
    """Parse a boolean-like CSV field to 0 or 1.

    Accepts: Y/N, 1/0, True/False (case-insensitive), blank → 0.
    Raises ValueError for unrecognised non-empty values.
    """
    v = value.strip().lower()
    if v in ("", "n", "0", "false"):
        return 0
    if v in ("y", "1", "true"):
        return 1
    raise ValueError(f"Unrecognised boolean value: {value!r}")


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        return [{k: (v if v is not None else "") for k, v in row.items()} for row in reader]


def backup_db(db_path: Path) -> Path:
    backup_path = db_path.with_suffix(db_path.suffix + ".bak")
    shutil.copy2(db_path, backup_path)
    return backup_path


def normalize_team_type(team_type: str, discipline_name: str = "") -> str:
    t = (team_type or "").strip().lower()
    dn = (discipline_name or "").strip().lower()

    if t == "mixed_doubles":
        return "mixed_doubles"
    if t == "doubles":
        return "doubles"
    if t == "singles":
        return "singles"

    if "mixed" in dn and "double" in dn:
        return "mixed_doubles"
    if "double" in dn or "pairs" in dn or "team" in dn:
        return "doubles"
    return "singles"


def map_event_status(seed_status: str, start_date: str, end_date: str) -> tuple[str, str]:
    s = (seed_status or "").strip().lower()

    if s in {"draft", "pending_approval", "published", "registration_full", "closed", "completed", "canceled"}:
        platform_status = s
    elif s in {"no_results", ""}:
        platform_status = "completed"
    else:
        platform_status = "completed"

    registration_status = "closed" if platform_status in {"closed", "completed", "canceled"} else "open"
    return platform_status, registration_status


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="database/footbag.db")
    ap.add_argument("--seed-dir", default="legacy_data/event_results/seed/mvfp_full")
    ap.add_argument("--no-backup", action="store_true")
    args = ap.parse_args()

    db_path = Path(args.db)
    seed_dir = Path(args.seed_dir)

    if not db_path.exists():
        raise FileNotFoundError(f"Database not found: {db_path}")

    required = [
        "seed_events.csv",
        "seed_event_disciplines.csv",
        "seed_event_results.csv",
        "seed_event_result_participants.csv",
        "seed_persons.csv",
    ]
    for name in required:
        if not (seed_dir / name).exists():
            raise FileNotFoundError(f"Missing seed file: {seed_dir / name}")

    if not args.no_backup:
        backup = backup_db(db_path)
        print(f"Backup created: {backup}")

    seed_events = read_csv(seed_dir / "seed_events.csv")
    seed_disciplines = read_csv(seed_dir / "seed_event_disciplines.csv")
    seed_results = read_csv(seed_dir / "seed_event_results.csv")
    seed_participants = read_csv(seed_dir / "seed_event_result_participants.csv")
    seed_persons = read_csv(seed_dir / "seed_persons.csv")

    ts = now_iso()
    system_user = "seed_loader"

    conn = sqlite3.connect(db_path)
    # Foreign keys are enforced for the whole DELETE+INSERT reseed. Two
    # conditions make this safe:
    #   1. The delete sequence below removes child rows before their parents
    #      (event_result_entry_participants, which holds a FK to
    #      historical_persons, is deleted before historical_persons itself), so
    #      no delete strands a referencing row.
    #   2. The historical_persons insert binds legacy_member_id ->
    #      legacy_members for the rows that carry a member id. The member seed
    #      runs before this loader in every path that invokes it, so those
    #      parent rows exist when the insert binds them.
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row

    # This loader is a canonical reseed scoped to the rows it owns, so it re-runs
    # safely against a populated database. It owns: events it created
    # (created_by = 'seed_loader'), their disciplines / result entries /
    # participants and per-event hashtag tags, and the canonical historical_persons
    # (source_scope 'CANONICAL' or unset; loader 09 owns source_scope
    # 'PROVISIONAL'). Everything app-managed is left intact: app-created events,
    # registrations, event_organizers, event_results_uploads, and PROVISIONAL
    # persons. The strict (no-cascade) foreign keys force a child-before-parent
    # delete order.

    try:
        # ------------------------------------------------------------------
        # Ownership guard. A canonical (seed_loader) event must never carry
        # app-managed child rows. If one does, stop rather than delete the event
        # or strand/destroy app data — this makes the ownership boundary explicit.
        # ------------------------------------------------------------------
        for child in ("registrations", "event_organizers", "event_results_uploads"):
            offending = conn.execute(
                f"SELECT event_id FROM {child} WHERE event_id IN "
                "(SELECT id FROM events WHERE created_by = ?) LIMIT 1",
                (system_user,),
            ).fetchone()
            if offending:
                raise SystemExit(
                    f"08 aborted: app-managed {child} row references canonical event "
                    f"{offending[0]!r} (created_by='{system_user}'). Canonical events "
                    "must not carry app-managed rows."
                )

        # ------------------------------------------------------------------
        # Clear only this loader's canonical rows, children before parents, and
        # scoped to seed_loader events. net_team_appearance (loader 13's
        # downstream net rows, which loader 13 reseeds) references the canonical
        # result entries, so it is cleared first. registrations, event_organizers
        # and event_results_uploads are never touched.
        # ------------------------------------------------------------------
        print("Deleting this loader's canonical event/result data (scoped)...")
        canon_events = "(SELECT id FROM events WHERE created_by = ?)"
        canon_entries = (
            "(SELECT id FROM event_result_entries WHERE event_id IN "
            "(SELECT id FROM events WHERE created_by = ?))"
        )
        # Capture the canonical events' hashtag tags before the event rows go;
        # events reference tags, so the tag rows can only be removed afterward.
        canon_tag_ids = [
            r[0]
            for r in conn.execute(
                "SELECT hashtag_tag_id FROM events WHERE created_by = ?", (system_user,)
            )
        ]
        deleted: dict[str, int] = {}
        deleted["net_team_appearance"] = conn.execute(
            f"DELETE FROM net_team_appearance WHERE result_entry_id IN {canon_entries}",
            (system_user,),
        ).rowcount
        deleted["event_result_entry_participants"] = conn.execute(
            "DELETE FROM event_result_entry_participants WHERE result_entry_id IN "
            f"{canon_entries}",
            (system_user,),
        ).rowcount
        deleted["event_result_entries"] = conn.execute(
            f"DELETE FROM event_result_entries WHERE event_id IN {canon_events}",
            (system_user,),
        ).rowcount
        deleted["event_disciplines"] = conn.execute(
            f"DELETE FROM event_disciplines WHERE event_id IN {canon_events}",
            (system_user,),
        ).rowcount
        deleted["events"] = conn.execute(
            "DELETE FROM events WHERE created_by = ?", (system_user,)
        ).rowcount
        if canon_tag_ids:
            placeholders = ",".join("?" * len(canon_tag_ids))
            deleted["tags"] = conn.execute(
                f"DELETE FROM tags WHERE id IN ({placeholders})", canon_tag_ids
            ).rowcount
        else:
            deleted["tags"] = 0
        deleted["historical_persons"] = conn.execute(
            "DELETE FROM historical_persons "
            "WHERE source_scope = 'CANONICAL' OR source_scope IS NULL"
        ).rowcount

        print("  scoped delete row counts:")
        for table_name, n in deleted.items():
            print(f"    {table_name}: {n:,}")

        # ------------------------------------------------------------------
        # Load historical persons
        # ------------------------------------------------------------------
        print("Loading historical persons...")

        for row in seed_persons:
            conn.execute(
                """
                INSERT INTO historical_persons (
                  person_id,
                  person_name,
                  legacy_member_id,
                  country,
                  first_year,
                  last_year,
                  event_count,
                  placement_count,
                  bap_member,
                  bap_nickname,
                  bap_induction_year,
                  hof_member,
                  hof_induction_year,
                  freestyle_sequences,
                  freestyle_max_add,
                  freestyle_unique_tricks,
                  freestyle_diversity_ratio,
                  signature_trick_1,
                  signature_trick_2,
                  signature_trick_3,
                  source_scope
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row.get("person_id", "").strip() or None,
                    row.get("person_name", "").strip() or None,
                    (row.get("member_id") or row.get("ifpa_member_id", "")).strip() or None,
                    row.get("country", "").strip() or None,
                    int(row["first_year"]) if row.get("first_year", "").strip() else None,
                    int(row["last_year"]) if row.get("last_year", "").strip() else None,
                    int(row["event_count"]) if row.get("event_count", "").strip() else None,
                    int(row["placement_count"]) if row.get("placement_count", "").strip() else None,
                    parse_bool_col(row.get("bap_member", "")),
                    row.get("bap_nickname", "").strip() or None,
                    int(row["bap_induction_year"]) if row.get("bap_induction_year", "").strip() else None,
                    parse_bool_col(row.get("hof_member", "")),
                    int(row["hof_induction_year"]) if row.get("hof_induction_year", "").strip() else None,
                    int(row["freestyle_sequences"]) if row.get("freestyle_sequences", "").strip() else None,
                    float(row["freestyle_max_add"]) if row.get("freestyle_max_add", "").strip() else None,
                    int(row["freestyle_unique_tricks"]) if row.get("freestyle_unique_tricks", "").strip() else None,
                    float(row["freestyle_diversity_ratio"]) if row.get("freestyle_diversity_ratio", "").strip() else None,
                    row.get("signature_trick_1", "").strip() or None,
                    row.get("signature_trick_2", "").strip() or None,
                    row.get("signature_trick_3", "").strip() or None,
                    row.get("source_scope", "").strip() or None,
                ),
            )

        # ------------------------------------------------------------------
        # Insert events + tags
        # ------------------------------------------------------------------
        print("Loading events...")
        event_id_map: dict[str, str] = {}

        for row in seed_events:
            event_key = row["event_key"].strip()
            event_id = event_key
            event_id_map[event_key] = event_id

            year = (row.get("year") or "").strip()
            slug = (row.get("event_slug") or "").strip().lower().replace(" ", "_") or event_key.lower().replace("-", "_")
            # Strip leading or trailing year from slug — many slugs were generated
            # from event names that already contain the year, so the
            # #event_{year}_ prefix would double it.
            if year and slug.startswith(f"{year}_"):
                slug = slug[len(f"{year}_"):]
            if year and slug.endswith(f"_{year}"):
                slug = slug[: -len(f"_{year}")]
            # Canonical platform format: #event_{year}_{slug}
            hashtag = f"#event_{year}_{slug}" if year else f"#{slug}"
            tag_id = stable_id("tag", event_key)
            # Ensure tag_normalized is unique even if another non-event tag
            # already uses this normalized value. We keep the display hashtag
            # stable and only vary the normalized form if needed.
            base_normalized = hashtag.lower()
            tag_normalized = base_normalized
            suffix_idx = 1
            while conn.execute(
                "SELECT 1 FROM tags WHERE tag_normalized = ?",
                (tag_normalized,),
            ).fetchone():
                tag_normalized = f"{base_normalized}__{event_key.lower()}_{suffix_idx}"
                suffix_idx += 1
            title = row.get("event_name", "").strip()
            start_date = row.get("start_date", "").strip() or f'{row["year"]}-07-01'
            end_date = row.get("end_date", "").strip() or start_date
            city = row.get("city", "").strip()
            region = (row.get("region") or "").strip() or None
            country = row.get("country", "").strip() or "Unknown"
            status, registration_status = map_event_status(
                row.get("status", ""),
                start_date,
                end_date,
            )

            conn.execute(
                """
                INSERT INTO tags (
                  id, created_at, created_by, updated_at, updated_by, version,
                  tag_normalized, tag_display, is_standard, standard_type
                ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1, 'event')
                """,
                (tag_id, ts, system_user, ts, system_user, tag_normalized, hashtag),
            )

            conn.execute(
                """
                INSERT INTO events (
                  id, created_at, created_by, updated_at, updated_by, version,
                  title, description, start_date, end_date, city, region, country,
                  external_url, external_url_validated_at,
                  registration_deadline, capacity_limit,
                  is_attendee_registration_open, is_tshirt_size_collected,
                  status, registration_status, published_at,
                  sanction_status, sanction_requested_at, sanction_requested_by_member_id,
                  sanction_justification, sanction_decided_at, sanction_decided_by_member_id,
                  sanction_decision_reason,
                  payment_enabled, payment_enabled_at, payment_enabled_by_member_id,
                  currency, competitor_fee_cents, attendee_fee_cents,
                  hashtag_tag_id
                ) VALUES (
                  ?, ?, ?, ?, ?, 1,
                  ?, '', ?, ?, ?, ?, ?,
                  NULL, NULL,
                  NULL, NULL,
                  0, 0,
                  ?, ?, NULL,
                  'none', NULL, NULL,
                  NULL, NULL, NULL,
                  NULL,
                  0, NULL, NULL,
                  'USD', NULL, NULL,
                  ?
                )
                """,
                (
                    event_id, ts, system_user, ts, system_user,
                    title, start_date, end_date, city, region, country,
                    status, registration_status,
                    tag_id,
                ),
            )

        # ------------------------------------------------------------------
        # Insert disciplines
        # ------------------------------------------------------------------
        print("Loading event disciplines...")
        discipline_id_map: dict[tuple[str, str], str] = {}

        for row in seed_disciplines:
            event_key = row["event_key"].strip()
            event_id = event_id_map[event_key]
            discipline_key = row["discipline_key"].strip()
            discipline_id = f"disc_{event_key}_{discipline_key}"
            discipline_id_map[(event_key, discipline_key)] = discipline_id

            name = row.get("discipline_name", "").strip()
            discipline_category = (row.get("discipline_category") or "").strip() or "other"
            team_type = normalize_team_type(row.get("team_type", ""), name)

            sort_order_raw = (row.get("sort_order") or "").strip()
            try:
                sort_order = int(sort_order_raw)
            except ValueError:
                sort_order = 0

            conn.execute(
                """
                INSERT INTO event_disciplines (
                  id, created_at, created_by, updated_at, updated_by, version,
                  event_id, name, discipline_category, team_type, sort_order
                ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
                """,
                (
                    discipline_id, ts, system_user, ts, system_user,
                    event_id, name, discipline_category, team_type, sort_order,
                ),
            )

        # ------------------------------------------------------------------
        # Insert result entries
        # ------------------------------------------------------------------
        print("Loading event result entries...")
        result_id_map: dict[tuple[str, str, str], str] = {}

        for row in seed_results:
            event_key = row["event_key"].strip()
            discipline_key = row["discipline_key"].strip()
            placement = row["placement"].strip()

            event_id = event_id_map[event_key]
            discipline_id = discipline_id_map.get((event_key, discipline_key))
            result_id = f"result_{event_key}_{discipline_key}_{placement}"
            result_id_map[(event_key, discipline_key, placement)] = result_id

            try:
                placement_int = int(placement)
            except ValueError:
                # skip malformed placements rather than crash whole load
                continue

            score_text = (row.get("score_text") or "").strip() or None

            conn.execute(
                """
                INSERT INTO event_result_entries (
                  id, created_at, created_by, updated_at, updated_by, version,
                  event_id, discipline_id, results_upload_id, placement, score_text
                ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL, ?, ?)
                """,
                (
                    result_id, ts, system_user, ts, system_user,
                    event_id, discipline_id, placement_int, score_text,
                ),
            )

        # ------------------------------------------------------------------
        # Insert result participants
        # ------------------------------------------------------------------
        print("Loading event result participants...")

        for row in seed_participants:
            event_key = row["event_key"].strip()
            discipline_key = row["discipline_key"].strip()
            placement = row["placement"].strip()

            result_id = result_id_map.get((event_key, discipline_key, placement))
            if not result_id:
                continue

            participant_order_raw = row["participant_order"].strip()
            try:
                participant_order = int(participant_order_raw)
            except ValueError:
                continue

            display_name = row.get("display_name", "").strip()
            if not display_name:
                continue

            historical_person_id = row.get("person_id", "").strip() or None

            participant_id = (
                f"participant_{event_key}_{discipline_key}_{placement}_{participant_order}"
            )

            conn.execute(
                """
                INSERT INTO event_result_entry_participants (
                  id, created_at, created_by, updated_at, updated_by, version,
                  result_entry_id, participant_order, member_id, display_name,
                  historical_person_id
                ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL, ?, ?)
                """,
                (
                    participant_id, ts, system_user, ts, system_user,
                    result_id, participant_order, display_name,
                    historical_person_id,
                ),
            )

        # ------------------------------------------------------------------
        # Permanent showcase event and its Hall-of-Fame persona. This is the
        # only surface that ties the Footbag Hacky system account (the account
        # that owns curated media) to a visible event, result, and historical
        # person record, so it loads in every environment, production included.
        # The historical-person row seeded here is what lets that system
        # member's historical_person_id link resolve instead of dangling. Do
        # not gate this behind a flag and do not delete it as test data.
        # ------------------------------------------------------------------
        print("Seeding showcase event + Footbag Hacky historical person...")

        fx_event_key   = "event_2025_beaver_open"
        fx_tag_id      = stable_id("tag", fx_event_key)
        fx_tag         = "#event_2025_beaver_open"
        fx_disc_key    = "bring_back_the_hack"
        fx_disc_id     = f"disc_{fx_event_key}_{fx_disc_key}"
        fx_result_id   = f"result_{fx_event_key}_{fx_disc_key}_1"
        fx_part_id     = f"participant_{fx_event_key}_{fx_disc_key}_1_1"

        conn.execute(
            """
            INSERT OR IGNORE INTO tags (
              id, created_at, created_by, updated_at, updated_by, version,
              tag_normalized, tag_display, is_standard, standard_type
            ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1, 'event')
            """,
            (fx_tag_id, ts, system_user, ts, system_user, fx_tag, fx_tag),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO events (
              id, created_at, created_by, updated_at, updated_by, version,
              title, description, start_date, end_date, city, region, country,
              external_url, external_url_validated_at,
              registration_deadline, capacity_limit,
              is_attendee_registration_open, is_tshirt_size_collected,
              status, registration_status, published_at,
              sanction_status, sanction_requested_at, sanction_requested_by_member_id,
              sanction_justification, sanction_decided_at, sanction_decided_by_member_id,
              sanction_decision_reason,
              payment_enabled, payment_enabled_at, payment_enabled_by_member_id,
              currency, competitor_fee_cents, attendee_fee_cents,
              hashtag_tag_id
            ) VALUES (
              ?, ?, ?, ?, ?, 1,
              ?, '', ?, ?, ?, ?, ?,
              NULL, NULL, NULL, NULL, 0, 0,
              ?, ?, NULL,
              'none', NULL, NULL, NULL, NULL, NULL, NULL,
              0, NULL, NULL, 'USD', NULL, NULL,
              ?
            )
            """,
            (
                fx_event_key, ts, system_user, ts, system_user,
                "45th Annual Moonin' and Noonin' Beaver Open", "2025-08-30", "2025-09-01",
                "Eugene", "Oregon", "United States",
                "completed", "closed",
                fx_tag_id,
            ),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO event_disciplines (
              id, created_at, created_by, updated_at, updated_by, version,
              event_id, name, discipline_category, team_type, sort_order
            ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
            """,
            (
                fx_disc_id, ts, system_user, ts, system_user,
                fx_event_key, "Most Fun", "freestyle", "singles", 1,
            ),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO event_result_entries (
              id, created_at, created_by, updated_at, updated_by, version,
              event_id, discipline_id, results_upload_id, placement, score_text
            ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL, ?, ?)
            """,
            (
                fx_result_id, ts, system_user, ts, system_user,
                fx_event_key, fx_disc_id, 1, "#BringBackTheHack",
            ),
        )
        fx_person_id  = stable_id("person", "footbag-hacky")

        # Historical person record for Footbag Hacky. source_scope
        # CANONICAL marks it as a real results-derived person, so it is searchable
        # and counted like any other competitor and the system member's
        # historical_person_id FK resolves to it.
        conn.execute(
            """
            INSERT OR IGNORE INTO historical_persons (
              person_id, person_name, country, source_scope,
              event_count, placement_count,
              bap_member, hof_member, hof_induction_year
            ) VALUES (?, ?, ?, 'CANONICAL', 1, 1, 0, 0, NULL)
            """,
            (fx_person_id, "Footbag Hacky", "New Zealand"),
        )

        # Link the result participant to the historical person. member_id stays
        # NULL: the Footbag Hacky system account is bootstrapped at registration,
        # not during seed load, so there is no members row to reference here, and
        # the historical_person_id link already carries the association.
        conn.execute(
            """
            INSERT OR IGNORE INTO event_result_entry_participants (
              id, created_at, created_by, updated_at, updated_by, version,
              result_entry_id, participant_order, member_id, display_name,
              historical_person_id
            ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
            """,
            (
                fx_part_id, ts, system_user, ts, system_user,
                fx_result_id, 1, None, "Footbag Hacky", fx_person_id,
            ),
        )


        conn.execute("PRAGMA foreign_keys = ON;")
        conn.commit()

        print("\nDatabase row counts:")
        for table in [
            "historical_persons",
            "tags",
            "events",
            "event_disciplines",
            "event_result_entries",
            "event_result_entry_participants",
        ]:
            count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            print(f"  {table}: {count:,}")

        print("\nDone.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()

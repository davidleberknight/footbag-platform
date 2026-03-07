import argparse
import sqlite3
import pandas as pd
import uuid
import re
from datetime import datetime


def now():
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def new_id():
    return str(uuid.uuid4())


def slugify(text):
    text = (text or "").lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"\s+", "_", text)
    text = re.sub(r"_+", "_", text)
    return text.strip("_")


def parse_location(location):
    """
    Very lightweight parser:
    - 'City, Region, Country' -> city, region, country
    - 'City, Country' -> city, None, country
    - otherwise -> location, None, 'Unknown'
    """
    if not location or pd.isna(location):
        return "Unknown", None, "Unknown"

    parts = [p.strip() for p in str(location).split(",") if p.strip()]

    if len(parts) >= 3:
        return parts[0], parts[1], parts[-1]
    if len(parts) == 2:
        return parts[0], None, parts[1]
    if len(parts) == 1:
        return parts[0], None, "Unknown"

    return "Unknown", None, "Unknown"


def load_event_metadata(events_csv):
    df = pd.read_csv(events_csv)

    required = ["event_id", "year", "event_name"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"events csv missing required columns: {missing}")

    meta = {}
    for _, r in df.iterrows():
        event_id = str(r["event_id"]).strip()
        meta[event_id] = {
            "year": int(r["year"]),
            "event_name": str(r["event_name"]).strip(),
            "date": "" if "date" not in df.columns or pd.isna(r.get("date")) else str(r.get("date")).strip(),
            "location": "" if "location" not in df.columns or pd.isna(r.get("location")) else str(r.get("location")).strip(),
            "host_club": "" if "host_club" not in df.columns or pd.isna(r.get("host_club")) else str(r.get("host_club")).strip(),
            "event_type": "" if "event_type" not in df.columns or pd.isna(r.get("event_type")) else str(r.get("event_type")).strip(),
        }
    return meta


def ensure_tag(cur, actor, year, slug):
    tag = f"#event_{year}_{slug}"

    r = cur.execute(
        "SELECT id FROM tags WHERE tag_normalized=?",
        (tag,)
    ).fetchone()

    if r:
        return r[0]

    tid = new_id()
    t = now()

    cur.execute(
        """
        INSERT INTO tags
        (id, created_at, created_by, updated_at, updated_by, version,
         tag_normalized, tag_display, is_standard, standard_type)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1, 'event')
        """,
        (tid, t, actor, t, actor, tag, tag)
    )

    return tid


def ensure_event(cur, actor, meta):
    year = int(meta["year"])
    event_name = meta["event_name"]
    slug = slugify(event_name)
    tag_id = ensure_tag(cur, actor, year, slug)

    r = cur.execute(
        "SELECT id FROM events WHERE hashtag_tag_id=?",
        (tag_id,)
    ).fetchone()

    if r:
        return r[0]

    eid = new_id()
    t = now()

    city, region, country = parse_location(meta.get("location", ""))

    # date parsing can come later; for MVFP testing use a stable fallback
    start_date = f"{year}-01-01"
    end_date = f"{year}-01-01"

    description_parts = []
    if meta.get("host_club"):
        description_parts.append(f"Host club: {meta['host_club']}")
    if meta.get("event_type"):
        description_parts.append(f"Event type: {meta['event_type']}")
    if meta.get("date"):
        description_parts.append(f"Source date: {meta['date']}")
    description = " | ".join(description_parts)

    cur.execute(
        """
        INSERT INTO events
        (id, created_at, created_by, updated_at, updated_by, version,
         title, description, start_date, end_date, city, region, country,
         status, registration_status, sanction_status, currency,
         hashtag_tag_id)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 'published', 'closed', 'none', 'USD', ?)
        """,
        (
            eid, t, actor, t, actor,
            event_name,
            description,
            start_date,
            end_date,
            city,
            region,
            country,
            tag_id,
        ),
    )

    return eid


def infer_discipline_category(name):
    n = (name or "").lower()
    if "net" in n:
        return "net"
    if "golf" in n:
        return "golf"
    if "2-square" in n or "2 square" in n:
        return "sideline"
    if "circle" in n:
        return "freestyle"
    if "freestyle" in n or "sick" in n or "shred" in n or "routine" in n:
        return "freestyle"
    return "other"


def infer_team_type(group_size, discipline_name):
    n = (discipline_name or "").lower()
    if "mixed doubles" in n or "doubles" in n or group_size == 2:
        return "doubles"
    return "singles"


def ensure_discipline(cur, actor, event_id, name, group_size):
    r = cur.execute(
        """
        SELECT id FROM event_disciplines
        WHERE event_id=? AND name=?
        """,
        (event_id, name),
    ).fetchone()

    if r:
        return r[0]

    did = new_id()
    t = now()

    discipline_category = infer_discipline_category(name)
    team_type = infer_team_type(group_size, name)

    cur.execute(
        """
        INSERT INTO event_disciplines
        (id, created_at, created_by, updated_at, updated_by, version,
         event_id, name, discipline_category, team_type, sort_order)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 0)
        """,
        (did, t, actor, t, actor, event_id, name, discipline_category, team_type),
    )

    return did


def ensure_upload(cur, actor, event_id, original_filename):
    r = cur.execute(
        """
        SELECT id FROM event_results_uploads
        WHERE event_id=? AND original_filename=?
        """,
        (event_id, original_filename),
    ).fetchone()

    if r:
        return r[0]

    uid = new_id()
    t = now()

    cur.execute(
        """
        INSERT INTO event_results_uploads
        (id, created_at, created_by, updated_at, updated_by, version,
         event_id, uploaded_by_member_id, uploaded_at, original_filename, notes)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
        """,
        (
            uid, t, actor, t, actor,
            event_id, actor, t,
            original_filename,
            "Imported from canonical 2025 dataset"
        ),
    )

    return uid


def ensure_result_entry(cur, actor, event_id, discipline_id, upload_id, place):
    r = cur.execute(
        """
        SELECT id FROM event_result_entries
        WHERE event_id=? AND discipline_id=? AND placement=?
        """,
        (event_id, discipline_id, place),
    ).fetchone()

    if r:
        return r[0]

    rid = new_id()
    t = now()

    cur.execute(
        """
        INSERT INTO event_result_entries
        (id, created_at, created_by, updated_at, updated_by, version,
         event_id, discipline_id, results_upload_id, placement, score_text)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, NULL)
        """,
        (rid, t, actor, t, actor, event_id, discipline_id, upload_id, place),
    )

    return rid


def ensure_participant(cur, actor, result_id, order, name):
    r = cur.execute(
        """
        SELECT id FROM event_result_entry_participants
        WHERE result_entry_id=? AND participant_order=?
        """,
        (result_id, order),
    ).fetchone()

    if r:
        return r[0]

    pid = new_id()
    t = now()

    cur.execute(
        """
        INSERT INTO event_result_entry_participants
        (id, created_at, created_by, updated_at, updated_by, version,
         result_entry_id, participant_order, member_id, display_name)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL, ?)
        """,
        (pid, t, actor, t, actor, result_id, order, name),
    )

    return pid


def load_results(db, results_csv, events_csv, actor):
    df = pd.read_csv(results_csv)
    event_meta = load_event_metadata(events_csv)

    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON")
    cur = conn.cursor()

    actor_exists = cur.execute(
        "SELECT id FROM members WHERE id=?",
        (actor,)
    ).fetchone()
    if not actor_exists:
        raise ValueError(f"actor member id not found: {actor}")

    for (legacy_event_id, year, division, place), g in df.groupby(
        ["legacy_event_id", "year", "discipline", "placement"]
    ):
        legacy_event_id = str(legacy_event_id)

        if legacy_event_id not in event_meta:
            raise ValueError(f"missing event metadata for legacy_event_id={legacy_event_id}")

        meta = event_meta[legacy_event_id]

        event = ensure_event(cur, actor, meta)
        discipline = ensure_discipline(cur, actor, event, division, len(g))
        upload = ensure_upload(cur, actor, event, original_filename=results_csv)

        entry = ensure_result_entry(
            cur, actor, event, discipline, upload, int(place)
        )

        g = g.sort_values("participant_order")

        for _, r in g.iterrows():
            ensure_participant(
                cur,
                actor,
                entry,
                int(r["participant_order"]),
                str(r["participant_name"]).strip(),
            )

    conn.commit()
    conn.close()

    print("Import finished")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--results-csv", required=True)
    ap.add_argument("--events-csv", required=True)
    ap.add_argument("--actor-member-id", required=True)

    args = ap.parse_args()

    load_results(
        args.db,
        args.results_csv,
        args.events_csv,
        args.actor_member_id,
    )

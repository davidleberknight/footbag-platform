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
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"\s+", "_", text)
    return text


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
        (id, created_at, created_by, updated_at, updated_by,
         tag_normalized, tag_display, is_standard, standard_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'event')
        """,
        (tid, t, actor, t, actor, tag, tag)
    )

    return tid


def ensure_event(cur, actor, year, legacy_id):
    slug = f"legacy_event_{legacy_id}"
    tag_id = ensure_tag(cur, actor, year, slug)

    r = cur.execute(
        "SELECT id FROM events WHERE hashtag_tag_id=?",
        (tag_id,)
    ).fetchone()

    if r:
        return r[0]

    eid = new_id()
    t = now()

    cur.execute(
        """
        INSERT INTO events
        (id, created_at, created_by, updated_at, updated_by,
         title, start_date, end_date, city, country,
         status, registration_status, sanction_status, currency,
         hashtag_tag_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 'closed', 'none', 'USD', ?)
        """,
        (
            eid, t, actor, t, actor,
            f"Legacy Event {legacy_id}",
            f"{year}-01-01",
            f"{year}-01-01",
            "Unknown",
            "Unknown",
            tag_id,
        ),
    )

    return eid


def ensure_discipline(cur, actor, event_id, name):
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

    team_type = "singles"

    cur.execute(
        """
        INSERT INTO event_disciplines
        (id, created_at, created_by, updated_at, updated_by,
         event_id, name, discipline_category, team_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'unknown', ?)
        """,
        (did, t, actor, t, actor, event_id, name, team_type),
    )

    return did


def ensure_upload(cur, actor, event_id):
    r = cur.execute(
        """
        SELECT id FROM event_results_uploads
        WHERE event_id=?
        """,
        (event_id,),
    ).fetchone()

    if r:
        return r[0]

    uid = new_id()
    t = now()

    cur.execute(
        """
        INSERT INTO event_results_uploads
        (id, created_at, created_by, updated_at, updated_by,
         event_id, uploaded_by_member_id, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (uid, t, actor, t, actor, event_id, actor, t),
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
        (id, created_at, created_by, updated_at, updated_by,
         event_id, discipline_id, results_upload_id, placement)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        (id, created_at, created_by, updated_at, updated_by,
         result_entry_id, participant_order, display_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (pid, t, actor, t, actor, result_id, order, name),
    )

    return pid


def load_results(db, csv_path, actor):

    df = pd.read_csv(csv_path)

    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON")

    cur = conn.cursor()

    for (event_id, year, division, place), g in df.groupby(
        ["legacy_event_id", "year", "discipline", "placement"]
    ):

        event = ensure_event(cur, actor, year, event_id)
        discipline = ensure_discipline(cur, actor, event, division)
        upload = ensure_upload(cur, actor, event)

        entry = ensure_result_entry(
            cur, actor, event, discipline, upload, place
        )

        g = g.sort_values("participant_order")

        for _, r in g.iterrows():

            ensure_participant(
                cur,
                actor,
                entry,
                int(r["participant_order"]),
                r["participant_name"],
            )

    conn.commit()
    conn.close()

    print("Import finished")


if __name__ == "__main__":

    ap = argparse.ArgumentParser()

    ap.add_argument("--db", required=True)
    ap.add_argument("--results-csv", required=True)
    ap.add_argument("--actor-member-id", required=True)

    args = ap.parse_args()

    load_results(args.db, args.results_csv, args.actor_member_id)

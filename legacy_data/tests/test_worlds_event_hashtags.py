"""A World Footbag Championships carries the short hashtag members already type.

A Worlds takes #event_{year}_worlds_{host_country}. In a year with more than one
Worlds in one country the host city replaces the country, and where two share the
city too, the sanctioning body that ends the event key follows it. An online Worlds
takes "online" for its place. A Worlds is known by its event type, never its key.

The loader also adopts a plain hashtag of the same name that content already
carries, so media tagged before the event loaded reaches the event's gallery, and
a re-run keeps an event hashtag that media carries rather than failing on it.

Run from repo root:
    python -m pytest legacy_data/tests/test_worlds_event_hashtags.py -v
"""
from __future__ import annotations

import csv
import importlib.util
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_loader_idempotency import (  # noqa: E402
    _mvfp_loader_args, build_mvfp_seed, make_db, run, write_csv,
)

ROOT = Path(__file__).resolve().parents[1]
_SCRIPT = ROOT / "event_results" / "scripts" / "08_load_mvfp_seed_full_to_sqlite.py"
_spec = importlib.util.spec_from_file_location("mvfp_seed_loader_worlds", _SCRIPT)
loader = importlib.util.module_from_spec(_spec)
sys.modules["mvfp_seed_loader_worlds"] = loader
_spec.loader.exec_module(loader)

CANONICAL_EVENTS = ROOT / "event_results" / "canonical_input" / "events.csv"


def _canonical_rows() -> list[dict[str, str]]:
    with CANONICAL_EVENTS.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _worlds(key: str, year: str, city: str, country: str) -> dict[str, str]:
    return {"event_key": key, "year": year, "city": city, "country": country,
            "event_slug": "world_footbag_championships", "event_type": "worlds"}


def test_every_committed_worlds_gets_the_short_form_and_none_collide():
    # Defect caught: a Worlds keeps its long legacy-name hashtag, or two Worlds
    # share one, so media tagged for one championships lands on another.
    rows = _canonical_rows()
    worlds = [r for r in rows if r["event_type"] == "worlds"]
    tags = loader.event_hashtags(rows, set())
    assert len(worlds) > 0, "no Worlds rows found in the committed events"
    for r in worlds:
        tag = tags[r["event_key"]]
        assert tag.startswith(f"#event_{r['year']}_worlds_"), (r["event_key"], tag)
        assert not tag.rstrip("0123456789").endswith("_"), (
            f"{r['event_key']} needed a numeric suffix: {tag}")
    worlds_tags = [tags[r["event_key"]] for r in worlds]
    assert len(set(worlds_tags)) == len(worlds_tags)


def test_the_ratified_examples_come_out_exactly():
    # Defect caught: the hashtag a member is told to type is not the one stored.
    tags = loader.event_hashtags(_canonical_rows(), set())
    assert tags["2026_worlds_ibaraki"] == "#event_2026_worlds_japan"
    assert tags["1982_worlds_portland"] == "#event_1982_worlds_portland"
    assert tags["1983_worlds_boulder_wfa"] == "#event_1983_worlds_boulder_wfa"
    assert tags["2021_worlds_online"] == "#event_2021_worlds_online"


def test_a_warm_up_with_worlds_in_its_key_keeps_the_ordinary_form():
    # Defect caught: a non-Worlds event taking a Worlds hashtag from its key.
    row = {"event_key": "1997_worlds_vancouver", "year": "1997", "city": "Vancouver",
           "country": "Canada", "event_slug": "vancouver_open", "event_type": "net"}
    assert loader.event_hashtags([row], set()) == {
        "1997_worlds_vancouver": "#event_1997_vancouver_open"}


def test_one_worlds_in_its_country_takes_the_country():
    tags = loader.worlds_hashtags([_worlds("2025_worlds_nantes", "2025", "Nantes", "France")])
    assert tags == {"2025_worlds_nantes": "#event_2025_worlds_france"}


def test_two_worlds_sharing_a_city_without_a_body_in_the_key_stop_the_load():
    # Defect caught: two championships silently sharing one hashtag.
    rows = [_worlds("1999_worlds_a", "1999", "Golden", "United States"),
            _worlds("1999_worlds_b", "1999", "Golden", "United States")]
    try:
        loader.worlds_hashtags(rows)
    except SystemExit as e:
        assert "1999_worlds_a" in str(e)
    else:
        raise AssertionError("two Worlds in one city and year loaded without a body token")


def _japan_worlds_seed(seed_dir: Path) -> Path:
    build_mvfp_seed(seed_dir)
    write_csv(
        seed_dir / "seed_events.csv",
        ["event_key", "legacy_event_id", "year", "event_name", "event_slug",
         "start_date", "end_date", "city", "region", "country", "host_club",
         "event_type", "status", "notes", "source"],
        [{"event_key": "2000_idem_test", "legacy_event_id": "2000_idem_test",
          "year": "2000", "event_name": "World Footbag Championships",
          "event_slug": "world_footbag_championships", "start_date": "", "end_date": "",
          "city": "Tsukuba", "region": "Ibaraki", "country": "Japan", "host_club": "",
          "event_type": "worlds", "status": "completed", "notes": "", "source": "mirror"}],
    )
    return seed_dir


def _tag_media(db: Path, tag_normalized: str) -> None:
    """Media carrying a plain hashtag, as the curator seed leaves it."""
    ts = "2024-01-01T00:00:00.000Z"
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        conn.execute(
            "INSERT OR IGNORE INTO members (id, created_at, created_by, updated_at, updated_by, "
            "real_name, display_name, display_name_normalized, slug, is_system) "
            "VALUES ('curator', ?, 'seed', ?, 'seed', 'Curator', 'Curator', 'curator', "
            "'curator', 1)", (ts, ts))
        conn.execute(
            "INSERT OR IGNORE INTO tags (id, created_at, created_by, updated_at, updated_by, "
            "tag_normalized, tag_display) VALUES ('tag_plain', ?, 'seed', ?, 'seed', ?, ?)",
            (ts, ts, tag_normalized, tag_normalized))
        tag_id = conn.execute("SELECT id FROM tags WHERE tag_normalized = ?",
                              (tag_normalized,)).fetchone()[0]
        conn.execute(
            "INSERT INTO media_items (id, created_at, created_by, updated_at, updated_by, "
            "uploader_member_id, media_type, uploaded_at, video_platform, video_id, video_url) "
            "VALUES ('media_worlds', ?, 'seed', ?, 'seed', 'curator', 'video', ?, 'youtube', "
            "'abc', 'https://www.youtube.com/watch?v=abc')", (ts, ts, ts))
        conn.execute(
            "INSERT INTO media_tags (id, created_at, created_by, updated_at, updated_by, "
            "media_id, tag_id, tag_display) VALUES ('mt_worlds', ?, 'seed', ?, 'seed', "
            "'media_worlds', ?, ?)", (ts, ts, tag_id, tag_normalized))
        conn.commit()
    finally:
        conn.close()


def _event_tag(db: Path) -> tuple:
    conn = sqlite3.connect(db)
    try:
        return conn.execute(
            "SELECT t.id, t.tag_normalized, t.is_standard, t.standard_type FROM events e "
            "JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = '2000_idem_test'").fetchone()
    finally:
        conn.close()


def test_the_loader_adopts_a_plain_hashtag_media_already_carries(tmp_path: Path):
    # Defect caught: curated Worlds media tagged before the event loaded stays on
    # a separate plain hashtag, so the event page finds none of it, or the event
    # takes "_2" and its hashtag is not the one members type.
    db = make_db(tmp_path)
    _tag_media(db, "#event_2000_worlds_japan")
    r = run(_mvfp_loader_args(db, _japan_worlds_seed(tmp_path / "seed")))
    assert r.returncode == 0, r.stdout + r.stderr
    assert _event_tag(db) == ("tag_plain", "#event_2000_worlds_japan", 1, "event")


def test_a_rerun_keeps_an_event_hashtag_that_media_carries(tmp_path: Path):
    # Defect caught: re-running the load on a seeded database fails on the
    # media's reference to the event hashtag, or moves the event off it.
    db = make_db(tmp_path)
    args = _mvfp_loader_args(db, _japan_worlds_seed(tmp_path / "seed"))
    assert run(args).returncode == 0
    tag_id = _event_tag(db)[0]
    _tag_media(db, "#event_2000_worlds_japan")
    r = run(args)
    assert r.returncode == 0, r.stdout + r.stderr
    assert _event_tag(db) == (tag_id, "#event_2000_worlds_japan", 1, "event")

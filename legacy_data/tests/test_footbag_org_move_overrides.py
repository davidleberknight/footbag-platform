"""The footbag.org loaders honour the curated legacy-move-ID overrides.

Both loaders that read the footbag.org move snapshot resolve a scraped move to a
canonical trick by its published name. That resolution cannot work for a move
whose published name is not the name our dictionary gives the same movement, so
a curated map keyed on the legacy move ID decides those cases, and both loaders
read the same map.

The two failures this pins are the ones an unhonoured override produces. The
provenance linker must attach the move's source record to the canonical trick
rather than leaving it unattached. The pending loader must recognize the move as
already curated rather than inserting a second, inactive trick row that shadows
the canonical one and reappears in the pending-review queue as uncurated work.

Both loaders fail closed when an override target is missing or inactive, so a
canonical rename that leaves the map stale aborts the load instead of silently
falling back to name resolution.

All writes go to a temp dir; nothing under the repo root is touched.

Run from repo root:
    python -m pytest legacy_data/tests/test_footbag_org_move_overrides.py -v
"""
import sqlite3
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
LINKER = REPO_ROOT / "freestyle" / "loaders" / "20_link_footbag_org_sources.py"
PENDING = REPO_ROOT / "freestyle" / "loaders" / "21_load_footbag_org_pending_tricks.py"

SNAPSHOT_HEADER = (
    "source_name,alt_name,add_value,showmove_id,source_url,"
    "notation,tags_summary,description,family_hint,category_hint"
)
# Move 12 is published as "Peak Delay"; the canonical trick is peak stall, so the
# published name resolves to nothing and only the override can place it. The
# second row is an ordinary unmatched move, present so a run that resolved
# everything by accident could not pass this file.
OVERRIDDEN_MOVE_ID = "12"
OVERRIDDEN_SLUG = "peak_stall"


def run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, *args], cwd=str(REPO_ROOT),
                          capture_output=True, text=True)


def make_db(tmp_path: Path) -> Path:
    db = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db


def seed_trick(db: Path, slug: str, name: str, is_active: int = 1) -> None:
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO freestyle_tricks (slug, canonical_name, adds, is_active, "
        "review_status, loaded_at) VALUES (?, ?, '1', ?, 'expert_reviewed', "
        "'2026-01-01T00:00:00Z')",
        (slug, name, is_active),
    )
    conn.commit()
    conn.close()


def write_snapshot(path: Path) -> Path:
    path.write_text(
        SNAPSHOT_HEADER + "\n"
        f"Peak Delay,,1,{OVERRIDDEN_MOVE_ID},"
        "http://www.footbag.org/newmoves/showmove/12,,[uns],,,unusual\n"
        "Not Yet Authored Move,,2,9901,"
        "http://www.footbag.org/newmoves/showmove/9901,,,,,body\n",
        encoding="utf-8",
    )
    return path


def source_links(db: Path) -> list[tuple]:
    conn = sqlite3.connect(db)
    try:
        return conn.execute(
            "SELECT trick_slug, external_ref FROM freestyle_trick_source_links "
            "ORDER BY trick_slug"
        ).fetchall()
    finally:
        conn.close()


def trick_slugs(db: Path) -> list[tuple]:
    conn = sqlite3.connect(db)
    try:
        return conn.execute(
            "SELECT slug, is_active FROM freestyle_tricks ORDER BY slug"
        ).fetchall()
    finally:
        conn.close()


def test_provenance_attaches_to_the_canonical_trick_the_override_names(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    seed_trick(db, OVERRIDDEN_SLUG, "peak stall")
    snapshot = write_snapshot(tmp_path / "moves.csv")

    r = run([str(LINKER), "--db", str(db), "--scraped-csv", str(snapshot)])
    assert r.returncode == 0, r.stderr

    assert (OVERRIDDEN_SLUG, OVERRIDDEN_MOVE_ID) in source_links(db), source_links(db)


def test_an_overridden_move_never_becomes_a_second_pending_trick(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    seed_trick(db, OVERRIDDEN_SLUG, "peak stall")
    snapshot = write_snapshot(tmp_path / "moves.csv")

    # The linker runs first in the rebuild, and registers the source record the
    # pending rows' provenance links point at.
    r = run([str(LINKER), "--db", str(db), "--scraped-csv", str(snapshot)])
    assert r.returncode == 0, r.stderr
    r = run([str(PENDING), "--db", str(db), "--scraped-csv", str(snapshot)])
    assert r.returncode == 0, r.stderr

    slugs = dict(trick_slugs(db))
    # The overridden move is recognized as already curated: no shadow row.
    assert "peak_delay" not in slugs, slugs
    assert slugs[OVERRIDDEN_SLUG] == 1
    # The unmatched move still lands in the pending queue, so the loader is
    # doing its job rather than skipping everything.
    assert slugs.get("not_yet_authored_move") == 0, slugs


def test_the_linker_fails_closed_when_an_override_target_is_missing(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    snapshot = write_snapshot(tmp_path / "moves.csv")

    r = run([str(LINKER), "--db", str(db), "--scraped-csv", str(snapshot)])
    assert r.returncode != 0
    assert OVERRIDDEN_SLUG in r.stderr and "missing" in r.stderr, r.stderr
    assert source_links(db) == []


def test_the_pending_loader_fails_closed_when_an_override_target_is_inactive(tmp_path: Path) -> None:
    db = make_db(tmp_path)
    seed_trick(db, OVERRIDDEN_SLUG, "peak stall", is_active=0)
    snapshot = write_snapshot(tmp_path / "moves.csv")

    r = run([str(PENDING), "--db", str(db), "--scraped-csv", str(snapshot)])
    assert r.returncode != 0
    assert OVERRIDDEN_SLUG in r.stderr and "inactive" in r.stderr, r.stderr
    assert [s for s, _ in trick_slugs(db)] == [OVERRIDDEN_SLUG]

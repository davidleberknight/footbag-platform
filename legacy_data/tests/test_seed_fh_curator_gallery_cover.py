"""
A curated gallery's save file names its cover photo by source filename, and the
curator seeder turns that name back into the photo it seeded.

The name is the stable key because a curated item's media id changes whenever
its file's bytes do. The loader refuses a malformed name the same way the
application's save-file validator does; the gallery step resolves a good one to
the curator's active photo of that filename, and stores no cover, with a
warning, when no such photo exists, so one stale name never fails the seed.

Run from repo root:
    python -m pytest legacy_data/tests/test_seed_fh_curator_gallery_cover.py -v
"""
import json
import sqlite3
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))
import seed_fh_curator  # noqa: E402

TS = "2026-01-15T00:00:00.000Z"


def sidecar(**extra) -> dict:
    data = {
        "id": "gallery_cover_test",
        "name": "Cover Test",
        "description": "",
        "sortOrder": "upload_desc",
        "criteriaTags": ["#curated", "#cover_test"],
        "excludeTags": [],
        "externalLinks": [],
    }
    data.update(extra)
    return data


def write_sidecar(source_dir: Path, data: dict) -> None:
    galleries = source_dir / "galleries"
    galleries.mkdir(parents=True, exist_ok=True)
    (galleries / "cover_test.json").write_text(json.dumps(data), encoding="utf-8")


@pytest.fixture
def con(tmp_path):
    connection = sqlite3.connect(tmp_path / "seed.db")
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript((REPO_ROOT / "database" / "schema.sql").read_text(encoding="utf-8"))
    yield connection
    connection.close()


def curator_photo(con, fh_id: str, media_id: str, source_filename: str, status: str = "active") -> None:
    con.execute(
        """
        INSERT INTO media_items (
            id, uploader_member_id, media_type, is_avatar, caption, uploaded_at,
            s3_key_thumb, s3_key_display, width_px, height_px,
            moderation_status, source_filename, mime_type,
            created_at, created_by, updated_at, updated_by, version
        ) VALUES (?, ?, 'photo', 0, NULL, ?, ?, ?, 800, 600, ?, ?, 'image/jpeg',
                  ?, 'seed', ?, 'seed', 1)
        """,
        (media_id, fh_id, TS, f"t/{media_id}.jpg", f"d/{media_id}.jpg",
         status, source_filename, TS, TS),
    )


def stored_cover(con) -> str | None:
    return con.execute(
        "SELECT cover_media_id FROM member_galleries WHERE id = 'gallery_cover_test'"
    ).fetchone()[0]


def ensure(con, fh_id: str, cover_photo: str | None) -> None:
    seed_fh_curator.ensure_named_gallery(
        con, fh_id, TS,
        gallery_id="gallery_cover_test", name="Cover Test", description="",
        sort_order="upload_desc", criteria_tags=("#curated", "#cover_test"),
        cover_photo=cover_photo,
    )


def test_loader_carries_a_named_cover_and_leaves_one_absent(tmp_path):
    write_sidecar(tmp_path, sidecar(coverPhoto="cover_kick.jpg"))
    assert seed_fh_curator._load_named_gallery_sidecars(tmp_path)[0]["cover_photo"] == "cover_kick.jpg"
    write_sidecar(tmp_path, sidecar())
    assert seed_fh_curator._load_named_gallery_sidecars(tmp_path)[0]["cover_photo"] is None


@pytest.mark.parametrize("bad", ["", "   ", "dir/cover_kick.jpg", "a" * 252 + ".jpg", 42])
def test_loader_refuses_a_malformed_cover_name(tmp_path, bad):
    write_sidecar(tmp_path, sidecar(coverPhoto=bad))
    with pytest.raises(SystemExit) as raised:
        seed_fh_curator._load_named_gallery_sidecars(tmp_path)
    assert "coverPhoto" in str(raised.value)


def test_loader_accepts_a_cover_name_at_the_length_limit(tmp_path):
    name = "a" * 251 + ".jpg"
    write_sidecar(tmp_path, sidecar(coverPhoto=name))
    assert seed_fh_curator._load_named_gallery_sidecars(tmp_path)[0]["cover_photo"] == name


def test_gallery_step_resolves_the_name_to_the_curator_photo(con):
    fh_id = seed_fh_curator.ensure_fh_member(con, TS)
    curator_photo(con, fh_id, "media_cover_a", "cover_kick.jpg")
    curator_photo(con, fh_id, "media_cover_b", "other_kick.jpg")
    ensure(con, fh_id, "cover_kick.jpg")
    assert stored_cover(con) == "media_cover_a"


def test_gallery_step_stores_no_cover_and_warns_when_the_name_matches_nothing(con, capsys):
    fh_id = seed_fh_curator.ensure_fh_member(con, TS)
    # A removed photo of that name is not a cover the gallery could show.
    curator_photo(con, fh_id, "media_cover_removed", "cover_kick.jpg", status="removed_by_admin")
    ensure(con, fh_id, "cover_kick.jpg")
    assert stored_cover(con) is None
    assert "cover_kick.jpg" in capsys.readouterr().err


def test_gallery_step_without_a_cover_stores_none_silently(con, capsys):
    fh_id = seed_fh_curator.ensure_fh_member(con, TS)
    ensure(con, fh_id, None)
    assert stored_cover(con) is None
    assert "WARNING" not in capsys.readouterr().err

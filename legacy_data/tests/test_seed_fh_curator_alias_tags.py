"""
A file-paired curated clip is seeded under the canonical trick, never its alias.

A trick has one gallery, and the gallery filters on one literal tag, so a sidecar
that names a trick by an alias would leave the clip out of that trick's gallery.
The seeder's other path, for URL-reference clips, already folds aliases; this
pins the file-paired walk to the same rule.

Run from repo root:
    python -m pytest legacy_data/tests/test_seed_fh_curator_alias_tags.py -v
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


@pytest.fixture
def con(tmp_path):
    connection = sqlite3.connect(tmp_path / "seed.db")
    connection.executescript((REPO_ROOT / "database" / "schema.sql").read_text(encoding="utf-8"))
    # The schema turns foreign keys on; only the alias lookup is under test here,
    # so its target trick row is not built.
    connection.execute("PRAGMA foreign_keys = OFF")
    connection.execute(
        """
        INSERT INTO freestyle_trick_aliases
            (alias_slug, alias_text, trick_slug, alias_type, alias_origin_producer, created_at)
        VALUES ('folded_alias', 'folded alias', 'canonical_trick', 'structural', 'base-dictionary', ?)
        """,
        (TS,),
    )
    yield connection
    connection.close()


def seeded_tags(con, tmp_path, monkeypatch, tags: list[str]) -> list[str]:
    source_dir = tmp_path / "curated"
    category = source_dir / "freestyle_demos"
    category.mkdir(parents=True)
    (category / "clip.jpg").write_bytes(b"not read: seed_item is replaced below")
    (category / "clip.meta.json").write_text(json.dumps({"caption": None, "tags": tags}), encoding="utf-8")

    captured: list[dict] = []
    monkeypatch.setattr(
        seed_fh_curator, "seed_item",
        lambda _con, item, *_rest: captured.append(item),
    )
    seed_fh_curator.seed_file_paired_sidecars(con, "fh", source_dir, tmp_path / "media", TS)
    assert len(captured) == 1
    return captured[0]["tags"]


def test_alias_tag_is_seeded_under_the_canonical_trick(con, tmp_path, monkeypatch):
    tags = seeded_tags(con, tmp_path, monkeypatch, ["#folded_alias", "#demo"])
    assert "#canonical_trick" in tags
    assert "#folded_alias" not in tags
    assert "#demo" in tags


def test_a_clip_naming_the_alias_and_its_trick_keeps_one_tag(con, tmp_path, monkeypatch):
    tags = seeded_tags(con, tmp_path, monkeypatch, ["#folded_alias", "#canonical_trick"])
    assert tags.count("#canonical_trick") == 1


def test_a_tag_naming_no_trick_is_left_alone(con, tmp_path, monkeypatch):
    assert "#plain_hashtag" in seeded_tags(con, tmp_path, monkeypatch, ["#plain_hashtag"])

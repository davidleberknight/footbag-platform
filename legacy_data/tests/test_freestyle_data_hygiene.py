"""Focused tests for the freestyle data-hygiene fixes.

- prune_inactive_modifier_links (freestyle/loaders/19_load_red_additions.py):
  modifier links on inactive tricks are deleted; links on active tricks survive.
- build_slug_index (freestyle/loaders/27_load_trick_tips.py): only active tricks,
  and aliases pointing at active tricks, are indexed, so a tip whose only match
  is a retired trick never resolves onto a slug hidden from every public surface.
- the pogo-paradox-da-da-curve family override is present in the curated
  corrections so the orphaned self-family row regroups into dada_curve.

All writes go to a temp dir; nothing under the repo root is touched.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_data_hygiene.py -v
"""
import importlib.util
import sqlite3
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
ADDITIONS_LOADER = REPO_ROOT / "freestyle" / "loaders" / "19_load_red_additions.py"
TIPS_LOADER = REPO_ROOT / "freestyle" / "loaders" / "27_load_trick_tips.py"
RED_CORRECTIONS = REPO_ROOT / "freestyle" / "inputs" / "curated" / "tricks" / "red_corrections_2026_04_20.csv"


def _load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _db(tmp_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(tmp_path / "t.db")
    conn.executescript(SCHEMA_PATH.read_text())
    return conn


def _trick(conn, slug, name, is_active=1, aliases_json=None):
    conn.execute(
        "INSERT INTO freestyle_tricks (slug, canonical_name, aliases_json, is_active, loaded_at) "
        "VALUES (?, ?, ?, ?, '2026-01-01T00:00:00Z')",
        (slug, name, aliases_json, is_active),
    )


def _alias(conn, alias_slug, alias_text, trick_slug):
    conn.execute(
        "INSERT INTO freestyle_trick_aliases (alias_slug, alias_text, trick_slug, alias_type, created_at) "
        "VALUES (?, ?, ?, 'common', '2026-01-01T00:00:00Z')",
        (alias_slug, alias_text, trick_slug),
    )


def test_prune_removes_modifier_links_only_on_inactive_tricks(tmp_path):
    mod = _load_module(ADDITIONS_LOADER, "red_additions_loader")
    conn = _db(tmp_path)
    _trick(conn, "active_trick", "active trick", is_active=1)
    _trick(conn, "retired_trick", "retired trick", is_active=0)
    conn.execute(
        "INSERT INTO freestyle_trick_modifiers "
        "(slug, modifier_name, add_bonus, add_bonus_rotational, modifier_type, loaded_at) "
        "VALUES ('atomic', 'atomic', 1, 1, 'set', '2026-01-01T00:00:00Z')"
    )
    conn.execute("INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order) VALUES ('active_trick', 'atomic', 1)")
    conn.execute("INSERT INTO freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order) VALUES ('retired_trick', 'atomic', 1)")
    conn.commit()

    deleted = mod.prune_inactive_modifier_links(conn)
    assert deleted == 1
    remaining = {r[0] for r in conn.execute("SELECT trick_slug FROM freestyle_trick_modifier_links")}
    assert remaining == {"active_trick"}
    assert mod.prune_inactive_modifier_links(conn) == 0  # idempotent


def test_slug_index_excludes_inactive_tricks(tmp_path):
    mod = _load_module(TIPS_LOADER, "trick_tips_loader")
    conn = _db(tmp_path)
    _trick(conn, "active_folk", "active folk", is_active=1)
    _trick(conn, "retired_decomp", "retired decomp", is_active=0)
    conn.commit()

    idx = mod.build_slug_index(conn)
    assert idx.get(mod.name_to_slug("active folk")) == "active_folk"
    assert mod.name_to_slug("retired decomp") not in idx
    assert mod.name_to_slug("retired_decomp") not in idx


def test_slug_index_ignores_aliases_pointing_at_inactive_tricks(tmp_path):
    mod = _load_module(TIPS_LOADER, "trick_tips_loader")
    conn = _db(tmp_path)
    _trick(conn, "active_folk", "active folk", is_active=1)
    _trick(conn, "retired_decomp", "retired decomp", is_active=0)
    _alias(conn, "folk_alias", "folk alias", "active_folk")
    _alias(conn, "dead_alias", "dead alias", "retired_decomp")
    conn.commit()

    idx = mod.build_slug_index(conn)
    assert idx.get(mod.name_to_slug("folk_alias")) == "active_folk"
    assert mod.name_to_slug("dead_alias") not in idx


def test_pogo_paradox_family_override_present():
    row = next(
        (l for l in RED_CORRECTIONS.read_text().splitlines()
         if l.startswith("pogo-paradox-da-da-curve,trick_family,")),
        None,
    )
    assert row is not None, "pogo-paradox-da-da-curve trick_family override missing"
    assert ",dada-curve," in row

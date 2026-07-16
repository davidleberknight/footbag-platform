"""
test_dump_parser.py
===================

Unit tests for the shared dump-root resolver
(legacy_data/member_data_scripts/_dump_parser.py):

  * resolve_dump_root(): the FOOTBAG_LEGACY_REPO environment variable wins
    when it names a real directory; an env var pointing at a missing directory
    exits with an actionable error naming the variable; with no env var the
    repo-root `footbag_legacy_repo` symlink is used when present; None when
    neither exists (the correct state for CI and a fresh clone).
  * module_dump_path(): maps an app name to <root>/<app>/backups/latest.sql.

Run from repo root:
    python -m pytest legacy_data/tests/test_dump_parser.py -v
"""
import sys
from pathlib import Path

import pytest

_MODULE_DIR = Path(__file__).resolve().parents[1] / "member_data_scripts"
sys.path.insert(0, str(_MODULE_DIR))

import _dump_parser  # noqa: E402


def test_env_var_wins_when_it_names_a_directory(tmp_path, monkeypatch):
    monkeypatch.setenv(_dump_parser.DUMP_ROOT_ENV_VAR, str(tmp_path))
    assert _dump_parser.resolve_dump_root() == tmp_path


def test_env_var_pointing_at_a_missing_directory_exits_actionably(tmp_path, monkeypatch):
    missing = tmp_path / "does-not-exist"
    monkeypatch.setenv(_dump_parser.DUMP_ROOT_ENV_VAR, str(missing))
    with pytest.raises(SystemExit) as exc:
        _dump_parser.resolve_dump_root()
    message = str(exc.value)
    assert _dump_parser.DUMP_ROOT_ENV_VAR in message
    assert "not a directory" in message


def test_symlink_fallback_used_when_env_unset(tmp_path, monkeypatch):
    monkeypatch.delenv(_dump_parser.DUMP_ROOT_ENV_VAR, raising=False)
    monkeypatch.setattr(_dump_parser, "REPO_ROOT", tmp_path)
    (tmp_path / "footbag_legacy_repo").mkdir()
    assert _dump_parser.resolve_dump_root() == tmp_path / "footbag_legacy_repo"


def test_none_when_neither_env_nor_symlink(tmp_path, monkeypatch):
    monkeypatch.delenv(_dump_parser.DUMP_ROOT_ENV_VAR, raising=False)
    monkeypatch.setattr(_dump_parser, "REPO_ROOT", tmp_path)
    assert _dump_parser.resolve_dump_root() is None


def test_module_dump_path_maps_app_to_backup_file():
    root = Path("/dump/root")
    assert _dump_parser.module_dump_path(root, "members") == root / "members" / "backups" / "latest.sql"


def test_module_dump_path_handles_nested_admin_segment():
    root = Path("/dump/root")
    assert (
        _dump_parser.module_dump_path(root, "members/admin")
        == root / "members" / "admin" / "backups" / "latest.sql"
    )

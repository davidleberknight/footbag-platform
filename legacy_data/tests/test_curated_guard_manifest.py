"""Runtime contract for the curated-tree guard's mode manifest.

The guard takes the write bit off the hand-authored trees for a run and puts the
original modes back on the way out. That means it has to record a mode and a path
per file and read them back exactly, and the curated trees hold archival material
whose filenames legitimately contain spaces: magazine scans, spreadsheet exports.

An earlier manifest was space-delimited and newline-terminated, so the guard
refused to run at all rather than mis-parse such a path. Refusing meant the most
irreplaceable files in the repository went unprotected and no mirror-backed run
could start on a machine that had them. The manifest is now two NUL-delimited
fields per record, which no filename can forge.

These exercise the real functions against a synthetic tree. Nothing here touches
a real curated tree: the guard's own trees are replaced before it is called.
"""
from __future__ import annotations

import os
import re
import stat
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
ORCHESTRATOR = REPO_ROOT / "legacy_data" / "run_pipeline.sh"

# The guard is lifted out of the orchestrator verbatim so these test the shipped
# code rather than a copy of it that could drift.
_START = "CURATED_TREES=("
_END = "trap curated_unlock_and_verify EXIT"


def _guard_source() -> str:
    text = ORCHESTRATOR.read_text(encoding="utf-8")
    start = text.index(_START)
    end = text.index(_END)
    block = text[start:end]
    # Point it at the tree the test builds instead of the repository's own.
    return re.sub(r"CURATED_TREES=\((?:[^)]*)\)", 'CURATED_TREES=("$TEST_TREE")',
                  block, count=1)


def _harness(tmp_path: Path, tree: Path, body: str) -> subprocess.CompletedProcess:
    script = tmp_path / "harness.sh"
    # Trap first, then lock, in the orchestrator's own order, so the restore is
    # reached on every exit path here exactly as it is there. Calling the restore
    # explicitly instead would leave the one guarantee it exists for untested.
    script.write_text(
        "set -euo pipefail\n"
        f'TEST_TREE="{tree}"\n'
        f"{_guard_source()}\n"
        "trap curated_unlock_and_verify EXIT\n"
        "curated_lock\n"
        f"{body}\n",
        encoding="utf-8")
    return subprocess.run(["bash", str(script)], capture_output=True, text=True)


def _modes(tree: Path) -> dict[str, int]:
    out = {}
    for root, _dirs, files in os.walk(tree):
        for f in files:
            p = Path(root) / f
            out[str(p)] = stat.S_IMODE(p.stat().st_mode)
    return out


@pytest.fixture
def tree(tmp_path):
    t = tmp_path / "curated"
    (t / "sub dir").mkdir(parents=True)
    (t / "plain.csv").write_text("a,b\n", encoding="utf-8")
    (t / "Footbag World Vol. 13 No. 2 Page 1.jpeg").write_text("scan", encoding="utf-8")
    (t / "sub dir" / "trailing space .txt").write_text("x", encoding="utf-8")
    (t / "tab\tseparated.txt").write_text("y", encoding="utf-8")
    return t


def test_a_spaced_filename_is_locked_rather_than_refused(tmp_path, tree):
    r = _harness(tmp_path, tree, 'test ! -w "$TEST_TREE/Footbag World Vol. 13 No. 2 Page 1.jpeg"')
    assert r.returncode == 0, r.stderr
    assert "whitespace in a protected path" not in r.stderr
    assert "locked read-only" in r.stdout


def test_every_file_including_spaced_ones_loses_the_write_bit(tmp_path, tree):
    body = ('while IFS= read -r -d "" f; do\n'
            '  if [ -w "$f" ]; then echo "STILL WRITABLE: $f"; fi\n'
            'done < <(find "$TEST_TREE" -type f -print0)')
    r = _harness(tmp_path, tree, body)
    assert r.returncode == 0, r.stderr
    assert "STILL WRITABLE" not in r.stdout


def test_original_modes_are_restored_exactly(tmp_path, tree):
    (tree / "plain.csv").chmod(0o640)
    (tree / "Footbag World Vol. 13 No. 2 Page 1.jpeg").chmod(0o604)
    before = _modes(tree)
    r = _harness(tmp_path, tree, "true")
    assert r.returncode == 0, r.stderr
    assert _modes(tree) == before


def test_a_newline_in_a_filename_cannot_corrupt_the_manifest(tmp_path, tree):
    # The case the old delimiter could not survive: a newline would have split
    # one record into two, and the mode of the second half would have been
    # applied to a path that does not exist, silently leaving a file read-only.
    hostile = tree / "two\nlines.txt"
    hostile.write_text("z", encoding="utf-8")
    hostile.chmod(0o644)
    before = _modes(tree)
    r = _harness(tmp_path, tree, "true")
    assert r.returncode == 0, r.stderr
    assert _modes(tree) == before
    assert stat.S_IMODE(hostile.stat().st_mode) == 0o644


def test_a_leading_or_trailing_space_survives_the_round_trip(tmp_path, tree):
    odd = tree / " leading and trailing "
    odd.write_text("q", encoding="utf-8")
    odd.chmod(0o600)
    r = _harness(tmp_path, tree, "true")
    assert r.returncode == 0, r.stderr
    assert stat.S_IMODE(odd.stat().st_mode) == 0o600


def test_drift_in_a_protected_tree_still_fails_the_run(tmp_path, tree):
    # The detection half must survive the manifest change. Writing through the
    # read-only bit is what a stage running as the owner can still do.
    body = ('chmod u+w "$TEST_TREE/plain.csv"\n'
            'echo "mutated" >> "$TEST_TREE/plain.csv"')
    r = _harness(tmp_path, tree, body)
    assert r.returncode != 0
    assert "changed hand-authored data" in r.stderr


def test_drift_is_detected_on_a_spaced_filename_too(tmp_path, tree):
    body = ('chmod u+w "$TEST_TREE/Footbag World Vol. 13 No. 2 Page 1.jpeg"\n'
            'echo "mutated" >> "$TEST_TREE/Footbag World Vol. 13 No. 2 Page 1.jpeg"')
    r = _harness(tmp_path, tree, body)
    assert r.returncode != 0
    assert "changed hand-authored data" in r.stderr


def test_an_unchanged_whitespace_free_tree_behaves_exactly_as_before(tmp_path):
    plain = tmp_path / "curated"
    plain.mkdir()
    (plain / "a.csv").write_text("x\n", encoding="utf-8")
    (plain / "b.csv").write_text("y\n", encoding="utf-8")
    before = _modes(plain)
    r = _harness(tmp_path, plain, "true")
    assert r.returncode == 0, r.stderr
    assert _modes(plain) == before
    assert "2 hand-authored file(s) locked read-only" in r.stdout


def test_the_restore_runs_even_when_the_body_fails(tmp_path, tree):
    # The guarantee the trap exists for: a failing stage must not leave the
    # operator with a read-only tree.
    r = _harness(tmp_path, tree, "false || true; exit 3")
    assert r.returncode == 3
    for path in _modes(tree):
        assert os.access(path, os.W_OK), path


def test_the_orchestrator_no_longer_refuses_whitespace():
    # The repair, pinned at the source: the old refusal must not come back, or
    # every machine holding the magazine scans is blocked again.
    text = ORCHESTRATOR.read_text(encoding="utf-8")
    assert "whitespace in a protected path" not in text
    assert "%m\\0%p\\0" in text
    assert 'read -r -d \'\' mode' in text

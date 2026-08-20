"""
test_pipeline_protects_curated_trees.py
=======================================

Pins the curated-tree guard in `run_pipeline.sh`.

Why this exists. Three trees hold hand-authored data that every pipeline stage
may read and no stage may write: the corrections and overrides, the curated
pre-1997 intake, and the frozen identity lock. `legacy_data/CLAUDE.md` states
that invariant, and a static audit of every write-capable call site in the 44
scripts the orchestrator runs confirms it holds today. Nothing stopped it from
stopping being true, which is the whole reason the committed-artifact audit
exists — a correction is only as durable as the file it lives in.

The guard takes the write bit off those trees for the duration of a run, so a
stage that tries to write fails at that instant naming its own path, and
compares a per-file SHA-256 manifest on the way out, so a write that lands
anyway cannot pass unseen. A handful of identity-lock snapshots are gitignored
and exist only on the machine that made them, which is why the guard prevents
rather than only reports: for those, a report after the fact would arrive with
nothing left to restore.

These tests are structural. The guard's runtime behaviour — lock, refuse,
restore on every exit path — is exercised against the real trees by the
operator procedure, not from the test suite, because a test must never write
into a real-data tree.

Run from repo root:
    python -m pytest legacy_data/tests/test_pipeline_protects_curated_trees.py -v
"""
from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY = REPO_ROOT / "legacy_data"
ORCHESTRATOR = LEGACY / "run_pipeline.sh"

PROTECTED_TREES = [
    LEGACY / "overrides",
    LEGACY / "inputs" / "curated",
    LEGACY / "inputs" / "identity_lock",
]

SCRIPT = ORCHESTRATOR.read_text(encoding="utf-8")


@pytest.mark.parametrize("tree", PROTECTED_TREES, ids=lambda p: p.name)
def test_the_tree_exists_and_holds_files(tree):
    assert tree.is_dir(), f"{tree} is missing; the guard would silently cover nothing."
    assert any(tree.rglob("*")), f"{tree} is empty; nothing left to protect."


@pytest.mark.parametrize("tree", PROTECTED_TREES, ids=lambda p: p.name)
def test_the_guard_covers_the_tree(tree):
    """A tree absent from CURATED_TREES is unguarded, and silently so."""
    block = re.search(r"CURATED_TREES=\((.*?)\)", SCRIPT, re.DOTALL)
    assert block, "run_pipeline.sh no longer declares CURATED_TREES."
    relative = tree.relative_to(LEGACY).as_posix()
    assert relative in block.group(1), (
        f"{relative} is not in CURATED_TREES, so a stage could write into it."
    )


def test_the_guard_locks_before_any_stage_runs():
    """
    Locking after the mode dispatch would leave every stage free to write. The
    call has to sit above the dispatch, next to the other refuse-up-front guard.
    """
    lock = SCRIPT.index("curated_lock\n")
    dispatch = SCRIPT.index('case "$MODE" in')
    assert lock < dispatch


def test_the_restore_runs_on_every_exit_path():
    """
    Without the EXIT trap a failed stage, a signal or Ctrl-C would leave the
    operator with read-only trees and no way to know why.
    """
    assert "trap curated_unlock_and_verify EXIT" in SCRIPT


def test_the_guard_both_prevents_and_detects():
    body = SCRIPT[SCRIPT.index("# CURATED-TREE GUARD"):SCRIPT.index("curated_lock\n")]
    assert "chmod -R a-w" in body, "the guard no longer prevents, only reports."
    assert "sha256sum" in body, "the guard no longer detects a write that lands anyway."


def test_the_restore_is_unconditional():
    """
    The restore must not sit behind the verification, or a drift report would
    leave the trees locked.
    """
    body = SCRIPT[SCRIPT.index("curated_unlock_and_verify()"):]
    restore = body.index("chmod \"$mode\"")
    verify = body.index("curated_hashes > \"$CURATED_HASHES_AFTER\"")
    assert restore < verify


def test_drift_fails_the_run():
    body = SCRIPT[SCRIPT.index("curated_unlock_and_verify()"):]
    assert "FATAL: a pipeline stage changed hand-authored data." in body
    assert "exit 1" in body


def test_the_guard_survives_a_checkout_with_none_of_the_trees(tmp_path):
    """
    A checkout without these trees is supported, and the guard must not take
    the run down with it. The regression this pins: with every tree absent the
    tree-listing helper returned non-zero from its last test, and under
    `set -euo pipefail` that aborted the whole script from inside a command
    substitution — exit 1, no output, no explanation.

    Runs the real orchestrator in a temp directory, so no real data is touched.
    The stubs mirror the ones the deploy-script suite uses for the same script.
    """
    shutil.copy(ORCHESTRATOR, tmp_path / "run_pipeline.sh")
    venv_bin = tmp_path / ".venv" / "bin"
    venv_bin.mkdir(parents=True)
    (venv_bin / "activate").write_text("")
    (venv_bin / "pip").write_text("#!/bin/sh\nexit 0\n")
    (venv_bin / "pip").chmod(0o755)
    stub_bin = tmp_path / "stub-bin"
    stub_bin.mkdir()
    (stub_bin / "python").write_text("#!/bin/sh\nexit 0\n")
    (stub_bin / "python").chmod(0o755)

    result = subprocess.run(
        ["bash", "run_pipeline.sh", "canonical_only"],
        cwd=tmp_path,
        env={"PATH": f"{stub_bin}:/usr/bin:/bin", "HOME": str(tmp_path)},
        capture_output=True,
        text=True,
        timeout=120,
    )
    combined = result.stdout + result.stderr
    assert "Curated-tree guard" in combined, (
        "the guard produced no output at all, which is what a silent "
        f"set -e abort looks like. Exit was {result.returncode}."
    )
    assert "0 hand-authored file(s)" in combined

"""The removed `person_aliases.lock`, and the absence of anything that wants it.

`overrides/person_aliases.lock` was zero bytes from the commit that created it
until the commit that removed it, and nothing ever read or wrote it. It was the
only file of its kind here, and no lock-file convention exists in this repository
for it to belong to.

It arrived as a carryover. The prototyping repository this tree was bootstrapped
from holds the same empty path and excludes it from version control; the
exclusion rule was not carried across with the files, so an empty file was
committed that its own repository of origin had already decided not to keep.

That repository's real identity-lock sentinel is a different file with a
different name, carrying a JSON fingerprint and written by a pipeline stage. This
one had no producer in either place, which is the distinction worth preserving:
its absence is not a missing mechanism, and a future reader finding the name in
history should not go looking for the stage that maintains it.

No ignore rule guards this. A file the repository should simply not have does not
need a convention encoding its exclusion, and an ignore rule would only hide a
regression these tests are here to surface.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]

REMOVED = _ROOT / "legacy_data" / "overrides" / "person_aliases.lock"

# The directories that hold executable code. Named rather than searching the tree
# wholesale, because the local site mirror is a crawled website carrying vendored
# scripts of its own, and a match in there would say nothing about this pipeline.
CODE_TREES = [
    "legacy_data/pipeline",
    "legacy_data/event_results/scripts",
    "legacy_data/tools",
    "legacy_data/scripts",
    "legacy_data/clubs",
    "legacy_data/persons",
    "legacy_data/membership",
    "legacy_data/member_data_scripts",
    "scripts",
    "src",
]
_SUFFIXES = ["--include=*.py", "--include=*.sh", "--include=*.ts"]


def _grep(pattern: str) -> list[str]:
    """Files under the code trees carrying `pattern`, minus this test itself."""
    trees = [str(_ROOT / t) for t in CODE_TREES if (_ROOT / t).is_dir()]
    hit = subprocess.run(
        ["grep", "-rl", pattern, *trees, *_SUFFIXES, "--exclude-dir=.venv"],
        capture_output=True, text=True,
    ).stdout.split()
    return [h for h in hit if Path(h).name != Path(__file__).name]


def test_the_removed_file_is_absent():
    assert not REMOVED.exists(), (
        "person_aliases.lock is back. It is a zero-byte file with no reader, no "
        "writer, and no convention behind it; the alias data lives in "
        "person_aliases.csv beside it."
    )


def test_no_executable_code_references_it():
    """The reason it could go without a migration: nothing ever named it."""
    others = _grep("person_aliases.lock")
    assert not others, f"something now references the removed file: {others}"


def test_no_producer_can_recreate_it():
    """Nothing writes a lock file, so nothing can put this one back.

    Broader than the name on purpose. A stage that started maintaining a lock
    file under some other name would be a new mechanism worth noticing, and the
    claim being preserved is that this repository has no such mechanism at all.
    """
    writers = _grep(r"\.lock")
    assert not writers, (
        f"code now names a lock-file path: {writers}. If a stage genuinely needs "
        "one, that is a new mechanism to design deliberately rather than a "
        "carryover to restore."
    )


def test_the_repository_tracks_no_lock_file():
    """The state that made this file an anomaly, pinned.

    It was the only tracked `.lock` in the repository. Tracking one again should
    be a deliberate act, not something that arrives with an import.

    Counts a path only when it is both tracked and present on disk. A removal
    that has not been staged yet is still in the index, and that transient state
    is the commit in progress rather than a lock file the repository keeps.
    """
    tracked = subprocess.run(
        ["git", "ls-files", "*.lock"],
        capture_output=True, text=True, cwd=_ROOT,
    )
    if tracked.returncode != 0:
        return  # not a git checkout; the filesystem assertions above still hold
    files = [f for f in tracked.stdout.split() if f and (_ROOT / f).exists()]
    assert not files, f"the repository tracks a lock file again: {files}"

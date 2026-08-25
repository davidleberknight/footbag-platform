"""
test_symbolic_grammar_artifact_current.py
=========================================

The committed symbolic-grammar CSVs are a rendered view of the dictionary. They
are read by a loader and served from the database, so a reader never sees the
generator; they see whatever the artifact said the last time somebody ran it.

That is fine while the two agree and invisible when they stop. The artifact this
guard was written alongside had drifted so far that regenerating it moved more
than eighteen hundred rows, and nothing anywhere reported a problem in the years
between: no error, no failing check, no visible gap on the site. Staleness in a
generated file is silent by construction.

So this guard regenerates into a throwaway directory and requires the result to
match the committed bytes exactly. Zero diff, not a tolerance: the writer emits
LF and sorts its rows, so a run that produces different bytes has produced
different content, and the only honest resolutions are to regenerate and commit
or to explain why the difference is wanted.

The hand-authored crosslinks file is not generated and is not compared.

Reads the built database; skips when it is absent, and fails instead of skipping
in a run that declares a database is required, because a freshness check that
silently skips is exactly the failure it exists to prevent.

Run from repo root:
    python -m pytest legacy_data/tests/test_symbolic_grammar_artifact_current.py -v
"""
import filecmp
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

from built_db import DB_PATH, REPO_ROOT, require_loaded

GENERATOR = REPO_ROOT / "freestyle" / "scripts" / "build_symbolic_grammar_2.py"
COMMITTED = REPO_ROOT / "freestyle" / "symbolic_grammar"

# Written by hand, never regenerated, so it is not part of this comparison.
NOT_GENERATED = {"glossary_crosslinks.csv"}

# A regeneration reads one database and writes ten small files. A minute is far
# beyond it; the bound exists so a wedged run fails the suite rather than parking
# the worker with nothing reported.
TIMEOUT_SECONDS = 300


def _regenerate_into(root: Path) -> Path:
    """Run the generator against a throwaway root and return its output directory.

    The generator resolves both its database and its output directory relative to
    its own location, so giving it a private root is what keeps this check from
    writing into the repository it is checking.
    """
    (root / "freestyle" / "scripts").mkdir(parents=True)
    (root / "database").mkdir()
    shutil.copy2(GENERATOR, root / "freestyle" / "scripts" / GENERATOR.name)
    # Symlinked rather than copied: the database is large and only read.
    (root / "database" / "footbag.db").symlink_to(DB_PATH)

    result = subprocess.run(
        [sys.executable, str(root / "freestyle" / "scripts" / GENERATOR.name)],
        capture_output=True,
        text=True,
        timeout=TIMEOUT_SECONDS,
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
    )
    if result.returncode != 0:
        pytest.fail(
            "the symbolic-grammar generator failed, so the artifact cannot be "
            f"checked for freshness:\n{result.stdout}\n{result.stderr}"
        )
    return root / "freestyle" / "symbolic_grammar"


def test_committed_symbolic_grammar_matches_a_fresh_regeneration():
    require_loaded("freestyle_tricks")

    with tempfile.TemporaryDirectory(prefix="footbag-test-symbolic-") as tmp:
        fresh = _regenerate_into(Path(tmp))

        produced = {p.name for p in fresh.glob("*.csv")}
        committed = {p.name for p in COMMITTED.glob("*.csv")} - NOT_GENERATED

        missing = sorted(committed - produced)
        assert not missing, (
            "the generator no longer produces files the repository carries, so "
            f"those committed files can never be refreshed: {', '.join(missing)}"
        )
        extra = sorted(produced - committed)
        assert not extra, (
            "the generator produces files the repository does not carry, so its "
            f"output is not fully committed: {', '.join(extra)}"
        )

        stale = sorted(
            name for name in committed
            if not filecmp.cmp(fresh / name, COMMITTED / name, shallow=False)
        )
        assert not stale, (
            "these committed symbolic-grammar files differ from what the generator "
            "produces from the current dictionary, so the published artifact no "
            "longer describes the data it claims to: " + ", ".join(stale)
            + ". Regenerate with freestyle/scripts/build_symbolic_grammar_2.py and "
            "commit the result, or change the generator if the difference is wrong."
        )


def test_the_hand_authored_file_is_still_hand_authored():
    # The exclusion above is only safe while the generator leaves this file alone.
    # If it ever started writing it, the exclusion would hide a real overwrite of
    # curated content.
    require_loaded("freestyle_tricks")
    with tempfile.TemporaryDirectory(prefix="footbag-test-symbolic-") as tmp:
        fresh = _regenerate_into(Path(tmp))
        written = sorted(p.name for p in fresh.glob("*.csv") if p.name in NOT_GENERATED)
        assert not written, (
            "the generator now writes a file recorded as hand-authored, so a "
            "regeneration would destroy curation: " + ", ".join(written)
        )

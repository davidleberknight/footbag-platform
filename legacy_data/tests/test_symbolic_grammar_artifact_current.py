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

# What the generator reaches for outside its own directory, as repository-relative
# paths so each lands in the same place under the throwaway root. It imports the
# freshness check from the repository's script directory, and that check in turn
# compares the database against the curator ledger, so the ledger travels too.
# Named rather than inferred: a missing import fails loudly, but a missing data
# file fails as a file-not-found from inside somebody else's module, which reads
# like a broken checkout rather than an incomplete copy.
GENERATOR_DEPENDENCIES = (
    Path("scripts") / "_freestyle_db_freshness.py",
    Path("freestyle") / "inputs" / "curated" / "tricks" / "red_corrections_2026_04_20.csv",
)

# Written by hand, never regenerated, so it is not part of this comparison.
NOT_GENERATED = {"glossary_crosslinks.csv"}

# A regeneration reads one database and writes ten small files. A minute is far
# beyond it; the bound exists so a wedged run fails the suite rather than parking
# the worker with nothing reported.
TIMEOUT_SECONDS = 300


def _regenerate_into(root: Path) -> Path:
    """Run the generator against a throwaway root and return its output directory.

    The generator resolves its database, its output directory AND its imports
    relative to its own location, so giving it a private root is what keeps this
    check from writing into the repository it is checking, and is also what makes
    the private root have to carry everything it reaches for. A dependency the
    generator gains at the repository root is not beside it here, and the symptom
    is an import error rather than a drift report: the check cannot run at all,
    which is why the copy is driven by a named list rather than by the one file
    anybody remembers.
    """
    (root / "freestyle" / "scripts").mkdir(parents=True)
    (root / "database").mkdir()
    shutil.copy2(GENERATOR, root / "freestyle" / "scripts" / GENERATOR.name)
    for relative in GENERATOR_DEPENDENCIES:
        source = REPO_ROOT / relative
        assert source.exists(), (
            f"{relative} is named as a generator dependency and does not exist. Either it "
            f"moved, in which case this list needs updating, or the checkout is incomplete."
        )
        destination = root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
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

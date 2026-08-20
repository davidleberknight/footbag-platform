"""
test_canonical_writers_lf.py
============================

Pins the LF line ending on every CSV writer the pipeline orchestrator runs.

Why this exists. Python's csv module defaults to CRLF, and these writers pass
`newline=""` to `open()`, so a writer that omits `lineterminator` emits CRLF
while every committed CSV in this tree is LF. `.gitattributes` normalises on
commit, so the repository is never corrupted and the defect is invisible in a
git diff — but every comparison made outside git reports all ~74,000 canonical
rows changed on every run. That is how an undurable hand edit stayed hidden:
the rebuild diff was unreadable, so a revert could not be told from a refresh.

The invariant is stated in `legacy_data/CLAUDE.md`: canonical CSVs are
deterministic, LF, UTF-8, sorted.

The writer list is derived from `run_pipeline.sh` rather than hand-kept. A
hand-kept list cannot notice its own gaps, and this one already had one: the
canonical exporter was pinned to LF while the remediation step that rewrites
the same five files immediately afterwards was not, which left the output CRLF
and the fix inert. A rule over the whole orchestrated chain has no such gap,
and a new stage is covered the day it is wired in.

Run from repo root:
    python -m pytest legacy_data/tests/test_canonical_writers_lf.py -v
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY = REPO_ROOT / "legacy_data"
ORCHESTRATOR = LEGACY / "run_pipeline.sh"

# A writer whose output is deliberately not LF would be listed here with its
# reason. Nothing qualifies today, and the empty set is the point: an exception
# has to be argued for in writing rather than left as a silent omission.
EXEMPT: dict[str, str] = {}


def orchestrated_scripts() -> list[Path]:
    """Every python script run_pipeline.sh invokes, in any mode."""
    text = ORCHESTRATOR.read_text(encoding="utf-8")
    rel = sorted(set(re.findall(r"python ([A-Za-z0-9_/.-]+\.py)", text)))
    return [LEGACY / r for r in rel if (LEGACY / r).exists()]


def csv_writer_calls(path: Path):
    """Every csv.writer / csv.DictWriter construction in a script."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not isinstance(func, ast.Attribute) or func.attr not in {"writer", "DictWriter"}:
            continue
        if not (isinstance(func.value, ast.Name) and func.value.id == "csv"):
            continue
        yield node


SCRIPTS = orchestrated_scripts()
WITH_WRITERS = [p for p in SCRIPTS if any(csv_writer_calls(p))]


def test_the_orchestrator_still_names_scripts_this_test_can_find():
    """A regex that matched nothing would make every case below vacuous."""
    assert len(SCRIPTS) >= 30, f"only found {len(SCRIPTS)} orchestrated scripts"
    assert len(WITH_WRITERS) >= 8, f"only found {len(WITH_WRITERS)} scripts with CSV writers"


@pytest.mark.parametrize("script", WITH_WRITERS, ids=lambda p: p.name)
def test_every_csv_writer_in_the_chain_pins_lf(script):
    for call in csv_writer_calls(script):
        site = f"{script.relative_to(LEGACY)}:{call.lineno}"
        if site in EXEMPT:
            continue
        kwargs = {kw.arg: kw.value for kw in call.keywords}
        assert "lineterminator" in kwargs, (
            f"{site} constructs a CSV writer without lineterminator, so it "
            f"emits CRLF into a tree whose committed CSVs are all LF."
        )
        value = kwargs["lineterminator"]
        assert isinstance(value, ast.Constant) and value.value == "\n", (
            f"{site} pins a line terminator that is not LF."
        )


COMMITTED_CSV_DIRS = [
    LEGACY / "event_results" / "canonical_input",
    LEGACY / "seed",
]


@pytest.mark.parametrize("directory", COMMITTED_CSV_DIRS, ids=lambda p: p.name)
def test_the_committed_csvs_are_lf(directory):
    """
    The other half of the contract: the files these writers have to reproduce.
    A CRLF byte here means something wrote one of them outside the pipeline.
    """
    files = sorted(directory.glob("*.csv"))
    assert files, f"{directory.name} holds no CSVs; the committed set is missing."
    for path in files:
        assert b"\r\n" not in path.read_bytes(), f"{path.name} carries CRLF line endings."

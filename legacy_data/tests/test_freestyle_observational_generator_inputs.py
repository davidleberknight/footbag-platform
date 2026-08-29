"""The observational-universe generator reads only committed freestyle inputs.

Its corpus inputs were relocated out of the research scratch directory into
freestyle/inputs/observational/, so neither the generator nor the consistency gate
that runs it depends on that directory. This guards that regression: the research
directory can be retired without breaking generation.

The ruling ledger in that same directory is now the seed loader's input rather
than the generator's: the adjudications live in the database, and the loader fills
them from this file. It has to stay where the loader expects it.
"""
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
GENERATOR = REPO / "freestyle" / "scripts" / "build_observational_universe_content.py"
LEDGER = REPO / "freestyle" / "inputs" / "observational" / "EV_FORMULA_IDENTITY_ROWS.csv"


def test_generator_references_no_research_directory():
    src = GENERATOR.read_text(encoding="utf-8")
    assert "exploration" not in src, (
        "build_observational_universe_content.py must not reference the research "
        "scratch directory; its inputs live under freestyle/inputs/. Found a reference."
    )


def test_ruling_ledger_lives_where_the_seed_loader_reads_it():
    assert LEDGER.exists(), (
        f"the ruling ledger must exist at {LEDGER}; the adjudication seed loader "
        "reads it from the committed freestyle inputs to fill the database table "
        "the generator classifies from."
    )

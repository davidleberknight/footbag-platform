"""The observational-universe generator reads only committed freestyle inputs.

Its ruling ledger (EV_FORMULA_IDENTITY_ROWS.csv, the adjudication authority) was
relocated out of the research scratch directory into freestyle/inputs/observational/,
so the generator and the generated-content consistency gate that runs it no longer
depend on that directory. This guards that regression: the research directory can be
retired without breaking generation.
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


def test_ruling_ledger_lives_in_committed_inputs():
    assert LEDGER.exists(), (
        f"the ruling ledger must exist at {LEDGER}; it was relocated into the committed "
        "freestyle inputs so the generator no longer depends on the research directory."
    )

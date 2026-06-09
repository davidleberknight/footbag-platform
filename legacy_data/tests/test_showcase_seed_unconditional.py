"""
test_showcase_seed_unconditional.py
===================================

Static guard: the showcase event + Footbag Hacky historical person in
event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py must seed
unconditionally (NOT behind any env flag), so every environment, production
included, ships them. A companion runtime gate
(scripts/validate-showcase-presence.sh) asserts they are present on the target
database. Together these prevent the regression where the records silently drop
out of a build and the Footbag Hacky system account's identity link dangles.

Run from repo root:
    python -m pytest legacy_data/tests/test_showcase_seed_unconditional.py -v
"""
import ast
from pathlib import Path

LOADER = (
    Path(__file__).resolve().parents[1]
    / "event_results" / "scripts" / "08_load_mvfp_seed_full_to_sqlite.py"
)

MARKERS = ("Footbag Hacky", "event_2025_beaver_open")


def test_showcase_block_is_not_env_gated() -> None:
    source = LOADER.read_text()

    # No opt-in environment flag may guard the loader: the showcase records
    # must seed on every run, not only when a variable is set.
    assert "FOOTBAG_SEED_PREVIEW_FIXTURE" not in source, (
        "the showcase seed must not be gated behind FOOTBAG_SEED_PREVIEW_FIXTURE"
    )

    # The records must actually be seeded: each marker appears on a code line.
    for marker in MARKERS:
        code_lines = [
            line for line in source.splitlines()
            if marker in line and not line.strip().startswith("#")
        ]
        assert code_lines, f"showcase marker '{marker}' not found in the loader"

    # And no environment-keyed `if` may wrap the statements that mention the
    # markers, which would re-introduce conditional seeding.
    tree = ast.parse(source)
    env_gated_lines: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.If) and "os.environ" in ast.dump(node.test):
            for child in node.body:
                env_gated_lines.update(
                    range(child.lineno, (child.end_lineno or child.lineno) + 1)
                )
    for marker in MARKERS:
        gated = [
            i for i, line in enumerate(source.splitlines(), start=1)
            if marker in line and not line.strip().startswith("#") and i in env_gated_lines
        ]
        assert gated == [], (
            f"showcase marker '{marker}' is inside an env-gated branch at line(s) {gated}"
        )


def test_presence_gate_exists_and_names_both_markers() -> None:
    gate = Path(__file__).resolve().parents[2] / "scripts" / "validate-showcase-presence.sh"
    assert gate.exists(), "scripts/validate-showcase-presence.sh is missing"
    text = gate.read_text()
    assert "Footbag Hacky" in text
    assert "#event_2025_beaver_open" in text

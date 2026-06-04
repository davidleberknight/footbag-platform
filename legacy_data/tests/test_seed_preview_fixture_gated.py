"""
test_seed_preview_fixture_gated.py
==================================

Static guard: the synthetic preview-fixture block in
event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py must stay gated
behind FOOTBAG_SEED_PREVIEW_FIXTURE=1 so a production load (which never
sets the flag) cannot inject the fixture. A companion runtime gate
(scripts/validate-fixture-absence.sh) asserts absence on the target
database; this test prevents the source-level regression where the gate
is removed and every load injects the fixture again.

Run from repo root:
    python -m pytest legacy_data/tests/test_seed_preview_fixture_gated.py -v
"""
import ast
from pathlib import Path

LOADER = (
    Path(__file__).resolve().parents[1]
    / "event_results" / "scripts" / "08_load_mvfp_seed_full_to_sqlite.py"
)


def _env_gate_tests(node: ast.If) -> bool:
    """True when the If condition reads FOOTBAG_SEED_PREVIEW_FIXTURE."""
    return "FOOTBAG_SEED_PREVIEW_FIXTURE" in ast.dump(node.test)


def test_fixture_block_is_inside_the_env_gate() -> None:
    source = LOADER.read_text()
    tree = ast.parse(source)

    gated_lines: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.If) and _env_gate_tests(node):
            for child in node.body:
                gated_lines.update(range(child.lineno, (child.end_lineno or child.lineno) + 1))

    assert gated_lines, "the FOOTBAG_SEED_PREVIEW_FIXTURE gate is missing entirely"

    # Every CODE line that mentions the fixture's identifying values must sit
    # inside the gate's body. Comment-only lines are not AST nodes and may
    # fall in the gaps between gated statements; they inject nothing.
    for marker in ("Footbag Hacky", "event_2025_beaver_open"):
        marker_lines = [
            i for i, line in enumerate(source.splitlines(), start=1)
            if marker in line and not line.strip().startswith("#")
        ]
        assert marker_lines, f"fixture marker '{marker}' not found; update this guard"
        ungated = [i for i in marker_lines if i not in gated_lines]
        assert ungated == [], (
            f"fixture marker '{marker}' appears OUTSIDE the "
            f"FOOTBAG_SEED_PREVIEW_FIXTURE gate at line(s) {ungated}"
        )


def test_checklist_gate_script_exists_and_names_both_markers() -> None:
    gate = Path(__file__).resolve().parents[2] / "scripts" / "validate-fixture-absence.sh"
    assert gate.exists(), "scripts/validate-fixture-absence.sh is missing"
    text = gate.read_text()
    assert "Footbag Hacky" in text
    assert "#event_2025_beaver_open" in text

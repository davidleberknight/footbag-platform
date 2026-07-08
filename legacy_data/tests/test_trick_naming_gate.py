"""
The trick-dictionary QC's naming-invariant hard gate.

Every trick's display name must be the plain human-readable form of its slug:
no underscores, hyphens only inside the curator-approved genuine-hyphen tokens,
and folding the name (lowercase, non-alphanumeric runs to underscores)
reproduces the slug, except for the curator-approved verbatim rows in the
committed exception file. These tests exercise the gate's check function
directly against in-memory rows (no database, no report files), plus the real
exception file, so a rule regression or a broken exception entry fails here.

Run from repo root:
    python -m pytest legacy_data/tests/test_trick_naming_gate.py -v
"""
import importlib.util
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
QC_PATH = REPO_ROOT / "freestyle" / "loaders" / "22_qc_trick_dictionary.py"

spec = importlib.util.spec_from_file_location("qc_trick_dictionary", QC_PATH)
qc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qc)


def row(slug, name):
    return {slug: {"slug": slug, "canonical_name": name}}


def test_plain_conforming_name_passes():
    assert qc.check_naming_invariant(row("spinning_paradox_mirage", "spinning paradox mirage")) == []
    # Capitalization is display freedom; the fold is case-insensitive.
    assert qc.check_naming_invariant(row("blender_same_side", "Blender Same Side")) == []


def test_separator_hyphen_fails():
    violations = qc.check_naming_invariant(row("spinning_paradox_mirage", "spinning-paradox-mirage"))
    assert len(violations) == 1
    assert "hyphen" in violations[0]


def test_underscore_in_display_fails():
    violations = qc.check_naming_invariant(row("blur", "blur_thing"))
    assert len(violations) == 1
    assert "underscore" in violations[0]


def test_name_not_folding_to_slug_fails():
    violations = qc.check_naming_invariant(row("blur", "completely different words"))
    assert len(violations) == 1
    assert "fold" in violations[0]


def test_genuine_hyphen_token_passes():
    # cross-body is a committed genuine-hyphen token: its hyphen stays in the
    # display while the slug folds it to an underscore.
    assert qc.check_naming_invariant(row("cross_body_sole_stall", "cross-body sole stall")) == []


def test_verbatim_row_exception_passes_and_binds_exactly():
    # The curator-ruled verbatim display passes only as its exact string.
    assert qc.check_naming_invariant(
        row("big_apple_sauce", "spinning paradox miraging symposium torque")
    ) == []
    violations = qc.check_naming_invariant(row("big_apple_sauce", "some other divergent name"))
    assert len(violations) == 1

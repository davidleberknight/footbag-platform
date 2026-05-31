"""
test_freestyle_media_coverage_embedded.py
=========================================

Verifies the embedded (indirect) instructional-coverage layer added to
`legacy_data/event_results/scripts/24_qc_freestyle_media_coverage.py`.

Contract pinned here:

  • The curator manifest (`embedded_coverage.csv`) parses into
    {embedded_trick_slug: [host_trick_slug, ...]}, and ships seeded with the
    orbit→around-the-world and illusion→mirage edges.
  • A core trick with no dedicated primary but an embedded edge classifies as
    EMBEDDED_ONLY, NOT CORE_GAP (orbit). Without the edge it stays CORE_GAP
    (regression guard: the bucket only moves because of embedded coverage).
  • Embedded coverage never downgrades a trick that already has a direct
    primary (illusion stays COMPLETE).
  • Embedded coverage is honesty-preserving: it is an independent flag and does
    not change a trick's status (direct strong-coverage stays direct).

These are pure-function assertions; they do not build the temp DB.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_media_coverage_embedded.py -v
"""
import importlib.util
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = (
    REPO_ROOT / "legacy_data" / "event_results" / "scripts"
    / "24_qc_freestyle_media_coverage.py"
)


# Dynamic import — the script filename starts with a digit, so the standard
# import form fails. spec_from_file_location is the canonical workaround.
def _load_module():
    spec = importlib.util.spec_from_file_location("media_coverage_24", SCRIPT_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


mod = _load_module()


def test_manifest_parses_seeded_edges():
    embedded = mod.load_embedded_coverage()
    assert embedded.get("orbit") == ["around-the-world"]
    assert embedded.get("illusion") == ["mirage"]


def test_embedded_edge_shifts_no_primary_off_the_gap_buckets():
    # orbit is a core atom with no dedicated primary; without an edge it is a
    # CORE_GAP, and with its embedded edge it must read as EMBEDDED_ONLY
    # (covered indirectly), leaving the gap list.
    assert mod.classify_priority("orbit", "ACTIVE_NO_PRIMARY", embedded_covered=True) == "EMBEDDED_ONLY"
    assert mod.classify_priority("orbit", "ACTIVE_NO_PRIMARY", embedded_covered=False) == "CORE_GAP"


def test_core_trick_core_gap_becomes_embedded_only():
    # For a trick that IS in CORE_TRICKS, an embedded edge moves the no-primary
    # bucket from CORE_GAP to EMBEDDED_ONLY — the headline value of this slice.
    core = next(iter(mod.CORE_TRICKS))
    assert mod.classify_priority(core, "ACTIVE_NO_PRIMARY", embedded_covered=False) == "CORE_GAP"
    assert mod.classify_priority(core, "ACTIVE_NO_PRIMARY", embedded_covered=True) == "EMBEDDED_ONLY"


def test_embedded_does_not_downgrade_covered_trick():
    # illusion has its own direct primary (ACTIVE_STRONG_PRIMARY) and is also
    # embedded; the embedded flag must never pull a covered trick out of COMPLETE.
    assert mod.classify_priority("illusion", "ACTIVE_STRONG_PRIMARY", embedded_covered=True) == "COMPLETE"


def test_embedded_flag_defaults_false_preserves_legacy_behavior():
    # The new parameter is optional; omitting it must equal passing False.
    for slug, status in (("orbit", "ACTIVE_NO_PRIMARY"), ("mirage", "ACTIVE_WEAK_PRIMARY")):
        assert mod.classify_priority(slug, status) == mod.classify_priority(slug, status, False)


def test_core_set_contains_all_twelve_atoms():
    # The media-priority core set is a superset of the 12 irreducible atoms.
    atoms = {
        "toe-stall", "clipper-stall", "around-the-world", "orbit", "legover",
        "pickup", "mirage", "illusion", "butterfly", "osis", "whirl", "swirl",
    }
    assert atoms <= mod.CORE_TRICKS


def test_clipper_kick_excluded_clipper_stall_included():
    # clipper-stall is the atom; the bare `clipper` slug is the Clipper Kick.
    assert "clipper-stall" in mod.CORE_TRICKS
    assert "clipper" not in mod.CORE_TRICKS

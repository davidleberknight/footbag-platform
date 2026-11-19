"""
test_freestyle_contest_never_net.py
===================================

A named freestyle contest is never a net division. Result pages often head one
with its bare name ("Open Rippin' Run", "Rutina Open"), and in an event that also
ran net the canonicalizer took any bare name for net by elimination, then the
remediation pass added "Net" to its name. The contest then showed under net, as
"Open Rippin' Run Net", a name the event never used. These pin both decisions on
representative headings, and the ordinary net headings beside them.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_contest_never_net.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CANON = REPO_ROOT / "legacy_data" / "pipeline" / "02_canonicalize_results.py"
REMEDIATE = REPO_ROOT / "legacy_data" / "pipeline" / "05p5_remediate_canonical.py"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


canon = _load("canon_freestyle_contest_never_net", CANON)


def _guards():
    """The remediation pass's token lists and guard functions, lifted out of the
    script so these exercise the shipped code rather than a copy that could drift."""
    source = REMEDIATE.read_text(encoding="utf-8")
    tokens = source[source.index("_EXPLICIT_NONNET_TOKENS = frozenset(["):
                    source.index("# Sentinel/placeholder names")]
    helpers = source[source.index("def _has_nonnet_explicit("):
                     source.index("# Events that contain")]
    ns: dict = {}
    exec(tokens + helpers, ns)  # noqa: S102
    return ns["_has_nonnet_explicit"], ns["_has_any_explicit"]


FREESTYLE_CONTESTS = [
    "Open Rippin' Run",
    "Intermediate Most Rippin' Run",
    "Rippinest Run",
    "Open Rippen Run",
    "Big 1",
    "Open Big One",
    "Open Best 3",
    "Open Judged Style",
    "Short Technical Program",
    "Last Man Standing",
    "Last Kicker Standing",
    "Doble Leg Over",
    "Rutina Open",
    "Women's Open Frestyle",
]


def test_a_named_freestyle_contest_is_freestyle_in_an_event_that_also_ran_net():
    # Defect caught: "Open Rippin' Run" filed under net because its event had net too.
    wrong = [n for n in FREESTYLE_CONTESTS if canon.categorize_division(n, "mixed") != "freestyle"]
    assert wrong == [], f"filed as other than freestyle: {wrong}"


def test_a_bare_net_heading_in_a_mixed_event_is_still_net():
    # Defect caught: the fix reaching ordinary bare net headings, which then leave net.
    assert canon.categorize_division("Open Singles", "mixed") == "net"


def test_a_named_freestyle_contest_never_gains_net_in_its_name():
    # Defect caught: the remediation pass renamed it "<name> Net".
    _has_nonnet_explicit, _has_any_explicit = _guards()
    renamed = [n for n in FREESTYLE_CONTESTS if not _has_any_explicit(n)]
    assert renamed == [], f"would gain 'Net': {renamed}"


def test_a_named_freestyle_contest_does_not_make_its_event_mixed():
    # Defect caught: an event of trick contests alone read as mixed, so its other
    # bare names gain "Net" although the event ran no net.
    _has_nonnet_explicit, _has_any_explicit = _guards()
    marking = [n for n in FREESTYLE_CONTESTS if _has_nonnet_explicit(n)]
    assert marking == [], f"would mark the event mixed: {marking}"


def test_a_bare_net_heading_still_gains_net():
    # Defect caught: the guard widened so far that a real bare net heading keeps no "Net".
    _has_nonnet_explicit, _has_any_explicit = _guards()
    assert not _has_any_explicit("Open Singles")

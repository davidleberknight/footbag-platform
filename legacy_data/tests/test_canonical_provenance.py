"""
test_canonical_provenance.py
============================

The committed canonical artifacts say which generators produced them, and the
claim is checked.

Tests that validate generated canonical data read the committed copies. Nothing
in that arrangement establishes those copies came from the generators the
repository now holds, so a transformation can change, its own test can pass
against yesterday's output, and the contradiction stays invisible until a full
regeneration weeks later. It then presents as a data regression rather than as
what it is: a test that had never seen the output of the code it shipped with.

Regenerating inside the run is the right answer where a generator is cheap and
hermetic, and this repository does exactly that for the artifacts that qualify.
The canonical set does not qualify: producing it is the multi-hour pipeline over
a site mirror. So the claim is carried in a ledger instead, and this is what
makes the ledger more than a note somebody wrote once.

Two states pass. Current, meaning the artifacts and the generators agree. And
acknowledged, meaning they do not, and the ledger says so with the current
fingerprint, a date and a reason. The failure this exists to produce is the third
state: they disagree and nothing says so.

The acknowledgement can never stand in for a regeneration. It names the gap; only
a rebuild closes it, and only a rebuild may advance the produced-by fingerprint.

Run from repo root:
    python -m pytest legacy_data/tests/test_canonical_provenance.py -v
"""
import json
import sys
from pathlib import Path

LEGACY = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LEGACY / "pipeline"))

import canonical_provenance as provenance  # noqa: E402


def _ledger() -> dict:
    assert provenance.LEDGER.exists(), (
        f"{provenance.LEDGER} is missing. The canonical set is generated output that lives "
        "in the repository, and the ledger is how it records which generators produced it."
    )
    return json.loads(provenance.LEDGER.read_text(encoding="utf-8"))


def test_every_named_generator_exists():
    # The dependency set is an explicit list, so a renamed or deleted generator
    # would otherwise shrink what the fingerprint covers without anyone noticing.
    missing = [rel for rel in provenance.GENERATORS if not (LEGACY / rel).exists()]
    assert not missing, (
        f"{len(missing)} generator(s) named by the dependency set do not exist: {missing}. "
        "Either they moved and the set needs updating, or the fingerprint now covers less "
        "than it claims to.")


def test_the_dependency_set_and_its_exclusions_do_not_overlap():
    # Every module that names the canonical trees is either a generator or is
    # recorded as consuming them. The overlap check is what stops a module being
    # quietly demoted out of the fingerprint by adding it to both.
    overlap = sorted(set(provenance.GENERATORS) & set(provenance.NON_GENERATORS))
    assert not overlap, (
        f"{len(overlap)} module(s) are listed both as generators and as non-generators: "
        f"{overlap}.")


def test_the_ledger_records_a_produced_by_fingerprint():
    ledger = _ledger()
    produced = ledger.get("produced_by")
    assert produced, "the ledger has no produced_by block, so it claims nothing"
    assert produced.get("fingerprint", "").startswith("sha256:"), (
        "the produced_by fingerprint is missing or not a digest")
    assert produced.get("generators"), (
        "the produced_by block carries no per-generator digests, so a drift report could "
        "not name which generator moved")
    assert produced.get("regenerated_at"), (
        "the produced_by block carries no date, so the age of the claim is unknowable")


def test_the_artifacts_the_ledger_speaks_for_are_present():
    ledger = _ledger()
    named = ledger.get("artifacts") or []
    assert named, "the ledger names no artifacts"
    missing = [name for name in named if not (provenance.CANONICAL / name).exists()]
    assert not missing, (
        f"the ledger speaks for {len(missing)} artifact(s) that are not here: {missing}")


def test_generator_state_is_either_current_or_acknowledged():
    ledger = _ledger()
    current = provenance.fingerprint()
    produced = ledger["produced_by"]["fingerprint"]
    if current == produced:
        return

    moved = sorted(rel for rel, digest in provenance.generator_digests().items()
                   if ledger["produced_by"]["generators"].get(rel) != digest)
    ack = ledger.get("known_stale")
    assert ack is not None, (
        "the canonical artifacts predate the current generators and nothing says so. "
        f"Moved: {moved}. Regenerate and stamp the ledger, or acknowledge the gap with a "
        "reason using the provenance tool. An unacknowledged gap is the exact failure this "
        "ledger exists to surface: a test that validates the old output while the code has "
        "moved on.")
    assert ack.get("current_fingerprint") == current, (
        "the acknowledgement is itself out of date: it was written against a generator "
        f"state that has since moved again. Moved: {moved}.")
    assert ack.get("reason", "").strip(), (
        "the acknowledgement carries no reason, which makes it a way to silence the gate "
        "rather than a record of a deferred rebuild")
    assert ack.get("acknowledged_at", "").strip(), (
        "the acknowledgement carries no date, so how long the artifacts have been behind "
        "cannot be known")


def test_an_acknowledgement_never_advances_the_produced_by_fingerprint():
    # The failure mode this forbids is the tempting one: clearing a red gate by
    # writing the current fingerprint into produced_by, which asserts a
    # regeneration that never happened and silently retires the evidence.
    ledger = _ledger()
    ack = ledger.get("known_stale")
    if ack is None:
        return
    assert ack["current_fingerprint"] != ledger["produced_by"]["fingerprint"], (
        "the acknowledgement names the same fingerprint as produced_by, so either it is "
        "meaningless or produced_by was advanced without a regeneration")

"""
test_canonical_export_output_isolation.py
=========================================

Pins the output-destination and whole-set publication contract of the canonical
platform export:

  - with no arguments the five CSVs land in the committed canonical_input
    directory, exactly as before;
  - --out-dir moves the whole set and writes nothing anywhere else, leaving the
    committed set untouched down to its timestamps;
  - every required canonical intermediate that is missing is reported in one run,
    not one per attempt, and with a status distinct from a bad destination;
  - an unusable destination is rejected before any output is generated;
  - a failure part way through generation publishes none of the five and leaves
    the previous set whole, with no staging artifacts behind;
  - two runs over identical inputs produce byte-identical output for all five;
  - row order is stable: the four event-scoped outputs follow input order and
    persons is sorted by name.

The exporter is driven through its real command line against synthetic inputs in
a temporary directory. No mirror, database, network, production intermediate, or
machine-local artifact is read. The only fault injection replaces the CSV writer
so a failure can be provoked at the publication boundary; argument parsing, input
reading and the whole transformation chain run for real.

Run from repo root:
    python -m pytest legacy_data/tests/test_canonical_export_output_isolation.py -v
"""
from __future__ import annotations

import csv
import hashlib
from pathlib import Path

import pytest

from canonical_export_sandbox import (
    LEGACY,
    OUTPUT_FILENAMES,
    SENTINELS,
    build_sandbox,
    classify_destination,
    default_output_dir,
    plant_prior_set,
    recovery_leftovers,
    run,
    run_with_failing_copy,
    run_with_failing_replace,
    run_with_failing_writer,
    staged_leftovers,
)

COMMITTED = LEGACY / "event_results" / "canonical_input"


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _fingerprint_set(directory: Path) -> dict:
    return {
        name: (p.stat().st_size, p.stat().st_mtime_ns, _digest(p))
        for name in OUTPUT_FILENAMES
        for p in [directory / name]
        if p.exists()
    }


def _rows(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


# ─── default and redirected destinations ─────────────────────────────────────


def test_no_arguments_writes_the_committed_default_set(tmp_path):
    script = build_sandbox(tmp_path)

    result = run(script)

    assert result.returncode == 0, result.stderr
    target = default_output_dir(script)
    assert sorted(p.name for p in target.iterdir()) == sorted(OUTPUT_FILENAMES)
    assert "redirected" not in result.stdout


def test_out_dir_moves_the_whole_set_and_writes_nothing_else(tmp_path):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"

    result = run(script, "--out-dir", str(out_dir))

    assert result.returncode == 0, result.stderr
    assert sorted(p.name for p in out_dir.iterdir()) == sorted(OUTPUT_FILENAMES)
    assert not default_output_dir(script).exists()
    assert str(out_dir) in result.stdout


def test_relative_out_dir_resolves_against_the_working_directory(tmp_path):
    script = build_sandbox(tmp_path)
    workdir = tmp_path / "workdir"
    workdir.mkdir()

    result = run(script, "--out-dir", "nested/compare", cwd=workdir)

    assert result.returncode == 0, result.stderr
    landed = workdir / "nested" / "compare"
    assert sorted(p.name for p in landed.iterdir()) == sorted(OUTPUT_FILENAMES)
    assert str(landed) in result.stdout


def test_redirected_run_leaves_the_committed_set_untouched(tmp_path):
    before = _fingerprint_set(COMMITTED)
    assert len(before) == 5, "expected all five committed outputs to exist"

    script = build_sandbox(tmp_path)
    result = run(script, "--out-dir", str(tmp_path / "compare"))

    assert result.returncode == 0, result.stderr
    assert _fingerprint_set(COMMITTED) == before


def test_no_production_input_is_read(tmp_path):
    # The sandbox holds no mirror, no database and no committed canonical_input,
    # so a successful run proves the exporter needed none of them.
    script = build_sandbox(tmp_path)
    sandbox_root = script.parent.parent.parent

    result = run(script, "--out-dir", str(tmp_path / "compare"))

    assert result.returncode == 0, result.stderr
    assert not (sandbox_root.parent / "footbag_legacy_mirror").exists()
    assert not list(sandbox_root.rglob("*.db"))
    assert sorted(p.name for p in sandbox_root.iterdir()) == ["out", "pipeline"]


# ─── missing intermediates ───────────────────────────────────────────────────


def test_every_missing_intermediate_is_reported_in_one_run(tmp_path):
    script = build_sandbox(
        tmp_path, omit_inputs=["events.csv", "event_results.csv", "persons.csv"]
    )

    result = run(script)

    assert result.returncode == 4
    for name in ("events.csv", "event_results.csv", "persons.csv"):
        assert name in result.stderr
    assert "3 required canonical intermediate(s) missing" in result.stderr
    # Actionable: names the producer and the orchestrator entry points.
    assert "02_canonicalize_results.py" in result.stderr
    assert "run_pipeline.sh" in result.stderr


def test_missing_intermediates_leave_the_destination_untouched(tmp_path):
    # Inputs are checked first, so a destination that does not exist yet is not
    # even created on the way to failing.
    script = build_sandbox(tmp_path, omit_inputs=["persons.csv"])
    out_dir = tmp_path / "compare"

    result = run(script, "--out-dir", str(out_dir))

    assert result.returncode == 4
    assert not out_dir.exists()


def test_missing_intermediates_do_not_disturb_an_existing_set(tmp_path):
    script = build_sandbox(tmp_path, omit_inputs=["persons.csv"])
    out_dir = tmp_path / "compare"
    plant_prior_set(out_dir)

    result = run(script, "--out-dir", str(out_dir))

    assert result.returncode == 4
    assert classify_destination(out_dir) == "complete-old"
    assert staged_leftovers(out_dir) == []


def test_missing_intermediates_are_distinct_from_a_bad_destination(tmp_path):
    missing_script = build_sandbox(tmp_path / "a", omit_inputs=["persons.csv"])
    complete_script = build_sandbox(tmp_path / "b")
    occupied = tmp_path / "not-a-directory"
    occupied.write_text("", encoding="utf-8")

    missing = run(missing_script, "--out-dir", str(tmp_path / "fine"))
    bad_destination = run(complete_script, "--out-dir", str(occupied))

    assert missing.returncode == 4
    assert bad_destination.returncode == 2


# ─── invalid destinations ────────────────────────────────────────────────────


def test_out_dir_that_is_a_file_is_rejected(tmp_path):
    script = build_sandbox(tmp_path)
    occupied = tmp_path / "not-a-directory"
    occupied.write_text("", encoding="utf-8")

    result = run(script, "--out-dir", str(occupied))

    assert result.returncode == 2
    assert "not a directory" in result.stderr
    assert str(occupied) in result.stderr


def test_out_dir_beneath_a_file_is_rejected(tmp_path):
    script = build_sandbox(tmp_path)
    blocker = tmp_path / "blocker"
    blocker.write_text("", encoding="utf-8")

    result = run(script, "--out-dir", str(blocker / "below"))

    assert result.returncode == 2
    assert "cannot be created" in result.stderr


@pytest.mark.parametrize("occupied_name", OUTPUT_FILENAMES)
def test_target_filename_occupied_by_a_directory_is_rejected(tmp_path, occupied_name):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    (out_dir / occupied_name).mkdir(parents=True)

    result = run(script, "--out-dir", str(out_dir))

    assert result.returncode == 2
    assert "is a directory, not a file" in result.stderr
    assert occupied_name in result.stderr


def test_a_rejected_destination_generates_nothing(tmp_path):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    (out_dir / "persons.csv").mkdir(parents=True)

    result = run(script, "--out-dir", str(out_dir))

    assert result.returncode == 2
    # Only the occupying directory remains; no CSV and no staging artifact.
    assert sorted(p.name for p in out_dir.iterdir()) == ["persons.csv"]
    assert staged_leftovers(out_dir) == []


# ─── failure during generation ───────────────────────────────────────────────


def test_failure_part_way_through_publishes_none_of_the_five(tmp_path):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    out_dir.mkdir()

    result = run_with_failing_writer(script, 4, "--out-dir", str(out_dir))

    assert result.returncode != 0
    published = [p.name for p in out_dir.iterdir() if p.name in OUTPUT_FILENAMES]
    assert published == []


def test_failure_leaves_a_previous_set_byte_identical(tmp_path):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"

    assert run(script, "--out-dir", str(out_dir)).returncode == 0
    before = _fingerprint_set(out_dir)
    assert len(before) == 5

    result = run_with_failing_writer(script, 4, "--out-dir", str(out_dir))

    assert result.returncode == 1
    assert "not published" in result.stderr
    assert _fingerprint_set(out_dir) == before


def test_failure_removes_every_staging_artifact(tmp_path):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    out_dir.mkdir()

    run_with_failing_writer(script, 4, "--out-dir", str(out_dir))

    assert staged_leftovers(out_dir) == []
    assert list(out_dir.iterdir()) == []


def test_success_removes_every_staging_artifact(tmp_path):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"

    assert run(script, "--out-dir", str(out_dir)).returncode == 0

    assert staged_leftovers(out_dir) == []
    assert sorted(p.name for p in out_dir.iterdir()) == sorted(OUTPUT_FILENAMES)


# ─── failure while preserving the previous set ───────────────────────────────
#
# Preservation runs after generation and before any replacement, so its failure
# must be the tamest of the three: nothing has been touched yet and nothing may
# be. The injected fault announces every replacement on stdout, so these tests
# prove the absence of publication rather than inferring it from the result.


@pytest.mark.parametrize("fail_on", [1, 2, 4, 5])
def test_preservation_failure_publishes_nothing_and_keeps_the_old_set(tmp_path, fail_on):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    plant_prior_set(out_dir)

    result = run_with_failing_copy(script, fail_on, "--out-dir", str(out_dir))

    assert result.returncode == 1
    assert "REPLACE-CALLED" not in result.stdout
    assert classify_destination(out_dir) == "complete-old"
    for name, body in SENTINELS.items():
        assert (out_dir / name).read_text(encoding="utf-8") == body
    assert staged_leftovers(out_dir) == []


@pytest.mark.parametrize("fail_on", [1, 3])
def test_preservation_failure_names_the_phase_without_claiming_success(tmp_path, fail_on):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    plant_prior_set(out_dir)

    result = run_with_failing_copy(script, fail_on, "--out-dir", str(out_dir))

    assert "could not preserve the existing output set" in result.stderr
    assert "nothing was replaced" in result.stderr
    assert "previous set is unchanged" in result.stderr
    assert "Done." not in result.stdout


def test_preservation_failure_leaves_earlier_evidence_untouched(tmp_path):
    # Artifacts from a crashed earlier run are not this run's to clean up.
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    plant_prior_set(out_dir)
    stale_staged = out_dir / ".events.csv.partial-99999"
    stale_recovery = out_dir / ".persons.csv.recovery-99999"
    stale_staged.write_text("STALE STAGED\n", encoding="utf-8")
    stale_recovery.write_text("STALE RECOVERY\n", encoding="utf-8")

    result = run_with_failing_copy(script, 3, "--out-dir", str(out_dir))

    assert result.returncode == 1
    assert stale_staged.read_text(encoding="utf-8") == "STALE STAGED\n"
    assert stale_recovery.read_text(encoding="utf-8") == "STALE RECOVERY\n"
    # Only the two planted artifacts survive; this run left none of its own.
    own = [
        p for p in out_dir.iterdir()
        if p.name.startswith(".") and p not in (stale_staged, stale_recovery)
    ]
    assert own == []


def test_preservation_failure_with_some_targets_absent(tmp_path):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    plant_prior_set(out_dir)
    absent = ["event_results.csv", "persons.csv"]
    for name in absent:
        (out_dir / name).unlink()
    present = [n for n in OUTPUT_FILENAMES if n not in absent]

    # Only three targets exist, so only three recovery copies are attempted.
    result = run_with_failing_copy(script, 3, "--out-dir", str(out_dir))

    assert result.returncode == 1
    assert "REPLACE-CALLED" not in result.stdout
    for name in present:
        assert (out_dir / name).read_text(encoding="utf-8") == SENTINELS[name]
    for name in absent:
        assert not (out_dir / name).exists()
    assert staged_leftovers(out_dir) == []


# ─── failure during publication ──────────────────────────────────────────────
#
# Generation failing is the easy case: nothing has been replaced, so nothing can
# be inconsistent. These cover the harder one, where some targets have already
# been replaced when the failure lands. The fault is injected around os.replace
# only; the whole real transformation, staging and CSV writing still run.


def test_failure_before_the_first_replacement_leaves_the_old_set_unchanged(tmp_path):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    plant_prior_set(out_dir)

    result = run_with_failing_replace(script, 1, "--out-dir", str(out_dir))

    assert result.returncode == 1
    assert classify_destination(out_dir) == "complete-old"
    assert staged_leftovers(out_dir) == []


@pytest.mark.parametrize("fail_on", [2, 3, 4, 5])
def test_failure_after_earlier_replacements_restores_the_whole_old_set(tmp_path, fail_on):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    plant_prior_set(out_dir)

    result = run_with_failing_replace(script, fail_on, "--out-dir", str(out_dir))

    assert result.returncode == 1
    assert classify_destination(out_dir) == "complete-old"
    for name, body in SENTINELS.items():
        assert (out_dir / name).read_text(encoding="utf-8") == body
    assert staged_leftovers(out_dir) == []
    assert "previous set is unchanged" in result.stderr


@pytest.mark.parametrize("fail_on", [1, 2, 3, 4, 5])
def test_with_no_old_set_a_failed_publication_leaves_none_of_the_five(tmp_path, fail_on):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    out_dir.mkdir()

    result = run_with_failing_replace(script, fail_on, "--out-dir", str(out_dir))

    assert result.returncode == 1
    assert [p.name for p in out_dir.iterdir() if p.name in OUTPUT_FILENAMES] == []
    assert staged_leftovers(out_dir) == []


def test_successful_publication_replaces_all_five(tmp_path):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    plant_prior_set(out_dir)

    result = run(script, "--out-dir", str(out_dir))

    assert result.returncode == 0, result.stderr
    assert classify_destination(out_dir) == "complete-new"
    assert staged_leftovers(out_dir) == []


def test_successful_rollback_leaves_no_recovery_artifact(tmp_path):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    plant_prior_set(out_dir)

    run_with_failing_replace(script, 3, "--out-dir", str(out_dir))

    assert recovery_leftovers(out_dir) == []
    assert sorted(p.name for p in out_dir.iterdir()) == sorted(OUTPUT_FILENAMES)


def test_a_failed_rollback_keeps_the_evidence_and_names_what_it_could_not_restore(tmp_path):
    # Fail the second replacement, then fail the restore that rollback attempts
    # for the one target already replaced.
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    plant_prior_set(out_dir)

    result = run_with_failing_replace(script, [2, 3], "--out-dir", str(out_dir))

    assert result.returncode == 1
    assert "CRITICAL" in result.stderr
    assert "INCONSISTENT" in result.stderr
    # It must not claim the previous set survived, because it did not.
    assert "previous set is unchanged" not in result.stderr
    # Names the target it could not restore.
    assert str(out_dir / "events.csv") in result.stderr
    # Keeps every recovery copy, including the one whose restore failed, and
    # names them so an operator can put the set back by hand.
    kept = recovery_leftovers(out_dir)
    assert len(kept) == len(OUTPUT_FILENAMES)
    for path in kept:
        assert str(path) in result.stderr
    assert any("events.csv.recovery-" in p.name for p in kept)
    # Staging artifacts are still cleaned; only recovery evidence is retained.
    assert [p for p in out_dir.iterdir() if ".partial-" in p.name] == []


def test_staging_names_cannot_collide_with_a_crashed_run_leftover(tmp_path):
    # A leftover from an earlier crashed process must neither be reused nor
    # deleted: it may be the only surviving copy of a previous set.
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    out_dir.mkdir()
    stale_staged = out_dir / ".events.csv.partial-99999"
    stale_recovery = out_dir / ".persons.csv.recovery-99999"
    stale_staged.write_text("STALE STAGED\n", encoding="utf-8")
    stale_recovery.write_text("STALE RECOVERY\n", encoding="utf-8")

    result = run(script, "--out-dir", str(out_dir))

    assert result.returncode == 0, result.stderr
    assert stale_staged.read_text(encoding="utf-8") == "STALE STAGED\n"
    assert stale_recovery.read_text(encoding="utf-8") == "STALE RECOVERY\n"
    assert sorted(p.name for p in out_dir.iterdir() if not p.name.startswith(".")) == sorted(
        OUTPUT_FILENAMES
    )


# ─── determinism and ordering ────────────────────────────────────────────────


def test_repeated_runs_over_identical_inputs_are_byte_identical(tmp_path):
    script = build_sandbox(tmp_path)
    first = tmp_path / "run-one"
    second = tmp_path / "run-two"

    assert run(script, "--out-dir", str(first)).returncode == 0
    assert run(script, "--out-dir", str(second)).returncode == 0

    for name in OUTPUT_FILENAMES:
        assert (first / name).read_bytes() == (second / name).read_bytes(), name


def test_event_scoped_outputs_preserve_input_order(tmp_path):
    # Four of the five carry their input order through unchanged. Pinning it
    # here means a future change that quietly reorders them is visible.
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    assert run(script, "--out-dir", str(out_dir)).returncode == 0

    canonical = script.parent.parent.parent / "out" / "canonical"
    for name, key in [
        ("events.csv", "event_key"),
        ("event_disciplines.csv", "discipline_key"),
        ("event_results.csv", "placement"),
        ("event_result_participants.csv", "display_name"),
    ]:
        produced = [r[key] for r in _rows(out_dir / name)]
        supplied = [r[key] for r in _rows(canonical / name)]
        assert produced == supplied, name


def test_persons_output_is_sorted_by_name(tmp_path):
    script = build_sandbox(tmp_path)
    out_dir = tmp_path / "compare"
    assert run(script, "--out-dir", str(out_dir)).returncode == 0

    names = [r["person_name"] for r in _rows(out_dir / "persons.csv")]
    assert names == sorted(names, key=str.lower)

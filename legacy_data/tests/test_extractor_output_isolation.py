"""
test_extractor_output_isolation.py
=================================

Pins the output-destination and regeneration contract shared by the two mirror
seed extractors:

  - with no arguments each extractor writes to its committed default target, so
    every existing caller is unaffected;
  - --out-dir writes the CSV beneath the requested directory and nowhere else,
    leaving the committed seed file untouched down to its timestamp;
  - the freshness skip still applies without --force, and --force always defeats
    it;
  - a redirected run that skips exits non-zero, because it wrote no file where
    the caller asked and must never be read as a successful regeneration;
  - an unusable output destination fails non-zero with a message naming the
    problem;
  - two forced runs over identical input produce byte-identical output.

Both extractors are driven through their real command line against a synthetic
mirror in a temporary directory. Nothing here needs the real mirror, the legacy
dump, a network connection, or a database, and nothing is mocked.

Run from repo root:
    python -m pytest legacy_data/tests/test_extractor_output_isolation.py -v
"""
from __future__ import annotations

import csv
import hashlib
from pathlib import Path

import pytest

from extractor_sandbox import (
    REPO_ROOT,
    build_sandbox,
    default_seed_csv,
    make_newer_than_script,
    run,
)

CLUBS = {
    "script": "extract_clubs.py",
    "helpers": ["club_curation.py", "extractor_output.py"],
    "filename": "clubs.csv",
    "expected_rows": 2,
    "expected_values": ["Riverside Footbag Club", "Harbour Shred Collective"],
}

MEMBERS = {
    "script": "extract_club_members.py",
    "helpers": ["extractor_output.py"],
    "filename": "club_members.csv",
    "expected_rows": 4,
    "expected_values": ["Ada Lovelace", "Karen Sparck Jones"],
}

EXTRACTORS = [pytest.param(CLUBS, id="clubs"), pytest.param(MEMBERS, id="club_members")]


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _fingerprint(path: Path) -> tuple:
    stat = path.stat()
    return (stat.st_size, stat.st_mtime_ns, _digest(path))


def _assert_real_output(csv_path: Path, spec: dict) -> list[dict]:
    with csv_path.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    assert len(rows) == spec["expected_rows"]
    blob = csv_path.read_text(encoding="utf-8")
    for value in spec["expected_values"]:
        assert value in blob
    return rows


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_no_arguments_writes_to_the_committed_default_target(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"])

    result = run(script)

    assert result.returncode == 0, result.stderr
    assert "GENERATED" in result.stdout
    _assert_real_output(default_seed_csv(script, spec["filename"]), spec)


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_out_dir_writes_only_beneath_the_requested_directory(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"])
    out_dir = tmp_path / "diagnostic"

    result = run(script, "--out-dir", str(out_dir))

    assert result.returncode == 0, result.stderr
    redirected = out_dir / spec["filename"]
    _assert_real_output(redirected, spec)
    assert str(redirected) in result.stdout

    # The extractor's own default target is never created by a redirected run,
    # which is the property the whole redirect exists to provide.
    assert not default_seed_csv(script, spec["filename"]).exists()
    assert [p.name for p in out_dir.iterdir()] == [spec["filename"]]


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_redirected_run_leaves_the_checkout_seed_file_untouched(tmp_path, spec):
    committed = REPO_ROOT / "legacy_data" / "seed" / spec["filename"]
    before = _fingerprint(committed)

    script = build_sandbox(tmp_path, spec["script"], spec["helpers"])
    result = run(script, "--out-dir", str(tmp_path / "diagnostic"), "--force")

    assert result.returncode == 0, result.stderr
    assert _fingerprint(committed) == before


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_existing_newer_output_is_skipped_without_force(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"])
    target = default_seed_csv(script, spec["filename"])
    make_newer_than_script(target, script)

    result = run(script)

    assert result.returncode == 0, result.stderr
    assert "SKIPPED, generated nothing" in result.stdout
    assert target.read_text(encoding="utf-8") == "STALE\n"


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_existing_newer_output_is_regenerated_with_force(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"])
    target = default_seed_csv(script, spec["filename"])
    make_newer_than_script(target, script)

    result = run(script, "--force")

    assert result.returncode == 0, result.stderr
    assert "GENERATED" in result.stdout
    assert target.read_text(encoding="utf-8") != "STALE\n"
    _assert_real_output(target, spec)


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_redirected_skip_exits_nonzero_and_says_nothing_was_written(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"])
    out_dir = tmp_path / "diagnostic"
    out_dir.mkdir()
    make_newer_than_script(out_dir / spec["filename"], script)

    result = run(script, "--out-dir", str(out_dir))

    assert result.returncode == 3
    assert "SKIPPED, generated nothing" in result.stdout
    assert "--force" in result.stderr


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_force_alone_does_not_choose_an_output_directory(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"])

    result = run(script, "--force")

    assert result.returncode == 0, result.stderr
    assert default_seed_csv(script, spec["filename"]).exists()
    assert "redirected" not in result.stdout


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_relative_out_dir_resolves_against_the_working_directory(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"])
    workdir = tmp_path / "workdir"
    workdir.mkdir()

    result = run(script, "--out-dir", "nested/target", cwd=workdir)

    assert result.returncode == 0, result.stderr
    landed = workdir / "nested" / "target" / spec["filename"]
    _assert_real_output(landed, spec)
    # The resolved absolute path is reported, so the caller never has to infer
    # where a relative request actually landed.
    assert str(landed) in result.stdout


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_out_dir_that_is_a_file_fails_with_an_actionable_message(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"])
    occupied = tmp_path / "not-a-directory"
    occupied.write_text("", encoding="utf-8")

    result = run(script, "--out-dir", str(occupied))

    assert result.returncode == 2
    assert "not a directory" in result.stderr
    assert str(occupied) in result.stderr


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_out_dir_beneath_a_file_fails_with_an_actionable_message(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"])
    blocker = tmp_path / "blocker"
    blocker.write_text("", encoding="utf-8")

    result = run(script, "--out-dir", str(blocker / "below"))

    assert result.returncode == 2
    assert "cannot be created" in result.stderr


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_target_path_occupied_by_a_directory_fails_with_an_actionable_message(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"])
    out_dir = tmp_path / "diagnostic"
    (out_dir / spec["filename"]).mkdir(parents=True)

    result = run(script, "--out-dir", str(out_dir))

    assert result.returncode == 2
    assert "is a directory, not a file" in result.stderr


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_repeated_forced_runs_over_identical_input_are_byte_identical(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"])
    first = tmp_path / "run-one"
    second = tmp_path / "run-two"

    assert run(script, "--out-dir", str(first), "--force").returncode == 0
    assert run(script, "--out-dir", str(second), "--force").returncode == 0

    left = first / spec["filename"]
    right = second / spec["filename"]
    assert left.read_bytes() == right.read_bytes()
    assert _digest(left) == _digest(right)

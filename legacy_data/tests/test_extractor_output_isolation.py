"""
test_extractor_output_isolation.py
=================================

Pins the output-destination and regeneration contract shared by the two mirror
seed extractors:

  - with no arguments each extractor writes to its committed default target, so
    every existing caller is unaffected;
  - --out-dir writes the CSV beneath the requested directory and nowhere else,
    leaving the committed seed file untouched down to its timestamp;
  - every run regenerates, even over an existing output newer than the script;
  - an unusable output destination fails non-zero with a message naming the
    problem;
  - two runs over identical input produce byte-identical output.

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
    # This extractor filters its output to the clubs the club seed contains, so
    # the sandbox writes one naming its own clubs. Without it the run stops,
    # which is the refusal working rather than a harness gap.
    "club_seed": True,
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
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"],
                           spec.get("club_seed", False))

    result = run(script)

    assert result.returncode == 0, result.stderr
    assert "GENERATED" in result.stdout
    _assert_real_output(default_seed_csv(script, spec["filename"]), spec)


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_out_dir_writes_only_beneath_the_requested_directory(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"],
                           spec.get("club_seed", False))
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

    script = build_sandbox(tmp_path, spec["script"], spec["helpers"],
                           spec.get("club_seed", False))
    result = run(script, "--out-dir", str(tmp_path / "diagnostic"))

    assert result.returncode == 0, result.stderr
    assert _fingerprint(committed) == before


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_existing_output_newer_than_the_script_is_still_regenerated(tmp_path, spec):
    # A seed that looks fresh is no reason to keep it: a skipped run would leave
    # whatever the last run wrote, so the seed would stop following the mirror
    # and the curated corrections the moment the script is older than its output.
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"],
                           spec.get("club_seed", False))
    target = default_seed_csv(script, spec["filename"])
    make_newer_than_script(target, script)
    redirected = tmp_path / "diagnostic"
    make_newer_than_script(redirected / spec["filename"], script)

    for args, landed in (((), target),
                         (("--out-dir", str(redirected)), redirected / spec["filename"])):
        result = run(script, *args)
        assert result.returncode == 0, result.stderr
        assert landed.read_text(encoding="utf-8") != "STALE\n", args
        _assert_real_output(landed, spec)


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_relative_out_dir_resolves_against_the_working_directory(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"],
                           spec.get("club_seed", False))
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
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"],
                           spec.get("club_seed", False))
    occupied = tmp_path / "not-a-directory"
    occupied.write_text("", encoding="utf-8")

    result = run(script, "--out-dir", str(occupied))

    assert result.returncode == 2
    assert "not a directory" in result.stderr
    assert str(occupied) in result.stderr


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_out_dir_beneath_a_file_fails_with_an_actionable_message(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"],
                           spec.get("club_seed", False))
    blocker = tmp_path / "blocker"
    blocker.write_text("", encoding="utf-8")

    result = run(script, "--out-dir", str(blocker / "below"))

    assert result.returncode == 2
    assert "cannot be created" in result.stderr


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_target_path_occupied_by_a_directory_fails_with_an_actionable_message(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"],
                           spec.get("club_seed", False))
    out_dir = tmp_path / "diagnostic"
    (out_dir / spec["filename"]).mkdir(parents=True)

    result = run(script, "--out-dir", str(out_dir))

    assert result.returncode == 2
    assert "is a directory, not a file" in result.stderr


@pytest.mark.parametrize("spec", EXTRACTORS)
def test_repeated_runs_over_identical_input_are_byte_identical(tmp_path, spec):
    script = build_sandbox(tmp_path, spec["script"], spec["helpers"],
                           spec.get("club_seed", False))
    first = tmp_path / "run-one"
    second = tmp_path / "run-two"

    assert run(script, "--out-dir", str(first)).returncode == 0
    assert run(script, "--out-dir", str(second)).returncode == 0

    left = first / spec["filename"]
    right = second / spec["filename"]
    assert left.read_bytes() == right.read_bytes()
    assert _digest(left) == _digest(right)

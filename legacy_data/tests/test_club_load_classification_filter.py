"""
test_club_load_classification_filter.py
=======================================

A production build's club population is the pre-populate cohort, and no build
loads the junk cohort.

The four-way classification was never a load filter. The dev-convenience loader
bulk-loads every seeded club into the live clubs table, and whether it ran was
decided by an environment variable defaulting to the permissive value. The
production command recorded for the cutover does not set that variable, so as
written it would have shipped all 597 seeded clubs, including 87 classified junk
— a cohort that holds a 2009 counterfeit-goods advertisement whose ad text and
vendor URL sit in a club description the public detail page renders.

Two barriers replace that, and they are independent on purpose:

  - The cutover build implies the cutover club set. --all-data assigns it rather
    than waiting to be asked, so an exported value cannot reach the loader
    through that path: it is overwritten, never read.
  - The loader refuses the junk cohort outright, reading no environment variable
    at all, for any build that does reach it.

Neither is a flag an operator has to remember, which is the property that failed.

Run from repo root:
    python -m pytest legacy_data/tests/test_club_load_classification_filter.py -v
"""
from __future__ import annotations

import csv
import os
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
LOADER = REPO_ROOT / "legacy_data" / "scripts" / "load_clubs_seed.py"
DEPLOY = REPO_ROOT / "scripts" / "deploy-local-data.sh"

SEED_FIELDS = ["legacy_club_key", "name", "city", "region", "country",
               "contact_member_id", "external_url", "description",
               "created", "last_updated"]


def _make_db(tmp_path: Path) -> Path:
    db = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.close()
    return db


def _write_seed(tmp_path: Path, keys: list[str]) -> Path:
    path = tmp_path / "clubs.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=SEED_FIELDS, lineterminator="\n")
        writer.writeheader()
        for key in keys:
            writer.writerow({
                "legacy_club_key": key, "name": f"Club {key}", "city": "Town",
                "region": "Region", "country": "Sweden", "contact_member_id": "",
                "external_url": "", "description": f"About club {key}",
                "created": "Sat Apr  5 14:40:16 2003",
                "last_updated": "Sat Apr  5 14:40:16 2003",
            })
    return path


def _write_candidates(tmp_path: Path, classifications: dict[str, str]) -> Path:
    path = tmp_path / "legacy_club_candidates.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle,
                                fieldnames=["legacy_club_key", "classification"],
                                lineterminator="\n")
        writer.writeheader()
        for key, classification in classifications.items():
            writer.writerow({"legacy_club_key": key, "classification": classification})
    return path


def _run_loader(db: Path, seed: Path, candidates: Path,
                env_overrides: dict[str, str]) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env.update(env_overrides)
    empty = seed.parent / "empty.csv"
    empty.write_text("legacy_club_key\n", encoding="utf-8")
    return subprocess.run(
        [sys.executable, str(LOADER), "--db", str(db), "--clubs-csv", str(seed),
         "--candidates-csv", str(candidates), "--duplicates-csv", str(empty),
         "--verdicts-csv", str(empty)],
        capture_output=True, text=True, cwd=str(REPO_ROOT), env=env)


def _club_names(db: Path) -> list[str]:
    conn = sqlite3.connect(db)
    try:
        return sorted(row[0] for row in conn.execute("SELECT name FROM clubs"))
    finally:
        conn.close()


# ── the loader refuses the junk cohort, whatever the environment asks ────────

@pytest.mark.parametrize("clubs_seed_value", ["yes", "1", ""])
def test_a_junk_club_is_never_loaded_however_the_environment_is_set(
        tmp_path: Path, clubs_seed_value: str):
    # The environment variable that used to decide whether this loader ran at
    # all is set to its permissive values here. None of them may bring a junk
    # club into the clubs table.
    db = _make_db(tmp_path)
    seed = _write_seed(tmp_path, ["good", "advert"])
    candidates = _write_candidates(
        tmp_path, {"good": "onboarding_visible", "advert": "junk"})

    result = _run_loader(db, seed, candidates, {"CLUBS_SEED": clubs_seed_value})

    assert result.returncode == 0, result.stderr
    assert _club_names(db) == ["Club good"], (
        "a club the classifier ruled junk reached the clubs table, which the "
        "public club detail page renders")
    assert "clubs skipped (classified junk): 1" in result.stdout


def test_the_junk_cohort_is_reported_rather_than_vanishing(tmp_path: Path):
    db = _make_db(tmp_path)
    seed = _write_seed(tmp_path, ["good", "advert", "advert_two"])
    candidates = _write_candidates(tmp_path, {
        "good": "pre_populate", "advert": "junk", "advert_two": "junk"})

    result = _run_loader(db, seed, candidates, {})

    assert "clubs skipped (classified junk): 2" in result.stdout
    assert _club_names(db) == ["Club good"]


def test_an_absent_classifier_output_says_so_rather_than_claiming_none(
        tmp_path: Path):
    # The unknown case has to read as unknown. Silence here would look identical
    # to a run that checked and found nothing to exclude.
    db = _make_db(tmp_path)
    seed = _write_seed(tmp_path, ["good"])

    result = _run_loader(db, seed, tmp_path / "absent.csv", {})

    assert result.returncode == 0, result.stderr
    assert "no classifier output" in result.stdout
    assert _club_names(db) == ["Club good"]


def test_a_classified_club_that_is_not_junk_still_loads(tmp_path: Path):
    # The filter is the junk cohort, not the classification generally: dormant
    # and onboarding-visible clubs still reach a dev build.
    db = _make_db(tmp_path)
    seed = _write_seed(tmp_path, ["dormant_one", "visible_one"])
    candidates = _write_candidates(tmp_path, {
        "dormant_one": "dormant", "visible_one": "onboarding_visible"})

    result = _run_loader(db, seed, candidates, {})

    assert result.returncode == 0, result.stderr
    assert _club_names(db) == ["Club dormant_one", "Club visible_one"]


# ── the cutover build takes the cutover club set without being asked ─────────

def test_the_cutover_build_skips_the_bulk_loader_even_when_the_environment_asks():
    # The recorded production command passes no club flag, so this is the line
    # that decides whether the junk cohort ships. Driven through the real script
    # with the permissive value exported, which is the case the old code served.
    env = dict(os.environ)
    env["CLUBS_SEED"] = "yes"
    result = subprocess.run(
        ["bash", str(DEPLOY), "--all-data", "--dry-run"],
        capture_output=True, text=True, cwd=str(REPO_ROOT), env=env)

    assert "cutover clubs: CLUBS_SEED=no" in result.stdout, (
        "the --all-data build did not take the cutover club set. It is the "
        "production build, and without this it loads every seeded club "
        "including the junk cohort.\n" + result.stdout[-2000:])


def test_the_cutover_club_set_is_not_conditional_on_the_flag_alone():
    # Stated over the source as well, because the run above proves one mode on
    # one machine: a condition rewritten to ask for the flag again would pass
    # every behavioural check that happens to pass the flag.
    # Anchored on the assignment rather than on the first condition mentioning
    # the flag: an earlier guard rejects --cutover-clubs outside --all-data and
    # names both, so a pattern search finds it and reports a condition that
    # decides nothing about the club set.
    lines = DEPLOY.read_text(encoding="utf-8").splitlines()
    assignments = [n for n, line in enumerate(lines)
                   if line.strip() == "export CLUBS_SEED=no"]
    assert assignments, "nothing assigns CLUBS_SEED=no any more"

    guards = []
    for index in assignments:
        preceding = [line for line in lines[:index] if line.lstrip().startswith("if [[")]
        assert preceding, "the assignment sits under no condition at all"
        guards.append(preceding[-1])

    assert all("--all-data" in guard for guard in guards), (
        "the cutover club set depends on --cutover-clubs alone again. The "
        f"production command does not pass it. Guard: {guards}")

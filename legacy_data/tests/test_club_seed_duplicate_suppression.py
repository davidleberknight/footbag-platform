"""
test_club_seed_duplicate_suppression.py
=======================================

Pins that the clubs seed loader honours the curator's duplicate adjudication in
``legacy_data/overrides/club_duplicates.csv`` rather than a list of its own.

Background
----------
``seed/clubs.csv`` is mirror-derived and occasionally carries the same real-world
club under two ``legacy_club_key`` values. The curator adjudicates each pair once
in ``overrides/club_duplicates.csv``. Every reader of that file then suppresses
the retired key: the candidate classifier, the pre-populated-club cutover, and
this loader, which is what creates the live ``clubs`` rows a visitor browses.

The loader previously carried its own hardcoded copy of the pairs. A pair added
to the override file therefore never reached it, and a club the curator had
retired stayed publicly listed as a second, active club. These tests pin the
single-source behaviour so that failure cannot return: a pair added to the file
must change what the loader does, with no code edit.

Run from repo root:
    python -m pytest legacy_data/tests/test_club_seed_duplicate_suppression.py -v
"""
import importlib.util
import os
import sqlite3
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
LOADER_PATH = REPO_ROOT / "legacy_data" / "scripts" / "load_clubs_seed.py"
REAL_OVERRIDES = REPO_ROOT / "legacy_data" / "overrides" / "club_duplicates.csv"

SEED_HEADER = (
    "legacy_club_key,name,city,region,country,contact_member_id,"
    "external_url,description,created,last_updated\n"
)

# The Caracas pair: two source keys for one club in Caracas, Venezuela. The
# retired key is the one that stayed publicly listed while the loader carried its
# own copy of the adjudication.
CARACAS_KEEP_KEY = "1751979051"
CARACAS_DROP_KEY = "1333657060"


def _load_module():
    """Load the loader via importlib so its helpers can be called directly."""
    spec = importlib.util.spec_from_file_location("load_clubs_seed", LOADER_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["load_clubs_seed"] = module
    spec.loader.exec_module(module)
    return module


loader = _load_module()


# ── Override reader ──────────────────────────────────────────────────


def test_reader_returns_the_retired_keys(tmp_path: Path) -> None:
    """The reader yields the retired side of each pair, tolerating whitespace.
    The kept key and the reason are present for curator audit, not consumed."""
    csv = tmp_path / "club_duplicates.csv"
    csv.write_text(
        "keep_legacy_key,drop_legacy_key,reason\n"
        "AAA,BBB,empty duplicate\n"
        "CCC, DDD ,trailing space tolerated\n",
        encoding="utf-8",
    )
    assert loader.load_duplicate_drop_keys(csv) == {"BBB", "DDD"}


def test_reader_ignores_a_row_missing_either_key(tmp_path: Path) -> None:
    """A half-written row adjudicates nothing, so it is skipped rather than
    retiring a club on incomplete curator input."""
    csv = tmp_path / "club_duplicates.csv"
    csv.write_text(
        "keep_legacy_key,drop_legacy_key,reason\n"
        "AAA,,no retired key\n"
        ",BBB,no kept key\n"
        "CCC,DDD,complete\n",
        encoding="utf-8",
    )
    assert loader.load_duplicate_drop_keys(csv) == {"DDD"}


def test_reader_missing_file_retires_nothing(tmp_path: Path) -> None:
    """No adjudication recorded means every seed row loads, which is the answer
    this loader gave before the override file existed."""
    assert loader.load_duplicate_drop_keys(tmp_path / "absent.csv") == set()


# ── End-to-end through the loader ────────────────────────────────────


def _fresh_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()
    return db_path


def _seed_csv(tmp_path: Path) -> Path:
    """Both Caracas rows, as the real seed carries them: same name and city,
    differing only in the region spelling."""
    csv = tmp_path / "clubs.csv"
    csv.write_text(
        SEED_HEADER
        + f"{CARACAS_DROP_KEY},Caracas Footbag Club,Caracas,Distrito  Capital,"
          "Venezuela,82150,,,Thu Apr  5 13:17:58 2012,Thu Apr  5 13:17:58 2012\n"
        + f"{CARACAS_KEEP_KEY},Caracas Footbag Club,Caracas,Distrito Captal,"
          "Venezuela,84016,,,Tue Jul  8 05:50:56 2025,Tue Jul  8 05:50:56 2025\n",
        encoding="utf-8",
    )
    return csv


def _run_loader(db_path: Path, clubs_csv: Path, duplicates_csv: Path):
    env = {**os.environ, "CLUBS_SEED": "yes"}
    return subprocess.run(
        [
            sys.executable, str(LOADER_PATH),
            "--db", str(db_path),
            "--clubs-csv", str(clubs_csv),
            "--duplicates-csv", str(duplicates_csv),
        ],
        cwd=str(REPO_ROOT), capture_output=True, text=True, check=False, env=env,
    )


def _club_names(db_path: Path) -> list[str]:
    conn = sqlite3.connect(db_path)
    rows = [r[0] for r in conn.execute("SELECT region FROM clubs ORDER BY region")]
    conn.close()
    return rows


def test_a_retired_key_creates_no_club(tmp_path: Path) -> None:
    """The contract that matters to a visitor: an adjudicated duplicate pair
    yields exactly one club, and it is the kept one."""
    db_path = _fresh_db(tmp_path)
    duplicates = tmp_path / "club_duplicates.csv"
    duplicates.write_text(
        "keep_legacy_key,drop_legacy_key,reason\n"
        f"{CARACAS_KEEP_KEY},{CARACAS_DROP_KEY},one club listed twice\n",
        encoding="utf-8",
    )

    result = _run_loader(db_path, _seed_csv(tmp_path), duplicates)
    assert result.returncode == 0, (
        f"Loader failed.\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )

    regions = _club_names(db_path)
    assert regions == ["Distrito Captal"], (
        "Expected only the kept Caracas row to become a club; got regions "
        f"{regions!r}.\nstdout: {result.stdout}"
    )
    assert "retired as duplicate): 1" in result.stdout, (
        "The loader must report the retired row under its own category rather "
        f"than as already present.\nstdout: {result.stdout}"
    )


def test_an_empty_override_file_loads_both_rows(tmp_path: Path) -> None:
    """The same seed with no adjudication recorded loads both rows. This is what
    proves the suppression above comes from the file and not from the loader."""
    db_path = _fresh_db(tmp_path)
    duplicates = tmp_path / "club_duplicates.csv"
    duplicates.write_text("keep_legacy_key,drop_legacy_key,reason\n", encoding="utf-8")

    result = _run_loader(db_path, _seed_csv(tmp_path), duplicates)
    assert result.returncode == 0, (
        f"Loader failed.\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )
    assert _club_names(db_path) == ["Distrito  Capital", "Distrito Captal"]


def test_loader_holds_no_copy_of_the_adjudication(tmp_path: Path) -> None:
    """A second copy of the pairs is the defect itself, so the loader source must
    carry no hardcoded duplicate list for one to drift out of."""
    src = LOADER_PATH.read_text(encoding="utf-8")
    assert "KNOWN_DUPLICATES" not in src, (
        "load_clubs_seed.py must read overrides/club_duplicates.csv, not restate "
        "the pairs; a hardcoded copy is how a retired club stayed published."
    )


def test_no_script_parses_the_adjudication_itself() -> None:
    """One parsing site, enforced. Every reader of the duplicate file derives its
    own view from the shared club-curation module; a script that parses the columns
    itself is a second interpretation waiting to disagree with the others, which is
    exactly how a retired club stayed published.
    """
    shared = REPO_ROOT / "legacy_data" / "scripts" / "club_curation.py"
    readers = [
        LOADER_PATH,
        REPO_ROOT / "legacy_data" / "clubs" / "scripts" / "02_build_legacy_club_candidates.py",
        REPO_ROOT / "legacy_data" / "clubs" / "scripts" / "03_build_legacy_person_club_affiliations.py",
        REPO_ROOT / "legacy_data" / "clubs" / "scripts" / "06_cutover_pre_populated_clubs.py",
    ]
    offenders = [
        p.name for p in readers
        if "drop_legacy_key" in p.read_text(encoding="utf-8")
    ]
    assert offenders == [], (
        f"{offenders} parse the duplicate columns directly; derive the view from "
        f"{shared.name} instead so every reader honours one ruling."
    )
    assert "drop_legacy_key" in shared.read_text(encoding="utf-8"), (
        "the shared module must be the one place that knows the file's columns"
    )


def test_the_shipped_override_file_retires_the_caracas_duplicate() -> None:
    """Guards the shipped adjudication row against an accidental delete, and
    pins that this loader reads the same file the rest of the pipeline reads."""
    assert REAL_OVERRIDES.exists(), (
        "overrides/club_duplicates.csv is missing — was it deleted?"
    )
    drops = loader.load_duplicate_drop_keys(REAL_OVERRIDES)
    assert CARACAS_DROP_KEY in drops, (
        f"Expected the retired Caracas key {CARACAS_DROP_KEY!r} in "
        f"overrides/club_duplicates.csv; got {drops!r}."
    )

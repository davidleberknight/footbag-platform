"""Tests for the preconditions of 26_qc_hof_coverage.py.

The check compares the curated Hall of Fame roster against the loaded person
layer, and the QC gate runs it ahead of the seed load. An unloaded person layer
is therefore the normal state, not a fault: reporting every honoree as missing
there would bury a real regression under the whole roster and fail the build on
a condition that is about to resolve itself. An operator running the check by
hand wants the opposite, an error, because they meant to check something.
"""
import csv
import importlib.util
import sqlite3
import sys
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "event_results" / "scripts" / "26_qc_hof_coverage.py"
_spec = importlib.util.spec_from_file_location("qc_hof_coverage", _SCRIPT)
qc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(qc)

HOF_COLUMNS = ["full_name", "induction_year", "person_id", "source_url", "notes", "bio_present"]
PERSON_COLUMNS = "person_id TEXT, person_name TEXT, aliases TEXT, hof_member INTEGER, hof_induction_year INTEGER, event_count INTEGER"


def _roster(tmp_path):
    path = tmp_path / "hof.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=HOF_COLUMNS)
        writer.writeheader()
        writer.writerow({
            "full_name": "Steve Goldberg", "induction_year": "2005",
            "person_id": "0ae92001", "source_url": "https://example/steve",
            "notes": "", "bio_present": "false",
        })
    return path


def _db(tmp_path, *, table=True, rows=()):
    path = tmp_path / "t.db"
    con = sqlite3.connect(path)
    if table:
        con.execute(f"CREATE TABLE historical_persons ({PERSON_COLUMNS})")
        con.executemany("INSERT INTO historical_persons VALUES (?,?,?,?,?,?)", rows)
    else:
        con.execute("CREATE TABLE unrelated (x TEXT)")
    con.commit()
    con.close()
    return path


def _run(tmp_path, db, *extra):
    argv = sys.argv
    sys.argv = ["26_qc_hof_coverage.py", "--db", str(db), "--hof-csv", str(_roster(tmp_path)), *extra]
    try:
        return qc.main()
    finally:
        sys.argv = argv


def test_an_absent_database_is_a_skip_for_the_gate(tmp_path):
    assert _run(tmp_path, tmp_path / "nothing.db", "--skip-when-unloaded") == 0


def test_a_database_with_no_person_table_is_a_skip_for_the_gate(tmp_path):
    assert _run(tmp_path, _db(tmp_path, table=False), "--skip-when-unloaded") == 0


def test_an_empty_person_layer_is_a_skip_for_the_gate(tmp_path):
    assert _run(tmp_path, _db(tmp_path), "--skip-when-unloaded") == 0


def test_an_operator_running_it_directly_gets_an_error_instead(tmp_path):
    assert _run(tmp_path, _db(tmp_path)) == 2
    assert _run(tmp_path, tmp_path / "nothing.db") == 2


def test_a_loaded_person_layer_is_checked_and_passes_when_the_honoree_resolves(tmp_path):
    db = _db(tmp_path, rows=[("0ae92001", "Steve Goldberg", None, 1, 2005, 45)])
    assert _run(tmp_path, db, "--skip-when-unloaded") == 0


def test_a_loaded_person_layer_still_fails_when_an_honoree_is_missing(tmp_path):
    db = _db(tmp_path, rows=[("someone-else", "Other Person", None, 0, None, 3)])
    assert _run(tmp_path, db, "--skip-when-unloaded") == 1

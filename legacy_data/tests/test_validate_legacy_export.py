"""Tests for validate_legacy_export.py gates G2/G4/G5."""
import csv
import importlib.util
import sqlite3
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "validate_legacy_export.py"
_spec = importlib.util.spec_from_file_location("validate_legacy_export", _SCRIPT)
vle = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vle)

FIELDS = ["legacy_member_id", "member_valid", "legacy_user_id", "real_name", "country"]


def _csv(tmp_path, rows):
    p = tmp_path / "export.csv"
    with p.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in FIELDS})
    return p


def _results(csv_path, db=None):
    return {name: (ok, detail) for name, ok, detail in vle.validate(csv_path, db)}


def test_clean_export_passes(tmp_path):
    rows = [
        {"legacy_member_id": "1", "legacy_user_id": "a", "real_name": "A One", "country": "USA"},
        {"legacy_member_id": "2", "legacy_user_id": "b", "real_name": "B Two", "country": "Poland"},
    ]
    res = _results(_csv(tmp_path, rows))
    assert all(ok for ok, _ in res.values())


def test_duplicate_user_id_fails_g2(tmp_path):
    rows = [
        {"legacy_member_id": "1", "legacy_user_id": "dup", "real_name": "A", "country": "USA"},
        {"legacy_member_id": "2", "legacy_user_id": "dup", "real_name": "B", "country": "USA"},
    ]
    res = _results(_csv(tmp_path, rows))
    assert res["G2 legacy_user_id unique where non-empty"][0] is False


def test_low_real_name_fails_g4(tmp_path):
    rows = [{"legacy_member_id": str(i), "legacy_user_id": f"u{i}",
             "real_name": "" if i < 8 else "Has Name", "country": "USA"} for i in range(10)]
    res = _results(_csv(tmp_path, rows))
    assert res["G4 real_name populated >=95%"][0] is False


def test_non_integer_and_duplicate_id_fail_g5(tmp_path):
    rows = [
        {"legacy_member_id": "1", "legacy_user_id": "a", "real_name": "A", "country": "USA"},
        {"legacy_member_id": "1", "legacy_user_id": "b", "real_name": "B", "country": "USA"},  # dup
        {"legacy_member_id": "x9", "legacy_user_id": "c", "real_name": "C", "country": "USA"},  # non-int
    ]
    res = _results(_csv(tmp_path, rows))
    assert res["G5 legacy_member_id integer-format + present"][0] is False
    assert res["G5 legacy_member_id unique"][0] is False


def test_g5_historical_persons_overlap(tmp_path):
    rows = [{"legacy_member_id": "1", "legacy_user_id": "a", "real_name": "A", "country": "USA"}]
    db = tmp_path / "t.db"
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE historical_persons (legacy_member_id TEXT)")
    con.executemany("INSERT INTO historical_persons VALUES (?)", [("1",), ("404",)])
    con.commit()
    con.close()
    res = _results(_csv(tmp_path, rows), db)
    # 404 is linked but missing from the export -> reconciliation fails.
    key = "G5 historical_persons.legacy_member_id reconciles into export"
    assert res[key][0] is False
    assert "404" in res[key][1]

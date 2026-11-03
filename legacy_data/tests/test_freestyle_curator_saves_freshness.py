"""
test_freestyle_curator_saves_freshness.py
=========================================

A curator save is applied after the corrections ledger on purpose, so a database
carrying the saved value is a finished rebuild, not a stale one. The freshness
guard has to know that, or the builders that derive committed artifacts refuse to
run the moment anyone saves a field the ledger also rules on.

Run from repo root:
    python -m pytest legacy_data/tests/test_freestyle_curator_saves_freshness.py -v
"""
import json
import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from _freestyle_db_freshness import corrections_not_in_effect  # noqa: E402


def _build(tmp_path):
    db = tmp_path / "t.db"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE freestyle_tricks (slug TEXT PRIMARY KEY, description TEXT, learning_notes TEXT)")
    conn.execute("INSERT INTO freestyle_tricks VALUES ('mirage', 'saved by a curator', 'stale value')")
    conn.commit()
    conn.close()
    ledger = tmp_path / "ledger.csv"
    ledger.write_text(
        "slug,field,old_value,new_value,source_note\n"
        "mirage,description,,ledger description,n\n"
        "mirage,learning_notes,,ledger notes,n\n",
        encoding="utf-8",
    )
    return db, ledger


def test_a_saved_field_is_not_drift_and_an_unsaved_one_still_is(tmp_path):
    db, ledger = _build(tmp_path)
    saves = tmp_path / "saves"
    (saves / "tricks").mkdir(parents=True)
    (saves / "tricks" / "mirage.json").write_text(
        json.dumps({"slug": "mirage", "fields": {"description": "saved by a curator"}}),
        encoding="utf-8",
    )
    drift = corrections_not_in_effect(db, ledger, saves)
    assert [(slug, field) for slug, field, _e, _a in drift] == [("mirage", "learning_notes")]


def test_without_a_save_both_fields_report_as_drift(tmp_path):
    # The control: the exemption above comes from the save, not from the comparison.
    db, ledger = _build(tmp_path)
    drift = corrections_not_in_effect(db, ledger, tmp_path / "no_saves")
    assert sorted(field for _s, field, _e, _a in drift) == ["description", "learning_notes"]

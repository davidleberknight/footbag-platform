"""
test_clubs_url_verdict_stamping.py
==================================

Pins the contract that the club seed loader stamps external-URL safety verdicts
from the committed companion file (seed/clubs_url_verdicts.csv) at load time, so
the deployed app never makes a URL callout and the public read can hide unverified
URLs.

Contract:
  • A verdict whose external_url matches the seed row stamps
    external_url_validated_at (verified) or external_url_quarantine_reason
    (flagged).
  • A club with no verdict row loads unverified (both columns NULL).
  • A verdict whose external_url no longer matches the seed row is NOT applied
    (the URL changed since the last verify run -> treated as unverified).

Run from repo root:
    python -m pytest legacy_data/tests/test_clubs_url_verdict_stamping.py -v
"""
import importlib.util
import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "database" / "schema.sql"
LOADER_PATH = REPO_ROOT / "legacy_data" / "scripts" / "load_clubs_seed.py"
CUTOVER_PATH = REPO_ROOT / "legacy_data" / "clubs" / "scripts" / "06_cutover_pre_populated_clubs.py"

CLUBS_HEADER = (
    "legacy_club_key,name,city,region,country,"
    "contact_member_id,external_url,description,created,last_updated"
)


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _load_loader_module():
    return _load_module("load_clubs_seed_under_test", LOADER_PATH)


def test_verdicts_stamped_at_load(tmp_path, monkeypatch):
    db_path = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_PATH.read_text())
    conn.close()

    clubs_csv = tmp_path / "clubs.csv"
    clubs_csv.write_text(
        CLUBS_HEADER + "\n"
        "k1,Verified Club,Acity,,USA,,https://verified.example/,d,,\n"
        "k2,Quarantined Club,Bcity,,USA,,https://bad.example/,d,,\n"
        "k3,Unverified Club,Ccity,,USA,,https://unverified.example/,d,,\n"
        "k4,Changed Club,Dcity,,USA,,https://new.example/,d,,\n",
        encoding="utf-8",
    )
    verdicts_csv = tmp_path / "clubs_url_verdicts.csv"
    verdicts_csv.write_text(
        "legacy_club_key,external_url,validated_at,quarantine_reason\n"
        "k1,https://verified.example/,2026-06-11T00:00:00Z,\n"
        "k2,https://bad.example/,,This URL is not allowed.\n"
        # k3: no verdict row at all
        "k4,https://old.example/,2026-06-11T00:00:00Z,\n",  # URL changed -> stale
        encoding="utf-8",
    )

    mod = _load_loader_module()
    monkeypatch.setattr(mod, "CSV_PATH", clubs_csv)
    monkeypatch.setattr(mod, "VERDICTS_PATH", verdicts_csv)
    monkeypatch.setattr(sys, "argv", ["load_clubs_seed.py", "--db", str(db_path)])
    mod.main()

    conn = sqlite3.connect(db_path)
    rows = {
        name: (url, validated_at, quarantine)
        for name, url, validated_at, quarantine in conn.execute(
            "SELECT name, external_url, external_url_validated_at, "
            "external_url_quarantine_reason FROM clubs"
        )
    }
    conn.close()

    assert rows["Verified Club"] == ("https://verified.example/", "2026-06-11T00:00:00Z", None)
    assert rows["Quarantined Club"] == ("https://bad.example/", None, "This URL is not allowed.")
    assert rows["Unverified Club"] == ("https://unverified.example/", None, None)
    # Stale verdict (URL changed) is not applied.
    assert rows["Changed Club"] == ("https://new.example/", None, None)


def test_cutover_stamps_verdicts_at_load(tmp_path, monkeypatch):
    """Phase H (06_cutover) is the production club creator; it must stamp the
    same verdicts. Run in-process against tmp seed + verdict files so nothing
    touches the real legacy_data tree."""
    db_path = tmp_path / "footbag-test.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA_PATH.read_text())
    ts = "2026-01-01T00:00:00Z"
    conn.executemany(
        """
        INSERT INTO legacy_club_candidates (
          id, created_at, created_by, updated_at, updated_by, version,
          legacy_club_key, display_name, city, country,
          classification, bootstrap_eligible
        ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?, ?, 'pre_populate', 1)
        """,
        [
            ("lcc-v", ts, ts, "kv", "Verified Club", "Acity", "USA"),
            ("lcc-q", ts, ts, "kq", "Quarantined Club", "Bcity", "USA"),
        ],
    )
    conn.commit()
    conn.close()

    clubs_csv = tmp_path / "clubs.csv"
    clubs_csv.write_text(
        CLUBS_HEADER + "\n"
        "kv,Verified Club,Acity,,USA,,https://verified.example/,d,,\n"
        "kq,Quarantined Club,Bcity,,USA,,https://bad.example/,d,,\n",
        encoding="utf-8",
    )
    verdicts_csv = tmp_path / "clubs_url_verdicts.csv"
    verdicts_csv.write_text(
        "legacy_club_key,external_url,validated_at,quarantine_reason\n"
        "kv,https://verified.example/,2026-06-11T00:00:00Z,\n"
        "kq,https://bad.example/,,This URL is not allowed.\n",
        encoding="utf-8",
    )

    mod = _load_module("cutover_under_test", CUTOVER_PATH)
    monkeypatch.setattr(mod, "SEED_CSV", clubs_csv)
    monkeypatch.setattr(mod, "VERDICTS_CSV", verdicts_csv)
    monkeypatch.setattr(sys, "argv", ["06_cutover.py", "--db", str(db_path)])
    assert mod.main() == 0

    conn = sqlite3.connect(db_path)
    rows = {
        name: (validated_at, quarantine)
        for name, validated_at, quarantine in conn.execute(
            "SELECT name, external_url_validated_at, external_url_quarantine_reason FROM clubs"
        )
    }
    conn.close()

    assert rows["Verified Club"] == ("2026-06-11T00:00:00Z", None)
    assert rows["Quarantined Club"] == (None, "This URL is not allowed.")

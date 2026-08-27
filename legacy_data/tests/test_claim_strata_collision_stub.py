"""The collision-stub stratum is a negative control, not a sample.

Every other stratum answers "which real rows should a tester exercise". This one
answers the opposite: which rows must the claim flow never reach. That is why it
is the one query that cannot draw from the claimable population, the predicate
whose whole job is to exclude rows a tester must not receive.

The distinction is easy to lose. Folding this stratum back into the claimable
population does not fail loudly; it silently selects nothing, and a stratum that
selects nothing keeps passing while testing nothing. These pin the intent so that
cannot happen quietly.

All data is synthetic; no real member or person data appears here.
"""
import importlib.util
import sqlite3
import sys
from pathlib import Path

import pytest

_SCRIPTS = Path(__file__).resolve().parents[1] / "member_data_scripts"


def _load(name):
    if name in sys.modules:
        return sys.modules[name]
    if str(_SCRIPTS) not in sys.path:
        sys.path.insert(0, str(_SCRIPTS))
    spec = importlib.util.spec_from_file_location(name, _SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


strata = _load("sample_legacy_claim_strata")

SCHEMA = """
CREATE TABLE legacy_members (
  legacy_member_id TEXT PRIMARY KEY,
  real_name TEXT, display_name TEXT,
  legacy_email TEXT, legacy_email2 TEXT, legacy_email3 TEXT,
  import_source TEXT, claimed_by_member_id TEXT
);
CREATE TABLE historical_persons (person_id TEXT PRIMARY KEY, legacy_member_id TEXT);
"""


def _db(tmp_path, rows):
    path = tmp_path / "t.db"
    con = sqlite3.connect(path)
    con.executescript(SCHEMA)
    for r in rows:
        con.execute(
            "INSERT INTO legacy_members (legacy_member_id, real_name, display_name, "
            "legacy_email, import_source, claimed_by_member_id) VALUES (?,?,?,?,?,?)",
            (r["id"], r.get("real_name", ""), r.get("display_name", "Seeded Name"),
             r.get("email", ""), r["source"], r.get("claimed_by")))
    con.commit()
    con.row_factory = sqlite3.Row
    return con


def _collision_stub(con):
    return [r["legacy_member_id"]
            for r in con.execute(strata.STRATA_SQL["collision_stub"])]


def test_the_bootstrap_stub_is_selected(tmp_path):
    con = _db(tmp_path, [{"id": "boot1", "source": "system_fixture"}])
    assert _collision_stub(con) == ["boot1"]


def test_a_claimable_real_account_is_not_selected(tmp_path):
    # The stratum is about rows the flow must not reach. A real account is the
    # opposite case and belongs to the other strata.
    con = _db(tmp_path, [{"id": "real1", "source": "legacy_site_data",
                          "email": "someone@example.test"}])
    assert _collision_stub(con) == []


def test_an_already_claimed_stub_is_not_selected(tmp_path):
    # Nothing to prove: the flow has already reached it, so it cannot show that
    # the flow does not.
    con = _db(tmp_path, [{"id": "boot1", "source": "system_fixture",
                          "claimed_by": "member-1"}])
    assert _collision_stub(con) == []


def test_a_persona_row_is_not_selected(tmp_path):
    # Personas are test scaffolding with their own behaviour; sampling one here
    # would report a harness artifact as evidence about real data.
    con = _db(tmp_path, [{"id": "legmem_persona_x", "source": "system_fixture"}])
    assert _collision_stub(con) == []


def test_the_stratum_does_not_draw_from_the_claimable_population():
    # The load-bearing property. CLAIMABLE excludes system_fixture precisely
    # because a tester must not receive one, so a hold-out that used it would
    # select nothing and pass while checking nothing.
    sql = strata.STRATA_SQL["collision_stub"]
    assert strata.CLAIMABLE.strip() not in sql
    assert "system_fixture" in sql
    # It must still refuse the two cases that would make it meaningless.
    assert "claimed_by_member_id IS NULL" in sql
    assert "legmem_persona_" in sql


def test_the_claimable_population_still_excludes_the_fixture():
    # If this ever stops being true the hold-out has no subject, because the
    # rows it guards would have become ordinary claimable rows.
    assert "!= 'system_fixture'" in strata.CLAIMABLE


def test_the_stratum_selects_something_in_a_realistic_fixture(tmp_path):
    # A negative control that matches no row is indistinguishable from a passing
    # one. This is the guard against the stratum quietly emptying.
    con = _db(tmp_path, [
        {"id": "boot1", "source": "system_fixture"},
        {"id": "boot2", "source": "system_fixture"},
        {"id": "real1", "source": "legacy_site_data", "email": "a@example.test"},
        {"id": "legmem_persona_x", "source": "system_fixture"},
    ])
    assert _collision_stub(con) == ["boot1", "boot2"]

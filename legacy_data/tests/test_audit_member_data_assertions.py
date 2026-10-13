"""
test_audit_member_data_assertions.py
====================================

Contract tests for the historical-person account assertion check in
audit_member_data.py, on synthetic data. Every historical person's
legacy_member_id is a curated assertion that the competitor held that account,
and the check refuses a built database where one is not backed:

  * a link to an account the export did not import, unless recorded as decided;
    the system fixture is covered by design and test-persona accounts are left to
    the residue audit;
  * an assertion population that differs from the audited figure;
  * one account asserted by more than one person;
  * an asserted account the load dropped and did not pull back, a shared login id
    included, unless recorded as decided;
  * a person ruled to hold no account who carries an assertion.

A missing audited figure, or a missing figures file, fails rather than defaulting.

Run from repo root:
    python -m pytest legacy_data/tests/test_audit_member_data_assertions.py -v
"""
import csv
import importlib.util
import json
import sqlite3
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = REPO_ROOT / "database" / "schema.sql"
SCRIPT = REPO_ROOT / "legacy_data" / "member_data_scripts" / "audit_member_data.py"

_spec = importlib.util.spec_from_file_location("audit_member_data", SCRIPT)
aud = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(aud)

FP = "a" * 64
FIXTURE = "STUB_FOOTBAG_HACKY"


def _write_csv(path: Path, fields: list[str], rows: list[dict]) -> Path:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    return path


class World:
    """A built database and the private inputs the check reads, all owned by
    the test. The default state passes: the fixture link, two imported accounts
    asserted by the canonical persons (one listed twice, padded), a test persona's
    link, people with no link at all, a dropped account nobody asserts, and an
    open link hold that is not a no-account ruling."""

    def __init__(self, tmp_path: Path, monkeypatch):
        self.tmp = tmp_path
        self.monkeypatch = monkeypatch
        self.accounts = {FIXTURE: "system_fixture", "100": "legacy_site_data",
                         "200": "legacy_site_data", "legmem_persona_a": "test",
                         "900": "legacy_site_data"}
        self.links = [("person_fixture", FIXTURE), ("person_100", "100"),
                      ("person_200", "200"), ("person_persona_a", "legmem_persona_a"),
                      ("person_unlinked_1", None), ("person_unlinked_2", None)]
        self.canonical_ids = ["100", " 200 ", "200"]
        self.figures = {"historical_person_assertions": 3}
        self.dispositions: list[str] = []
        self.exclusions: list[tuple[str, str, str]] = [("555", "member_valid", "0")]
        self.no_account: list[str] = []
        self.held_links: list[str] = ["person_100"]
        # The schema already refuses a shared account and a link to a missing
        # one; the check holds them on a database whatever built it, so a case
        # about the check itself lifts the schema's guard first.
        self.without_schema_guards = False

    def build(self) -> dict:
        db = self.tmp / "footbag.db"
        db.unlink(missing_ok=True)
        con = sqlite3.connect(db)
        con.executescript(SCHEMA.read_text())
        if self.without_schema_guards:
            con.execute("PRAGMA foreign_keys = OFF")
            con.execute("DROP INDEX ux_historical_persons_legacy_member_id")
        for lid, source in self.accounts.items():
            con.execute(
                "INSERT INTO legacy_members (legacy_member_id, display_name, "
                "display_name_normalized, import_source, imported_at) VALUES (?,?,?,?,?)",
                (lid, "x", "x", source, "2026-01-01T00:00:00Z"))
        for pid, lid in self.links:
            con.execute("INSERT INTO historical_persons (person_id, person_name, legacy_member_id) "
                        "VALUES (?,?,?)", (pid, "x", lid))
        con.commit()
        con.close()

        mp = self.monkeypatch
        mp.setattr(aud, "CANONICAL_PERSONS", _write_csv(
            self.tmp / "persons.csv", ["person_id", "member_id"],
            [{"person_id": f"p{i}", "member_id": m} for i, m in enumerate(self.canonical_ids)]
            + [{"person_id": "p_unlinked", "member_id": ""}]))
        mp.setattr(aud, "DISPOSITIONS", _write_csv(
            self.tmp / "member_row_dispositions.csv", ["decision", "legacy_member_id", "reason",
                                                       "fingerprint", "note"],
            [{"decision": "keep", "legacy_member_id": lid, "reason": "club_roster_membership_only",
              "fingerprint": FP, "note": "decided"} for lid in self.dispositions]))
        mp.setattr(aud, "EXCLUSIONS", _write_csv(
            self.tmp / "legacy_export_exclusions.csv",
            ["legacy_member_id", "exclusion_rule", "pulled_back"],
            [{"legacy_member_id": lid, "exclusion_rule": rule, "pulled_back": pulled}
             for lid, rule, pulled in self.exclusions]))
        mp.setattr(aud, "PERSON_LINK_HOLDS", _write_csv(
            self.tmp / "person_link_holds.csv",
            ["decision", "survivor_account_ids", "candidate_person_id", "reason",
             "fingerprint", "note"],
            [{"decision": "no_account", "survivor_account_ids": "", "candidate_person_id": pid,
              "reason": "no_valid_account_in_member_population", "fingerprint": FP,
              "note": "ruled"} for pid in self.no_account]
            + [{"decision": "hold_link", "survivor_account_ids": "900", "candidate_person_id": pid,
                "reason": "unresolved_pending_external_corroboration", "fingerprint": FP,
                "note": "held"} for pid in self.held_links]))
        return {"db": db, "figures": self.figures}

    def check(self) -> str:
        return aud.check_historical_person_assertions(self.build())

    def refused(self, match: str) -> None:
        with pytest.raises(aud.AuditFailure, match=match):
            self.check()


@pytest.fixture
def world(tmp_path, monkeypatch):
    return World(tmp_path, monkeypatch)


def test_backed_assertions_with_the_fixture_and_a_test_persona_pass(world):
    # A refusal here would block every production ship of a correct load, and
    # every developer database the persona harness seeded.
    assert "3 assertions audited" in world.check()


def test_a_link_to_an_account_the_export_did_not_import_refuses_until_decided(world):
    # Stranded, the person's competition record and old account split apart and
    # a paid standing on the account is never granted at claim.
    world.accounts["200"] = "mirror"
    world.refused("1 historical-person links point at an account the export did not import")
    world.dispositions = ["200"]
    world.check()


def test_a_link_to_a_missing_account_refuses(world):
    world.without_schema_guards = True
    world.links.append(("person_300", "300"))
    world.refused("1 historical-person links point at an account the export did not import")


def test_an_account_with_no_import_source_is_not_read_as_imported(world):
    # SQL comparison against NULL is never true, so an unguarded query would
    # silently pass an account nobody stamped.
    world.accounts["200"] = None
    world.refused("1 historical-person links point at an account the export did not import")


def test_a_population_that_moved_from_the_audited_figure_refuses(world):
    # A dropped assertion reads as quiet progress unless the count is held.
    world.canonical_ids.append("400")
    world.refused("4 account assertions in the canonical persons, audited 3")


def test_one_account_asserted_by_two_people_refuses(world):
    # Two competitors on one account means one of them claims the other's record.
    world.without_schema_guards = True
    world.links.append(("person_100_again", "100"))
    world.refused("1 legacy accounts are asserted by more than one person")


def test_an_asserted_account_dropped_as_a_shared_login_refuses_until_decided(world):
    # The shared-login rule is the one exclusion the linkage pull-back skips.
    world.exclusions = [("100", "user_id_conflict", "0")]
    world.refused("1 asserted accounts dropped as a shared login id")
    world.dispositions = ["100"]
    world.check()


def test_an_asserted_account_dropped_and_not_pulled_back_refuses(world):
    world.exclusions = [("200", "member_valid", "0")]
    world.refused("1 asserted accounts dropped by the load and not pulled back")
    world.exclusions = [("200", "member_valid", "1")]
    world.check()


def test_a_person_ruled_to_hold_no_account_who_carries_one_refuses(world):
    # The two adjudications would contradict each other on the same person.
    world.no_account = ["person_200"]
    world.refused("1 people ruled to hold no account carry an account assertion")


def test_a_missing_audited_figure_refuses_rather_than_defaulting(world):
    world.figures = {}
    world.refused("historical_person_assertions is missing")


def test_a_missing_figures_file_fails_the_audit_run(world, tmp_path, monkeypatch, capsys):
    # Without the file every audited count would have nothing to be held to.
    ctx = world.build()
    delivered = _write_csv(tmp_path / "members.csv", ["MemberID"], [{"MemberID": "1"}])
    monkeypatch.setattr(aud, "DELIVERED_MEMBERS", delivered)
    monkeypatch.setattr(aud, "FIGURES", tmp_path / "absent" / "audited_figures.json")
    monkeypatch.setattr("sys.argv", ["audit_member_data.py", "--db", str(ctx["db"])])
    assert aud.main() == 1
    assert "FAIL member-data audits: the audited figures is missing" in capsys.readouterr().out


def test_the_figures_file_is_read_as_json(tmp_path):
    path = tmp_path / "audited_figures.json"
    path.write_text(json.dumps({"export_records": 5}), encoding="utf-8")
    assert aud.load_figures(path) == {"export_records": 5}
    path.write_text("{not json", encoding="utf-8")
    with pytest.raises(aud.AuditFailure, match="is not valid JSON"):
        aud.load_figures(path)
    path.write_text("[5]", encoding="utf-8")
    with pytest.raises(aud.AuditFailure, match="does not hold an object of figures"):
        aud.load_figures(path)


def test_a_nested_figure_under_a_scalar_is_missing_not_a_crash():
    with pytest.raises(aud.AuditFailure, match="name_encoding.by_reversal is missing"):
        aud.figure({"figures": {"name_encoding": 6}}, "name_encoding", "by_reversal")


def _run_main(world, tmp_path, monkeypatch, checks):
    ctx = world.build()
    monkeypatch.setattr(aud, "DELIVERED_MEMBERS",
                        _write_csv(tmp_path / "members.csv", ["MemberID"], [{"MemberID": "1"}]))
    figures = tmp_path / "audited_figures.json"
    figures.write_text(json.dumps(world.figures), encoding="utf-8")
    monkeypatch.setattr(aud, "FIGURES", figures)
    monkeypatch.setattr(aud, "CHECKS", checks)
    monkeypatch.setattr("sys.argv", ["audit_member_data.py", "--db", str(ctx["db"])])
    return aud.main()


def test_the_assertion_check_is_one_of_the_audits_the_run_performs():
    # Left out of the list, the check would pass every build by never running.
    checks = dict(aud.CHECKS)
    assert checks["historical-person account assertions"] is aud.check_historical_person_assertions


def test_a_failing_check_fails_the_run_and_a_passing_set_passes_it(world, tmp_path, monkeypatch, capsys):
    # The runner and the deploy act on the exit status alone.
    world.accounts["200"] = "mirror"
    assert _run_main(world, tmp_path, monkeypatch,
                     [("assertions", aud.check_historical_person_assertions)]) == 1
    assert "FAIL assertions: 1 historical-person links" in capsys.readouterr().out
    world.accounts["200"] = "legacy_site_data"
    assert _run_main(world, tmp_path, monkeypatch,
                     [("assertions", aud.check_historical_person_assertions)]) == 0


def test_an_unexpected_error_is_reported_by_its_kind_only(world, tmp_path, monkeypatch, capsys):
    # Another module's error can quote a member id or name, which a captured
    # deploy log must never carry.
    def leaks(ctx):
        raise ValueError("member 64656 Jane Example")

    assert _run_main(world, tmp_path, monkeypatch, [("leaky", leaks)]) == 1
    out = capsys.readouterr().out
    assert "FAIL leaky: stopped by ValueError" in out
    assert "64656" not in out and "Jane" not in out

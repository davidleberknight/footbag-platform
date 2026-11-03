"""
test_audit_member_data_pre_build.py
===================================

Contract tests for the parts of audit_member_data.py the data build runs before it
resets the database: the audited figures must name, by checksum, the delivered
export they were audited against, and the pre-build run needs no built database.

Every input is synthetic and owned by the test.

Run from repo root:
    python -m pytest legacy_data/tests/test_audit_member_data_pre_build.py -v
"""
import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "legacy_data" / "member_data_scripts" / "audit_member_data.py"

_spec = importlib.util.spec_from_file_location("audit_member_data_pre_build", SCRIPT)
aud = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(aud)


@pytest.fixture
def delivered(tmp_path, monkeypatch):
    path = tmp_path / "members.csv"
    path.write_bytes(b"MemberID\n1\n2\n")
    monkeypatch.setattr(aud, "DELIVERED_MEMBERS", path)
    return path


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_figures_stamped_for_another_export_refuse_and_this_export_passes(delivered):
    # Figures carried forward from an older delivery would hold a new export to
    # numbers nobody audited for it.
    stale = {"figures": {"export_sha256": "0" * 64}}
    aud.check_figures_audited_for_this_export(stale)
    assert any("re-audit audited_figures.json" in d for d in stale["drift"])
    current = {"figures": {"export_sha256": _sha(delivered)}}
    assert aud.check_figures_audited_for_this_export(current).startswith("audited for export")
    assert "drift" not in current


def test_figures_with_no_export_stamp_refuse_rather_than_pass(delivered):
    # An unstamped file is the state every delivery starts in; passing it would
    # wave through figures never re-audited.
    with pytest.raises(aud.AuditFailure, match="export_sha256 is missing"):
        aud.check_figures_audited_for_this_export({"figures": {}})


def _main(tmp_path, monkeypatch, delivered, argv, stamp):
    figures = tmp_path / "audited_figures.json"
    figures.write_text(json.dumps({"export_sha256": stamp, "export_records": 2}),
                       encoding="utf-8")
    monkeypatch.setattr(aud, "FIGURES", figures)
    only = [("figures audited for this export", aud.check_figures_audited_for_this_export),
            ("delivered export size", aud.check_delivery_size)]
    monkeypatch.setattr(aud, "PRE_BUILD_CHECKS", only)
    monkeypatch.setattr(aud, "CHECKS", only)
    return aud.main([*argv, "--db", str(tmp_path / "no-such.db")])


def test_the_pre_build_run_needs_no_database_and_the_full_run_does(
        tmp_path, monkeypatch, delivered, capsys):
    # The build calls the pre-build run before the database exists; if it required
    # one, every fresh build would refuse.
    assert _main(tmp_path, monkeypatch, delivered, ["--pre-build"], _sha(delivered)) == 0
    assert _main(tmp_path, monkeypatch, delivered, [], _sha(delivered)) == 1
    assert "the built database is missing" in capsys.readouterr().out


def test_the_pre_build_run_fails_on_stale_figures(tmp_path, monkeypatch, delivered, capsys):
    # The point of running it before the reset: stale figures stop the build there.
    assert _main(tmp_path, monkeypatch, delivered, ["--pre-build"], "0" * 64) == 1
    assert "FAIL figures audited for this export" in capsys.readouterr().out


def test_stale_figures_warn_a_build_that_asks_and_still_fail_by_default(
        tmp_path, monkeypatch, delivered, capsys):
    # New data must not stop a deploy, yet the test runner's real-data row, which
    # runs without the flag, must still catch figures nobody re-audited.
    warn = ["--pre-build", "--figure-drift-warns"]
    assert _main(tmp_path, monkeypatch, delivered, warn, "0" * 64) == 0
    out = capsys.readouterr().out
    assert "WARN figures audited for this export" in out
    assert "FAIL" not in out
    assert _main(tmp_path, monkeypatch, delivered, ["--pre-build"], "0" * 64) == 1
    assert "FAIL figures audited for this export" in capsys.readouterr().out


def test_an_integrity_failure_still_fails_a_build_that_lets_drift_warn(
        tmp_path, monkeypatch, delivered, capsys):
    # The warning mode covers stale figures only; widened to every finding, a
    # broken load would reach the deploy.
    def broken(ctx):
        aud.expect(False, "an integrity finding")
    monkeypatch.setattr(aud, "check_delivery_size", broken)
    figures = tmp_path / "audited_figures.json"
    figures.write_text(json.dumps({"export_sha256": _sha(delivered)}), encoding="utf-8")
    monkeypatch.setattr(aud, "FIGURES", figures)
    monkeypatch.setattr(aud, "PRE_BUILD_CHECKS", [("integrity", broken)])
    assert aud.main(["--pre-build", "--figure-drift-warns"]) == 1
    assert "FAIL integrity: an integrity finding" in capsys.readouterr().out


def test_pre_build_checks_hold_the_stamp_and_none_that_reads_the_database():
    # A database check in this list crashes the build's preflight; a missing stamp
    # check lets stale figures through to the load.
    pre = {fn for _, fn in aud.PRE_BUILD_CHECKS}
    assert aud.check_figures_audited_for_this_export in pre
    assert aud.check_delivery_size in pre
    assert not pre & {aud.check_uncovered_row_ruling, aud.check_membership_cohort,
                      aud.check_historical_person_assertions}
    assert aud.check_figures_audited_for_this_export in {fn for _, fn in aud.CHECKS}

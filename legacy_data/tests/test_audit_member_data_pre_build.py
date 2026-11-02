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
    with pytest.raises(aud.AuditFailure, match="re-audit audited_figures.json"):
        aud.check_figures_audited_for_this_export({"figures": {"export_sha256": "0" * 64}})
    assert aud.check_figures_audited_for_this_export(
        {"figures": {"export_sha256": _sha(delivered)}}).startswith("audited for export")


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


def test_pre_build_checks_hold_the_stamp_and_none_that_reads_the_database():
    # A database check in this list crashes the build's preflight; a missing stamp
    # check lets stale figures through to the load.
    pre = {fn for _, fn in aud.PRE_BUILD_CHECKS}
    assert aud.check_figures_audited_for_this_export in pre
    assert aud.check_delivery_size in pre
    assert not pre & {aud.check_uncovered_row_ruling, aud.check_membership_cohort,
                      aud.check_historical_person_assertions}
    assert aud.check_figures_audited_for_this_export in {fn for _, fn in aud.CHECKS}

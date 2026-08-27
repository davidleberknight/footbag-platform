"""Tests for the release-workbook EVENT INDEX parity check.

The check compares the workbook's EVENT INDEX row count against
canonical_input/events.csv, which it is an identity pass over. That comparison
only means something when both artifacts came from the same build. A workbook
left behind by an earlier run measures the age gap between two canonical sets,
not a fault in the index builder, and the csv_only pipeline mode guarantees
exactly that state: it rebuilds canonical_input and deliberately leaves the
workbook to the mirror pipeline. So the check has to stay quiet about a stale
workbook while still failing on a genuine divergence.
"""
import importlib.util
import os
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "pipeline" / "qc" / "check_workbook_parity.py"
_spec = importlib.util.spec_from_file_location("check_workbook_parity", _SCRIPT)
qc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(qc)

_OLDER = 1_700_000_000
_NEWER = 1_700_003_600


def _events_csv(path: Path, rows: int) -> Path:
    lines = ["event_id,event_name"]
    lines += [f"e{i},Event {i}" for i in range(rows)]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def _run(monkeypatch, capsys, canonical: Path, workbook: Path):
    monkeypatch.setattr(
        "sys.argv",
        ["check_workbook_parity.py", "--canonical-input", str(canonical), "--workbook", str(workbook)],
    )
    code = qc.main()
    return code, capsys.readouterr().out


def test_stale_workbook_skips_instead_of_failing(tmp_path, monkeypatch, capsys):
    canonical = _events_csv(tmp_path / "events.csv", 807)
    workbook = tmp_path / "Footbag_Results_Release.xlsx"
    # Never opened on this path, which is the point: the check decides on the
    # timestamps before it reads a workbook it has no business comparing.
    workbook.write_bytes(b"not a real workbook")
    os.utime(workbook, (_OLDER, _OLDER))
    os.utime(canonical, (_NEWER, _NEWER))

    code, out = _run(monkeypatch, capsys, canonical, workbook)

    assert code == 0
    assert "SKIP: release workbook is older than events.csv." in out
    # The operator has to be able to see which two files disagreed and how to
    # make them comparable, or the skip is just silence.
    assert str(workbook) in out
    assert str(canonical) in out
    assert "run_pipeline.sh full" in out


def test_absent_workbook_still_skips(tmp_path, monkeypatch, capsys):
    canonical = _events_csv(tmp_path / "events.csv", 807)
    workbook = tmp_path / "Footbag_Results_Release.xlsx"

    code, out = _run(monkeypatch, capsys, canonical, workbook)

    assert code == 0
    assert "SKIP: release workbook not found" in out


def test_missing_canonical_input_is_an_error(tmp_path, monkeypatch, capsys):
    canonical = tmp_path / "events.csv"
    workbook = tmp_path / "Footbag_Results_Release.xlsx"
    workbook.write_bytes(b"irrelevant")

    code, _ = _run(monkeypatch, capsys, canonical, workbook)

    # An absent canonical input is a broken run, not a skippable condition:
    # there is nothing to compare against and nothing to conclude.
    assert code == 2


def test_a_workbook_newer_than_canonical_is_compared(tmp_path, monkeypatch, capsys):
    canonical = _events_csv(tmp_path / "events.csv", 807)
    workbook = tmp_path / "Footbag_Results_Release.xlsx"
    workbook.write_bytes(b"not a real workbook")
    os.utime(canonical, (_OLDER, _OLDER))
    os.utime(workbook, (_NEWER, _NEWER))

    code, _ = _run(monkeypatch, capsys, canonical, workbook)

    # The staleness guard must not become a way for every workbook to opt out of
    # the check: one built after the events file is still read and compared, and
    # here that read fails because the bytes are not a workbook at all.
    assert code == 2

"""Tests for the mirror adapter's stage-one verification statistics.

The year-gap report is a data-loss tripwire: it names the years the parse
found nothing for. It runs at the end of the first pipeline stage, so a crash
in it stops the whole rebuild even though every record has already been
parsed. The parsed year arrives as an int, a float or a string depending on
the source page, and the gap check has to compare whole years, so all three
forms have to survive it.
"""
import importlib.util
import io
import sys
from contextlib import redirect_stdout
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "pipeline" / "adapters" / "mirror_results_adapter.py"
_spec = importlib.util.spec_from_file_location("mirror_results_adapter", _SCRIPT)
adapter = importlib.util.module_from_spec(_spec)
sys.modules["mirror_results_adapter"] = adapter
_spec.loader.exec_module(adapter)


def _records(years):
    return [
        {
            "event_id": f"e{i}",
            "year": y,
            "event_name_raw": "Some Event",
            "date_raw": "2000-01-01",
            "location_raw": "Somewhere",
            "host_club_raw": "A Club",
            "event_type_raw": "",
            "results_block_raw": "results",
        }
        for i, y in enumerate(years)
    ]


def _run(years):
    buf = io.StringIO()
    with redirect_stdout(buf):
        adapter.print_verification_stats(_records(years))
    return buf.getvalue()


def test_float_years_do_not_stop_the_parse():
    out = _run([1985.0, 1986.0, 2026.0])
    assert "Year range: 1985 - 2026" in out


def test_string_years_do_not_stop_the_parse():
    out = _run(["1985", "1986", "1987"])
    assert "Year range: 1985 - 1987" in out


def test_a_gap_is_reported_when_years_arrive_as_floats():
    out = _run([2000.0, 2001.0, 2003.0])
    assert "Missing years detected" in out
    assert "[2002]" in out


def test_a_continuous_range_reports_no_gap():
    out = _run([2000, 2001, 2002])
    assert "Missing years detected" not in out


def test_mixed_year_forms_are_treated_as_the_same_year():
    """The same year written three ways must not read as three years."""
    out = _run([2000, 2000.0, "2000"])
    assert "Year range: 2000 - 2000" in out
    assert "Missing years detected" not in out


def test_an_unparseable_year_is_dropped_rather_than_raising():
    out = _run([2000, "not a year", 2001])
    assert "Year range: 2000 - 2001" in out
    assert "Events with year: 2/3" in out


def test_no_years_at_all_is_not_an_error():
    out = _run([None, "", 0])
    assert "Total events parsed: 3" in out
    assert "Year range" not in out


def test_no_records_at_all_is_not_an_error():
    buf = io.StringIO()
    with redirect_stdout(buf):
        adapter.print_verification_stats([])
    assert "Total events parsed: 0" in buf.getvalue()

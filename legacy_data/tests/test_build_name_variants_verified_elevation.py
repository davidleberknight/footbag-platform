"""Curator-verified person aliases elevate to HIGH confidence even when the
alias differs from the canonical name by a whole added or dropped name token,
so the verified pair reaches the production name_variants table (and thus the
honor resolver). An unreviewed (non-verified) alias keeps the structural safety
net and stays MEDIUM (deferred), never auto-loaded.
"""
import csv
import importlib.util
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "pipeline" / "identity" / "build_name_variants.py"
_spec = importlib.util.spec_from_file_location("build_name_variants", _SCRIPT)
bnv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bnv)

_PID = "00000000-0000-0000-0000-000000000001"
_CANON = "Ethan Red Husted"


def _emit(tmp_path, status):
    """Emit name-variant rows for a single 'Red Husted' -> 'Ethan Red Husted'
    alias (a dropped first-name token: structural, classifies MEDIUM) at the
    given person_aliases status.
    """
    aliases = tmp_path / "person_aliases.csv"
    with aliases.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["alias", "person_id", "person_canon", "status", "notes"])
        w.writerow(["Red Husted", _PID, _CANON, status, ""])
    persons = {_PID: _CANON}
    persons_by_nname = {bnv.norm_key(_CANON): _CANON}
    return bnv.emit_from_aliases(aliases, persons, persons_by_nname, set())


def test_verified_token_drop_alias_elevates_to_high(tmp_path):
    rows = _emit(tmp_path, "verified")
    assert len(rows) == 1
    assert rows[0]["canonical_name"] == _CANON
    assert rows[0]["confidence"] == "high"


def test_unreviewed_token_drop_alias_stays_medium(tmp_path):
    rows = _emit(tmp_path, "")
    assert len(rows) == 1
    assert rows[0]["confidence"] == "medium"

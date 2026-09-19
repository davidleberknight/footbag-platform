"""
test_club_member_seed_universe.py
=================================

The club-member seed names only clubs the club seed contains.

The club seed is reconciled against the dump's approved ClubID set, and any key
the dump no longer approves is dropped from it. The member seed is a walk of the
mirror, which has no such reconciliation: the capture still serves a showmembers
page for a club that was unapproved afterwards, so without a filter the roster is
written for a club the seed does not contain.

That stayed invisible while the committed member seed happened to be clean. A
fuller crawl brought four such rosters in, and the two producers then disagreed
about which clubs exist.

Two things are asserted here and they fail differently. Over the committed
artifact, because that is what ships and a producer nobody re-ran gives the same
green suite as a correct file. And over the filter itself, because the artifact
being clean today says nothing about the next run.

Run from repo root:
    python -m pytest legacy_data/tests/test_club_member_seed_universe.py -v
"""
from __future__ import annotations

import csv
import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SEED_DIR = REPO_ROOT / "legacy_data" / "seed"
CLUBS_CSV = SEED_DIR / "clubs.csv"
MEMBERS_CSV = SEED_DIR / "club_members.csv"
SCRIPT = REPO_ROOT / "legacy_data" / "scripts" / "extract_club_members.py"


def _load():
    spec = importlib.util.spec_from_file_location("extract_club_members", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _keys(path: Path, column: str) -> list[str]:
    with path.open(newline="", encoding="utf-8") as handle:
        return [(row.get(column) or "").strip() for row in csv.DictReader(handle)]


# ── the committed artifact ───────────────────────────────────────────────────

def test_every_member_row_names_a_club_the_seed_contains():
    clubs = set(_keys(CLUBS_CSV, "legacy_club_key"))
    assert clubs, "the club seed parsed into no keys"

    members = _keys(MEMBERS_CSV, "legacy_club_key")
    assert members, "the member seed parsed into no rows"

    orphans = sorted({key for key in members if key not in clubs})
    assert not orphans, (
        f"{len(orphans)} club key(s) appear in club_members.csv and not in "
        f"clubs.csv: {orphans[:8]}. The club seed is reconciled against the "
        f"approved club universe and the member seed is not, so a roster the "
        f"capture still serves can outlive the club. Regenerate the member seed "
        f"through its producer rather than editing the artifact.")


# ── the filter that keeps it that way ────────────────────────────────────────

def _fake_mirror(tmp_path: Path, clubs: dict[str, str]) -> tuple[Path, Path]:
    """A mirror holding one showmembers page per club key given."""
    show = tmp_path / "clubs" / "show"
    for key in clubs:
        (show / key).mkdir(parents=True, exist_ok=True)
        page = tmp_path / "clubs" / f"ClubID_{key}" / "showmembers"
        page.mkdir(parents=True, exist_ok=True)
        (page / "index.html").write_text(
            '<table class="membersSearchResultsTable">'
            f'<tr><td class="memberName">'
            f'<a href="/members/profile/{clubs[key]}/">Member {key}</a>'
            f'</td><td class="memberAlias">alias{key}</td></tr>'
            '</table>',
            encoding="utf-8")
    return show, tmp_path / "clubs"


def _clubs_csv(tmp_path: Path, keys: list[str]) -> Path:
    path = tmp_path / "clubs.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["legacy_club_key", "name"],
                                lineterminator="\n")
        writer.writeheader()
        for key in keys:
            writer.writerow({"legacy_club_key": key, "name": f"Club {key}"})
    return path


def _run(monkeypatch, tmp_path: Path, mirror_clubs: dict[str, str],
         approved: list[str], capsys) -> tuple[list[dict], str]:
    mod = _load()
    show, clubid = _fake_mirror(tmp_path, mirror_clubs)
    monkeypatch.setattr(mod, "CLUBS_SHOW_DIR", show)
    monkeypatch.setattr(mod, "CLUBS_CLUBID_DIR", clubid)
    out_dir = tmp_path / "out"
    monkeypatch.setattr(
        "sys.argv",
        ["extract_club_members.py", "--force", "--out-dir", str(out_dir),
         "--clubs-csv", str(_clubs_csv(tmp_path, approved))])
    mod.main()
    written = out_dir / "club_members.csv"
    with written.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle)), capsys.readouterr().out


def test_a_roster_for_an_unapproved_club_is_left_out(monkeypatch, tmp_path, capsys):
    rows, _ = _run(monkeypatch, tmp_path,
                   {"kept": "111", "dropped": "222"}, ["kept"], capsys)
    assert [row["legacy_club_key"] for row in rows] == ["kept"]


def test_the_rows_left_out_are_named_rather_than_dropped_quietly(
        monkeypatch, tmp_path, capsys):
    # A roster vanishing from the seed is a fact about the club's standing, and
    # a silent filter is indistinguishable from a parser that stopped working.
    _, output = _run(monkeypatch, tmp_path,
                     {"kept": "111", "dropped": "222"}, ["kept"], capsys)
    assert "dropped" in output
    assert "1 row(s) across 1 club(s) were left out" in output


def test_an_approved_club_keeps_every_row(monkeypatch, tmp_path, capsys):
    rows, output = _run(monkeypatch, tmp_path,
                        {"kept": "111", "also": "333"}, ["kept", "also"], capsys)
    assert sorted(row["legacy_club_key"] for row in rows) == ["also", "kept"]
    assert "were left out" not in output


def test_a_missing_club_seed_stops_the_run(monkeypatch, tmp_path):
    # Filtering against nothing would write an empty member seed, and a seed
    # emptied by a missing input is worse than a run that stops.
    mod = _load()
    with pytest.raises(SystemExit) as excinfo:
        mod.approved_club_keys(tmp_path / "absent.csv")
    assert "extract_clubs.py" in str(excinfo.value)


def test_an_empty_club_seed_stops_the_run(monkeypatch, tmp_path):
    mod = _load()
    with pytest.raises(SystemExit) as excinfo:
        mod.approved_club_keys(_clubs_csv(tmp_path, []))
    assert "written empty" in str(excinfo.value)

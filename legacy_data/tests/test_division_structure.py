"""
test_division_structure.py
==========================

Every historical division is stored with its structured parts (the game, the
gender, the class) from one curated file, because the historical names are far
from consistent: "Open Doubles Net", "Open Double Net" and "Net Doubles" are one
division, and "Open Freestyle" and "Open Singles Routines" are one contest. The
file covers net, freestyle, golf and sideline, keyed by discipline and name,
since one name ("Doubles", "Unknown") recurs across disciplines. The loader takes
the parts from it and refuses a name it does not list, so a new spelling the
source introduces fails the load instead of loading with no game, gender or
class. A team contest of more than two players loads with the team entry size
when its source tags it team; one the structure has not yet mapped is withheld
whole, and one tagged singles or doubles stops the load, so a team result never
loads as an individual or a pair.

Run from repo root:
    python -m pytest legacy_data/tests/test_division_structure.py -v
"""
from __future__ import annotations

import csv
import importlib.util
import sqlite3
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY = REPO_ROOT / "legacy_data"
STRUCTURE = LEGACY / "inputs" / "division_structure.csv"
CANONICAL_DISCIPLINES = LEGACY / "event_results" / "canonical_input" / "event_disciplines.csv"
LOADER = "legacy_data/event_results/scripts/08_load_mvfp_seed_full_to_sqlite.py"

_helpers_spec = importlib.util.spec_from_file_location(
    "division_structure_loader_helpers", LEGACY / "tests" / "test_loader_idempotency.py")
helpers = importlib.util.module_from_spec(_helpers_spec)
_helpers_spec.loader.exec_module(helpers)

_loader_spec = importlib.util.spec_from_file_location(
    "division_structure_loader_08", REPO_ROOT / LOADER)
loader = importlib.util.module_from_spec(_loader_spec)
_loader_spec.loader.exec_module(loader)


def _seed_with_divisions(tmp_path: Path, divisions: list[tuple[str, str]]) -> Path:
    """The helpers' one-event seed, its division replaced by one division per
    (discipline, name). The first keeps the seed's own key, so the seed's one
    placed player belongs to it."""
    seed = helpers.build_mvfp_seed(tmp_path / "seed")
    path = seed / "seed_event_disciplines.csv"
    with path.open(encoding="utf-8") as f:
        base = list(csv.DictReader(f))[0]
    rows = [dict(base, discipline_key=base["discipline_key"] if i == 0 else f"div_{i}",
                 discipline_category=cat, discipline_name=name)
            for i, (cat, name) in enumerate(divisions)]
    helpers.write_csv(path, list(base.keys()), rows)
    return seed


def _load(tmp_path: Path, seed: Path):
    db = helpers.make_db(tmp_path)
    return db, helpers.run([LOADER, "--db", str(db), "--seed-dir", str(seed), "--no-backup"])


def _with_second_event(seed: Path, division_index: int) -> None:
    """Give the seeded division at `division_index` an event of its own, since
    one event holds a division name once whatever its discipline."""
    events = seed / "seed_events.csv"
    with events.open(encoding="utf-8") as f:
        ev = list(csv.DictReader(f))
    second = dict(ev[0], event_key="2001_idem_test")
    if "legacy_event_id" in second:
        second["legacy_event_id"] = "2001000001"
    helpers.write_csv(events, list(ev[0].keys()), ev + [second])
    discs = seed / "seed_event_disciplines.csv"
    with discs.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    rows[division_index]["event_key"] = "2001_idem_test"
    helpers.write_csv(discs, list(rows[0].keys()), rows)


def _parts(db: Path) -> dict[tuple[str, str], tuple]:
    """The seeded test events' divisions only: the loader also adds a fixed
    showcase event of its own."""
    conn = sqlite3.connect(db)
    try:
        return {(r[0], r[1]): r[2:] for r in conn.execute(
            "SELECT discipline_category, name, game_id, custom_game_name, "
            "gender_eligibility, division_class FROM event_disciplines "
            "WHERE id LIKE 'disc_%idem_test_%'")}
    finally:
        conn.close()


def _count_test_rows(db: Path, table: str) -> int:
    conn = sqlite3.connect(db)
    try:
        return conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE id LIKE '%idem_test_%'").fetchone()[0]
    finally:
        conn.close()


def test_the_loader_stores_each_division_with_its_curated_parts(tmp_path):
    # Defect caught: historical divisions loaded with no game, gender or class,
    # so they never group with the same division at a new event.
    seed = _seed_with_divisions(tmp_path, [
        ("net", "Women's Singles Net"), ("net", "Intermediate Singles Net"),
        ("net", "Advanced Singles"), ("net", "Mini Net"), ("net", "Unknown"),
        ("freestyle", "Open Freestyle"), ("freestyle", "Intermediate Shred"),
        ("golf", "Women's Golf")])
    db, result = _load(tmp_path, seed)
    assert result.returncode == 0, result.stderr
    # Each loads under the name generated from its parts, as a new division of
    # that competition is named; a name with no parts keeps the name it ran under.
    assert _parts(db) == {
        ("net", "Open Women's Singles Net"): ("game_footbag_net", None, "women", "open"),
        ("net", "Intermediate Singles Net"): ("game_footbag_net", None, "open", "intermediate"),
        ("net", "Open Singles Net"): ("game_footbag_net", None, "open", "open"),
        ("net", "Open Singles Mini Net"): (None, "Mini Net", "open", "open"),
        ("net", "Unknown"): (None, None, None, None),
        ("freestyle", "Open Singles Routines"): ("game_routines", None, "open", "open"),
        ("freestyle", "Intermediate Singles Shred"): (None, "Shred", "open", "intermediate"),
        ("golf", "Open Women's Singles Golf"): ("game_footbag_golf", None, "women", "open"),
    }


def test_a_level_word_names_a_division_only_beside_the_open_one(tmp_path):
    # Defect caught: an Advanced division the event ran beside its Open one
    # loading under the Open division's name (the load then fails on the
    # duplicate), or a lone Advanced division keeping a level the class list
    # does not have.
    seed = _seed_with_divisions(tmp_path, [("net", "Open Singles Net"),
                                           ("net", "Advanced Singles Net")])
    db, result = _load(tmp_path, seed)
    assert result.returncode == 0, result.stderr
    assert set(_parts(db)) == {("net", "Open Singles Net"), ("net", "Advanced Singles Net")}

    alone = _seed_with_divisions(tmp_path / "alone", [("net", "Advanced Singles Net")])
    db2, result2 = _load(tmp_path / "alone", alone)
    assert result2.returncode == 0, result2.stderr
    assert set(_parts(db2)) == {("net", "Open Singles Net")}


def test_a_qualifier_tells_apart_two_contests_with_the_same_parts(tmp_path):
    # Defect caught: an event's separately titled contests (the 1999 West
    # Region novice doubles by day) collapsing into one name.
    seed = _seed_with_divisions(tmp_path, [("net", "Novice Doubles Net (Saturday)"),
                                           ("net", "Novice Doubles Net (Sunday)")])
    db, result = _load(tmp_path, seed)
    assert result.returncode == 0, result.stderr
    assert set(_parts(db)) == {("net", "Novice Singles Net (Saturday)"),
                               ("net", "Novice Singles Net (Sunday)")}


def test_two_divisions_one_event_would_name_alike_stop_the_load(tmp_path):
    # Defect caught: a duplicate of one contest loading as a second division,
    # or the database refusing the clash partway through the load.
    seed = _seed_with_divisions(tmp_path, [("net", "Open Singles Net"), ("net", "Singles Net")])
    db, result = _load(tmp_path, seed)
    assert result.returncode != 0
    assert "'Open Singles Net' <- 'Open Singles Net', 'Singles Net'" in result.stderr + result.stdout
    assert helpers.count(db, "event_disciplines") == 0


def test_one_name_in_two_disciplines_takes_each_disciplines_parts(tmp_path):
    # Defect caught: a name shared across disciplines ("Doubles") taking the net
    # division's game for a freestyle contest, or the reverse.
    seed = _seed_with_divisions(tmp_path, [("net", "Doubles"), ("freestyle", "Doubles")])
    _with_second_event(seed, 1)
    db, result = _load(tmp_path, seed)
    assert result.returncode == 0, result.stderr
    games = {category: parts[0] for (category, _name), parts in _parts(db).items()}
    assert games == {"net": "game_footbag_net", "freestyle": "game_routines"}


@pytest.mark.parametrize("category,name", [
    ("net", "Opne Singles Nett"),
    ("freestyle", "Opne Freestyle"),
])
def test_the_loader_refuses_a_name_the_structure_does_not_list(tmp_path, category, name):
    # Defect caught: a new spelling from the source, in any discipline, loading
    # silently with no parts.
    seed = _seed_with_divisions(tmp_path, [("net", "Open Singles Net"), (category, name)])
    db, result = _load(tmp_path, seed)
    assert result.returncode != 0
    assert f"{category}: {name}" in result.stderr + result.stdout
    assert helpers.count(db, "event_disciplines") == 0


def test_a_team_division_is_withheld_whole_never_loaded_as_singles(tmp_path, monkeypatch, capsys):
    # Defect caught: a withheld team contest loading as a singles division
    # anyway, so the site shows a team result as an individual one.
    # The committed structure, with Team Freestyle withheld whatever the real
    # file says of it, so the test holds once the real row is mapped.
    structure = tmp_path / "structure.csv"
    with STRUCTURE.open(encoding="utf-8") as f:
        lines = [ln for ln in f.read().splitlines() if not ln.startswith("freestyle,Team Freestyle,")]
    lines.append("freestyle,Team Freestyle,,,,,team entry withheld for this test,1,")
    structure.write_text("\n".join(lines) + "\n", encoding="utf-8")
    seed = _seed_with_divisions(tmp_path, [("freestyle", "Team Freestyle"),
                                           ("net", "Open Singles Net")])
    db = helpers.make_db(tmp_path)
    monkeypatch.setattr(loader, "DIVISION_STRUCTURE", structure)
    monkeypatch.setattr("sys.argv", ["08", "--db", str(db), "--seed-dir", str(seed), "--no-backup"])
    loader.main()
    stdout = capsys.readouterr().out
    assert set(_parts(db)) == {("net", "Open Singles Net")}
    conn = sqlite3.connect(db)
    try:
        team_rows = conn.execute(
            "SELECT COUNT(*) FROM event_disciplines WHERE name = 'Team Freestyle'").fetchone()[0]
        placed = conn.execute(
            "SELECT COUNT(*) FROM event_result_entries WHERE discipline_id IS NULL "
            "OR discipline_id NOT IN (SELECT id FROM event_disciplines)").fetchone()[0]
    finally:
        conn.close()
    assert team_rows == 0
    assert placed == 0, "a withheld division's places were loaded without it"
    # The seed's one placed player belongs to the team division.
    assert _count_test_rows(db, "event_result_entries") == 0
    assert _count_test_rows(db, "event_result_entry_participants") == 0
    assert "withheld" in stdout


def test_a_structure_row_names_exactly_one_of_game_custom_name_or_reason(tmp_path):
    # Defect caught: a row carrying both a listed game and a custom name, which
    # the database refuses partway through the load.
    path = tmp_path / "structure.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["discipline_category", "discipline_name", "game_id", "custom_game_name",
                    "gender_eligibility", "division_class", "unmapped_reason", "withhold"])
        w.writerow(["net", "Open Singles Net", "game_footbag_net", "Mini Net", "open", "open",
                    "", "0"])
    with pytest.raises(SystemExit, match="exactly one of"):
        loader.read_division_structure(path)


def test_a_withheld_row_must_say_why(tmp_path):
    # Defect caught: a division dropped from the load with no recorded reason,
    # so nobody can tell why its results are missing.
    path = tmp_path / "structure.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["discipline_category", "discipline_name", "game_id", "custom_game_name",
                    "gender_eligibility", "division_class", "unmapped_reason", "withhold"])
        w.writerow(["freestyle", "Team Freestyle", "game_routines", "", "open", "open", "", "1"])
    with pytest.raises(SystemExit, match="withheld division must give"):
        loader.read_division_structure(path)


def test_every_committed_division_is_mapped_and_mixed_only_on_doubles():
    # Defect caught: the committed results carrying a name the structure lacks
    # (the load would refuse), or a mixed division tagged singles, which the
    # database refuses because mixed is only ever a pair or a team.
    structure = loader.read_division_structure(STRUCTURE)
    with CANONICAL_DISCIPLINES.open(encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f)
                if r["discipline_category"] in loader.STRUCTURED_CATEGORIES]
    assert rows, "no divisions in the committed results, so nothing was checked"
    missing = sorted({(r["discipline_category"], r["discipline_name"]) for r in rows}
                     - set(structure))
    assert missing == [], f"divisions missing from {STRUCTURE.name}: {missing}"
    mixed_singles = [f"{r['event_key']}/{r['discipline_key']}" for r in rows
                     if structure[(r["discipline_category"], r["discipline_name"])]
                     ["gender_eligibility"] == "mixed"
                     and not structure[(r["discipline_category"], r["discipline_name"])]["withhold"]
                     and r["team_type"] not in ("doubles", "team")]
    assert mixed_singles == [], f"mixed divisions tagged singles: {mixed_singles}"


def test_every_committed_team_contest_is_withheld_or_tagged_team():
    # Defect caught: a team contest in the committed results that the structure
    # maps while its source still tags it singles or doubles, so the load would
    # stop, or the contest would show as an individual or a pair.
    structure = loader.read_division_structure(STRUCTURE)
    with CANONICAL_DISCIPLINES.open(encoding="utf-8") as f:
        team = [r for r in csv.DictReader(f)
                if r["discipline_category"] in loader.STRUCTURED_CATEGORIES
                and loader.names_team_contest(r["discipline_name"])]
    assert team, "no team contests in the committed results, so nothing was checked"
    mistagged = sorted(f"{r['event_key']}/{r['discipline_key']} ({r['team_type']})" for r in team
                       if not structure[(r["discipline_category"], r["discipline_name"])]["withhold"]
                       and r["team_type"] != "team")
    assert mistagged == [], f"team contests mapped but not tagged team: {mistagged}"


def test_a_team_tag_or_an_untagged_team_name_gives_the_team_entry_size():
    # Defect caught: a contest the source records as a team of three loads as
    # singles, or "Open Doubles Net 12 Teams", which counts doubles entries,
    # is taken for a team contest.
    assert loader.normalize_team_type("team", "Women's Freestyle") == "team"
    assert loader.normalize_team_type("", "Open Team Freestyle") == "team"
    assert loader.normalize_team_type("", "Open Doubles Net 12 Teams") == "doubles"
    for punctuated in ("Team-Freestyle", "Open Freestyle (Team)", "Team: Freestyle"):
        assert loader.names_team_contest(punctuated), punctuated
    assert loader.normalize_team_type("", "Open Freestyle") == "singles"
    # A source tag is never overridden by the name: the load refuses the clash
    # instead (below), so the fix lands upstream.
    assert loader.normalize_team_type("doubles", "Open Team Freestyle") == "doubles"
    assert loader.division_display_name("open", "women", "team", "Routines") == "Open Women's Team Routines"


def test_a_division_tagged_team_loads_as_team_under_its_team_name(tmp_path):
    # Defect caught: the 1984 shape, a three-player women's contest the source
    # tags team under a name without the word, loading as singles.
    seed = _seed_with_divisions(tmp_path, [("freestyle", "Women's Freestyle")])
    path = seed / "seed_event_disciplines.csv"
    with path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    rows[0]["team_type"] = "team"
    helpers.write_csv(path, list(rows[0].keys()), rows)
    db, result = _load(tmp_path, seed)
    assert result.returncode == 0, result.stderr
    conn = sqlite3.connect(db)
    try:
        loaded = conn.execute(
            "SELECT name, team_type, gender_eligibility, created_by FROM event_disciplines "
            "WHERE id LIKE 'disc_%idem_test_%'").fetchall()
    finally:
        conn.close()
    assert loaded == [("Open Women's Team Routines", "team", "women", "seed_loader")]


def test_a_teams_points_standing_loads_and_is_not_taken_for_a_team_contest(tmp_path):
    # Defect caught: the 1996 Worlds' "Team Points", a nation's standing over
    # several contests, stopping the whole load as if it were a mis-tagged team
    # contest.
    seed = _seed_with_divisions(tmp_path, [("", "Team Points")])
    path = seed / "seed_event_disciplines.csv"
    with path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    fields = list(rows[0].keys()) + (["is_aggregate_standing"] if "is_aggregate_standing" not in rows[0] else [])
    rows[0].update(team_type="singles", is_aggregate_standing="1")
    helpers.write_csv(path, fields, rows)
    db, result = _load(tmp_path, seed)
    assert result.returncode == 0, result.stderr
    conn = sqlite3.connect(db)
    try:
        loaded = conn.execute(
            "SELECT name, team_type, is_aggregate_standing FROM event_disciplines "
            "WHERE id LIKE 'disc_%idem_test_%'").fetchall()
    finally:
        conn.close()
    assert loaded == [("Team Points", "singles", 1)]


def test_a_mapped_team_contest_tagged_doubles_stops_the_load(tmp_path, monkeypatch):
    # Defect caught: a team contest the structure maps loading under the
    # doubles tag its source wrongly carries, so a team of four shows as a pair.
    # The committed structure, whatever it says of Team Freestyle, with that one
    # row replaced by a mapping, so the test holds once the real row is mapped.
    structure = tmp_path / "structure.csv"
    with STRUCTURE.open(encoding="utf-8") as f:
        lines = [ln for ln in f.read().splitlines() if not ln.startswith("freestyle,Team Freestyle,")]
    lines.append("freestyle,Team Freestyle,game_routines,,open,open,,0,")
    structure.write_text("\n".join(lines) + "\n", encoding="utf-8")
    seed = _seed_with_divisions(tmp_path, [("freestyle", "Team Freestyle")])
    path = seed / "seed_event_disciplines.csv"
    with path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    rows[0]["team_type"] = "doubles"
    helpers.write_csv(path, list(rows[0].keys()), rows)
    db = helpers.make_db(tmp_path)
    monkeypatch.setattr(loader, "DIVISION_STRUCTURE", structure)
    monkeypatch.setattr("sys.argv", ["08", "--db", str(db), "--seed-dir", str(seed), "--no-backup"])
    with pytest.raises(SystemExit, match="team contest tagged 'doubles'"):
        loader.main()
    assert _count_test_rows(db, "event_disciplines") == 0
    assert helpers.count(db, "events") == 0, "the refused load left events behind"

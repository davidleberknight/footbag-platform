"""The deployable-DB fixture-club guard used by the loader-count CI gate.

Test factories write real clubs rows under the reserved '#club_test_' tag
namespace (city 'Testville'). `find_fixture_clubs` is the build-time backstop
that fails the CI gate loudly if any such row reaches a deployable database. It
keys on the slug namespace first, with the Testville city as a secondary guard,
and leaves legitimate clubs (including NULL-city ones) alone.
"""
import importlib.util
import itertools
import sqlite3
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "ci" / "assert_loader_row_counts.py"
_spec = importlib.util.spec_from_file_location("assert_loader_row_counts", str(SCRIPT))
_mod = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = _mod
_spec.loader.exec_module(_mod)


def _db():
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE tags (id INTEGER PRIMARY KEY, is_standard INT, standard_type TEXT, tag_normalized TEXT)")
    conn.execute("CREATE TABLE clubs (id TEXT PRIMARY KEY, name TEXT, city TEXT, hashtag_tag_id INT)")
    return conn


_tag_id_seq = itertools.count(1)


def _add(conn, club_id, name, city, tag, standard_type="club"):
    tag_id = next(_tag_id_seq)
    conn.execute(
        "INSERT INTO tags (id, is_standard, standard_type, tag_normalized) VALUES (?, 1, ?, ?)",
        (tag_id, standard_type, tag),
    )
    conn.execute(
        "INSERT INTO clubs (id, name, city, hashtag_tag_id) VALUES (?, ?, ?, ?)",
        (club_id, name, city, tag_id),
    )


def test_id_prefix_alone_detects_a_factory_club():
    # The strongest signal: any club with the 'club-test-' internal id, even one
    # that opted out of the reserved tag and sits in an ordinary city.
    conn = _db()
    _add(conn, "club-portland-real", "Portland Footbag", "Portland", "#club_portland")
    _add(conn, "club-test-optout", "Opt Out Public Club", "Realville", "#club_optout")
    found = _mod.find_fixture_clubs(conn)
    assert [row[0] for row in found] == ["club-test-optout"]


def test_tag_namespace_alone_detects_a_fixture():
    # A club carrying only the reserved tag, with a real id and a real city.
    conn = _db()
    _add(conn, "club-realville-01", "Tag Only Fixture", "Realville", "#club_test_abc123")
    assert len(_mod.find_fixture_clubs(conn)) == 1


def test_testville_alone_is_a_secondary_diagnostic():
    conn = _db()
    _add(conn, "club-realville-02", "Odd Club", "Testville", "#club_odd")
    assert len(_mod.find_fixture_clubs(conn)) == 1


def test_clean_data_including_null_city_has_no_fixture_clubs():
    conn = _db()
    _add(conn, "club-portland-real", "Portland Footbag", "Portland", "#club_portland")
    _add(conn, "club-seattle-real", "Seattle Footbag", None, "#club_seattle")
    assert _mod.find_fixture_clubs(conn) == []

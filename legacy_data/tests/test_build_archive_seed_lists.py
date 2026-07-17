"""Verification for the archive seed-list generator (build_archive_seed_lists.py).

The generator turns the frozen per-app MySQL dumps into per-class seed-URL lists
for the archive crawl. Two things break silently and are pinned here: the
MySQL-dump row parser (escaped quotes and commas inside string values, and both
the one-INSERT-per-row and one-INSERT-many-tuples dump styles), and each content
class's exact seed-URL form and its inclusion filter (the poll path is the live
`newpoll`, not `poll`; gallery seeds only index-hidden sets; unapproved clubs are
still seeded; ids de-duplicate and sort).

All fixtures are synthetic dumps written under a temp dir; no real dump, symlink,
or network access. Run from repo root:
    python -m pytest legacy_data/tests/test_build_archive_seed_lists.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = (
    Path(__file__).resolve().parent.parent / "scripts" / "build_archive_seed_lists.py"
)
spec = importlib.util.spec_from_file_location("archive_seed_builder", str(SCRIPT_PATH))
mod = importlib.util.module_from_spec(spec)
sys.modules["archive_seed_builder"] = mod
spec.loader.exec_module(mod)

BASE = mod.BASE_URL


def _write_dump(base: Path, app: str, body: str) -> None:
    """Write a synthetic ``<app>/backups/latest.sql`` under a fake legacy repo."""
    d = base / app / "backups"
    d.mkdir(parents=True, exist_ok=True)
    (d / "latest.sql").write_text(body, encoding="latin-1")


@pytest.fixture
def repo(tmp_path, monkeypatch):
    """Point the module's legacy-repo root at an empty temp dir per test."""
    monkeypatch.setattr(mod, "LEGACY_REPO", tmp_path)
    return tmp_path


# ── MySQL-dump row parser ────────────────────────────────────────────────────

def test_parse_handles_escaped_quote_and_embedded_comma(tmp_path):
    dump = tmp_path / "x.sql"
    dump.write_text("INSERT INTO `t` VALUES ('a','b, c','d\\'e',5);\n", encoding="latin-1")
    assert list(mod.iter_table_rows(dump, "t")) == [["a", "b, c", "d'e", "5"]]


def test_parse_one_insert_per_row_style(tmp_path):
    dump = tmp_path / "x.sql"
    dump.write_text(
        "INSERT INTO `t` VALUES ('1','x');\nINSERT INTO `t` VALUES ('2','y');\n",
        encoding="latin-1",
    )
    assert [r[0] for r in mod.iter_table_rows(dump, "t")] == ["1", "2"]


def test_parse_many_tuples_single_insert_style(tmp_path):
    dump = tmp_path / "x.sql"
    dump.write_text(
        "INSERT INTO `t` VALUES ('1','x'),('2','y'),('3','z');\n", encoding="latin-1"
    )
    assert [r[0] for r in mod.iter_table_rows(dump, "t")] == ["1", "2", "3"]


def test_parse_ignores_other_tables(tmp_path):
    dump = tmp_path / "x.sql"
    dump.write_text(
        "INSERT INTO `other` VALUES ('9','q');\nINSERT INTO `t` VALUES ('1','x');\n",
        encoding="latin-1",
    )
    assert [r[0] for r in mod.iter_table_rows(dump, "t")] == ["1"]


def test_missing_dump_raises_actionable_error(repo):
    with pytest.raises(SystemExit) as excinfo:
        mod._dump_path("clubs")
    msg = str(excinfo.value)
    assert "MISSING" in msg and "footbag_legacy_repo" in msg


# ── Per-class seed URLs ──────────────────────────────────────────────────────

def test_clubs_seeds_every_club_including_unapproved(repo):
    # clubs columns: 0 Approved, 1 ClubID.
    _write_dump(
        repo,
        "clubs",
        "INSERT INTO `clubs` VALUES ('1','1434023648','A');\n"
        "INSERT INTO `clubs` VALUES ('0','airazona','B');\n"  # unapproved, still seeded
        "INSERT INTO `clubs` VALUES ('1','1434023648','dup');\n",  # duplicate id
    )
    assert mod.build_clubs() == [
        f"{BASE}/clubs/show/1434023648",
        f"{BASE}/clubs/show/airazona",
    ]


def test_gallery_seeds_only_hidden_sets_by_real_set_id(repo):
    # sets columns: 0 RealSetID, 1 SetID, 2 SetVisible, 3 IsContainer.
    _write_dump(
        repo,
        "gallery",
        "INSERT INTO `sets` VALUES ('10','slug-a','0','0');\n"
        "INSERT INTO `sets` VALUES ('11','slug-b','1','0');\n"  # visible → excluded
        "INSERT INTO `sets` VALUES ('2','slug-c','0','0');\n",
    )
    assert mod.build_gallery() == [
        f"{BASE}/gallery/showset/2",
        f"{BASE}/gallery/showset/10",
    ]


def test_news_seeds_permalinks_sorted_numerically(repo):
    _write_dump(
        repo,
        "news",
        "INSERT INTO `news` VALUES ('884487202','x');\n"
        "INSERT INTO `news` VALUES ('884487201','y');\n",
    )
    assert mod.build_news() == [
        f"{BASE}/news/show/884487201",
        f"{BASE}/news/show/884487202",
    ]


def test_polls_use_live_newpoll_path_and_include_unapproved(repo):
    # polls columns: 0 Approved, 1 PollID.
    _write_dump(
        repo,
        "poll",
        "INSERT INTO `polls` VALUES ('1','948263383','x');\n"
        "INSERT INTO `polls` VALUES ('0','948583074','y');\n",
    )
    assert mod.build_polls() == [
        f"{BASE}/newpoll/show/948263383",
        f"{BASE}/newpoll/show/948583074",
    ]


def test_rules_seeds_one_chapter_per_distinct_section_base(repo):
    # rulebook3 columns: 4 SectionBase.
    _write_dump(
        repo,
        "rules",
        "INSERT INTO `rulebook3` VALUES ('1','v','tag','Item','400','1');\n"
        "INSERT INTO `rulebook3` VALUES ('2','v','tag','Section','100','0');\n"
        "INSERT INTO `rulebook3` VALUES ('3','v','tag','Item','400','2');\n",  # dup base
    )
    assert mod.build_rules() == [
        f"{BASE}/rules/chapter/100",
        f"{BASE}/rules/chapter/400",
    ]


def test_ranking_seeds_one_report_per_set_and_method(repo):
    # rank_sets col 0 = set id; rank_methods col 0 = method id (same dump file).
    _write_dump(
        repo,
        "ranking",
        "INSERT INTO `rank_sets` VALUES ('1','Default','0','-1');\n"
        "INSERT INTO `rank_sets` VALUES ('2','Other','0','-1');\n"
        "INSERT INTO `rank_methods` VALUES ('1','Chess','Chess','12062');\n",
    )
    assert mod.build_ranking() == [
        f"{BASE}/ranking/showranks?set=1&method=1",
        f"{BASE}/ranking/showranks?set=2&method=1",
    ]


def test_builder_registry_covers_the_six_seed_classes(repo):
    assert set(mod.BUILDERS) == {
        "clubs.txt",
        "gallery.txt",
        "news.txt",
        "polls.txt",
        "rules.txt",
        "ranking.txt",
    }

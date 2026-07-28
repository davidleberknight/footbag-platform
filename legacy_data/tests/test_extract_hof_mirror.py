"""Tests for extract_hof_mirror.py.

The two Hall of Fame surfaces the legacy mirror preserves are transcribed as
found: the numbered year-page entries with their interviews and photographs, and
the group roster with each member's country and year. These pin the parsing the
pages actually require, including the entry whose number carries no period, the
early honoree whose heading links a profile that does not exist, and the text
that arrived double-encoded.
"""
import importlib.util
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "extract_hof_mirror.py"
_spec = importlib.util.spec_from_file_location("extract_hof_mirror", _SCRIPT)
mirror = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mirror)


YEAR_PAGE = """
<h1>Footbag Hall of Fame: 2001 Inductees</h1>
<h2>35. <a class="external text" href="../../../members/profile/yevez/index.html">Yves Archambault</a></h2>
<div class="thumb"><a href="../../../reference/-/Image:Yves_01.jpg">Image:Yves_01.jpg</a></div>
<dl><dd><ul>
<li>When did you see your first Footbag?<ul><li>Yves started playing footbag in 1982.</li></ul></li>
<li>Your own personal comments and notes?<ul><li>Web site: http://www.prokicker.ca</li></ul></li>
<li>Major achievements?<ul><li>Key promoter of the game.</li></ul></li>
</ul></dd></dl>
<dl><dd><ul><li>The sports future?</li></ul></dd></dl>
<p><a class="image" href="../../../reference/-/Image:Yves_02.jpg">Image:Yves_02.jpg</a></p>
<h2>36 <a class="external text" href="../../../members/profile/footboltz/index.html">Randy Nelson</a></h2>
<dl><dd><ul><li>Major achievements?<ul><li>Ran the regional tour.</li></ul></li></ul></dd></dl>
<h2>37. <a class="external text" href="../../../members/profile/index.html">Mike Marshall</a></h2>
<h2 class="widget-title">Meta</h2>
"""


def _rows_by_name(html):
    return {row["published_name"]: row for row in mirror.parse_year_page(html, "2001", "page.html")}


def test_year_page_reads_every_numbered_entry_and_ignores_sidebar_headings():
    rows = _rows_by_name(YEAR_PAGE)
    assert sorted(rows) == ["Mike Marshall", "Randy Nelson", "Yves Archambault"]
    assert all(row["induction_year"] == "2001" for row in rows.values())
    assert all(row["source_page"] == "page.html" for row in rows.values())


def test_entry_number_survives_a_missing_period():
    rows = _rows_by_name(YEAR_PAGE)
    assert rows["Yves Archambault"]["induction_number"] == "35"
    assert rows["Randy Nelson"]["induction_number"] == "36"


def test_profile_username_is_blank_when_the_heading_links_no_account():
    rows = _rows_by_name(YEAR_PAGE)
    assert rows["Yves Archambault"]["legacy_username"] == "yevez"
    assert rows["Mike Marshall"]["legacy_username"] == ""


def test_each_interview_answer_lands_in_its_own_column():
    row = _rows_by_name(YEAR_PAGE)["Yves Archambault"]
    assert row["first_footbag"] == "Yves started playing footbag in 1982."
    assert row["personal_notes"] == "Web site: http://www.prokicker.ca"
    assert row["achievements"] == "Key promoter of the game."


def test_an_unanswered_question_stays_empty_and_never_absorbs_the_photographs():
    row = _rows_by_name(YEAR_PAGE)["Yves Archambault"]
    assert row["sport_future"] == ""
    assert row["image_names"] == "Yves_01.jpg|Yves_02.jpg"


def test_an_entry_with_no_photographs_or_interview_still_yields_a_row():
    row = _rows_by_name(YEAR_PAGE)["Mike Marshall"]
    assert row["image_names"] == ""
    assert row["achievements"] == ""


def test_mojibake_is_repaired_word_by_word_and_correct_text_is_untouched():
    assert mirror.repair_mojibake("NHSA instructorâ€™s camp") == "NHSA instructor’s camp"
    assert mirror.repair_mojibake("Martin CÃ´tÃ© played") == "Martin Côté played"
    assert mirror.repair_mojibake("Developed ‘AKI’ brand footbags") == "Developed ‘AKI’ brand footbags"


def test_a_word_that_does_not_round_trip_is_left_exactly_as_it_is():
    assert mirror.repair_mojibake("âme") == "âme"


ROSTER_PAGE = """
<td>This is the official roster. Group Members
Ted Huff (USA) 1997 Torben Wigger Hansen (Denmark) 1999 Martin C&ocirc;t&eacute; (Canada) 2008
Available Files: Name: Owner: Status:</td>
<td>Some other group listing (USA) 2020</td>
"""


def test_roster_reads_name_country_and_year_only_between_its_own_markers():
    rows = mirror.parse_group_roster(ROSTER_PAGE, "roster.html")
    assert [(row["published_name"], row["country"], row["induction_year"]) for row in rows] == [
        ("Ted Huff", "USA", "1997"),
        ("Torben Wigger Hansen", "Denmark", "1999"),
        ("Martin Côté", "Canada", "2008"),
    ]
    assert [row["roster_position"] for row in rows] == [1, 2, 3]


def test_roster_is_empty_rather_than_wrong_when_the_page_shape_changes():
    assert mirror.parse_group_roster("<td>no membership list here</td>", "roster.html") == []


def test_a_page_that_is_not_utf8_is_read_rather_than_failing_the_extraction(tmp_path):
    page = tmp_path / "legacy.html"
    page.write_bytes("Jukka Peltola (Finland) 2012 café".encode("cp1252"))
    assert "café" in mirror._read_page(page)

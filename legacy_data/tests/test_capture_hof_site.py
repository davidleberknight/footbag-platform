"""Tests for capture_hof_site.py.

The Hall of Fame site states an induction year in prose or not at all, and the
sentences around it name other years that belong to something else: a Big Add
Posse induction, a championship placing, a photo caption. These pin the rule
that a year counts only when the induction sentence itself carries it, because
every wrong year here would be published as fact on an honoree's page.
"""
import importlib.util
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "capture_hof_site.py"
_spec = importlib.util.spec_from_file_location("capture_hof_site", _SCRIPT)
capture = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(capture)


def years(bio):
    return [year for year, _ in capture.induction_years(bio)]


def test_year_stated_after_the_honor_is_read():
    assert years(
        "For his many accomplishments, Andy Linder was inducted into the Footbag "
        "Hall of Fame in 2001."
    ) == ["2001"]


def test_year_further_along_the_same_sentence_is_read():
    assert years(
        "Taishi Ishida was inducted into the Footbag Hall of Fame at the World "
        "Footbag Championships in 2024."
    ) == ["2024"]


def test_year_stated_ahead_of_the_verb_is_read():
    assert years(
        "In 2023, Lon Smith was inducted in the Footbag Hall of Fame for his "
        "excellence in the sport."
    ) == ["2023"]
    assert years(
        "For this, in 2017, he was inducted into the Footbag Hall of Fame at the "
        "World Footbag Championships in Portland, Oregon."
    ) == ["2017"]


def test_a_caption_year_after_the_sentence_ends_is_not_the_induction_year():
    assert years(
        "For this and more, he was inducted into the Footbag Hall of Fame. Ocean "
        "County Clippers performance, 1988 Eric Wulff"
    ) == []


def test_a_result_year_before_a_previous_sentence_break_is_not_the_induction_year():
    assert years(
        "Rick Reese - 1988 World Footbag Championships 1st Place. He was inducted "
        "into the Footbag Hall of Fame."
    ) == []


def test_a_big_add_posse_induction_is_never_read_as_this_honor():
    assert years(
        "In 1995, Eric was inducted into the Big Add Posse, a group of the greatest "
        "freestyle footbag players in the world."
    ) == []


def test_the_hall_of_fame_year_survives_a_big_add_posse_sentence_beside_it():
    assert years(
        "Taishi was also inducted into the prestigious Big Add Posse in 2018. For "
        "all of this, Taishi Ishida was inducted into the Footbag Hall of Fame in 2024."
    ) == ["2024"]


def test_a_mention_that_names_no_year_yields_nothing():
    assert years(
        "Bruce Guettich was inducted into the Footbag Hall of Fame. His imprint on "
        "footbag is undeniable."
    ) == []


def test_evidence_is_the_verbatim_wording_the_year_came_from():
    found = capture.induction_years(
        "Tricia George was inducted into the Footbag Hall of Fame in 2000 in Vancouver BC."
    )
    assert found[0][0] == "2000"
    assert "inducted into the Footbag Hall of Fame in 2000 in Vancouver BC" in found[0][1]


INDEX_PAGE = """
<a href="/our-members/andy-linder">Andy Linder</a>
<a href="https://www.footbaghalloffame.net/our-members/ted-martin">Ted Martin</a>
J<a href="/our-members/on-lind">on Lind</a>
<a href="/our-members/andy-linder">Andy Linder again</a>
<a href="/about-us">About</a>
"""


def test_index_yields_each_honoree_slug_once_however_the_link_is_written():
    assert capture.parse_index(INDEX_PAGE) == ["andy-linder", "ted-martin", "on-lind"]


MEMBER_PAGE = """
<meta property="og:image" content="https://images.example/portrait.jpg?format=1500w"/>
<h1 class="entry-title entry-title--large p-name">Andy Linder</h1>
<time class="dt-published blog-meta-item" datetime="29 Dec"><span>29 Dec</span></time>
<div class="blog-item-meta"><a href="/x" class="blog-author-name">David Leberknight</a></div>
<div class="blog-item-content e-content"><p>Andy Linder was inducted into the
Footbag Hall of Fame in 2001.</p>
<img data-image="https://images.example/andy+2.jpg" alt=""/>
<script>ignored()</script></div>
</article>
"""


def test_member_page_yields_the_name_bio_photographs_and_year():
    row = capture.parse_member_page("andy-linder", MEMBER_PAGE)
    assert row["display_name"] == "Andy Linder"
    assert row["url"] == "https://www.footbaghalloffame.net/our-members/andy-linder"
    assert row["published_date"] == "29 Dec"
    assert row["author"] == "David Leberknight"
    assert row["induction_year"] == "2001"
    assert row["bio"].startswith("Andy Linder was inducted")
    assert "ignored()" not in row["bio"]
    assert row["image_urls"] == "https://images.example/portrait.jpg|https://images.example/andy+2.jpg"


def test_two_different_years_leave_the_year_unset_and_both_recorded():
    page = MEMBER_PAGE.replace(
        "Footbag Hall of Fame in 2001.",
        "Footbag Hall of Fame in 2001. He was inducted into the Footbag Hall of Fame in 1999.",
    )
    row = capture.parse_member_page("andy-linder", page)
    assert row["induction_year"] == ""
    assert row["year_candidates"] == "1999|2001"


def test_a_linked_page_that_is_not_an_honoree_has_no_title():
    row = capture.parse_member_page("some-account-post", "<html><body>no honoree here</body></html>")
    assert row["display_name"] == ""
    assert row["induction_year"] == ""

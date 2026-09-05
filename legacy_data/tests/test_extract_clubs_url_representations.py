"""
test_extract_clubs_url_representations.py
=========================================

Pins the two representations a club's external URL can take in the mirror, and
the boundary that keeps unrelated URLs out of the field.

The legacy pages once carried the club's home page as a real anchor inside
`div.clubsURL`. The current crawler neutralizes outbound links, so the same page
now renders the URL as plain text inside `div.clubsURLInner`, preceded by an
HTML comment marker. The extractor has to read both: a capture made before that
change still carries anchors, and a capture made after carries text.

Two shapes must NOT become a source for the field:

  - `div#ClubsURL` (an id, not the `clubsURL` class) holds prose that repeats
    the same address inside a sentence: "Click here (http://...) to go to the
    club's home page." Reading it would make the field depend on which of two
    copies the parser reached first.
  - a URL anywhere else on the page, such as one written into the club's own
    description, is not the club's home-page field.

Run from repo root:
    python -m pytest legacy_data/tests/test_extract_clubs_url_representations.py -v
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "legacy_data" / "scripts" / "extract_clubs.py"


def _load():
    spec = importlib.util.spec_from_file_location("extract_clubs", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


extract_club = _load().extract_club


def _page(url_block: str = "", extra: str = "") -> str:
    """A club page carrying only what extract_club needs, plus the block under test.

    The name and the location header are both required: the extractor returns
    None without a name, and again without a country.
    """
    return (
        '<html><body>'
        '<h1 class="clubsShowName">Footbag Kranj</h1>'
        '<div class="clubsLocationHeader">Kranj, Slovenia</div>'
        f'{url_block}'
        f'{extra}'
        '</body></html>'
    )


def _extract(tmp_path: Path, html: str) -> dict:
    page = tmp_path / "index.html"
    page.write_text(html, encoding="utf-8")
    row = extract_club(page, "1056107923")
    assert row is not None, "fixture did not satisfy the extractor's minimum shape"
    return row


# ─── the two representations that must both work ─────────────────────────────


def test_anchor_representation_is_read(tmp_path):
    """The original capture shape: a real anchor inside div.clubsURL."""
    html = _page(
        '<div class="clubsURL"><b>Home Page:</b>'
        '<div class="clubsURLInner">'
        '<a href="http://footbagkranj.com">http://footbagkranj.com</a>'
        '</div></div>'
    )
    assert _extract(tmp_path, html)["external_url"] == "http://footbagkranj.com"


def test_mirror_text_representation_is_read(tmp_path):
    """The current capture shape: the crawler rendered the link as text.

    Verbatim from
    mirror_footbag_org/www.footbag.org/clubs/show/1056107923/index.html.
    """
    html = _page(
        '<div class="clubsURL"><b>Home Page:</b>\n'
        '<div class="clubsURLInner">'
        '<!--Mirror: outbound link rendered as text-->http://footbagkranj.com\n'
        '</div>\n</div>'
    )
    assert _extract(tmp_path, html)["external_url"] == "http://footbagkranj.com"


def test_parenthesised_render_form_takes_the_address(tmp_path):
    """When display text and address differ the crawler keeps both: "text (url)".

    The parenthesised half is the address the link pointed at; the other half is
    only what the page showed.
    """
    html = _page(
        '<div class="clubsURL"><b>Home Page:</b>'
        '<div class="clubsURLInner">'
        '<!--Mirror: outbound link rendered as text-->'
        'www.piedsagilles.ch (http://www.piedsagilles.ch)'
        '</div></div>'
    )
    assert _extract(tmp_path, html)["external_url"] == "http://www.piedsagilles.ch"


def test_abbreviated_display_text_does_not_beat_the_real_address(tmp_path):
    """The display half can be a truncated copy of the same link.

    Taking the first address in the block would store the truncation. Verbatim
    from mirror_footbag_org/.../clubs/show/1045423024/index.html.
    """
    html = _page(
        '<div class="clubsURL"><b>Home Page:</b>'
        '<div class="clubsURLInner">'
        '<!--Mirror: outbound link rendered as text-->'
        'http://www.facebook.com/#!/groups/na... '
        '(http://www.facebook.com/#!/groups/nashvillekicks/)'
        '</div></div>'
    )
    assert _extract(tmp_path, html)["external_url"] == (
        "http://www.facebook.com/#!/groups/nashvillekicks/")


def test_closing_bracket_is_not_absorbed_into_the_address(tmp_path):
    html = _page(
        '<div class="clubsURL"><b>Home Page:</b>'
        '<div class="clubsURLInner">'
        '<!--Mirror: outbound link rendered as text-->'
        'Chaos (http://www.chaosfootbag.com)'
        '</div></div>'
    )
    assert _extract(tmp_path, html)["external_url"] == "http://www.chaosfootbag.com"


def test_https_text_representation_is_read(tmp_path):
    html = _page(
        '<div class="clubsURL"><b>Home Page:</b>'
        '<div class="clubsURLInner">'
        '<!--Mirror: outbound link rendered as text-->https://example.org/club'
        '</div></div>'
    )
    assert _extract(tmp_path, html)["external_url"] == "https://example.org/club"


# ─── the boundaries that keep unrelated URLs out ─────────────────────────────


def test_no_url_block_yields_empty(tmp_path):
    assert _extract(tmp_path, _page())["external_url"] == ""


def test_empty_url_block_yields_empty(tmp_path):
    html = _page('<div class="clubsURL"><b>Home Page:</b>'
                 '<div class="clubsURLInner"></div></div>')
    assert _extract(tmp_path, html)["external_url"] == ""


def test_prose_copy_in_the_id_element_is_not_a_source(tmp_path):
    """div#ClubsURL is a different element from div.clubsURL and is prose.

    A page carrying only the sentence form must yield no URL: the field comes
    from the club's own home-page block, not from body copy that mentions it.
    """
    html = _page(extra=(
        '<div id="ClubsURL"><h2>For More Information:</h2>'
        'Footbag Kranj has its own home page on the World-Wide Web.'
        '<!--Mirror: outbound link rendered as text-->'
        "Click here (http://footbagkranj.com) to go to the club's home page."
        '</div>'
    ))
    assert _extract(tmp_path, html)["external_url"] == ""


def test_url_in_the_description_is_not_a_source(tmp_path):
    html = _page(extra=(
        '<div id="ClubsWelcome">We post sessions at http://not-the-club.example '
        'every week.</div>'
    ))
    assert _extract(tmp_path, html)["external_url"] == ""


def test_relative_link_is_not_promoted_to_the_field(tmp_path):
    """A site-internal link carries no scheme and is not an external URL."""
    html = _page(
        '<div class="clubsURL"><b>Home Page:</b>'
        '<div class="clubsURLInner">'
        '<a href="../../members/profile/12345">our contact</a>'
        '</div></div>'
    )
    assert _extract(tmp_path, html)["external_url"] == ""


def test_bare_text_without_a_scheme_is_not_promoted(tmp_path):
    """Scheme required: a bare hostname in the block is not a usable URL."""
    html = _page(
        '<div class="clubsURL"><b>Home Page:</b>'
        '<div class="clubsURLInner">'
        '<!--Mirror: outbound link rendered as text-->footbagkranj.com'
        '</div></div>'
    )
    assert _extract(tmp_path, html)["external_url"] == ""


def test_anchor_wins_when_both_shapes_are_present(tmp_path):
    """A capture carrying an anchor keeps using it; the text scan is a fallback."""
    html = _page(
        '<div class="clubsURL"><b>Home Page:</b>'
        '<div class="clubsURLInner">'
        '<a href="http://anchor.example">http://text-copy.example</a>'
        '</div></div>'
    )
    assert _extract(tmp_path, html)["external_url"] == "http://anchor.example"


@pytest.mark.parametrize("trailing", ["\n", "  ", "\n  \n"])
def test_surrounding_whitespace_is_stripped(tmp_path, trailing):
    html = _page(
        '<div class="clubsURL"><b>Home Page:</b>'
        '<div class="clubsURLInner">'
        f'<!--Mirror: outbound link rendered as text-->http://footbagkranj.com{trailing}'
        '</div></div>'
    )
    assert _extract(tmp_path, html)["external_url"] == "http://footbagkranj.com"

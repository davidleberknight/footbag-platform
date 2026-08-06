"""What the crawler refuses to store, in create_mirror_footbag_org.py.

The legacy application answered a missing gallery set, a missing event and a
failed include with 200 and a page explaining the failure, so the status line
alone cannot tell a capture from a miss. Storing one puts the live site's error
into the archive permanently, where no reader can tell it from preserved
content, and an index built from what is on disk then advertises it. A related
shape stores an HTML body under an image extension, which reaches the publish
step as unscanned media bytes and stops the publish.

Separately, the diagnostics the site printed into otherwise good pages carry its
absolute filesystem paths and line numbers, which have no business in a
published archive.

All pure; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_error_page_refusal.py -v
"""
import importlib.util
import sys
from pathlib import Path

from bs4 import BeautifulSoup

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_refusal', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_refusal'] = mirror_script
spec.loader.exec_module(mirror_script)

NO_SETS = ('<html><body>There were no photo sets found. '
           'The server may be down.</body></html>')
NO_EVENT = ('<html><body>No events found with a event ID of '
            '"wolnystylul.jpg".</body></html>')
DIAGNOSTIC_ONLY = (
    '<meta charset="utf-8"/><div><span title="View source for details...">'
    'ERROR 42109</span></div>'
    "<!-- <span style='color: #ff0000'><br /><b>Warning</b>: include("
    'html/poll-failed.html): failed to open stream in '
    '<b>/home/site/docs/newpoll/show</b> on line <b>13</b><br /></span> -->')


def test_an_empty_gallery_answer_is_not_content():
    assert mirror_script.is_error_body(NO_SETS)


def test_a_missing_event_answer_is_not_content():
    assert mirror_script.is_error_body(NO_EVENT)


def test_a_page_that_is_only_a_server_diagnostic_is_not_content():
    assert mirror_script.is_error_body(DIAGNOSTIC_ONLY)


def test_a_real_page_carrying_a_diagnostic_is_still_content():
    # The rulebook chapter and the freestyle landing page both print a warning
    # beside the text a reader came for. Refusing them would lose real pages.
    page = ('<html><body>'
            "<!-- <span style='color: #ff0000'><br /><b>Warning</b>: Invalid "
            'argument in <b>/home/site/docs/rules/chapter</b><br /></span> -->'
            '<p>Chapter 300 text.</p></body></html>')
    assert not mirror_script.is_error_body(page)


def test_an_ordinary_page_is_content():
    assert not mirror_script.is_error_body(
        '<html><head><title>Club: Alpha</title></head><body>x</body></html>')


def test_a_diagnostic_loses_its_paths_and_its_badge():
    soup = BeautifulSoup(
        '<html><body><p>Chapter 300 text.</p>'
        "<div><span title=\"View source for details...\">ERROR 42109</span></div>"
        "<!-- <span style='color: #ff0000'><br /><b>Warning</b>: include() "
        "failed to open stream in <b>/home/site/docs/rules/chapter</b> on line "
        '<b>13</b><br /></span> -->'
        '</body></html>', 'html.parser')
    removed = mirror_script.strip_server_diagnostics(soup)
    out = str(soup)
    assert removed == 2
    assert '/home/site/docs' not in out
    assert 'ERROR 42109' not in out
    assert 'View source for details' not in out
    assert 'Chapter 300 text.' in out


def test_a_fatal_error_stack_trace_loses_its_paths():
    soup = BeautifulSoup(
        '<html><body><p>Mississauga, Ontario</p>'
        "<!-- <span style='color: #ff0000'><b>Fatal error</b>: Uncaught Error: "
        'Call to undefined function htmlentitites() in '
        '/home/site/docs/members/html/profile.html:55</span> -->'
        '</body></html>', 'html.parser')
    mirror_script.strip_server_diagnostics(soup)
    out = str(soup)
    assert '/home/site/docs' not in out
    # The partial page the site did render is kept; it is what survives of it.
    assert 'Mississauga, Ontario' in out


def test_an_ordinary_comment_is_left_alone():
    soup = BeautifulSoup('<html><body><!-- IndexMember --><p>x</p></body></html>',
                         'html.parser')
    assert mirror_script.strip_server_diagnostics(soup) == 0
    assert 'IndexMember' in str(soup)


# The gallery answered a name it did not hold with an apology page, in three
# wordings. A member who typed a web address or an e-mail address into a gallery
# field is why these exist, so the capture is also named after that address.
NO_SUCH_SET = ('<html><body><h2>Sorry</h2>No set found by that name: '
               '"www.example.sk"</body></html>')
NO_SUCH_PHOTO = ('<html><body><h2>Sorry</h2>No photo found by that name: '
                 '"someone@example.com"</body></html>')
SET_ABSENT = ('<meta charset="utf-8"/><b>Error</b>: The set "www.example.ee" '
              'does not exist.<br/>')


def test_a_missing_gallery_set_answer_is_not_content():
    assert mirror_script.is_error_body(NO_SUCH_SET)


def test_a_missing_gallery_photo_answer_is_not_content():
    assert mirror_script.is_error_body(NO_SUCH_PHOTO)


def test_an_absent_set_answer_is_not_content():
    assert mirror_script.is_error_body(SET_ABSENT)


# The F.A.Q. answered an entry id it did not hold with an apology page, reached
# by following a link the site published against its own zero id.
UNKNOWN_FAQ = ('<html><body><br/><p><font size="+2"><b>Unknown F.A.Q. Entry'
               '</b></font><br/>We\'re sorry, but we can\'t seem to locate '
               'this entry in our F.A.Q. section.</p></body></html>')


def test_a_missing_faq_entry_answer_is_not_content():
    assert mirror_script.is_error_body(UNKNOWN_FAQ)


def test_a_real_faq_entry_is_content():
    assert not mirror_script.is_error_body(
        '<html><body><p><font size="+2"><b>How do I stall a footbag?</b>'
        '</font><br/>Start with the toe stall.</p></body></html>')


# Asked for a member or a club it does not hold, the site echoes the identifier
# back and refuses it. The same opening words introduce a real club whose contact
# has stopped confirming the listing, which is content about a club that exists.
MEMBER_ABSENT = ('<html><body><h2>Sorry</h2>We\'re sorry, but the member you '
                 'requested (81231) was not found.</body></html>')
CLUB_ABSENT = ('<html><body><h2>Sorry</h2>Sorry, the club you requested '
               '("wellington") is not valid.</body></html>')
CLUB_STALE_CONTACT = (
    '<html><body><h1>Footbag Club Listing</h1>'
    'The club you requested (Jersey Hack Connection) is not currently valid. '
    'The contact for that club has not checked in recently, so the listing is '
    'held back until they do.<p>Meets Tuesdays in the park.</p></body></html>')


def test_a_missing_member_answer_is_not_content():
    assert mirror_script.is_error_body(MEMBER_ABSENT)


def test_a_missing_club_answer_is_not_content():
    assert mirror_script.is_error_body(CLUB_ABSENT)


def test_a_club_whose_contact_went_stale_is_still_content():
    # The refusal wording and this wording share their opening words, and the
    # pages that carry this one outnumber the refusals by roughly three to one.
    # Refusing on the shared opening would drop every one of them.
    assert not mirror_script.is_error_body(CLUB_STALE_CONTACT)


def test_an_ordinary_club_page_is_content():
    assert not mirror_script.is_error_body(
        '<html><body><h1>Footbag Club Listing</h1><p>Meets Tuesdays.</p>'
        '</body></html>')


def test_a_refusal_split_across_a_line_break_is_still_refused():
    # The site wrapped its own output at a fixed width, so the refusal usually
    # arrives with a newline inside the sentence rather than as one run of text.
    assert mirror_script.is_error_body(
        '<html><body>We\'re sorry, but the member you requested () was not\n'
        'found.</body></html>')


# The site printed the query it could not run where the page should have been.
# It names the database engine and quotes back the content that broke the query.
SQL_ERROR_BLOCK = (
    '<font face="sans-serif" size="+2">Error</font><br/><p>You have an error '
    'in your SQL syntax; check the manual that corresponds to your MariaDB '
    "server version for the right syntax to use near 't forget\nyour sleeping "
    "bags '' at line 1</p>")


def test_a_page_that_is_only_a_database_error_is_not_content():
    page = ('<html><head><meta charset="utf-8"/><body bgcolor="#ffffff">'
            + SQL_ERROR_BLOCK + '</body></head></html>')
    assert mirror_script.is_error_body(page)


def test_an_event_page_carrying_a_database_error_is_still_content():
    # The query that renders the event body failed, so the page keeps its title
    # and its navigation. Refusing it would lose the event entirely; the error
    # line is removed from the bytes instead.
    page = ('<html><body><h1 class="eventsHeader">California State Footbag '
            'Championships</h1>' + SQL_ERROR_BLOCK + '</body></html>')
    assert not mirror_script.is_error_body(page)


def test_a_database_error_loses_the_engine_name_and_the_quoted_content():
    page = ('<html><body><h1>California State Footbag Championships</h1>'
            + SQL_ERROR_BLOCK + '</body></html>')
    out = mirror_script._SQL_ERROR_RE.sub('', page)
    assert 'MariaDB' not in out
    assert 'SQL syntax' not in out
    assert 'sleeping bags' not in out
    assert 'California State Footbag Championships' in out

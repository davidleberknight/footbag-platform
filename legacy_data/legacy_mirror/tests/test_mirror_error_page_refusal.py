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


# The site is not consistent about quoting the diagnostic badge's title
# attribute: every fixture above uses double quotes, but the live site
# currently emits it single-quoted. The double-quote-only _ERROR_BADGE_RE
# never matched a single-quoted badge, so its own visible text
# ("ERROR 42109") survived every strip and read as real content, even with
# nothing else on the page.
SINGLE_QUOTED_DIAGNOSTIC_ONLY = (
    "<meta charset=\"utf-8\"/><div><span style='padding: 2px' "
    "title='View source for details...'>ERROR&nbsp;42109</span></div>"
    "<!-- <span style='color: #ff0000'><br />"
    "<b>Warning</b>: include(html/poll-failed.html): failed to open stream "
    "in <b>/home/site/docs/newpoll/show</b> on line <b>13</b><br />"
    "</span> -->")


def test_a_single_quoted_diagnostic_badge_is_not_content():
    assert mirror_script.is_error_body(SINGLE_QUOTED_DIAGNOSTIC_ONLY)


# The failure this session actually found: a broken response wrapped in the
# site's ordinary page chrome (nav menu, breadcrumb, language switcher,
# analytics snippet, footer) defeats the whole-body emptiness check no matter
# how the badge is quoted, because that chrome is real, non-empty text
# present on nearly every page. Modeled on today's live rules/chapter/10
# response, trimmed to the parts that matter.
BROKEN_PAGE_WITH_FULL_CHROME = (
    '<html><head><title>Official Rules of Footbag Sports</title></head>'
    '<body>'
    '<div id="MainHeader"><script>_uacct = "UA-1"; urchinTracker();</script>'
    '</div>'
    '<div id="MainHeaderTitle">'
    '<div id="MainBreadcrumb"><a href="/">FOOTBAG WORLDWIDE</a> : '
    '<a href="/ifpa/">IFPA</a> : '
    '<a href="/rules/">Official Rules of Footbag Sports</a></div>'
    '<h1>Official Rules of Footbag Sports</h1>'
    '</div>'
    '<div id="MainWrapper">'
    '<div id="MainMenu"><ul><li><a href="/news/list">WHAT\'S NEW</a>'
    '<li><a href="/faq/">F.A.Q.</a></ul></div>'
    '<div id="MainBody">'
    '<div id="RulesBody">'
    "<div><span style='padding: 2px' title='View source for details...'>"
    'ERROR&nbsp;42109</span></div>'
    "<!-- <span style='color: #ff0000'><br /><b>Warning</b>: Invalid "
    'argument supplied for foreach() in '
    '<b>/home/footbag/public_html/docs/rules/chapter</b> on line '
    '<b>31</b><br /></span> -->'
    '</div>'
    '</div>'
    '</div> <!-- MainWrapper -->'
    '<div id="MainFooter">Copyright 2026, IFPA.</div>'
    '</body></html>')


def test_a_broken_response_wrapped_in_full_page_chrome_is_not_content():
    assert mirror_script.is_error_body(BROKEN_PAGE_WITH_FULL_CHROME)


def test_a_genuinely_short_real_page_with_full_chrome_is_still_content():
    # Same chrome, but MainBody holds real (if short) content and no
    # diagnostic markup at all: nothing is found to strip, so the scoped
    # check must not fire. Guards against the fix over-triggering on any
    # short page rather than specifically a stripped-down broken one.
    page = BROKEN_PAGE_WITH_FULL_CHROME.replace(
        "<div id=\"RulesBody\">"
        "<div><span style='padding: 2px' title='View source for details...'>"
        'ERROR&nbsp;42109</span></div>'
        "<!-- <span style='color: #ff0000'><br /><b>Warning</b>: Invalid "
        'argument supplied for foreach() in '
        '<b>/home/footbag/public_html/docs/rules/chapter</b> on line '
        '<b>31</b><br /></span> -->'
        '</div>',
        '<div id="RulesBody"><p>Chapter 20: Statement of Purpose.</p></div>')
    assert not mirror_script.is_error_body(page)


# A different failure shape found in 20 already-captured event and member
# pages: the query behind the actual content fails partway through, and in
# its place the site emits a second, complete, self-contained, empty HTML
# document nested inside the real page's own body. The response then closes
# early with no MainWrapper marker at all, so neither the whole-body check
# above nor the MainBody-scoped one (nothing here is a diagnostic comment or
# badge for either to find-and-strip) ever catches it on their own. Modeled
# on the real captured bytes of events/show/1007585014.
EVENT_PAGE_WITH_EMPTY_NESTED_DOCUMENT = (
    '<div id="MainBody">\n'
    '<div id="EventsNavigation">\n'
    '<a href="../../past_year_2026/index.html" title="x"><nobr>PREVIOUS</nobr></a>\n'
    '</div> <!-- EventsNavigation -->\n'
    '<div class="eventsHeaderWrapper">\n'
    '<div class="eventsSHeader"><h1 class="eventsHeader">'
    'California State Footbag Championships</h1>\n'
    '</div>\n'
    '<html><head><body bgcolor="#ffffff"></body></head></html>'
    '</div></div></div></body></html>')


def test_an_empty_nested_document_in_place_of_real_content_is_not_content():
    assert mirror_script.is_error_body(EVENT_PAGE_WITH_EMPTY_NESTED_DOCUMENT)


def test_the_variant_with_a_charset_meta_tag_is_also_caught():
    # A second real capture carried an extra <meta charset> inside the empty
    # nested document's <head>; the detector must not be overfit to the exact
    # bytes of one instance.
    page = EVENT_PAGE_WITH_EMPTY_NESTED_DOCUMENT.replace(
        '<html><head><body',
        '<html><head><meta charset="utf-8"/><body')
    assert mirror_script.is_error_body(page)


def test_a_real_event_page_with_no_nested_document_is_still_content():
    page = EVENT_PAGE_WITH_EMPTY_NESTED_DOCUMENT.replace(
        '<html><head><body bgcolor="#ffffff"></body></head></html>',
        '<p>Saturday, June 12th, at the fairgrounds. Registration at 9am.</p>')
    assert not mirror_script.is_error_body(page)


# A live fetch of that same event, taken directly from the running site, shows
# what actually produced the empty nested document above: the query behind
# the description died mid-render with a SQL error, wrapped in the same
# isolated <html><head><body> fragment, and the connection was cut before the
# response ever reached its own closing </p> — nothing usable follows an
# error that never closes. Modeled on the real raw bytes fetched live.
TRUNCATED_LIVE_SQL_ERROR = (
    '<div class="eventsHeaderWrapper">\n'
    '<div class="eventsSHeader"><h1 class="eventsHeader">'
    'California State Footbag Championships</h1>\n'
    '</div>\n'
    '<html><head><body bgcolor=#ffffff><font face=sans-serif size=+2>Error'
    '</font><br><p>You have an error in your SQL syntax; check the manual '
    "that corresponds to your MariaDB server version for the right syntax "
    "to use near 't forget \nyour sleeping bags '' at line 1")


def test_a_sql_error_the_connection_cut_off_before_closing_is_not_content():
    assert mirror_script.is_error_body(TRUNCATED_LIVE_SQL_ERROR)


def test_a_closed_sql_error_beside_real_content_is_unaffected_by_the_new_check():
    # The bounded, complete-document case stays exactly as before: kept, with
    # only the error text removed.
    page = ('<html><body><h1 class="eventsHeader">California State Footbag '
            'Championships</h1>' + SQL_ERROR_BLOCK + '</body></html>')
    assert not mirror_script.is_error_body(page)


def test_the_widened_sql_error_pattern_also_consumes_a_wrapper_when_closed():
    # When the isolated fragment DOES reach its own closing tags (unlike the
    # truncated live case above), stripping must remove the wrapper too, or a
    # contentless <html><head><body></body></head></html> husk is left behind
    # in its place once the message itself is gone.
    page = ('<html><body><h1>California State Footbag Championships</h1>'
            '<html><head><body bgcolor="#ffffff">' + SQL_ERROR_BLOCK
            + '</body></head></html></body></html>')
    out = mirror_script._SQL_ERROR_RE.sub('', page)
    assert '<html><head><body' not in out
    assert 'California State Footbag Championships' in out


# ---- Apache SSI failures: pre-2000 static pages whose includes are dead ----
# The live server serves results.html and news.html as essentially nothing but
# this line, while faq/records.html carries the same line amid chapters of
# real content. A marker test alone would refuse the real page, so the SSI
# text joins the strip-then-empty checks instead.

SSI_LINE = '[an error occurred while processing this directive]'


def test_a_page_that_is_only_a_failed_include_is_not_content():
    # The results.html shape: the SSI failure where the whole page should be.
    assert mirror_script.is_error_body(
        f'<html><body>\n{SSI_LINE}\n</body></html>')


def test_a_real_page_carrying_failed_includes_is_still_content():
    # The faq/records.html shape: real chapters with SSI lines mixed in.
    page = ('<html><body><h1>Footbag Records</h1>'
            f'<p>{SSI_LINE}</p>'
            '<p>Most consecutive kicks: 63,326 by Ted Martin (1997).</p>'
            f'<p>{SSI_LINE}</p></body></html>')
    assert not mirror_script.is_error_body(page)


# ---- Unfilled rulebook-chapter templates ----
# Chapters 0, 800, 920 and 1000 render successfully but carry only the
# template's own placeholder text; the markers below are the live bytes of
# chapter 0, verified against the site. A real chapter that mentions editions
# or copyrights in its own words trips nothing.

def test_an_unfilled_rulebook_chapter_is_not_content():
    page = ('<html><body><b>The Offical Rules of Footbag Sports</b>&nbsp;'
            '<br>(ed#) Edition<br>&nbsp;<br>'
            'Copyright &copy; (pubyear), International Footbag Advisory Board'
            '</body></html>')
    assert mirror_script.is_error_body(page)


def test_each_placeholder_marker_refuses_on_its_own():
    for marker in ('(ed#) Edition', 'Copyright &copy; (pubyear)',
                   '(insert history text here)', '(insert Internet info here)'):
        assert mirror_script.is_error_body(
            f'<html><body>{marker}</body></html>'), marker


def test_a_real_chapter_speaking_of_editions_is_still_content():
    page = ('<html><body><b>The Offical Rules of Footbag Sports</b>'
            '<p>This 2008 Edition supersedes every earlier edition. '
            'Copyright &copy; 2008, International Footbag Advisory Board.</p>'
            '</body></html>')
    assert not mirror_script.is_error_body(page)

"""Signed-in member chrome never survives into the static archive.

The crawler authenticates to capture member-visible content, so fetched pages
can carry the homepage member chrome: the "You are signed in as ..." card,
its account links, and a member-search form. None of that works on a static
host, and a personal signed-in banner does not belong in the archive. Two
layers enforce this: link rewriting drops the block from every newly fetched
page, and an end-of-crawl pass scrubs a homepage already on disk while
leaving every other byte of the page untouched.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_member_chrome.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_chrome', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_chrome'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL

MEMBER_CHROME = (
    '<div class="indexReaderPreview">\n'
    '<div id="IndexMember">\n'
    '<div style="background-color: #eee;">You are signed in as Dave Leberknight.</div>\n'
    '<div class="tiny">\n'
    '<a href="members/home/index.html">home page</a>\n'
    '<form action="members/list/index.html" method="post">\n'
    '<nobr>Member Search:</nobr><input name="SearchText" type="text"/>\n'
    '</form>\n'
    '</div>\n'
    '</div> <!-- IndexMember -->\n'
    '<!-- </div> stray commented-out closing div, present on the real homepage -->\n'
    '</div>\n'
)


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path / 'mirror'))
    return tmp_path


class _RaisingSession:
    """Any network request is a test failure; rewrite here must stay offline."""
    def get(self, url, **kwargs):
        raise AssertionError(f'unexpected network request: {url}')


def _homepage(env):
    path = env / 'mirror' / 'www.footbag.org' / 'index.html'
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def test_rewrite_drops_member_chrome_from_fetched_page(env, monkeypatch):
    monkeypatch.setattr(mirror_script, 'session', _RaisingSession())
    html = ('<html><body>\n' + MEMBER_CHROME +
            '<div class="indexNotices">notices</div>\n</body></html>')
    out = mirror_script.rewrite_links(html, BASE + '/index.html')
    assert 'You are signed in as' not in out
    assert 'Member Search' not in out
    assert 'IndexMember' not in out
    assert 'indexNotices' in out


def test_scrub_removes_chrome_and_only_the_chrome(env):
    home = _homepage(env)
    before_prefix = '<html><body>\n<div class="indexNews">news</div>\n'
    before_suffix = '<div class="indexNotices">notices</div>\n</body></html>'
    home.write_text(before_prefix + MEMBER_CHROME + before_suffix, encoding='utf-8')
    assert mirror_script.scrub_homepage_member_chrome() is True
    after = home.read_text(encoding='utf-8')
    assert 'You are signed in as' not in after
    assert 'Member Search' not in after
    assert 'IndexMember' not in after
    # The stray commented-out closing div after the block must not derail the
    # tag balancing, and every byte outside the block survives unchanged.
    assert 'stray commented-out closing div' in after
    assert after.startswith(before_prefix)
    assert after.endswith(before_suffix)


def test_scrub_is_idempotent_across_repeated_runs(env):
    home = _homepage(env)
    home.write_text('<html><body>\n' + MEMBER_CHROME + '</body></html>',
                    encoding='utf-8')
    assert mirror_script.scrub_homepage_member_chrome() is True
    first = home.read_text(encoding='utf-8')
    assert mirror_script.scrub_homepage_member_chrome() is True
    assert home.read_text(encoding='utf-8') == first


def test_scrub_leaves_chrome_free_homepage_byte_identical(env):
    home = _homepage(env)
    clean = '<html><body><div class="indexNews">news</div></body></html>'
    home.write_text(clean, encoding='utf-8')
    assert mirror_script.scrub_homepage_member_chrome() is True
    assert home.read_text(encoding='utf-8') == clean


def test_scrub_degrades_without_error_when_homepage_absent(env):
    assert mirror_script.scrub_homepage_member_chrome() is False


# The member-area landing pages are the one member-account surface that cannot
# simply be dropped: the site navigation's members link points at them. Their
# body is replaced with a static notice instead, so the link still lands on a
# styled page that explains why member search is gone, and the signed-in
# account's own dashboard never reaches the archive.

MEMBER_AREA_PREFIX = (
    '<html><head><title>Member Services</title></head><body>\n'
    '<div id="MainHeaderTitle"><div id="MainBreadcrumb">crumbs</div>'
    '<h1>Member Area</h1></div>\n'
    '<div id="MainMenu"><ul><li>nav</li></ul></div>\n'
)
MEMBER_AREA_DASHBOARD = (
    '<div id="MainBody">\n'
    '<h1>Welcome, Dave</h1>\n'
    '<div class="membersHome">Your Profile: '
    '<a href="../editprofile/index.html">Update</a></div>\n'
    '<div class="membersNameplate"><h2>Dave Leberknight</h2>'
    '<dl><dt>ID: 11985</dt><dt>E-mail: someone@example.com</dt></dl></div>\n'
    '<form action="../list/index.html"><h3>Find other members:</h3>'
    '<input name="SearchText" type="text"/></form>\n'
    '</div> <!-- MainBody -->\n'
)
MEMBER_AREA_SUFFIX = '<div id="MainFooter">footer</div>\n</body></html>'


def _member_area_page(env, rel_path):
    path = env / 'mirror' / 'www.footbag.org' / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        MEMBER_AREA_PREFIX + MEMBER_AREA_DASHBOARD + MEMBER_AREA_SUFFIX,
        encoding='utf-8')
    return path


def test_notice_replaces_the_dashboard_on_every_member_area_page(env):
    pages = [_member_area_page(env, rel)
             for rel in mirror_script.MEMBER_AREA_NOTICE_PAGES]
    assert mirror_script.replace_member_area_with_notice() == len(pages)
    for page in pages:
        after = page.read_text(encoding='utf-8')
        assert 'Welcome, Dave' not in after
        assert 'Dave Leberknight' not in after
        assert 'someone@example.com' not in after
        assert 'ID: 11985' not in after
        assert 'Find other members' not in after
        # Says plainly that the archive is static, that sign-in and search are
        # gone, how a member page is still reachable, and where current members
        # actually live.
        assert 'static snapshot of the legacy footbag.org' in after
        assert 'member sign-in and member search do not work here' in after
        assert '/members/profile/11983' in after
        assert mirror_script.LIVE_SITE_URL in after


def test_notice_leaves_surrounding_page_chrome_byte_identical(env):
    page = _member_area_page(env, mirror_script.MEMBER_AREA_NOTICE_PAGES[0])
    mirror_script.replace_member_area_with_notice()
    after = page.read_text(encoding='utf-8')
    assert after.startswith(MEMBER_AREA_PREFIX)
    assert after.endswith(MEMBER_AREA_SUFFIX)


def test_notice_is_idempotent_across_repeated_runs(env):
    page = _member_area_page(env, mirror_script.MEMBER_AREA_NOTICE_PAGES[0])
    mirror_script.replace_member_area_with_notice()
    first = page.read_text(encoding='utf-8')
    mirror_script.replace_member_area_with_notice()
    assert page.read_text(encoding='utf-8') == first


def test_notice_leaves_a_page_without_a_main_body_untouched(env):
    path = env / 'mirror' / 'www.footbag.org' / 'members' / 'home' / 'index.html'
    path.parent.mkdir(parents=True, exist_ok=True)
    odd = '<html><body>no main body block here</body></html>'
    path.write_text(odd, encoding='utf-8')
    mirror_script.replace_member_area_with_notice()
    assert path.read_text(encoding='utf-8') == odd


def test_notice_degrades_without_error_when_no_member_area_captured(env):
    assert mirror_script.replace_member_area_with_notice() == 0


# A crawl session with elevated entitlement receives fields the legacy
# templates show only to an administrator, each tagged with a marker span
# beside its value. The whole term or definition holding the marker is removed,
# because dropping only the marker would leave the phone number and street
# address sitting beside their own labels. Public location parts are ordinary
# content and survive, which also keeps them readable by the extractors that
# mine the capture for club and person data.

PROFILE_NAMEPLATE = (
    '<div class="membersProfileNameplate">\n'
    '<dl><dt>ID: 80697</dt><dt>E-mail: invalid</dt></dl>\n'
    '<div class="membersNameplateEnd">\n<dl>\n'
    '<dt><nobr>Phone: 937-266-7228<span class="admin">private</span></nobr></dt>\n'
    '<dt>Location:</dt><dd>175 Old Yellow Springs Rd.'
    '<span class="admin">private</span></dd>\n'
    '<dd>Fairborn, OH</dd>\n<dd>USA</dd>\n'
    '</dl></div>\n</div>\n'
)


def _soup(html):
    from bs4 import BeautifulSoup
    return BeautifulSoup(html, 'html.parser')


def test_admin_only_contact_fields_are_removed_with_their_holders():
    soup = _soup(f'<html><body>{PROFILE_NAMEPLATE}</body></html>')
    assert mirror_script.scrub_elevated_entitlement_content(soup) == 2
    after = str(soup)
    assert '937-266-7228' not in after
    assert '175 Old Yellow Springs Rd' not in after
    assert 'class="admin"' not in after


def test_public_location_parts_survive_the_scrub():
    soup = _soup(f'<html><body>{PROFILE_NAMEPLATE}</body></html>')
    mirror_script.scrub_elevated_entitlement_content(soup)
    after = str(soup)
    assert 'Fairborn, OH' in after
    assert 'USA' in after
    assert 'Location:' in after
    assert 'ID: 80697' in after


def test_profile_member_search_box_is_removed():
    soup = _soup(
        '<html><body><div class="membersProfileSearchBox">'
        '<form action="../../list/index.html"><h3>Find other members:</h3>'
        '</form></div><div class="keep">keep</div></body></html>')
    mirror_script.scrub_elevated_entitlement_content(soup)
    after = str(soup)
    assert 'Find other members' not in after
    assert 'keep' in after


def test_language_form_stops_carrying_the_crawling_account_member_id():
    soup = _soup(
        '<html><body><span id="MainLanguageMenu">'
        '<form action="../profile/11985/index.html" method="post">'
        '<select name="localeID"><option value="fr">French</option></select>'
        '</form></span></body></html>')
    mirror_script.scrub_elevated_entitlement_content(soup)
    after = str(soup)
    assert 'profile/11985' not in after
    # The control itself is inert either way and is left in place, so the page
    # keeps its shape.
    assert 'localeID' in after


def test_scrub_leaves_an_ordinary_page_untouched():
    clean = '<html><body><div class="indexNews">news</div></body></html>'
    soup = _soup(clean)
    assert mirror_script.scrub_elevated_entitlement_content(soup) == 0
    assert str(soup) == clean


def test_script_stripping_keeps_attributes_that_merely_start_like_handlers():
    # Handler attributes are named explicitly rather than matched by prefix.
    # Matching "starts with on" also eats ordinary attributes such as "online",
    # and an attribute that vanishes silently is not something a reader of the
    # archive would ever notice.
    soup = _soup(
        '<html><body><span online="y" once="z" on-click="w" onclick="go()">'
        'keep</span></body></html>')
    mirror_script.strip_javascript(soup)
    after = str(soup)
    assert 'onclick' not in after
    assert 'online="y"' in after
    assert 'once="z"' in after
    assert 'on-click="w"' in after


def test_meta_content_is_only_rewritten_when_it_is_actually_a_url(env, monkeypatch):
    # A meta's content attribute is a URL for only a few specific kinds.
    # Rewriting it unconditionally turned the viewport rule into a path and
    # broke mobile rendering, turned descriptions and keywords into paths, and
    # stripped the charset out of the Content-Type declaration, which is what
    # left the capture with no encoding declared and every accented name
    # rendered as mojibake.
    monkeypatch.setattr(mirror_script, 'session', _RaisingSession())
    html = ('<html><head>'
            '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">'
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
            '<meta name="description" content="The central source of information">'
            '<meta name="keywords" content="footbag,hacky-sack,sipa">'
            '<meta name="generator" content="WordPress 4.7.2">'
            '</head><body><p>x</p></body></html>')
    out = mirror_script.rewrite_links(html, BASE + '/gallery/showset/147')
    assert 'width=device-width, initial-scale=1.0' in out
    assert 'The central source of information' in out
    assert 'footbag,hacky-sack,sipa' in out
    assert 'WordPress 4.7.2' in out
    # None of them turned into a path, and the encoding is declared correctly.
    assert '/index.html"' not in out.replace('href="', '')
    assert 'charset="utf-8"' in out
    assert 'iso-8859-1' not in out


def test_url_bearing_meta_is_still_localized(env, monkeypatch):
    # The allowlisted kinds genuinely carry a URL and must still be pointed at
    # the captured copy, or they keep referencing a host that stops existing.
    monkeypatch.setattr(mirror_script, 'session', _RaisingSession())
    assert mirror_script._meta_content_is_url(
        _soup('<meta property="og:image" content="x">').find('meta'))
    assert mirror_script._meta_content_is_url(
        _soup('<meta name="twitter:image" content="x">').find('meta'))
    assert not mirror_script._meta_content_is_url(
        _soup('<meta name="viewport" content="x">').find('meta'))
    assert not mirror_script._meta_content_is_url(
        _soup('<meta http-equiv="Content-Type" content="x">').find('meta'))


def test_a_commented_out_script_is_removed_too():
    # Not a conditional comment, just a script an author commented out. It does
    # not execute, but it leaves a script tag in the served bytes, which is what
    # the publish gate refuses on, and it has no value in a frozen archive.
    soup = _soup(
        '<html><head><!--<script src="http://example.com/old.js"></script>-->'
        '</head><body><!-- ordinary note --><p>keep</p></body></html>')
    mirror_script.strip_javascript(soup)
    after = str(soup)
    assert 'old.js' not in after
    assert '<script' not in after.lower()
    assert 'ordinary note' in after
    assert 'keep' in after


def test_scripts_hidden_inside_conditional_comments_are_removed():
    # A conditional comment's contents are comment text to the parser, not
    # elements, so a script inside one is invisible to an element sweep and
    # survives into the archive. The legacy theme pages carry several each.
    # Nothing renders their contents today, so the whole comment goes.
    soup = _soup(
        '<html><head>'
        '<!--[if lt IE 9]><script src="http://example.com/html5.js"></script><![endif]-->'
        '</head><body><p>keep me</p>'
        '<!-- an ordinary comment worth keeping -->'
        '</body></html>')
    mirror_script.strip_javascript(soup)
    after = str(soup)
    assert 'html5.js' not in after
    assert '[if lt IE 9]' not in after
    assert 'keep me' in after
    assert 'an ordinary comment worth keeping' in after


def test_legacy_content_type_meta_is_replaced_not_trusted():
    # Legacy pages declare their encoding through an http-equiv Content-Type
    # meta. It cannot be trusted for two independent reasons: the page is saved
    # as UTF-8 whatever it originally announced, so inheriting the old value
    # mis-labels the bytes; and link rewriting reads that attribute as a URL,
    # sees "text/html" and rewrites it away, taking the charset with it. The
    # stale declaration is therefore removed and a correct one written.
    soup = _soup(
        '<html><head><meta http-equiv="Content-Type" '
        'content="text/html; charset=iso-8859-1"><title>t</title></head>'
        '<body>x</body></html>')
    assert mirror_script.ensure_charset_declaration(soup) is True
    after = str(soup)
    assert 'charset="utf-8"' in after
    assert 'iso-8859-1' not in after
    assert 'http-equiv' not in after.lower()


def test_charset_is_added_even_to_a_meta_the_rewriter_already_mangled():
    # What the capture actually contains once rewriting has run: the content
    # attribute turned into a relative path and no encoding declared anywhere.
    soup = _soup(
        '<html><head><meta content="../text/html/index.html" '
        'http-equiv="Content-Type"/><title>t</title></head><body>x</body></html>')
    assert mirror_script.ensure_charset_declaration(soup) is True
    assert 'charset="utf-8"' in str(soup)


def test_a_declaration_buried_in_an_embedded_document_is_moved_to_the_top():
    # The real shape from worlds2002/resultsNet.html: a spreadsheet export that
    # embeds a SECOND whole document, header and all, inside the first. The
    # first <head> in the markup is thousands of bytes in, so a declaration
    # placed there is one the browser never reaches while sniffing the
    # encoding, and every accented name renders as mojibake.
    soup = _soup(
        '<meta content="RevealTrans(Duration=.50)" http-equiv="Page-Exit"/>'
        '<body bgcolor="#ffffff"><table><tr><td>' + ('results ' * 200) +
        '</td></tr></table>'
        '<html xmlns:x="urn:schemas-microsoft-com:office:excel">'
        '<head><meta charset="utf-8"/></head><body>sheet</body></html>'
        '</body>')
    assert mirror_script.ensure_charset_declaration(soup) is True
    after = str(soup)
    assert after.lower().index('charset') < 64
    # Exactly one, so the page cannot carry two that disagree.
    assert after.count('charset="utf-8"') == 1


def test_a_page_that_already_declares_early_is_left_alone():
    # The common case on a re-read. It must return False, or every one of the
    # fifty-thousand captures would be rewritten on each pass.
    soup = _soup('<html><head><meta charset="utf-8"/><title>t</title></head>'
                 '<body>x</body></html>')
    assert mirror_script.ensure_charset_declaration(soup) is False


def test_a_page_without_a_head_still_declares_its_encoding():
    # Some legacy pages are bare fragments. They render in a browser and so
    # need the declaration too, otherwise they are the one page class that can
    # never pass the publish gate.
    soup = _soup('<br/><div>bare fragment</div>')
    assert mirror_script.ensure_charset_declaration(soup) is True
    assert 'charset="utf-8"' in str(soup)


def test_charset_pass_is_idempotent():
    soup = _soup('<html><head><title>t</title></head><body>x</body></html>')
    mirror_script.ensure_charset_declaration(soup)
    first = str(soup)
    again = _soup(first)
    assert mirror_script.ensure_charset_declaration(again) is False
    assert str(again) == first


def test_stylesheets_are_treated_as_page_critical_assets():
    # A stylesheet decides whether every page referencing it is readable or a
    # wall of unstyled text, and there are only a handful across the whole site.
    # Discovered links otherwise land at the back of a queue holding tens of
    # thousands of pages, so the archive's styling would be the last thing
    # fetched and an interrupted crawl would render as plain text. Images stay
    # ordinary: a missing one costs a broken thumbnail, not a broken page.
    assert mirror_script.is_page_critical_asset(
        'http://www.footbag.org/global2/html/global.css')
    assert mirror_script.is_page_critical_asset(
        'http://www.footbag.org/events/html/events.css')
    assert not mirror_script.is_page_critical_asset(
        'http://www.footbag.org/img/gallery/space.gif')
    assert not mirror_script.is_page_critical_asset(
        'http://www.footbag.org/clubs/show/123')


def test_unclosed_void_tag_does_not_break_stripping_or_eat_siblings():
    # Legacy pages write void elements without a closing slash, so the parser
    # adopts everything after one as its children. Removing such a wrapper by
    # decomposition destroys the real stylesheets nested beneath it and leaves
    # any list already holding them pointing at dead elements, which raises.
    # The off-site tag must go, its accidental children must survive, and the
    # pass must not throw.
    soup = _soup(
        '<html><head>'
        '<link rel="dns-prefetch" href="//fonts.googleapis.com">'
        '<link rel="stylesheet" href="/wp-content/theme/style.css">'
        '<link rel="shortcut icon" href="../../css/fw.ico">'
        '</head><body>b</body></html>')
    mirror_script.strip_javascript(soup)
    after = str(soup)
    assert 'fonts.googleapis.com' not in after
    assert 'style.css' in after, "a stylesheet nested by the parse quirk was destroyed"
    assert 'fw.ico' in after


def test_script_stripping_keeps_local_stylesheet_and_icon_links():
    # Only references to another host are dropped. A relative icon or
    # stylesheet is the archive's own asset and every surviving page needs it.
    soup = _soup(
        '<html><head>'
        '<link rel="shortcut icon" href="../../css/fw.ico"/>'
        '<link rel="stylesheet" href="http://fonts.googleapis.com/css?family=X"/>'
        '<link rel="stylesheet" href="//cdn.example.com/x.css"/>'
        '</head><body>b</body></html>')
    mirror_script.strip_javascript(soup)
    after = str(soup)
    assert 'fw.ico' in after
    assert 'googleapis' not in after
    assert 'cdn.example.com' not in after


def test_generated_redirector_pages_declare_a_character_set(env, monkeypatch):
    # Generated redirector pages are served like any other, so they need the
    # same encoding declaration. Without it they are the one page class that
    # would trip the publish gate forever.
    monkeypatch.setattr(mirror_script, 'session', _RaisingSession())
    root = env / 'mirror' / 'www.footbag.org'
    (root / 'news' / 'list_2026').mkdir(parents=True, exist_ok=True)
    (root / 'news' / 'list_2026' / 'index.html').write_text('<html></html>',
                                                            encoding='utf-8')
    mirror_script.create_news_list_redirector()
    written = root / 'news' / 'list' / 'index.html'
    assert written.exists()
    assert 'charset' in written.read_text(encoding='utf-8').lower()


def test_rewrite_applies_the_scrub_to_every_fetched_page(env, monkeypatch):
    monkeypatch.setattr(mirror_script, 'session', _RaisingSession())
    html = f'<html><body>{PROFILE_NAMEPLATE}</body></html>'
    out = mirror_script.rewrite_links(html, BASE + '/members/profile/80697')
    assert '937-266-7228' not in out
    assert '175 Old Yellow Springs Rd' not in out
    assert 'Fairborn, OH' in out

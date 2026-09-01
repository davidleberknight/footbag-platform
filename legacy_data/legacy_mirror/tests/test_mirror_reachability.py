"""Reachability generation in create_mirror_footbag_org.py.

The archive serves statically, so a captured page not on a link-chain from the
landing page is unreachable. At the end of every crawl the crawler generates,
from what is actually on disk: complete per-area browse indexes (seed list
intersected with captured files, paginated), one topic-grouped Archive
Directory page (content areas, World Championships across both trees
interleaved chronologically, microsites), and a native-looking card on the
homepage pointing at the Directory. No generated link may point at a missing
file, everything is JavaScript-free, and the homepage card is inserted exactly
once across repeated runs.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_reachability.py -v
"""
import importlib.util
import os
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_reach', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_reach'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path / 'mirror'))
    monkeypatch.setattr(mirror_script, 'SEEDS_DIR', str(tmp_path / 'seeds'))
    # The events area asks the frozen legacy database which events the calendar
    # was willing to show. Whether this machine has that database attached is not
    # allowed to change any result here, so the answer is always supplied; a test
    # that wants events listed says which ids the calendar carried.
    monkeypatch.setattr(mirror_script, '_calendar_listed_event_ids', lambda: None)
    (tmp_path / 'seeds').mkdir()
    return tmp_path


def _calendar_lists(monkeypatch, *event_ids):
    monkeypatch.setattr(mirror_script, '_calendar_listed_event_ids',
                        lambda: set(event_ids))


def _capture(url, title):
    """Write a minimal captured page for url and return its path."""
    path = Path(mirror_script.url_to_filepath(url))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f'<html><head><title>{title}</title></head>'
                    f'<body>x</body></html>', encoding='utf-8')
    return path


def _seed(env, name, urls):
    (env / 'seeds' / name).write_text('\n'.join(urls) + '\n', encoding='utf-8')


def _www(env):
    return env / 'mirror' / 'www.footbag.org'


def test_listing_holds_only_pages_nothing_else_links(env):
    # The page exists to surface what browsing cannot reach. A captured page that
    # some other page links is reachable already and does not belong on it.
    _seed(env, 'faq.txt', [BASE + '/faq/show/1', BASE + '/faq/show/2',
                           BASE + '/faq/show/3'])
    _capture(BASE + '/faq/show/1', 'footbag.org: Alpha Answer')
    _capture(BASE + '/faq/show/3', 'footbag.org: Zeta Answer')
    # Something in the archive links Alpha, so Alpha is reachable by browsing.
    hub = _www(env) / 'faq' / 'index.html'
    hub.parent.mkdir(parents=True, exist_ok=True)
    hub.write_text('<html><body><a href="show/1/index.html">Alpha</a></body></html>',
                   encoding='utf-8')

    mirror_script.generate_archive_directory()
    listing = (_www(env) / 'archive-directory.html').read_text()

    assert 'Zeta Answer' in listing             # nothing links it
    assert 'Alpha Answer' not in listing        # the FAQ hub links it
    assert '/faq/show/2' not in listing         # never captured
    assert '<script' not in listing.lower()     # strictly JS-free
    assert 'complete' not in listing.lower()    # claims only what it holds


def test_listing_does_not_erase_itself_on_a_second_run(env):
    # The listing links every page it lists. Counting its own links as evidence
    # of reachability would empty it the next time it is generated.
    _seed(env, 'faq.txt', [BASE + '/faq/show/9'])
    _capture(BASE + '/faq/show/9', 'footbag.org: Lonely Answer')

    mirror_script.generate_archive_directory()
    first = (_www(env) / 'archive-directory.html').read_text()
    mirror_script.generate_archive_directory()
    second = (_www(env) / 'archive-directory.html').read_text()

    assert 'Lonely Answer' in first
    assert 'Lonely Answer' in second
    assert first == second


def test_an_area_with_nothing_unlinked_is_omitted_rather_than_empty(env):
    _seed(env, 'faq.txt', [BASE + '/faq/show/1'])
    _capture(BASE + '/faq/show/1', 'footbag.org: Alpha Answer')
    hub = _www(env) / 'faq' / 'index.html'
    hub.parent.mkdir(parents=True, exist_ok=True)
    hub.write_text('<html><body><a href="show/1/index.html">Alpha</a></body></html>',
                   encoding='utf-8')
    mirror_script.generate_archive_directory()
    listing = (_www(env) / 'archive-directory.html').read_text()
    assert '<h2>FAQ</h2>' not in listing


def test_directory_groups_worlds_across_both_trees_chronologically(env):
    _capture(BASE + '/worlds97/', 'Worlds 97')
    _capture(BASE + '/worlds2017/', 'Worlds 2017')
    _capture('http://sites.footbag.org/worlds2018/', 'Worlds 2018')
    _capture('http://sites.footbag.org/reference/', 'Reference site')
    _capture(BASE + '/reference2/', 'Old wiki')
    mirror_script.generate_archive_directory({})
    page = (_www(env) / 'archive-directory.html').read_text()
    # Chronological interleave regardless of which tree holds the year.
    assert page.index('World Championships 1997') \
        < page.index('World Championships 2017') \
        < page.index('World Championships 2018')
    assert 'sites/worlds2018/index.html' in page
    # Non-worlds vhost site listed as a microsite; both wikis distinct.
    assert 'sites/reference/index.html' in page
    assert 'reference2/index.html' in page
    assert '<script' not in page.lower()


def test_homepage_card_is_native_and_inserted_exactly_once(env):
    home = _www(env) / 'index.html'
    home.parent.mkdir(parents=True, exist_ok=True)
    home.write_text('<html><body>\n<div class="indexNews">news</div>\n'
                    '<div class="indexNotices">notices</div>\n</body></html>',
                    encoding='utf-8')
    assert mirror_script.insert_homepage_directory_card() is True
    first = home.read_text()
    # Native block classes from the homepage's own stylesheet; linked to the
    # Directory; inserted ahead of the notices block.
    assert 'class="indexEvents"' in first
    assert 'archive-directory.html' in first
    assert first.index('More Archived Pages') < first.index('indexNotices')
    # The card claims only what the page behind it holds: pages nothing else
    # links, not the whole archive, and never "complete".
    assert 'complete' not in first.lower()
    # Idempotent across repeated end-of-crawl runs.
    assert mirror_script.insert_homepage_directory_card() is True
    assert home.read_text().count('More Archived Pages') == 1


def test_homepage_card_absent_homepage_degrades_without_error(env):
    assert mirror_script.insert_homepage_directory_card() is False


def test_what_the_archive_is_is_stated_by_the_banner_not_a_second_card(env):
    # The homepage once carried a second card explaining that the archive is a
    # frozen snapshot. The banner says that at every front door, so repeating it
    # in a card on one page is duplication; the homepage keeps one card, and it
    # points at the listing of pages nothing links.
    home = _www(env) / 'index.html'
    home.parent.mkdir(parents=True, exist_ok=True)
    home.write_text('<html><body>\n<div class="indexNews">news</div>\n'
                    '<div class="indexNotices">notices</div>\n</body></html>',
                    encoding='utf-8')
    assert mirror_script.insert_homepage_directory_card() is True
    mirror_script.insert_archive_banner()
    text = home.read_text()
    assert text.count('class="indexEvents"') == 1
    assert 'About This Archive' not in text
    assert 'static, read-only snapshot' in text          # said once, by the banner
    assert text.count(mirror_script.ARCHIVE_BANNER_MARKER) == 1


def test_a_worlds_year_captured_as_a_redirect_stub_lists_the_real_page(env):
    # A year fetched at its bare directory address, which the site answers
    # by redirecting to a page underneath it, was captured as a stub whose
    # title is the word 'Redirecting'. Found in production: worlds99 listed
    # this way sends a reader through an extra hop for a page that just says
    # "Redirecting" instead of the real page underneath it.
    real = _capture(BASE + '/worlds99/docs/inpage/', 'Worlds 99')
    stub = Path(mirror_script.url_to_filepath(BASE + '/worlds99/'))
    _redirect_stub(stub, 'docs/inpage/index.html')

    mirror_script.generate_archive_directory({})
    page = (_www(env) / 'archive-directory.html').read_text()

    assert 'worlds99/docs/inpage/index.html' in page
    assert 'href="worlds99/index.html"' not in page
    assert real.exists()


def test_a_worlds_year_on_the_vhost_tree_captured_as_a_stub_also_resolves(env):
    real = _capture('http://sites.footbag.org/worlds2018/docs/inpage/', 'Worlds 2018')
    stub = Path(mirror_script.url_to_filepath('http://sites.footbag.org/worlds2018/'))
    _redirect_stub(stub, 'docs/inpage/index.html')

    mirror_script.generate_archive_directory({})
    page = (_www(env) / 'archive-directory.html').read_text()

    assert 'sites/worlds2018/docs/inpage/index.html' in page
    assert 'href="sites/worlds2018/index.html"' not in page
    assert real.exists()


def test_directory_dedups_a_year_captured_in_both_trees(env):
    # A cross-published championship stored in BOTH trees (www copy + vhost
    # copy) must appear as a single World Championships row, the www one.
    _capture(BASE + '/worlds2015/', 'Worlds 2015')
    _capture('http://sites.footbag.org/worlds2015/', 'Worlds 2015 vhost')
    mirror_script.generate_archive_directory({})
    page = (_www(env) / 'archive-directory.html').read_text()
    assert page.count('World Championships 2015') == 1
    assert 'worlds2015/index.html' in page
    assert 'sites/worlds2015/index.html' not in page   # www copy preferred


# The archive banner. What the archive is, said once at every door a reader can
# come in by: the homepage, everything its own navigation links, each microsite
# and championship root, and the generated listing page. Deep pages get nothing —
# a reader on an event page has already come through one of these.

def _www(env):
    return Path(mirror_script._www_root())


def _make(env, rel, body):
    p = Path(mirror_script._www_root()) / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(f'<html><body>{body}</body></html>', encoding='utf-8')
    return p


def test_banner_lands_on_the_homepage_and_what_its_nav_links(env):
    _make(env, 'index.html',
          '<div id="MainMenu"><ul><li><a href="faq/index.html">FAQ</a></li>'
          '<li><a href="clubs/index.html">CLUBS</a></li></ul></div><p>Home</p>')
    faq = _make(env, 'faq/index.html', '<p>FAQ</p>')
    clubs = _make(env, 'clubs/index.html', '<p>Clubs</p>')
    deep = _make(env, 'events/show/1/index.html', '<p>An event</p>')

    mirror_script.insert_archive_banner()

    for p in (Path(mirror_script._www_root()) / 'index.html', faq, clubs):
        assert mirror_script.ARCHIVE_BANNER_MARKER in p.read_text(encoding='utf-8')
    assert mirror_script.ARCHIVE_BANNER_MARKER not in deep.read_text(encoding='utf-8')


def test_banner_carries_the_live_site_link(env):
    _make(env, 'index.html', '<p>Home</p>')
    mirror_script.insert_archive_banner()
    text = (Path(mirror_script._www_root()) / 'index.html').read_text(encoding='utf-8')
    assert mirror_script.LIVE_SITE_URL in text
    assert 'static, read-only snapshot' in text


def test_banner_is_not_stacked_by_a_second_run(env):
    home = _make(env, 'index.html', '<p>Home</p>')
    mirror_script.insert_archive_banner()
    first = home.read_text(encoding='utf-8')
    mirror_script.insert_archive_banner()
    assert home.read_text(encoding='utf-8') == first
    assert first.count(mirror_script.ARCHIVE_BANNER_MARKER) == 1


def test_banner_reaches_a_microsite_root_the_homepage_never_links(env):
    _make(env, 'index.html', '<p>Home</p>')
    worlds = _make(env, 'worlds2012/index.html', '<p>Worlds 2012</p>')
    mirror_script.insert_archive_banner()
    assert mirror_script.ARCHIVE_BANNER_MARKER in worlds.read_text(encoding='utf-8')


def test_xml_stored_under_an_html_name_is_left_alone(env):
    _make(env, 'index.html', '<p>Home</p>')
    feed = Path(mirror_script._www_root()) / 'worlds2012/index.html'
    feed.parent.mkdir(parents=True, exist_ok=True)
    feed.write_text('<?xml version="1.0"?><rss><channel/></rss>', encoding='utf-8')
    mirror_script.insert_archive_banner()
    assert feed.read_text(encoding='utf-8').startswith('<?xml')


def _redirect_stub(path, target):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        '<!DOCTYPE html>\n<html>\n  <head>\n    <meta charset="utf-8">\n'
        f'    <meta http-equiv="refresh" content="0; url={target}">\n'
        '    <title>Redirecting</title>\n  </head>\n  <body>\n'
        f'    <p>Redirecting to <a href="{target}">{target}</a></p>\n'
        '  </body>\n</html>', encoding='utf-8')
    return path


def test_a_redirected_seed_is_listed_as_the_page_it_leads_to(env):
    # A seed the live site answered with a redirect was captured as a stub whose
    # title is the word 'Redirecting'. Listing the stub gives the reader that
    # word for a label and an extra hop to reach anything.
    _seed(env, 'faq.txt', [BASE + '/faq/show/117'])
    real = _capture(BASE + '/faq/show/900/', 'footbag.org: The Answer Itself')
    stub = Path(mirror_script.url_to_filepath(BASE + '/faq/show/117/'))
    _redirect_stub(stub, '../900/index.html')

    mirror_script.generate_archive_directory()
    page = (_www(env) / 'archive-directory.html').read_text()

    assert 'Redirecting' not in page
    assert 'The Answer Itself' in page
    assert 'faq/show/900/index.html' in page
    assert real.exists()


def test_a_redirected_seed_whose_landing_page_is_linked_is_not_listed(env):
    # The shape the real capture holds: the stub is linked by nothing, so judging
    # it by its own path lists a page the archive reaches perfectly well. What
    # decides the row is where the stub lands, not where it sits.
    _seed(env, 'faq.txt', [BASE + '/faq/show/117'])
    _capture(BASE + '/faq/show/900/', 'footbag.org: The Answer Itself')
    stub = Path(mirror_script.url_to_filepath(BASE + '/faq/show/117/'))
    _redirect_stub(stub, '../900/index.html')
    hub = _www(env) / 'faq' / 'index.html'
    hub.parent.mkdir(parents=True, exist_ok=True)
    hub.write_text('<html><body><a href="show/900/index.html">Answer</a></body></html>',
                   encoding='utf-8')

    mirror_script.generate_archive_directory()
    page = (_www(env) / 'archive-directory.html').read_text()

    assert 'The Answer Itself' not in page
    assert '<h2>FAQ</h2>' not in page


def test_a_seed_whose_page_is_the_apps_own_failure_is_not_listed(env):
    # The legacy app answered 200 with a 'nothing here' body. Listing it sends a
    # reader to a page saying the entry does not exist.
    _seed(env, 'faq.txt', [BASE + '/faq/show/1', BASE + '/faq/show/2'])
    _capture(BASE + '/faq/show/1', 'footbag.org: Real Answer')
    empty = Path(mirror_script.url_to_filepath(BASE + '/faq/show/2'))
    empty.parent.mkdir(parents=True, exist_ok=True)
    empty.write_text('<html><head><title>F.A.Q.</title></head><body>'
                     'Unknown F.A.Q. Entry'
                     '</body></html>', encoding='utf-8')

    mirror_script.generate_archive_directory()
    page = (_www(env) / 'archive-directory.html').read_text()

    assert 'Real Answer' in page
    assert 'faq/show/2/index.html' not in page


def test_a_page_that_is_nothing_but_a_server_error_is_not_listed(env):
    # The site commented out each PHP diagnostic and showed a badge in its place,
    # so the page renders as an error marker and nothing else.
    _seed(env, 'polls.txt', [BASE + '/newpoll/show/1/'])
    broken = Path(mirror_script.url_to_filepath(BASE + '/newpoll/show/1/'))
    broken.parent.mkdir(parents=True, exist_ok=True)
    broken.write_text(
        '<meta charset="utf-8"/><div><span style="color: red" '
        'title="View source for details...">ERROR 42109</span></div>'
        "<!-- <span style='color: #ff0000'><br />\n<b>Warning</b>: include() "
        'failed to open stream in <b>/home/site/docs/newpoll/show</b> on line '
        '<b>13</b><br />\n</span> -->', encoding='utf-8')

    mirror_script.generate_archive_directory()
    page = (_www(env) / 'archive-directory.html').read_text()

    assert 'Polls' not in page
    assert 'newpoll/show/1' not in page


def test_a_page_keeps_its_row_when_a_server_error_sits_beside_real_content(env):
    _seed(env, 'faq.txt', [BASE + '/faq/show/1000/'])
    page_path = Path(mirror_script.url_to_filepath(BASE + '/faq/show/1000/'))
    page_path.parent.mkdir(parents=True, exist_ok=True)
    page_path.write_text(
        '<html><head><title>F.A.Q.</title></head><body>'
        "<!-- <span style='color: #ff0000'><br /><b>Warning</b>: Invalid "
        'argument in <b>/home/site/docs/faq/show</b><br /></span> -->'
        '<p>Article 1000 text that a reader came for.</p>'
        '</body></html>', encoding='utf-8')

    mirror_script.generate_archive_directory()
    page = (_www(env) / 'archive-directory.html').read_text()

    assert 'faq/show/1000/index.html' in page


def test_rows_sharing_one_title_are_told_apart(env):
    # Whole classes of legacy page carry one title across every member, so a
    # list of identical links tells a reader nothing about which to open.
    _seed(env, 'faq.txt', [BASE + '/faq/show/30', BASE + '/faq/show/800'])
    _capture(BASE + '/faq/show/30', 'Frequently Asked Questions')
    _capture(BASE + '/faq/show/800', 'Frequently Asked Questions')

    mirror_script.generate_archive_directory()
    page = (_www(env) / 'archive-directory.html').read_text()

    assert 'Frequently Asked Questions (30)' in page
    assert 'Frequently Asked Questions (800)' in page


def test_two_seeds_reaching_one_page_make_one_row(env, monkeypatch):
    _calendar_lists(monkeypatch, '1')
    _seed(env, 'events.txt', [BASE + '/events/show/1?a=1',
                              BASE + '/events/show/1?a=2'])
    _capture(BASE + '/events/show/1?a=1', 'Volley Sock Championships')

    mirror_script.generate_archive_directory()
    page = (_www(env) / 'archive-directory.html').read_text()

    assert page.count('Volley Sock Championships') == 1


def test_a_title_carrying_markup_reads_as_the_name_someone_typed(env, monkeypatch):
    # Legacy event names hold markup the app escaped before storing it, so the
    # title arrives as text that reads back as tags.
    _calendar_lists(monkeypatch, '1')
    _seed(env, 'events.txt', [BASE + '/events/show/1'])
    _capture(BASE + '/events/show/1', '&lt;b&gt;Volley Sock CHAMPIONSHIPS&lt;/b&gt;')

    mirror_script.generate_archive_directory()
    page = (_www(env) / 'archive-directory.html').read_text()

    assert '>Volley Sock CHAMPIONSHIPS</a>' in page
    assert '&lt;b&gt;' not in page


def test_a_label_can_never_inject_markup_into_the_listing(env, monkeypatch):
    _calendar_lists(monkeypatch, '2')
    _seed(env, 'events.txt', [BASE + '/events/show/2'])
    path = Path(mirror_script.url_to_filepath(BASE + '/events/show/2/'))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('<html><head><title>Jam &amp; Shred</title></head>'
                    '<body>x</body></html>', encoding='utf-8')

    mirror_script.generate_archive_directory()
    page = (_www(env) / 'archive-directory.html').read_text()

    assert 'Jam &amp; Shred' in page
    assert 'Jam & Shred<' not in page


def test_a_gallery_set_its_owner_hid_is_never_listed(env):
    # Every gallery seed names a set marked invisible, seeded so its photographs
    # are captured rather than stranded. Naming it here would publish an album
    # its owner kept off the site's own indexes.
    _seed(env, 'gallery.txt', [BASE + '/gallery/showset/4242'])
    _capture(BASE + '/gallery/showset/4242', 'footbag.org: Private Jam Photos')

    mirror_script.generate_archive_directory()
    page = (_www(env) / 'archive-directory.html').read_text()

    assert 'Private Jam Photos' not in page
    assert 'Gallery' not in page


def test_a_club_the_directory_filtered_out_is_never_listed(env):
    # The clubs seed is the whole table, wider than the clubs directory on
    # purpose. Listing it re-publishes exactly the entries that directory hid.
    _seed(env, 'clubs.txt', [BASE + '/clubs/show/77'])
    _capture(BASE + '/clubs/show/77', 'footbag.org: Club: Unapproved Club')

    mirror_script.generate_archive_directory()
    page = (_www(env) / 'archive-directory.html').read_text()

    assert 'Unapproved Club' not in page
    assert '<h2>Clubs</h2>' not in page


def test_an_event_the_calendar_never_listed_is_withheld(env, monkeypatch):
    # An unapproved event still serves its page, which is why the crawl captures
    # it, but the calendar refused to show it and this page must not undo that.
    _calendar_lists(monkeypatch, '11')
    _seed(env, 'events.txt', [BASE + '/events/show/11', BASE + '/events/show/12'])
    _capture(BASE + '/events/show/11', 'footbag.org: Approved Open')
    _capture(BASE + '/events/show/12', 'footbag.org: Withheld Open')

    mirror_script.generate_archive_directory()
    page = (_www(env) / 'archive-directory.html').read_text()

    assert 'Approved Open' in page
    assert 'Withheld Open' not in page


def test_events_are_skipped_when_the_calendar_cannot_be_consulted(env):
    # Without the frozen legacy database an approved event cannot be told from a
    # withheld one, and a finding aid guesses at neither.
    _seed(env, 'events.txt', [BASE + '/events/show/11'])
    _capture(BASE + '/events/show/11', 'footbag.org: Some Open')

    mirror_script.generate_archive_directory()
    page = (_www(env) / 'archive-directory.html').read_text()

    assert 'Some Open' not in page
    assert '<h2>Events</h2>' not in page


def test_every_section_states_how_much_it_holds(env, monkeypatch):
    # A reader sees the size of each heading, and a rebuild that halves a section
    # shows it on the page rather than only in a log.
    _calendar_lists(monkeypatch, '11')
    _seed(env, 'events.txt', [BASE + '/events/show/11'])
    _capture(BASE + '/events/show/11', 'footbag.org: Approved Open')
    worlds = _www(env) / 'worlds99' / 'index.html'
    worlds.parent.mkdir(parents=True, exist_ok=True)
    worlds.write_text('<html><body>x</body></html>', encoding='utf-8')

    mirror_script.generate_archive_directory()
    page = (_www(env) / 'archive-directory.html').read_text()

    assert '<h2>Events</h2>\n<p class="count">1 page(s).</p>' in page
    assert '<h2>World Championships</h2>\n<p class="count">1 page(s).</p>' in page


def test_a_front_door_the_site_served_as_a_bare_fragment_still_says_what_it_is(env):
    # The retired-forum notice has no <body> of its own, and the main menu of
    # every page in the archive links it. A reader arriving there with no banner
    # has no statement of what they have reached and no way back to the live
    # site.
    _make(env, 'index.html',
          '<div id="MainMenu"><a href="forum-down.html">FORUM</a></div>')
    notice = Path(mirror_script._www_root()) / 'forum-down.html'
    notice.write_text('<meta charset="utf-8"/><div><h2>We\'re Sorry</h2></div>',
                      encoding='utf-8')

    mirror_script.insert_archive_banner()
    out = notice.read_text(encoding='utf-8')

    assert mirror_script.ARCHIVE_BANNER_MARKER in out
    assert mirror_script.LIVE_SITE_URL in out
    assert "We're Sorry" in out


def test_a_bare_fragment_is_not_banded_twice(env):
    _make(env, 'index.html',
          '<div id="MainMenu"><a href="forum-down.html">FORUM</a></div>')
    notice = Path(mirror_script._www_root()) / 'forum-down.html'
    notice.write_text('<meta charset="utf-8"/><div>notice</div>', encoding='utf-8')

    mirror_script.insert_archive_banner()
    mirror_script.insert_archive_banner()

    assert notice.read_text(encoding='utf-8').count(
        mirror_script.ARCHIVE_BANNER_MARKER) == 1


def test_a_reference_site_is_listed_once_not_as_a_microsite_as_well(env):
    _capture('http://sites.footbag.org/reference/', 'Reference site')
    _capture('http://sites.footbag.org/some-other-site/', 'Some Other Site')

    mirror_script.generate_archive_directory({})
    page = (_www(env) / 'archive-directory.html').read_text()

    assert page.count('sites/reference/index.html') == 1
    assert 'sites/some-other-site/index.html' in page


def test_a_page_worthless_despite_capture_is_never_listed_even_when_recaptured(env):
    # worlds2009 (a dead Flash shell with an empty content div) and
    # usage-information (WordPress site-builder boilerplate) were both
    # found and manually removed from a real capture as junk. A future crawl
    # naturally re-reaches both by ordinary link-following, so the exclusion
    # has to survive a recapture rather than rely on the file staying absent.
    _capture(BASE + '/worlds2009/', 'World Championships 2009')
    _capture('http://sites.footbag.org/usage-information/', 'Usage Information')

    mirror_script.generate_archive_directory({})
    page = (_www(env) / 'archive-directory.html').read_text()

    assert 'worlds2009/index.html' not in page
    assert 'World Championships 2009' not in page
    assert 'sites/usage-information/index.html' not in page

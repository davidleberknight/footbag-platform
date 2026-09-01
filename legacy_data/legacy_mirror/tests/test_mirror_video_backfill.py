"""Video-backfill mode of create_mirror_footbag_org.py.

Skip-mode crawls exclude video binaries and record each one (with every
referring page) in the skipped-videos manifest. The backfill pass completes the
archive: it downloads each recorded video through the ordinary media path, then
repairs the referring pages so their elements point at the local mp4, matching
elements by NORMALIZED URL (escaped ampersands and UI-param noise cannot cause
a silent miss), stripping the stale skip-marker comment, applying the standard
broken-video fallback when conversion failed, and writing each record's outcome
back into the manifest. A missing manifest aborts with an actionable message;
an unsafe recorded URL is refused, never fetched.

All fixtures are local; the download step is stubbed. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_video_backfill.py -v
"""
import importlib.util
import json
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_backfill', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_backfill'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL
PAGE_URL = BASE + '/gallery/show/77'
VIDEO_URL = BASE + '/media/Lisa&Andy.mov'


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path / 'mirror'))
    state = mirror_script.MirrorState()
    monkeypatch.setattr(mirror_script, 'mirror_state', state)
    monkeypatch.setattr(mirror_script, 'SKIP_VIDEOS', False)
    (tmp_path / 'mirror').mkdir()
    return tmp_path


def _write_manifest(env, records):
    path = env / 'mirror' / mirror_script.SKIPPED_VIDEO_MANIFEST
    path.write_text(json.dumps(records), encoding='utf-8')
    return path


def _record(url=VIDEO_URL, referrers=(PAGE_URL,), **extra):
    rec = {
        'url': url,
        'normalized_url': mirror_script.normalize_url(url),
        'referrers': list(referrers),
        'host': 'www.footbag.org',
        'extension': '.mov',
        'content_type': 'video/quicktime',
        'detection': 'extension',
        'disposition': 'skipped_video',
    }
    rec.update(extra)
    return rec


def _write_referrer_page(html):
    page_path = Path(mirror_script.url_to_filepath(PAGE_URL))
    page_path.parent.mkdir(parents=True, exist_ok=True)
    page_path.write_text(html, encoding='utf-8')
    return page_path


def _stub_download(monkeypatch, result_suffix='.mp4'):
    """Stub the media download to 'produce' the converted local file."""
    def fake_download(url, session, referrer=None, thumbnail_or_poster=False):
        target = Path(mirror_script.url_to_filepath(mirror_script.strip_query(url)))
        final = target.with_suffix(result_suffix)
        final.parent.mkdir(parents=True, exist_ok=True)
        final.write_bytes(b'mp4')
        return str(final)
    monkeypatch.setattr(mirror_script, 'download_and_process_media', fake_download)


def test_missing_manifest_aborts_with_actionable_message(env):
    with pytest.raises(SystemExit) as exc:
        mirror_script.run_video_backfill()
    assert '--video-backfill' in str(exc.value)
    assert mirror_script.SKIPPED_VIDEO_MANIFEST in str(exc.value)


def test_backfill_repairs_referrer_and_records_outcome(env, monkeypatch):
    _write_manifest(env, [_record()])
    # The skip pass kept the ORIGINAL absolute URL (escaped, as HTML carries
    # it) with the marker comment before the element.
    page = _write_referrer_page(
        '<html><body>\n'
        '<!--Mirror: video binary not mirrored (skip-videos); original URL retained-->'
        f'<a href="{BASE}/media/Lisa&amp;Andy.mov">watch</a>\n'
        '</body></html>')
    _stub_download(monkeypatch)
    outcomes = mirror_script.run_video_backfill()
    assert outcomes == {'backfilled': 1, 'already_done': 0, 'failed': 0,
                        'refused': 0, 'gave_up': 0}
    out = page.read_text()
    # Element repaired to the relative local mp4; normalized matching bridged
    # the &amp; escape; the stale skip marker is gone.
    assert 'Lisa&Andy.mp4' in out.replace('&amp;', '&')
    assert 'skip-videos' not in out
    assert 'http://' not in out.split('href="', 1)[1].split('"', 1)[0]
    # Manifest carries the outcome and the local file.
    manifest = json.loads((env / 'mirror' / mirror_script.SKIPPED_VIDEO_MANIFEST).read_text())
    assert manifest[0]['disposition'] == 'backfilled'
    assert manifest[0]['local_file'].endswith('.mp4')


def test_failed_conversion_gets_broken_video_fallback(env, monkeypatch):
    _write_manifest(env, [_record()])
    page = _write_referrer_page(
        f'<html><body><a href="{BASE}/media/Lisa&amp;Andy.mov">watch</a></body></html>')
    monkeypatch.setattr(mirror_script, 'download_and_process_media',
                        lambda *a, **k: None)
    outcomes = mirror_script.run_video_backfill()
    assert outcomes['failed'] == 1
    out = page.read_text()
    assert 'not available' in out            # standard broken-video fallback
    assert 'href' not in out                 # the dead link itself is removed
    manifest = json.loads((env / 'mirror' / mirror_script.SKIPPED_VIDEO_MANIFEST).read_text())
    assert manifest[0]['disposition'] == 'backfill_failed'


def test_unsafe_recorded_url_is_refused_not_fetched(env, monkeypatch):
    _write_manifest(env, [_record(url=BASE + '/gallery/delete/9.mov')])
    def boom(*a, **k):
        raise AssertionError('unsafe URL must never be fetched')
    monkeypatch.setattr(mirror_script, 'download_and_process_media', boom)
    outcomes = mirror_script.run_video_backfill()
    assert outcomes['refused'] == 1


def test_already_backfilled_record_is_not_refetched(env, monkeypatch):
    _write_manifest(env, [_record(disposition='backfilled', local_file='/x.mp4')])
    def boom(*a, **k):
        raise AssertionError('a completed record must not be refetched')
    monkeypatch.setattr(mirror_script, 'download_and_process_media', boom)
    outcomes = mirror_script.run_video_backfill()
    assert outcomes['already_done'] == 1


def test_video_element_with_source_child_is_repaired(env, monkeypatch):
    _write_manifest(env, [_record()])
    page = _write_referrer_page(
        '<html><body><video controls poster="p.jpg">'
        f'<source src="{BASE}/media/Lisa&amp;Andy.mov" type="video/quicktime">'
        '</video></body></html>')
    _stub_download(monkeypatch)
    mirror_script.run_video_backfill()
    out = page.read_text()
    assert '.mp4' in out
    assert out.count('poster="p.jpg"') == 1   # poster untouched
    assert 'video/mp4' in out                 # source type updated


def test_an_image_element_pointing_at_a_video_is_repaired(env, monkeypatch):
    # The legacy gallery points img elements at video files, so an image tag is a
    # referring element like any other. Skipping them leaves the page addressing
    # the live host for a video the archive holds.
    _write_manifest(env, [_record()])
    page = _write_referrer_page(
        '<html><body><img src="'
        f'{BASE}/media/Lisa&amp;Andy.mov?cacheBuster=1788149461"></body></html>')
    _stub_download(monkeypatch)
    mirror_script.run_video_backfill()
    out = page.read_text()
    assert 'footbag.org/media' not in out
    assert '.mp4' in out


class TestAVideoThatKeepsFailingIsLeftAlone:
    """Re-downloading a file that has failed the same way twice spends the whole
    pass on a certain failure: the source is gone, or ffmpeg cannot make an mp4
    of it. The record is left alone after the second attempt, but its referring
    pages still go through the repair, because a refresh crawl restores the
    original address on them and this pass is what replaces it with the wording
    that says the video is not available.
    """

    @staticmethod
    def _refuse_download(monkeypatch):
        def boom(*a, **k):
            raise AssertionError('a record already tried twice must not be refetched')
        monkeypatch.setattr(mirror_script, 'download_and_process_media', boom)

    def test_a_twice_failed_record_is_not_downloaded_again(self, env, monkeypatch):
        _write_manifest(env, [_record(disposition='backfill_failed', attempts=2)])
        self._refuse_download(monkeypatch)
        outcomes = mirror_script.run_video_backfill()
        assert outcomes['gave_up'] == 1
        assert outcomes['failed'] == 0

    def test_its_page_still_gets_the_not_available_wording(self, env, monkeypatch):
        _write_manifest(env, [_record(disposition='backfill_failed', attempts=2)])
        page = _write_referrer_page(
            '<html><body>'
            f'<a href="{BASE}/media/Lisa&amp;Andy.mov">watch</a>'
            '</body></html>')
        self._refuse_download(monkeypatch)
        mirror_script.run_video_backfill()
        assert 'not available' in page.read_text()

    def test_one_failure_is_still_worth_another_attempt(self, env, monkeypatch):
        _write_manifest(env, [_record(disposition='backfill_failed', attempts=1)])
        _stub_download(monkeypatch)
        outcomes = mirror_script.run_video_backfill()
        assert outcomes['backfilled'] == 1
        assert outcomes['gave_up'] == 0

    def test_a_fix_can_be_proved_by_asking_for_every_record_again(self, env, monkeypatch):
        # After a change that could alter the outcome, the operator asks for the
        # retry explicitly rather than the pass guessing that something changed.
        _write_manifest(env, [_record(disposition='backfill_failed', attempts=5)])
        _stub_download(monkeypatch)
        outcomes = mirror_script.run_video_backfill(retry_failed=True)
        assert outcomes['backfilled'] == 1
        assert outcomes['gave_up'] == 0

    def test_an_attempt_is_counted_so_the_second_one_is_the_last(self, env, monkeypatch):
        path = _write_manifest(env, [_record(disposition='backfill_failed', attempts=1)])
        monkeypatch.setattr(mirror_script, 'download_and_process_media',
                            lambda *a, **k: None)
        mirror_script.run_video_backfill()
        assert json.loads(path.read_text())[0]['attempts'] == 2


class TestAVideoAlreadyDownloadedStillGetsItsPageRepaired:
    """A refresh crawl re-fetches every page from the live site, which restores
    the original remote address on every video element. This pass is the only
    thing that points them back at the local file, so it has to repair pages for
    videos downloaded on an earlier run as well as the ones it fetches now.
    Otherwise a published archive links footbag.org for videos it already holds.
    """

    @staticmethod
    def _refuse_download(monkeypatch):
        def boom(*a, **k):
            raise AssertionError('a completed record must not be refetched')
        monkeypatch.setattr(mirror_script, 'download_and_process_media', boom)

    def test_the_referring_page_is_pointed_back_at_the_local_file(self, env, monkeypatch):
        local = env / 'mirror' / 'clip.mp4'
        local.write_bytes(b'mp4')
        _write_manifest(env, [_record(disposition='backfilled',
                                      local_file=str(local))])
        page = _write_referrer_page(
            f'<html><body><a href="{BASE}/media/Lisa&amp;Andy.mov">clip</a>'
            '</body></html>')
        self._refuse_download(monkeypatch)

        outcomes = mirror_script.run_video_backfill()
        out = page.read_text()
        assert outcomes['already_done'] == 1
        assert 'clip.mp4' in out
        assert '/media/Lisa&Andy.mov' not in out

    def test_a_page_already_pointing_locally_is_left_alone(self, env, monkeypatch):
        # The repair matches on the remote address, so a page repaired by an
        # earlier run has nothing left to match and must not be rewritten again.
        local = env / 'mirror' / 'clip.mp4'
        local.write_bytes(b'mp4')
        _write_manifest(env, [_record(disposition='backfilled',
                                      local_file=str(local))])
        page = _write_referrer_page(
            '<html><body><a href="../../clip.mp4">clip</a></body></html>')
        before = page.read_text()
        self._refuse_download(monkeypatch)

        mirror_script.run_video_backfill()
        assert page.read_text() == before

    def test_a_record_whose_local_file_is_gone_offers_no_local_link(self, env, monkeypatch):
        # Naming a file that is not there would publish a broken link, so the
        # page keeps what it has rather than being pointed at nothing.
        _write_manifest(env, [_record(disposition='backfilled',
                                      local_file=str(env / 'mirror' / 'absent.mp4'))])
        page = _write_referrer_page(
            f'<html><body><a href="{BASE}/media/Lisa&amp;Andy.mov">clip</a>'
            '</body></html>')
        self._refuse_download(monkeypatch)

        mirror_script.run_video_backfill()
        assert 'absent.mp4' not in page.read_text()


class TestACrawlKeepsWhatTheBackfillRecorded:
    """A crawl rewriting the manifest must not erase the backfill's outcomes.

    The backfill writes each video's outcome only into the manifest on disk. A
    crawl rebuilds that same file from its own in-memory records, which a
    resumed run restores from a progress file that can predate the backfill, so
    it has to read the settled outcomes back. Otherwise the first crawl to
    finish reports every downloaded video as still skipped and names the local
    file for none of them.
    """

    def test_a_recorded_outcome_survives_a_crawl_rewriting_the_manifest(self, env):
        path = _write_manifest(env, [_record(disposition='backfilled',
                                             local_file='/mirror/x.mp4')])
        # What a resumed crawl carries: the state as it was before the backfill.
        mirror_script.mirror_state.skipped_videos = {
            mirror_script.normalize_url(VIDEO_URL): _record()}
        mirror_script.mirror_state.write_skipped_video_manifest()
        written = json.loads(path.read_text())
        assert [r['disposition'] for r in written] == ['backfilled']
        assert written[0]['local_file'] == '/mirror/x.mp4'

    def test_a_record_the_crawl_dropped_is_not_resurrected(self, env):
        # The exclusions sweep prunes records deliberately, so a record only the
        # manifest still carries must stay gone rather than come back from disk.
        pruned = BASE + '/media/excluded.mov'
        path = _write_manifest(env, [
            _record(disposition='backfilled', local_file='/mirror/x.mp4'),
            _record(url=pruned, disposition='backfilled',
                    local_file='/mirror/pruned.mp4')])
        mirror_script.mirror_state.skipped_videos = {
            mirror_script.normalize_url(VIDEO_URL): _record()}
        mirror_script.mirror_state.write_skipped_video_manifest()
        written = json.loads(path.read_text())
        assert [r['url'] for r in written] == [VIDEO_URL]

    def test_an_outcome_this_run_settled_itself_wins_over_the_manifest(self, env):
        # A genuinely fresh outcome this run's own backfill pass produced -
        # marked as such in settled_this_run, exactly as run_video_backfill
        # itself marks every disposition it sets - is newer than whatever the
        # manifest holds and must not be overwritten by it. An attempts count
        # alone proves nothing: a stale progress snapshot can carry one too.
        path = _write_manifest(env, [_record(disposition='backfilled',
                                             local_file='/mirror/stale.mp4')])
        norm = mirror_script.normalize_url(VIDEO_URL)
        mirror_script.mirror_state.skipped_videos = {
            norm: _record(disposition='backfill_refused_excluded', attempts=1)}
        mirror_script.mirror_state.settled_this_run = {norm}
        mirror_script.mirror_state.write_skipped_video_manifest()
        written = json.loads(path.read_text())
        assert written[0]['disposition'] == 'backfill_refused_excluded'
        assert 'local_file' not in written[0]


class TestRedundantViewerRowRemoval:
    """The duplicate viewer row beside a video with no local copy.

    The legacy site pairs a video with a second table row linking to the
    JavaScript popup for the same clip. Where the video did not survive, that
    row is replaced with a note instead of being left pointing at a popup the
    archive cannot open. Finding it means resolving the row's relative href
    against the address the page was served at, so that base has to reach the
    body of the helper: without it the helper raises, the caller swallows the
    error, and the whole page is written back carrying its live-site links.
    """

    def _page(self, sibling_href):
        html = (
            '<table>'
            '<tr><td><a id="clip" href="/media/clip.mov">clip</a></td></tr>'
            f'<tr><td><a href="{sibling_href}">watch</a></td></tr>'
            '</table>')
        soup = mirror_script.BeautifulSoup(html, 'html.parser')
        return soup, soup.find(id='clip')

    def test_a_gallery_viewer_row_is_replaced_with_a_note(self):
        soup, element = self._page('/gallery/show/77')
        mirror_script.remove_fallback_viewer_row(element, PAGE_URL, soup)
        assert '/gallery/show/77' not in str(soup)
        assert 'removed JavaScript popup window' in str(soup)

    def test_a_row_that_is_not_a_viewer_link_is_left_alone(self):
        soup, element = self._page('/events/show/77')
        mirror_script.remove_fallback_viewer_row(element, PAGE_URL, soup)
        assert soup.find('a', href='/events/show/77') is not None
        assert 'removed JavaScript popup window' not in str(soup)

"""
test_mirror_skip_videos.py: the video-exclusion mode (--skip-videos) of
create_mirror_footbag_org.py, plus the restart-safety behavior around it.

Contract under test: with the mode on, recognized video binaries are skipped
before their bodies are read (by extension with zero network, or by a video/*
Content-Type from streamed headers), pages and non-video assets keep
downloading normally, every skipped video lands deduplicated in the manifest
with all referring pages, skipped links keep their original URL, skips are a
distinct state from failures, and a resumed crawl does not re-request them.

All fixtures are local; no live-site access. Run from repo root:
    python -m pytest legacy_data/tests/test_mirror_skip_videos.py -v
"""
import importlib.util
import json
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_skipvid', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_skipvid'] = mirror_script
spec.loader.exec_module(mirror_script)

BASE = mirror_script.BASE_URL


class ExplodingBody:
    """A response body that fails the test if anything iterates or reads it."""
    def iter_content(self, chunk_size=None):
        raise AssertionError('video body was read; early rejection must not consume the body')

    @property
    def content(self):
        raise AssertionError('video body was read via .content')


class FakeResponse:
    def __init__(self, url, content_type='text/html', body=b'', status=200,
                 content_length=None, explode_on_body=False):
        self.url = url
        self.status_code = status
        self.headers = {'Content-Type': content_type}
        if content_length is not None:
            self.headers['Content-Length'] = str(content_length)
        self._body = body
        self._explode = explode_on_body
        self.closed = False

    def iter_content(self, chunk_size=8192):
        if self._explode:
            raise AssertionError('video body was read; early rejection must not consume the body')
        yield self._body

    @property
    def content(self):
        if self._explode:
            raise AssertionError('video body was read via .content')
        return self._body

    @property
    def text(self):
        return self.content.decode('utf-8', errors='ignore')

    def raise_for_status(self):
        if self.status_code >= 400:
            raise mirror_script.requests.exceptions.HTTPError(response=self)

    def close(self):
        self.closed = True


class FakeSession:
    """Serves canned responses by URL; records every request it sees."""
    def __init__(self, responses=None):
        self.responses = responses or {}
        self.requests = []

    def get(self, url, **kwargs):
        self.requests.append(url)
        if url in self.responses:
            return self.responses[url]
        raise AssertionError(f'unexpected network request: {url}')


@pytest.fixture()
def skip_mode(tmp_path, monkeypatch):
    """Fresh state with --skip-videos on and all output under tmp_path."""
    monkeypatch.setattr(mirror_script, 'SKIP_VIDEOS', True)
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path / 'mirror'))
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE', str(tmp_path / 'progress.json'))
    state = mirror_script.MirrorState()
    monkeypatch.setattr(mirror_script, 'mirror_state', state)
    return state


@pytest.fixture()
def normal_mode(tmp_path, monkeypatch):
    """Fresh state with the mode OFF (default behavior preserved)."""
    monkeypatch.setattr(mirror_script, 'SKIP_VIDEOS', False)
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path / 'mirror'))
    monkeypatch.setattr(mirror_script, 'PROGRESS_FILE', str(tmp_path / 'progress.json'))
    state = mirror_script.MirrorState()
    monkeypatch.setattr(mirror_script, 'mirror_state', state)
    return state


# ── Detection ────────────────────────────────────────────────────────────────

def test_extension_skip_makes_no_network_request(skip_mode):
    session = FakeSession()   # any request would raise
    url = f'{BASE}/gallery/videos/clip.mp4'
    result = mirror_script.download_and_process_media(url, session, referrer=f'{BASE}/gallery/show/1')
    assert result == mirror_script.SKIPPED_VIDEO
    assert session.requests == []
    rec = skip_mode.skipped_videos[mirror_script.normalize_url(url)]
    assert rec['detection'] == 'extension'
    assert rec['extension'] == '.mp4'
    assert rec['disposition'] == 'skipped_video'


def test_every_required_extension_is_recognized():
    for ext in ['.mp4', '.webm', '.mov', '.avi', '.mpeg', '.mpg', '.m4v', '.flv', '.wmv', '.ogv']:
        assert ext in mirror_script.VIDEO_EXTENSIONS, f'{ext} must be a recognized video extension'


def test_mime_skip_without_video_extension_never_reads_body(skip_mode):
    # A .jpg URL served as video/mp4: rejected from the streamed headers.
    url = f'{BASE}/gallery/media/disguised.jpg'
    resp = FakeResponse(url, content_type='video/mp4', content_length=123456, explode_on_body=True)
    session = FakeSession({url: resp})
    result = mirror_script.download_and_process_media(url, session, referrer=f'{BASE}/gallery/show/2')
    assert result == mirror_script.SKIPPED_VIDEO
    assert resp.closed is True
    rec = skip_mode.skipped_videos[mirror_script.normalize_url(url)]
    assert rec['detection'] == 'content-type'
    assert rec['content_type'] == 'video/mp4'
    assert rec['content_length'] == 123456


def test_html_page_with_video_in_url_is_not_classified_as_video(skip_mode):
    # Classification is extension/Content-Type based, never the word "video".
    page_url = f'{BASE}/video/list'
    assert mirror_script.get_extension(page_url) not in mirror_script.VIDEO_EXTENSIONS
    assert not mirror_script.is_video_file(page_url)
    # And fetch() passes an HTML response through untouched in skip mode.
    resp = FakeResponse(page_url, content_type='text/html', body=b'<html><body>video index</body></html>')
    monkey_session = FakeSession({page_url: resp})
    mirror_script.session = monkey_session
    got, final = mirror_script.fetch(page_url)
    assert got is resp
    assert mirror_script.normalize_url(page_url) not in skip_mode.skipped_videos


def test_fetch_rejects_video_content_type_before_body(skip_mode, monkeypatch):
    url = f'{BASE}/media/stream/12345'
    resp = FakeResponse(url, content_type='video/webm', content_length=999, explode_on_body=True)
    monkeypatch.setattr(mirror_script, 'session', FakeSession({url: resp}))
    got, final = mirror_script.fetch(url)
    assert got is None
    assert final == mirror_script.normalize_url(url)
    assert resp.closed is True
    rec = skip_mode.skipped_videos[mirror_script.normalize_url(url)]
    assert rec['detection'] == 'content-type'
    # A deliberate skip is not a failure.
    assert url not in skip_mode.failed_urls
    assert skip_mode.stats['failed_downloads'] == 0


# ── Page preservation and link representation ────────────────────────────────

PAGE_URL = f'{BASE}/gallery/show/42'
PAGE_HTML = f"""
<html><body>
  <h1>Big Trick Video</h1>
  <p>A caption describing the trick.</p>
  <video poster="/gallery/posters/42.jpg">
    <source src="/gallery/videos/42.mp4" type="video/mp4">
  </video>
  <a href="/gallery/videos/42.mp4">Download the clip</a>
  <img src="/gallery/thumbs/42_thumb.jpg">
</body></html>
"""


def _stub_media_downloads(monkeypatch, downloaded):
    """Route non-video media to a recording stub; keep real skip logic for videos."""
    real = mirror_script.download_and_process_media

    def stub(url, session, referrer=None, thumbnail_or_poster=False):
        if mirror_script.get_extension(url) in mirror_script.VIDEO_EXTENSIONS:
            return real(url, session, referrer=referrer, thumbnail_or_poster=thumbnail_or_poster)
        downloaded.append(url)
        local = Path(mirror_script.MIRROR_DIR) / 'www.footbag.org' / Path(url.split('footbag.org/')[-1])
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_bytes(b'x')
        return str(local)

    monkeypatch.setattr(mirror_script, 'download_and_process_media', stub)


def test_page_keeps_video_reference_and_captures_poster_and_thumbnail(skip_mode, monkeypatch):
    downloaded = []
    _stub_media_downloads(monkeypatch, downloaded)
    mirror_script.session = FakeSession()   # any video request would raise

    rewritten = mirror_script.rewrite_links(PAGE_HTML, PAGE_URL)

    # Poster and thumbnail still captured (non-video assets download normally).
    assert any(u.endswith('/gallery/posters/42.jpg') for u in downloaded)
    assert any(u.endswith('/gallery/thumbs/42_thumb.jpg') for u in downloaded)
    # The video reference keeps its ORIGINAL absolute URL; no local rewrite,
    # no "not available" destruction, and the caption text survives.
    assert f'{BASE}/gallery/videos/42.mp4' in rewritten
    assert 'skip-videos' in rewritten                 # the marker comment
    assert 'not available' not in rewritten
    assert 'A caption describing the trick.' in rewritten
    assert 'Download the clip' in rewritten
    # No link points at a nonexistent local video file.
    assert '42.mp4"' not in rewritten.replace(f'{BASE}/gallery/videos/42.mp4', '')
    # The skip landed in the manifest with the page as referrer.
    rec = skip_mode.skipped_videos[mirror_script.normalize_url(f'{BASE}/gallery/videos/42.mp4')]
    assert PAGE_URL in rec['referrers']
    assert rec['thumbnail_or_poster_captured'] is True


def test_non_video_files_still_download_normally(skip_mode, monkeypatch):
    url = f'{BASE}/gallery/docs/results.pdf'
    resp = FakeResponse(url, content_type='application/pdf', body=b'%PDF-1.4 data')
    session = FakeSession({url: resp})
    result = mirror_script.download_and_process_media(url, session, referrer=PAGE_URL)
    # PDFs are not in MEDIA_FORMATS' convertible set; the function downloads
    # and returns the local path unchanged.
    assert result is not None and result != mirror_script.SKIPPED_VIDEO
    assert Path(result).exists()
    assert session.requests == [url]


def test_mode_off_downloads_videos_as_before(normal_mode, monkeypatch):
    # Without --skip-videos the crawler still requests the binary. The fake
    # body is not a real video, so the pipeline may fail later; the point
    # pinned here is that the network request IS issued and nothing lands in
    # the skipped-video manifest.
    url = f'{BASE}/gallery/videos/legacy.mp4'
    resp = FakeResponse(url, content_type='video/mp4', body=b'not-a-real-video')
    session = FakeSession({url: resp})
    mirror_script.download_and_process_media(url, session, referrer=PAGE_URL)
    assert session.requests == [url]
    assert normal_mode.skipped_videos == {}


# ── Manifest ─────────────────────────────────────────────────────────────────

def test_manifest_dedupes_by_url_and_keeps_all_referrers(skip_mode):
    url = f'{BASE}/gallery/videos/one.mp4'
    session = FakeSession()
    mirror_script.download_and_process_media(url, session, referrer=f'{BASE}/page/b')
    mirror_script.download_and_process_media(url, session, referrer=f'{BASE}/page/a')
    assert len(skip_mode.skipped_videos) == 1
    rec = skip_mode.skipped_videos[mirror_script.normalize_url(url)]
    assert rec['referrers'] == [f'{BASE}/page/a', f'{BASE}/page/b']   # sorted
    assert skip_mode.stats['skipped_videos'] == 1


def test_manifest_files_are_deterministic_and_summarized(skip_mode):
    session = FakeSession()
    # Insert in reverse lexical order; the manifest must come out sorted.
    mirror_script.download_and_process_media(f'{BASE}/z/last.webm', session, referrer=f'{BASE}/events/show/9')
    mirror_script.download_and_process_media(f'{BASE}/a/first.mp4', session, referrer=f'{BASE}/gallery/show/1')
    skip_mode.write_skipped_video_manifest()

    manifest_path = Path(mirror_script.MIRROR_DIR) / mirror_script.SKIPPED_VIDEO_MANIFEST
    records = json.loads(manifest_path.read_text())
    urls = [r['normalized_url'] for r in records]
    assert urls == sorted(urls)
    assert all(r['disposition'] == 'skipped_video' for r in records)

    summary = (Path(mirror_script.MIRROR_DIR) / mirror_script.SKIPPED_VIDEO_SUMMARY).read_text()
    assert 'Total skipped video URLs: 2' in summary
    assert '.mp4: 1' in summary and '.webm: 1' in summary
    assert 'gallery: 1' in summary and 'events: 1' in summary   # referring site areas


# ── Restart / resume ─────────────────────────────────────────────────────────

def test_skips_survive_save_and_resume_without_refetch(skip_mode, tmp_path):
    url = f'{BASE}/gallery/videos/resume.mp4'
    session = FakeSession()
    mirror_script.download_and_process_media(url, session, referrer=PAGE_URL)
    skip_mode.save_progress()

    resumed = mirror_script.MirrorState()
    assert resumed.load_progress() is True
    norm = mirror_script.normalize_url(url)
    assert norm in resumed.skipped_videos
    assert resumed.skipped_videos[norm]['referrers'] == [PAGE_URL]

    # A re-sighting after resume is still zero-network and stays deduplicated.
    mirror_script.mirror_state = resumed
    result = mirror_script.download_and_process_media(url, session, referrer=f'{BASE}/page/new')
    assert result == mirror_script.SKIPPED_VIDEO
    assert session.requests == []
    assert len(resumed.skipped_videos) == 1
    assert len(resumed.skipped_videos[norm]['referrers']) == 2


def test_skipped_videos_are_never_failures(skip_mode):
    url = f'{BASE}/gallery/videos/notafailure.avi'
    mirror_script.download_and_process_media(url, FakeSession(), referrer=PAGE_URL)
    assert skip_mode.stats['failed_downloads'] == 0
    assert url not in skip_mode.failed_urls
    assert mirror_script.media_fail_key(url) not in skip_mode.failed_conversion_videos


def test_enqueue_never_admits_video_links_in_skip_mode(skip_mode, monkeypatch):
    # The crawl loop's enqueue guard records the discovery and spends zero
    # requests; exercised directly against the extension check it uses.
    link = f'{BASE}/gallery/videos/queued.mov'
    assert mirror_script.get_extension(link) in mirror_script.VIDEO_EXTENSIONS
    skip_mode.record_skipped_video(link, referrer=PAGE_URL, reason='extension')
    assert mirror_script.normalize_url(link) in skip_mode.skipped_videos


# ── State-path anchoring (restart from any CWD) ─────────────────────────────

def test_state_paths_are_anchored_to_the_script_directory():
    for value in (mirror_script.PROGRESS_FILE, mirror_script.ROBOTS_CACHE_FILE,
                  mirror_script.LOG_FILE, mirror_script.MIRROR_DIR):
        assert Path(value).is_absolute(), f'{value} must not depend on the process CWD'


# ── Session-expiry body detection ────────────────────────────────────────────

def test_login_form_body_is_detected_and_ordinary_pages_are_not():
    login_body = (b'<html><title>Member Sign-In</title><form name="loginform">'
                  b'<input name="MemberPassword" type="password"></form></html>')
    member_page = (b'<html><title>Member Profile</title><p>Change your password '
                   b'on the account page.</p></html>')
    assert mirror_script._looks_like_login_page_bytes(login_body) is True
    assert mirror_script._looks_like_login_page_bytes(member_page) is False

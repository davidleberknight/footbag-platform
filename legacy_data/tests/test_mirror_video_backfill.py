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
    python -m pytest legacy_data/tests/test_mirror_video_backfill.py -v
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
    assert outcomes == {'backfilled': 1, 'already_done': 0, 'failed': 0, 'refused': 0}
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

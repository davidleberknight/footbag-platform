"""Captures holding no markup, in create_mirror_footbag_org.py.

The oldest results on the site are plain fixed-width text files the server
handed over as-is, and the crawler stores one at the path its URL gives it,
which ends in a page name. Two things then go wrong. The file declares no
character set, because it has no markup to carry one, and the publish refuses a
tree holding a page that declares none. And a browser told the bytes are HTML
collapses every run of spaces, so a results table laid out in columns arrives
as one unbroken paragraph.

Wrapping is applied to a finished tree rather than at capture time: the bytes
are already stored, and re-fetching returns the same markup-free text.

All pure; no live-site access. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_plain_text_wrap.py -v
"""
import importlib.util
import sys
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_wrap', str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_wrap'] = mirror_script
spec.loader.exec_module(mirror_script)

RESULTS_TEXT = (
    '                        1994 WORLD FOOTBAG CHAMPIONSHIPS\n'
    '                        SAN FRANCISCO, CALIFORNIA     USA\n'
    '\n'
    'PLACE  NAME                     SCORE\n'
    '    1  A Competitor              12.5\n'
)


def test_a_capture_with_no_markup_is_recognized():
    assert mirror_script._looks_like_plain_text(RESULTS_TEXT.encode('utf-8'))


def test_a_page_with_markup_is_left_alone():
    assert not mirror_script._looks_like_plain_text(
        b'<html><body><p>Chapter 300 text.</p></body></html>')


def test_bytes_that_are_not_text_are_never_wrapped():
    # An image stored under a page name would otherwise read as markup-free and
    # be wrapped, turning the picture into escaped text inside a page.
    assert not mirror_script._looks_like_plain_text(b'\xff\xd8\xff\xe0\x00\x10JFIF\x00')


def test_a_capture_of_nothing_but_spacing_is_not_dressed_up_as_a_page():
    # The site returned this one empty. Wrapping it produces a blank page with a
    # title, which reads as preserved content and is not.
    assert not mirror_script._looks_like_plain_text('    \n'.encode('utf-8'))


def test_the_wrapper_declares_a_character_set_and_keeps_the_columns():
    out = mirror_script.wrap_plain_text_capture(RESULTS_TEXT, 'mens.overall.results')
    assert 'charset="UTF-8"' in out
    assert '<title>mens.overall.results</title>' in out
    assert '<pre>' in out
    # The column spacing is what makes a results table readable; it survives
    # verbatim inside the preformatted block.
    assert '    1  A Competitor              12.5' in out


def test_the_wrapper_escapes_text_that_would_read_as_markup():
    out = mirror_script.wrap_plain_text_capture('score < 10 & rising', 'x.results')
    assert '&lt; 10 &amp; rising' in out


def test_a_wrapped_capture_is_not_wrapped_again():
    out = mirror_script.wrap_plain_text_capture(RESULTS_TEXT, 'x.results')
    assert not mirror_script._looks_like_plain_text(out.encode('utf-8'))


def test_the_sweep_wraps_only_the_markup_free_capture(tmp_path, monkeypatch):
    www = tmp_path / 'www.footbag.org'
    (www / 'worlds94' / 'results' / 'wfg.results').mkdir(parents=True)
    (www / 'rules').mkdir(parents=True)
    plain = www / 'worlds94' / 'results' / 'wfg.results' / 'index.html'
    plain.write_text(RESULTS_TEXT, encoding='utf-8')
    marked_up = www / 'rules' / 'index.html'
    marked_up.write_text('<html><body><p>Chapter 300.</p></body></html>',
                         encoding='utf-8')
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path))

    wrapped = mirror_script.wrap_plain_text_captures()

    assert wrapped == ['worlds94/results/wfg.results/index.html']
    assert 'charset="UTF-8"' in plain.read_text(encoding='utf-8')
    assert marked_up.read_text(encoding='utf-8') == (
        '<html><body><p>Chapter 300.</p></body></html>')


def test_a_second_sweep_changes_nothing(tmp_path, monkeypatch):
    www = tmp_path / 'www.footbag.org' / 'worlds94' / 'results' / 'wfg.results'
    www.mkdir(parents=True)
    plain = www / 'index.html'
    plain.write_text(RESULTS_TEXT, encoding='utf-8')
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path))

    mirror_script.wrap_plain_text_captures()
    after_first = plain.read_text(encoding='utf-8')

    assert mirror_script.wrap_plain_text_captures() == []
    assert plain.read_text(encoding='utf-8') == after_first


def test_a_rehearsal_reports_without_writing(tmp_path, monkeypatch):
    www = tmp_path / 'www.footbag.org' / 'worlds94' / 'results' / 'wfg.results'
    www.mkdir(parents=True)
    plain = www / 'index.html'
    plain.write_text(RESULTS_TEXT, encoding='utf-8')
    monkeypatch.setattr(mirror_script, 'MIRROR_DIR', str(tmp_path))

    assert mirror_script.wrap_plain_text_captures(dry_run=True) == [
        'worlds94/results/wfg.results/index.html']
    assert plain.read_text(encoding='utf-8') == RESULTS_TEXT

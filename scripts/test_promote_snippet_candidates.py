#!/usr/bin/env python3
"""Unit tests for promote_snippet_candidates.py URL parsing.

Regression coverage for the YouTube Shorts normalization fix: /shorts/<id>
URLs must extract the same 11-char video id as ordinary watch?v= URLs, while
existing YouTube/Vimeo forms keep parsing and non-embeddable hosts (FootbagSpot)
still resolve to no platform.

Run directly: `python3 scripts/test_promote_snippet_candidates.py`.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from promote_snippet_candidates import (  # noqa: E402
    parse_youtube_id,
    parse_vimeo_id,
    detect_platform,
)

SHORTS_ID = "nLm3UtIzOc4"  # the approved `drifter` Shorts row


def test_youtube_watch_form():
    assert parse_youtube_id("https://www.youtube.com/watch?v=kUFtmVV38n4") == "kUFtmVV38n4"


def test_youtube_short_host():
    assert parse_youtube_id("https://youtu.be/kUFtmVV38n4") == "kUFtmVV38n4"


def test_youtube_embed_and_v_forms():
    assert parse_youtube_id("https://www.youtube.com/embed/kUFtmVV38n4") == "kUFtmVV38n4"
    assert parse_youtube_id("https://www.youtube.com/v/kUFtmVV38n4") == "kUFtmVV38n4"


def test_youtube_shorts_form():
    # the fix: /shorts/<id> extracts the same id as watch?v=
    assert parse_youtube_id(f"https://www.youtube.com/shorts/{SHORTS_ID}") == SHORTS_ID
    assert parse_youtube_id(f"https://youtube.com/shorts/{SHORTS_ID}") == SHORTS_ID


def test_vimeo_forms():
    assert parse_vimeo_id("https://vimeo.com/123456789") == "123456789"
    assert parse_vimeo_id("https://player.vimeo.com/video/123456789") == "123456789"


def test_detect_platform_routing():
    assert detect_platform(f"https://www.youtube.com/shorts/{SHORTS_ID}") == ("youtube", SHORTS_ID)
    assert detect_platform("https://vimeo.com/123456789") == ("vimeo", "123456789")
    # FootbagSpot / external hosts remain unembeddable (no external-link support here)
    assert detect_platform("https://footbagspot.com/tutorials/v/footbag-level-2-stalls") == (None, None)


def _run():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"PASS {fn.__name__}")
    print(f"\n{len(fns)} passed")


if __name__ == "__main__":
    _run()

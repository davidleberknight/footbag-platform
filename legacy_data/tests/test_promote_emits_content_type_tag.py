"""
test_promote_emits_content_type_tag.py
======================================

A promoted sidecar says what its clip is for, as one of the three content-type
tags, and it says so nowhere else.

The tags are the only categorisation a member sees, and the media-tag invariant
requires exactly one of them on every curated clip that names a trick. A
promotion that emitted none would therefore write a sidecar the reset gate
refuses; one that emitted a separate field beside the tag would give a reader
two places to find one answer, and nothing downstream reads the field.

The source is where the default comes from and never the last word: a curator
who knows a clip teaches, demonstrates or records something other than its
source's habit edits the tag. An unregistered source demonstrates, because
teaching is a positive claim and is made rather than assumed.

Run from repo root:
    python -m pytest legacy_data/tests/test_promote_emits_content_type_tag.py -v
"""
import importlib.util
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PROMOTE_PY = REPO_ROOT / "scripts" / "promote_snippet_candidates.py"

CONTENT_TYPE_TAGS = {"#tutorial", "#demo", "#record"}


def _load_promote_module():
    spec = importlib.util.spec_from_file_location("promote_snippet_candidates", PROMOTE_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_every_registered_source_maps_to_a_content_type_tag():
    mod = _load_promote_module()
    assert mod.CONTENT_TYPE_BY_SOURCE, "no source mapping to check"
    for source_id, tag in mod.CONTENT_TYPE_BY_SOURCE.items():
        assert tag in CONTENT_TYPE_TAGS, (
            f"source {source_id!r} maps to {tag!r}, which is not one of "
            f"{sorted(CONTENT_TYPE_TAGS)}; a tag outside the vocabulary reaches no "
            f"reader and fails the media-tag invariant"
        )


def test_a_record_source_and_a_tutorial_source_do_not_agree():
    # The mapping has to distinguish, or it is carrying no information.
    mod = _load_promote_module()
    assert mod.CONTENT_TYPE_BY_SOURCE["passback_records"] == "#record"
    assert mod.CONTENT_TYPE_BY_SOURCE["tt_youtube"] == "#tutorial"
    assert mod.CONTENT_TYPE_BY_SOURCE["passback_demos"] == "#demo"


def test_an_unregistered_source_demonstrates_rather_than_teaches():
    mod = _load_promote_module()
    assert mod.DEFAULT_CONTENT_TYPE == "#demo"
    assert mod.make_content_type_tag({"source_id": "a_source_nobody_registered"}) == "#demo"
    assert mod.make_content_type_tag({}) == "#demo"


def test_the_emitted_sidecar_carries_the_tag_and_no_tier_field():
    source = PROMOTE_PY.read_text(encoding="utf-8")
    # The sidecar literal is built in emit_sidecar; the tag goes into `tags`,
    # which is what the seeder loads and what every reader consults.
    assert 'make_content_type_tag(row)' in source
    assert '"tier"' not in source, (
        "the sidecar carries no tier field: nothing downstream reads one, and a "
        "second home for the same answer is how two surfaces come to disagree"
    )
    assert "TIER_BY_SOURCE" not in source

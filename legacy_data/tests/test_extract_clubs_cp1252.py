"""
The club extractor cleans every free-text field as it leaves the mirror page.

The legacy pages carry CP1252 punctuation that survives extraction as a C1
control: an apostrophe in "Canada's" arrives as U+0092, an em dash as U+0097.
A control is not a real character. It reaches the seed looking like text and
renders as nothing, and four descriptions in the published club seed carry one
today.

Cleaning at this boundary is also what keeps the two seed producers agreeing.
The dump-side producer already cleans the same fields, so a value cleaned on one
side only would depend on which producer ran last, and a mirror re-walk would
re-import the damage the other side had repaired.

Run from repo root:
    python -m pytest legacy_data/tests/test_extract_clubs_cp1252.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = REPO_ROOT / "legacy_data" / "scripts"


def _load(name: str):
    sys.path.insert(0, str(SCRIPTS))
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


ex = _load("extract_clubs")

PAGE = """<html><body>
<h1 class="clubsShowName">{name}</h1>
<div class="clubsLocationHeader">{city}, {region}, {country}</div>
<div class="clubsURL"><a href="{url}">site</a></div>
<div id="ClubsWelcome">{description}</div>
<div id="MainModified">Created Sun Jan 15 10:16:52 2012; last update Sun Jan 15 10:16:52 2012.</div>
</body></html>"""

DEFAULTS = {
    "name": "Toronto Footbag", "city": "Toronto", "region": "Ontario",
    "country": "Canada", "url": "http://example.org/", "description": "We play.",
}


def extract(tmp_path, **fields):
    """Run the extractor over one page built from the given field values."""
    path = tmp_path / "club.html"
    path.write_text(PAGE.format(**{**DEFAULTS, **fields}), encoding="utf-8")
    return ex.extract_club(str(path), "1246472708")


# ── the values that are damaged in the published seed today ──────────────────

def test_the_apostrophe_that_arrives_as_a_control_is_restored(tmp_path):
    # The exact shape carried by the damaged rows: CP1252 0x92, the right single
    # quotation mark, sitting in the description as U+0092.
    row = extract(tmp_path, description="One of Canada\x92s most consistent clubs.")
    assert row["description"] == "One of Canada’s most consistent clubs."


def test_the_em_dash_that_arrives_as_a_control_is_restored(tmp_path):
    row = extract(tmp_path, description="Do not let it fool you\x97we are all abilities.")
    assert row["description"] == "Do not let it fool you—we are all abilities."


# ── every free-text field the extractor produces ─────────────────────────────

@pytest.mark.parametrize("field,damaged,repaired", [
    ("name",        "St\x92s Footbag Club",      "St’s Footbag Club"),
    ("description", "I\x92m looking for players.", "I’m looking for players."),
    ("country",     "C\x92ote d Ivoire",          "C’ote d Ivoire"),
])
def test_each_free_text_field_is_cleaned(tmp_path, field, damaged, repaired):
    assert extract(tmp_path, **{field: damaged})[field] == repaired


def test_every_c1_control_cp1252_defines_is_repaired_in_every_field(tmp_path):
    # Stated over the whole range rather than over the two characters that failed
    # in production, because the next one will be a different byte.
    cc = _load("club_curation")
    survivors = set()
    for cp in range(0x80, 0xA0):
        row = extract(tmp_path, description=f"before{chr(cp)}after",
                      name=f"Club{chr(cp)}Name")
        for field, value in row.items():
            for c in str(value):
                if 0x80 <= ord(c) <= 0x9F:
                    survivors.add(ord(c))
                    assert chr(cp) not in cc._CP1252_FROM_C1, (
                        f"U+{cp:04X} is CP1252 punctuation and survived into "
                        f"{field}={value!r}")
    # The five positions CP1252 leaves undefined are the only ones that pass
    # through, and that is deliberate: there is no character to restore them to,
    # and inventing one would be worse than carrying the byte. Named here so the
    # seed-level gate this feeds is written knowing they exist.
    assert survivors == {0x81, 0x8D, 0x8F, 0x90, 0x9D}


# ── ordering, and what must not change ───────────────────────────────────────

def test_the_repair_and_the_contact_scrub_both_apply_to_one_description(tmp_path):
    # Cleaning and scrubbing compose: neither pass undoes the other's work on a
    # description that needs both.
    row = extract(tmp_path,
                  description="Reach us on 5551234567. Canada\x92s friendliest club.")
    assert "5551234567" not in row["description"]
    assert "Canada’s" in row["description"]


def test_a_numeric_escape_is_already_decoded_by_the_html_parser(tmp_path):
    # Worth pinning because it is the reason the decode half of the cleaner does
    # no work on this path, and therefore the reason the clean-then-scrub order
    # here is for consistency with the dump-side producer rather than for the
    # scrub's benefit. If the extractor ever stops parsing HTML, this changes.
    row = extract(tmp_path, description="Ampersand &#38; escape &#261; here.")
    assert "&#" not in row["description"]
    assert "ą" in row["description"]


def test_ordinary_text_is_returned_unchanged(tmp_path):
    row = extract(tmp_path, name="Toronto Footbag",
                  description="We meet on Tuesdays. Everyone welcome.")
    assert row["name"] == "Toronto Footbag"
    assert row["description"] == "We meet on Tuesdays. Everyone welcome."


def test_a_real_unicode_character_is_not_disturbed(tmp_path):
    row = extract(tmp_path, name="Kołobrzeg Footbag",
                  description="Gramy w żonglerkę.")
    assert row["name"] == "Kołobrzeg Footbag"
    assert row["description"] == "Gramy w żonglerkę."


# ── the two producers agree ──────────────────────────────────────────────────

def test_the_mirror_and_dump_producers_clean_a_damaged_value_identically(tmp_path):
    # The reason this belongs at the boundary rather than in each consumer: a
    # value cleaned on one side only depends on which producer ran last, and a
    # mirror re-walk would re-import what the other side had repaired.
    overlay = _load("overlay_clubs_from_dump")
    damaged = "One of Canada\x92s most consistent clubs."
    assert extract(tmp_path, description=damaged)["description"] == overlay._clean(damaged)

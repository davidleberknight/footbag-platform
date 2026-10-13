"""Codepage damage in club text.

A single CP1252 byte inside otherwise-correct text leaves a C1 control behind: a
code point that is an unassigned control in Unicode and printable punctuation in
CP1252. A club description with a working em dash turns into one when the text
has passed through the wrong codepage.

The shared cleaner must repair it and must not disturb text that is already
correct.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

_SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import club_curation as cc  # noqa: E402

# The exact failure, reproduced from the two byte sequences: a club description
# in its damaged form and as it should read.
DAMAGED = "fool youwe are all about casual fun"
INTACT = "fool you—we are all about casual fun"


# ── the bare CP1252 byte ─────────────────────────────────────────────────────

def test_the_em_dash_that_arrived_as_a_control_is_restored():
    assert cc.repair_cp1252_controls(DAMAGED) == INTACT


def test_the_shared_cleaner_repairs_it_so_every_consumer_sees_a_real_character():
    # The repair belongs at the boundary both producers already go through. If it
    # lived in only one of them, whichever ran last would decide.
    assert cc.clean_club_text(DAMAGED) == INTACT


@pytest.mark.parametrize("cp, expected", [
    (0x91, "‘"), (0x92, "’"),      # curly single quotes
    (0x93, "“"), (0x94, "”"),      # curly double quotes
    (0x96, "–"), (0x97, "—"),      # en and em dash
    (0x85, "…"),                        # ellipsis
])
def test_each_cp1252_punctuation_byte_is_restored(cp, expected):
    assert cc.repair_cp1252_controls(f"a{chr(cp)}b") == f"a{expected}b"


def test_a_code_point_cp1252_does_not_define_is_left_alone():
    # Five of the sixteen-times-two are genuinely undefined, so there is nothing
    # to restore them to and inventing something plausible would be worse.
    for cp in (0x81, 0x8D, 0x8F, 0x90, 0x9D):
        assert cc.repair_cp1252_controls(chr(cp)) == chr(cp)


def test_a_numeric_reference_naming_a_control_is_repaired_too():
    # Entities are decoded first, so a reference denoting a C1 code point becomes
    # a control the repair would otherwise have already walked past.
    assert cc.clean_club_text("fool you&#151;we are") == "fool you—we are"


# ── detection ────────────────────────────────────────────────────────────────

def test_damage_is_detected_across_the_whole_c1_range():
    for cp in range(0x80, 0xA0):
        assert cc.has_c1_controls(f"x{chr(cp)}y"), hex(cp)


def test_ordinary_text_is_not_reported_as_damaged():
    for good in (INTACT, "Nürnberg - Fürth", "Itabashi-ku, Tokyo", "",
                 "tab\tand\nnewline", " non-breaking space"):
        assert not cc.has_c1_controls(good), repr(good)


# ── nothing already correct is disturbed ─────────────────────────────────────

@pytest.mark.parametrize("text", [
    INTACT,
    "Nürnberg - Fürth",
    "Dexterity Dortmund e.V.",
    "Zła Krew",
    "‘quoted’ and “quoted”",
    "plain ascii",
    "",
])
def test_clean_unicode_is_returned_unchanged(text):
    assert cc.repair_cp1252_controls(text) == text


def test_the_cleaner_still_does_what_it_did_before():
    # Its other jobs are unchanged: trim, decode numeric references, settle CRLF.
    assert cc.clean_club_text("  padded  ") == "padded"
    assert cc.clean_club_text("Zi&#261;bek") == "Ziąbek"
    assert cc.clean_club_text("a\r\nb\rc") == "a\nb\nc"
    assert cc.clean_club_text(None) == ""


def test_the_region_placeholder_still_blanks():
    assert cc.blank_location_placeholder("none") == ""
    assert cc.blank_location_placeholder("Nowhere") == "Nowhere"


# ── the invariant the seed has to hold ───────────────────────────────────────

def test_no_c1_control_survives_the_cleaner_for_any_damaged_input():
    # The property the generated club seed depends on, stated over the whole
    # range rather than over the one character that failed in production.
    for cp in range(0x80, 0xA0):
        out = cc.clean_club_text(f"before{chr(cp)}after")
        if chr(cp) in cc._CP1252_FROM_C1:
            assert not cc.has_c1_controls(out), hex(cp)

"""Codepage damage in club text, and which source wins when only one carries it.

Two different things arrive damaged and only one of them is a round trip.

Whole-string mojibake is UTF-8 bytes stored after being read as a single-byte
codepage. It is reversible, and the overlay detects it by re-encoding and
re-decoding, which succeeds only for text that really carries that damage.

A single CP1252 byte inside otherwise-correct text is not reversible that way. It
fails the round trip, which is precisely why it used to pass through untouched,
and it leaves a C1 control behind: a code point that is an unassigned control in
Unicode and printable punctuation in CP1252. A club description with a working em
dash turned into one the moment that club's row started coming from the dump
instead of the mirror.

Both must be repaired, neither must disturb text that is already correct, and
where one source is damaged and another is not, the undamaged one wins.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

_SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import club_curation as cc  # noqa: E402

# The exact failure, reproduced from the two byte sequences rather than from the
# mirror: the description of the club whose row flipped source. The damaged form
# is what the dump yields, the intact form is what the mirror held.
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


# ── precedence: the undamaged source wins ────────────────────────────────────

def _overlay():
    import importlib.util
    path = _SCRIPTS / "overlay_clubs_from_dump.py"
    spec = importlib.util.spec_from_file_location("overlay_under_test", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_the_reversible_mojibake_repair_still_works():
    ov = _overlay()
    # 'Ã¼' is UTF-8 for 'ü' read as Latin-1: the reversible case, unchanged.
    assert ov._repaired_if_double_encoded("NÃ¼rnberg") == "Nürnberg"
    assert ov._repaired_if_double_encoded("Nürnberg") is None


def test_both_kinds_of_damage_are_recognised():
    ov = _overlay()
    assert ov._was_damaged("NÃ¼rnberg")     # reversible whole-string mojibake
    assert ov._was_damaged(DAMAGED)         # a bare CP1252 byte
    assert not ov._was_damaged(INTACT)
    assert not ov._was_damaged("Nürnberg")
    assert not ov._was_damaged("")


# Damage the repair deliberately cannot fix: 0x81 is one of the five code points
# CP1252 leaves undefined, so there is no character to restore it to. That makes
# it the honest probe for the preference itself — with a repairable byte both
# sides come out identical and the assertion would hold whether the preference
# ran or not.
UNREPAIRABLE = f"Zla{chr(0x81)} Krew"
CLEAN_ALTERNATIVE = "Zła Krew"


def test_an_intact_alternative_beats_a_damaged_primary():
    ov = _overlay()
    assert ov._prefer_undamaged(UNREPAIRABLE, CLEAN_ALTERNATIVE) == CLEAN_ALTERNATIVE


def test_a_damaged_alternative_does_not_displace_an_intact_primary():
    ov = _overlay()
    assert ov._prefer_undamaged(CLEAN_ALTERNATIVE, UNREPAIRABLE) == CLEAN_ALTERNATIVE


def test_the_bare_byte_case_reaches_the_preference_as_damage():
    # Stated on the decision rather than the output, because the repair would
    # otherwise make both branches produce the same string.
    ov = _overlay()
    assert ov._was_damaged(DAMAGED)
    assert ov._prefer_undamaged(DAMAGED, CLEAN_ALTERNATIVE) == CLEAN_ALTERNATIVE


def test_a_primary_still_wins_when_neither_is_damaged():
    # The preference is about damage, not about ranking the two columns.
    ov = _overlay()
    assert ov._prefer_undamaged("Primary Name", "Fallback Name") == "Primary Name"


def test_an_empty_primary_still_falls_back():
    ov = _overlay()
    assert ov._prefer_undamaged("", "Fallback Name") == "Fallback Name"


def test_a_damaged_primary_with_no_alternative_is_still_repaired():
    # Preference cannot help when there is nothing to prefer, so the repair in the
    # shared cleaner is what stops the control reaching the seed.
    ov = _overlay()
    assert ov._prefer_undamaged(DAMAGED, "") == INTACT


# ── the timestamp difference on the same source switch ───────────────────────

def test_the_overlay_renders_dump_timestamps_in_utc():
    """Pins a diagnosis rather than asserting a repair.

    The club whose description broke also had both its timestamps move back by
    exactly seven hours when its row switched source, and no other row moved. It
    is the same switch, but it is not this card's bug to fix, and the arithmetic
    is what shows why.

    The mirror extractor copies the site's own rendered "Created ...; last update
    ..." string. For that club the rendered value is one second past the minute
    that its own key encodes, and the key is itself a creation epoch: rendering
    the key as UTC lands within seconds of what the page says. The dump's Created
    column for the same club holds an epoch seven hours earlier in absolute terms,
    so the two sources disagree about the instant, not merely about how to display
    it.

    That means the conversion below is faithful: it renders what the dump stores.
    Neither value is damaged, and deciding which source is authoritative for a
    club's timestamps is a curation question rather than an encoding repair. The
    UTC choice is pinned here so a future change to it is deliberate.
    """
    ov = _overlay()
    # The club key 1779370908 is itself a creation epoch, and renders as
    # 13:41:48 UTC; the page shows 13:42:01, thirteen seconds later.
    assert ov._epoch_to_datetime_text("1779370908") == "Thu May 21 13:41:48 2026"
    assert ov._epoch_to_datetime_text("1779370921") == "Thu May 21 13:42:01 2026"
    # Seven hours earlier is what the dump's own column yields.
    assert ov._epoch_to_datetime_text("1779345721") == "Thu May 21 06:42:01 2026"
    assert ov._epoch_to_datetime_text("") == ""


# ── the invariant the seed has to hold ───────────────────────────────────────

def test_no_c1_control_survives_the_cleaner_for_any_damaged_input():
    # The property the generated club seed depends on, stated over the whole
    # range rather than over the one character that failed in production.
    for cp in range(0x80, 0xA0):
        out = cc.clean_club_text(f"before{chr(cp)}after")
        if chr(cp) in cc._CP1252_FROM_C1:
            assert not cc.has_c1_controls(out), hex(cp)

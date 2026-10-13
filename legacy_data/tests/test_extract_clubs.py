"""
test_extract_clubs.py
=====================

Pins the contact-PII sanitizer the club extractor applies to every mirror
description before it is written to the public seed CSV:

  - emails are always removed;
  - phone-shaped digit runs (7 to 14 digits) are removed;
  - year ranges, 15+-digit ids, and digits inside a URL are preserved;
  - descriptions with no contact PII are returned byte-for-byte unchanged, so
    the scrub only ever rewrites rows that actually carried contact data.

Run from repo root:
    python -m pytest legacy_data/tests/test_extract_clubs.py -v
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "legacy_data" / "scripts" / "extract_clubs.py"


def _load():
    spec = importlib.util.spec_from_file_location("extract_clubs", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


scrub = _load()._scrub_description_pii


# ─── emails ──────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "address",
    [
        "someone@gmail.com",
        "someone@footbag.org",
        "first.last98@hotmail.com",
        "info@frankfurtfootbag.de",
    ],
)
def test_email_of_any_provider_is_removed(address):
    out = scrub(f"reach me at {address} thanks")
    assert address not in out
    assert "@" not in out


def test_multiple_emails_in_prose_all_removed():
    text = "email tom at a@hotmail.com, or Nate at b@footbag.org. Other members..."
    out = scrub(text)
    assert "@" not in out
    assert "Other members" in out


# ─── phone numbers ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "phone",
    [
        "555-555-0100",
        "+1.555.555.0101",
        "(555)555-0102",
        "555) 555 0103",
        "012 345 67 89",
        "5555550106",
        "5555550107",
    ],
)
def test_phone_shaped_runs_are_removed(phone):
    out = scrub(f"call me on {phone} anytime")
    assert not any(ch.isdigit() for ch in out)
    assert "call me on" in out


def test_seven_digit_messenger_id_is_removed():
    # A Gadu-Gadu / messenger number is direct personal contact, the same class
    # as a phone, and falls in the 7 to 14 digit band.
    assert "5550104" not in scrub("gg: 5550104")


# ─── preserved digit runs ────────────────────────────────────────────────────


def test_year_range_is_preserved():
    text = "won every title from 2002 - 2008 here"
    assert scrub(text) == text


def test_long_group_id_is_preserved():
    text = "join our group 1069836389776285 now"
    assert "1069836389776285" in scrub(text)


def test_digits_inside_a_url_are_preserved():
    # A numeric URL path segment (e.g. a Facebook group id) must never be
    # mistaken for a phone number, or the link breaks.
    text = "see https://www.facebook.com/groups/2231084137/ for info"
    out = scrub(text)
    assert "https://www.facebook.com/groups/2231084137/" in out


def test_short_non_phone_numbers_are_preserved():
    text = "we have 10+ years and 4 regular players in 1998"
    assert scrub(text) == text


# ─── surgical contract ───────────────────────────────────────────────────────


def test_description_without_pii_is_returned_unchanged():
    # Pre-existing double spaces and odd spacing must survive untouched when
    # there is no PII to remove.
    text = "Welcome to the club!  We meet weekly.\n\nAll levels  welcome."
    assert scrub(text) == text


@pytest.mark.parametrize("empty", ["", None])
def test_empty_input_is_passed_through(empty):
    assert scrub(empty) == empty


def test_surrounding_text_survives_removal():
    text = "Contact Pat at pat@example.com or call 212-555-0199 today"
    out = scrub(text)
    assert "Contact Pat" in out and "today" in out
    assert "@" not in out and not any(ch.isdigit() for ch in out)


# ─── image addresses left by the crawler ─────────────────────────────────────

drop_images = _load()._drop_image_addresses


def test_a_logo_address_is_dropped_from_a_description():
    # A reader of the club page would otherwise see a bare image address as the
    # first words of the club's welcome text.
    assert drop_images("(http://www.footbag.at/fbv_logo.gif) SHOUT-OUTS") == "SHOUT-OUTS"
    assert drop_images("Erie Website (http://a.example/img/header.PNG) Footbag") == \
        "Erie Website Footbag"
    assert drop_images("Welcome (https://x.example/logo.jpg?v=2).") == "Welcome."


def test_a_link_address_is_kept():
    # A followable link is information; dropping it would lose the club's map.
    text = "View Larger Map (http://maps.example/ms?msid=1) and play"
    assert drop_images(text) == text


@pytest.mark.parametrize("empty", ["", None])
def test_no_description_stays_empty(empty):
    assert drop_images(empty) == empty


# ─── one-line fields ─────────────────────────────────────────────────────────


def test_doubled_spaces_in_name_and_place_collapse_and_description_keeps_its_own(tmp_path):
    # A club typed "Marathon  Footbag Club" would otherwise list and sort apart
    # from the same name typed once, and a region with a doubled space would not
    # group with its neighbours.
    page = tmp_path / "index.html"
    page.write_text(
        '<h1 class="clubsShowName">Marathon  Footbag  Club</h1>'
        '<div class="clubsLocationHeader">Caracas,  Distrito  Capital, Venezuela</div>'
        '<div id="ClubsWelcome">Welcome!  We meet weekly.</div>',
        encoding="utf-8")
    row = _load().extract_club(page, "123")
    assert row["name"] == "Marathon Footbag Club"
    assert row["city"] == "Caracas"
    assert row["region"] == "Distrito Capital"
    assert row["country"] == "Venezuela"
    assert row["description"] == "Welcome!  We meet weekly."

"""The member nameplate's address line never reaches the archive.

The legacy nameplate template renders a member's location as a label followed
by up to three values: the street address line, present only when the member
record carries one; then the city, with the region appended when it differs
from the country; then the country. The trailing two are always emitted, so the
count is what says whether an address is there, and a block of three is the
only shape in the whole capture that carries one.

That count is the whole rule. The label is not read, because the template
localizes it and the site serves sixteen languages, so a crawl in another
locale would slip past a label match. Nor is the value read: whether a line
looks like a street decides nothing, in either direction. A two-value block
provably holds no address, so its first value is a city and stays even when it
reads like a street; a three-value block holds one, so its first value goes
even when it reads like a place name.

The runtime redaction list stays what it is, a backstop for whatever the
structure misses. It is not what makes an address safe, and these tests run
with it unset.

All values below are invented. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_profile_address.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest
from bs4 import BeautifulSoup

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_profile_address',
                                              str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_profile_address'] = mirror_script
spec.loader.exec_module(mirror_script)

# Invented throughout. The street line is distinctive so a test can assert the
# whole archive output never carries it.
FIXTURE_STREET = '221B Fictional Mews, Flat 4'
FIXTURE_CITY = 'Nowhereton, Testshire'
FIXTURE_COUNTRY = 'Atlantis'


def _nameplate(container, *values, extra=''):
    lines = ''.join(f'<dd>{v}</dd>' for v in values)
    return (f'<div class="{container}"><dl>'
            f'{extra}'
            f'<dt>Location:</dt>{lines}'
            f'</dl></div>')


def _scrub(html):
    soup = BeautifulSoup(html, 'html.parser')
    removed = mirror_script.scrub_nameplate_address_line(soup)
    return soup, removed


def _values(soup):
    return [dd.get_text(' ', strip=True) for dd in soup.find_all('dd')]


# ── the three-value block, which is the one carrying an address ──────────────

@pytest.mark.parametrize('container', ['membersNameplateEnd', 'membersMiniNameplate'])
def test_the_address_line_is_removed_and_the_place_lines_stay(container):
    # Both containers matter: a full profile page renders the block inside
    # membersNameplateEnd, and the same nameplate embedded on an event page for
    # its organizer renders it inside membersMiniNameplate, which the template
    # emits instead when it is drawing the short form.
    soup, removed = _scrub(_nameplate(container, FIXTURE_STREET,
                                      FIXTURE_CITY, FIXTURE_COUNTRY))
    assert removed == 1
    assert _values(soup) == [FIXTURE_CITY, FIXTURE_COUNTRY]


def test_an_address_line_that_reads_like_a_place_name_is_still_removed():
    """Position decides, not appearance.

    A member whose address line is 'Rose Cottage' carries an address as much as
    one whose line has a house number in it. The template put it in the address
    slot; nothing about how it reads changes that, and a lexical test would
    have left this one in the archive.
    """
    soup, removed = _scrub(_nameplate('membersNameplateEnd', 'Rose Cottage',
                                      FIXTURE_CITY, FIXTURE_COUNTRY))
    assert removed == 1
    assert _values(soup) == [FIXTURE_CITY, FIXTURE_COUNTRY]


def test_an_empty_address_line_still_counts_as_the_address_slot():
    # A blank value is still a rendered element, and the count is what the rule
    # reads. Filtering blanks first would misread this block as a two-value one
    # and leave the slot in place.
    soup, removed = _scrub(_nameplate('membersNameplateEnd', '',
                                      FIXTURE_CITY, FIXTURE_COUNTRY))
    assert removed == 1
    assert _values(soup) == [FIXTURE_CITY, FIXTURE_COUNTRY]


def test_the_removed_line_leaves_a_marker_saying_what_happened():
    soup, _removed = _scrub(_nameplate('membersNameplateEnd', FIXTURE_STREET,
                                       FIXTURE_CITY, FIXTURE_COUNTRY))
    assert 'Mirror: member address line removed' in str(soup)


def test_the_fixture_address_is_nowhere_in_the_output():
    soup, _removed = _scrub(_nameplate('membersNameplateEnd', FIXTURE_STREET,
                                       FIXTURE_CITY, FIXTURE_COUNTRY))
    assert FIXTURE_STREET not in str(soup)
    assert '221B' not in str(soup)


# ── the two-value block, which carries none ─────────────────────────────────

def test_a_city_and_country_block_is_left_alone():
    soup, removed = _scrub(_nameplate('membersNameplateEnd',
                                      FIXTURE_CITY, FIXTURE_COUNTRY))
    assert removed == 0
    assert _values(soup) == [FIXTURE_CITY, FIXTURE_COUNTRY]


def test_a_city_that_reads_like_a_street_is_still_a_city():
    """The counterpart to the place-name case above, and the reason there is no
    lexical test anywhere in this rule.

    The template emits the address line only when the member record holds one,
    so a block of two values has no address slot at all and both values are the
    place. Some members typed street-like text into the city field itself;
    that is a problem with the source data, and suppressing a city here on the
    strength of how it reads would delete a place name to solve it.
    """
    soup, removed = _scrub(_nameplate('membersNameplateEnd',
                                      '12 Invented Road', 'Atlantis'))
    assert removed == 0
    assert _values(soup) == ['12 Invented Road', 'Atlantis']


# ── everything else on the page ─────────────────────────────────────────────

def test_the_phone_field_and_other_labels_are_untouched():
    # The phone label carries no values of its own, so the count leaves it
    # alone. It is a separate surface with its own decision to make.
    extra = ('<dt><nobr>Phone: 555-0100</nobr></dt>'
             '<dt>E-mail:</dt>')
    soup, removed = _scrub(_nameplate('membersNameplateEnd', FIXTURE_STREET,
                                      FIXTURE_CITY, FIXTURE_COUNTRY, extra=extra))
    assert removed == 1
    text = soup.get_text(' ', strip=True)
    assert 'Phone: 555-0100' in text
    assert 'E-mail:' in text


def test_a_three_value_field_outside_a_nameplate_is_not_touched():
    """The scrub is scoped to the nameplate containers on purpose.

    Elsewhere on a page a label followed by three values is ordinary content,
    and the membership-status field inside the outer nameplate can carry
    several values of its own. Only the two containers the template puts the
    location block in are in scope.
    """
    html = ('<div class="eventsBody"><dl>'
            '<dt>Schedule:</dt><dd>Friday</dd><dd>Saturday</dd><dd>Sunday</dd>'
            '</dl></div>')
    soup, removed = _scrub(html)
    assert removed == 0
    assert _values(soup) == ['Friday', 'Saturday', 'Sunday']


def test_the_membership_status_field_in_the_outer_nameplate_survives():
    # This is why the outer container is not the scope: the status field sits
    # there and can render three values of its own.
    html = ('<div class="membersProfileNameplate"><dl>'
            '<dt>IFPA Membership Status:</dt>'
            '<dd>Tier 2</dd><dd>Expires: soon</dd><dd>Upgrade now</dd>'
            '</dl></div>')
    soup, removed = _scrub(html)
    assert removed == 0
    assert len(_values(soup)) == 3


def test_a_block_with_more_values_than_the_template_emits_is_left_for_review():
    # Four values is not a shape this template produces. Guessing which one is
    # the address would be inventing a rule; leaving it means a template change
    # shows up as an unscrubbed block rather than as silently deleted content.
    soup, removed = _scrub(_nameplate('membersNameplateEnd', 'a', 'b', 'c', 'd'))
    assert removed == 0
    assert _values(soup) == ['a', 'b', 'c', 'd']


# ── the runtime redaction list is not what makes this safe ──────────────────

def test_the_address_goes_with_the_redaction_list_unset(monkeypatch):
    monkeypatch.setattr(mirror_script, 'ACCOUNT_REDACTIONS', [])
    monkeypatch.setattr(mirror_script, 'ACCOUNT_EMAIL', None)
    soup, removed = _scrub(_nameplate('membersNameplateEnd', FIXTURE_STREET,
                                      FIXTURE_CITY, FIXTURE_COUNTRY))
    assert removed == 1
    assert FIXTURE_STREET not in str(soup)


def test_the_runtime_backstop_still_works_as_it_did(monkeypatch):
    # Unchanged behaviour, pinned here because this slice is the one that could
    # have been tempted to lean on it instead.
    monkeypatch.setattr(mirror_script, 'ACCOUNT_REDACTIONS', ['Fictional Mews'])
    monkeypatch.setattr(mirror_script, 'ACCOUNT_EMAIL', None)
    assert mirror_script.page_carries_account_identity('a Fictional Mews b')
    assert 'Fictional Mews' not in mirror_script.redact_account_identity(
        'a Fictional Mews b')
    # The run of whitespace between the words is bridged, which is how a value
    # the template wrapped mid-line still matches.
    assert mirror_script.page_carries_account_identity('a Fictional\n  Mews b')

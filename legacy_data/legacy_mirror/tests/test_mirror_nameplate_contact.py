"""The nameplate never carries a way of contacting a member into the archive.

The legacy nameplate prints three kinds of contact value, each in its own
markup and none of them in a sibling value element the way the address line is:
a phone number inside a no-break element that also holds its own label; an
e-mail address, and the site's own forwarding alias, both through one shared
helper that wraps them in a teletype element; and a social profile as an
anchor carrying a profile target attribute.

The rule reads that markup and nothing else. Not the label, because the
template localizes it and the site serves sixteen languages, so a crawl in
another language would walk straight past a word match. And not the value: in
particular the forwarding alias is removed exactly as a personal address is,
without anyone inspecting the domain, because the helper emits both the same
way and because an address that reaches the member is a way of contacting them
whoever issued it.

What is left alone is the label itself, so the page still reads as a
nameplate, and the status a member's record carries when their address is
marked invalid: the template prints a word there instead of an address, so
there is nothing to remove.

All values below are invented. Run from repo root:
    python -m pytest legacy_data/legacy_mirror/tests/test_mirror_nameplate_contact.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest
from bs4 import BeautifulSoup

SCRIPT_PATH = Path(__file__).resolve().parent.parent / 'create_mirror_footbag_org.py'
spec = importlib.util.spec_from_file_location('mirror_script_nameplate_contact',
                                              str(SCRIPT_PATH))
mirror_script = importlib.util.module_from_spec(spec)
sys.modules['mirror_script_nameplate_contact'] = mirror_script
spec.loader.exec_module(mirror_script)

# Invented throughout, and distinctive enough that a test can assert the whole
# rendered page never carries them.
FIXTURE_PHONE = '555-0173-INVENTED'
FIXTURE_EMAIL = 'nobody@example-invented.test'
FIXTURE_ALIAS = 'nobody@footbag.org'
FIXTURE_SECOND = 'second@example-invented.test'
FIXTURE_SOCIAL_ID = '9990001112223334'


def _box(inner, container='membersNameplateEnd'):
    return f'<div class="{container}"><dl>{inner}</dl></div>'


def _scrub(html):
    soup = BeautifulSoup(html, 'html.parser')
    removed = mirror_script.scrub_nameplate_contact_values(soup)
    return soup, removed


# ── the three shapes a contact value arrives in ─────────────────────────────

@pytest.mark.parametrize('container', ['membersNameplateEnd', 'membersMiniNameplate'])
def test_a_phone_number_goes_and_its_label_stays(container):
    # The label sits inside the same element as the number here, so the value
    # has to be taken out from around it rather than the element dropped.
    soup, removed = _scrub(_box(
        f'<dt><nobr>Phone: {FIXTURE_PHONE}</nobr></dt>', container))
    assert removed == 1
    text = soup.get_text(' ', strip=True)
    assert FIXTURE_PHONE not in str(soup)
    assert 'Phone' in text


@pytest.mark.parametrize('container', ['membersNameplateEnd', 'membersMiniNameplate'])
def test_a_personal_address_goes_and_its_label_stays(container):
    soup, removed = _scrub(_box(
        f'<dt>E-mail: <tt>{FIXTURE_EMAIL}</tt></dt>', container))
    assert removed == 1
    assert FIXTURE_EMAIL not in str(soup)
    assert 'E-mail' in soup.get_text(' ', strip=True)


def test_the_sites_own_forwarding_alias_goes_the_same_way():
    """The decision this test exists to pin.

    The helper emits a forwarding alias and a personal address identically, so
    the markup cannot tell them apart, and nothing here tries to: no domain is
    read. An address that reaches the member is a way of contacting them
    whoever issued it, and whether those mailboxes keep existing is a separate
    question that does not license republishing them.
    """
    soup, removed = _scrub(_box(f'<dt>Alias: <tt>{FIXTURE_ALIAS}</tt></dt>'))
    assert removed == 1
    assert FIXTURE_ALIAS not in str(soup)
    assert 'footbag.org' not in str(soup)


def test_every_address_in_one_label_goes():
    soup, removed = _scrub(_box(
        f'<dt>E-mail: <tt>{FIXTURE_EMAIL}</tt> <tt>{FIXTURE_SECOND}</tt></dt>'))
    assert removed == 2
    assert FIXTURE_EMAIL not in str(soup)
    assert FIXTURE_SECOND not in str(soup)


def test_a_social_profile_destination_goes():
    # Keyed on the profile target attribute the template writes, so neither the
    # word "Facebook" nor the destination address decides this.
    soup, removed = _scrub(_box(
        f'<dt>Facebook: <a target="_fbProfile_{FIXTURE_SOCIAL_ID}" '
        f'href="http://www.example-invented.test/{FIXTURE_SOCIAL_ID}">A Name</a></dt>'))
    assert removed == 1
    assert FIXTURE_SOCIAL_ID not in str(soup)
    assert 'A Name' not in str(soup)
    assert 'Facebook' in soup.get_text(' ', strip=True)


# ── what is deliberately left alone ─────────────────────────────────────────

def test_an_invalid_address_status_survives_because_it_is_not_an_address():
    # The template prints a word here in place of the address, so there is no
    # contact value present and nothing for this rule to do.
    soup, removed = _scrub(_box('<dt>E-mail: not valid</dt>'))
    assert removed == 0
    assert 'not valid' in soup.get_text(' ', strip=True)


def test_the_location_label_and_its_values_are_untouched():
    # The address line is a different rule's business and must stay that way.
    soup, removed = _scrub(_box(
        '<dt>Location:</dt><dd>Somewhere</dd><dd>Atlantis</dd>'))
    assert removed == 0
    assert [dd.get_text(strip=True) for dd in soup.find_all('dd')] == \
        ['Somewhere', 'Atlantis']


def test_the_same_markup_outside_a_nameplate_is_untouched():
    """Scope is the nameplate containers, not the markup anywhere on a page.

    A no-break element and a teletype element are ordinary formatting the
    legacy pages use for results tables and notation; a rule that took them
    site-wide would strip content that is not contact information at all.
    """
    html = ('<div class="eventsBody"><dl>'
            f'<dt><nobr>Round: 3</nobr></dt>'
            f'<dt>Notation: <tt>TOE + CLIP</tt></dt>'
            '</dl></div>')
    soup, removed = _scrub(html)
    assert removed == 0
    assert 'TOE + CLIP' in soup.get_text(' ', strip=True)
    assert 'Round: 3' in soup.get_text(' ', strip=True)


def test_an_ordinary_link_in_a_nameplate_is_untouched():
    # Only the profile target attribute marks a social destination. An anchor
    # without it is not one, and nothing here reads its address to guess.
    soup, removed = _scrub(_box(
        '<dt>Profile: <a href="/members/profile/someone">View</a></dt>'))
    assert removed == 0
    assert soup.find('a') is not None


# ── independence from language and from runtime configuration ───────────────

def test_a_label_in_another_language_changes_nothing():
    # The same three shapes, none of the English words. The site serves
    # sixteen languages and a crawl in any of them must scrub identically.
    soup, removed = _scrub(_box(
        f'<dt><nobr>Teléfono: {FIXTURE_PHONE}</nobr></dt>'
        f'<dt>Correo electrónico: <tt>{FIXTURE_EMAIL}</tt></dt>'))
    assert removed == 2
    assert FIXTURE_PHONE not in str(soup)
    assert FIXTURE_EMAIL not in str(soup)
    assert 'Teléfono' in soup.get_text(' ', strip=True)


def test_the_values_go_with_the_redaction_list_unset(monkeypatch):
    monkeypatch.setattr(mirror_script, 'ACCOUNT_REDACTIONS', [])
    monkeypatch.setattr(mirror_script, 'ACCOUNT_EMAIL', None)
    soup, removed = _scrub(_box(
        f'<dt><nobr>Phone: {FIXTURE_PHONE}</nobr></dt>'
        f'<dt>E-mail: <tt>{FIXTURE_EMAIL}</tt></dt>'))
    assert removed == 2
    assert FIXTURE_PHONE not in str(soup)
    assert FIXTURE_EMAIL not in str(soup)


def test_the_address_line_rule_is_unchanged():
    # This slice must not disturb the rule that removes the street line.
    soup = BeautifulSoup(_box(
        '<dt>Location:</dt><dd>12 Invented Way</dd>'
        '<dd>Nowhereton</dd><dd>Atlantis</dd>'), 'html.parser')
    assert mirror_script.scrub_nameplate_address_line(soup) == 1
    assert [dd.get_text(strip=True) for dd in soup.find_all('dd')] == \
        ['Nowhereton', 'Atlantis']


def test_a_removed_value_leaves_a_marker_saying_what_happened():
    soup, _removed = _scrub(_box(f'<dt>E-mail: <tt>{FIXTURE_EMAIL}</tt></dt>'))
    assert 'Mirror: member contact value removed' in str(soup)


# ── every container the template can open ───────────────────────────────────

@pytest.mark.parametrize('container', [
    'membersNameplate',
    'membersProfileNameplate',
    'membersMiniNameplate',
    'membersMultiNameplate',
    'membersNameplateEnd',
])
def test_every_nameplate_form_is_covered(container):
    """The outer nameplate carries most of them, not the end block.

    The template opens an outer nameplate whose class varies with the form it
    is drawing and nests an end block inside it. Addresses and the social
    profile print into the outer one, the phone into the end block, so a rule
    scoped to the end block alone would reach a small fraction of the values.
    """
    soup, removed = _scrub(_box(
        f'<dt>E-mail: <tt>{FIXTURE_EMAIL}</tt></dt>'
        f'<dt><nobr>Phone: {FIXTURE_PHONE}</nobr></dt>', container))
    assert removed == 2
    assert FIXTURE_EMAIL not in str(soup)
    assert FIXTURE_PHONE not in str(soup)


def test_a_nested_end_block_counts_its_values_once():
    # The end block is inside the outer nameplate, so its labels belong to two
    # containers; each value is still one value.
    html = ('<div class="membersProfileNameplate"><dl>'
            f'<dt>E-mail: <tt>{FIXTURE_EMAIL}</tt></dt>'
            '</dl>'
            '<div class="membersNameplateEnd"><dl>'
            f'<dt><nobr>Phone: {FIXTURE_PHONE}</nobr></dt>'
            '</dl></div></div>')
    soup, removed = _scrub(html)
    assert removed == 2
    assert FIXTURE_EMAIL not in str(soup)
    assert FIXTURE_PHONE not in str(soup)

"""Member baseline / delta / redacted-curation-queue tool.

Covers: profile discovery + manifest build, the new/changed/unchanged/missing
delta, identity dedup (high-confidence dump-id link, single-name probable match,
multi-name ambiguity, genuinely new), and the privacy guarantee that email /
phone / street-address values from a profile page never reach the curation queue.

All offline and synthetic. No real credential, no real personal data, no live DB.

Run from repo root:
    python -m pytest legacy_data/tests/test_build_member_delta_queue.py -v
"""
import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = (Path(__file__).resolve().parent.parent
               / 'scripts' / 'build_member_delta_queue.py')
spec = importlib.util.spec_from_file_location('build_member_delta_queue', str(SCRIPT_PATH))
tool = importlib.util.module_from_spec(spec)
sys.modules['build_member_delta_queue'] = tool
spec.loader.exec_module(tool)


# A profile page that DOES contain private contact fields (email + address), to
# prove they are never extracted. Values are obvious fixtures.
PROFILE_HTML = """<html><head>
<title>Footbag WorldWide Member Services: Member Profile for TestPlayer</title>
</head><body>
<span class="membersProfileName">Test Player</span>
<table>
 <tr><td>City</td><td>Portland</td></tr>
 <tr><td>Country</td><td>United States</td></tr>
 <tr><td>E-mail</td><td>secret.person@example.com</td></tr>
 <tr><td>Address</td><td>123 Private Street</td></tr>
</table>
<a href="/clubs/show/500">Rose City Footbag</a>
<p>Hall of Fame inductee 2010.</p>
</body></html>"""


def _write_profile(root: Path, member_id: str, html: str = PROFILE_HTML):
    p = root / 'www.footbag.org' / 'members' / 'profile' / member_id / 'index.html'
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(html, encoding='utf-8')
    return p


# ── parsing + redaction of a single profile ──────────────────────────────────

def test_parse_profile_extracts_safe_fields_and_never_private_ones():
    parsed = tool.parse_profile(PROFILE_HTML)
    assert parsed['display_name'] == 'Test Player'
    assert parsed['city'] == 'Portland'
    assert parsed['country'] == 'United States'
    assert parsed['clubs'] == [{'club_id': '500', 'name': 'Rose City Footbag'}]
    assert 'hall_of_fame_mentioned' in parsed['honor_evidence']
    assert parsed['private_fields_present_on_page'] is True
    # No key or value carries the email or street address.
    blob = repr(parsed).lower()
    assert 'secret.person@example.com' not in blob
    assert '123 private street' not in blob
    assert 'e-mail' not in parsed and 'address' not in parsed


# ── manifest build ───────────────────────────────────────────────────────────

def test_build_manifest_discovers_profiles_and_is_deterministic(tmp_path):
    _write_profile(tmp_path, '11985')
    _write_profile(tmp_path, '83156')
    _write_profile(tmp_path, 'DLeberknight')
    m = tool.build_manifest(str(tmp_path))
    assert m['profile_count'] == 3
    ids = [r['member_id'] for r in m['profiles']]
    assert ids == ['11985', '83156', 'DLeberknight']   # numeric first, sorted
    r = m['profiles'][0]
    assert r['is_dump_member_id'] is True
    assert r['archived_url'] == 'http://www.footbag.org/members/profile/11985/'
    assert r['source_host'] == 'www.footbag.org'
    assert len(r['content_hash']) == 64
    # A username id is flagged as not a dump id.
    assert m['profiles'][2]['is_dump_member_id'] is False


# ── delta ────────────────────────────────────────────────────────────────────

def test_compute_delta_classifies_new_changed_unchanged_missing(tmp_path):
    _write_profile(tmp_path, '1')
    _write_profile(tmp_path, '2')
    baseline = tool.build_manifest(str(tmp_path))

    # After a crawl: 1 unchanged, 2 changed, 3 new; (2 stays, add 3, edit 2, drop nothing)
    _write_profile(tmp_path, '2', PROFILE_HTML.replace('Test Player', 'Edited Name'))
    _write_profile(tmp_path, '3')
    current = tool.build_manifest(str(tmp_path))

    delta = tool.compute_delta(baseline, current)
    assert [r['member_id'] for r in delta['new']] == ['3']
    assert [r['member_id'] for r in delta['changed']] == ['2']
    assert [r['member_id'] for r in delta['unchanged']] == ['1']
    assert delta['missing'] == []

    # Now simulate a profile that disappeared from a later crawl.
    delta2 = tool.compute_delta(current, baseline)
    assert [r['member_id'] for r in delta2['missing']] == ['3']


# ── identity dedup / ambiguity ───────────────────────────────────────────────

def _identities():
    legacy = [
        {'legacy_member_id': '11985', 'display_name': 'Known Player',
         'display_name_normalized': 'known player', 'claimed_by_member_id': None},
        {'legacy_member_id': '700', 'display_name': 'Common Name',
         'display_name_normalized': 'common name', 'claimed_by_member_id': None},
        {'legacy_member_id': '701', 'display_name': 'Common Name',
         'display_name_normalized': 'common name', 'claimed_by_member_id': None},
    ]
    persons = [
        {'person_id': 'p1', 'legacy_member_id': '11985', 'display_name': 'Known Player',
         'display_name_normalized': 'known player'},
        {'person_id': 'p2', 'legacy_member_id': None, 'display_name': 'Solo Match',
         'display_name_normalized': 'solo match'},
    ]
    members = []
    return tool.build_identity_index(legacy, persons, members)


def test_match_identity_high_confidence_on_dump_id():
    idx = _identities()
    rec = {'member_id': '11985', 'is_dump_member_id': True, 'normalized_name': 'known player'}
    m = tool.match_identity(rec, idx)
    assert m['confidence'] == 'high'
    assert m['recommended_action'] == 'link-to-existing-identity'
    assert any(c.get('legacy_member_id') == '11985' for c in m['existing_candidates'])


def test_match_identity_single_name_is_probable_review():
    idx = _identities()
    rec = {'member_id': '99999', 'is_dump_member_id': True, 'normalized_name': 'solo match'}
    m = tool.match_identity(rec, idx)
    assert m['confidence'] == 'medium'
    assert m['recommended_action'] == 'human-review-probable-name-match'


def test_match_identity_multi_name_is_ambiguous():
    idx = _identities()
    rec = {'member_id': '99998', 'is_dump_member_id': True, 'normalized_name': 'common name'}
    m = tool.match_identity(rec, idx)
    assert m['confidence'] == 'low'
    assert m['recommended_action'] == 'human-review-ambiguous'
    assert len(m['existing_candidates']) == 2


def test_match_identity_new_person_when_no_match():
    idx = _identities()
    rec = {'member_id': '4242', 'is_dump_member_id': True, 'normalized_name': 'nobody here'}
    m = tool.match_identity(rec, idx)
    assert m['confidence'] == 'none'
    assert m['recommended_action'] == 'human-review-new-person'
    assert m['existing_candidates'] == []


# ── curation queue redaction (the privacy guarantee) ─────────────────────────

def test_curation_queue_excludes_all_private_values(tmp_path):
    # A brand-new profile page carrying an email + street address must produce a
    # queue row with the safe fields and NONE of the private values.
    _write_profile(tmp_path, '4242')
    current = tool.build_manifest(str(tmp_path))
    delta = tool.compute_delta({'profiles': []}, current)   # everything is new
    queue = tool.build_curation_queue(delta, _identities())

    assert len(queue) == 1
    row = queue[0]
    blob = repr(row).lower()
    assert 'secret.person@example.com' not in blob
    assert '123 private street' not in blob
    # Only allowlisted fields are present.
    assert set(row).issubset(tool.ALLOWED_QUEUE_FIELDS)
    # Safe curation fields survived.
    assert row['captured_display_name'] == 'Test Player'
    assert row['country'] == 'United States'
    assert row['club_relationships'] == [{'club_id': '500', 'name': 'Rose City Footbag'}]
    assert row['recommended_action'] == 'human-review-new-person'


def test_redact_queue_row_drops_unlisted_fields():
    row = tool.redact_queue_row({
        'captured_display_name': 'X', 'email': 'nope@example.com',
        'street_address': '1 Nowhere', 'confidence': 'none'})
    assert row == {'captured_display_name': 'X', 'confidence': 'none'}

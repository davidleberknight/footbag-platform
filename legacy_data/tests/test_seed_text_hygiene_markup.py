"""Seed text hygiene: HTML markup left in a committed seed value.

The legacy site let members write HTML into a club description and rendered it.
This platform escapes description text instead, so a tag that survives into the
seed is shown to every visitor as literal markup rather than as formatting. Three
club descriptions reached the database that way, one of them an entire subscribe
widget with a table and a form inside it.

What is pinned here is the line between markup and text that merely uses angle
brackets, because the check is worthless in both directions if it cannot hold it:
a real element name inside a tag is damage, and one club's own name written as
`<<<<<<<<LeGo FoOtBaG Club>>>>>>>>` is not. The whitelist is what draws that line,
so the false-positive cases matter as much as the true ones.

All offline and synthetic.

Run from repo root:
    python -m pytest legacy_data/tests/test_seed_text_hygiene_markup.py -v
"""
import importlib.util
import sys
from pathlib import Path

SCRIPT_PATH = (Path(__file__).resolve().parent.parent
               / 'pipeline' / 'qc' / 'check_seed_text_hygiene.py')
spec = importlib.util.spec_from_file_location('check_seed_text_hygiene', str(SCRIPT_PATH))
qc = importlib.util.module_from_spec(spec)
sys.modules['check_seed_text_hygiene'] = qc
spec.loader.exec_module(qc)


def first_tag(value: str) -> str | None:
    """The tag the check would report, or None when it sees no markup."""
    match = qc._HTML_TAG_RE.search(value)
    return match.group(0) if match else None


class TestMarkupIsCaught:
    def test_paragraph_tag(self):
        # The commonest shape: a legacy description written in paragraphs.
        assert first_tag('<p>Hi all the footbaggers out there.</p>') == '<p>'

    def test_unclosed_paragraph_used_as_a_separator(self):
        # Legacy authors used a bare <p> as a line break, never closing it.
        assert first_tag('4 square.<p>\nCurrently we have 3 shredders.') == '<p>'

    def test_anchor_with_attributes(self):
        value = 'Tourism in Lucerne <a href="http://example.org/x?">here</a>'
        assert first_tag(value) == '<a href="http://example.org/x?">'

    def test_table_opening_the_subscribe_widget(self):
        # The worst real case, reduced: the tag carries unquoted attributes.
        value = 'please visit our listserv.\n\n<table border=0 cellspacing=0>\n<tr><td>'
        assert first_tag(value) == '<table border=0 cellspacing=0>'

    def test_closing_tag_alone(self):
        assert first_tag('trailing text</div>') == '</div>'

    def test_void_element(self):
        assert first_tag('line one<br>line two') == '<br>'


class TestTextThatMerelyUsesAngleBrackets:
    def test_ascii_art_club_name_is_not_markup(self):
        # A real club writes its own name this way. Flagging it would send a
        # maintainer to "repair" correct member-authored text.
        value = ('<<<<<<<<<<<<<<<LeGo FoOtBaG Club>>>>>>>>>>>>>>>>>\n\n'
                 'Klub dziala preznie, trenujemy preznie.')
        assert first_tag(value) is None

    def test_an_address_in_angle_brackets_is_not_markup(self):
        assert first_tag('write to <carl@example.org> for session times') is None

    def test_an_inequality_is_not_markup(self):
        assert first_tag('we run sessions when turnout < 6 players') is None

    def test_a_bare_word_in_brackets_is_not_markup(self):
        # `niech` is Polish, not an element. Only whitelisted names count.
        assert first_tag('<niech zolka bedzie z wami>') is None

    def test_ordinary_prose_is_not_markup(self):
        assert first_tag('A quickly developing footbag club in Gyor.') is None


class TestTheWhitelistIsExact:
    def test_a_longer_element_is_not_reported_as_its_shorter_prefix(self):
        # `<big>` must never come back as `<b>`: a report naming the wrong tag
        # sends the reader looking for something that is not there.
        assert first_tag('<big>Subscribe</big>') == '<big>'

    def test_a_word_starting_with_an_element_name_is_not_a_tag(self):
        # `<pretty>` starts with `pre` but is not an element.
        assert first_tag('<pretty>') is None


class TestScanReportsTheFinding:
    def test_a_markup_value_is_reported_with_its_kind_and_key(self, tmp_path):
        seed = tmp_path / 'clubs.csv'
        seed.write_text(
            'legacy_club_key,name,description\n'
            '111,Some Club,"<p>Hello</p>"\n'
            '222,Clean Club,"Plain prose with no markup."\n',
            encoding='utf-8',
        )
        findings = qc.scan_seed(seed, 'legacy_club_key')
        assert len(findings) == 1
        assert findings[0]['key'] == '111'
        assert findings[0]['field'] == 'description'
        assert findings[0]['kind'] == 'html markup'
        assert "'<p>'" in findings[0]['detail']

    def test_a_clean_seed_produces_no_finding(self, tmp_path):
        seed = tmp_path / 'clubs.csv'
        seed.write_text(
            'legacy_club_key,name,description\n'
            '333,Lego Club,"<<<<<LeGo FoOtBaG Club>>>>> plays on Sundays."\n',
            encoding='utf-8',
        )
        assert qc.scan_seed(seed, 'legacy_club_key') == []

"""Tests for build_hof_dossier.py.

The merge exists because the sources disagree, so what matters is that it says
so rather than choosing: a year only becomes a fact when every source that has
an opinion states the same one, an honoree only gets matched through the
identity layer, and a source name the identity layer cannot place is reported
instead of being attached to whoever it looks nearest to.
"""
import importlib.util
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "build_hof_dossier.py"
_spec = importlib.util.spec_from_file_location("build_hof_dossier", _SCRIPT)
dossier = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dossier)


class FakeResolver:
    def __init__(self, mapping):
        self.mapping = mapping

    def resolve(self, name):
        return self.mapping.get(name)


CURATED = [
    {"full_name": "Andy Linder", "induction_year": "2001", "person_id": "p1", "source_url": "u1", "notes": ""},
    {"full_name": "Bill Bethurum", "induction_year": "", "person_id": "p2", "source_url": "u2", "notes": ""},
    {"full_name": "Mike Marshall", "induction_year": "1999", "person_id": "p3", "source_url": "u3", "notes": ""},
]

PERSONS = {
    "p1": {"person_id": "p1", "person_name": "Andy Linder", "country": "United States",
           "first_year": "1980", "last_year": "1997", "event_count": "19", "placement_count": "35",
           "bap_member": "0", "bap_nickname": "", "bap_induction_year": ""},
    "p2": {"person_id": "p2", "person_name": "Bill Bethurum", "country": "United States",
           "first_year": "", "last_year": "", "event_count": "", "placement_count": "",
           "bap_member": "0", "bap_nickname": "", "bap_induction_year": ""},
    "p3": {"person_id": "p3", "person_name": "Mike Marshall", "country": "United States",
           "first_year": "", "last_year": "", "event_count": "", "placement_count": "",
           "bap_member": "0", "bap_nickname": "", "bap_induction_year": ""},
}

YEAR_PAGES = [
    {"induction_number": "38", "induction_year": "2001", "published_name": "Andy Linder",
     "legacy_username": "AndyLinder", "first_footbag": "In 1981.", "personal_notes": "",
     "achievements": "Broke the record.", "sport_future": "", "image_names": "a.jpg|b.jpg",
     "source_page": "year2001.html"},
    {"induction_number": "1", "induction_year": "1997", "published_name": "Mike Marshall",
     "legacy_username": "", "first_footbag": "", "personal_notes": "", "achievements": "",
     "sport_future": "", "image_names": "", "source_page": "year1997.html"},
    {"induction_number": "67", "induction_year": "2007", "published_name": "Beeal Bethurum",
     "legacy_username": "", "first_footbag": "", "personal_notes": "", "achievements": "",
     "sport_future": "", "image_names": "", "source_page": "year2007.html"},
]

ROSTER = [
    {"roster_position": 1, "published_name": "Andy Linder", "country": "USA",
     "induction_year": "2001", "source_page": "roster.html"},
    {"roster_position": 2, "published_name": "William Bethurum", "country": "USA",
     "induction_year": "2007", "source_page": "roster.html"},
]

SITE = [
    {"slug": "andy-linder", "url": "https://site/andy-linder", "display_name": "Andy Linder",
     "induction_year": "2001", "year_evidence": "inducted into the Footbag Hall of Fame in 2001",
     "year_candidates": "2001", "published_date": "29 Dec", "author": "A Curator",
     "bio": "A long biography.", "image_urls": "https://site/one.jpg"},
    {"slug": "mike-marshall", "url": "https://site/mike-marshall", "display_name": "Mike Marshall",
     "induction_year": "1999", "year_evidence": "inducted into the Footbag Hall of Fame in 1999",
     "year_candidates": "1999", "published_date": "1 Jan", "author": "A Curator",
     "bio": "Another biography.", "image_urls": ""},
]

DB_FACTS = {
    "p1": {
        "person": {"is_deceased": 0, "aliases": "Andrew Linder"},
        "legacy_account": {"legacy_member_id": "12345", "legacy_user_id": "AndyLinder",
                           "city": "Geneva", "region": "IL", "country": "USA",
                           "ifpa_join_date": "1999-01-01"},
    }
}


def _build(resolver_mapping=None):
    matcher = dossier.Matcher(FakeResolver(resolver_mapping or {}), CURATED)
    return dossier.build_records((CURATED, PERSONS, YEAR_PAGES, ROSTER, SITE, DB_FACTS), matcher)


def test_matcher_places_a_name_the_curated_roster_already_spells():
    matcher = dossier.Matcher(FakeResolver({}), CURATED)
    assert matcher.match("andy  linder") == "p1"


def test_matcher_falls_back_to_the_identity_layer_for_another_spelling():
    matcher = dossier.Matcher(FakeResolver({"Beeal Bethurum": "p2"}), CURATED)
    assert matcher.match("Beeal Bethurum") == "p2"


def test_matcher_reports_nothing_rather_than_the_nearest_looking_name():
    matcher = dossier.Matcher(FakeResolver({}), CURATED)
    assert matcher.match("Bill Langbehn") is None


def test_a_year_every_source_agrees_on_is_settled():
    records, _ = _build()
    year, status = dossier.settle_year(records["p1"])
    assert (year, status) == ("2001", "sources agree")


def test_a_year_only_one_source_states_is_settled_and_labelled_as_such():
    records, _ = _build({"Beeal Bethurum": "p2", "William Bethurum": "p2"})
    year, status = dossier.settle_year(records["p2"])
    assert (year, status) == ("2007", "sources agree")


def test_a_curated_year_stands_over_a_dissenting_source_and_the_dissent_is_kept():
    records, _ = _build()
    year, status = dossier.settle_year(records["p3"])
    assert (year, status) == ("1999", "curated ruling over a dissenting source")
    assert records["p3"]["induction_year_by_source"] == {
        "curated_roster": "1999",
        "hall_of_fame_site": "1999",
        "mirror_year_page": "1997",
    }


def test_sources_that_disagree_with_no_curated_year_leave_it_unset():
    records, _ = _build()
    record = records["p3"]
    record["induction_year_by_source"].pop("curated_roster")
    assert dossier.settle_year(record) == ("", "sources disagree")


def test_an_honoree_no_source_dates_is_left_unset():
    records, _ = _build()
    assert dossier.settle_year(records["p2"]) == ("", "no source states a year")


def test_a_source_name_the_identity_layer_cannot_place_is_reported_not_attached():
    records, unmatched = _build()
    assert ("mirror_year_page", "Beeal Bethurum", "year page 2007") in unmatched
    assert ("mirror_group_roster", "William Bethurum", "roster 2007") in unmatched
    assert records["p2"]["induction_year_by_source"] == {}


def test_every_spelling_is_kept_with_the_sources_that_used_it():
    records, _ = _build({"Beeal Bethurum": "p2"})
    assert records["p2"]["name_spellings"]["Beeal Bethurum"] == ["mirror_year_page"]
    assert records["p1"]["name_spellings"]["Andy Linder"] == [
        "curated_roster",
        "mirror_year_page",
        "mirror_group_roster",
        "hall_of_fame_site",
    ]


def test_each_source_contributes_the_fields_only_it_holds():
    records, _ = _build()
    record = records["p1"]
    assert record["induction_number"] == "38"
    assert record["mirror_year_page"]["achievements"] == "Broke the record."
    assert record["mirror_year_page"]["image_names"] == ["a.jpg", "b.jpg"]
    assert record["hall_of_fame_site"]["bio"] == "A long biography."
    assert record["country_by_source"]["mirror_group_roster"] == "USA"
    assert record["competition"]["event_count"] == "19"
    assert record["legacy_account"]["city"] == "Geneva"
    assert record["person_layer"]["aliases"] == "Andrew Linder"


def test_the_legacy_account_columns_carry_no_contact_or_demographic_data():
    forbidden = {"legacy_email", "legacy_email2", "legacy_email3", "street_address",
                 "postal_code", "birth_date", "gender", "phone"}
    assert forbidden.isdisjoint(dossier.LEGACY_ACCOUNT_COLUMNS)

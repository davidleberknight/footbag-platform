"""
test_publish_member_transforms.py
=================================

Pins the member record transforms the publish step applies to the vetted
members export: the column-to-field map, three-email handling, Unicode-versus-
plain name preference, birth-date and join-date assembly, that no source-validity
filtering happens here (the loader owns that), the paid-tier derivations, which
read the two expiration columns and never the stored tier code, the coverage
check that refuses a run whose flags fail to carry the standing the legacy
site's own tier computation returns, and the rules for choosing between a
field's two stored spellings.

Input rows are what the export holds: one dict per member keyed by the dump's
column names, every value text, a SQL NULL arriving as an empty field and the
stored credentials already withheld. Nothing here reads the real export, the
curated name-encoding record or the network.

Run from repo root:
    python -m pytest legacy_data/tests/test_publish_member_transforms.py -v
"""
from __future__ import annotations

import csv
import importlib.util
import io
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "legacy_data" / "scripts" / "publish_legacy_repo_data.py"
spec = importlib.util.spec_from_file_location("publish_legacy_repo_data", str(SCRIPT))
pub = importlib.util.module_from_spec(spec)
sys.modules["publish_legacy_repo_data"] = pub
spec.loader.exec_module(pub)

COLUMNS = [
    "MemberID", "MemberValid", "MemberFirstName", "MemberFirstNameUnicode",
    "MemberLastName", "MemberLastNameUnicode", "MemberMiddleName",
    "MemberMiddleNameUnicode", "MemberEmail", "MemberEmail2", "MemberEmail3",
    "MemberCity", "MemberCityUnicode", "MemberState", "MemberStateUnicode",
    "MemberZIP", "MemberCountry", "MemberCountryUnicode", "MemberAddress1",
    "MemberAddress2", "MemberBirthMonth", "MemberBirthDay", "MemberBirthYear",
    "MemberComment", "MemberAlias", "MemberIFPAJoined", "MemberIFPATier",
    "MemberIFPAExpiration", "MemberIFPAExpiration2", "MemberModified",
]

# Epochs either side of the cutover below.
FUTURE = "1893456000"   # 2030-01-01
PAST = "1200000000"     # 2008-01-10


def _row(**values: str) -> dict:
    row = dict.fromkeys(COLUMNS, "")
    row.update({f"Member{k}": v for k, v in values.items()})
    return row


ROWS = [
    # ASCII member, two emails, full address, birth date, join epoch; lifetime Tier 2.
    _row(ID="11983", Valid="1", FirstName="Steve", LastName="Blough",
         Email="steve@example.com", Email2="steve2@example.com", City="Boulder",
         State="Colorado", ZIP="80301", Country="United States",
         Address1="123 Main St", Address2="Apt 4", BirthMonth="6", BirthDay="15",
         BirthYear="1985", Comment="O'Brien fan", Alias="sblough",
         IFPAJoined="1268000000", IFPATier="2", IFPAExpiration="0",
         IFPAExpiration2="-1"),
    # Unicode name and city only, only the third email, no birth date or join;
    # lifetime Tier 1.
    _row(ID="12000", Valid="1", FirstNameUnicode="José", LastNameUnicode="Núñez",
         Email3="jose@example.com", CityUnicode="Düsseldorf", BirthMonth="0",
         BirthDay="0", BirthYear="0", Alias="jose", IFPAJoined="0", IFPATier="1",
         IFPAExpiration="-1", IFPAExpiration2="0"),
    # Invalid, with the birth parts, tier code and expirations NULL in the dump.
    _row(ID="99999", Valid="0", FirstName="Junk", LastName="User",
         Email="junk@example.com", Alias="junkuser", IFPAJoined="0"),
    # Unexpired Tier 1 annual.
    _row(ID="12500", Valid="1", FirstName="Anna", LastName="Nual",
         Email="annual@example.com", Alias="annual_user", IFPATier="1",
         IFPAExpiration=FUTURE, IFPAExpiration2="0"),
    # Lapsed Tier 1 annual: no flag, so the member claims on honours alone.
    _row(ID="12600", Valid="1", FirstName="Lars", LastName="Lapsed",
         Email="lapsed@example.com", Alias="lapsed_user", IFPATier="1",
         IFPAExpiration=PAST, IFPAExpiration2="0"),
    # Stored code 0 with lifetime Tier 2: standing lives in the expiration alone.
    _row(ID="12700", Valid="1", FirstName="Pat", LastName="Postconv",
         Email="post@example.com", Alias="post_user", IFPATier="0",
         IFPAExpiration="0", IFPAExpiration2="-1"),
    # Stored code 0 with lifetime Tier 1.
    _row(ID="12800", Valid="1", FirstName="Lee", LastName="Lifer",
         Email="lifer@example.com", Alias="lifer_user", IFPATier="0",
         IFPAExpiration="-1", IFPAExpiration2="0"),
    # Stored code 0 with an unexpired Tier 1 annual.
    _row(ID="12900", Valid="1", FirstName="Ada", LastName="Active",
         Email="active@example.com", Alias="active_user", IFPATier="0",
         IFPAExpiration=FUTURE, IFPAExpiration2="0"),
    # Tier 2 held and lapsed: the history flag stands.
    _row(ID="13000", Valid="1", FirstName="Ola", LastName="Lapsedtwo",
         Email="lapsed2@example.com", Alias="lapsed2_user", IFPATier="2",
         IFPAExpiration="-1", IFPAExpiration2=PAST),
    # Lifetime Tier 1 plus an unexpired Tier 2: both flags.
    _row(ID="13100", Valid="1", FirstName="Kim", LastName="Both",
         Email="both@example.com", Alias="both_user", IFPATier="1",
         IFPAExpiration="-1", IFPAExpiration2=FUTURE),
]

# The moment annual expirations are measured against; the unexpired annuals
# expire after it, the lapsed ones before it.
CUTOVER_EPOCH = 1785542400   # 2026-08-01T00:00:00Z


def _published(rows=ROWS):
    text, _, stats = pub.member_csvs(rows, CUTOVER_EPOCH, None, None, {})
    by_id = {r["legacy_member_id"]: r for r in csv.DictReader(io.StringIO(text))}
    return by_id, stats


def test_column_field_map():
    by_id, _ = _published()
    r = by_id["11983"]
    assert r["member_valid"] == "1"
    assert r["legacy_user_id"] == "sblough"
    assert r["display_name"] == "sblough"
    assert r["real_name"] == "Steve Blough"
    assert r["legacy_email"] == "steve@example.com"
    assert r["city"] == "Boulder"
    assert r["region"] == "Colorado"
    assert r["country"] == "United States"
    assert r["postal_code"] == "80301"
    assert r["street_address"] == "123 Main St, Apt 4"
    assert r["bio"] == "O'Brien fan"
    assert r["is_hof"] == "" and r["is_bap"] == "" and r["legacy_is_admin"] == ""
    assert r["legacy_was_board_at_cutover"] == "0"
    assert r["legacy_board_underlying_paid_tier"] == ""


def test_three_email_handling():
    by_id, _ = _published()
    assert by_id["11983"]["legacy_email2"] == "steve2@example.com"
    assert by_id["11983"]["legacy_email3"] == ""
    assert by_id["12000"]["legacy_email"] == ""
    assert by_id["12000"]["legacy_email3"] == "jose@example.com"


def test_unicode_preference():
    by_id, _ = _published()
    assert by_id["12000"]["real_name"] == "José Núñez"
    assert by_id["12000"]["city"] == "Düsseldorf"


def test_birth_and_ifpa_dates():
    by_id, _ = _published()
    assert by_id["11983"]["birth_date"] == "1985-06-15"
    assert by_id["11983"]["ifpa_join_date"].startswith("2010-")
    assert by_id["12000"]["birth_date"] == ""        # year 0
    assert by_id["12000"]["ifpa_join_date"] == ""    # join 0
    assert by_id["99999"]["birth_date"] == ""        # NULL parts, empty in the export


def test_no_filtering_invalid_row_emitted():
    # Publish does not filter; the loader owns validity, so an invalid row is
    # carried with its flag as delivered.
    by_id, stats = _published()
    assert stats["rows"] == len(by_id) == 10
    assert by_id["99999"]["member_valid"] == "0"
    assert by_id["99999"]["real_name"] == "Junk User"


def test_member_modified_carried_through_raw():
    # The raw value reaches the output untouched, so the shared-email resolver
    # parses and validates it in one place downstream.
    row = _row(ID="1001", Valid="1", Modified="1718366400")
    by_id, _ = _published([row])
    assert by_id["1001"]["legacy_member_modified"] == "1718366400"


def test_board_columns_are_never_derived_from_legacy_data():
    # No legacy tier value encodes governance standing; with no current roster
    # every row carries a definite non-board flag and no underlying tier, across
    # Tier 1, Tier 2 and an absent tier code.
    by_id, _ = _published()
    for r in by_id.values():
        assert r["legacy_was_board_at_cutover"] == "0"
        assert r["legacy_board_underlying_paid_tier"] == ""


def test_derive_ever_paid_tier2():
    # Any non-zero Tier 2 expiration flags, lapsed included; only "never held it"
    # carries no flag.
    assert pub.derive_ever_paid_tier2("-1") == "1"
    assert pub.derive_ever_paid_tier2(FUTURE) == "1"
    assert pub.derive_ever_paid_tier2(PAST) == "1"
    assert pub.derive_ever_paid_tier2(" -1 ") == "1"
    assert pub.derive_ever_paid_tier2("0") == "0"
    assert pub.derive_ever_paid_tier2("") == "0"
    assert pub.derive_ever_paid_tier2(None) == "0"
    assert pub.derive_ever_paid_tier2("not-a-number") == "0"


def test_derive_ever_paid_tier1_lifetime():
    assert pub.derive_ever_paid_tier1_lifetime("-1") == "1"
    assert pub.derive_ever_paid_tier1_lifetime(" -1 ") == "1"
    assert pub.derive_ever_paid_tier1_lifetime(FUTURE) == "0"
    assert pub.derive_ever_paid_tier1_lifetime("0") == "0"
    assert pub.derive_ever_paid_tier1_lifetime("") == "0"
    assert pub.derive_ever_paid_tier1_lifetime(None) == "0"


def test_derive_tier1_annual_active_at_cutover():
    assert pub.derive_tier1_annual_active_at_cutover(FUTURE, CUTOVER_EPOCH) == "1"
    assert pub.derive_tier1_annual_active_at_cutover(PAST, CUTOVER_EPOCH) == "0"
    assert pub.derive_tier1_annual_active_at_cutover("-1", CUTOVER_EPOCH) == "0"
    assert pub.derive_tier1_annual_active_at_cutover("0", CUTOVER_EPOCH) == "0"
    assert pub.derive_tier1_annual_active_at_cutover("not-a-number", CUTOVER_EPOCH) == "0"
    # Without a cutover moment the derivation is inert: nothing is guessed.
    assert pub.derive_tier1_annual_active_at_cutover(FUTURE, None) == "0"


def test_map_record_without_a_cutover_flags_no_annual_standing():
    # The name audit maps rows with no cutover moment; the history flags still
    # populate and the annual flag stays inert.
    mapped = [pub.map_record(r, None) for r in ROWS]
    assert {m["legacy_member_id"] for m in mapped
            if m["legacy_ever_paid_tier2"] == "1"} == {"11983", "12700", "13000", "13100"}
    assert all(m["legacy_tier1_annual_active_at_cutover"] == "0" for m in mapped)


def test_legacy_member_tier_ports_the_site_computation():
    now = CUTOVER_EPOCH
    # Lifetime Tier 2 wins outright, whatever the Tier 1 column says.
    assert pub.legacy_member_tier("0", "-1", now) == 2
    assert pub.legacy_member_tier("-1", "-1", now) == 2
    assert pub.legacy_member_tier(FUTURE, "-1", now) == 2
    # Lifetime Tier 1 with an unexpired Tier 2 annual is Tier 2; once that lapses
    # the member falls back to lifetime Tier 1.
    assert pub.legacy_member_tier("-1", FUTURE, now) == 2
    assert pub.legacy_member_tier("-1", PAST, now) == 1
    assert pub.legacy_member_tier("-1", "0", now) == 1
    # No lifetime standing: an unexpired Tier 1 annual is Tier 1, a lapsed one is
    # no membership at all.
    assert pub.legacy_member_tier(FUTURE, "0", now) == 1
    assert pub.legacy_member_tier(PAST, "0", now) == 0
    assert pub.legacy_member_tier("0", "0", now) == 0
    # A Tier 2 annual without lifetime Tier 1 does not reach the Tier 2 branch,
    # which is the site's own behaviour and why the check is coverage-only.
    assert pub.legacy_member_tier(FUTURE, FUTURE, now) == 1


def test_tier_flags_at_the_cutover():
    by_id, stats = _published()
    assert by_id["12500"]["legacy_tier1_annual_active_at_cutover"] == "1"
    assert by_id["12600"]["legacy_tier1_annual_active_at_cutover"] == "0"
    assert by_id["12000"]["legacy_tier1_annual_active_at_cutover"] == "0"
    # A lapsed Tier 1 annual carries no flag at all.
    assert by_id["12600"]["legacy_ever_paid_tier2"] == "0"
    assert by_id["12600"]["legacy_ever_paid_tier1_lifetime"] == "0"
    assert stats["flags"] == {
        "legacy_ever_paid_tier2": 4,
        "legacy_ever_paid_tier1_lifetime": 4,
        "legacy_tier1_annual_active_at_cutover": 2,
        "legacy_was_board_at_cutover": 0,
        "legacy_is_admin": 0,
    }


def test_standing_is_read_from_the_expirations_not_the_stored_code():
    # Each of these carries a stored code of 0 while holding live standing.
    by_id, _ = _published()
    assert by_id["12700"]["legacy_ever_paid_tier2"] == "1"
    assert by_id["12800"]["legacy_ever_paid_tier1_lifetime"] == "1"
    assert by_id["12900"]["legacy_tier1_annual_active_at_cutover"] == "1"


def test_lapsed_tier2_keeps_the_history_flag():
    by_id, _ = _published()
    assert by_id["13000"]["legacy_ever_paid_tier2"] == "1"
    assert by_id["13000"]["legacy_ever_paid_tier1_lifetime"] == "1"


def test_a_member_may_carry_several_flags():
    by_id, _ = _published()
    assert by_id["13100"]["legacy_ever_paid_tier2"] == "1"
    assert by_id["13100"]["legacy_ever_paid_tier1_lifetime"] == "1"
    assert by_id["13100"]["legacy_tier1_annual_active_at_cutover"] == "0"


def test_coverage_check_refuses_when_a_standing_is_uncarried(monkeypatch):
    # A row computing as Tier 2 with no Tier 2 flag must refuse the publish,
    # because a wrong tier is silent everywhere downstream.
    monkeypatch.setattr(pub, "derive_ever_paid_tier2", lambda _raw: "0")
    row = _row(ID="7001", Valid="1", IFPAExpiration="0", IFPAExpiration2="-1")
    with pytest.raises(pub.Refused) as exc:
        pub.member_csvs([row], CUTOVER_EPOCH, None, None, {})
    assert "tier-flag coverage failed on 1 member(s)" in str(exc.value)
    assert "MemberID 7001" in str(exc.value)


def test_coverage_check_passes_on_the_whole_fixture():
    # Lifetime, annual, lapsed, never-paid and multi-standing records are all
    # carried by a flag.
    _, stats = _published()
    assert stats["rows"] == len(ROWS)


# ---------------------------------------------------------------------------
# Encoding repair: which of a field's two stored spellings is the real one
#
# The legacy database holds most non-ASCII fields twice, and neither column is
# reliably right. These tests fix the rules for choosing between them,
# independent of any particular delivery.
# ---------------------------------------------------------------------------

def resolve(plain: str, unicode_col: str):
    """(value, how it was chosen) for one field's pair of stored spellings."""
    return pub._resolve_pair(plain, unicode_col)


def test_correctly_encoded_value_is_left_exactly_alone():
    value, how = resolve("Jose Nunez", "José Núñez")
    assert value == "José Núñez"
    assert how == pub.SELECTED_UNICODE


def test_adjacent_accents_are_not_mistaken_for_double_encoding():
    # Two real accented letters side by side encode to Latin-1 happily, but the
    # bytes are not valid UTF-8, so the evidence test declines.
    for genuine in ("Neusäß", "Lääkkö", "Kuopion Lääni"):
        value, how = resolve("", genuine)
        assert value == genuine
        assert how == pub.SELECTED_UNICODE


def test_double_encoded_value_loses_to_a_clean_companion():
    value, how = resolve("Côté", "CÃ´tÃ©")
    assert value == "Côté"
    assert how == pub.SELECTED_COMPANION


def test_double_encoded_value_is_reversed_when_no_clean_companion_exists():
    value, how = resolve("", "RenÃ©")
    assert value == "René"
    assert how == pub.SELECTED_REVERSED


def test_companion_that_disagrees_is_not_used_for_a_double_encoded_value():
    value, how = resolve("Andersson", "CÃ´tÃ©")
    assert value == "Côté"
    assert how == pub.SELECTED_REVERSED


def test_damaged_value_is_recovered_from_a_corresponding_companion():
    # The question mark stands where the legacy system dropped a character; the
    # other column survived it and proves to be the same name.
    value, how = resolve("Öhman", "Ã?hman")
    assert value == "Öhman"
    assert how == pub.SELECTED_UNDAMAGED


def test_damaged_value_keeps_a_companion_that_fails_correspondence():
    for unrelated in ("Nilsson", "Öhmann", "Ölund", "Öhma"):
        value, how = resolve(unrelated, "Ã?hman")
        assert value == "Ã?hman", unrelated
        assert how == pub.SELECTED_UNICODE, unrelated


def test_correspondence_confirms_consistency_not_uniqueness():
    # Both companions agree with the damaged value everywhere it survived; the
    # proof establishes the same name, not which character was lost.
    assert pub._corresponds("Ã?hman", "Öhman") is True
    assert pub._corresponds("Ã?hman", "Ähman") is True
    assert pub._corresponds("Ã?hman", "Ölund") is False


def test_wrong_codepage_companion_is_not_selected_over_a_damaged_value():
    # Both columns are corrupt in different ways; neither is touched.
    for damaged, wrong_codepage in (
        ("JiÅ?Ã\xad", "Jiøí"),
        ("StaroÅ?", "Staroñ"),
        ("Ð?Ð»ÐµÐ±", "³ÛÕÑ"),
    ):
        value, how = resolve(wrong_codepage, damaged)
        assert value == damaged, wrong_codepage
        assert how == pub.SELECTED_UNICODE, wrong_codepage


def test_a_double_encoding_is_reversed_around_a_destroyed_character():
    damaged = "BarnabÃ¡?"
    value, how = resolve("", damaged)
    assert value == "Barnabá?"
    assert how == pub.SELECTED_REVERSED
    assert value.count("?") == damaged.count("?")


def test_reversal_is_refused_if_it_would_disturb_a_destroyed_character(monkeypatch):
    # A decode that consumed or invented a question mark must not rewrite a name.
    original = pub._undouble
    monkeypatch.setattr(pub, "_undouble",
                        lambda s: "Barnaba" if s == "BarnabÃ¡?" else original(s))
    value, how = resolve("", "BarnabÃ¡?")
    assert value == "BarnabÃ¡?"
    assert how == pub.SELECTED_LEFT


def test_a_literal_question_mark_is_never_filled_in():
    for plain, uni in (("", "Ð?Ð»ÐµÐ³Ð¾Ð²Ð¸Ñ?"), ("", "BarnabÃ¡?"),
                       ("Barnabá?", "BarnabÃ¡?")):
        value, _ = resolve(plain, uni)
        assert "?" in value, (plain, uni, value)


def test_repair_is_idempotent():
    # A repaired value fed back in is left alone, so a re-publish never keeps
    # transforming the same name.
    for plain, uni in (("Côté", "CÃ´tÃ©"), ("", "RenÃ©"), ("Öhman", "Ã?hman")):
        once, _ = resolve(plain, uni)
        twice, how = resolve(once, once)
        assert twice == once
        assert how == pub.SELECTED_UNICODE


def test_correspondence_requires_a_real_substitution():
    assert pub._corresponds("Öhman", "Öhman") is False
    assert pub._corresponds("Ã?hman", "Öhman") is True


def test_recovered_spelling_comes_verbatim_from_the_companion():
    companion = "Häßler"
    value, how = resolve(companion, "HÃ¤Ã?ler")
    assert value == companion
    assert how == pub.SELECTED_UNDAMAGED

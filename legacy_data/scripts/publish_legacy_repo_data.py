#!/usr/bin/env python3
"""Write what the builds and the crawl read, from the vetted legacy export only.

The legacy refresh is the one program that reads the legacy webmaster's
repository; it writes vetted per-table CSVs into the private checkout's
legacy-export. This script reads only those CSVs, plus the curated member
name-encoding record and the IFPA secretary's capture of the live vote results,
and writes everything downstream needs from them. It never
opens the legacy repository or a database dump, so a delivery reaches the member
load and the crawl only after the refresh accepted it and a maintainer reviewed
its findings.

Written, private (the private checkout, committed there after review):

- legacy-publish/legacy_members.csv: the finished member CSV the member load
  reads. Tier flags measured at the cutover date, names repaired by the member
  record transforms below (including the curated codepage record), and the admin
  flag: "1" or "0" from the admin table, or empty when the export holds no admin
  table. The board flag is set only when the delivery's Board of Directors roster
  carries the CTO's record, because only then is that roster the sitting board;
  the underlying tier a director reverts to is decided at claim, from the same
  bases as every other claim grant. Honours are not here: they join through the
  built database at load time.
- legacy-publish/legacy_members_encoding_problems.csv: the name values the
  repair left as delivered, with the reason, for a follow-up ruling.
- legacy-publish/vote-tallies/: the IFPA vote tallies derived from the ballot
  rows, and their reconciliation against the stored totals and the secretary's
  live-site capture. Aggregates only; no member id leaves the ballots.
- legacy-publish/PUBLISH_REPORT.md: the inputs and counts behind the above.
- private-custody/ifpa-group-files/CRAWL_EXCLUSIONS.txt: the crawler's
  mandatory exclusion list of committee-scoped group content.
- private-custody/ifpa-group-files/GROUP_FILES_INVENTORY.csv: every legacy group
  file with its location, scope and committee visibility, which the group-file
  recovery routes on, so the mirror program never reads the export itself.

Written, public (this checkout):

- legacy_data/legacy_mirror/mirror_seeds/*.txt: the crawl seed lists.
- legacy_data/legacy_mirror/approved_event_ids.txt: the events the legacy
  calendar was willing to list, which the crawler's reader-facing event index
  is limited to.

Refused, with the reason and nothing written: a missing private checkout or
export table, a cutover date that is absent or not a calendar date, an export
table carrying a stored-credential column, and a member whose tier standing at
the cutover date no derived flag covers (a wrong tier is silent downstream).

The cutover date is the moment annual memberships are measured against. It is
always given explicitly, never taken from the day the script runs, so the
published CSV says the same thing whenever it is rebuilt.

Usage:
    publish_legacy_repo_data.py --cutover-date YYYY-MM-DD
"""
from __future__ import annotations

import argparse
import csv
import io
import os
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from refresh_support import is_credential_column  # noqa: E402
from legacy_html import legacy_html_to_text  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
PRIVATE = REPO_ROOT / 'footbag_private_repo'
MIRROR = REPO_ROOT / 'legacy_data' / 'legacy_mirror'

EXPORT_DIR = 'legacy-export'
PUBLISH_DIR = 'legacy-publish'
EXCLUSIONS_REL = 'private-custody/ifpa-group-files/CRAWL_EXCLUSIONS.txt'
INVENTORY_REL = 'private-custody/ifpa-group-files/GROUP_FILES_INVENTORY.csv'
TALLIES_DIR = 'vote-tallies'
# The capture's per-option counts, the independent third record of each vote.
# Not produced by any dump: the IFPA secretary read them off the rendered result
# pages while the site was up.
VOTE_CAPTURE_REL = 'private_data/vote_result_options.csv'
SEEDS_REL = 'mirror_seeds'
EVENT_IDS_REL = 'approved_event_ids.txt'

BASE_URL = 'http://www.footbag.org'

# The CTO's legacy account. A Board of Directors roster carrying it is the
# current one; an older delivery's roster predates the CTO seat.
CTO_MEMBER_ID = '11985'
BOARD_COMMITTEE_ID = '1'

# The dump the member CSV is derived from, as the refresh manifest names it.
MEMBERS_SOURCE = 'members/backups/latest.sql'

EXCLUSIONS_HEADER = (
    '# Mirror-crawler content exclusions: committee-scoped and private-group legacy content.\n'
    '# One site-root-relative URL path per line, percent-decoded; an entry matches itself\n'
    '# and everything beneath it. Consumed by create_mirror_footbag_org.py --exclusion-list.\n'
    '# Written by publish_legacy_repo_data.py from the legacy export (ifpa_group_files x ifpa_committees:\n'
    '# FileScope != 0 in any group, or any file of a CommitteePublic = 0 committee, plus\n'
    "# their showfile pages and every private committee's list/home/listfiles pages).\n"
)


class Refused(Exception):
    """A condition that makes publishing unsafe; nothing is written."""


# ── Member record transforms ─────────────────────────────────────────────────
# Each takes one members row as {export column name: value}. A SQL NULL and an
# empty string arrive alike as an empty field, and every read below goes through
# _val, so the two cannot be told apart and need not be.

# Output CSV header order. Most columns map by name into the legacy-member
# importer; the two board-at-cutover columns are emitted ahead of their importer
# and schema landing, so the importer reports and ignores them until then.
OUTPUT_FIELDS = [
    "legacy_member_id", "member_valid", "legacy_user_id",
    "legacy_email", "legacy_email2", "legacy_email3",
    "real_name", "display_name", "city", "region", "country",
    "bio", "birth_date", "street_address", "postal_code", "ifpa_join_date",
    "is_hof", "is_bap", "legacy_is_admin",
    "legacy_ever_paid_tier2", "legacy_ever_paid_tier1_lifetime",
    "legacy_tier1_annual_active_at_cutover",
    "legacy_was_board_at_cutover", "legacy_board_underlying_paid_tier",
    "legacy_member_modified",
]

# Tier standing lives in the two expiration columns, and nowhere else.
#
#   MemberIFPAExpiration   Tier 1: -1 is lifetime, a real epoch is an annual
#                          expiry, 0 is no Tier 1 standing ever.
#   MemberIFPAExpiration2  Tier 2, same encoding.
#
# These are what the legacy site's own tier function reads, and the derivations
# below read only them. The stored `MemberIFPATier` code is deliberately NOT
# read: the site abandoned it in a one-time 2007 conversion, no live code path
# writes it, and the site overwrites the stored value with the computed one
# before displaying it. Deriving from it silently produced Tier 0 for members
# holding live standing, because everyone who first paid after 2007 still
# carries the pre-conversion code. `legacy_member_tier` below ports the site's
# function so the quality check can prove the derivations agree with it.
LIFETIME_EXPIRATION = "-1"


def _val(rec: dict, col: str) -> str:
    v = rec.get(col)
    return "" if v is None else str(v).strip()


# A literal question mark sitting immediately after a non-ASCII character. The
# legacy system wrote it in place of a character it could not represent, before
# the dump was taken, so what it stood for is not in this source at all.
_DESTROYED_BYTE = re.compile(r"[^\x00-\x7f]\?")


def _undouble(s: str) -> str | None:
    """Return `s` with one layer of mis-decoding undone, or None if there is none.

    A value is double-encoded when its own characters all fit in Latin-1 AND
    those bytes are themselves valid UTF-8 AND decoding them changes the value.
    All three must hold, which is what makes this evidence rather than a guess:
    a name with two genuinely adjacent accents encodes to Latin-1 happily, but
    its bytes are not valid UTF-8, so it is left alone. A value corrupted through
    some other codepage fails the same way and is likewise left alone.
    """
    try:
        raw = s.encode("latin-1")
    except UnicodeEncodeError:
        return None
    try:
        decoded = raw.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return decoded if decoded != s else None


def _corresponds(damaged: str, companion: str) -> bool:
    """Is `damaged` the same name as `companion`, with some characters destroyed?

    Put the companion through the same mis-decode that produced the damaged
    value, and the two must then agree character for character except where the
    damaged side carries a question mark. That is the correspondence proof: every
    surviving character has to line up, so a companion holding a different
    spelling, a longer name, or another person entirely cannot qualify merely
    because the preferred value is broken.

    Nothing is reconstructed from this. The proof only licenses using the
    companion's own text verbatim.
    """
    expected = companion.encode("utf-8").decode("latin-1")
    if len(expected) != len(damaged):
        return False
    substituted = False
    for want, got in zip(expected, damaged):
        if got == want:
            continue
        if got == "?":
            # A character the legacy system could not represent, standing in for
            # exactly the one the companion still has.
            substituted = True
            continue
        return False
    return substituted


# How a field's value was arrived at. Counted per extraction so a run reports
# what it repaired and what it could not, rather than a single success number.
SELECTED_UNICODE   = "unicode column as delivered"
SELECTED_COMPANION = "companion column, unicode column double-encoded"
SELECTED_REVERSED  = "double-encoding reversed, no clean companion"
SELECTED_UNDAMAGED = "companion column, unicode column positively damaged"
SELECTED_LEFT      = "left as delivered, not recoverable here"
SELECTED_CURATED   = "companion column, decoded through the curated codepage"

# The curated record of which codepage a member's name was written in.
MEMBER_NAME_ENCODINGS_CSV = (
    Path(__file__).resolve().parent.parent / "overrides" / "member_name_encodings.csv")

# The encodings a curator may name. A closed set on purpose: the point of this
# file is that a human decided, so an unrecognised value is a mistake to surface
# rather than something to attempt.
ALLOWED_CODEPAGES = frozenset({"cp1250", "cp1251", "iso8859-5", "none"})

# The codepage a curator names when the stored bytes are right and only the
# legacy system's accent markup needs decoding.
NO_CODEPAGE = "none"

# The legacy system wrote some accented letters as markup, a letter followed by
# the accent's name ("S<caron>" for Š), and others as numeric HTML entities.
# Both are exact spellings of one character, so decoding them infers nothing.
_ACCENT_MARKUP = re.compile(r"([A-Za-z])<caron>")
_COMBINING_CARON = chr(0x030C)
_NUMERIC_ENTITY = re.compile(r"&#(\d+);")


def decode_accent_markup(text: str) -> str:
    """The text with the legacy system's accent markup and numeric entities
    turned into the characters they spell."""
    text = _ACCENT_MARKUP.sub(lambda m: unicodedata.normalize("NFC", m.group(1) + _COMBINING_CARON), text)
    return _NUMERIC_ENTITY.sub(lambda m: chr(int(m.group(1))), text)


# Which stored column each curated field token names.
CURATED_FIELD_COLUMNS = {
    "given": "MemberFirstName",
    "middle": "MemberMiddleName",
    "surname": "MemberLastName",
}


def load_member_name_encodings(
    path: Path = MEMBER_NAME_ENCODINGS_CSV,
) -> dict[str, tuple[str, frozenset[str], str | None]]:
    """Curated member id -> (codepage, the columns it applies to, the lost letter).

    The lost letter is the one character a member's name lost to a question mark
    in every source, established from outside evidence and written in the legacy
    markup ("s<caron>") so the file still records no name. Most rows have none.

    The columns matter as much as the codepage. A member can have one name
    written in a codepage nobody recorded while another is already correct, and
    re-reading the correct one would damage it: a Czech surname holding a letter
    that exists in both codepages decodes cleanly to the wrong letter, so it comes
    out looking repaired and is wrong. The curator names the affected fields and
    nothing else is touched.

    An unknown codepage or field token is rejected loudly. A typo that silently
    did nothing would leave a name corrupt while the file claimed it was handled,
    which is the failure this record exists to prevent.
    """
    if not path.exists():
        return {}
    out: dict[str, tuple[str, frozenset[str], str | None]] = {}
    with path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            mid = (row.get("legacy_member_id") or "").strip()
            cp = (row.get("codepage") or "").strip()
            if not mid:
                continue
            if cp not in ALLOWED_CODEPAGES:
                raise SystemExit(
                    f"member_name_encodings.csv: member {mid} names codepage {cp!r}, "
                    f"which is not one of {sorted(ALLOWED_CODEPAGES)}")
            tokens = [t.strip() for t in (row.get("fields") or "").split("+") if t.strip()]
            unknown = [t for t in tokens if t not in CURATED_FIELD_COLUMNS]
            if not tokens or unknown:
                raise SystemExit(
                    f"member_name_encodings.csv: member {mid} names field(s) "
                    f"{unknown or '(none)'}, expected some of "
                    f"{sorted(CURATED_FIELD_COLUMNS)}")
            lost = (row.get("lost_letter") or "").strip() or None
            if lost is not None and len(decode_accent_markup(lost)) != 1:
                raise SystemExit(
                    f"member_name_encodings.csv: member {mid} names lost letter {lost!r}, "
                    "which is not exactly one character")
            out[mid] = (cp, frozenset(CURATED_FIELD_COLUMNS[t] for t in tokens), lost)
    return out


def decode_through_codepage(text: str, codepage: str) -> str | None:
    """The text re-read in the codepage it was written in, or None.

    The stored value is text that was decoded as Western European from bytes that
    were never Western European. Encoding it straight back recovers those bytes
    exactly, and decoding them with the named codepage is what the legacy system
    should have done. Both halves are exact: no character is inferred, replaced or
    moved, and there is no scoring or preference anywhere in it.

    None whenever the round trip cannot be made, and None when a destroyed
    character survives it: naming an encoding cannot bring back a byte that is
    already gone, and a value that still carries one is not repaired.
    """
    if not text:
        return None
    try:
        out = text.encode("cp1252").decode(codepage)
    except (UnicodeEncodeError, UnicodeDecodeError, LookupError):
        return None
    if not out or out == text:
        return None
    if "?" in out or "�" in out:
        return None
    return out


def _resolve_pair(base_val: str, uni_val: str,
                  codepage: str | None = None,
                  lost_letter: str | None = None) -> tuple[str, str]:
    """Choose between a field's two stored spellings, and say why.

    A curated codepage, when one is recorded for this member, is consulted first
    and only for the plain column. That column is intact for those members; it was
    simply written in an encoding nobody recorded, so every rule below reads it as
    Western European and sees unrelated letters. Decoding it as the curator named
    is exact, and it is skipped the moment it fails or leaves a destroyed
    character, so an override can only ever produce a clean name or stand aside.

    The dump keeps most non-ASCII fields twice, and the Unicode column is the
    better source for ordinary rows, so it stays the default. On some rows that
    column holds a value that was decoded once too often before the dump was
    taken, and there the plain column is the one the legacy system got right.
    Preferring it recovers the real spelling without transforming any bytes.

    Reversal is the fallback for a row where neither column is clean. It is
    applied only when it is lossless: a value whose reversal still carries a
    question mark stands where a byte was destroyed inside the legacy system,
    and no rule here can know what it was, so the value is passed through as
    delivered and counted as such.
    """
    if codepage and base_val:
        # The codepage re-read comes first: the markup is ASCII, so it passes
        # through the re-read untouched and is decoded afterwards.
        curated = base_val
        if codepage != NO_CODEPAGE:
            curated = decode_through_codepage(base_val, codepage) or base_val
        curated = decode_accent_markup(curated)
        if lost_letter and curated.count("?") == 1:
            curated = curated.replace("?", decode_accent_markup(lost_letter))
        if curated != base_val and "?" not in curated and "�" not in curated:
            return curated, SELECTED_CURATED

    chosen = uni_val if uni_val else base_val
    if not chosen:
        return "", SELECTED_UNICODE

    reversed_ = _undouble(chosen)
    if reversed_ is None:
        # Not double-encoded, so there is nothing to reverse. It may still be
        # damaged: a question mark straight after a non-ASCII character is where
        # the legacy system dropped a character it could not represent. When the
        # other column survived that, and proves to be the same name, it is the
        # spelling to use.
        if _DESTROYED_BYTE.search(chosen) and base_val and base_val is not chosen \
                and not _DESTROYED_BYTE.search(base_val) \
                and _undouble(base_val) is None \
                and _corresponds(chosen, base_val):
            return base_val, SELECTED_UNDAMAGED
        return chosen, SELECTED_UNICODE

    # The legacy system already stored the right spelling in the other column.
    # Requiring the two to agree is what makes this a confirmation rather than a
    # swap: a companion that says something else is a disagreement to report,
    # not to silently resolve.
    if base_val and _undouble(base_val) is None and base_val == reversed_:
        return base_val, SELECTED_COMPANION

    # A reversal is applied even when the value carries a character the legacy
    # system destroyed. Undoing the double-encoding does not touch that: the
    # question mark is ASCII, and an ASCII byte survives a UTF-8 decode as
    # itself, so it comes through in place and nothing is put back where it
    # stands. Repairing what can be repaired beats shipping a name that is wrong
    # twice over, and the value is still reported as unresolved either way.
    #
    # The count check states that guarantee rather than assuming it, so a later
    # change to the decode that consumed or produced a question mark would fall
    # out here instead of quietly rewriting names.
    if reversed_.count("?") == chosen.count("?"):
        return reversed_, SELECTED_REVERSED

    return chosen, SELECTED_LEFT


def _prefer_unicode(rec: dict, base: str, uni: str,
                    codepage: str | None = None,
                    lost_letter: str | None = None) -> str:
    value, _ = _resolve_pair(_val(rec, base), _val(rec, uni), codepage, lost_letter)
    return value


def _epoch_to_date(rec: dict, col: str) -> str:
    raw = _val(rec, col)
    if not raw or raw in ("0", "-1"):
        return ""
    try:
        secs = int(raw)
    except ValueError:
        return ""
    if secs <= 0:
        return ""
    return datetime.fromtimestamp(secs, tz=timezone.utc).strftime("%Y-%m-%d")


def _birth_date(rec: dict) -> str:
    def num(col):
        raw = _val(rec, col)
        try:
            return int(raw)
        except ValueError:
            return 0
    y, mo, d = num("MemberBirthYear"), num("MemberBirthMonth"), num("MemberBirthDay")
    if y > 0 and 1 <= mo <= 12 and 1 <= d <= 31:
        return f"{y:04d}-{mo:02d}-{d:02d}"
    return ""


def _street(rec: dict) -> str:
    parts = [_val(rec, "MemberAddress1"), _val(rec, "MemberAddress2")]
    return ", ".join(p for p in parts if p)


def _expiration(raw: str) -> int:
    """A raw expiration column as an integer: -1 lifetime, 0 none, else an
    epoch. Anything unparseable reads as 0, no standing."""
    try:
        return int((raw or "").strip())
    except ValueError:
        return 0


def derive_ever_paid_tier2(expiration2_raw: str) -> str:
    """'1' when the member has ever held Tier 2 standing: any non-zero Tier 2
    expiration, lifetime or annual, expired or not. This is a history
    predicate, so a lapsed Tier 2 member still carries it."""
    return "1" if _expiration(expiration2_raw) != 0 else "0"


def derive_ever_paid_tier1_lifetime(expiration_raw: str) -> str:
    """'1' when the member holds the Tier 1 lifetime sentinel (-1). Also a
    history predicate: lifetime standing does not lapse."""
    return "1" if (expiration_raw or "").strip() == LIFETIME_EXPIRATION else "0"


def derive_tier1_annual_active_at_cutover(
    expiration_raw: str, cutover_epoch: int | None,
) -> str:
    """'1' when the member holds a Tier 1 annual expiration (a real epoch, not
    the -1 lifetime sentinel and not 0/none) still unexpired at the cutover
    moment. Without a cutover date the derivation is inert and no row is
    flagged (nothing is guessed); a lapsed annual carries no flag and the
    member claims on honors alone."""
    if cutover_epoch is None:
        return "0"
    exp = _expiration(expiration_raw)
    if exp <= 0:
        return "0"
    return "1" if exp > cutover_epoch else "0"


def legacy_member_tier(expiration_raw: str, expiration2_raw: str,
                       now_epoch: int) -> int:
    """The legacy site's own tier computation, ported branch for branch from
    its member library, over the two expiration columns at a given moment.
    Used only by the quality check: the derived flags are history predicates
    and this is current standing, so the two are compared for coverage rather
    than equality."""
    exp1 = _expiration(expiration_raw)
    exp2 = _expiration(expiration2_raw)
    if exp2 == -1:
        return 2                                  # lifetime Tier 2
    if exp1 == -1:
        return 2 if exp2 > now_epoch else 1       # annual Tier 2 still valid, else lifetime Tier 1
    if exp1 > now_epoch:
        return 1                                  # annual Tier 1 still valid
    return 0                                      # no membership at all


NAME_PAIRS = [
    ("MemberFirstName", "MemberFirstNameUnicode"),
    ("MemberMiddleName", "MemberMiddleNameUnicode"),
    ("MemberLastName", "MemberLastNameUnicode"),
]
OTHER_PAIRS = [
    ("MemberCity", "MemberCityUnicode"),
    ("MemberState", "MemberStateUnicode"),
    ("MemberCountry", "MemberCountryUnicode"),
]

def audit_record_encoding(rec: dict, codepage: str | None = None,
                          fields: frozenset[str] = frozenset(),
                          lost_letter: str | None = None) -> dict:
    """Report how each stored-twice field of one row resolved, and what is wrong
    with the ones that did not.

    Separate from map_record so that counting cannot drift from the mapping: the
    same _resolve_pair decides both, and this only describes the outcome. The
    curated codepage is passed through for that reason: an audit that did not see
    it would keep reporting a member as unrepaired after the curator had ruled.
    """
    outcomes: dict[str, str] = {}
    problems: list[dict] = []
    for base, uni in NAME_PAIRS + OTHER_PAIRS:
        base_val, uni_val = _val(rec, base), _val(rec, uni)
        # The ruling covers named fields on named members. A location column, or
        # a name column the curator did not list, must resolve here exactly as it
        # does in the mapping.
        cp = codepage if base in fields else None
        value, how = _resolve_pair(base_val, uni_val, cp, lost_letter if cp else None)
        outcomes[base] = how
        if not value or value.isascii():
            continue
        # Corruption this pass deliberately does not touch. Named by the evidence
        # for it, never by a guess at which codepage produced it.
        # The reason says what is still wrong with the value; `resolution` says
        # how far this pass got. Keeping them apart matters, because a value can
        # be repaired as far as the evidence allows and still be listed here.
        if how == SELECTED_LEFT:
            reason = "reversal would not have preserved a destroyed character"
        elif _DESTROYED_BYTE.search(value):
            reason = "a destroyed character remains; this source cannot say what it was"
        elif base_val and uni_val and base_val != uni_val \
                and _undouble(base_val) is not None:
            reason = "columns disagree: the plain column is double-encoded"
        else:
            continue
        problems.append({
            "legacy_member_id": _val(rec, "MemberID"),
            "column": base,
            "reason": reason,
            "resolution": how,
            "stored_unicode_column": uni_val,
            "stored_plain_column": base_val,
        })
    return {"outcomes": outcomes, "problems": problems}


def map_record(rec: dict, cutover_epoch: int | None = None,
               name_encodings: dict[str, tuple[str, frozenset[str], str | None]] | None = None,
               board_roster: dict[str, str] | None = None) -> dict:
    """Map a members row to the canonical loader-input fields."""
    # Only the name columns consult the curated codepage. A member's city or
    # country carrying the same damage is a different question and is not what
    # was ruled on, and the surname is what gates their claim.
    codepage, fields, lost_letter = (name_encodings or {}).get(
        _val(rec, "MemberID"), (None, frozenset(), None))

    def name_for(base: str, uni: str) -> str:
        if base in fields:
            return _prefer_unicode(rec, base, uni, codepage, lost_letter)
        return _prefer_unicode(rec, base, uni)

    first = name_for("MemberFirstName", "MemberFirstNameUnicode")
    middle = name_for("MemberMiddleName", "MemberMiddleNameUnicode")
    last = name_for("MemberLastName", "MemberLastNameUnicode")
    real_name = " ".join(p for p in (first, middle, last) if p)
    alias = _val(rec, "MemberAlias")
    expiration = _val(rec, "MemberIFPAExpiration")
    expiration2 = _val(rec, "MemberIFPAExpiration2")
    return {
        "legacy_member_id": _val(rec, "MemberID"),
        "member_valid":     _val(rec, "MemberValid"),
        "legacy_user_id":   alias,
        "legacy_email":     _val(rec, "MemberEmail"),
        "legacy_email2":    _val(rec, "MemberEmail2"),
        "legacy_email3":    _val(rec, "MemberEmail3"),
        "real_name":        real_name,
        "display_name":     alias,
        "city":             _prefer_unicode(rec, "MemberCity", "MemberCityUnicode"),
        "region":           _prefer_unicode(rec, "MemberState", "MemberStateUnicode"),
        "country":          _prefer_unicode(rec, "MemberCountry", "MemberCountryUnicode"),
        # The legacy comment is an HTML fragment; a claim copies it into the
        # member's bio, which is plain text escaped on output.
        "bio":              legacy_html_to_text(_val(rec, "MemberComment")),
        "birth_date":       _birth_date(rec),
        "street_address":   _street(rec),
        "postal_code":      _val(rec, "MemberZIP"),
        "ifpa_join_date":   _epoch_to_date(rec, "MemberIFPAJoined"),
        # Relational / enrichment fields are filled by later phases.
        "is_hof":           "",
        "is_bap":           "",
        "legacy_is_admin":  "",
        "legacy_ever_paid_tier2":            derive_ever_paid_tier2(expiration2),
        "legacy_ever_paid_tier1_lifetime":   derive_ever_paid_tier1_lifetime(expiration),
        "legacy_tier1_annual_active_at_cutover":
            derive_tier1_annual_active_at_cutover(expiration, cutover_epoch),
        "legacy_was_board_at_cutover":
            "1" if _val(rec, "MemberID") in (board_roster or {}) else "0",
        "legacy_board_underlying_paid_tier":
            (board_roster or {}).get(_val(rec, "MemberID"), ""),
        # Raw source record-modification timestamp, carried through untouched so
        # the shared-email resolver can parse and validate it centrally. The
        # extraction layer transports the evidence; it does not decide ownership.
        "legacy_member_modified":            _val(rec, "MemberModified"),
    }


def tier_coverage_violation(rec: dict, mapped: dict, cutover_epoch: int) -> str | None:
    """The quality check behind the tier flags: whatever standing the legacy
    site's own tier function computes for this row at the cutover moment must
    be covered by a flag the claim-time grant can read. Tier 2 standing needs
    the Tier 2 flag; Tier 1 standing needs the lifetime or the annual-active
    flag. Returns a description of the failure, or None when covered.

    Coverage, not equality: two of the three flags are history predicates and
    the computed standing is current, so a lapsed Tier 2 member computes as
    Tier 1 while correctly carrying the Tier 2 history flag. Requiring equality
    would reject exactly the rows the design intends to grant on.
    """
    tier = legacy_member_tier(_val(rec, "MemberIFPAExpiration"),
                              _val(rec, "MemberIFPAExpiration2"), cutover_epoch)
    if tier == 2 and mapped["legacy_ever_paid_tier2"] != "1":
        return "computes as Tier 2 but carries no ever-held-Tier-2 flag"
    if tier == 1 and mapped["legacy_ever_paid_tier1_lifetime"] != "1" \
            and mapped["legacy_tier1_annual_active_at_cutover"] != "1":
        return "computes as Tier 1 but carries neither Tier 1 flag"
    return None


def read_table(export: Path, rel: str, required: bool = True) -> list[dict] | None:
    """Rows of one export CSV. A stored credential column refuses the run: the
    refresh withholds them, so one arriving here means the export was not
    written by the refresh."""
    path = export / rel
    if not path.is_file():
        if not required:
            return None
        raise Refused(f'{path} is missing. Run legacy_data/scripts/refresh_legacy_repo_data.py '
                      'to write the export, then re-run.')
    with path.open(newline='', encoding='utf-8') as fh:
        reader = csv.DictReader(fh)
        held = [c for c in reader.fieldnames or [] if is_credential_column(c)]
        if held:
            raise Refused(f'{path} carries stored-credential column(s) {held}; the refresh '
                          'withholds these, so this export was not written by it.')
        return list(reader)


def _ids(values, key=int) -> list[str]:
    return sorted({v.strip() for v in values if v and v.strip()}, key=key)


def seed_lists(export: Path, members: list[dict]) -> dict[str, list[str]]:
    """The crawl seed lists: ids the crawl's link-following cannot reach, as
    page URLs. Every one of these pages serves, so capture does not turn on
    approval; the reader-facing index is limited separately (see
    approved_event_ids)."""
    clubs = read_table(export, 'clubs/clubs.csv')
    sets = read_table(export, 'gallery/sets.csv')
    rules = read_table(export, 'rules/rulebook3.csv')
    moves = read_table(export, 'moves2/moves.csv')
    faq = read_table(export, 'faq/faq.csv')
    sections = read_table(export, 'faq/faqsections.csv')
    calendar = read_table(export, 'events/calendar.csv')
    return {
        # Club ids are not all numeric, so the whole URL sorts as text.
        'clubs.txt': sorted(f'{BASE_URL}/clubs/show/{c}'
                            for c in _ids((r['ClubID'] for r in clubs), key=str)),
        # Only index-hidden sets: a visible set is already in the link graph.
        'gallery.txt': [f'{BASE_URL}/gallery/showset/{s}' for s in _ids(
            r['RealSetID'].strip().lstrip('-') for r in sets if r['SetVisible'].strip() == '0')],
        'rules.txt': [f'{BASE_URL}/rules/chapter/{b}'
                      for b in _ids(r['SectionBase'] for r in rules)],
        'moves.txt': [f'{BASE_URL}/newmoves/show/{m}' for m in _ids(r['MoveID'] for r in moves)],
        'faq.txt': ([f'{BASE_URL}/faq/show/{a}' for a in _ids(r['FaqQuestionID'] for r in faq)]
                    + [f'{BASE_URL}/faq/list?sid={s}'
                       for s in _ids(r['FaqSectionID'] for r in sections)]),
        'events.txt': [f'{BASE_URL}/events/show/{e}' for e in _ids(
            r['EventID'] for r in calendar if r['Deleted'].strip() == '0')],
        'members.txt': [f'{BASE_URL}/members/profile/{m}' for m in _ids(
            r['MemberID'] for r in members if r['MemberValid'].strip() == '1')],
    }


def approved_event_ids(export: Path) -> list[str]:
    """Events the legacy calendar was willing to list: not deleted, and not
    unapproved. An unapproved event's page still serves, but the calendar
    withheld it, so the archive's reader-facing index must not name it."""
    calendar = read_table(export, 'events/calendar.csv')
    return _ids(r['EventID'] for r in calendar
                if r['Deleted'].strip() == '0' and r['Approved'].strip() != '0')


def crawl_exclusions(export: Path) -> str:
    """The crawler's exclusion list: every group file scoped to its group or held
    by a non-public committee, with its show page, then each such committee's
    file listing, and for a non-public committee its list and home pages."""
    files = read_table(export, 'groups/ifpa_group_files.csv')
    committees = {r['CommitteeID']: r for r in read_table(export, 'groups/ifpa_committees.csv')}
    private = {cid for cid, r in committees.items() if r['CommitteePublic'] == '0'}
    chosen = [r for r in files if r['FileScope'] != '0' or r['FileGroupID'] in private]
    lines = []
    for r in sorted(chosen, key=lambda r: int(r['FileID'])):
        lines += [r['FileLocation'].lstrip('/'), f'groups/showfile/{r["FileID"]}']
    for cid in sorted({r['FileGroupID'] for r in chosen} | private, key=int):
        lines.append(f'groups/listfiles/{cid}')
        keyword = committees.get(cid, {}).get('CommitteeKeyword', '')
        if cid in private and keyword:
            lines += [f'groups/list/{keyword}', f'groups/home/{keyword}']
    return EXCLUSIONS_HEADER + ''.join(f'{line}\n' for line in lines)


INVENTORY_FIELDS = ['FileID', 'FileVisible', 'FileGroupID', 'FileLocation', 'FileScope',
                    'CommitteeName', 'CommitteePublic']


def group_file_inventory(export: Path) -> str:
    """Every legacy group file with where it lives, its own scope and its
    committee's name and public flag, in export order: what the group-file
    recovery routes on, so the mirror program reads this rather than the export.
    The committee columns are empty for a file whose committee the export does
    not hold."""
    committees = {r['CommitteeID']: r for r in read_table(export, 'groups/ifpa_committees.csv')}
    rows = []
    for r in read_table(export, 'groups/ifpa_group_files.csv'):
        committee = committees.get(r['FileGroupID'], {})
        rows.append({
            'FileID': r['FileID'], 'FileVisible': r['FileVisible'],
            'FileGroupID': r['FileGroupID'], 'FileLocation': r['FileLocation'],
            'FileScope': r['FileScope'],
            'CommitteeName': committee.get('CommitteeName', ''),
            'CommitteePublic': committee.get('CommitteePublic', ''),
        })
    return _csv_text(rows, INVENTORY_FIELDS)


NO_ANSWER = '(no numbered answer)'

TALLY_FIELDS = ['issue_id', 'election_id', 'question', 'answer_index',
                'answer_text', 'derived_votes']
RECONCILIATION_FIELDS = TALLY_FIELDS + ['stored_tally', 'capture_count', 'status']


def read_capture(private: Path) -> dict:
    """The capture's counts, keyed the way the rendered pages key them: the vote,
    the position voted on, and the option's own text. Required: without it every
    reconciled cell would quietly read as uncovered by the capture."""
    source = private / VOTE_CAPTURE_REL
    if not source.is_file():
        raise Refused(f'{source} is missing. It is the IFPA secretary\'s capture of the '
                      'live vote results, held in the private checkout; restore it and '
                      're-run.')
    with open(source, encoding='utf-8', newline='') as fh:
        return {(r['vote_id'], r['position'].strip(), r['option'].strip()):
                int(r['count']) for r in csv.DictReader(fh)}


def answer_text(issue: dict, index: int) -> str:
    if index == 0:
        return NO_ANSWER
    return (issue.get(f'IssueAnswer{index}') or '').strip()


def stored_tally(issue: dict, index: int) -> int | None:
    """The application's own running total for one answer. There is no column for
    index 0, which is the first thing the reconciliation has to say."""
    if index == 0:
        return None
    raw = (issue.get(f'IssueTally{index}') or '').strip()
    return int(raw) if raw else 0


def build_tally_rows(counts: Counter, issues: dict,
                     capture: dict) -> tuple[list[dict], list[dict]]:
    # Every cell either source knows about, so a stored tally with no ballots
    # behind it shows up rather than being invisible for want of a ballot row.
    cells = set(counts)
    for issue_id, issue in issues.items():
        for index in range(1, 11):
            if stored_tally(issue, index):
                cells.add((issue_id, index))

    tallies, reconciliation = [], []
    for issue_id, index in sorted(cells, key=lambda c: (int(c[0]), c[1])):
        issue = issues.get(issue_id, {})
        election_id = issue.get('IssueElectionID', '')
        question = (issue.get('IssueQuestion') or '').strip()
        answer = answer_text(issue, index)
        derived = counts.get((issue_id, index), 0)
        stored = stored_tally(issue, index)
        captured = capture.get((election_id, question, answer))

        tallies.append({
            'issue_id': issue_id,
            'election_id': election_id,
            'question': question,
            'answer_index': index,
            'answer_text': answer,
            'derived_votes': derived,
        })

        if index == 0:
            status = 'no numbered answer; no stored tally exists for these'
        elif stored is None:
            status = 'no stored tally'
        elif derived != stored:
            status = f'disagree: ballots {derived}, stored {stored}'
        elif captured is None:
            status = 'agrees with stored; not matched in capture'
        elif captured != derived:
            status = f'agrees with stored; capture says {captured}'
        else:
            status = 'all three agree'

        reconciliation.append({
            'issue_id': issue_id,
            'election_id': election_id,
            'question': question,
            'answer_index': index,
            'answer_text': answer,
            'derived_votes': derived,
            'stored_tally': '' if stored is None else stored,
            'capture_count': '' if captured is None else captured,
            'status': status,
        })
    return tallies, reconciliation


def _csv_text(rows: list[dict], fields: list[str]) -> str:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
    return out.getvalue()


def vote_tallies(export: Path, private: Path) -> tuple[str, str, dict]:
    """The IFPA vote tallies derived from the ballot rows, and their
    reconciliation against the application's stored totals and the live-site
    capture, as CSV text, plus the counts the report states.

    The ballots are read in memory and only aggregates leave: no member id
    reaches any output. `VoteIndex` is one-based against the `IssueAnswerN`
    columns; a ballot carrying index 0 selected no numbered answer and is kept as
    its own row per issue, because the stored tallies do not represent those at
    all and dropping them would lose the fact that they exist."""
    counts: Counter = Counter()
    for row in read_table(export, 'ifpa/ifpa_issue_votes.csv'):
        counts[(row['VoteIssueID'], int(row['VoteIndex']))] += 1
    issues = {r['IssueID']: r for r in read_table(export, 'ifpa/ifpa_issues.csv')}
    tallies, reconciliation = build_tally_rows(counts, issues, read_capture(private))
    stats = {
        'ballots': sum(counts.values()),
        'numbered': sum(1 for r in reconciliation if r['answer_index'] != 0),
        'no_answer': sum(v for k, v in counts.items() if k[1] == 0),
        'disagree': sum(1 for r in reconciliation if r['status'].startswith('disagree')),
        'unmatched': sum(1 for r in reconciliation
                         if r['capture_count'] == '' and r['answer_index'] != 0),
    }
    return (_csv_text(tallies, TALLY_FIELDS),
            _csv_text(reconciliation, RECONCILIATION_FIELDS), stats)


def board_roster(export: Path) -> tuple[bool, list[str]]:
    """Whether the delivery's Board of Directors roster is current (it carries
    the CTO's record), and the legacy account ids on it."""
    members = read_table(export, 'groups/ifpa_committee_members.csv')
    ids = _ids(r['CommitteeMemberID'] for r in members
               if r['CommitteeID'] == BOARD_COMMITTEE_ID)
    return CTO_MEMBER_ID in ids, ids


def admin_ids(export: Path) -> set[str] | None:
    """Legacy accounts holding a valid admin record, or None when the export
    holds no admin table (the flag is then left unknown rather than false)."""
    admins = read_table(export, 'members-admin/admins.csv', required=False)
    if admins is None:
        return None
    return {r['AdminID'].strip() for r in admins
            if r['AdminValid'] == '1' and r['AdminID'].strip()}


def dump_completed(export: Path) -> str:
    """When the members dump was taken, as the refresh recorded it."""
    path = export / 'REFRESH_MANIFEST.tsv'
    if not path.is_file():
        raise Refused(f'{path} is missing. Run legacy_data/scripts/refresh_legacy_repo_data.py '
                      'to write the export, then re-run.')
    for line in path.read_text(encoding='utf-8').splitlines():
        cols = line.split('\t')
        if cols[0] == MEMBERS_SOURCE and len(cols) > 4:
            return cols[4]
    raise Refused(f'{path} records no {MEMBERS_SOURCE}; the export is incomplete.')


def cutover_epoch(cutover_date: str | None) -> int:
    if not cutover_date:
        raise Refused('--cutover-date is required: the moment annual memberships are '
                      'measured against is always given, never taken from the run day.')
    try:
        datetime.strptime(cutover_date, '%Y-%m-%d')
    except ValueError:
        raise Refused(f'--cutover-date {cutover_date!r} is not a YYYY-MM-DD date.') from None
    return int(datetime.strptime(cutover_date, '%Y-%m-%d')
               .replace(tzinfo=timezone.utc).timestamp())


def member_csvs(members: list[dict], epoch: int, admins: set[str] | None,
                board_ids: list[str] | None, name_encodings: dict) -> tuple[str, str, dict]:
    """The finished member CSV and the encoding-problems CSV, as text, plus the
    counts the report states. Refuses when any member's standing at the cutover
    date is not covered by a flag the claim can read."""
    roster = {mid: '' for mid in board_ids or []}
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=OUTPUT_FIELDS, lineterminator='\n')
    writer.writeheader()
    flags = dict.fromkeys(['legacy_ever_paid_tier2', 'legacy_ever_paid_tier1_lifetime',
                           'legacy_tier1_annual_active_at_cutover',
                           'legacy_was_board_at_cutover', 'legacy_is_admin'], 0)
    outcomes: dict[str, set[str]] = {}
    problems: list[dict] = []
    uncovered: list[str] = []
    for rec in members:
        mapped = map_record(rec, epoch, name_encodings, roster)
        member_id = mapped['legacy_member_id']
        if admins is not None:
            mapped['legacy_is_admin'] = '1' if member_id in admins else '0'
        why = tier_coverage_violation(rec, mapped, epoch)
        if why:
            uncovered.append(f'MemberID {member_id or "?"}: {why}')
        audit = audit_record_encoding(
            rec, *name_encodings.get(member_id, (None, frozenset(), None)))
        for how in audit['outcomes'].values():
            if how != SELECTED_UNICODE:
                outcomes.setdefault(how, set()).add(member_id)
        problems.extend(audit['problems'])
        for col in flags:
            flags[col] += mapped[col] == '1'
        writer.writerow(mapped)
    if uncovered:
        more = f'\n  ... and {len(uncovered) - 20} more' if len(uncovered) > 20 else ''
        raise Refused(f'tier-flag coverage failed on {len(uncovered)} member(s): the derived '
                      'flags must cover the standing the legacy site computes at the cutover '
                      'date.\n  ' + '\n  '.join(uncovered[:20]) + more)
    prob = io.StringIO()
    pw = csv.DictWriter(prob, lineterminator='\n', fieldnames=[
        'legacy_member_id', 'column', 'reason', 'resolution',
        'stored_unicode_column', 'stored_plain_column'])
    pw.writeheader()
    for row in sorted(problems, key=lambda r: (r['legacy_member_id'], r['column'])):
        pw.writerow(row)
    stats = {'rows': len(members), 'flags': flags,
             'outcomes': {k: len(v) for k, v in sorted(outcomes.items())},
             'problems': len(problems)}
    return out.getvalue(), prob.getvalue(), stats


def report_text(cutover_date: str, dumped: str, stats: dict, admins: set[str] | None,
                board_current: bool, board_ids: list[str], seeds: dict[str, list[str]],
                events: list[str], exclusions: str, tallies: dict) -> str:
    f = stats['flags']
    board = (f'PASS: the roster carries the CTO record, so its {len(board_ids)} account(s) '
             'carry the board flag' if board_current else
             'FAIL: the roster does not carry the CTO record, so it is not the sitting board '
             'and no account carries the board flag; administrators set board standing by '
             'hand after cutover')
    lines = ['# Legacy publish report', '',
             'Written by `legacy_data/scripts/publish_legacy_repo_data.py` from the legacy',
             'export. Counts only; no member data.', '',
             f'- Cutover date (annual memberships measured at): {cutover_date}',
             f'- Members dump taken: {dumped}',
             f'- Member rows: {stats["rows"]}',
             f'- Ever held Tier 2: {f["legacy_ever_paid_tier2"]}',
             f'- Tier 1 lifetime: {f["legacy_ever_paid_tier1_lifetime"]}',
             f'- Tier 1 annual active at cutover: {f["legacy_tier1_annual_active_at_cutover"]}',
             '- Tier-flag coverage: PASS (every computed standing is carried by a flag)',
             '- Legacy admin flag: ' + (f'{f["legacy_is_admin"]} account(s)' if admins is not None
                                        else 'unknown (the export holds no admin table)'),
             f'- Board of Directors roster: {board}',
             f'- Board flag set: {f["legacy_was_board_at_cutover"]}',
             f'- Name values left as delivered (see the encoding-problems CSV): '
             f'{stats["problems"]}', '',
             '## Name and place repairs, members per outcome', '',
             '| Outcome | Members |', '|---|---:|']
    lines += [f'| {how} | {n} |' for how, n in stats['outcomes'].items()]
    lines += ['', '## Vote tallies', '',
              f'- Ballots read (none written): {tallies["ballots"]}',
              f'- Numbered answer cells: {tallies["numbered"]}',
              f'- Ballots with no numbered answer: {tallies["no_answer"]}',
              f'- Cells where the ballots and the stored tally disagree: '
              f'{tallies["disagree"]}',
              f'- Numbered cells the live-site capture does not cover: '
              f'{tallies["unmatched"]}']
    lines += ['', '## Crawl inputs', '', '| File | Entries |', '|---|---:|']
    lines += [f'| `{SEEDS_REL}/{name}` | {len(urls)} |' for name, urls in seeds.items()]
    lines += [f'| `{EVENT_IDS_REL}` | {len(events)} |',
              f'| `CRAWL_EXCLUSIONS.txt` | '
              f'{sum(1 for x in exclusions.splitlines() if x and not x.startswith("#"))} |', '']
    return '\n'.join(lines)


README = """# legacy-publish

Written by `legacy_data/scripts/publish_legacy_repo_data.py` in the public checkout,
from the vetted CSVs in `legacy-export/` and the curated member name-encoding record.
Derived, not authored: re-run that script after each accepted delivery, with the
cutover date, rather than editing anything here.

- `legacy_members.csv`: the finished member CSV the member load reads.
- `legacy_members_encoding_problems.csv`: the name values the repair left as
  delivered, for a follow-up ruling.
- `vote-tallies/ifpa_issue_vote_tallies.csv`: the IFPA vote tallies derived from
  the ballot rows, one row per issue and answer, with the answer text alongside.
  No ballot-level row and no member id is written anywhere.
- `vote-tallies/tally_reconciliation.csv`: the same counts beside the
  application's own stored tally and the live-site capture's count, with a status
  per cell. The three are kept side by side rather than reconciled into one
  number, because which is right is a records question, not an arithmetic one.
- `PUBLISH_REPORT.md`: the cutover date, the dump date and the counts behind all
  of the above.
- `audit/`: the one authored part, never written by this script. It holds the
  figures audited for the delivery, which the member-data audit checks every
  built database against; a new delivery is re-audited there as a data edit.

Committed because the member load reads the member CSV and the version committed
at cutover is the record of what was loaded, and because the vote tallies are the
IFPA voting record that outlives the legacy site.
"""


def build(private: Path, mirror: Path, cutover_date: str | None) -> tuple[dict, dict]:
    """Every output as (private files, public files), path -> text. Builds all
    of it before anything is written, so a refusal leaves no partial publish."""
    epoch = cutover_epoch(cutover_date)
    export = private / EXPORT_DIR
    members = read_table(export, 'members/members.csv')
    admins = admin_ids(export)
    board_current, board_ids = board_roster(export)
    dumped = dump_completed(export)
    try:
        name_encodings = load_member_name_encodings()
    except SystemExit as err:
        raise Refused(str(err)) from None
    members_csv, problems_csv, stats = member_csvs(
        members, epoch, admins, board_ids if board_current else None, name_encodings)
    seeds = seed_lists(export, members)
    events = approved_event_ids(export)
    exclusions = crawl_exclusions(export)
    tallies_csv, reconciliation_csv, tally_stats = vote_tallies(export, private)
    publish = private / PUBLISH_DIR
    private_files = {
        publish / 'legacy_members.csv': members_csv,
        publish / 'legacy_members_encoding_problems.csv': problems_csv,
        publish / TALLIES_DIR / 'ifpa_issue_vote_tallies.csv': tallies_csv,
        publish / TALLIES_DIR / 'tally_reconciliation.csv': reconciliation_csv,
        publish / 'PUBLISH_REPORT.md': report_text(
            cutover_date, dumped, stats, admins, board_current, board_ids, seeds,
            events, exclusions, tally_stats),
        publish / 'README.md': README,
        private / EXCLUSIONS_REL: exclusions,
        private / INVENTORY_REL: group_file_inventory(export),
    }
    public_files = {mirror / SEEDS_REL / name: '\n'.join(urls) + '\n'
                    for name, urls in seeds.items()}
    public_files[mirror / EVENT_IDS_REL] = ''.join(f'{e}\n' for e in events)
    return private_files, public_files


def write(files: dict[Path, str], owner_only: bool) -> None:
    for path, text in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf-8', newline='')
        if owner_only:
            path.chmod(0o600)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--cutover-date', metavar='YYYY-MM-DD',
                    help='the moment annual memberships are measured against (required)')
    args = ap.parse_args(argv)
    try:
        if not PRIVATE.is_dir():
            raise Refused(f'footbag_private_repo (the private checkout) is not reachable at '
                          f'{REPO_ROOT}. Wire the symlink (scripts/setup_private_repo.sh) '
                          'and re-run.')
        private_files, public_files = build(PRIVATE, MIRROR, args.cutover_date)
    except Refused as err:
        print(f'REFUSED: {err}', file=sys.stderr)
        print('Nothing was written.', file=sys.stderr)
        return 1
    old_umask = os.umask(0o077)
    try:
        write(private_files, owner_only=True)
    finally:
        os.umask(old_umask)
    write(public_files, owner_only=False)
    for path in [*private_files, *public_files]:
        print(f'  wrote {path.relative_to(path.parents[1])}')
    print(f'Published for cutover date {args.cutover_date}. Review PUBLISH_REPORT.md and the '
          'diffs, then commit in each repository.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

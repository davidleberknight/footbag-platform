#!/usr/bin/env python3
"""Extract the legacy-site `members` dump into the canonical loader-input CSV.

Parses a MariaDB mysqldump of the `members` table and emits the credential-free
CSV that `legacy_data/member_data_scripts/load_legacy_export.py` consumes. The dump uses
positional extended INSERTs (`INSERT INTO members VALUES (...),(...)` with no
column list), so values are mapped to columns by the `CREATE TABLE` column
order, then to canonical loader fields by column name.

Division of responsibility: the loader owns ALL source-validity filtering, the
linkage pull-back, the credential-header abort backstop, and the per-rule
exclusion counts. This extractor only maps faithfully (no filtering: every
member row is emitted with `member_valid` verbatim) and reports the dump-level
counts the loader cannot see (rows examined, distinct MemberID, per-email-column
population). The one thing it refuses to map faithfully is a contradiction: when
a cutover date makes the legacy site's own tier computation available, the run
aborts without writing a CSV if any row's derived tier flags fail to cover the
standing that computation returns.

Credentials: the `MemberPassword` and `MemberSession` tuple positions are passed
over during parsing but their values are never mapped to a field, retained,
logged, emitted, or written. Reads the dump read-only; writes only the output
CSV and a summary to stdout.
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _dump_parser import parse_create_columns, parse_value_tuples  # noqa: E402

# Never mapped, retained, logged, emitted, or written.
CREDENTIAL_COLUMNS = {"MemberPassword", "MemberSession"}

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

# Board / Tier 3 standing is not derived from legacy data. It is an
# administrator-set flag on the live member row, applied after cutover to the
# handful of sitting directors. No legacy tier value encodes governance status,
# so the extractor makes no board determination: every row carries a definite
# non-board flag and no underlying paid tier.


def parse_member_columns(sql: str) -> list[str]:
    """Ordered column names from `CREATE TABLE members (...)`."""
    return parse_create_columns(sql, "members")


def iter_member_rows(sql: str, columns: list[str]):
    """Yield {column_name: value} dicts for every members row, dropping the
    credential columns so their values never enter a mapped record."""
    keep = [c for c in columns if c not in CREDENTIAL_COLUMNS]
    for m in re.finditer(r"INSERT INTO `members` VALUES ", sql):
        for values in parse_value_tuples(sql[m.end():]):
            rec = dict(zip(columns, values))
            yield {c: rec.get(c) for c in keep}   # credential keys excluded


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
ALLOWED_CODEPAGES = frozenset({"cp1250", "cp1251", "iso8859-5"})


# Which stored column each curated field token names.
CURATED_FIELD_COLUMNS = {
    "given": "MemberFirstName",
    "middle": "MemberMiddleName",
    "surname": "MemberLastName",
}


def load_member_name_encodings(
    path: Path = MEMBER_NAME_ENCODINGS_CSV,
) -> dict[str, tuple[str, frozenset[str]]]:
    """Curated member id -> (codepage, the columns it applies to).

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
    out: dict[str, tuple[str, frozenset[str]]] = {}
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
            out[mid] = (cp, frozenset(CURATED_FIELD_COLUMNS[t] for t in tokens))
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
                  codepage: str | None = None) -> tuple[str, str]:
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
        curated = decode_through_codepage(base_val, codepage)
        if curated is not None:
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
                    codepage: str | None = None) -> str:
    value, _ = _resolve_pair(_val(rec, base), _val(rec, uni), codepage)
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
                          fields: frozenset[str] = frozenset()) -> dict:
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
        value, how = _resolve_pair(base_val, uni_val, cp)
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
               name_encodings: dict[str, str] | None = None) -> dict:
    """Map a members row to the canonical loader-input fields."""
    # Only the name columns consult the curated codepage. A member's city or
    # country carrying the same damage is a different question and is not what
    # was ruled on, and the surname is what gates their claim.
    codepage, fields = (name_encodings or {}).get(_val(rec, "MemberID"), (None, frozenset()))

    def cp_for(column: str) -> str | None:
        return codepage if column in fields else None

    first = _prefer_unicode(rec, "MemberFirstName", "MemberFirstNameUnicode",
                            cp_for("MemberFirstName"))
    middle = _prefer_unicode(rec, "MemberMiddleName", "MemberMiddleNameUnicode",
                             cp_for("MemberMiddleName"))
    last = _prefer_unicode(rec, "MemberLastName", "MemberLastNameUnicode",
                           cp_for("MemberLastName"))
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
        "bio":              _val(rec, "MemberComment"),
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
        "legacy_was_board_at_cutover":       "0",
        "legacy_board_underlying_paid_tier": "",
        # Raw source record-modification timestamp, carried through untouched so
        # the shared-email resolver can parse and validate it centrally. The
        # extraction layer transports the evidence; it does not decide ownership.
        "legacy_member_modified":            _val(rec, "MemberModified"),
    }


def parse_cutover_date(cutover_date: str | None) -> int | None:
    """A YYYY-MM-DD cutover date becomes the start-of-day UTC epoch that annual
    expirations are compared against; None keeps the annual derivation inert."""
    if not cutover_date:
        return None
    try:
        dt = datetime.strptime(cutover_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise SystemExit(
            f"error: invalid cutover date {cutover_date!r} (expected YYYY-MM-DD)"
        )
    return int(dt.timestamp())


_DUMP_COMPLETED_RE = re.compile(r"^-- Dump completed on (\d{4}-\d{2}-\d{2})", re.MULTILINE)


def _dump_generation_date(members_sql: Path, sql: str) -> tuple[date, str, str]:
    """Return (generation_date, source_label, detail) for the dump. The
    mysqldump `-- Dump completed on` trailer is the authoritative evidence of
    when the dump was taken; the file mtime is only a fallback and the source
    label names which was used, so the sign-off record shows it plainly."""
    m = _DUMP_COMPLETED_RE.search(sql)
    if m:
        return (date.fromisoformat(m.group(1)), "dump-completion trailer",
                f"-- Dump completed on {m.group(1)}")
    mtime_date = datetime.fromtimestamp(
        members_sql.stat().st_mtime, tz=timezone.utc).date()
    return (mtime_date, "file mtime (FALLBACK: no dump-completion trailer)",
            f"mtime {mtime_date.isoformat()}")


def _max_member_modified(sql: str, columns: list[str]) -> int | None:
    """Max `MemberModified` epoch across all member rows, or None when the
    column is absent or unpopulated. `MemberModified` is the member-record
    write timestamp; logins (`MemberLastLogin`) are deliberately not used
    because they continue right up to dump time and would misreport member
    activity as running past the freeze."""
    best: int | None = None
    for rec in iter_member_rows(sql, columns):
        raw = rec.get("MemberModified")
        try:
            v = int(raw)
        except (TypeError, ValueError):
            continue
        if v > 0 and (best is None or v > best):
            best = v
    return best


def assert_final_export_freshness(
    members_sql: Path, sql: str, columns: list[str],
    cutover_date: str, cutover_epoch: int,
) -> dict:
    """Freshness gate for the final production load. Asserts, at day
    granularity, that the dump was captured after the declared write-freeze
    date, in two directions, and aborts (SystemExit) before any CSV is written:

      - the dump's own completion date is not before the freeze date, because a
        pre-freeze dump is missing final member data, and
      - no member was modified after the freeze date, because a later
        modification means the freeze was not enforced or the declared date is
        wrong, and the cutover tier derivations key off that moment.

    Returns the evidence (dump date and its source, max MemberModified, freeze
    date) for the sign-off record on PASS.
    """
    freeze_date = date.fromisoformat(cutover_date)
    gen_date, gen_source, gen_detail = _dump_generation_date(members_sql, sql)
    if gen_date < freeze_date:
        raise SystemExit(
            "error: final-export freshness gate FAILED — the dump was generated "
            f"{gen_date.isoformat()} ({gen_source}), before the declared write-freeze "
            f"date {freeze_date.isoformat()}. A pre-freeze dump is missing final member "
            "data; recapture the dump after the write freeze and retry."
        )

    max_mod = _max_member_modified(sql, columns)
    freeze_day_end = cutover_epoch + 86400  # start of the day after the freeze, UTC
    if max_mod is not None and max_mod >= freeze_day_end:
        mod_iso = datetime.fromtimestamp(max_mod, tz=timezone.utc).isoformat()
        raise SystemExit(
            "error: final-export freshness gate FAILED — a member was modified "
            f"{mod_iso}, after the declared write-freeze date {freeze_date.isoformat()}. "
            "Either the freeze was not enforced or the freeze date is wrong; the cutover "
            "tier derivations would be computed against the wrong moment."
        )

    return {
        "generation_date": gen_date.isoformat(),
        "generation_source": gen_source,
        "generation_detail": gen_detail,
        "max_member_modified_epoch": max_mod,
        "max_member_modified_iso":
            datetime.fromtimestamp(max_mod, tz=timezone.utc).isoformat() if max_mod else None,
        "freeze_date": freeze_date.isoformat(),
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


def extract(members_sql: Path, out_csv: Path, cutover_date: str | None = None,
            final_export: bool = False) -> dict:
    sql = members_sql.read_text(encoding="utf-8", errors="replace")
    columns = parse_member_columns(sql)
    cutover_epoch = parse_cutover_date(cutover_date)

    freshness = None
    if final_export:
        if cutover_epoch is None:
            raise SystemExit(
                "error: --final-export requires --cutover-date / FOOTBAG_CUTOVER_DATE "
                "(the declared write-freeze date)"
            )
        freshness = assert_final_export_freshness(
            members_sql, sql, columns, cutover_date, cutover_epoch)

    examined = 0
    tier_flags = {
        "legacy_ever_paid_tier2": 0,
        "legacy_ever_paid_tier1_lifetime": 0,
        "legacy_tier1_annual_active_at_cutover": 0,
    }
    distinct_ids: set[str] = set()
    email_pop = {"legacy_email": 0, "legacy_email2": 0, "legacy_email3": 0}
    coverage_failures: list[str] = []
    coverage_checked_failed = 0
    # Members whose name resolved each way, and the field values this pass
    # deliberately leaves alone. Counted per delivery: the rules below are fixed,
    # the tally they produce is a property of the dump being extracted.
    name_repair: dict[str, set[str]] = {
        SELECTED_COMPANION: set(), SELECTED_REVERSED: set(),
        SELECTED_UNDAMAGED: set(), SELECTED_LEFT: set(),
        SELECTED_CURATED: set(),
    }
    city_repair: dict[str, set[str]] = {
        SELECTED_COMPANION: set(), SELECTED_REVERSED: set(),
        SELECTED_UNDAMAGED: set(), SELECTED_LEFT: set(),
        SELECTED_CURATED: set(),
    }
    problems: list[dict] = []
    name_encodings = load_member_name_encodings()

    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=OUTPUT_FIELDS, lineterminator="\n")
        w.writeheader()
        for rec in iter_member_rows(sql, columns):
            mapped = map_record(rec, cutover_epoch, name_encodings)
            examined += 1
            cp_rule = name_encodings.get(_val(rec, "MemberID"), (None, frozenset()))
            audit = audit_record_encoding(rec, cp_rule[0], cp_rule[1])
            member_id = mapped["legacy_member_id"] or ""
            for base, how in audit["outcomes"].items():
                if how == SELECTED_UNICODE:
                    continue
                if base in ("MemberFirstName", "MemberMiddleName", "MemberLastName"):
                    name_repair[how].add(member_id)
                elif base == "MemberCity":
                    city_repair[how].add(member_id)
            problems.extend(audit["problems"])
            if cutover_epoch is not None:
                why = tier_coverage_violation(rec, mapped, cutover_epoch)
                if why:
                    coverage_checked_failed += 1
                    if len(coverage_failures) < 20:
                        coverage_failures.append(
                            f"MemberID {mapped['legacy_member_id'] or '?'}: {why}")
            for col in tier_flags:
                if mapped[col] == "1":
                    tier_flags[col] += 1
            if mapped["legacy_member_id"]:
                distinct_ids.add(mapped["legacy_member_id"])
            for col in email_pop:
                if mapped[col]:
                    email_pop[col] += 1
            w.writerow(mapped)

    if coverage_checked_failed:
        # The CSV is removed rather than left behind: a tier-mapping defect is
        # silent downstream (a member simply arrives at the wrong tier), so the
        # run must not hand on output that a later step would load without
        # re-checking.
        out_csv.unlink(missing_ok=True)
        detail = "\n".join(f"    {line}" for line in coverage_failures)
        more = ("\n    ... and "
                f"{coverage_checked_failed - len(coverage_failures)} more"
                if coverage_checked_failed > len(coverage_failures) else "")
        raise SystemExit(
            f"error: tier-flag quality check failed on {coverage_checked_failed} "
            f"row(s); no CSV written.\n"
            f"  The derived flags must cover the standing the legacy site's own "
            f"tier function computes at the cutover moment.\n{detail}{more}"
        )

    # The values this pass will not touch go to their own file, so a follow-up
    # ruling has the evidence and nothing is folded into a repair count.
    problems_csv = out_csv.parent / "legacy_members_encoding_problems.csv"
    with problems_csv.open("w", newline="", encoding="utf-8") as fh:
        pw = csv.DictWriter(
            fh, lineterminator="\n",
            fieldnames=["legacy_member_id", "column", "reason", "resolution",
                        "stored_unicode_column", "stored_plain_column"])
        pw.writeheader()
        for row in sorted(problems, key=lambda r: (r["legacy_member_id"], r["column"])):
            pw.writerow(row)

    return {
        "columns_in_dump": len(columns),
        "rows_examined": examined,
        "distinct_member_id": len(distinct_ids),
        "email_population": email_pop,
        "name_repair": {k: len(v) for k, v in name_repair.items()},
        "city_repair": {k: len(v) for k, v in city_repair.items()},
        # Every member whose name did not come through as the unicode column
        # delivered it, whichever route decided the value — including the curated
        # codepage, which is a repair and not a fifth kind of failure.
        "name_members_repaired": len(
            name_repair[SELECTED_COMPANION] | name_repair[SELECTED_REVERSED]
            | name_repair[SELECTED_UNDAMAGED] | name_repair[SELECTED_LEFT]
            | name_repair[SELECTED_CURATED]),
        "name_members_by_curated_codepage": len(name_repair[SELECTED_CURATED]),
        "encoding_problems": len(problems),
        "encoding_problems_csv": problems_csv,
        "tier_flags": tier_flags,
        "tier_coverage_checked": cutover_epoch is not None,
        "cutover_epoch": cutover_epoch,
        "freshness": freshness,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--members-sql", required=True, type=Path,
                    help="path to the members mysqldump (members/backups/latest.sql)")
    ap.add_argument("--out", required=True, type=Path,
                    help="output canonical CSV path")
    ap.add_argument("--cutover-date", default=os.environ.get("FOOTBAG_CUTOVER_DATE") or None,
                    help="go-live write-freeze date (YYYY-MM-DD) that Tier-1 annual "
                         "expirations are compared against; defaults to the "
                         "FOOTBAG_CUTOVER_DATE env var. Without it the annual-active "
                         "derivation is inert and flags no row.")
    ap.add_argument("--final-export", action="store_true",
                    help="final production-load mode: assert the dump was captured "
                         "after the declared write-freeze date (requires --cutover-date). "
                         "Aborts before writing any CSV if the dump's completion date "
                         "predates the freeze date or a member was modified after it. "
                         "Off for ordinary development and CI extraction.")
    args = ap.parse_args()

    if not args.members_sql.is_file():
        raise SystemExit(f"error: members dump not found: {args.members_sql}")

    stats = extract(args.members_sql, args.out, args.cutover_date,
                    final_export=args.final_export)
    ep = stats["email_population"]
    tf = stats["tier_flags"]
    print(f"extract_legacy_members -> {args.out}")
    if stats.get("freshness"):
        fr = stats["freshness"]
        print("  final-export freshness:  PASS")
        print(f"    dump generated:       {fr['generation_date']} ({fr['generation_source']})")
        mm = fr["max_member_modified_iso"] or "n/a (MemberModified column absent)"
        print(f"    max MemberModified:   {mm}")
        print(f"    declared freeze date: {fr['freeze_date']}")
    print(f"  columns in dump:        {stats['columns_in_dump']}")
    print(f"  rows examined:          {stats['rows_examined']}")
    print(f"  distinct MemberID:      {stats['distinct_member_id']}")
    print(f"  MemberEmail populated:  {ep['legacy_email']}")
    print(f"  MemberEmail2 populated: {ep['legacy_email2']}")
    print(f"  MemberEmail3 populated: {ep['legacy_email3']}")
    print(f"  ever-paid Tier 2:       {tf['legacy_ever_paid_tier2']}")
    print(f"  Tier 1 lifetime:        {tf['legacy_ever_paid_tier1_lifetime']}")
    annual_note = "" if stats["cutover_epoch"] is not None else \
        "  (derivation inert: no --cutover-date / FOOTBAG_CUTOVER_DATE)"
    print(f"  Tier 1 annual active:   {tf['legacy_tier1_annual_active_at_cutover']}{annual_note}")
    if stats["tier_coverage_checked"]:
        print("  tier-flag coverage:     PASS (every computed standing is carried by a flag)")
    else:
        print("  tier-flag coverage:     not checked (needs a cutover date to compute standing)")
    nr, cr = stats["name_repair"], stats["city_repair"]
    print(f"  names repaired:         {stats['name_members_repaired']} member(s)")
    print(f"    from clean companion: {nr[SELECTED_COMPANION]}")
    print(f"    by reversal:          {nr[SELECTED_REVERSED]}")
    print(f"    from undamaged column:{nr[SELECTED_UNDAMAGED]}")
    print(f"    left as delivered:    {nr[SELECTED_LEFT]}")
    print(f"  cities repaired:        "
          f"{cr[SELECTED_COMPANION] + cr[SELECTED_REVERSED] + cr[SELECTED_UNDAMAGED]}"
          f"  (left as delivered: {cr[SELECTED_LEFT]})")
    print(f"  encoding problems:      {stats['encoding_problems']} field value(s) "
          f"not touched -> {stats['encoding_problems_csv']}")
    print("  (no filtering applied; the loader filters + pulls back)")


if __name__ == "__main__":
    main()

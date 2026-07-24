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
population).

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

# The legacy site's IFPA tier code-set, taken from the site's own admin PHP
# (the tier-conversion routine and the event auto-join routine), not inferred
# from the dump's data values. `MemberIFPATier` is 0, 1, or 2:
#   0 = never paid.
#   1 = Tier 1. The site's one-time tier conversion granted every ever-paid
#       member Tier 1 lifetime (MemberIFPAExpiration = -1, even if lapsed at
#       conversion time); event auto-join afterwards issued Tier 1 annual with
#       a real future MemberIFPAExpiration epoch.
#   2 = Tier 2 (MemberIFPAExpiration2 = -1 lifetime, else annual).
TIER1_CODE = "1"
TIER2_CODE = "2"
LIFETIME_EXPIRATION = "-1"

# The IFPA-tier code(s) in the member dump that denote board / Tier 3 governance
# status at cutover. The committee-membership tables are the authoritative board
# signal, but their rows have not been delivered; until then the only available
# signal is the member's IFPA tier code, and only if that code distinguishes a
# board value.
# Current: the code that denotes board is not yet confirmed against the delivered
# dump, so this set is empty and no member is marked board (nothing is guessed).
# Target: set to the confirmed code(s) once verified; board derivation then moves
# to the committee tables once their rows are delivered.
BOARD_IFPA_TIER_CODES: frozenset[str] = frozenset()

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


def _prefer_unicode(rec: dict, base: str, uni: str) -> str:
    u = _val(rec, uni)
    return u if u else _val(rec, base)


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


def derive_ever_paid_tier2(ifpa_tier_code: str) -> str:
    """'1' when the member holds the Tier-2 code. Tier-2 standing at cutover
    implies having paid; any other code carries no flag. This is accepted as
    underinclusive: a member who once paid Tier 2 but no longer holds the code
    claims on their remaining flags or honors instead."""
    return "1" if (ifpa_tier_code or "").strip() == TIER2_CODE else "0"


def derive_ever_paid_tier1_lifetime(ifpa_tier_code: str, expiration_raw: str) -> str:
    """'1' when the member holds Tier 1 with the lifetime expiration sentinel
    (-1). The site's tier conversion granted lifetime Tier 1 to every ever-paid
    member, so this flag is the ever-paid-Tier-1 signal."""
    code = (ifpa_tier_code or "").strip()
    exp = (expiration_raw or "").strip()
    return "1" if code == TIER1_CODE and exp == LIFETIME_EXPIRATION else "0"


def derive_tier1_annual_active_at_cutover(
    ifpa_tier_code: str, expiration_raw: str, cutover_epoch: int | None,
) -> str:
    """'1' when the member holds Tier 1 annual (a real expiration epoch, not
    the -1 lifetime sentinel and not 0/none) that is still unexpired at the
    cutover moment. Without a cutover date the derivation is inert and no row
    is flagged (nothing is guessed); a lapsed annual carries no flag and the
    member claims on honors alone."""
    if cutover_epoch is None:
        return "0"
    if (ifpa_tier_code or "").strip() != TIER1_CODE:
        return "0"
    try:
        exp = int((expiration_raw or "").strip())
    except ValueError:
        return "0"
    if exp <= 0:
        return "0"
    return "1" if exp > cutover_epoch else "0"


def derive_board_at_cutover(ifpa_tier_code: str, board_codes: frozenset[str]) -> tuple[str, str]:
    """Map a member's IFPA tier code to the two board-at-cutover fields:
    (legacy_was_board_at_cutover, legacy_board_underlying_paid_tier).

    A board member carries underlying 'none' because the paid tier the board
    status reverts to cannot be reconstructed from the tier code alone; the
    claim-time mapping reads 'none' as a Tier 1 underlying unless an honor
    overrides it. A non-board member carries no underlying tier.
    """
    code = (ifpa_tier_code or "").strip()
    if code and code in board_codes:
        return "1", "none"
    return "0", ""


def map_record(rec: dict, cutover_epoch: int | None = None) -> dict:
    """Map a members row to the canonical loader-input fields."""
    first = _prefer_unicode(rec, "MemberFirstName", "MemberFirstNameUnicode")
    middle = _prefer_unicode(rec, "MemberMiddleName", "MemberMiddleNameUnicode")
    last = _prefer_unicode(rec, "MemberLastName", "MemberLastNameUnicode")
    real_name = " ".join(p for p in (first, middle, last) if p)
    alias = _val(rec, "MemberAlias")
    tier_code = _val(rec, "MemberIFPATier")
    expiration = _val(rec, "MemberIFPAExpiration")
    was_board, board_underlying = derive_board_at_cutover(
        tier_code, BOARD_IFPA_TIER_CODES)
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
        "legacy_ever_paid_tier2":            derive_ever_paid_tier2(tier_code),
        "legacy_ever_paid_tier1_lifetime":   derive_ever_paid_tier1_lifetime(tier_code, expiration),
        "legacy_tier1_annual_active_at_cutover":
            derive_tier1_annual_active_at_cutover(tier_code, expiration, cutover_epoch),
        "legacy_was_board_at_cutover":       was_board,
        "legacy_board_underlying_paid_tier": board_underlying,
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
    board_at_cutover = 0
    tier_flags = {
        "legacy_ever_paid_tier2": 0,
        "legacy_ever_paid_tier1_lifetime": 0,
        "legacy_tier1_annual_active_at_cutover": 0,
    }
    distinct_ids: set[str] = set()
    email_pop = {"legacy_email": 0, "legacy_email2": 0, "legacy_email3": 0}

    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=OUTPUT_FIELDS, lineterminator="\n")
        w.writeheader()
        for rec in iter_member_rows(sql, columns):
            mapped = map_record(rec, cutover_epoch)
            examined += 1
            if mapped["legacy_was_board_at_cutover"] == "1":
                board_at_cutover += 1
            for col in tier_flags:
                if mapped[col] == "1":
                    tier_flags[col] += 1
            if mapped["legacy_member_id"]:
                distinct_ids.add(mapped["legacy_member_id"])
            for col in email_pop:
                if mapped[col]:
                    email_pop[col] += 1
            w.writerow(mapped)

    return {
        "columns_in_dump": len(columns),
        "rows_examined": examined,
        "distinct_member_id": len(distinct_ids),
        "email_population": email_pop,
        "tier_flags": tier_flags,
        "cutover_epoch": cutover_epoch,
        "board_at_cutover": board_at_cutover,
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
    board_note = "" if BOARD_IFPA_TIER_CODES else "  (derivation inert: no IFPA-tier board code configured)"
    print(f"  board at cutover:       {stats['board_at_cutover']}{board_note}")
    print("  (no filtering applied; the loader filters + pulls back)")


if __name__ == "__main__":
    main()

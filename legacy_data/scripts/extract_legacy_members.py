#!/usr/bin/env python3
"""Extract the legacy-site `members` dump into the canonical loader-input CSV.

Parses a MariaDB mysqldump of the `members` table and emits the credential-free
CSV that `legacy_data/scripts/load_legacy_export.py` consumes. The dump uses
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
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Never mapped, retained, logged, emitted, or written.
CREDENTIAL_COLUMNS = {"MemberPassword", "MemberSession"}

# Canonical loader-input columns; this list is the output CSV header order and
# matches load_legacy_export.py FIELD_ALIASES.
OUTPUT_FIELDS = [
    "legacy_member_id", "member_valid", "legacy_user_id",
    "legacy_email", "legacy_email2", "legacy_email3",
    "real_name", "display_name", "city", "region", "country",
    "bio", "birth_date", "street_address", "postal_code", "ifpa_join_date",
    "is_hof", "is_bap", "legacy_is_admin",
]

_ESCAPES = {"0": "\0", "b": "\b", "n": "\n", "r": "\r", "t": "\t",
            "Z": "\x1a", "\\": "\\", "'": "'", '"': '"'}


def parse_member_columns(sql: str) -> list[str]:
    """Ordered column names from `CREATE TABLE members (...)`."""
    m = re.search(r"CREATE TABLE `members` \((.*?)\n\) ENGINE", sql, re.S)
    if not m:
        raise SystemExit("error: `CREATE TABLE members` not found in dump")
    cols = []
    for line in m.group(1).splitlines():
        cm = re.match(r"\s*`([A-Za-z0-9_]+)`\s", line)
        if cm:
            cols.append(cm.group(1))
    return cols


def parse_value_tuples(blob: str):
    """Yield value tuples (lists; None for NULL) from a string that starts at
    an INSERT's first `(` and runs to its terminating top-level `;`."""
    i, n = 0, len(blob)
    while i < n:
        while i < n and blob[i] not in "(;":   # between tuples
            i += 1
        if i >= n or blob[i] == ";":            # end of this INSERT
            return
        i += 1                                  # past '('
        row: list = []
        while i < n and blob[i] != ")":
            while i < n and blob[i] in " ,\n\r\t":
                i += 1
            if i >= n or blob[i] == ")":
                break
            if blob[i] == "'":                  # quoted string
                i += 1
                buf = []
                while i < n:
                    c = blob[i]
                    if c == "\\" and i + 1 < n:
                        buf.append(_ESCAPES.get(blob[i + 1], blob[i + 1]))
                        i += 2
                        continue
                    if c == "'":
                        if i + 1 < n and blob[i + 1] == "'":  # '' -> '
                            buf.append("'")
                            i += 2
                            continue
                        i += 1
                        break
                    buf.append(c)
                    i += 1
                row.append("".join(buf))
            else:                               # NULL or number
                j = i
                while j < n and blob[j] not in ",)":
                    j += 1
                tok = blob[i:j].strip()
                row.append(None if tok.upper() == "NULL" else tok)
                i = j
        i += 1                                  # past ')'
        yield row


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


def map_record(rec: dict) -> dict:
    """Map a members row to the canonical loader-input fields."""
    first = _prefer_unicode(rec, "MemberFirstName", "MemberFirstNameUnicode")
    middle = _prefer_unicode(rec, "MemberMiddleName", "MemberMiddleNameUnicode")
    last = _prefer_unicode(rec, "MemberLastName", "MemberLastNameUnicode")
    real_name = " ".join(p for p in (first, middle, last) if p)
    alias = _val(rec, "MemberAlias")
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
    }


def extract(members_sql: Path, out_csv: Path) -> dict:
    sql = members_sql.read_text(encoding="utf-8", errors="replace")
    columns = parse_member_columns(sql)

    examined = 0
    distinct_ids: set[str] = set()
    email_pop = {"legacy_email": 0, "legacy_email2": 0, "legacy_email3": 0}

    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=OUTPUT_FIELDS, lineterminator="\n")
        w.writeheader()
        for rec in iter_member_rows(sql, columns):
            mapped = map_record(rec)
            examined += 1
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
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--members-sql", required=True, type=Path,
                    help="path to the members mysqldump (members/backups/latest.sql)")
    ap.add_argument("--out", required=True, type=Path,
                    help="output canonical CSV path")
    args = ap.parse_args()

    if not args.members_sql.is_file():
        raise SystemExit(f"error: members dump not found: {args.members_sql}")

    stats = extract(args.members_sql, args.out)
    ep = stats["email_population"]
    print(f"extract_legacy_members -> {args.out}")
    print(f"  columns in dump:        {stats['columns_in_dump']}")
    print(f"  rows examined:          {stats['rows_examined']}")
    print(f"  distinct MemberID:      {stats['distinct_member_id']}")
    print(f"  MemberEmail populated:  {ep['legacy_email']}")
    print(f"  MemberEmail2 populated: {ep['legacy_email2']}")
    print(f"  MemberEmail3 populated: {ep['legacy_email3']}")
    print("  (no filtering applied; the loader filters + pulls back)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Load the legacy-site member-account export into legacy_members.

This is the State-4 step-3 import (also run once earlier against the test
export): it supersedes the temporary mirror pre-seed with the export's full
profile fields, flipping import_source from 'mirror' to 'legacy_site_data'.
The export file is operator-supplied and never committed; this loader is
invoked from the cutover runbook, not from run_pipeline.sh.

Safety contract (in order):
  1. SAFETY ABORT before reading any row data: if any export column header
     looks credential-bearing (password / passwd / pwd / hash / salt /
     secret / recovery), the loader exits non-zero and writes nothing.
     Credentials must never reach this repository or database.
  2. Header schema validation: every REQUIRED field must resolve to exactly
     one export header via the alias table below; missing fields abort with
     the full header list so the mapping can be corrected deliberately.
     Unknown extra headers are reported, never silently imported.
  3. Source-validity filter with counted exclusions: MemberValid > 0;
     rows with no usable identity (no name, no display name, no handle,
     no email); structurally malformed rows (missing primary key); exact
     duplicate rows; clear test/placeholder rows. Every exclusion is
     counted per rule; nothing is dropped silently.
  4. Linkage exception pull-back: an otherwise-excluded row whose
     legacy_member_id is referenced by historical_persons (event results /
     honors provenance) is imported anyway and counted as an exception.
     Linkage always wins over the junk heuristics.
  5. Upsert keyed on legacy_member_id: an existing (pre-seeded) row is
     UPDATEd in place; a new row is INSERTed. Claim-state columns
     (claimed_by_member_id, claimed_at) are never touched, so a re-import
     cannot disturb completed claims. first_competition_year fills from
     historical_persons.first_year when a match exists.
  6. Dry-run by default; --apply performs the writes inside ONE
     transaction with honest per-category counters.

Intra-export collisions on legacy_email or legacy_user_id (the DB enforces
partial UNIQUE indexes on both) are excluded and reported for adjudication;
importing them would abort the transaction, and inventing NULLs for them
would silently change the data.

Usage:
  python legacy_data/scripts/load_legacy_export.py --export /path/to/export.csv [--db path] [--apply]
"""

import argparse
import csv
import os
import re
import sys
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
from datetime import datetime, timezone
from pathlib import Path

CREDENTIAL_HEADER_RE = re.compile(r"password|passwd|pwd|hash|salt|secret|recovery", re.IGNORECASE)

# Canonical field -> accepted export header spellings (case-insensitive).
# The webmaster's export headers are matched against this table; when the
# real export uses a header not listed here, add the alias deliberately
# rather than renaming the export column.
FIELD_ALIASES: dict[str, list[str]] = {
    "legacy_member_id": ["legacy_member_id", "memberid", "member_id", "id"],
    "member_valid":     ["membervalid", "member_valid", "valid"],
    "legacy_user_id":   ["legacy_user_id", "userid", "user_id", "username", "login", "handle"],
    "legacy_email":     ["legacy_email", "email", "emailaddress", "e_mail"],
    "real_name":        ["real_name", "realname", "name", "fullname", "full_name"],
    "display_name":     ["display_name", "displayname", "nickname"],
    "city":             ["city"],
    "region":           ["region", "state", "province"],
    "country":          ["country"],
    "bio":              ["bio", "profile", "about"],
    "birth_date":       ["birth_date", "birthdate", "dob", "dateofbirth"],
    "street_address":   ["street_address", "address", "streetaddress", "address1"],
    "postal_code":      ["postal_code", "zip", "zipcode", "postcode"],
    "ifpa_join_date":   ["ifpa_join_date", "joindate", "membersince", "join_date"],
    "is_hof":           ["is_hof", "hof", "ishof", "halloffame"],
    "is_bap":           ["is_bap", "bap", "isbap"],
    "legacy_is_admin":  ["legacy_is_admin", "admin", "isadmin", "is_admin"],
}
REQUIRED_FIELDS = ["legacy_member_id", "member_valid"]
# At least one of these must be non-empty for a row to count as having a
# usable identity.
IDENTITY_FIELDS = ["real_name", "display_name", "legacy_user_id", "legacy_email"]

TEST_PLACEHOLDER_NAMES = {"test", "testing", "asdf", "placeholder", "delete me", "deleteme", "xxx", "tbd"}

EXCLUSION_RULES = [
    "malformed",
    "member_valid",
    "no_identity",
    "duplicate",
    "test_placeholder",
    "email_conflict",
    "user_id_conflict",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize(name: str) -> str:
    return " ".join(name.strip().lower().split())


def truthy(value: str) -> int:
    return 1 if value.strip().lower() in {"1", "y", "yes", "true", "t"} else 0


def fail(msg: str) -> "None":
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def resolve_headers(headers: list[str]) -> dict[str, str]:
    """Maps canonical field names to actual export headers; aborts on
    credential-bearing or missing-required headers."""
    credential_hits = [h for h in headers if CREDENTIAL_HEADER_RE.search(h)]
    if credential_hits:
        fail(
            "export contains credential-bearing column(s): "
            f"{', '.join(credential_hits)}. The export must never include "
            "password, hash, salt, secret, or recovery material. Ask the "
            "legacy-site webmaster for a re-export without these columns. "
            "Nothing was read or written."
        )

    by_lower = {h.strip().lower(): h for h in headers}
    mapping: dict[str, str] = {}
    for field, aliases in FIELD_ALIASES.items():
        matches = [by_lower[a] for a in aliases if a in by_lower]
        if len(matches) > 1:
            fail(f"export has multiple columns mapping to '{field}': {matches}")
        if matches:
            mapping[field] = matches[0]

    missing = [f for f in REQUIRED_FIELDS if f not in mapping]
    if missing:
        fail(
            f"export is missing required column(s) {missing}. "
            f"Export headers seen: {headers}. If the export uses different "
            "spellings, add them to FIELD_ALIASES in this loader deliberately."
        )

    mapped_headers = set(mapping.values())
    unknown = [h for h in headers if h not in mapped_headers]
    if unknown:
        print(f"NOTE: ignoring unmapped export column(s): {unknown}")
    return mapping


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", required=True, help="path to the legacy-site member export CSV")
    ap.add_argument("--db", default=os.environ.get("FOOTBAG_DB_PATH", "database/footbag.db"))
    ap.add_argument("--apply", action="store_true",
                    help="perform the writes; without this flag the loader is a dry run")
    args = ap.parse_args()

    export_path = Path(args.export)
    if not export_path.exists():
        fail(f"export file not found: {export_path}")

    db_path = Path(args.db)
    if not db_path.exists():
        fail(
            f"database not found at {db_path}. Build it first (schema apply + "
            "legacy_data/scripts/load_legacy_members_seed.py pre-seed, wired in "
            "scripts/reset-local-db.sh)."
        )

    with export_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            fail(f"export file has no header row: {export_path}")
        headers = [h for h in reader.fieldnames if h is not None]
        mapping = resolve_headers(headers)
        raw_rows = list(reader)

    def field(row: dict[str, str], name: str) -> str:
        header = mapping.get(name)
        return (row.get(header) or "").strip() if header else ""

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    table_exists = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='legacy_members'"
    ).fetchone()
    if not table_exists:
        fail(
            "legacy_members table missing from the database. Apply "
            "database/schema.sql before running this loader."
        )

    linked_ids = {
        r["legacy_member_id"]
        for r in cur.execute(
            "SELECT legacy_member_id FROM historical_persons WHERE legacy_member_id IS NOT NULL"
        )
    }

    excluded: dict[str, list[str]] = {rule: [] for rule in EXCLUSION_RULES}
    exceptions_pulled_back: list[tuple[str, str]] = []  # (legacy_member_id, rule)
    importable: list[dict[str, str]] = []
    seen_exact: set[tuple[str, ...]] = set()
    pk_payloads: dict[str, tuple[str, ...]] = {}

    def consider_pull_back(row: dict[str, str], rule: str) -> None:
        pk = field(row, "legacy_member_id")
        excluded[rule].append(pk or "<missing-id>")
        # Linkage exception: results/honors provenance always wins over the
        # junk heuristics. A row with no primary key cannot be linked.
        if pk and pk in linked_ids and rule not in ("email_conflict", "user_id_conflict"):
            exceptions_pulled_back.append((pk, rule))
            importable.append(row)

    for row in raw_rows:
        pk = field(row, "legacy_member_id")
        payload = tuple(field(row, f) for f in FIELD_ALIASES)

        if not pk:
            excluded["malformed"].append("<missing-id>")
            continue
        if payload in seen_exact:
            # Exact duplicate of an earlier row: the first copy carries the
            # data; never pulled back (it is already represented).
            excluded["duplicate"].append(pk)
            continue
        if pk in pk_payloads and pk_payloads[pk] != payload:
            fail(
                f"export integrity violation: legacy_member_id '{pk}' appears "
                "more than once with DIFFERING data. The export must carry one "
                "row per account; ask the legacy-site webmaster to adjudicate "
                "before any import. Nothing was written."
            )
        seen_exact.add(payload)
        pk_payloads[pk] = payload

        valid_raw = field(row, "member_valid")
        try:
            member_valid = int(valid_raw)
        except ValueError:
            consider_pull_back(row, "malformed")
            continue
        if member_valid <= 0:
            consider_pull_back(row, "member_valid")
            continue
        if not any(field(row, f) for f in IDENTITY_FIELDS):
            consider_pull_back(row, "no_identity")
            continue
        name_norm = normalize(field(row, "real_name") or field(row, "display_name"))
        if name_norm in TEST_PLACEHOLDER_NAMES and not field(row, "legacy_email"):
            consider_pull_back(row, "test_placeholder")
            continue

        importable.append(row)

    # Intra-export collisions on the partially-UNIQUE columns. The colliding
    # rows after the first are excluded and reported; the uniqueness gates
    # decide the policy if the live export violates them.
    for unique_field, rule in (("legacy_email", "email_conflict"), ("legacy_user_id", "user_id_conflict")):
        seen_values: dict[str, str] = {}
        kept: list[dict[str, str]] = []
        for row in importable:
            value = field(row, unique_field)
            if value and value in seen_values:
                excluded[rule].append(field(row, "legacy_member_id"))
                continue
            if value:
                seen_values[value] = field(row, "legacy_member_id")
            kept.append(row)
        importable = kept

    ts = now_iso()
    updated_from_mirror = 0
    re_applied = 0
    inserted_new = 0

    update_sql = """
        UPDATE legacy_members SET
          legacy_user_id = ?, legacy_email = ?, real_name = ?, display_name = ?,
          display_name_normalized = ?, city = ?, region = ?, country = ?, bio = ?,
          birth_date = ?, street_address = ?, postal_code = ?, ifpa_join_date = ?,
          first_competition_year = COALESCE(
            (SELECT first_year FROM historical_persons WHERE legacy_member_id = ?),
            first_competition_year),
          is_hof = ?, is_bap = ?, legacy_is_admin = ?,
          import_source = 'legacy_site_data', imported_at = ?, version = version + 1
        WHERE legacy_member_id = ?
    """
    insert_sql = """
        INSERT INTO legacy_members (
          legacy_member_id, legacy_user_id, legacy_email, real_name, display_name,
          display_name_normalized, city, region, country, bio, birth_date,
          street_address, postal_code, ifpa_join_date, first_competition_year,
          is_hof, is_bap, legacy_is_admin, import_source, imported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          (SELECT first_year FROM historical_persons WHERE legacy_member_id = ?),
          ?, ?, ?, 'legacy_site_data', ?)
    """

    if args.apply:
        cur.execute("BEGIN")
    for row in importable:
        pk = field(row, "legacy_member_id")
        existing = cur.execute(
            "SELECT import_source FROM legacy_members WHERE legacy_member_id = ?", (pk,)
        ).fetchone()
        display_name = field(row, "display_name") or field(row, "real_name")
        real_name = field(row, "real_name") or field(row, "display_name")
        values_common = (
            field(row, "legacy_user_id") or None,
            field(row, "legacy_email") or None,
            real_name or None,
            display_name or None,
            normalize(display_name) if display_name else None,
            field(row, "city") or None,
            field(row, "region") or None,
            field(row, "country") or None,
            field(row, "bio") or None,
            field(row, "birth_date") or None,
            field(row, "street_address") or None,
            field(row, "postal_code") or None,
            field(row, "ifpa_join_date") or None,
            pk,
            truthy(field(row, "is_hof")),
            truthy(field(row, "is_bap")),
            truthy(field(row, "legacy_is_admin")),
            ts,
        )
        if existing:
            if existing["import_source"] == "mirror":
                updated_from_mirror += 1
            else:
                re_applied += 1
            if args.apply:
                cur.execute(update_sql, values_common + (pk,))
        else:
            inserted_new += 1
            if args.apply:
                cur.execute(insert_sql, (pk,) + values_common)
    if args.apply:
        conn.commit()
    conn.close()

    mode = "APPLY" if args.apply else "DRY-RUN (no writes; pass --apply to load)"
    print(f"legacy export load [{mode}]")
    print(f"  rows examined:            {len(raw_rows)}")
    for rule in EXCLUSION_RULES:
        ids = excluded[rule]
        suffix = f"  ({', '.join(ids[:8])}{', ...' if len(ids) > 8 else ''})" if ids else ""
        print(f"  excluded[{rule}]:".ljust(28) + f"{len(ids)}{suffix}")
    print(f"  exceptions pulled back:   {len(exceptions_pulled_back)}"
          + (f"  ({', '.join(f'{pk}[{rule}]' for pk, rule in exceptions_pulled_back[:8])})"
             if exceptions_pulled_back else ""))
    print(f"  imported total:           {updated_from_mirror + re_applied + inserted_new}")
    print(f"    updated from mirror:    {updated_from_mirror}")
    print(f"    re-applied (export):    {re_applied}")
    print(f"    inserted new:           {inserted_new}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Reconcile seed/clubs.csv against the authoritative approved club universe.

The legacy clubs-module dump's `Approved=1` `ClubID`s are the authoritative
club-key universe. This overlay regenerates seed/clubs.csv so it contains
exactly that approved key set:

  - an approved key already present in the seed keeps its existing
    (mirror-enriched) row verbatim, byte-for-byte;
  - an approved key not in the seed gets a dump-derived row;
  - a seeded key that is not approved in the current dump is dropped.

Password and every other credential-like field are never emitted. A dump-only
club carries an empty contact_member_id, so the four-way classifier's substitute
contact predicate applies; the club contact is never inferred from clubcontacts,
which the migration treats as corroboration only and this tool does not read.

Machine-local input: the dump lives outside the repository, reached through the
`FOOTBAG_LEGACY_REPO` env var or the `footbag_legacy_repo` symlink. When the dump
is unavailable the overlay is a clean no-op and downstream runs on the existing
seed; when the dump is present but malformed or yields no approved rows the
overlay fails closed and leaves the seed untouched.
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = Path(__file__).resolve().parent

# The shared mysqldump parser (one home; imported, never re-implemented) and the
# mirror extractor's PII scrubber both live under legacy_data/.
sys.path.insert(0, str(REPO_ROOT / "legacy_data" / "member_data_scripts"))
sys.path.insert(0, str(SCRIPTS_DIR))
from _dump_parser import (  # noqa: E402
    module_dump_path,
    parse_value_tuples,
    resolve_dump_root,
)
from extract_clubs import _scrub_description_pii  # noqa: E402


def _dump_clubs_columns(sql: str) -> list[str]:
    """Ordered clubs column names, tolerant of the closing clause. The shared
    member-dump column parser keys on a `) ENGINE=...` close; the clubs dump
    closes its CREATE TABLE with a bare `);`, so the column block is matched here
    up to whatever terminates the statement. Non-column lines (KEY / UNIQUE KEY /
    PRIMARY KEY) do not start with a backtick-quoted name and are skipped."""
    m = re.search(r"CREATE TABLE `clubs` \((.*?)\n\)[^\n]*;", sql, re.S)
    if not m:
        raise SystemExit("overlay_clubs aborted: `CREATE TABLE clubs` not found in the dump.")
    cols: list[str] = []
    for line in m.group(1).splitlines():
        cm = re.match(r"\s*`([A-Za-z0-9_]+)`\s", line)
        if cm:
            cols.append(cm.group(1))
    return cols

DEFAULT_SEED = REPO_ROOT / "legacy_data" / "seed" / "clubs.csv"

FIELDNAMES = [
    "legacy_club_key",
    "name",
    "city",
    "region",
    "country",
    "contact_member_id",
    "external_url",
    "description",
    "created",
    "last_updated",
]

# Never carried into the public-repo seed, per the same credential-exclusion rule
# the member export follows.
CREDENTIAL_DUMP_COLUMNS = {"Password"}


def _epoch_to_datetime_text(raw: str | None) -> str:
    """A legacy CMS epoch becomes a UTC datetime string in the same shape the
    mirror timestamps use, so the classifier's year extractor reads it the same
    way. 0 / empty / unparseable means unknown and stays blank."""
    if not raw:
        return ""
    try:
        secs = int(str(raw).strip())
    except ValueError:
        return ""
    if secs <= 0:
        return ""
    return datetime.fromtimestamp(secs, tz=timezone.utc).strftime("%a %b %d %H:%M:%S %Y")


def _clean(text: str | None) -> str:
    return "" if text is None else str(text).strip()


def _prefer(primary: str | None, fallback: str | None) -> str:
    p = _clean(primary)
    return p if p else _clean(fallback)


def dump_row_to_seed_row(rec: dict) -> dict:
    """Map one approved dump clubs record (column_name -> value) to a seed row.

    A credential column is never read. contact_member_id is left empty: the dump
    clubs table carries no primary-contact column, and clubcontacts is
    corroboration only, so a dump-only club resolves its contact through the
    classifier's substitute predicate instead.
    """
    url = _clean(rec.get("URL"))
    if not (url.startswith("http://") or url.startswith("https://")):
        url = ""  # match the mirror extractor: only absolute http(s) URLs are kept
    return {
        "legacy_club_key": _clean(rec.get("ClubID")),
        "name": _prefer(rec.get("ClubNameUnicode"), rec.get("Name")),
        "city": _clean(rec.get("City")),
        "region": _clean(rec.get("State")),
        "country": _clean(rec.get("Country")),
        "contact_member_id": "",
        "external_url": url,
        "description": _scrub_description_pii(_prefer(rec.get("TagLine"), rec.get("Welcome"))),
        "created": _epoch_to_datetime_text(rec.get("Created")),
        "last_updated": _epoch_to_datetime_text(rec.get("Modified")),
    }


def read_approved_dump_clubs(sql: str) -> dict[str, dict]:
    """Return {ClubID: dump_record} for every Approved=1 clubs row. Fails closed
    when the clubs table or its rows cannot be parsed."""
    columns = _dump_clubs_columns(sql)
    if "Approved" not in columns or "ClubID" not in columns:
        raise SystemExit(
            "overlay_clubs aborted: the dump's clubs table is missing the "
            "Approved / ClubID columns; refusing to reconcile against a "
            "malformed dump."
        )
    marker = "INSERT INTO `clubs` VALUES "
    approved: dict[str, dict] = {}
    for start in _find_all(sql, marker):
        for values in parse_value_tuples(sql[start + len(marker):]):
            rec = dict(zip(columns, values))
            if _clean(rec.get("Approved")) != "1":
                continue
            club_id = _clean(rec.get("ClubID"))
            if not club_id:
                continue
            if club_id in approved:
                raise SystemExit(
                    "overlay_clubs aborted: duplicate approved ClubID "
                    f"{club_id!r} in the dump; refusing to reconcile against an "
                    "ambiguous club universe."
                )
            approved[club_id] = rec
    return approved


def _find_all(haystack: str, needle: str) -> list[int]:
    out, i = [], haystack.find(needle)
    while i != -1:
        out.append(i)
        i = haystack.find(needle, i + 1)
    return out


def read_seed(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as f:
        return {r["legacy_club_key"]: r for r in csv.DictReader(f)}


def serialize(rows: list[dict]) -> str:
    """Serialize seed rows in the canonical seed dialect (LF, QUOTE_MINIMAL,
    fixed column order). Sorted by legacy_club_key for a deterministic,
    byte-stable result."""
    import io
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=FIELDNAMES, lineterminator="\n")
    writer.writeheader()
    for row in sorted(rows, key=lambda r: r["legacy_club_key"]):
        writer.writerow({k: row.get(k, "") for k in FIELDNAMES})
    return buf.getvalue()


def validate(
    output_rows: list[dict], approved_keys: set[str], seed_before: dict[str, dict]
) -> None:
    """Fail closed unless every structural invariant holds."""
    keys = [r["legacy_club_key"] for r in output_rows]
    if any(not k for k in keys):
        raise SystemExit("overlay_clubs aborted: a blank legacy_club_key in the output.")
    if len(keys) != len(set(keys)):
        raise SystemExit("overlay_clubs aborted: duplicate legacy_club_key in the output.")
    if set(keys) != approved_keys:
        extra = set(keys) - approved_keys
        missing = approved_keys - set(keys)
        raise SystemExit(
            "overlay_clubs aborted: output key set does not equal the approved "
            f"dump key set (extra={len(extra)}, missing={len(missing)})."
        )
    for r in output_rows:
        for field, value in r.items():
            if field not in FIELDNAMES:
                raise SystemExit(f"overlay_clubs aborted: unexpected output field {field!r}.")
            if "password" in str(value).lower() and field == "description":
                # A description legitimately could mention the word; only guard
                # against a raw credential column leaking as a value.
                pass
    # Overlap rows must be preserved byte-for-byte (compare field-by-field).
    for r in output_rows:
        k = r["legacy_club_key"]
        if k in seed_before and dict(seed_before[k]) != {f: r.get(f, "") for f in FIELDNAMES}:
            raise SystemExit(
                f"overlay_clubs aborted: overlap row {k!r} was not preserved verbatim."
            )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seed", default=str(DEFAULT_SEED),
                    help="Path to seed/clubs.csv to reconcile and rewrite.")
    ap.add_argument("--dump", default=None,
                    help="Path to the clubs mysqldump (default: the resolved "
                         "legacy dump's clubs/backups/latest.sql).")
    args = ap.parse_args()

    seed_path = Path(args.seed)

    if args.dump:
        dump_path = Path(args.dump)
    else:
        root = resolve_dump_root()
        dump_path = module_dump_path(root, "clubs") if root else None

    # Graceful degradation: an unavailable machine-local dump is a clean no-op.
    if dump_path is None or not dump_path.exists():
        print("Authoritative club reconciliation skipped: the machine-local clubs "
              "dump is unavailable. Downstream runs on the existing seed.")
        return

    sql = dump_path.read_text(encoding="latin-1")
    approved = read_approved_dump_clubs(sql)
    if not approved:
        # Present but invalid: fail closed and leave the seed untouched.
        raise SystemExit(
            f"overlay_clubs aborted: {dump_path} parsed to zero approved clubs; "
            "the dump is malformed or incomplete. Seed left unchanged."
        )

    seed_before = read_seed(seed_path)
    approved_keys = set(approved)

    output_rows: list[dict] = []
    overlap = additions = 0
    for club_id, rec in approved.items():
        existing = seed_before.get(club_id)
        if existing is not None:
            output_rows.append({f: existing.get(f, "") for f in FIELDNAMES})
            overlap += 1
        else:
            output_rows.append(dump_row_to_seed_row(rec))
            additions += 1
    stale_dropped = sorted(set(seed_before) - approved_keys)

    validate(output_rows, approved_keys, seed_before)

    new_text = serialize(output_rows)
    unchanged = seed_path.exists() and seed_path.read_bytes() == new_text.encode("utf-8")
    if unchanged:
        print("Authoritative club reconciliation: seed already matches the approved "
              f"universe ({len(output_rows)} clubs); no rewrite.")
    else:
        tmp = seed_path.with_suffix(seed_path.suffix + ".tmp")
        tmp.write_text(new_text, encoding="utf-8")
        os.replace(tmp, seed_path)

    print("Authoritative club reconciliation:")
    print(f"  approved dump keys:      {len(approved_keys):,}")
    print(f"  overlap preserved:       {overlap:,}")
    print(f"  dump-only additions:     {additions:,}")
    print(f"  stale seeded keys dropped: {len(stale_dropped):,}"
          + (f" ({', '.join(stale_dropped[:10])}...)" if stale_dropped else ""))
    print(f"  seed rows written:       {len(output_rows):,}")


if __name__ == "__main__":
    main()

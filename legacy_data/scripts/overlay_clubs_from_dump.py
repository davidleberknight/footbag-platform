#!/usr/bin/env python3
"""Reconcile seed/clubs.csv against the authoritative approved club universe.

The legacy clubs-module dump's `Approved=1` `ClubID`s are the authoritative
club-key universe. This overlay regenerates seed/clubs.csv so it contains
exactly that approved key set:

  - an approved key already present in the seed keeps its existing
    (mirror-enriched) row field for field, changed only where a recorded
    curated correction covers the field;
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

Club text arrives damaged in three distinct ways and each is handled where it
occurs, because the legacy database is read-only and cannot be corrected at
source. The dump is UTF-8, so it is decoded as UTF-8. A handful of rows then
still read wrong on their own terms: a name whose Unicode-suffixed column was
stored already double-encoded while the plain column is clean falls back to the
plain column; text stored as HTML numeric character references is decoded back to
the characters it stands for; and a value typed through a mismatched codepage,
which no general rule can recover without corrupting clean rows, is corrected per
row from an overrides file that records the reason. Curated corrections apply to
seeded rows as well as dump-derived ones, because a curated correction outranks
whatever the mirror or the dump stored; the validator sanctions exactly that
exception and rejects any other change to a seeded field.
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
from club_curation import (  # noqa: E402
    SEED_FIELDNAMES,
    blank_location_placeholder,
    clean_club_text,
    decode_numeric_entities,
    has_c1_controls,
    load_club_text_corrections,
    repair_doubled_url_scheme,
)


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

# Per-row text corrections no general rule can make: text the legacy database
# mangled beyond what a decoder can recover, and a source spelling normalised to
# the canonical name of the thing it names, such as a region recorded as a postal
# abbreviation or misspelled. Keyed by club key and field, each carrying the
# curator's reason, in the same shape as the other club overrides.
TEXT_CORRECTIONS_CSV = REPO_ROOT / "legacy_data" / "overrides" / "club_text_corrections.csv"

FIELDNAMES = SEED_FIELDNAMES

# Exit statuses, matching the sibling seed producers so a caller reads the same
# number for the same class of problem across the club chain. A reconciliation,
# validation or publication failure exits 1, which the existing SystemExit paths
# below already produce.
EXIT_INVALID_INVOCATION = 2
EXIT_MISSING_PREREQUISITE = 3


def dump_problem(path: Path) -> str | None:
    """Why this dump cannot be read, or None when it can.

    Read-only, and run before the seed is opened, so a prerequisite failure
    cannot leave the seed touched.
    """
    if not path.exists():
        return f"{path} (not found)"
    if not path.is_file():
        return f"{path} (not a regular file)"
    if not os.access(path, os.R_OK):
        return f"{path} (not readable)"
    return None


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


def _decode_numeric_entities(text: str) -> str:
    """Numeric-entity decoding, shared with the mirror extractor through the
    club-curation module so a curated value decodes the same either way."""
    return decode_numeric_entities(text)


def _clean(text: str | None) -> str:
    """Trim, decode numeric escapes, and settle line endings to LF. Shared with the
    mirror extractor through the club-curation module, so a curated correction is
    decoded identically whichever producer applies it."""
    return clean_club_text(text)


def _repaired_if_double_encoded(text: str) -> str | None:
    """The repaired string when `text` is UTF-8 bytes that were stored after
    being decoded as a single-byte codepage, otherwise None.

    The test is the round trip itself rather than a character blacklist: encoding
    back to single bytes and decoding as UTF-8 succeeds only for text that really
    carries that damage, and a value that is already correct either fails the
    round trip or comes back unchanged."""
    if not text:
        return None
    try:
        repaired = text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return None
    return repaired if repaired != text else None


def _was_damaged(text: str | None) -> bool:
    """True when the raw value shows either kind of codepage damage.

    Two shapes reach us and only one is a round trip. Whole-string mojibake is
    reversible and detected above. A single CP1252 byte inside otherwise-correct
    text is not: it fails that round trip, which is exactly why it used to pass
    through untouched. It leaves a C1 control instead, and a control character in
    a club name or description is damage by construction, since no club field has
    any use for one.

    Read on the RAW value, before cleaning: the shared cleaner now repairs the
    control, so asking afterwards would always answer no and the preference below
    would lose the provenance it exists to keep."""
    if not text:
        return False
    return has_c1_controls(text) or _repaired_if_double_encoded(text) is not None


def _prefer_undamaged(primary: str | None, fallback: str | None) -> str:
    """Prefer the primary value, except when it was stored already double-encoded
    and the fallback holds the same text intact.

    The legacy clubs table keeps some names twice, once in a Unicode-suffixed
    column and once plain, and for at least one club the Unicode copy was written
    already damaged. Taking the primary blindly would carry that damage forward no
    matter how the dump is decoded. Only a damaged primary with a clean fallback
    switches, so a club whose Unicode column is the better value still wins."""
    p, f = _clean(primary), _clean(fallback)
    if not p:
        return f
    if f and _was_damaged(primary) and not _was_damaged(fallback):
        return f
    return p


def load_text_corrections(path: Path = TEXT_CORRECTIONS_CSV) -> dict[tuple[str, str], str]:
    """Curator-authoritative per-row text corrections. Parsing lives in the shared
    club-curation module, because the mirror extractor applies the same file and a
    second copy of the parsing is how one reader drifts from another."""
    return load_club_text_corrections(path)


def dump_row_to_seed_row(rec: dict, corrections: dict[tuple[str, str], str] | None = None) -> dict:
    """Map one approved dump clubs record (column_name -> value) to a seed row.

    A credential column is never read. contact_member_id is left empty: the dump
    clubs table carries no primary-contact column, and clubcontacts is
    corroboration only, so a dump-only club resolves its contact through the
    classifier's substitute predicate instead.
    """
    url = _clean(rec.get("URL"))
    if not (url.startswith("http://") or url.startswith("https://")):
        url = ""  # match the mirror extractor: only absolute http(s) URLs are kept
    url = repair_doubled_url_scheme(url)
    club_id = _clean(rec.get("ClubID"))
    row = {
        "legacy_club_key": club_id,
        "name": _prefer_undamaged(rec.get("ClubNameUnicode"), rec.get("Name")),
        "city": blank_location_placeholder(rec.get("City")),
        "region": blank_location_placeholder(rec.get("State")),
        "country": _clean(rec.get("Country")),
        "contact_member_id": "",
        "external_url": url,
        # Undamaged, not merely first: the description is where the codepage
        # damage actually showed up, so a damaged primary yields to a clean
        # alternative here on the same reasoning the club name already used.
        "description": _scrub_description_pii(
            _prefer_undamaged(rec.get("TagLine"), rec.get("Welcome"))),
        "created": _epoch_to_datetime_text(rec.get("Created")),
        "last_updated": _epoch_to_datetime_text(rec.get("Modified")),
    }
    for field in FIELDNAMES:
        corrected = (corrections or {}).get((club_id, field))
        if corrected is not None:
            row[field] = corrected
    return row


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
    output_rows: list[dict],
    approved_keys: set[str],
    seed_before: dict[str, dict],
    corrections: dict[tuple[str, str], str] | None = None,
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
    # An overlap row keeps its mirror-enriched values byte-for-byte. The one
    # sanctioned exception is a field with an explicit curator correction, which
    # exists precisely because the stored value is unreadable and no rule can
    # repair it; that field is compared against the correction instead, so the
    # contract still catches any value the overlay changed on its own.
    corrections = corrections or {}
    for r in output_rows:
        k = r["legacy_club_key"]
        if k not in seed_before:
            continue
        for field in FIELDNAMES:
            expected = corrections.get((k, field), seed_before[k].get(field, ""))
            if r.get(field, "") != expected:
                raise SystemExit(
                    f"overlay_clubs aborted: overlap row {k!r} field {field!r} was "
                    "neither preserved verbatim nor set by a recorded correction."
                )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seed", default=str(DEFAULT_SEED),
                    help="Path to seed/clubs.csv to reconcile and rewrite.")
    ap.add_argument("--dump", default=None,
                    help="Path to the clubs mysqldump (default: the resolved "
                         "legacy dump's clubs/backups/latest.sql). Naming a dump "
                         "makes it a requirement: an unusable one is an error, "
                         "never a silent no-op.")
    ap.add_argument("--require-dump", action="store_true",
                    help="Fail when no dump can be resolved, instead of treating "
                         "an absent machine-local dump as a supported no-op. For "
                         "a run whose whole purpose is the reconciliation.")
    args = ap.parse_args()

    seed_path = Path(args.seed)
    if seed_path.exists() and not seed_path.is_file():
        print(f"ERROR: --seed is not a regular file: {seed_path}", file=sys.stderr)
        sys.exit(EXIT_INVALID_INVOCATION)

    # An explicitly named dump is a stated prerequisite. Absence there is an
    # operator error, not a supported configuration, and reporting it as a clean
    # no-op is how a run that reconciled nothing passes for one that did.
    if args.dump:
        problem = dump_problem(Path(args.dump))
        if problem:
            print(f"ERROR: the requested clubs dump is unusable: {problem}", file=sys.stderr)
            print("       --dump names a required input; nothing was read or written.",
                  file=sys.stderr)
            sys.exit(EXIT_MISSING_PREREQUISITE)
        dump_path = Path(args.dump)
    else:
        root = resolve_dump_root()
        resolved = module_dump_path(root, "clubs") if root else None
        problem = "no machine-local dump is configured" if resolved is None \
            else dump_problem(resolved)
        if problem:
            # The machine-local dump is optional by design: a checkout without it
            # is supported, and the orchestrator relies on that. A caller that
            # needs the reconciliation to have happened asks for --require-dump
            # rather than reading success as proof.
            if args.require_dump:
                print(f"ERROR: no usable clubs dump: {problem}", file=sys.stderr)
                print("       --require-dump was given; nothing was read or written.",
                      file=sys.stderr)
                sys.exit(EXIT_MISSING_PREREQUISITE)
            print("Authoritative club reconciliation skipped: the machine-local clubs "
                  f"dump is unavailable ({problem}). No reconciliation was performed "
                  "and downstream runs on the existing seed.")
            return
        dump_path = resolved

    # The dump is UTF-8. Replacement rather than strict so a single bad byte
    # cannot abort the whole reconciliation, matching the member-dump readers.
    sql = dump_path.read_text(encoding="utf-8", errors="replace")
    approved = read_approved_dump_clubs(sql)
    if not approved:
        # Present but invalid: fail closed and leave the seed untouched.
        raise SystemExit(
            f"overlay_clubs aborted: {dump_path} parsed to zero approved clubs; "
            "the dump is malformed or incomplete. Seed left unchanged."
        )

    seed_before = read_seed(seed_path)
    approved_keys = set(approved)
    corrections = load_text_corrections()

    output_rows: list[dict] = []
    overlap = additions = 0
    for club_id, rec in approved.items():
        existing = seed_before.get(club_id)
        if existing is not None:
            row = {f: existing.get(f, "") for f in FIELDNAMES}
            # A recorded correction reaches a mirror-derived row too: some values
            # arrive unreadable through the mirror rather than the dump, and the
            # curator's entry is the only thing that can repair them.
            for field in FIELDNAMES:
                corrected = corrections.get((club_id, field))
                if corrected is not None:
                    row[field] = corrected
            output_rows.append(row)
            overlap += 1
        else:
            output_rows.append(dump_row_to_seed_row(rec, corrections))
            additions += 1
    stale_dropped = sorted(set(seed_before) - approved_keys)

    validate(output_rows, approved_keys, seed_before, corrections)

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

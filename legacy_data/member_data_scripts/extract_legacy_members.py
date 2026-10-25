#!/usr/bin/env python3
"""Extract the legacy-site `members` dump into the canonical loader-input CSV.

Retired: the member load reads the published member CSV, which
publish_legacy_repo_data.py builds from the vetted legacy-site CSVs the refresh
writes, and the refresh is the only reader of the legacy repository. Kept as the
record of how earlier member extracts were made; nothing runs it.

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
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from _dump_parser import parse_create_columns, parse_value_tuples  # noqa: E402
# The record transforms live with the publish step, which applies them to the
# vetted export; this extractor applies the same ones to a dump.
from publish_legacy_repo_data import (  # noqa: E402
    OUTPUT_FIELDS, SELECTED_COMPANION, SELECTED_CURATED, SELECTED_LEFT,
    SELECTED_REVERSED, SELECTED_UNDAMAGED, SELECTED_UNICODE, _val,
    audit_record_encoding, load_member_name_encodings, map_record,
    tier_coverage_violation)

# Never mapped, retained, logged, emitted, or written.
CREDENTIAL_COLUMNS = {"MemberPassword", "MemberSession"}

# Board / Tier 3 standing is not derived from legacy data. No legacy tier value
# encodes governance status, so the flag comes from one curated file naming the
# directors sitting at cutover: a row listed there carries the board flag and the
# paid tier recorded underneath the seat, and every other row carries a definite
# non-board flag and no underlying paid tier. Neither column reaches the platform
# database -- the importer reports and ignores both -- so the flag never grants
# Tier 3 by itself; it exists so an OR-merge cannot drop a board grant while
# duplicate accounts are consolidated. Tier 3 itself is an administrator-set flag
# on the live member row, applied after cutover.


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


# The tier a governance standing sits on top of. Closed set, matching the
# platform's own underlying-tier type: a board seat reverts to Tier 1 or Tier 2
# when the standing is removed, and Tier 3 IS the standing rather than something
# underneath it. A value outside the set is an operator typo that would otherwise
# ride into the merge and out again as a tier nothing recognises.
ALLOWED_UNDERLYING_TIERS = frozenset({"tier1", "tier2"})


def load_board_roster(roster_path: Path | None) -> tuple[dict[str, str], str]:
    """The legacy account ids holding IFPA board standing at cutover, each mapped
    to the paid tier that sits underneath the governance standing, plus the
    fingerprint the roster declares itself against.

    The dump carries no board information at all, so this arrives as a curated
    roster keyed on the legacy account id. Both columns are grant-bearing and
    pipeline-internal: the final merge refuses to run while no row carries the
    flag, because an OR-merge across a duplicate pair could otherwise drop a
    board grant out of existence, and the underlying tier is what a governance
    standing reverts to when it is removed.

    An absent path yields an empty mapping, which keeps the flag at its
    unpopulated default and leaves that refusal in place, rather than inventing
    standing for anyone. A roster that IS supplied is validated against the dump
    it is being applied to; see `validate_board_roster`.
    """
    if roster_path is None or not roster_path.exists():
        return {}, ""
    roster: dict[str, str] = {}
    declared = ""
    with roster_path.open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            value = (row.get("legacy_member_id") or "").strip()
            if not value:
                continue
            roster[value] = (row.get("underlying_paid_tier") or "").strip()
            # One fingerprint covers the roster as a whole, so every row carries
            # the same value and the last one read settles it. Disagreement
            # between rows is caught below rather than silently resolved here.
            declared = (row.get("fingerprint") or "").strip() or declared
    return roster, declared


def validate_board_roster(roster: dict[str, str], declared_fingerprint: str,
                          seen: dict[str, tuple[str, str, str]],
                          roster_path: Path) -> None:
    """Fail closed on a roster that does not describe the dump in front of it.

    Three ways it can be wrong, all of them silent otherwise. An account it lists
    may not be in this dump at all, in which case a sitting director loads as an
    ordinary member. Its underlying tier may be a value nothing recognises. And
    it may have been adjudicated against an earlier extract, in which case a
    renamed or re-dated account carries a grant nobody re-checked. The last is
    what the four sibling ruling files already guard with a fingerprint, and this
    is that guard for the fifth.

    `seen` is (real_name, birth_date, country) per listed id, collected from the
    rows this run actually mapped. Raises SystemExit; the caller removes the CSV.
    """
    import stage_a_overrides

    missing = sorted(i for i in roster if i not in seen)
    if missing:
        raise SystemExit(
            f"error: board roster names {len(missing)} account(s) this dump does not "
            f"carry; no CSV written.\n"
            f"  roster: {roster_path}\n"
            f"  missing: {', '.join(missing)}\n"
            f"  A listed account that is absent loads as nobody, so a sitting "
            f"director would arrive as an ordinary member in a database that looks "
            f"entirely normal. Re-adjudicate the roster against this dump."
        )

    bad_tiers = sorted((i, t) for i, t in roster.items()
                       if t not in ALLOWED_UNDERLYING_TIERS)
    if bad_tiers:
        detail = "\n".join(f"    {i}: {t!r}" for i, t in bad_tiers)
        allowed = ", ".join(sorted(ALLOWED_UNDERLYING_TIERS))
        raise SystemExit(
            f"error: board roster carries {len(bad_tiers)} unrecognised underlying "
            f"tier value(s); no CSV written.\n"
            f"  roster: {roster_path}\n{detail}\n"
            f"  The underlying tier is what a governance standing reverts to, so it "
            f"must be one of: {allowed}."
        )

    computed = stage_a_overrides.board_roster_fingerprint(
        (i, seen[i][0], seen[i][1], seen[i][2]) for i in roster)
    if declared_fingerprint != computed:
        was = declared_fingerprint or "(none recorded)"
        raise SystemExit(
            f"error: board roster fingerprint does not match this dump; no CSV written.\n"
            f"  roster:   {roster_path}\n"
            f"  recorded: {was}\n"
            f"  computed: {computed}\n"
            f"  The roster binds to the account facts it was adjudicated against, so "
            f"a mismatch means one of the listed accounts changed or the roster was "
            f"written for a different extract. Re-check that these are still the "
            f"sitting directors, then record the computed value in the roster's "
            f"fingerprint column."
        )


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


def extract(members_sql: Path, out_csv: Path, cutover_date: str | None = None,
            board_roster: Path | None = None) -> dict:
    sql = members_sql.read_text(encoding="utf-8", errors="replace")
    columns = parse_member_columns(sql)
    cutover_epoch = parse_cutover_date(cutover_date)
    board_by_id, board_fingerprint = load_board_roster(board_roster)
    # The facts each listed account actually carries in this dump, collected as
    # the rows go past so the roster can be checked against them afterwards.
    board_seen: dict[str, tuple[str, str, str]] = {}
    # Reported, never gated. How old a dump is worth loading is the operator's
    # call, and before go-live a deliberately old one is an ordinary test; the
    # run states the age so a stale one is visible rather than silent.
    dump_date, dump_source, _ = _dump_generation_date(members_sql, sql)

    examined = 0
    tier_flags = {
        "legacy_ever_paid_tier2": 0,
        "legacy_ever_paid_tier1_lifetime": 0,
        "legacy_tier1_annual_active_at_cutover": 0,
        "legacy_was_board_at_cutover": 0,
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
            mapped = map_record(rec, cutover_epoch, name_encodings, board_by_id)
            examined += 1
            audit = audit_record_encoding(
                rec, *name_encodings.get(_val(rec, "MemberID"), (None, frozenset(), None)))
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
                if mapped["legacy_member_id"] in board_by_id:
                    board_seen[mapped["legacy_member_id"]] = (
                        mapped["real_name"], mapped["birth_date"], mapped["country"])
            for col in email_pop:
                if mapped[col]:
                    email_pop[col] += 1
            w.writerow(mapped)

    if board_by_id:
        # Same reasoning as the tier-flag check below, and the same handling: a
        # wrong board flag is silent downstream, so the run must not hand on
        # output a later step would load without re-checking it.
        try:
            validate_board_roster(board_by_id, board_fingerprint, board_seen,
                                  board_roster)
        except SystemExit:
            out_csv.unlink(missing_ok=True)
            raise

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
        "dump_date": dump_date.isoformat(),
        "dump_source": dump_source,
        "dump_age_days": (datetime.now(timezone.utc).date() - dump_date).days,
        "board_roster_rows": len(board_by_id),
        "tier_coverage_checked": cutover_epoch is not None,
        "cutover_epoch": cutover_epoch,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--members-sql", required=True, type=Path,
                    help="path to the members mysqldump (members/backups/latest.sql)")
    ap.add_argument("--out", required=True, type=Path,
                    help="output canonical CSV path")
    ap.add_argument("--cutover-date", required=True,
                    help="the moment (YYYY-MM-DD) Tier-1 annual expirations are measured "
                         "against. Required: a run without it would flag no row as "
                         "annual-active and look complete.")
    # No environment fallback, deliberately. The runner resolves this path, says
    # on every run whether it had one, and refuses a production extract without
    # it; a fallback here would let a direct invocation pick up a roster nobody
    # reported, or miss one because of a typo nothing reads back.
    ap.add_argument("--board-roster", type=Path,
                    help="curated CSV of the legacy account ids holding IFPA board "
                         "standing at cutover, keyed on legacy_member_id, carrying the "
                         "underlying paid tier and the fingerprint it was adjudicated "
                         "under. The dump carries no board information, so without this "
                         "every row is flagged 0, which is why a production extract "
                         "refuses to run without it.")
    # The mode flag this replaced is refused by name rather than left to the
    # generic unrecognized-argument error, so a script or a note that still
    # passes it is told what replaced it instead of only that it is unknown.
    if "--final-export" in sys.argv[1:]:
        raise SystemExit(
            "error: --final-export no longer exists. The extractor has one path and reads its\n"
            "  inputs instead: --cutover-date fixes the moment annual memberships are measured\n"
            "  against, and --board-roster names the directors sitting at cutover. Nothing gates\n"
            "  on how old the dump is; the date and age are reported and the operator decides."
        )
    args = ap.parse_args()

    if not args.members_sql.is_file():
        raise SystemExit(f"error: members dump not found: {args.members_sql}")

    stats = extract(args.members_sql, args.out, args.cutover_date,
                    board_roster=args.board_roster)
    ep = stats["email_population"]
    tf = stats["tier_flags"]
    print(f"extract_legacy_members -> {args.out}")
    print(f"  dump taken:             {stats['dump_date']} "
          f"({stats['dump_age_days']} days ago, from the {stats['dump_source']})")
    print(f"  columns in dump:        {stats['columns_in_dump']}")
    print(f"  rows examined:          {stats['rows_examined']}")
    print(f"  distinct MemberID:      {stats['distinct_member_id']}")
    print(f"  MemberEmail populated:  {ep['legacy_email']}")
    print(f"  MemberEmail2 populated: {ep['legacy_email2']}")
    print(f"  MemberEmail3 populated: {ep['legacy_email3']}")
    print(f"  ever-paid Tier 2:       {tf['legacy_ever_paid_tier2']}")
    print(f"  Tier 1 lifetime:        {tf['legacy_ever_paid_tier1_lifetime']}")
    annual_note = "" if stats["cutover_epoch"] is not None else \
        "  (derivation inert: no --cutover-date)"
    print(f"  Tier 1 annual active:   {tf['legacy_tier1_annual_active_at_cutover']}{annual_note}")
    board_note = "" if stats["board_roster_rows"] else \
        "  (no roster: the dump carries no board data, so the final merge will refuse)"
    print(f"  board at cutover:       {tf['legacy_was_board_at_cutover']}{board_note}")
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

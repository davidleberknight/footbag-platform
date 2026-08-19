#!/usr/bin/env python3
"""Sample real legacy rows per claim-testing stratum, for human testers.

Read-only. Selects a deterministic sample of legacy accounts (and unlinked
historical persons) from each stratum a tester should exercise against the
onboarding wizard's legacy-claim task, and writes one git-ignored CSV telling
the tester who to register as, with which email, and what the wizard is
expected to do.

The legacy claim is one of three required wizard tasks: personal details, the
legacy-claim decision, and the club affiliation answer. A sampled registrant
becomes a member only once all three are answered, so no row is finished at the
claim. Until then the account is pending, holding a session but no member
authorization, which is its own thing to walk.

Strata:
  * hp_linked_with_email -- account linked to a historical person, email on
    file: registering with that email should surface the auto-link suggestion.
  * tier2_paid / tier1_lifetime -- paid tier evidence: the claim should grant
    the corresponding tier. tier1_lifetime excludes records carrying a
    Hall-of-Fame honor or Tier 2 payment, which grant Tier 2 regardless and
    would make the row's own prediction false.
  * hof -- Hall-of-Fame honoree: the claim should grant the honor tier.
  * same_name_with_dob -- account sharing its display name with another
    account, birth date on file: no suggestion should appear at all, because
    suggestions need an email anchor, and the record is reached by member-id
    search or a declared old email.
  * no_email -- no email on any of the three columns: no auto-suggestion is
    possible; manual search, anchors, or admin help only.
  * collision_stub -- bare mirror-seeded stub (held-out collision cohort):
    carries a seeded display name but no email and no legacy user id, and the
    claim lookup matches on ids and email columns alone, so nothing should
    reach it by email.
  * unlinked_hp_only -- historical person with no legacy account: reachable
    only by manual name search or the browse-history direct claim.
  * explicit -- rows passed via --include-ids (edge cases the strata above
    cannot derive, such as results-linked accounts pulled back into the
    import despite being invalid in the dump).

Sampling is deterministic (ordered by id) so reruns give testers the same
rows. Fixture and persona-seeded rows and already-claimed accounts are
excluded: a tester can only claim an unclaimed real row.

The strata are disjoint within a run. Many records qualify for several at
once, and claiming one spends it everywhere, so a record handed to one
stratum is withheld from the rest. Strata are filled rarest first, or a
stratum of a hundred candidates is emptied by one of thousands. Where that
leaves a stratum short of the requested sample, the printed counts say so.

Tester notes printed on every run: deceased-suppression flows are testable
only via the seeded persona (the real data carries no deceased persons), and
all dev/staging mail is captured at GET /dev/outbox -- no real mail is sent.

The output carries real names and emails, so it lands in the git-ignored
out/ directory alongside the other PII-bearing extracts and is never
committed or redistributed unencrypted. Writes no database rows. Refuses
production / staging / /srv/footbag targets, like every script that touches
member PII on this path.
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
try:
    import pysqlite3 as sqlite3
except ImportError:
    import sqlite3
from pathlib import Path

DEFAULT_OUT_CSV = Path("legacy_data/member_data_scripts/out/legacy_claim_test_strata.csv")

FIELDS = ["legacy_member_id", "person_id", "real_name", "matching_email", "stratum",
          "expected_wizard_behavior"]

# Rows a tester must not receive: seeded fixtures and personas are not real
# data, and an already-claimed account cannot be claimed again.
CLAIMABLE = """
    lm.claimed_by_member_id IS NULL
    AND COALESCE(lm.import_source, '') != 'system_fixture'
    AND lm.legacy_member_id NOT LIKE 'legmem_persona_%'
"""

EMAIL_PRESENT = """
    (COALESCE(lm.legacy_email, '') != ''
     OR COALESCE(lm.legacy_email2, '') != ''
     OR COALESCE(lm.legacy_email3, '') != '')
"""

BEHAVIOR = {
    "hp_linked_with_email":
        "Register with the matching email: the wizard should offer this account's "
        "history as a high-confidence suggestion card; confirming links the account "
        "and its historical record.",
    "tier2_paid":
        "Claim the account (any path): the paid history should grant Tier 2.",
    "tier1_lifetime":
        "Claim the account (any path): the paid history should grant lifetime Tier 1.",
    "hof":
        "Claim the account (any path): the Hall-of-Fame honor should grant Tier 2.",
    "same_name_with_dob":
        "Another account shares this display name. A suggestion needs an email "
        "anchor, so neither the shared name nor a matching date of birth produces "
        "one, and the wizard should offer nothing: reach the record by searching "
        "its old member id, which mails a confirmation link to the address on the "
        "old account, or by declaring that old email as an anchor. The birth date "
        "disambiguates within an email-anchored match rather than creating one, and "
        "a birth date that does not match raises an administrator review.",
    "no_email":
        "No email on file: no auto-suggestion is possible; only manual search, "
        "verified anchors, or admin link-help can reach this account.",
    "collision_stub":
        "Bare mirror stub (collision hold-out): it carries only a seeded display "
        "name, with no email and no legacy user id, and the claim lookup matches on "
        "ids and email columns alone, so no search or registration email should ever "
        "reach it.",
    "unlinked_hp_only":
        "No legacy account behind this person: reachable only via manual name search "
        "in the wizard or the browse-history direct claim during onboarding. Club "
        "cards derive from either identity anchor, so where this record carries club "
        "affiliations the club task should offer them as cards.",
    "explicit":
        "Operator-selected edge case; expected behavior per the reason it was chosen.",
}

# Appended to every row: the claim is the middle of three required tasks, so a
# tester who stops at the claim outcome has walked half a registrant.
COMPLETION = (
    " The row is not finished at the claim: the club affiliation answer -- a club, "
    "or the explicit no-club answer -- is the third required task, and the account "
    "stays pending, with a session but no member authorization, until it lands."
)


def refuse_if_deployed_target(db_path: str) -> None:
    node_env = os.environ.get("NODE_ENV", "")
    footbag_env = os.environ.get("FOOTBAG_ENV", "")
    if (node_env == "production" or footbag_env in ("production", "staging")
            or os.path.abspath(db_path).startswith("/srv/footbag/")):
        print(
            "refusing to sample: tester sampling is maintainer-machine only and "
            "never runs against production or staging. Guard tripped by "
            f"NODE_ENV={node_env!r} / FOOTBAG_ENV={footbag_env!r} / --db={db_path!r}.",
            file=sys.stderr,
        )
        sys.exit(1)


def best_email(row: dict) -> str:
    for col in ("legacy_email", "legacy_email2", "legacy_email3"):
        if row.get(col):
            return row[col]
    return ""


LM_SELECT = """
    SELECT lm.legacy_member_id, lm.real_name,
           lm.legacy_email, lm.legacy_email2, lm.legacy_email3,
           hp.person_id
    FROM legacy_members lm
    LEFT JOIN historical_persons hp ON hp.legacy_member_id = lm.legacy_member_id
"""

STRATA_SQL = {
    "hp_linked_with_email": f"""
        {LM_SELECT}
        WHERE {CLAIMABLE} AND hp.person_id IS NOT NULL AND {EMAIL_PRESENT}
        ORDER BY lm.legacy_member_id
    """,
    "tier2_paid": f"""
        {LM_SELECT}
        WHERE {CLAIMABLE} AND lm.legacy_ever_paid_tier2 = 1
        ORDER BY lm.legacy_member_id
    """,
    # A Hall-of-Fame honoree or a Tier 2 payer is granted Tier 2 whatever else
    # the record carries, so a row holding either cannot demonstrate the
    # lifetime Tier 1 grant this stratum exists to check.
    "tier1_lifetime": f"""
        {LM_SELECT}
        WHERE {CLAIMABLE} AND lm.legacy_ever_paid_tier1_lifetime = 1
          AND lm.is_hof = 0 AND lm.legacy_ever_paid_tier2 = 0
        ORDER BY lm.legacy_member_id
    """,
    "hof": f"""
        {LM_SELECT}
        WHERE {CLAIMABLE} AND lm.is_hof = 1
        ORDER BY lm.legacy_member_id
    """,
    "same_name_with_dob": f"""
        {LM_SELECT}
        WHERE {CLAIMABLE} AND COALESCE(lm.birth_date, '') != ''
          AND LOWER(TRIM(lm.real_name)) IN (
              SELECT LOWER(TRIM(real_name)) FROM legacy_members
              WHERE COALESCE(real_name, '') != ''
              GROUP BY LOWER(TRIM(real_name)) HAVING COUNT(*) > 1)
        ORDER BY lm.legacy_member_id
    """,
    "no_email": f"""
        {LM_SELECT}
        WHERE {CLAIMABLE} AND NOT {EMAIL_PRESENT}
          AND COALESCE(lm.import_source, '') != 'mirror'
        ORDER BY lm.legacy_member_id
    """,
    "collision_stub": f"""
        {LM_SELECT}
        WHERE {CLAIMABLE} AND lm.import_source = 'mirror'
        ORDER BY lm.legacy_member_id
    """,
}

# Persons carrying club affiliations sort first. Club cards derive from either
# identity anchor, and this stratum is the only one that exercises the
# person-side anchor, so a row with no affiliations cannot show what the
# stratum exists to check.
UNLINKED_HP_SQL = """
    SELECT hp.person_id, hp.person_name,
           EXISTS (SELECT 1 FROM legacy_person_club_affiliations a
                   WHERE a.historical_person_id = hp.person_id) AS has_clubs
    FROM historical_persons hp
    WHERE hp.legacy_member_id IS NULL
      AND hp.person_id NOT LIKE 'person-test-%'
    ORDER BY has_clubs DESC, hp.person_id
"""


def stratum_population(conn, sql: str) -> int:
    return conn.execute(f"SELECT COUNT(*) FROM ({sql})").fetchone()[0]


def take(conn, sql: str, limit: int, taken: set, key: str) -> list:
    """Pick up to `limit` rows the run has not already handed out.

    A tester can claim a record once, so an account sampled into one stratum is
    spent for every other stratum it also qualifies for. Selecting per stratum
    independently hands out the same record twice and the second row is dead on
    arrival, carrying a prediction the tester can never reach.
    """
    picked = []
    for row in conn.execute(sql):
        if len(picked) >= limit:
            break
        if row[key] in taken:
            continue
        taken.add(row[key])
        picked.append(row)
    return picked


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Sample real legacy rows per claim-testing stratum (read-only).")
    ap.add_argument("--db", type=Path,
                    default=os.environ.get("FOOTBAG_DB_PATH", "database/footbag.db"))
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT_CSV)
    ap.add_argument("--per-stratum", type=int, default=5)
    ap.add_argument("--include-ids", nargs="*", default=[],
                    help="explicit legacy_member_ids appended as the 'explicit' stratum")
    args = ap.parse_args()

    refuse_if_deployed_target(str(args.db))
    if not Path(args.db).exists():
        print(f"error: not found: {args.db}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    rows_out: list[dict] = []
    counts: list[tuple[str, int, int]] = []
    taken: set = set()
    try:
        # Rarest stratum first. Sharing records between strata means whoever
        # picks first keeps the record, and a stratum with a hundred candidates
        # is emptied by one with thousands if the common one goes first.
        populations = {s: stratum_population(conn, sql) for s, sql in STRATA_SQL.items()}
        for stratum in sorted(STRATA_SQL, key=lambda s: populations[s]):
            sql = STRATA_SQL[stratum]
            population = populations[stratum]
            picked = take(conn, sql, args.per_stratum, taken, "legacy_member_id")
            counts.append((stratum, population, len(picked)))
            for r in picked:
                r = dict(r)
                rows_out.append({
                    "legacy_member_id": r["legacy_member_id"],
                    "person_id": r["person_id"] or "",
                    "real_name": r["real_name"] or "",
                    "matching_email": best_email(r),
                    "stratum": stratum,
                    "expected_wizard_behavior": BEHAVIOR[stratum] + COMPLETION,
                })

        population = stratum_population(conn, UNLINKED_HP_SQL)
        picked = take(conn, UNLINKED_HP_SQL, args.per_stratum, taken, "person_id")
        counts.append(("unlinked_hp_only", population, len(picked)))
        for r in picked:
            rows_out.append({
                "legacy_member_id": "",
                "person_id": r["person_id"],
                "real_name": r["person_name"] or "",
                "matching_email": "",
                "stratum": "unlinked_hp_only",
                "expected_wizard_behavior": BEHAVIOR["unlinked_hp_only"] + COMPLETION,
            })

        for mid in args.include_ids:
            r = conn.execute(f"{LM_SELECT} WHERE lm.legacy_member_id = ?", (mid,)).fetchone()
            if r is None:
                print(f"warning: --include-ids {mid}: no such legacy_member_id", file=sys.stderr)
                continue
            r = dict(r)
            rows_out.append({
                "legacy_member_id": r["legacy_member_id"],
                "person_id": r["person_id"] or "",
                "real_name": r["real_name"] or "",
                "matching_email": best_email(r),
                "stratum": "explicit",
                "expected_wizard_behavior": BEHAVIOR["explicit"] + COMPLETION,
            })
        if args.include_ids:
            counts.append(("explicit", len(args.include_ids),
                           sum(1 for r in rows_out if r["stratum"] == "explicit")))
    finally:
        conn.close()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows_out)

    print("sample_legacy_claim_strata (read-only)")
    for stratum, population, sampled in counts:
        # A short sample is said out loud. Silence reads as full coverage, and
        # a stratum nobody can walk is exactly what the tester must know.
        short = ""
        if sampled < args.per_stratum:
            short = (" -- STRATUM EMPTY, nothing to walk" if sampled == 0
                     else f" -- short of the {args.per_stratum} requested")
        print(f"  {stratum:<22} population={population:<6} sampled={sampled}{short}")
    print(f"  rows written: {len(rows_out)} -> {out}")
    print("tester notes:")
    print("  * register in dev with the row's matching_email; all mail is captured")
    print("    at GET /dev/outbox (dev and staging stub) -- no real mail is sent")
    print("  * walk the pending state on at least one row per stratum: with any task")
    print("    unanswered the account reaches only public browse as an anonymous")
    print("    visitor sees it, the wizard, the historical-record claim routes and")
    print("    logout. Their own profile URL routes them to their next outstanding")
    print("    task instead of rendering, another member asking for their slug gets")
    print("    the same not-found as an unknown slug, they do not appear in member")
    print("    search, and /donate and the payment surfaces refuse them")
    print("  * deceased-suppression flows are testable only via the seeded persona;")
    print("    the real data carries no deceased persons")
    print("  * the CSV carries real names and emails: keep it in the git-ignored")
    print("    out/ directory and never redistribute it unencrypted")


if __name__ == "__main__":
    main()

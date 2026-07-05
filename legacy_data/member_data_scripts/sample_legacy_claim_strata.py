#!/usr/bin/env python3
"""Sample real legacy rows per claim-testing stratum, for human testers.

Read-only. Selects a deterministic sample of legacy accounts (and unlinked
historical persons) from each stratum a tester should exercise against the
onboarding wizard's legacy-claim task, and writes one git-ignored CSV telling
the tester who to register as, with which email, and what the wizard is
expected to do.

Strata:
  * hp_linked_with_email -- account linked to a historical person, email on
    file: registering with that email should surface the auto-link suggestion.
  * tier2_paid / tier1_lifetime -- paid tier evidence: the claim should grant
    the corresponding tier.
  * hof -- Hall-of-Fame honoree: the claim should grant the honor tier.
  * same_name_with_dob -- account sharing its display name with another
    account, birth date on file: the date should be what disambiguates.
  * no_email -- no email on any of the three columns: no auto-suggestion is
    possible; manual search, anchors, or admin help only.
  * collision_stub -- bare mirror-seeded stub (held-out collision cohort):
    carries no name or email, so nothing should match it by email.
  * unlinked_hp_only -- historical person with no legacy account: reachable
    only by manual name search or the browse-history direct claim.
  * explicit -- rows passed via --include-ids (edge cases the strata above
    cannot derive, such as results-linked accounts pulled back into the
    import despite being invalid in the dump).

Sampling is deterministic (ordered by id) so reruns give testers the same
rows. Fixture and persona-seeded rows and already-claimed accounts are
excluded: a tester can only claim an unclaimed real row.

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
        "Another account shares this display name: the wizard must not auto-suggest "
        "on name alone; an identical date of birth is what narrows to a "
        "high-confidence suggestion.",
    "no_email":
        "No email on file: no auto-suggestion is possible; only manual search, "
        "verified anchors, or admin link-help can reach this account.",
    "collision_stub":
        "Bare mirror stub (collision hold-out): it carries no name or email, so no "
        "search or registration email should ever match it.",
    "unlinked_hp_only":
        "No legacy account behind this person: reachable only via manual name search "
        "in the wizard or the browse-history direct claim during onboarding.",
    "explicit":
        "Operator-selected edge case; expected behavior per the reason it was chosen.",
}


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
        ORDER BY lm.legacy_member_id LIMIT ?
    """,
    "tier2_paid": f"""
        {LM_SELECT}
        WHERE {CLAIMABLE} AND lm.legacy_ever_paid_tier2 = 1
        ORDER BY lm.legacy_member_id LIMIT ?
    """,
    "tier1_lifetime": f"""
        {LM_SELECT}
        WHERE {CLAIMABLE} AND lm.legacy_ever_paid_tier1_lifetime = 1
        ORDER BY lm.legacy_member_id LIMIT ?
    """,
    "hof": f"""
        {LM_SELECT}
        WHERE {CLAIMABLE} AND lm.is_hof = 1
        ORDER BY lm.legacy_member_id LIMIT ?
    """,
    "same_name_with_dob": f"""
        {LM_SELECT}
        WHERE {CLAIMABLE} AND COALESCE(lm.birth_date, '') != ''
          AND LOWER(TRIM(lm.real_name)) IN (
              SELECT LOWER(TRIM(real_name)) FROM legacy_members
              WHERE COALESCE(real_name, '') != ''
              GROUP BY LOWER(TRIM(real_name)) HAVING COUNT(*) > 1)
        ORDER BY lm.legacy_member_id LIMIT ?
    """,
    "no_email": f"""
        {LM_SELECT}
        WHERE {CLAIMABLE} AND NOT {EMAIL_PRESENT}
          AND COALESCE(lm.import_source, '') != 'mirror'
        ORDER BY lm.legacy_member_id LIMIT ?
    """,
    "collision_stub": f"""
        {LM_SELECT}
        WHERE {CLAIMABLE} AND lm.import_source = 'mirror'
        ORDER BY lm.legacy_member_id LIMIT ?
    """,
}

UNLINKED_HP_SQL = """
    SELECT hp.person_id, hp.person_name
    FROM historical_persons hp
    WHERE hp.legacy_member_id IS NULL
      AND hp.person_id NOT LIKE 'person-test-%'
    ORDER BY hp.person_id LIMIT ?
"""


def stratum_population(conn, sql: str) -> int:
    # Population = the same filter without the LIMIT, counted.
    counted = f"SELECT COUNT(*) FROM ({sql.replace('LIMIT ?', '')})"
    return conn.execute(counted).fetchone()[0]


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
    try:
        for stratum, sql in STRATA_SQL.items():
            population = stratum_population(conn, sql)
            picked = conn.execute(sql, (args.per_stratum,)).fetchall()
            counts.append((stratum, population, len(picked)))
            for r in picked:
                r = dict(r)
                rows_out.append({
                    "legacy_member_id": r["legacy_member_id"],
                    "person_id": r["person_id"] or "",
                    "real_name": r["real_name"] or "",
                    "matching_email": best_email(r),
                    "stratum": stratum,
                    "expected_wizard_behavior": BEHAVIOR[stratum],
                })

        population = stratum_population(conn, UNLINKED_HP_SQL)
        picked = conn.execute(UNLINKED_HP_SQL, (args.per_stratum,)).fetchall()
        counts.append(("unlinked_hp_only", population, len(picked)))
        for r in picked:
            rows_out.append({
                "legacy_member_id": "",
                "person_id": r["person_id"],
                "real_name": r["person_name"] or "",
                "matching_email": "",
                "stratum": "unlinked_hp_only",
                "expected_wizard_behavior": BEHAVIOR["unlinked_hp_only"],
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
                "expected_wizard_behavior": BEHAVIOR["explicit"],
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
        print(f"  {stratum:<22} population={population:<6} sampled={sampled}")
    print(f"  rows written: {len(rows_out)} -> {out}")
    print("tester notes:")
    print("  * register in dev with the row's matching_email; all mail is captured")
    print("    at GET /dev/outbox (dev and staging stub) -- no real mail is sent")
    print("  * deceased-suppression flows are testable only via the seeded persona;")
    print("    the real data carries no deceased persons")
    print("  * the CSV carries real names and emails: keep it in the git-ignored")
    print("    out/ directory and never redistribute it unencrypted")


if __name__ == "__main__":
    main()

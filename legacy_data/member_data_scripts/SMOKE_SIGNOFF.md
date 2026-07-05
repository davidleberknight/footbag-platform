# Legacy member-import full-apply smoke — signoff record

Operational validation of the legacy member-import pipeline (extract → reconcile →
QC gate → honors re-run → guarded apply → rollback), run on a throwaway database
copied from the local development database. Not a design document; a validation
certificate.

## Verdict: PASS WITH OBSERVATIONS

The full apply completed cleanly end to end, every post-apply check passed, both
rollbacks restored the exact prior state (byte-for-byte on `legacy_members` and the
`historical_persons` linkage), and a second apply reproduced the first. This run
exercises the tier-status columns end to end (populate on apply, clear on rollback),
which the prior run predated, and the audit-remediation behaviors (whole-group
collision hold-out, Stage B same-name review routing).

## Record

| Field | Value |
|---|---|
| Smoke date (UTC) | 2026-07-05T07:12:24Z |
| Dump SHA-256 (`members/backups/latest.sql`) | `fd9f2a4ff19493a2d9ea29b06210d9138da313ee2681cd6fe9c59e6ece264e6a` |
| Code version | git `749af1b8` ("Harden legacy member migration safety": whole-group collision hold-out, Stage B same-name review routing, tier-column rollback capture, stale-extract abort) |
| Schema SHA-256 (`database/schema.sql`) | `60fe3efbb54969fc09f01d91f1d3062bb0e66c68e7cf68816d59bf3568347261` |
| Rows imported (`import_source='legacy_site_data'`) | 25,346 |
| Accounts held out on email/user-id collision | 311 (entire groups, at both the reconciler and the loader) |
| Links applied (new `historical_persons.legacy_member_id`) | 2,022 (+ 390 already-linked no-ops) |
| Honors updated | 92 HoF / 54 BAP |
| Stage B link review | 66 rows / 34 groups, incl. 62 `multiple_accounts_same_name` (same-name multi-account groups routed to review, not auto-proposed) |
| Tier-status columns exercised | `legacy_ever_paid_tier2` = 316, `legacy_ever_paid_tier1_lifetime` = 513, `legacy_tier1_annual_active_at_cutover` = 0 (derivation inert without a cutover date); all cleared to 0 on rollback |
| Duplicate legacy-member links | 0 |
| Proposed accounts missing from `legacy_members` | 0 |
| Claim state | 3 rows, preserved through apply, rollback, re-apply, and re-rollback |
| Rollback verified | Yes — `legacy_members` and the `historical_persons` linkage restore SHA-256-identical to a fresh development-DB copy, after both the first and the second rollback; row count → 2,519 |
| Idempotency verified | Yes — a second apply-from-baseline reproduced identical import / link / honor / tier counts, and rolled back byte-for-byte. UPSERT re-import over already-applied rows is pinned separately by the loader unit test `test_rerun_is_idempotent` |
| Approved by | — (awaiting maintainer countersignature) |

## Observations (not failures)

1. **Throwaway DB provenance.** The smoke ran against a copy of the development
   database (`database/footbag.db`). It carries 13 `test` rows and 1
   blank-`import_source` persona row that a production-built cutover database
   would not, and its baseline honor and tier flags were 0. The pipeline handled
   these correctly (untouched), but a production cutover must run the final apply
   against a production-built database rather than a development copy.

2. **Honor worklist remains open** (as designed): 16 Hall-of-Fame honorees
   unresolved, plus Big-Add-Posse / Hall-of-Fame "no legacy account" entries. A
   tracked deferral, not a smoke fault; close or accept it before go-live.

3. **Pre-existing invalid-member links.** 16 `historical_persons` rows carry a
   `legacy_member_id` that points at an account outside the imported (valid) set.
   These predate the intake and are outside its scope; they are reported, not
   altered.

4. **Tier-status coverage is now included.** The prior signoff predated the three
   tier-status columns, so its `out/` artifacts never carried them and the load
   defaulted them to 0. This run regenerated the extract (which emits them), the
   load populated `legacy_ever_paid_tier2` / `legacy_ever_paid_tier1_lifetime`,
   and the rollback cleared them back to baseline. The loader now aborts on an
   export missing these columns, so a stale pre-derivation artifact can no longer
   be applied silently.

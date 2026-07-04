# Legacy member-import full-apply smoke — signoff record

Operational validation of the legacy member-import pipeline (extract → reconcile →
QC gate → honors re-run → guarded apply → rollback), run on a throwaway database
copied from the local development database. Not a design document; a validation
certificate.

## Verdict: PASS WITH OBSERVATIONS

The full apply completed cleanly end to end, every post-apply check passed, the
rollback restored the exact prior state, and a second apply reproduced the first
byte for byte.

## Record

| Field | Value |
|---|---|
| Smoke date (UTC) | 2026-07-04T16:51:56Z |
| Dump SHA-256 (`members/backups/latest.sql`) | `fd9f2a4ff19493a2d9ea29b06210d9138da313ee2681cd6fe9c59e6ece264e6a` |
| Code version | git `2eca8da8` (align reconciliation account universe with the loader) |
| Schema SHA-256 (`database/schema.sql`) | `589a5d8469bba97f510c2d82bdc417c7712bed01e880b98ff44e563a93a55bf5` |
| Rows imported (`import_source='legacy_site_data'`) | 25,495 |
| Links applied (new `historical_persons.legacy_member_id`) | 2,032 (+ 390 already-linked no-ops) |
| Honors updated | 92 HoF / 54 BAP |
| Accounts held out on email/user-id collision | 311 |
| Duplicate legacy-member links | 0 |
| Proposed accounts missing from `legacy_members` | 0 |
| Claim state | 3 rows, preserved through apply, rollback, and re-apply |
| Rollback verified | Yes (hp links → 408, import_source → baseline, inserted rows deleted, row count → 2,519) |
| Idempotency re-run verified | Yes (all 9 artifacts byte-identical; SQL checks reproduce) |
| Approved by | — |

## Observations (not failures)

1. **Throwaway DB provenance.** The smoke ran against a copy of the development
   database (`database/footbag.db`). It carries 13 `test` rows and 1
   blank-`import_source` persona row that a production-built cutover database
   would not, and its baseline honor flags were 0. The pipeline handled these
   correctly (untouched), but a production cutover must run the final apply
   against a production-built database rather than a development copy.

2. **Honor worklist remains open** (as designed): 16 Hall-of-Fame honorees
   unresolved, plus Big-Add-Posse / Hall-of-Fame "no legacy account" entries. A
   tracked deferral, not a smoke fault; close or accept it before go-live.

3. **Pre-existing invalid-member links.** 16 `historical_persons` rows carry a
   `legacy_member_id` that points at an account outside the imported (valid) set.
   These predate the intake and are outside its scope; they are reported, not
   altered.

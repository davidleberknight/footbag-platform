# Onboarding Review — Legacy Member Migration Audit

Adversarial systems audit of the end-to-end domain: moving legacy footbag.org members
safely onto the new platform. Read-only throughout; the only mutations made during the
audit were explicitly authorized by the maintainer during the question round (two
implementation-plan recordings and one two-line stale-test correction, each ruled below).

Audit date: 2026-07-04. Auditor: adversarial audit session driven by James (per the
onboarding QC-pass item in `IMPLEMENTATION_PLAN.md`). Every claim in this report was
verified against the repository; agent-assisted searches were re-verified by hand before
any finding was retained.

---

## 1. Context

**What was audited.** The full member-migration chain: dump extraction → validation →
reconciliation (Stage A duplicate-account review, Stage B person-link proposals, QC gate)
→ snapshot → load → link apply → honors backfill → historical persons → the platform's
claim / auto-link / onboarding / admin-recovery surfaces → tier derivation at claim →
deployment safety, CI isolation, docs, schema, and tests.

**Ground truth at audit time.**
- The legacy dump is present on this machine (git-ignored symlink), and the git-ignored
  `legacy_data/member_data_scripts/out/` artifacts from the 2026-07-04 full-apply smoke
  run exist (43,427-row extract; 25,495 rows imported in the smoke; 311 accounts held
  out on collisions; 2,422 person links proposed, 46 routed to review).
- The working `database/footbag.db` is in the mirror-preseed state (2,519 `legacy_members`
  rows, no `import_source='legacy_site_data'` rows): the real apply has never touched it.
  The smoke ran against a throwaway copy, as its signoff records. **Limitation:** the
  applied database no longer exists, so post-apply assertions were verified against the
  retained smoke artifacts and the code, not a live applied DB.
- Platform test suite: 6,908 tests green (`npm test`; one non-reproducing failure in a
  single run, consistent with the already-tracked same-millisecond tier-grant test
  fragility — it did not recur on re-run). Legacy-data pipeline suite: 348 tests green
  after the one stale-expectation fix ruled in the question round (Finding OR-L5).

**How to read this.** Findings are defects or gaps confirmed by attempted refutation.
Status facts (designed-but-not-deployed, blocked, deferred) are in the Accepted State
register, not in Findings — per `.claude/rules/deployed-surface.md`, a not-yet-built
capability is never reported as a gap.

---

## 2. Coverage Ledger

Disposition of every surface in the domain. **A** = audited, **OOS** = intentionally out
of scope, **NI** = not inspected (reason given).

### Pipeline scripts (`legacy_data/member_data_scripts/`)

| Surface | Disposition | Test coverage |
|---|---|---|
| `_dump_parser.py` (mysqldump parse + dump-root resolution) | A | `test_dump_parser.py` |
| `extract_legacy_members.py` (members dump → CSV; tier + board derivation) | A | `test_extract_legacy_members.py` |
| `extract_legacy_admins.py` | A | `test_extract_legacy_admins.py` |
| `extract_legacy_honors.py` (HoF/BAP flag backfill) | A | `test_extract_legacy_honors.py` |
| `validate_legacy_export.py` (pre-load gate report) | A | `test_validate_legacy_export.py` |
| `validate_legacy_honors.py` | A | `test_validate_legacy_honors.py` |
| `reconcile_legacy_members.py` (Stage A / Stage B / QC gate) | A | `test_reconcile_legacy_members.py` |
| `apply_reconciled_links.py` (writes `historical_persons.legacy_member_id`) | A | `test_apply_reconciled_links.py` |
| `load_legacy_export.py` (upserts `legacy_members`) | A | `test_load_legacy_export.py` |
| `snapshot_legacy_members.py` (rollback capture) | A | `test_snapshot_legacy_members.py` |
| `crosscheck_member_profile_ids.py` | A | `test_crosscheck_member_profile_ids.py` |
| `report_legacy_member_honors.py` | A | `test_report_legacy_member_honors.py` |
| `diff_live_honor_rosters.py` | A | `test_diff_live_honor_rosters.py` |
| `run_legacy_members.sh` (orchestrator) | A | `test_run_legacy_members_wiring.py` |
| `README.md`, `SMOKE_SIGNOFF.md` | A | n/a (docs) |

Every script in the member pipeline has a dedicated test file; none is untested.

### Application surfaces (`src/`)

| Surface | Disposition | Test coverage |
|---|---|---|
| `identityAccessService.ts` — claim lookup, `initiateLegacyClaim` (email fast path + token path), `consumeAndClaimLegacy`, `claimLegacyAccountInTx(Inner)`, HP direct claim, `classifyAutoLink`, anchors, disputes, `revertClaimForDispute` | A | `claim-hp.routes.test.ts`, `legacy-claim.merge.test.ts`, `claim-concurrency.test.ts`, `anchors-integration.routes.test.ts`, `anchor-mailbox-verification.routes.test.ts`, `auto-link-staged*.test.ts`, `auto-link.scenarios.test.ts`, `identityAccessService.revertAutoLink.test.ts`, `link-help-request.routes.test.ts`, `security.anti-enumeration.test.ts` |
| `memberOnboardingService.ts` — wizard task state, legacy-claim card, club confirmation | A | `onboarding-wizard-*.test.ts`, `memberOnboardingService.test.ts` |
| `membershipTieringService.ts` — legacy-claim grant, honor grant, governance Tier 3, revert grant, `member_tier_grants` ledger + `member_tier_current` view | A | `membershipTieringService.test.ts` (unit), `membership-tiering.service.test.ts` (integration) |
| `memberService.ts` — `purgeAccountPII` (clears claim, frees legacy row) | A | `memberService.purgeAccountPII.test.ts` |
| Routes: registration + verify; `/register/wizard/legacy_claim/*` (9 sub-routes); `/history/:personId/claim(/confirm)`; `/admin/work-queue/:id/link-help/{approve,reject,dispute-revert}`; `/admin/bootstrap-claim` | A | route tests named above; `admin-bootstrap-claim.routes.test.ts`, `admin-bootstrap-rate-limit.routes.test.ts` |
| Batch auto-link staging job (`operationsPlatform`) | A | `operationsPlatform.batchAutoLink.test.ts` |
| Templates for the wizard, claim confirm, member landing identity block | A | rendered-content assertions in the route tests; `memberLanding.identityBlock.test.ts` |

### Schema (`database/schema.sql`)

| Surface | Disposition |
|---|---|
| `legacy_members` (+ claim CHECK, `ux_legacy_members_claimed_by`, email/user-id indexes) | A |
| `members` claim columns (+ `ux_members_legacy_id`, `ux_members_legacy_email`, `ux_members_historical_person_id`) | A |
| `historical_persons` (+ `ux_historical_persons_legacy_member_id`) | A |
| `member_tier_grants` + `member_tier_current` view + immutability triggers | A |
| `member_onboarding_tasks`, `member_declared_anchors`, `account_tokens` (claim tokens), auto-link staging table | A |
| `audit_entries` usage on this surface (action-type inventory in §7) | A |

### Deployment, CI, environment

| Surface | Disposition |
|---|---|
| `scripts/deploy-to-aws.sh`, `deploy-local-data.sh`, `deploy-code.sh`, `deploy-rebuild.sh`, `deploy-migrate.sh` (stub), `run_dev.sh --all-data`, `scripts/reset-local-db.sh`, `ops/systemd/*` | A |
| Env guards (`refuse_if_deployed_target` in all three writers; `_seed_env_guard.py`; SEC-DB01) | A |
| `.github/workflows/*` (member-data exposure; test wiring) | A |
| `scripts/validate-legacy-import-gates.sh` (G1–G6) | A |

### Documentation

| Surface | Disposition |
|---|---|
| `docs/MIGRATION_PLAN.md` member-intake sections (§§15, 19, 24, 25, 28) | A |
| `docs/DATA_GOVERNANCE.md` legacy-member rules | A |
| `docs/DATA_MODEL.md` `legacy_members` / `historical_persons` sections | A |
| `legacy_data/member_data_scripts/README.md`, `SMOKE_SIGNOFF.md` | A |
| `IMPLEMENTATION_PLAN.md` tracked items (each factual premise re-verified; see §7) | A |

### Out of scope / not inspected

| Surface | Disposition | Reason |
|---|---|---|
| Crypto, CSP, dependency CVEs | OOS | Excluded by the audit brief |
| Club cross-validation of dump `clubs`/`clubcontacts` vs the mirror seed | OOS | Explicitly deferred in `IMPLEMENTATION_PLAN.md` (dump-intake block); not part of this intake |
| Mirror-scraper robustness | OOS | Tracked re-crawl-only deviation; no member-data flow at load time |
| `legacy_data/legacy_archive/` seal/ingest pipeline | NI | Phase-1 forensic layer, paused, never feeds live systems; no member-migration flow |
| Groups / votes / committee extractors | NI | Not yet built; the committee table has not arrived (blocked item, Steve) |
| Board / Tier-3 derivation | A (inertness verified) | Ships inert by ruling; confirmed inert (see Accepted State) |

---

## 3. Findings

No Critical findings. One High, six Medium, five Low. Each carries exactly one
recommended remediation. Where the maintainer already ruled during the question round,
the ruling is cited.

---

### OR-H1 (High) — The member loader silently keeps the first account of each shared-email group, defeating the designed ambiguity protection and enabling a wrong-identity claim

**Evidence.**
- `legacy_data/member_data_scripts/load_legacy_export.py:296-325` — the email-collision
  pass keeps the **first** row whose address was seen and drops only the later rows
  (same for user-id collisions).
- `legacy_data/member_data_scripts/reconcile_legacy_members.py:99-107` — reconciliation
  holds out **every** account in a collision group, and its docstring asserts the loader
  does the same ("the accounts the member loader drops … so it never lands them in
  legacy_members") — false for the first account of each group.
- `database/schema.sql:3548-3555` — the schema's design comment expects a still-colliding
  address to be caught at claim time ("the claim lookup returns multiple rows and
  surfaces no auto candidate"), an ambiguity backstop that never engages because the
  loader collapsed the collision.
- `scripts/validate-legacy-import-gates.sh:46-64` — gate G1 runs **post-load**, so after
  keep-first de-duplication it always passes; it cannot surface the ambiguity.
- `src/services/identityAccessService.ts:2250-2276` — the email-equality fast path: a
  member whose verified login email matches any of the legacy row's three addresses
  claims the account **inline**, with no further gate; `claimLegacyAccountInTxInner`
  (`identityAccessService.ts:1709-1732`) applies no surname or date-of-birth check on
  this path and immediately transfers identity fields and fires the tier grant.
- Empirical confirmation from the smoke artifacts: 25,655 valid accounts minus 25,495
  imported = 160 dropped — exactly keep-first arithmetic over the 311-account collision
  cohort (hold-all would have imported 25,344).

**Violated design source.** `docs/MIGRATION_PLAN.md` §25 gate G1: collisions "surface a
priori for curation." The claim evidence model (DESIGN_DECISIONS §6.5 /
`M_Claim_Legacy_Account`): mailbox control is strong evidence *because* an address
identifies exactly one account — the premise keep-first silently breaks. Also the
reconciler's own documented contract.

**Realistic failure scenario.** A family shared one mailbox on the legacy site (two
player accounts, one address — the dominant pattern in the 311). The loader attaches the
shared address to whichever account came first in the dump. After go-live, the *other*
family member registers with that mailbox, verifies it, and enters the claim flow: the
lookup finds exactly one account, the email-equality fast path fires, and they instantly
own the wrong identity — wrong competitive history, wrong honors, wrong tier grant. No
adversary required; G1 shows green throughout.

**Remediation (ruled — Accepted State #8).** Change the loader's collision passes to
exclude the **entire** collision group (email and user-id alike), matching the
reconciliation step and its documentation; correct the reconciler docstring's claim in
the same change. The 311-account cohort is adjudicated before the final production load
(now recorded under the data-remainder item in `IMPLEMENTATION_PLAN.md`); the claim-time
multiple-row backstop remains as defense-in-depth.

**Required tests.** Extend `legacy_data/tests/test_load_legacy_export.py`: a fixture with
a two-account email collision (and a user-id collision) asserts that **no** member of the
group is imported, that the exclusion counters name every dropped id, and that a
non-colliding account in the same file still loads.

---

### OR-M1 (Medium) — The smoke signoff predates the tier-derivation code, and a stale-artifact apply would silently ship tier flags as all zero

**Evidence.** `SMOKE_SIGNOFF.md:8,20` certifies PASS at git `2eca8da8`. Commit `a2f80d03`
(later; authored by Dave) added the three tier columns
(`legacy_ever_paid_tier2`, `legacy_ever_paid_tier1_lifetime`,
`legacy_tier1_annual_active_at_cutover`) to `extract_legacy_members.py` `OUTPUT_FIELDS`
(lines 41-53) and to the loader's field map and UPSERT
(`load_legacy_export.py:94-96,342-344,393-395`). The on-disk
`out/legacy_members_extract.csv` and `out/legacy_members_reconciled.csv` headers carry
**no tier columns** (verified directly), and the loader deliberately defaults absent
tier headers to 0 (`test_tier_status_columns_default_zero_without_headers`).

**Violated design source.** The signoff's own purpose: a recorded PASS is read as
covering current pipeline behavior. `MIGRATION_PLAN` §25 G6 requires the tier-state
inputs validated at a test load; the recorded smoke never exercised them.

**Realistic failure scenario.** A maintainer runs the cutover apply from the existing
`out/` CSVs (skipping `--extract`), trusting the PASS verdict. Every member's paid-tier
evidence loads as 0; claim-time grants derive from honors alone; 520 Tier-1 and 318
Tier-2 legacy standings are silently lost. Nothing errors.

**Remediation.** One package: regenerate the artifacts and re-run the full apply +
rollback smoke at current code before any real apply (recording the approver this time —
see OR-L4), and make `load_legacy_export.py` **abort** when the export lacks the three
tier headers (a fresh extract always emits them, so their absence proves a stale
artifact; the graceful zero-default stays only for the separate mirror pre-seed loader,
which has no tier columns by design).

**Required tests.** A loader test asserting the abort (non-zero exit, nothing written)
on a tier-headerless export; the re-run smoke recorded in `SMOKE_SIGNOFF.md` with the
tier columns listed as exercised.

---

### OR-M2 (Medium) — The rollback snapshot does not capture or restore the three tier columns

**Evidence.** `snapshot_legacy_members.py:44-50` — `RESTORE_COLUMNS` ends at
`is_hof, is_bap, legacy_is_admin, import_source, imported_at, version`; the three tier
columns the loader now writes are absent, so the emitted rollback UPDATEs neither
capture nor restore them.

**Violated design source.** The snapshot script's contract: rollback restores the prior
row for each overwritten account.

**Realistic failure scenario.** A tier-bearing apply is rolled back. Every overwritten
row's profile fields revert, but the newly loaded tier flags stay — the database is now
a hybrid of pre-apply profile data and post-apply tier evidence, and a later re-apply's
audit CSV (`will_update` diff) is computed against corrupted baselines.

**Remediation.** Add the three tier columns to `RESTORE_COLUMNS` (they exist in the
schema with `NOT NULL DEFAULT 0`, so pre-apply capture is always well-defined).

**Required tests.** Extend `test_snapshot_legacy_members.py`: snapshot a row, apply a
load that flips a tier flag, apply the rollback SQL, assert the flag reverts.

---

### OR-M3 (Medium) — Stage B auto-links on DOB-presence among several same-named accounts (ruled: route to review)

**Evidence.** `reconcile_legacy_members.py:494-511` — when one unlinked historical
person matches a normalized name shared by several dump accounts, the sole account with
a full DOB (or, failing that, the sole one with an email) is auto-proposed
(`name_dob` / `name_email`); the docstring (lines 20-23) is honest that historical
persons carry no DOB or email to compare against, so the tiebreak is data-presence, not
identity corroboration. The QC gate checks identity-invariant breaks and duplicates,
not wrongness, and `apply_reconciled_links.py` writes proposals without further review.

**Violated design source.** The pipeline invariant "ambiguous identity resolution never
auto-selects" (`legacy_data/CLAUDE.md`, DB invariants; mirrored in the auto-link design
in DESIGN_DECISIONS §6.5).

**Realistic failure scenario.** Two different people share a common name; the wrong one
filled in a birthdate on their footbag.org account. Stage B links the historical
person's competitive record to the wrong account; a later claim of that account carries
the wrong history and honors, with nothing downstream re-verifying.

**Remediation (ruled — Accepted State #13).** Route the "several same-named accounts,
exactly one with a DOB (or email)" case to the Stage B review CSV alongside the existing
ambiguous cases, instead of auto-proposing. The single-account-matches case (the
overwhelming majority of the 2,422 smoke proposals) is unchanged. Implement before the
final production load.

**Required tests.** Extend `test_reconcile_legacy_members.py`: a fixture with one HP name
matched by two accounts where exactly one carries a DOB asserts a review row (not a
proposal); same for the email tiebreak.

---

### OR-M4 (Medium) — The persons-master id generator mints duplicate historical persons across source types (one confirmed instance; ruled)

**Evidence.** `legacy_data/persons/scripts/05_build_persons_master.py:49-51` —
`stable_master_person_id(name_norm, source_types)` hashes the source-type string into
the person id; the call site (lines 210-215) applies it per candidate row with no
cross-source merge of same-normalized-name rows first. Confirmed in the local DB: the
name "Georg Waldispühl" holds two provisional person rows
(`master_person::b8bf9388de61cc6b`, source MEMBERSHIP; `master_person::c1e743c74f02abcb`,
source CLUB), byte-identical names, neither linked to a legacy account. A full
accent-folded scan over 5,364 persons found no other real duplicate (two same-name
groups are seeded test personas).

**Violated design source.** The identity invariant of one person, one id
(`AliasResolver` as sole identity authority, `legacy_data/CLAUDE.md`); the release gate
"no duplicate canonical persons."

**Realistic failure scenario.** One human gets two public historical-person pages, each
carrying half their history. Containment verified: Stage B routes same-name multi-person
cases to review, so a claim cannot silently attach to the wrong half.

**Remediation (ruled — Accepted State #10/#11).** Hand-adjudicate the confirmed pair now
through the existing merge/alias workflow (with the post-merge alias rebind); fix the
mechanism (merge same-name candidates across source types before id minting) in the same
post-cutover pipeline-rebuild slice as the deferred normalizer unification. Recorded as
its own deviation in `IMPLEMENTATION_PLAN.md`, distinct from the normalizer item. The
final-dump sign-off scan (Accepted State #9) re-checks this class; multiple instances on
the final dump reopen the timing question.

**Required tests.** With the mechanism fix: a persons-master unit test asserting one
merged row (single id) for a name arriving under two source types.

---

### OR-M5 (Medium) — `deploy-rebuild.sh` ships `database/footbag.db` byte-for-byte with no check that real member data isn't aboard

**Evidence.** `scripts/deploy-rebuild.sh:145-150` — with `SKIP_DB_REBUILD=yes` (the `-r`
deploy path) the local DB is **not** rebuilt; lines 209-229 rsync
`/database/footbag.db` verbatim to the remote release dir. The only pre-ship checks are
`PRAGMA integrity_check` and table existence — nothing inspects
`legacy_members.import_source` or any other real-data signal. The invariant currently
holds procedurally: no deploy script ever passes `--apply-members` (pinned by
`tests/integration/deploy-script.test.ts`), and the working DB is verified clean — but
nothing would refuse to ship a DB where a maintainer had run
`run_dev.sh --all-data --apply-members` locally first.

**Violated design source.** The ratified decision "Deploy remains preview-only.
Production deployment never applies member data" — upheld today by flag-plumbing and
operator discipline, but unenforced at the one step that physically moves a database to
production.

**Realistic failure scenario.** A maintainer applies the real member load locally for
testing (a supported local operation), forgets, and later runs a `-r` deploy against
production for an unrelated reason. 25k real member rows — emails, birth dates,
addresses — ship to the production host with no signal.

**Remediation.** Add a pre-rsync refusal alongside the existing integrity check: abort
if `legacy_members` contains any `import_source='legacy_site_data'` row. Platform-script
change (Dave's lane), so it is recorded here for pickup rather than applied by this
audit.

**Required tests.** Extend `tests/integration/deploy-script.test.ts` with a static
assertion that the guard query is present in `deploy-rebuild.sh` (matching the existing
style of deploy-script pinning), plus a shell-level fixture test if one exists for this
script family.

---

### OR-M6 (Medium) — The pipeline's guard and safety regression tests are wired into no automated runner

**Evidence.** No `pytest` reference exists in `.github/workflows/ci.yml` or
`run_all_tests.sh` (verified by grep). The 348-test `legacy_data/tests/` suite — which
carries the *only* regression coverage for the production/staging refusal guards in all
three DB-writing member scripts, the credential-header abort, claim-state preservation,
and the loader exclusion rules — runs only when someone remembers to invoke it.

**Violated design source.** `.claude/rules/testing.md` ("tests are load-bearing project
infrastructure"); the CI gate design in `docs/TESTING.md` §11.

**Realistic failure scenario.** A future edit weakens `refuse_if_deployed_target` in one
writer. Its regression test would catch it — but nothing runs the test, and the next
signal is the guard not firing when it matters.

**Remediation.** Add a python-tests tier to `run_all_tests.sh` that runs
`python3 -m pytest legacy_data/tests/ -q` (hermetic: the suite uses temp DBs and
fixtures), preserving the runner's real-data fingerprint contract. CI wiring can follow
as part of the already-tracked CI-gates item.

**Required tests.** None beyond the wiring itself; the suite already exists.

---

### OR-L1 (Low) — The two rollback SQL artifacts have no stated ordering or completeness discipline

**Evidence.** `snapshot_legacy_members.py` emits member-rollback SQL containing
`DELETE FROM legacy_members …` for newly inserted accounts with no
`PRAGMA foreign_keys` line; `apply_reconciled_links.py` separately emits link-rollback
SQL. `run_legacy_members.sh:256-259` prints the two files members-first. Applying only
the members rollback (or members-first under default `sqlite3`, which enforces no FKs)
leaves `historical_persons.legacy_member_id` pointing at deleted rows. Both files applied
in either order converge; the danger is partial application, and no runbook or output
states "links first, then members."

**Violated design source.** The rollback contract implied by the snapshot script's own
header; the append-only/consistency posture of `.claude/rules/db-write-safety.md`.

**Realistic failure scenario.** An operator reverting a bad cutover applies the files in
the printed order, is interrupted after the first file, and leaves ~2,000 dangling person
links.

**Remediation.** Emit `PRAGMA foreign_keys=ON;` at the top of both generated rollback
files and swap the orchestrator's closing message to print links-first with a one-line
"apply in this order; both files together restore the pre-apply state" note.

**Required tests.** Extend the snapshot and apply-links tests to assert the pragma line
is present in the emitted SQL.

---

### OR-L2 (Low) — The reconciler's docstring promises a shared-email same-name/different-name distinction that is not implemented

**Evidence.** `reconcile_legacy_members.py` module docstring (lines 13-16) describes a
Stage A review signal distinguishing "same email under one name" (same-person candidate)
from "under different names" (family mailbox, never recommended). The code builds only
`signal="name_dob"` groups; every shared-email account is diverted wholesale to the
excluded-accounts CSV with a bare `email_collision` reason.

**Violated design source.** The module's own documented contract.

**Realistic failure scenario.** The adjudicator of the 311-account cohort (now ruled a
pre-final-load task) expects the tool's promised triage and instead cross-references
names by hand across ~150 groups.

**Remediation.** Correct the docstring to describe the implemented (and now ratified)
hold-the-whole-group behavior. (The excluded CSV already carries `real_name` and
`collision_partners`, which suffices for the adjudication pass; building the promised
signal is not warranted.)

**Required tests.** None (documentation-only).

---

### OR-L3 (Low) — A test-file header claims "apply is not wired," contradicting the file's own tests

**Evidence.** `legacy_data/tests/test_run_legacy_members_wiring.py:19-20` — docstring
bullet "apply is not wired: no load --apply remains…"; the same file's
`test_apply_writes_are_guarded_by_the_apply_flag`,
`test_apply_loads_members_before_applying_links`, and
`test_member_snapshot_runs_before_the_member_load` assert the real, present `--apply`
path (matching `run_legacy_members.sh:233-253`).

**Violated design source.** `.claude/rules/comments.md` (test comments state the
long-term contract).

**Realistic failure scenario.** A future reader trusts the header and concludes the
pipeline cannot write, mis-planning a cutover step.

**Remediation.** One-line docstring correction.

**Required tests.** None.

---

### OR-L4 (Low) — The smoke signoff records no approver

**Evidence.** `SMOKE_SIGNOFF.md:31` — `Approved by | —`. The signoff's own template
expects an approver before the pipeline is treated as cutover-ready.

**Violated design source.** The signoff document's own contract; the data-review
sign-off blocker in `IMPLEMENTATION_PLAN.md`.

**Realistic failure scenario.** The PASS verdict circulates as an approval nobody gave.

**Remediation.** Record the approver at the OR-M1 re-run (one edit, same document).

**Required tests.** None.

---

### OR-L5 (Low, resolved during audit) — Stale kebab-case slug expectation left the pipeline suite red

**Evidence.** `legacy_data/tests/test_freestyle_media_coverage_embedded.py:52` asserted
`around-the-world` while the manifest was migrated to `around_the_world` in the
platform-wide underscore-slug migration (commit `fd2e1d3a`). Freestyle-media layer, not
member data; it was the suite's only failure.

**Violated design source.** The ratified underscore-slug convention
(`.claude/rules/view-layer.md`).

**Resolution (ruled — Accepted State #12).** The two assertion lines and the docstring
edge were corrected during the question round with explicit authorization; the file now
passes 10/10 and the pipeline suite is green at 348.

---

## 4. Edge-case & Persona Matrix

Persona / edge case → what the system does → verification status.

| # | Persona / case | Behavior | Status |
|---|---|---|---|
| 1 | New member, no legacy history | Registers, wizard offers legacy-claim task as skippable; no legacy workflow forced | Tested (`onboarding-wizard-*.test.ts`); "new members never confused" holds — the claim card only surfaces on a positive match or by explicit member action |
| 2 | Returning member, login email matches their legacy account | Email-equality fast path claims inline; single tier grant fires (honors/paid mapping) | Tested (`legacy-claim.merge.test.ts`); sound **given** address uniqueness — see OR-H1 |
| 3 | Returning member, changed email | Declared anchor (old email) + mailbox round-trip upgrades evidence; or token email to the legacy address | Tested (`anchors-integration`, `anchor-mailbox-verification`) |
| 4 | Family members who shared one mailbox | Loader currently assigns the address to the CSV-first account; wrong-identity claim possible | **OR-H1**; ruled: hold out whole group + adjudicate cohort |
| 5 | Two members claim the same legacy account concurrently | Unique indexes + transaction; loser gets `ConflictError`, full rollback including tier grant | Tested (`claim-concurrency.test.ts`); refuted as a risk |
| 6 | Member claims twice / re-claims | `checkAlreadyClaimed` + `ux_members_legacy_id`; grants never stack | Tested |
| 7 | Deceased person's record | Every claim entry point checks `is_deceased` and a deceased holder; no admin bypass exists | Tested (`claim-hp.routes.test.ts` deceased cases); verified unconditional in code |
| 8 | Admin-vetted evidence claim | Bypasses **only** the surname gate (`evidenceStrength !== 'admin_vetted_evidence'` guards just that check); deceased and already-claimed checks unconditional | Verified in code; matches the ratified ruling |
| 9 | PII-purged member's freed legacy row | Purge clears claim fields; partial unique indexes free the row; second member can re-claim | Design verified in code + schema comment; **end-to-end re-claim untested** (tracked gap, confirmed real) |
| 10 | HP-only claimant (Case C) | Direct HP claim with surname gate; profile merges HP fields | Adjacent partial coverage only (identity block test seeds via raw SQL); tracked gap confirmed real |
| 11 | Honoree (HoF/BAP) claims | Claim-time grant reads honor flags from row + transitive HP; tier2 | Tested (tiering integration tests) |
| 12 | Honoree resolved *after* claiming | No grant path exists (no route calls `applyHonorGrant`) | Ruled: KANBAN item added for an audited admin honor-grant surface |
| 13 | Board member at cutover | Derivation inert by design (`BOARD_IFPA_TIER_CODES` empty; board columns absent from schema) | Verified inert; blocked on Steve's committee table |
| 14 | Banned / invalid legacy account (`member_valid=0`) | Excluded at load; linkage pull-back imports it anyway if `historical_persons` references it (provenance wins) | Tested (`test_load_legacy_export.py`); design per DATA_GOVERNANCE |
| 15 | Duplicate accounts, same person (name+DOB) | Stage A review CSV (194 rows on the smoke); adjudication aid, never a merge | Tested (`test_reconcile_legacy_members.py`) |
| 16 | Same name, several accounts, one has a DOB | Currently auto-proposed | **OR-M3**; ruled: route to review |
| 17 | Wizard: two tabs / concurrent sessions | Task-state races unexercised | Tracked gap, confirmed real (no test simulates concurrency) |
| 18 | Anchor send-verification abuse | Per-IP/member/target rate limits in code; untested | Tracked gap, confirmed real |
| 19 | Enumeration probing (claim lookup, registration) | Response-shape equivalence tested; wall-clock timing untested anywhere | Shape: tested (`security.anti-enumeration.test.ts`); timing: tracked gap, confirmed real and broader than stated |
| 20 | Re-import over completed claims | Loader never touches `claimed_by_member_id`/`claimed_at` | Tested; CHECK constraint enforces both-or-neither |
| 21 | Mid-load crash | Single transaction per writer; FK pragma ON; uncommitted work discarded | Verified in code; partial-state risk refuted |
| 22 | Rollback after tier-bearing load | Tier flags not restored | **OR-M2** |
| 23 | Legacy credentials | `MemberPassword`/`MemberSession` dropped at parse; loader aborts on credential-shaped headers; no credential column in schema; nothing in the claim flow | Refuted as a risk at every layer |

---

## 5. Accepted State Register

Pre-ratified decisions (verified still holding), then rulings recorded during this
audit's question round.

**Pre-ratified (verified):**
1. **Deploy remains preview-only; production deployment never applies member data.** Holds: no deploy script passes `--apply-members` (statically pinned by test); all three writers refuse production/staging/`/srv/footbag`; working DB verified clean. Residual hardening: OR-M5.
2. **Tier derivation uses member status at cutover, not payment history.** Holds: the claim-time grant reads only the three `legacy_*` evidence flags + honor flags; no code path reads legacy payment tables.
3. **Legacy claiming is confined to onboarding; later linking is admin-only.** Holds: self-serve claim lives in the wizard/claim routes; post-hoc linking only via the admin work-queue approve path.
4. **Admin evidence bypasses only the surname gate.** Verified at the code level: only the surname check is conditional on evidence strength.
5. **Deceased protections are never bypassed.** Verified: unconditional checks at every claim entry point, shared by the admin path.
6. **Board / Tier-3 derivation remains inert until committee data exists.** Verified: `BOARD_IFPA_TIER_CODES` empty frozenset; board columns absent from schema and loader.
7. **Final Tier-1 annual derivation depends on Dave's cutover date.** Verified: `--cutover-date` / `FOOTBAG_CUTOVER_DATE` threads through the extractor; vacuously zero on the test dump (every ever-paid Tier 1 is lifetime).

**Ruled during this audit (James, 2026-07-04):**
8. **Shared-email/user-id collisions: hold out the entire group at load** (Option 1). Loader change is a confirmed finding (OR-H1); the 311-account cohort (test-dump-specific count) is recorded for adjudication under the data-remainder item.
9. **Person-id normalizer divergence stays deferred as tracked.** No id churn pre-cutover; the accent-folded duplicate scan joins the final-dump sign-off checks; real collisions on the final dump reopen the question as a post-cutover slice.
10. **Honor worklist process ratified.** Regenerate against the final dump as the authoritative list; curate every resolvable honor through the identity/alias machinery; honorees with genuinely no legacy account are terminal residue accepted in the sign-off (their historical-person record preserves the public honor); refresh the plan's counts then.
11. **Duplicate historical person ("Georg Waldispühl"):** hand-adjudicate now via the merge/alias workflow; the source-type id-generation mechanism (recorded as its own deviation, distinct from the normalizer item) is fixed in the same post-cutover rebuild slice; re-scan on the final dump; isolated = curation, multiple = revisit.
12. **The stale kebab-slug pipeline test was fixed during the audit** (authorized two-line test-only change); pipeline suite green at 348.
13. **Stage B DOB-presence tiebreak routes to manual review** — completeness is not identity evidence; implement with a regression test before the final production load (OR-M3).
14. **`applyHonorGrant` and `revertAutoLink` are designed-but-not-deployed.** A KANBAN item now tracks the audited admin honor-grant surface (new inductions continue post-migration); the dispute-gated path is documented as the sole supported revert workflow, and no general-purpose revert route will be added outside it.

---

## 6. Refuted Candidate Appendix

Candidates investigated and dismissed after a refutation attempt they did not survive.

| Candidate | Refutation |
|---|---|
| Double-claim race corrupts identity | `ux_legacy_members_claimed_by`, `ux_members_legacy_id`, `ux_members_historical_person_id` + single transaction + `SQLITE_CONSTRAINT_UNIQUE` → `ConflictError` with full rollback including the tier grant; directly tested (`claim-concurrency.test.ts`) |
| Honor backfill grants tier to the wrong member via name collision | HoF linking is a pure person-id join; BAP linking refuses any ambiguous name (`extract_legacy_honors.py`); ambiguous names land on the worklist, never auto-flag |
| Legacy credentials reach the platform | Dropped at dump parse (`MemberPassword`/`MemberSession` never mapped); loader aborts on credential-shaped headers before reading rows; no credential column exists in `legacy_members`; claim flow reads none |
| Re-import disturbs completed claims | Loader UPSERT never touches `claimed_by_member_id`/`claimed_at`; schema CHECK enforces both-or-neither; covered by test |
| Accent-variant duplicate historical persons exist today | Full accent-folded scan over 5,364 rows: zero pairs. The tracked deviation's risk is hypothetical on current data (the one real duplicate has a different root cause — OR-M4) |
| CI can see or apply real member data | No workflow references `run_legacy_members.sh`, `--apply-members`, or `member_data_scripts`; the db-load-smoke gate never touches the member pipeline; a build with no dump warns and skips |
| `deploy-to-aws.sh --all-data` threads a real member apply | The string `--apply-members` does not appear in the script; pinned by `deploy-script.test.ts`; only `run_dev.sh --all-data` (local) passes it |
| Mid-load crash leaves half-applied member data | Both writers run one transaction with `PRAGMA foreign_keys=ON`; an exception discards the pending transaction |
| Loader validation lets a credential-bearing export through when `validate_legacy_export.py` is run standalone | True that the validator doesn't re-check headers, but division of responsibility is documented in both files and the orchestrator always runs the loader dry-run (which aborts) immediately after validation |
| `member_tier_grants` immutability wholly untested | Nuance: the shared `assertAppendOnly` helper is indeed never pointed at this ledger (tracked gap stands), but an ad hoc DELETE-trigger check exists (`persona-refresh.service.test.ts`); UPDATE remains unexercised |
| The board/Tier-3 scaffold could fire accidentally | `BOARD_IFPA_TIER_CODES` is an empty frozenset; the two board columns exist only in the intermediate CSV, absent from schema and the loader's field map — nothing can consume them |
| The subagent-reported "prompt injection" during the audit | A benign harness date-rollover notice, over-read by one read-only agent; it took no action; no audit impact |

### Tracked-item premise verifications (per the brief: verify, don't duplicate)

| Tracked item | Verdict |
|---|---|
| Six catastrophic-surface test gaps (anchor rate-limit, timing-equivalence, wizard races, Case-C render, tier-ledger immutability, purge-freed re-claim) | All six premises real; two need nuance recorded: tier-ledger has one ad hoc DELETE-only check outside the shared helper, and Case-C has adjacent partial coverage seeded via raw SQL |
| Person-id normalizer divergence (deviation) | Every cited line range still exact; divergence real and unfixed; accent half unmanifested in current data (ruled: stays deferred) |
| Same-millisecond `member_tier_current` nondeterminism | Premise verified structurally (uuidv7 random suffix + `(created_at, id)` tiebreak); production-safe, test-only fragility as described |
| Board/Tier-3 blocked item | Consistent with code in every particular |
| Data-remainder honor figure ("~37 names") | Stale relative to the smoke signoff's more recent count (16 HoF unresolved + uncounted no-account entries); ruled: the regenerated report at the final load is authoritative and the plan updates then |

---

## 7. Remediation status (post-audit implementation pass, 2026-07-05)

The accepted remediations were implemented in a follow-up pass on this tree; a fresh
independent re-audit should verify each against the code rather than trusting this table.

| Finding | Status | Where |
|---|---|---|
| OR-H1 loader keep-first on collisions | **Fixed** — both collision passes hold out the entire group; docstring rewritten | `load_legacy_export.py` (collision passes + header docs); tests: whole-group email, cross-column email, whole-group user-id in `test_load_legacy_export.py` |
| OR-M1 stale-artifact tier zeroing | **Fixed** — the loader aborts when the export lacks the three tier-status headers; the `out/` artifacts were regenerated with the fresh (tier-bearing) extract and the full apply→rollback smoke was re-run on a throwaway DB, exercising the tier columns end to end | `load_legacy_export.py` (`TIER_FIELDS` + `resolve_headers`); test: stale-artifact abort; smoke record in `SMOKE_SIGNOFF.md` |
| OR-M2 rollback misses tier columns | **Fixed** — `RESTORE_COLUMNS` carries the three tier columns | `snapshot_legacy_members.py`; test: end-to-end tier-flag restore |
| OR-M3 Stage B DOB-presence tiebreak | **Fixed** — several same-named accounts always route to review (`multiple_accounts_same_name`) | `reconcile_legacy_members.py` Stage B; tests: single-DOB-among-several and single-email-among-several route to review |
| OR-M4 duplicate historical person | **Open by ruling** — hand-adjudication of the confirmed pair is a maintainer curation task; the mechanism fix is deferred to the post-cutover rebuild slice (tracked as its own deviation) | `IMPLEMENTATION_PLAN.md` deviations |
| OR-M5 deploy ships unchecked DB | **Fixed** — pre-rsync refusal when `legacy_members` carries any `import_source='legacy_site_data'` row, no bypass | `scripts/deploy-rebuild.sh` (REAL-MEMBER-DATA GUARD); static pin in `tests/integration/deploy-script.test.ts` |
| OR-M6 pipeline suite unwired | **Fixed** — `python-pipeline` gate runs `pytest legacy_data/tests/` in `run_all_tests.sh` (SKIPs cleanly when pytest is absent); CI wiring remains with the tracked CI-gates item | `run_all_tests.sh` |
| OR-L1 rollback ordering discipline | **Fixed** — both emitted rollback files carry `PRAGMA foreign_keys=ON` and name the links-before-members order; the orchestrator prints the numbered order | `snapshot_legacy_members.py`, `apply_reconciled_links.py`, `run_legacy_members.sh`; tests assert pragma + ordering note in both emitters |
| OR-L2 reconciler docstring promise | **Fixed** — Stage A / universe docstrings now describe the implemented hold-the-whole-group behavior | `reconcile_legacy_members.py` |
| OR-L3 stale "apply is not wired" header | **Fixed** | `test_run_legacy_members_wiring.py` |
| OR-L4 signoff has no approver | **Smoke re-run recorded; awaiting countersignature** — the re-run's facts are captured; the "Approved by" line is the maintainer's to sign | `SMOKE_SIGNOFF.md` |
| OR-L5 stale kebab-slug test | **Fixed during the audit** | `test_freestyle_media_coverage_embedded.py` |
| Honor-grant admin surface (ruling #14) | **Open (tracked)** — KANBAN item in the onboarding QC-pass section | `IMPLEMENTATION_PLAN.md` |

Verification at the close of the implementation pass: legacy-data pipeline suite 355
passed / 0 failed; `npm run build` clean; `deploy-script.test.ts` 31 passed; the
conventions gate passes. The full extract → apply → rollback smoke was re-run on a
throwaway DB copy (never the dev DB): 25,346 imported (311 collision accounts held
out whole-group), Stage B routed 62 same-name multi-account rows to review, the
tier columns populated (316 / 513) and cleared to 0 on rollback, and both rollbacks
restored `legacy_members` and the `historical_persons` linkage SHA-256-identical to
a fresh dev-DB copy; a second apply reproduced the first. `JAMES_AUDIT_PROMPT.md` is
removed; this report is the permanent audit artifact.

## 8. Reference: audit action-type inventory on this surface

`claim.legacy_account`, `claim.historical_person`, `claim.historical_person_blocked`,
`claim.dispute_opened`, `claim.revert_applied`, `legacy.auto_link_revert`,
`legacy.mailbox_link_token_issued`, `support.help_request_approved`,
`support.help_request_rejected`, `member.pii_purged`, `member.deceased_pii_scrubbed`,
plus the anti-enumeration auth actions (`auth.register_duplicate_email`,
`auth.login_rate_limited`, `auth.register_rate_limited`). Every governance-significant
write observed on this surface pairs with an audit row; the dispute revert writes
`claim.dispute_opened` + `claim.revert_applied` in one transaction.

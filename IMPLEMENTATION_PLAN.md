# IMPLEMENTATION_PLAN.md

Current-slice tracker and scope governor. Source of truth for active sprint status, accepted shortcuts, and in-scope vs out-of-scope boundaries. "Slice" and "sprint" are used interchangeably.

## Active slice now

### Parallel tracks (current sprint)

Two developers work in parallel. **AI assistants: read only the track section matching the active developer; other tracks are out-of-scope noise.** Identify the developer from the git user, the prompt, or by asking.

| Dev | Handle | Track | Section |
|---|---|---|---|
| Dave | (primary maintainer) | Tier 2 hardening (CloudWatch, backup, audit logging, catalog audit) | "Sprint: Tier 2 hardening" |
| James | JamesLeberknight | Historical pipeline completion (data import / legacy migration) | "James's track" (routing only; detail in `legacy_data/IMPLEMENTATION_PLAN.md`) |

Cross-track changes require explicit human coordination.

### Sprint: Tier 2 hardening

Pre-cutover revert / rotation / scrub checklist lives in `docs/MIGRATION_PLAN.md` §28.8 (permanent gate; 7 items). Do not duplicate here.

**Staging wiring readiness probe:** `tests/smoke/staging-readiness.test.ts` via `npm run test:smoke` (`RUN_STAGING_SMOKE=1`; excluded from default `npm test`). Asserts staging runtime identity + KMS/SES reachability. Operator runs on every staging AWS wiring change. Blocked on host-Node install (post-sprint tidy-up below).

**In scope (review tasks first, then build):**

- **1-G CloudWatch agent** (S). Per MP §28.2. Unblocks richer `/health/ready` memory-pressure gating (DD §8.4).
- **Backup/restore workflow** (M). Per MP §28.1. Must land before prod data is at risk.

**Post-sprint infra tidy-up (not blocking sprint closure):** install Node 22 on staging host via nodesource; extend `scripts/deploy-rebuild.sh` rsync includes to ship `tests/` so operator can run `npm run test:smoke` on-host.

### Open production-rewrite item (carried over)

**Legacy account claim:** current `identityAccessService.lookupLegacyAccount` / `claimLegacyAccount` is the early-test shortcut (direct lookup + confirm + merge; routes `POST /history/claim` + `POST /history/claim/confirm`). Gaps vs target design: anti-enumeration messaging (`claimController.ts:333-365` returns distinct not-found vs confirmation; SC §1.1 requires identical UX), `member_tier_grants` writes (MP §2 / §8, gated on legacy-dump schema extension), and `audit_entries` for the 11 migration event types (MP §17). Deferred to Phase 4-F'.

**Registration-time auto-link (MIGRATION_PLAN §6):** not yet implemented. Requires seeding the `name_variants` table (see `legacy_data/IMPLEMENTATION_PLAN.md`) and wiring the tier classifier into `verifyEmailByToken`. Deferred to Phase 4-F'.

**Club onboarding flow (MIGRATION_PLAN §9.3 Stages 1-3):** not implemented. Schema present (`member_club_affiliations`, `legacy_person_club_affiliations`, `legacy_club_candidates`, `club_bootstrap_leaders`); no controller, service wiring, or tests. Deferred to Phase 4.

**Routing invariants:** `/members` dashboard (auth) or welcome (public); `/members/:memberKey/*` profiles; `/history/:personId` historical detail; `/history` 301s to `/members`; `/register` registration; home Media Gallery is coming-soon (no `/media` route).

### Active sprint decisions (positive state)

- Auth is DB-backed via `identityAccessService.verifyMemberCredentials`. Session mechanism is JWT (RS256, KMS or local RSA-2048 signer per env) with per-request `password_version` check.
- **Intentional:** "Footbag Hacky" is a permanent seeded preview-user account with a non-email login identifier. Identifier may appear in seed scripts and test files; password lives only in `STUB_PASSWORD`, never committed. Canonical docs refer to the account by role, not identifier.
- `PageViewModel<TContent>` contract enforced across non-home public pages.

### Current gaps vs long-term user stories

- Profile edit is narrower than the full story (external URLs, broader contact/preferences not yet implemented)
- Profile viewing is narrower (own profile + HoF/BAP public exception only; no broad member-profile viewing)
- `/events` upcoming-events region remains omitted; reinstate (with empty-state per `docs/VIEW_CATALOG.md §6.8`) when the data contains actual upcoming events. Current dataset is completed events only.
- These are accepted current-slice limitations; do not silently erase them from `docs/USER_STORIES.md`.

### Out of scope this sprint

S3 media pipeline, account deletion, data export, `M_Review_Legacy_Club_Data_During_Claim`, registration slug customization, public member directory, membership tiers/dues, legacy claim production rewrite (Phase 4-F'), club onboarding flow (MIGRATION_PLAN §9.3 Stages 1-3, Phase 4).

**Account-deletion implementation hook:** when PII purge lands (M_Delete_Account, DD §2.4 rule 5), the purge transaction must call `legacyClaim.clearClaim(legacy_member_id)` alongside setting `personal_data_purged_at`. Statement exists.

### Removed (do not search)

- Display name editing in profile edit. Name and slug are permanent post-registration.

### Verification

Canonical commands: `npm test` and `npm run build`. Not yet covered by tests: 500 handler, honor-roll routes, browser/UI. Browser verification is explicit-human-request-only.

---

## James's track: Historical pipeline completion (parallel)

Tracked in `legacy_data/IMPLEMENTATION_PLAN.md`. Load only when working in that subtree. Platform-side blockers dependent on this track are listed under "Blocked / deferred" below.

---

## Accepted temporary deviations

Each has an explicit unblock condition. Long-term docs preserve target design; current-slice exceptions live here.

### Feature deviations

1. **Member profiles have conditional public visibility.** `/members/:memberKey` public for HoF/BAP; auth-required otherwise.
2. **Member search is authenticated only.** `/members` covers members + historical persons with dedup. No public directory.
3. **Avatar pipeline is local-only.** No server-side processing; raw uploads stored as-is (Busboy streaming, 5 MB limit); stable path + `?v={media_id}` cache-bust. `PhotoStorageAdapter` boot-time/parity/staging-smoke trio still to complete for S3 impl. Unblock: S3/media pipeline.
4. **Cache-Control at app layer, not CloudFront cache policy.** DD §6.7 target is the AWS managed `CachingDisabled` policy; current is Express middleware for authenticated responses. Functionally equivalent.
5. **`/legal` `admin@footbag.org` greyed as "mailbox not yet active".** `.contact-pending` span replaces `mailto:` across Privacy, Terms, Copyright contact lines. Unblock: IFPA domain acquisition + SES identity provisioning.
6. **Vimeo click-to-load facade not implemented.** Privacy section on `/legal` states Vimeo uses the click-to-load facade; only YouTube is covered today (`youtube-facade.js`). Unblock: media pipeline (Phase 3+).

### Infrastructure deviations

7. **No closed backup/restore workflow.** Unblock: Dave's Tier 2 sprint / MP §28.1.
8. **Maintenance mode not production-grade.** Unblock: 1-F / MP §28.3.
9. **CloudFront hardening incomplete.** Unblock: 1-F / MP §28.3.
10. **CI/CD partial.** App CI active; operator-driven deploy scripts under `scripts/`. Remaining: 1-F, 1-G.
11. **Monitoring partial and gated.** Unblock: 1-G / MP §28.2.
12. **Terraform trust-policy stub for runtime role.** `terraform/staging/iam.tf:16-85` declares `ec2.amazonaws.com` as the stub trust policy; Console-amended to trust the source-profile IAM user. Source-profile AssumeRole chain otherwise active per DD §7.2. HCL reconciliation deferred. Unblock: post-sprint infrastructure tidy-up.
13. **Bootstrap security shortcuts remain.** Operator IAM + SSH use bootstrap posture. Unblock: pre-launch security pass.
14. **Browser validation manual-only.** Route/integration tests are first verification path.
15. **`image` container absent.** Docker Compose has `nginx`, `web`, `worker`. Unblock: Phase 3+ media pipeline.
16. **`/health/ready` is DB-probe only.** DD §8.4 adds memory-pressure gating + broader dependency checks. Unblock: 1-G / MP §28.1 + §28.2.
17. **`/internal` routes gated at member-level only.** All `/internal/*` routes (persons QC, net QC decision POSTs, candidate approve/reject) use `requireAuth` with no role check. Any registered member can approve/reject QC curation decisions that alter public Net data. Intentional dev/staging shortcut to unblock QC reviewers without a role system. Unblock: admin/operator role gate before go-live. Files: `src/routes/internalRoutes.ts`, `src/middleware/auth.ts`.
18. **`terraform/staging/terraform.tfvars` missing `ses_sender_identity`.** Variable is declared in `terraform/staging/ses.tf` with no default, so `terraform plan|apply` from `terraform/staging/` fails today; SES identity was verified by hand via Console. Unblock: add `ses_sender_identity = "..."` to tfvars in the same task that reconciles the `OutboundEmail` IAM policy into HCL (MP §28.4 gate).
19. **`TRUST_PROXY` implicit in production compose.** `docker/docker-compose.prod.yml` does not set `TRUST_PROXY`; `src/config/env.ts` defaults to 2 under `NODE_ENV=production`. Correct today but invisible to operators. Unblock: set `TRUST_PROXY=2` explicitly in compose env after 1-F origin-bypass hardening closes (re-evaluate integer hop count vs explicit subnet allow-list at that time).

---

## Blocked / deferred

- **Members ungating**: public historical-person detail pages blocked on James's data review sign-off. Current split: `/history*` historical surfaces, `/members/:memberKey/*` member-account area.
- **World records page**: route `/records` live with empty state; blocked on James's records CSV.
- **BAP honor-roll pages**: member-page indicators implemented; full honor-roll deferred.
- **Broader service contracts**: `docs/SERVICE_CATALOG.md` may remain broader than active slice; implementation status is governed here, not there.
- **Freestyle trick metadata tables**: 5 `freestyle_trick_*` tables scaffolded in `database/schema.sql`; no loader, no `db.ts` statements, no consumer. Phase 4+ (curated tricks browser).

---

## Out of scope now

Schema migration framework (rebuild-based; intentional); full auth (Phase 4); media/news/tutorial implementation; broader person-identity redesign; fuzzy event-key rewriting; `publicController` target design.

---

## v0.2 blocking note

IFPA rules integration planning can continue, but implementation must wait for Julie's official published wording before rule text is treated as current. For each change, classify impact: docs-only / config-only / schema-affecting / service-logic-affecting / UI-display-affecting.

---

## Phase roadmap (active/next only)

**Phase 1 — Verification foundation + CI/CD.** Remaining: 1-F security hardening (M), 1-G CloudWatch agent (S).

**Phase 4 — Auth hardening + email activation.** Remaining:

| # | Task | Size | Dep |
|---|------|------|-----|
| 4-F' | Legacy claim production rewrite: email-verified flow, name reconciliation, rate limiting | M | -- |

Later phases (unsequenced): organizer write flows; admin work queue; membership tiers/Stripe; voting/elections; media galleries; IFPA rules integration; HoF; mailing lists; richer readiness checks.

---

## Open risks

- IFPA rules integration depends on Julie's published wording (external).
- Schema is `database/schema.sql` (unversioned); seed pipeline runs via `scripts/reset-local-db.sh`.

# IMPLEMENTATION_PLAN.md

This document is active during normal repo work. It is the current-slice tracker and scope governor for maintainers, contributors, and AI assistants. ("slice" and "sprint" are used interchangeably.)

For non-trivial work, read this top status block first, then only the relevant downstream docs and code.
This file — not auto memory — is the source of truth for current slice status, accepted shortcuts, and in-scope vs out-of-scope boundaries.

## Source-of-truth order for active work

- `docs/USER_STORIES.md` is the functional source of truth; for current work, focus on the specific User Stories in question.
- Current code is the source of truth for implemented behavior.
- This plan governs current-slice scope, sequencing, out-of-scope boundaries, and known drift.
- Derived docs in `docs/` remain canonical references for the areas they cover, but only `docs/VIEW_CATALOG.md` is intentionally partial for the current public slice.

## Active slice now

### Sprint: Club + members ungating + world records

**Status:** Clubs sprint is almost complete. Site is live with legacy (dirty) club data, initial world map, and home/clubs/members pages. Remaining items below.

**Completed this sprint:**
- Club seed extraction: `legacy_data/scripts/extract_clubs.py` + `load_clubs_seed.py`; `scripts/reset-local-db.sh` updated
- `src/services/clubService.ts`: `listPublicClubs()`, `getClubsByCountry()`, world-map data shaping
- Clubs index page (`/clubs`): country-grouped list with SVG world map (interactive, JS-enhanced; degrades to list without JS; hidden on mobile ≤768px)
- Clubs country page (`/clubs/:countrySlug`): clubs grouped by region, external links
- Clubs detail page (`/clubs/:countrySlug/:clubSlug`): individual club view
- Integration tests: `tests/integration/clubs-auth.routes.test.ts`
- Home page polish: 3-column card layout, aligned buttons, correct tab title ("Footbag Worldwide"), fixed active nav highlight
- Hero text updates: clubs intro, members intro

**Remaining this sprint:**

### Item 1 — Members ungating

**Blocked on:** James confirming legacy data complete and member-list presentation reviewed.

When unblocked:
- Remove `authMiddleware` from `/members` and `/members/:personId` in `src/routes/publicRoutes.ts`
- Review member-list template for presentation issues before removing gate
- Update `docs/GOVERNANCE.md` note if needed
- Integration test: confirm `/members` returns 200 without auth
- Fully clean and integrate club-member data

### Item 2 — World records page

Route: `/records` (new public page). Sequencing: extend-service-contract → add-public-page → write-tests → doc-sync

- `legacy_data/scripts/extract_records.py` (new): explore `legacy_data/mirror_footbag_org/` for world records pages; output `legacy_data/seed/records.csv` (gitignored); columns TBD after mirror exploration (expected: discipline, record_holder, record_value, date_set, location, notes)
- `legacy_data/scripts/load_records_seed.py` (new): load into DB; evaluate at sprint start whether a `world_records` table is needed or existing schema fits
- Wire both scripts into `scripts/reset-local-db.sh`
- `src/services/recordsService.ts` (new): `listWorldRecords(): WorldRecord[]`
- `src/controllers/recordsController.ts` (new)
- `src/views/public/records.hbs` (new): records grouped by discipline
- Add `/records` to nav in `src/views/layouts/main.hbs`
- Add `/records` route in `src/routes/publicRoutes.ts`
- Integration tests for GET `/records`

### Completed last sprint (clubs sprint + infra sprint)

Key deliverables: clubs page with real legacy data (world map, country pages, detail pages), home page polish, 404/500 error pages, data-independent smoke check, terraform fmt/validate CI job, branch protection on main. Three deploy scripts created: `scripts/deploy-code.sh` (code-only, DB untouched), `scripts/deploy-rebuild.sh` (destructive staging/dev DB rebuild), `scripts/deploy-migrate.sh` (stub, not yet implemented).

### Decisions for this sprint

- Members ungating: BLOCKED — do not remove `requireAuth` until James confirms legacy data complete and member-list presentation is reviewed
- Club join/leave flows: out of scope
- World records schema: evaluate at sprint start whether a `world_records` table is needed
- Real login (Phase 4 auth): DEFERRED — legacy data must be 100% before member onboarding
- `src/types/page.ts` is live and correct; `PageViewModel<TContent>` contract enforced across non-home public pages

### Sprint verification checklist

1. `bash scripts/reset-local-db.sh` — completes without errors
2. `npm run dev` → visit `http://localhost:3000/clubs` — world map + clubs listed by country
3. `npm test` — all tests pass
4. `bash scripts/deploy-code.sh '<password>'` — code-only deploy (DB untouched), smoke check passes

## Next sprint (planned, not yet active)

### Sprint: Member Auth + Profile MVP

**Goal:** Replace the single-credential stub with multi-user DB-backed login. Seed real test member accounts (David Leberknight, James Leberknight, Julie Symons). Give logged-in members a navigable account area with a real profile view/edit and stub pages for all future member features. Make the distinction between historical persons and active member accounts explicit in the UI.

**Pre-implementation gate:** Read `docs/GOVERNANCE.md` before any work touching auth, members, or historical-persons visibility.

**Decisions for this sprint:**
- Auth dual-path: check `members` table first by email (argon2id hash); fall through to env-var stub if no match. Stub user (`footbag`) is unchanged; logs in with `footbag` in the email field, fails DB lookup, falls through to stub check.
- Login form field renamed from `username` to `email`. Real member login is email-only.
- Schema change: add `legacy_claim_tokens` table. Handled via DB rebuild (no migration runner).
- Seed passwords via env vars (dev default documented in `.env.example`, never in any checked-in file); seed script marks accounts as `email_verified_at` so no email flow is needed.
- Seed also creates state-2 placeholder `members` rows for David, James, Julie — needed for the claim flow to find and merge.
- Avatar: show on profile if `avatar_media_id` is set; upload UI is a stub. No S3/media pipeline work this sprint.
- Historical persons page (`/members`) remains showing `historical_persons` data; add a clear UI label distinguishing legacy records from authenticated accounts.
- Claim email deviation: in non-production, the claim link is shown on-screen (email outbox deferred). See accepted deviations.

**Items:**

#### Item A — DB-backed multi-user auth

- Add `argon2` dependency for `argon2id` hashing
- `src/db/db.ts` new statements: `findMemberByEmail(email)`, `updateMemberLastLogin(memberId)`
- `IdentityAccessService` (new or extend): `verifyMemberCredentials(email, password)` — returns member row or null
- Update `authController.postLogin`: check DB first, fall through to env-var stub if no DB match
- Update `SessionUser`: add `displayName` field so nav can show the member's name
- Integration tests: login with real DB credentials succeeds; bad password fails; stub user still works

#### Item B — Test seed data

- `legacy_data/scripts/seed_members.py` (new): creates real `members` rows for David Leberknight, James Leberknight, Julie Symons; also creates state-2 placeholder rows for their legacy identities (no credentials, legacy fields set) for the claim flow to find and merge; env-var stub remains unchanged
- Passwords from env vars (`SEED_PASSWORD_DAVID`, etc.); `.env.example` documents the var names
- Seed accounts: `email_verified_at` set, `searchable = 1`, Tier 0 initially; can manually set `is_admin = 1` for David via script flag
- Wire into `scripts/reset-local-db.sh`

#### Item C — Legacy account claim (real partial implementation)

Route: `/account/claim/*`. Sequencing: extend-service-contract → add-public-page → write-tests.

Follows `M_Claim_Legacy_Account` user story in full except the email send step (see deviation below).

- New `legacy_claim_tokens` table in `database/schema.sql` (handled via DB rebuild)
- `legacyClaim` DB statement group: find placeholder by legacy_member_id / legacy_user_id / legacy_email; create/find/consume token; atomic merge + placeholder delete
- `identityAccessService`: `initiateClaim`, `validateClaimToken`, `completeClaim`
- Routes: `GET /account/claim`, `POST /account/claim`, `GET /account/claim/verify/:token`, `POST /account/claim/verify/:token`
- Templates: claim form, claim-sent page (with dev claim link), claim-verify confirmation
- Integration tests: lookup found/not-found (enumeration-safe), token validation, wrong-member check, confirm merge + placeholder deleted

**Accepted deviation:** claim link is shown on-screen in non-production (email outbox deferred). Unblock: Phase 4-D email outbox activation.
**Out of scope this sprint:** `M_Review_Legacy_Club_Data_During_Claim` (no provisional club leadership data). Unblock: club-member leadership import.

#### Item D — Member account area (routes + nav)

All routes require auth. Sequencing: extend-service-contract → add-public-page → write-tests.

**Real (full implementation):**
- `GET /account` — redirect to `/account/profile`
- `GET /account/profile` — view own profile: avatar placeholder, display name, bio, city/country, tier badge stub
- `GET /account/profile/edit` + `POST /account/profile/edit` — edit bio, display name, city, region, country, phone, email visibility toggle

**Stub pages (placeholder "coming soon" template, no backend):**
- `GET /account/avatar` — Upload Avatar
- `GET /account/media` — Share Media
- `GET /account/settings` — Account Settings
- `GET /account/password` — Change Password
- `GET /account/download` — Download My Data
- `GET /account/delete` — Delete Account

**Nav:** Add "My Account" link in `main.hbs` when `isAuthenticated`; show member display name; links to profile, claim, and stub sections

#### Item E — Historical persons page label

- Add a visible "Historical Records" label / explainer to `/members` index and detail pages
- Short text: these are legacy imported player records, not current member accounts
- No data or routing changes; templates only

#### Item F — Integration tests

- Login with each seeded test account succeeds
- Login with wrong password returns error
- Stub user login still works
- `GET /account/profile` returns 200 for authenticated user, 302 redirect for visitor
- `POST /account/profile/edit` saves bio change, redirects back to profile
- Stub pages return 200 for authenticated users

**Sprint verification checklist:**
1. `bash scripts/reset-local-db.sh` — completes, seeds test members
2. `npm test` — all tests pass
3. Log in as test member → see profile with display name → edit bio → save → see change
4. Log in as stub admin → still works
5. Visit `/members` → see "Historical Records" label

**Out of scope:**
- Email verification flow
- Password reset / change password (stub page only)
- Real avatar upload
- Account deletion, data export (stub pages only)
- `M_Review_Legacy_Club_Data_During_Claim` sub-flow (no provisional club leadership rows exist yet)
- Member search
- Membership tiers / dues
- Email outbox activation (claim link shown on-screen in dev as accepted deviation)

---

## Drafted next, but not active code focus now

- BAP honor-roll pages — deferred; member-page indicators are already implemented
- Broader service contracts may remain documented in `docs/SERVICE_CATALOG.md`, but implementation status is governed here, not there.

## Out of scope now

- Schema migration framework — schema changes are handled by rebuilding the DB; no migration runner needed
- Full auth implementation (Phase 4 sequencing unchanged; deferred until legacy data is complete)
- media/news/tutorial implementation work
- broad person-identity redesign
- a platform-wide persons subsystem
- authenticated account-claim requirements for historical imported people
- fuzzy event-key rewriting or hyphen/underscore alias behavior
- a `publicController` target design

## Known current drift rules

- `docs/VIEW_CATALOG.md` is intentionally partial and only needs to catalog implemented or actively specified current-slice views.
- `docs/SERVICE_CATALOG.md` may remain broader than the active slice and should not be treated as a status board.
- When code and docs diverge, contributors and AI assistants must say so explicitly rather than flattening the disagreement.

## Current deployed baseline

The current deployed public slice is the baseline, not a throwaway prototype.

Current implemented public routes:
- `/`
- `/clubs` — real data; SVG world map (JS-enhanced, degrades to list, hidden mobile); country index
- `/clubs/:slug` — handles both country pages (clubs grouped by region) and individual club detail pages
- `/hof` (first-class Hall of Fame landing page for the current slice; links out to the current standalone HoF site)
- `/events`
- `/events/year/:year`
- `/events/:eventKey`
- `/members` (auth-gated for now — Tier 1 historical data per GOVERNANCE.md §4, but kept gated temporarily: the current full-member-list render is a useful auth-path test and guards against exposing an unreviewed list; remove gating once member-list presentation is reviewed and scoped correctly)
- `/members/:personId` (auth-gated for the same reason as above)
- `GET /login` (auth stub login form)
- `POST /login` (auth stub login handler — sets session cookie, redirects to `/members`)
- `POST /logout` (clears session cookie, redirects to `/`)
- `/health/live`
- `/health/ready`

Real historical data is loaded and visible on public routes.

Current implementation constraints:
- server-rendered Express + Handlebars
- thin controllers
- service-owned page shaping and use-case logic
- one prepared-statement `db.ts` module
- logic-light templates
- route ordering matters for `/events/year/:year` before `/events/:eventKey`
- `OperationsPlatformService` currently composes only the minimal DB readiness check
- schema changes require a DB rebuild (no migration runner; this is intentional)

Current verification baseline:
- canonical verification commands: `npm test` and `npm run build`
- route and integration tests are the first verification path
- a single integration test file (`tests/integration/app.routes.test.ts`) covers: health, home, clubs, hof, events (list/year/detail), login, logout, auth redirects, members index, members detail, catch-all 404
- not yet covered: 500 error handler, world-record routes (this sprint), honor-roll routes (deferred), worker behavior, browser/UI verification
- browser verification is explicit-human-request-only

## Accepted temporary deviations

These are known, intentional shortcuts. Each has an explicit unblock condition. Agents must not treat long-term docs, prior memory, or broader catalog docs as overriding these.
For current implementation work, this plan governs current scope.
Long-term catalogs should preserve target design; current-slice exceptions belong here, not as scattered caveats throughout every cataloged page.

1. **Auth is a fake stub.** HMAC-signed cookie, env-backed credentials, no DB session check, no CSRF flow, no password-version or session-invalidation model. Mirrors the real auth path structurally. Unblock: replace with real JWT/DB auth (Phase 4) before member onboarding.

2. **Members routes are temporarily auth-gated.** `/members` and `/members/:personId` are Tier 1 public historical-person data per `docs/GOVERNANCE.md §4–5` and should eventually be public. Currently gated to protect an unreviewed public presentation and to exercise the auth path. Unblock: review member-list presentation scope, then remove `requireAuth`.

3. **The current `/members` full-list/filter surface is temporary.** The implemented page currently renders an authenticated full historical-record list with client-side filter/sort. This is a bootstrapping and review surface, not the final public member-directory/search design. Unblock: finalize the privacy-safe public member discovery/search design, then replace the current list/filter behavior accordingly.

4. **Worker has no real jobs.** `worker.ts` exits cleanly; the worker container is scaffolded only. No outbox, email, or background-job processing is active. Unblock: Phase 4 email outbox activation.

5. **No closed backup/restore workflow.** S3 bucket is scaffolded; no backup producer exists in app or worker; no restore drill has been run. `/health/ready` is a DB-probe only. Unblock: implement backup job in worker and run a restore rehearsal before any production data is at risk.

6. **Maintenance mode is not production-grade.** CloudFront maintenance-origin/error behavior is omitted from Terraform; direct-origin failover is not implemented. Unblock: Phase 1-E CloudFront pass 2.

7. **CloudFront hardening incomplete.** X-Origin-Verify header is absent from Nginx; OAC/ordered-cache controls are deferred; direct-origin bypass is unprotected. Unblock: Phase 1-F security hardening.

8. **CI/CD pipeline is partial.** App CI is active: `.github/workflows/ci.yml` runs `npm run build` + `npm test` + terraform fmt/validate on push and PR. Three deploy scripts exist: `scripts/deploy-code.sh` (code-only), `scripts/deploy-rebuild.sh` (destructive DB rebuild), `scripts/deploy-migrate.sh` (stub, not yet implemented). Remaining gaps: CloudFront not wired into CI (1-E), security hardening (1-F), CloudWatch agent not installed (1-G). Unblock: Phase 1-E/F/G.

9. **Monitoring is partial and intentionally gated.** CloudWatch log groups and alarms are Terraformed; CloudWatch agent install is TODO; monitoring gates default false; backup freshness metric has no producer. Unblock: Phase 1-G agent install + backup job.

10. **Runtime config is manually managed.** App reads local env vars from `/srv/footbag/env` only. SSM/IAM scaffolding exists but app runtime does not consume it. Unblock: when runtime AWS calls (SSM, S3, SES, KMS) are activated.

11. **Bootstrap security shortcuts remain.** Operator IAM and SSH access use bootstrap-era posture, not the final hardened model. Unblock: explicit security hardening pass before production launch.

12. **Browser validation is manual-only.** No automated browser/UI tests. Route and integration tests are the first verification path. Browser checks are explicit-human-request-only.

13. **`image` container is absent.** Docker Compose defines `nginx`, `web`, and `worker`; the `image` container (photo processing, S3 sync) is a later-phase artifact and is not present. Unblock: Phase 3+ media pipeline work.

14. **`/health/ready` is a DB-probe only.** Current implementation validates only the minimal SQLite readiness path. Long-term design includes memory-pressure gating and broader dependency checks (see `docs/DESIGN_DECISIONS.md §8.4`). Unblock: Phase 1-G monitoring pass + backup job activation.

---

## Dependency map

### Application stack
```
routes → controllers → services → db.ts prepared statements → SQLite
templates depend on service-owned page-model shaping
/health/ready currently depends only on the minimal DB probe via OperationsPlatformService
```

### Feature dependency chain
```
auth layer
  ← member registration / account claim
    ← email outbox worker activation
      ← SES domain verification (infra, already Terraformed)
  ← organizer write flows
  ← admin work queue

clubs public page
  ← ClubService public methods
    ← clubs table (EXISTS in schema)

legacy data visible on site
  ← legacy import scripts (CSVs ready, build scripts exist)
    ← migration strategy (numbered migrations must precede schema evolution)

CI/CD automation — COMPLETE (app CI + deploy scripts: deploy-code.sh, deploy-rebuild.sh)
  ← staging running end-to-end
    ← AWS host bootstrap COMPLETE
  remaining: 1-E CloudFront, 1-F security hardening, 1-G CloudWatch agent
```

### Infrastructure dependency chain
```
production deploy
  ← staging validated + CloudFront active
    ← host bootstrap: Docker → /srv/footbag → rsync → DB init → footbag.service
      ← AWS + Terraform (DONE)

email delivery
  ← SES domain verification + outbox worker
    ← app running in Docker on host

CloudWatch monitoring
  ← CloudWatch agent installed on host
    ← app running
```

### Architectural hazards
- Route ordering in `publicRoutes.ts` is semantically significant.
- `eventKey` validation and normalization live above `db.ts`.
- `db.ts` must not absorb business rules, request parsing, or generic abstractions.
- Canonical docs are broader than implemented code; always distinguish implemented vs intended.
- Migration strategy must be in place before any schema change — even small ones.

---

## v0.2 blocking note

IFPA rules integration planning can continue, but implementation must wait for Julie's official published wording before rule text is treated as current.

---

## Phase roadmap

**Format:** Each phase has a goal, concrete tasks (with size: S/M/L), explicit dependencies, and a gate condition before the next phase starts.

Size labels: S = small, M = medium, L = large.

---

### Phase 0 — In-flight completion

**Gate:** COMPLETE — site is live on staging, all public routes serving, CloudFront responding, SNS confirmed.

---

### Phase 1 — Verification foundation + CI/CD

**Goal:** Iteration is safe. Deploys are one-command. CI catches regressions before they reach staging.

**Note: Phase 1 infra tasks run in parallel with the current feature slice. They are not blockers for feature work.**

| # | Task | Size | Dependency |
|---|------|------|-----------|
| 1-E | CloudFront pass 2: enable_cloudfront = true in Terraform, apply to staging | M | Phase 0 gate |
| 1-F | Security hardening: X-Origin-Verify header (CloudFront → origin validation), S3 OAC | M | 1-E |
| 1-G | CloudWatch agent install on host | S | Phase 0 gate |

**Gate:** PARTIAL — app CI green, deploy scripts exist (deploy-code.sh, deploy-rebuild.sh). Remaining: CloudFront fully active on staging (1-E), CloudWatch receiving metrics (1-G).

---

### Phase 2 — Legacy data import

**Goal:** Real historical data is visible on the public site.

**Note: No migration framework. Schema changes require a DB rebuild using `database/schema.sql` + seed pipeline.**

| # | Task | Size | Dependency |
|---|------|------|-----------|
| 2-C | Integration tests: fixture-based tests verifying imported events + results appear on public routes | M | — |
| 2-D | Production deploy (after staging validated) | S | Phase 1 gate |
| 2-E | Broader legacy event import: assess `mirror_footbag_org` coverage; import next batch from legacy mirror | L | — |

**Notes:**
- Historical data is loaded. Real events and members are visible on public routes.
- Imported persons are **not** activated member accounts. Identity records only, for future account-claim flow.

**Gate:** Imported events and results are visible on staging. Production deploy approved.

---

### Phase 3 — Clubs page + broader data

**Goal:** Clubs page is live with real data. Broader legacy event coverage begins.

| # | Task | Size | Dependency |
|---|------|------|-----------|
| 3-E | Broader legacy event import: assess `mirror_footbag_org` coverage; import next batch of historical events | L | 2-B |
| 3-F | Production deploy (if staging validated from Phase 2 and CloudFront active) | M | Phase 2 gate, 1-E |

**Gate:** `/clubs` serves real data (DONE). Production deploy pending 1-E/staging validation.

---

### Phase 4 — Auth foundation

**Goal:** Members can register, log in, and claim legacy identities. Email delivery is operational.

| # | Task | Size | Dependency |
|---|------|------|-----------|
| 4-A | Auth middleware: JWT cookie validation + per-request DB state check (see Design Decisions for cookie/session design) | L | — |
| 4-B | `IdentityAccessService` bootstrap: registration, login, logout, password hashing | L | 4-A |
| 4-C | Login / register / logout pages + controllers | M | 4-B |
| 4-D | Email outbox worker: activate `worker.ts` stub for outbox_emails processing via SES | L | Phase 0 gate (SES configured), 4-B |
| 4-E | Email verification flow: registration sends verification email, link activates account | M | 4-C, 4-D |
| 4-F | Account claim flow: imported legacy person → authenticated member account linkage | M | 4-B, Phase 2 gate (persons imported) |
| 4-G | Password reset flow: email-based reset using outbox worker | M | 4-D, 4-E |
| 4-H | Auth integration tests: login, logout, registration, session validation, password reset | M | 4-A – 4-G |

**Notes:**
- JWT sessions are NOT sufficient authority alone; current DB state must be checked on every request (see `PROJECT_SUMMARY_CONCISE.md` auth invariants).
- Password changes must invalidate sessions via the password-version mechanism.
- State-changing routes must follow documented CSRF / HTTP semantics patterns.
- Do not begin organizer write flows or admin work queue until 4-A/4-B are solid and tested.

**Gate:** Members can register, verify email, log in, log out, and claim a legacy person identity. Password reset works end-to-end via email.

---

### Later phases (not yet sequenced)

Prerequisites are noted.

- **Organizer write flows** (event creation, results publishing) — depends on auth + admin work queue
- **Admin work queue UI** — depends on auth
- **Membership tiers / dues / Stripe integration** — depends on auth + IFPA rules decision
- **Voting / elections** — depends on auth + membership tiers
- **Media galleries** — depends on auth + S3 media bucket (Terraformed, not yet wired)
- **IFPA rules integration** — gated on Julie's official published wording
- **Hall of Fame** — depends on auth + admin work queue
- **Mailing list management** — depends on email worker
- **Richer readiness checks** — expand `/health/ready` when real operational dependencies exist

---

## Work package A — legacy data import and normalization

Legacy data import directly affects the current public event/results surface and introduces identity/account risks beyond simple event ingestion. Historical data is loaded and visible on public routes. Broader import coverage is in Phase 2-E / 3-E.

### Requirements
- Idempotent import behavior (rehearsable on staging)
- Deterministic test fixtures for import correctness
- Preserve legacy identifiers for traceability
- Imported persons are NOT activated accounts — they are placeholder identity records for future account-claim flow
- Explicit publish criteria before imported data goes live

### Member/account migration risks
- Imported member identities may not map cleanly to future authenticated accounts
- Email quality and uniqueness may be incomplete in legacy data
- Password reset and account-claim flows must be explicitly sequenced before any member login rollout
- Imported historical participants need placeholder identity records separate from activated members

---

## Work package B — IFPA rules integration

**Gate:** Do not implement until Julie's official published wording exists. For each change, classify impact: docs-only / config-only / schema-affecting / service-logic affecting / UI-display affecting.

---

## Cross-cutting prerequisites before wider feature expansion

1. Schema changes require a DB rebuild (no migration runner; rebuild from `database/schema.sql` + seed pipeline).
2. Import-safe verification scripts and fixture coverage (Phase 2-C).
3. Browser checks are explicit-human-request-only; no automation without explicit ask.
4. Auth invariants from `PROJECT_SUMMARY_CONCISE.md` enforced before any write flow.

---

## Open risks and decisions

- Imported legacy identities may not cleanly map to future authenticated members; account-claim design is not final.
- Password reset and account-claim semantics depend on that mapping.
- Current readiness implementation is intentionally narrower than long-term docs.
- Canonical docs remain broader than implemented code; phase planning must constantly separate implemented from intended.
- Schema file is `database/schema.sql` (unversioned); seed pipeline runs via `scripts/reset-local-db.sh`.
- Production deploy timing is conditional on Phase 2 staging validation.
- IFPA rules integration is an external dependency (Julie's published wording).

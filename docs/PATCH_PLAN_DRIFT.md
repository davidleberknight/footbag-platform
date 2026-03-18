# Drift Patch Plan

Generated from drift.md Q&A session. Surgical, precise edits only.
Execute in order — later steps reference names/decisions from earlier ones.

---

## Phase 1 — File operations (do first; later changes reference new names)

### 1a. Rename schema file
- `database/schema_v0_1.sql` → `database/schema.sql`
- After renaming, grep for all references and update:
  - `database/` directory (any README or notes)
  - `src/` (any hardcoded path)
  - `docker/` (Dockerfile, compose files)
  - `scripts/` (any shell scripts)
  - `docs/` (DATA_MODEL.md, DEV_ONBOARDING.md, DEVOPS_GUIDE.md, PROJECT_SUMMARY_CONCISE.md)
  - `legacy_data/` (migration scripts)
  - `IMPLEMENTATION_PLAN.md`
  - `terraform/` (any references)

### 1b. Delete obsolete seed file
- Grep for all references to `seed_mvfp_v0_1.sql` first
- Delete `database/seeds/seed_mvfp_v0_1.sql`
- Remove any references found

---

## Phase 2 — Code changes

### 2a. Members routes — auth gating kept for now (DR-03 revised)
- `requireAuth` stays on `GET /members` and `GET /members/:personId` temporarily
- Rationale: current full-member-list render is unreviewed for public presentation; auth gating is a useful test of the auth path and guards against exposing an unprepared list
- Long-term intent: both routes are Tier 1 historical-person surfaces per GOVERNANCE.md §4–5 and should be made public once the list presentation is reviewed and scoped correctly
- Note added to IMPLEMENTATION_PLAN.md baseline; no code change in this patch

### 2b. Remove unused publicStats query (DR-09)
- `src/db.ts`: remove the `publicStats.counts` prepared statement
- Home stats are suppressed per GOVERNANCE.md §6 — incomplete import data makes any aggregate misleading without caveats the current UI cannot provide

### 2c. Implement teammate links on member detail (DR-09)
- `src/services/memberService.ts`: carry person IDs through for teammates so templates can render `<a href="/members/:personId">` where IDs exist
- Render as plain text where no person ID is present
- No link where ID is absent — do not fabricate hrefs

### 2d. Rename integration test file
- `tests/integration/events.routes.test.ts` → `tests/integration/app.routes.test.ts`
- Update the in-file description/comment framing to reflect it is the catch-all integration suite (health, home, clubs, events, login, logout, auth, members)
- Update any references to the old filename in docs or CI config

### 2e. Strip MVFP / v0.1 labels from code
- Grep codebase for `MVFP`, `mvfp`, `v0.1`, `v0_1` (excluding filenames being handled in Phase 1)
- Remove or replace with plain language in:
  - `src/worker.ts` (currently says "no jobs configured for MVFP v0.1")
  - Any comments, log strings, or variable names
- Keep only where explicitly tracking historical progress in a changelog or migration note

---

## Phase 3 — IMPLEMENTATION_PLAN.md (major update)

### 3a. Update active-slice block
Remove from active slice:
- World records (DR-07) — deferred
- BAP/HoF honor-roll pages (DR-08) — deferred; member-page indicators already done, keep
- Home-page stats (DR-09) — suppressed per GOVERNANCE.md §6, not deferred — drop entirely
- "First fake auth foundation stub: retire isLoggedIn env-toggle" — already done; remove from active items

Keep in active slice:
- Event results UX: separate result-slug pages (DR-06) — unfinished, still in scope
- Members pages reframe — update to reflect public Tier 1 routes (no longer auth-gated)
- Historical-data caveats — keep
- TDD expansion — update scope: members routes covered; remove world-record test expansion since deferred
- Teammate links on member detail (DR-09) — keep
- Shared page contract for non-home pages (DR-05) — add as active-slice item

Add to "Drafted next" or "Deferred" section:
- World records
- BAP/HoF honor-roll pages

### 3b. Update current deployed baseline (DR-03, DR-10)
- `/members` — remove "(auth-gated; redirects to /login when not authenticated)"
- `/members/:personId` — remove "(auth-gated; redirects to /login when not authenticated)"
- Add `GET /login`, `POST /login`, `POST /logout` — these exist in code and were missing from the baseline list

### 3c. Update verification baseline (DR-10)
Replace the current verification baseline text with accurate coverage:
- Single integration test file (`tests/integration/app.routes.test.ts`) covers: health, home, clubs, events (list/year/detail), login, logout, auth redirects, members index, members detail
- Not yet covered: 404/500 error handling, world-record routes (deferred), honor-roll routes (deferred), worker behavior, browser/UI verification (manual only)

### 3d. Add accepted-deviations block (DR-13 through DR-18 + additional)
Add a new "## Accepted temporary deviations" section. Each entry: what it is, why it exists, what it does not do.

Entries:
1. **Auth is a fake stub** — HMAC-signed cookie, env-backed credentials; no DB session check, no CSRF flow, no password-version/session-invalidation model; mirrors the future real auth path structurally; must be replaced before member onboarding
2. **Worker has no real jobs** — worker container is scaffolded; `worker.ts` exits cleanly; no outbox, email, or background-job processing active
3. **No closed backup/restore workflow** — S3 bucket scaffolded; no backup producer in app or worker; no restore drill; `/health/ready` is DB-probe only
4. **Maintenance mode is not production-grade** — CloudFront maintenance-origin/error behavior omitted from Terraform; direct-origin failover not implemented
5. **CloudFront hardening incomplete** — X-Origin-Verify header absent from Nginx; OAC/ordered-cache controls deferred; direct-origin bypass unprotected
6. **CI/CD absent** — no GitHub Actions workflows; images built on-host via `docker compose`; systemd unit starts local builds
7. **Monitoring partial and gated** — CloudWatch log groups and alarms scaffolded; agent install is TODO; monitoring gates default false; backup freshness metric has no producer
8. **Runtime config manually managed** — app reads local env vars only; SSM/IAM scaffolding exists but app does not consume it at runtime
9. **Bootstrap security shortcuts** — operator IAM and SSH access use bootstrap-era shortcuts; not final hardened posture
10. **Browser validation is manual only** — no automated browser/UI tests; route and integration tests are the first verification path; browser checks are explicit-human-request-only

---

## Phase 4 — CLAUDE.md root (DR-01)

### 4a. Reorder source-of-truth precedence
Current order places `docs/DESIGN_DECISIONS.md` at position 2, above the plan and code.

New order:
1. Explicit human decisions in the current task
2. Active-slice block in `IMPLEMENTATION_PLAN.md` — current scope and out-of-scope
3. Current code — implemented behavior
4. `docs/DESIGN_DECISIONS.md` — long-term rationale and architectural commitments; read when entering a new code area, unwinding a temporary simplification, or when rationale behind a pattern is unclear; do not read by default
5. When needed, targeted sections of other docs (USER_STORIES, VIEW_CATALOG, SERVICE_CATALOG, DATA_MODEL, GOVERNANCE)

Add a note: "GOVERNANCE.md is mandatory reading before any change touching members, historical persons, search, auth, contact fields, exports, stats, or privacy boundaries."

---

## Phase 5 — PROJECT_SUMMARY_CONCISE.md (surgical rewrite)

### 5a. "Current-state rule" block
- Delete the "Current sprint focus:" sentence — always stale; the plan is the source

### 5b. "Fast routing" block
- Line: `docs/GOVERNANCE.md` — remove "once created"
- Line: `database/schema_v0_1.sql` → `database/schema.sql`
- Line: `docs/DESIGN_DECISIONS.md` description → change to: "For rationale, trade-offs, and long-term design commitments — read when entering a new code area or unwinding a temporary simplification. Do not load by default."

### 5c. "Current implemented baseline" section
- Remove the entire section (route list and staging deployment sentence)
- Replace with one line: "For current routes and implementation status, see `IMPLEMENTATION_PLAN.md`."

### 5d. "Current operating model" block
- Line 48: change "Historical imported people may appear in legacy results without being current Members." to: "Historical persons in imported results are public Tier 1 record identities — not current member accounts, not searchable profiles. See `docs/GOVERNANCE.md §4`."

### 5e. "Big-picture architecture" section
- Rename section heading to: "Target system architecture (long-term model — see plan for what is implemented now)"
- Add inline notes on items not yet implemented:
  - JWT cookie auth line: append "(target — current auth is a fake stub)"
  - Email outbox + worker line: append "(target — worker is scaffolded with no active jobs)"
  - CloudFront maintenance page line: append "(target — maintenance mode not yet production-grade)"

### 5f. "Auth / security invariants" block
- Add one line at the top of the block: "*(Target auth model — the current auth stub mirrors this path structurally but does not enforce these invariants yet.)*"

### 5g. Document routing heuristics
- "Schema SQL" reference → update to `schema.sql`

### 5h. Strip MVFP / v0.1 labels
- Remove any remaining MVFP or v0.1 label from this file

---

## Phase 6 — VIEW_CATALOG.md (significant update)

### 6a. Members route contracts (DR-03, DR-04)
- Remove language describing `/members` and `/members/:personId` as auth-gated or partially gated
- Both are public Tier 1 historical-person surfaces per GOVERNANCE.md §4–5
- Ensure the route contracts reflect: no auth required, historical-person data only, no contact fields, not a current-member directory

### 6b. Shared page contract (DR-05)
- Define the `seo / page / navigation / content` top-level shape as the current standard for all non-home pages
- Mark this as a current implementation obligation, not aspirational
- Add an explicit note that the Home page (`/`) is exempt — it is a unique composition surface and does not follow the shared contract

### 6c. HomeService
- Remove HomeService as a requirement
- Home page composes directly from eventService in the controller; no dedicated HomeService needed

### 6d. MVFP / v0.1 labels
- Remove any remaining MVFP or v0.1 labels from this file

---

## Phase 7 — SERVICE_CATALOG.md (minor, DR-12)

### 7a. Add routing note at top
Add a short statement near the top (before any service entries):
"This catalog describes the full long-term service model, not current implementation status. For which services are implemented now, see `IMPLEMENTATION_PLAN.md`."

---

## Phase 8 — Minor doc fixes (housekeeping)

### 8a. ops/systemd/footbag.service
- Remove or correct comments referencing `docs/DEVOPS_GUIDE_V0_1.md` and `docs/DEV_ONBOARDING_V0_1_REWRITE.md` — these filenames do not exist; replace with correct filenames (`docs/DEVOPS_GUIDE.md`, `docs/DEV_ONBOARDING.md`)

### 8b. terraform/staging/cloudwatch.tf
- Fix stale doc filename in comments — update to correct current doc name

### 8c. docs/PROJECT_SUMMARY.md
- Add a note near the top: "This document describes long-term product architecture and vision, not current implementation status. For current scope, see `IMPLEMENTATION_PLAN.md`."

### 8d. docs/DEV_ONBOARDING.md
- Add a direct pointer: "The bootstrap shortcuts documented here are also the authoritative accepted temporary deviations for implementation agents. See `IMPLEMENTATION_PLAN.md` accepted-deviations block for the full list."
- Update any smoke/testing guidance to note that the integration suite now covers health, home, clubs, events, login, logout, auth, and members routes.

### 8e. MVFP / v0.1 sweep across remaining docs
- Grep all `docs/` files for `MVFP`, `mvfp`, `v0.1`, `v0_1`
- Remove or replace with plain language except where tracking historical progress explicitly

---

## Summary table

| Phase | Area | Type | Severity |
|-------|------|------|----------|
| 1a | Schema rename + reference propagation | File op + docs | High |
| 1b | Delete obsolete seed file | File op | Medium |
| 2a | Remove requireAuth from members routes | Code | High |
| 2b | Remove unused publicStats query | Code | Medium |
| 2c | Implement teammate links | Code | Medium |
| 2d | Rename + reframe integration test file | Code + docs | Low |
| 2e | Strip MVFP/v0.1 from code | Code | Low |
| 3a | IMPLEMENTATION_PLAN active-slice update | Docs | High |
| 3b | IMPLEMENTATION_PLAN baseline update | Docs | High |
| 3c | IMPLEMENTATION_PLAN verification baseline | Docs | Low |
| 3d | IMPLEMENTATION_PLAN accepted-deviations block | Docs | High |
| 4a | CLAUDE.md precedence reorder | Docs | High |
| 5a–h | PROJECT_SUMMARY_CONCISE.md surgical rewrite | Docs | High |
| 6a–d | VIEW_CATALOG.md members + page contract | Docs | High |
| 7a | SERVICE_CATALOG.md routing note | Docs | Low |
| 8a–e | Minor housekeeping fixes | Docs | Low |

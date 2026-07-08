# Bug Hunt — implementation-layer and verification-layer reference

Detailed reference for the bug-hunt skill, factored out of SKILL.md to stay under Anthropic's 500-line ceiling; SKILL.md points here at the relevant step. The design-layer method lives in the sibling `DESIGN.md`, the documentation-synchronization method in the sibling `DOCSYNC.md`.

## Contents

- Bug categories — catalog (§4.4.1–§4.4.48): the implementation-layer (security/correctness) sweep classes
- Design-pattern divergence and code hygiene (§4.4B.1–§4.4B.8): the documentation/hygiene sweep classes
- Cross-cutting observations
- External security calibration references
- High-signal static search recipes (§4.5A)
- Testing and CI/CD verification punch list — detail (§5.1–§5.6): the verification-layer sweep

The §-numbers are stable category identifiers cited in `BUGS.md` finding `Class` fields; they are not sections of SKILL.md.

## Bug categories — catalog (§4.4)

The implementation-layer (security/correctness) sweep categories §4.4.1–§4.4.48, followed by the documentation/hygiene sweep §4.4B. SKILL.md Phases D and E frame the two sweeps and refer to these category numbers.

#### 4.4.1 Logic errors

- Off-by-one indexing, wrong comparison operators, swapped variables.
- Conditional inversions: `if (!owner)` when owner check should be `owner === viewerId`.
- Missing fall-through in switch/case; missing default branches.
- Date math errors: timezone confusion, ISO parsing assumptions, leap-year edges.
- Wrong shape returned from service (`Promise<T | null>` where caller assumes `T`).
- **Tip**: cross-reference each method's return type against every call site; mismatches are bugs.

#### 4.4.2 Error-handling holes

- Unhandled promise rejections (async functions without try/catch where errors are domain-meaningful).
- Swallowed errors: `try { ... } catch { /* nothing */ }` or `.catch(() => undefined)` that hide real problems.
- `next(err)` paths that bypass the controller's specific-error catches.
- Async functions in Express handlers without `next(err)` plumbing — Express does NOT catch async errors automatically.
- Generic 500 responses where a specific actionable status (422 / 429 / 503) was the correct mapping.
- Look for analogous patterns elsewhere (auto-link revert, claim merge, avatar upload, curator upload, wizard submits).

#### 4.4.3 Race conditions

- Better-sqlite3 is synchronous, but the surrounding Node code is async.
- Concurrent registrations of the same email: is there a unique constraint + a graceful UPSERT, or a TOCTOU race?
- Concurrent claim of the same legacy account: partial UNIQUE index? Or first-write-wins via a guarded INSERT?
- Worker re-emit between SES-send and outbox-mark-sent (idempotency_key collisions).
- Image-worker job claim lease (`mediaJobLeaseSeconds`): two workers claiming the same row.
- Per-request password_version check (auth middleware): can a stale-cookie request slip through if password change races with the request?
- **Tip**: look for `INSERT` paths without a corresponding unique index + conflict handling.

#### 4.4.4 Auth gate misses

- Every route in `src/routes/publicRoutes.ts` that touches member-only data must traverse `requireAuth`.
- Every route in `adminRoutes.ts` already passes `requireAuth + requireAdmin` (mount-level); verify no per-route override skips it.
- Every route in `internalRoutes.ts` similarly traverses `requireAuth + requireAdmin`.
- `/ipc/job-events` (ipcRoutes.ts) uses shared-secret auth in the controller, not middleware — verify the controller actually checks the secret on every request.

#### 4.4.5 Authorization gate misses

- Owner-only routes (`/members/:memberKey/...`) should 404 (anti-enumeration) when the authenticated user doesn't match the slug, not 403.
- Admin routes should 403 on non-admin authenticated requests.
- Tier-gated routes (e.g. `/members/:memberKey/galleries`, `/members/:memberKey/media/upload`) use `requireTier1Benefits`; verify the gate fires BEFORE the missing-resource 404 (so under-tiered users see a clear tier-gate rejection, not a confusing 404).
- Cross-member writes must be blocked at the controller level (not just at the slug match — body forgery like `ownerMemberId` in the POST body must be ignored in favor of the session-derived id).

#### 4.4.6 Anti-enumeration violations

Per `docs/USER_STORIES.md` and `.claude/rules/testing.md` §"What 'edge cases' means", anti-enumeration surfaces include login, password-reset, email-verify, claim-lookup, contact-admin, register, search.

For each: assert that the response status code, body shape, and body length are **identical** for the "exists" and "not-exists" cases. Any differential is a leak.

- **Status code differential**: a 200 vs 422 between "valid email format but unknown member" vs "invalid email format" is a leak.
- **Body length differential**: an extra error-message string in one branch.
- **Timing differential**: a missing argon2 hash on the not-found path so an attacker can distinguish via wall-clock.

#### 4.4.7 CSRF gate misses

- `requireOriginPin` middleware is mounted globally in `src/app.ts` before route registration. Every state-changing verb (POST, PATCH, PUT, DELETE) must traverse it.
- A new sub-router mounted without inheriting the global middleware (e.g. a route file that constructs its own Express Router and mounts at a different path) would skip the gate. Verify no such mount exists.
- Routes that explicitly receive CSRF-relevant requests from non-browser clients (the `/ipc/job-events` worker channel) use shared-secret auth in lieu of Origin pinning; verify the controller's shared-secret check is correct.

#### 4.4.8 SQL injection / XSS holes

- All SQL lives in `src/db/db.ts` as named prepared statements (per `.claude/rules/db-layer.md`). `db.prepare()` calls outside `db.ts` are forbidden (enforced by `scripts/ci/assert_conventions.sh`); a violation would be a critical bug.
- Handlebars escapes by default (`{{ x }}`); triple-stash (`{{{ x }}}`) bypasses escaping. Grep for `{{{` in `src/views/`; for each occurrence, confirm the value is operator-controlled or has been sanitized server-side.
- Untrusted input concatenated into a regex, a shell command, or a file path is a bug.
- Any externally-hosted asset added to a template (CDN, font, iframe, API origin) must be simultaneously declared in the `src/app.ts` CSP directives (iframe -> `frame-src`, font -> `font-src`, script origin -> `script-src`). A template that loads an external asset with no matching CSP entry is a bug (the asset is blocked at runtime, or the CSP was loosened without review).

#### 4.4.9 PII / secret leaks

- Error pages: a 500 stack trace leaked to the browser is a critical bug. Verify `src/app.ts` 500 handler renders a friendly page and the `req.url` redaction (via `redactTokenPaths` in `src/lib/redactTokenPaths.ts`) is applied to all log lines.
- Audit `metadata_json`: free-text fields should never carry raw passwords, raw tokens, raw session secrets. Search for `metadata:` and `metadata_json:` in `src/services/`; verify no sensitive value lands there.
- Logger calls: any `logger.info({ password: ... })`, `logger.debug({ token: ... })`, etc. is a critical bug.
- The persona-password literal (`src/testkit/personaSecrets.ts`) must appear in exactly one source file (a regression test enforces this); a literal copy elsewhere is a bug.
- URLs must never carry secrets or PII unnecessarily: reset tokens, verification tokens, session tokens, emails, member private identifiers, DOB, phone, address, admin notes, or raw return payloads must not appear in logs, redirects, analytics-like strings, cache keys, query strings, or external links unless the route is explicitly token-bearing and protected by no-store/redaction.
- PII exposure is not limited to passwords. Search for emails, DOB, phone/address fields, IP addresses, contact text, uploaded-media metadata, member private fields, historical identity-linking notes, admin notes, and exported CSV/JSON fields. Verify each exposure has a purpose, audience boundary, and minimization rule.
- Generated artifacts are in scope: test snapshots, fixture DB dumps, log files, audit exports, `BUGS.md` reproductions, CI artifacts, coverage reports, screenshots, and temporary files must not contain real or real-looking secrets/PII.
- A redaction helper that covers one path but not another is a bug. Verify that browser errors, structured logs, audit metadata, email outbox rows, worker/job errors, webhook errors, and CLI/script errors use the same redaction policy or an equally strict local policy.

#### 4.4.10 Rate-limit misses

- Routes that mutate state (POST `/login`, `/register`, `/password/forgot`, `/verify/resend`, `/members/:slug/edit/password`, `/members/:slug/contact-admin`, `/members/:slug/media/upload`, etc.) should call the rate-limit hit function from `src/services/rateLimitService.ts` (exported as `hit`; call sites conventionally alias it to `rateLimitHit`).
- A missing limiter on a state-changing route is a high-severity finding.
- The audit row should record only the threshold-crossing event (per M_Login A7: no per-attempt audit, no IP stored). Verify the limiter implementation respects this.

#### 4.4.11 Cookie attribute regressions

- `src/lib/sessionCookie.ts` is the only place that sets/clears the session cookie (per `.claude/rules/controller-conventions.md`). Verify it sets `HttpOnly`, `Secure` (in production), and `SameSite=Lax` on the issued cookie. A regression to `SameSite=None`, missing `HttpOnly`, or accidental `Secure: false` in production would be catastrophic.
- Flash cookies must be HttpOnly + signed (see `src/lib/flashCookie.ts`); verify no controller bypasses the helper and calls `res.cookie()` directly.
- Any POST that changes a password (login-after-rotate, password-edit, password-reset-complete) must re-issue the session JWT (`createSessionJwt` + `issueSessionCookie`) so the current browser stays authenticated while the bumped `password_version` invalidates all other sessions. A password-change path that does not re-issue locks the current user out; one that does not bump `password_version` fails to invalidate stolen sessions.

#### 4.4.12 Cache-Control regressions

- Authenticated responses must carry `Cache-Control: private, no-store` plus `X-Robots-Tag: noindex` (set by the authenticated-response middleware in `src/app.ts`; locate it fresh, line numbers drift). Any controller that overwrites these headers on an authenticated response is a bug.
- Token-bearing GET / POST-422 responses (e.g. `GET /password/reset/:token`) must NOT be cacheable. The `password-reset.routes.test.ts` already pins this; verify no other token-bearing route was added without the same protection.

#### 4.4.13 Schema / data-integrity bugs

- Multi-write operations must wrap in `transaction(() => { ... })` per `.claude/rules/db-layer.md`. An `await` inside a `transaction()` callback is a runtime crash (better-sqlite3 is sync); flag any such occurrence.
- Every domain table carries `id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `version`. Service writes should stamp these on every write.
- Audit logging: state-changing service methods should append an `audit_entries` row. A missing audit row on a state change is a finding (severity depends on the change — admin actions and identity-changing actions are catastrophic; cosmetic updates are low).
- FK constraints: verify the application doesn't insert orphan rows where the schema doesn't enforce FK.

#### 4.4.14 Best-effort enqueue patterns

The `enqueueEmailOrFail` strict helper exists and is used at the password-change confirmation site. Analogous patterns may exist elsewhere:

- Claim notification (`legacy.claim_*` audits).
- Auto-link notification (`legacy.auto_link_*` audits).
- Email verification.
- Password reset confirmation.

Any swallow on a security-critical notification is a finding. The pattern is: a failed enqueue + a committed mutation = silent loss of user notification = potential account-takeover masking. Suggested remediation shape: migrate the site to `enqueueEmailOrFail` and add a high-priority audit row on failure (mirror the existing pattern in `identityAccessService.changePassword`).

#### 4.4.15 Dev-shortcut leaks

- Every `FOOTBAG_DEV_*` env var read in `src/` outside `src/testkit/`, `src/dev-bootstrap/`, and `src/config/env.ts` is suspect. Verify each one is gated by `config.footbagEnv === 'development'` (or `'staging'` where appropriate) AND has a boot-time fail-fast guard in `src/config/env.ts`.
- The Dockerfile strip rule removes `dist/testkit/`, `dist/dev-bootstrap/`, AND `dist/internal-qc/` from production builds (all three service Dockerfiles; the internal-QC strip is a tracked `[DEVIATION]` in `IMPLEMENTATION_PLAN.md` until the QC subsystem retires). Verify no source file outside those trees has a direct import of a stripped symbol (the import would fail at runtime in production).
- The `scripts/audit-dev-shortcuts.sh` pre-deploy gate runs a set of audit-marker queries (six at last count — read the script, do not trust this number); verify the boot orchestrator at `src/app.ts` doesn't bypass them and that the marker set still covers every dev-shortcut write path.

#### 4.4.16 Other patterns worth a sweep

- Hard-coded URLs / domains that should be `config.publicBaseUrl`-derived.
- File-system writes in `src/services/` that bypass the MediaStorageAdapter (e.g. `fs.writeFileSync` outside test-only or sidecar paths). The `.claude/rules/db-write-safety.md` rule (auto-attaches on DB-mutation work) applies here.
- `process.env` reads outside `src/config/env.ts`. Forbidden by convention; CI gate catches most, but a fresh introduction would be a bug.
- `await` inside `transaction()` callback.
- `db.prepare()` calls outside `src/db/db.ts`.
- AWS SDK imports outside `src/adapters/`.

#### 4.4.17 Open-redirect / unsafe redirect

- Any redirect target derived from `?returnTo=`, `Referer`, or other request input must pass `isSafePath(value)` (per `.claude/rules/controller-conventions.md`) before use, falling back to a known-safe default on failure.
- A redirect that echoes request input without validation is an open-redirect (phishing / token-leak vector). Grep for `res.redirect(` and trace the target's provenance.

#### 4.4.18 Idempotency-key integrity

- Work-queue inserts, outbox email enqueues, and webhook handlers must use a stable idempotency key so a duplicate request produces no duplicate row or re-send.
- A missing or non-deterministic idempotency key (e.g. one derived from a timestamp or random value rather than the request's stable identity) is a finding: duplicate emails, duplicate work-queue items, double-applied webhooks. Cross-reference §4.4.3 (races) for the TOCTOU variant.

#### 4.4.19 Append-only ledger integrity

- `audit_entries`, `member_tier_grants`, `active_player_grants`, and `system_config` (value changes) are append-only; schema triggers `RAISE(ABORT)` on UPDATE/DELETE.
- Application code that issues an UPDATE or DELETE against these tables (or a `db.ts` statement that does so) is a finding — it either crashes at runtime against the trigger or, if the trigger is missing, silently corrupts an immutable ledger. Extends §4.4.13.

#### 4.4.20 Domain-invariant violations

These are the service-JSDoc / DATA_GOVERNANCE / USER_STORIES non-negotiables. A violation is a real bug even when the code "works":

- **Deceased login**: login must reject any member with `is_deceased = 1` *before* the credential check (DATA_GOVERNANCE §2 auth boundary). A credential check that runs first, or a path that lets a deceased member authenticate, is catastrophic.
- **Active-player no-shorten**: an older event / vouch / club-join must never shorten an existing later expiry; idempotency via the `ux_active_player_grants_*` unique constraints.
- **Ballot non-anonymity**: `ballots.voter_member_id` is stored in plaintext by design; a path that strips it is a finding.
- **Work-queue admin-alert coupling**: every `work_queue_items` INSERT must enqueue an `admin-alerts` notification carrying task type + entity id only (no PII).
- **Event hard-delete guard**: events with published result rows must never be deleted; the guard fires on every delete path.
- **PII purge atomicity**: `purgeAccountPII` runs in one transaction; no partial purge; honors/historical attribution survive per DATA_GOVERNANCE §10.

#### 4.4.21 User-story success-criteria mismatch

A deployed story that fails its own success criteria is a bug even when the code "works" mechanically.

- Build the traceability matrix (SKILL.md Phase B) before this pass.
- For each Complete and deployed story, verify all acceptance/success criteria against routes, controllers, services, templates, DB writes, audit rows, and permission gates.
- For each Partial and deployed story, verify that the missing criteria are explicitly documented as accepted deviations.
- If a discrepancy may be a bad user story rather than bad code, ask one maintainer question instead of guessing.
- A user story that omits an obvious security/privacy success criterion may itself be the bug; classify it as design-level, not code-level.

#### 4.4.22 Design-level threat-model gaps

Look for missing controls that are visible from design and flow, even if no single line of code is "wrong."

- Draw a quick data-flow and trust-boundary map for authentication, legacy-claim, onboarding, media upload, payments, admin, outbox, and contact-admin flows.
- Identify actors: anonymous visitor, authenticated member, tiered member, club/group owner, curator/admin, worker/internal caller, payment provider, attacker with stolen cookie, attacker with known email, attacker with old legacy identity data.
- For each actor, ask: what can they read, write, link, delete, pay for, retry, replay, enumerate, or cause to be emailed?
- Missing threat controls are findings only when tied to a deployed flow and concrete failure path.

#### 4.4.23 Admin/moderator capability and confused-deputy bugs

Admin and curator routes often pass authentication but fail the "right admin action on the right entity" check.

- Verify admin-only actions never trust member IDs, roles, target statuses, or owner IDs from request bodies.
- Verify curator edit/delete routes cannot target non-curated or other-member media unless explicitly intended.
- Verify admin dashboards and roster/report services apply the same privacy filters as public/member views unless a documented admin exception exists.
- Verify audit rows for admin actions contain enough context to reconstruct who did what without storing unnecessary PII.

#### 4.4.24 Payment, tier, and webhook integrity

The membership-payment surface is in scope even when live Stripe checkout is stubbed.

- Verify a purchase route cannot grant Tier 1/Tier 2 without a successful trusted checkout/webhook path or an explicit dev-only stub.
- Verify `memberKey` in the URL cannot grant a tier to another member.
- Verify webhook handlers authenticate provider signatures in live mode and reject unsigned/spoofed events.
- Verify duplicate webhooks are idempotent and cannot double-grant, double-email, or corrupt the ledger.
- Verify amount/currency/tier mapping is server-derived, not client-controlled.
- Verify success/cancel pages are display-only and do not mutate membership state.
- Verify payment event logging avoids card/payment secrets and unnecessary customer PII.

#### 4.4.25 Email, notification, and outbox abuse

Email is a security boundary because it carries verification, reset, claim, contact-admin, and notification flows.

- Verify every email-producing path has a stable idempotency key.
- Verify all security-critical emails use strict enqueue semantics or explicitly audited failure handling.
- Verify no route can be used as an unauthenticated spam relay to arbitrary addresses.
- Verify templates do not echo untrusted HTML into email bodies.
- Verify email-verification and password-reset tokens are single-purpose, scoped, expiring, and not logged.
- Verify contact-admin and group/alias workflows do not leak private email addresses or permit header injection.

#### 4.4.26 File upload, media processing, path traversal, and content-type spoofing

Media upload bugs are often code-level and design-level at once.

- Verify all uploaded media paths are generated server-side and cannot contain `../`, absolute paths, encoded traversal, or user-controlled extensions that affect execution.
- Verify MIME type, extension, magic-byte/content sniffing, size, image dimensions, and transformation outputs are checked at the trust boundary.
- Verify original uploads are not served from an executable or privileged location.
- Verify image/video processing failures do not leave public partial files or orphan DB rows.
- Verify delete/curator flows remove or tombstone all related storage objects consistently.
- Verify legacy archive media is read-only and cannot be mutated through new-site upload/delete paths.

#### 4.4.27 SSRF and outbound request safety

Any code that dereferences a URL crosses a trust boundary.

- Search for `fetch`, `axios`, `got`, `http.request`, `https.request`, SDK URL configuration, iframe/video embed parsing, and reachability checks.
- Verify user-controlled URLs cannot target loopback, link-local, private RFC1918 networks, metadata services, internal hostnames, or file URLs.
- Verify redirects are bounded and re-validated after each hop.
- Verify timeouts and size limits exist on outbound fetches.
- Verify allowlists are explicit where the feature only needs YouTube, Stripe, AWS, or known domains.

#### 4.4.28 Secrets, configuration, and deployment-gate bugs visible in repo

This static bug hunt cannot inspect live AWS, but it can find repo-visible configuration bugs.

- Search for hardcoded secrets, tokens, private keys, real API keys, `.env` examples with real values, and accidental credential fixtures.
- Verify all `process.env` reads go through `src/config/env.ts` except approved entry points.
- Verify production-dangerous env combinations fail fast at boot.
- Verify dev/test shortcuts cannot be enabled by setting one loose env var in production.
- Verify secret redaction is centralized and covers URLs, request bodies, headers, logs, audit metadata, and thrown errors.

#### 4.4.29 Dependency, supply-chain, and build-script risks

Do not run networked audits unless authorized. Static review still catches many supply-chain bugs.

- Inspect `package.json`, lockfile, Dockerfile, scripts, CI/predeploy scripts, and build steps for install-time or deploy-time surprises.
- Flag lifecycle scripts, shell invocations, or build-time file deletions that could remove security gates or ship dev-only code.
- Verify production build excludes testkit/dev-bootstrap artifacts and does not require stripped modules at runtime.
- Verify dependency-facing adapters isolate AWS/Stripe/third-party SDK usage instead of leaking SDK calls across services/controllers.
- If a known-vulnerable dependency is only suspected, record it as a Lead only when confirmation requires networked tooling.

#### 4.4.30 Privacy, data minimization, and member-search leakage

Privacy bugs are first-class bugs, not UX issues.

- Verify public member/profile/search/gallery/event pages use the correct privacy-shaped views and do not expose hidden email, DOB, address, admin notes, legacy matching data, deleted/tombstoned state, or private audit metadata.
- Verify member search does not reveal more detail for exact matches than broad matches unless documented.
- Verify admins can access sensitive data only through documented admin flows.
- Verify exports/reports do not include fields beyond the report purpose.
- Verify legacy identity preview and "Is this you?" flows reveal enough to help the rightful user but not enough to enable impersonation.

#### 4.4.31 Security headers, CSP, framing, and browser boundary bugs

The bug hunt is not browser QA, but headers and template/CSP consistency are static-reviewable.

- Verify CSP covers all first-party and third-party assets actually used by templates.
- Verify CSP has not been loosened with unsafe inline/script origins without a documented, narrow reason.
- Verify clickjacking protection (`frame-ancestors` or equivalent) matches the intended embedding policy.
- Verify `Referrer-Policy` avoids leaking reset/verify/claim URLs to third-party origins.
- Verify static/download responses set safe content types and `X-Content-Type-Options: nosniff`.
- Verify authenticated pages are not cacheable and public pages do not accidentally include private fragments.

#### 4.4.32 Business-logic abuse and workflow bypass

A valid request sequence can still be an attack.

- Try to bypass multi-step flows by jumping directly to later POST routes.
- Try stale tokens after password change, email change, account claim, auto-link confirmation, logout, and reset completion.
- Try replaying old form submissions, webhook events, contact-admin submissions, and media jobs.
- Try conflicting state transitions: approve then delete, claim then auto-link, upload then moderate, pay then cancel, tier downgrade then gated upload.
- Verify all state transitions are guarded by current DB state, not only by "page the user came from."

#### 4.4.33 Availability and resource-exhaustion risks

Resource limits are security controls.

- Verify rate limits exist for unauthenticated and authenticated mutation surfaces.
- Verify upload/image/video routes enforce request size, file size, pixel/dimension, job count, and queue limits.
- Verify search/list routes cap page size and normalize sort/filter parameters.
- Verify expensive operations cannot be triggered repeatedly by anonymous users or low-tier users.
- Verify background workers use leases, retry caps, and poison-message handling.

#### 4.4.34 Token lifecycle, replay, and clock bugs

Token bugs often hide in "happy path works" code.

- Verify all tokens have purpose, audience/scope, expiry, single-use or replay-safe semantics, and redacted logging.
- Verify token validation checks current user state: password version, email verification state, account deletion/tombstone, deceased status, claim status, tier status where relevant.
- Verify clock comparisons are ISO-safe and timezone-safe.
- Verify token-bearing routes do not redirect to URLs that leak the token in `Referer`.

#### 4.4.35 Unicode, normalization, slug, and identity-matching bugs

This project has real identity reconciliation risk because legacy people, members, clubs, and names may differ.

- Verify email normalization is consistent across register, login, reset, verify, and claim.
- Verify slugs are unique, stable, and not vulnerable to case/Unicode confusables.
- Verify name-matching, DOB matching, married-name/alternate-name handling, and duplicate-name handling do not over-link identities.
- Verify "deceased", historical-person, Hall of Fame, BAP, and legacy-person attribution are not collapsed into the wrong member.
- Verify search and display preserve human names while using normalized values only for matching.

#### 4.4.36 Footbag-domain invariant violations

These project-specific rules are bug sources even when not obvious from generic web checklists.

- Clubs and groups/committees are distinct concepts; code or docs that merge them without an explicit design decision are wrong.
- A member may belong to up to two current clubs after onboarding, but may lead only one club at a time; onboarding still resolves one club.
- Tier 1 and Tier 2 are lifetime/permanent purchased memberships; they do not expire.
- BAP induction and Hall of Fame induction grant Tier 2 lifetime membership and must be audit-logged.
- Active Player is separate from membership tier and expires from the most recent qualifying event or vouch; older events must never shorten it.
- Legacy media archive is read-only/static; new uploads use the new media model.
- Outbound email comes from the new website/AWS path; inbound email goes through Google-managed services. Alias/group behavior must be explicitly scoped before implementation.
- Freestyle-dictionary and curated-media DOMAIN invariants (layer separation, ADD math, slot governance, naming/slug/hashtag conventions, the trick-tag invariant, cross-surface propagation) are owned by the `freestyle-bug-hunt` skill; hand those candidates there and keep the generic §4.4 sweep on the freestyle routes here.

#### 4.4.37 Legacy migration and archive-boundary bugs

The `legacy_data/` pipeline is normally out of scope, but migrated legacy data as surfaced by deployed routes is in scope.

- Verify legacy member/person/club/group/event records displayed by the new app are shaped through privacy and data-governance rules.
- Verify static archive links cannot become write paths or authentication bypasses.
- Verify migrated IDs are not trusted as authenticated member IDs.
- Verify high/medium/low confidence identity matches drive the intended onboarding/claim behavior.
- Verify "archive-only" media is not accidentally treated as user-owned mutable media.
- Verify any redirect/DNS/archive assumptions in code match the migration plan and do not introduce open redirects or lost content.

#### 4.4.38 Deterministic automated-verification gaps

A missing automated check is a bug when the check is deterministic, cheap to run, and would prevent a recurring class of real defects. The agent should not keep re-discovering defects that scripts, linters, static analysis, or CI can catch mechanically.

- Missing **repo convention checks** for project rules already known to be mandatory: no `db.prepare()` outside `src/db/db.ts`, no `process.env` outside config entry points, no AWS/Stripe SDK imports outside adapters, no direct `res.cookie()` outside helpers, no console logging in app code, no inline scripts/styles/events in templates, no doc references or sprint/slice/date markers in comments.
- Missing **security automation** for classes that tools can catch well: CodeQL/SAST, secret scanning, dependency vulnerability scanning, dependency review on PRs, lockfile integrity, known vulnerable transitive dependencies, unsafe workflow permissions, unpinned GitHub Actions, container/IaC scanning if those artifacts exist.
- Missing **type/quality gates**: `tsc --noEmit`, ESLint, formatting, unused-export/dead-route checks, test-file `.skip`/`.todo` checks, template compilation, schema migration validation, package script audit, route inventory generation.
- Missing **custom project checkers** that are obvious from recurring bug classes: service JSDoc consistency, route-auth matrix, success-criteria traceability coverage, anti-enumeration invariant test generator, audit/outbox/idempotency invariant checks, append-only ledger mutation guard checks.
- Missing **tiered CI design**: fast pre-commit/pre-push checks for local feedback, full PR checks before merge, slower nightly/deep checks for fuzzing/crawling/security scans, and explicit manual staging checks for infrastructure-only verification.
- A check is not required merely because a tool exists. It is in scope when it maps to a known project invariant, a deployed user story, or a high-value security class and can run without brittle human judgment.

Report verified gaps under the `BUGS.md` **Testing and CI/CD verification gaps** group unless the missing check has already caused a concrete security/correctness failure; in that case, report the concrete failure in the severity section and mention the missing automated guard as the prevention gap.

#### 4.4.39 Clickable-route, form-target, and navigation smoke-test gaps

Every rendered user-visible navigation target should be mechanically checked. A broken link, form action, or button-triggered navigation is a real user-visible bug; the absence of a systematic route-wiring smoke test is itself a test-gap bug.

- Extract `href`, `form[action]`, submit buttons, buttons with explicit navigation semantics, and generated `*Href` fields from rendered pages or view-model fixtures.
- Verify each target resolves to an intentional Express route or known external URL. Internal URLs must not produce a 500, accidental 404, auth-loop, unsafe redirect, or wrong method response.
- Run the route-wiring crawl under the important viewer states: anonymous, authenticated ordinary member, tier-1/tier-2 member where applicable, owner vs non-owner, admin/curator where applicable, and known inactive/deceased/under-tier edge personas where those states are deployed.
- For parameterized routes, use synthetic fixture data to expand representative slugs, ids, member keys, event ids, media ids, and payment/member keys. Do not rely on literal placeholders passing by accident.
- For mutating forms, at minimum verify the method + action route exists and the CSRF/origin/rate-limit/auth gates are the expected ones. Full form submission belongs in targeted integration/E2E tests, but route presence and no-500 behavior should be automated.
- Treat external links separately: verify `rel="noopener"` / `noreferrer` behavior where new tabs are used, expected allowlist behavior, and no accidental internal open redirect.
- If this project lacks a route-map/link-crawler test harness, record that as a `Testing and CI/CD verification gaps` finding with the exact surfaces it would protect.


#### 4.4.40 Script credential-handling and password-leak convention violations

The canonical convention is `.claude/rules/script-secret-safety.md` (stdin/no-argv transport, restricted temp files, no echo/logging), with `scripts/ci/check_script_credentials.sh` as the existing deterministic gate — audit both: scripts against the rule, and the gate's patterns against the rule's full surface (a convention the gate does not check is a coverage finding). Where the rule is silent, derive the expectation from the existing safe scripts (the rule names the canonical model script). Do not merely search for the word `password`; trace how the credential is obtained, transported, logged, passed to child processes, and cleaned up.

A script credential-handling violation is a real security bug when any script, package command, CI step, or helper that handles a password/token/key fails to preserve the project standard.

Mandatory review steps:

1. Inspect the scripts that already implement the safe pattern. Derive the concrete repository rule from them before flagging a new script. The expected rule is generally: credentials come from stdin or an approved secret store, are not accepted as positional CLI arguments, are not echoed, are not printed in `--help` examples with real values, are not stored in command history, and are not passed to child commands in a way visible through process lists.
2. Audit every executable surface that can handle credentials: `scripts/**/*.sh`, `scripts/**/*.ts`, `scripts/**/*.js`, `scripts/**/*.mjs`, `scripts/**/*.py`, `package.json` scripts, Makefiles if present, Docker entrypoints, CI workflow `run:` blocks, deploy helpers, DB/admin/bootstrap scripts, migration helpers, and local maintenance tools.
3. Verify every script that needs a password supports the safe path and rejects or avoids unsafe alternatives. A script that accepts `--password`, `PASSWORD=... command`, positional passwords, URL-embedded passwords, or inline `curl -u user:password` without a documented safe wrapper is suspect; if the existing project standard forbids it, record it as a bug.
4. Verify no script downgrades the safe convention when calling another script. For example, a safe parent script must not read a password from stdin and then pass it to a child command via argv, shell interpolation, query string, temporary file, or visible environment variable unless there is a carefully justified, redacted, least-exposure mechanism.
5. Verify shell tracing and debug modes cannot leak credentials. Any `set -x`, verbose curl, unredacted command echo, `env` dump, `printenv`, debug logger, exception dump, or `tee` around secret-handling code is a bug unless secrets are masked before output.
6. Verify temporary files, FIFOs, logs, and artifacts are not used for secrets unless permissions, lifetime, cleanup, and redaction are explicit. A leftover temp file containing a credential is catastrophic.
7. Verify CI workflows never expose secrets to untrusted pull-request code, forked PRs, generated scripts, agent-produced shell commands, caches, artifacts, annotations, or logs. GitHub Actions `permissions:` should be least-privilege and secrets should only be available to trusted jobs/environments.

High-signal bug patterns:

- `--password`, `--token`, `--secret`, `--api-key`, `-p`, or positional credential arguments in scripts that should use stdin.
- `read password` without silent input when a human is typing a secret; `echo $password`; `printf` to logs; or writing secrets to `BUGS.md`, debug output, or audit rows.
- `set -x` active while secret variables exist; unguarded `trap`/error handlers that print command lines or variables.
- Passwords embedded in URLs such as `postgres://user:pass@...`, `mysql://`, `redis://`, HTTP basic-auth URLs, or query strings.
- `curl -v`, `wget --debug`, database CLIs, SSH tools, or cloud CLIs invoked with credentials on the command line.
- Secrets in `package.json` scripts, `.env.example` with real-looking values, workflow YAML, Docker `ARG`/`ENV`, generated config files, or checked-in local helper output.
- CI masking missing for any value that may be printed; missing `::add-mask::` where a workflow must echo a derived secret-like value.

Severity calibration:

- **Catastrophic:** real production secret/password/token can leak to repo, logs, CI artifacts, process list, shell history, or user-visible output.
- **High:** staging/dev credential or reusable admin password can leak; unsafe convention exists on a credential path but no real value is observed.
- **Medium:** script has no safe credential path and would force unsafe operator behavior before production use.
- **Low:** help text, comments, or examples encourage unsafe credential handling but no executable unsafe path exists.

#### 4.4.41 Secrets, PII, and credential-leak automated-check gaps

It is a bug if the project lacks obvious deterministic checks for secrets, passwords, tokens, or PII leaks. Manual review is not enough for repeatable leak classes.

Required automated-check expectations:

- A repo secret scanner is run locally and in CI, with a maintained allowlist/baseline for intentional synthetic values. Examples of acceptable tools/patterns: GitHub secret scanning/push protection where available, `gitleaks`, `trufflehog`, `git-secrets`, Semgrep rules, or equivalent custom scripts.
- A custom project PII scanner catches real or real-looking emails, phone numbers, DOB-like values, addresses, maintainer/community names, reset/verify tokens, session-looking strings, AWS/Stripe-looking keys, private-key blocks, JWT-looking values, and password literals in `src/`, `tests/`, fixtures, content, docs intended for repo, scripts, workflows, and generated committed artifacts.
- A script-convention checker enforces the stdin/no-argv/no-echo rule for password-handling scripts and blocks unsafe patterns such as `--password`, credential URLs, `set -x` around secret code, `printenv`, and unredacted debug output.
- A logging/audit redaction test proves representative secrets and PII are redacted across browser errors, structured logs, audit metadata, worker errors, webhook errors, outbox rows, and CLI/script errors.
- CI verifies `.env`, `.env.*`, local DB files, generated logs, coverage artifacts, snapshots, screenshots, temporary exports, and migration dumps are either ignored, synthetic, scrubbed, or explicitly safe.
- Test fixtures and snapshots use synthetic identities only. Real footbag-community names, maintainer names, real emails, real phone numbers, or copied production-like profile text are bugs unless the file is an explicitly approved legacy-data artifact outside the normal deployed-code/test surface.
- Dependency and workflow checks include secret-exposure paths: unsafe GitHub Actions permissions, untrusted PR contexts with secrets, workflow command injection, cache/artifact leakage, unpinned actions that could exfiltrate secrets, and npm lifecycle scripts that run before review.

When a missing check is found, record it in `BUGS.md` under **Testing and CI/CD verification gaps** unless an actual leak is also present. If an actual leak is present, record the leak in the appropriate severity section and mention the missing automated check as the prevention gap.

#### 4.4.42 Deploy-time asset availability (runtime path not shipped)

A service that reads a file or directory at runtime is correct only if the deploy image contains that path. The web/worker/image Dockerfiles copy a specific subset of the working tree (compiled `dist`, `src/views`, `src/public`, `ifpa`), NOT the whole repo. A runtime read of a path outside that subset resolves to a missing file in staging/production even though it works locally and is committed to git.

- `scripts/ci/check_runtime_data_paths_copied.sh` is the existing deterministic gate for this class; verify its coverage against the patterns below (a read shape the gate misses is a coverage finding), then sweep manually for what it cannot see.
- Enumerate every runtime filesystem read in `src/`: `readFileSync`, `readdirSync`, `existsSync`, and any `resolve(...)` / `path.join(...)` that builds a data path (CSV, JSON sidecar, content directory, generated artifact). The search recipe in §4.5A lists the patterns.
- Resolve each path as it would be in the container (compiled code runs from `/app/dist`, so `resolve(__dirname, '../..')` is `/app`, and `process.cwd()` is `/app`), then confirm a matching `COPY` line exists in `docker/web/Dockerfile` (and the worker/image Dockerfiles where that service runs). A read of a path no Dockerfile copies is a finding.
- `exploration/`, `legacy_data/`, and other scratch/working trees are especially suspect: committed but never shipped. Production data must come from a shipped location (a `src`/`dist`-adjacent data dir, `ifpa/`, or the database), not a scratch tree.
- Fail-safe masking: a service that returns empty/null when its data files are missing HIDES this bug (no crash, no 500, no log; the feature renders empty in production while passing every local test). Treat a missing-data fallback over a non-shipped path as Medium (silent feature break), or High when the surface is security/privacy-relevant.
- Example signal: a service computes `resolve(PROJECT_ROOT, 'exploration', '...')` or `path.join(process.cwd(), 'legacy_data', ...)` and reads CSV/JSON from it, but no Dockerfile `COPY` ships that directory.

#### 4.4.43 Infrastructure-as-code security and gate integrity

The terraform tree (staging, production, shared), the Docker/compose files, and `.githooks/` are deployed configuration; a misconfiguration there is a production bug visible statically. CI validates syntax (`terraform fmt`/`validate`), not security posture — posture is this category.

- IAM: wildcard actions/resources, user policies broader than the role's task, missing scope-down (a go-live gate tracks IAM scope-down; audit against it).
- Storage/CDN: public-access posture on buckets, CloudFront origin-access and cache-policy correctness for authenticated paths, missing `prevent_destroy` on the snapshots bucket (a named go-live gate).
- Host exposure: Lightsail public port openings vs the documented front-door architecture; SSH exposure vs the pre-cutover revert checklist.
- Secrets: SSM parameter types (SecureString vs String), KMS key policy breadth, secret values or real identifiers in `*.tfvars`, committed plan/state artifacts (`*.tfplan`, `.terraform/*.tfstate` local files are a leak surface — flag any that are tracked or contain secrets).
- Parity: staging vs production module drift beyond the accepted differences (a go-live gate tracks the parity audit); docker/env files diverging from the documented runtime contract.
- Systemd/timers under `ops/` count as infra here for exposure and dependency posture; their logic correctness is §4.4.44.

#### 4.4.44 Operational script and systemd correctness

Complements §4.4.40, which is credentials-only. A logic bug in a deploy, backup, reset, or validation script can destroy data or silently no-op a safety gate.

- Destructive scripts (DB rebuilds, resets, cleanups) must guard: explicit target confirmation, refusal against production, refuse-to-shrink/refuse-on-unexpected-state checks. A destructive path reachable without its guard is High+.
- Shell strictness and failure behavior: missing `set -euo pipefail` (or deliberate, documented relaxation), unquoted expansions on paths that can carry spaces, `cd` without failure check before destructive operations, pipelines that mask non-zero exits.
- Lifecycle completeness: temp files and remote artifacts cleaned via `trap` on all exit paths — a script must not depend on a human remembering a teardown step.
- Remote halves: quoting/interpolation of locally-expanded variables into ssh/remote shells; a remote command that silently runs against the wrong host or path.
- Idempotency: re-running a deploy/backup/install script must not corrupt state.
- Systemd units/timers: cadence and dependencies match the documented operational intent (backup cadence, service ordering, restart policy); a timer that silently stops matching the DEVOPS-documented recovery objective is a finding.

#### 4.4.45 Client-side JavaScript defects

`src/public/js/**` ships to browsers and is part of the deployed attack and correctness surface; templates-only sweeps miss it.

- DOM XSS: `innerHTML`/`insertAdjacentHTML`/attribute injection fed by data that originates from user content (member names, tags, media titles), even when it arrives via a JSON data island.
- CSP compliance: the scripts must load and run under the app's CSP (no inline eval patterns, no dynamic script injection from non-allowlisted origins).
- Endpoint wiring: every fetch/XHR/form-augmentation target resolves to a real route with the expected method and gates; a JS-constructed URL is the client-side twin of §4.4.39.
- Progressive enhancement: the control a script enhances must degrade to a working no-JS path where the view-layer rule requires one; a delete-confirm or navigation script that becomes the ONLY path to a state change is a finding.
- Secret/PII hygiene: no tokens or private data parked in localStorage/sessionStorage or leaked to console.

#### 4.4.46 Static accessibility and a11y-gate coverage

A WCAG 2.1 AA gate is in the go-live blocker index, and the e2e suite carries an axe accessibility spec — so accessibility is a deployed, gated requirement, not polish. Static review covers what a template shows directly:

- Template-level defects: images without meaningful `alt`, form inputs without labels, missing `lang`, heading-order jumps, landmark-less page shells, controls conveyed by color alone, focus traps in JS-driven controls (§4.4.45 overlap).
- Harness coverage: the axe e2e spec's page set vs the deployed public surface — a deployed page class the a11y harness never renders is a Testing/CI gap finding tied to the go-live gate.
- Live-browser verification (actual axe runs, screen-reader behavior) stays out of scope; static template review and harness-coverage auditing are in.

#### 4.4.47 Performance and capacity defects (narrow)

A load/performance check is in the go-live gate set, so capacity is gated; this category stays narrow — concrete user-visible or gate-relevant impact only, never style-level perf nits.

- A hot deployed query (per-request path on a public page) with no supporting index in `database/schema.sql`.
- N+1 render patterns: a template/service pair issuing a query per row for a list the page always renders.
- Unbounded result sets on deployed routes: list/search endpoints without pagination caps (overlaps §4.4.33 where abuse-relevant; here the ordinary-user page-weight case counts too).
- Synchronous heavy work on the request path that belongs in a worker (image/video processing, large file reads).
- Do NOT flag: micro-optimizations, "could be cached", stream-vs-buffer preferences, or anything without a concrete deployed path and plausible real-data volume.

#### 4.4.48 Claude-harness guard coverage

`.claude/` is production configuration (per `.claude/rules/claude-harness-governance.md`), and CI runs a harness self-check plus hook fixture tests. Audit the guard LAYERS, not just the files:

- Subagent-safety mirroring: every statically-expressible guard a hook enforces must have a `permissions.deny`/`ask` twin in `.claude/settings.json`, because the permission floor is the version-proof layer a subagent always inherits, whereas hook-firing inside subagents has varied across client versions. A destructive-class guard with no permissions twin is a finding.
- Hook bypass review: each guard hook against command/process substitution, redirection, pipes, `xargs`, quoting, and multiline input; a bypass is High.
- Fixture coverage: every wired hook has a fixture test in the CI hook-test script; a guard change without a fixture is a finding.
- Self-check coverage: conventions the harness-governance rule states that `scripts/ci/assert_claude_harness.sh` does not yet verify are coverage findings (report; do not edit the harness).

### 4.4B Design-pattern divergence and code hygiene (secondary sweep)

This is a **separate, lower-priority sweep** run after the §4.4 security/correctness sweep. Its findings go in their own `BUGS.md` group (see the SKILL.md output specification) so they never drown the security findings. **Severity**: most §4.4B findings are **Low** or **Medium**. Escalate to **High** only when the divergence produces an actual behavioral or security failure (for example, a template that branches on a raw `role` value and thereby exposes an admin-only control to a non-admin viewer — that is an authorization leak, not a style nit).

Ground every §4.4B finding in the canonical pattern it violates: `.claude/rules/{controller-conventions,template-conventions,view-layer,service-layer,db-layer}.md`, service file-header JSDoc. Cite the rule.

The drift direction is not always code-violates-rule. A path-scoped rule in `.claude/rules/*` or a `.claude/skills/*` procedure whose stated behavior, identifier, or contract the deployed code no longer matches is itself a divergence finding (rule/skill drift), the same as JSDoc or comment drift. For every behavior or identifier a change moved, grep the full `.claude/rules/*` and `.claude/skills/*` set for the superseded term and flag any stale clause: a sentence buried in an otherwise-current rule drifts silently because reading the rule for context does not surface it. Record it in the same design-divergence group, citing the stale file:line and the code that supersedes it.

#### 4.4B.1 Controller-layer divergence

Controllers are HTTP glue: parse request, call service, render/redirect. If a method exceeds ~10 lines without obvious cause, the missing pattern is probably a service method.

- Business rules, validation logic, domain branching, or member/tier lookups performed in a controller instead of delegated to a service.
- Controller mutating service output instead of passing the `PageViewModel` straight through to `res.render`.
- Controller hand-rolling URLs, labels, or the page envelope that the service should shape.
- Direct `res.cookie()` / `res.setHeader('Set-Cookie', ...)` outside the `sessionCookie` / `flashCookie` helpers. Logout's documented `clearCookie(SESSION_COOKIE_NAME, ...)` for RFC-6265 attribute matching is the only exception.

#### 4.4B.2 Template-layer divergence (logic in views)

Templates are logic-light: the service hands them a fully-shaped view-model; templates render it.

- Branching on raw domain codes (`{{#if (eq member.role 'admin')}}`, `{{#if (gt member.tier 1)}}`, `{{#if (eq event.status 'completed')}}`) instead of a service-supplied pre-shaped boolean (`isAdmin`, `isCompleted`).
- Deriving a label from an enum in the template (`{{#if (eq teamType 'doubles')}}Doubles{{...}}`) instead of a service-supplied `teamTypeLabel`.
- Multi-variable URL construction in an `href` (`/members/{{slug}}/section-{{section}}/{{id}}`) instead of a pre-shaped `*Href` field. Single-variable query params are fine.
- Inline `style="..."`, `<style>`, `<script>`, or `on*=` event handlers (CI catches some; flag any fresh introduction). The only allowed inline `<script>` is the non-executable JSON data island `<script type="application/json">`.
- Nested `<form>` elements.
- Any value the template had to compute that the service should have supplied.

#### 4.4B.3 Service-contract divergence

- A public-page method not returning `Promise<PageViewModel<T>>` (or `| null` for privacy-gated reads), or not named `get<Page>Page()`; a service returning a bare `{ content: ... }` envelope.
- A service duplicating business logic owned by another service: reading `member_tier_current` directly instead of `MembershipTieringService.getTierStatus()`; reading `member_active_player_current` instead of `ActivePlayerService.getStatus()`; running member search outside `MemberService.searchMembers()`.
- A bare `throw new Error(...)` in normal control flow (reserved for internal invariant assertions only), or a `ServiceError` subclass that maps to the wrong HTTP status (e.g. a conflict thrown as `ValidationError` so it 422s where it should 409/conflict-render).
- A boolean (or thrown error) return where the contract is a discriminated union (`{ status: '...' }`).
- A hardcoded operational value (tier price, token TTL, rate-limit bucket, grace period) instead of `readIntConfig(key, fallback)` / a `system_config_current` read.
- A service shape mismatch: a factory `createXService(deps)` with no injected dependencies (should be a singleton), or a singleton holding mutable state (should be a factory).

#### 4.4B.4 DB-layer divergence

- `db.prepare()` or raw SQL outside `src/db/db.ts` (CI-enforced; flag any fresh occurrence).
- Named parameters (`:param`) instead of positional `?`.
- `datetime('now')` instead of the canonical `strftime('%Y-%m-%dT%H:%M:%fZ','now')` ISO form (the space-separated form breaks lexical ordering in views, triggers, and string comparisons).
- A bare `WHERE` filter where a canonical view already encodes the filter (`members_active`, `members_searchable`, `clubs_open`, `member_tier_current`, etc.).
- Business rules or non-lazy statement compilation in `db.ts` (statements must be lazy getters returning flat rows only).
- A service write path that does not stamp `created_by` / `updated_by` / `version` on a domain-table mutation.

#### 4.4B.5 Cross-layer leak

Extends §4.4.16 with the design-hygiene framing; cross-referenced to avoid drift.

- `process.env` read outside `src/config/env.ts` (worker entry points read worker-only vars; services never do).
- AWS SDK / Stripe imports outside `src/adapters/`.
- `fs` writes in `src/services/` that bypass the MediaStorageAdapter (outside test-only / sidecar paths).
- Hardcoded URLs / domains that should derive from `config.publicBaseUrl`.

#### 4.4B.6 Comment and in-code-doc hygiene

- **Every comment must be audited, not sampled.** For each code file read — including `scripts/**` shell/TS/Python files, which the comments rule covers the same as `src/` — review every comment and JSDoc for validity, accuracy, pertinence, and usefulness. A comment that is technically true but irrelevant, cryptic, or misleadingly incomplete is a finding when it would steer a maintainer or agent wrong.
- **Stale / bogus comment**: a comment that describes behavior the code no longer has. This IS a finding (it misleads the next reader); report it with the divergent line.
- **Plain-English self-contained rule:** comments must be readable without opening another document, remembering a past slice, or decoding project shorthand. The reader should understand the long-term reason or contract from the comment itself.
- **Forbidden human-readable text content** per `.claude/rules/comments.md` — applies to BOTH code comments AND human-readable string values in code (governance `reason:` fields, editorial/content strings, labels, descriptions): sprint / slice / phase labels, dated change-markers, caller references, historical change notes, external doc anchors, temporary-status notes, and implementation-timeline language. Human-readable text must be plain words explaining the WHY to a human; the only permitted planning-style content is known-deviation text that is ALSO documented in `IMPLEMENTATION_PLAN.md` and is limited to developer bootstrapping from the current implementation toward the long-term target. (Example shapes: a dated refactor marker in a comment; a `reason:` data string mentioning a slice; a comment saying a behavior is temporary without self-contained current/target contract.)
- **Em-dash scope:** em dashes are a finding only in user-facing text a site visitor reads (per `.claude/rules/view-layer.md`); an em dash in a code comment, JSDoc, script, or doc file is not a finding.
- **Deviation comment** missing the required `Current:` / `Target:` lines, or not self-contained (references a doc path or external anchor instead of explaining in words).
- **Doc reference inside a code file** (`.ts`, `.sh`, `.hbs`, `.css`): a comment that points at a doc — a path (`docs/MIGRATION_PLAN.md §7`, `see FOO.md`, `exploration/...`) or a bare section shorthand (`per DD §2.9`, `SC §LegacyClaim`, `US §198`) — rots independently of the doc. Rewrite to a self-contained plain-words explanation. Doc PATHS are always a finding; a bare section shorthand is acceptable ONLY when it accompanies a complete self-contained explanation (a locator, not a substitute). Reproduction: `rg -n 'docs/|exploration/|[A-Z_]{4,}\.md|\bDD §|\bSC §|\bUS §|DATA_GOVERNANCE|MIGRATION_PLAN|USER_STORIES|DESIGN_DECISIONS|SERVICE_CATALOG|DATA_MODEL|VIEW_CATALOG' src/` then keep only comment-line hits. When the rotting reference is a filesystem path the code might also read at runtime (`exploration/`, `legacy_data/`, `curated/`), do not stop at rewriting the comment: check whether code beneath reads that path (§4.4.42). A comment-hygiene hit on a path can mask a real deploy-asset dependency.
- **Console logging in application code** (`src/`, excluding the `src/testkit/` test seams): any `console.log` / `console.warn` / `console.error` / `console.debug` / `console.info` instead of the structured `logger` (`src/config/logger`). Console output bypasses the CloudWatch pipeline and the test `logger.error` guard. Per `.claude/rules/comments.md` (Logging) and `service-layer.md` (Operational errors). Reproduction: `rg -n 'console\.(log|warn|error|debug|info)' src/`.
- **Service file-header JSDoc drift**: the file-header JSDoc on a write-path service (identity, membership, payments, voting, active-player, member, event, club, media, curator) diverges from the actual contract — wrong ownership boundary, missing/added required pattern, stale persistence scope, wrong side-effect categories, or wrong singleton/factory shape. Per `service-layer.md` this is "a real bug, not a doc nicety" because the JSDoc auto-loads with the file and actively misleads.

#### 4.4B.7 Test-code rule violations

Committed-test rule violations only. Coverage *gaps* (a surface that lacks a test) stay in the §5 punch list at the end of this file; this category is for committed tests that break a hard testing rule.

- `.skip`, `.todo`, or `xit` in committed test code (quarantine has its own tagged process).
- Status-only assertions where a body assertion is required (see Cross-cutting observations below).
- **Real or real-looking PII** in fixtures, snapshots, seed data, or any test/data string value — real footbag-community-figure names, real maintainer names (team members), and real emails. Use clearly-synthetic names; preserve only the variant relationship a scenario exercises (diacritic, long/short, surname-split). Per the `DATA_GOVERNANCE` synthetic-only rule. Reproduction: cross-reference person-name string literals against real community / maintainer identities; high-signal fields are `creator:`, `person_name:`, `real_name:`, `display_name:`, and the name-variant fixtures in `tests/fixtures/` + `src/content/`.
- A test constructing a writable path from `process.cwd()` / project root instead of `os.tmpdir()` with the `footbag-test-` prefix.
- A `logger.error()` produced by a test without an `expectLoggedError(pattern)` opt-in.
- Mocking the DB or framework internals (Express, Handlebars, JWT, argon2) instead of using the real SQLite test DB and stub adapters.
- **Behavior-mirroring or unfalsifiable tests.** A committed test that asserts the code does exactly what the code currently does rather than what the design intends (forbidden by `docs/TESTING.md` §2.4 — "worse than no test"), a test that cannot fail (tautological assertion, assertion on a value the test itself constructed), or a test that pins behavior contradicting canonical design. The last shape is also a signal the CODE may be wrong — cross-check against the design source before classifying.
- **Test comment referencing any doc or hunt-finding id.** Test comments (file headers, describe/it text, inline) must NEVER reference a doc or a finding id — no `BUG_HUNT` / `B##` / `Regression for B##` / `(B##)`, no `DD §` / `US §` / `SC §` / `DATA_GOVERNANCE §`, no `docs/*.md` or bare `*.md` filenames. Test comments state the long-term contract in plain words only (this is stricter than src: in tests, even a section shorthand alongside prose is a finding). Reproduction: `rg -n 'BUG_HUNT|Regression for B[0-9]|\(B[0-9]|\bDD §|\bUS §|\bSC §|docs/|[A-Z_]{4,}\.md' tests/` then keep only comment-line hits.

#### 4.4B.8 Service JSDoc contract consistency sweep

This is a distinct sweep, not a subset of ordinary comment cleanup. Service JSDoc is a contract reader for future maintainers and AI agents. If it is stale, inconsistent, vague, or incomplete about a service's real boundary, it can cause future code defects and must be reported.

For every `src/services/*.ts` file, inspect the file-header JSDoc and any exported service/factory/type JSDoc against the implementation and the canonical service-layer rule:

- **Presence on write-path services:** a high-stakes write-path service (identity, membership, payments, voting, active-player, member, event, club, media, curator) with no file-header JSDoc block at all is a finding, not only one whose header has drifted. The header auto-loads with the file, so its absence leaves the service contract undocumented at the point of use. Services join this category by domain, so judge presence by what the service does, not by a hand-maintained list.
- **Purpose and ownership boundary:** the JSDoc states what domain responsibility the service owns and what it must delegate to other services/adapters.
- **Public contract:** exported methods, return shapes, discriminated unions, nullability, thrown `ServiceError` types, and normal error/status outcomes match the code.
- **Side effects:** DB writes, audit rows, outbox/email enqueue, work-queue enqueue, media/storage calls, payment/webhook effects, token/session effects, and cache/config reads are accurately described where relevant.
- **Security and privacy invariants:** auth assumptions, owner/admin/tier boundaries, anti-enumeration behavior, PII minimization, deceased-member handling, append-only ledger behavior, and idempotency guarantees are documented when the service owns or enforces them.
- **Transaction and consistency boundary:** multi-write operations, rollback expectations, no-`await` transaction constraints, and post-commit side effects are accurately described.
- **Dependency shape:** singleton vs factory, injected dependencies, adapter usage, and mutable state expectations match the actual export pattern.
- **Terminology consistency:** the JSDoc uses the same domain vocabulary as the user stories and data governance docs without cryptic abbreviations or doc-anchor shorthand.
- **Completeness without noise:** comments explain WHY and contract boundaries, not line-by-line HOW. Missing contract information is a bug when it would mislead an implementer; excessive stale detail is also a bug.
- **Forbidden content:** no sprint/slice/phase labels, dated change markers, temporary-status notes, or document references. The only permitted temporary language is a known developer-bootstrapping deviation with self-contained `Current:` and `Target:` lines, and only when that same deviation is accepted in `IMPLEMENTATION_PLAN.md`.

Report service-JSDoc findings under `Design-divergence and hygiene` unless the incorrect documentation directly masks a security/correctness failure; then report the concrete failure in the severity section and include the JSDoc drift as contributing evidence.

## Cross-cutting observations

Patterns that recur across multiple sites. Useful to scan once before per-file work.

1. **Status-only assertions on static surfaces** (`expect(res.status).toBe(200)`). The five public static routes (`/sideline`, `/hof`, `/bap`, `/legal`, `/ifpa`) now carry a body assertion on the happy path, so a regression to an empty or wrong template breaks the test. Remaining: loose patches of freestyle browse-view tests may still be status-only; audit them for the same gap. The fix is small (one body assertion per route) but spread across many files.

2. **KMS-failure pattern applies to any signing-dependent recovery path.** The pattern: if `signJwt` throws between a DB commit and the cookie issuance, the user is locked out of all sessions with no working cookie. Recovery must route to a separate JWT-issuing flow (password reset). When future signing surfaces land, copy this pattern.

3. **Anti-enumeration assertion shape is reusable.** `security.anti-enumeration.test.ts` uses status-equality + length-ratio (0.95-1.05). The same shape applies to any new surface where exists/not-exists must be indistinguishable (Stripe Checkout for unknown vs known customer; legacy mass-claim lookup; future contact-finder). Helper is reusable as-is; no refactor needed when future enumeration-sensitive surfaces arrive.

## External security calibration references

Do not turn the hunt into a compliance exercise, and do not browse unless the kickoff prompt explicitly asks. Use these public standards as calibration lenses for what classes of bugs to look for:

- **OWASP Secure Code Review Guide / Cheat Sheet:** manual review should inspect application logic, data flow, and implementation details that automated tools miss.
- **OWASP ASVS:** the mental checklist for authentication, session management, access control, validation/encoding, cryptography, error handling/logging, data protection, communications, business logic, file/resources, API, and configuration verification.
- **OWASP WSTG:** the adversarial "how would this be tested from outside?" companion; the hunt stays static unless the prompt authorizes runtime testing.
- **NIST SSDF SP 800-218:** verify that source review and security checks trace to secure-development practices — code review, threat modeling, dependency/configuration review, vulnerability response readiness.
- **CISA Secure by Design:** favor findings that eliminate whole vulnerability classes or unsafe defaults, not just individual symptoms.
- **MITRE CWE Top 25:** the final sanity check for high-frequency weakness classes: XSS, SQL injection, CSRF, missing/incorrect authorization, path traversal, command/code injection, unrestricted upload, deserialization, sensitive information exposure, missing authentication, SSRF, user-controlled key authorization bypass, resource exhaustion.
- **OWASP CI/CD Security Cheat Sheet and DevSecOps guidance:** the automation lens for SAST, DAST, dependency/SCA, IaC/container, secrets, pipeline-permission, and workflow-tampering checks.
- **OWASP Secrets Management and Logging guidance:** the calibration lens for hardcoded secrets, secret transport, redaction, password handling, and sensitive data in logs, diagnostics, artifacts, and audit metadata.
- **GitHub CodeQL/code scanning, secret scanning, push protection, and dependency-review guidance:** the repo-native baseline for semantic vulnerability scanning, blocking committed secrets, and dependency risk review.
- **OpenSSF Scorecard / SCM best practices:** the repository-health and supply-chain lens for branch protection, pinned actions, token permissions, maintainer permissions, dependency update hygiene, risky workflow patterns.

These references never override project rules; they prevent blind spots.

## High-signal static search recipes (§4.5A)

Use these as accelerators, not substitutes for reading the call paths. Keep results in scratch notes unless they become verified findings.

```bash
# Routes and auth surfaces
rg -n "router\.(get|post|put|patch|delete)|app\.use|requireAuth|requireAdmin|requireTier1Benefits|requireOriginPin|rateLimitHit" src/

# Direct response/security helpers
rg -n "res\.redirect|res\.cookie|clearCookie|setHeader\(|Cache-Control|Content-Security-Policy|Referrer-Policy|X-Content-Type-Options" src/

# SQL / transaction / DB convention
rg -n "db\.prepare|transaction\(|await .*transaction|UPDATE audit_entries|DELETE FROM audit_entries|UPDATE member_tier_grants|DELETE FROM member_tier_grants" src/

# XSS / template logic / inline browser code
rg -n "\{\{\{|<script|on[a-zA-Z]+="|style="|eq .*role|eq .*tier|href="/.+\{\{" src/views/

# Secrets, PII, tokens, logging, and artifacts
rg -n "password|passwd|pwd|token|secret|api[_-]?key|authorization|cookie|metadata_json|logger\.|console\.|redact|mask|session|jwt|private[_-]?key|BEGIN .*PRIVATE KEY|AKIA|ASIA|sk_live|sk_test|whsec|xox[baprs]-|gh[pousr]_|github_pat_|dob|birth|phone|address|email" src/ tests/ scripts/ docs/ .github/ package.json Dockerfile --glob '!node_modules' --glob '!dist' --glob '!.git'
rg -n "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b\d{4}-\d{2}-\d{2}\b|\b\d{2}/\d{2}/\d{4}\b|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b" src/ tests/ scripts/ docs/ .github/ --glob '!node_modules' --glob '!dist' --glob '!.git'

# Script credential handling / password-leak convention
rg -n "--password|--passwd|--pwd|--token|--secret|--api-key|PASSWORD=|PASS=|TOKEN=|SECRET=|read .*pass|read -s|set -x|set -o xtrace|printenv|env |echo .*pass|printf .*pass|curl .*\-u|mysql .*\-p|psql .*postgres://|sshpass|add-mask|::add-mask::" scripts/ package.json .github/ Dockerfile 2>/dev/null
find scripts -type f \( -name '*.sh' -o -name '*.ts' -o -name '*.js' -o -name '*.mjs' -o -name '*.py' \) -print 2>/dev/null

# Environment and dev shortcuts
rg -n "process\.env|FOOTBAG_DEV|NODE_ENV|PAYMENT_ADAPTER|STRIPE|AWS|SES|S3|CLOUDFRONT" src/ scripts/ Dockerfile package.json .github/ 2>/dev/null

# Outbound requests / SSRF / shell/path hazards
rg -n "fetch\(|axios|got\(|http\.request|https\.request|child_process|exec\(|spawn\(|readFile|writeFile|mkdir|unlink|rename|\.\.\/" src/

# Uploads, media, storage, MIME, dimensions, queueing
rg -n "multer|upload|mime|content-type|sharp|ffmpeg|Image|Video|MediaStorage|work_queue|lease|retry" src/

# Payments and tier grants
rg -n "payment|stripe|webhook|checkout|purchase-tier|tier|member_tier|grant" src/ tests/

# User-story traceability
rg -n "V_|M_|A_|EO_|CL_|success criteria|Acceptance|As an|Given|When|Then" docs/ src/ tests/

# Service JSDoc and comments
rg -n "^/\*\*|^ \*|//|TODO|FIXME|slice|sprint|phase|temporary|for now|docs/|\.md|DD §|SC §|US §|DATA_GOVERNANCE|SERVICE_CATALOG|USER_STORIES" src/services/ src/ tests/

# CI/CD and deterministic verification surface
find . -maxdepth 4 \( -path './node_modules' -o -path './.git' \) -prune -o -type f \( -path './.github/workflows/*' -o -path './scripts/*' -o -name 'package.json' -o -name 'package-lock.json' -o -name '.eslintrc*' -o -name 'eslint.config.*' -o -name 'tsconfig*.json' -o -name 'Dockerfile' \) -print
rg -n "tsc|eslint|prettier|vitest|playwright|codeql|semgrep|gitleaks|trufflehog|git-secrets|detect-secrets|osv|npm audit|audit-ci|scorecard|trivy|grype|dependency-review|secret|push protection|SAST|DAST|SBOM|cyclonedx|spdx|PII|redact|mask|no-argv|stdin|password" package.json scripts/ .github/ 2>/dev/null

# Clickable route / form targets in templates
rg -n "href=|action=|button|data-href|data-url|redirect|returnTo|\*Href|urlFor|route" src/views/ src/controllers/ src/services/

# Runtime filesystem reads vs shipped image (deploy-asset availability, §4.4.42)
rg -n "readFileSync|readdirSync|existsSync|resolve\(|path\.join\(" src/ | rg -n "exploration|legacy_data|curated|\.csv|\.json|process\.cwd"
rg -n "^COPY" docker/*/Dockerfile

# Infrastructure-as-code posture (§4.4.43)
rg -n "\\*|AdministratorAccess|public|0\.0\.0\.0/0|prevent_destroy|SecureString|type\s*=" terraform/ --glob '*.tf'
find terraform -name '*.tfplan' -o -name '*.tfstate*' -o -name '*.tfvars'
rg -n "ports|firewall|instance_public_ports" terraform/

# Operational scripts and systemd (§4.4.44)
rg -n "set -e|set -euo|pipefail|trap |rm -rf|DROP TABLE|DELETE FROM|--force" scripts/ --glob '*.sh'
cat ops/systemd/*.service ops/systemd/*.timer

# Client-side JS (§4.4.45)
rg -n "innerHTML|insertAdjacentHTML|outerHTML|document\.write|eval\(|localStorage|sessionStorage|fetch\(|XMLHttpRequest" src/public/js/

# Static accessibility (§4.4.46)
rg -n "<img(?![^>]*alt=)|<input(?![^>]*(aria-label|id=))|role=|aria-" src/views/ --pcre2
rg -ln "axe|a11y|accessibility" tests/e2e/
```

For every high-signal hit, trace provenance:
`request input -> controller -> service -> DB/adapters/templates -> response/audit/outbox`.
A grep hit alone is never a finding.

## Testing and CI/CD verification improvement punch list — detail (§5.1–§5.6)

SKILL.md's verification-layer sweep (Phase F) frames this punch list; the classification rule and the guard/automation/coverage checklists are here.

### 5.1 Classification rule

When a missing check is found, classify it as one of:

- **Must-have pre-merge guard:** should run on every PR before merge because failure means the repo may be unsafe or broken.
- **Fast local guard:** should be available as a pre-commit/pre-push or `npm run verify:*` command for immediate feedback.
- **Nightly/deep guard:** valuable but slower, fuzzier, or broader than a normal PR check.
- **Manual staging gate:** requires staging credentials, live AWS, real DNS/email/payment provider, or production-like infrastructure; record as a Lead if static review cannot verify it.

### 5.2 Baseline deterministic guards to verify

The repo already carries a committed gate set: the `scripts/ci/` checkers (conventions, harness self-check, hook fixtures, append-only triggers, action pinning, script credentials, live-fetch guard, synthetic identifiers, runtime-data-path COPY check, loader row counts), the GitHub Actions workflow jobs (type-check, lint, dependency audit, secret scan, conventions, harness, unit, integration, db-load smoke, e2e, CodeQL, terraform validate), and `run_all_tests.sh` as the local runner. For each class below, first locate the existing gate and audit its COVERAGE against the class — read the gate's implementation; presence is not coverage — then record a finding only for the class (or the part of a class) no gate pins:

- TypeScript compile check with no emit.
- ESLint or equivalent rule checks for application and tests.
- Formatting check if formatting is standardized.
- Full unit/integration test command used by CI.
- Template compilation/render smoke test.
- Route inventory generation and route-auth matrix verification.
- SQLite schema migration validation and fixture DB boot check.
- No committed `.skip`, `.todo`, `xit`, or quarantined-test leakage.
- No real or real-looking PII in tests/fixtures/content/docs committed to the repo, including maintainer/community names, real emails, DOB-like values, phone/address data, and copied production-like profile text.
- No hardcoded secrets, private keys, JWT-looking values, reset/verify tokens, Stripe/AWS/GitHub-looking keys, or real-looking credential examples.
- No script violates the project password-handling convention: passwords/secrets come through stdin or an approved secret store, not argv, shell history, query strings, unsafe env dumps, visible process lists, or unredacted temp files.
- No unexpected `logger.error()` in tests without an opt-in expectation.
- No direct `db.prepare()` outside `src/db/db.ts`.
- No `process.env` reads outside approved config/entry points.
- No AWS/Stripe SDK imports outside adapters.
- No direct session/flash cookie writes outside helpers.
- No console logging in app code.
- No inline scripts/styles/event handlers in templates.
- No triple-stash template output without an explicit sanitizer/operator-control proof.
- No doc references, sprint/slice/phase/date markers, or temporary-status language in code comments/test comments.
- Service JSDoc contract consistency checks.
- No `src/` runtime filesystem read (readFileSync / existsSync / resolve / path.join data path) targets a directory that no Dockerfile `COPY` ships into the deploy image (catches the deploy-asset-availability class in §4.4.42).

### 5.3 Security automation to verify

Use this as the CI/CD and supply-chain checklist, applying the same verify-the-existing-gate rule as §5.2 (CodeQL, gitleaks with `.gitleaks.toml`, audit-ci, action pinning, and terraform validate are already committed; the opt-in deep layer is the pentest harness under `scripts/pentest/` with its ZAP/probe scripts). Treat secrets/PII/password-leak automation as mandatory, not optional polish:

- CodeQL or equivalent SAST for TypeScript/JavaScript.
- Semgrep or custom static rules for project-specific conventions when CodeQL is too generic.
- Secret scanning before merge and preferably before commit.
- Dependency vulnerability scanning for npm dependencies and lockfiles.
- Dependency review on pull requests.
- License policy check if dependency licensing matters for deployment.
- SBOM generation for releases when deployment artifacts are produced.
- Container image scanning if Docker images are built.
- IaC scanning if Terraform/CloudFormation/CDK or deployment manifests exist.
- GitHub Actions workflow hardening: minimal `permissions:`, pinned or trusted actions, no untrusted pull-request code with write tokens, no unsafe interpolation into shell commands, no secret exposure to forked PRs.
- Secret scanning and push protection where available; local/CI scanner such as `gitleaks`, `trufflehog`, `git-secrets`, `detect-secrets`, Semgrep, or a project-specific equivalent.
- PII scanner for synthetic-only test/content rules, including names, emails, DOB-like values, phone/address values, and profile/contact text.
- Script password-convention checker that blocks `--password`/argv secrets, credential URLs, `set -x` leaks, `printenv` dumps, unredacted child-process calls, and unsafe temporary files.
- Redaction regression tests using representative fake secrets and fake PII across logger, audit metadata, webhook/worker errors, CLI/script output, browser error pages, and generated artifacts.
- CI artifact hygiene check: no generated logs, coverage, screenshots, SQLite files, exports, snapshots, or debug dumps are uploaded or committed with secrets/PII.
- OpenSSF Scorecard or equivalent repository-health scan for branch protection, pinned dependencies/actions, token permissions, maintainer review requirements, and security-policy hygiene.

### 5.4 Route, link, form, and button smoke coverage

The repo should have a deterministic route-wiring harness that proves rendered navigation does not rot.

Minimum expected behavior:

- Start the Express app against a synthetic test DB.
- Render every public page and the important authenticated/admin/tier-gated pages using synthetic personas.
- Extract internal `href`, `form[action]`, and explicit button/navigation targets from rendered HTML or service view-models.
- Verify every internal target maps to a registered route and does not produce a 500 or accidental 404 for the appropriate persona.
- Verify route methods for forms: a rendered `method="post" action="..."` should map to an actual POST route protected by the expected origin/auth/rate-limit gates.
- Verify route params with representative fixture values, not unresolved placeholders.
- Treat expected access-denied, login redirects, and intentional 404s as explicit allowlisted outcomes, not accidental passes.
- Fail on unsafe redirects, loops, unexpected external URLs, or external links missing required safety attributes.

If this harness does not exist, record a Testing and CI/CD verification gap. If it exists but only checks status codes or only public pages, record the specific missing coverage.

### 5.5 Property, invariant, and fuzz-style checks to consider

These are high-value because agentic coding makes them cheap to write and they catch whole bug classes:

- Auth matrix property tests: anonymous/member/owner/non-owner/admin/curator across every deployed route.
- Anti-enumeration invariant tests: same status/body shape/body length for exists/not-exists pairs.
- Idempotency property tests for outbox, work queue, payment webhooks, tier grants, and active-player grants.
- Append-only ledger mutation tests for audit/tier/active-player/system-config tables.
- Unicode/slug normalization fuzz tests for identity matching and member/profile lookups.
- Form validation fuzz tests for boundary lengths, invalid UTF-8-like strings, suspicious HTML, SQL-looking input, path traversal strings, and duplicate submissions.
- Template escaping property tests for all untrusted fields rendered into views.
- Resource-exhaustion boundary tests for uploads, search queries, pagination, and expensive lookup paths.

### 5.6 How to report missing automated checks

Do not write "needs more tests." A valid Testing/CI/CD finding must state:

- The exact missing deterministic check.
- The invariant or bug class it protects.
- The likely command/workflow/script location.
- The deployed stories or routes affected.
- Whether it should be fast local, pre-merge, nightly/deep, or manual staging.
- Why the check is cheap and stable enough to automate.

---
name: bug-hunt
description: Run a disciplined adversarial bug hunt over the footbag-platform repository - a static code-and-design security/correctness review that re-derives the deployed surface, checks deployed user stories against their success criteria, refutes every candidate finding, and records verified findings in BUGS.md at the repo root. Use when the user asks for a bug hunt, bug sweep, security sweep, or adversarial review of the codebase. Not a testing strategy and not browser QA.
---

# Bug Hunt — Claude Code bug-hunting prompt and static security/design review guide

This skill is the standing prompt for running a disciplined Claude Code bug hunt against the footbag-platform repository. It is a static, code-and-design review guide: it complements `docs/TESTING.md`, but it is not the testing strategy and not a browser QA plan. It is invoked when there is reason to believe new defects may have been introduced, when a feature area has never had an adversarial review, or when user-story/documentation drift may have created hidden implementation bugs.

Findings from a sweep are recorded in `BUGS.md` (repo root) and removed once the code fix lands; the working code is authoritative. Do not record closures, dates, or `RESOLVED` markers.

The core job is broader than "find syntax bugs." A bug may be:
- code that fails a deployed user story's success criteria;
- code that satisfies a flawed or incomplete user story but violates the platform goal or documented domain model;
- a security weakness visible only from data flow, authorization flow, state-transition, or threat-model review;
- a design/documentation bug where the design source of truth is ambiguous, internally inconsistent, or missing a control that the deployed code clearly needs.


## 0. Scope, constraints, and how to use this file

### 0.0 Prompt contract for Claude Code

When an AI agent runs this file, treat it as a prompt with explicit role, success criteria, process, and output constraints.

**Role:** act as a white-hat adversarial reviewer for this repository. Think like a careful maintainer, security engineer, domain analyst, and hostile user trying to find real defects before production does.

**Objective:** produce a verified `BUGS.md` findings report covering deployed code, deployed user stories, implemented technical features, and design-level gaps that can cause real behavior, security, privacy, data-integrity, or operations failures.

**Success criteria for the bug hunt itself:**
- The deployed route/service surface has been re-derived from the repo, not blindly trusted from this file.
- Every implemented or partially implemented user story in scope has been classified and mapped to the code that implements it.
- For completed user stories, all success criteria have been checked against code behavior.
- Security findings are grounded in concrete data flow, control flow, state transition, or configuration evidence.
- Each finding has been actively refuted before being recorded.
- Security/correctness findings receive an independent adversarial second pass.
- Every service file's JSDoc and service-contract comments have been checked for clarity, accuracy, consistency, and usefulness against the implementation.
- The repo's deterministic verification surface has been reviewed: missing obvious CI/pre-commit/pre-merge checks are treated as bugs because automation should catch repeatable classes of defects before the agent or maintainer sees them.
- The script credential-handling convention has been re-derived from the existing safe scripts and checked across every script, package command, workflow, and helper that can receive or transport a password, token, key, or credential.
- Secrets, passwords, tokens, and PII have been reviewed across source, scripts, tests, fixtures, logs, audit metadata, exports, templates, generated artifacts, and CI/CD outputs; missing deterministic leak checks are recorded as bugs.
- The rendered clickable surface has been considered: every link, form action, and button-triggered navigation should have a deterministic route-wiring/smoke check that proves it resolves to an intentional route and does not 500.
- Ambiguous requirement/design discrepancies are not guessed; ask one excellent maintainer question at a time.
- The output is actionable, minimal, and restricted to `BUGS.md`.

**Non-goals:** do not run a browser QA pass, do not redesign the application, do not write fixes, do not create a test plan, and do not record speculative issues as bugs.

**Operating rule for uncertainty:** when code and user stories disagree, do not assume the user story is right. The bug may be in the code, the user story, the service catalog, the view catalog, the migration plan, or the prompt. Step back and reason from the platform goal, domain invariants, deployed route behavior, and source-of-truth order. If a human decision is required, ask exactly one question with enough context for the maintainer to answer.

### 0.1 Read order by role

- **Maintainer or AI agent picking the next task**: read `BUGS.md` (verified findings awaiting remediation), §3 (open remediation items), and §5 (testing-improvement punch list). Pick the highest-leverage item that fits the current slice.
- **AI agent running a fresh bug hunt**: §4 carries the brief; outstanding findings live in `BUGS.md`, and the §4.5 step-0 audit of that file is mandatory before any edit to it. Re-run when there is reason to believe new defects may have been introduced.

### 0.2 Audit-wide scope filters (apply to every section)

Before applying the filters below, rebuild the in-scope inventory from the repository. This file contains a known-good seed inventory, not a substitute for reading `src/app.ts`, `src/routes/*.ts`, controller/service call sites, and the current user-story documents. If the seed list disagrees with code, treat that as a drift signal and verify before flagging anything.

- **Deployed-only**. A user story is "deployed" if at least one HTTP route in `src/routes/*.ts` (mounted by `src/app.ts`) serves it, or if a service-only call site is invoked at runtime.
- **Everything deployed is in scope by default.** Per-run exclusions come only from the prompt that kicks off the hunt; record any such exclusion in the `BUGS.md` scope note so a later run knows what was skipped.
- **CAPTCHA AC out of scope**. Turnstile is project-level deferred. Missing-CAPTCHA AC are `unimplemented (by design)`.
- **`legacy_data/` pipeline is the one standing exception**: its Python code, scripts, and CSV artifacts are out of scope unless the kickoff prompt explicitly includes them. The pipeline has its own `legacy_data/IMPLEMENTATION_PLAN.md`. Legacy *migrated data* shaping the deployed surface (claim flow, auto-link, historical-person joins) IS in scope where it manifests in deployed routes.
- **No tests for code that has not yet been written.** Tests in scope: currently deployed user stories + technical features already in code (adapter parity, dev-only scaffolding (testkit persona harness + dev-bootstrap), migrated legacy data, security helpers, audit-ledger, outbox, idempotency-key handling, anti-enumeration surfaces). Stripe payments, EO_* / CL_* / future M_* / not-yet-implemented A_* stories are excluded from the testing-improvement punch list.

### 0.3 Hard constraints inherited from the project

- Findings-only when executing the §4 bug-hunt brief specifically (no code edits during that session). Closing items from §3 / §5 is normal slice work; code edits are expected.
- One question per turn when blocked. Read-only investigation (git reads, DB SELECTs, file listings, `--help`, compile-checks) is pre-approved per `memory/feedback_readonly_git_preapproved.md`.
- Never commit per `memory/feedback_never_commit.md`. The maintainer commits.
- **Do not track done work in this document or in `BUGS.md`.** Resolved findings, landed remediations, and fixed bugs are removed from §3 and `BUGS.md` once the code edit lands; the working code is authoritative. No "RESOLVED", "DONE", "FIXED in commit X" entries — they accumulate as noise and contradict the §3 / §4.7 convention. Applies to AI agents and human maintainers equally.
- No emojis in this file or in derived findings files.

---

## 1. Scope filter

### 1.0 Mandatory up-front deployed-story traceability pass

Before the security sweep, create a scratch-only traceability matrix. Do not commit it and do not write it to the repo unless the kickoff prompt explicitly asks. Use it to decide what is in scope and to avoid false positives.

For each user story in `docs/USER_STORIES.md`, and any deployed freestyle/payment/technical feature without a clean user-story ID, classify it:

- **Complete and deployed:** at least one mounted route or runtime service path implements the story, and code appears intended to satisfy all success criteria.
- **Partial and deployed:** route/service exists, but only some success criteria are implemented or an accepted deviation exists.
- **Technical feature deployed without a clean user story:** code is reachable, but requirements are in another doc or implicit in architecture.
- **Designed but not deployed:** user story exists, but no mounted route/runtime call path implements it.
- **Not implemented / future:** no deployed route/service path and no active runtime behavior.
- **Ambiguous / source-of-truth conflict:** code and docs disagree in a way that requires a maintainer decision.

For every **Complete and deployed** story, verify every success criterion against code. A failure is a bug. For every **Partial and deployed** story, verify that the unimplemented criteria are explicitly accepted deviations; otherwise record a requirements/design discrepancy or ask the maintainer one question.

Use this scratch format:

```markdown
| Story / feature | Deployed evidence | Success criteria checked | Classification | Bug candidates | Human question needed? |
|---|---|---|---|---|---|
| M_Example | route + controller + service | A1-A5 | Complete and deployed | B? or none | no |
```

**Discrepancy rule:** if code and user story disagree, first determine whether the code violates a clear requirement, the requirement is stale/incomplete, or the domain intent is unclear. Do not record a severity finding until this is clear. If blocked, ask one question using this exact shape:

```markdown
Question: <one decision needed>
Context: <where the code and documents disagree, with file/doc references>
Why this matters: <what bug/security/design outcome depends on the answer>
Recommended answer: <your recommendation and why>
Alternatives: <only the realistic alternatives>
```

Do not batch questions. Ask the highest-leverage blocking question first, then continue after the maintainer answers.

### 1.1 Current seed inventory

The deployed surface below is the current seed inventory for §3 through §5. Re-derive it from the repo before relying on it:

- **Freestyle**: the `/freestyle/*` public surface — ~28 GET routes in `src/routes/publicRoutes.ts` served by `src/controllers/freestyleController.ts`, backed by `freestyleService` / `freestyleRecordShaping` / `freestyleRecordVisibility` / `freestyleRelatedTricks`, rendered from `src/views/freestyle/**`, with the mechanically-tested dictionary-trick-card uniformity contract. GET-only/public: the stressed categories are §4.4.8 (XSS), §4.4.1 (logic), §4.4.6 (anti-enumeration on slug lookups), and §4.4B (design/comment divergence).

- **V_*** (8): V_Browse_Static_Content, V_Browse_Clubs, V_Browse_Upcoming_Events (partial — TEMP-DEVIATION on upcoming region), V_Browse_Past_Events, V_View_Gallery, V_Access_Denied, V_Not_Found, V_Error_or_Maintenance_Mode, V_Register_Account
- **M_*** (15): M_Login, M_Verify_Email, M_Reset_Password, M_Change_Password, M_Logout, M_Browse_Legacy_Archive (edge-only — not exercisable from Express), M_Claim_Legacy_Account, M_Confirm_Auto_Linked_Identity, M_Complete_Onboarding_Wizard, M_Edit_Profile, M_Contact_IFPA_Admin, M_Search_Members, M_View_Profile, M_Active_Player_Expiry, M_Upload_Photo, M_Organize_Media_Galleries, M_Delete_Own_Media
- **A_*** (5): A_View_Official_Roster_Reports (service-only, no HTTP route deployed), A_Moderate_Media (partial — only the curator-edit / curator-delete sub-criteria deployed), A_Upload_Curated_Media, A_View_Dashboard (stub only), A_Resolve_Contact_IFPA_Admin_Request

Stories NOT deployed today: V_View_Trick_Reference_Videos, V_View_News_Feed, V_View_Tutorials, V_Browse_Hashtags; M_Delete_Account / M_Restore_Account / M_Download_Data, M_Join_Club / M_Leave_Club / M_View_Club, M_Register_For_Event / M_View_Event, all M_* under §3.7 Voting / §3.8 (M_Submit_Video, M_Flag_Media) / §3.9 Email; all EO_*, all CL_*, and the majority of A_*. These are explicitly **out of scope** for §3-§5 work.

**Now deployed (in scope):** the membership-payment surface — `POST /members/:memberKey/purchase-tier`, the stub checkout routes, `POST /payments/webhook`, `/payments/success` / `/payments/cancel`, and `GET /members/:memberKey/payments` (`src/routes/publicRoutes.ts`), served by `paymentController` / `paymentService` / the `paymentAdapter` stub. The live Stripe adapter is still a throwing stub (`PAYMENT_ADAPTER=stub` only), so live-mode webhook verification is not yet exercised. The §4 bug hunt covers this surface. The real webhook verifier and the SDK-signed stub are in place (`src/adapters/stripeWebhook.ts`); only the live Stripe checkout-session creation remains.

---

## 2. Cross-cutting observations (load-bearing, applies to multiple sections below)

Patterns that recur across multiple sites. Useful to scan once before per-file work.

1. **Status-only assertions on static surfaces** (`expect(res.status).toBe(200)`). The five public static routes (`/sideline`, `/hof`, `/bap`, `/legal`, `/ifpa`) now carry a body assertion on the happy path, so a regression to an empty or wrong template breaks the test. Remaining: loose patches of freestyle browse-view tests may still be status-only; audit them for the same gap. The fix is small (one body assertion per route) but spread across many files.

2. **KMS-failure pattern applies to any signing-dependent recovery path.** The pattern: if `signJwt` throws between a DB commit and the cookie issuance, the user is locked out of all sessions with no working cookie. Recovery must route to a separate JWT-issuing flow (password reset). When future signing surfaces land, copy this pattern.

3. **Anti-enumeration assertion shape is reusable.** `security.anti-enumeration.test.ts` uses status-equality + length-ratio (0.95-1.05). The same shape applies to any new surface where exists/not-exists must be indistinguishable (Stripe Checkout for unknown vs known customer; legacy mass-claim lookup; future contact-finder). Helper is reusable as-is; no refactor needed when future enumeration-sensitive surfaces arrive.

---

## 3. Remediation snapshot

Open remediation items. Landed items are not listed here; the working code is authoritative. Cross-check `src/` before adding any new finding.

No open remediation items.

---

## 4. Bug-hunt brief

This section is invoked when there is reason to believe new defects may have been introduced (large refactor, area you haven't audited before, post-incident sweep). It is not a recurring task. Output is a findings-only report written to `BUGS.md`.

### 4.0 Outstanding findings

Outstanding findings live in `BUGS.md` (repo root). Record findings there when a sweep surfaces defects, grouped by severity per §4.6 (security/correctness severity sections first, design-divergence and hygiene in a dedicated trailing group); the running ID sequence continues from the last retired finding. Remove each finding once its fix lands.

### 4.1 Your job in one paragraph

Read deployed controllers, services, middleware, adapters, templates, schema-facing DB statements, service JSDoc/contracts, deterministic CI/CD guardrails, and relevant design/user-story documents. Find real bugs: logic errors, user-story success-criteria mismatches, design-source drift, error-handling holes, race conditions, auth/authorization gate misses, anti-enumeration leaks, transaction-boundary violations, cookie/cache-control regressions, dev-shortcut leaks, swallow-the-error patterns that hide security-critical signals, privacy leaks, business-logic abuse paths, payment/tier integrity failures, file/media boundary failures, service documentation drift, missing cheap automated checks, clickable-route miswiring, supply-chain/configuration mistakes visible in repo, and any other latent defect a future production incident could surface. Write findings to `BUGS.md`, grouped by severity, one row per bug with file:line, reproduction, and suggested fix. `BUGS.md` is the single findings file; do not create others. Every finding you record must be a verified real bug: demonstrate the failure path against the code, attempt to refute it, and give security/correctness findings an independent adversarial second pass before they land. A suspicion that survives only as a suspicion goes to the `BUGS.md` Leads section under its narrow admission rule (§4.6), never into the severity sections. Ambiguous requirement/design discrepancies are resolved by one maintainer question at a time, with a recommended answer. The maintainer reviews each finding and gates remediation per finding. After the security/correctness sweep, run the §4.4B design/hygiene sweep (layering divergence, comment + JSDoc drift, test-code rule violations) and report those findings in the dedicated design-divergence group in `BUGS.md`.

### 4.2 Hard constraints (already stated in §0; re-stated here so a fresh agent doesn't miss them)

- **Findings-only**. No code edits. No test edits. No git commits. No git pushes. The only doc write allowed is writing findings to `BUGS.md`.
- **Audit before edit**. The §4.5 step-0 audit of `BUGS.md` (re-verify every existing entry) is mandatory before any write to that file.
- **Scope = currently deployed code in `src/`** per §1 deployed-US inventory.
- **Skip CAPTCHA AC; skip the `legacy_data/` pipeline unless the kickoff prompt includes it** per §0.2. Honor any per-run exclusions from the kickoff prompt and record them in the `BUGS.md` scope note.
- **One question per turn** if you need to ask the maintainer something.
- **No subagent prompts for safe commands** — small lookups stay in the main session.
- **Concise communication**. No filler, no preamble, no emojis.
- **No backwards-compat hacks**. If you find dead code, deletable shims, or unused exports, flag them under "low severity" but do not propose elaborate migration plans.
- **No diagnose-and-remediate-in-one-step**. Diagnose. Report. Wait for the maintainer to gate per-finding remediation in a separate slice.
- **Never commit** even if findings seem ready to act on.
- **Use AskUserQuestion only when blocked** — if the answer to "should I check X?" is obviously yes, just do it.

### 4.3 Mandatory pre-reads (in this order)

Before scanning any source file, load these into context:

1. This document (you are reading it). §1 is your scope filter, §3 is what NOT to re-flag, §4.4 is the bug-category framework.
2. `/home/footbag/GITHUB/footbag-platform/CLAUDE.md` — project-wide rules + source-of-truth order.
3. `/home/footbag/GITHUB/footbag-platform/docs/TESTING.md` §15.2 strategic anti-patterns.
4. `/home/footbag/GITHUB/footbag-platform/IMPLEMENTATION_PLAN.md` — active-slice + accepted-deviation block. A behavior that looks like a bug may be an explicitly documented deviation; cross-check before flagging.
5. `/home/footbag/GITHUB/footbag-platform/.claude/rules/testing.md`, `service-layer.md`, `controller-conventions.md`, `template-conventions.md`, `db-layer.md`, `doc-governance.md` — the operational rules every finding must respect (the layer-boundary rules are the canonical patterns the §4.4B design-divergence sweep checks against).
6. `/home/footbag/GITHUB/footbag-platform/docs/DATA_GOVERNANCE.md` (mandatory before any finding that touches members, historical persons, search, contact fields, exports, stats, or privacy boundaries).

The user memory directory at `/home/footbag/.claude/projects/-home-footbag-GITHUB-footbag-platform/memory/MEMORY.md` autoloads. Respect every behavioral rule documented there.

### 4.3A External security calibration references

Do not turn this into a compliance exercise, and do not browse unless the kickoff prompt explicitly asks. Use the following public standards as calibration lenses for what classes of bugs to look for:

- **OWASP Secure Code Review Guide / Cheat Sheet:** manual review should inspect application logic, data flow, and implementation details that automated tools miss.
- **OWASP ASVS:** use as the mental checklist for authentication, session management, access control, validation/encoding, cryptography, error handling/logging, data protection, communications, business logic, file/resources, API, and configuration verification.
- **OWASP WSTG:** use as the adversarial "how would this be tested from outside?" companion, but keep this bug hunt static unless the prompt authorizes runtime testing.
- **NIST SSDF SP 800-218:** verify that source review and executable/security checks are traceable to secure-development practices, especially code review, threat modeling, dependency/configuration review, and vulnerability response readiness.
- **CISA Secure by Design:** favor findings that eliminate whole vulnerability classes or unsafe defaults, not just individual symptoms.
- **MITRE CWE Top 25:** use as a final sanity check for high-frequency weakness classes: XSS, SQL injection, CSRF, missing/incorrect authorization, path traversal, command/code injection, unrestricted upload, deserialization, sensitive information exposure, missing authentication, SSRF, user-controlled key authorization bypass, and resource exhaustion.
- **OWASP CI/CD Security Cheat Sheet and DevSecOps guidance:** use as the automation lens for SAST, DAST, dependency/SCA, IaC/container, secrets, pipeline-permission, and workflow-tampering checks.
- **OWASP Secrets Management and Logging guidance:** use as the calibration lens for hardcoded secrets, secret transport, redaction, password handling, and avoiding sensitive data in logs, diagnostics, artifacts, and audit metadata.
- **GitHub CodeQL/code scanning, secret scanning, push protection, and dependency-review guidance:** use as the repo-native baseline for pull-request security annotations, semantic vulnerability scanning, blocking committed secrets, and dependency risk review.
- **OpenSSF Scorecard / SCM best practices:** use as the repository-health and supply-chain lens for branch protection, pinned actions, token permissions, maintainer permissions, dependency update hygiene, and risky workflow patterns.

These references do not override project rules. They help prevent blind spots.

### 4.4 Bug categories — what you're hunting for

Organize the primary (security/correctness) sweep around the expanded categories in §4.4.1-§4.4.41. Each one names the typical site, the specific pattern, and an example signal. After the primary sweep, run the secondary design/hygiene sweep in §4.4B (controller/template/service/db divergence, cross-layer leaks, comment + JSDoc drift, test-code rule violations) and report its findings in the dedicated `BUGS.md` design-divergence group.

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
- The persona-password literal (`src/testkit/personaSecrets.ts`) and the dev-admin seed password literal (`src/dev-bootstrap/seedConfig.ts`) must each appear in exactly one source file (regression tests enforce this); a literal copy elsewhere is a bug.
- URLs must never carry secrets or PII unnecessarily: reset tokens, verification tokens, session tokens, emails, member private identifiers, DOB, phone, address, admin notes, or raw return payloads must not appear in logs, redirects, analytics-like strings, cache keys, query strings, or external links unless the route is explicitly token-bearing and protected by no-store/redaction.
- PII exposure is not limited to passwords. Search for emails, DOB, phone/address fields, IP addresses, contact text, uploaded-media metadata, member private fields, historical identity-linking notes, admin notes, and exported CSV/JSON fields. Verify each exposure has a purpose, audience boundary, and minimization rule.
- Generated artifacts are in scope: test snapshots, fixture DB dumps, log files, audit exports, `BUGS.md` reproductions, CI artifacts, coverage reports, screenshots, and temporary files must not contain real or real-looking secrets/PII.
- A redaction helper that covers one path but not another is a bug. Verify that browser errors, structured logs, audit metadata, email outbox rows, worker/job errors, webhook errors, and CLI/script errors use the same redaction policy or an equally strict local policy.

#### 4.4.10 Rate-limit misses

- Routes that mutate state (POST `/login`, `/register`, `/password/forgot`, `/verify/resend`, `/members/:slug/edit/password`, `/members/:slug/contact-admin`, `/members/:slug/media/upload`, etc.) should call `rateLimitHit(key, max, windowMin)` from `src/services/rateLimitService.ts`.
- A missing limiter on a state-changing route is a high-severity finding.
- The audit row should record only the threshold-crossing event (per M_Login A7: no per-attempt audit, no IP stored). Verify the limiter implementation respects this.

#### 4.4.11 Cookie attribute regressions

- `src/lib/sessionCookie.ts` is the only place that sets/clears the session cookie (per `.claude/rules/controller-conventions.md`). Verify it sets `HttpOnly`, `Secure` (in production), and `SameSite=Lax` on the issued cookie. A regression to `SameSite=None`, missing `HttpOnly`, or accidental `Secure: false` in production would be catastrophic.
- Flash cookies must be HttpOnly + signed (see `src/lib/flashCookie.ts`); verify no controller bypasses the helper and calls `res.cookie()` directly.
- Any POST that changes a password (login-after-rotate, password-edit, password-reset-complete) must re-issue the session JWT (`createSessionJwt` + `issueSessionCookie`) so the current browser stays authenticated while the bumped `password_version` invalidates all other sessions. A password-change path that does not re-issue locks the current user out; one that does not bump `password_version` fails to invalidate stolen sessions.

#### 4.4.12 Cache-Control regressions

- Authenticated responses must carry `Cache-Control: private, no-store` (set by app.ts middleware at lines ~218-222). Any controller that overwrites this header on an authenticated response is a bug.
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
- The `Dockerfile dist-rm` rule strips `dist/testkit/` and `dist/dev-bootstrap/` from production builds. Verify no source file outside `src/testkit/` / `src/dev-bootstrap/` has a direct import of a `seed`/`runtime` symbol from `src/dev-bootstrap/` (the import would fail at runtime in production).
- The `scripts/audit-dev-shortcuts.sh` pre-deploy gate queries four marker prefixes; verify the boot orchestrator at `src/app.ts` doesn't bypass them.

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

These are the SERVICE_CATALOG / DATA_GOVERNANCE / USER_STORIES non-negotiables. A violation is a real bug even when the code "works":

- **Deceased login**: login must reject any member with `is_deceased = 1` *before* the credential check (SERVICE_CATALOG §4 auth boundary). A credential check that runs first, or a path that lets a deceased member authenticate, is catastrophic.
- **Active-player no-shorten**: an older event / vouch / club-join must never shorten an existing later expiry; idempotency via the `ux_active_player_grants_*` unique constraints.
- **Ballot non-anonymity**: `ballots.voter_member_id` is stored in plaintext by design; a path that strips it is a finding.
- **Work-queue admin-alert coupling**: every `work_queue_items` INSERT must enqueue an `admin-alerts` notification carrying task type + entity id only (no PII).
- **Event hard-delete guard**: events with published result rows must never be deleted; the guard fires on every delete path.
- **PII purge atomicity**: `purgeAccountPII` runs in one transaction; no partial purge; honors/historical attribution survive per DATA_GOVERNANCE §10.

#### 4.4.21 User-story success-criteria mismatch

A deployed story that fails its own success criteria is a bug even when the code "works" mechanically.

- Build the traceability matrix from §1.0 before this pass.
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

This project already has a deliberate pattern for avoiding password leaks in scripts. The bug hunt must derive that pattern from the existing safe scripts before judging new or inconsistent scripts. Do not merely search for the word `password`; trace how the credential is obtained, transported, logged, passed to child processes, and cleaned up.

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

### 4.4B Design-pattern divergence and code hygiene (secondary sweep)

This is a **separate, lower-priority sweep** run after the §4.4 security/correctness sweep. Its findings go in their own `BUGS.md` group (see §4.6) so they never drown the security findings. **Severity**: most §4.4B findings are **Low** or **Medium**. Escalate to **High** only when the divergence produces an actual behavioral or security failure (for example, a template that branches on a raw `role` value and thereby exposes an admin-only control to a non-admin viewer — that is an authorization leak, not a style nit).

Ground every §4.4B finding in the canonical pattern it violates: `.claude/rules/{controller-conventions,template-conventions,service-layer,db-layer}.md`, `docs/SERVICE_CATALOG.md`, `docs/VIEW_CATALOG.md`. Cite the rule.

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

- **Every comment must be audited, not sampled.** For each code file read, review every comment and JSDoc for validity, accuracy, pertinence, and usefulness. A comment that is technically true but irrelevant, cryptic, or misleadingly incomplete is a finding when it would steer a maintainer or agent wrong.
- **Stale / bogus comment**: a comment that describes behavior the code no longer has. This IS a finding (it misleads the next reader); report it with the divergent line.
- **Plain-English self-contained rule:** comments must be readable without opening another document, remembering a past slice, or decoding project shorthand. The reader should understand the long-term reason or contract from the comment itself.
- **Forbidden human-readable text content** per `.claude/rules/comments.md` — applies to BOTH code comments AND human-readable string values in code (governance `reason:` fields, editorial/content strings, labels, descriptions): sprint / slice / phase labels, dated change-markers, caller references, historical change notes, external doc anchors, temporary-status notes, and implementation-timeline language. Human-readable text must be plain words explaining the WHY to a human; the only permitted planning-style content is known-deviation text that is ALSO documented in `IMPLEMENTATION_PLAN.md` and is limited to developer bootstrapping from the current implementation toward the long-term target. (Example shapes: a dated refactor marker in a comment; a `reason:` data string mentioning a slice; a comment saying a behavior is temporary without self-contained current/target contract.)
- **Em-dash scope (maintainer ruling):** an em dash in a code comment, JSDoc, script, or doc file is NOT a finding; do not sweep for or report them there. Em dashes are a finding only in PUBLIC-FACING content a site visitor can read: rendered template text, editorial/content strings, UI labels and notices, and notification email bodies. (The comments.md no-em-dash rule still governs newly authored text; the hunt just does not police existing non-public text for it.)
- **Deviation comment** missing the required `Current:` / `Target:` lines, or not self-contained (references a doc path or external anchor instead of explaining in words).
- **Doc reference inside a code file** (`.ts`, `.sh`, `.hbs`, `.css`): a comment that points at a doc — a path (`docs/MIGRATION_PLAN.md §7`, `see FOO.md`, `exploration/...`) or a bare section shorthand (`per DD §2.9`, `SC §LegacyClaim`, `US §198`) — rots independently of the doc. Rewrite to a self-contained plain-words explanation. Doc PATHS are always a finding; a bare section shorthand is acceptable ONLY when it accompanies a complete self-contained explanation (a locator, not a substitute). Reproduction: `rg -n 'docs/|exploration/|[A-Z_]{4,}\.md|\bDD §|\bSC §|\bUS §|DATA_GOVERNANCE|MIGRATION_PLAN|USER_STORIES|DESIGN_DECISIONS|SERVICE_CATALOG|DATA_MODEL|VIEW_CATALOG' src/` then keep only comment-line hits.
- **Console logging in application code** (`src/`, excluding the `src/testkit/` test seams): any `console.log` / `console.warn` / `console.error` / `console.debug` / `console.info` instead of the structured `logger` (`src/config/logger`). Console output bypasses the CloudWatch pipeline and the test `logger.error` guard. Per `.claude/rules/comments.md` (Logging) and `service-layer.md` (Operational errors). Reproduction: `rg -n 'console\.(log|warn|error|debug|info)' src/`.
- **Service file-header JSDoc drift**: the file-header JSDoc on a write-path service (identity, membership, payments, voting, active-player, member, event, club, media, curator) diverges from the actual contract — wrong ownership boundary, missing/added required pattern, stale persistence scope, wrong side-effect categories, or wrong singleton/factory shape. Per `service-layer.md` this is "a real bug, not a doc nicety" because the JSDoc auto-loads with the file and actively misleads.

#### 4.4B.7 Test-code rule violations

Committed-test rule violations only. Coverage *gaps* (a surface that lacks a test) stay in §5; this category is for committed tests that break a hard testing rule.

- `.skip`, `.todo`, or `xit` in committed test code (quarantine has its own tagged process).
- Status-only assertions where a body assertion is required (extends §2.1).
- **Real or real-looking PII** in fixtures, snapshots, seed data, or any test/data string value — real footbag-community-figure names, real maintainer names (team members), and real emails. Use clearly-synthetic names; preserve only the variant relationship a scenario exercises (diacritic, long/short, surname-split). Per the `DATA_GOVERNANCE` synthetic-only rule. Reproduction: cross-reference person-name string literals against real community / maintainer identities; high-signal fields are `creator:`, `person_name:`, `real_name:`, `display_name:`, and the name-variant fixtures in `tests/fixtures/` + `src/content/`.
- A test constructing a writable path from `process.cwd()` / project root instead of `os.tmpdir()` with the `footbag-test-` prefix.
- A `logger.error()` produced by a test without an `expectLoggedError(pattern)` opt-in.
- Mocking the DB or framework internals (Express, Handlebars, JWT, argon2) instead of using the real SQLite test DB and stub adapters.
- **Test comment referencing any doc or hunt-finding id.** Test comments (file headers, describe/it text, inline) must NEVER reference a doc or a finding id — no `BUG_HUNT` / `B##` / `Regression for B##` / `(B##)`, no `DD §` / `US §` / `SC §` / `DATA_GOVERNANCE §`, no `docs/*.md` or bare `*.md` filenames. Test comments state the long-term contract in plain words only (this is stricter than src: in tests, even a section shorthand alongside prose is a finding). Reproduction: `rg -n 'BUG_HUNT|Regression for B[0-9]|\(B[0-9]|\bDD §|\bUS §|\bSC §|docs/|[A-Z_]{4,}\.md' tests/` then keep only comment-line hits.

#### 4.4B.8 Service JSDoc contract consistency sweep

This is a distinct sweep, not a subset of ordinary comment cleanup. Service JSDoc is a contract reader for future maintainers and AI agents. If it is stale, inconsistent, vague, or incomplete about a service's real boundary, it can cause future code defects and must be reported.

For every `src/services/*.ts` file, inspect the file-header JSDoc and any exported service/factory/type JSDoc against the implementation and the canonical service-layer rule:

- **Purpose and ownership boundary:** the JSDoc states what domain responsibility the service owns and what it must delegate to other services/adapters.
- **Public contract:** exported methods, return shapes, discriminated unions, nullability, thrown `ServiceError` types, and normal error/status outcomes match the code.
- **Side effects:** DB writes, audit rows, outbox/email enqueue, work-queue enqueue, media/storage calls, payment/webhook effects, token/session effects, and cache/config reads are accurately described where relevant.
- **Security and privacy invariants:** auth assumptions, owner/admin/tier boundaries, anti-enumeration behavior, PII minimization, deceased-member handling, append-only ledger behavior, and idempotency guarantees are documented when the service owns or enforces them.
- **Transaction and consistency boundary:** multi-write operations, rollback expectations, no-`await` transaction constraints, and post-commit side effects are accurately described.
- **Dependency shape:** singleton vs factory, injected dependencies, adapter usage, and mutable state expectations match the actual export pattern.
- **Terminology consistency:** the JSDoc uses the same domain vocabulary as the user stories/service catalog/data governance docs without cryptic abbreviations or doc-anchor shorthand.
- **Completeness without noise:** comments explain WHY and contract boundaries, not line-by-line HOW. Missing contract information is a bug when it would mislead an implementer; excessive stale detail is also a bug.
- **Forbidden content:** no sprint/slice/phase labels, dated change markers, temporary-status notes, or document references. The only permitted temporary language is a known developer-bootstrapping deviation with self-contained `Current:` and `Target:` lines, and only when that same deviation is accepted in `IMPLEMENTATION_PLAN.md`.

Report service-JSDoc findings under `Design-divergence and hygiene` unless the incorrect documentation directly masks a security/correctness failure; then report the concrete failure in the severity section and include the JSDoc drift as contributing evidence.

### 4.5 Methodology — step by step

0. **Audit `BUGS.md` before touching it** (run it after the §4.3 pre-reads, before any write). Re-verify every existing entry against current code: re-resolve each file:line, confirm the bug still exists, correct drifted line numbers, and delete entries whose fix has landed. Re-check that each Leads item still awaits its confirm/refute step. Only after this audit may the sweep write anything to the file.
1. **Load the mandatory pre-reads** (§4.3). Establish the source-of-truth order and current accepted deviations.
2. **Rebuild the deployed surface from code**: sweep `src/app.ts`, `src/routes/*.ts`, service-only runtime call sites, worker/internal routes, mounted routers, and route-level middleware. Compare the result to §1.1; any drift is a signal to investigate, not an automatic finding.
3. **Build the scratch deployed-story traceability matrix** (§1.0). Classify each story/feature as complete, partial, technical-without-story, designed-not-deployed, future, or ambiguous. For complete/partial deployed stories, list the success criteria that must be checked.
4. **Run a quick threat-model pass** for the high-risk flows: login/session, register/verify/reset, legacy claim/auto-link/onboarding, member profile/media/gallery, clubs/groups where deployed, admin/curator, payments/webhooks, outbox/email, contact-admin, archive-boundary, and worker/internal IPC.
5. **Sweep `src/routes/*.ts` + `src/app.ts`** for route registrations. Build a mental map of which controller serves each route. Note which routes traverse `requireAuth`, `requireAdmin`, `requireTier1Benefits`, `requireOriginPin`, rate limits, body parsers, upload middleware, and any route-specific cache/header behavior. Any divergence from the expected gate pattern is a candidate finding.
6. **For each deployed-US controller method** (per §1 inventory and the traceability matrix, including `freestyleController`):
   - Read the controller body.
   - Read the service method(s) it calls.
   - Cross-check the path against §4.4.1-§4.4.39.
   - For each issue found, capture: file:line, the exact snippet, the bug class, the proposed minimal fix.
7. **Sweep `src/middleware/*.ts`** for auth, CSRF, rate-limit, cookie, and password-version-check logic. These are catastrophic-severity surfaces.
8. **Sweep `src/services/*.ts`** for the patterns in §4.4.13 (transactions), §4.4.14 (best-effort swallows), §4.4.15 (dev-shortcut reads outside `src/testkit/` / `src/dev-bootstrap/`), plus the service-contract patterns in §4.4B.8.
9. **Run the dedicated service-JSDoc consistency sweep** (§4.4B.8): compare every service file-header/exported-contract JSDoc to actual code, side effects, errors, transaction behavior, dependency shape, and security/privacy invariants.
10. **Sweep `src/adapters/*.ts`** for error-handling holes. Verify all 8 adapters' error surfaces are correctly classified at every call site.
11. **Sweep `src/lib/*.ts`** for shared helpers (cookies, flash, redactTokenPaths, externalLink, etc.). A bug in a helper is multiplied by every call site.
12. **Sweep `src/views/**/*.hbs`** (including `src/views/freestyle/**`) for `{{{ }}}` triple-stashes and any inline `<script>` (CSP forbids inline scripts; verify CSP nonces or hashes are correctly attached when present).
13. **Review deterministic verification coverage** (§4.4.38 and §5): inspect `package.json`, `scripts/`, `.github/workflows/` when present, CI scripts, test commands, lint/typecheck commands, security scanners, custom convention checkers, and repo-level gates. Record missing obvious checks as Testing and CI/CD verification gaps.
14. **Review clickable-route/form-target coverage** (§4.4.39): determine whether the repo has a deterministic rendered-link/form-action/button-navigation smoke test. If not, identify the deployed surfaces it should cover and record the gap.
15. **Secondary sweep: layering divergence** (§4.4B.1-§4.4B.5). Re-scan the controllers/services/templates/db already read against the canonical layer boundaries: business logic in controllers/templates, controller mutating service output, raw-enum branching in views, services duplicating other services' logic, hardcoded operational values, cross-layer leaks. Record under the `BUGS.md` design-divergence group.
16. **Secondary sweep: comment + JSDoc drift** (§4.4B.6), service-JSDoc consistency (§4.4B.8), and test-code rule violations (§4.4B.7) across the files read: stale/bogus comments, forbidden comment content, deviation comments missing `Current:`/`Target:`, service header/exported contract JSDoc that no longer matches the contract, committed-test rule breaks.
19. **Cross-check `src/` directly** (and the §3 table for explicitly-tracked actionable items) to confirm a finding has not already been remediated in code before flagging. Landed items are not tracked in §3; the code is authoritative.
20. **Self-verify** (§4.7) before writing to `BUGS.md`.

### 4.5A High-signal static search recipes

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
```

For every high-signal hit, trace provenance:
`request input -> controller -> service -> DB/adapters/templates -> response/audit/outbox`.
A grep hit alone is never a finding.

### 4.6 Output specification — exactly what to write

Single sink: `BUGS.md` at the repo root. Security/correctness findings (the §4.4 sweep) extend the severity sections (Catastrophic, High, Medium, Low; add a section only when it has findings). Design-divergence + hygiene findings (the §4.4B sweep) go in a dedicated **Design-divergence and hygiene** group, reported *after* the security severity sections so they never crowd out a catastrophic finding; within that group, order by severity. Deterministic automation, CI/CD, missing broad test harnesses, and clickable-route smoke-test gaps go in a dedicated **Testing and CI/CD verification gaps** group after design/hygiene unless they have already produced a concrete security/correctness failure. Bug IDs continue one running sequence (do not reuse a retired ID, do not split into a separate ID prefix); findings are grouped by report section, not by ID. No files other than `BUGS.md` are produced.

Per-finding structure:

```markdown
##### B<N> — <short title>

- **File:** `src/<path>.ts:<line>`
- **Class:** <one of §4.4.1-§4.4.39 or §4.4B.* categories>
- **Verification:** <how it was confirmed: call path traced and refutation attempted; adversarial second pass (required for security/correctness findings); mechanical re-check of quoted evidence (hygiene findings)>
- **Description:** <1-3 sentences explaining the bug>
- **Reproduction:** <concrete steps or a code citation showing the bug surfaces>
- **Impact:** <what fails / what leaks / who is affected>
- **Suggested fix:** <1-2 lines, not a full diff>
- **Existing test coverage:** <"covered by tests/X.test.ts"> | <"no test covers this">
```

Cross-cutting observations and static-analysis-cannot-verify limitations belong in §2 (Cross-cutting observations) and §6 (Known limitations) respectively, not duplicated in `BUGS.md`.

**Required fields per finding**: file:line, class, verification, description, reproduction, impact, suggested fix, existing test coverage.

**Requirement/design discrepancy handling:** if the issue is a verified documentation/design bug rather than a code bug, still use the same structure, but set `File:` to the governing doc line plus the code line that exposed the discrepancy when available, and set `Class:` to `§4.4.21 User-story success-criteria mismatch` or `§4.4.22 Design-level threat-model gaps`. If the discrepancy needs a maintainer decision, do not record it as a finding yet; ask one question in chat using the §1.0 question shape.

**Testing/CI gap handling:** if the issue is a missing deterministic guardrail, set `File:` to the closest place the guard should live (`package.json`, `.github/workflows/*`, `scripts/ci/*`, `docs/TESTING.md`, or the affected test directory). Set `Class:` to `§4.4.38 Deterministic automated-verification gaps`, `§4.4.39 Clickable-route, form-target, and navigation smoke-test gaps`, `§4.4.40 Script credential-handling and password-leak convention violations`, or `§4.4.41 Secrets, PII, and credential-leak automated-check gaps`. The reproduction should state the exact defect class the missing check would allow, not merely "add more tests."

**Leads (unverified).** `BUGS.md` ends with a `Leads (unverified)` section, the only place a suspicion may be recorded. Admission is narrow: record a lead ONLY when confirming it requires expensive deep verification or can only be tested on staging or production. Verify-first is the rule; ordinary uncertainty is resolved during the sweep, not parked, and speculative noise is never recorded anywhere. Leads carry no B-ID; each states the step that would confirm or refute it. When a lead is verified, promote it into a severity section under the next B-ID.

**Severity calibration** (per `docs/TESTING.md` §3):
- **Catastrophic**: identity compromise, broad PII leak, admin takeover, data loss, irreversible state corruption, auth bypass.
- **High**: role escalation, single-record privacy leak, unauthorized state mutation, anti-enumeration bypass, session theft, silent loss of security-critical notification.
- **Medium**: feature break visible to users, public-record display error, operational-role functionality break.
- **Low**: cosmetic, dead code, redundant guard, suboptimal error message.

### 4.7 Self-verification before delivering

Run these checks. Fix the report (or your scan) if any fail.

1. **Scope filter held**: zero findings against the `legacy_data/` pipeline unless the kickoff prompt included it (migrated data surfacing in deployed routes is fine); any per-run exclusions from the kickoff prompt were honored and recorded in the `BUGS.md` scope note.
2. **No CAPTCHA findings**: zero findings of the shape "this route lacks Turnstile" — that's `unimplemented (by design)`, not a bug.
3. **Cross-check `src/` directly to confirm a finding has not already been remediated in code** before flagging. The §3 table lists only remaining actionable items; landed items are absent because done work is not tracked here.
4. **Per-finding citations**: every file:line cited must still resolve to the claimed code today. Spot-check 3 random "catastrophic" or "high" findings by re-opening the file and confirming.
5. **Suggested fixes are minimal**: each fix is 1-2 lines, not a refactor. If a finding genuinely requires a larger change (e.g. transaction restructuring), flag it as "remediation requires design discussion" and stop short of drafting the plan.
6. **No emojis** in the report.
7. **No dates / "as of today" / sprint tracking** in the report. Bugs are timeless statements about the code as it exists.
8. **No git operations**, no test runs that mutate state, no AWS calls.
9. **Pre-edit audit ran**: every pre-existing `BUGS.md` entry was re-verified against current code (or removed) before any new finding was written.
10. **No guesses recorded as findings**: every finding carries its `Verification:` line and was actually verified; anything not fully verified sits in Leads only if it meets the narrow admission rule (expensive deep verification, or staging/prod-only testability), otherwise it is dropped.
11. **Traceability pass ran**: deployed user stories and deployed technical features were classified, and completed/partial stories were checked against success criteria.
12. **External security sanity check ran**: the final findings were compared against the OWASP/ASVS/NIST/CISA/CWE calibration lenses in §4.3A so obvious classes were not missed.
13. **Question discipline held**: any maintainer question was one question only, included context and a recommended answer, and did not block unrelated review work.
14. **Service-JSDoc sweep ran**: every service file-header/exported-contract JSDoc was checked against actual implementation, side effects, error semantics, dependency shape, and security/privacy invariants.
15. **CI/CD gap sweep ran**: deterministic guardrails in `package.json`, `scripts/`, `.github/workflows/`, config files, and test harnesses were reviewed against §4.4.38 and §5.
16. **Clickable-route coverage was assessed**: the report states whether a systematic link/form/button route-wiring smoke test exists; missing coverage is recorded as a Testing and CI/CD verification gap.

### 4.8 Anti-patterns — what NOT to flag

These tempt false positives. Resist.

- **"This is hard to read"** — not a bug. Maintenance friction without a behavioral failure is out of scope. (A genuine layering divergence is §4.4B, not "hard to read".)
- **"This file is too long"** — out of scope.
- **"This `any` should be typed"** — only if it allows a real runtime miscast. Otherwise out of scope.
- **"This could be a stream"** / **"This could be lazy"** — performance suggestions are out of scope.
- **"This UX could be friendlier"** — design feedback, not a bug. (Form-state preservation on a 422 re-render is a real correctness category, not UX polish — flag that.)
- **"This is missing a unit test"** — an isolated ordinary unit-test gap belongs in §5 and must be specific. Do not inflate vague coverage complaints. However, a missing deterministic guardrail that would catch a broad known defect class is in scope under §4.4.38 / §5, and a missing route-wiring/link/form smoke harness is in scope under §4.4.39.
- **"This adapter has no staging-smoke"**: for HttpReachability / ImageProcessing / VideoTranscoding this is intentional (per `docs/TESTING.md` §7.2), not a gap.
- **"This dev-shortcut is risky"** — the cross-env dev-shortcut surface is operator-side readiness, out of scope for the bug hunt.
- **CAPTCHA** — out of scope (Turnstile deferred by design). **`legacy_data/` pipeline, EO_*, CL_*** — out of scope or not deployed per §1.

Note: stale/bogus comments, code duplication that causes behavioral drift, and "wrong error class" are **no longer** in this exclusion list — they are first-class §4.4B findings. Report them (calibrated to the §4.4B severity guidance), do not suppress them.

### 4.9 Time budget and stopping condition

For the **security/correctness sweep (§4.4)** you are NOT expected to find every possible bug — only the high-leverage ones. Stop when:

- You have rebuilt the deployed surface and completed the scratch deployed-story traceability pass.
- You have audited the deployed-US controllers (including `freestyleController`) + their services + the shared middleware + the 8 adapters + the shared lib helpers.
- You have threat-modeled the high-risk flows named in §4.5.
- You have grep-swept for the expanded bug categories in §4.4.1-§4.4.39.
- You have run the §4.4B design/hygiene secondary sweep across the files read.
- You have spot-verified 3+ catastrophic/high findings.
- The findings file is complete and self-checked per §4.7.

**Quality-over-quantity governs the §4.4 security sweep only**: if its catastrophic/high/medium count climbs past ~30, re-read §4.8 and check whether you are inflating low-value items. The **§4.4B design/hygiene sweep is meant to be exhaustive within its lower-severity band** — report every real divergence you find; those findings live in the `BUGS.md` design-divergence group and are not counted against the security-sweep budget. Calibrate by severity, not by total count.

If you find zero catastrophic findings and fewer than 3 high findings, double-check that you actually swept §4.4.4-§4.4.7 (auth gates, anti-enumeration, CSRF). A zero-catastrophic result is possible if §3 already caught everything, but improbable; spot-verify against the deployed surface before concluding.

### 4.10 After delivering the findings file

End your turn with one short summary message to the maintainer:

- Count by severity for the §4.4 security sweep, plus separate counts for the `BUGS.md` design-divergence + hygiene group and the Testing/CI/CD verification gaps group.
- Two or three highest-leverage findings, one sentence each.
- The bottom of your message offers: "Want me to plan remediation for any specific finding? (One question per turn — name the finding ID.)"

Do NOT auto-proceed to remediation. The review workflow rule mandates findings-only first; the maintainer gates per-finding.

---

## 5. Testing and CI/CD verification improvement punch list

This section is complementary to `docs/TESTING.md`. During a bug hunt, it is a bug to lack an obvious deterministic check when the check is cheap, stable, and would prevent a known class of defects. The goal is to move repeatable verification out of the agent's head and into code that runs automatically.

### 5.1 Classification rule

When a missing check is found, classify it as one of:

- **Must-have pre-merge guard:** should run on every PR before merge because failure means the repo may be unsafe or broken.
- **Fast local guard:** should be available as a pre-commit/pre-push or `npm run verify:*` command for immediate feedback.
- **Nightly/deep guard:** valuable but slower, fuzzier, or broader than a normal PR check.
- **Manual staging gate:** requires staging credentials, live AWS, real DNS/email/payment provider, or production-like infrastructure; record as a Lead if static review cannot verify it.

### 5.2 Baseline deterministic guards to look for

Audit `package.json`, `scripts/`, `.github/workflows/`, `tsconfig*`, ESLint config, Dockerfile, and CI scripts for these checks:

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

### 5.3 Security automation to look for

Use this as the CI/CD and supply-chain checklist. Treat secrets/PII/password-leak automation as mandatory, not optional polish:

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

---

## 6. Known limitations of this document

Limitations that constrain what this skill can verify:

- **No live AWS contact**. The audit does not run `terraform plan`, does not read `/srv/footbag/env` from the staging host, does not query the staging DB schema_version, does not inspect GitHub branch protection / secret scanning state, does not confirm SES sandbox state, does not confirm CloudFront in-flight invalidations.
- **No runtime behavior verification unless the kickoff prompt authorizes it**. The §4 bug-hunt brief is primarily static analysis; it does not normally run the deployed code. A bug that surfaces only under concurrent load (race conditions, lease overlap), real browser behavior, or staging infrastructure may need a Leads entry instead of a verified finding.
- **No browser-level testing**. Browser-level a11y, visual regression, real-browser cookie attribute interaction are out of scope here. They are in `tests/e2e/` (single Playwright spec today) and operator-invoked via the `browser-qa` skill.
- **No deeper read of some test files**. The §5 punch list reflects file structures and a subset of test bodies. Some files evaluated by name + describe/it titles only (e.g. `security.atomicity.test.ts`, `security.edge-cases.test.ts`, `security.sql-injection.test.ts`, `security.xss.test.ts`, `register.race.test.ts`, `email-collision-safety.test.ts`, `member-privacy.routes.test.ts`) may carry additional weaknesses or strengths not yet surfaced here.
- **CAPTCHA and the `legacy_data/` pipeline** are excluded by default (the pipeline can be pulled in only by the kickoff prompt). When CAPTCHA wiring lands, a new audit pass for the CAPTCHA adapter (stub vs live verification) is needed. legacy_data has its own `legacy_data/IMPLEMENTATION_PLAN.md`. The freestyle dictionary surface has its own slice governance under `docs/`, so cross-check the freestyle slice scope before flagging a freestyle finding as drift versus intended-but-unbuilt.

- **CI/CD visibility may be incomplete**. Repo files can show package scripts, local CI scripts, and committed GitHub Actions workflows, but they may not reveal branch protection, required status checks, GitHub secret scanning/push-protection settings, dependency-review enforcement, environment protection rules, artifact retention, log masking, or organization-level policies. If those cannot be verified from the repo, record a narrowly scoped Lead or ask one maintainer question rather than guessing.

- **External standards are calibration lenses, not source-of-truth overrides**. OWASP, ASVS, WSTG, NIST SSDF, CISA Secure by Design, OWASP CI/CD guidance, GitHub CodeQL/dependency-review guidance, OpenSSF Scorecard, and MITRE CWE help prevent blind spots, but the repo's documented source-of-truth order governs project-specific behavior.

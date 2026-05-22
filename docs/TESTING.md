# Footbag Website Modernization Project -- Testing Strategy

**Authority:** This document is the canonical reference for testing strategy on the Footbag platform. It is strategic and additive. Operational testing rules live in `.claude/rules/testing.md` and `tests/CLAUDE.md`; security and privacy policy lives in `docs/DATA_GOVERNANCE.md`; migration testing rules live in `docs/MIGRATION_PLAN.md`. This document layers a risk classification rubric, an adversarial derivation playbook, OWASP ASVS level mapping, a rigor maturity model, a penetration testing strategy, an execution efficiency model, AI-assisted testing governance, accessibility as a first-class layer, and explicit deferrals. Where this document and `.claude/rules/testing.md` overlap, the rules file is operational truth and this document is strategic context; the two must not contradict.

**Scope:** This policy applies to all contributors, maintainers, and AI agents who write, review, derive, or execute tests against the platform.

---

## 1. Scope and authority of this file

This file does not duplicate:

- the edge-case lists, anti-pattern lists, adversarial input list, factories pattern, adapter parity test contracts, or the coverage floor that live in `.claude/rules/testing.md` and `tests/CLAUDE.md`,
- the security and privacy policy in `docs/DATA_GOVERNANCE.md` (member-data visibility taxonomy, anti-enumeration rules, logging hygiene, legacy archive handling, contributor obligations),
- the validation gate and operational readiness rules for migration in `docs/MIGRATION_PLAN.md` §24 and §28.

---

## 2. Philosophy and non-negotiables

The operational non-negotiables (tests verify user-story intent and not accidental current code behavior, tests describe long-term contracts not sprint-scoped probes, coverage thresholds set in `vitest.config.ts` are non-negotiable floors that ratchet up over time, `.skip` and `.todo` and `xit` are forbidden) live in `.claude/rules/testing.md` and `.claude/rules/doc-governance.md` and apply unchanged. The two non-negotiables that belong specifically to this strategic document are stated below.

### 2.1 Privacy and secrets handling are part of the test contract

Every test, every helper, every staging script, every Playwright artifact treats sensitive material as if it could leak. The canonical rule:

- Passwords, remote-login secrets, password-reset tokens, email-verification tokens, signing keys, session secrets, AWS credentials, KMS material, SES credentials, S3 credentials, internal event secrets, and signed URLs are sensitive material.
- These values are supplied to scripts and test helpers via standard input or an approved secret manager. They are never passed as command-line arguments, never echoed to stdout, never logged, never serialized into snapshots, screenshots, traces, videos, Playwright HTML reports, storage state files, or any committed artifact.
- The existing `scripts/install-cwagent-staging.sh` stdin pattern is the reference model. Any new staging or test helper that needs a password must follow it.
- Real member PII does not appear in committed test fixtures, factories, seed data, snapshots, screenshots, traces, or any other committed artifact. Synthetic data only. Where operator-controlled access to real legacy data is genuinely required for migration validation (per `docs/MIGRATION_PLAN.md`), the data is minimized, gitignored, access-controlled, and redacted in output.
- `docs/DATA_GOVERNANCE.md` §9 (Logging and observability hygiene) governs what may and may not appear in application logs; the same prohibition extends to test output, CI logs, and artifact uploads. Test output is treated as potentially public.

### 2.2 The doc applies to humans and AI agents equally

When an AI agent (Claude Code or any other) writes or reviews tests for this codebase, the agent applies this document the same way a human contributor does: read the user story verbatim, extract derived assertions, classify the risk severity, model STRIDE per surface, apply the technique selector, document any skip rationale, produce a traceability entry, and submit for human review. §13 expands these obligations into the AI-assisted testing governance rules.

---

## 3. Risk classification and OWASP ASVS levels

### 3.1 Why classify

Not every test surface deserves the same depth of adversarial coverage. A static legal page does not need concurrency or partial-failure testing; an authentication endpoint does. Classification mechanically determines: which threat categories to model, which adversarial dimensions to derive, which test layers must cover the surface, and which OWASP ASVS verification level applies. Classification is the first decision applied to every new surface and is recorded in the traceability entry described in §4.7.

### 3.2 The rubric

A surface (a user story success criterion, a route, a service method, or a feature area) is classified by four criteria. The highest applicable criterion wins.

**Blast radius.** What is the worst-case consequence of the surface being broken or exploited?

- *Catastrophic:* identity compromise, broad PII leak, admin takeover, data loss, integrity loss across many records, irreversible state corruption.
- *High:* role escalation, single-record privacy leak, unauthorized state mutation, anti-enumeration bypass, session theft.
- *Medium:* feature break visible to users, public-record display error, organizer or club-leader functionality break.
- *Low:* cosmetic break, read-only static surface error, non-essential navigation glitch.

**Data sensitivity.** What data does the surface read, write, expose, or accept?

- *Catastrophic:* PII at rest or in transit, secrets, signing material, raw legacy member data.
- *High:* member contact fields, member-only profile data, role-scoped operational rosters, audit logs.
- *Medium:* public historical record data, official event results, HoF and BAP entries, world records (per `docs/DATA_GOVERNANCE.md` §5).
- *Low:* static content, public legal or marketing copy.

**Reversibility.** If the surface fails or is exploited, can the damage be undone?

- *Catastrophic:* irreversible PII leak, irreversible record corruption, leaked secret rotation cost.
- *High:* requires manual remediation; user trust damage.
- *Medium:* reversible with a deploy or a data fix.
- *Low:* fixed by reload or next deploy with no lasting effect.

**Likelihood.** How probable is the failure or attack to occur or be attempted?

- *High:* internet-exposed surface, user-controlled input, migration edge case with real legacy data variance.
- *Medium:* authenticated-user input, role-scoped operational surface.
- *Low:* internal-only, admin-only with hardened access, static content.

The surface's severity is the highest criterion result. A surface that is "Medium blast radius, Catastrophic data sensitivity, Medium reversibility, High likelihood" is Catastrophic.

### 3.3 Mapping to the DATA_GOVERNANCE.md member-data taxonomy

The member-data visibility taxonomy in `docs/DATA_GOVERNANCE.md` §4 maps onto the risk classification:

- *Sensitivity 1 (public official historical record):* Medium risk baseline. Errors embarrass and can corrupt the public record but do not leak current-member PII. Higher when the surface displays data derived from current members.
- *Sensitivity 2 (authenticated current-member lookup):* High risk. Anti-enumeration, PII leak via search results, and scraping resistance are all in scope.
- *Sensitivity 3 (role-scoped operational):* High risk. Role escalation, unauthorized export, contact-field leak.
- *Sensitivity 4 (internal or admin):* Catastrophic. Broad PII access, admin compromise, irreversible governance actions.
- *Sensitivity 5 (archived member-only legacy):* High to Catastrophic. Contains raw legacy member data including email addresses; exposure is irreversible.

Authentication, registration, email verification, password reset, legacy claim, online registration, and payment surfaces are Catastrophic regardless of which DATA_GOVERNANCE sensitivity level they live in, because failure on these surfaces cascades into every other surface.

### 3.4 OWASP ASVS levels per risk severity

OWASP ASVS (Application Security Verification Standard) defines three security verification levels:

- *L1:* basic verification. Suitable for surfaces with no sensitive data and low blast radius.
- *L2:* standard verification. The baseline for any application with authenticated users, PII, or sensitive business logic.
- *L3:* high-value verification. Required for surfaces handling significant secrets, regulated data, or high-trust operations.

Mapping to risk severity:

- *Catastrophic surfaces* satisfy ASVS L3 for the categories that apply (authentication, session management, access control, validation, error handling, data protection, cryptography, communication, logging, configuration).
- *High-risk surfaces* satisfy ASVS L2 across applicable categories.
- *Medium-risk surfaces* satisfy ASVS L1 across applicable categories.
- *Low-risk surfaces* satisfy ASVS L1 for the categories that materially apply (typically validation and error handling), with other categories explicitly skipped via the rationale mechanism in §4.6.

ASVS levels apply to the security verification dimension of the playbook, not to functional correctness. Functional correctness is governed by user story success criteria and the technique selector. ASVS adds the security-specific verification depth on top.

---

## 4. The adversarial derivation playbook

This is the operational core of the document. Every test for a new or changed surface is derived by walking these steps in order. The output is a traceability entry that links intent to surface to test, with any skipped dimension explicitly justified.

### 4.1 Anchor: user story success criterion plus route or service expansion

Every test traces upward to a user story success criterion in `docs/USER_STORIES.md` (identified by its story header, for example `M_Login`, `V_Browse_Clubs`, `A_Create_Vote`) and downward to the specific route(s) and service method(s) it exercises.

If the surface has no corresponding user story success criterion, stop. Either the user story is missing a success criterion (write the missing criterion first, then derive the test), or the surface is unintended scope (remove the surface, do not derive tests against it).

For surfaces in the legacy data pipeline that have no direct user story coverage, anchor on `docs/MIGRATION_PLAN.md` validation gates instead.

### 4.2 Derived assertion extraction

Success criteria in `docs/USER_STORIES.md` are written as prose bullets, not numbered assertions. Before any threat modeling or dimension lens applies, the prose is decomposed into ordinal assertions A1, A2, A3, and so on; each one a discrete testable claim.

Decomposition rules:

- Each independent claim in a success criterion bullet becomes a separate assertion. A bullet that says "rate-limited, identical UX for valid and invalid credentials, and audit-logged on threshold crossing" contains three assertions.
- Each enumeration-safety claim is its own assertion (timing equivalence, response-body equivalence, status-code equivalence are three separate assertions).
- Each administrator-configurable parameter (rate-limit threshold, token TTL) is an assertion of "configurable" plus a separate assertion of "safe default applies when unconfigured".
- Each negative claim ("does not appear in", "is never persisted", "no indication is given") is an assertion of the negative; it requires a test that proves the negative.
- Each cross-reference to global behavior ("follows the same validation and session security assumptions as Global Behaviors and Constraints") is expanded inline by reading the referenced section, not left as a forward reference.

The derived assertion list is the input to the next step. Skipping derivation and going directly to "write tests for M_Login" is the failure mode this section exists to prevent.

### 4.3 STRIDE per surface

For each route and service method linked to the success criterion, model the six STRIDE threat categories and mark which apply. STRIDE is the Microsoft threat-modeling taxonomy: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege.

- *Spoofing:* the threat that an attacker impersonates a legitimate user, role, or session. Applies whenever authentication, session, or identity is in scope.
- *Tampering:* the threat that an attacker modifies data, requests, or responses in transit or at rest. Applies whenever the surface accepts input, signs material, or stores state.
- *Repudiation:* the threat that a user denies an action they performed, or that an action cannot be reliably traced. Applies whenever the surface performs auditable actions (admin actions, role grants, exports, governance actions).
- *Information Disclosure:* the threat that the surface leaks data it should not (PII, secrets, existence of records, internal structure). Applies whenever the surface returns content, raises errors, or logs.
- *Denial of Service:* the threat that the surface can be made unavailable or unresponsive. Applies whenever the surface accepts arbitrary input volume, performs unbounded work, or depends on rate-limit enforcement.
- *Elevation of Privilege:* the threat that an attacker gains a role or capability they should not have. Applies whenever the surface has role-based access control, layered authorization, or admin paths.

For each STRIDE category, the surface entry records one of: applicable with one-line rationale, not applicable with one-line rationale. "Not applicable" is allowed; "no entry" is not. The entry lives in the test file header or the PR description and is part of the traceability output described in §4.7.

### 4.4 Technique selector

Once the STRIDE table is filled, each applicable threat category and each derived assertion is matched to one or more derivation techniques:

- *Equivalence partitioning plus boundary value analysis* for input-shaped threats (Tampering, malicious input). Partition the input space into equivalence classes (valid, malformed, oversized, wrong type, unicode mischief, injection attempt). Test one representative per class plus the boundary between classes (empty, single, max length, max plus one, unicode normalization edges, timezone edges, leap year, NULL). Do not enumerate within a class; one representative is sufficient.
- *Pairwise or combinatorial coverage* for matrix-shaped threats (Spoofing, Elevation of Privilege). Where the surface depends on role times route times method times auth-state (or a similar multi-dimensional matrix), use all-pairs coverage rather than full Cartesian product. All-pairs catches the large majority of defects at O(N squared) rather than O(N to the fourth) cost. Tool: any pairwise generator (PICT, ACTS, or equivalent), or hand-derive for small matrices.
- *Property-based testing* for invariant-shaped threats (Information Disclosure invariants, idempotency, CSRF presence on every state-changing verb). Where the claim is "for all inputs, property P holds", state P as a property and let the property tester generate cases. Target tool: fast-check (see §15.3 tooling appendix). For finite-enumerable input spaces (the route table, the verb set), a scenario test that iterates the enumeration via a shared helper satisfies the property-style assertion at Rigor 3; the fast-check formulation is the Rigor 4 promotion.
- *Scenario tests with explicit state transitions* for state-machine-shaped threats (Repudiation, partial failure, concurrency). Where the surface has state machines (multi-step wizard, lifecycle of a token, audit-log emission on state-changing paths), write scenario tests that drive the state machine through transitions and assert at each step. Add property tests for invariants that must hold across all transitions ("audit log emits on every state-changing path").
- *Selective fuzzing* for parsers, validators, and complex input handlers. Targeted at the specific module, not the whole surface.
- *Rate-limit and resource-bound assertions* for Denial of Service threats. Assert that the rate limit fires at the configured threshold, that resource bounds (request size, response size, worker concurrency) are enforced. Load testing is deferred (§14); this dimension is configuration verification, not throughput.

The technique selector is mechanical: map an applicable threat to its technique, then apply the technique to the derived assertions in scope. The derivation entry records which technique was applied to which assertion or STRIDE category.

### 4.5 Baseline coverage from operational rules

`.claude/rules/testing.md` already enumerates the per-route and per-service-method baseline coverage (happy path, auth gate, authz gate, not-found, invalid input, draft and unpublished, route ordering, anti-enumeration, rate-limit, CSRF, shape, business rules, atomicity, idempotency, errors, boundaries) and the baseline adversarial list (oversized payloads, unicode mischief, SQL injection, XSS, timing attacks, race conditions, token replay). The derivation playbook augments these baselines per surface; it does not replace them. A test for a new route still satisfies the baseline list before the STRIDE-driven derivation adds surface-specific cases.

### 4.6 Skip discipline

A dimension or STRIDE category may be skipped only when:

- the STRIDE per surface entry marks that category "not applicable" with rationale, **and**
- the skip rationale appears in the test file or derivation trail at the skip point, referencing the STRIDE entry.

"We did not have time" is not a valid skip rationale. "Repudiation not applicable: this surface is read-only with no auditable action" is.

Skip rationales are reviewed during human review of the test PR (§13) and re-validated when the surface changes. If a previously skipped category becomes applicable (because the surface now accepts input, or now records audit events, or now serves member-only content), the test PR that introduces the new behavior must also introduce the corresponding tests.

### 4.7 Output: the traceability entry

The derivation produces an entry of the following shape, recorded in test-file header comments, the PR description, or the traceability template in §15.1:

- *US ID:* the user story header (for example `M_Login`).
- *Derived assertions:* A1, A2, ..., An, each a one-line statement of the discrete testable claim.
- *Routes:* the route paths exercised.
- *Service methods:* the service methods exercised.
- *STRIDE applicability:* per category, applicable or not, with a one-line rationale.
- *Technique per assertion:* which technique applies to each derived assertion.
- *Risk severity:* one of catastrophic, high, medium, low, per §3.
- *ASVS level:* L1, L2, or L3, per §3.4.
- *Test files:* the test files that implement the derivation.
- *Rigor level:* current level per §12, with target.
- *Tags:* `@smoke`, `@security`, `@a11y`, `@migration`, `@quarantined`, as applicable per §11.

### 4.8 Worked example: M_Login

This walks the playbook end to end for `M_Login` from `docs/USER_STORIES.md` (the login user story for verified members: email plus password, rate-limited, CAPTCHA-gated, enumeration-safe, session cookie issuance, privacy-first audit log).

**Anchor.** US ID: `M_Login`. Routes: `POST /login` (form submission), `GET /login` (form render). Service methods: the identity-access service login method, the session-issuance service, the rate-limit middleware, the CAPTCHA verification adapter, the audit-log service.

**Derived assertion extraction.** The seven prose bullets in M_Login's Success Criteria decompose into the following assertions:

- *A1:* unverified members cannot complete login; the failure UX is identical to wrong-password failure (enumeration-safe).
- *A2:* login submissions are rate-limited by a fixed-window limiter keyed by IP plus account identifier; thresholds, windows, and cooldowns are administrator-configurable with safe defaults applied when unconfigured.
- *A3a:* login submissions are gated by a server-side Cloudflare Turnstile CAPTCHA verification.
- *A3b:* the CAPTCHA gate fires before any database read.
- *A3c:* the CAPTCHA gate has identical UX whether credentials are valid, invalid, or unverified.
- *A4:* the failed-login error message is exactly "Invalid email or password. Please try again." for every failure mode (enumeration-safe).
- *A5:* successful login produces a session cookie that is HttpOnly, Secure, and SameSite=Lax.
- *A6:* successful login produces a visible success confirmation.
- *A7a:* individual failed login attempts are not persisted to the audit log.
- *A7b:* when the rate-limit threshold is crossed, a single audit log entry is created per account identifier (no IP address stored).

**Risk severity and ASVS level.** Catastrophic. Authentication is the gate to every other surface. ASVS L3 applies for the categories: V2 Authentication, V3 Session Management, V4 Access Control, V5 Validation, V7 Error Handling and Logging, V8 Data Protection, V14 Configuration.

**STRIDE per surface (POST /login).**

- *Spoofing:* applicable. Credential stuffing, password guessing, session-cookie forgery, CAPTCHA bypass.
- *Tampering:* applicable. Malformed form input, oversized payloads, unicode normalization in email, header injection.
- *Repudiation:* applicable. The audit log must record threshold crossings deterministically per A7b; the absence of audit entries on individual failures per A7a must also hold and is itself an assertion to prove.
- *Information Disclosure:* applicable. Enumeration via differential responses, timing oracles, error-message content, response-header content, audit-log inspection by an attacker.
- *Denial of Service:* applicable. Rate-limit failures, CAPTCHA bypass enabling brute force, unbounded request size.
- *Elevation of Privilege:* applicable. Successful login issues a session that grants member-tier capabilities; session-cookie attributes (HttpOnly, Secure, SameSite=Lax) constrain post-login attack paths.

**Technique selector per assertion.**

- *A1 (verification gate, enumeration-safe):* property test on enumeration safety (for all input classes (verified, unverified, nonexistent), response body, status code, and timing are equivalent within tolerance), plus scenario tests for the three explicit cases.
- *A2 (rate limit):* boundary value analysis on the threshold (threshold minus one, threshold, threshold plus one). Configuration test for administrator-configurable parameters with safe-default fall-through. Pairwise on (IP, account identifier) keying.
- *A3a, A3b, A3c (CAPTCHA gate):* scenario test for CAPTCHA verification call order (CAPTCHA before DB read) using request-trace assertions. Equivalence partition on valid, invalid, missing CAPTCHA token. The enumeration-safety property test extends to A3c.
- *A4 (error message exactness):* assertion on the literal string for every failure mode (wrong password, unknown email, unverified email).
- *A5 (cookie attributes):* assertion on the Set-Cookie header attributes after successful login. Property test for "session cookie always has all three attributes" across login paths.
- *A6 (success confirmation):* response-body or redirect-target assertion on successful login.
- *A7a, A7b (audit log behavior):* scenario tests that drive failure counts up to and across the threshold and assert audit-log row counts and content (no IP, account identifier only).

**STRIDE category coverage check.**

- *Spoofing:* covered by A1, A3, A4 (enumeration safety) plus a credential-stuffing scenario at the rate-limit boundary.
- *Tampering:* covered by equivalence partitioning on form input plus the unicode and oversized-payload cases from the baseline adversarial list in `.claude/rules/testing.md`.
- *Repudiation:* covered by A7a and A7b.
- *Information Disclosure:* covered by A1, A3c, A4 enumeration-safety property tests plus a timing-equivalence assertion.
- *Denial of Service:* covered by A2 rate-limit boundary plus a request-size cap assertion (configuration verification, not load).
- *Elevation of Privilege:* covered by A5 cookie attribute assertions plus a post-login authorization check that the issued session matches the authenticated member identity.

**Skip rationales.** None for this surface; all six STRIDE categories apply.

**Test layer placement.**

- A1, A3, A4, A5, A6, A7a, A7b: integration tests in `tests/integration/login.routes.test.ts` (route plus service plus real SQLite).
- A2: integration tests for the boundary plus a unit test on the rate-limit middleware configuration parser.
- Enumeration-safety property tests: integration tests using fast-check (per §15.3.1).
- The browser session-cookie path: one lightweight Playwright test tagged `@security` asserting cookie attributes after a real-browser login.
- Pentest probe for credential stuffing against the CAPTCHA and rate-limit defenses: operator-invoked via the `browser-qa` skill when targeted exploration is needed; ZAP baseline scan covers the automated layer.

**Rigor level.** Target rigor 5 (mutation-validated; see §12.2). The rigor reached by a given PR is recorded in the traceability entry; the IP "Testing rigor by surface" section (§12.4) tracks the gap until target rigor is met.

**Tags.** `@security` for the integration tests.

This entry, recorded in the test file headers and the PR description, becomes the traceability artifact that future contributors and reviewers consult when the surface changes.

---

## 5. Test layers and what belongs in each

This document does not redefine the operational test conventions in `tests/CLAUDE.md` or the testing mandate in `.claude/rules/testing.md`. It defines the strategic layering and the belongs-where rules that decide which layer a derived assertion lands in.

### 5.1 Unit tests

Vitest, no DB, no HTTP, no I/O. Tests exported pure functions, validators, parsers, formatters, normalizers, and policy functions. The fast loop. Coverage thresholds (set in `vitest.config.ts`) apply.

Belongs:

- Slug, href, and URL builders, formatters
- Validators with no DB dependency
- Parsers and serializers
- Policy and tiering functions

Does not belong:

- Tests that exercise SQL
- Tests that exercise HTTP routes
- Tests that boot the Express app or middleware chain

### 5.2 Integration tests

Vitest plus Supertest plus better-sqlite3 against a real SQLite test DB per file (`tests/integration/`). Exercises real route, middleware, service, and DB paths. No mocks. The default home for derived assertions that exercise routes, services, schemas, or persistence.

Belongs:

- Route plus controller plus service plus DB integration
- Anti-enumeration assertions
- Audit-log emission assertions
- Rate-limit boundary assertions
- Adapter parity (boot-time config tests, interface parity tests)

Does not belong:

- Browser-only assertions (cookie attribute interaction with the browser, redirect chains visible only in a real browser)
- Staging-AWS integration (SES, S3, KMS live)

### 5.3 db-load smoke

The CI job `db-load-smoke` (in `.github/workflows/ci.yml`) applies the schema and runs the legacy_data loader pipeline against fixed fixtures, asserting row counts and shape. The canonical regression gate for the historical-data pipeline.

Belongs:

- Schema-load smoke
- Loader pipeline row-count and shape assertions
- Migration regression cases tied to `docs/MIGRATION_PLAN.md` §24 validation gates

Does not belong:

- Tests requiring application HTTP layer
- Tests that mutate live data

### 5.4 Staging smoke

`tests/smoke/`, gated behind `RUN_STAGING_SMOKE=1`, excluded from default `npm test`. Runs against real staging AWS (KMS, SES, S3, SSM) via the assumed-role chain configured by `scripts/test-smoke.sh`. The canonical regression gate for staging-AWS adapter parity.

Belongs:

- Adapter staging-smoke (one per adapter, per `.claude/rules/testing.md` adapter-parity rule)
- Health and readiness checks against staging
- Identity, KMS, SES, S3 round-trip verification

Does not belong:

- Tests that mutate persistent staging data unless explicitly idempotent and audited
- Tests that depend on production data

### 5.5 E2E lightweight (Playwright)

`tests/e2e/`, Playwright config at `tests/playwright.config.ts`. Real browser. Single worker, chromium, headless. Test set is small and business-critical. Tests may carry `@smoke` (also runs in the post-deploy gate), `@security`, `@a11y`, or `@migration` tags per §6.3.

Belongs:

- Real-browser session and cookie behavior
- CSRF-protected form submission where browser semantics matter
- Onboarding, club-cleanup, and legacy-claim wizard happy paths
- Avatar upload and media upload round-trips
- Public navigation confidence (small sample, not exhaustive)
- Role-sensitive UI behavior smoke

Does not belong:

- Every service branch
- Every validation edge case
- Every policy function (these are unit and integration territory)
- Exhaustive navigation crawls (heavyweight)

### 5.6 Security regression

A class, not a folder. Lives wherever the derived assertion most efficiently lives (unit, integration, e2e, smoke). Tagged `@security`. Includes:

- Anti-enumeration property tests
- Auth-gate and role-gate enforcement assertions
- CSRF presence on every state-changing verb (scenario test reused per state-changing route via shared helper; property-test formulation is the Rigor 4 promotion)
- Rate-limit boundary assertions
- Session cookie attribute assertions
- Secret and PII leakage regression tests (see §10)
- Testing-shortcut regression tests (§7.5)

Cross-cutting regression classes (cookie attributes, CSRF presence on every state-changing verb, anti-enumeration response equivalence) are implemented via shared assertion helpers in `tests/fixtures/` that the route's own test imports and invokes. The shared-helper shape keeps the per-route assertion cheap (one line per route) while preserving the property: a future refactor that mounts a sub-router outside the perimeter, or changes the cookie-issuance helper to drop a flag, fails the route's own test rather than only a centralized middleware test.

### 5.7 Testing-shortcut regression tests

A named sub-class of security regression. Any testing shortcut (a dev-or-staging-only code path that bypasses production behavior to enable tests, such as login-without-email, persona reset, token surfacing, or internal-event injection) is governed by the dev-shortcuts pattern (§7.5) and must land with the canonical required test set (§7.5.4).

### 5.8 Penetration testing

See §9.

---

## 6. Playwright strategy

### 6.1 One suite, with operator escape valve

Playwright is the project's browser automation toolchain. It serves one strategically scoped purpose: a lightweight suite that runs on every CI PR (small, fast, business-critical). The configuration file is `tests/playwright.config.ts`. Any browser-based test work beyond the lightweight suite (multi-browser parity, full navigation crawls, attack-flow exploration, role-matrix walkthroughs, multi-viewport regression, deeper accessibility audit beyond the automated `@a11y` coverage) is operator-invoked via the `browser-qa` skill (`.claude/skills/browser-qa/SKILL.md`), not via a standing test suite.

### 6.2 Lightweight suite (the only Playwright suite)

The default and only Playwright suite. Boot characteristics:

- `testDir`: `tests/e2e/`
- `fullyParallel: false`; `workers: 1` (SQLite WAL serialization)
- Chromium-only
- `headless: true`
- 1280 by 800 viewport (desktop default)
- timeout 30s; expect 3s; action 5s; navigation 8s
- `trace: 'retain-on-failure'`; `screenshot: 'only-on-failure'`; no video
- reporter: `list` (local), `[['list'], ['github']]` (CI)
- webServer: `bash scripts/e2e/start-stack.sh`, healthcheck `/health/ready`, 60s boot

Belongs in the lightweight suite:

- One representative happy path per business-critical surface (login, registration, email verification, password reset, legacy claim, avatar upload, club cleanup, organizer flow, admin spot check)
- Real-browser cookie attribute assertions (HttpOnly, Secure, SameSite=Lax)
- Single-worker-safe wizard flows
- Onboarding, club-cleanup, and legacy-claim wizard happy paths plus the one negative case per wizard that only a browser can reveal
- Accessibility automated checks via `@axe-core/playwright` on business-critical surfaces, tagged `@a11y` (per §14.1)

Does not belong:

- Every business-rule branch (unit or integration)
- Full navigation crawls (operator-invoked via browser-qa)
- Multi-browser parity (operator-invoked via browser-qa when needed)
- Pentest attack flows (operator-invoked via browser-qa)
- Deeper accessibility audits beyond automated `@a11y` coverage (operator-invoked via browser-qa or manual review)

### 6.3 Tag taxonomy

A test may carry zero or more tags. Tags are how gates select within the suite (§11). Canonical tags:

- `@smoke`. Subset that also runs in the post-deploy staging smoke gate. Smallest, fastest, read-only-ish.
- `@security`. Security regression sub-class.
- `@a11y`. Accessibility regression via axe-core; runs on every PR against business-critical surfaces.
- `@migration`. Migration and onboarding regression. May live in integration or e2e; cuts across.
- `@quarantined`. Time-bounded flake quarantine; see §11.3.

### 6.4 Artifact privacy

Authenticated Playwright artifacts contain potentially sensitive material (session cookies, member display names, navigation paths, error content). The defaults (trace retain-on-failure, screenshot only-on-failure, no video) minimize unnecessary capture. Beyond the defaults:

- Storage state files (Playwright `storageState`) are sensitive and never committed. The `.gitignore` covers `tests/test-results/` and any `*.storageState.json` location. Generated storage state belongs in temp directories, deleted at suite end.
- Traces, screenshots, and HTML reports produced by failures are treated as potentially containing PII or secrets. CI upload of these artifacts, where configured, uses access-restricted storage (private artifact retention, not public links). Public CI logs do not embed the artifact path with a public URL.
- Tests that drive the `M_Login` flow do not include the password literal in command-line arguments, in `console.log` debug, or in screenshot-captured form fields. Password fields are typed via Playwright's `.fill()` which is not captured by trace inputs.

### 6.5 Auth pattern for E2E

Lightweight integration with auth uses the existing `tests/fixtures/personas.ts` helper, which composes a member, tier grant, historical-person link, and JWT into a `Persona` and exports the cookies via `context.addCookies()`. Staging tests use the dev-shortcuts autologin (§7.5.1) where appropriate, never a fresh login chain that depends on receiving an email.

---

## 7. Environment parity, staging, and personas

### 7.1 The four environments

The platform targets four environments. Each has parity contracts that tests verify.

- *Local development.* Runs on the maintainer workstation via `./run_dev.sh`. SQLite at `./database/footbag.db`. Local stub adapters (JWT signing stub, SES outbox stub, media storage local-disk stub). The dev-shortcuts subsystem is active under `FOOTBAG_ENV=development`.
- *CI.* Runs every test job (typecheck, conventions, unit, integration, db-load smoke, e2e, terraform) against ephemeral SQLite. No real AWS. Adapters are the same local stubs the workstation uses.
- *Staging.* The real AWS staging account (KMS, SES, S3, SSM, Lightsail). The dev-shortcuts subsystem is active under `FOOTBAG_ENV=staging`. The staging smoke suite (`tests/smoke/`) runs here, gated by `RUN_STAGING_SMOKE=1`.
- *Production.* The real AWS production account. The dev-shortcuts subsystem is absent from the production build (Dockerfile `dist-rm` strips the subtree; boot-time guards in `src/config/env.ts` fail-fast if any `FOOTBAG_DEV_*` env var is set; `scripts/audit-dev-shortcuts.sh` returns zero against the production DB).

### 7.2 Adapter parity tests are mandatory

The three-test contract from `.claude/rules/testing.md` applies to every adapter (`JwtSigningAdapter`, `SesAdapter`, `MediaStorageAdapter`, `ImageProcessingAdapter`, `VideoTranscodingAdapter`, `SecretsAdapter`, `SafeBrowsingAdapter`, `HttpReachabilityAdapter`, and any future adapter):

- Boot-time config test (`tests/unit/env-config.test.ts`): module-load fails fast when required prod-mode env vars are absent.
- Interface parity test (`tests/integration/adapter-parity.test.ts`): both implementations satisfy the TypeScript interface with identical observable output structure, exercised via an injected fake client.
- Staging-smoke test (`tests/smoke/`): hits real staging AWS via the assumed-role chain, gated by `RUN_STAGING_SMOKE=1`.

These tests describe permanent contracts. They are not sprint-scoped.

### 7.3 Staging smoke entry point

`scripts/test-smoke.sh` is the canonical entry. It reads terraform output for environment-specific values (KMS key ARN, SES sender identity, S3 bucket name), exports the staging AWS profile and region, fetches operator-supplied SSM secrets via the assumed-role chain, and execs `vitest run tests/smoke/`. The operator runs it locally or from the staging host after any change to staging AWS runtime identity, KMS keys, SES identities, or IAM policies the app depends on.

The script does not accept passwords or secrets as command-line arguments. Secrets that the smoke suite needs are read from SSM via the assumed-role chain or piped via stdin from approved secret-manager flows.

### 7.4 Staging personas: model and reset

Staging needs synthetic personas that cover the role matrix (anonymous, registered-unverified, verified Tier 0, Tier 1, Tier 2, Tier 3, club leader, country leader, event organizer, curator, legacy claimant with high/medium/low/no-match outcomes, name-change and alias edge cases, club-affiliation-cleanup subjects). The personas exist for routine Playwright tests against staging and for operator-driven manual exploration of role-conditional UI.

Persona contract:

- Synthetic identities. Display names and email addresses are obviously test data (prefix `staging-test-` or equivalent), never resembling real member data.
- Verified-status pre-seeded. Routine login does not depend on receiving an email.
- Stored credentials. Passwords live in an approved secret channel (gitignored `.local/staging-personas.json` mirroring the dev-admin-seed pattern, or AWS Secrets Manager). Never committed.
- Tier and role grants. Assigned through the dev-shortcuts seed pipeline (`reason_code` carries `dev_admin_seed.admin_tier2` and similar markers) so cutover audit catches them.

Reset semantics:

- An operator-runnable reset that re-creates the persona set from the gitignored or secret-manager seed file.
- The reset uses `bash scripts/manage-dev-admin-seed.sh` (or an equivalent extension), which pipes JSON via stdin per the existing pattern. No password as command-line argument.

### 7.5 Testing shortcuts follow the dev-shortcuts pattern

The dev-shortcuts subsystem at `src/dev-shortcuts/` is the canonical model for any testing shortcut. A testing shortcut is any dev-or-staging-only code path that bypasses production behavior to enable tests (autologin for Playwright sessions, persona reset, token surfacing for email-verification lifecycle tests, internal-event injection for image-worker tests, legacy-claim bypass for migration regression tests, and so on).

No testing shortcut lives outside `src/dev-shortcuts/`. A test-only HTTP endpoint, a test-only middleware bypass, or a test-only persona-issue helper joins the existing umbrella. The umbrella exists so the entire shortcut surface can be removed in one operation at production cutover; a parallel test-login subsystem defeats that property.

#### 7.5.1 Existing umbrella shortcuts

The dev-shortcuts subsystem already exposes mechanisms for autologin, skip-claim-email, dev-admin seed, register-allowlist bootstrap, and tier2 invariant repair (see `src/dev-shortcuts/README.md` for env-var triggers and behavior). Testing shortcuts may build on these directly. Each carries audit-marker provenance (`reason_code LIKE 'dev_admin_%'`, `action_type LIKE 'grant_admin_dev_%'`, `created_by LIKE 'dev-shortcuts/%'`).

#### 7.5.2 Required properties of a new testing shortcut

A new testing shortcut added to the umbrella satisfies all of the following:

- Lives in `src/dev-shortcuts/` as part of the self-contained subtree.
- Is triggered only by a `FOOTBAG_DEV_*` env var or a CLI flag, never by a request from a real browser session.
- Carries an audit marker prefix that the cutover audit script detects (`reason_code`, `action_type`, and `created_by` all under the `dev_admin_*`, `grant_admin_dev_*`, and `dev-shortcuts/*` namespaces respectively).
- Has a boot-time fail-fast guard in `src/config/env.ts` that refuses to start when its trigger is set under `FOOTBAG_ENV=production`.
- Has a `CUTOVER-REMOVE` marker comment at every callsite outside `src/dev-shortcuts/`.
- Is removed from production builds by the Dockerfile `dist-rm` rule.
- Lands with the canonical required test set (§7.5.4).
- Is removable from the codebase in one operation at cutover (per the cutover-removal procedure in `src/dev-shortcuts/README.md`).
- Documented in the dev-shortcuts README umbrella listing.

#### 7.5.3 Secret containment for testing shortcuts

Secret literals used by testing shortcuts (a seeded persona password, any test-only signing key) live in `src/dev-shortcuts/seedConfig.ts` as the single source. The password-leak regression test (§7.5.4) enforces that the literal appears in exactly one source file and that deploy scripts, helper scripts, and stored hashes do not embed it. Deploy chains pipe seed JSON via stdin; they never pass the password literal as an argument.

#### 7.5.4 Canonical required test set for any testing shortcut

A new testing shortcut lands with all of:

- *env-guard test.* The module fails fast on import when `FOOTBAG_ENV` is not in `{development, staging}`. Model: `tests/integration/devAdminSeed.envGuard.test.ts`.
- *production-guard test.* The shortcut's runtime entry points refuse to operate under `FOOTBAG_ENV=production`. Model: `tests/integration/dev-shortcuts.production-guard.test.ts`.
- *secret-leak test.* If the shortcut introduces a literal secret, that literal appears in exactly one source file (the shortcut's `seedConfig.ts`), is not embedded in seed scripts as a string, is not embedded in deploy scripts, and is stored only as a hash in the DB. Model: `tests/integration/devAdminSeed.passwordLeak.test.ts`.
- *schema-coupling test.* The shortcut's audit markers (`reason_code`, `action_type`, `created_by`) exist in schema and are populated correctly on every persisted side effect. Model: `tests/integration/devAdminSeed.schemaCoupling.test.ts`.
- *flag-off test.* The shortcut does nothing when its trigger env var or flag is unset. Model: `tests/integration/dev-shortcuts.flag-off.test.ts`.
- *repair and idempotency test.* Re-running the shortcut against already-seeded rows is safe and idempotent. Model: `tests/integration/dev-shortcuts.repair.test.ts`.
- *dockerfile-strip test.* The production Dockerfile `dist-rm` rule removes the shortcut subtree from the production image. Model: `tests/unit/dockerfile-dev-shortcuts-strip.test.ts`.
- *initial-admins parity test* where applicable. Model: `tests/unit/devShortcuts.initialAdminEmails.test.ts`.

These tests describe long-term contracts on the shortcut's safety properties, not sprint-scoped probes. They are tagged `@security`.

### 7.6 No standalone test-only HTTP endpoints

A test-only HTTP endpoint (a hypothetical `/__test/login` or `/__test/seed`) is not introduced. The existing autologin and dev-admin-seed mechanisms cover the use cases without exposing a request-time bypass surface. If a future test scenario genuinely requires a request-time bypass, the bypass is added to the dev-shortcuts umbrella with all properties from §7.5.2 and §7.5.4. It is not added as a route under `src/routes/`.

---

## 8. Migration and onboarding testing

The validation gates in `docs/MIGRATION_PLAN.md` §24 and the operational readiness rules in `docs/MIGRATION_PLAN.md` §28 are canonical for migration and onboarding. This section adds the playbook framing for deriving migration tests and the constraints that bind to the canonical content there.

### 8.1 The migration anchor

For surfaces in the legacy data pipeline that have no direct user story success criterion, anchor on the relevant `docs/MIGRATION_PLAN.md` validation gate instead of a `docs/USER_STORIES.md` entry. The derived assertion extraction step still applies (the validation-gate text decomposes into discrete ordinal assertions before STRIDE and dimension lenses apply).

### 8.2 Identity claim and confidence levels

Legacy-member identity claim has three confidence outcomes (high, medium, low) plus the no-match case (per `docs/MIGRATION_PLAN.md`). Each outcome class becomes a class of derived assertions:

- *High confidence:* claim completes; legacy-person link is established; historical record links carry over to the member; subsequent visits use the active member account. Derived assertions cover positive flow plus the negative ("no claim is silently accepted on weak match").
- *Medium confidence:* claim is queued for manual review; user sees an enumeration-safe message; admin queue receives the entry. Derived assertions cover the queueing plus the absence of any indication to the user that disambiguation is in progress.
- *Low confidence and no match:* claim is rejected; user sees an enumeration-safe message; no link is created; no information about candidate identities is leaked.
- *Name-change and alias edge cases:* historical records held under a different name resolve correctly; aliases are matched per the canonical alias table; no false-positive links cross alias boundaries.

### 8.3 Club affiliation and cleanup

Club affiliation tests cover the cases enumerated in `docs/MIGRATION_PLAN.md` (legacy affiliations that point to known clubs, legacy affiliations that point to ambiguous clubs, members who appear in multiple clubs, members who appear in no clubs after import). Club cleanup is a state-machine surface; tests are scenario-based per §4.4 with property tests for invariants ("a member is always a member of zero or more confirmed clubs at any point in the cleanup state machine").

### 8.4 Loader pipeline regression

The db-load smoke CI job (§5.3) runs the loader pipeline against fixed fixtures on every CI build. Row-count and shape assertions catch loader regressions. The fixtures themselves are synthetic. Real legacy data is never committed as test fixtures.

### 8.5 Synthetic legacy data only

Migration tests use synthetic legacy records that model edge cases without exposing real personal data. Where operator-controlled validation requires access to real legacy data (per `docs/MIGRATION_PLAN.md`), the data is minimized, gitignored, access-controlled, and redacted in test output. Raw legacy PII is never committed as test fixtures, never appears in snapshots, screenshots, or traces, and never appears in CI artifacts.

### 8.6 Migration tests verify the migration plan, not the loader

A loader-pipeline test that asserts only what the loader implementation happens to do is insufficient if the migration plan says the loader should do something different. The migration plan is the intent; the loader is the implementation. Tests verify intent. If loader behavior diverges from the migration plan, the test fails and the loader is fixed, or the migration plan is escalated to the maintainer for review and possible update.

---

## 9. Security and penetration testing

The platform's security testing strategy has three classes of automated and tooled testing plus a fourth class of third-party periodic pentest before major launches. The OWASP WSTG (Web Security Testing Guide) is the canonical reference for techniques; the OWASP ASVS (per §3.4) is the canonical reference for verification requirements. WSTG describes how to test; ASVS describes what to verify.

### 9.1 Regression-grade automated security tests

These run in normal CI and are derived per §4 from the same derivation playbook. The baseline adversarial list in `.claude/rules/testing.md` (oversized payloads, unicode mischief, SQL injection, XSS, timing attacks, race conditions, token replay) plus the per-route baseline (auth gate, authz gate, anti-enumeration, rate-limit, CSRF) is the floor. The derivation playbook adds STRIDE-driven cases per surface.

Tagged `@security`. Lives where the assertion most efficiently lives (unit, integration, or e2e lightweight).

### 9.2 Lightweight staging-safe pentest

A small set of probes that run safely against staging without mutating data. Reports do not block deploy promotion (the staging smoke gate covers blocking conditions); the probes report security signal that the maintainer reviews.

Probes:

- Security headers present and correct (CSP, X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, Referrer-Policy).
- No stack traces in 5xx responses.
- No dev-shortcut env vars accepted on the staging endpoint (the boot-time guards from `src/config/env.ts` enforce this; the probe verifies operationally).
- Auth-gate enforcement on every member-only and admin-only route (probe attempts unauthenticated access; expects 302 or 403).
- Anti-enumeration timing equivalence within tolerance on login, password-reset, email-verification, and claim-lookup surfaces.
- Public surfaces never return contact fields (probe asserts no email-like or phone-like patterns in public response bodies).

### 9.3 Heavyweight human-invoked pentest

Invoked via `npm run test:pentest:heavy` (target script). Browser-driven attack flow exploration (credential stuffing under rate limit, CSRF bypass attempts, file-upload abuse, path traversal probes, SSRF attempts, open-redirect probes, role-escalation attempts, session-fixation attempts, token-replay attempts, login-rate-limit bypass via header spoofing) is operator-invoked via the `browser-qa` skill, not via a standing Playwright suite. May include:

- OWASP ZAP automated baseline scan against the local stack or a dedicated pentest staging environment.
- Dependency and supply-chain vulnerability scanning (`npm audit` plus equivalent third-party tooling).
- Header check across every route (a script that walks the route table and asserts security headers).
- Upload-abuse probes (avatar, media, freestyle music) targeting MIME confusion, polyglot files, oversize, and path traversal.
- Internal route probing (the `/internal/*` surface is reachable only with the internal event secret; probe asserts that an absent or wrong secret returns the same response shape as a not-found).
- Audit of any reachable dev-shortcuts callsite from staging or production (the audit script in §9.5 is the canonical mechanism).

Heavyweight pentest:

- Never runs against production unless explicitly authorized by the maintainer.
- Never attacks third-party services.
- Never sends real email to real users.
- Never uses real member PII.
- Never brute-forces real accounts.
- Never leaks credentials, tokens, cookies, storageState, screenshots, traces, or reports through public artifact uploads.

### 9.4 Third-party periodic pentest

A qualified external security tester is engaged for periodic review before:

- DNS cutover to production.
- Online registration go-live.
- Payment or membership-fee integration go-live.
- Legacy-claim launch (the migration cutover that opens identity claim to the real member base).
- Public registration launch, if the project enables self-service registration without legacy claim.
- Any other feature handling sensitive member data at scale.

The third-party engagement scope is mapped to OWASP ASVS L3 categories that apply (per §3.4). Findings result in regression tests at the cheapest appropriate layer (§4.5 plus §13).

### 9.5 The dev-shortcuts cutover audit is the canonical zero-residue gate

`scripts/audit-dev-shortcuts.sh` queries the four prefix counts in the production DB (`reason_code` under `dev_admin_*`, `action_type` under `grant_admin_dev_*`, `action_type` equal to `dev_admin_invariant_repair`, `created_by` under `dev-shortcuts/*`) and exits non-zero if any count is positive. It is the canonical gate that must pass before any production deploy. It also runs as a periodic check in the heavyweight pentest suite to detect residue from any future testing shortcut that might have leaked into the production DB.

The production build must:

- Strip the `src/dev-shortcuts/` subtree via the Dockerfile `dist-rm` rule.
- Fail fast on boot if any `FOOTBAG_DEV_*` env var is set (the guards in `src/config/env.ts`).
- Return zero from the audit script against the production DB.

A pentest that discovers any of these properties violated is a launch-blocker.

### 9.6 Penetration findings produce regression tests

Every finding from any class of pentest results in a regression test at the cheapest appropriate layer plus a fix. The regression test verifies the fix and prevents reintroduction. A finding without a regression test is not closed.

---

## 10. Test data, privacy, secrets, and artifacts

The factories pattern in `tests/CLAUDE.md` (`factories.ts` plus `testDb.ts`) is canonical for synthetic test data. The privacy and secrets handling from §2.1 applies to every test artifact. This section adds the strategic policies that follow from those.

### 10.1 Synthetic only

Test fixtures, factories, seed data, snapshots, and persona JSON contain only synthetic identities. Synthetic data is obviously test data (prefix `test-`, `staging-test-`, or equivalent) and does not resemble real members.

### 10.2 Deterministic seeds

Test data is deterministic. The `uid()` counter pattern in `tests/fixtures/factories.ts` provides unique identifiers without random values or wall-clock timestamps. Tests that compare against `Date.now()`, `randomUUID()`, or `crypto.randomBytes()` without freezing the source produce flake; the operational rule against timestamp leakage in `.claude/rules/testing.md` applies.

### 10.3 No committed credentials, auth state, tokens

`.gitignore` covers:

- `.local/` (including `dev-admin-seed.json`, `initial-admins.txt`, `staging-personas.json`, and equivalent).
- `tests/test-results/` (Playwright trace and screenshot output).
- Any storage state file produced by Playwright auth setup.
- `.env.local`, `.env.staging`, `.env.production` (real secrets never committed).

The password-leak regression test (§7.5.4 plus §10.4) enforces that secret literals do not propagate beyond their single source file.

### 10.4 Single-source secret containment

Secret literals (the dev-admin-seed password, any test-only signing key, any test-only token salt) live in exactly one source file each, in `src/dev-shortcuts/seedConfig.ts` or an equivalent guarded module. The secret-leak regression test for the shortcut (§7.5.4) asserts the literal appears in exactly one file and that deploy scripts pipe seed JSON via stdin rather than embedding the literal.

### 10.5 Playwright artifact policy

- Storage state: never committed; written to temp directories only; deleted at suite end.
- Traces: retain-on-failure by default. Heavyweight runs that capture all traces follow a retention policy (target: 7 days locally; no public upload without explicit operator action).
- Screenshots: only-on-failure by default. Same retention as traces.
- Videos: not captured by default. Heavyweight runs may capture; same retention as traces.
- HTML reports: treated as potentially containing PII or credentials. Not uploaded to public artifact stores. CI uploads, where configured, use private artifact retention.

### 10.6 Logging and audit hygiene applies to tests

`docs/DATA_GOVERNANCE.md` §9 (Logging and observability hygiene) prohibits raw email addresses, tokens, passwords, raw JWT cookie values, account-token raw strings, session secrets, AWS access keys, KMS material, and signing keys from application logs. The same prohibition applies to test output, CI logs, and test artifact uploads. Test output is treated as potentially public.

### 10.7 No real PII in fixtures, snapshots, or seed files

The `factories.ts` `insertMember` helper accepts overrides; tests that need member rows use synthetic values. Snapshot tests do not snapshot member display names, email addresses, or any field that could collide with a real member identity. Seed files committed to the repository (only schemas and example shapes are committed; secret seeds are gitignored) follow the same constraint.

### 10.8 Brittle dates avoided

Tests that depend on the current date, the current week, the current season, or the current calendar year are brittle and produce flake. Tests freeze time at the seam (`vi.useFakeTimers()` or equivalent), or assert shape rather than calendar values. The exception is calendar-boundary tests that exist specifically to verify behavior at year, leap-year, or DST transitions; those tests inject the boundary date explicitly.

---

## 11. Execution strategy: gates, selection, efficiency

Not every test runs every time. This section defines the named gates, what runs at each gate, what blocks what, and how tests are selected within a gate.

### 11.1 The seven gates

- *Local fast loop.* Typecheck plus lint plus changed-file unit tests via test impact analysis (`vitest --changed`). Sub-30s. Developer-triggered. No gate enforcement; convenience for the working developer.
- *Pre-PR.* Full unit plus integration plus security regression. Sub-2min on a fresh checkout. Optional local git hook that runs `npm run test:pre-pr` before allowing push.
- *CI on PR.* Same as pre-PR plus db-load smoke plus lightweight Playwright plus staging-safe security checks. Sub-10min. Blocks merge.
- *CI nightly or on-demand.* Mutation testing on the safety-critical short list (auth, privacy filters, migration matchers, role gates), dependency audit, header check across the route table, dev-shortcuts cutover audit against the production DB. Reports, does not block.
- *Post-deploy staging smoke.* Read-only health check, auth-gate enforcement, anti-enumeration timing, no-stack-trace probe, dev-shortcut absence probe. Sub-1min. Blocks deploy promotion on failure.
- *On-demand heavyweight pentest.* Human invokes (`npm run test:pentest:heavy`). May include OWASP ZAP baseline, upload-abuse probes, internal-route probes, header checks, dependency scanning. Browser-driven attack flows are operator-invoked via the `browser-qa` skill. Never runs against production unless explicitly authorized.
- *Periodic third-party pentest.* At major launches (per §9.4). Reports findings; findings produce regression tests at the cheapest appropriate layer.

The db-load smoke gate is a canonical example of class-specific gating within the CI-on-PR gate: it runs only on changes that affect the loader pipeline. The pattern (run a gate only when the surface that the gate covers has changed) extends to other gates as tooling permits.

### 11.2 Selection mechanisms within a gate

- *Test impact analysis* for the local fast loop. `vitest --changed` plus git-diff-driven file selection. The fast loop runs only tests that touch changed code paths.
- *Tag-based selection* across all gates. The tag taxonomy in §6.3 (`@smoke`, `@security`, `@a11y`, `@migration`, `@quarantined`) drives which tests run at each gate.
- *Risk-severity-based selection* for nightly and on-demand gates. Catastrophic and high surfaces (per §3) run on every PR. Medium surfaces run nightly or when the surface changes. Low surfaces run weekly or when the surface changes. Risk severity is recorded in the surface's traceability entry (§4.7).
- *Parallel sharding* where the test runner supports it. Vitest workers for unit and integration; Playwright workers are constrained to 1 by SQLite WAL serialization, so Playwright sharding happens via separate processes against separate ephemeral databases.
- *Skip-on-unchanged-inputs* where tooling supports it. Layers whose inputs have not changed since the last green can be skipped.

### 11.3 Flake discipline

Tests that fail intermittently are quarantined, not ignored. The quarantine mechanism:

- A flaky test is tagged `@quarantined` with a comment giving the reason and the tracking entry in `IMPLEMENTATION_PLAN.md` "Testing rigor by surface" (per §12).
- Quarantined tests have a 7-day deadline. The maintainer is notified at the deadline. The test is either fixed or the underlying surface is patched.
- Quarantined tests do not block merge but are reported as a separate CI signal.
- The quarantine count is a health metric. Sustained growth indicates test-suite or surface decay and triggers a maintenance pass.
- `.skip`, `.todo`, and `xit` remain forbidden per `.claude/rules/testing.md`. Quarantine is the only legitimate skip path, and it is time-bounded.
- Test retries to mask flake are not used. A test that needs retries to pass is a test that does not deserve to pass.

### 11.4 What blocks what

- *CI on PR* blocks merge.
- *Post-deploy staging smoke* blocks deploy promotion (the production deploy script must verify smoke passed against the staging deployment before promoting).
- *CI nightly or on-demand* reports only. A failing nightly does not block in-flight PRs but does block the next intentional production deploy until investigated.
- *On-demand heavyweight pentest* reports only. Findings produce regression tests (§9.6).
- *Periodic third-party pentest* reports only. Findings produce regression tests and may block a major launch if a catastrophic-risk finding is open.

### 11.5 Secrets and CI

CI logs, CI artifacts, Playwright reports, traces, screenshots, and failure output are treated as potentially public unless explicitly restricted. Tests that require remote credentials receive them through GitHub Actions secrets, SSM, or an equivalent approved secret-management mechanism. Credentials are never echoed, never serialized into artifacts, never embedded in shell command lines. The password-leak regression test (§7.5.4) and the dev-shortcuts cutover audit (§9.5) together enforce this property for the dev-shortcuts surface; equivalent discipline applies to any other secret introduced into the CI environment.

---

## 12. Coverage signals and rigor maturity model

### 12.1 Coverage signals

Coverage thresholds set in `vitest.config.ts` are non-negotiable floors per `.claude/rules/testing.md`. They ratchet up over time. They are a leading indicator of test absence, not a leading indicator of test quality. A surface at one hundred percent line coverage with no STRIDE-modeled threat tests is still under-tested. Coverage is one signal among several.

Signals tracked per surface:

- *Line and branch coverage* (per the `vitest.config.ts` thresholds). Floor.
- *Mutation score* on the safety-critical short list (auth, privacy filters, migration matchers, role gates). Tool: Stryker per §15.3.1.
- *Threat coverage* per surface (the STRIDE-applicability table from §4.3 with every category marked applicable or not-applicable with rationale). Target one hundred percent for catastrophic and high surfaces.
- *Risk-severity coverage* (every catastrophic and high surface has a traceability entry per §4.7). Target one hundred percent.
- *Quarantine count* (§11.3). Target zero; sustained growth is a maintenance signal.

### 12.2 Rigor maturity model

A surface's testing rigor is a level from 1 to 5. Higher rigor levels strictly include lower ones. The level captures which coverage techniques and frameworks have been applied to the surface.

- *Rigor 1: informal.* Tests exist for the surface but are not anchored to a US success criterion, STRIDE entry, or derivation playbook output. Coverage floor (§12.1) applies but baseline edge cases per `.claude/rules/testing.md` may not all be present. Accepted only for low-risk surfaces in transitional states; not the long-term target for any surface.
- *Rigor 2: SC-traced.* Tests anchor to US success criteria per §4.1. Derived assertions per §4.2 exist in test file headers or the PR description. Baseline edge cases from `.claude/rules/testing.md` are present. No STRIDE modeling. Acceptable for low-risk surfaces.
- *Rigor 3: STRIDE-modeled.* All of Rigor 2, plus STRIDE per surface per §4.3, plus technique selector per §4.4 with equivalence partitioning, boundary value analysis, and scenario tests applied as the threat model requires. Pairwise applied where the surface has a matrix. Acceptable for medium-risk surfaces.
- *Rigor 4: pairwise plus property-tested.* All of Rigor 3, plus property-based tests for invariants (Information Disclosure invariants, idempotency, CSRF presence on every state-changing verb, enumeration-safety equivalence). fast-check or an equivalent property tester installed and configured. Acceptable for high-risk surfaces.
- *Rigor 5: mutation-validated.* All of Rigor 4, plus mutation testing (Stryker or equivalent) runs against the surface's module periodically and the mutation score meets the target threshold. Required for catastrophic-risk surfaces.

### 12.3 Target rigor by risk severity

- *Catastrophic surfaces:* target Rigor 5.
- *High-risk surfaces:* target Rigor 4.
- *Medium-risk surfaces:* target Rigor 3.
- *Low-risk surfaces:* target Rigor 2.

A surface's risk severity (§3) determines target rigor. A surface that falls short of target rigor has a tracked gap (§12.4).

### 12.4 Rigor tracking lives in IMPLEMENTATION_PLAN.md

Rigor per surface is implementation status, not design intent. Per `.claude/rules/doc-governance.md` (Canonical vs active-slice separation), implementation status belongs in `IMPLEMENTATION_PLAN.md` and not in canonical long-term docs.

A "Testing rigor by surface" section in `IMPLEMENTATION_PLAN.md` tracks the rigor gap per surface. The section is AI-facing per the IP-format rule (entries are deleted outright when a surface reaches its target rigor; no tombstone, no completion marker, no strike-through).

IP entry format for a surface gap:

- *Surface:* US ID (or migration anchor).
- *Risk severity:* per §3.
- *Target rigor:* per §12.3.
- *Rigor reached:* 1 to 5 per §12.2.
- *Gap:* one line describing what the next step is to advance rigor (e.g., "install fast-check and add enumeration-safety property test").

When a surface reaches target rigor, its IP entry is deleted.

### 12.5 New test PRs target the highest feasible rigor

When a contributor (human or AI) lands tests for a surface, the target is the highest rigor feasible given the surface's risk severity and the tooling adoption state. The PR description documents:

- The risk severity and target rigor.
- The rigor reached in the PR.
- The gap (if any) and what blocks closing it (tooling adoption, US success criterion missing, related surface unmodeled, and so on).

A PR that lands tests at lower than target rigor is acceptable when it represents progress. It is not acceptable when it represents regression: a surface that has reached Rigor 4 must not drop to Rigor 3 in a PR that touches the surface. Coverage floors apply per `.claude/rules/testing.md` and never ratchet down.

---

## 13. AI-assisted testing governance

When an AI agent (Claude Code or any other) writes, reviews, derives, or modifies tests for the Footbag platform, the agent operates under additional rules beyond what `.claude/rules/testing.md` and `tests/CLAUDE.md` already specify. These rules exist to prevent the AI failure mode of "test what the code does rather than what the user story says."

The remaining AI obligations (no silent skips, no test that blesses current behavior, no canonical-doc modification to fit implementation, regression test at the cheapest layer for every fixed bug, bootstrap code is not a design signal, no automated runs that mutate staging or production, no fetching real member PII) come from `.claude/rules/testing.md` and `.claude/rules/doc-governance.md` and apply to AI agents unchanged.

### 13.1 Read the user story verbatim

Before deriving tests for a surface, the AI reads the relevant `docs/USER_STORIES.md` entry verbatim (full `Access:`, `Story:`, and `Success Criteria:` blocks). The AI does not paraphrase the success criteria; it extracts ordinal derived assertions per §4.2. If the success criteria are unclear or appear to conflict with implemented behavior, the AI escalates to the human rather than guessing.

### 13.2 Produce a derivation trail

Every test or test cluster that the AI lands carries a derivation trail in the test file header or the PR description, in the format specified in §4.7 and templated in §15.1. The derivation trail is the AI's work-product, and is reviewed by the human alongside the test code itself.

### 13.3 Human review is required

No AI-written test lands without human review. Branch protection enforces this at the merge gate. The human review covers:

- The derivation trail (§13.2) is present and complete.
- The user story success criterion has been read correctly into derived assertions.
- STRIDE applicability is correct.
- Technique selection is appropriate.
- Skip rationales are sound.
- The rigor reached matches the PR description.
- No bootstrap-stub code is cited as design signal (per `.claude/rules/doc-governance.md`).

### 13.4 The AI applies this document the same way a human does

The full derivation playbook (§4) applies. Risk classification (§3), STRIDE per surface (§4.3), technique selector (§4.4), rigor maturity model (§12), and the traceability template (§15.1) are the AI's working set when deriving tests. The AI does not skip steps because they are tedious; the steps exist to keep test quality high.

---

## 14. Accessibility and explicit deferrals

### 14.1 Accessibility as a first-class layer

The platform targets WCAG 2.1 AA as the baseline accessibility conformance level.

Accessibility testing is a named test layer, not an afterthought. The layer combines:

- *Automated checks* via `@axe-core/playwright` (per §15.3.1) in the lightweight Playwright suite, tagged `@a11y`. Every business-critical surface in the suite carries an axe assertion against the WCAG 2.1 AA rule set. Runs on every PR; catches automated-detectable regressions before merge.
- *Smoke-tagged automated checks* (`@smoke @a11y`) on a small subset of high-traffic public pages (home, member dashboard, login, register, public event detail, results page) that also runs in the post-deploy staging smoke gate.
- *Manual audit* by the maintainer or an external accessibility reviewer periodically and before major launches. The third-party periodic pentest engagement (§9.4) may include accessibility scope.
- *Deeper audit beyond automated coverage* (full keyboard-only journey, screen-reader flow validation, cognitive accessibility) is operator-invoked via the `browser-qa` skill.

### 14.2 Per-surface accessibility derived assertions

When the playbook derives tests for a surface that contains user-facing UI, the derived assertions extend with accessibility-specific assertions:

- *Keyboard navigation:* every interactive element is reachable and operable by keyboard alone.
- *Screen reader semantics:* every interactive element has an accessible name; landmarks are present; headings nest correctly.
- *Color contrast:* text and UI components meet the 4.5:1 contrast ratio (3:1 for large text) per WCAG 2.1 AA.
- *Form labels and errors:* every form input has a programmatically associated label; error messages are programmatically associated with the input they describe.
- *Focus management:* modal dialogs, wizards, and skip links handle focus correctly.

These assertions are derived in the same playbook step (§4.4) as the security and functional assertions. The technique is automated checks (axe) plus manual audit where automated checks cannot verify (heuristic semantics, screen-reader flow).

### 14.3 Explicit deferrals

The following test classes are explicitly deferred from this strategy. The deferral is intentional; surfacing a need for any of them later is a scope expansion that requires explicit maintainer decision and an update to this section.

- *Performance and load testing.* No load test runs against any environment. Performance assertions are limited to per-request resource bounds (request size, response size, worker concurrency) tested as configuration verification, not throughput. When traffic warrants, a separate work item introduces load testing with explicit scope, fixtures, and execution-environment isolation.
- *Chaos engineering.* No deliberate failure injection into running stacks. Partial-failure scenarios are tested by simulated failures at the adapter seam in unit and integration tests, not by injecting failures into staging or production.
- *Visual regression testing.* No automated visual-diff snapshotting. Visual changes are reviewed by the maintainer through the deploy preview, not by a snapshot test. Visual snapshots are brittle and produce flake without commensurate value at the platform's risk profile and scale.
- *Network-fault testing.* No automated test simulates network partitions, DNS failures, or upstream provider outages. Fault behavior is tested at the adapter contract level (per `.claude/rules/testing.md`) using fakes that return configured error responses.

Deferral does not mean these test classes are unimportant. It means the strategy as designed produces sufficient coverage without them. A future scope expansion that adopts one or more of them updates this section.

---

## 15. Annexes

### 15.1 Traceability entry template

The traceability entry produced by the derivation playbook (§4.7) follows this bulleted format, recorded in the test file header, the PR description, or both. Items in angle brackets are filled in per surface.

- *US ID:* `<story-header-from-USER_STORIES.md>` (for example `M_Login`).
- *Migration anchor (alternate):* `<MIGRATION_PLAN.md section identifier>` if the surface has no US.
- *Derived assertions:*
  - *A1:* `<one-line testable claim>`.
  - *A2:* `<one-line testable claim>`.
  - *...*
- *Routes:* `<route paths>`.
- *Service methods:* `<service.method names>`.
- *STRIDE applicability:*
  - *Spoofing:* `<applicable | not applicable>`; `<one-line rationale>`.
  - *Tampering:* `<applicable | not applicable>`; `<one-line rationale>`.
  - *Repudiation:* `<applicable | not applicable>`; `<one-line rationale>`.
  - *Information Disclosure:* `<applicable | not applicable>`; `<one-line rationale>`.
  - *Denial of Service:* `<applicable | not applicable>`; `<one-line rationale>`.
  - *Elevation of Privilege:* `<applicable | not applicable>`; `<one-line rationale>`.
- *Technique per assertion:*
  - *A1:* `<equivalence partitioning | boundary value analysis | pairwise | property-based | scenario | fuzzing | rate-limit assertion>`.
  - *...*
- *Risk severity:* `<catastrophic | high | medium | low>`.
- *ASVS level:* `<L1 | L2 | L3>`.
- *Test files:* `<paths>`.
- *Rigor level:* `<1 to 5>`. Target: `<1 to 5>`. Gap: `<one line>` if any.
- *Tags:* `<@smoke | @security | @a11y | @migration | @quarantined>`.

The template is intentionally bulleted (per the project doc style) rather than a table. Future Claude sessions and human contributors fill it in mechanically per the derivation playbook.

### 15.2 Strategic anti-patterns

Operational anti-patterns (no DB mocking, no framework mocking, no timestamp leakage, no global state leakage between files, no silent skips, no "tested manually," no tests on the dev DB) are enumerated in `.claude/rules/testing.md` and apply to every test. This section adds the strategic anti-patterns that follow from the playbook discipline.

- *Tests that assert what the code does rather than what the user story says.* A test that documents implementation behavior without anchoring to a success criterion blesses accidental behavior and provides false confidence.
- *Playwright tests for every business-rule branch.* Business rules are covered by unit and integration tests; Playwright is for browser-only assertions and business-critical happy paths plus the minimal negative cases that only a browser can reveal.
- *Brittle locators.* CSS selectors that depend on auto-generated class names, XPath that depends on DOM structure, and text selectors that depend on copy phrasing are brittle. Prefer role and accessible-name selectors per Playwright best practice.
- *Asserting on exact prose or wording.* Tests that pin rendered copy with patterns like `expect(res.text).toContain('exact heading')` or `not.toMatch(/old phrase/)` turn every copy edit into a test failure and train reviewers to ignore the suite. Assert structural intent instead: counts of expected elements, presence of IDs and classes, anchor href shape, response status, data attributes. When a literal string is the contract (an SEO meta description, an explicit error message), production code exports the constant and the test imports it rather than duplicating the literal.
- *Arbitrary sleeps.* `await page.waitForTimeout(N)` masks race conditions. Wait on observable conditions (selector visibility, network response, app state).
- *Depending on production data.* Tests that read or assume real production records are brittle and may leak PII into test output.
- *Depending on real email receipt for routine tests.* The dev-shortcuts autologin and skip-claim-email mechanisms exist to avoid this. Routine tests do not poll a mailbox.
- *Making staging tests destructive by default.* Staging tests are read-only or explicitly idempotent and audited per §5.4.
- *Running penetration tests against production without explicit authorization.* Forbidden per §9.3 and §9.4.
- *Attacking third-party services.* Forbidden per §9.3.
- *Using brute force against real accounts.* Forbidden per §9.3.
- *Weakening tests to make them pass.* If a test fails, the code is fixed. The exception is when the test was wrong about intent; then the user story is updated first, with explicit human consent, and the test is rewritten against the corrected story. Weakening assertions to admit failing code is forbidden.
- *Overusing snapshots.* Snapshot tests are brittle. Prefer explicit assertions on shape or content. Snapshots are acceptable only when the assertion structure is genuinely too large to enumerate (rare).
- *Ignoring migration edge cases.* Migration testing covers all four confidence outcomes per §8.2; ignoring medium or low confidence cases is forbidden.
- *Blurring groups and committees into clubs.* Groups and committees (when implemented) are distinct from clubs per `docs/USER_STORIES.md` and `docs/DESIGN_DECISIONS.md`. Tests preserve the distinction.
- *Introducing a test-only HTTP endpoint outside dev-shortcuts.* Forbidden per §7.6.

### 15.3 Tooling appendix

#### 15.3.1 Toolchain

The platform's testing toolchain consists of:

- *Vitest.* Unit and integration test runner. `npm test` excludes `tests/smoke/` and `tests/e2e/`; `npm run test:unit`, `npm run test:integration`, `npm run test:smoke`, `npm run test:e2e`, `npm run test:coverage`, `npm run test:pre-pr`, `npm run test:all` are the canonical scripts.
- *Supertest.* HTTP assertion helper for integration tests.
- *better-sqlite3.* Real SQLite per test file; no mocking. Per `tests/CLAUDE.md`.
- *@vitest/coverage-v8.* Coverage measurement. Thresholds set in `vitest.config.ts`.
- *Playwright.* Browser automation. Config at `tests/playwright.config.ts`. Single-worker chromium-only headless lightweight suite.
- *Test fixtures.* `tests/fixtures/factories.ts` (synthetic row factories), `tests/fixtures/testDb.ts` (DB setup and teardown), `tests/fixtures/personas.ts` (member plus tier grant plus JWT plus Playwright cookie composition).
- *fast-check.* Property-based testing for TypeScript. The technique selector (§4.4) calls for property tests on Information Disclosure invariants, idempotency, CSRF presence on every state-changing verb, and enumeration-safety equivalence; fast-check is the tool that satisfies those derivations and is required for Rigor 4 (§12.2).
- *Stryker (TypeScript).* Mutation testing. Required to reach Rigor 5 on the safety-critical short list (auth, privacy filters, migration matchers, role gates) per §12.2. Runs nightly or on-demand, not on every PR.
- *@axe-core/playwright.* Accessibility automated checks for the lightweight Playwright suite per §14.1, tagged `@a11y`, plus the smoke-tagged subset on high-traffic public pages.
- *OWASP ZAP.* Heavyweight pentest scanner. Used in the on-demand heavyweight pentest gate per §9.3. Scripted invocation against the local stack or a dedicated pentest staging environment; report aggregation; findings produce regression tests per §9.6.
- *Pairwise generator.* PICT, ACTS, or an equivalent. Used by the technique selector per §4.4 for matrix-shaped threats. May be hand-derived for small matrices; the generator becomes mandatory when the role-by-surface-by-method matrix exceeds 32 combinations.
- *Dependency vulnerability scanner.* `npm audit` is built in; a third-party scanner (Snyk, Socket, or equivalent) supplements with supply-chain signal. Integrated into the on-demand heavyweight pentest gate.

#### 15.3.2 Tools explicitly not adopted

- *Jest.* Vitest is the platform test runner. No Jest dependency.
- *Cypress.* Playwright is the platform browser automation tool. No Cypress.
- *Cucumber and other BDD frameworks.* Tests describe long-term contracts in straightforward TypeScript; no Gherkin or feature files. User story success criteria are decomposed by the derivation playbook into ordinal derived assertions, not into Given-When-Then.
- *Snapshot-driven UI testing libraries that produce committed image diffs.* Per §14.3.
- *Load testing or chaos tooling (k6, Locust, Chaos Monkey, equivalent).* Deferred per §14.3.

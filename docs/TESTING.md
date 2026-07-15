# Footbag Website Modernization Project -- Testing Strategy

**Authority:** This document is the canonical reference for testing strategy on the Footbag platform. It is strategic and additive. Operational testing rules live in `.claude/rules/testing.md` and `tests/CLAUDE.md`; security and privacy policy lives in `docs/DATA_GOVERNANCE.md`; migration testing rules live in `docs/MIGRATION_PLAN.md`. This document covers a risk classification rubric, test design principles, OWASP ASVS calibration, coverage and selective heavier tooling, a penetration testing strategy, an execution efficiency model with token-efficient tiered execution, AI-assisted testing governance, accessibility as a first-class layer, and explicit deferrals. Where this document and `.claude/rules/testing.md` overlap, the rules file is operational truth and this document is strategic context; the two must not contradict.

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

### 2.2 logger.error is the operator-alert signal

Any `logger.error()` call in service or controller code is treated as "an operator must see this." The same call drives two enforcement mechanisms: (1) a global test-suite spy in `tests/setup-env.ts` that fails any test producing an unexpected `logger.error()` (opt in deliberately via `expectLoggedError(pattern)`); and (2) a CloudWatch log metric filter in staging/prod that fans out to the admin SNS topic. Service catch blocks that pair an audit row with the alert use the `recordOperationalError(...)` helper at `src/services/operationalErrors.ts` rather than writing the audit row alone.

### 2.3 The doc applies to humans and AI agents equally

When an AI agent (Claude Code or any other) writes or reviews tests for this codebase, the agent applies this document the same way a human contributor does: read the user story verbatim, understand what is being asserted, classify the risk severity, apply the relevant techniques, and submit for human review. §13 expands these obligations into the AI-assisted testing governance rules.

### 2.4 Tests verify intent, never implementation (the load-bearing rule)

This is the single most important rule in the entire strategy, and it is absolute. Every test in the suite exists to prove the system does what its **intent** requires: the success criteria in `docs/USER_STORIES.md`, the decisions in `docs/DESIGN_DECISIONS.md`, and the security and privacy principles in `docs/DATA_GOVERNANCE.md`. A test earns its place only by tracing to one of those sources of intent. The success criterion is the oracle; the code is the thing under test, never the standard the test is measured against.

The forbidden anti-pattern, stated plainly so it cannot be mistaken: **a test that asserts the code does exactly what the code currently does.** Reading an implementation and writing assertions that mirror it produces a test that passes by construction, blesses whatever behavior happens to exist (bugs included), and fails only when someone later fixes the code. Such a test manufactures false confidence and actively resists correction. It is worse than no test, because it disguises an untested surface as a tested one.

The consequences are non-negotiable:

- When the code and the success criterion disagree, the test encodes the criterion and the code is fixed to match. The test does not bend to the code.
- A test is never weakened, loosened, or deleted to make failing code pass. If a test fails, either the code is wrong (fix it) or the intent the test encodes was wrong.
- The intent is corrected only at its source. If a success criterion itself is wrong, it is changed in `docs/USER_STORIES.md` (or the relevant design doc) with explicit human consent first, and only then is the test rewritten against the corrected intent. The code is never the authority that licenses a test change.
- A surface with no traceable intent is unintended scope (§4.1): write the missing story or remove the surface, do not paper over it with a behavior-mirroring test.

A change that adds an effect must not shrink the test to that effect alone. In the same scenario, the test re-asserts the invariants the change is required to preserve: that a signal raised for later review does not also block the action it flags, and that a privacy-sensitive path returns the identical response whether or not the sensitive value matched (the anti-enumeration posture in `docs/DATA_GOVERNANCE.md`). Asserting the new effect while dropping the preserved invariant passes by construction and lets the invariant regress unseen -- the same failure this rule forbids, in different clothes. Both halves trace to intent: the new behavior to its success criterion, the preserved invariant to the decision or governance rule that fixes it.

---

## 3. Risk classification and OWASP ASVS levels

### 3.1 Why classify

Not every test surface deserves the same depth of adversarial coverage. A static legal page does not need concurrency or partial-failure testing; an authentication endpoint does. Classification informs which threat categories to model, which adversarial dimensions to test, and which test layers must cover the surface.

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

### 3.4 OWASP ASVS calibration

The project targets OWASP ASVS Level 2 as its baseline for member-facing surfaces with authentication, PII, or sensitive business logic. Catastrophic-severity surfaces (auth, session, member privacy, payments, identity claim) target ASVS Level 3 for the categories that apply to the surface: authentication, session management, access control, validation, error handling, data protection, communication, and configuration. ASVS levels are a test-design reference for verification depth, not a per-surface compliance artifact; the surface meets the level by satisfying the catastrophic-surface verification floor in §4.5, not by producing a checklist deliverable.

---

## 4. Test design principles

Every test for a new or changed surface is grounded in these principles. They are not a mandatory walk and they do not require a per-test ceremony artifact; they guide where assertions come from and how the test is shaped.

### 4.1 Trace tests to user stories

Every test traces upward to a user story in `docs/USER_STORIES.md` (identified by its story header, e.g. `M_Login`, `V_Browse_Clubs`, `A_Create_Vote`) and downward to the route or service method it exercises. If a surface has no corresponding user story, the surface is unintended scope: write the missing story first, or remove the surface.

Surfaces in the legacy data pipeline anchor on `docs/MIGRATION_PLAN.md` validation gates instead.

The trace lives in the test's name (descriptive `it(...)` strings naming user-visible behavior) and the PR description (link to the user story being addressed). No file-header traceability artifact is required.

### 4.2 STRIDE as a threat-modeling framework

STRIDE is the project's reference vocabulary for threat modeling on catastrophic-severity surfaces (auth, session, member privacy, payments, identity claim). The six categories:

- Spoofing: identity impersonation, credential forgery, session-cookie forgery.
- Tampering: input mutation, signed-material forgery, request or response tampering.
- Repudiation: action denial, audit gaps, missing trail on state-changing paths.
- Information Disclosure: PII leaks, secret leaks, existence-of-record leaks via differential responses or timing oracles.
- Denial of Service: rate-limit bypass, unbounded work, resource exhaustion.
- Elevation of Privilege: role escalation, RBAC bypass, post-login capability expansion.

Use STRIDE when modeling a new catastrophic surface's threat landscape, or when reviewing whether a surface's tests cover all applicable threats. A STRIDE applicability table in the DD (one row per category, applicable or not-applicable with rationale) is a useful artifact when a surface's threat surface is non-obvious or when multiple contributors need a shared mental model; it is not a per-DD requirement.

For non-catastrophic surfaces, the baseline coverage in §4.4 is sufficient.

### 4.3 Test technique reference

Standard techniques to draw from when shaping a test:

- Equivalence partitioning + boundary value analysis: input validation. Partition the input space into classes (valid, malformed, oversized, wrong type, unicode mischief, injection attempt); test one representative per class plus the boundary (empty, single, max, max+1, unicode normalization edge, leap year, NULL).
- Pairwise / combinatorial coverage: matrix-shaped concerns (role x route x method x auth-state). Use all-pairs rather than full Cartesian when the matrix is large.
- Property-based testing (fast-check): invariant-shaped assertions ("for all inputs, property P holds"). Selective use for validators, encoders, security pure functions, anti-enumeration helpers. Not a universal requirement.
- Scenario tests with explicit state transitions: state-machine-shaped concerns (multi-step wizard, token lifecycle, audit emission on state-changing paths).
- Selective fuzzing: parsers, validators, complex input handlers. Targeted at the specific module. Name pathological-input timing (catastrophic regex backtracking / ReDoS) as an explicit goal for any hand-written regex validator — the freestyle notation grammar, slug and URL validators.
- Rate-limit + resource-bound assertions: denial-of-service concerns. Configuration verification, not load testing (load is deferred per §14).
- Query-count / N+1 detection: for a list or detail read path, wrap the database and assert the executed-statement count is bounded and stays constant as the row count grows (seed one row versus many; the count must not scale with the data), and that list-returning service methods carry a `LIMIT`. Catches a page whose query count grows with the table before it becomes a production incident, which no row-count or shape assertion reveals.
- Metamorphic / differential testing: assert a relation between related inputs or outputs rather than one fixed oracle — a migration reconciliation whose aggregate counts are independent of input row order, a sort stable under a repeated secondary key, or two adapter implementations (stub versus live) producing identically-structured output.
- Money as integer minor units: monetary amounts stay integer cents through every calculation. Test cents-versus-dollars representation, summation with no floating-point arithmetic, and currency-mismatch rejection.

The technique catalog is a vocabulary, not a checklist. Pick what fits the assertion; don't enumerate every technique against every assertion.

### 4.4 Baseline coverage from operational rules

`.claude/rules/testing.md` enumerates per-route and per-service-method baseline coverage (happy path, auth gate, authz gate, not-found, invalid input, draft and unpublished, route ordering, anti-enumeration, rate-limit, CSRF, shape, business rules, atomicity, idempotency, errors, boundaries) and a baseline adversarial list (oversized payloads, unicode mischief, SQL injection, XSS, timing attacks, race conditions, token replay). A test for a new route satisfies the baseline list first; threat-aware additions per §4.2 layer on for catastrophic surfaces.

### 4.5 Catastrophic-surface verification floor

In addition to baseline coverage (§4.4) and STRIDE-aware threat coverage (§4.2), catastrophic-severity surfaces meet the following floor:

- ASVS Level 3 verification depth (per §3.4) for the categories that apply.
- Every applicable item from the baseline adversarial list and per-route baseline in `.claude/rules/testing.md` is covered with no skip.
- The canonical invariants -- anti-enumeration response equivalence (status code, body, timing within tolerance across input classes), CSRF presence on every state-changing verb, session cookie attribute completeness, and idempotency where the surface declares it -- are covered by scenario tests with shared assertion helpers in `tests/fixtures/`. The shared-helper shape keeps per-route assertions cheap (one line per route) while preserving the property: a future refactor that breaks an invariant fails the route's own test.

Property-based testing (fast-check) and mutation testing (Stryker) are available techniques for catastrophic surfaces when a specific surface justifies the cost. They are not mandated per catastrophic surface. Selective adoption per §12.2 governs when and where they apply.

A catastrophic surface that lacks any floor item carries a single-line entry in `IMPLEMENTATION_PLAN.md`: surface name plus the missing floor item. The entry is deleted when the gap closes. No rigor levels, no target field, no per-test ceremony; one line per gap, removed on close.

### 4.6 Persona derivation and the route-by-persona authorization matrix

Authorization defects (a missing gate, an over-broad gate, a privilege that leaks across an ownership boundary) surface only when the right actor exercises the right route. This section defines how the test-persona suite is derived so the derivation is systematic and provably complete rather than ad hoc, and how the personas feed the route-by-persona authorization matrix.

Deriving the persona suite:

1. Enumerate the authorization dimensions from the `Access:` clause of every deployed user story. The dimensions are: authentication state (anonymous, authenticated); email-verified state (verified, or registered-unverified with login blocked until verification); the membership tier ladder (Tier 0, 1, 2, 3); per-resource ownership (owner of the target row); resource-scoped roles (event organizer and co-organizer, club co-leader, group owner and co-owner, group member); the admin role (the curated-media curator surface is admin-operated, not a separate role); the system or internal-caller role (scheduled jobs, secret-gated webhooks); standing flags (Active Player status, Hall-of-Fame / Big-Add-Posse / IFPA-Board honors, vote-eligibility by inclusion list); migration and legacy-claim state (graded auto-link confidence high, medium, low, no-match, plus the claimed-legacy record whose legacy admin flag must not confer admin); and identity edge cases (homoglyph, RTL-override, and unicode display names, duplicate display names, surname collisions, deceased members, accounts inside the deletion grace period).

2. Treat each dimension as an axis and apply equivalence partitioning to actors, the technique ISTQB defines for inputs: every distinct gate outcome is one equivalence class, and the suite carries one seedable persona per class. For ordered dimensions add boundary-value personas at the gate edges: the tier just below a route's requirement versus at or above it, an Active Player grant that is current versus one that just expired, a deletion grace period still open versus just elapsed.

3. Derive negative personas explicitly. STRIDE Elevation-of-Privilege and abuser-story analysis require, for every privileged route, an authenticated actor who is authorized and an authenticated actor who is not, plus the adjacent-owner persona (a member who owns some resource of the same type but not this one). The adjacent-owner persona is what surfaces broken object-level and function-level authorization (OWASP API Security Top 10 BOLA and BFLA); without it, an owner-only route that silently serves any authenticated member passes every positive test.

4. Map each class to a concrete, named, seedable persona. A dimension that combines with another to change a gate outcome yields a separate persona (a Tier 1 club co-leader and a Tier 1 club member who is not a co-leader are two personas), but combinations that never change an outcome are not multiplied out.

Controlling combinatorial growth: the axes are orthogonal, so the full cartesian product is large and most cells are uninteresting. Catastrophic and high-severity surfaces (auth, session, member privacy, payments, identity claim, per §3) are covered exhaustively across the relevant axes; the rest is sampled with pairwise (all-pairs) selection so every pair of axis values appears in at least one persona without enumerating every triple. Risk severity, not convenience, decides which surfaces are exhaustive.

The matrix: the deployed-route inventory is crossed with the persona suite, and every cell asserts the expected gate outcome, an allow cell for each authorized persona and a deny cell for each unauthorized one. An unasserted route-by-persona cell is a visible candidate authorization gap rather than a silent one, so the matrix doubles as a coverage ledger. The deny half is mandatory: a route that asserts only its allow cells has not been tested for authorization.

The canonical catalog and its maintenance: the persona suite is instantiated once, as the maintainer-curated catalog the persona harness seeds and the `/dev/switch` and `/dev/personas` affordances expose (§7.5). The catalog is the single source of truth; new test slices add a persona there rather than inventing fixture rows, and each persona records the testing dimensions it exercises so the catalog itself reads as a coverage matrix. A deployed surface that no existing persona exercises is the signal that a new persona is required. Where the catalog does not instantiate every class this section derives, the gap is a deviation tracked in `IMPLEMENTATION_PLAN.md`, not a relaxation of the target.

---

## 5. Test layers and what belongs in each

This document does not redefine the operational test conventions in `tests/CLAUDE.md` or the testing mandate in `.claude/rules/testing.md`. It defines the strategic layering and the belongs-where rules that decide which layer a given test belongs in.

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

Vitest plus Supertest plus better-sqlite3 against a real SQLite test DB per file (`tests/integration/`). Exercises real route, middleware, service, and DB paths. No mocks. The default home for assertions that exercise routes, services, schemas, or persistence.

Belongs:

- Route plus controller plus service plus DB integration
- Anti-enumeration assertions
- Audit-log emission assertions
- Rate-limit boundary assertions
- Adapter parity (boot-time config tests, interface parity tests)
- Exhaustive route-wiring crawl: every rendered link and form target resolves for the persona it was shown to
- Button-destination integrity: on any one page every clickable control's visible label maps to a single destination, so a label cannot lie about where the click lands. A button labelled "Link My History" that actually runs a search, or two identically-labelled "Apply" buttons that post to different endpoints, fail here. This is distinct from the route-wiring crawl (which proves a target resolves) and from the no-nested-forms gate (which proves a form reaches a handler): it proves the label tells the truth about the outcome

Does not belong:

- Browser-only assertions (cookie attribute interaction with the browser, redirect chains visible only in a real browser)
- Staging-AWS integration (SES, S3, KMS live)

The generated route-by-persona authorization matrix (§4.6) lives here: it crosses the deployed-route inventory with the derived persona suite and asserts the expected allow or deny outcome for every cell, so an unasserted route-by-persona combination is a visible candidate authorization gap.

The operator-only QC routes under `/internal/*` (handlers in `src/internal-qc/`, admin-gated at the router level by `requireAuth` then `requireAdmin`) are integration-tested here. They serve in development and staging and are excluded from the production image (§7.1 owns the exclusion mechanism and the retirement lifecycle). Reaching a controller needs an admin session: seed a member with `is_admin` and attach a `createTestSessionJwt` cookie, because an unauthenticated request redirects to `/login` and an authenticated non-admin request gets 403. State-changing verbs (POST, PUT, PATCH, DELETE) are origin-pinned, so import the `tests/fixtures/supertestWithOrigin` wrapper instead of plain `supertest`; without a matching `Origin` header the request is rejected with 403 before the controller runs.

### 5.3 db-load smoke

The CI job `db-load-smoke` (in `.github/workflows/ci.yml`) applies the schema and runs the legacy_data loader pipeline against fixed fixtures, asserting row counts and shape. The canonical regression gate for the historical-data pipeline.

Belongs:

- Schema-load smoke
- Loader pipeline row-count and shape assertions
- Migration regression cases tied to `docs/MIGRATION_PLAN.md` §24 validation gates

Does not belong:

- Tests requiring application HTTP layer
- Tests that mutate live data

### 5.4 Staging-AWS adapter smoke

`tests/smoke/`, gated behind `RUN_STAGING_SMOKE=1`, excluded from default `npm test`. Runs against real staging AWS (KMS, SES, S3, SSM) via the assumed-role chain configured by `scripts/test-smoke.sh`. The canonical regression gate for staging-AWS adapter parity.

Belongs:

- Adapter staging-smoke (one per adapter, per `.claude/rules/testing.md` adapter-parity rule)
- Health and readiness checks against staging
- Identity, KMS, SES, S3 round-trip verification

Does not belong:

- Tests that mutate persistent staging data unless explicitly idempotent and audited
- Tests that depend on production data

### 5.5 E2E lightweight (Playwright)

`tests/e2e/`, Playwright config at `tests/playwright.config.ts`. Real browser. Single worker, chromium, headless. Test set is small and business-critical. Tests may carry `@smoke`, `@security`, `@a11y`, or `@migration` tags per §6.3.

Belongs:

- Real-browser session and cookie behavior
- CSRF-protected form submission where browser semantics matter
- Onboarding, club-cleanup, and legacy-claim wizard happy paths
- Avatar upload and media upload round-trips
- Public navigation confidence (small sample, not exhaustive)
- Role-sensitive UI behavior smoke
- Primary-form submission actually posts (no nested-form orphaning of the submit button). The static no-nested-forms gate in `scripts/ci/assert_conventions.sh` is the cheap floor that catches the markup defect at merge time; an E2E submit is the deep check that the wired-up form reaches its handler.

Does not belong:

- Every service branch
- Every validation edge case
- Every policy function (these are unit and integration territory)
- Exhaustive navigation crawls in a real browser (the exhaustive route-wiring crawl runs at the integration HTTP layer, §5.2)

### 5.6 Security regression

A class, not a folder. Lives wherever the assertion most efficiently lives (unit, integration, e2e, smoke). Tagged `@security`. Includes:

- Anti-enumeration property tests
- Auth-gate and role-gate enforcement assertions
- CSRF presence on every state-changing verb (scenario test reused per state-changing route via shared helper; a property-test formulation with fast-check is an optional upgrade when the surface justifies it)
- Rate-limit boundary assertions
- Session cookie attribute assertions
- Secret and PII leakage regression tests (see §10)
- Testing-shortcut regression tests (§7.5)

Cross-cutting regression classes (cookie attributes, CSRF presence on every state-changing verb, anti-enumeration response equivalence) are implemented via shared assertion helpers in `tests/fixtures/` that the route's own test imports and invokes. The shared-helper shape keeps the per-route assertion cheap (one line per route) while preserving the property: a future refactor that mounts a sub-router outside the perimeter, or changes the cookie-issuance helper to drop a flag, fails the route's own test rather than only a centralized middleware test.

Beyond the per-route helpers, three invariant families are generated across every surface they can touch, so a newly added surface is covered by construction rather than by memory: anti-enumeration exists/not-exists response-equivalence pairs, the append-only mutation guards for ledgered tables (audit, tier, active-player, system-config), and the idempotency assertions for replayable surfaces (outbox, webhook delivery, grant application).

### 5.7 Testing-shortcut regression tests

A named sub-class of security regression. Any dev-or-staging-only code path that bypasses production behavior to enable tests (a persona-switch session, a bootstrap admin grant, token surfacing for email-flow tests, internal-event injection) is governed by the testkit / dev-bootstrap pattern (§7.5) and must land with the canonical required test set (§7.5.4).

### 5.8 Penetration testing

See §9.

### 5.9 Email testing

Outbound email is a layered surface: content, enqueue, transport drain, human inspection, and live deliverability each fail differently and are tested at the layer that isolates the failure. The platform sends transactional security mail (verification, password, claim) and operational notifications (membership, club, payment, Active Player) through one path: a service composes the message, enqueues an `outbox_emails` row through `communicationService`, and the worker drains the row through the `SesAdapter` seam. `StubSesAdapter` captures messages in memory for development, CI, and staging; `LiveSesAdapter` sends through Amazon SES in production. The `SES_ADAPTER` config invariant in `src/config/env.ts` defaults to `stub` below production and must be set to `live` in production (production boot fails fast if it is unset or not `live`), so mail is captured rather than sent below production and sent for real only in production.

The five layers and what each owns:

- *Content (unit + conformance).* Each email's subject and body are rendered from its committed template sidecar (seeded into `email_templates`), with a typed shaper computing the merge values and selecting the variant key. Unit tests cover the shaper catalog (every logical email shapes to its expected variant with exactly the declared merge fields) and the sidecar conformance gate (every registered variant has exactly one sidecar, every token declared and used); the render contract (token substitution, disabled-template suppression, missing-row failure) is pinned once over the email service. A test that asserts wording reads the sidecar through the shared render helper rather than restating body copy as a literal, per §15.2.
- *Enqueue (integration).* For each email, a test asserts the triggering service method enqueues one `outbox_emails` row with the correct recipient, idempotency key, and the rendered template content; that guard and no-op paths enqueue nothing; and that a member with no deliverable address (absent login email, deceased, soft-deleted, or purged) is skipped without raising.
- *Transport drain (integration).* `communicationService.processSendQueue` drains pending rows through `StubSesAdapter`, and the captured `sentMessages` carry the rendered message. The queue mechanics (retry with backoff, dead-letter at the retry ceiling, crash recovery, admin pause, scheduled deferral, and the `body_text` scrub after send) are exercised once over the shared path rather than per email.
- *Human inspection (development and staging).* Captured mail is readable without a real inbox. Every email-gated login page renders the simulated-email card (§16.4) with the flow's captured message and its clickable link, and the `/dev/outbox` viewer lists every captured message for notifications that have no host page. The in-process stub and these viewers serve as the catch-all inbox; they need no extra process and run identically in CI.
- *Deliverability (staging smoke and production).* The SES adapter staging-smoke (§7.2, §18) sends to the Amazon SES mailbox simulator: `success@simulator.amazonses.com` for a clean send, and `bounce@simulator.amazonses.com` and `complaint@simulator.amazonses.com` to drive the SES feedback path and confirm the feedback webhook records the outcome. Simulator mail consumes no sender reputation and no quota. Inbox placement, sender reputation, and SPF, DKIM, and DMARC alignment are observed in production through the SES reputation metrics and the feedback webhook.

Every promised email is covered by construction. The email catalog names each email by key, owning service, and idempotency-key prefix; the email-catalog sweep (§17.2) asserts each entry has a live enqueue site and a firing test, so an email that a service contract promises and the code never sends fails the suite.

Production differs in what the live path adds: it resolves `SES_ADAPTER=live` and sends through SES; it honors the SES suppression list, so an address that has hard-bounced or complained is withheld; it records bounce and complaint feedback through the webhook; and it carries the sender-identity, DKIM, and DMARC records that the stub path does not exercise. Production safety rests on the build-time strip and config guards (§7.1, §9.5); below production, the stub captures every message.

### 5.10 Real-claim crawl (development)

A development-only tier under `tests/dev/` that builds a claimed account for a real migrated record through `GET /dev/build-claim?as=<legacy_member_id>` and crawls its rendered surfaces (profile, honors, results, media, any co-led club), proving migrated real-world data renders and behaves once a member claims it — the person-neutral successor to the earlier fixed-person journey crawl. It is excluded from the default `npm test` run and is invoked by `npm run test:persona-crawl` (`RUN_PERSONA_CRAWL=1`) and by `./run_all_tests.sh --with-persona-crawl` (opt-in). It needs a loaded real dataset — the dev operator load, or a running staging stack targeted with `PERSONA_CRAWL_BASE_URL` — and skips on a fixture-only clone; it defaults to the numerically-lowest Hall-of-Fame honoree carrying a legacy link, or targets a specific record with `PERSONA_CRAWL_LEGACY_ID`. Every assertion keys on record ids and page structure, never on the claimed person's name or contact details.

---

## 6. Playwright strategy

### 6.1 One suite, with operator escape valve

Playwright is the project's browser automation toolchain. It serves one strategically scoped purpose: a lightweight suite that runs in CI on every push (small, fast, business-critical). The configuration file is `tests/playwright.config.ts`. Any browser-based test work beyond the lightweight suite (multi-browser parity, full navigation crawls, attack-flow exploration, role-matrix walkthroughs, multi-viewport regression, deeper accessibility audit beyond the automated `@a11y` coverage) is operator-invoked via the `browser-qa` skill (`.claude/skills/browser-qa/SKILL.md`), not via a standing test suite.

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
- Full browser navigation crawls (operator-invoked via browser-qa; the HTTP route-wiring crawl lives in §5.2)
- Multi-browser parity (operator-invoked via browser-qa when needed)
- Pentest attack flows (operator-invoked via browser-qa)
- Deeper accessibility audits beyond automated `@a11y` coverage (operator-invoked via browser-qa or manual review)

### 6.3 Tag taxonomy

A test may carry zero or more tags. Tags are how gates select within the suite (§11). Canonical tags:

- `@smoke`. The smallest, fastest, read-only-ish browser tests. They run inside the full local Playwright e2e suite (which boots a throwaway local stack and needs no AWS), and the same subset is selected by `npm run test:e2e:smoke` for a post-deploy browser smoke check against a deployed staging environment. This browser smoke subset is separate from the vitest staging-adapter smoke gate in §5.4, which exercises live-AWS adapters rather than the browser.
- `@security`. Security regression sub-class.
- `@a11y`. Accessibility regression via axe-core against business-critical surfaces; runs in CI on every push and in the full local suite (`./run_all_tests.sh --full`).
- `@migration`. Migration and onboarding regression. May live in integration or e2e; cuts across.
- `@quarantined`. Time-bounded flake quarantine; see §11.3.

### 6.4 Artifact privacy

Authenticated Playwright artifacts contain potentially sensitive material (session cookies, member display names, navigation paths, error content). The defaults (trace retain-on-failure, screenshot only-on-failure, no video) minimize unnecessary capture. Beyond the defaults:

- Storage state files (Playwright `storageState`) are sensitive and never committed. The `.gitignore` covers `tests/test-results/` and any `*.storageState.json` location. Generated storage state belongs in temp directories, deleted at suite end.
- Traces, screenshots, and HTML reports produced by failures are treated as potentially containing PII or secrets. CI upload of these artifacts, where configured, uses access-restricted storage (private artifact retention, not public links). Public CI logs do not embed the artifact path with a public URL.
- Tests that drive the `M_Login` flow do not include the password literal in command-line arguments, in `console.log` debug, or in screenshot-captured form fields. Password fields are typed via Playwright's `.fill()` which is not captured by trace inputs.

### 6.5 Auth pattern for E2E

Lightweight integration with auth uses the existing `tests/fixtures/personas.ts` helper, which composes a member, tier grant, historical-person link, and JWT into a `Persona` and exports the cookies via `context.addCookies()`. Local e2e can also obtain a real session cookie from the persona-switch route (`GET /dev/switch?as=<slug>`, active in development and staging, §7.5.1), never a fresh login chain that depends on receiving an email.

---

## 7. Environment parity, staging, and personas

### 7.1 The four environments

The platform targets four environments. Each has parity contracts that tests verify.

- *Local development.* Runs on the maintainer workstation via `./run_dev.sh`. SQLite at `./database/footbag.db`. Local stub adapters (JWT signing stub, SES outbox stub, media storage local-disk stub). The `src/testkit/` test scaffolding and the `src/dev-bootstrap/` conveniences are active under `FOOTBAG_ENV=development`.
- *CI.* Runs every test job (typecheck, lint, dependency audit, secret scan, conventions, harness self-check, unit, integration, db-load smoke, e2e, CodeQL static analysis, terraform) against ephemeral SQLite. No real AWS. Adapters are the same local stubs the workstation uses.
- *Staging.* The real AWS staging account (KMS, SES, S3, SSM, Lightsail). The `src/testkit/` test scaffolding and the `src/dev-bootstrap/` conveniences are active under `FOOTBAG_ENV=staging`. The staging-AWS adapter smoke suite (`tests/smoke/`) runs here, gated by `RUN_STAGING_SMOKE=1`.
- *Production.* The real AWS production account. `src/testkit/`, `src/dev-bootstrap/`, and the `src/internal-qc/` QC subsystem are excluded from the production image at build time (when `INCLUDE_DEV_SHORTCUTS=0` the Dockerfile strips all three subtrees and replaces `dist/routes/internalRoutes.js` with a null stub); boot-time guards in `src/config/env.ts` fail-fast if any `FOOTBAG_DEV_*` env var is set; `scripts/audit-dev-shortcuts.sh` returns zero against the production DB. `src/testkit/` and `src/dev-bootstrap/` are both permanent in source (build-excluded from prod, never deleted); `src/internal-qc/` is temporary: build-excluded from production, and its source subtree is deleted when the QC subsystem retires.

### 7.2 Adapter parity tests are mandatory

The three-test contract from `.claude/rules/testing.md` applies to every adapter (`JwtSigningAdapter`, `SesAdapter`, `MediaStorageAdapter`, `ImageProcessingAdapter`, `VideoTranscodingAdapter`, `SecretsAdapter`, `SafeBrowsingAdapter`, `CaptchaAdapter`, `HttpReachabilityAdapter`, `PaymentAdapter`, and any future adapter):

- Boot-time config test (`tests/unit/env-config.test.ts`): module-load fails fast when required prod-mode env vars are absent.
- Interface parity test (`tests/integration/adapter-parity.test.ts`): both implementations satisfy the TypeScript interface with identical observable output structure, exercised via an injected fake client.
- Staging-smoke test (`tests/smoke/`): hits real staging AWS via the assumed-role chain, gated by `RUN_STAGING_SMOKE=1`.

These tests describe permanent contracts. They are not sprint-scoped.

The staging-smoke leg applies to adapters that reach an external service over the network: `JwtSigningAdapter`, `SesAdapter`, `MediaStorageAdapter`, and `SecretsAdapter` (real AWS via the assumed-role chain) and `SafeBrowsingAdapter` (the real Google Safe Browsing API). The three internal docker-network adapters (`HttpReachabilityAdapter`, `ImageProcessingAdapter`, `VideoTranscodingAdapter`) carry boot-config and interface-parity tests but no workstation staging-smoke: their dependency is the internal `image` worker rather than an external surface the dev-against-staging (no-ssh) model can reach, and their failure mode is a noisy first-request error rather than silent IAM or network drift. Their wiring is covered by the interface-parity tests, the compose `image:4000/health` healthcheck that gates stack startup, and the e2e upload path.

`PaymentAdapter` carries boot-config and interface-parity tests but no workstation staging-smoke. Its live implementation reaches Stripe, but a smoke test that created a real Checkout session or delivered a real charge has side effects no read-only probe should: the live path is instead verified by the signed-webhook integration tests (signature acceptance, tamper rejection, and replay idempotency against the real verifier) and by the stub checkout pass-through that drives the same handler. Live-Stripe end-to-end exercise is the operator-run production-only verification in §7.7, not the smoke suite.

### 7.3 Staging-AWS adapter smoke entry point

`scripts/test-smoke.sh` is the canonical entry. It reads terraform output for environment-specific values (KMS key ARN, SES sender identity, S3 bucket name), exports the staging AWS profile and region, fetches operator-supplied SSM secrets via the assumed-role chain, and execs `vitest run tests/smoke/`. The operator runs it locally or from the staging host after any change to staging AWS runtime identity, KMS keys, SES identities, or IAM policies the app depends on. The entry point targets staging by default; `SMOKE_TARGET_ENV=production` points every environment-specific read (terraform dir, AWS profile, SSM path) at the production account for its one sanctioned use, the pre-cutover production-AWS wiring check the migration plan's production checklist requires. The persona-catalog smoke is staging-only (personas are never seeded in production) and gates itself off under a production target.

The script does not accept passwords or secrets as command-line arguments. Secrets that the smoke suite needs are read from SSM via the assumed-role chain or piped via stdin from approved secret-manager flows.

The suite is operator-only. It reaches live AWS with the operator's credentials and depends on workstation state only the operator holds: the staging runtime AWS profile, an initialized `terraform/staging/` tree, the `footbag-staging` ssh alias, and — for the persona-catalog check — the operator credential file the deploy scripts read. Every entry point fails fast with a plain message when these are absent, as do the deploy and activation scripts. A tester loses nothing by skipping it: `./run_all_tests.sh --full` deliberately excludes this suite (its summary row shows SKIP), and every other gate runs without AWS.

### 7.4 Staging personas: model and reset

Staging needs synthetic personas that cover the persona suite derived in §4.6 (the authentication-state, tier, ownership, resource-scoped-role, honor, migration / legacy-claim, and edge-identity classes). The personas exist for routine Playwright tests against staging and for operator-driven manual exploration of role-conditional UI.

Persona contract:

- Synthetic identities. Display names and email addresses are obviously test data (prefix `staging-test-` or equivalent), never resembling real member data.
- Verified-status pre-seeded. Routine login does not depend on receiving an email.
- Stored credentials. Passwords live in an approved secret channel (gitignored `.local/staging-personas.json`, or AWS Secrets Manager). Never committed.
- Tier and role grants. Assigned through the persona seed pipeline (`reason_code` carries `dev_persona_seed.tier_grant` and similar markers) so the prod-cleanliness audit catches them.

Reset semantics:

- An operator-runnable reset that re-creates the persona set from the gitignored or secret-manager seed file.
- The reset uses `bash scripts/manage-test-personas.sh` (or an equivalent extension), which pipes JSON via stdin per the existing pattern. No password as command-line argument.
- The seed runner is self-healing on the password hash: a persona kept across code-only deploys whose stored hash predates the current scheme is re-hashed in place on the next seed run, its accumulated rows untouched. Restoring a persona's fuller baseline (reverting tester-driven ledger changes) still needs the delete-and-reseed reset.

### 7.5 Test scaffolding and dev-bootstrap conveniences

Two env-gated subtrees hold all dev-or-staging-only code. Both are active under `FOOTBAG_ENV ∈ {development, staging}` and excluded from the production image at build time; they differ in lifecycle.

- `src/testkit/` is **permanent, first-class test infrastructure**: the persona harness (row builders, factory, canonical catalog, seed runner), the persona-switch route (`GET /dev/switch?as=<slug>`), the persona listing (`GET /dev/personas`), and the dev-router mount glue. It is never source-deleted; features keep shipping with tests against it after production launch.
- `src/dev-bootstrap/` holds the **permanent** registration-time admin email-allowlist bootstrap: a member registering in development or staging with an allowlisted email is promoted to admin. Like the persona harness it is never source-deleted; it is environment-isolated and excluded from the production image. It is the dev/staging peer of the production first-admin mechanism (the single-shot SSM-token claim), used at platform inception and thereafter only as a break-glass path for total admin loss.

No dev-or-staging-only code path lives outside these two subtrees. A test-only HTTP endpoint, a test-only middleware bypass, or a test-only persona-issue helper belongs in `src/testkit/` (the persona harness) or `src/dev-bootstrap/` (the admin bootstrap). Keeping each subtree self-contained and independent of the other keeps both excluded from the production image by a single build-time strip.

#### 7.5.1 Existing shortcuts

`src/testkit/` exposes the persona harness: seed plus `/dev/switch` and `/dev/personas`, active in development and staging. `src/dev-bootstrap/` exposes the register-allowlist bootstrap (see the subtree README for its env-var trigger and behavior). Each carries audit-marker provenance (`reason_code 'dev_admin_register_allowlist.admin_tier2'` or `'dev_persona_seed.tier_grant'`, `action_type 'admin.dev_register_allowlist_grant'` or `'testkit.persona_%'`, `created_by LIKE 'dev-shortcuts/%'`). The `dev-shortcuts/*` marker namespace is kept stable so the prod-cleanliness audit and existing tests continue to match.

#### 7.5.2 Required properties of a dev/staging-only affordance

A dev-or-staging-only affordance (a route, seeder, or bypass) satisfies all of the following:

- Lives in `src/testkit/` (persona harness) or `src/dev-bootstrap/` (admin bootstrap) as part of a self-contained subtree; both are permanent and never source-deleted.
- Is gated to development and staging: a route is mounted only under `FOOTBAG_ENV ∈ {development, staging}` with a production hard-guard; a seeder or bootstrap is triggered only by a `FOOTBAG_DEV_*` env var or a CLI flag and refuses to run in production.
- Carries audit-marker provenance the prod-cleanliness audit script detects (the stable `dev_admin_register_allowlist.*`, `dev_persona_seed.*`, `admin.dev_register_allowlist_grant`, `testkit.persona_*`, and `dev-shortcuts/*` namespaces).
- Has a boot-time fail-fast guard in `src/config/env.ts` that refuses to start when its trigger is set under `FOOTBAG_ENV=production`.
- Is excluded from the production image by the Dockerfile strip (`INCLUDE_DEV_SHORTCUTS=0` removes both `dist/testkit` and `dist/dev-bootstrap`).
- Lands with the canonical required test set (§7.5.4).
- Both subtrees are permanent test/bootstrap infrastructure, never source-deleted; they are kept out of production only by the build-time strip and the env guards.
- Documented in its subtree's README.

#### 7.5.3 Secret containment

Secret literals (a seeded persona password, any test-only signing key) live in a single source file, e.g. the persona password in `src/testkit/`. The password-leak regression test (§7.5.4) enforces that each literal appears in exactly one source file and that deploy scripts, helper scripts, and stored hashes do not embed it. The register-allowlist bootstrap carries no password literal: admins register through the real flow and set their own password.

#### 7.5.4 Canonical required test set

A new dev/staging-only affordance lands with all of:

- *env-guard test.* The module fails fast on import (or short-circuits) when `FOOTBAG_ENV` is not in `{development, staging}`. Model: `tests/unit/devShortcuts.initialAdminEmails.test.ts`.
- *production-guard test.* Its runtime trigger refuses to operate under `FOOTBAG_ENV=production`. Model: `tests/unit/env-config.test.ts` (the `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` boot fail-fast cases).
- *secret-leak test.* Any literal secret appears in exactly one source file, is not embedded in seed or deploy scripts, and is stored only as a hash in the DB. Model: `tests/integration/personaSeed.passwordLeak.test.ts`.
- *schema-coupling test.* The affordance's audit markers (`reason_code`, `action_type`, `created_by`) exist in schema and are populated correctly on every persisted side effect. Model: `tests/integration/register.routes.test.ts` (the register-allowlist grant markers).
- *flag-off test.* It does nothing when its trigger env var or flag is unset. Model: `tests/integration/register.routes.test.ts` (registration with an absent allowlist promotes no one).
- *idempotency test.* Re-running is safe and idempotent. Model: the persona seed runner, which skips slugs that already exist.
- *image-strip test.* The production Dockerfile removes both the `dist/testkit` and `dist/dev-bootstrap` subtrees from the production image. Model: `tests/unit/dockerfile-dev-shortcuts-strip.test.ts`.
- *initial-admins parity test* where applicable. Model: `tests/unit/devShortcuts.initialAdminEmails.test.ts`.

These tests describe long-term contracts on the affordance's safety properties, not sprint-scoped probes. They are tagged `@security`.

### 7.6 Test-only HTTP endpoints live behind the env-gated dev router

A test-only HTTP endpoint is permitted only when its handler lives in `src/testkit/` (or `src/dev-bootstrap/`) and is reachable solely through the dev router, mounted under `FOOTBAG_ENV ∈ {development, staging}` with a production hard-guard. The `/dev/switch` persona-switch route and the `/dev/personas` listing are the worked examples: their handlers and mount glue live in `src/testkit/`, and they are never mounted in production. What stays forbidden is a standalone request-time bypass whose logic escapes these subtrees or that is reachable in a production build (a hypothetical `/__test/login` or `/__test/seed` wired into a permanent router).

### 7.7 Production-only go-live verification

Some contracts cannot be exercised below production: the stub and staging paths deliberately avoid real side effects (real charges, real mail to real inboxes, real DNS and TLS, the real first-admin claim). These are lumped here as one operator-run pass, performed after the production deploy and before the surface opens to members. Each produces an observable artifact (a settled row, an audit row, a delivered message), not just a 200.

**Live email deliverability.** With `SES_ADAPTER=live`: a real send to an operator inbox lands in the inbox and passes SPF, DKIM, and DMARC at a major provider; a real bounce and a real complaint (the SES simulator addresses) write a suppression row and a feedback-webhook audit row; the suppression list then withholds a later send to that address.

**Live Stripe payments.** Live payments move real money, so they are verified in two stages — Stripe test mode against the real Stripe API, then a controlled live canary — before members can pay. The stub checkout (§16.5) and the signed-webhook integration tests (§7.2) cover the handler; this verifies the real Stripe surface the stub cannot.

1. Test-mode end-to-end: against test keys, drive real Checkout session creation and a real Stripe-signed webhook (`stripe listen` / `trigger`): success grants the tier, cancel and decline do not, the signature validates against the production verifier, a resent event does not double-grant, and the SCA / authentication-required and declined-card paths behave.
2. Live canary: with the live API key and webhook signing secret in Parameter Store and the live endpoint registered against the production domain, make one real low-value charge with a real card; confirm a settled `payments` row, the tier grant, the receipt email, and the audit row written by the signature-validation path; refund it and confirm the refund path leaves no dangling grant; replay the live webhook from the Stripe Dashboard and confirm no double-grant.
3. Reconciliation and controls: the `payments` table reconciles against the Stripe ledger (no missed webhooks — the Stripe event log against the rows), amount and currency are correct, card data never reaches the origin (hosted Checkout; no PAN in logs), live keys live only in Parameter Store, and payments can be disabled quickly if a defect appears. Open payments to members only after the canary and reconciliation pass; watch failed-payment and webhook-delivery-failure signals through the first days.

**Live front door.** The apex and `www` resolve through CloudFront over the real `footbag.org` certificate; direct-to-origin is refused (origin-verify); the first production admin is provisioned through the real SSM-token claim.

These are operator-run, not part of the automated suite — the production half of the adapter parity contract (§7.2), whose staging-smoke leg cannot reach the real charge, the real inbox, or the real zone.

### 7.8 Staging as the real-data test ground

Staging is loaded with the real footbag.org dataset and is the environment where real-data behaviour is validated: identity matching across real name, birth-date, and email variance; legacy-account claims; historical-person rendering; member search at real scale; and migration and cutover rehearsal. Synthetic fixtures deliberately under-represent the messiness these surfaces must survive (near-duplicate names, shared addresses, diacritic and right-to-left names, inconsistent date formats, collision clusters), so this validation runs against the real data on staging rather than being approximated in dev.

**Take best advantage of staging by putting the right layer there.** Following the test pyramid and the testing quadrants, the fast technology-facing layers stay low in dev and continuous integration, and the business-facing, production-like, and real-data activities that dev cannot represent faithfully move to staging (the "shift-right" layers). Staging is not where unit or route-level checks are re-run; it is where the things that genuinely need production-like config and real data happen:

- Real-data identity-matching and legacy-claim verification, and whole-population reconciliation over the loaded dataset.
- Exploratory and session-based testing, and user-acceptance testing, against realistic data by a human tester.
- Full-scale accessibility against real content (real names and addresses surface diacritic, length, and bidi edge cases synthetic personas miss).
- Migration and cutover rehearsal, and the release-readiness checks that gate go-live.
- Integration against production-like adapters and config, and the staging-safe security probes (§9.2).

Dev and continuous integration keep the unit, route and service integration, the route-by-persona authorization matrix, and the security-regression floor — fast, deterministic, synthetic-only.

**Environment-and-data boundary (absolute).** The real dataset lives only on staging and on the maintainer's local operator load. It never flows into a committed fixture, snapshot, seed file, trace, or any continuous-integration run, and never into application or test logs, screenshots, or a bug-report attachment. Every committed test artifact stays synthetic, unchanged from §2.1 and §10. Real member data on staging never travels downward into the repo or the shared pipeline.

**Protection model.** Staging matches production's network posture — a public site with no edge access control — because parity with production and operational simplicity are first-order goals, and a staging-only gate would break both. Real member data on staging is protected by the same mechanisms that protect it in production: the application's own authentication and the public-versus-member visibility model (public surfaces expose only public historical records; member data requires a session). The environment is additionally kept out of search indexes and its address is not published. The anonymous persona switch (§7.5, §7.6) remains the tester's full-access affordance. The residual exposure this leaves is a risk the maintainer, as risk owner, accepts; data masking and a staging edge gate were both considered and deliberately not adopted. Any IFPA authorization for using real member data in testing is a private governance record kept out of the repo, and no committed doc names the staging address.

**Tester procedure for real-data testing.**

- Reach staging through the privately shared preview address (never a committed link). Use the persona grid and switch for role-conditional testing, and the loaded real dataset for real-data testing.
- Verify migrated data renders and behaves correctly by claiming a real record and walking its profile, results, honors, and media across the site. Claim any record from the deterministic claim-risk strata below rather than one fixed person.
- Exercise the legacy-claim surface across its risk classes with the deterministic strata sample (linked-with-email, paid-tier evidence, honoree, same-name disambiguated only by birth date, no-email, bare collision stub, and historical-person-without-account): for each sampled row, register on staging with the row's address, read the captured mail on the outbox viewer, and confirm the claim wizard does exactly what the sample expects, including the enumeration-safe outcomes for an absent and an already-claimed record.
- Validate whole-population invariants by query, not by sampling: loaded counts reconcile against the source minus the held-out and excluded cohorts; no claimed account lacks its claim audit row; no historical-person link points at a missing account; every stored email is lowercased.
- Never rehearse a deceased-member flow against a real person's record — use the seeded persona for that.
- PII discipline: never paste real member data into a bug report, screenshot, trace, chat, or any shared or committed artifact. Report a real-data defect by record identifier and structural description, never by real name, email, address, or birth date. Test output is treated as potentially public (§2.1, §10.6).

---

## 8. Migration and onboarding testing

The validation gates in `docs/MIGRATION_PLAN.md` §24 and the operational readiness rules in `docs/MIGRATION_PLAN.md` §28 are canonical for migration and onboarding. This section adds the playbook framing for deriving migration tests and the constraints that bind to the canonical content there.

### 8.1 The migration anchor

For surfaces in the legacy data pipeline that have no direct user story success criterion, anchor on the relevant `docs/MIGRATION_PLAN.md` validation gate instead of a `docs/USER_STORIES.md` entry. The same trace-to-intent principle applies; the gate text identifies what the test must prove.

### 8.2 Identity claim and confidence levels

Legacy-member identity claim has three confidence outcomes (high, medium, low) plus the no-match case (per `docs/MIGRATION_PLAN.md`). Each outcome class anchors its own tests:

- *High confidence:* claim completes; legacy-person link is established; historical record links carry over to the member; subsequent visits use the active member account. Derived assertions cover positive flow plus the negative ("no claim is silently accepted on weak match").
- *Medium confidence:* claim is queued for manual review; user sees an enumeration-safe message; admin queue receives the entry. Derived assertions cover the queueing plus the absence of any indication to the user that disambiguation is in progress.
- *Low confidence and no match:* claim is rejected; user sees an enumeration-safe message; no link is created; no information about candidate identities is leaked.
- *Name-change and alias edge cases:* historical records held under a different name resolve correctly; aliases are matched per the canonical alias table; no false-positive links cross alias boundaries.
- *Date-of-birth conflict:* the claim links regardless of any date-of-birth discrepancy (the comparison never blocks); any non-identical outcome (near-miss or mismatch) enqueues an admin review item on both the legacy-account and direct historical-record claim paths; the member-facing response is identical whether the date matches or conflicts (the conflicting date and the admin flag never leak to the member); only an admin can dismiss the item.

### 8.3 Club affiliation and cleanup

Club affiliation tests cover the cases enumerated in `docs/MIGRATION_PLAN.md` (legacy affiliations that point to known clubs, legacy affiliations that point to ambiguous clubs, members who appear in multiple clubs, members who appear in no clubs after import). Club cleanup is a state-machine surface; tests are scenario-based per §4.4 with property tests for invariants ("a member is always a member of zero or more confirmed clubs at any point in the cleanup state machine").

### 8.4 Loader pipeline regression

The db-load smoke CI job (§5.3) runs the loader pipeline against fixed fixtures on every CI build. Row-count and shape assertions catch loader regressions. The fixtures themselves are synthetic. Real legacy data is never committed as test fixtures.

Two data-integrity concerns sit beside the loader's row-count regression. *Idempotent re-import:* running the loader a second time against the same input must be safe — no duplicate rows, no crash, no partial-state corruption — the realistic scenario of a re-triggered pipeline after a partial failure; the smoke gate covers a single run, so a re-run assertion is the guard for this. *Backup and restore integrity:* a backup is only as good as its restore, so a restore drill — restore a snapshot into a scratch database and assert schema integrity, row counts against the source, and WAL-checkpoint consistency — proves a mid-write or mid-checkpoint snapshot is not silently unrestorable, before a real disaster-recovery event needs it.

### 8.5 Synthetic data in dev and CI; real data on staging

Migration tests in dev and continuous integration use synthetic legacy records that model edge cases without exposing real personal data, and every committed fixture stays synthetic. Real-data validation runs on the staging real-data test ground (§7.8): the full loaded dataset exercises identity matching, claims, and rendering there. Raw legacy PII is never committed as a test fixture, never appears in a snapshot, screenshot, trace, log, or CI artifact, and never travels downward from staging into the repo or the shared pipeline.

Two data tiers run the suite. The committed synthetic fixtures cover the great majority of it: `npm test`, the `db-load-smoke` loader gate, and routine route, service, and e2e tests run on them with no real data. A small subset needs real, maintainer-only member data — the gitignored membership roster (`legacy_data/membership/inputs/membership_input_normalized.csv`) and, for the legacy-import validation class, the legacy-site member dump. Two opt-in gates are such tests: the real-claim crawl (`--with-persona-crawl` / `npm run test:persona-crawl`) builds a claimed account for a real record and crawls its surfaces, and the read-only invariant gate (`--with-realdata-invariants`) runs whole-population reconciliation and referential-integrity checks over the loaded data, emitting counts and pass/fail only — never names or emails. Both run from the full operator load (or, re-pointed by env var, against staging) and skip on a fixture-only clone. A tester who must run a real-data test obtains access to that maintainer-owned PII handoff from the maintainer who holds the legacy-data distribution; the data stays minimized and access-controlled, and never lands in a committed fixture, snapshot, trace, or CI artifact.

### 8.6 Migration tests verify the migration plan, not the loader

A loader-pipeline test that asserts only what the loader implementation happens to do is insufficient if the migration plan says the loader should do something different. The migration plan is the intent; the loader is the implementation. Tests verify intent. If loader behavior diverges from the migration plan, the test fails and the loader is fixed, or the migration plan is escalated to the maintainer for review and possible update.

### 8.7 Edge-case verification against the real import

The synthetic-fixture suite proves the code; only the real import proves the data.
After an operator load, human verification runs on two complementary levels:

- **Whole-population invariants, queried not sampled.** Aggregate reconciliation
  against the source dump (loaded row counts equal source counts minus the held-out
  and excluded cohorts, exactly), and read-only property queries over every row (no
  claimed account without its claim audit row, no historical-person link pointing at
  a missing account, every stored email lowercased). A property that must hold for
  all rows is checked with a query over all rows; samples never prove universals.
- **Stratified behavioral sampling.** The claim surface's risk classes come from the
  data itself: linked accounts with an email, paid-tier evidence, honorees, same-name
  groups disambiguated only by birth date, accounts with no email, bare collision
  stubs, and historical persons with no account. The read-only
  `legacy_data/member_data_scripts/sample_legacy_claim_strata.py` samples each
  stratum deterministically into a git-ignored CSV stating who to register as, with
  which email, and the expected wizard behavior; the tester registers on staging
  against the real load (or a maintainer local load) with the row's email, reads
  captured mail on `GET /dev/outbox`, and confirms the wizard does exactly what the
  row says. Adversarial picks extend the strata: mojibake and
  accented names, implausible and near-miss birth dates, and the enumeration probe (a
  real identity and an absent one must be indistinguishable from outside).
- Deceased-member suppression is exercised via the seeded persona only; those flows
  are never rehearsed against a real person's record.

### 8.8 Source-of-truth cutover testing (the reusable pattern)

Several content domains follow one lifecycle: committed inputs (JSON sidecars or
CSVs) seed the database pre-go-live; at cutover the persistent production database
becomes the sole source of truth and an admin surface becomes the only authoring
path. Curator media, email templates, and the freestyle dictionary all follow it.
Every domain on this lifecycle carries the same five test legs:

- **Conformance drift gate** (unit): the committed inputs and the code registry
  describe the same set — every registered key has exactly one input and vice
  versa, and every merge field or invariant the code declares is honored by the
  input (email templates: `tests/unit/emailTemplateSidecars.test.ts`).
- **Seeder contract** (pytest, `legacy_data/tests/`): fresh-schema seed, idempotent
  re-run, orphan cleanup on input removal, and malformed-input refusal before any
  write.
- **Guard fail-fast** (pytest): the seeder or rebuild refuses a database carrying
  the in-database post-cutover marker before any mutation, layered over the env,
  path, and host-file guards (`legacy_data/tests/test_db_cutover_guard.py`).
- **Admin authoring** (integration): the post-go-live authoring surface is audited
  and validated, and an edit is used by the very next read or send with no reseed.
- **Durability through a data-preserving deploy**: domain rows survive
  `scripts/deploy-migrate.sh` with no seeder run. These tests land together with
  that script; the other four legs do not wait for it.

---

## 9. Security and penetration testing

The platform's security testing strategy has three classes of automated and tooled testing plus a fourth class of third-party periodic pentest before major launches. The OWASP WSTG (Web Security Testing Guide) is the canonical reference for techniques; the OWASP ASVS (per §3.4) is the canonical reference for verification requirements. WSTG describes how to test; ASVS describes what to verify.

### 9.1 Regression-grade automated security tests

These run in normal CI. The baseline adversarial list in `.claude/rules/testing.md` (oversized payloads, unicode mischief, SQL injection, XSS, timing attacks, race conditions, token replay) plus the per-route baseline (auth gate, authz gate, anti-enumeration, rate-limit, CSRF) is the floor. Threat-aware additions per the STRIDE framework (§4.2) cover any cases beyond the floor on catastrophic-severity surfaces.

Tagged `@security`. Lives where the assertion most efficiently lives (unit, integration, or e2e lightweight).

Static taint analysis over `src/` is part of this gate: a pinned CodeQL (or Semgrep with the project rule pack) pass runs pre-merge so injection and unsafe-sink classes are caught mechanically rather than by manual review alone.

### 9.2 Lightweight staging-safe pentest

A small set of probes that run safely against staging. Three of them — auth-gate enforcement, anti-enumeration response equivalence, and the dev-surface environment contract — run inside the post-deploy smoke (`scripts/smoke-security.sh`, invoked by both deploy scripts) and block deploy promotion there (the post-deploy smoke gate, §11.1 The seven gates). The anti-enumeration probe is deliberately not read-only: its registered branch issues a real reset token and enqueues mail to a seeded non-deliverable test address, so it runs against staging and development targets only, never production. The no-stack-trace contract cannot be probed read-only against a live target (nothing deployed can be made to 5xx on demand), so it is enforced in CI by the forced-throw integration test in the security regression floor. The remaining probes (security headers, contact-field leakage) and the wall-clock timing measurements report security signal that the maintainer reviews without blocking.

Probes:

- Security headers present and correct (CSP, X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, Referrer-Policy).
- No stack traces in 5xx responses (CI-enforced by the forced-throw integration test; no read-only request can induce a 5xx on a live target).
- Dev-surface environment contract: the dev/test harness (`/dev/*`) and internal QC tooling (`/internal/*`) are absent (404) in production and present on staging, where persona seeding depends on them. The production first-admin route `/admin/bootstrap-claim` is a real production route and is not part of this surface. (The boot-time guard in `src/config/env.ts` rejects the dev-admin allowlist var in production; the probe verifies the deployed surface operationally.)
- Auth-gate enforcement on every member-only and admin-only route (probe attempts unauthenticated access; expects 302 or 403).
- Anti-enumeration timing equivalence within tolerance on login, password-reset, email-verification, and claim-lookup surfaces.
- Public surfaces never return contact fields (probe asserts no email-like or phone-like patterns in public response bodies).

### 9.3 Heavyweight human-invoked pentest

Invoked via `npm run test:pentest:heavy`, which boots a throwaway local stack and runs black-box HTTP probes against it over the same network surface an attacker reaches. Attack flows that require a real browser session (role-escalation through the UI, session-fixation, token-replay, login-rate-limit bypass via header spoofing) are operator-invoked via the `browser-qa` skill rather than a standing Playwright suite. The scriptable probe set covers:

- A security-header walk across every deployed route (walks the route table and asserts the defensive header set on every reachable response, including redirects and 404s).
- Origin-pin CSRF coverage: every state-changing route refuses a foreign Origin and a forged Referer, while a same-origin request reaches the handler.
- Open-redirect coverage on the login returnTo parameter: an off-site target is neither echoed into the page nor turned into an off-origin redirect, while a safe site-relative path is preserved.
- Login rate-limit coverage: a burst of failed logins draws a 429 with Retry-After, while an early attempt still receives the ordinary failure response.
- SSRF coverage on member-supplied external URLs: loopback, unspecified-address, cloud-metadata, private-range, and link-local targets are refused, while a benign public link is accepted.
- Upload-abuse probes (avatar, media, freestyle music) targeting MIME confusion, polyglot files, oversize bodies, and path-traversal filenames.
- Session-cookie attribute coverage: the session cookie is HttpOnly, sets SameSite, and is Secure under https.
- Internal-surface probing: the `/internal/*` admin tooling redirects an unauthenticated request to login and returns 403 to an authenticated non-admin; the shared-secret `/ipc/*` channel rejects a missing and a wrong secret alike, so the two are indistinguishable.
- Audit of any reachable dev-only scaffolding callsite (persona harness / dev-bootstrap) from staging or production (the audit script in §9.5 is the canonical mechanism).
- Report-only legs for maintainer triage rather than pass/fail gates: an OWASP ZAP passive baseline against the local stack or a dedicated pentest staging environment, an opt-in OWASP ZAP active scan, and an opt-in dependency / supply-chain scan (`npm audit` plus an equivalent third-party scanner). Findings feed regression tests per §9.6.

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

### 9.5 The production-residue audit is the canonical zero-residue gate

`scripts/audit-dev-shortcuts.sh` queries the residue-marker counts in the production DB (`reason_code` under `dev_admin_*`, `action_type` under `admin.dev_*_grant`, `created_by` under `dev-shortcuts/*`, and the persona-harness markers `dev_persona_seed.tier_grant` / `testkit.persona_*`) and exits non-zero if any count is positive. It is the canonical gate that must pass before any production deploy. It also runs as a periodic check in the heavyweight pentest suite to detect residue from any future testing shortcut that might have leaked into the production DB.

The production build must:

- Strip both the `src/testkit/` and `src/dev-bootstrap/` subtrees from the production image (the Dockerfile `INCLUDE_DEV_SHORTCUTS=0` default removes both).
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

- `.local/` (including `initial-admins.txt`, `staging-personas.json`, and equivalent).
- `tests/test-results/` (Playwright trace and screenshot output).
- Any storage state file produced by Playwright auth setup.
- `.env.local`, `.env.staging`, `.env.production` (real secrets never committed).

The password-leak regression test (§7.5.4 plus §10.4) enforces that secret literals do not propagate beyond their single source file.

### 10.4 Single-source secret containment

Secret literals (the persona password, any test-only signing key, any test-only token salt) live in exactly one source file each: the persona password in `src/testkit/`, any other test-only literal in its own guarded module. The secret-leak regression test (§7.5.4) asserts the literal appears in exactly one file and that deploy scripts pipe secret content via stdin rather than embedding the literal. The register-allowlist bootstrap carries no password literal: admins register through the real flow.

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
- *CI on PR.* Same as pre-PR plus db-load smoke plus lightweight Playwright plus staging-safe security checks plus per-PR dependency review (`actions/dependency-review-action` over the PR diff, alongside the whole-tree `npm audit`). Sub-10min. Blocks merge.
- *On-demand deep audits.* Mutation testing on the safety-critical short list (auth, privacy filters, migration matchers, role gates), dependency audit, header check across the route table, production-residue audit against the production DB. Operator-invoked when a covered surface changes or ahead of a production deploy; a scheduled nightly trigger is optional future depth on top of the required on-push CI gate. Reports, does not block.
- *Post-deploy smoke gate.* Runs automatically inside both deploy scripts (`scripts/smoke-local.sh` + `scripts/smoke-security.sh`) against the deployed target: health and route smoke plus the blocking security probes — auth-gate enforcement, anti-enumeration response equivalence, and the dev-surface environment contract (dev harness present on staging, absent in production). Sub-1min. Blocks deploy promotion on failure. Before a production deploy, the deploy script first runs this same gate against staging and aborts on failure. Distinct from the staging-AWS adapter smoke (§5.4), which exercises live-AWS adapters, not the deployed HTTP surface.
- *On-demand heavyweight pentest.* Human invokes (`npm run test:pentest:heavy`). May include OWASP ZAP baseline, upload-abuse probes, internal-route probes, header checks, dependency scanning. Browser-driven attack flows are operator-invoked via the `browser-qa` skill. Never runs against production unless explicitly authorized.
- *Periodic third-party pentest.* At major launches (per §9.4). Reports findings; findings produce regression tests at the cheapest appropriate layer.

The db-load smoke gate runs the loader pipeline against fixed fixtures on every CI-on-PR build; it carries no path filter, so a loader regression is caught regardless of which files a change touches. Class-specific gating (running a gate only when the surface it covers has changed) is a pattern the suite may adopt for other gates as tooling permits.

### 11.2 Selection mechanisms within a gate

- *Test impact analysis* for the local fast loop. `vitest --changed` plus git-diff-driven file selection. The fast loop runs only tests that touch changed code paths.
- *Tag-based selection* across all gates. The tag taxonomy in §6.3 (`@smoke`, `@security`, `@a11y`, `@migration`, `@quarantined`) drives which tests run at each gate.
- *Risk-severity-based selection* for the on-demand deep audits. Catastrophic and high surfaces (per §3) run in CI on every push. Medium and low surfaces run when the surface changes; a periodic sweep is optional future depth on top of the on-push gate.
- *Parallel sharding* where the test runner supports it. Vitest workers for unit and integration; Playwright workers are constrained to 1 by SQLite WAL serialization, so Playwright sharding happens via separate processes against separate ephemeral databases.
- *Skip-on-unchanged-inputs* where tooling supports it. Layers whose inputs have not changed since the last green can be skipped.

### 11.3 Flake discipline

Tests that fail intermittently are quarantined, not ignored. The quarantine mechanism:

- A flaky test is tagged `@quarantined` with a comment giving the reason and a tracking entry in `IMPLEMENTATION_PLAN.md` (per §4.5 gap-tracking format).
- Quarantined tests have a 7-day deadline. The maintainer is notified at the deadline. The test is either fixed or the underlying surface is patched.
- Quarantined tests do not block merge but are reported as a separate CI signal.
- The quarantine count is a health metric. Sustained growth indicates test-suite or surface decay and triggers a maintenance pass.
- `.skip`, `.todo`, and `xit` remain forbidden per `.claude/rules/testing.md`. Quarantine is the only legitimate skip path, and it is time-bounded.
- Test retries to mask flake are not used. A test that needs retries to pass is a test that does not deserve to pass.

### 11.4 What blocks what

- *CI on PR* blocks merge.
- *Post-deploy smoke gate* blocks deploy promotion (the production deploy script first runs the same gate against the staging deployment and aborts on failure).
- *On-demand deep audits* report only. A failing audit does not block in-flight PRs but does block the next intentional production deploy until investigated.
- *On-demand heavyweight pentest* reports only. Findings produce regression tests (§9.6).
- *Periodic third-party pentest* reports only. Findings produce regression tests and may block a major launch if a catastrophic-risk finding is open.

### 11.5 Token-efficient tiered execution

The project is AI-assisted. Every test-run output is tokens in the agent's context and dollars on the bill. Running the full suite on every edit cycle wastes both. The Vitest features below let an AI (or human) match scope to need.

| Tier | Trigger | What runs | Command |
|---|---|---|---|
| Inner loop | During edit, focused work | Single file, or tests that import the changed source | `npx vitest run path/to/file.test.ts` or `npx vitest run --related src/changed.ts` |
| Pre-commit | Before commit | Tests touching files in the uncommitted diff, plus lint + typecheck | `npx vitest run --changed && npm run lint && npx tsc --noEmit` |
| Pre-push | Before push to remote | Full unit + integration suite | `npm test` |
| CI on push | Automated | Full suite + `audit-ci --moderate` + full Playwright e2e + CodeQL | CI workflow |
| On-demand deep audits | Operator-invoked when a covered surface changes | Mutation short list, header walk, production-residue audit, optional ZAP | `npm run test:pentest:heavy` and per-audit scripts |
| Post-deploy smoke gate | Every staging or production deploy | `scripts/smoke-local.sh` + `scripts/smoke-security.sh`, invoked by the deploy scripts | Automatic |
| Staging-AWS adapter smoke | After changes to staging AWS identity, keys, or IAM | `npm run test:smoke` | Operator-invoked |

**Catastrophic-surface override.** When edits touch auth (`src/services/identityAccessService.ts`, `src/middleware/auth*`, session helpers), privacy boundaries (member-PII reads, anti-enumeration surfaces), or future payment code, run the full test files for those surfaces in the inner loop even if `--related` would skip them. Catastrophic surfaces never skip on inner-loop convenience.

**Compact output.** For runs whose output an AI agent will read, `--reporter=dot` keeps logs small. Default-reporter runs are fine for interactive use. The compact reporter prints one character per test (`.` pass, `F` fail) plus a summary; failures are still surfaced with full stack and assertion detail.

### 11.6 Secrets and CI

CI logs, CI artifacts, Playwright reports, traces, screenshots, and failure output are treated as potentially public unless explicitly restricted. Tests that require remote credentials receive them through GitHub Actions secrets, SSM, or an equivalent approved secret-management mechanism. Credentials are never echoed, never serialized into artifacts, never embedded in shell command lines. The password-leak regression test (§7.5.4) and the production-residue audit (§9.5) together enforce this property for the dev/staging-only surface; equivalent discipline applies to any other secret introduced into the CI environment.

---

## 12. Coverage and selective heavier tooling

### 12.1 Coverage signals

Coverage thresholds set in `vitest.config.ts` are floors per `.claude/rules/testing.md`. They are a leading indicator of test absence, not of test quality. A surface at one hundred percent line coverage with no adversarial tests is still under-tested.

Overall coverage is an aspirational, best-effort goal, not a fixed percentage; the enforced ratchet floor (fail-on-drop) lives in `vitest.config.ts`. Catastrophic-severity surfaces (auth, session, member privacy, payments, identity claim) target 100% coverage and are verified by inspection of the tests themselves, not just by the coverage number. For general code, 100% is not a blanket target; forcing coverage of error branches and dead-code paths produces contrived tests without catching real bugs.

Quarantine count (§11.3) is a separate signal; sustained growth is a maintenance issue.

Uncovered branches are also a read-targeting signal: they are where both the test suite and a review pass go blind, so they are the priority surface for the next adversarial review.

### 12.2 Selective heavier tooling

Property-based testing (fast-check) and mutation testing (Stryker) are not universal tier-promotion requirements. They are tools to reach for when a specific surface justifies the cost.

- fast-check: useful for validators, encoders, anti-enumeration helpers, idempotency invariants, and security-critical pure functions. Install and adopt on the slice that introduces the first property-shaped surface; do not pre-install for hypothetical future need.
- Stryker: useful for security-critical pure functions and parsers when there is evidence the existing test suite is structurally weak on that module. Run on-demand against the specific module, not the whole codebase.

Decisions to adopt either tool, and the specific surface they target, are tracked in `IMPLEMENTATION_PLAN.md`, not here.

---

## 13. AI-assisted testing governance

When an AI agent (Claude Code or any other) writes, reviews, or modifies tests for the Footbag platform, it operates under the same standards as a human contributor. These rules exist to prevent the AI failure mode of "test what the code does rather than what the user story says."

The standing AI obligations (no silent skips, no test that blesses current behavior, no canonical-doc modification to fit implementation, regression test at the cheapest layer for every fixed bug, bootstrap code is not a design signal, no automated runs that mutate staging or production, no fetching real member PII) come from `.claude/rules/testing.md` and `.claude/rules/doc-governance.md` and apply to AI agents unchanged.

### 13.1 Read the user story verbatim

Before writing tests for a surface, the AI reads the relevant `docs/USER_STORIES.md` entry verbatim (full `Access:`, `Story:`, and `Success Criteria:` blocks). If the success criteria are unclear or appear to conflict with implemented behavior, the AI escalates to the human rather than guessing.

### 13.2 Human review is required

No AI-written test lands without human review. Branch protection enforces this at the merge gate. The human review covers:

- The user story success criterion has been understood and is reflected in test names and assertions.
- For catastrophic-severity surfaces, applicable STRIDE categories (§4.2) are covered, and the verification floor (§4.5) is met or its gap is tracked in `IMPLEMENTATION_PLAN.md`.
- Technique selection is appropriate.
- No bootstrap-stub code is cited as design signal (per `.claude/rules/doc-governance.md`).

### 13.3 The AI applies this document the same way a human does

The AI applies the test-design principles (§4), risk classification (§3), the catastrophic-surface verification floor (§4.5), the coverage and selective tooling guidance (§12), and the strategic anti-patterns (§15.2) when writing tests. It does not skip steps because they are tedious; the steps exist to keep test quality high. It also does not invent ceremony beyond what this document and `.claude/rules/testing.md` require.

---

## 14. Accessibility and explicit deferrals

### 14.1 Accessibility as a first-class layer

The platform targets WCAG 2.1 AA as the baseline accessibility conformance level.

Accessibility testing is a named test layer, not an afterthought. The layer combines:

- *Automated checks* via `@axe-core/playwright` (per §15.3.1) in the lightweight Playwright suite, tagged `@a11y`, against the WCAG 2.1 AA rule set. Runs in CI on every push and in the full local suite (`./run_all_tests.sh --full`); catches automated-detectable regressions early. The axe scan today reaches the high-traffic anonymous public pages; the authenticated member and admin surfaces (member dashboard, profile edit, club edit, admin panels) are not yet axe-scanned and are the coverage to extend next — a member-only form is exactly where form-label and ARIA violations are likeliest to hide.
- *Smoke-tagged automated checks* (`@smoke @a11y`) on a small subset of high-traffic public pages (home, member dashboard, login, register, public event detail, results page) that the post-deploy staging browser smoke check (`npm run test:e2e:smoke`) also covers, separate from the vitest staging-adapter smoke gate (§5.4).
- *Manual audit* by the maintainer or an external accessibility reviewer periodically and before major launches. The third-party periodic pentest engagement (§9.4) may include accessibility scope.
- *Deeper audit beyond automated coverage* (full keyboard-only journey, screen-reader flow validation, cognitive accessibility) is operator-invoked via the `browser-qa` skill.

### 14.2 Per-surface accessibility assertions

Surfaces with user-facing UI carry accessibility assertions:

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

### 15.2 Strategic anti-patterns

Operational anti-patterns (no DB mocking, no framework mocking, no timestamp leakage, no global state leakage between files, no silent skips, no "tested manually," no tests on the dev DB) are enumerated in `.claude/rules/testing.md` and apply to every test. (The "tested manually" anti-pattern bars substituting a manual check for a required automated regression test; the operator-driven exploration this document prescribes is an additive layer whose findings land as regression tests.) This section adds the strategic anti-patterns that follow from the playbook discipline.

- *Tests that assert what the code does rather than what the user story says.* A test that documents implementation behavior without anchoring to a success criterion blesses accidental behavior and provides false confidence.
- *Playwright tests for every business-rule branch.* Business rules are covered by unit and integration tests; Playwright is for browser-only assertions and business-critical happy paths plus the minimal negative cases that only a browser can reveal.
- *Brittle locators.* CSS selectors that depend on auto-generated class names, XPath that depends on DOM structure, and text selectors that depend on copy phrasing are brittle. Prefer role and accessible-name selectors per Playwright best practice.
- *Asserting on exact prose or wording.* Tests that pin rendered copy with patterns like `expect(res.text).toContain('exact heading')` or `not.toMatch(/old phrase/)` turn every copy edit into a test failure and train reviewers to ignore the suite. Assert structural intent instead: counts of expected elements, presence of IDs and classes, anchor href shape, response status, data attributes. When a literal string is the contract (an SEO meta description, an explicit error message), production code exports the constant and the test imports it rather than duplicating the literal. Email subjects and bodies follow this rule: they come from the committed template sidecars of §5.9, which the sender renders and a test reads through the shared sidecar render helper.
- *Arbitrary sleeps.* `await page.waitForTimeout(N)` masks race conditions. Wait on observable conditions (selector visibility, network response, app state).
- *Depending on real production data in committed or CI tests.* Committed and continuous-integration tests never read or assume real member records; they are synthetic-only and deterministic. Real-data testing is the separate, human-driven staging activity in §7.8, whose output is governed by the PII discipline there and never becomes a committed or CI test.
- *Depending on real email receipt for routine tests.* The persona switch and the simulated-email card exist to avoid this. Routine tests do not poll a mailbox.
- *Making staging tests destructive by default.* Staging tests are read-only or explicitly idempotent and audited per §5.4.
- *Running penetration tests against production without explicit authorization.* Forbidden per §9.3 and §9.4.
- *Attacking third-party services.* Forbidden per §9.3.
- *Using brute force against real accounts.* Forbidden per §9.3.
- *Weakening tests to make them pass.* If a test fails, the code is fixed. The exception is when the test was wrong about intent; then the user story is updated first, with explicit human consent, and the test is rewritten against the corrected story. Weakening assertions to admit failing code is forbidden.
- *Overusing snapshots.* Snapshot tests are brittle. Prefer explicit assertions on shape or content. Snapshots are acceptable only when the assertion structure is genuinely too large to enumerate (rare).
- *Ignoring migration edge cases.* Migration testing covers all four confidence outcomes per §8.2; ignoring medium or low confidence cases is forbidden.
- *Blurring groups and committees into clubs.* Groups and committees (when implemented) are distinct from clubs per `docs/USER_STORIES.md` and `docs/DESIGN_DECISIONS.md`. Tests preserve the distinction.
- *Introducing a test-only HTTP endpoint outside `src/testkit/` or `src/dev-bootstrap/`.* Forbidden per §7.6.

### 15.3 Tooling appendix

#### 15.3.1 Toolchain

The platform's testing toolchain consists of:

- *Vitest.* Unit and integration test runner. `npm test` excludes `tests/smoke/`, `tests/e2e/`, and `tests/dev/`. The canonical scripts are `npm run test:unit`, `npm run test:integration`, `npm run test:smoke`, `npm run test:e2e`, `npm run test:e2e:smoke` (the `@smoke` browser subset for post-deploy staging, §6.3), `npm run test:persona-crawl` (§5.10), `npm run test:strong-hash` (the strong-password-hash and login-timing checks), `npm run test:pentest:heavy` (§9.3), `npm run test:coverage`, `npm run test:pre-pr`, and `npm run test:all`.
- *Supertest.* HTTP assertion helper for integration tests.
- *better-sqlite3.* Real SQLite per test file; no mocking. Per `tests/CLAUDE.md`.
- *@vitest/coverage-v8.* Coverage measurement. Thresholds set in `vitest.config.ts`.
- *Playwright.* Browser automation. Config at `tests/playwright.config.ts`. Single-worker chromium-only headless lightweight suite.
- *Test fixtures.* `tests/fixtures/factories.ts` (synthetic row factories), `tests/fixtures/testDb.ts` (DB setup and teardown), `tests/fixtures/personas.ts` (member plus tier grant plus JWT plus Playwright cookie composition).
- *fast-check.* Property-based testing for TypeScript. Selective use for validators, encoders, anti-enumeration helpers, idempotency invariants, and security-critical pure functions. Not a universal test-tier requirement; introduced on a per-surface basis when an invariant-shaped assertion benefits from it.
- *Stryker (TypeScript).* Mutation testing. Selective use for security-critical pure functions and parsers where structural test weakness has been observed. Not a baseline expectation across the whole suite. Runs on-demand against a targeted module, not against the full codebase.
- *@axe-core/playwright.* Accessibility automated checks for the lightweight Playwright suite per §14.1, tagged `@a11y`, plus the smoke-tagged subset on high-traffic public pages.
- *OWASP ZAP.* Heavyweight pentest scanner. Used in the on-demand heavyweight pentest gate per §9.3. Scripted invocation against the local stack or a dedicated pentest staging environment; report aggregation; findings produce regression tests per §9.6.
- *Pairwise generator.* PICT, ACTS, or an equivalent. Used by the technique selector per §4.4 for matrix-shaped threats. May be hand-derived for small matrices; the generator becomes mandatory when the role-by-surface-by-method matrix exceeds 32 combinations.
- *Dependency vulnerability scanner.* `npm audit` is built in; a third-party scanner (Snyk, Socket, or equivalent) supplements with supply-chain signal. Integrated into the on-demand heavyweight pentest gate.

#### 15.3.2 Tools explicitly not adopted

- *Jest.* Vitest is the platform test runner. No Jest dependency.
- *Cypress.* Playwright is the platform browser automation tool. No Cypress.
- *Cucumber and other BDD frameworks.* Tests describe long-term contracts in straightforward TypeScript; no Gherkin or feature files. Test names describe user-visible behavior; no separate spec layer is maintained.
- *Snapshot-driven UI testing libraries that produce committed image diffs.* Per §14.3.
- *Load testing or chaos tooling (k6, Locust, Chaos Monkey, equivalent).* Deferred per §14.3.

---

## 16. Tester runbook: using the persona harness

The persona harness in `src/testkit/` lets a tester act as any seeded member, act as a real migrated member by claiming its record, see captured email without a real inbox, and drive the membership purchase flow without Stripe. It is active under `FOOTBAG_ENV ∈ {development, staging}` and absent from production (§7.5, §7.6). This section is the step-by-step; §7 is the design contract.

### 16.1 What the harness provides

- A curated persona catalog (`src/testkit/canonicalPersonas.ts`), seeded into the dev or staging database.
- `GET /dev/personas`, a grid of cards, one per loadable persona, showing its tier, roles, purpose, and coverage notes. A session-eligible persona card carries a Switch control; a login-blocked persona (unverified, deceased, soft-deleted) carries a Log in control that drives the real login path.
- `GET /dev/switch?as=<slug>`, which issues a real session cookie for that persona (the same primitive the login path uses, not an auth bypass).
- A **Switch to a real member** card on `/dev/personas`: enter a real migrated legacy record's member id and `GET /dev/build-claim?as=<legacy_member_id>` builds a claimed account for it (running the real register, verify, claim, and onboarding journey once), issues a session for it, and lands on its profile, so a tester acts as a real claimed member rather than only a seeded persona. A record already claimed reuses its account, so a repeat switch rebuilds nothing. It needs a loaded real dataset and is the manual peer of the real-claim crawl (§7.8, §10).
- Each persona's profile About marks it as a test persona and states what it exists to test, so a switched-in profile is never read as a real member.
- A **Refresh all personas** control on `/dev/personas` (`POST /dev/personas/refresh`) that tears down the persona-owned rows and re-seeds the catalog, returning every persona to its seeded state. Use it to undo in-app changes a persona accumulated, for example a tier upgrade, which appends to the membership ledger and otherwise persists.
- The simulated-email card, captured outbound email rendered inline on every email-gated login page when `SES_ADAPTER=stub`.
- `GET /dev/outbox`, a read-only page listing every message the stub adapter captured, newest first. The simulated-email card covers email-gated login pages; this viewer covers notifications that have no host page (a tier change, a vouch confirmation), so a tester reads any outbound message in one place.
- The stub payment adapter, a checkout pass-through (Confirm, Cancel, Decline) that drives the full purchase flow through the real webhook verifier with no Stripe dependency.

### 16.2 Local quickstart (development)

1. Seed the catalog: `./run_dev.sh --seed-test-personas` (combinable with any rebuild mode; idempotent, a persona whose slug already exists is skipped). To seed without launching, run `./scripts/manage-test-personas.sh --seed-test-personas`.
2. Open `GET /dev/personas`. Every seeded persona is listed.
3. Click Switch on a card to become that persona (redirects to `/`). Log out to return to anonymous.

All seeded personas share one fixed test password, defined once in `src/testkit/` and never reproduced in docs. `/dev/switch` needs no password, so prefer it for routine switching and use form login only when the password path itself is under test.

### 16.3 Acting as a persona

`/dev/switch?as=<slug>` looks the persona up by slug through the same email-verified session query the auth middleware uses, mints a real session JWT, and writes a `testkit.persona_switch` audit row. An unknown slug returns 404 (anti-enumeration). Switching while already signed in replaces the current session.

### 16.4 Seeing captured email

When `SES_ADAPTER=stub` (the development default and the staging setting), outbound mail is captured in memory instead of sent. Every email-gated login page (registration check-email, password-reset sent, verify-resend, legacy-claim sent, mailbox-control declared) renders a "Simulated email" card listing that flow's captured messages with their subject, body, and the actionable link; follow the link to continue without a real inbox and without leaving the page. The buffer clears on server restart. This works on both development and staging. Notifications without a host page (membership, club, payment, Active Player) carry no card; read them on `GET /dev/outbox`, which lists the full captured buffer newest first.

The development stack runs the outbox worker beside the web and image-worker processes, so an enqueued message drains through the stub adapter and reaches `/dev/outbox` within the outbox poll interval (short in development); reload if a just-triggered message has not yet landed. To read any host-page-less notification, act as the persona that triggers it and then open `/dev/outbox`:

- Contact IFPA admin: as a member, submit the Contact IFPA admin form; the admin-alerts notification to subscribed admins appears. As an admin, resolve the item from the work queue; the resolution reply to the member appears.
- Club membership: as a member, join or leave a club; the joining or leaving member and every co-leader are notified.
- Membership tier and payment: drive the stub purchase flow (§16.5); the payment receipt and the tier-change notice appear.
- Active Player: as a Tier 2 or Tier 3 persona, vouch for a Tier 0 member; the vouch confirmation appears. Expiry reminders are produced by the worker's daily pass rather than by a tester action.

Honors congratulations, club-cleanup contact, and the other notification stories surface the same way: trigger the owning action as the appropriate persona and read the captured message on `/dev/outbox`.

### 16.5 Exercising the purchase flow

The stub payment adapter registers the checkout pass-through when `PAYMENT_ADAPTER=stub`, the development default and the staging setting. As a seeded persona:

1. Start a purchase from the member profile (`POST /members/<slug>/purchase-tier`), which redirects to `GET /payments/checkout/<sessionId>`.
2. The checkout page offers three buttons, each driving the same signed-webhook path a real Stripe delivery uses:
   - **Confirm and Pay**: payment succeeds, the tier is granted, redirect to the success page.
   - **Cancel**: payment is canceled, no tier change, redirect to the cancel page.
   - **Decline payment**: payment fails, no tier change, redirect to the cancel page in its failure variant.

Live Stripe checkout-session creation and the `stripe listen` / `trigger` loop belong to the production-only go-live verification (§7.7) and are out of the dev/staging harness.

### 16.6 Staging loop

On the staging host the harness is seeded after a deploy with `./deploy_to_aws.sh --seed-test-personas` (allowlisted to the staging target only). `/dev/personas`, `/dev/switch`, the simulated-email card, and the stub purchase flow behave as in development. Operator staging-AWS adapter smoke checks run with `npm run test:smoke`.

### 16.7 Pre-flight checklist

- `FOOTBAG_ENV` is `development` or `staging` (the `/dev` surface is absent otherwise).
- `SES_ADAPTER=stub` (so the simulated-email card renders).
- `PAYMENT_ADAPTER=stub` (the default in development; the staging setting) for the purchase flow.
- The database has been seeded (`--seed-test-personas`); `/dev/personas` is non-empty.

### 16.8 Provenance and the production-residue audit

Every harness write carries a stable marker (`reason_code = 'dev_persona_seed.tier_grant'`, `audit_entries.action_type` in `testkit.persona_seed` or `testkit.persona_switch`, `created_by = 'dev-shortcuts/personas'`). `scripts/audit-dev-shortcuts.sh` counts these against a production database and exits non-zero on any residue (§9.5), so the harness is provably absent from production.

---

## 17. Per-story test charters

This section prescribes, per user story, the tests the platform requires. Each charter selects from the test-dimension taxonomy (§17.1) and names the story-specific edge, scenario, time, and concurrency cases. Charters are prescriptive and timeless: they describe the tests a story warrants, not which already exist. Build status lives in `IMPLEMENTATION_PLAN.md`. Properties that every surface shares are verified once by a generative sweep (§17.2) rather than restated in each charter, so a charter that reads "covered by the CSRF sweep" is asserting the sweep includes that route, not that the property is untested.

### 17.1 Test-dimension taxonomy

A charter references these dimensions by number.

1. Functional happy path: each success criterion; output shape or view-model; rendered content.
2. Functional edge: zero, one, many, and N+1 rows; boundary values; optional-field permutations; draft or unpublished exclusion; route-ordering precedence.
3. Input and adversarial: malformed, oversized, and wrong-type input; unicode mischief (RTL override, homoglyph, zero-width); SQL injection; XSS into Handlebars; every free-text field.
4. Authentication: anonymous gate (redirect to login); registered-unverified, deceased, and soft-deleted accounts cannot act; session expiry and the sliding-refresh window; cookie attributes; logout invalidation; password-version bump invalidates other sessions.
5. Authorization: allow for each authorized actor and deny for each unauthorized one; adjacent-owner object-level checks; tier-ladder boundary (just below versus at or above); resource roles (co-leader, organizer, owner); admin; honor flags; legacy-admin-flag non-inheritance.
6. Anti-enumeration: exists versus not-exists equivalence (status, body, timing) on login, reset, verify, claim, and owner-scoped 404s.
7. CSRF and Origin-pin: every state-changing verb refuses a foreign or absent Origin.
8. Rate-limit: boundary at the limit and limit-plus-one; 429 with `Retry-After`; window reset.
9. State-machine scenarios: each legal transition and each illegal-transition rejection across multi-step flows (onboarding, legacy claim, club cleanup, purchase, account deletion and restoration, vote lifecycle).
10. Temporal and time: expiry boundaries (just before, at, just after); grace-window open versus elapsed; token TTL expiry and replay; sweep-driven expiry; open and close windows; calendar boundaries where relevant. Deterministic through an injected clock or runtime-relative offsets, never absolute years.
11. Concurrency: simultaneous claims (constraint-loser rollback); double-submit; sole-owner handoff race; same-window collision.
12. Idempotency: replaying the same key yields the same outcome (webhook, outbox, grant, consume-once token).
13. Error and operational: each throw path maps to its status and class; operational paths emit an audit row plus `logger.error`; no stack trace in a 5xx; 503 on database-busy.
14. Privacy and data-governance: public surfaces never emit contact fields or PII; search excludes unverified, deceased, opted-out, and purged members; member-only fields are gated; logging hygiene; export and erasure correctness.
15. Audit: state-changing paths emit the correct audit row; append-only immutability is enforced by the table trigger.
16. Adapter parity: boot-config fail-fast; interface parity between stub and live; staging-smoke for external adapters.
17. Accessibility: axe checks on UI surfaces; keyboard, focus, label, and contrast for stories with UI.
18. Migration: loader row-count and shape; confidence outcomes; alias and name-change; club-affiliation cases.

### 17.2 Platform-wide generative sweeps

Several properties hold across every surface and are tested once, generatively, over the live route table or the schema, so a newly added surface is covered by construction:

- CSRF Origin-pin sweep: every deployed state-changing route refuses a foreign Origin, with only the signature-authenticated webhook and `/ipc/*` exemptions.
- Route-by-persona authorization matrix: deployed routes crossed with the canonical persona catalog, asserting an allow cell for each authorized persona and a deny cell for each unauthorized one, including the adjacent-owner case.
- Ledger immutability: every append-only table keeps its BEFORE UPDATE and BEFORE DELETE abort triggers, and the triggers fire on a seeded row.
- Anti-enumeration equivalence: exists versus not-exists parity on the authentication and claim surfaces.
- Session lifetime: JWT expiry rejection and the sliding-refresh-window boundary.
- Email-catalog firing sweep: every entry in the email catalog (each promised email by key and owning service) has a live enqueue site and a firing test, so a contract-promised email the code never sends is a build failure rather than a silent gap.

A per-story charter names only the cases specific to that story; the cross-cutting properties above are inherited from these sweeps.

### 17.3 Charters: authentication and identity

**M_Login** (dims 1, 3, 4, 6, 8, 13, 15). Valid credentials issue a session cookie with the correct attributes; a wrong password yields a generic failure; a registered-unverified account is blocked with a verification prompt; a deceased or soft-deleted account is rejected (grace-open offers restoration, grace-elapsed does not). Anti-enum: unknown email and wrong password are indistinguishable in body and timing. Rate-limit: repeated failures return 429 with `Retry-After`, and the window resets. Adversarial: injection, oversized, and unicode input in the email field. Audit: both failed and successful attempts are recorded.

**M_Verify_Email** (dims 1, 4, 6, 9, 10, 12, 13). A valid token verifies the account and runs the legacy auto-link; resend issues a fresh token. Time: an expired token is rejected and the account stays unverified. Single-use: a consumed token cannot be replayed. Anti-enum: invalid and expired tokens produce the same enumeration-safe outcome. Adversarial: malformed or oversized token segment.

**M_Reset_Password** (dims 1, 3, 4, 6, 8, 9, 10, 12, 13). Requesting a reset issues a token (delivered to the captured outbox, never reflected in the response, since the request page is unauthenticated and the submitted email is caller-controlled); completing the reset bumps `password_version`, invalidates other sessions, and re-issues the current one. Time: an expired token is rejected with the password unchanged. Single-use: a replayed token is rejected. Anti-enum: the forgot-password request returns identical UX and timing for a known and an unknown email. Rate-limit: repeated requests are throttled. Validation: password policy and confirm-match on completion. Operational: a session-issue failure after the password commit renders a 503, not a 500.

**M_Change_Password** (dims 1, 3, 4, 13). Authenticated owner only; another member's password-edit route returns 404 (anti-enumeration). The correct current password is required; success bumps `password_version`, keeps the current browser signed in, and invalidates other sessions. Validation: confirm-match and policy.

**M_Logout** (dims 1, 4, 7). POST clears the session cookie (Max-Age zero); a safe-path Referer is honored for the redirect, otherwise `/`. GET does not clear the session (POST-only).

**M_Claim_Legacy_Account** (dims 1, 2, 3, 5, 6, 9, 10, 11, 12, 13, 15). Scenarios across confidence high (auto-confirm), medium (queued for review), low, and no-match; the email-equality fast path versus the historical-person card confirm; cross-source confirm; and anchor mailbox verification. Time: claim-confirm and anchor-verify token TTL expiry and replay. Concurrency: two simultaneous claims of one legacy row, with the loser rolling back to no partial link, grant, or audit. Anti-enum: an unknown person id and an already-claimed record both return the enumeration-safe message, and low or no-match leaks no candidate identity. Authz: a claimed legacy admin flag never confers a live admin role. Audit: claim, link, and grant are recorded.

### 17.4 Charters: visitor and public read surfaces

**V_Browse_Static_Content** (dims 1, 2, 14, 17). Any visitor reads the public site with no authentication. Public pages never expose member contact fields or PII. An unknown slug or section returns 404, not a 500. High-traffic public pages carry accessibility checks.

**V_Browse_Clubs** (dims 1, 2, 14). The club index and detail render for anyone; member-only organizer or contact details appear only to authenticated members. Draft and archived clubs are excluded from the public list. Edge: empty, one, and many clubs; an unknown club key returns 404.

**V_Browse_Upcoming_Events** (dims 1, 2, 14). The upcoming list and event detail render publicly; member-only organizer contact appears only when authenticated. Draft and unpublished events never appear publicly. Route ordering: the year-archive segment matches before the event-key param.

**V_Browse_Past_Events** (dims 1, 2). The past-event archive and year pages render publicly; results-specific treatment appears only where published results exist.

**V_View_Gallery** (dims 1, 2, 3, 14). Public and named galleries render; captions are escaped so no stored XSS executes; owner-private media is not exposed. Route ordering: literal gallery sub-routes precede the gallery-id param.

**V_View_Trick_Reference_Videos** (dims 1, 2, 3). Freestyle reference surfaces (tricks, sets, glossary, records, leaders) render publicly with escaped free text. Route ordering: literal freestyle sub-routes precede the trick-slug param.

**V_Browse_Hashtags** (dims 1, 2). Hashtag and tag-driven browse renders publicly with no member PII.

**V_Register_Account** (dims 1, 3, 6, 8, 13, 15). Registration creates an unverified account and issues a verification token; login is blocked until verification. Anti-enum: registering an already-registered email returns the same enumeration-safe UX as a fresh address. Rate-limit on repeated registration. Validation and adversarial input on every field (email shape, password policy, unicode display name). Audit on account creation.

### 17.5 Charters: club and club co-leader

**M_View_Club** (dims 1, 2, 5, 14). Anyone views the public club page; member-only surfaces appear only to authenticated members. An unknown club key returns 404.

**M_Join_Club** and **M_Leave_Club** (dims 1, 5, 7, 9, 11, 13, 15). Authenticated members join and leave; the onboarding gate redirects a not-yet-onboarded member off club paths. Business rules: the two-club affiliation cap, primary versus secondary, idempotent re-join. Concurrency: a double-submit join does not create duplicate affiliations. Audit on each transition.

**M_Create_Club** (dims 1, 3, 5, 8, 13, 15). Authenticated Tier-1-benefits members only; a Tier-0 member without Active Player is denied at the gate. Validation: name, country, and near-match confirmation, with the duplicate-name, already-co-leader, and affiliation-cap branches. Audit on creation.

**CL_Edit_Club** (dims 1, 5, 7, 13, 15). Only a club's co-leader edits its content; a co-leader of a different club is denied (adjacent-owner). External-URL changes are validated before persistence. Audit on the content edit.

**CL_Mark_Club_Inactive** and **CL_Archive_Club** (dims 1, 5, 9, 10, 15). Co-leader-scoped state transitions (any co-leader can mark inactive or archive). The inactive and archived states gate public visibility. Audit on each transition.

### 17.6 Charters: member profile, account, and media

**M_Edit_Profile** (dims 1, 3, 4, 5, 13, 14). An authenticated owner edits their own profile; another member's edit route returns 404. Validation and adversarial input on every field, escaped on render. Contact fields are gated to the owner and admins. Audit on change.

**M_View_Profile** (dims 1, 2, 14). The public profile renders for anyone; member-only and contact fields appear only to authorized viewers; a deceased member keeps honors and history visible. An unknown member key returns 404.

**M_Search_Members** (dims 1, 2, 6, 14). Authenticated search; results exclude unverified, deceased, opted-out, and PII-purged members. No existence oracle and no contact-field leak in results. Adversarial query input.

**M_Upload_Photo**, **M_Submit_Video**, and member media edit and delete (dims 1, 2, 3, 5, 13, 16). Owner-only (cross-owner 404), with the Tier-1-benefits gate on write (a Tier-0 member without Active Player is denied). Upload validation: MIME, size, and polyglot rejection, with image and video processing through their adapters. Captions are escaped. Audit on upload, edit, and delete.

**M_Complete_Onboarding_Wizard** (dims 1, 2, 9, 13). Authenticated; a state machine across the personal-details, legacy-claim, and club-affiliation tasks with skip and resume, where the onboarding gate redirects an incomplete member off gated paths. Out-of-order and illegal-step submissions are rejected.

**M_Contact_IFPA_Admin** (dims 1, 3, 5, 8, 13). Authenticated owner; validation and rate-limit on submission; the admin queue receives the request.

**M_Nominate_HoF_Candidate** and **M_Submit_HoF_Affidavit** (dims 1, 3, 5, 13, 15). Authenticated; validation; audit on submission.

**M_View_Payment_History** (dims 1, 2, 5, 14). Owner-only (cross-owner 404); shows the member's own payment ledger and no other member's data.

**M_Delete_Account**, **M_Restore_Account**, and **M_Download_Data** (dims 1, 5, 9, 10, 14, 15). Self-service deletion enters a grace window: while open, login offers restoration; once elapsed, the account proceeds to purge. HoF and BAP members are preserved. Data export returns only the requesting member's own data. Time: the grace-window boundary (open versus elapsed).

### 17.7 Charters: payment and membership

**M_Purchase_Tier_1** and **M_Purchase_Tier_2** (dims 1, 5, 9, 12, 13, 15). Authenticated; the stub checkout drives the real signed-webhook path, where confirm grants the tier and cancel and decline do not. Idempotency: a replayed webhook does not double-grant. The payment-status-transition ledger is append-only. Audit on the grant.

**M_Donate** (dims 1, 3, 13, 15). Authenticated; a donation is recorded distinctly from membership; amount validation.

**SYS_Handle_Stripe_Webhooks** (dims 1, 7, 12, 13, 15). Origin-exempt and signature-authenticated; an absent or invalid signature is rejected; replay is idempotent; the transition ledger is append-only.

### 17.8 Charters: admin

**A_View_Dashboard**, **A_View_System_Health**, and **A_View_Audit_Logs** (dims 1, 5, 14). Admin-only (the deny half is covered by the authorization matrix); audit logs are read-only.

**A_Override_Member_Data**, **A_Mark_Member_Deceased**, and **A_Manage_Admin_Role** (dims 1, 3, 5, 13, 15). Admin-only; validation; every override writes an audit row; an admin-role change never derives from a legacy flag.

**A_Periodic_Club_Cleanup** and **A_Reassign_Club_Leader** (dims 1, 5, 9, 13, 15). Admin-only; the club-cleanup state machine (claim, resolve, promote, delist) with idempotent re-resolution; audit on each action.

**A_Upload_Curated_Media** and **A_Moderate_Media** (dims 1, 3, 5, 16). The admin-operated curator surface; upload validation and async video processing; audit.

**A_Configure_System_Parameters** (dims 1, 5, 13, 15). Admin-only; a config write appends to the immutable system_config ledger, and the current value is the latest effective row.

**A_Reconcile_Payments**, **A_Review_Member_Link_Help_Requests**, and **A_Resolve_Contact_IFPA_Admin_Request** (dims 1, 5, 9, 13, 15). Admin-only queue actions with audit and idempotent resolution.

### 17.9 Charters: not-yet-deployed surfaces

Each of these surfaces gains its full charter when its routes land; the dimension emphasis is fixed in advance so the charter is ready:

- **Voting** (A_Create_Vote, A_Cancel_Vote, A_Publish_Vote_Results, M_View_Vote_Options, M_Vote, M_Verify_Vote_And_View_Results, SYS_Open_Vote, SYS_Close_Vote): dims 5, 9, 10, 11, 12, 15. Eligibility-snapshot and ballot immutability, open and close windows, one-vote idempotency, a verifiable receipt, and eligibility by inclusion list, tier, or honor flag.
- **Groups** (A_Create_Group, A_Edit_Group_Properties, A_Archive_Group, A_Reassign_Group_Owner, GO_Edit_Group, GO_Manage_Members, GO_Manage_CoOwners, GO_Moderate_Email_Queue, M_View_Group, M_Join_Group, M_Leave_Group, M_View_Group_Files, M_Upload_Group_File): dims 5, 9, 14. Owner and co-owner authorization, private-group privacy, the sole-owner handoff race, and the group-versus-club distinction.
- **Event organizer** (EO_View_Participants, EO_Close_Registration, EO_Export_Participants, EO_Email_Participants, EO_Upload_Results, EO_Play_Routine_Music, EO_Manage_CoOrganizers): dims 5, 9, 16. Organizer and co-organizer authorization, registration windows, results upload, and participant-export privacy.
- **System and background jobs** (SYS_Check_Active_Player_Expiry, SYS_Send_Email, SYS_Cleanup_Expired_Tokens, SYS_Cleanup_Soft_Deleted_Records, SYS_Process_Recurring_Donations, SYS_Reconcile_Payments_Nightly, the backup jobs): dims 10, 12, 13. Injected-clock determinism, idempotent re-runs, and operational-error alerting. The Active-Player expiry job runs under an injected now, while the live `is_active_player` gate compares the stored expiry to the SQL clock, so its fixtures use runtime-relative offsets per §10.8. The email-sending path (SYS_Send_Email) carries its layered charter (template conformance and shaping, per-email enqueue, the shared drain and idempotency mechanics, and the catalog firing sweep) in §5.9.

---

## 18. Completeness audit checklist

A periodic audit of test completeness walks this checklist top to bottom. Each line names a dimension, where its evidence lives, and the pass condition. A complete audit records a verdict per line; a dimension that cannot be verified against the codebase is itself a finding. Where a prescribed capability is not yet wired, that is a tracked deviation in `IMPLEMENTATION_PLAN.md`, not a relaxation of this checklist.

1. **Deployed user-story coverage.** Cross the deployed-route inventory to its user stories and to the charters in §17. Pass: every deployed story has a charter, and every applicable charter dimension is met by a test or carries an `IMPLEMENTATION_PLAN.md` gap entry. A deployed route that maps to no story is unintended scope (§4.1).
2. **Adapter parity, three legs (§7.2).** Every adapter in `src/adapters/` has a boot-config test (`tests/unit/env-config.test.ts`) and an interface-parity test (`tests/integration/adapter-parity.test.ts`). Every external-service adapter (JWT-KMS, SES, MediaStorage-S3, Secrets-SSM, SafeBrowsing) also has a staging-smoke leg (`tests/smoke/`, including `staging-readiness.test.ts` for the KMS-sign and SES-send round-trips). The internal docker-network adapters (HttpReachability, ImageProcessing, VideoTranscoding) carry only the first two legs. Pass: the matrix has no missing required leg.
3. **Stub-versus-live parity.** Every adapter with both a stub and a live implementation asserts identical observable output; single-code-path adapters assert through an injected client. Pass: no stub diverges from its live counterpart untested.
4. **Staging-smoke comprehensiveness (§5.4, §7.3).** `tests/smoke/` probes the assumed-role identity, KMS sign and verify, SES send (default sender and per-message override), S3 round-trip, SSM-plus-KMS secret decryption, Safe Browsing, persona-seed idempotency, and health and readiness. Run: `npm run test:smoke` (`scripts/test-smoke.sh`) or `./run_all_tests.sh --with-smoke`. Pass: every external surface has a smoke probe.
5. **Production safety (§7.1, §9.5).** No test targets or mutates production, by design. Production safety is the build-time strip of `src/testkit/` and `src/dev-bootstrap/`, the `FOOTBAG_DEV_*` fail-fast guards in `src/config/env.ts`, and the zero-residue gate `scripts/audit-dev-shortcuts.sh` returning zero against the production database, with the post-deploy smoke gate gating promotion. Pass: the residue gate exists and passes; no test writes to production.
6. **Security regression floor (§9.1).** The `@security` baseline exists across layers: anti-enumeration response equivalence, login timing, SQL injection, XSS, transaction atomicity, no-stack-trace-in-5xx, public-contact-field leakage, security headers, CSRF Origin-pin, and rate-limit boundaries. Pass: each baseline class has a test.
7. **Penetration tiers (§9).** Regression-grade automated (CI), static taint analysis pre-merge (§9.1), lightweight staging-safe probes (§9.2), the operator-invoked heavyweight pass `npm run test:pentest:heavy` (§9.3), and third-party periodic engagement (§9.4). Pass: each tier is wired, or its absence is a tracked `IMPLEMENTATION_PLAN.md` deviation. The audit records which tiers are wired.
8. **Legacy migration (§8).** The `db-load-smoke` CI gate asserts loader row counts and shape; the claim confidence outcomes (high, medium, low, no-match), auto-link classification, club-affiliation cases, and alias and name-change edges each have tests. Pass: every `MIGRATION_PLAN.md` validation gate has a test.
9. **Admin operational surfaces.** Work-queue resolution, club cleanup, leadership reassignment, curator media, audit-log view, and system-config each have allow and deny authorization cells (the matrix, §4.6) and audit-emission assertions. Pass: no admin state-changing route lacks a deny cell or an audit assertion.
10. **UI and design conformance (§14).** The no-nested-forms convention gate (`scripts/ci/assert_conventions.sh`) plus the e2e primary-form-submission check; the card-uniformity contract across browse views; and accessibility axe `@a11y` checks on business-critical surfaces against WCAG 2.1 AA. Automated visual-diff regression is deferred (§14.3). Pass: the convention gate is green, the card contract holds, and `@a11y` runs in CI on every push and in the full local suite.
11. **Cross-cutting generative sweeps.** CSRF Origin-pin over the live route table, the route-by-persona authorization matrix (allow, deny, and adjacent-owner), ledger-immutability triggers, anti-enumeration equivalence, and session and token temporal contracts. Pass: each sweep enumerates from the live route table or schema, so a newly added surface is covered by construction rather than by memory.
12. **Coverage floor (§12).** The `vitest.config.ts` thresholds hold, and catastrophic surfaces are verified by inspection of the tests, not by the number alone. Pass: thresholds are met, or the shortfall is a tracked `IMPLEMENTATION_PLAN.md` item.
13. **Email catalog (§5.9).** Every promised email has a registered template — a typed shaper, its variant keys, and a committed sidecar — covered by the catalog and conformance sweeps, plus a per-email enqueue test; the shared drain, retry, dead-letter, and idempotency mechanics are covered once over `communicationService`. Pass: the firing sweep enumerates the catalog and every entry has its send site and enqueue test, or the gap is a tracked `IMPLEMENTATION_PLAN.md` item.

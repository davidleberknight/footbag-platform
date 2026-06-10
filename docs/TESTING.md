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
- Selective fuzzing: parsers, validators, complex input handlers. Targeted at the specific module.
- Rate-limit + resource-bound assertions: denial-of-service concerns. Configuration verification, not load testing (load is deferred per §14).

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

1. Enumerate the authorization dimensions from the `Access:` clause of every deployed user story. The dimensions are: authentication state (anonymous, authenticated); email-verified state (verified, or registered-unverified with login blocked until verification); the membership tier ladder (Tier 0, 1, 2, 3); per-resource ownership (owner of the target row); resource-scoped roles (event organizer and co-organizer, club leader and co-leader, group owner and co-owner, group member); the admin role (the curated-media curator surface is admin-operated, not a separate role); the system or internal-caller role (scheduled jobs, secret-gated webhooks); standing flags (Active Player status, Hall-of-Fame / Big-Add-Posse / IFPA-Board honors, vote-eligibility by inclusion list); migration and legacy-claim state (graded auto-link confidence high, medium, low, no-match, plus the claimed-legacy record whose legacy admin flag must not confer admin); and identity edge cases (homoglyph, RTL-override, and unicode display names, duplicate display names, surname collisions, deceased members, accounts inside the deletion grace period).

2. Treat each dimension as an axis and apply equivalence partitioning to actors, the technique ISTQB defines for inputs: every distinct gate outcome is one equivalence class, and the suite carries one seedable persona per class. For ordered dimensions add boundary-value personas at the gate edges: the tier just below a route's requirement versus at or above it, an Active Player grant that is current versus one that just expired, a deletion grace period still open versus just elapsed.

3. Derive negative personas explicitly. STRIDE Elevation-of-Privilege and abuser-story analysis require, for every privileged route, an authenticated actor who is authorized and an authenticated actor who is not, plus the adjacent-owner persona (a member who owns some resource of the same type but not this one). The adjacent-owner persona is what surfaces broken object-level and function-level authorization (OWASP API Security Top 10 BOLA and BFLA); without it, an owner-only route that silently serves any authenticated member passes every positive test.

4. Map each class to a concrete, named, seedable persona. A dimension that combines with another to change a gate outcome yields a separate persona (a Tier 1 club leader and a Tier 1 non-leader are two personas), but combinations that never change an outcome are not multiplied out.

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

Does not belong:

- Browser-only assertions (cookie attribute interaction with the browser, redirect chains visible only in a real browser)
- Staging-AWS integration (SES, S3, KMS live)

The generated route-by-persona authorization matrix (§4.6) lives here: it crosses the deployed-route inventory with the derived persona suite and asserts the expected allow or deny outcome for every cell, so an unasserted route-by-persona combination is a visible candidate authorization gap.

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
- Primary-form submission actually posts (no nested-form orphaning of the submit button). The static no-nested-forms gate in `scripts/ci/assert_conventions.sh` is the cheap floor that catches the markup defect at merge time; an E2E submit is the deep check that the wired-up form reaches its handler.

Does not belong:

- Every service branch
- Every validation edge case
- Every policy function (these are unit and integration territory)
- Exhaustive navigation crawls (heavyweight)

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

Lightweight integration with auth uses the existing `tests/fixtures/personas.ts` helper, which composes a member, tier grant, historical-person link, and JWT into a `Persona` and exports the cookies via `context.addCookies()`. Local e2e can also obtain a real session cookie from the persona-switch route (`GET /dev/switch?as=<slug>`, active in development and staging, §7.5.1), never a fresh login chain that depends on receiving an email.

---

## 7. Environment parity, staging, and personas

### 7.1 The four environments

The platform targets four environments. Each has parity contracts that tests verify.

- *Local development.* Runs on the maintainer workstation via `./run_dev.sh`. SQLite at `./database/footbag.db`. Local stub adapters (JWT signing stub, SES outbox stub, media storage local-disk stub). The `src/testkit/` test scaffolding and the `src/dev-bootstrap/` conveniences are active under `FOOTBAG_ENV=development`.
- *CI.* Runs every test job (typecheck, lint, dependency audit, secret scan, conventions, unit, integration, db-load smoke, e2e, terraform) against ephemeral SQLite. No real AWS. Adapters are the same local stubs the workstation uses.
- *Staging.* The real AWS staging account (KMS, SES, S3, SSM, Lightsail). The `src/testkit/` test scaffolding and the `src/dev-bootstrap/` conveniences are active under `FOOTBAG_ENV=staging`. The staging smoke suite (`tests/smoke/`) runs here, gated by `RUN_STAGING_SMOKE=1`.
- *Production.* The real AWS production account. Both `src/testkit/` and `src/dev-bootstrap/` are excluded from the production image at build time (the Dockerfile strips both subtrees when `INCLUDE_DEV_SHORTCUTS=0`); boot-time guards in `src/config/env.ts` fail-fast if any `FOOTBAG_DEV_*` env var is set; `scripts/audit-dev-shortcuts.sh` returns zero against the production DB. `src/testkit/` is permanent in source (build-excluded from prod, not deleted); `src/dev-bootstrap/` is the removable set deleted at cutover.

### 7.2 Adapter parity tests are mandatory

The three-test contract from `.claude/rules/testing.md` applies to every adapter (`JwtSigningAdapter`, `SesAdapter`, `MediaStorageAdapter`, `ImageProcessingAdapter`, `VideoTranscodingAdapter`, `SecretsAdapter`, `SafeBrowsingAdapter`, `HttpReachabilityAdapter`, and any future adapter):

- Boot-time config test (`tests/unit/env-config.test.ts`): module-load fails fast when required prod-mode env vars are absent.
- Interface parity test (`tests/integration/adapter-parity.test.ts`): both implementations satisfy the TypeScript interface with identical observable output structure, exercised via an injected fake client.
- Staging-smoke test (`tests/smoke/`): hits real staging AWS via the assumed-role chain, gated by `RUN_STAGING_SMOKE=1`.

These tests describe permanent contracts. They are not sprint-scoped.

The staging-smoke leg applies to adapters that reach an external service over the network: `JwtSigningAdapter`, `SesAdapter`, `MediaStorageAdapter`, and `SecretsAdapter` (real AWS via the assumed-role chain) and `SafeBrowsingAdapter` (the real Google Safe Browsing API). The three internal docker-network adapters (`HttpReachabilityAdapter`, `ImageProcessingAdapter`, `VideoTranscodingAdapter`) carry boot-config and interface-parity tests but no workstation staging-smoke: their dependency is the internal `image` worker rather than an external surface the dev-against-staging (no-ssh) model can reach, and their failure mode is a noisy first-request error rather than silent IAM or network drift. Their wiring is covered by the interface-parity tests, the compose `image:4000/health` healthcheck that gates stack startup, and the e2e upload path.

### 7.3 Staging smoke entry point

`scripts/test-smoke.sh` is the canonical entry. It reads terraform output for environment-specific values (KMS key ARN, SES sender identity, S3 bucket name), exports the staging AWS profile and region, fetches operator-supplied SSM secrets via the assumed-role chain, and execs `vitest run tests/smoke/`. The operator runs it locally or from the staging host after any change to staging AWS runtime identity, KMS keys, SES identities, or IAM policies the app depends on.

The script does not accept passwords or secrets as command-line arguments. Secrets that the smoke suite needs are read from SSM via the assumed-role chain or piped via stdin from approved secret-manager flows.

### 7.4 Staging personas: model and reset

Staging needs synthetic personas that cover the persona suite derived in §4.6 (the authentication-state, tier, ownership, resource-scoped-role, honor, migration / legacy-claim, and edge-identity classes). The personas exist for routine Playwright tests against staging and for operator-driven manual exploration of role-conditional UI.

Persona contract:

- Synthetic identities. Display names and email addresses are obviously test data (prefix `staging-test-` or equivalent), never resembling real member data.
- Verified-status pre-seeded. Routine login does not depend on receiving an email.
- Stored credentials. Passwords live in an approved secret channel (gitignored `.local/staging-personas.json` mirroring the dev-admin-seed pattern, or AWS Secrets Manager). Never committed.
- Tier and role grants. Assigned through the dev-shortcuts seed pipeline (`reason_code` carries `dev_admin_seed.admin_tier2` and similar markers) so cutover audit catches them.

Reset semantics:

- An operator-runnable reset that re-creates the persona set from the gitignored or secret-manager seed file.
- The reset uses `bash scripts/manage-dev-admin-seed.sh` (or an equivalent extension), which pipes JSON via stdin per the existing pattern. No password as command-line argument.

### 7.5 Test scaffolding and dev-bootstrap conveniences

Two env-gated subtrees hold all dev-or-staging-only code. Both are active under `FOOTBAG_ENV ∈ {development, staging}` and excluded from the production image at build time; they differ in lifecycle.

- `src/testkit/` is **permanent, first-class test infrastructure**: the persona harness (row builders, factory, canonical catalog, seed runner), the persona-switch route (`GET /dev/switch?as=<slug>`), the persona listing (`GET /dev/personas`), and the dev-router mount glue. It is never source-deleted; features keep shipping with tests against it after production launch.
- `src/dev-bootstrap/` holds **temporary bootstrap conveniences** that exist only because a production feature is not built yet: the registration-time admin email-allowlist, the dev-admin seed, and the tier2 invariant repair. These are removed at cutover when their production replacement (the SSM-token first-admin claim, the always-enforced admin↔Tier 2 invariant) lands.

No dev-or-staging-only code path lives outside these two subtrees. A test-only HTTP endpoint, a test-only middleware bypass, or a test-only persona-issue helper belongs in `src/testkit/` (if permanent) or `src/dev-bootstrap/` (if a temporary bootstrap stand-in). Keeping each subtree self-contained lets `src/dev-bootstrap/` be removed in one operation at cutover and keeps `src/testkit/` from depending on it.

#### 7.5.1 Existing shortcuts

`src/testkit/` exposes the persona harness: seed plus `/dev/switch` and `/dev/personas`, active in development and staging. `src/dev-bootstrap/` exposes the dev-admin seed, the register-allowlist bootstrap, and the tier2 invariant repair (see the subtree READMEs for env-var triggers and behavior). Each carries audit-marker provenance (e.g. `reason_code LIKE 'dev_admin_%'` or `'dev_persona_seed.%'`, `action_type LIKE 'grant_admin_dev_%'` or `'dev_%_persona'`, `created_by LIKE 'dev-shortcuts/%'`). The `dev-shortcuts/*` marker namespace is historical and is kept stable so the cutover audit and existing tests continue to match.

#### 7.5.2 Required properties of a dev/staging-only affordance

A dev-or-staging-only affordance (a route, seeder, or bypass) satisfies all of the following:

- Lives in `src/testkit/` (permanent) or `src/dev-bootstrap/` (temporary) as part of a self-contained subtree.
- Is gated to development and staging: a route is mounted only under `FOOTBAG_ENV ∈ {development, staging}` with a production hard-guard; a seeder or bootstrap is triggered only by a `FOOTBAG_DEV_*` env var or a CLI flag and refuses to run in production.
- Carries audit-marker provenance the cutover audit script detects (the stable `dev_admin_*`, `dev_persona_seed.*`, `grant_admin_dev_*`, and `dev-shortcuts/*` namespaces).
- Has a boot-time fail-fast guard in `src/config/env.ts` that refuses to start when its trigger is set under `FOOTBAG_ENV=production`.
- Is excluded from the production image by the Dockerfile strip (`INCLUDE_DEV_SHORTCUTS=0` removes both `dist/testkit` and `dist/dev-bootstrap`).
- Lands with the canonical required test set (§7.5.4).
- For a `src/dev-bootstrap/` convenience: carries a `CUTOVER-REMOVE` marker at every callsite and is removable in one operation at cutover. `src/testkit/` is permanent and is not part of the cutover-removal surface.
- Documented in its subtree's README.

#### 7.5.3 Secret containment

Secret literals (a seeded persona password, a dev-admin seed password, any test-only signing key) live in a single source file: the persona password in `src/testkit/`, the dev-admin password in `src/dev-bootstrap/seedConfig.ts`. The password-leak regression test (§7.5.4) enforces that each literal appears in exactly one source file and that deploy scripts, helper scripts, and stored hashes do not embed it. Deploy chains pipe seed JSON via stdin; they never pass a password literal as an argument.

#### 7.5.4 Canonical required test set

A new dev/staging-only affordance lands with all of:

- *env-guard test.* The module fails fast on import when `FOOTBAG_ENV` is not in `{development, staging}`. Model: `tests/integration/devAdminSeed.envGuard.test.ts`.
- *production-guard test.* Its runtime entry points refuse to operate under `FOOTBAG_ENV=production`. Model: `tests/integration/dev-shortcuts.production-guard.test.ts`.
- *secret-leak test.* Any literal secret appears in exactly one source file, is not embedded in seed scripts as a string, is not embedded in deploy scripts, and is stored only as a hash in the DB. Model: `tests/integration/devAdminSeed.passwordLeak.test.ts`.
- *schema-coupling test.* The affordance's audit markers (`reason_code`, `action_type`, `created_by`) exist in schema and are populated correctly on every persisted side effect. Model: `tests/integration/devAdminSeed.schemaCoupling.test.ts`.
- *flag-off test.* It does nothing when its trigger env var or flag is unset. Model: `tests/integration/dev-shortcuts.flag-off.test.ts`.
- *repair and idempotency test.* Re-running against already-seeded rows is safe and idempotent. Model: `tests/integration/dev-shortcuts.repair.test.ts`.
- *image-strip test.* The production Dockerfile removes both the `dist/testkit` and `dist/dev-bootstrap` subtrees from the production image. Model: `tests/unit/dockerfile-dev-shortcuts-strip.test.ts`.
- *initial-admins parity test* where applicable. Model: `tests/unit/devShortcuts.initialAdminEmails.test.ts`.

These tests describe long-term contracts on the affordance's safety properties, not sprint-scoped probes. They are tagged `@security`.

#### 7.5.5 Per-developer persona extension

Beyond the canonical catalog, each developer may keep a gitignored `.local/test-personas.json`: a JSONC array of `PersonaSpec` objects (`//` line comments allowed) merged after the catalog at seed time. `src/testkit/personaSchemaValidator.ts` validates every entry against the full `PersonaSpec` before any row is written, failing with the offending slug and field so a malformed local entry never reaches a DB constraint. The same loader feeds the seed runner and the `/dev/personas` listing, so the page reflects exactly what a seed would create. The file is absent on staging and on a fresh clone, in which case the canonical catalog is the only input. The step-by-step recipe is in §16.6.

### 7.6 Test-only HTTP endpoints live behind the env-gated dev router

A test-only HTTP endpoint is permitted only when its handler lives in `src/testkit/` (or `src/dev-bootstrap/`) and is reachable solely through the dev router, mounted under `FOOTBAG_ENV ∈ {development, staging}` with a production hard-guard. The `/dev/switch` persona-switch route and the `/dev/personas` listing are the worked examples: their handlers and mount glue live in `src/testkit/`, and they are never mounted in production. What stays forbidden is a standalone request-time bypass whose logic escapes these subtrees or that is reachable in a production build (a hypothetical `/__test/login` or `/__test/seed` wired into a permanent router).

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

These run in normal CI. The baseline adversarial list in `.claude/rules/testing.md` (oversized payloads, unicode mischief, SQL injection, XSS, timing attacks, race conditions, token replay) plus the per-route baseline (auth gate, authz gate, anti-enumeration, rate-limit, CSRF) is the floor. Threat-aware additions per the STRIDE framework (§4.2) cover any cases beyond the floor on catastrophic-severity surfaces.

Tagged `@security`. Lives where the assertion most efficiently lives (unit, integration, or e2e lightweight).

Static taint analysis over `src/` is part of this gate: a pinned CodeQL (or Semgrep with the project rule pack) pass runs pre-merge so injection and unsafe-sink classes are caught mechanically rather than by manual review alone.

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
- Audit of any reachable dev-only scaffolding callsite (persona harness / dev-bootstrap) from staging or production (the audit script in §9.5 is the canonical mechanism).

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

- `.local/` (including `dev-admin-seed.json`, `initial-admins.txt`, `staging-personas.json`, and equivalent).
- `tests/test-results/` (Playwright trace and screenshot output).
- Any storage state file produced by Playwright auth setup.
- `.env.local`, `.env.staging`, `.env.production` (real secrets never committed).

The password-leak regression test (§7.5.4 plus §10.4) enforces that secret literals do not propagate beyond their single source file.

### 10.4 Single-source secret containment

Secret literals (the dev-admin-seed password, the persona password, any test-only signing key, any test-only token salt) live in exactly one source file each: the dev-admin-seed password in `src/dev-bootstrap/seedConfig.ts`, the persona password in `src/testkit/`, any other test-only literal in its own guarded module. The secret-leak regression test for the shortcut (§7.5.4) asserts the literal appears in exactly one file and that deploy scripts pipe seed JSON via stdin rather than embedding the literal.

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
- *CI nightly or on-demand.* Mutation testing on the safety-critical short list (auth, privacy filters, migration matchers, role gates), dependency audit, header check across the route table, dev-shortcuts cutover audit against the production DB. Reports, does not block.
- *Post-deploy staging smoke.* Read-only health check, auth-gate enforcement, anti-enumeration timing, no-stack-trace probe, dev-shortcut absence probe. Sub-1min. Blocks deploy promotion on failure.
- *On-demand heavyweight pentest.* Human invokes (`npm run test:pentest:heavy`). May include OWASP ZAP baseline, upload-abuse probes, internal-route probes, header checks, dependency scanning. Browser-driven attack flows are operator-invoked via the `browser-qa` skill. Never runs against production unless explicitly authorized.
- *Periodic third-party pentest.* At major launches (per §9.4). Reports findings; findings produce regression tests at the cheapest appropriate layer.

The db-load smoke gate is a canonical example of class-specific gating within the CI-on-PR gate: it runs only on changes that affect the loader pipeline. The pattern (run a gate only when the surface that the gate covers has changed) extends to other gates as tooling permits.

### 11.2 Selection mechanisms within a gate

- *Test impact analysis* for the local fast loop. `vitest --changed` plus git-diff-driven file selection. The fast loop runs only tests that touch changed code paths.
- *Tag-based selection* across all gates. The tag taxonomy in §6.3 (`@smoke`, `@security`, `@a11y`, `@migration`, `@quarantined`) drives which tests run at each gate.
- *Risk-severity-based selection* for nightly and on-demand gates. Catastrophic and high surfaces (per §3) run on every PR. Medium surfaces run nightly or when the surface changes. Low surfaces run weekly or when the surface changes.
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
- *Post-deploy staging smoke* blocks deploy promotion (the production deploy script must verify smoke passed against the staging deployment before promoting).
- *CI nightly or on-demand* reports only. A failing nightly does not block in-flight PRs but does block the next intentional production deploy until investigated.
- *On-demand heavyweight pentest* reports only. Findings produce regression tests (§9.6).
- *Periodic third-party pentest* reports only. Findings produce regression tests and may block a major launch if a catastrophic-risk finding is open.

### 11.5 Token-efficient tiered execution

The project is AI-assisted. Every test-run output is tokens in the agent's context and dollars on the bill. Running the full suite on every edit cycle wastes both. The Vitest features below let an AI (or human) match scope to need.

| Tier | Trigger | What runs | Command |
|---|---|---|---|
| Inner loop | During edit, focused work | Single file, or tests that import the changed source | `npx vitest run path/to/file.test.ts` or `npx vitest run --related src/changed.ts` |
| Pre-commit | Before commit | Tests touching files in the uncommitted diff, plus lint + typecheck | `npx vitest run --changed && npm run lint && npx tsc --noEmit` |
| Pre-push | Before push to remote | Full unit + integration suite | `npm test` |
| CI on push | Automated | Full suite + `npm audit --audit-level=high` + Playwright `@smoke` | CI workflow |
| CI on main / nightly | Post-merge or scheduled | Full Playwright e2e, dependency audit, optional ZAP | Scheduled workflow |
| Smoke post-deploy | After staging deploy | `RUN_STAGING_SMOKE=1 npm run test:smoke` | Operator-invoked |

**Catastrophic-surface override.** When edits touch auth (`src/services/identityAccessService.ts`, `src/middleware/auth*`, session helpers), privacy boundaries (member-PII reads, anti-enumeration surfaces), or future payment code, run the full test files for those surfaces in the inner loop even if `--related` would skip them. Catastrophic surfaces never skip on inner-loop convenience.

**Compact CI output.** CI logs (which AI agents may read) use `--reporter=dot` to keep output small. Local interactive runs can use the default reporter. The compact reporter prints one character per test (`.` pass, `F` fail) plus a summary; failures are still surfaced with full stack and assertion detail.

### 11.6 Secrets and CI

CI logs, CI artifacts, Playwright reports, traces, screenshots, and failure output are treated as potentially public unless explicitly restricted. Tests that require remote credentials receive them through GitHub Actions secrets, SSM, or an equivalent approved secret-management mechanism. Credentials are never echoed, never serialized into artifacts, never embedded in shell command lines. The password-leak regression test (§7.5.4) and the dev-shortcuts cutover audit (§9.5) together enforce this property for the dev-shortcuts surface; equivalent discipline applies to any other secret introduced into the CI environment.

---

## 12. Coverage and selective heavier tooling

### 12.1 Coverage signals

Coverage thresholds set in `vitest.config.ts` are floors per `.claude/rules/testing.md`. They are a leading indicator of test absence, not of test quality. A surface at one hundred percent line coverage with no adversarial tests is still under-tested.

Target: 80% line/branch floor enforced in CI with ratchet (fail on drop). Catastrophic-severity surfaces (auth, session, member privacy, payments, identity claim) are verified by inspection of the tests themselves, not just by the coverage number. 100% coverage is not a target; forcing coverage of error branches and dead-code paths produces contrived tests without catching real bugs.

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

- *Automated checks* via `@axe-core/playwright` (per §15.3.1) in the lightweight Playwright suite, tagged `@a11y`. Every business-critical surface in the suite carries an axe assertion against the WCAG 2.1 AA rule set. Runs on every PR; catches automated-detectable regressions before merge.
- *Smoke-tagged automated checks* (`@smoke @a11y`) on a small subset of high-traffic public pages (home, member dashboard, login, register, public event detail, results page) that also runs in the post-deploy staging smoke gate.
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

Operational anti-patterns (no DB mocking, no framework mocking, no timestamp leakage, no global state leakage between files, no silent skips, no "tested manually," no tests on the dev DB) are enumerated in `.claude/rules/testing.md` and apply to every test. This section adds the strategic anti-patterns that follow from the playbook discipline.

- *Tests that assert what the code does rather than what the user story says.* A test that documents implementation behavior without anchoring to a success criterion blesses accidental behavior and provides false confidence.
- *Playwright tests for every business-rule branch.* Business rules are covered by unit and integration tests; Playwright is for browser-only assertions and business-critical happy paths plus the minimal negative cases that only a browser can reveal.
- *Brittle locators.* CSS selectors that depend on auto-generated class names, XPath that depends on DOM structure, and text selectors that depend on copy phrasing are brittle. Prefer role and accessible-name selectors per Playwright best practice.
- *Asserting on exact prose or wording.* Tests that pin rendered copy with patterns like `expect(res.text).toContain('exact heading')` or `not.toMatch(/old phrase/)` turn every copy edit into a test failure and train reviewers to ignore the suite. Assert structural intent instead: counts of expected elements, presence of IDs and classes, anchor href shape, response status, data attributes. When a literal string is the contract (an SEO meta description, an explicit error message), production code exports the constant and the test imports it rather than duplicating the literal.
- *Arbitrary sleeps.* `await page.waitForTimeout(N)` masks race conditions. Wait on observable conditions (selector visibility, network response, app state).
- *Depending on production data.* Tests that read or assume real production records are brittle and may leak PII into test output.
- *Depending on real email receipt for routine tests.* The persona switch and the captured-email simulated-email-card exist to avoid this. Routine tests do not poll a mailbox.
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

- *Vitest.* Unit and integration test runner. `npm test` excludes `tests/smoke/` and `tests/e2e/`; `npm run test:unit`, `npm run test:integration`, `npm run test:smoke`, `npm run test:e2e`, `npm run test:coverage`, `npm run test:pre-pr`, `npm run test:all` are the canonical scripts.
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

The persona harness in `src/testkit/` lets a tester act as any seeded member, see captured email without a real inbox, and drive the membership purchase flow without Stripe. It is active under `FOOTBAG_ENV ∈ {development, staging}` and absent from production (§7.5, §7.6). This section is the step-by-step; §7 is the design contract.

### 16.1 What the harness provides

- A curated persona catalog (`src/testkit/canonicalPersonas.ts`) plus an optional per-developer extension (`.local/test-personas.json`), seeded into the dev or staging database.
- `GET /dev/personas`, a table of every loadable persona (slug, tier, role, coverage notes, source) with a Switch control.
- `GET /dev/switch?as=<slug>`, which issues a real session cookie for that persona (the same primitive the login path uses, not an auth bypass).
- A **Refresh all personas** control on `/dev/personas` (`POST /dev/personas/refresh`) that tears down the persona-owned rows and re-seeds the catalog, returning every persona to its seeded state. Use it to undo in-app changes a persona accumulated, for example a tier upgrade, which appends to the membership ledger and otherwise persists.
- The simulated-email card, captured outbound email rendered inline on email-gated pages when `SES_ADAPTER=stub`.
- The stub payment adapter, a checkout pass-through (Confirm, Cancel, Decline) that drives the full purchase flow through the real webhook verifier with no Stripe dependency.

### 16.2 Local quickstart (development)

1. Seed the catalog: `./run_dev.sh --seed-test-personas` (combinable with any rebuild mode; idempotent, a persona whose slug already exists is skipped). To seed without launching, run `./scripts/manage-test-personas.sh --seed-test-personas`.
2. Open `GET /dev/personas`. Every seeded persona is listed.
3. Click Switch on a row to become that persona (redirects to `/`). Log out to return to anonymous.

All seeded personas share one fixed test password, defined once in `src/testkit/` and never reproduced in docs. `/dev/switch` needs no password, so prefer it for routine switching and use form login only when the password path itself is under test.

### 16.3 Acting as a persona

`/dev/switch?as=<slug>` looks the persona up by slug through the same email-verified session query the auth middleware uses, mints a real session JWT, and writes a `dev_switch_persona` audit row. An unknown slug returns 404 (anti-enumeration). Switching while already signed in replaces the current session.

### 16.4 Seeing captured email

When `SES_ADAPTER=stub` (the development default and the staging setting), outbound mail is captured in memory instead of sent. Email-gated pages (registration check-email, password-reset sent, legacy-claim sent) render a "Simulated email" card listing the captured messages with their subject, body, and the actionable link (verification, reset, claim). Follow the link to continue the flow without a real inbox. The buffer clears on server restart. This works on both development and staging.

### 16.5 Exercising the purchase flow

The stub payment adapter registers the checkout pass-through when `PAYMENT_ADAPTER=stub`, the development default and the staging setting. As a seeded persona:

1. Start a purchase from the member profile (`POST /members/<slug>/purchase-tier`), which redirects to `GET /payments/checkout/<sessionId>`.
2. The checkout page offers three buttons, each driving the same signed-webhook path a real Stripe delivery uses:
   - **Confirm and Pay**: payment succeeds, the tier is granted, redirect to the success page.
   - **Cancel**: payment is canceled, no tier change, redirect to the cancel page.
   - **Decline payment**: payment fails, no tier change, redirect to the cancel page in its failure variant.

Live Stripe checkout-session creation and the `stripe listen` / `trigger` developer loop are out of scope until the live adapter ships.

### 16.6 Adding your own personas (`.local/test-personas.json`)

The per-developer extension is a gitignored JSON array of `PersonaSpec` objects (JSONC, `//` line comments allowed), merged after the canonical catalog. `slug`, `displayName`, `tier`, and a non-empty `coverageNotes[]` are required; optional dimensions include `isAdmin`, `underlyingTier` (required for `tier3`), `onboardingComplete` or `onboardingTasks`, `payments[]`, `legacy`, `club` or `clubs[]`, `activePlayer`, and `mailingList`. Example:

```json
[
  {
    "slug": "my_tier1_legacy",
    "displayName": "My Local Tester",
    "tier": "tier1",
    "payments": [{ "type": "membership", "status": "succeeded", "purchasedTier": "tier1" }],
    "legacy": { "linked": false },
    "coverageNotes": ["tier1", "unlinked legacy match"]
  }
]
```

`src/testkit/personaSchemaValidator.ts` validates every entry before any DB write; a malformed entry fails loudly, naming the slug and the offending field, so a typo never surfaces as an opaque constraint error. To pick up edits, use the **Refresh all personas** control on `/dev/personas` (re-running the seed alone skips any slug that already exists); `/dev/personas` then shows exactly what was loaded. The full `PersonaSpec` surface is documented in `src/testkit/personaFactory.ts`; live examples are in `canonicalPersonas.ts`.

### 16.7 Staging loop

On the staging host the harness is seeded after a deploy with `./deploy_to_aws.sh --seed-test-personas` (allowlisted to the staging target only). `/dev/personas`, `/dev/switch`, the simulated-email card, and the stub purchase flow behave as in development. Operator staging-smoke checks run with `RUN_STAGING_SMOKE=1 npm run test:smoke`.

### 16.8 Pre-flight checklist

- `FOOTBAG_ENV` is `development` or `staging` (the `/dev` surface is absent otherwise).
- `SES_ADAPTER=stub` (so the simulated-email card renders).
- `PAYMENT_ADAPTER=stub` (the default in development; the staging setting) for the purchase flow.
- The database has been seeded (`--seed-test-personas`); `/dev/personas` is non-empty.

### 16.9 Provenance and the cutover audit

Every harness write carries a stable marker (`reason_code = 'dev_persona_seed.tier_grant'`, `audit_entries.action_type` in `dev_persona_seed` or `dev_switch_persona`, `created_by = 'dev-shortcuts/personas'`). `scripts/audit-dev-shortcuts.sh` counts these against a production database and exits non-zero on any residue (§9.5), so the harness is provably absent from production.

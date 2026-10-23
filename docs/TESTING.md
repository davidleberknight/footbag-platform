# Footbag Website Modernization Project -- Testing Strategy

**Authority:** This document is the canonical reference for testing strategy on the Footbag platform. It is strategic and additive. Operational testing rules live in `.claude/rules/testing.md` and `tests/CLAUDE.md`; security and privacy policy lives in `docs/DATA_GOVERNANCE.md`; legacy-migration testing rules are owned here, in the migration and onboarding testing section, as is schema-migration testing, by the source-of-truth cutover testing section and the schema-parity suite. This document covers a risk classification rubric, test design principles, OWASP ASVS calibration, coverage and selective heavier tooling, a penetration testing strategy, an execution efficiency model with token-efficient tiered execution, AI-assisted testing governance, accessibility as a first-class layer, and explicit deferrals. Where this document and `.claude/rules/testing.md` overlap, the rules file is operational truth and this document is strategic context; the two must not contradict.

**Scope:** This policy applies to all contributors, maintainers, and AI agents who write, review, derive, or execute tests against the platform.

---

## 1. Scope and authority of this file

This file does not duplicate:

- the edge-case lists, anti-pattern lists, adversarial input list, and coverage floor in `.claude/rules/testing.md`, the adapter parity test contract in `.claude/rules/adapter-conventions.md`, or the factories pattern in `tests/CLAUDE.md`,
- the security and privacy policy in `docs/DATA_GOVERNANCE.md` (member-data visibility taxonomy, anti-enumeration rules, logging hygiene, legacy archive handling, contributor obligations),
- the pipeline validation gates in §8.9 of this document. The operational-readiness rules live in GO_LIVE_PLAN.md (private GitHub repo); they govern cutover readiness rather than tests, so no test anchors on them.

---

## 2. Philosophy and non-negotiables

The operational non-negotiables (tests verify user-story intent and not accidental current code behavior, tests describe long-term contracts not sprint-scoped probes, coverage thresholds set in `vitest.config.ts` are floors enforced by a CI job and raised deliberately, `.skip` and `.todo` and `xit` are forbidden) live in `.claude/rules/testing.md` and `.claude/rules/doc-governance.md` and apply unchanged. The two non-negotiables that belong specifically to this strategic document are stated below.

### 2.1 Privacy and secrets handling are part of the test contract

Every test, every helper, every staging script, every Playwright artifact treats sensitive material as if it could leak. The canonical rule:

- Passwords, remote-login secrets, password-reset tokens, email-verification tokens, signing keys, session secrets, AWS credentials, KMS material, SES credentials, S3 credentials, internal event secrets, and signed URLs are sensitive material.
- These values are supplied to scripts and test helpers via standard input or an approved secret manager. They are never passed as command-line arguments, never echoed to stdout, never logged, never serialized into snapshots, screenshots, traces, videos, Playwright HTML reports, storage state files, or any committed artifact.
- The existing `scripts/install-cwagent-staging.sh` stdin pattern is the reference model. Any new staging or test helper that needs a password must follow it.
- Real member PII does not appear in committed test fixtures, factories, seed data, snapshots, screenshots, traces, or any other committed artifact. Synthetic data only. Where operator-controlled access to real legacy data is genuinely required for migration validation (per the pipeline validation gates in §8.9), the data is minimized, held in the maintainers' private repository and never in this one, access-controlled, and redacted in output.
- The logging and observability hygiene rules in `docs/DATA_GOVERNANCE.md` govern what may and may not appear in application logs; the same prohibition extends to test output, CI logs, and artifact uploads. Test output is treated as potentially public.

### 2.2 logger.error is the operator-alert signal

Any `logger.error()` call in service or controller code is treated as "an operator must see this." The same call drives two enforcement mechanisms: (1) a global test-suite spy in `tests/setup-env.ts` that fails any test producing an unexpected `logger.error()` (opt in deliberately via `expectLoggedError(pattern)`); and (2) a CloudWatch log metric filter in staging/prod that fans out to the admin SNS topic. Service catch blocks that pair an audit row with the alert use the `recordOperationalError(...)` helper at `src/services/operationalErrors.ts` rather than writing the audit row alone.

### 2.3 Tests are written by agents, and the doctrine is written for that

Nearly every test in this suite is written by an AI agent, usually the agent that has just read or written the code under test. That changes which failures are likely. An agent does not tire or skip steps, but it anchors on what is in its context: expected values read off the implementation, fixtures shaped like the one record it looked at, a break chosen to match the test it has already written, and a feature reported done because its own tests pass. A test's author is therefore never the only judge of it. Expected outcomes come from the story before the code is read, the breaks that prove a high-risk test are chosen by an agent that did not write it, and a change a person can see is driven through the real pages before it is called done. The AI-assisted testing governance section states these operationally.

### 2.4 Tests verify intent, never implementation (the load-bearing rule)

This is the single most important rule in the entire strategy, and it is absolute. Every test in the suite exists to prove the system does what its **intent** requires: the success criteria in `docs/USER_STORIES.md`, the decisions in `docs/DESIGN_DECISIONS.md`, and the security and privacy principles in `docs/DATA_GOVERNANCE.md`. A test earns its place only by tracing to one of those sources of intent. The success criterion is the oracle; the code is the thing under test, never the standard the test is measured against.

The forbidden anti-pattern, stated plainly so it cannot be mistaken: **a test that asserts the code does exactly what the code currently does.** Reading an implementation and writing assertions that mirror it produces a test that passes by construction, blesses whatever behavior happens to exist (bugs included), and fails only when someone later fixes the code. Such a test manufactures false confidence and actively resists correction. It is worse than no test, because it disguises an untested surface as a tested one.

The consequences are non-negotiable:

- When the code and the success criterion disagree, the test encodes the criterion and the code is fixed to match. The test does not bend to the code.
- A test is never weakened, loosened, or deleted to make failing code pass. If a test fails, either the code is wrong (fix it) or the intent the test encodes was wrong.
- The intent is corrected only at its source. If a success criterion itself is wrong, it is changed in `docs/USER_STORIES.md` (or the relevant design doc) with explicit human consent first, and only then is the test rewritten against the corrected intent. The code is never the authority that licenses a test change.
- A surface with no traceable intent is unintended scope (§4.1): write the missing story or remove the surface, do not paper over it with a behavior-mirroring test.

A change that adds an effect must not shrink the test to that effect alone. In the same scenario, the test re-asserts the invariants the change is required to preserve: that a signal raised for later review does not also block the action it flags, and that a privacy-sensitive path returns the identical response whether or not the sensitive value matched (the anti-enumeration posture in `docs/DATA_GOVERNANCE.md`). Asserting the new effect while dropping the preserved invariant passes by construction and lets the invariant regress unseen -- the same failure this rule forbids, in different clothes. Both halves trace to intent: the new behavior to its success criterion, the preserved invariant to the decision or governance rule that fixes it.

### 2.5 A test's verdict comes from the code, never from the machine it ran on

A test must not inherit from the machine it runs on the state or the timing that decides its verdict.

The state half: a test whose result depends on a file, a directory, an installed binary, or an exported variable that a developer's machine has and a clean checkout does not. Such a test is green wherever that input happens to be right, and the branch where the contract breaks is unreachable on the machine that holds it, so no amount of local running can find it. A test that reaches an operator signing key beneath the home directory, or reads a Terraform values file that git ignores, is satisfied by the filesystem rather than by the code: green on the maintainer's machine and red on the runner. The same defect pointed the other way is worse and quieter: cases gated on an installed tool skip silently on the runner and report green having executed nothing.

The timing half: an assertion pinned to the single outcome an idle machine produced, where the choice between legitimate outcomes is not deterministic. A test that only passes on an idle machine is not verified.

What follows from it:

- Give the test its own input. Write the file, stub the binary, pass the path, set the variable. A default that resolves to the developer's machine is not an input the test owns.
- Where a whole class of input would otherwise be inherited, deny it once in the shared setup rather than per file. `tests/fixtures/awsIsolation.ts` does this for credentials and `tests/fixtures/machineIsolation.ts` for the home directory, the deployment-environment variable, the media directories, and the SSH client, which is denied with a stub `ssh` at the front of `PATH` because no environment variable can override a system-wide ssh config. Any single file remembering to isolate itself is a rule the next file can forget.
- Assert the contract, not the one manifestation of it the author's machine produced.
- Before a push, `scripts/ci/run_clean_room.sh` runs the suite in a throwaway worktree with an empty home and no ambient environment, which is the closest local view of what the runner sees. It compares the local Node version exactly against `.nvmrc` and the local Python version exactly against `.python-version`, the files the runner reads: a Node mismatch stops the run, and a Python mismatch reports the Python gates as not run rather than answering with a different interpreter. It is not complete cover: configuration a machine holds outside the home directory survives it, and the SSH client is the case that proved it, resolving the deploy alias to a real host under an empty home and costing three red pushes before the shared declaration denied it.

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
- *Medium:* public historical record data, official event results, HoF and BAP entries, world records (per the public historical record policy in `docs/DATA_GOVERNANCE.md`).
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

The member-data visibility taxonomy in `docs/DATA_GOVERNANCE.md` maps onto the risk classification:

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

Surfaces in the legacy data pipeline anchor on the pipeline validation gates in §8.9 instead.

The trace lives in the test's name (descriptive `it(...)` strings naming user-visible behavior) and in the criterion ledger beside the route-to-story ledger in `tests/fixtures/crawl/routeStories.ts`. The ledger keys each success criterion of a deployed story by the story ID and the criterion's own text, and maps it to the tests that fail when that criterion breaks, or to a named exemption with its reason. A criterion whose text changes no longer matches its row, so the ledger check fails until the criterion is mapped again; a story criterion with no row fails it too. No file-header traceability artifact is required.

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
- Property-based testing: invariant-shaped assertions ("for all inputs, property P holds"). Selective use for validators, encoders, security pure functions, anti-enumeration helpers. Not a universal requirement.
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

**The floor itself is stated in `.claude/rules/testing.md` and not restated here**: for these surfaces it is the demonstrated-failure requirement, which is to say a test on a catastrophic surface is not done until the code it covers has been broken and the test seen to go red for that reason. That rule has a code anchor and this document does not, so it owns the definition; two definitions of one floor is how a surface comes to satisfy the weaker of them.

What follows is the depth expected on top of that floor, not an alternative to it. In addition to baseline coverage (§4.4) and STRIDE-aware threat coverage (§4.2), catastrophic-severity surfaces carry:

- ASVS Level 3 verification depth (per §3.4) for the categories that apply.
- Every applicable item from the baseline adversarial list and per-route baseline in `.claude/rules/testing.md`, covered with no skip.
- The canonical invariants -- anti-enumeration response equivalence, session cookie attribute completeness, and idempotency where the surface declares it -- covered by scenario tests with shared assertion helpers in `tests/fixtures/`, so a future refactor that breaks an invariant fails the route's own test. CSRF presence on every state-changing verb is proven by the CSRF sweep over the live route table, so a route's row in that sweep is its CSRF case.

  Anti-enumeration equivalence means the two responses are the same, compared whole under a normalization that redacts only what legitimately varies per request. It does not mean the same within a tolerance. A tolerance cannot fail: the login check was once a plus-or-minus five percent comparison of body *lengths*, and appending the submitted address to the refusal message -- a one-character difference in a multi-kilobyte page -- passed it. `tests/fixtures/normalizeAntiEnumerationBody.ts` is the shared helper and the shape to copy. Timing is a separate assertion with its own test, not a clause inside this one.

Property-based testing is an available technique for catastrophic surfaces when a specific surface justifies the cost. It is not mandated per catastrophic surface. Selective adoption per §12.2 governs when and where it applies.

A catastrophic surface that lacks any floor item carries an issue in the maintainers' private tracker: surface name plus the missing floor item. The issue is closed when the gap closes. No rigor levels, no target field, no per-test ceremony; one issue per gap, closed with the gap.

### 4.6 Persona derivation and the route-by-persona authorization matrix

Authorization defects (a missing gate, an over-broad gate, a privilege that leaks across an ownership boundary) surface only when the right actor exercises the right route. This section defines how the test-persona suite is derived so the derivation is systematic and provably complete rather than ad hoc, and how the personas feed the route-by-persona authorization matrix.

Deriving the persona suite:

1. Enumerate the authorization dimensions from the `Access:` clause of every deployed user story. The dimensions are: authentication state (anonymous, authenticated); email-verified state (verified, or registered-unverified with login blocked until verification); the membership tier ladder (Tier 0, 1, 2, 3); per-resource ownership (owner of the target row); resource-scoped roles (event organizer and co-organizer, club co-leader, group owner and co-owner, group member); the admin role (the curated-media curator surface is admin-operated, not a separate role); the system or internal-caller role (scheduled jobs, secret-gated webhooks); standing flags (Active Player status, Hall-of-Fame / Big-Add-Posse / IFPA-Board honors, vote-eligibility by inclusion list); migration and legacy-claim state (graded auto-link confidence high, medium, low, no-match, plus the claimed-legacy record whose legacy admin flag must not confer admin); and identity edge cases (homoglyph, RTL-override, and unicode display names, duplicate display names, surname collisions, deceased members, accounts inside the deletion grace period).

2. Treat each dimension as an axis and apply equivalence partitioning to actors, the technique ISTQB defines for inputs: every distinct gate outcome is one equivalence class, and the suite carries one seedable persona per class. For ordered dimensions add boundary-value personas at the gate edges: the tier just below a route's requirement versus at or above it, an Active Player grant that is current versus one that just expired, a deletion grace period still open versus just elapsed.

3. Derive negative personas explicitly. STRIDE Elevation-of-Privilege and abuser-story analysis require, for every privileged route, an authenticated actor who is authorized and an authenticated actor who is not, plus the adjacent-owner persona (a member who owns some resource of the same type but not this one). The adjacent-owner persona is what surfaces broken object-level and function-level authorization (OWASP API Security Top 10 BOLA and BFLA); without it, an owner-only route that silently serves any authenticated member passes every positive test.

4. Map each class to a concrete, named, seedable persona. A dimension that combines with another to change a gate outcome yields a separate persona (a Tier 1 club co-leader and a Tier 1 club member who is not a co-leader are two personas), but combinations that never change an outcome are not multiplied out.

Controlling combinatorial growth: the axes are orthogonal, so the full cartesian product is large and most cells are uninteresting. Catastrophic and high-severity surfaces (auth, session, member privacy, payments, identity claim, per §3) are covered exhaustively across the relevant axes; the rest is sampled with pairwise (all-pairs) selection so every pair of axis values appears in at least one persona without enumerating every triple. Risk severity, not convenience, decides which surfaces are exhaustive.

The matrix: the deployed-route inventory is crossed with the persona suite, and every cell asserts the expected gate outcome, an allow cell for each authorized persona and a deny cell for each unauthorized one. An unasserted route-by-persona cell is a visible candidate authorization gap rather than a silent one, so the matrix doubles as a coverage ledger. The deny half is mandatory: a route that asserts only its allow cells has not been tested for authorization.

The canonical catalog and its maintenance: the persona suite is instantiated once, as the maintainer-curated catalog the persona harness seeds and the `/dev/switch` and `/dev/personas` affordances expose (§7.5). The catalog is the single source of truth; new test slices add a persona there rather than inventing fixture rows, and each persona records the testing dimensions it exercises so the catalog itself reads as a coverage matrix. A deployed surface that no existing persona exercises is the signal that a new persona is required. Where the catalog does not instantiate every class this section derives, the gap is a deviation tracked in the maintainers' private tracker, not a relaxation of the target.

### 4.7 Real data shapes, factory parity, and the real path

Personas cover who acts. These four rules cover what the data looks like and which code a test drives, because a suite built on idealised fixtures passes while the real data takes a branch no fixture reaches. Each rule is stated operationally in `.claude/rules/testing.md`.

- *One test per real data shape.* A story that reads migrated data (a legacy claim, a club affiliation, a trick page, an event result, an honour) is tested once per distinct shape that data takes, not on one representative record. The shapes are counted from the built database, each with a count and a sample record id, and an empty shape is named rather than dropped. The real-data leg (§5.10) claims one record per claim shape.
- *Factory parity.* A test factory's column pattern (which columns it sets, leaves null, leaves blank) matches what the pipeline builds, or the difference is named beside the factory. A factory that sets a column by hand which the pipeline never fills hides the pipeline's defect from every test that uses it.
- *The real path.* A test helper or a `src/testkit/` journey drives the entry a controller calls, never a function inside it. A helper that calls an inner function skips the steps the real path takes before it, and the test then proves a path no user can take.
- *Whole-population invariants.* A rule over migrated data is checked over the whole built database, not sampled, and a check over an empty table skips rather than passes. The invariants run on every database a deploy ships and on staging's real data (§8.5).

### 4.8 The cross-cutting rule register

Some rules hold across every surface that touches a member state or a field, and are tested once each by a sweep with a completeness relation: a new sender, route, table or branch fails its sweep until it is classified. Each register row cites the design passage it rests on; a rule with no citable passage is a question for the maintainer, never a test.

| Rule | Governing passage | Sweep |
|---|---|---|
| No mail reaches a deceased, soft-deleted or purged member | `docs/DESIGN_DECISIONS.md` "Outbox Pattern for Emails"; `A_Mark_Member_Deceased` | `tests/integration/member-state.mail.sweep.test.ts` |
| Contact fields are hidden by default and shown only to signed-in members on the member's opt-in | `docs/DATA_GOVERNANCE.md` "Member-data visibility taxonomy" | sentinel-PII sweep (to build) |
| Birth date is owner and admin only | `docs/DATA_GOVERNANCE.md` "Member-data visibility taxonomy" | sentinel-PII sweep (to build) |
| No member sees another member's payment records | `docs/DATA_GOVERNANCE.md` "Member-data visibility taxonomy" | sweep to build |
| A historical person is never contactable and confers no member capability | `docs/DESIGN_DECISIONS.md` "Member, Legacy Member, and Historical Person Entity Types"; `docs/DATA_GOVERNANCE.md` "Legacy archive and imported historical identities" | sweep to build |
| A deceased member cannot authenticate | `A_Mark_Member_Deceased` | `tests/integration/member-state.authentication.sweep.test.ts` |
| A soft-deleted, deceased or opted-out member, or a registrant still onboarding, is absent from search, rosters and listings | `docs/DESIGN_DECISIONS.md` "Soft Deletes"; `M_Search_Members`; `A_View_Official_Roster_Reports`; `M_Complete_Onboarding_Wizard` | `tests/integration/member-state.listings.sweep.test.ts` |
| Migrated data the pipeline carries reaches the database whole (each in `scripts/validate-realdata-ri.sh`) | `docs/DESIGN_DECISIONS.md` Legacy Data Migration decision | the real-data invariants (§8.5) |

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

Vitest plus Supertest plus better-sqlite3 against a real SQLite test DB per file (`tests/integration/`). Exercises real route, middleware, service, and DB paths. No mocks. The default home for assertions that exercise routes, services, schemas, or persistence. A few files here drive a committed command-line script as a real subprocess instead of an HTTP route, including the redirected club production chain, which runs the legacy club extractors; those run under the legacy pipeline's own Python environment, which `bash legacy_data/run_pipeline.sh venv` (and `run_dev.sh`, which calls it) builds from the hash-pinned requirements, and fall back to the `python3` on the path, into which the continuous-integration job installs the same hash-pinned requirements before the suite runs.

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
- Staging-AWS integration (S3, KMS live)

The generated route-by-persona authorization matrix (§4.6) lives here: it crosses the deployed-route inventory with the derived persona suite and asserts the expected allow or deny outcome for every cell, so an unasserted route-by-persona combination is a visible candidate authorization gap.

### 5.3 db-load smoke

The `db-load-smoke` gate applies the schema and runs the legacy_data loader pipeline against fixed fixtures, asserting row counts and shape. The canonical regression gate for the historical-data pipeline. It runs locally, inside the clean-room gate's throwaway worktree, which holds the committed tree plus any uncommitted changes but none of the gitignored real-data trees, and so presents an empty-checkout condition. It is pre-go-live data-load Python, which continuous integration does not run.

Belongs:

- Schema-load smoke
- Loader pipeline row-count and shape assertions
- Migration regression cases tied to the pipeline validation gates (§8.9)

Does not belong:

- Tests requiring application HTTP layer
- Tests that mutate live data

### 5.4 Staging-AWS adapter smoke

`tests/smoke/`, gated behind `RUN_STAGING_SMOKE=1`, excluded from default `npm test`. Runs against real staging AWS (KMS, SSM) via the assumed-role chain configured by `scripts/test-smoke.sh`. The canonical regression gate for staging-AWS adapter parity.

This tier and the destructive staging tier (§5.11) are the only tiers that reach a deployed environment, and this one reaches it read-and-verify only: identity and parameter reads and a KMS signature; HTTPS probes of the staging CloudFront edge, Google Safe Browsing, Cloudflare Turnstile (production target only) and public reachability targets; and a read of the staging persona catalog over ssh. It sends no email and writes nothing. Every other tier is unauthenticated by construction. The shared setup breaks credential resolution for each worker and everything it spawns, so a test that runs an operator script cannot write to a deployed environment whatever that script would otherwise do, and a convention gate keeps that in place. The rule lives in `.claude/rules/testing.md`, "Tests never mutate live infrastructure". It is enforced in one shared declaration because per file is what failed: a case reached the AWS call on a maintainer's workstation, whose ambient profile was a real operator identity, overwrote a live API key in a deployed Parameter Store with its fixture value, and the suite reported a clean pass.

Belongs:

- Adapter staging-smoke (one per adapter, per the adapter three-test contract in `.claude/rules/adapter-conventions.md`)
- Health and readiness checks against staging
- Identity and KMS round-trip verification

Does not belong:

- Any write to cloud object storage or a deployed database. A write to staging belongs only in the destructive staging tier (§5.11), which restores what it changes; a write to production belongs in operator tooling a person deliberately runs, never in a test.
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
- CSRF presence on every state-changing verb (scenario test reused per state-changing route via shared helper; a property-based formulation is an optional upgrade when the surface justifies it)
- Rate-limit boundary assertions
- Session cookie attribute assertions
- Secret and PII leakage regression tests (see §10)
- Testing-shortcut regression tests (§7.5)

Cross-cutting regression classes (cookie attributes, anti-enumeration response equivalence) are implemented via shared assertion helpers in `tests/fixtures/` that the route's own test imports and invokes, so a future refactor that changes the cookie-issuance helper to drop a flag fails the route's own test rather than only a centralized middleware test. CSRF presence on every state-changing verb is proven by the CSRF sweep over the live route table, which also catches a sub-router mounted outside the perimeter.

Beyond the per-route helpers, four invariant families are generated across every surface they can touch, so a newly added surface is covered by construction rather than by memory: anti-enumeration exists/not-exists response-equivalence pairs, the append-only mutation guards for ledgered tables (audit, tier, active-player, system-config), the idempotency assertions for replayable surfaces (outbox, webhook delivery, grant application), and the read-only GET and submitted-twice sweeps over the live route table.

### 5.7 Testing-shortcut regression tests

A named sub-class of security regression. Any dev-or-staging-only code path that bypasses production behavior to enable tests (a persona-switch session, a bootstrap admin grant, token surfacing for email-flow tests, internal-event injection) is governed by the testkit / dev-bootstrap pattern (§7.5) and must land with the canonical required test set (§7.5.4).

### 5.8 Penetration testing

See §9.

### 5.9 Email testing

Outbound email is a layered surface: content, enqueue, transport drain, human inspection, and live deliverability each fail differently and are tested at the layer that isolates the failure. The platform sends transactional security mail (verification, password, claim) and operational notifications (membership, club, payment, Active Player) through one path: a service composes the message, enqueues an `outbox_emails` row through `communicationService`, and the worker drains the row through the `SesAdapter` seam. `StubSesAdapter` captures messages in memory for development, CI, and staging; `LiveSesAdapter` sends through Amazon SES in production. The `SES_ADAPTER` config invariant in `src/config/env.ts` defaults to `stub` below production and follows the email arming flag in production (armed requires `live`, dark requires `stub`; production boot fails fast on an unset adapter or a flag mismatch), so mail is captured rather than sent everywhere except an armed production.

The five layers and what each owns:

- *Content (unit + conformance).* Each email's subject and body are rendered from its committed template sidecar (seeded into `email_templates`), with a typed shaper computing the merge values and selecting the variant key. Unit tests cover the shaper catalog (every logical email shapes to its expected variant with exactly the declared merge fields) and the sidecar conformance gate (every registered variant has exactly one sidecar, every token declared and used); the render contract (token substitution, disabled-template suppression, missing-row failure) is pinned once over the email service. A test that asserts wording reads the sidecar through the shared render helper rather than restating body copy as a literal, per the strategic anti-patterns in §15.1.
- *Enqueue (integration).* For each email, a test asserts the triggering service method enqueues one `outbox_emails` row with the correct recipient, idempotency key, and the rendered template content; that guard and no-op paths enqueue nothing; and that a member with no deliverable address (absent login email, deceased, soft-deleted, or purged) is skipped without raising.
- *Transport drain (integration).* `communicationService.processSendQueue` drains pending rows through `StubSesAdapter`, and the captured `sentMessages` carry the rendered message. The queue mechanics (retry with backoff, dead-letter at the retry ceiling, crash recovery, admin pause, scheduled deferral, and the `body_text` scrub after send) are exercised once over the shared path rather than per email.
- *Human inspection (development and staging).* Captured mail is readable without a real inbox. Every email-gated login page renders the simulated-email card with the flow's captured message and its clickable link, and the `/dev/outbox` viewer lists every captured message for notifications that have no host page. The in-process stub and these viewers serve as the catch-all inbox; they need no extra process and run identically in CI.
- *Deliverability (production).* On staging, email is the adapter stub and nothing else: nothing on staging sends, and staging's runtime role holds no send permission. Live sending is first exercised on production by the operator-run `scripts/verify-prod-email.sh`, which sends to the Amazon SES mailbox simulator (`success@simulator.amazonses.com` for a clean send, and `bounce@simulator.amazonses.com` with `--bounce-probe` to drive the feedback path) and optionally to one operator inbox. Simulator mail consumes no sender reputation and no quota. Inbox placement, sender reputation, and SPF, DKIM, and DMARC alignment are observed in production through the SES reputation metrics and the feed.

Every promised email is covered by construction. The email catalog names each email by key, owning service, and idempotency-key prefix; the email-catalog sweep (§16.2) asserts each entry has a live enqueue site and a firing test, so an email that a service contract promises and the code never sends fails the suite.

Armed production differs in what the live path adds: it resolves `SES_ADAPTER=live` and sends through SES; it honors the SES suppression list, so an address that has hard-bounced or complained is withheld; it records bounce and complaint feedback from the queue the worker polls, where that environment's feedback queue has been brought up; and it carries the sender-identity, DKIM, and DMARC records that the stub path does not exercise. Production safety rests on the build-time strip and config guards (§7.1, §9.5); below production, the stub captures every message.

### 5.10 Real-data leg

The real-data leg claims real migrated records and walks the surfaces that render them, proving migrated real-world data renders and behaves once a member claims it. It claims one record per claim shape (§4.7), chosen by a query over the loaded data: no club; a club that is already a real club; a club the old site never made real; such a club in a country that groups clubs by state, with no recorded state; a Hall-of-Fame honoree; a record whose name comes only from the mirror; and one record per matching outcome of the legacy matching component. A shape the loaded data holds and the leg does not claim fails the leg. It also checks that each walked page's statement count does not grow with its rows.

Before cutover it runs on this machine against an online `backup()` copy of the local database in a temporary directory, with the app in-process against the copy, so nothing is written to the source database or to `legacy_data/` and `curated/`. After cutover it runs on staging inside the bare `./run_all_tests.sh --staging` run (§5.11), with each claim it makes named and undone. It needs the full authoritative member load; without it the row reports "not required" and does not hold the run back. Findings name the route pattern, the record id, the check and a short hash, never the claimed person's name or contact details.

### 5.11 Destructive staging tier

Staging carries the real dataset and is for full testing. The destructive staging tier is the `gate_staging_*` rows that only the bare `./run_all_tests.sh --staging` run schedules, after the read-only staging rows; `./run_all_tests.sh --quick --staging` runs the read-only rows alone. Each row refuses unless the staging host check passes, and a run of this tier counts as a staging change under the heads-up rule.

- *Persona walk.* A persona refresh before and after; each persona, freshly seeded, signs in through `GET /dev/switch?as=<slug>` and walks the site over HTTP, submitting forms on persona-owned targets only, with each submission's outcome asserted.
- *Curated-content form walk.* The admin test persona submits every curated-content write form (freestyle trick edits, aliases, sources, modifiers, notation authoring and publishing, freestyle tips, freestyle sources, freestyle records, consecutive-kicks records, curator media upload, edit and delete, curator galleries, email template edits), checks the stored effect and the outcome message, and undoes its own change: a created-then-deleted throwaway item where the form allows one, otherwise the previous values written back, and any uploaded media removed from object storage. The walk first asserts the host has curated-file writes off. These forms edit shared catalogue rows, the one named exception to persona-owned targets.
- *Story checks.* Destructive cases over the deployed stories' success criteria, including the data export and account deletion check, and the curation and freestyle story checks.
- *Real-data leg* after cutover (§5.10).

Every case that changes a real-data row names its undo: before go-live a full rebuild, after go-live the production-to-staging pull, or a local throwaway copy in place of staging. The only automated writes to staging outside this tier are the post-deploy security check (`scripts/smoke-security.sh`) and the load check (`scripts/load-check.sh`), both on persona-owned rows. Nothing automated writes to production.

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
- test, expect, action, navigation and boot time budgets set in `tests/playwright.config.ts`, each scaled by `E2E_TIMEOUT_FACTOR`
- `trace: 'retain-on-failure'`; `screenshot: 'only-on-failure'`; no video
- reporter: `list` (local), `[['list'], ['github']]` (CI)
- `forbidOnly` under CI, so a focused test left in a spec fails the run instead of narrowing it
- webServer: `bash scripts/e2e/start-stack.sh`, healthcheck `/health/ready`

Belongs in the lightweight suite:

- One representative happy path per business-critical surface (login, registration, email verification, password reset, legacy claim, avatar upload, club cleanup, organizer flow, admin spot check)
- Real-browser cookie attribute assertions (HttpOnly, Secure, SameSite=Lax)
- Single-worker-safe wizard flows
- Onboarding, club-cleanup, and legacy-claim wizard happy paths plus the one negative case per wizard that only a browser can reveal
- Accessibility automated checks via `@axe-core/playwright` on business-critical surfaces, tagged `@a11y` (per §14.1)
- The one template-deduplicated browser spec, the rendered-style check (`npm run test:rendered-style`), in its own configuration and continuous-integration job. It seeds the crawl corpus and walks the site by links as each persona to find one page per view; a view no link reaches is listed by URL, or by the URL of the page whose form renders it together with the fields to submit, and an unlisted view fails. Each page renders at 390px and 1280px and is checked with axe, for page problems (console, CSP and script errors, failed same-origin requests), and for rendered style through the shared rendered-style helper: hidden elements still displayed, bordered fieldsets, contrast against the composited background, heading against body text, the text-size floor, prose width and colour, prose links with no cue besides colour, form fields without a visible label (a search box named by its accessible name beside its own submit button counts as labelled), empty states naming a table, the spacing rhythm (every gap between stacked blocks and inside drawn boxes on a role step), target size, overflow and unlabelled scroll boxes at 390px, and table fit at 1280px. It also reports text drawn over other text, text cut off with no ellipsis, colours no root token holds, prose set tighter than 1.4 times its type size, images with no declared shape, and a colour the contrast check cannot read; at 1280px it tabs through each page and reports any control whose keyboard focus draws nothing. Content inside a closed disclosure is not judged, because the browser lays it out without drawing it. Known findings sit in a shrink-only baseline of rule, view, viewport, count and a short hash of the elements found: a new or larger finding fails, as does the same count found on other elements, and a fixed one never does. Run on its own on a workstation, the check lowers the baseline file itself; in CI and inside the full local runner it only reports that the baseline could be lowered. Running with `RENDERED_STYLE_WRITE_BASELINE=1` is the one deliberate way to accept a new finding as known. Every finding in full is written to `tests/test-results/rendered-style-findings.txt`. A URL that renders a view other than the one it was listed for always fails and can never be accepted into the baseline. Every offending page is reported in one failure, each rule is proven red on a planted page, and the check first confirms the site's own fonts rendered, in every weight the stylesheet uses and for accented letters, so its measurements match on every machine.

Does not belong:

- Every business-rule branch (unit or integration)
- Per-route browser navigation crawls (operator-invoked via browser-qa; the HTTP route-wiring crawl lives in §5.2)
- Multi-browser parity (operator-invoked via browser-qa when needed)
- Pentest attack flows (operator-invoked via browser-qa)
- Deeper accessibility audits beyond automated `@a11y` coverage (operator-invoked via browser-qa or manual review)

### 6.3 Tag taxonomy

A test may carry zero or more tags. Tags are how gates select within the suite (§11). Canonical tags:

- `@smoke`. The smallest, fastest browser tests. They run inside the full local Playwright e2e suite (which boots a throwaway local stack and needs no AWS), and `npm run test:e2e:smoke` selects the same subset against that local stack. The browser check against a deployed environment is a separate, anonymous, submit-nothing spec run by `npm run test:deployed -- --target <staging|production>` (§11.7), and both are separate from the vitest staging-adapter smoke gate in §5.4, which exercises live-AWS adapters rather than the browser.
- `@security`. Security regression sub-class.
- `@a11y`. Accessibility regression via axe-core against business-critical surfaces; runs in CI on every push and in the full local suite (`./run_all_tests.sh`).
- `@migration`. Migration and onboarding regression. May live in integration or e2e; cuts across.

### 6.4 Artifact privacy

Authenticated Playwright artifacts contain potentially sensitive material (session cookies, member display names, navigation paths, error content). The defaults (trace retain-on-failure, screenshot only-on-failure, no video) minimize unnecessary capture. Beyond the defaults:

- Storage state files (Playwright `storageState`) are sensitive and never committed. The `.gitignore` covers `tests/test-results/` and any `*.storageState.json` location. Generated storage state belongs in temp directories, deleted at suite end.
- Traces, screenshots, and HTML reports produced by failures are treated as potentially containing PII or secrets. CI upload of these artifacts, where configured, uses access-restricted storage (private artifact retention, not public links). Public CI logs do not embed the artifact path with a public URL.
- Tests that drive the `M_Login` flow do not include the password literal in command-line arguments, in `console.log` debug, or in screenshot-captured form fields. Password fields are typed via Playwright's `.fill()` which is not captured by trace inputs.

### 6.5 Auth pattern for E2E

Lightweight integration with auth uses the existing `tests/fixtures/personas.ts` helper, which composes a member, tier grant, historical-person link, and JWT into a `Persona`. A browser context is authenticated by having the application issue the session cookie, through the persona-switch route (`GET /dev/switch?as=<slug>`, active in development and staging, §7.5.1), never by injecting the cookie with `context.addCookies()` and never through a fresh login chain that depends on receiving an email. Injection is not available: the session cookie's `__Host-` name prefix means a browser accepts it only on a cookie it received in a real response, so a hand-injected one is refused outright.

---

## 7. Environment parity, staging, and personas

### 7.1 The four environments

The platform targets four environments. Each has parity contracts that tests verify.

- *Local development.* Runs on the maintainer workstation via `./run_dev.sh`. SQLite at `./database/footbag.db`. Local stub adapters (JWT signing stub, SES outbox stub, media storage local-disk stub). The `src/testkit/` test scaffolding and the `src/dev-bootstrap/` conveniences are active under `FOOTBAG_ENV=development`.
- *CI.* Runs every job in `.github/workflows/ci.yml` against ephemeral SQLite. No real AWS. Adapters are the same local stubs the workstation uses.
- *Staging.* The real AWS staging account (KMS, SES, S3, SSM, Lightsail). The `src/testkit/` test scaffolding and the `src/dev-bootstrap/` conveniences are active under `FOOTBAG_ENV=staging`. The staging-AWS adapter smoke suite (`tests/smoke/`) runs here, gated by `RUN_STAGING_SMOKE=1`.
- *Production.* The real AWS production account. `src/testkit/` and `src/dev-bootstrap/` are excluded from the production image at build time (when `INCLUDE_DEV_SHORTCUTS=0` the Dockerfile strips both subtrees, then rewrites every module still statically imported from them as a no-op stub so app boot survives; a static import added without its stub crashes production boot with `MODULE_NOT_FOUND`, and the convention gate blocks that at merge time); boot-time guards in `src/config/env.ts` fail-fast if any `FOOTBAG_DEV_*` env var is set; `scripts/audit-dev-shortcuts.sh` returns zero against the production DB. Both are permanent in source, build-excluded from prod and never deleted.

### 7.2 Adapter parity tests are mandatory

The three-test contract from `.claude/rules/adapter-conventions.md` applies to every adapter (`JwtSigningAdapter`, `SesAdapter`, `MediaStorageAdapter`, `ImageProcessingAdapter`, `VideoTranscodingAdapter`, `SecretsAdapter`, `SafeBrowsingAdapter`, `CaptchaAdapter`, `HttpReachabilityAdapter`, `PaymentAdapter`, and any future adapter):

- Boot-time config test (`tests/unit/env-config.test.ts`): module-load fails fast when required prod-mode env vars are absent.
- Interface parity test (`tests/integration/adapter-parity.test.ts`): both implementations satisfy the TypeScript interface with identical observable output structure, exercised via an injected fake client.
- Staging-smoke test (`tests/smoke/`): hits real staging AWS via the assumed-role chain, gated by `RUN_STAGING_SMOKE=1`.

These tests describe permanent contracts. They are not sprint-scoped.

A stub refuses every input the live implementation would refuse without contacting the provider: an absent captcha field, an address on the provider's suppression list, an unsigned payload. A stub that accepts what live refuses hides the defect from every environment below production, so the interface-parity test asserts the refusal on both sides. Stubs stay permissive about everything else, so development convenience is unaffected.

The staging-smoke leg applies to adapters that reach an external service over the network: `JwtSigningAdapter` and `SecretsAdapter` (real AWS via the assumed-role chain), `SafeBrowsingAdapter` (the real Google Safe Browsing API), and `HttpReachabilityAdapter` (arbitrary member-submitted hosts on the public internet). The two internal docker-network adapters (`ImageProcessingAdapter`, `VideoTranscodingAdapter`) carry boot-config and interface-parity tests but no workstation staging-smoke: their dependency is the internal `image` worker rather than an external surface the dev-against-staging (no-ssh) model can reach, and their failure mode is a noisy first-request error rather than silent IAM or network drift. Their wiring is covered by the interface-parity tests, the compose `image:4000/health` healthcheck that gates stack startup, and the e2e upload path.

`HttpReachabilityAdapter` belongs with the external group rather than the internal one, which is what its outbound probe actually is: it resolves and fetches hostnames a member typed, and it needs no deployed host to exercise, so a workstation runs the same code path a host runs. Its failure mode is also the silent kind the smoke tier exists for. Every other test of it injects a fake fetch and a fake resolver, and outbound HTTPS that a network, a proxy or a resolver refuses is indistinguishable from an adapter that was never wired: the site simply starts telling members their links are wrong. Its smoke probes are chosen to touch nothing incidental — IANA's reserved documentation domain for the reachable case, an RFC 5737 TEST-NET address for the unreachable one, and a loopback address for the SSRF refusal, which is the assertion that matters most because a live adapter that lost its per-hop guard still passes the other two.

`SesAdapter` carries boot-config and interface-parity tests but no staging-smoke. On staging, email is the adapter stub and nothing else, and staging's runtime role holds no send permission, so there is no staging send to probe. Its live path is verified on production by the operator-run `scripts/verify-prod-email.sh`, run deliberately, not by a suite.

`MediaStorageAdapter` carries boot-config and interface-parity tests but no workstation staging-smoke. Its live implementation writes and deletes objects in a real bucket, and no test writes to cloud object storage in any environment, so the put, head, and delete path is proved by the interface-parity tests against an injected S3 client and by the e2e upload round-trip. Verifying the live bucket path is operator tooling, run deliberately, not a suite.

`PaymentAdapter` carries boot-config and interface-parity tests but no workstation staging-smoke. Its live implementation reaches Stripe, but a smoke test that created a real Checkout session or delivered a real charge has side effects no read-only probe should: the live path is instead verified by the signed-webhook integration tests (signature acceptance, tamper rejection, and replay idempotency against the real verifier) and by the stub checkout pass-through that drives the same handler. Live-Stripe end-to-end exercise is the operator-run production-only verification in §7.7, not the smoke suite.

### 7.3 Staging-AWS adapter smoke entry point

`scripts/test-smoke.sh` is the canonical entry, run as `npm run test:smoke -- --target <staging|production>`. It reads terraform output for environment-specific values (KMS key ARN, S3 bucket name), asks the environment's host for the address it serves, exports the staging AWS profile and region, fetches operator-supplied SSM secrets via the assumed-role chain, and execs `vitest run tests/smoke/`. The operator runs it locally or from the staging host after any change to staging AWS runtime identity, KMS keys, or IAM policies the app depends on. The entry point targets staging by default; `SMOKE_TARGET_ENV=production` points every environment-specific read (terraform dir, AWS profile, SSM path) at the production account for its one sanctioned use, the pre-cutover production-AWS wiring check the go-live plan's production prerequisites require (GO_LIVE_PLAN.md, private GitHub repo). The persona-catalog smoke is staging-only (personas are never seeded in production) and gates itself off under a production target.

The script does not accept passwords or secrets as command-line arguments. Secrets that the smoke suite needs are read from SSM via the assumed-role chain or piped via stdin from approved secret-manager flows.

The suite reaches live AWS and depends on workstation state a contributor without a deployed-environment role does not hold: the staging runtime AWS profile, an initialized `terraform/staging/` tree, the `footbag-staging` ssh alias, and the operator credential file the deploy scripts read, for the site address and the persona-catalog check. It is not restricted to the IAM user `footbag-operator`: the shared job role `FootbagDevTester` grants staging precisely so somebody who develops and tests can run this, and the runtime profile it needs chains from the profile that assumes that role. A production target is a different matter, and the boundary is the trust policy rather than a convention: production's runtime role trusts the directly authenticated IAM user `footbag-operator` and the host's source-profile IAM user, and no human job role at all. Every entry point fails fast with a plain message when the state is absent, naming what writes it, as do the deploy and activation scripts. A contributor with no AWS access at all loses nothing by skipping it: the bare `./run_all_tests.sh` contacts no deployed environment, and every one of its gates runs without AWS. The suite runs as the staging AWS smoke row of `./run_all_tests.sh --staging`, as `footbag-operator` or as a dev-tester through the dev-tester role (§11.7), or on its own through `npm run test:smoke`.

### 7.4 Staging personas: model and reset

Staging needs synthetic personas that cover the persona suite derived in §4.6 (the authentication-state, tier, ownership, resource-scoped-role, honor, migration / legacy-claim, and edge-identity classes). The personas exist for the persona walk of the destructive staging tier (§5.11) and for operator-driven manual exploration of role-conditional UI.

Persona contract:

- Synthetic identities. Display names and email addresses are obviously test data (prefix `staging-test-` or equivalent), never resembling real member data.
- Verified-status pre-seeded. Routine login does not depend on receiving an email.
- Stored credentials. Passwords live in an approved secret channel (an operator-local file outside every checkout, or AWS Secrets Manager). Never committed.
- Tier and role grants. Assigned through the persona seed pipeline (`reason_code` carries `dev_persona_seed.tier_grant` and similar markers) so the prod-cleanliness audit catches them.

Reset semantics:

- An operator-runnable reset that re-creates the persona set from the gitignored or secret-manager seed file.
- The reset is `bash scripts/manage-test-personas.sh --refresh-test-personas --apply`, which tears down the persona-owned rows and rebuilds every persona from its current spec. It reports what it would change and writes nothing until `--apply` is given, and it leaves a database holding no personas untouched. No password as command-line argument.
- The seed runner is self-healing on the password hash: a persona kept across code-only deploys whose stored hash predates the current scheme is re-hashed in place on the next seed run, its accumulated rows untouched. Restoring a persona's fuller baseline (reverting tester-driven ledger changes) still needs the delete-and-reseed reset.

### 7.5 Test scaffolding and dev-bootstrap conveniences

Two env-gated subtrees hold all dev-or-staging-only code. Both are active under `FOOTBAG_ENV ∈ {development, staging}` and excluded from the production image at build time; they differ in lifecycle.

- `src/testkit/` is **permanent, first-class test infrastructure**: the persona harness (row builders, factory, canonical catalog, seed runner), the persona-switch route (`GET /dev/switch`), the persona listing (`GET /dev/personas`), and the dev-router mount glue. It is never source-deleted; features keep shipping with tests against it after production launch.
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

Some contracts cannot be exercised below production: the stub and staging paths deliberately avoid real side effects (real charges, real mail to real inboxes, real DNS and TLS, the real first-admin claim). These are lumped here as one operator-run pass. Each produces an observable artifact (a settled row, an audit row, a delivered message), not just a 200.

**Live email deliverability.** With `SES_ADAPTER=live`: a real send to an operator inbox lands in the inbox and passes SPF, DKIM, and DMARC at a major provider; a real bounce and a real complaint (the SES simulator addresses) write a suppression row and a feedback-feed audit row; the suppression list then withholds a later send to that address.

**Live Stripe payments.** Live payments move real money, so they are verified in two stages — Stripe test mode against the real Stripe API, then a controlled live canary — before members can pay. The stub checkout pass-through and the signed-webhook integration tests (§7.2) cover the handler; this verifies the real Stripe surface the stub cannot.

1. Test-mode end-to-end, run on production because the live adapter runs nowhere else, while the production-live marker reads "false", the only state in which the key-match guard admits a test key there: against test keys, drive real Checkout session creation and real Stripe-signed webhooks delivered to the registered production endpoint: success grants the tier, cancel and decline do not, the signature validates against the production verifier, a resent event does not double-grant, and the SCA / authentication-required and declined-card paths behave. Then the flows a one-time charge does not touch: a recurring signup, a renewal produced by advancing a test clock, a declined renewal through the configured dunning to its cancellation, a platform-side cancellation, a partial and a full refund, a dispute raised with the dispute test card and closed, a signing-secret rotation overlap with no dropped delivery, and the payments pause drill with a delivery still processing. Each real payload is sanitised into the golden-payload fixture, renewal invoices first, and the reconciliation pass runs clean afterwards.
2. Live canary: with the live API key and webhook signing secret in Parameter Store and the live endpoint registered on the production distribution's own `cloudfront.net` name, make one real low-value charge with a real card; confirm a settled `payments` row, the tier grant, the receipt email, and the audit row written by the signature-validation path; refund it and confirm the refund path leaves no dangling grant; replay the live webhook from the Stripe Dashboard and confirm no double-grant.
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

**Protection model.** Staging matches production's network posture — a public site with no edge access control — because parity with production and operational simplicity are first-order goals, and a staging-only gate would break both. Real member data on staging is protected by the same mechanisms that protect it in production: the application's own authentication and the public-versus-member visibility model (public surfaces expose only public historical records; member data requires a session). The environment is additionally kept out of search indexes. The anonymous persona switch (§7.5, §7.6) remains the tester's full-access affordance. The residual exposure this leaves is a risk the maintainer, as risk owner, accepts; data masking and a staging edge gate were both considered and deliberately not adopted. Any IFPA authorization for using real member data in testing is a private governance record kept out of the repo, and no committed doc names the staging address.

**Tester procedure for real-data testing.** This is the real-data test design; the step-by-step for human testers, persona tools included, is TESTING_GUIDE.md (private dev-tester repository).

- Reach staging through the privately shared preview address (never a committed link). Use the persona grid and switch for role-conditional testing, and the loaded real dataset for real-data testing.
- Verify migrated data renders and behaves correctly by claiming a real record and walking its profile, results, honors, and media across the site. Claim any record from the deterministic claim-risk strata below rather than one fixed person.
- Exercise the legacy-claim surface across its risk classes with the deterministic strata sample (linked-with-email, paid-tier evidence, honoree, same-name disambiguated only by birth date, no-email, bare collision stub, and historical-person-without-account): for each sampled row, register on staging with the row's address, read the captured mail on the outbox viewer, and confirm the claim wizard does exactly what the sample expects, including the enumeration-safe outcomes for an absent and an already-claimed record.
- Validate whole-population invariants by query, not by sampling: loaded counts reconcile against the source minus the held-out and excluded cohorts; no claimed account lacks its claim audit row; no historical-person link points at a missing account; every stored email is lowercased.
- Never rehearse a deceased-member flow against a real person's record — use the seeded persona for that.
- PII discipline: never put real member data into anything public or committed, including test output, which is treated as potentially public (§2.1, §10.6). The private bug-intake repository, the maintainers' private tracker and the team Discord may carry real member details where they help reproduce a defect. Secrets go nowhere.

---

## 8. Migration and onboarding testing

The pipeline validation gates in §8.9 below are canonical for migration and onboarding tests. This section adds the playbook framing for deriving migration tests and the constraints that bind to them. The operational-readiness rules live in GO_LIVE_PLAN.md (private GitHub repo) and are cutover-readiness gates, not test anchors.

### 8.1 The migration anchor

For surfaces in the legacy data pipeline that have no direct user story success criterion, anchor on the relevant pipeline validation gate in §8.9 instead of a `docs/USER_STORIES.md` entry. The same trace-to-intent principle applies; the gate text identifies what the test must prove.

### 8.2 Identity claim and confidence levels

Every matching rule lives in one matching component, and every rule has its own test; the claim step, the server-side re-check, the administrator's candidate view and the audit writer are then tested against that component rather than against copies of its rules. The outcome classes each anchor their own tests:

- *Claimable:* a strong or possible match the member's evidence corroborates (or, on the name and surname rule, a competition record with no account behind it, a mirror-built account, or a record linked to one) is offered as a card with one claim control; claiming holds the claim and completes the claim step, and completing the wizard establishes every link the candidate carries and records the evidence. Derived assertions cover the negative: a forged or stale target is refused by the re-check at confirmation, a held target no longer available at completion is not applied, and a repeated claim reports the success it already had.
- *Corroboration:* an old account from the legacy member data (carrying an email or a date of birth) reached by name alone, directly or through its linked record, is shown without a claim control; adding a matching email or holding a matching date of birth makes it claimable. A mirror-built account, carrying neither, is never held for corroboration.
- *Way forward:* every onboarding page a registrant can land on carries its task's completing control, and no claim-step card carries a per-card decline.
- *Surname differs:* a candidate the member's evidence reaches whose surname differs offers "This is me, I used the surname X", which records the former surname and claims in one transaction.
- *Evidence tier:* the verified login email matching the claimed account records the modern-email tier; everything else a member claims records the floor; an administrator's link records admin-vetted evidence.
- *Never offered:* deceased, held, and second-account or second-record candidates are never shown and are refused uniformly on a forged claim; the member's own view gives no sign they exist.
- *Name edge cases:* middle names never block a match and can make one (a maiden name in the middle); hyphens, apostrophes, accents and transliterated letters fold the same way on both sides; nickname pairs and curated name variants match; an old account's username never does.
- *Date-of-birth mismatch:* a date that does not match simply fails to corroborate: an account the member's email corroborates still links; a mismatch never lowers confidence, never raises anything for an administrator, and is never shown on a card; the outcome is recorded in the claim's audit metadata.

### 8.3 Club affiliation and cleanup

Club affiliation tests cover four cases: legacy affiliations that point to known clubs, legacy affiliations that point to ambiguous clubs, members who appear in multiple clubs, and members who appear in no clubs after import. Club cleanup is a state-machine surface; tests are scenario-based per §4.4 with property tests for invariants ("a member is always a member of zero or more confirmed clubs at any point in the cleanup state machine").

### 8.4 Loader pipeline regression

The db-load smoke gate (§5.3) runs the loader pipeline against fixed fixtures in every bare local run. Row-count and shape assertions catch loader regressions. The fixtures themselves are synthetic. Real legacy data is never committed as test fixtures.

Two data-integrity concerns sit beside the loader's row-count regression. *Idempotent re-import:* running the loader a second time against the same input must be safe — no duplicate rows, no crash, no partial-state corruption — the realistic scenario of a re-triggered pipeline after a partial failure; the smoke gate covers a single run, so a re-run assertion is the guard for this. *Backup and restore integrity:* a backup is only as good as its restore, so a restore drill — restore a snapshot into a scratch database and assert schema integrity, row counts against the source, and WAL-checkpoint consistency — proves a mid-write or mid-checkpoint snapshot is not silently unrestorable, before a real disaster-recovery event needs it.

### 8.5 Synthetic data in dev and CI; real data on staging

Migration tests in dev and continuous integration use synthetic legacy records that model edge cases without exposing real personal data, and every committed fixture stays synthetic. Real-data validation runs on the staging real-data test ground (§7.8): the full loaded dataset exercises identity matching, claims, and rendering there. Raw legacy PII is never committed as a test fixture, never appears in a snapshot, screenshot, trace, log, or CI artifact, and never travels downward from staging into the repo or the shared pipeline.

Two data tiers run the suite. The committed synthetic fixtures cover the great majority of it: `npm test`, the `db-load-smoke` loader gate, and routine route, service, and e2e tests run on them with no real data. A small subset needs real, maintainer-only member data — the membership roster, held in the maintainers' private repository (names and membership status only, no contact data), and, for the legacy-import validation class, the vetted legacy member CSVs in the same repository, which do carry contact data. Two real-data rows of `./run_all_tests.sh` are such tests: the real-data leg (§5.10) claims one real record per claim shape and walks what it renders, and the read-only invariant gate runs the whole-population invariants (§4.7) over the loaded data, including reconciliation and referential integrity, that every loaded honours flag traces to the rosters, and that the delivered member data still yields its audited figures, emitting counts and pass/fail only, never names or emails. Both run against the local authoritative member load when this machine holds it; without the load, or without what a row reads from it, each row reports "not required" and never holds the run back, and `--with-persona-crawl` / `--with-realdata-invariants` add them to `--quick`. The same invariants run on every database a deploy ships and, through `./run_all_tests.sh --staging`, read-only against staging's copy (§11.7); after cutover the real-data leg runs on staging inside the bare `--staging` run (§5.11). A tester who must run a real-data test obtains access to the maintainers' private repository from the project maintainer; the data stays minimized and access-controlled, and never lands in a committed fixture, snapshot, trace, or CI artifact.

### 8.6 Migration tests verify the intent, not the loader

A loader-pipeline test that asserts only what the loader implementation happens to do is insufficient if the design intent says the loader should do something different. The gates in §8.9, the Legacy Data Migration decision in `docs/DESIGN_DECISIONS.md` and the claim and onboarding user stories are the intent; the loader is the implementation. Tests verify intent. If loader behavior diverges from that intent, the test fails and the loader is fixed, or the intent is escalated to the maintainer for review and possible update.

### 8.7 Edge-case verification against the real import

The synthetic-fixture suite proves the code; only the real import proves the data.
After an operator load, human verification runs on two complementary levels:

- **Whole-population invariants, queried not sampled.** Aggregate reconciliation
  against the vetted legacy CSVs the load read (loaded row counts equal source counts minus the held-out
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
Every domain on this lifecycle carries the same five test legs; the two pytest legs
exist only while the pre-go-live seeders do, and are deleted with them after cutover:

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
- **Admin authoring** (integration): the in-app authoring surface is audited
  and validated, and an edit is used by the very next read or send with no reseed.
- **Durability through a data-preserving deploy**: domain rows survive
  `scripts/deploy-migrate.sh` with no seeder run. The migrating deploy applies a migration
  file, so this leg authors a throwaway additive migration for the test and hands it to the
  deploy by path, leaving `database/migrations/` to the production migration chain it belongs to.
  This leg is exercised against the migrating deploy directly.

---

### 8.9 The pipeline validation gates

The gates below are the engineering acceptance criteria for the legacy-data pipeline and the
claim and onboarding surfaces that read its output. They are the anchor §8.1 names: a pipeline
surface with no direct user story success criterion traces to one of these instead. Four
validation scripts under `scripts/` and the pre-cutover orchestrator cite them by gate id, and
they are confirmed against the test load.

The go-live plan (GO_LIVE_PLAN.md, private GitHub repo) carries the same gates and is the
authority for go-live planning; it also carries which cutover state transition each gate blocks,
which is sequencing rather than an acceptance criterion and so is not repeated here. Where the
two copies disagree, that document wins and this one is corrected.

| Gate | Criterion | Failure handling |
|---|---|---|
| G1 | No email value, taken across `legacy_email` / `legacy_email2` / `legacy_email3`, appears on more than one row (cross-column uniqueness); collisions surface a priori for curation | Replace provisional unique index with non-unique lookup + ambiguity handling |
| G2 | `legacy_user_id` is unique where non-NULL | Same as G1 |
| G3 | Every `legacy_members` row carries a populated `import_source` value; a row missing it is routed to admin review rather than silently trusted | Rows failing the provenance check route through admin review per the claim-ineligibility rules in the `M_Claim_Legacy_Account` user story |
| G4 | Shape and null quality of profile/contact fields | Adjust import logic and field mapping |
| G5 | Legacy member ID quality: every `legacy_member_id` integer-format-validated and comprehensively (100%) overlap-reconciled against the mirror profile-URL ids and `historical_persons.legacy_member_id`, not a 10% sample | Resolve before final export |
| G6 | Tier-state inputs validated at test load: each of the three `legacy_*` tier-state fields (DATA_MODEL, "Members & Authentication") is spot-checked against reference cases. **PASS**: validated fields are populated and the claim-time mapping reads them; any field that fails validation is left unpopulated, so its basis does not fire (if the paid fields all fail, claims grant on honors alone). Held-back fields are recorded with the tier-state derivation note in GO_LIVE_PLAN.md (private GitHub repo), which is where the gate is walked and where its outcome is the record | Unvalidated fields left unpopulated; honors basis always applies |
| G7 | Mirror-derived club normalization quality. **Requires G12 PASS** so the classifier's `listed_contact` and `member_active` signals, which the club classifier evaluates first in its required order, run against the fully-populated `historical_persons` set including club-only members; running G7 against a partial `historical_persons` set silently under-classifies clubs whose people never competed | Block until G12 PASSes; increase manual review threshold for any remaining quality gaps after both gates clear |
| G8 | Sufficient high-confidence club-leader bootstrap candidates | Adjust bootstrap threshold or expand manual review scope |
| G9 | Bootstrapped clubs produce valid, non-broken club pages | Fix UI before go-live |
| G10 | Outbox → SES → recipient inbox path works end-to-end on the pre-cutover release (enqueue test row, worker drains within 60 seconds, SES returns MessageId, message arrives in recipient inbox) | Debug before cutover; common causes are the pinned From address not matching the policy condition, an unverified sender identity, worker container env vars, worker event-loop bugs |
| G11 | `name_variants` seeded with the high-confidence mined pairs (the seed files track the exact split of loaded and deferred; the `name_variants` contract is DATA_MODEL Name-matching utilities, §4.28) | Name-variant matches are missed, so fewer members find their records and more ask an administrator; document shortfall at the pipeline review |
| G12 | The club-only person cohort extracted into `historical_persons`, per the historical-persons expansion for club members in the legacy data pipeline. Checked as a population floor rather than an exact count, since the count is the pipeline's own output and moves with the data | Classification signals (active-players, contact-competed) run with reduced coverage; onboarding-visible list may shrink |
| G13 | `club_bootstrap_leaders` populated for pre-populated clubs meeting the bootstrap rule in the `M_Complete_Onboarding_Wizard` user story | Leadership activation defers to path 2 (first affiliated member volunteers for leadership) for affected clubs |
| G14 | Canonical `persons.csv` row count reconciled against `historical_persons` population; any accepted discrepancy documented and signed off | Block at test load until reconciled; unexplained delta risks missing or duplicated historical identities |
| G15 | World records export produced in platform format and loads into the records schema cleanly | Records page launches empty or incomplete; fix export before go-live or hide the records entry point |
| G16 | `run_pipeline.sh full` produces events, results, persons, clubs (classified), bootstrap leaders, club-only persons, and variants in one run | Document the multi-step manual sequence required and capture sign-off at the pipeline review; single-command regeneration is the long-term target |
| G17 | Claim flow anti-enumeration invariant holds per the non-revealing messaging rule in the `M_Claim_Legacy_Account` user story: identical UX across matched-none, matched-multiple, matched-ineligible, and matched-eligible, across that story's case list | Collapse divergent response shapes before go-live; side-channel enumeration otherwise possible |
| G18 | Rate limiting active on declared-anchor additions, claim confirmations, registration and password reset, and the onboarding date-of-birth change cap enforced, per the `M_Claim_Legacy_Account` user story (numeric defaults owned by `docs/USER_STORIES.md`) | Block go-live until limiters engage; declared anchors and date-of-birth changes could otherwise be used to probe old accounts |
| G19 | Wizard claim task shows every registrant the candidates their own evidence reaches and the declared-anchor prompt, per the `M_Claim_Legacy_Account` and `M_Complete_Onboarding_Wizard` user stories; the modern-email and floor evidence tiers both exercised at test load | Members whose evidence finds nothing never get prompted to declare; legitimate claims are missed |
| G21 | `legacy_user_id` and `legacy_email` (with `legacy_email2` and `legacy_email3`) populated on `legacy_members` where the delivered export provides them. That table is where claim matching reads the email key; the canonical `persons.csv` keeps its email column empty, because it is committed to the public repository and the platform export carries the identity columns nowhere | Email matching and its corroboration are lost for every account whose addresses are missing, and those accounts become admin-only |
| G23 | Candidate matching covers the verified login email, declared old emails, the name with middle names, nickname pairs and declared former surnames, and surname plus date of birth, per the `M_Claim_Legacy_Account` user story; seeded `name_variants` and given-name nickname tables drive variant resolution | Candidate coverage drops and admin-help-request volume rises |
| G25 | `/history/:personId/claim` confirm page renders the first-name-variant warning inline; surname-mismatch messaging is user-readable; audit metadata captures the claim evidence block and its evidence tier, per the `M_Claim_Legacy_Account` user story | Direct historical-person claim usable but klunky; surname-block failures surface as raw `ValidationError` text rather than the spec'd confirm-page warning |
| G26 | Member-initiated admin help request wired, per the admin review flow in the `M_Claim_Legacy_Account` user story, with structured evidence intake, admin review surface, and audit emission carrying `admin_vetted_evidence` on approval | Members stuck without an auto-surfaced candidate have no path forward; admin-recovery is informal |
| G27 | Multi-record candidate ambiguity count from the seeded `name_variants` table against the test-load `legacy_members` set measured and reviewed jointly by the primary maintainer and the historical-pipeline maintainer; if the count exceeds the member-confirmation throughput the platform can comfortably handle, the `name_variants` seed is pruned before the final import | If unmeasured, members are presented with too many candidates per card and confirmation fatigue produces wrong-account confirmations |

There is no G20; the numbering skips it.

**Tuning authority for G8:** Bootstrap threshold adjustments at test load are a joint decision between the primary maintainer and the historical-pipeline maintainer. Raising the threshold (more conservative) is routine and requires no additional sign-off. Lowering the threshold below a minimum acceptable value (to be set during the pipeline review if lowering is needed) requires IFPA board sign-off, because lowering materially expands who gains bootstrap leadership and the live club-management permissions that follow at first claim.

### 8.10 The retired internal QC subsystem, and what guards the retirement

The internal QC subsystem was operator tooling for reviewing imported net results, mounted only in dev and staging. It is gone: the `/internal` router and its mount, the controllers, services and views under `src/internal-qc/` and `src/views/internal-qc/`, the prepared-statement groups in `src/db/db.ts`, six schema tables, the pipeline scripts that filled and drained them, and their tests.

**What the public site kept.** Two of the three data-quality badges on the net events page were derived only from the retired review queue and went with it: Multi-stage and {n} unlinked. The third, Discipline review, also had an independent source: `net_discipline_group.conflict_flag`, a canonical grouping annotation for an ambiguous match rather than QC review state. It survives on that source alone.

**Where the loader findings go.** The net team builder still runs its seven checks, including a priority-one identity conflict that exists in no other output. They are written to `legacy_data/out/net_team_qc_issues.jsonl`, beside the QC artifacts the canonicalization stage already writes there. Every field is derived from the data rather than the run, so a rerun over unchanged data reproduces the file byte for byte and a diff means the data moved.

**Automated enforcement.** The convention gate scans application source, the schema and the pipeline for QC entry points and retired table names, because a QC page cannot return without code in one and a table in the other. It runs in continuous integration through the existing convention-gate job.

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
- Origin-pin CSRF coverage: every state-changing route refuses a foreign Origin and a forged Referer, while a same-origin request reaches the handler. The perimeter's own exemptions, the signature-authenticated webhook receivers, the one-click unsubscribe endpoint whose caller is a mail client, and the shared-secret internal mounts, are excluded from the sweep and read from the middleware that enforces them, so the probe holds no second copy of that list to drift against.
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

`scripts/audit-dev-shortcuts.sh` queries the residue-marker counts in the production DB (`reason_code` under `dev_admin_*`, `action_type` under `admin.dev_*_grant`, `created_by` under `dev-shortcuts/*`, and the persona-harness markers `dev_persona_seed.tier_grant` / `testkit.persona_*`) and exits non-zero if any count is positive. It blocks on every database a production deploy builds, alongside the checks for persona members and development-only settings, and runs against the live production database in `scripts/pre-cutover-checklist.sh --target production`.

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

Test data is deterministic in everything a test asserts. The `uid()` helper in `tests/fixtures/factories.ts` builds unique identifiers from an in-process counter plus a random tail, because e2e spec processes share one live stack database and a bare counter collides across processes; a test therefore never asserts an id's literal value, and takes it from what the factory returned. Tests that compare against `Date.now()`, `randomUUID()`, or `crypto.randomBytes()` without freezing the source produce flake; the operational rule against timestamp leakage in `.claude/rules/testing.md` applies.

### 10.3 No committed credentials, auth state, tokens

`.gitignore` covers:

- `.local/`, kept as a guard now that the operator-local inputs live in the maintainers' private operations checkout.
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

The logging and observability hygiene rules in `docs/DATA_GOVERNANCE.md` prohibit raw email addresses, tokens, passwords, raw JWT cookie values, account-token raw strings, session secrets, AWS access keys, KMS material, and signing keys from application logs. The same prohibition applies to test output, CI logs, and test artifact uploads. Test output is treated as potentially public.

### 10.7 No real PII in fixtures, snapshots, or seed files

The `factories.ts` `insertMember` helper accepts overrides; tests that need member rows use synthetic values. Snapshot tests do not snapshot member display names, email addresses, or any field that could collide with a real member identity. Seed files committed to the repository (only schemas and example shapes are committed; secret seeds are gitignored) follow the same constraint.

### 10.8 Brittle dates avoided

Tests that depend on the current date, the current week, the current season, or the current calendar year are brittle and produce flake. Tests freeze time at the seam (`vi.useFakeTimers()` or equivalent), or assert shape rather than calendar values. Fake timers cannot move SQLite's clock, so a fixture read by a gate that compares a stored timestamp with the database's own `now` (tier expiry, Active Player status, a grace window) is seeded relative to the runtime clock through the helpers in `tests/fixtures/clock.ts` (for example, an expiry a given number of days from now), never as an absolute date that silently changes meaning once the calendar passes it. The exception is calendar-boundary tests that exist specifically to verify behavior at year, leap-year, or DST transitions; those tests inject the boundary date explicitly.

---

## 11. Execution strategy: gates, selection, efficiency

Not every test runs every time. This section defines the named gates, what runs at each gate, what blocks what, and how tests are selected within a gate.

### 11.1 The seven gates

- *Local fast loop.* Typecheck plus the targeted set for the changed files: their own tests, the tests that name them, and the one extra check each kind needs, as `scripts/test-targets.sh` prints them. Seconds to a minute. Developer-triggered. No gate enforcement; convenience for the working developer.
- *Local gates.* `./run_all_tests.sh --quick`, which `npm run test:quick` runs, before a commit: build, test type-check (`typecheck:tests`), lint, conventions, harness self-check, generated-content, the secret scan (which no vitest tier can reach and which is otherwise first seen as a red push), and the unit and integration tiers, security regression included. The bare `./run_all_tests.sh` before a push and a pull request: every CI job that is safe on a workstation, each test once. `--quick --staging` adds the read-only staging checks, and the bare `--staging` run adds the destructive staging tier after them (§5.11). What each proves, the verdict each run ends with, and production readiness are §11.7. The repository ships git hooks under `.githooks/`, activated by `scripts/install-git-hooks.sh`; without it git looks elsewhere and no repo hook fires at all, whatever the directory contains. Activation is automatic: npm's install-time `prepare` step, `run_dev.sh`, `run_all_tests.sh` and the workstation setup script each run it, and it does nothing outside a git checkout or inside a linked worktree. The pre-commit secret scan warns and allows the commit on a machine with no scanner available.
- *CI on push and pull request.* Every job in `.github/workflows/ci.yml`, triggered by each push and each pull request: the local gates plus lightweight Playwright, the staging-safe security probes against a throwaway stack, coverage (which runs the unit and integration tiers once), CodeQL, and, on a pull request, the dependency review (`actions/dependency-review-action` over the PR diff, alongside the whole-tree `npm audit`). The aggregate check blocks merge; the dependency audit and the dependency review report without blocking (§11.4).
- *On-demand deep audits.* The ZAP scan, the dependency scan, and the production-residue audit against the live production database. Operator-invoked when a covered surface changes or ahead of a production deploy. Reports, does not block.
- *Post-deploy smoke gate.* Runs automatically inside both deploy scripts (`scripts/smoke-local.sh` + `scripts/smoke-security.sh`) against the deployed target: health and route smoke plus the blocking security probes — auth-gate enforcement, anti-enumeration response equivalence, and the dev-surface environment contract (dev harness present on staging, absent in production). Sub-1min. Blocks deploy promotion on failure. Distinct from the staging-AWS adapter smoke (§5.4), which exercises live-AWS adapters, not the deployed HTTP surface.
- *On-demand heavyweight pentest.* Human invokes (`npm run test:pentest:heavy`). May include OWASP ZAP baseline, upload-abuse probes, internal-route probes, header checks, dependency scanning. Browser-driven attack flows are operator-invoked via the `browser-qa` skill. Never runs against production unless explicitly authorized.
- *Periodic third-party pentest.* At major launches (per §9.4). Reports findings; findings produce regression tests at the cheapest appropriate layer.

The db-load smoke gate runs the loader pipeline against fixed fixtures in every bare local run; it carries no path filter, so a loader regression is caught regardless of which files a change touches. Class-specific gating (running a gate only when the surface it covers has changed) is a pattern the suite may adopt for other gates as tooling permits.

**On a memory-constrained host the unit and integration run needs splitting.** The full run holds the whole unit and integration suite in one process tree, and on a host with many cores relative to its memory the operating system's memory guard can kill it with no output, which reads as a broken suite rather than an exhausted one. Two things make it complete. `VITEST_MAX_FORKS` caps the worker count regardless of core count, and the suite runs in pieces: `npx vitest run tests/unit`, then `npx vitest run tests/integration --shard=1/3` and its two siblings. Four green runs are the same coverage as one.

### 11.2 Selection mechanisms within a gate

- *Test impact analysis* for the local fast loop. `scripts/test-targets.sh` over the git-diff file list, by naming convention, grep and route tracing rather than the import graph. The fast loop runs only tests that own or name the changed code. A module no test names is followed to the modules that import it, up to two hops, and those are mapped in its place, so a content or library module reaches the suites requesting the pages it feeds.
- *Tag-based selection* across all gates. The tag taxonomy in §6.3 (`@smoke`, `@security`, `@a11y`, `@migration`) drives which tests run at each gate.
- *Risk-severity-based selection* for the on-demand deep audits. Catastrophic and high surfaces (per §3) run in CI on every push. Medium and low surfaces run when the surface changes; a periodic sweep is optional future depth on top of the on-push gate.
- *Parallel workers* where the test runner supports it. Vitest workers for unit and integration; Playwright runs one worker, constrained by SQLite WAL serialization.
- *Skip-on-unchanged-inputs* where tooling supports it. Layers whose inputs have not changed since the last green can be skipped.

### 11.3 Flake discipline

No test may be flaky. A test whose verdict can change with machine load, scheduling, the clock, file order, parallelism, the network or randomness is a defect, even before it first fails, and it is fixed at its root or deleted, never quarantined, retried, or re-run until green.

- Wait on the event itself: a promise the code resolves, a test seam the code calls, a child's own exit. Never on a fixed delay. The conventions gate refuses a promise that resolves on a fixed timeout, Playwright's `waitForTimeout`, and a shell `sleep` inside a stub; the one allowed form is `exec sleep`, a child that never finishes on its own.
- Set the clock instead of waiting for it (`vi.useFakeTimers({ toFake: ['Date'] })` with `setSystemTime`), and never let a wall-clock measurement decide pass or fail in the default suite.
- `.skip`, `.todo`, and `xit` remain forbidden per `.claude/rules/testing.md`, and there is no quarantine path.
- Test retries to mask flake are not used. A test that needs retries to pass is a test that does not deserve to pass.
- Vitest shuffles the order of test files on every run (never the cases inside a file), so a file that depends on another file having run first is found on a workstation instead of on the push. Each run prints its seed; `VITEST_SEED=<seed>` replays that order to reproduce a failure, and is never a way to switch the shuffle off.
- *Why a network-bound suite runs one file at a time.* A per-test timeout is calibrated against a file running alone; concurrent files contend for the same egress and remote throttles, so a generous budget becomes a coin toss that reads as a slow test asking for a bigger number.

### 11.4 What blocks what

- *CI on PR* blocks merge.
- Nothing blocks except a real and serious problem; anything else is a test that simply fails. The dependency audit, the pull-request dependency review, a tool at a different version from the one CI records, and three advisory test-style convention scans (vacuous assertion forms, tool-gated skips, a `cachedGet` suite that writes inside a case) report as warnings and never fail a run. In CI a missing tool fails its job; on a workstation a push-gate check whose tool is absent skips with a warning, because CI runs it on every push (§11.7).
- *The production release gate* refuses a production deploy of anything CI did not prove: a tree that is not clean, a HEAD main does not contain, a CI check not green on every run for the commit, a safety switch, a test seam, a non-canonical origin, or a database the deploy builds that fails a data-quality check or carries development residue. Only a rollback to an earlier commit of main is allowed with a warning (§11.7).
- *Post-deploy smoke gate* blocks deploy promotion.
- *On-demand deep audits* report only; the release gate does not enforce them. The production-residue audit is the exception: it blocks on every database a production deploy builds (§9.5).
- *On-demand heavyweight pentest* reports only. Findings produce regression tests (§9.6).
- *Periodic third-party pentest* reports only. Findings produce regression tests and may block a major launch if a catastrophic-risk finding is open.
- *Why CI parity is mechanical.* `scripts/ci/check_ci_parity.sh` also binds the runner's list of gates that stand for a push-gate job, so one cannot quietly drop off it, and fails if a gate the runner leaves to the clean room is not one the room runs.
- *Why offline gates run under `aws_isolated_run`.* The terraform gate once called STS on every local run, green while the key worked, and reported a rotated credential as a terraform failure.
- *Why vitest refuses a foreign config.* Another config silently takes vitest's built-in timeouts, worker cap, pool and sweep, and the first symptom is a timeout at a ceiling that appears nowhere in this tree.

### 11.5 Token-efficient tiered execution

The project is AI-assisted. Every test-run output is tokens in the agent's context and dollars on the bill. Running the full suite on every edit cycle wastes both. The Vitest features below let an AI (or human) match scope to need.

| Tier | Trigger | What runs | Command |
|---|---|---|---|
| Inner loop | During edit, focused work | The change's own tests, the tests that name what changed, and the one extra check its kind needs | `bash scripts/test-targets.sh [paths]`, then the commands it prints |
| Pre-commit | Before commit | Build, test type-check, lint, conventions, harness, generated-content, secret scan, unit + integration | `./run_all_tests.sh --quick` (what `npm run test:quick` runs) |
| Pre-push and pull request | Before push to remote or opening a pull request | Every CI job that is safe on a workstation, each test once; no deployed environment | `./run_all_tests.sh` (`--skip-py` leaves out the pre-go-live data-load Python gates and ends INCOMPLETE) |
| CI on push | Automated | Every job in `.github/workflows/ci.yml` | CI workflow |
| Staging checks | After a staging deploy | The four read-only staging rows (§11.7) | `./run_all_tests.sh --quick --staging` as `footbag-operator`; a dev-tester runs it through `scripts/as-dev-tester.sh --account <your-name>` |
| Staging end to end | After a staging deploy, with a heads-up first | The read-only staging rows, then the destructive staging tier (§5.11), restoring what it changes | `./run_all_tests.sh --staging`, the same way |
| On-demand deep audits | Operator-invoked when a covered surface changes, and before a production deploy | ZAP scan, dependency scan, production-residue audit against the live database | `./run_all_tests.sh --zap`, `npm run test:pentest:heavy -- --all`, `scripts/pre-cutover-checklist.sh --target production` |
| Post-deploy smoke gate | Every staging or production deploy | `scripts/smoke-local.sh` + `scripts/smoke-security.sh`, invoked by the deploy scripts | Automatic |
| Production browser check | After a production deploy | The anonymous, submit-nothing browser pass over the pages a visitor lands on first | `npm run test:deployed -- --target production`, operator-run |
| Staging-AWS adapter smoke | After changes to staging AWS identity, keys, or IAM | `npm run test:smoke -- --target staging` | Operator-invoked |

**Why not import-graph targeting.** Route suites boot the whole app, so vitest's `--related` reaches most of the suite from almost any source file. The inner loop targets by naming convention and grep instead, and a change to a high-fan-out module defers to the full gate rather than widening mid-loop. The shared test-data builders are the exception, decided by what changed: a change inside an exported builder reaches every suite that calls that builder by name, so a changed default is caught before commit; a change the helper cannot pin to one exported builder (a shared internal helper, module-level state, an import) still defers to the full gate.

**Catastrophic-surface override.** When edits touch auth (`src/services/identityAccessService.ts`, `src/middleware/auth*`, session helpers), privacy boundaries (member-PII reads, anti-enumeration surfaces), or future payment code, run the full test files for those surfaces in the inner loop even if the helper would not list them. Catastrophic surfaces never skip on inner-loop convenience.

**Compact output.** For runs whose output an AI agent will read, `--reporter=dot` keeps logs small. Default-reporter runs are fine for interactive use. The compact reporter prints one character per test (`.` pass, `F` fail) plus a summary; failures are still surfaced with full stack and assertion detail.

### 11.6 Secrets and CI

CI logs, CI artifacts, Playwright reports, traces, screenshots, and failure output are treated as potentially public unless explicitly restricted. Tests that require remote credentials receive them through GitHub Actions secrets, SSM, or an equivalent approved secret-management mechanism. Credentials are never echoed, never serialized into artifacts, never embedded in shell command lines. The password-leak regression test (§7.5.4) and the production-residue audit (§9.5) together enforce this property for the dev/staging-only surface; equivalent discipline applies to any other secret introduced into the CI environment.

### 11.7 Local runner tiers, the verdict, and production readiness

This section owns what each tier of `./run_all_tests.sh` proves and what a production release needs; every other description cites it. `./run_all_tests.sh --help` owns the flags and rows, and `--plan` prints the rows a run would schedule, and where each points, without running anything.

Three tiers, one per environment:

- *Dev, local.* `./run_all_tests.sh --quick`, which `npm run test:quick` runs, is the commit loop: build, test type-check, lint, conventions, harness self-check, generated-content, the secret scan, and the unit and integration tiers. It ends QUICK PASS and names what only the bare run adds. The bare `./run_all_tests.sh` is the push and pull-request gate: every CI job that is safe on a workstation, each test once, with the build, lint, conventions, generated-content and unit and integration tiers run inside the clean room (§2.5); plus e2e with its accessibility specs and the rendered-style check, terraform validation, the blocking security probes against a throwaway local stack, the pentest harness's blocking scriptable probes, and the two real-data rows (§8.5). It contacts no deployed environment and needs no AWS identity or role. CI runs the same tests on the commit, except the gates that stay local: the pentest harness, the pre-go-live data-load Python (what `--skip-py` leaves out), the two real-data rows and the machine-local harness check, each recorded with its reason in `scripts/ci/check_ci_parity.sh`, which holds the two sets together in both directions. The OWASP ZAP scan is not part of it: `--zap` adds it to the pentest harness, and it runs before a production deploy (`./run_all_tests.sh --zap` or `npm run test:pentest:heavy`). Each ZAP scan has a hard time limit, and a scan stopped at it reports NOT RUN.
- *Staging, opt-in.* `--staging` adds four read-only rows to either mode. They need at minimum the dev-tester role, which the IAM user `footbag-operator` also holds: an operator runs them directly, and a dev-tester through `scripts/as-dev-tester.sh`. The rows are the staging AWS adapter smoke (§5.4), the whole-population real-data invariants on the staging host (counts and PASS/FAIL only, or "prerequisite not loaded" when staging carries no export rows, which skips the row), route smoke GETs against the staging site, and the anonymous browser check. They run first, after a preflight that names any missing identity, wiring or site at the start; a row whose needs are missing fails without running and names the fix, and the local rows still run. In the bare run, `--staging` also schedules the destructive staging tier (§5.11) after the read-only rows; `--quick --staging` writes nothing to staging. Production is never a target, and no staging result bears on a production release.
- *Production, strict.* No runner mode touches production. A production deploy runs the production release gate below, and after it the operator runs the anonymous, submit-nothing browser check `npm run test:deployed -- --target production`.

**The verdict.** Before any gate the bare run refuses only when a tool every gate needs (`sqlite3`, `curl`) is missing. A push-gate check whose own tool this machine lacks (the secret scanner with no running Docker to supply it, or Terraform) skips itself; CI runs it on every push and the release gate requires CI green for the commit, so the skip does not hold the verdict back, and the run prints a warning that this machine lacks a tool the project uses, naming each skipped check and pointing at `bash scripts/setup-dev-workstation.sh`. A bare run ends GREEN when everything it scheduled passed; `--quick` ends QUICK PASS. A run ends INCOMPLETE when a check standing for a push-gate job produced no result at all (the clean room stopped before reporting it, or `--skip-secret-scan` left the scan out), or when a gate continuous integration does not run either was skipped or not run (a real-data row is the exception and never holds a run back); FAILED when a gate failed; and VOID when the tree changed while the run was in flight, because the gates then read different sources; the VOID report names each file whose content changed, including one that was already modified when the run started. A failing staging row fails the run, and the verdict still says what the local rows concluded. Every run, however it ends, prints one verdict banner as its last output, naming the exit code it returns, with the failure details just above it: a pass, a failure, a fail-fast stop, an interrupt, a refusal before any gate, a voided run, a real-data alarm, and an unexpected error alike. The clean room ends the same way.

**Production readiness.** A production release ships exactly what CI proved, so CI's green tick on the commit is the test proof and no deploy runs the test suite. `scripts/verify-production-release.sh` previews the release rules: a clean working tree whose HEAD is on the canonical repository's main, and CI's aggregate check green on every run for that commit. It refuses `SKIP_SMOKE`, the three escape hatches `FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK`, `FOOTBAG_KEEP_DB_ACK_SCHEMA_DRIFT` and `FOOTBAG_AUTO_KILL_DB_LOCK_HOLDERS`, a test seam, and a question it cannot answer; an earlier commit of main is allowed with a warning, as a rollback. `deploy_to_aws.sh`, `scripts/deploy-code.sh`, `scripts/deploy-rebuild.sh` and `scripts/deploy-migrate.sh` apply the same rules before they touch a production host and refuse on the same findings, along with any data-quality failure or development residue in a database the deploy builds. Staging is held to none of this: it is where uncommitted work is tried.

The release order: commit and push to main, with CI green on every run for that commit; the ZAP scan; `scripts/verify-production-release.sh`; the production deploy; the production browser check.

---

## 12. Coverage and selective heavier tooling

### 12.1 Coverage signals

Coverage thresholds set in `vitest.config.ts` are floors per `.claude/rules/testing.md`. They are a leading indicator of test absence, not of test quality. A surface at one hundred percent line coverage with no adversarial tests is still under-tested.

The floor is a signal, never a target. A test written to restore coverage still meets the name-the-defect mandate; where no defect sentence exists for an uncovered line, the line is a candidate for deletion, and the drop is reported to the maintainer rather than met with a test that only executes it.

Overall coverage is an aspirational, best-effort goal, not a fixed percentage; the floor that a drop trips lives in `vitest.config.ts` and is enforced by the CI coverage job. Catastrophic-severity surfaces (auth, session, member privacy, payments, identity claim, erasure) are verified by inspection of the tests themselves rather than by a per-surface percentage, since a percentage is satisfied by any test that executes the line. For general code, 100% is not a blanket target; forcing coverage of error branches and dead-code paths produces contrived tests without catching real bugs.

Uncovered branches are also a read-targeting signal: they are where both the test suite and a review pass go blind, so they are the priority surface for the next adversarial review.

### 12.2 Selective heavier tooling

Property-based testing is not a universal tier-promotion requirement. It is a technique to reach for when a specific surface justifies the cost: validators, encoders, anti-enumeration helpers, idempotency invariants, and security-critical pure functions. A property-testing library is added with the first surface that needs one, never ahead of need.

Whether a test would catch the defect it guards is established by the demonstrated-failure requirement in `.claude/rules/testing.md`: break the guarded code and watch the test go red for that reason. On the high-risk areas (auth and session, member privacy, payments, identity claim, erasure, and any destructive, irreversible or outward-facing action) the author breaks each test one at a time, and a fresh reviewer agent that did not write the tests adds its own breaks: it proposes a handful of one-line edits to the changed code (invert a condition, drop a filter, delete a guard, return the other branch, move a write out of its transaction), each is applied alone against only the affected test files and then reversed, and every edit no test notices gets a stronger assertion shown red against it. The report states how many edits were tried and how many survived. An author choosing the breaks for its own tests tends to choose the breaks its tests already catch. The probe is bounded on purpose: it is never a whole-suite run, and no mutation tool is adopted.

A decision to adopt a heavier tool, and the specific surface it targets, is tracked in the maintainers' private tracker, not here.

---

## 13. AI-assisted testing governance

When an AI agent (Claude Code or any other) writes, reviews, or modifies tests for the Footbag platform, it operates under the same standards as a human contributor. These rules exist to prevent the AI failure mode of "test what the code does rather than what the user story says."

The standing AI obligations (no silent skips, no test that blesses current behavior, no canonical-doc modification to fit implementation, regression test at the cheapest layer for every fixed bug, bootstrap code is not a design signal, no automated run that mutates production, and none that mutates staging outside the destructive staging tier (§5.11), no fetching real member PII) come from `.claude/rules/testing.md` and `.claude/rules/doc-governance.md` and apply to AI agents unchanged.

### 13.1 Expected outcomes come before the code

Before writing a test for a behaviour, the agent reads the governing `docs/USER_STORIES.md` entry verbatim (the full `Access:`, `Story:`, and `Success Criteria:` blocks), or the governing decision or governance passage, and writes down the expected outcome of each case from that text alone, before reading the implementation. A case whose outcome the text does not decide is a question for the maintainer, never a value read off the code. A bug fix starts with a reproduction seen red against the unfixed code.

### 13.2 The writer is not the only judge

An agent never weakens, deletes or rewrites a test to make its own change pass; a test that disagrees with the code is reported, and the source of intent decides. On the high-risk areas the strength of new tests is judged by a fresh reviewer agent that sees only the diff, the code under test and the brief in the `write-tests` skill, and a finding counts only with the one-line break that proves it, so the review cannot be satisfied by asking for more tests.

### 13.3 Done means driven as a member would drive it

A change a person can see is not done because its tests pass. The agent drives the changed journey through the real pages on the development stack, across every page the journey touches, and a defect found that way lands as a test. Behaviour that differs only under production configuration is covered by the stub-strictness rule in the adapter parity section and by the staging tiers.

### 13.4 What the maintainer reviews

The maintainer reviews every change before it is committed, and reviews the evidence rather than re-deriving each assertion. The agent's report carries it: the defect sentence each new test carries, the success criteria it covers, the red-then-green record, the reviewer's surviving breaks on a high-risk change, and any new exemption with its reason. A test without that evidence does not land. Nothing in the platform's automation can vouch for a test's intent; the evidence is what makes the review possible at the scale agents write tests.

### 13.5 A test is a cost

Every test costs run time, agent context and maintenance, and a test that cannot fail costs confidence too. A new test earns its place by catching a named defect no existing test or sweep catches; where a sweep owns the class, the case is a row of the sweep, and a per-route test the sweep makes redundant is deleted. The agent applies the test-design principles, risk classification, the catastrophic-surface verification floor and the strategic anti-patterns, and adds no ceremony beyond what this document and `.claude/rules/testing.md` require.

---

## 14. Accessibility and explicit deferrals

### 14.1 Accessibility as a first-class layer

The platform targets WCAG 2.1 AA as the baseline accessibility conformance level.

Accessibility testing is a named test layer, not an afterthought. The layer combines:

- *Automated checks* via `@axe-core/playwright` (per the toolchain in §15.2.1) in the lightweight Playwright suite, tagged `@a11y`, against the WCAG 2.1 AA rule set. Runs in CI on every push and in the full local suite (`./run_all_tests.sh`); catches automated-detectable regressions early. The scan covers the anonymous public pages and the authenticated member and admin surfaces (member dashboard, profile edit, club edit, admin panels), because a member-only form is exactly where form-label and ARIA violations are likeliest to hide.
- *Smoke-tagged automated checks* (`@smoke @a11y`) on a small subset of high-traffic public pages (home, member dashboard, login, register, public event detail, results page), selected locally by `npm run test:e2e:smoke`; separate from the anonymous deployed browser check (`npm run test:deployed`, §11.7) and from the vitest staging-adapter smoke gate (§5.4).
- *Manual audit* by the maintainer or an external accessibility reviewer periodically and before major launches. The third-party periodic pentest engagement (§9.4) may include accessibility scope.
- *Deeper audit beyond automated coverage* (full keyboard-only journey, screen-reader flow validation, cognitive accessibility) is operator-invoked via the `browser-qa` skill.

### 14.2 Per-surface accessibility assertions

Surfaces with user-facing UI carry accessibility assertions:

- *Keyboard navigation:* every interactive element is reachable and operable by keyboard alone.
- *Screen reader semantics:* every interactive element has an accessible name; landmarks are present; headings nest correctly.
- *Color contrast:* text and UI components meet the 4.5:1 contrast ratio (3:1 for large text) per WCAG 2.1 AA.
- *Target size:* every pointer target is at least 24x24 CSS pixels, or has a clear 24px circle around it, per the WCAG 2.2 minimum target size (success criterion 2.5.8); a link inside running text is exempt.
- *Form labels and errors:* every form input has a programmatically associated label; error messages are programmatically associated with the input they describe.
- *Focus management:* modal dialogs, wizards, and skip links handle focus correctly.

These assertions are derived from the same technique reference (§4.3) as the security and functional assertions. The technique is automated checks (axe) plus manual audit where automated checks cannot verify (heuristic semantics, screen-reader flow).

### 14.3 Explicit deferrals

The following test classes are explicitly deferred from this strategy. The deferral is intentional; surfacing a need for any of them later is a scope expansion that requires explicit maintainer decision and an update to this section.

- *Performance and load testing.* Deferred except for one narrowly scoped exception, taken by maintainer decision on 2026-09-13: `scripts/load-check.sh` drives a representative request mix against staging so the go-live origin-latency threshold is calibrated from a measured baseline rather than from a default, which the go-live gate index requires before the go/no-go walk. It is operator-invoked only, never part of CI or the default test run, and refuses production. Everything else in this class stays deferred: no throughput assertion gates a build, and performance assertions in the suite remain limited to per-request resource bounds (request size, response size, worker concurrency) tested as configuration verification. Widening beyond that calibration run is a further scope expansion and updates this section again.
- *Chaos engineering.* No deliberate failure injection into running stacks. Partial-failure scenarios are tested by simulated failures at the adapter seam in unit and integration tests, not by injecting failures into staging or production.
- *Visual regression testing.* No automated visual-diff snapshotting. Visual changes are reviewed by the maintainer through the deploy preview, not by a snapshot test. Visual snapshots are brittle and produce flake without commensurate value at the platform's risk profile and scale. The rendered-style check and `npm run style -- diff` are not snapshotting: they compare measured numbers (element boxes and computed styles) against rules, or against an earlier capture of the same page, never pixels.
- *Network-fault testing.* No automated test simulates network partitions, DNS failures, or upstream provider outages. Fault behavior is tested at the adapter contract level (per `.claude/rules/adapter-conventions.md`) using fakes that return configured error responses.

Deferral does not mean these test classes are unimportant. It means the strategy as designed produces sufficient coverage without them. A future scope expansion that adopts one or more of them updates this section.

---

## 15. Annexes

### 15.1 Strategic anti-patterns

Operational anti-patterns (no DB mocking, no framework mocking, no timestamp leakage, no global state leakage between files, no silent skips, no "tested manually," no tests on the dev DB) are enumerated in `.claude/rules/testing.md` and apply to every test. (The "tested manually" anti-pattern bars substituting a manual check for a required automated regression test; the operator-driven exploration this document prescribes is an additive layer whose findings land as regression tests.) This section adds the strategic anti-patterns that follow from the playbook discipline.

- *Playwright tests for every business-rule branch.* Business rules are covered by unit and integration tests; Playwright is for browser-only assertions and business-critical happy paths plus the minimal negative cases that only a browser can reveal.
- *Brittle locators.* CSS selectors that depend on auto-generated class names, XPath that depends on DOM structure, and text selectors that depend on copy phrasing are brittle. Prefer role and accessible-name selectors per Playwright best practice.
- *Change-detector tests.* A test is worthless when no plausible production defect can make it fail, only a deliberate edit to the very text or table it asserts. The common case is a positive pin on static copy, such as `expect(res.text).toContain('exact heading')` against a template that always renders that heading: a static page cannot render the wrong words unless a person writes them, so the test costs a render, fails only on an intended edit, and trains reviewers to ignore red. The check is the testing rule's name-the-defect mandate: state in one sentence what a visitor, member, admin or operator would experience if the code broke the way the assertion detects. If the only sentence available is "somebody changed this copy on purpose", the assertion is a change-detector and is not written. Four shapes pass the check although they assert words, and are kept:
  - *Negative.* An assertion that a wrong statement is absent, where that statement shipped or plausibly could, so a regression would restore it.
  - *Relation.* Two independently maintained things checked against each other: a card's label against its sidecar, a count chip against the rows it claims, an href's fragment against the id it targets.
  - *Branch.* Output asserted on both sides of a condition: present under one, absent under the other.
  - *Authority-fixed wording.* Words an external authority fixes, where a different word is itself the defect: IFPA or governance wording, and operator-facing lines whose meaning decides what an operator does next.

  Where a literal string is the contract (an SEO meta description, an explicit error message), production code exports the constant and the test imports it rather than restating the literal, which makes the assertion a relation. Email subjects and bodies are the same case: they come from the committed template sidecars of §5.9, which the sender renders and a test reads through the shared sidecar render helper.
- *Arbitrary sleeps.* `await page.waitForTimeout(N)` masks race conditions. Wait on observable conditions (selector visibility, network response, app state).
- *Depending on real production data in committed or CI tests.* Committed and continuous-integration tests never read or assume real member records; they are synthetic-only and deterministic. Real-data testing is the separate, human-driven staging activity in §7.8, whose output is governed by the PII discipline there and never becomes a committed or CI test.
- *Depending on real email receipt for routine tests.* The persona switch and the simulated-email card exist to avoid this. Routine tests do not poll a mailbox.
- *Writing to a deployed environment from a test.* No test writes to production. A test writes to staging only inside the destructive staging tier (§5.11), on persona-owned targets or the named curated-content exception, with each change undone.
- *Running penetration tests against production without explicit authorization.* Forbidden per §9.3 and §9.4.
- *Attacking third-party services.* Forbidden per §9.3.
- *Using brute force against real accounts.* Forbidden per §9.3.
- *Weakening tests to make them pass.* If a test fails, the code is fixed. The exception is when the test was wrong about intent; then the user story is updated first, with explicit human consent, and the test is rewritten against the corrected story. Weakening assertions to admit failing code is forbidden.
- *Overusing snapshots.* Snapshot tests are brittle. Prefer explicit assertions on shape or content. Snapshots are acceptable only when the assertion structure is genuinely too large to enumerate (rare).
- *Ignoring migration edge cases.* Migration testing covers every outcome class in the identity-claim section; ignoring the uncorroborated, surname-differing or never-offered cases is forbidden.
- *Blurring groups and committees into clubs.* Groups and committees (when implemented) are distinct from clubs per `docs/USER_STORIES.md` and `docs/DESIGN_DECISIONS.md`. Tests preserve the distinction.
- *Introducing a test-only HTTP endpoint outside `src/testkit/` or `src/dev-bootstrap/`.* Forbidden per §7.6.
- *A test double written from memory for unstructured tool output.* A stub wrote Terraform's lock error as plain lines; the real error is boxed and coloured even when redirected, so the parser matched nothing and told an operator their own stale lock belonged to another machine, and an unparsed timestamp read as midnight and cleared the staleness floor. Forty-two tests passed against the same fiction.
- *A fixture smaller than what it stands for.* A cap on the logged mail-provider confirmation URL was set at 300 characters while real URLs run 450 to 500, so every genuine confirmation was refused; the unit fixture was 74 characters and the route fixture 52, and both stayed green.
- *A factory that fills what the pipeline drops.* Every US and Canadian club candidate reached the database without its state, because the candidate builder and loader dropped the column the seed carried; every app test built candidates through a factory that set the state by hand, so none saw the pipeline's rows (§4.7).
- *A helper that skips the real path.* The development claim helper confirmed a member's club by calling a function inside the onboarding wizard rather than the wizard's own submit, which first creates a club the old site never made real; every such record returned a server error, and the only test claimed one record that had no such club (§4.7).
- *One example standing for every shape.* A test that claims one fixed record, or renders one fixed trick, proves only that record's branch. A story over migrated data is tested once per shape the data takes (§4.7).
- *An absence check with nothing that could have been present.* Every assertion that something is absent runs beside a positive control in the same case that proves the thing appears when it should: a live member beside the deceased one, a filled column beside the empty one. A check run over an empty table, or against a fixture that never held the value, passes by construction.
- *Two lists that must agree, held together by nothing.* Where the same set is declared twice (the fields a parser reads and the fields a save clears, the jobs a gate waits for and the jobs its verdict reads, the keys two deploy halves write, a generator and the artifact it produced), a relation test derives one from the other and fails on any difference. Review does not keep two lists in step.

### 15.2 Tooling appendix

#### 15.2.1 Toolchain

The platform's testing toolchain consists of:

- *Vitest.* Unit and integration test runner. `npm test` excludes `tests/smoke/`, `tests/e2e/`, and `tests/dev/`. The test scripts live in `package.json`; `./run_all_tests.sh` (§11.7) is the local runner over them, and `npm run test:deployed` (§11.7) is the browser check against a deployed environment.
- *Supertest.* HTTP assertion helper for integration tests.
- *better-sqlite3.* Real SQLite per test file; no mocking. Per `tests/CLAUDE.md`.
- *@vitest/coverage-v8.* Coverage measurement. Thresholds set in `vitest.config.ts`.
- *Playwright.* Browser automation. Config at `tests/playwright.config.ts`. Single-worker chromium-only headless lightweight suite.
- *Test fixtures.* `tests/fixtures/factories.ts` (synthetic row factories), `tests/fixtures/testDb.ts` (DB setup and teardown), `tests/fixtures/personas.ts` (member plus tier grant plus JWT plus Playwright cookie composition). Shared assertion helpers, by purpose: `cachedGet.ts` (many assertions on one rendered page), `queryCount.ts` (bounded statement counts), `routeTable.ts` (the live route table the generative sweeps enumerate), `clock.ts` (runtime-relative time), `expectCsrfReject.ts` (the CSRF refusal), `assertSecureSessionCookie.ts` (session cookie attributes), and `assertAppendOnly.ts` (ledger immutability).
- *@axe-core/playwright.* Accessibility automated checks for the lightweight Playwright suite per §14.1, tagged `@a11y`, plus the smoke-tagged subset on high-traffic public pages.
- *OWASP ZAP.* Heavyweight pentest scanner. Used in the on-demand heavyweight pentest gate per §9.3. Scripted invocation against the local stack or a dedicated pentest staging environment; report aggregation; findings produce regression tests per §9.6.
- *Pairwise generator.* PICT, ACTS, or an equivalent. Used by the technique reference per §4.3 for matrix-shaped threats. May be hand-derived for small matrices.
- *Dependency vulnerability scanner.* `npm audit` is built in; a third-party scanner (Snyk, Socket, or equivalent) supplements with supply-chain signal. Integrated into the on-demand heavyweight pentest gate.

#### 15.2.2 Tools explicitly not adopted

- *Jest.* Vitest is the platform test runner. No Jest dependency.
- *Cypress.* Playwright is the platform browser automation tool. No Cypress.
- *Cucumber and other BDD frameworks.* Tests describe long-term contracts in straightforward TypeScript; no Gherkin or feature files. Test names describe user-visible behavior; no separate spec layer is maintained.
- *Snapshot-driven UI testing libraries that produce committed image diffs.* Per §14.3.
- *Load testing or chaos tooling (k6, Locust, Chaos Monkey, equivalent).* Still not adopted. The staging calibration run in §14.3 drives the platform's own routes with the tooling already in the tree and adds no dependency; chaos tooling remains deferred.
- *Whole-suite mutation tools (Stryker, mutmut, equivalent).* Their run time and noise outweigh what they add here. The bounded break probe in the selective heavier tooling section is the targeted form, chosen by an independent reviewer and run against the affected test files only.

---

## 16. Per-story test charters

This section prescribes, per user story, the tests the platform requires. Each charter selects from the test-dimension taxonomy (§16.1) and names the story-specific edge, scenario, time, and concurrency cases. Charters are prescriptive and timeless: they describe the tests a story warrants, not which already exist. Build status lives in the maintainers' private tracker. Properties that every surface shares are verified once by a generative sweep (§16.2) rather than restated in each charter, so a charter that reads "covered by the CSRF sweep" is asserting the sweep includes that route, not that the property is untested.

### 16.1 Test-dimension taxonomy

A charter references these dimensions by number.

1. Functional happy path: each success criterion; output shape or view-model; the rendered data and state the criterion promises, never static copy.
2. Functional edge: zero, one, many, and N+1 rows; boundary values; optional-field permutations; draft or unpublished exclusion; route-ordering precedence.
3. Input and adversarial: malformed, oversized, and wrong-type input; unicode mischief (RTL override, homoglyph, zero-width); SQL injection; XSS into Handlebars; every free-text field.
4. Authentication: anonymous gate (redirect to login); registered-unverified, deceased, and soft-deleted accounts cannot act; session expiry and the sliding-refresh window; cookie attributes; logout invalidation; password-version bump invalidates other sessions.
5. Authorization: allow for each authorized actor and deny for each unauthorized one; adjacent-owner object-level checks; tier-ladder boundary (just below versus at or above); resource roles (co-leader, organizer, owner); admin; honor flags; legacy-admin-flag non-inheritance.
6. Anti-enumeration: exists versus not-exists equivalence (status, body, timing) on login, reset, verify, claim, and owner-scoped 404s.
7. CSRF and Origin-pin: every state-changing verb refuses a foreign or absent Origin.
8. Rate-limit: boundary at the limit and limit-plus-one; 429 with `Retry-After`; window reset.
9. State-machine scenarios: each legal transition and each illegal-transition rejection across multi-step flows (onboarding, legacy claim, club cleanup, purchase, account deletion and purge, vote lifecycle).
10. Temporal and time: expiry boundaries (just before, at, just after); grace-window open versus elapsed; token TTL expiry and replay; sweep-driven expiry; open and close windows; calendar boundaries where relevant. Deterministic through an injected clock or runtime-relative offsets, never absolute years.
11. Concurrency: simultaneous claims (constraint-loser rollback); double-submit; sole-owner handoff race; same-window collision.
12. Idempotency: replaying the same key yields the same outcome (webhook, outbox, grant, consume-once token), and submitting a state-changing form twice, on a path the submitted-twice rule covers, reports the first outcome with no repeated side effect.
13. Error and operational: each throw path maps to its status and class; operational paths emit an audit row plus `logger.error`; no stack trace in a 5xx; 503 on database-busy.
14. Privacy and data-governance: public surfaces never emit contact fields or PII; search excludes unverified, deceased, opted-out, and purged members; member-only fields are gated; logging hygiene; export and erasure correctness.
15. Audit: state-changing paths emit the correct audit row; append-only immutability is enforced by the table trigger.
16. Adapter parity: boot-config fail-fast; interface parity between stub and live; staging-smoke for external adapters.
17. Accessibility: axe checks on UI surfaces; keyboard, focus, label, and contrast for stories with UI.
18. Migration: loader row-count and shape; confidence outcomes; alias and name-change; club-affiliation cases.

### 16.2 Platform-wide generative sweeps

Several properties hold across every surface and are tested once, generatively, over the live route table or the schema, so a newly added surface is covered by construction:

- CSRF Origin-pin sweep: every deployed state-changing route refuses a foreign Origin, with only the signature-authenticated webhook and `/ipc/*` exemptions, and the database is unchanged after each refusal. The authorization matrix holds its deny cells to the same: a refused request changes nothing.
- GET read-only sweep: an in-process crawl reads SQLite's change counter around every GET and fails on any change, and every GET route is either reached by the crawl or carries its own no-write case.
- Submitted-twice sweep: every state-changing route on a covered path (an email link, a checkout or payment start, an outward send) has a submitted-twice case (same redirect and message, unchanged counts of domain, audit, outbox and rate-limit rows) or a named exemption.
- Form-outcome sweep: the in-process crawls that post forms against the throwaway local database assert each submission's outcome (the redirect or re-render, and the row it changed), and after the walk no outbox row is addressed to an excluded member.
- Route-by-persona authorization matrix: deployed routes crossed with the canonical persona catalog, asserting an allow cell for each authorized persona and a deny cell for each unauthorized one, including the adjacent-owner case.
- Ledger immutability: every append-only table keeps its BEFORE UPDATE and BEFORE DELETE abort triggers, and the triggers fire on a seeded row.
- Anti-enumeration equivalence: exists versus not-exists parity on the authentication and claim surfaces.
- Session lifetime: JWT expiry rejection and the sliding-refresh-window boundary.
- Email-catalog firing sweep: every entry in the email catalog (each promised email by key and owning service) has a live enqueue site and a firing test, so a contract-promised email the code never sends is a build failure rather than a silent gap.

A per-story charter names only the cases specific to that story; the cross-cutting properties above are inherited from these sweeps.

### 16.3 Charters: authentication and identity

**M_Login** (dims 1, 3, 4, 6, 8, 13, 15). Valid credentials issue a session cookie with the correct attributes; a wrong password yields a generic failure; a registered-unverified account is blocked with a verification prompt; a deceased or soft-deleted account is rejected, on both sides of the grace boundary and indistinguishably from an unknown address, since no restore is offered. Anti-enum: unknown email and wrong password are indistinguishable in body and timing. Rate-limit: repeated failures return 429 with `Retry-After`, and the window resets. Adversarial: injection, oversized, and unicode input in the email field. Audit: both failed and successful attempts are recorded.

**M_Verify_Email** (dims 1, 4, 6, 9, 10, 12, 13). A valid token verifies the account and routes it into the onboarding wizard; resend issues a fresh token, except that a resend submitted again while the last one's email is seconds old sends nothing more. Time: an expired token is rejected and the account stays unverified. Single-use: a consumed token cannot be replayed. Anti-enum: invalid and expired tokens produce the same enumeration-safe outcome. Adversarial: malformed or oversized token segment.

**M_Reset_Password** (dims 1, 3, 4, 6, 8, 9, 10, 12, 13). Requesting a reset issues a token (delivered to the captured outbox, never reflected in the response, since the request page is unauthenticated and the submitted email is caller-controlled); completing the reset bumps `password_version`, invalidates other sessions, and re-issues the current one. Time: an expired token is rejected with the password unchanged. Single-use: a replayed token is rejected. Anti-enum: the forgot-password request returns identical UX and timing for a known and an unknown email. Rate-limit: repeated requests are throttled. Validation: password policy and confirm-match on completion. Operational: a session-issue failure after the password commit renders a 503, not a 500.

**M_Change_Password** (dims 1, 3, 4, 13). Authenticated owner only; another member's password-edit route returns 404 (anti-enumeration). The correct current password is required; success bumps `password_version`, keeps the current browser signed in, and invalidates other sessions. Validation: confirm-match and policy.

**M_Logout** (dims 1, 4, 7). POST clears the session cookie (Max-Age zero); a safe-path Referer is honored for the redirect, otherwise `/`. GET does not clear the session (POST-only).

**M_Claim_Legacy_Account** (dims 1, 2, 3, 5, 6, 9, 10, 11, 12, 13, 15). Scenarios across every outcome class in the identity-claim section: claimable strong and possible matches, a competition record with no account, an uncorroborated account found by name, a surname-differing card answered with a former surname, each of the never-offered refusals, both non-claiming answers and the once-only cannot-find last attempt. Repeat: a repeated claim reports the success it already had. Concurrency: two held claims of one legacy row completed one after the other; the second claim is not applied, with no partial link, grant, or audit. Anti-enum: an unknown person id and an already-claimed record both return the enumeration-safe message, and low or no-match leaks no candidate identity. Authz: a claimed legacy admin flag never confers a live admin role. Audit: claim, link, and grant are recorded.

### 16.4 Charters: visitor and public read surfaces

**V_Browse_Static_Content** (dims 1, 2, 14, 17). Any visitor reads the public site with no authentication. Public pages never expose member contact fields or PII. An unknown slug or section returns 404, not a 500. High-traffic public pages carry accessibility checks.

**V_Browse_Clubs** (dims 1, 2, 14). The club index and detail render for anyone; member-only organizer or contact details appear only to authenticated members. Draft and archived clubs are excluded from the public list. Edge: empty, one, and many clubs; an unknown club key returns 404.

**V_Browse_Upcoming_Events** (dims 1, 2, 14). The upcoming list and event detail render publicly; member-only organizer contact appears only when authenticated. Draft and unpublished events never appear publicly. Route ordering: the year-archive segment matches before the event-key param.

**V_Browse_Past_Events** (dims 1, 2). The past-event archive and year pages render publicly; results-specific treatment appears only where published results exist.

**V_View_Gallery** (dims 1, 2, 3, 14). Public and named galleries render; captions are escaped so no stored XSS executes; owner-private media is not exposed. Route ordering: literal gallery sub-routes precede the gallery-id param.

**V_View_Trick_Reference_Videos** (dims 1, 2, 3). Freestyle reference surfaces (tricks, sets, glossary, records, leaders) render publicly with escaped free text. Route ordering: literal freestyle sub-routes precede the trick-slug param.

**V_Browse_Hashtags** (dims 1, 2). Hashtag and tag-driven browse renders publicly with no member PII.

**V_Register_Account** (dims 1, 3, 6, 8, 13, 15). Registration creates an unverified account and issues a verification token; login is blocked until verification. Anti-enum: registering an already-registered email returns the same enumeration-safe UX as a fresh address. Rate-limit on repeated registration. Validation and adversarial input on every field (email shape, password policy, unicode display name). Audit on account creation.

### 16.5 Charters: club and club co-leader

**M_View_Club** (dims 1, 2, 5, 14). Anyone views the public club page; member-only surfaces appear only to authenticated members. An unknown club key returns 404.

**M_Join_Club** and **M_Leave_Club** (dims 1, 5, 7, 9, 11, 13, 15). Authenticated members join and leave; the onboarding gate redirects a not-yet-onboarded member off club paths. Business rules: the two-club affiliation cap, primary versus secondary, idempotent re-join. Concurrency: a double-submit join does not create duplicate affiliations. Audit on each transition.

**M_Create_Club** (dims 1, 3, 5, 8, 13, 15). Authenticated Tier-1-benefits members only; a Tier-0 member without Active Player is denied at the gate. Validation: name, country, and near-match confirmation, with the duplicate-name, already-co-leader, and affiliation-cap branches. Audit on creation.

**CL_Edit_Club** (dims 1, 5, 7, 13, 15). Only a club's co-leader edits its content; a co-leader of a different club is denied (adjacent-owner). External-URL changes are validated before persistence. Audit on the content edit.

**CL_Mark_Club_Inactive** (dims 1, 5, 9, 10, 15). Co-leader-scoped state transitions. Parking is reversible and open to any co-leader, and the club returns to the active listings the moment anyone joins, claims or reactivates it. The inactive state gates public listing visibility. Audit on each transition.

### 16.6 Charters: member profile, account, and media

**M_Edit_Profile** (dims 1, 3, 4, 5, 13, 14). An authenticated owner edits their own profile; another member's edit route returns 404. Validation and adversarial input on every field, escaped on render. Contact fields are gated to the owner and admins. Audit on change.

**M_View_Profile** (dims 1, 2, 14). The public profile renders for anyone; member-only and contact fields appear only to authorized viewers; a deceased member keeps honors and history visible. An unknown member key returns 404 to a signed-in viewer and redirects a signed-out visitor to sign in, the same answer a real non-honoree's profile gets, so neither reveals whether the key exists.

**M_Search_Members** (dims 1, 2, 6, 14). Authenticated search; results exclude unverified, deceased, opted-out, and PII-purged members. No existence oracle and no contact-field leak in results. Adversarial query input.

**M_Upload_Photo**, **M_Submit_Video**, and member media edit and delete (dims 1, 2, 3, 5, 13, 16). Owner-only (cross-owner 404), with the Tier-1-benefits gate on write (a Tier-0 member without Active Player is denied). Upload validation: MIME, size, and polyglot rejection, with image and video processing through their adapters. Captions are escaped. Audit on upload, edit, and delete.

**M_Complete_Onboarding_Wizard** (dims 1, 2, 9, 13). Authenticated; a state machine across the personal-details, legacy-claim, and club-affiliation tasks, each completed only by a recorded explicit answer, where membership is the authorization level the three answers grant, so a prospective member is routed to their next outstanding task from every member capability until all three complete. Before the last answer no claim, club, signal or note record exists and no club counts them; the last answer writes them all in one transaction. Out-of-order and illegal-step submissions are rejected.

**M_Contact_IFPA_Admin** (dims 1, 3, 5, 8, 13). Authenticated owner; validation and rate-limit on submission; the admin queue receives the request.

**M_Nominate_HoF_Candidate** and **M_Submit_HoF_Affidavit** (dims 1, 3, 5, 13, 15). Authenticated; validation; audit on submission.

**M_View_Payment_History** (dims 1, 2, 5, 14). Owner-only (cross-owner 404); shows the member's own payment ledger and no other member's data.

**M_Delete_Account** and **M_Download_Data** (dims 1, 5, 9, 10, 14, 15). Self-service deletion is permanent: the account is unreachable from the moment it is confirmed, and the grace window that follows is the interval before the anonymising purge rather than a way back. HoF and BAP members are preserved. Data export is an owner-only download that returns only the signed-in member's own data. Time: the grace-window boundary (open versus elapsed).

### 16.7 Charters: payment and membership

**M_Purchase_Tier_1** and **M_Purchase_Tier_2** (dims 1, 5, 9, 12, 13, 15). Authenticated; the stub checkout drives the real signed-webhook path, where confirm grants the tier and cancel and decline do not. Idempotency: a replayed webhook does not double-grant. The payment-status-transition ledger is append-only. Audit on the grant.

**M_Donate** and **M_View_Payment_History** (dims 1, 3, 12, 13, 15). Authenticated; a donation is recorded distinctly from membership; amount validation; a recurring donation writes its row before the redirect and is promoted, put past due, restored and canceled only by the provider's events, with out-of-order and redelivered events refused as stale; a member cancellation sets the provider flag and the local row moves only on the deletion event; history shows shaped labels, the donation note, and the recurring rows distinct from renewals.

**SYS_Process_One_Time_Payments** and **SYS_Process_Recurring_Donations** (dims 1, 7, 12, 13, 15). Full and partial refunds, every dispute stage, rejected payouts and unattributed refunds each write their audit row and work item in the same transaction as the idempotency claim, proven by fault injection between the claim and the side effect; a settled amount or currency that disagrees with the local record raises the mismatch at once; a zero-amount renewal invoice is acknowledged, not booked; the subscribed event set, the dispatcher and the activation script are pinned to each other.

**SYS_Reconcile_Payments_Nightly** and the **A_Reconcile_Payments** digest (dims 10, 12, 13). Each pass against a mixed ledger: missing on either side, amount and currency mismatch, refund distinguished from mismatch, canceled locally but settled at the provider, stranded recurring checkouts keyed per row, duplicates in quick succession; rows of the other provider mode set aside and counted; overlapping runs raise one issue; resolution is audited and a still-present discrepancy is raised again; the digest goes to the treasurer contact address at the configured cadence, nil report included, and the Financial Reports view is admin-only and read-only.

**A_View_Stripe_Config_And_Payments** and the payments pause switch (dims 1, 5, 12, 14). Admin-only; the health view reads the credential mode from the running process and shows no key material; webhook silence and failure states; totals count live rows only and state what was set aside; the pause flag refuses new checkouts before any provider call while a signed webhook still processes; the operator script appends every flip with its reason and has no application write path.

**SYS_Handle_Stripe_Webhooks** (dims 1, 7, 12, 13, 15). Origin-exempt and signature-authenticated; an absent or invalid signature is rejected; replay is idempotent; the transition ledger is append-only.

**A_Acknowledge_Alarm** alarm intake (dims 1, 7, 12, 13, 15). Origin-exempt and signature-authenticated; an absent or invalid signature is rejected even when the URL key is correct; redelivery is idempotent per message identifier; a return to normal clears the newest uncleared alarm of that name.

### 16.8 Charters: admin

**A_View_Dashboard**, **A_View_System_Health**, **A_View_Audit_Logs**, and **A_Acknowledge_Alarm** (dims 1, 5, 14). Admin-only (the deny half is covered by the authorization matrix); audit logs are read-only, and an acknowledgment is one-shot and audited.

**A_Override_Member_Data**, **A_Mark_Member_Deceased**, and **A_Manage_Admin_Role** (dims 1, 3, 5, 13, 15). Admin-only; validation; every override writes an audit row; an admin-role change never derives from a legacy flag.

**A_Periodic_Club_Cleanup** and **A_Reassign_Club_Leader** (dims 1, 5, 9, 13, 15). Admin-only; the club-cleanup state machine (claim, resolve, promote, delist) with idempotent re-resolution, and an "Apply the rules" button as the only path to rule demotions; audit on each action.

**A_Upload_Curated_Media** and **A_Moderate_Media** (dims 1, 3, 5, 16). The admin-operated curator surface; upload validation and async video processing; audit.

**A_Configure_System_Parameters** (dims 1, 5, 13, 15). Admin-only; a config write appends to the immutable system_config ledger, and the current value is the latest effective row.

**A_Reconcile_Payments**, **A_Review_Member_Link_Help_Requests**, and **A_Resolve_Contact_IFPA_Admin_Request** (dims 1, 5, 9, 13, 15). Admin-only queue actions with audit and idempotent resolution.

### 16.9 Charters: not-yet-deployed surfaces

Each of these surfaces gains its full charter when its routes land; the dimension emphasis is fixed in advance so the charter is ready:

- **Voting** (A_Create_Vote, A_Cancel_Vote, A_Publish_Vote_Results, M_View_Vote_Options, M_Vote, M_Verify_Vote_And_View_Results, SYS_Open_Vote, SYS_Close_Vote): dims 5, 9, 10, 11, 12, 15. Eligibility-snapshot and ballot immutability, open and close windows, one-vote idempotency, a verifiable receipt, and eligibility by inclusion list, tier, or honor flag.
- **Groups** (A_Create_Group, A_Edit_Group_Properties, A_Archive_Group, A_Reassign_Group_Owner, GO_Edit_Group, GO_Manage_Members, GO_Manage_CoOwners, GO_Moderate_Email_Queue, M_View_Group, M_Join_Group, M_Leave_Group, M_View_Group_Files, M_Upload_Group_File): dims 5, 9, 14. Owner and co-owner authorization, private-group privacy, the sole-owner handoff race, and the group-versus-club distinction.
- **Event organizer** (EO_View_Participants, EO_Close_Registration, EO_Export_Participants, EO_Email_Participants, EO_Upload_Results, EO_Play_Routine_Music, EO_Manage_CoOrganizers): dims 5, 9, 16. Organizer and co-organizer authorization, registration windows, results upload, and participant-export privacy.
- **System and background jobs** (SYS_Check_Active_Player_Expiry, SYS_Send_Email, SYS_Cleanup_Expired_Tokens, SYS_Cleanup_Soft_Deleted_Records, SYS_Purge_Audit_Entries, the backup jobs): dims 10, 12, 13. Injected-clock determinism, idempotent re-runs, and operational-error alerting. The Active-Player expiry job runs under an injected now, while the live `is_active_player` gate compares the stored expiry to the SQL clock, so its fixtures use runtime-relative offsets per §10.8. The email-sending path (SYS_Send_Email) carries its layered charter (template conformance and shaping, per-email enqueue, the shared drain and idempotency mechanics, and the catalog firing sweep) in §5.9.

---

## 17. Completeness audit checklist

A periodic audit of test completeness walks this checklist top to bottom. Each line names a dimension, where its evidence lives, and the pass condition. A complete audit records a verdict per line; a dimension that cannot be verified against the codebase is itself a finding. Where a prescribed capability is not yet wired, that is a tracked deviation in the maintainers' private tracker (an open issue labeled `bug`), not a relaxation of this checklist.

1. **Deployed user-story coverage.** Cross the deployed-route inventory to its user stories and to the charters in §16, and read the criterion ledger (§4.1). Pass: every deployed story has a charter, every applicable charter dimension is met by a test or carries a gap issue in the maintainers' private tracker, and every deployed success criterion maps to a test that fails when it breaks, or to a named exemption. A deployed route that maps to no story is unintended scope (§4.1).
2. **Adapter parity, three legs (§7.2).** Every adapter in `src/adapters/` has a boot-config test (`tests/unit/env-config.test.ts`) and an interface-parity test (`tests/integration/adapter-parity.test.ts`). Every external-service adapter whose live probe is side-effect-free (JWT-KMS, Secrets-SSM, SafeBrowsing, HttpReachability) also has a staging-smoke leg (`tests/smoke/`, including `staging-readiness.test.ts` for the KMS-sign round-trip). The internal docker-network adapters (ImageProcessing, VideoTranscoding) carry only the first two legs, as do the adapters whose live call would mutate a deployed system (MediaStorage-S3, Payment) and the SES adapter, whose live sending is confined to production and verified by `scripts/verify-prod-email.sh`. Pass: the matrix has no missing required leg.
3. **Stub-versus-live parity.** Every adapter with both a stub and a live implementation asserts identical observable output; single-code-path adapters assert through an injected client. Pass: no stub diverges from its live counterpart untested.
4. **Staging-smoke comprehensiveness (§5.4, §7.3).** `tests/smoke/` probes the assumed-role identity, KMS sign and verify, SSM-plus-KMS secret decryption, the archive signing key's SSM round trip, Safe Browsing, outbound URL reachability including its SSRF refusal, Turnstile captcha secret acceptance (production target only), static-asset cache-busting at the staging CloudFront edge, the seeded persona catalog read over ssh (current state only; the seed is never re-run), and health and readiness. Files run one at a time rather than in parallel: every assertion is a real network round-trip against one environment, so concurrent files contend for the same egress and the same remote throttles, and a per-test timeout calibrated on a file running alone stops meaning anything. Run: `npm run test:smoke` (`scripts/test-smoke.sh`), or the staging AWS smoke row of `./run_all_tests.sh --staging`. Pass: every external surface has a smoke probe.
5. **Production safety (§7.1, §9.5).** No test targets or mutates production, by design. Production safety is the build-time strip of `src/testkit/` and `src/dev-bootstrap/`, the `FOOTBAG_DEV_*` fail-fast guards in `src/config/env.ts`, and the zero-residue gate `scripts/audit-dev-shortcuts.sh` returning zero against the production database, with the post-deploy smoke gate gating promotion. Pass: the residue gate exists and passes; no test writes to production.
6. **Security regression floor (§9.1).** The `@security` baseline exists across layers: anti-enumeration response equivalence, login timing, SQL injection, XSS, transaction atomicity, no-stack-trace-in-5xx, public-contact-field leakage, security headers, CSRF Origin-pin, rate-limit boundaries, and query-string parsing (that the app parses with Node's parser rather than Express's `extended` default, so bracket notation stays a literal key and no query key reaches prototype names). Pass: each baseline class has a test.
7. **Penetration tiers (§9).** Regression-grade automated (CI), static taint analysis pre-merge (§9.1), lightweight staging-safe probes (§9.2), the operator-invoked heavyweight pass `npm run test:pentest:heavy` (§9.3), and third-party periodic engagement (§9.4). Pass: each tier is wired, or its absence is a tracked deviation in the maintainers' private tracker. The audit records which tiers are wired.
8. **Legacy migration (§8).** The `db-load-smoke` gate asserts loader row counts and shape; every matching rule and claim outcome class, club-affiliation cases, and alias and name-change edges each have tests. Pass: every pipeline validation gate in §8.9 has a test.
9. **Admin operational surfaces.** Work-queue resolution, club cleanup, leadership reassignment, curator media, audit-log view, and system-config each have allow and deny authorization cells (the matrix, §4.6) and audit-emission assertions. Pass: no admin state-changing route lacks a deny cell or an audit assertion.
10. **UI and design conformance (§14).** The no-nested-forms convention gate (`scripts/ci/assert_conventions.sh`) plus the e2e primary-form-submission check; the card-uniformity contract across browse views; and accessibility axe `@a11y` checks on business-critical surfaces against WCAG 2.1 AA. Automated visual-diff regression is deferred (§14.3). Pass: the convention gate is green, the card contract holds, and `@a11y` runs in CI on every push and in the full local suite.
11. **Cross-cutting generative sweeps.** CSRF Origin-pin over the live route table, the route-by-persona authorization matrix (allow, deny, and adjacent-owner), ledger-immutability triggers, anti-enumeration equivalence, and session and token temporal contracts. Pass: each sweep enumerates from the live route table or schema, so a newly added surface is covered by construction rather than by memory.
12. **Coverage floor (§12).** The `vitest.config.ts` thresholds are enforced by the CI coverage job, and catastrophic surfaces are verified by inspection of the tests rather than by a number. Pass: the coverage job is wired into the aggregate gate and green, and no threshold has been lowered to admit new code.
13. **Email catalog (§5.9).** Every promised email has a registered template — a typed shaper, its variant keys, and a committed sidecar — covered by the catalog and conformance sweeps, plus a per-email enqueue test; the shared drain, retry, dead-letter, and idempotency mechanics are covered once over `communicationService`. Pass: the firing sweep enumerates the catalog and every entry has its send site and enqueue test, or the gap is a tracked item in the maintainers' private tracker.
14. **Real data shapes and invariants (§4.7, §4.8).** Every story over migrated data has one test per shape the built database holds; every factory's column pattern matches the pipeline or names the difference; no test helper or testkit journey calls a function inside a controller's entry; every register rule names a passing sweep; and every whole-population invariant runs on shipped databases and on staging. Pass: each holds, or the gap is a tracked item in the maintainers' private tracker.

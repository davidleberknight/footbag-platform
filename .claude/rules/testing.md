---
paths:
  - "tests/**"
  - "run_all_tests.sh"
  - "legacy_data/tests/**"
  - "legacy_data/legacy_mirror/tests/**"
  - "vitest*.config.ts"
  - "src/testkit/**"
  - "scripts/ci/run_clean_room.sh"
  - "scripts/test-*.sh"
  - "scripts/e2e/**"
  - "scripts/lib/aws-isolation.sh"
  - "scripts/ci/check_ci_parity.sh"
---

# Testing rules

Every behaviour change lands with tests covering its intent and its known failure modes; only the test's shape is negotiable.

Strategy and rationale (how to derive, layer and verify tests, and why each rule below exists) live in `docs/TESTING.md`. This file is the operational rule set; the `write-tests` skill is the procedure.

## Mandate

1. **Every bug fix includes a regression test** that fails against the pre-fix code and passes after the fix. A bug in a class with a sweep lands as a row of that sweep.
2. **Every new feature covers its edge cases**, not only the happy path; the lists below are the floor.
3. **Every service contract change includes shape assertions**: a new method, return shape, error class or validation each gets an explicit test.
4. **Tests land in the same diff as the code they cover.** Never "add tests later".
5. **An unexpected `logger.error()` fails the test.** A global spy in `tests/setup-env.ts` fails any test producing a `logger.error()` not opted in via `expectLoggedError(pattern)`.
6. **Every test is demonstrated to fail** (the demonstrated-failure requirement). Break the code it covers (invert the condition, delete the guard, return the other branch), confirm it goes red for that reason, and restore. Do this per test for a regression test and for every test on the high-risk areas (auth and session, payments, member privacy, identity claim, erasure); elsewhere once per distinct branch or behaviour a group of tests covers. A test that passes against broken code asserts nothing, and no threshold detects it: coverage is satisfied by any test that merely executes a line. The `write-tests` skill carries the procedure.
7. **Every assertion names the defect it catches** (the name-the-defect mandate). State in one sentence what a visitor, member, admin or operator would experience if the code broke the way the assertion detects. If the only sentence is "somebody changed this copy on purpose", it is a change-detector: only a deliberate edit to the text or table it asserts can fail it, and it is not written. The four shapes that assert words and still pass are the strategic anti-patterns in `docs/TESTING.md`.
8. **Every acceptance criterion of the motivating story is exercised by at least one test.**

Do not ask whether to add tests. Add them.

## Scope of a verification run

Widen the per-change run (root `CLAUDE.md`) from the changed file's own tests to every test file that imports what changed (`grep -rl "<module basename>" tests/`) when what changed is shared rather than local:

- a fixture or factory
- a service, helper, or type that more than one caller imports
- a template partial rendered by more than one page
- a SQL view or prepared statement with more than one consumer
- any signature a test calls directly

Where that reaches most of the suite (a fixture, a factory, a widely shared helper), it is a long run of `npm test`. Other people's uncommitted work in the tree is not a reason to widen; run what this change reaches.

**Long runs.** The runner in any mode, `npm test`, `npm run test:coverage` and `npm run test:e2e` take minutes, longer than a foreground command may run. Start one only after the human approves it, naming the command and why it is needed. Run it as a background job with its output sent to a log file in the session scratchpad, wait for the completion notice rather than polling, then read only the run's closing summary and report each gate's result and the verdict. Leave the tree alone while it runs: the runner fingerprints the source, and an edit mid-run voids its verdict.

Gate vocabulary: a commit uses `./run_all_tests.sh --quick` (what `npm run test:quick` runs: build and `typecheck:tests`, lint, conventions, harness, generated-content, secret scan, unit and integration); a push and a PR use the bare `./run_all_tests.sh`, local only, which also runs e2e, terraform validation, the security probes and the clean room. `--staging` adds the read-only staging rows. `--skip-py` leaves out the pre-go-live data-load Python gates, ends INCOMPLETE and writes no pass receipt, so it never stands in for the push gate. `./run_all_tests.sh --help` owns the details. Green vitest is not a green gate: a secret-scan finding is invisible to every vitest tier.

Each kind of change also needs the check that can see it, which a targeted vitest run cannot:

- a signature in `src/` that a test calls: `npm run typecheck:tests` (vitest strips types, and `npm run build` checks `src/` only)
- a template or CSS change: `npx vitest run tests/unit/template-*.test.ts tests/unit/*-conformance.test.ts`
- a script under `scripts/`: `bash scripts/ci/assert_conventions.sh`
- a hook, rule, skill or setting under `.claude/`: `bash scripts/ci/assert_claude_harness.sh` and `bash scripts/ci/test_hooks.sh`
- curated or generated content: `bash scripts/ci/assert_generated_content_current.sh`

Browser flows, the legacy Python suites, the loader and freestyle database guards, and terraform validation run only in the bare runner. When a change reaches one of them, say in the report that it did not run, and offer to run it.

**Run vitest from the repository root, or pass `--config vitest.config.ts`.** Otherwise vitest's built-in defaults apply silently, and `tests/setup-env.ts` refuses the run.

A CI job or step must be reachable from `npm run test:quick` or the bare runner, or carry a written reason it is not; `scripts/ci/check_ci_parity.sh` enforces this in both directions.

## What "edge cases" means

For every public-facing route:

- Happy path — correct HTTP status, the data and state the story promises rendered (not static copy), expected redirects.
- Authentication gate — 302 redirect if unauthenticated, 200 if authenticated (for protected routes).
- Authorization gate — 403 or 404 when authenticated-but-not-authorized (admin-only, owner-only, etc.).
- Not-found — 404 for unknown IDs, slugs, keys.
- Invalid input — 400 or 422 for malformed/oversized/wrong-type bodies and query params.
- Draft/unpublished content — must not appear in public responses.
- Route ordering — more-specific routes match before catch-alls.
- Anti-enumeration — endpoints that could leak existence (login, password reset, email verify, claim lookup) must return identical UX for "exists" vs "does not exist" cases.
- Rate-limit behavior — exceeds-limit returns 429 with `Retry-After`.
- CSRF — state-changing verbs (POST/PATCH/PUT/DELETE) reject requests without a matching CSRF token.

For every service method:

- Correct output shape for the intended view-model or contract consumer.
- Business rule enforcement — filters, sorts, eligibility checks, tier gates.
- Transaction atomicity — multi-row writes either all land or none.
- Failure between steps — where a step commits before a later send, provider call or write, a failure there leaves nothing lost, doubled or reported done.
- Member state — a path that mails, lists or counts members covers deceased, purged, unverified and bounced members beside a live one.
- Idempotency — repeating an operation with the same key returns the same id/outcome.
- Error classes — every `throw` path has a test that asserts the thrown class and the message shape.
- Boundary values — zero rows, one row, N rows, N+1 rows, empty strings, unicode, NULLs, extreme dates.
- Edge cases from the relevant `docs/USER_STORIES.md` story (acceptance criteria) and the owning service's file-header JSDoc (ownership boundary and required service-layer patterns; current method shapes are authoritative in TypeScript and tests). Read the story before writing the test.

For every pure function / shaping helper:

- Identity cases (empty input → empty output).
- Round-trip stability (shape(shape(x)) === shape(x) when the contract promises idempotency).
- Locale / normalization / case-folding edges.

For every schema change or factory change:

- The factory inserts a row that satisfies all NOT NULL / CHECK / FK constraints.
- The factory's auto-creation of dependent rows (e.g. `legacy_members` stub on passing `legacy_member_id`) is exercised by a test that proves the dependent row appears.
- The factory applies the same value normalization as the production write path (lowercasing, trimming, stored-form invariants). After changing such an invariant, run the full integration suite (a long run, per the scope rule above), not only the touched files: factories are shared, so regressions surface in other files' tests.

## Adversarial testing

Before calling a test suite complete, try to break the feature. Common attacks:

- Oversized payloads (1 MB subject line, 100 KB email body).
- Unicode mischief (RTL override, zero-width joiners, homoglyph substitutions).
- SQL-injection attempts in every free-text input.
- XSS attempts in every field that lands in a Handlebars template.
- Timing attacks against anti-enumeration endpoints (login, password reset, claim lookup).
- Race conditions — two simultaneous inserts of one idempotency key; two simultaneous claims of one legacy account. A deterministic pre-commit of the winner's unique value proves the constraint-to-error mapping; only genuinely concurrent requests (`Promise.all` against the running app) prove interleaving safety where there is an async boundary; a synchronous single-transaction service cannot race in-process, so the simulation is the correct evidence there.
- Expired/wrong-type/replay-attack tokens.
- Mass assignment / overposting — a state-changing form or JSON body carrying extra fields that target privileged columns (`is_admin`, `tier`, `id`, `slug`, `login_email`, `password_hash`, verification/email-status flags). The handler must persist only its whitelisted fields; the test posts the crafted extras and asserts every privileged column is untouched and no shadow row is conjured by an injected id or slug.

If an adversarial test reveals a hole, fix it *and* keep the test.

## Anti-patterns (forbidden)

Three scans in `scripts/ci/assert_conventions.sh` are advisory and print a warning rather than failing: vacuous assertion forms, tool-gated skips, and `cachedGet` writes inside a case. Every other check named below fails the build.

- **No test may be flaky.** A test whose verdict can change with machine load, scheduling, the clock, file order, parallelism, the network or randomness is a defect, even if it has never failed: wait on the event itself, never on a fixed delay, and never let a wall-clock measurement decide pass or fail. A flaky test is fixed at its root or deleted; it is never retried, quarantined, or re-run until green. The conventions gate refuses a fixed-delay wait in tests.
- **No mocking the DB.** Integration tests run against a real SQLite file per `tests/CLAUDE.md`.
- **No hand-rolled row inserts.** All test data comes from the shared factories in `tests/fixtures/factories.ts` (which re-exports `src/testkit/personaRowBuilders.ts`); a table without a factory gets one. The conventions gate enforces it, with exactly two exemptions: an insert into a table the file itself creates, matched by name; and a statement whose subject is the database refusing a row, which a factory typed to the valid shape cannot build, marked `factory-cannot-express: <why>` on or just above that statement. Per statement, never per file.
- **An assertion about what the repository ships asks git, not the filesystem.** Counts, sets and equalities over a tracked tree go through `committedFiles` / `committedBasenames` in `tests/fixtures/committedFiles.ts`, because a listing also sees whatever else is on this disk. Use a listing where the subject really is the filesystem, such as what a script just wrote into a temp directory.
- **A measured bound is measured in the same window as the thing it bounds.** Sample the reference alongside the subject and compare medians from one window; use `performance.now()`, which is monotonic and sub-millisecond; state the resolution the assertion actually has, measured by injecting a known asymmetry.
- **No mocking framework internals.** Don't mock Express, Handlebars, JWT, argon2, or SES adapter internals. Use the stub adapters and real middleware.
- **No timestamp / random / UUID leakage.** Comparing against `Date.now()`, `randomUUID()` or `crypto.randomBytes()` without freezing the source is flake: freeze time, seed randomness, or assert shape, not value. A fixture compared against SQLite's own clock (tier and Active-Player expiry, grace windows) anchors to now with the runtime-relative helpers in `tests/fixtures/clock.ts` (`isoDaysFromNow`), because fake timers cannot move SQLite's clock and an absolute date flips meaning once the wall clock passes it. The conventions gate rejects an unfrozen source inside an `expect(...)`; a bound derived from a budget the code under test declares says so on the line with `budget-is-the-contract:`.
- **No assertion on incidental ordering.** Never read `[0]` out of an unordered result. An `ORDER BY` on a non-unique column is the same defect: `created_at` ties inside one millisecond. Ending the order on the row's id makes it stable, not newest (ids are a prefix plus a random UUID); that tiebreaker is right for a paginated production read, never for identity in a test. Select on a key the test controls (an idempotency key, a per-case email) or snapshot ids before the action and take the new ones: `tests/fixtures/rowPinning.ts` holds both shapes and asserts how many rows matched. A test genuinely about ordering says so on the line with `ordering-is-the-contract:`, which is also how it satisfies the gate. The tell is a failure in the full suite that never happens alone.
- **No test budget that depends on what else is running** (the test-budget rule). A suite whose assertions are real network round-trips runs one file at a time (`--no-file-parallelism`, as `scripts/test-smoke.sh` does). A test that passes alone and fails in the suite is fixed by removing the contention, not by a bigger number. Keep a per-test timeout above the code's own internal budget, so a timeout means the code decided; the gate rejects a timeout equal to the configured default. Files run in a seeded shuffled order; reproduce an order-dependent failure with the `VITEST_SEED` the run printed.
- **No global state leakage between test files.** Each file owns its temp DB path; no fixture file assumes rows seeded by another file.
- **No content-module self-assertion.** Importing a content module or table and asserting that it contains its own entries, or has its own size, restates the source. Assert what the module drives instead: the render or derivation that consumes it, checked against the module read at test time.
- **No table inflation.** An `.each` row earns its place by exercising a distinct branch or boundary. Rows that run one code path N times are one case: loop inside the assertion and name the failing item in its message.
- **No trivially-true or duplicate checks.** A `typeof` the types guarantee, bare truthiness on a typed field, or a standalone `it('returns 200')` whose status a sibling case or the route-wiring crawl already asserts defends nothing. Assert the status inside the case that checks the body.
- **No repeated requests to one page** (the repeated-requests anti-pattern). A read-only suite asserting many things about one page shares one response per path through `cachedGet` in `tests/fixtures/cachedGet.ts`; the fixture's header says when a suite keeps its own request.
- **No test double that parses unstructured tool output is written from memory.** Where the consumer asks for a contracted shape (an AWS `--query` scalar, a match on a name it already knows, strings it supplied itself), an acknowledged fake is fine. Where it parses output the tool never promised to keep stable (an error message, a banner, a human-readable listing), the fixture carries a sample captured from a real run and a note of where it came from, and a test shows that sample parses to the expected fields, so a parser matching nothing fails. `tests/fixtures/stripeGoldenPayloads.ts` is the worked example: keep the provider's full structure including ignored fields, record the capture date, and commit nothing of uncertain provenance.
- **No fixture smaller than the thing it stands for, where a size is what the code decides on.** Where the code compares against a length, size, count or duration, build the fixture at the real input's scale, state in a comment the real magnitude and where that figure came from, and pin the bound from both sides: a value longer than the real one is accepted, and the refusal lands exactly one byte past the limit. A literal copied from curated data is held to its source.
- **No silent skips.** `.skip`, `.todo`, `xit` are forbidden in committed code. If a test can't land, the feature can't either.
- **No "tested manually" as a substitute.** Manual verification is for UI/visual checks. Logic is tested by the suite.
- **No tests that run on the dev DB.** Tests always use `setTestEnv` + `createTestDb` from `tests/fixtures/testDb.ts`.
- **No test artifacts under the project root.** Temp DBs, WAL sidecars and scratch files go under `os.tmpdir()` with a `footbag-test-` prefix (`setTestEnv` builds the database path, `tests/fixtures/scratchDir.ts` everything else; a conventions check refuses a temp path spelled any other way).
- **No unbounded process spawn.** Every synchronous spawn (`spawnSync`, `execFileSync`, `execSync`) passes the shared bound from `tests/fixtures/spawnGuard.ts`, because a blocked event loop cannot fire `testTimeout` and the suite would hang instead of failing; `SIGKILL`, since a script waiting on input can ignore `SIGTERM`. The gate enforces it at file level.
- **No invented secret-shaped literals.** A fake AWS key id (`AKIA…`/`ASIA…`) or any other
  credential-shaped value in a test is copied from one `.gitleaks.toml` already allowlists; a new
  one fails the pre-commit secret scan. If none fits, ask; never extend the allowlist.

## Coverage floor

Thresholds are set in `vitest.config.ts` and enforced by the CI `coverage` job on every push. Each sits about a point under measured coverage; only a human raises one, and none is lowered to admit new code.

Auth, session, member privacy, payments and identity claim have no per-path threshold; their floor is the demonstrated-failure requirement.

New source files must land with tests that keep coverage at or above the current floor.

## Adapter parity

An adapter change lands with three tests: boot config in `tests/unit/env-config.test.ts`, interface parity in `tests/integration/adapter-parity.test.ts` (an injected fake client, never a mocked SDK), and a staging smoke in `tests/smoke/` only where the live call mutates nothing. The full contract is in `.claude/rules/adapter-conventions.md`.

## Tests never write real data (hard invariant, by design)

No test, test fixture, or local test-runner entry point writes into the irreplaceable real-data trees — `legacy_data/` and `curated/` — nor into the project root. Every test write goes to `os.tmpdir()` through the helpers the anti-patterns above name, or to `mktemp` in a script. Never construct a writable path from `path.join(process.cwd(), ...)`: the `footbag-test-` prefix under `os.tmpdir()` is what lets `tests/global-setup.ts` sweep a SIGKILL/OOM leak.

The only script permitted to write a real-data path is the loader tool `scripts/reset-local-db.sh`, and only where there is nothing to clobber: CI on a clean checkout, and the clean-room gate's throwaway worktree. It is never run against a working checkout holding the machine-local legacy material (the site mirror and the member dump). To reproduce a loader failure on such a machine, use `scripts/ci/run_clean_room.sh`; to rebuild a local database, use `scripts/deploy-local-data.sh --from-csv`.

`./run_all_tests.sh` is safe on a workstation holding real `legacy_data/` by design: it keeps the loader gate inside the clean room's worktree, and it fingerprints `legacy_data/` and `curated/` before and after the run, aborting non-zero if any tree changed. A new gate writes only to tmp.

Any pytest gate over the legacy suites (`legacy_data/tests/`, `legacy_data/legacy_mirror/tests/`) runs with `PYTHONPYCACHEPREFIX` pointed at a throwaway temp dir and `-p no:cacheprovider`, because pytest otherwise writes bytecode and a cache next to the source it collects. The fingerprint prunes `__pycache__`, `*.pyc` and `.pytest_cache`, so a stray manual pytest run cannot masquerade as a real-data change.

## Tests never mutate live infrastructure (hard invariant, by design)

No test writes, deletes, or arms anything in a deployed environment: no `put-parameter`, no object written to a bucket, no host file changed, no card charged, no mail to a real recipient.

The default suite reaches AWS not at all, enforced rather than trusted. `tests/setup-env.ts` breaks credential resolution for every worker and everything it spawns, from the single declaration in `tests/fixtures/awsIsolation.ts`: no profile, no config or credentials file, no environment keys, and the instance metadata endpoint disabled. Never widen the exception or drop a credential source; the gate enforces it.

`tests/fixtures/machineIsolation.ts` denies the rest of the workstation the same way: the home directory, the deployment-environment variable, the media directories, and the SSH client through a stub `ssh` at the front of `PATH` that refuses to connect. A suite that runs the real client passes `-F` with a configuration file of its own; a suite that needs an alias to resolve puts its own `ssh` in front, visibly, in the file that depends on it. The gate enforces the stub.

The runner's shell gates follow the same invariant: a gate that must not reach AWS runs its commands through `aws_isolated_run` from `scripts/lib/aws-isolation.sh`, so a gate that starts reaching AWS fails at once on every machine. The gate fails the build if a gate declared offline stops running under it.

Isolation lives in the shared declaration; extend it, never isolate per file.

The one exception is the opt-in smoke tier behind `RUN_STAGING_SMOKE=1`, run through `npm run test:smoke` or the `--staging` rows of the runner, which exists to prove live wiring and sets its own profile. It may make only calls that mutate nothing, the same condition the adapter three-test contract in `.claude/rules/adapter-conventions.md` puts on a staging smoke.

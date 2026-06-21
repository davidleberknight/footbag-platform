---
paths:
  - "tests/**"
  - "src/adapters/**"
  - "scripts/ci/stage_*.sh"
---

# Testing rules

Tests are load-bearing project infrastructure, not ceremony. Every change that affects behavior lands with tests that cover its intent AND its known failure modes. Test coverage is non-negotiable; only the test *shape* is negotiable.

Strategic frame (how to derive, layer, and verify tests) lives in `docs/TESTING.md`. This file is the operational rule set.

## Mandate

1. **Every bug fix includes a regression test.** The test must fail against the pre-fix code and pass after the fix. This is how we know the fix is real and prevents recurrence.
2. **Every new feature includes edge-case coverage.** Not just the happy path. The set of edge cases below is the minimum starting point for every feature.
3. **Every service contract change includes shape assertions.** New method, changed return shape, new error class, new validation — each gets an explicit test against the new shape.
4. **Tests land in the same change as the code they cover.** Not "add tests later." Not "will add in a follow-up PR." Not "TODO: test this." In the same diff.
5. **Tests fail on unexpected `logger.error()`.** A global spy in `tests/setup-env.ts` fails any test that produces a `logger.error()` not opted in via `expectLoggedError(pattern)`. The same `logger.error()` line drives the staging/prod CloudWatch admin alarm.

Do not ask whether to add tests. Add them.

## What "edge cases" means

For every public-facing route:

- Happy path — correct HTTP status, expected content, expected redirects.
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

## Adversarial testing

Before calling a test suite complete, try to break the feature. Common attacks:

- Oversized payloads (1 MB subject line, 100 KB email body).
- Unicode mischief (RTL override, zero-width joiners, homoglyph substitutions).
- SQL-injection attempts in every free-text input.
- XSS attempts in every field that lands in a Handlebars template.
- Timing attacks against anti-enumeration endpoints (login, password reset, claim lookup).
- Race conditions — two simultaneous inserts of the same idempotency key; two simultaneous claims of the same legacy account.
- Expired/wrong-type/replay-attack tokens.

If an adversarial test reveals a hole, fix it *and* keep the test.

## Anti-patterns (forbidden)

- **No mocking the DB.** Integration tests run against a real SQLite file per `tests/CLAUDE.md`.
- **No mocking framework internals.** Don't mock Express, Handlebars, JWT, argon2, or SES adapter internals. Use the stub adapters and real middleware.
- **No timestamp / random / UUID leakage.** Tests that compare against `Date.now()`, `randomUUID()`, or `crypto.randomBytes()` without freezing the source produce flake. Freeze time; seed randomness; or assert shape, not value.
- **No global state leakage between test files.** Each file owns its temp DB path; no fixture file assumes rows seeded by another file.
- **No silent skips.** `.skip`, `.todo`, `xit` are forbidden in committed code. If a test can't land, the feature can't either.
- **No "tested manually" as a substitute.** Manual verification is for UI/visual checks. Logic is tested by the suite.
- **No tests that run on the dev DB.** Tests always use `setTestEnv` + `createTestDb` from `tests/fixtures/testDb.ts`.
- **No test artifacts under the project root.** Temp DBs, WAL sidecars, admin-allowlist files, scratch fixtures — all in `os.tmpdir()` with a `footbag-test-` prefix (the shared `setTestEnv` helper does this). Project-root leaks survive worker timeouts / OOM / WAL races against `afterAll`; `/tmp` leaks the OS cleans.

## Coverage floor

Thresholds are set in `vitest.config.ts` and are a mechanical ratchet floor: coverage never ratchets down, and a change that lowers a threshold is wrong, not the threshold. Overall coverage is an aspirational best-effort goal, not a fixed number. Catastrophic-severity surfaces (auth, session, member privacy, payments, identity claim) target 100% coverage.

New source files must land with tests that keep coverage at or above the current floor. Do not lower thresholds to admit new code.

## When tests are insufficient

Tests prove code does what the test expects. They do not prove the code is correct. Before shipping:

- Re-read the user story or design decision that motivated the change.
- Confirm the acceptance criteria are all exercised by at least one test.
- Check that the adversarial tests didn't miss a class of input the story implies.

If the story is unclear, escalate to the human before writing tests that encode a guess.

## Dev↔staging adapter parity

Adapters (full set canonical in `docs/TESTING.md` §7.2) are the only seam between dev and staging. Dev uses `local`/`stub` implementations against in-process fakes; staging uses `kms`/`live` implementations against real AWS. Production reuses the staging adapters against the production AWS account.

Every new adapter, or change to an existing adapter's contract, requires three tests. These are long-term tests that describe a permanent contract, not one-shot verifications for the sprint that introduced them.

1. **Boot-time config test** (in `tests/unit/env-config.test.ts`). `src/config/env.ts` must fail-fast at module-load when required prod-mode env vars are absent, with a specific error message. Add a case per new required env var.

2. **Interface parity test** (in `tests/integration/adapter-parity.test.ts`). Both implementations satisfy the TypeScript interface and produce observable outputs with identical structure. Use an injected fake client to stand in for the AWS SDK call path; do not mock the SDK package itself.

3. **Staging-smoke test** (in `tests/smoke/`). Hits real staging AWS via the assumed-role chain. Gated behind `RUN_STAGING_SMOKE=1` and excluded from the default `npm test` run. Asserts the permanent contract that staging runtime identity is reachable and the adapter's AWS API calls succeed. A failure means staging AWS wiring is broken or incomplete (not that the test is "Phase H-specific" or any other sprint label).

The `tests/smoke/` suite is run by operators on the staging host (or from a workstation with the staging profile configured) after any change to staging AWS runtime identity, KMS keys, SES identities, or IAM policies the app depends on, via `npm run test:smoke`. It is not part of CI and is never run against production.

## Fixture-staging scripts: never clobber real data

Test-fixture stagers (`scripts/ci/stage_*.sh` and equivalents) populate paths that, on a developer workstation, may also hold real data: `legacy_data/mirror_footbag_org/` (legacy site mirror crawl, multi-day to regenerate), `legacy_data/event_results/canonical_input/` (canonical CSVs, multi-hour pipeline). When you write or modify a fixture-staging script:

- **Detect real data first, refuse to overwrite it. No flag, env var, or CI mode bypasses this guard.** A real-data signal might be: a row count well above any fixture (e.g. `events.csv` rows > 50 vs the fixture's 6), a directory population well above any fixture (e.g. `events/show/` > 100 entries vs the fixture's 0), or the presence of a real file the fixture never ships. An operator who genuinely wants to rebuild must move the directory aside manually before re-running; the script must not offer an in-band escape (no `--clobber-real-data`, no `FORCE_REAL_DATA_CLOBBER`, nothing).
- **`CI=true` and `GITHUB_ACTIONS=true` may auto-enable `--force`** (since CI starts from an empty target). The real-data guard above fires regardless and is not subject to `--force`.
- **Reference the canonical fixture-staging script** for the safety pattern: `scripts/ci/stage_loader_smoke_fixtures.sh` (see `_target_holds_real_data` and `_check_target`). A prior version of that script had only the empty-target guard and wiped a 60 GB real-data mirror on a developer workstation (2026-05-09 incident); the real-data detection running before the empty-target check prevents recurrence. Copy this pattern when adding new fixture stagers; mark the header with `# REAL-DATA GUARD` so the convention gate in `scripts/ci/assert_conventions.sh` recognizes the script as compliant.
- **State the threshold in the script header** so future readers understand why "n > 50" is the line. If the threshold is wrong (real data falls under it), the script silently fails to protect.

The same principle applies to any test-setup script that touches paths outside `tmp/` or per-test temp dirs.

## Tests never write real data (hard invariant, by design)

No test, test fixture, or local test-runner entry point writes into the irreplaceable real-data trees — `legacy_data/` and `curated/` — nor into the project root. Every test write goes to `os.tmpdir()` / `mktemp` via the shared helpers (`tests/fixtures/testDb.ts` `setTestEnv` / `createTestDb`; `scripts/e2e/start-stack.sh` `mktemp`). Never construct a writable path from `path.join(process.cwd(), ...)`; use `os.tmpdir()` with a `footbag-test-` prefix so `tests/global-setup.ts` sweeps any SIGKILL/OOM leak.

The only scripts permitted to write a real-data path are the CI loader-pipeline tools — `scripts/reset-local-db.sh` and `scripts/ci/stage_loader_smoke_fixtures.sh` (the `db-load-smoke` gate). These are **CI-only**: GitHub Actions runs them against a clean, empty checkout where there is nothing to clobber. They are NEVER invoked by the local test runner. Running them on a workstation that holds the real `legacy_data/` dump is forbidden; if a loader failure must be reproduced locally, do it in an isolated `git worktree` with an empty `legacy_data/`, and confirm with the maintainer first. (They also carry the refuse-on-real-data guards from the section above, but the by-design rule is upstream of that: do not point them at a real checkout at all.)

`./run_all_tests.sh` is the canonical local full-suite runner and is safe on a workstation holding real `legacy_data/` by design: it excludes the loader gate, and it fingerprints `legacy_data/` and `curated/` before and after the run, aborting non-zero if any tree changed. Any new suite added to `run_all_tests.sh` must preserve this — the new gate writes only to tmp.

## /curated guardrail (pre-go-live; dev-only)

In dev, curated-media writes mutate the persistent on-disk `/curated/` sidecar files, which are the committed source of truth, so a switchable test-persona admin must not author real curated content. The curator service refuses curated and FH-owned-gallery writes (`assertCuratorActorMayWriteCurated`) from seeded test personas (member ids carrying the `member_persona_` prefix). Real maintainer accounts and the primary maintainer's persona register through the real flow and carry ordinary ids, so they pass; the coming freestyle sidecar curation reuses the same curator service and inherits the guard.

The guard is keyed on `config.allowCuratedSidecarWrites`: it fires only where the on-disk sidecar write is enabled (dev, and the integration-test fixture, which sets `ALLOW_CURATED_SIDECAR_WRITES=1`). Staging and production run with the flag off, write curated content to the DB and object store only, and let any admin curate; there the guard is a no-op. Testing is therefore env-coupled: `tests/integration/curatorMediaService.persona-guard.test.ts` runs with the flag on (persona refused, real admin allowed, member-owned writes unaffected), and `tests/integration/curatorMediaService.persona-guard.sidecars-off.test.ts` boots with the flag cleared to pin the staging/production no-op.

## Cross-references

- `docs/TESTING.md` — testing strategy and methodology: how to derive, layer, and verify tests.
- `tests/CLAUDE.md` — conventions (Vitest, Supertest, factories, test DB isolation, file layout).
- `tests/fixtures/factories.ts` — canonical test-data factories; extend these rather than hand-rolling row inserts.
- `tests/fixtures/testDb.ts` — DB setup/teardown helper.
- `docs/USER_STORIES.md` — functional acceptance criteria.
- service file-header JSDoc — service contract, invariants, and side-effects.

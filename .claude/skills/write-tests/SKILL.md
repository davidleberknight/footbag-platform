---
name: write-tests
description: Write or extend tests for a route, service, or pure function. Use when adding new features, verifying edge-case coverage, or confirming a fix holds.
---

# Write Tests

## When to use this skill

- Adding a new route or service method and want tests alongside or before implementation
- Checking whether existing coverage is sufficient for a feature
- Verifying a bug fix is captured by a regression test
- Doing a focused coverage pass after a feature lands

Tests can be written at any point. See `tests/CLAUDE.md` for conventions.

## Step 1: Confirm scope

Read the open issues in the maintainers' private tracker (`gh issue list -R "$FOOTBAG_PRIVATE_REPO" --state open`; if unwired, note it in one line and rely on the human's instruction). Confirm the feature being tested is in scope. Do not write tests for out-of-scope behavior.

## Step 2: Determine test layer

**Unit tests** (`tests/unit/`) for exported pure functions with no DB dependency:
- `slugify()` from `slugify.ts`
- `personHref()` from `personLink.ts`
- `groupPlayerResults()` from `playerShaping.ts`
- `ServiceError` classes and `isServiceError()` from `serviceErrors.ts`

Non-exported pure functions are tested indirectly through integration tests. Do not modify production code exports just for testing.

**Integration tests** (`tests/integration/`) for everything involving routes, DB, auth, or rendered HTML:
- Route contracts (status codes, redirects, rendered content)
- Auth gates and ownership enforcement
- Privacy boundaries (purged members excluded, honors-gated profiles, show_competitive_results)
- Session edge cases (tampered cookies, malformed payloads)
- Validation negative paths (invalid input, boundary values)
- Business rules exercised through routes

**Smoke tests** (`tests/smoke/`) for real-AWS wiring contracts only. Opt-in via `npm run test:smoke` (which uses `scripts/test-smoke.sh` to read TF outputs and gate behind `RUN_STAGING_SMOKE=1`). Excluded from default `npm test` and CI. See "Smoke tests" below for scope rules.

**End-to-end tests** (`tests/e2e/`, Playwright) for assertions only a real browser can make: real cookie attributes (HttpOnly, Secure, SameSite) and session behavior across redirect chains, CSRF-protected form submission where browser semantics matter, the onboarding / legacy-claim / club-cleanup wizard happy paths plus the one negative case per wizard a browser reveals, and avatar / media upload round-trips. Keep the suite small and business-critical — every business-rule branch and validation edge belongs in integration, not here; exhaustive navigation crawls live at the integration HTTP layer, not in a browser. Local e2e obtains a session from the persona-switch route (`GET /dev/switch?as=<slug>`) rather than a full login-plus-email chain. See `docs/TESTING.md` §5.5 and §6 for the belongs / does-not-belong rules.

**Persona-crawl** (`tests/dev/`) is the development-only member-journey and page crawl across the persona set; opt-in via `RUN_PERSONA_CRAWL=1`, excluded from `npm test` and CI. Extend it only when adding a cross-persona page-crawl surface, not for ordinary route coverage.

## Step 3: Understand what needs testing

Read:
1. Acceptance criteria from `docs/USER_STORIES.md` (targeted sections)
2. Required rendering pattern from the owning service's file-header JSDoc and `.claude/rules/view-layer.md` for the affected route (including any sensitive-page invariants that apply)
3. Required service-layer pattern from the affected service's file-header JSDoc (boundary, required patterns, side effects)
4. Current method shape from TypeScript and tests at the cited source path
5. Known deviations (open `bug`-labeled private-tracker issues) that the test must accept
6. Nearby tests in the target directory; follow established patterns exactly

Do not invent behavior not in the acceptance criteria.

## Step 4: Plan test cases

Read `docs/TESTING.md` §4 for the project's test design principles. When you need to confirm the surface under test traces to a deployed user story, use the deployed-surface enumeration method (`.claude/skills/bug-hunt/DEPLOYED_SURFACE.md`). The baseline case list below applies to every route and is the floor; risk-classified surfaces (per TESTING.md §3) layer additional adversarial cases on top per `.claude/rules/testing.md`.

The baseline case floor for every route and service method is the edge-case list in `.claude/rules/testing.md`; read it now rather than working from memory. Two cases this project has learned the hard way and the rule does not spell out:

- Privacy: purged members excluded, honors-gated public profiles, PII not leaked to unauthorized viewers.
- Form-bearing page: the rendered primary form is not nested and its submit control posts to the intended handler. A nested `<form>` orphans the submit button and is invisible to a handler-only POST test; the static gate in `scripts/ci/assert_conventions.sh` catches the markup at merge time, and an end-to-end submit is the deep check that the wired form reaches its handler.

For catastrophic-severity surfaces (auth, session, member privacy, payments, identity claim), also consider STRIDE-aware threat coverage per `docs/TESTING.md` §4.2 (a vocabulary, not a per-test artifact) and the verification floor in §4.5.

State the planned cases before writing code. No traceability entry artifact is required.

## Step 5: Write tests

### Unit tests

No DB setup needed. Import the function directly and assert.

```typescript
import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/services/slugify';

describe('slugify', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(slugify('John Doe')).toBe('john_doe');
  });
});
```

### Integration tests

Use the shared helper from `tests/fixtures/testDb.ts` for new test files:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertEvent, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3050');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, { id: 'test-001', slug: 'test_user' });
  insertEvent(db, { status: 'published', title: 'Spring Classic' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function authCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: 'test-001', role: 'member' })}`;
}

describe('GET /events', () => {
  it('lists published events', async () => {
    const app = createApp();
    const res = await request(app).get('/events');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Spring Classic');
  });
});
```

The example imports `../fixtures/supertestWithOrigin`, not plain `supertest`, because state-changing verbs (POST/PUT/PATCH/DELETE) are origin-pinned: the request is rejected with 403 before the controller runs unless it carries a matching `Origin` header, which the wrapper supplies. Use the wrapper whenever a suite issues any state-changing request; plain `supertest` is acceptable only for a GET-only suite.

Test data comes from the factories; `insertMember()` overrides cover edge cases (`{ is_hof: 1 }`, `{ is_deceased: 1 }`, `{ personal_data_purged_at: '2025-01-01T00:00:00.000Z' }`). The anti-patterns that would otherwise bite here, raw inserts, home-rolled temp paths, skipped tests, lowered thresholds, and writes into the real-data trees, are all in `.claude/rules/testing.md`.

### `logger.error()` opt-in

Any test that deliberately exercises an error path producing `logger.error()` calls `expectLoggedError(pattern)` from `tests/setup-env.ts` before the action that triggers it. A substring or RegExp matches the message arg. Without the opt-in, the global afterEach guard fails the test.

```typescript
import { expectLoggedError } from '../setup-env';

it('outbox failure → 503 + audit row', async () => {
  expectLoggedError('audit: auth.register_notification_failed');
  // ... action that throws inside the catch block
});
```

## Step 6: Prove each test can fail

A test that has never failed has never been shown to test anything. Before a test is done,
break the code it covers and confirm it goes red.

For each new or changed test:

1. Make the smallest edit to the production code that should break it — invert the condition
   the test asserts, delete the guard clause, return the other branch.
2. Run that one test file. It must fail, and the failure message must name the thing you
   broke rather than something incidental.
3. Restore the code and run it again. It must pass.

If the test still passes while the code is broken, the test is wrong, not the code. Fix the
assertion until it fails for the right reason.

Restore before moving on: `git status` must show no modified production source when you are
done.

This step is the one that catches a silent gap. The coverage thresholds are satisfied by any
test that merely executes a line; only breaking the line tells you whether an assertion would
fail if it were wrong.

## Step 7: Run and report

Run `npm run build` plus the suites the change reaches, named explicitly (`npx vitest run tests/...`). `npm run test:coverage` when a coverage question is open. The full suite belongs at a commit or PR gate, not here.

Report: which tests were added, what each asserts, whether all tests pass, and whether type-check is clean. Flag any failures with the full error output.

## Smoke tests

Run via `npm run test:smoke` against real staging AWS. Gated behind `RUN_STAGING_SMOKE=1` (set by `scripts/test-smoke.sh`). Excluded from default test runs and CI. The canonical example is `tests/smoke/staging-readiness.test.ts`.

**Scope: wiring only.** Smoke verifies that the running infrastructure can reach AWS with the correct identity, the right resources exist with the right metadata, and adapter calls succeed end-to-end. Smoke is not for application logic or library behavior.

In scope for smoke:
- Identity resolution (assumed-role ARN matches the expected role)
- AWS resource metadata (key spec, key usage, signing algorithms)
- Adapter round-trip via real AWS (KMS sign+verify, SES send to mailbox simulator)
- Alias and ARN addressing variants the production code uses
- Adapter codepaths whose AWS-side behavior differs (e.g., `msg.from` override changes the SES `Source` field)

Out of scope for smoke (use unit tests against the adapter):
- Token tampering, expired-token, `alg=none` rejection
- Adapter input validation, encoding, error-class shaping
- Default-vs-override branches whose AWS-side behavior is identical

Out of scope for smoke (use integration tests):
- End-to-end flows (password reset, outbox drain)
- Bounce / complaint webhook handling
- Suppression list, rate-limit, retry behavior

**Bar for adding a smoke assertion:**
- Must require real AWS to verify (not coverable by a stub)
- Must catch a specific, named misconfiguration not already detected
- Must be deterministic (no clock-dependence, no rate-limit-dependence)

Update the test file's header docblock with the new failure-mode entry whenever a smoke assertion lands.

**Adapter parity (long-term).** Per `.claude/rules/testing.md` "Dev↔staging adapter parity," every adapter has three layers: boot-time config (`tests/unit/env-config.test.ts`), interface parity with an injected fake AWS client (`tests/integration/adapter-parity.test.ts`), and the staging smoke. Smoke is the only layer that needs real AWS; do not duplicate parity-test assertions into smoke.

## Database writes in tests

If a test writes to the database, isolate it: use a fresh per-test DB path, or wrap the write in a transaction and roll back in `afterEach`. Do not let writes from one test affect reads in another.

## Composition order

`write-tests` fits anywhere in the flow: before implementation (spec), alongside (driven by code), or after (coverage pass).

Full skill sequence: see the composition order in root `CLAUDE.md`.

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

## Step 1 — Confirm scope

Read the top active-slice/status block in `IMPLEMENTATION_PLAN.md`. Confirm the feature being tested is in scope for the current slice. Do not write tests for out-of-scope behavior.

## Step 2 — Determine test layer

**Unit tests** (`tests/unit/`) for exported pure functions with no DB dependency:
- `slugify()` from `identityAccessService.ts`
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

## Step 3 — Understand what needs testing

Read:
1. Acceptance criteria from `docs/USER_STORIES.md` (targeted sections)
2. Route contract from `docs/VIEW_CATALOG.md` for the affected page (if a route test)
3. Service contract from `docs/SERVICE_CATALOG.md` for the affected service
4. Nearby tests in the target directory, follow established patterns exactly

Do not invent behavior not in the acceptance criteria.

## Step 4 — Plan test cases

Identify cases to cover:
- Happy path: correct status and expected content
- Auth gate: 302 if unauthenticated, 200 if authenticated (protected routes)
- Ownership: 404 if accessing another member's protected resource
- Privacy: purged members excluded, honors-gated public profiles, PII not leaked to unauthorized users
- Not-found / invalid input: 404 or 400 as appropriate
- Draft/unpublished content must not appear in public responses
- Route ordering: more-specific before catch-all
- Negative paths: validation failures, boundary values, empty/whitespace input
- Adversarial: session tampering, double-submit, concurrent claims

State the planned cases before writing code.

## Step 5 — Write tests

### Unit tests

No DB setup needed. Import the function directly and assert.

```typescript
import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/services/identityAccessService';

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
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertEvent } from '../fixtures/factories';
import { createSessionCookie } from '../../src/middleware/authStub';

const { dbPath, sessionSecret } = setTestEnv('3050');

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
  return `footbag_session=${createSessionCookie('test-001', 'member', sessionSecret, 'Test User', 'test_user')}`;
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

Use factories from `tests/fixtures/factories.ts`. Insert only what the tests need. Use `insertMember()` overrides for edge cases (e.g., `{ is_hof: 1 }`, `{ is_deceased: 1 }`, `{ personal_data_purged_at: '2025-01-01T00:00:00.000Z' }`).

## Step 6 — Run and report

```bash
npm test              # all tests
npm run test:unit     # unit tests only
npm run test:integration  # integration tests only
npm run test:coverage # with coverage report
npm run build         # type-check
```

Report: which tests were added, what each asserts, whether all tests pass, and whether type-check is clean. Flag any failures with the full error output.

## Mutation tests (DB writes)

If a test writes to the database, isolate it: use a fresh per-test DB path, or wrap the mutation in a transaction and roll back in `afterEach`. Do not let writes from one test affect reads in another.

## Composition order

`write-tests` fits anywhere in the flow: before implementation (spec), alongside (driven by code), or after (coverage pass).

Full skill sequence: `extend-service-contract` -> `add-public-page` -> `write-tests` -> `doc-sync` -> `prepare-pr`

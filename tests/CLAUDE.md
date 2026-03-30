# tests/ — Testing conventions

## Framework

- **Runner:** Vitest (`npm test` = `vitest run`; `npm run test:watch` = `vitest`)
- **HTTP assertions:** Supertest
- **Database:** better-sqlite3 (synchronous, real SQLite — no mocking)

## Test strategy

Tests are split into two layers:

- **Unit tests** (`tests/unit/`) — fast, no-DB tests for exported pure functions (slugify, personHref, groupPlayerResults, serviceErrors).
- **Integration tests** (`tests/integration/`) — exercise real HTTP routes against a real SQLite database. No mocks — tests run against real code paths.

Tests can be written before, during, or after implementation — whenever they add the most value. The goal is meaningful coverage, not ceremony.

## Test data: use factories

Use the factory helpers in `tests/fixtures/factories.ts` to insert test data. Each factory accepts optional overrides and returns the inserted ID.

```typescript
import { insertEvent, insertMember, insertDiscipline } from '../fixtures/factories';

// Insert only what the test needs
const memberId = insertMember(db);
const eventId  = insertEvent(db, { status: 'draft', title: 'Secret Draft' });
const discId   = insertDiscipline(db, eventId, { name: 'Freestyle' });
```

Available factories: `insertMember`, `insertTag`, `insertEvent`, `insertDiscipline`, `insertResultsUpload`, `insertResultEntry`, `insertResultParticipant`, `insertHistoricalPerson`, `insertClub`, `insertLegacyClubCandidate`, `insertLegacyPersonClubAffiliation`.

Insert only the rows a given test suite needs. Do not assume rows from other test files exist. Keep seed data deterministic — no random values, no timestamps that vary between runs.

## Database isolation (integration tests)

Each test file sets `FOOTBAG_DB_PATH` to a unique temp path **before any module import**, so `db.ts` opens the test database. `beforeAll` builds the schema from `database/schema.sql` and inserts test data using factories. `afterAll` removes the temp DB and WAL sidecars.

New integration tests should use the shared helper in `tests/fixtures/testDb.ts`:

```typescript
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath, sessionSecret } = setTestEnv('3050');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { ... });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));
```

## File layout

```
tests/
  fixtures/
    factories.ts         ← test data factories (use these)
    testDb.ts            ← shared DB setup/teardown helper
  unit/
    *.test.ts            ← pure function tests (no DB, no HTTP)
  integration/
    *.routes.test.ts     ← route/controller integration tests
```

New unit tests go in `tests/unit/`. New integration tests go in `tests/integration/`. Name them `{domain}.routes.test.ts` or `{domain}.service.test.ts`.

## What to test

For every new route, good coverage includes:
- Happy path — correct HTTP status and expected content
- Auth gate — 302 redirect if unauthenticated, 200 if authenticated (for protected routes)
- Not-found / invalid input — 404 or 400 as appropriate
- Draft/unpublished content does not appear in public responses
- Route ordering — more-specific routes match before catch-alls

For every new service method (exercised through routes):
- Correct output shape for the page view-model
- Business rule enforcement (filters, sorts, eligibility checks)
- Edge cases from `docs/USER_STORIES.md` or `docs/SERVICE_CATALOG.md`

Adversarial tests are valuable: try to break your own feature before production does.

## Running tests

```bash
npm test              # run all tests once (unit + integration)
npm run test:unit     # unit tests only
npm run test:integration  # integration tests only
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
npm run build         # tsc type-check — must pass before any PR
```

## CI

On every push and PR, GitHub Actions runs three parallel jobs: type-check, unit tests, and integration tests. All three must pass. See `.github/workflows/ci.yml`.

Branch protection is configured on `main` (ruleset `protect-main`): requires `CI / Type-check and test` and `Terraform fmt / validate` to pass, branches must be up to date before merge.

## Coverage

Coverage is measured with `@vitest/coverage-v8` and configured in `vitest.config.ts`. Current thresholds: 95% statements/lines, 76% branches, 93% functions. Ratchet up as coverage improves. Target: 100%.

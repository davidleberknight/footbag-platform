# tests/ -- Testing conventions

Strategic frame (how to derive, layer, and verify tests) lives in `docs/TESTING.md`. This file is the operational conventions layer: tooling, factories, layout.

## Framework

- **Runner:** Vitest (`npm test` = `vitest run`; `npm run test:watch` = `vitest`)
- **HTTP assertions:** Supertest
- **Database:** better-sqlite3 (synchronous, real SQLite; no mocking)

## Test strategy

Tests are split into two layers:

- **Unit tests** (`tests/unit/`): fast, no-DB tests for exported pure functions (slugify, personHref, groupPlayerResults, serviceErrors).
- **Integration tests** (`tests/integration/`): exercise real HTTP routes against a real SQLite database. No mocks; tests run against real code paths.

When tests land, edge-case coverage, and anti-patterns are governed by `.claude/rules/testing.md` (operational mandate). Strategic framing lives in `docs/TESTING.md`.

## Test data: factories only

All test data is created through the factory helpers in `tests/fixtures/factories.ts`; a raw `INSERT` for table data in a test is forbidden (see the anti-pattern in `.claude/rules/testing.md`). Each factory accepts optional overrides and returns the inserted ID. If a table has no factory, add one rather than inlining the insert.

```typescript
import { insertEvent, insertMember, insertDiscipline } from '../fixtures/factories';

// Insert only what the test needs
const memberId = insertMember(db);
const eventId  = insertEvent(db, { status: 'draft', title: 'Secret Draft' });
const discId   = insertDiscipline(db, eventId, { name: 'Freestyle' });
```

Available factories: `insertMember`, `insertTag`, `insertEvent`, `insertDiscipline`, `insertResultsUpload`, `insertResultEntry`, `insertResultParticipant`, `insertHistoricalPerson`, `insertClub`, `insertLegacyClubCandidate`, `insertLegacyPersonClubAffiliation`.

Insert only the rows a given test suite needs. Do not assume rows from other test files exist. Keep seed data deterministic: no random values, no timestamps that vary between runs.

## Database isolation (integration tests)

Each test file sets `FOOTBAG_DB_PATH` to a unique temp path **before any module import**, so `db.ts` opens the test database. `beforeAll` builds the schema from `database/schema.sql` and inserts test data using factories. `afterAll` removes the temp DB and WAL sidecars.

Temp paths MUST live in `os.tmpdir()`, NOT `process.cwd()`. The shared `setTestEnv` helper uses the `footbag-test-` prefix correctly; rolling your own `path.join(process.cwd(), …)` is forbidden — worker timeouts / OOM / WAL races against `afterAll` leak files into the working tree.

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

## Running tests

```bash
npm test              # run all tests once (unit + integration)
npm run test:unit     # unit tests only
npm run test:integration  # integration tests only
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
npm run build         # tsc type-check; must pass before any PR
```

## CI

CI on every push and PR is defined in `.github/workflows/ci.yml`.

## Coverage

Measured with `@vitest/coverage-v8`. Thresholds are set in `vitest.config.ts` and ratchet up as coverage improves. Target: 100%.

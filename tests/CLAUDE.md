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

## Test data: factories only

All test data comes from the factory helpers in `tests/fixtures/factories.ts`. Each factory accepts optional overrides and returns the inserted ID.

```typescript
import { insertEvent, insertMember, insertDiscipline } from '../fixtures/factories';

// Insert only what the test needs
const memberId = insertMember(db);
const eventId  = insertEvent(db, { status: 'draft', title: 'Secret Draft' });
const discId   = insertDiscipline(db, eventId, { name: 'Freestyle' });
```

The factory inventory lives in `tests/fixtures/factories.ts` (native factories plus the `src/testkit/personaRowBuilders.ts` re-exports); read the export list there — any enumerated subset here would go stale.

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
    spawnGuard.ts        ← bound every synchronous spawn must carry
    awsIsolation.ts      ← credential isolation the shared setup applies, so no
                           test (or script it spawns) can reach live AWS
  unit/
    *.test.ts            ← pure-function tests (no DB, no HTTP)
  integration/
    *.test.ts            ← route/controller and service integration tests
  smoke/                 ← live-AWS adapter smoke; operator-run on staging (RUN_STAGING_SMOKE=1)
  e2e/                   ← Playwright browser tests against a local throwaway stack
  dev/                   ← development-only persona crawl (RUN_PERSONA_CRAWL=1)
  global-setup.ts, playwright.config.ts, setup-env.ts   ← shared harness
```

New unit tests go in `tests/unit/`. New integration tests go in `tests/integration/`. Name a route/controller suite `{domain}.routes.test.ts` and a service suite `{domain}.service.test.ts`; other integration suites use a `{domain}.{aspect}.test.ts` name that states the contract they verify (for example `security.login-timing.test.ts`, `dev-shortcuts.flag-off.test.ts`).

## Running tests

```bash
npm test                  # unit + integration (excludes smoke, e2e, dev)
npm run test:unit         # unit tests only
npm run test:integration  # integration tests only
npm run test:e2e          # Playwright browser suite against a local stack
npm run test:watch        # watch mode
npm run test:coverage     # with coverage report
npm run test:pre-pr       # build + conventions + npm test (run before a PR)
npm run test:all          # build + conventions + npm test + smoke + e2e
npm run build             # tsc type-check; must pass before any PR
./run_all_tests.sh        # full local safe suite; --with-smoke / --with-persona-crawl opt in to the staging-AWS and dev-crawl tiers
```

Targeted runners beyond these (`test:persona-crawl`, `test:e2e:smoke`, `test:e2e:a11y`, `test:pentest:heavy`) are listed in `package.json` and documented in `docs/TESTING.md`.

## CI

CI on every push and PR is defined in `.github/workflows/ci.yml`.

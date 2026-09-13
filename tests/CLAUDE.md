# tests/ -- Testing conventions

Strategic frame (how to derive, layer, and verify tests) lives in `docs/TESTING.md`; the mandate,
the edge-case lists and the anti-patterns live in `.claude/rules/testing.md`. This file is the
operational conventions layer: tooling, factories, layout.

## Layers

- **Unit** (`tests/unit/`): exported pure functions. No DB, no HTTP.
- **Integration** (`tests/integration/`): real HTTP routes through Supertest against a real SQLite
  file. No mocks and no mocked DB; tests run against real code paths.
- **Smoke** (`tests/smoke/`): live-AWS adapter probes, operator-run against staging.
- **Browser** (`tests/e2e/`): Playwright against a local throwaway stack.
- **Dev** (`tests/dev/`): the development-only persona crawl.

Vitest runs all of them. `npm test` is unit plus integration; the other three tiers are excluded
from it and each gates on its own environment variable.

## Test data: factories only

All test data comes from the factory helpers in `tests/fixtures/factories.ts` (native factories plus
the `src/testkit/personaRowBuilders.ts` re-exports). Each factory takes optional overrides and
returns the inserted id. Read the export list there; any inventory kept here would go stale.

## Database isolation

Each integration file owns its own temp database. `FOOTBAG_DB_PATH` must be set **before any module
import** or `db.ts` opens the wrong database. The shared helpers in `tests/fixtures/testDb.ts`
(`setTestEnv`, `createTestDb`, `importApp`, `cleanupTestDb`) do that in the right order and remove
the WAL sidecars afterwards; new integration tests use them rather than their own setup.

## Naming

A route or controller suite is `{domain}.routes.test.ts` and a service suite is
`{domain}.service.test.ts`. Other integration suites use `{domain}.{aspect}.test.ts`, naming the
contract they verify.

## Fixtures that cannot be regenerated

`tests/fixtures/freestyleDictionarySnapshot.json` is a point-in-time dump with no recorded
provenance and no regeneration command, read by nine suites, and it has drifted from the built
database. Do not infer the query and refresh it: that was tried, and the inferred version fails the
suites. The refresh belongs to the freestyle-dictionary maintainer, and the evidence sits on the
tracker card that owns stale generated-data fixtures.

# tests/ -- Testing conventions

The binding rules (mandate, edge cases, anti-patterns) are in `.claude/rules/testing.md`; the
procedure is the `write-tests` skill; strategy and rationale are in `docs/TESTING.md`. This file is
the layout: layers, fixtures, isolation, naming.

## Layers

- **Unit** (`tests/unit/`): exported pure functions. No DB, no HTTP.
- **Integration** (`tests/integration/`): real HTTP routes through Supertest against a real SQLite
  file, services, and operator scripts driven through their test seams. No mocked DB.
- **Smoke** (`tests/smoke/`): read-only live probes of staging wiring (`npm run test:smoke -- --target staging`, or the
  `--staging` rows of `./run_all_tests.sh` through the dev-tester role).
- **Browser** (`tests/e2e/`): Playwright against a local throwaway stack (`npm run test:e2e`).
- **Deployed browser check** (`tests/e2e/deployed/`): anonymous, submit-nothing page loads against
  staging or production (`npm run test:deployed -- --target <staging|production>`).
- **Dev** (`tests/dev/`): the real-claim crawl, which claims one real migrated record on a local dev
  stack and walks the surfaces that render it (`npm run test:persona-crawl`). It needs the
  authoritative local member load.

`npm test` is unit plus integration. Smoke and dev gate on their own environment variable
(`RUN_STAGING_SMOKE`, `RUN_PERSONA_CRAWL`); the two browser layers are separate Playwright configs.

## Test data: factories only

All test data comes from the factory helpers in `tests/fixtures/factories.ts` (native factories plus
the `src/testkit/personaRowBuilders.ts` re-exports). Each factory takes optional overrides and
returns the inserted id. Read the export list there; any inventory kept here would go stale.

`tests/fixtures/freestyleDictionarySnapshot.json` has no regeneration command. Do not infer a query
and refresh it; its refresh belongs to the freestyle-dictionary maintainer.

## Shared fixtures by purpose

Reach for these before writing a helper of your own; each file's header says when to use it.

- One response per page for a read-only suite: `cachedGet.ts`.
- A read path whose statement count must not grow with the rows (N+1): `queryCount.ts`.
- Every deployed route, for a cross-cutting sweep: `routeTable.ts`.
- Dates relative to now, for anything SQLite's clock compares: `clock.ts`.
- A route refusing a cross-origin state-changing request: `expectCsrfReject.ts`.
- The security flags on an issued session cookie: `assertSecureSessionCookie.ts`.
- A ledger table refusing update and delete: `assertAppendOnly.ts`.
- The row an action added, without trusting order: `rowPinning.ts`.

## Database isolation

Each integration file owns its own temp database. `FOOTBAG_DB_PATH` must be set **before any module
import** or `db.ts` opens the wrong database. The shared helpers in `tests/fixtures/testDb.ts`
(`setTestEnv`, `createTestDb`, `importApp`, `cleanupTestDb`) do that in the right order and remove
the WAL sidecars afterwards; new integration tests use them rather than their own setup.

## Naming

A route or controller suite is `{domain}.routes.test.ts`, a service suite is
`{domain}.service.test.ts`, and an operator-script suite is `<script>.script.test.ts`. Other
integration suites use `{domain}.{aspect}.test.ts`, naming the contract they verify.

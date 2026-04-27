# CLAUDE.md

## Purpose

Local rules for `src/db/` work.

## File boundaries

- `db.ts` is the prepared-statement module for the current implemented public-route baseline.
- `db.ts` owns:
  - calling `openDatabase()` to obtain the single connection at module load
  - prepared statement groups
  - transaction helper
  - minimal database readiness probe
- `openDatabase.ts` owns:
  - `new BetterSqlite3(...)` — the actual connection open
  - startup PRAGMAs only

## Statement laziness

`db.prepare()` is only ever called inside a getter or a function body, never at module top level. Statement-group properties are getters that compile their SQL on first access; dynamic-SQL helpers (`queryFilteredTeams`, `queryCandidateItems`, `queryCuratedItems`, `queryReviewItems`, etc.) build and prepare their SQL inside the function body. This decouples module load from schema readiness, so importing `src/db/db.ts` against a not-yet-migrated database does not fail at import time. SQL validation against the current schema is enforced by `tests/unit/db-lazy-prepare.test.ts`.

## Do not put this in `db.ts`

- request parsing
- business or page-use-case logic
- `eventKey` validation or parsing
- result grouping or view shaping
- full readiness composition
- repository, ORM, or query-builder abstractions

## Growth rule

When functionality grows, add explicit statement groups and small helpers instead of abstraction layers.

- Keep returned rows flat when possible; shape them above `db.ts`.

## Schema changes and tests

When adding or removing columns from tables that appear in `tests/fixtures/factories.ts`, update the relevant factory inserts to stay in sync with the schema. Failing to do so will cause tests to fail with SQLite column errors.

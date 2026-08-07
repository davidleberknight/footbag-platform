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

The getter-based lazy-compilation contract lives in `.claude/rules/db-layer.md`. File-local addition: dynamic-SQL helpers (`queryFilteredTeams`, `queryCandidateItems`, `queryCuratedItems`, `queryReviewItems`) build and prepare their SQL inside the function body, never at module top level.

## Do not put this in `db.ts`

The generic db-layer exclusions (no business or page-use-case logic, no result grouping or view shaping, no repository/ORM/query-builder abstractions) live in `.claude/rules/db-layer.md`. File-local additions here:

- request parsing
- `eventKey` validation or parsing
- full readiness composition

## Growth rule

When functionality grows, add explicit statement groups and small helpers instead of abstraction layers.

- Keep returned rows flat when possible; shape them above `db.ts`.

## Schema changes and tests

When adding or removing columns from tables that appear in `tests/fixtures/factories.ts`, update the relevant factory inserts to stay in sync with the schema. Failing to do so will cause tests to fail with SQLite column errors.

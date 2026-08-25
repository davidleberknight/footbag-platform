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

### Where a schema change lands

Before go-live: `database/schema.sql` alone. The whole database is replaced on every deploy, so the
schema is whatever that file says, and `database/migrations/` stays empty.

After go-live: both. `schema.sql` stays the cumulative truth every fresh build is made from, and a
migration file is the only way the change reaches the one database that is never rebuilt. Write one
without the other and production diverges from every other environment silently, with no boot-time
schema assertion to catch it; `tests/integration/schemaMigrations.parity.test.ts` is what does.

### Migrations are additive: expand and contract

A migration adds. It does not drop and it does not rename. Add a column in one release, read it in
the next, remove it in a third once nothing reads it.

This is not tidiness. The migrating deploy promotes the new code and images BEFORE it runs the
migration, and restoring the pre-migration database on failure does not put the old code back, so a
failed migration leaves the host running the new release against the old schema. An additive
migration makes that state serviceable rather than broken. The same property is what lets a restore
to a snapshot taken before the migration still serve traffic.

`scripts/ci/check_migrations_additive.sh` refuses a drop or a rename. A genuine contraction, once
that third release arrives, declares itself with a `-- CONTRACTION:` header line saying why nothing
reads it any more.

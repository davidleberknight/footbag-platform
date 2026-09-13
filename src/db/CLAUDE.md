# CLAUDE.md — src/db/

Local rules for `src/db/`. The layer's general contract (prepared-statement style, SQL
conventions, views, transactions, flat rows, no abstractions) is `.claude/rules/db-layer.md`;
only the file-local additions live here.

## File boundaries

- `db.ts` owns the single connection obtained from `openDatabase()` at module load, the prepared
  statement groups, the transaction helper, and the minimal database readiness probe.
- `openDatabase.ts` owns `new BetterSqlite3(...)` and the startup PRAGMAs, nothing else.

## File-local additions to the layer rule

- Dynamic-SQL helpers (`queryFilteredTeams`, `queryCandidateItems`, `queryCuratedItems`,
  `queryReviewItems`) build and prepare their SQL inside the function body, never at module top
  level, so the getter-based lazy-compilation contract still holds.
- Beyond the generic exclusions, `db.ts` never carries request parsing, `eventKey` validation or
  parsing, or full readiness composition.

## Schema changes and tests

When adding or removing columns from tables that appear in `tests/fixtures/factories.ts`, update
the relevant factory inserts in the same change; otherwise tests fail with SQLite column errors.

### Where a schema change lands

Before go-live: `database/schema.sql` alone. The whole database is replaced on every deploy, so the
schema is whatever that file says, and `database/migrations/` stays empty.

After go-live: both. `schema.sql` stays the cumulative truth every fresh build is made from, and a
migration file is the only way the change reaches the one database that is never rebuilt. Write one
without the other and production diverges from every other environment silently, with no boot-time
schema assertion to catch it; `tests/integration/schemaMigrations.parity.test.ts` is what does.

### Migrations are additive: expand and contract

A migration adds. It does not drop and it does not rename. Add a column in one release, read it in
the next, remove it in a third once nothing reads it. Additivity is what lets a restore to a
snapshot taken before the migration still serve traffic: the older schema carries everything the
older code asks of it.

The reverse direction needs its own guarantee. The migrating deploy promotes the new code and images
BEFORE it runs the migration, and restoring the pre-migration database on failure does not put the
old code back, so a failed migration leaves the host running the new release against the old schema.
Every migration's paired code must therefore run correctly against the pre-migration schema, checked
per migration: read the new column behind a guard, or keep the feature that needs it dark until the
migration has landed. Code that reads the new column unconditionally turns a working restore into a
broken site.

`scripts/ci/check_migrations_additive.sh` refuses a drop or a rename. A genuine contraction, once
that third release arrives, declares itself with a `-- CONTRACTION:` header line saying why nothing
reads it any more.

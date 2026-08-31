# Migrations

This directory holds the post-go-live migration chain, and it stays empty until go-live.

Before go-live, `../schema.sql` is the entire schema. Every database is built from that file and
the whole database is replaced on each deploy, so a schema change is an edit to `../schema.sql`
followed by a rebuild, and it reaches every environment that way. A migration file placed here in
that phase would be recorded as already applied by every fresh build and executed by nothing,
which is why `tests/integration/schemaMigrations.parity.test.ts` asserts this directory holds no
SQL and turns red the moment one lands.

After go-live, production is the one database that is never rebuilt, and a migration file becomes
the only way a schema change reaches it. Those files ship through `scripts/deploy-migrate.sh`,
which applies the migration and its ledger row in one transaction, checks integrity and foreign
keys, and restores the pre-migration copy on failure. Migrations are additive:
`scripts/ci/check_migrations_additive.sh` refuses a drop or a rename, and a genuine contraction
arrives as its own later release.

The rule and the reasoning behind it live in DATA_MODEL's `schema_migrations` entry and in
`../../src/db/CLAUDE.md`. A test that needs to exercise the migrating deploy before go-live
authors a throwaway migration outside this directory and hands it to the deploy by path.

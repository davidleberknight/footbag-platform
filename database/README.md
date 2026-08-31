# footbag-platform database

> Modernizing **footbag.org** under the auspices of the **International Footbag Players Association (IFPA)**.

This directory contains the schema, seed data, and the runtime database file.

- `schema.sql`: table definitions, and before go-live the entire schema
- `migrations/`: the post-go-live migration chain; see `migrations/README.md` for when a schema change lands there instead of in `schema.sql`
- `footbag.db`: runtime SQLite database file; not checked in, created by `bash scripts/reset-local-db.sh`

An explanation of the data model is in `../docs/DATA_MODEL.md`.
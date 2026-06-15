---
paths:
  - "src/db/**"
  - "src/services/**"
---

# DB layer rules

## Statement compilation

All SQL lives in `src/db/db.ts` as named prepared statements. Services call the named statements; controllers, templates, and other code never touch SQL directly. No `db.prepare()` calls outside `db.ts`; the convention gate at `scripts/ci/assert_conventions.sh` enforces this mechanically.

Prepared statements are declared as getter properties on statement-group objects:

    export const events = {
      get listUpcoming() { return db.prepare(`SELECT ... FROM events WHERE ...`); },
    };

Getters compile their SQL on first access, not at module load. Tests assert this in `tests/unit/db-lazy-prepare.test.ts`. The pattern decouples module load from schema readiness, so importing `src/db/db.ts` against a not-yet-migrated database does not fail at import time.

Statement-group objects are named after the domain or feature. A group whose statements exist only
to serve the internal QC subsystem carries the banner `// ---- QC-only (delete with pipeline-qc
subsystem) ----` so it is removed when that subsystem retires.

## SQL conventions

- Positional parameters with `?`; never named `:param`.
- Catch named SQLite error codes explicitly (`SQLITE_CONSTRAINT_UNIQUE`, `SQLITE_BUSY`, etc.); never silent-ignore.
- Timestamps use `strftime('%Y-%m-%dT%H:%M:%fZ','now')`, not `datetime('now')`. The space-separated form from `datetime('now')` breaks lexical ordering in views, triggers, and timestamp string comparisons.

## Views over bare tables

For multi-condition filters, define a SQL view and select from it. Services read from views, never `WHERE` on top of bare tables for filters the view already encodes. Common views:

- `members_active` -- `deleted_at IS NULL`.
- `members_searchable` -- `members_active` minus deceased, opted-out, PII-purged, unverified.
- `clubs_open` -- `status IN ('active','inactive')`; `clubs_all` adds archived (clubs use status-archive, no `deleted_at` column).
- `email_templates_enabled` -- `is_enabled = 1`.
- `recurring_donation_subscriptions_active` -- `status <> 'canceled'`; query the bare table only when canceled rows are needed.
- `member_tier_current`, `member_active_player_current`, `member_membership_status_current` -- authoritative tier / Active Player / combined-gate projections.
- `official_ifpa_roster_current` -- the only roster read surface (filters `is_official_roster_member = 1 AND is_deceased = 0`).
- `net_team_appearance_canonical` -- the only public Net appearance surface (filters `evidence_class = 'canonical_only'`; other evidence classes never reach public routes).
- `system_config_current` -- latest effective value per key (the bare `system_config` table is queried only by audit-style admin tooling).

`news_items` and `events` are hard-delete domains: query the base table directly; there is no `_all` alias.

## Transactions

Multi-write operations wrap in `transaction(() => { ... })`. All DB operations inside are synchronous; external I/O (S3, email, HTTP) happens BEFORE the transaction opens. `await` inside a `transaction()` callback is a runtime crash in better-sqlite3.

## Returned shapes

Statements return flat rows; service code shapes them. No business rules in `db.ts`. No repository, ORM, or query-builder abstractions.

## Schema metadata

Every mutable domain table carries `id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `version`, and (where applicable) `deleted_at`. Services stamp these on every write.
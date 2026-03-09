# CLAUDE.md

## Purpose
Local rules for `src/db/` work.

## File boundaries
- `db.ts` is the MVFP-scoped prepared-statement module for the current functionality slice.
- `db.ts` owns:
  - prepared statement groups
  - single connection use within this module set
  - transaction helper
  - minimal database readiness probe
- `openDatabase.ts` owns:
  - raw `better-sqlite3` connection bootstrap
  - startup PRAGMAs only

## Do not put this in `db.ts`
- request parsing
- business or page-use-case logic
- `eventKey` validation or parsing
- result grouping or view shaping
- full readiness composition
- repository, ORM, or query-builder abstractions

## Growth rule
- When this slice grows, add explicit statement groups and small helpers instead of abstraction layers.
- Keep returned rows flat when possible; shape them above `db.ts`.

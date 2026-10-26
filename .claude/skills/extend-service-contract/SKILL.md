---
name: extend-service-contract
description: Extend or adjust a service boundary in the current codebase. Use when the task changes service methods, service-owned shaping, db statement usage, or service-level error/contract behavior.
---

# Extend Service Contract

## When to use this skill

Use this skill (not general editing) when a task does any of the following:

- adds, removes, or renames a service method
- changes what a service method accepts (parameters) or returns (shape)
- adds, removes, or changes `db.ts` prepared statements used by a service
- changes which entity fields a service reads or writes
- changes service-level error codes or error semantics (`serviceErrors.ts`)
- moves business rules, authorization checks, or domain invariants in or out of a service
- changes a service's ownership boundary (e.g., what belongs to service A vs. service B)
- changes how a service shapes data for a page view-model

## Step 1: Load authoritative docs before touching code

0. Invoke the `design-intent` skill, then name the passage that governs each service method, field, statement, error code or invariant the change adds or alters. If no user story or design decision grounds it and the human has not directed it, stop and ask under `.claude/rules/asking.md`; do not add it.
1. **The maintainers' private tracker**: run the `tracker-ops` skill to confirm an open issue covers the service change. If the tracker is unwired, note it in one line and proceed with the human's instruction as given. Note any tracked deviations from target patterns.
2. **`docs/USER_STORIES.md`**: locate the relevant user story by feature name, then read only that story's success criteria.
3. **`docs/DATA_GOVERNANCE.md`**: when the service touches members, historical persons, search, contact fields, exports, stats, auth, or privacy boundaries, read the relevant section before proceeding.
4. **`docs/DESIGN_DECISIONS.md`** (targeted): check for invariants relevant to the change. Read the controller-to-service pattern decision, the data-access pattern decision, the soft-deletes decision, the immutable-audit-logs decision, the safe-to-submit-twice decision when a method changes state on a covered path, and any auth or security decisions the service touches.
5. **The affected service's file-header JSDoc** (`src/services/<name>.ts`): the authoritative service-layer contract. Read:
   - the ownership boundary (Owns / Does not own)
   - the required patterns the service must follow
   - the invariants and transaction discipline it preserves
   - the persistence and side-effect categories it produces
6. **Code, types, tests and `database/schema.sql`** show current shapes (signatures, return types, error class shape, columns, nullability, enums, keys, triggers). A disagreement with the owning JSDoc goes through the `design-intent` skill. Follow an existing pattern where one exists; with none, ask before introducing one.
7. **`docs/DATA_MODEL.md`**: understand entity relationships, soft-delete conventions (`deleted_at`), audit patterns, and data invariants the service-layer change must preserve.

## Step 2: Inspect current code

After reading docs:
- the relevant service file(s) in `src/services/`
- `src/db/db.ts`: the relevant statement groups
- `src/services/serviceErrors.ts` if error codes are touched
- the controller(s) that call the service
- nearby integration tests in `tests/integration/`

## Step 3: Architecture context

Path-scoped rule files in `.claude/rules/` govern the paths the change touches. For service-contract work these are typically `service-layer.md` (ownership, shape, errors, operational errors, audit log, rate limiting, discriminated-union returns and the submitted-twice repeat check, anti-enumeration, auth-conditional shaping, file-header JSDoc) and `db-layer.md` (named statements, views, transactions, SQL conventions). Read each touched path's rule yourself (the pre-writing-code gate in root `CLAUDE.md`); do not restate them in your plan.

Naming:
- Services: `{domain}Service.ts` -- camelCase, singular noun.
- Controllers: `{domain}Controller.ts` -- camelCase, singular noun. No `publicController` layer.

## Step 4: State your plan before editing

Before touching any file, state:
- the current contract (method signature, return shape, error codes)
- the proposed contract (what changes and why)
- which user story success criteria are being satisfied
- touched files: service, db.ts statement groups, serviceErrors.ts, tests
- any data invariants that must be preserved (transactions, soft-delete, audit trail)
- for a state-changing method on a path the submitted-twice rule covers: the repeat check that `.claude/rules/service-layer.md` ("Discriminated-union return shapes") requires
- risks and edge cases
- verification plan

## Step 5: Verification

- write the tests through the `write-tests` skill, which owns the layer choice, the case floor and the sweeps a new route already gets
- verify per the Verification default in root `CLAUDE.md`
- **audit the service's file-header JSDoc** (when it carries one) at the top of `src/services/<name>.ts`. If the change touches ownership, required patterns, invariants, transaction discipline, persistence tables, side-effect categories, or service shape, update the JSDoc block in the same change as the code. See `.claude/rules/service-layer.md` File-header JSDoc section for the update-obligation list.
- after changes, invoke `doc-sync` to check whether the service's file-header JSDoc or DATA_MODEL.md needs updating

## Stop when

The planned contract is implemented, every command that `bash scripts/test-targets.sh <changed paths>` prints has run and passed (the full gate stays with the maintainer, and any high-fan-out flag goes in the report), the file-header JSDoc matches the new contract, and doc-sync has run. Then report.

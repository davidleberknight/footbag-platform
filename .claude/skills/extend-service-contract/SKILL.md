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
1. The reading list in the `add-public-page` skill's Step 1 (tracker, story success criteria, data governance, owning service JSDoc, code, types, tests and schema, data model), read for the service rather than the page, with these additions:
2. **`docs/DESIGN_DECISIONS.md`** (targeted): the controller-to-service pattern, data-access pattern, soft-deletes and immutable-audit-logs decisions, the safe-to-submit-twice decision when a method changes state on a covered path, and any auth or security decisions the service touches.
3. **The affected service's file-header JSDoc**: its ownership boundary (Owns / Does not own), required patterns, invariants and transaction discipline, and persistence and side-effect categories. Current shapes include return types and error class shape.

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
- verify per the test-targets line in root `CLAUDE.md` (the full gate is the maintainer's: an ask rule in `.claude/settings.json`, per `.claude/rules/testing.md` "Scope of a verification run")
- **audit the service's file-header JSDoc** (when it carries one) at the top of `src/services/<name>.ts`. If the change touches ownership, required patterns, invariants, transaction discipline, persistence tables, side-effect categories, or service shape, update the JSDoc block in the same change as the code. See `.claude/rules/service-layer.md` File-header JSDoc section for the update-obligation list.
- after changes, invoke `doc-sync` to check whether the service's file-header JSDoc or DATA_MODEL.md needs updating

## Stop when

The planned contract is implemented, every command that `bash scripts/test-targets.sh <changed paths>` prints has run and passed (the full gate stays with the maintainer, and any high-fan-out flag goes in the report), the file-header JSDoc matches the new contract, and doc-sync has run. Then report.

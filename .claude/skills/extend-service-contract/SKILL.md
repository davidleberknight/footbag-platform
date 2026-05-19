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

Read only the section relevant to this task. For large documents, locate the section by heading or keyword before reading. Do not load entire files into context.

1. **The top active-slice/status block in `IMPLEMENTATION_PLAN.md`**: confirm the service change is in scope now. Note any current deviations from target patterns flagged here.
2. **`docs/USER_STORIES.md`**: locate the relevant user story by feature name, then read only that story's acceptance criteria.
3. **`docs/GOVERNANCE.md`**: when the service touches members, historical persons, search, contact fields, exports, stats, auth, or privacy boundaries, read the relevant section before proceeding.
4. **`docs/DESIGN_DECISIONS.md`** (targeted): check for invariants relevant to the change. Read the controller-to-service pattern decision, the data-access pattern decision, the soft-deletes decision, the immutable-audit-logs decision, and any auth or security decisions the service touches.
5. **`docs/SERVICE_CATALOG.md`**: target service-layer ownership and required patterns. Locate the entry for the affected service. Read:
   - the service's target ownership boundary (Owns / Does not own)
   - the required patterns the service must follow
   - method names live only in the service file (`src/services/<name>.ts`); SC §6 does not mirror them
   - the side-effects categories the service produces
6. **Code, types, tests, and `database/schema.sql`**: authoritative for current shapes (method signatures, return types, error class shape, exact column names, nullable vs required, enum values, FK relationships, indices, triggers). When current shapes disagree with target patterns in SC, that is a deviation tracked in `IMPLEMENTATION_PLAN.md`, not catalog drift. Always follow existing code patterns and naming conventions if similar features have already been implemented; if no good pattern exists, ask the human before introducing a new one.
7. **`docs/DATA_MODEL.md`**: understand entity relationships, soft-delete conventions (`deleted_at`), audit patterns, and data invariants the service-layer change must preserve.

## Step 2: Inspect current code

After reading docs:
- the relevant service file(s) in `src/services/`
- `src/db/db.ts`: the relevant statement groups
- `src/services/serviceErrors.ts` if error codes are touched
- the controller(s) that call the service
- nearby integration tests in `tests/integration/`

## Step 3: Architecture context

Path-scoped rule files in `.claude/rules/` auto-attach when Claude reads or edits files in their matching paths. For service-contract work this typically loads `service-layer.md` (ownership, shape, errors, discriminated-union returns, auth-conditional shaping, file-header JSDoc) and `db-layer.md` (named statements, views, transactions, SQL conventions). Trust those rules; do not restate them in your plan.

Naming:
- Services: `{domain}Service.ts` -- camelCase, singular noun.
- Controllers: `{domain}Controller.ts` -- camelCase, singular noun. No `publicController` layer.

## Step 4: State your plan before editing

Before touching any file, state:
- the current contract (method signature, return shape, error codes)
- the proposed contract (what changes and why)
- which user story acceptance criteria are being satisfied
- touched files: service, db.ts statement groups, serviceErrors.ts, tests
- any data invariants that must be preserved (transactions, soft-delete, audit trail)
- risks and edge cases
- verification plan

## Step 5: Verification

- write or update integration tests in `tests/integration/` using factory helpers from `tests/fixtures/factories.ts` (see `tests/CLAUDE.md` for conventions and `write-tests` skill for guidance)
- make excellent adversarial tests: edge cases, boundary values, invalid input, authorization bypass attempts, draft/deleted item leakage
- run `npm test` to confirm all tests pass
- run `npm run build` (`tsc -p tsconfig.json`) to confirm no type errors
- **audit the service's file-header JSDoc** at the top of `src/services/<name>.ts`. If the change touches ownership, required patterns, invariants, transaction discipline, persistence tables, side-effect categories, or service shape, update the JSDoc block in the same change as the code. See `.claude/rules/service-layer.md` File-header JSDoc section for the update-obligation list.
- after changes, invoke `doc-sync` to check whether SERVICE_CATALOG.md or DATA_MODEL.md needs updating

# CLAUDE.md — footbag-platform

## Project overview

Modernizing footbag.org for the International Footbag Players Association (IFPA).

**Start here:**
- `PROJECT_SUMMARY_CONCISE.md` for orientation and document routing, if required for task.
- `IMPLEMENTATION_PLAN.md` — for any non-trivial task, read the top active-slice/status block to confirm scope; for tasks primarily about sequencing, dependency ordering, or phased planning, read the full document in Plan Mode.

## Repo layout

```
.claude/      Skills, hooks, settings
.github/      CI and templates
database/     Schema and SQLite files
docker/       Build tooling
docs/         Project documentation
curated/      Raw curator-owned media (seed-time inputs to the curator pipeline)
ifpa/         Governance and official rules
legacy_data/  Mirror code and migration scripts
ops/systemd/  Production service units
scripts/      Operational scripts
src/          Application code (TypeScript/Express)
terraform/    AWS infrastructure
tests/        Integration tests
```

## Source-of-truth order for active work

Read the minimum the task requires. Default: active-slice block + code + path-scoped rules. Load broader docs only as needed.

1. Explicit human decisions in the current task
2. Active-slice block in `IMPLEMENTATION_PLAN.md` — current scope, out-of-scope, accepted shortcuts, known drift
3. Current code — implemented behavior; may contain accepted shortcuts; check the implementation plan's known deviation entries if drift is detected
4. Auto-attached layer (no explicit load needed): path-scoped `.claude/rules/*.md` files, file-header JSDoc on services, per-subtree `CLAUDE.md` files. Covers per-file rule detail for the path you are in.
5. When needed, targeted sections of:
   - `docs/USER_STORIES.md` — intended behavior
   - `docs/GOVERNANCE.md` — security, privacy, historical data policy
   - `docs/DATA_MODEL.md` — schema semantics; verify against `database/schema.sql`
   - `docs/VIEW_CATALOG.md` — public-rendering standard and sensitive-route rules; per-route detail is in path-scoped rules + JSDoc
   - `docs/SERVICE_CATALOG.md` — ownership matrix and non-negotiable invariants; per-service contract detail is in service JSDoc
6. `docs/DESIGN_DECISIONS.md` — long-term rationale; read when entering a new code area or when a pattern's reason is unclear

**Note:** `docs/GOVERNANCE.md` is mandatory before any change touching members, historical persons, search, auth, contact fields, exports, stats, or privacy boundaries.

## Non-negotiable rules

1. Never edit documentation, `.github/`, or `.claude/` files without explicit human approval.
2. Never take a destructive or risky action without explicit human approval. 
3. When asking the human a question, always provide context so the human can understand clearly. Ask one question at a time.
4. If unclear, escalate to the human. Never guess or silently choose among materially different interpretations.
5. Never add schema, service methods, or behavioral code without grounding in a user story, design decision, or explicit human direction in the current task. If no acceptance criteria or human approval exist for the behavior, stop and ask.

## Workflow rules

- Long-term docs describe design intent, not implementation status. See doc-sync skill for governance details.
- Plan Mode for sequencing / dependency / architecture work; otherwise the IP active-slice block is enough.
- Verification defaults: confirm what success looks like for the task, prefer route/integration verification first, and verify with `npm test` and `npm run build`.
- Do not use browser automation or MCP tools unless the human explicitly asks.
- Make surgical changes scoped to the current slice: no speculative abstraction, flexibility, or scope creep; no refactoring unrelated code, unnecessary formatting or comment changes. 
- Use the Explore sub-agent for broad codebase searches; use the Plan sub-agent for sequencing or architecture tasks. Both protect the main context window.
- Single Bash commands over compound pipelines (`cmd1 && cmd2`); compounds trigger per-component permission prompts.

## Skills

Available workflow skills and when to use them:

- **doc-sync** — mandatory after any change of significance to design, behavior, or requirements, unless the specific changes were explicitly pre-approved by the human.
- **add-public-page** — use when a task adds a new public route, a new top-level nav section, or changes an existing public controller, template, or route-level tests.
- **extend-service-contract** — use when a task changes a service method signature, return shape, db.ts statements, or service-level error semantics. Run this before add-public-page when a new service method is also needed.
- **write-tests** — use when adding or strengthening test coverage. New tests must never delete real data.
- **browser-qa** — use only when the human explicitly names a specific page or check to run (Playwrite has heavy token use). Never run unsolicited, never assume a broad test suite is wanted, minimize tool calls to what was asked.

When a task matches a skill's trigger condition, invoke that skill as the **first action** before reading any files or exploring the codebase.

Correct sequencing when skills compose: `extend-service-contract` → `add-public-page` → `write-tests` → `doc-sync` 

## Memory

Saving memory is a high-stakes action; apply `.claude/rules/memory.md` before any Write or Edit to the memory directory. Default = do not save.

## Hooks

Enforcement guardrails in `.claude/hooks/`. 



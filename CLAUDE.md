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
3. Current code — implemented behavior; may contain accepted shortcuts; check the implementation plan's known deviation entries if drift is detected. Current code is not necessarily correct, may have bugs or drift from canonical docs, so always ask the human if unsure.
4. Path-scoped layer (load it explicitly): the `.claude/rules/*.md` files, file-header JSDoc on services, and per-subtree `CLAUDE.md` files that match the paths the task will touch. These auto-attach when you Read or Edit an in-glob file, but auto-attach does not fire on grep/Bash or on reasoning about a path you have not opened, so Read the matching rules yourself before writing. Covers per-file rule detail for the path you are in.
5. When needed, targeted sections of:
  - `docs/USER_STORIES.md` — intended behavior, success criteria.
  - `docs/DATA_MODEL.md` — schema semantics; verify against `database/schema.sql`
  - `docs/TESTING.md` — how to derive, layer, and verify tests for any surface; mandatory before writing or extending tests
6. `docs/DESIGN_DECISIONS.md` — long-term rationale; read when entering a new code area, or to understand the design details about a technical topic in the code; do not read unless you have a good reason, to save tokens.

**Note:** `docs/DATA_GOVERNANCE.md` is mandatory before any change touching members, historical persons, search, auth, contact fields, exports, stats, or privacy boundaries.

## Non-negotiable rules

1. Never edit documentation, `.github/`, or `.claude/` files without explicit human approval.
2. Never take a destructive or risky action without explicit human approval.
3. When asking the human a question, always provide full context so the human can understand clearly. Always ask exactly one excellent question at a time with one recommended answer based on deep analysis (not a guess). One-at-a-time covers questions in prose, not just formal prompts: a trailing "open questions" or "decisions for you" list with two or more asks is the same violation. Before sending any message, scan it for "?" and if it puts more than one decision to the human, cut to the single most important and defer the rest. Every question must be self-contained: spell out the choice in plain words with enough context to decide, and never reference internal shorthand, finding IDs, codes, or prior-message labels the human has not been given. The recommended answer must be researched from the project's canonical docs and code and grounded in project facts and design intent, never guessed; if you have not verified it, research it before asking. When options carry meaningful trade-offs, give the pros and cons of each. Ask in prose with the context and recommendation in the message itself; do not use the multiple-choice tool (AskUserQuestion) as the default way to ask, since it carries no recommendation and strips context. Use it only when the human explicitly asks to pick from options.
4. If unclear, escalate to the human. Never guess or silently choose among materially different interpretations. If you can see two or more interpretations for a task, then name them clearly, stop and ask. Push back when you should.
5. Never add schema, service methods, or behavioral code without grounding in a user story, design decision, or explicit human direction in the current task. If no acceptance criteria or human approval exist for the behavior, stop and ask. Think before coding; do not assume or add unscoped features, and strive for simplicity over complexity; this requires analysis before jumping in. Prefer surgical changes over sweeping edits.
6. Code comments and human-readable text in code follow `.claude/rules/comments.md` (plain-words self-contained WHY; no sprint/slice/phase labels, dates, caller refs, or doc references; deviations use "Current:"/"Target:" and are recorded in `IMPLEMENTATION_PLAN.md`).
7. Do not change public UI wording unless instructed explicitly (no silent editing).
8. **Pre-writing-code gate.** The skills and path-scoped rules that match the task MUST always be loaded before you write or edit code. In order: (a) invoke the matching skill as the first action; (b) enumerate every path the change will touch; (c) Read each path's `.claude/rules/*.md` and per-subtree `CLAUDE.md` yourself; (d) only then write. Do not rely on auto-attach: it fires only on Read/Edit of an in-glob file, not on grep/Bash or on reasoning about an unopened path. If you have only grepped a path, its rule is not loaded, so Read it.

## Workflow rules

- Long-term docs describe design intent, not implementation status. See doc-sync skill for governance details.
- Plan Mode for sequencing / dependency / architecture work; otherwise the IP active-slice block is enough.
- In plan mode, ask and resolve clarifying questions (one at a time per Non-negotiable rule 3) and exhaust all material doubt before finalizing the plan and calling ExitPlanMode. Follow-on clarifying questions during implementation, after the plan is approved, are acceptable; the bar is to resolve everything needed to finalize the plan, not to forbid all later questions.

Verification defaults: confirm what success looks like for the task, prefer route/integration verification first, and verify with `npm test` and `npm run build`.  If the user asks to "run all tests" consider  ./run_all_tests.sh

- Do not use browser automation or MCP tools unless the human explicitly asks.
- Make surgical changes scoped to the current slice: no speculative abstraction, flexibility, or scope creep; no refactoring unrelated code, unnecessary formatting or comment changes. 
- Use the Explore sub-agent for broad codebase searches; use the Plan sub-agent for sequencing or architecture tasks. Both protect the main context window.
- For read-only exploration prefer the Grep/Glob/Read tools; they never require permission. Read-only Bash inspection, including pipelines and loops, is permitted and should not prompt. Reserve the single-command preference for state-changing commands, where each subcommand is approved separately.
- Edit files only through the Edit/Write tools; never `sed -i`, `perl -i`, in-place `awk`, `tee`, or shell redirection to write a file. Those bypass the diff preview and are permission-gated. Bash is for read-only inspection and running commands, not editing files.

## Skills

Skills auto-load: each `.claude/skills/<name>/SKILL.md` description is in context at session start, and Claude invokes a skill when a task matches it. This section does not re-list skills (that would drift from the SKILL.md files); it records only the rules a one-line description can't carry.

- When a task matches a skill's trigger, invoke it as the **first action**, before reading files or exploring.
- Skills do not replace the path-scoped `.claude/rules/*.md`. A skill tells you *what* to do; the rule whose `paths:` glob matches the file you are about to touch tells you *how*. Before editing any file, Read its governing rule yourself and comply with it; do not assume auto-attach has loaded it (grep/Bash and reasoning about an unopened path do not trigger it). When a skill's workflow will touch `src/controllers/**`, `src/views/**`, `src/public/css/**`, `tests/**`, `src/adapters/**`, `src/db/**`, or `src/services/**`, confirm the matching rule is in context before writing, not after.
- **Compose in this order** when skills stack: `extend-service-contract` → `add-public-page` → `write-tests` → `doc-sync`.
- `doc-sync` is **mandatory** after any change of significance to design, behavior, or requirements, unless the human pre-approved the specific changes.
- `browser-qa` runs **only** when the human names a specific page or check (heavy token use); never unsolicited, never as a broad suite.

## Memory

Saving memory is a high-stakes action; apply `.claude/rules/memory.md` before any Write or Edit to the memory directory. Default = do not save.

## Hooks

Enforcement guardrails in `.claude/hooks/`. 
# CLAUDE.md — footbag-platform

## Project overview

Modernizing footbag.org for the International Footbag Players Association (IFPA).

**Start here:**

- `PROJECT_SUMMARY_CONCISE.md` : for orientation and document routing, if required for task.
- The maintainers' private tracker : for active work, known bugs, open questions, and accepted deviations from the canonical documented design. Read it with `gh issue list -R "$FOOTBAG_PRIVATE_REPO"` (the `tracker-ops` skill; wiring in "Companion repositories" below).

## Repo layout

```
.claude/      Skills, hooks, settings
.github/      CI and templates
database/     Schema and SQLite files
docker/       Build tooling
docs/         Project documentation
curated/      Raw curator-owned media (seed-time inputs to the curator pipeline)
ifpa/         Governance and official rules
legacy_data/  Data migration scripts (Python / bash) from the legacy system
ops/systemd/  Production service units
scripts/      Operational scripts
src/          Application code (TypeScript / Express)
terraform/    AWS infrastructure
tests/        Integration tests
```



## Companion repositories

Two optional gitignored repo-root symlinks, canonical names on every machine: `footbag_legacy_repo` (the legacy webmaster's clone; read-only, Edit/Write denied) and `footbag_private_repo` (the maintainers' operations checkout; Claude drafts, a human commits). The maintainers' private tracker (GitHub Issues on that private repository) is the sole authority for active work; read it with `gh issue list -R "$FOOTBAG_PRIVATE_REPO"` (env var set in the gitignored `.claude/settings.local.json`). Committed text never carries the private repository's identity. Absent wiring is a supported configuration: name the wiring step in one line, then skip that part. All tracker and private-checkout work follows the `tracker-ops` skill.

## Authority order and read order

Two different orders, do not conflate them. Both live only here; rules, skills, `PROJECT_SUMMARY_CONCISE.md`, and agents link here and never restate either.

### Authority order : who wins when sources conflict

1. An explicit human decision in the current task.
2. The IFPA governing documents (`ifpa/*`) for membership rules, tiers, voting eligibility, and published-rules content. `docs/USER_STORIES.md` defers to them.
3. Clear design intent: `docs/DESIGN_DECISIONS.md`, `docs/USER_STORIES.md`, `docs/DATA_MODEL:.md`, the path-scoped `.claude/rules/*`, and service file-header JSDoc. `docs/DATA_GOVERNANCE.md` is mandatory before any change touching members, historical persons, search, auth, contact fields, exports, stats, or privacy.
4. Current code, `database/schema.sql`, and infrastructure : authoritative for *implemented behavior* only, never for design intent.

The maintainers' private tracker (see "Companion repositories") tracks current scope and records known deviations from the canonical design. Prefer design intent over code in general; but when code conflicts with design intent and no tracked deviation explains it, do not silently pick a side or guess, always stop and ask the human. It may be a code bug, a stale doc, or an untracked deliberate deviation, and only the human decides.

### Read order : what to load first, to save tokens (not an authority ranking)

Read the minimum the task requires. Default: the open tracker issues (when wired; see "Companion repositories"), then current code, then the path-scoped layer : the `.claude/rules/*.md` files, service file-header JSDoc, and per-subtree `CLAUDE.md` files as needed. Load targeted sections of the broader docs only as the task needs them:`docs/USER_STORIES.md` (intended behavior, success criteria), `docs/DATA_MODEL.md` (schema semantics; verify against `database/schema.sql`), `docs/TESTING.md` (before writing tests), and `docs/DESIGN_DECISIONS.md` (technical requirements and rationale) last.

## Non-negotiable rules

1. Never edit documentation, `.github/`, or `.claude/` files without explicit human approval. This explicitly includes `.claude/settings.local.json`: never write to it (Edit or Write) without the human's direct go-ahead, even though it is gitignored and machine-local. The human's always-allow clicks are its only routine writer; Claude proposes the change and the human applies it.
2. Never take a destructive or risky action without explicit human approval. 
3. **Asking the human is the last resort, not the first move.** Resolve every answer through the authority order before asking; if analysis makes it certain, do not ask. Code is reality, not authority for design intent: clear design intent (`docs/DESIGN_DECISIONS.md`, `docs/USER_STORIES.md`, `docs/DATA_MODEL.md`, the path-scoped rules and service contracts) outranks current code. When a question genuinely survives: **exactly one decision per message**, in **plain self-contained English** with no internal references the human was not given (section numbers, gate/finding codes, prior-message labels; a finding ID in a file the human is reading, is fine paired with its title), **full context inline**, and **one recommended answer derived from design intent and verified against the docs and code, never guessed** (pros and cons when the trade-offs are real). Ask in prose; reserve the multiple-choice tool (AskUserQuestion) for when the human asks to pick. Read-only investigation needs no permission. A bare "y" / "go" from the human takes the recommended answer. Full standard: `.claude/rules/asking.md`.
4. If unclear, escalate to the human. Never guess or silently choose among materially different interpretations. If you can see two or more interpretations for a task, then name them clearly, stop and ask. Push back when you should.
5. Never add schema, service methods, or behavioral code without grounding in a user story, design decision, or explicit human direction in the current task. If no acceptance criteria or human approval exist for the behavior, stop and ask. Think before coding; do not assume or add unscoped features, and strive for simplicity over complexity; this requires analysis before jumping in. Prefer surgical changes over sweeping edits.
6. Code comments and human-readable text in code follow `.claude/rules/comments.md` (plain-words self-contained WHY; no sprint/slice/phase labels, dates, caller refs, or doc references; deviations use "Current:"/"Target:" and are recorded as private-tracker issues).
7. Do not change public UI wording unless instructed explicitly (no silent editing).
8. **Pre-writing-code gate.** The skills and path-scoped rules that match the task MUST always be loaded before you write or edit code. In order: (a) invoke the matching skill as the first action; (b) enumerate every path the change will touch; (c) Read each path's `.claude/rules/*.md` and per-subtree `CLAUDE.md` yourself; (d) only then write. Do not rely on auto-attach: it fires only on Read/Edit of an in-glob file, not on grep/Bash or on reasoning about an unopened path. If you have only grepped a path, its rule is not loaded, so Read it.



## Workflow rules

- Long-term docs describe design intent, not implementation status. See doc-sync skill for governance details.
- Plan Mode for sequencing / dependency / architecture work.
- In plan mode, ask and resolve clarifying questions (one question at a time, see .claude/rules/asking.md) and exhaust all material doubt before finalizing the plan and calling ExitPlanMode. Follow-on clarifying questions during implementation, after the plan is approved, are acceptable; the bar is to resolve everything needed to finalize the plan.

Verification defaults: confirm what success looks like for the task, prefer route/integration verification first, and verify with `npm test` and `npm run build`.  If the user asks to "run all tests" consider  ./run_all_tests.sh  Doc-only or comment-only changes are verified by re-reading, not `npm test`/`npm run build`.

- Lightweight Playwright browser-driving (navigate, snapshot, click, type, fill, read console/network) is routine. Screenshot capture is the heavy mode and, like the `browser-qa` skill, runs only when the human asks for a specific page or check. Browser JavaScript execution and other MCP tools: only when the human explicitly asks.
- You may research github but never add commit nor push.
- No emojis in your output and avoid em-dash in prose.
- Make surgical changes scoped to the current slice: no speculative abstraction, flexibility, or scope creep; no refactoring unrelated code, unnecessary formatting or comment changes. 
- Use the Explore sub-agent for broad codebase searches; use the Plan sub-agent for sequencing or architecture tasks. Both protect the main context window.
- For read-only exploration prefer the Grep/Glob/Read tools; they never require permission. Read-only Bash inspection, including pipelines and loops, is permitted and should not prompt. Reserve the single-command preference for state-changing commands, where each subcommand is approved separately. Never lead a Bash command with `cd` unless another directory is truly required: the working directory already persists at the repo root, so `cd` is redundant, and a leading `cd` plus any output redirect (even `2>/dev/null`) trips a built-in approval prompt no repo rule can suppress. Use absolute paths, or a tool's own directory flag (`git -C`, `find <dir>`, `make -C`) when needed — give the flag a literal in-project path (repo root, a path under it, or a companion symlink like `footbag_private_repo`), never a shell variable or out-of-tree path, which the read-only approver cannot auto-approve.
- For the same job prefer the tool that runs without a prompt over the one that gates: WebFetch (domain-scoped) over `curl` to fetch content, and `cut` / `grep -oE` / `jq` / `sed` (to stdout) over `awk` for text processing. `curl` (except a loopback `-o /dev/null` probe) and `awk` prompt because each can act beyond a pure read (network egress; an in-program `print > file` write); reach for them only when the substitute genuinely cannot do the job.
- Edit files only through the Edit/Write tools; never `sed -i`, `perl -i`, in-place `awk`, `tee`, or shell redirection to write a file. Those bypass the diff preview and are permission-gated. Bash is for read-only inspection and running commands, not editing files.



## Skills

Skills auto-load: each `.claude/skills/<name>/SKILL.md` description is in context at session start, and Claude invokes a skill when a task matches it. This section does not re-list skills (that would drift from the SKILL.md files); it records only the rules a one-line description can't carry.

- When a task matches a skill's trigger, invoke it as the **first action**, before reading files or exploring.
- Skills do not replace the path-scoped `.claude/rules/*.md`. A skill tells you *what* to do; the rule whose `paths:` glob matches the file you are about to touch tells you *how*. Before editing any file, Read its governing rule yourself and comply with it; do not assume auto-attach has loaded it (grep/Bash and reasoning about an unopened path do not trigger it). 
- **Compose in this order** when skills stack: `extend-service-contract` → `add-public-page` → `write-tests` → `doc-sync`.
- `doc-sync` is **mandatory** after any change of significance to design, behavior, or requirements.
- `browser-qa` runs **only** when the human names a specific page or check (heavy token use); never unsolicited, never as a broad suite.



## Memory

Saving memory is a high-stakes action; apply `.claude/rules/memory.md` before any Write or Edit to the memory directory. Default = do not save.

## Hooks

Enforcement guardrails in `.claude/hooks/`. 
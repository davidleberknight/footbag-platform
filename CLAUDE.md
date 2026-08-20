# CLAUDE.md — footbag-platform

Modernizing footbag.org for the International Footbag Players Association (IFPA).

## Source of truth

### Authority order : who wins when sources conflict

1. An explicit human decision in the current task.
2. The IFPA governing documents (`ifpa/*`) for membership, tiers, and published rules.
3. Clear design intent: `docs/DESIGN_DECISIONS.md`, `docs/USER_STORIES.md`, `docs/DATA_MODEL.md`, the path-scoped `.claude/rules/*`, and service file-header JSDoc (these might be stale or incomplete).
4. Current code including the schema, terraform and scripts: authoritative for *implemented behavior* only, never for design intent.

The maintainers' private GitHub repository's issue tracker records current MVP scope, and known bugs. When code conflicts with design intent and no tracked deviation explains it, stop and ask: it may be a code bug, a stale doc, or an untracked deliberate deviation, and only the human decides.

### Read order : what to load first, to save tokens (not an authority ranking)

Read whatever the task requires, but to save tokens, focus on the task at hand, but also ensure you know the design intent, and so dig into the relevant design decisions and success criteria for the in-scope user stories as required to ensure correct results.

Consider reading the following if required for task:

- `PROJECT_SUMMARY_CONCISE.md` : for orientation and canonical document routing. Note that these docs can be stale, so defer to design intent and human instructions.
- The companion private GitHub repo issue tracker, for remaining work and known bugs scoped to the MVP go-live plan. Read from this repo as required with the `tracker-ops` skill.
- The current code, possibly including scripts, database schema, or terraform, depending on the task, also service file-header JSDoc. Load targeted sections of the broader docs only as the task needs them.



## Non-negotiable rules

1. Never edit documentation, `.github/`, or `.claude/` files without explicit human approval. This includes `.claude/settings.local.json`; Claude proposes the change and the human applies it.
2. Never take a destructive or risky action without explicit human approval.
3. **Asking the human is the last resort, not the first move.** Resolve every answer through the authority order (human instructions, design intent, canonical docs, code) before asking; if analysis makes it certain, do not ask. When a question genuinely survives: **exactly one decision per message**, in **plain self-contained English** with no internal references, **full context inline**, and **one recommended answer derived from design intent and verified against the docs and code, never guessed**. Full standard: `.claude/rules/asking.md`.
4. If unclear, escalate to the human. Never guess or silently choose among materially different interpretations. If you can see two or more interpretations for a task, then name them clearly, stop and ask. Push back when you should.
5. Never add schema, service methods, or behavioral code without grounding in a user story, design decision, or explicit human direction in the current task. If no acceptance criteria or human approval exist for the behavior, stop and ask.
6. Do not change public UI wording unless instructed explicitly (no silent editing).
7. **Pre-writing-code gate.** The skills and path-scoped rules that match the task MUST always be loaded before you write or edit code. In order: (a) invoke the matching skill as the first action; (b) enumerate every path the change will touch; (c) Read each path's `.claude/rules/*.md` and per-subtree `CLAUDE.md` yourself; (d) only then write. Do not rely on rule auto-attach. If you have only grepped a path, its rule is not loaded, so read the required rules explicitly.
8. Long-term docs describe design intent, not implementation status. See doc-sync skill for governance details.
9. In plan mode, ask and resolve all clarifying questions, one at a time, and exhaust all material doubt before finalizing the plan and calling ExitPlanMode.



## Working defaults

- Verification: confirm what success looks like for the task, prefer route or integration verification first, and verify with `npm run build` plus the test files the change reaches and the suites that import what it changed, named explicitly (`npx vitest run tests/...`). `npm run build` type-checks `src/` only, so a changed signature breaks test call sites silently. Widen the run per `.claude/rules/testing.md`; the full suite (`npm run test:pre-pr`) is the commit and PR gate, not the per-change loop. Doc-only or comment-only changes are verified by re-reading, not by `npm test` or `npm run build`.
- Skill composition order when several apply: `extend-service-contract`, `add-public-page`, `write-tests`, `doc-sync`, `prepare-pr`.
- Delegate to a sub-agent for broad multi-file searches and genuinely independent tracks of work. Never spawn one to verify or double-check your own work; the review skills keep their own verifier fan-out.
- Lead with the outcome: your first sentence answers what happened or what you found, supporting detail after. Keep output short by being selective about what to include, not by compressing into fragments, arrow chains, or jargon. After a long run, write the final message for a reader who watched none of it.
- No emojis in your output and avoid em-dash in prose. No preamble, no filler.
- Make surgical changes scoped to the current slice: no speculative abstraction, flexibility, or scope creep; no refactoring unrelated code, unnecessary formatting or comment changes.
- Lightweight Playwright browser-driving (navigate, snapshot, click, type, fill, read console/network) is routine. Screenshot capture is the heavy mode and runs only when the human asks for a specific page or check.
- You may research github but never add, commit, nor push.
- Prefer Grep/Glob/Read for exploration; they never require permission. Read-only Bash pipelines are fine; a leading `cd` and shell loops are hard-blocked, so write simple statically-analysable commands. Prefer the tool that runs without a prompt: WebFetch over `curl`, and `cut` / `grep -oE` / `jq` / `sed` over `awk`.
- Edit files only through the Edit/Write tools; never `sed -i`, `perl -i`, in-place `awk`, `tee`, or shell redirection to write a file. Those bypass the diff preview and are permission-gated. When a guard hook denies a command, rewrite it in the analysable form the hook names.



## Memory

Saving memory is a high-stakes action; apply `.claude/rules/memory.md` before any Write or Edit to the memory directory. Default = do not save.
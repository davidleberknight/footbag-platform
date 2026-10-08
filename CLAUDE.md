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
3. **Asking the human is the last resort, not the first move.** When and how to ask: `.claude/rules/asking.md`.
4. If unclear, escalate to the human. Never guess or silently choose among materially different interpretations. If you can see two or more interpretations for a task, then name them clearly, stop and ask. Push back when you should.
5. Never add schema, service methods, or behavioral code without grounding in a user story, design decision, or explicit human direction in the current task. If no acceptance criteria or human approval exist for the behavior, stop and ask.
6. Do not change public UI wording unless instructed explicitly (no silent editing).
7. **Pre-design gate.** Before proposing or recommending an approach (an identity model, a layout, a boundary, a data shape, a new surface), or before explaining why something is built as it is, read the governing passage: `docs/USER_STORIES.md` for behaviour, `docs/DESIGN_DECISIONS.md` for technical design. Grep the topic, read what you find, and say which passage governs or that none does. A summary in the conversation is not the passage, and the code is not the design. Where the design already rules, that ruling outranks both your analysis and the current code; if you think it is wrong, say so plainly rather than proposing around it.
8. **Pre-writing-code gate.** The skills and path-scoped rules that match the task MUST always be loaded before you write or edit code. In order: (a) invoke the matching skill as the first action; (b) enumerate every path the change will touch; (c) Read each path's `.claude/rules/*.md` and per-subtree `CLAUDE.md` yourself; (d) only then write. Do not rely on rule auto-attach. If you have only grepped a path, its rule is not loaded, so read the required rules explicitly.
9. Long-term docs describe design intent, not implementation status. See doc-sync skill for governance details.
10. In plan mode, ask and resolve all clarifying questions, one at a time, and exhaust all material doubt before finalizing the plan and calling ExitPlanMode.
11. **Never apply to AWS except via an approved, tested script** in `scripts/`, consistent with long-term design intent. Cleanup, preconditions, confirmation and verification belong in the script, on a trap, not in an operator's head. No hand-typed applies. Writing the script IS the change. Reads exempt.



## Working defaults

- Verification: define success first, then run `bash scripts/test-targets.sh <changed paths>` and exactly the commands it prints (the change's own tests, their importers, the one extra check its kind needs), and show each command with its result. Doc- or comment-only changes are verified by re-reading. The full gate (`./run_all_tests.sh` in any mode, `npm test`, and the whole unit, integration or coverage tier) is the maintainer's: start it only when the maintainer asks for it in this session, as a background job logging to the scratchpad, then report its closing summary. Never run it per change, to double-check a targeted run, or again with no code changed since the last run; where the helper notes a high-fan-out change or a full-gate-only check, say so in the report instead. A plan's or handover's verification step names the maintainer as the one who runs the full gate.
- Skill composition order when several apply: `extend-service-contract`, `add-public-page`, `write-tests`, `doc-sync`, `prepare-pr`.
- Delegate to a sub-agent for broad multi-file searches and genuinely independent tracks of work. Never spawn one to verify or double-check your own work; the review skills keep their own verifier fan-out, and `write-tests` keeps its scoped test-strength reviewer for high-risk areas and for tests guarding destructive, irreversible or outward-facing actions.
- Lead with the outcome: your first sentence answers what happened or what you found, supporting detail after. Keep output short by being selective about what to include, not by compressing into fragments, arrow chains, or jargon. After a long run, write the final message for a reader who watched none of it.
- No emojis in your output and avoid em-dash in prose. No preamble, no filler.
- Give the human commands that survive a paste. Break long lines yourself with a trailing `\`, nothing after it, each line under 80 characters; a long argument goes in a variable first. A terminal-chosen break lands after a pipe or inside a quoted string, and the second half then runs as its own command. Flag a command that cannot go through the `!` prefix, which pipes, so anything minting or prompting for a credential refuses for want of a terminal.
- Make surgical changes scoped to the current slice: no speculative abstraction, flexibility, or scope creep; no refactoring unrelated code, unnecessary formatting or comment changes.
- Lightweight Playwright browser-driving (navigate, snapshot, click, type, fill, read console/network) is routine. Screenshot capture is the heavy mode and runs only when the human asks for a specific page or check.
- You may research github but never add, commit, nor push. Committing is the human's, on their own schedule: never remind them to commit, and never make any step wait on a commit.
- Prefer Grep/Glob/Read for exploration; they never require permission. Read-only Bash pipelines are fine; a leading `cd` and shell loops are hard-blocked, so write simple statically-analysable commands. Prefer the tool that runs without a prompt: WebFetch over `curl`, and `cut` / `grep -oE` / `jq` / `sed` over `awk`.
- Edit files only through the Edit/Write tools; never `sed -i`, `perl -i`, in-place `awk`, `tee`, or shell redirection to write a file. Those bypass the diff preview and are permission-gated. When a guard hook denies a command, rewrite it in the analysable form the hook names.



## Memory

Saving memory is a high-stakes action; apply `.claude/rules/memory.md` before any Write or Edit to the memory directory. Default = do not save.
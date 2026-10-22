# CLAUDE.md: footbag-platform

Modernizing footbag.org for the International Footbag Players Association (IFPA).

## Source of truth

### Authority order : who wins when sources conflict

1. An explicit human decision in the current task.
2. The IFPA governing documents (`ifpa/*`) for membership, tiers, and published rules.
3. Clear design intent, as recorded in `docs/USER_STORIES.md`, `docs/DESIGN_DECISIONS.md`, `docs/DATA_MODEL.md`, the `.claude/rules/*` and service file-header JSDoc. These records can be stale or incomplete; what design intent is and when it is clear: the `design-intent` skill.
4. Current code, including the schema, Terraform and scripts: evidence of implemented behavior only, never of design intent.

A gap that a private-tracker issue records is a known deviation. When the code, a document and the intent disagree otherwise, resolve it from the intent down and report it as settled, citing the passages; ask the human only when it stays genuinely unclear, recommending the answer the intent supports, with why.

### Read order : what to load first, to save tokens (not an authority ranking)

Read only what the task needs, starting with the requirement passages the pre-design gate names.

- `PROJECT_SUMMARY_CONCISE.md`: orientation and routing to the canonical documents.
- The maintainers' private tracker (`tracker-ops` skill): current MVP scope, tracked deviations and known bugs.
- The code, schema, scripts or Terraform the task touches, and the owning service's file-header JSDoc.

## Non-negotiable rules

1. Never edit documentation, `.github/`, or `.claude/` files without explicit human approval, given and shown as `.claude/rules/asking.md` sets out. This includes `.claude/settings.local.json`; Claude proposes the change and the human applies it.
2. Never take a destructive or risky action without explicit human approval.
3. Asking the human is the last resort, not the first move. When and how to ask, including when two interpretations survive: `.claude/rules/asking.md`.
4. Do not change public UI wording unless instructed explicitly (no silent editing).
5. **Pre-design gate.** In plan mode, and whenever deciding what to build or how, or explaining why something is built as it is, load the `design-intent` skill and read the governing passage first: the success criteria in `docs/USER_STORIES.md` for functional requirements, `docs/DESIGN_DECISIONS.md` for technical and non-functional ones. Grep the topic, read what you find, and say which passage governs or that none does. A summary in the conversation is not the passage. Where the design clearly rules, it outranks your analysis and the code; if you think it is wrong or stale, say so plainly rather than proposing around it. Never add schema, service methods, or behavioral code that no user story, design decision, or explicit human direction grounds; when none does, ask.
6. **Pre-writing-code gate.** The skills and path-scoped rules that match the task must always be loaded before you write or edit code. In order: (a) invoke the matching skill as the first action; (b) enumerate every path the change will touch; (c) Read each path's `.claude/rules/*.md` and per-subtree `CLAUDE.md` yourself; (d) only then write. Grepping a path does not load its rule.
7. IMPORTANT: in plan mode, ask every open question one at a time per the asking rule, and never call ExitPlanMode while any question is unanswered or a subagent whose result bears on the plan is still running; work that does not depend on it may continue meanwhile. The plan lists each discrepancy settled from the intent, with the passages that settle it, and carries no open-questions section.
8. Never apply to AWS except via an approved, tested script in `scripts/`, consistent with long-term design intent. Cleanup, preconditions, confirmation and verification belong in the script, on a trap, not in an operator's head. No hand-typed applies. Writing the script IS the change. Reads exempt.

## Working defaults

- Verification: define success first, then run `bash scripts/test-targets.sh <changed paths>` and exactly the commands it prints, showing each command with its result; re-read doc- or comment-only changes instead. The full gate (`./run_all_tests.sh` in any mode, `npm test`, any whole unit, integration or coverage tier) is the maintainer's: run it only when the maintainer asks in this session, in the background logging to the scratchpad, and report its closing summary. Where the helper flags a high-fan-out change or a full-gate-only check, say so in the report. A plan's or handover's verification step names the maintainer as the one who runs the full gate.
- Skill composition order when several apply: `extend-service-contract`, `add-public-page`, `write-tests`, `doc-sync`, `prepare-pr`.
- Delegate broad multi-file searches and genuinely independent tracks of work to a subagent, but never spawn one to verify your own work; the review skills and `write-tests` keep the reviewers they name.
- Lead with the outcome, then supporting detail. Keep output short by selecting, not by compressing into fragments, arrow chains, or jargon; after a long run, write for a reader who watched none of it. No emojis, no em-dashes in prose, no preamble or filler.
- Give the human commands that survive a paste: break long lines yourself with a trailing `\` and nothing after it, each line under 80 characters, a long argument in a variable first. Flag a command that cannot go through the `!` prefix, which pipes, so anything prompting for a credential fails there. Never leave a teardown for them to remember: one command runs start to cleanup, on a trap.
- Make surgical changes scoped to the current slice: no speculative abstraction, scope creep, or unrelated refactoring or reformatting.
- Lightweight Playwright browser-driving is routine; a visible change is done only once driven through its pages. Screenshot capture runs only when the human asks for a specific page or check.
- Git writes are the human's: never add, commit or push, never remind them to commit, and never make a step wait on a commit.
- Write nothing transient into this repository: audits and analysis stay in the conversation, scratch goes to the session scratchpad, and a handover, plan, or gitignored file carrying personal data goes to the private operations checkout, gitignored there. A machine-local file goes in its documented home, or ask; never invent a location.
- Write simple, statically analysable read-only Bash: no leading `cd` and no shell loops (both are hook-blocked). Prefer WebFetch over `curl`, and `cut` / `grep -oE` / `jq` / `sed` over `awk`.
- Edit files only through the Edit/Write tools; never `sed -i`, `perl -i`, in-place `awk`, `tee`, or shell redirection. When a guard hook denies a command, rewrite it in the form the hook names.

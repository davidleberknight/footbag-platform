# CLAUDE.md: footbag-platform

Modernizing footbag.org for the International Footbag Players Association (IFPA).

## Source of truth

### Authority order : who wins when sources conflict

1. An explicit human decision in the current task.
2. The IFPA governing documents (`ifpa/*`) for membership, tiers, and published rules.
3. Clear design intent, as recorded in `docs/USER_STORIES.md`, `docs/BACKGROUND_JOBS.md`, `docs/DESIGN_DECISIONS.md`, `docs/DATA_MODEL.md`, the `.claude/rules/*` and service file-header JSDoc. These records can be stale or incomplete; what design intent is and when it is clear: the `design-intent` skill.
4. Current code, including the schema, Terraform and scripts: evidence of implemented behavior only, never of design intent.

A gap that a private-tracker issue records is a known deviation; any other disagreement follows `.claude/rules/asking.md`.

### Read order : what to load first, to save tokens (not an authority ranking)

- `PROJECT_SUMMARY_CONCISE.md`: orientation and routing to the canonical documents.
- The maintainers' private tracker (`tracker-ops` skill): open work, tracked deviations and known bugs.
- The code, schema, scripts or Terraform the task touches, and the owning service's file-header JSDoc.

## Non-negotiable rules

1. Never edit documentation, `.github/` or `.claude/` files without human approval as `.claude/rules/asking.md` sets out. `.claude/settings.local.json` is the human's to apply; propose the change.
2. Change user-facing wording, in any medium, only with the human's approval of the literal text (a message or an approved plan showing it) or a session pre-approval of UI wording, and never silently.
3. **Pre-design gate.** In plan mode, and whenever deciding what to build or how, or explaining why something is built as it is, load the `design-intent` skill and read the governing passage first: the success criteria in `docs/USER_STORIES.md` for functional requirements (`docs/BACKGROUND_JOBS.md` for a background job), `docs/DESIGN_DECISIONS.md` for technical and non-functional ones. Say which passage governs or that none does. Where the design clearly rules, it outranks your analysis and the code; if it looks wrong or stale, say so rather than proposing around it. Never add schema, service methods or behavioral code that no user story, design decision or human direction grounds; ask.
4. **Pre-writing-code gate.** Before you write or edit code, invoke the matching skill and Read each touched path's `.claude/rules/*.md` and per-subtree `CLAUDE.md` yourself (grepping does not load a rule).
5. IMPORTANT: in plan mode, never call ExitPlanMode while a question is unanswered or a subagent whose result bears on the plan is still running. The plan opens with what done means: the success criteria it meets and how each is verified. It lists each discrepancy settled from the intent, with the passages, and has no open-questions section. Every plan's last step is the per-change doc sync (the `doc-sync` skill).
6. Never give the human a state-changing command to type against AWS, a host or their workstation. Name the script in `scripts/` that owns the change, with its flags; if none does, write a tested one that owns preconditions, confirmation, verification and cleanup. Reads exempt.

## Working defaults

- Verify with `bash scripts/test-targets.sh <changed paths>`: run exactly the commands it prints; for a change that only swaps visible text, only its VITEST line.
- Skill composition order when several apply: `extend-service-contract`, `add-public-page`, `write-tests`, `doc-sync`, `prepare-pr`.
- No em-dashes in prose. The final message stands alone: everything the human must read, approve or act on is in it, never only in text shown mid-turn.
- Before handing back, check the work against the plan's definition of done and audit for loose ends.
- Git and GitHub work, anything already filed for later, and the human's own discretionary calls are never `Not done:` items.
- A command handed to the human survives a paste: lines under 80 characters, broken with a trailing `\`. Flag one that cannot run through the `!` prefix (it pipes, so a credential prompt fails).
- A visible change is done only once driven through its pages.
- When a file you are working on changed in a way you did not make, message the other local sessions (`ListAgents`, `SendMessage`) to find which one made it and agree who owns the file before you go on.
- Write nothing transient into this repository: audits and analysis stay in the conversation, scratch goes to the session scratchpad, and a handover, plan or personal-data file goes to the private operations checkout, gitignored there.
---
paths:
  - ".claude/**"
  - "**/CLAUDE.md"
  - "PROJECT_SUMMARY_CONCISE.md"
  - "docs/CLAUDE_CODE_GUIDE.md"
---

# Claude Code harness governance

How to change the harness itself (`CLAUDE.md`, `.claude/rules/*`, `.claude/skills/*`, `.claude/hooks/*`, `.claude/agents/*`, `.claude/settings.json`). The harness is production code: treat a change to it with the same rigor as a code change.

## Changing the harness

- Plan Mode first for any non-trivial harness change; state the evidence (what's broken or missing) before proposing the edit.
- Every harness edit needs explicit human approval, shown as literal before/after. Hooks and settings changes are security-sensitive — never land them silently.
- New or changed hooks ship with a fixture test; new deterministic rules ship with (or note) the CI check that enforces them (`scripts/ci/assert_claude_harness.sh`).
- Run `doc-sync` after a change that alters documented behavior.
- Audit the instruction files periodically, and whenever Claude follows a stale or conflicting instruction: `/doctor prompt-audit` reports instructions written for older models, references to files or commands that no longer exist, and files that contradict each other. It changes nothing itself; each finding is applied under this rule like any other harness edit.
- Keep `docs/CLAUDE_CODE_GUIDE.md` in sync in the same change. That guide is the human-facing explanation of how this harness works, and the config files it describes stay the source of truth; so any harness change that alters behavior the guide covers (the permission policy, a hook's decision surface, the read-only approver, the layer and subagent model, or change control) updates the guide as part of the same change rather than letting it drift stale.

## Source-of-truth order has one home

The authority order and the read order live only in root `CLAUDE.md`. Rules, skills, `PROJECT_SUMMARY_CONCISE.md`, and agents link to it; none restate it. A second copy drifts.

## Team-portability

`.claude/` is committed and must work identically on every platform (Linux/macOS/Windows/WSL2). Platform-specific approval-reduction (sandbox blocks, OS-specific hooks, path shims) is a per-developer opt-in in each developer's user-scope `~/.claude/settings.json`, never in the repo's `.claude/settings.json`. Permission rules cannot carry conditionals anyway.

## Permission safety (`settings.json`)

- Precedence is deny > ask > allow. Keep the committed `settings.json` pretty-printed and reviewable.
- No broad wildcard allow on a destructive or network command head; the only automatic allows on state-changing commands are a short, reviewed list of development conveniences (mkdir, kill/pkill for dev-server lifecycle, npm run build, the test type-check, targeted `npx vitest run` and a browser run naming its spec files (`npm run test:e2e -- tests/e2e/<name>.spec.ts`), the whole-site layout check `npm run test:rendered-style`, git fetch, the reviewed repo check scripts such as `assert_claude_harness.sh` and `assert_conventions.sh`) and the four issue writes (edit, comment, close, reopen) on the private tracker and on the private bug-intake repository, each an exact prefix carrying that repository's flag. Claude Code checks each part of a compound command against the rules. A rule matches the command text Claude writes, so it catches only the spelling it names: a mutating flag in another position or spelling (`curl -X POST`, `--request POST`) and the same program called another way (`/usr/bin/curl`, `sh -c '...'`) slip past it, which is what the guard hooks are for. Route network reads through domain-scoped `WebFetch(domain:…)` allows, not `curl` and not `WebFetch(domain:*)` (that means all domains). Automatic approval of `sqlite3` requires a read-only open (the `-readonly` flag or the `file:...?mode=ro` URI spelling) and runs through the read-only approver hook, which also refuses the shell-exec and file-write dot-command escapes, rather than a static SQLite allow. Every full-suite or whole-tier test command (the runner, `npm test`, `test:quick`, `test:unit`, `test:integration`, `test:coverage`, and the whole browser tier `npm run test:e2e`) sits in `ask`, because the full gate is the maintainer's decision.
- Prefer the read-only auto-approve hook plus narrow, exact allows over blanket interpreter allows (`Bash(python*)`, `Bash(node*)`, `Bash(npx*)` are effectively `Bash(*)`).
- A new destructive command is guarded by a `permissions.ask`/`deny` entry, not only a hook — project permissions inherit into subagents and are the version-proof floor; `settings.json` hooks fire inside a subagent too, but the permission rule is the guarantee that does not depend on the client version (see Subagent safety below). Reserve hooks for guards that a static rule cannot express (a `curl -X POST` flag anywhere in the args, a whole-tier test run named by a glob), and back each hook with whatever exact ask or deny entries can express part of it.
- Auto mode is the usual starting mode. In it, ask rules and a hook's "ask" still prompt, allow rules that grant arbitrary code execution are dropped, and the classifier reviews the rest; so the ask list, not the allow list, is the guarantee in every mode. Writes under `.claude/` are protected paths that no allow rule pre-approves.

## Subagent safety

Project `permissions.*` rules inherit into subagents; this inheritance is the guaranteed, version-proof floor, so mirror every statically-expressible guard into `permissions.deny`/`ask`. Current Claude Code also fires `settings.json` PreToolUse hooks for a subagent's tool calls, and a PreToolUse hook declared in an agent's own `.claude/agents/*.md` frontmatter fires for that agent's calls too, alongside the inherited permission rules — so the guard chain and the read-only approver reach every context: the main thread, a built-in Task agent (`Explore`, `general-purpose`, `Plan`), and a custom agent alike. The permission floor stays the guarantee and the hooks are defense-in-depth on top of it (a project agent's frontmatter hooks are skipped until the folder is trusted): the custom agent that has `Bash` (the `auditor`) still declares the full Bash guard chain and the read-only approver in its frontmatter, so it is protected even on a client that does not fire settings hooks in subagents; an agent with no `Bash`/`Edit`/`Write` (the `researcher`) declares none because it has nothing to guard. The read-only approver is kept self-sufficient (it refuses any write- or exec-capable form itself, not by leaning on a sibling guard) so it is safe as the lone approver. A phantom permission prompt for a safe command inside a subagent is a config gap — diagnose it, never silently approve. Read-only subagents keep read-only tools and a non-mutating posture.

When a custom agent gains or loses `Bash`, keep its frontmatter `hooks:` block in sync with the `settings.json` Bash chain; the harness self-check (`scripts/ci/assert_claude_harness.sh`) diffs the two and fails CI on drift, and also fails on a frontmatter hook path that does not resolve to an executable file.

## Skill authoring (`.claude/skills/**`)

- A specific description (what it does and when to use it), key use case first and kept short: it loads into every session's context and the listing cuts `description` plus `when_to_use` at 1,536 characters. An explicit trigger and an explicit stop condition. Keep the body lean too; once loaded it stays in context every turn.
- Skills in this repo never set `allowed-tools`: the field grants the listed tools without a prompt for the turn the skill runs in, and restricts nothing. A skill that needs more permission gets a reviewed `settings.json` entry instead.
- `disable-model-invocation: true` for any explicit-only or side-effect-heavy skill, so it never auto-fires and its description leaves always-loaded context.
- `user-invocable: false` for a skill that is background method rather than a command (`deployed-surface`): Claude still sees its description, and it offers no slash command.
- Keep `SKILL.md` under ~500 lines; move long reference material into plain supporting files in the skill's folder (these are reference files, not skills — no frontmatter, no command).
- Link the authority order; never restate it. No dated implementation status in a skill body — that belongs in the maintainers' private tracker.

## Hook authoring (`.claude/hooks/**`)

- Emit valid PreToolUse JSON (`hookSpecificOutput.permissionDecision` of allow, deny or ask; `defer` is ignored in interactive sessions), or exit 0 with no output to leave the call to the normal flow, which approves nothing. When hooks disagree, deny beats ask beats allow, and a hook's allow never overrides a deny or ask rule.
- Choose the failure mode deliberately: security gates fail closed; informational checks fail open. A hook that times out lets the call through to the normal flow, so a gate must decide fast and fail closed inside the script.
- Prefer exec-form over interpolating untrusted strings into a shell; review each guard for bypass via command/process substitution, redirection, pipes, `xargs`, quoting, multiline input, compound commands (judge each subcommand on its own), and globs.
- Every hook has a fixture test (pipe a synthetic event on stdin) and is wired in `settings.json`. Policy changes need human approval.

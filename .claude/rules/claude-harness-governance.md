---
paths:
  - ".claude/**"
  - "CLAUDE.md"
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

## Source-of-truth order has one home

The authority order and the read order live only in root `CLAUDE.md`. Rules, skills, `PROJECT_SUMMARY_CONCISE.md`, and agents link to it; none restate it. A second copy drifts.

## Team-portability

`.claude/` is committed and must work identically on every platform (Linux/macOS/Windows/WSL2). Platform-specific approval-reduction (sandbox blocks, OS-specific hooks, path shims) is a per-developer opt-in in each developer's user-scope `~/.claude/settings.json`, never in the repo's `.claude/settings.json`. Permission rules cannot carry conditionals anyway.

## Permission safety (`settings.json`)

- Precedence is deny > ask > allow. Keep the committed `settings.json` pretty-printed and reviewable.
- No broad wildcard allow on a destructive or network command head; the only automatic allows on state-changing commands are a short, reviewed list of development conveniences (mkdir, kill/pkill for dev-server lifecycle, npm test / npm run build, git fetch). Claude Code checks each part of a compound command against the rules, but a rule sees only the command prefix — a mutating flag later in the arguments (`find … -delete`, `curl -X POST`) is invisible to it, which is what the guard hooks are for. Route network reads through domain-scoped `WebFetch(domain:…)` allows, not `curl` and not `WebFetch(domain:*)` (that means all domains). Automatic approval of `sqlite3` requires `-readonly` and runs through the read-only approver hook, which also refuses the shell-exec and file-write dot-command escapes, rather than a static SQLite allow.
- Prefer the read-only auto-approve hook plus narrow, exact allows over blanket interpreter allows (`Bash(python*)`, `Bash(node*)`, `Bash(npx*)` are effectively `Bash(*)`).
- A new destructive command is guarded by a `permissions.ask`/`deny` entry, not only a hook — project permissions inherit into subagents and are the version-proof floor; `settings.json` hooks now fire inside a subagent too, but the permission rule is the guarantee that does not depend on the client version (see Subagent safety below). Reserve hooks for guards that a static rule cannot express (a positional `find -delete`, a `curl -X POST` flag anywhere in the args).

## Subagent safety

Project `permissions.*` rules inherit into subagents; this inheritance is the guaranteed, version-proof floor, so mirror every statically-expressible guard into `permissions.deny`/`ask`. Current Claude Code also fires `settings.json` PreToolUse hooks for a subagent's tool calls, and a PreToolUse hook declared in an agent's own `.claude/agents/*.md` frontmatter fires for that agent's calls too, alongside the inherited permission rules — so the guard chain and the read-only approver reach every context: the main thread, a built-in Task agent (`Explore`, `general-purpose`, `Plan`), and a custom agent alike. Because hook-firing inside subagents has varied across client versions, the permission floor stays the guarantee and the hooks are defense-in-depth on top of it: the custom agent that has `Bash` (the `auditor`) still declares the full Bash guard chain and the read-only approver in its frontmatter, so it is protected even on a client that does not fire settings hooks in subagents; an agent with no `Bash`/`Edit`/`Write` (the `researcher`) declares none because it has nothing to guard. The read-only approver is kept self-sufficient (it refuses any write- or exec-capable form itself, not by leaning on a sibling guard) so it is safe as the lone approver. A phantom permission prompt for a safe command inside a subagent is a config gap — diagnose it, never silently approve. Read-only subagents keep read-only tools and a non-mutating posture.

When a custom agent gains or loses `Bash`, keep its frontmatter `hooks:` block in sync with the `settings.json` Bash chain; the harness self-check does not diff the two, so it is a manual review point.

## Skill authoring (`.claude/skills/**`)

- A specific description (what it does and when to use it), kept short — it loads into every session's context; an explicit trigger and an explicit stop condition.
- `allowed-tools` only restricts what a skill may use; it never widens permissions or bypasses prompts. A skill that needs more permission gets a reviewed `settings.json` entry, never a frontmatter grant.
- `disable-model-invocation: true` for any explicit-only or side-effect-heavy skill, so it never auto-fires and its description leaves always-loaded context.
- Keep `SKILL.md` under ~500 lines; move long reference material into plain supporting files in the skill's folder (these are reference files, not skills — no frontmatter, no command).
- Link the authority order; never restate it. No dated implementation status in a skill body — that belongs in `IMPLEMENTATION_PLAN.md`.

## Hook authoring (`.claude/hooks/**`)

- Emit valid PreToolUse JSON (`hookSpecificOutput.permissionDecision` of allow/deny/ask), or exit 0 to defer to the normal flow.
- Choose the failure mode deliberately: security gates fail closed; informational checks fail open.
- Prefer exec-form over interpolating untrusted strings into a shell; review each guard for bypass via command/process substitution, redirection, pipes, `xargs`, quoting, and multiline input.
- Every hook has a fixture test (pipe a synthetic event on stdin) and is wired in `settings.json`. Policy changes need human approval.

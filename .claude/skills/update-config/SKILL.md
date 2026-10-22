---
name: update-config
description: Change this repo's Claude Code harness: root and nested CLAUDE.md files, settings.json, hooks, permissions, env vars, MCP servers, rules, skills and agents. Use before any such edit, or when asked to review or audit the harness against current Claude Code docs.
---

# update-config (footbag-platform)

A harness change is reviewed like code. Follow `.claude/rules/claude-harness-governance.md` (it auto-loads on `.claude/**` and `CLAUDE.md` edits; if you have only grepped a path, Read it): Plan Mode first for anything non-trivial, literal before/after with explicit human approval, a statically-expressible guard in `permissions.deny`/`ask` with hooks as defense-in-depth, a fixture test for every new or changed hook, and a note of the CI check for every new deterministic rule (`scripts/ci/assert_claude_harness.sh`). Update `docs/CLAUDE_CODE_GUIDE.md` in the same change whenever the edit alters behavior it describes.

## Instruction text

Every line of a CLAUDE.md, rule or skill costs context and adherence. Before adding or keeping one:

- Apply the removal test: would removing this cause Claude to make mistakes? If not, cut it. Do not restate default good practice.
- Keep the root `CLAUDE.md` under 200 lines and to facts needed in every session; never cut the maintainer's stated intent from it without a ruling. A procedure goes in a skill; guidance for one area goes in a path-scoped rule (`paths:` frontmatter), which loads only when a matching file is read or edited. A rule without `paths:` loads every session.
- Never restate what a hook, a permission rule, a skill or an always-loaded rule already enforces or states; point to it, or say nothing.
- Put a point-of-use instruction in the output of the script or tool it governs (as `scripts/test-targets.sh` prints how to run its command), not in an always-loaded file.
- Make anything that must hold every time a hook, not an instruction; instructions are advisory.
- Read-only commands are allowed generally; no instruction asks permission for a read. Screenshots and other heavy browser-tool reads are the exception and run only on request.
- Emphasis (IMPORTANT, MUST) on at most one line Claude keeps skipping.
- No history, incident stories or dated narration; state the rule in force.
- A subagent does not see CLAUDE.md: a rule it must follow goes in its prompt or its agent file.

## Harness review (on request)

Compare the harness with current Anthropic guidance; edit nothing. The maintainer may first run `/doctor prompt-audit` for stale or conflicting instruction text. Fetch the official pages: memory (CLAUDE.md and rules), best practices, settings, permissions, permission modes, hooks, skills, subagents and the tools reference. Act on a documented mechanic or a stated best practice, quoted with its URL; ignore version notes and anything not on a fetched page. Audit every instruction file against the standard above, and the guide against the config. Report KEEP, REVISE or ADD with literal before and after text, then follow the governance rule for any change.

## Stop when

The approved edit is applied, any guide sync it required is done, any new hook or deterministic rule has its fixture test or CI check, and the harness self-check passes. A review stops at its report.

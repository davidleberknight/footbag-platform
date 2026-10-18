---
name: update-config
description: Change this repo's Claude Code harness config (settings.json, hooks, permissions, env vars, MCP servers, rules and skills). Use before any such edit, or when asked to review the harness against current Claude Code docs. Adds this project's mandatory harness governance and guide-sync on top of the general Claude Code config-editing mechanics.
---

# update-config (footbag-platform)

Changing harness config in this repo is a harness change, not a routine edit. The general Claude Code config mechanics still apply (settings file locations and precedence, permission-rule syntax, hook event/matcher/output schema, the verification flow), but before touching any config file you MUST also honor the two project sources below.

## Governance (the "how")

Follow `.claude/rules/claude-harness-governance.md`: Plan Mode first for any non-trivial change; every edit shown as literal before/after with explicit human approval; a statically-expressible guard lives in `permissions.deny`/`ask` (the version-proof floor) with hooks as defense-in-depth; every new or changed hook ships with a fixture test; new deterministic rules note their CI check (`scripts/ci/assert_claude_harness.sh`). The rule auto-attaches on `.claude/**` edits; if you have only grepped a path, Read it.

## Guide sync

Update `docs/CLAUDE_CODE_GUIDE.md` in the same change whenever the edit alters behavior it describes; the governance rule lists what that covers.

## Harness review (explicit request only)

Compare the harness with current Anthropic docs; edit nothing. The maintainer may first run `/doctor prompt-audit` for stale or conflicting instruction text. Then fetch the official pages for settings, permissions, permission modes, hooks, skills and subagents, and check only the mechanics the governance rule relies on: rule precedence, hook decision values and how they combine with rules, whether hooks fire in subagents, and skill frontmatter meaning. Churn filter: act only on a documented mechanic quoted with its URL; ignore tips, version notes, plan or default-mode details, and anything not on a fetched page. Report KEEP, REVISE or ADD with literal before and after text, then follow the governance rule for any change.

## Stop when

The approved config edit is applied, any guide/rule sync it required is done, and any new hook or deterministic rule has its fixture test or CI check in place. A harness review stops at its report.

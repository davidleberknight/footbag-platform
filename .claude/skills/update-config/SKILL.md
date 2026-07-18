---
name: update-config
description: Change this repo's Claude Code harness config (settings.json, hooks, permissions, env vars, MCP servers). Use before any such edit. Adds this project's mandatory harness governance and guide-sync on top of the general Claude Code config-editing mechanics.
---

# update-config (footbag-platform)

Changing harness config in this repo is a harness change, not a routine edit. The general Claude Code config mechanics still apply (settings file locations and precedence, permission-rule syntax, hook event/matcher/output schema, the verification flow), but before touching any config file you MUST also honor the two project sources below.

## Governance (the "how")

Follow `.claude/rules/claude-harness-governance.md`: Plan Mode first for any non-trivial change; every edit shown as literal before/after with explicit human approval; a statically-expressible guard lives in `permissions.deny`/`ask` (the version-proof floor) with hooks as defense-in-depth; every new or changed hook ships with a fixture test; new deterministic rules note their CI check (`scripts/ci/assert_claude_harness.sh`). The rule auto-attaches on `.claude/**` edits; if you have only grepped a path, Read it.

## Guide sync

Keep `docs/CLAUDE_CODE_GUIDE.md` in sync in the same change whenever the edit alters behavior it describes: the permission policy, a hook's decision surface, the read-only approver, the layer/subagent model, or change control. The config files stay the source of truth; the guide is the human-facing explanation and must not drift.

## Stop when

The approved config edit is applied, any guide/rule sync it required is done, and any new hook or deterministic rule has its fixture test or CI check in place.

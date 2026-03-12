#!/usr/bin/env bash
# block-git-commit.sh
# git add: ask for confirmation first
# git commit, git push: hard block, never allowed
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

if printf '%s' "$COMMAND" | grep -qE 'git\s+(commit|push)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "HARD BLOCK: Claude must never run git commit or git push. The human owns all commits."
    }
  }'
  exit 0
fi

if printf '%s' "$COMMAND" | grep -qE 'git\s+add'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Claude wants to run git add. Approve?"
    }
  }'
  exit 0
fi

exit 0

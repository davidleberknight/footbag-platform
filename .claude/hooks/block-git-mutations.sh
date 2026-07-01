#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+(add|commit|push|pull)([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "HARD BLOCK: Claude must never run git add, git commit, git push, or git pull. The human owns all staging, commits, and upstream syncs."
    }
  }'
  exit 0
fi

#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

# find running a command per match — -exec/-execdir and the interactive -ok/-okdir
# variants all run an arbitrary command, so all are hard-denied per the "no find
# -exec" rule. Use Glob/Grep/Read, find -delete, or xargs instead.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])find([[:space:]].*)?[[:space:]]-(exec|ok)(dir)?([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "HARD BLOCK: find -exec/-execdir/-ok/-okdir is banned. Use Glob/Grep/Read, find -delete, or xargs instead."
    }
  }'
  exit 0
fi

#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

# Match only command position (start, or after a separator, optionally via a
# bash/sh/env/VAR= prefix) so a read-only mention of the verb in an echo/grep
# argument does not prompt; a real destructive git invocation always sits here.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|`({]|&&|\|\|)[[:space:]]*git[[:space:]]+(reset[[:space:]]+--hard|clean[[:space:]].*-[a-zA-Z]*f|checkout[[:space:]]+--|restore([[:space:]]|$)|branch[[:space:]]+-D)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Potentially destructive git command detected. Confirm before discarding work."
    }
  }'
  exit 0
fi

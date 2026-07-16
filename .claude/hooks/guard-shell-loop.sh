#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

# A hand-rolled shell loop (while/for/until ... do) in a Bash command is never needed
# here: read-only research goes through the Grep/Read tools or a simple pipeline, edits
# go through Edit/Write, and a real multi-step operation runs through a tool's own flags
# or a committed script. A loop also makes the whole command un-analyzable, so it trips
# the built-in "cannot be statically analyzed" approval prompt instead of auto-approving.
# Deny a real loop so it is rewritten. The match requires a loop keyword at command
# position (the start, or after a ; & | or an opening subshell paren) AND a `do` keyword,
# so a for/while/until that appears only as an argument or inside quotes (grep -w for,
# echo "a; while b") is not mistaken for a loop. A loop buried inside a committed script
# is invisible here (the command names the script, not the loop) and is unaffected.
FLAT="$(printf '%s' "$COMMAND" | tr '\n' ' ')"
if printf '%s' "$FLAT" | grep -Eq '(^|[;&|(])[[:space:]]*(while|until|for)[[:space:]]' \
   && printf '%s' "$FLAT" | grep -Ewq 'do'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "HARD BLOCK: do not use a shell loop (while/for/until ... do) in a Bash command. A loop cannot be statically analyzed and trips the approval prompt. For a read-only scan use the Grep/Read tools or split it into simple, statically-analyzable commands (a plain pipeline is fine); run a real multi-step operation through a tool flag or a committed script, not a hand-rolled loop."
    }
  }'
  exit 0
fi

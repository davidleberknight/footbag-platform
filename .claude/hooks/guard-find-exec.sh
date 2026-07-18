#!/usr/bin/env bash
# Security gate: fails closed — any internal error (missing jq, bad input) exits 2,
# which blocks the tool call instead of letting it through.
trap 'exit 2' ERR
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

# find running a command per match — -exec/-execdir and the interactive -ok/-okdir
# variants all run an arbitrary command, so all are hard-denied per the "no find
# -exec" rule. Use Glob/Grep/Read, find -delete, or xargs instead.
#
# The predicate can be quote- or backslash-obfuscated (find . '-exec' rm ...), which a
# regex over the raw string misses, so the same pattern is also checked against a copy
# with quotes and backslashes removed. Over-blocking a benign string that merely mentions
# "find ... -exec" is the safe direction for a fail-closed security guard.
STRIPPED="$(printf '%s' "$COMMAND" | tr -d "\"'\\\\")"
FINDEXEC_RE='(^|[;&|[:space:]])find([[:space:]].*)?[[:space:]]-(exec|ok)(dir)?([[:space:]]|$)'
if printf '%s' "$COMMAND" | grep -Eq "$FINDEXEC_RE" \
  || printf '%s' "$STRIPPED" | grep -Eq "$FINDEXEC_RE"; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "HARD BLOCK: find -exec/-execdir/-ok/-okdir is banned. Use Glob/Grep/Read, find -delete, or xargs instead."
    }
  }'
  exit 0
fi

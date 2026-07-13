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

# An exec- or write-capable flag on ANY git subcommand runs a command or writes a file, and
# it rides mid-arguments where a prefix allow rule cannot see it: --upload-pack /
# --receive-pack / --exec-path / --open-files-in-pager shell-exec the given command, and
# --output writes a file. `git fetch` is a static allow, so without this a
# `git fetch --upload-pack=cmd` would auto-approve arbitrary code execution. The span from
# git to the flag is unbounded so a quoted separator cannot silence this ask (an over-ask on
# an unrelated later token is the safe direction).
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|`({]|&&|\|\|)[[:space:]]*git([[:space:]].*)?[[:space:]](--upload-pack|--receive-pack|--exec-path|--open-files-in-pager|--output)(=|[[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "git with a command-running (--upload-pack/--receive-pack/--exec-path/--open-files-in-pager) or file-writing (--output) flag detected. Confirm before running."
    }
  }'
  exit 0
fi

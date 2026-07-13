#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

# A leading `cd`/`pushd` is never required here: the working directory persists at
# the repo root, and an absolute path or a tool's own directory flag (git -C,
# make -C, find <dir>, terraform -chdir) reaches any other directory without one. A
# leading `cd` combined with any output redirect also trips a built-in product
# prompt no project rule can suppress, and redirects into the session scratchpad are
# already prompt-exempt, so no `cd` is needed for those either. Deny a leading `cd`
# so the command is rewritten without it. Matches `cd`/`pushd` at the very start of
# the command, including just inside an opening subshell paren ( (cd x && ...) ); a
# `cd` deeper in a chain (foo && cd x) is out of scope and falls through.
if printf '%s' "$COMMAND" | grep -Eq '^[[:space:]]*\(*[[:space:]]*(cd|pushd)([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "HARD BLOCK: do not begin a Bash command with cd/pushd. The working directory already persists at the repo root; reach another directory with an absolute path or a tool directory flag (git -C <dir>, make -C <dir>, find <dir>, terraform -chdir=<dir>). Redirects into the session scratchpad are prompt-exempt, so no cd is needed there either."
    }
  }'
  exit 0
fi

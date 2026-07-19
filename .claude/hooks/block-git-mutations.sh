#!/usr/bin/env bash
# Security gate: fails closed — any internal error (missing jq, bad input) exits 2,
# which blocks the tool call instead of letting it through.
trap 'exit 2' ERR
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

# Match only command position (start, or after a separator, optionally behind an
# env/VAR= prefix) so a read-only mention of the verb in an echo/grep argument does
# not trip the block; a real git invocation always sits at command position. The
# mutating subcommand can also sit behind git global options (git -C DIR commit,
# git -c k=v commit, git --git-dir=… push); allow any run of those option groups
# between `git` and the verb so the block is not evaded by a leading global flag.
GITMUT_RE='(^|[;&|`({]|&&|\|\|)[[:space:]]*(env[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*git[[:space:]]+((-c|-C)[[:space:]]+[^[:space:]]+[[:space:]]+|--(git-dir|work-tree|namespace|super-prefix)(=[^[:space:]]+|[[:space:]]+[^[:space:]]+)[[:space:]]+|(-p|--paginate|--no-pager|--bare|--no-replace-objects|--literal-pathspecs|--no-optional-locks)[[:space:]]+)*(add|commit|push|pull)([[:space:]]|$)'
if printf '%s' "$COMMAND" | grep -Eq "$GITMUT_RE"; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "HARD BLOCK: Claude must never run git add, git commit, git push, or git pull. The human owns all staging, commits, and upstream syncs."
    }
  }'
  exit 0
fi

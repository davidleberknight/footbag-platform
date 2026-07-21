#!/usr/bin/env bash
# Security gate: fails closed — any internal error (missing jq, bad input) exits 2,
# which blocks the tool call instead of letting it through.
trap 'exit 2' ERR
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

# Process substitution (`<(...)` / `>(...)`) spawns subshells wired to file
# descriptors, which the built-in analyzer cannot statically decompose, so even a
# purely read-only command carrying one falls through to an approval prompt. The
# work it does is always reachable another way: read the files with the Read tool
# and compare in context, or run two plain commands whose output goes to stdout.
# Deny it so the command is rewritten rather than approved. Deliberately narrow:
# `$(...)` command substitution and `$((...))` arithmetic are left to the
# built-in prompt, because those are occasionally genuinely needed and denying
# them outright would over-block. The match is the bare two-character sequence,
# so the sequence inside quotes is denied too; a guard that tried to parse shell
# quoting to tell those apart is the kind that ends up with a bypass, and a false
# deny costs one rewrite.
if printf '%s' "$COMMAND" | grep -Eq '[<>]\('; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "HARD BLOCK: do not use process substitution (<(...) or >(...)) in a Bash command. It cannot be statically analyzed and trips the approval prompt even when the command only reads. To compare two files, read them with the Read tool and compare in context, or run two separate plain commands whose output goes to stdout."
    }
  }'
  exit 0
fi

#!/usr/bin/env bash
# Gate `rm`: auto-approve an rm that deletes ONLY files under the AI session scratch area
# (/tmp/claude-*/.../scratchpad/), so cleaning up scratch never prompts; ask for every other
# rm. Mirrors how the read-only approver and the redirect guard exempt scratch WRITES.
#
# `rm` is intentionally NOT in the settings.json ask list: a settings `ask` beats any allow
# (and beats a hook's `allow`), so path-specific auto-approval is impossible while a blanket
# `Bash(rm:*)` ask exists. This hook is therefore the sole explicit gate -- fail closed. An rm
# that is not a single, simple invocation with every operand provably under a scratchpad path,
# or that carries a `..`, a separator, a command substitution, a backtick, or a redirect, asks;
# a non-scratch rm that this hook somehow does not match still falls to the normal prompt.
# Fails closed: any internal error (missing jq, bad input) exits 2, blocking the call.
trap 'exit 2' ERR
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[ -n "$COMMAND" ] || exit 0

# Act only when rm is invoked at a command position (start, or after a separator); a mere
# mention of "rm" as an argument to another command is ignored.
printf '%s' "$COMMAND" | grep -Eq '(^|[;&|`({]|&&|\|\|)[[:space:]]*rm([[:space:]]|$)' || exit 0

ask() {
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "rm outside the AI session scratch directory, or a non-trivial rm. Confirm before deleting."
    }
  }'
  exit 0
}

# Auto-approve only a SINGLE, simple rm. Anything that could hide a second target or escape
# the scratch dir -- a separator (including a newline / carriage return, which terminate a
# statement exactly like `;` and would otherwise let a second command ride the word-split),
# a command substitution, backtick, redirect, or a `..` traversal -- asks. Rejecting `..`
# outright stops an operand from climbing out of scratch.
case "$COMMAND" in
  *';'*|*'|'*|*'&'*|*'`'*|*'$('*|*'>'*|*'<'*|*'..'*|*$'\n'*|*$'\r'*) ask ;;
esac

# The command must be exactly `rm ...` after any leading whitespace.
trimmed="${COMMAND#"${COMMAND%%[![:space:]]*}"}"
case "$trimmed" in
  rm|rm[[:space:]]*) : ;;
  *) ask ;;
esac

# Every non-flag operand must sit under a scratch scratchpad directory. rm's flags never take
# a separate argument, so a token starting with `-` is a flag and any other token is a path.
set -f; set -- $trimmed; set +f
shift   # drop `rm`
operands=0
for a in "$@"; do
  case "$a" in
    -*) : ;;
    *)
      operands=$((operands + 1))
      case "$a" in
        /tmp/claude-*/scratchpad/*) : ;;
        *) ask ;;
      esac ;;
  esac
done
[ "$operands" -ge 1 ] || ask

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    permissionDecisionReason: "rm limited to files under the AI session scratch directory."
  }
}'
exit 0

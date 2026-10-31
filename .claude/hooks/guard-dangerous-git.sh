#!/usr/bin/env bash
# Security gate: fails closed — any internal error (missing jq, bad input) exits 2,
# which blocks the tool call instead of letting it through.
trap 'exit 2' ERR
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

# Match only command position (start, or after a separator, optionally via a
# bash/sh/env/VAR= prefix) so a read-only mention of the verb in an echo/grep
# argument does not prompt; a real destructive git invocation always sits here.
# Quoted text is dropped first, so a search pattern such as '"Bash\(git branch -D'
# is not read as a command; but where the command runs a string as code (bash -c,
# sh -c, eval, xargs, env), the quoted text is the command, so each quote mark is read
# as a separator and a git verb just inside one sits at command position.
# Only a quoted phrase (text with a space in it) is dropped; a one-word quoted argument
# such as "-fd" or "-D" keeps its contents, with the quote marks removed, so quoting a
# flag cannot hide it. A command carrying $( or a backtick is never stripped, because a
# substitution inside quotes still runs.
if printf '%s' "$COMMAND" | grep -Eq '(^|[^[:alnum:]_.-])(bash|sh|zsh|dash|eval|xargs|env)([[:space:]]|$)'; then
  SCAN="$(printf '%s' "$COMMAND" | tr "'\"" ';;')"
elif printf '%s' "$COMMAND" | grep -Fq -e '$(' -e '`'; then
  SCAN="$COMMAND"
else
  SCAN="$(printf '%s' "$COMMAND" \
    | sed -E "s/'[^']*[[:space:]][^']*'//g; s/\"[^\"]*[[:space:]][^\"]*\"//g" | tr -d "'\"")"
fi
if printf '%s' "$SCAN" | grep -Eq '(^|[;&|`({]|&&|\|\|)[[:space:]]*git[[:space:]]+(reset[[:space:]]+--hard|clean[[:space:]].*-[a-zA-Z]*f|checkout[[:space:]]+--|restore([[:space:]]|$)|branch[[:space:]]+-D)'; then
  jq -n --arg cmd "$COMMAND" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: ("APPROVE DISCARDING WORK: " + $cmd + " throws away uncommitted or committed changes. Approve only if nothing in it is wanted.")
    }
  }'
  exit 0
fi

# An exec- or write-capable flag on ANY git subcommand runs a command or writes a file, and
# it rides mid-arguments where a prefix allow rule cannot see it: --upload-pack /
# --receive-pack / --exec-path / --open-files-in-pager shell-exec the given command, and
# --output writes a file. `git fetch` is a static allow, so without this a
# `git fetch --upload-pack=cmd` would auto-approve arbitrary code execution. The span from
# git to the flag is unbounded so a quoted separator cannot silence this deny (an over-deny
# on an unrelated later token is the safe direction). Claude never needs these flags, so the
# command is denied with the rewrite named rather than put to the human.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|`({]|&&|\|\|)[[:space:]]*git([[:space:]].*)?[[:space:]](--upload-pack|--receive-pack|--exec-path|--open-files-in-pager|--output)(=|[[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "HARD BLOCK: git with a command-running (--upload-pack/--receive-pack/--exec-path/--open-files-in-pager) or file-writing (--output) flag. Run the read-only git command without it."
    }
  }'
  exit 0
fi

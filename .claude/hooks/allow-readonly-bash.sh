#!/usr/bin/env bash
# Auto-approve Bash commands that are provably read-only, including compound
# pipelines and loops that static allow-rules cannot express. Conservative:
# any segment whose command head is not on the read-only list, or any command
# that can hide work in substitution or file redirection, falls through to the
# normal permission flow. Mutating variants of listed commands (sed -i, find
# -delete, git reset) are caught by sibling guards and settings ask/deny rules,
# whose decisions always override this allow.
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[ -n "$COMMAND" ] || exit 0

# Strip harmless redirections (fd dups like 2>&1 / >&2, and writes to
# /dev/null) so common read-only idioms survive the write check and the
# separator split below. Redirections to real files are left in place.
SCAN="$(printf '%s' "$COMMAND" | sed -E 's/&>>?[[:space:]]*\/dev\/null//g; s/[0-9]*>>?[[:space:]]*\/dev\/null//g; s/[0-9]*>&[0-9-]+//g')"

# Refuse to reason about hidden writes: command/process substitution, append,
# or a file-writing redirect.
if printf '%s' "$SCAN" | grep -Eq '\$\(|<\(|>\(|>>|>[[:space:]]*[^&]'; then
  exit 0
fi
case "$SCAN" in *'`'*) exit 0 ;; esac

# Command heads that never write. Dangerous flags on these (sed -i, find
# -delete) are handled by sibling ask/deny hooks, which win over allow.
readonly_heads='ls cat head tail wc grep egrep fgrep rg find tree stat file echo printf pwd which type command dirname basename realpath readlink sort uniq cut comm tr nl tac fold column jq date env printenv id whoami hostname uname sed true false :'

# Git subcommands that only read. Anything else under git falls through.
readonly_git='status log diff show blame rev-parse describe shortlog ls-files ls-tree cat-file for-each-ref reflog'

contains() { case " $1 " in *" $2 "*) return 0 ;; esac; return 1; }

# Break into segments on shell separators, then vet the head word of each.
segments="$(printf '%s' "$SCAN" | tr '\n' ';' | sed -E 's/\|\||&&|[;|&]/\n/g')"

while IFS= read -r seg; do
  seg="${seg#"${seg%%[![:space:]]*}"}"   # trim leading whitespace
  [ -n "$seg" ] || continue

  set -f; set -- $seg; set +f             # word-split without globbing

  # Drop leading env-assignment prefixes (VAR=value cmd ...).
  while [ $# -gt 0 ]; do case "$1" in *=*) shift ;; *) break ;; esac; done
  [ $# -gt 0 ] || continue

  case "$1" in
    for|case) continue ;;                 # loop/case header has no command
    '[['|'['|']]'|']'|'{'|'}'|'!'|'('|')'|done|fi|esac) continue ;;
    while|until|if|elif|then|else|do) shift ;;  # strip one control keyword
  esac
  while [ $# -gt 0 ]; do case "$1" in *=*) shift ;; *) break ;; esac; done
  [ $# -gt 0 ] || continue

  head="$1"
  if [ "$head" = git ]; then
    contains "$readonly_git" "${2:-}" || exit 0
    continue
  fi
  contains "$readonly_heads" "$head" || exit 0
done <<<"$segments"

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    permissionDecisionReason: "All command segments are read-only."
  }
}'

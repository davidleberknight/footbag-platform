#!/usr/bin/env bash
# Security gate: fails closed — any internal error (missing jq, bad input) exits 2,
# which blocks the tool call instead of letting it through.
trap 'exit 2' ERR
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
SESSION="$(printf '%s' "$INPUT" | jq -r '.session_id // "nosession"' | tr -cd 'A-Za-z0-9_-')"

[ -n "$COMMAND" ] || exit 0

# The full gate and the heavy test, deploy and rebuild tiers are the maintainer's call,
# so their permissions.ask entries stop the command at a prompt. A prompt that arrives
# unannounced, or that offers to save a rule for some trailing plumbing, tells the
# maintainer nothing. Deny a gated command once per session, and every time it is
# combined with other commands, so Claude says what it is running and why, and runs it
# on its own; the reissue falls through to the ask rule, which prompts as before.
# Modelled on guard-leading-cd.sh and guard-shell-loop.sh. Each entry below is copied
# verbatim from permissions.ask, which stays the floor; the harness self-check fails
# if one is missing there.
GATED=(
  'Bash(bash scripts/test-smoke.sh:*)'
  'Bash(npm run test:smoke*)'
  'Bash(./run_all_tests.sh*)'
  'Bash(bash run_all_tests.sh*)'
  'Bash(bash ./run_all_tests.sh*)'
  'Bash(npm run test:quick*)'
  'Bash(npm test*)'
  'Bash(npm run test:unit*)'
  'Bash(npm run test:integration*)'
  'Bash(npm run test:coverage*)'
  'Bash(npm run test:all*)'
  'Bash(npm run test:e2e*)'
  'Bash(npm run test:deployed*)'
  'Bash(npm run test:pentest*)'
  'Bash(npm run test:persona-crawl*)'
  'Bash(*run_dev.sh *--reset*)'
  'Bash(*run_dev.sh *--from-csv*)'
  'Bash(*run_dev.sh *--all-data*)'
  'Bash(*run_dev.sh *--soup-to-nuts*)'
  'Bash(bash deploy_to_aws.sh:*)'
  'Bash(./deploy_to_aws.sh:*)'
)

# A permission rule as an anchored ERE, with Claude Code's matching: `*` is any text,
# and a trailing `:*` is the prefix alone or followed by a space and anything.
rule_re() {
  local body="${1#Bash(}" tail='' core
  body="${body%)}"
  if [ "${body%':*'}" != "$body" ]; then
    core="${body%':*'}"; tail='([[:space:]].*)?'
  else
    core="$body"
  fi
  core="$(printf '%s' "$core" | sed -e 's#[]\\.^$+?(){}|/[]#\\&#g' -e 's/\*/.*/g')"
  printf '^%s%s$' "$core" "$tail"
}

# Split at the shell separators Claude Code splits at (; & | and newlines), outside
# quotes, so a quoted `a|b` argument is not mistaken for a pipe.
SEGMENTS=()
seg='' q=''
for (( i = 0; i < ${#COMMAND}; i++ )); do
  ch="${COMMAND:i:1}"
  if [ -n "$q" ]; then
    [ "$ch" = "$q" ] && q=''
    seg+="$ch"
  elif [ "$ch" = "'" ] || [ "$ch" = '"' ]; then
    q="$ch"; seg+="$ch"
  elif [[ "$ch" == [\;\&\|$'\n'] ]]; then
    # `2>&1` and `>&2` are redirects, not separators.
    if [ "$ch" = '&' ] && [[ "$seg" == *'>' ]]; then seg+="$ch"; continue; fi
    SEGMENTS+=("$seg"); seg=''
  else
    seg+="$ch"
  fi
done
SEGMENTS+=("$seg")

parts=0 hit=''
for seg in "${SEGMENTS[@]}"; do
  # Drop leading blanks and VAR=value assignments, which a rule does not see.
  seg="$(printf '%s' "$seg" | sed -E 's/^[[:space:]]*(([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*)[[:space:]]+)*//')"
  [ -n "${seg//[[:space:]]/}" ] || continue
  parts=$((parts + 1))
  if [ -z "$hit" ]; then
    for rule in "${GATED[@]}"; do
      if printf '%s' "$seg" | grep -Eq "$(rule_re "$rule")"; then hit="$rule"; break; fi
    done
  fi
done

[ -n "$hit" ] || exit 0

MARKS="${TMPDIR:-/tmp}/claude-maintainer-gate/$SESSION"
mkdir -p "$MARKS"
MARK="$MARKS/$(printf '%s' "$hit" | sha1sum | cut -c1-16)"

deny() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
}

WHY="the full gate and the heavy test, deploy and rebuild tiers are the maintainer's call, so this command stops at a permission prompt"
SAY="Say in your message the exact command and why you want it now, write the Bash description as that why, then reissue it on its own; it will prompt."

if [ "$parts" -gt 1 ]; then
  : > "$MARK"
  deny "MAINTAINER GATE: ${hit} must run as its own Bash call, with no &&, ;, | or trailing echo, grep or head, so the prompt and any rule it offers to save name this command and nothing else ($WHY). A redirect into the scratchpad is fine; read the log afterwards with Read or Grep. $SAY"
  exit 0
fi

if [ ! -e "$MARK" ]; then
  : > "$MARK"
  deny "MAINTAINER GATE: ${hit} is in the ask list because $WHY. $SAY"
  exit 0
fi

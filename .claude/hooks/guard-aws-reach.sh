#!/usr/bin/env bash
# Security gate: fails closed — any internal error (missing jq, bad input) exits 2,
# which blocks the tool call instead of letting it through.
#
# Asks before anything that reaches AWS. Claude never touches AWS infrastructure
# on its own judgement, so this hook prompts for every invocation rather than
# classifying reads as safe: an approval is per-command and is never cached into
# an allow rule.
#
# The reason this exists as a hook rather than a permission rule: a permission
# rule matches the literal command prefix, and a wrapper script's name reveals
# nothing about the AWS calls inside it. Running a script whose text contained
# neither "aws" nor "terraform" reached SSM and Terraform state through the
# script body. This hook therefore reads the scripts a command names, and the
# npm scripts those resolve to, instead of matching on the command alone.
trap 'exit 2' ERR
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

ask() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# Terraform subcommands that reach the AWS account or the remote S3 backend.
# `fmt` and `validate` are purely local and stay out of it, so formatting and
# syntax checks never prompt.
TF_AWS_SUBCOMMANDS='init|plan|apply|destroy|output|refresh|import|taint|untaint|state|show|providers|force-unlock|login'

# Text signature of an AWS-reaching call, used both on the command itself and on
# the body of any script the command names.
#
# Anchored to command position (start of a line, or after a separator), with
# optional leading VAR=value assignments. `aws` as a bare argument is not a
# call: `grep -rn aws src/` and a comment mentioning the CLI must not prompt,
# or the guard becomes noise and gets clicked through.
CMD_START='(^|[;&|`({]|&&|\|\|)[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*'

aws_reaching_text() {
  printf '%s' "$1" | grep -Eq "${CMD_START}aws([[:space:]]|$)" && return 0
  printf '%s' "$1" | grep -Eq "${CMD_START}terraform([[:space:]]+-[^[:space:]]+)*[[:space:]]+($TF_AWS_SUBCOMMANDS)([[:space:]]|$)" && return 0
  return 1
}

# ---- 1. The command itself names aws or an AWS-reaching terraform subcommand.
if aws_reaching_text "$COMMAND"; then
  ask "Command reaches AWS (aws CLI or a Terraform subcommand that contacts the account or remote state). Claude runs no AWS operation without explicit per-invocation approval; approve only if this is a read you want, and run mutations yourself."
fi

# ---- 2. The command names a repo script whose body reaches AWS.
# Collected candidates: literal .sh paths, plus the scripts an `npm run <name>`
# resolves to. Scanned one level deeper so a wrapper that shells out to an
# AWS-touching script is caught too.
collect_npm_script_bodies() {
  local text="$1" name body
  printf '%s' "$text" | grep -oE 'npm[[:space:]]+run[[:space:]]+[A-Za-z0-9:_.-]+' | while read -r match; do
    name="${match##*[[:space:]]}"
    [ -f package.json ] || continue
    body="$(jq -r --arg s "$name" '.scripts[$s] // empty' package.json 2>/dev/null || true)"
    [ -n "$body" ] && printf '%s\n' "$body"
  done
}

scan_script() {
  local path="$1" depth="$2" body nested
  [ -f "$path" ] || return 1
  [ "$depth" -gt 2 ] && return 1
  body="$(cat "$path" 2>/dev/null || true)"
  [ -n "$body" ] || return 1
  aws_reaching_text "$body" && return 0

  # Follow npm scripts named inside this script, then the .sh files either the
  # script or those npm scripts name.
  nested="$(collect_npm_script_bodies "$body"; printf '%s' "$body" | grep -oE '(\./)?[A-Za-z0-9_][A-Za-z0-9_./-]*\.sh' || true)"
  while IFS= read -r ref; do
    [ -n "$ref" ] || continue
    aws_reaching_text "$ref" && return 0
    local rel="${ref#./}"
    case "$rel" in
      */*|*.sh) ;;
      *) continue ;;
    esac
    [ "$rel" = "$path" ] && continue
    scan_script "$rel" "$((depth + 1))" && return 0
  done <<EOF
$nested
EOF
  return 1
}

CANDIDATES="$(
  { printf '%s' "$COMMAND" | grep -oE '(\./)?[A-Za-z0-9_][A-Za-z0-9_./-]*\.sh' || true
    collect_npm_script_bodies "$COMMAND"; } 2>/dev/null || true
)"

while IFS= read -r candidate; do
  [ -n "$candidate" ] || continue
  if aws_reaching_text "$candidate"; then
    ask "Command runs an npm script that reaches AWS. Claude runs no AWS operation without explicit per-invocation approval."
  fi
  rel="${candidate#./}"
  case "$rel" in
    *.sh) ;;
    *) continue ;;
  esac
  if scan_script "$rel" 1; then
    ask "Script '$rel' reaches AWS (its body, or a script or npm script it invokes, calls the aws CLI or Terraform against the account or remote state). Claude runs no AWS operation without explicit per-invocation approval; a script's name does not show what it touches, so approve only if you want this to run now."
  fi
done <<EOF
$CANDIDATES
EOF

exit 0

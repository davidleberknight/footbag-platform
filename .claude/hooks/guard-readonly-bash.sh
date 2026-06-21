#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

# find with -delete — a predicate that appears anywhere in the args,
# so a static Bash(find -delete:*) rule in settings.json cannot match it.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])find([[:space:]].*)?[[:space:]]-delete([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "find with -delete detected. Confirm before running."
    }
  }'
  exit 0
fi

# sort writing its output to a file (-o / --output) — a write via a flag, not a
# shell redirect, so the redirect guard below cannot see it. `sort` is on the
# read-only allow-list (it reads in its common form), so without this it would
# auto-approve a file truncate.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])sort([[:space:]].*)?[[:space:]](-o[[:space:]]|-o$|--output)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "sort -o / --output writes a file. Confirm before running."
    }
  }'
  exit 0
fi

# find writing to a file via -fprint / -fprintf / -fls — write predicates that
# can appear anywhere in the args (like -delete). `find` is on the read-only
# allow-list, so these need an explicit ask.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])find([[:space:]].*)?[[:space:]]-(fprint|fprintf|fls)([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "find with -fprint/-fprintf/-fls writes a file. Confirm before running."
    }
  }'
  exit 0
fi

# curl with state-changing HTTP methods — -X POST/PUT/DELETE/PATCH can appear
# anywhere in a long curl invocation, so again not expressible as a static rule.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])curl([[:space:]].*)?[[:space:]](-X[[:space:]]+(POST|PUT|DELETE|PATCH)|--request[[:space:]]+(POST|PUT|DELETE|PATCH))([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "curl with mutating HTTP method detected. Confirm before sending."
    }
  }'
  exit 0
fi

# curl writing a file or uploading data — -o/-d/-F/-T flags can appear anywhere.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])curl([[:space:]].*)?[[:space:]](-o|--output|-d|--data|--data-raw|--data-binary|--data-urlencode|-F|--form|-T|--upload-file)([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "curl with file-write or request-body flag detected. Confirm before running."
    }
  }'
  exit 0
fi

# Output redirection from a read-only inspector creates or truncates files.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])(cat|grep|rg|head|tail|find|ls|tree|stat|file|wc)([[:space:]][^|;&]*)?[[:space:]]>{1,2}[[:space:]]'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Shell output redirection (>, >>) from a read-only command would write a file. Confirm before running."
    }
  }'
  exit 0
fi

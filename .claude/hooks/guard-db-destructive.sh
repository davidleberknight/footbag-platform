#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])(\./)?scripts/reset-local-db\.sh([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Destructive database reset detected. Confirm data-loss intent before proceeding."
    }
  }'
  exit 0
fi

if printf '%s' "$COMMAND" | grep -Eq 'rm[[:space:]].*(footbag\.db|\.db-wal|\.db-shm)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "SQLite file deletion detected. Confirm before proceeding."
    }
  }'
  exit 0
fi

# Inline destructive SQL
if printf '%s' "$COMMAND" | grep -Eqi 'sqlite3.*(DROP[[:space:]]+TABLE|DROP[[:space:]]+INDEX|DELETE[[:space:]]+FROM|TRUNCATE|ALTER[[:space:]]+TABLE.*DROP)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Potentially destructive inline SQLite command detected. Confirm before proceeding."
    }
  }'
  exit 0
fi

# Piped destructive SQL into sqlite3
if printf '%s' "$COMMAND" | grep -Eqi '(DROP[[:space:]]+TABLE|DROP[[:space:]]+INDEX|DELETE[[:space:]]+FROM|TRUNCATE|ALTER[[:space:]]+TABLE.*DROP).*[|].*sqlite3|sqlite3.*<.*(DROP|DELETE|TRUNCATE|ALTER)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Potentially destructive piped SQLite command detected. Confirm before proceeding."
    }
  }'
  exit 0
fi

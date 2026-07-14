#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

# Gate EXECUTING the reset script, not merely naming its path as an argument to a
# read-only command (git log/cat/grep/wc read the file and must not prompt). Match
# only command position: start, or after a separator, optionally via a VAR= prefix
# or a bash/sh/env/source launcher.
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|`({]|&&|\|\|)[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*((bash|sh|source|\.|env)[[:space:]]+)?(\./)?scripts/reset-local-db\.sh([[:space:];&|)>`]|$)'; then
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

# Writable SQLite beyond the obvious destructive verbs: write DML/DDL, ATTACH, VACUUM INTO, or a
# write dot-command. The read-only approver auto-approves sqlite3 only when it is provably
# read-only (the -readonly flag or a file:...?mode=ro URI), so a non-readonly sqlite3 has no
# auto-allow; this guard makes that ask explicit rather than leaving it to chance. Ask, never
# silently allow.
if printf '%s' "$COMMAND" | grep -Eqi 'sqlite3.*(INSERT[[:space:]]+INTO|UPDATE[[:space:]]+|REPLACE[[:space:]]+INTO|CREATE[[:space:]]+(TABLE|INDEX|VIEW|TRIGGER|VIRTUAL)|ALTER[[:space:]]+TABLE|ATTACH([[:space:]]+DATABASE)?[[:space:]]|VACUUM[[:space:]]+INTO|\.(read|import|restore|output|save|backup|clone|dump)[[:space:]])'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Potentially writable SQLite operation (write DML/DDL, ATTACH, VACUUM INTO, or a write dot-command). Confirm before proceeding."
    }
  }'
  exit 0
fi

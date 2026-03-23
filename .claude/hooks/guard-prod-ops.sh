#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

# Production Terraform mutations
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])terraform([[:space:]].*)?(apply|destroy|import|state[[:space:]]+rm|taint|untaint)([[:space:]]|$)' \
  && printf '%s' "$COMMAND" | grep -Eq '(terraform/production|(^|[[:space:]])production([[:space:]/_-]|$))'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Production/infrastructure mutation command detected. Require explicit human confirmation."
    }
  }'
  exit 0
fi

# Live service mutations on host
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])(sudo[[:space:]]+)?systemctl[[:space:]]+(start|stop|restart|reload|enable|disable|mask|unmask|daemon-reload)([[:space:]]|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Potential live host service mutation detected. Require explicit human confirmation."
    }
  }'
  exit 0
fi

# Production-like Docker Compose mutations
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|[:space:]])docker[[:space:]]+compose([[:space:]].*)?(up|down|restart|stop|rm|pull|build)([[:space:]]|$)' \
  && printf '%s' "$COMMAND" | grep -Eq '(/srv/footbag|production|compose[.]ya?ml|docker-compose)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Potential production-like Docker Compose mutation detected. Require explicit human confirmation."
    }
  }'
  exit 0
fi

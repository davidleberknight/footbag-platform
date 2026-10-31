#!/usr/bin/env bash
# Security gate: fails closed — any internal error (missing jq, bad input) exits 2,
# which blocks the tool call instead of letting it through.
trap 'exit 2' ERR
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"

[ -n "$COMMAND" ] || exit 0

# Production Terraform mutations
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|`({]|&&|\|\|)[[:space:]]*terraform([[:space:]].*)?(apply|destroy|import|state[[:space:]]+rm|taint|untaint)([[:space:]]|$)' \
  && printf '%s' "$COMMAND" | grep -Eq '(terraform/production|(^|[[:space:]])production([[:space:]/_-]|$))'; then
  jq -n --arg cmd "$COMMAND" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: ("APPROVE PRODUCTION OR HOST CHANGE: " + $cmd + " changes production infrastructure. Approve only if you meant to change that environment now.")
    }
  }'
  exit 0
fi

# Live service mutations on host
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|`({]|&&|\|\|)[[:space:]]*(sudo[[:space:]]+)?systemctl[[:space:]]+(start|stop|restart|reload|enable|disable|mask|unmask|daemon-reload)([[:space:]]|$)'; then
  jq -n --arg cmd "$COMMAND" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: ("APPROVE PRODUCTION OR HOST CHANGE: " + $cmd + " starts, stops or reconfigures a service on this host. Approve only if you meant to change that environment now.")
    }
  }'
  exit 0
fi

# Production-like Docker Compose mutations
if printf '%s' "$COMMAND" | grep -Eq '(^|[;&|`({]|&&|\|\|)[[:space:]]*docker[[:space:]]+compose([[:space:]].*)?(up|down|restart|stop|rm|pull|build)([[:space:]]|$)' \
  && printf '%s' "$COMMAND" | grep -Eq '(/srv/footbag|production|compose[.]ya?ml|docker-compose)'; then
  jq -n --arg cmd "$COMMAND" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: ("APPROVE PRODUCTION OR HOST CHANGE: " + $cmd + " starts, stops or rebuilds Docker Compose containers that may be a deployed stack. Approve only if you meant to change that environment now.")
    }
  }'
  exit 0
fi

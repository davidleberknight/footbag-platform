#!/usr/bin/env bash
# Deny any Bash command that references a secret-bearing path. The Read/Edit/Write
# deny rules bind only those tools: a shell `cat .env` bypasses them, and the
# read-only auto-approver would otherwise approve it as a harmless read. Denying
# the read also closes the exfiltration pairing (read a secret, then send it out
# over an allowed network fetch).
#
# Security gate: fails closed — any internal error (missing jq, bad input) exits 2,
# which blocks the tool call instead of letting it through.
trap 'exit 2' ERR
set -u

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[ -n "$COMMAND" ] || exit 0

# Template env files are committed placeholders, not secrets; remove them before
# matching so `cat .env.example` stays available.
SCAN="$(printf '%s' "$COMMAND" | sed -E 's/\.env\.(example|sample|template)//g')"

deny() {
  jq -n --arg what "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: ("HARD BLOCK: Bash must never touch secret-bearing files (" + $what + "). If the human needs this, they run it themselves with the ! prefix.")
    }
  }'
  exit 0
}

# .env and dotted variants as a path token. The leading class keeps code text like
# `process.env.FOO` (letter before the dot) from matching; `*` covers `cat *.env`.
if printf '%s' "$SCAN" | grep -Eq "(^|[[:space:]\"'=/*])\.env(\.[A-Za-z0-9_.-]+)?([^A-Za-z0-9_.-]|\$)"; then
  deny ".env file"
fi

# Private-key file extensions. A filename stem must precede the dot, so jq filters
# like `.key` in program text do not match.
if printf '%s' "$SCAN" | grep -Eq "[A-Za-z0-9_-]\.(pem|key|p12|pfx)([^A-Za-z0-9_]|\$)"; then
  deny "private key / keystore file"
fi

# SSH private keys, AWS credential files, .ssh contents, secrets directories,
# Terraform state, and credential-bearing rc files.
if printf '%s' "$SCAN" | grep -Eq "id_(rsa|ed25519|ecdsa)([^A-Za-z0-9_]|\$)"; then
  deny "SSH key"
fi
if printf '%s' "$SCAN" | grep -Eq "\.aws/(credentials|config)([^A-Za-z0-9_]|\$)|\.ssh/"; then
  deny "AWS/SSH credential path"
fi
if printf '%s' "$SCAN" | grep -Eq "(^|[[:space:]\"'=/])\.?secrets/"; then
  deny "secrets directory"
fi
if printf '%s' "$SCAN" | grep -Eq "\.tfstate([^A-Za-z0-9_]|\$)|\.npmrc([^A-Za-z0-9_]|\$)|\.terraformrc([^A-Za-z0-9_]|\$)"; then
  deny "state/rc file that can carry credentials"
fi

exit 0

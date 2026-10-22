#!/usr/bin/env bash
# Security gate: fails closed — any internal error (missing jq, bad input) exits 2,
# which blocks the tool call instead of letting it through.
#
# Memory is per-machine and never reaches subagents or other developers, so it may
# hold only a machine-local fact or the user's own preference about how they work.
# A write to the memory store is denied until the current turn shows the pre-save
# audit line, which the human then reviews at the user-scope approval prompt.
trap 'exit 2' ERR
set -euo pipefail

INPUT="$(cat)"
FILE_PATH="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')"
TRANSCRIPT="$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty')"

case "$FILE_PATH" in
  */.claude/projects/*/memory/*) ;;
  *) exit 0 ;;
esac

# audit_seen: the assistant's text since the human's last message carries the audit.
audit_seen() {
  [ -n "$TRANSCRIPT" ] && [ -r "$TRANSCRIPT" ] || return 1
  tail -n 500 "$TRANSCRIPT" | jq -Rnr '
    [inputs | fromjson?] as $e
    | ([$e | to_entries[] | select(.value.type == "user"
        and ((.value.message.content | type) == "string"
          or any(.value.message.content[]?; .type == "text"))) | .key] | max // -1) as $u
    | $e[($u + 1):][] | select(.type == "assistant")
    | .message.content[]? | select(.type == "text") | .text' \
    | grep -q 'Memory audit: lesson = '
}

audit_seen && exit 0

jq -n --arg reason "Memory write blocked until the pre-save audit is in your reply. Memory holds only a machine-local fact (a path, symlink target or tool quirk true of this one machine) or the user's own preference about how they work. A project fact (a rule, convention, design fact, or lesson about the code or process) goes to its canonical home instead (a rule, skill, hook, CLAUDE.md, committed doc, the private operations checkout or the private tracker), proposed as literal before/after. Before saving, read MEMORY.md end to end and grep the CLAUDE.md files, .claude/rules, .claude/hooks and docs/ for the lesson; update an existing home or skip. Never save a one-incident observation, anything re-derivable from the code, ephemeral task state, implementation status, anything a CLAUDE.md, rule, hook or committed doc already states, a docs/ filename cited as live truth, or a generic engineering principle. Then write this line in your reply and retry: Memory audit: lesson = <one sentence>; class = <machine-local|user preference>; checked entries <MEMORY.md entries reviewed>; no overlap; not in exclusion list." '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $reason
  }
}'

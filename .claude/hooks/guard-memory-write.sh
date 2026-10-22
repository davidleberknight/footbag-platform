#!/usr/bin/env bash
# Security gate: fails closed — any internal error (missing jq, bad input) exits 2,
# which blocks the tool call instead of letting it through.
#
# Memory is per-machine and never reaches subagents or other developers, so it may
# hold only a machine-local fact or the user's own preference about how they work.
# A write to the memory store is denied until it carries the pre-save audit: in the
# memory file's own frontmatter (an "audit: lesson = ..." line), or, for an index
# edit, in every memory file the edit links to. The human reviews it at the
# user-scope approval prompt. The transcript is only a fallback: text sent with the
# tool call is not in it yet when this hook runs.
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

# audit_in_write: the write itself carries the audit, or an index edit adds links
# only to memory files that carry one (a link the edit keeps from its old text is
# not re-judged).
audit_in_write() {
  local body old dir links f
  body="$(printf '%s' "$INPUT" | jq -r '[.tool_input.content, .tool_input.new_string, (.tool_input.edits[]?.new_string)] | map(select(. != null)) | join("\n")')"
  # Claude Code quotes a frontmatter value when it saves the file.
  printf '%s' "$body" | grep -qE 'audit: "?lesson = ' && return 0
  [ "$(basename "$FILE_PATH")" = "MEMORY.md" ] || return 1
  old="$(printf '%s' "$INPUT" | jq -r '[.tool_input.old_string, (.tool_input.edits[]?.old_string)] | map(select(. != null)) | join("\n")')"
  dir="$(dirname "$FILE_PATH")"
  links="$(comm -23 \
    <(printf '%s' "$body" | grep -oE '\]\([A-Za-z0-9_.-]+\.md\)' | sed -E 's/^\]\((.*)\)$/\1/' | sort -u || true) \
    <(printf '%s' "$old" | grep -oE '\]\([A-Za-z0-9_.-]+\.md\)' | sed -E 's/^\]\((.*)\)$/\1/' | sort -u || true))"
  [ -n "$links" ] || return 1
  while IFS= read -r f; do
    grep -qE 'audit: "?lesson = ' "$dir/$f" 2>/dev/null || return 1
  done <<< "$links"
}

audit_in_write && exit 0
audit_seen && exit 0

jq -n --arg reason "Memory write blocked until the pre-save audit is in your reply. Memory holds only a machine-local fact (a path, symlink target or tool quirk true of this one machine) or the user's own preference about how they work. A project fact (a rule, convention, design fact, or lesson about the code or process) goes to its canonical home instead (a rule, skill, hook, CLAUDE.md, committed doc, the private operations checkout or the private tracker), proposed as literal before/after. Before saving, read MEMORY.md end to end and grep the CLAUDE.md files, .claude/rules, .claude/hooks and docs/ for the lesson; update an existing home or skip. Never save a one-incident observation, anything re-derivable from the code, ephemeral task state, implementation status, anything a CLAUDE.md, rule, hook or committed doc already states, a docs/ filename cited as live truth, or a generic engineering principle. Then put this line in the memory file's frontmatter, under metadata, and retry; an index entry in MEMORY.md passes once the file it links to carries it: audit: lesson = <one sentence>; class = <machine-local|user preference>; checked entries <MEMORY.md entries reviewed>; no overlap; not in exclusion list." '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $reason
  }
}'

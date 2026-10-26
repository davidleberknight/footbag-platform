#!/usr/bin/env bash
# PostToolUse hook: tracks whether this session changed code since the per-change doc
# sync last checked it, for require-doc-sync.sh to read when the turn ends. An edit to
# a file inside the project marks doc sync pending and records the path. Edits under
# docs/ and to any markdown file (rules, skills, CLAUDE.md files) never do, because
# they are what a doc sync produces. Nothing here clears the marker: only a receipt
# from scripts/doc-sync-diff.ts that matches the tree clears it, at Stop, so loading
# the skill without running the check leaves the gate armed.
# Fail-open: a parse problem leaves the marker as it was.
set -uo pipefail
input="$(cat)"
sid="$(jq -r '.session_id // empty' <<<"$input" 2>/dev/null)" || exit 0
[ -n "$sid" ] || exit 0
dir="$(jq -r '.scratchpad_dir // empty' <<<"$input" 2>/dev/null)"
marker="${dir:-${TMPDIR:-/tmp}}/.doc-sync-pending-$sid"

path="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input" 2>/dev/null)"
[ -n "$path" ] || exit 0
proj="${CLAUDE_PROJECT_DIR:-$(jq -r '.cwd // empty' <<<"$input")}"
[ -n "$proj" ] || exit 0
case "$path" in /*) ;; *) path="$proj/$path" ;; esac
case "$path" in
  "$proj"/docs/*|*.md) ;;
  "$proj"/*) mkdir -p "$(dirname "$marker")" && printf '%s\n' "${path#"$proj"/}" >> "$marker" ;;
esac
exit 0

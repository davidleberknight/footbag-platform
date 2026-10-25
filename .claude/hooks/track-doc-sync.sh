#!/usr/bin/env bash
# PostToolUse hook: tracks whether this session changed project files since the doc-sync
# skill last ran, for require-doc-sync.sh to read when the turn ends. An edit to a file
# inside the project and outside docs/ marks doc-sync pending; a doc-sync skill run clears
# it. Doc edits do not re-arm it, because they are what doc-sync produces.
# Fail-open: a parse problem leaves the marker as it was.
set -uo pipefail
input="$(cat)"
sid="$(jq -r '.session_id // empty' <<<"$input" 2>/dev/null)" || exit 0
[ -n "$sid" ] || exit 0
dir="$(jq -r '.scratchpad_dir // empty' <<<"$input" 2>/dev/null)"
marker="${dir:-${TMPDIR:-/tmp}}/.doc-sync-pending-$sid"
tool="$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null)" || exit 0

if [ "$tool" = Skill ]; then
  # The skill name is read from any string in the tool input, so a renamed field still clears.
  if jq -e '[.tool_input | .. | strings] | any(. == "doc-sync" or endswith(":doc-sync"))' \
      <<<"$input" >/dev/null 2>&1; then
    rm -f "$marker"
  fi
  exit 0
fi

path="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input" 2>/dev/null)"
[ -n "$path" ] || exit 0
proj="${CLAUDE_PROJECT_DIR:-$(jq -r '.cwd // empty' <<<"$input")}"
[ -n "$proj" ] || exit 0
case "$path" in /*) ;; *) path="$proj/$path" ;; esac
case "$path" in
  "$proj"/docs/*) ;;
  "$proj"/*) mkdir -p "$(dirname "$marker")" && : > "$marker" ;;
esac
exit 0

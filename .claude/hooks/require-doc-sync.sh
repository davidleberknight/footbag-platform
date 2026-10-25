#!/usr/bin/env bash
# Stop hook: a turn that changed project files does not end until the doc-sync skill has
# run since the last change, so the documentation, rules, skills and comments are checked
# against every change. track-doc-sync.sh keeps the marker. Plan mode never blocks.
# Claude Code ends the turn after eight consecutive blocks, which bounds a stuck loop.
# Fail-open: a parse problem lets the turn end.
set -uo pipefail
input="$(cat)"
sid="$(jq -r '.session_id // empty' <<<"$input" 2>/dev/null)" || exit 0
[ -n "$sid" ] || exit 0
[ "$(jq -r '.permission_mode // empty' <<<"$input" 2>/dev/null)" = plan ] && exit 0
dir="$(jq -r '.scratchpad_dir // empty' <<<"$input" 2>/dev/null)"
marker="${dir:-${TMPDIR:-/tmp}}/.doc-sync-pending-$sid"
[ -f "$marker" ] || exit 0
jq -cn '{decision:"block",reason:"Project files changed since the doc-sync skill last ran in this session. Invoke the doc-sync skill now: it checks the docs, rules, skills and comments against the change and proposes any edit for approval. Then finish the turn."}'
exit 0

#!/usr/bin/env bash
# Stop hook: a turn that changed code does not end until the per-change doc sync has
# checked that exact change. track-doc-sync.sh arms the marker. The gate clears only
# when scripts/doc-sync-diff.ts has written a receipt whose hash matches the tree's
# current non-documentation change, as scripts/lib/doc-sync-diff-hash.sh computes it
# for both sides; loading the skill clears nothing, and a code edit after the check
# re-arms it. Plan mode never blocks. Claude Code ends the turn after eight
# consecutive blocks, which bounds a stuck loop.
# Fail-open: a parse problem, or a project without the hash helper, lets the turn end.
set -uo pipefail
input="$(cat)"
sid="$(jq -r '.session_id // empty' <<<"$input" 2>/dev/null)" || exit 0
[ -n "$sid" ] || exit 0
[ "$(jq -r '.permission_mode // empty' <<<"$input" 2>/dev/null)" = plan ] && exit 0
dir="$(jq -r '.scratchpad_dir // empty' <<<"$input" 2>/dev/null)"
base="${dir:-${TMPDIR:-/tmp}}"
marker="$base/.doc-sync-pending-$sid"
receipt="$base/.doc-sync-receipt-$sid"
[ -f "$marker" ] || exit 0
proj="${CLAUDE_PROJECT_DIR:-$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)}"
[ -n "$proj" ] && [ -f "$proj/scripts/lib/doc-sync-diff-hash.sh" ] || exit 0
now="$(cd "$proj" && bash scripts/lib/doc-sync-diff-hash.sh 2>/dev/null)" || exit 0
[ -n "$now" ] || exit 0
if [ -f "$receipt" ] && [ "$(jq -r '.hash // empty' "$receipt" 2>/dev/null)" = "$now" ]; then
  rm -f "$marker"
  exit 0
fi
changed="$(sort -u "$marker" | head -8 | paste -sd, - | sed 's/,/, /g')"
jq -cn --arg r "$receipt" --arg c "$changed" '{decision:"block",reason:("Code changed since the per-change doc sync last checked it (" + $c + "). Run `npx tsx scripts/doc-sync-diff.ts --receipt " + $r + "`, follow the doc-sync skill on what it prints, and bring every discrepancy to the human with a recommended answer. Then finish the turn.")}'
exit 0

#!/usr/bin/env bash
# Cleanup, not a gate: fails open. On any error it says so and leaves the file as it was.
set -uo pipefail

# A "Yes, and don't ask again" click saves its rule permanently to
# .claude/settings.local.json, and no setting makes it session-only. A permanent
# never-ask belongs in the committed settings or the developer's user-scope settings,
# edited by hand. So at the start of a fresh session (startup or /clear) remove every
# saved allow and ask rule, keeping env, deny and every other key, and tell Claude
# what went. The running session reloads the changed file.
LOCAL="${CLAUDE_PROJECT_DIR:-.}/.claude/settings.local.json"
[ -f "$LOCAL" ] || exit 0

if ! removed="$(jq -r '((.permissions.allow // []) + (.permissions.ask // []))[]' "$LOCAL" 2>/dev/null)"; then
  echo "strip-local-allows: $LOCAL is not valid JSON; left untouched." >&2
  exit 0
fi
[ -n "$removed" ] || exit 0

tmp="$(mktemp)"
if jq 'del(.permissions.allow, .permissions.ask)
       | if .permissions == {} then del(.permissions) else . end' "$LOCAL" > "$tmp" \
   && cat "$tmp" > "$LOCAL"; then
  rm -f "$tmp"
else
  rm -f "$tmp"
  echo "strip-local-allows: could not rewrite $LOCAL; left untouched." >&2
  exit 0
fi

jq -n --arg r "$removed" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: ("Removed saved permission rules from .claude/settings.local.json, because a \"don'\''t ask again\" click lasts one session here:\n" + $r)
  }
}'

#!/usr/bin/env bash
# PostToolUse hook: after an issue is read with `gh issue view` (a private-tracker card or a
# dev-tester report), places a reminder beside its text that what the issue says about design
# intent, the code or an existing mechanism is unverified until checked against the governing
# passage and the current code. An issue records scope, rulings and deviations, not design
# intent, and its own settled lines can be wrong. The settings `if` filter is best-effort, so
# the command is re-checked here. Fail-open: anything unparseable stays silent.
set -uo pipefail
input="$(cat)"
cmd="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)" || exit 0
[ -n "$cmd" ] || exit 0
grep -qE '(^|[;&|(`[:space:]])gh[[:space:]]+issue[[:space:]]+view([[:space:]]|$)' <<<"$cmd" \
  || exit 0
msg='The issue just read is a lead, not a source of design intent. Its claims about what the design requires, how the code or an existing mechanism behaves, and its own "Settled from the sources" lines are unverified until each is checked this turn against the governing passage (design-intent skill) and the current code, as the tracker-ops skill sets out. A claim a passage contradicts is a finding for the maintainer, not a settled point.'
jq -n --arg c "$msg" \
  '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$c}}'
exit 0

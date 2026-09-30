#!/usr/bin/env bash
# PreToolUse (Bash): a whole-tree `vitest run` invoked directly (npx vitest run,
# node_modules/.bin/vitest run) bypasses the --exclude flags baked into the
# `npm test` script, so it collects the Playwright specs under tests/e2e, which
# cannot run under vitest. The smoke and dev tiers skip themselves without their
# environment variables, so they are not the hazard. Ask unless the run names a
# path below tests/ or excludes tests/e2e. A bare `tests/` target is the whole tree,
# and an exclude that leaves tests/e2e in removes nothing that matters, so both
# still ask. Fail-open on any parse issue.
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[ -n "$COMMAND" ] || exit 0

# Is this a direct `vitest run`? (space or path separator before the binary, so a
# substring like `myvitest` does not match; `npm test` never contains this literal.)
printf '%s' "$COMMAND" | grep -Eq '(^|[^[:alnum:]_])vitest[[:space:]]+run([[:space:]]|$)' || exit 0

# Excluding the Playwright specs is what makes an untargeted run safe: the whole
# tests/e2e directory, not something inside it or a sibling whose name begins so.
if printf '%s' "$COMMAND" | grep -Eq -- "--exclude[=[:space:]]+['\"]?(\./)?tests/e2e(/|/\*\*)?(['\"[:space:]]|$)"; then
  exit 0
fi

# A targeted run names something below tests/. Exclude and test-name-filter
# arguments are dropped first, since a path inside one is not a target.
TARGETS="$(printf '%s' "$COMMAND" \
  | sed -E "s/--exclude[=[:space:]]+('[^']*'|\"[^\"]*\"|[^[:space:]]+)//g" \
  | sed -E "s/(^|[[:space:]])(-t|--testNamePattern)[=[:space:]]+('[^']*'|\"[^\"]*\"|[^[:space:]]+)/\1/g")"
if printf '%s' "$TARGETS" | grep -Eq "(^|[[:space:]'\"])(\./)?tests/[^[:space:]'\"*]"; then
  exit 0
fi

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: "A whole-tree `vitest run` bypasses the excludes in the npm test script and collects the Playwright specs under tests/e2e, which cannot run under vitest. Use `npm test` for the standard suite, pass a path below tests/ for a targeted run, or exclude tests/e2e."
  }
}'
exit 0

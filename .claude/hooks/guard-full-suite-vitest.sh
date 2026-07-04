#!/usr/bin/env bash
# PreToolUse (Bash): a full-suite `vitest run` invoked directly (npx vitest run,
# node_modules/.bin/vitest run) bypasses the --exclude 'tests/smoke|e2e|dev' flags
# baked into the `npm test` script, pulling in the staging-AWS smoke tier and the
# local-stack e2e tier. The standard dev suite is `npm test`; the live-AWS smoke and
# e2e tiers run only on explicit instruction (RUN_STAGING_SMOKE=1 / npm run test:smoke)
# or during a deploy. Ask when vitest run carries no `tests/` path filter and no
# --exclude, so the operator confirms the standard path; a targeted `vitest run
# tests/...` and the already-excluded form both defer. Fail-open on any parse issue.
set -euo pipefail

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[ -n "$COMMAND" ] || exit 0

# Is this a direct `vitest run`? (space or path separator before the binary, so a
# substring like `myvitest` does not match; `npm test` never contains this literal.)
printf '%s' "$COMMAND" | grep -Eq '(^|[^[:alnum:]_])vitest[[:space:]]+run([[:space:]]|$)' || exit 0

# A targeted run (a tests/ path) or a run that already carries the excludes is fine.
if printf '%s' "$COMMAND" | grep -Eq '(tests/|--exclude)'; then
  exit 0
fi

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: "Full-suite `vitest run` bypasses the smoke/e2e/dev excludes in the npm test script, pulling in the staging-AWS and local-stack tiers. Use `npm test` for the standard dev suite, or pass a tests/… path for a targeted run. The live-AWS smoke tier runs only via `npm run test:smoke` / RUN_STAGING_SMOKE=1 or a deploy."
  }
}'
exit 0

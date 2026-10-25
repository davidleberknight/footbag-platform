#!/usr/bin/env bash
# PreToolUse (Bash): a test run takes a minute or more, and in the foreground it blocks
# every other piece of work until it ends. Deny a test runner (pytest, `python -m
# pytest`, vitest, `playwright test`, `npm test` or any npm `test:*` script, the full-gate
# runner) unless the call sets run_in_background, so Claude reissues it in the
# background with its output in the scratchpad and keeps working until it finishes.
# Judged per subcommand on the command head (after any VAR=value, env, time, nice,
# command, exec or timeout wrapper, and inside a `bash -c` or `sh -c` string), so a
# grep or cat that merely names pytest is untouched. A help, version or listing form
# runs no test and passes. A workflow gate, not a security gate: fail-open on a parse
# issue, like guard-full-suite-vitest.sh.
set -uo pipefail
set -f

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)" || exit 0
[ -n "$COMMAND" ] || exit 0
BG="$(printf '%s' "$INPUT" | jq -r '.tool_input.run_in_background // false' 2>/dev/null)" || exit 0
[ "$BG" = "true" ] && exit 0

S='[[:space:]]'
N='[^[:space:]]'
WRAP="^$S*\\(*$S*(([A-Za-z_][A-Za-z0-9_]*=$N*|env|time|nice|command|exec|timeout($S+-$N+)*$S+[0-9.]+[smhd]?)$S+)*"
SHC="((ba|z)?sh$S+-c$S+['\"]?)?"
RUNNER="($N*/)?(pytest|py\\.test|python[0-9.]*($S+-$N+)*$S+-m$S+pytest|(npx$S+)?vitest|(npx$S+)?playwright$S+test|npm($S+-$N+($S+[^-[:space:]]$N*)?)*$S+(test|t|tst|run(-script)?$S+test(:$N*)?)|(bash$S+)?(\\./)?run_all_tests\\.sh)($S|['\"]|$)"
NORUN="(^|$S)(--version|-V|--help|-h|--collect-only|--co|--list|--list-files)($S|$)"

hit=''
while IFS= read -r SEG; do
  printf '%s' "$SEG" | grep -Eq "${WRAP}${SHC}${WRAP#^}${RUNNER}" || continue
  printf '%s' "$SEG" | grep -Eq "$NORUN" && continue
  hit="$SEG"; break
done <<< "$(printf '%s' "$COMMAND" | sed -E 's/(\&\&|\|\||;|\|)/\n/g')"

[ -n "$hit" ] || exit 0

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "FOREGROUND TEST RUN: a test runner (pytest, vitest, playwright, npm test or an npm test:* script, run_all_tests.sh) must run in the background. Reissue the same command as its own Bash call with run_in_background: true and its output redirected to a log in the session scratchpad (> <scratchpad>/<name>.log 2>&1), drop any trailing tail or grep, keep working, and read the log with Read or Grep when the completion notice arrives. This applies to a red-first run and a single-file run too."
  }
}'
exit 0

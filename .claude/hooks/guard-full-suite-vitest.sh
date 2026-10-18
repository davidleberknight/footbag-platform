#!/usr/bin/env bash
# PreToolUse (Bash): a direct `vitest run` (npx vitest run, node_modules/.bin/vitest
# run) that names nothing narrower than a whole tier is the full gate, which is the
# maintainer's to start, and a whole-tree run also bypasses the --exclude flags baked
# into the `npm test` script, so it collects the Playwright specs under tests/e2e,
# which cannot run under vitest. Each `vitest run` in a compound command is judged on
# its own targets, so one targeted run cannot clear a whole-tree one beside it. Ask
# unless every run names a path below tests/ that is narrower than a whole tier. A bare
# `tests/` target, a whole `tests/unit` or `tests/integration` tier (including a glob
# or `.` standing for one), and an untargeted run with any excludes all ask. The static
# exact-match ask entries in settings.json back this up. Fail-open on any parse issue.
set -euo pipefail
# Targets are split on whitespace below; a glob in one must stay text, never expand.
set -f

INPUT="$(cat)"
COMMAND="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[ -n "$COMMAND" ] || exit 0

# Is there a direct `vitest run`? (space or path separator before the binary, so a
# substring like `myvitest` does not match; `npm test` never contains this literal.)
RUN_RE='(^|[^[:alnum:]_])vitest[[:space:]]+run([[:space:]]|$)'
printf '%s' "$COMMAND" | grep -Eq "$RUN_RE" || exit 0

ask() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# One line per subcommand: split on the shell's command separators.
SEGMENTS="$(printf '%s' "$COMMAND" | sed -E 's/(\&\&|\|\||;|\|)/\n/g')"

while IFS= read -r SEGMENT; do
  printf '%s' "$SEGMENT" | grep -Eq "$RUN_RE" || continue

  # Exclude and test-name-filter arguments are dropped first, since a path inside one
  # is not a target.
  TARGETS="$(printf '%s' "$SEGMENT" \
    | sed -E "s/--exclude[=[:space:]]+('[^']*'|\"[^\"]*\"|[^[:space:]]+)//g" \
    | sed -E "s/(^|[[:space:]])(-t|--testNamePattern)[=[:space:]]+('[^']*'|\"[^\"]*\"|[^[:space:]]+)/\1/g" \
    | tr -d "'\"")"

  NARROW=0
  for TOKEN in $TARGETS; do
    TOKEN="${TOKEN#./}"
    case "$TOKEN" in
      tests/*) ;;
      *) continue ;;
    esac
    # A whole tier, or a glob or dot that stands for one, is the full gate.
    if printf '%s' "$TOKEN" | grep -Eq '^tests/(unit|integration)(/|/\.|/\*|/\*\*)?$' \
       || printf '%s' "$TOKEN" | grep -Eq '^tests/[^/]*\*'; then
      ask "A whole unit or integration tier is the full gate the maintainer starts. Run the test files scripts/test-targets.sh printed."
    fi
    if printf '%s' "$TOKEN" | grep -Eq '^tests/[^*[:space:]]'; then
      NARROW=1
    fi
  done

  if (( NARROW == 0 )); then
    ask "A whole-tree \`vitest run\` is the full gate the maintainer starts, and it bypasses the excludes in the npm test script, collecting the Playwright specs under tests/e2e, which cannot run under vitest. Run the test files scripts/test-targets.sh printed."
  fi
done <<< "$SEGMENTS"

exit 0

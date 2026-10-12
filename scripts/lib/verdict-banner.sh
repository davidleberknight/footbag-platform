#!/usr/bin/env bash
# scripts/lib/verdict-banner.sh -- the last thing a test run prints.
#
# Sourced, never run. A run's report is long and is read from the end, so its
# verdict has to be the final block of output, in a shape no gate's own output
# can be mistaken for, carrying the exit code the run is about to return. Shared
# by ./run_all_tests.sh and scripts/ci/run_clean_room.sh so the two end alike.
#
# On stdout, the stream the report itself is on, so `| tail` and `> log` both end
# with it.

# The lines that say something failed, which both runners pull out of a failed
# gate's log for the report at the end. One copy, so the two cannot select
# differently: they had drifted, one carrying a pattern the other lacked. Covers
# vitest and Playwright marks and summaries, pytest's FAILED and E lines, tsc,
# eslint's per-line errors and its summary, npm's failure lines, bash errors and
# the repository's own ERROR, REFUSED and violation lines.
FOOTBAG_FAILURE_GRAMMAR='FAIL|FAILED|ERROR|Error:|error TS[0-9]|AssertionError|Traceback|✕|✗|✘|✖|×|[Vv]iolat|VIOLAT|REFUSED|not ok|[[:space:]]error[[:space:]]|npm (error|ERR)|command not found|[1-9][0-9]* failed|^E  '

# verdict_banner <WORD> <exit-code> [line ...]
verdict_banner() {
  local word="$1" code="$2" line
  shift 2
  local bar='################################################################'
  echo ""
  echo "$bar"
  printf '## VERDICT: %s   (exit %s)\n' "$word" "$code"
  for line in "$@"; do
    printf '## %s\n' "$line"
  done
  echo "$bar"
}

# shellcheck shell=bash
# cutover-guard-probe-remote.sh -- root-side half of
# scripts/cutover-marker-host.sh --check-guard.
#
# Runs the database-replacing deploy's own cutover guard on the host, alone, and
# reports whether it would let that deploy through. The guard is the same file
# the deploy streams ahead of its remote half; it arrives here base64 on one
# line, so what this answers is what the deploy would decide, read from the same
# env file and the same database. The guard only reads: the database is opened
# read-only and nothing is written.
#
# The guard ends a refused deploy with crr_error and exit 1. Here a refusal is
# the answer being asked for, not this half's failure, so the guard runs in a
# subshell where crr_error prints its reason as a marked line instead. Its
# warnings (a database it could not read) stay warnings in the caller's report.
#
# Prints exactly one of
#   ---FOOTBAG-GUARD--- allow
#   ---FOOTBAG-GUARD--- refuse   followed by ---FOOTBAG-GUARD-WHY--- <reason>
# and reports anything else (a guard that ended without either) as an error.
#
# Receives on the stream, after scripts/lib/closing-report-remote.sh:
#   GUARD_SRC_B64   the guard file, base64 on one line

: "${GUARD_SRC_B64:?the probe half requires GUARD_SRC_B64}"

if ! guard_src="$(printf '%s' "$GUARD_SRC_B64" | openssl base64 -d -A)" || [[ -z "$guard_src" ]]; then
  crr_error "the cutover guard did not arrive intact, so nothing was asked of it"
  crr_finish
fi

guard_rc=0
guard_out="$(
  crr_error() { printf -- '---FOOTBAG-GUARD-WHY--- %s\n' "$*"; }
  eval "$guard_src"
  [[ "${CUTOVER_GUARD_RAN:-}" == 1 ]] && printf -- '---FOOTBAG-GUARD--- allow\n'
)" || guard_rc=$?

why="$(sed -n 's/^---FOOTBAG-GUARD-WHY--- //p' <<<"$guard_out" | head -n 1)"
if (( guard_rc == 0 )) && grep -qxF -- '---FOOTBAG-GUARD--- allow' <<<"$guard_out"; then
  printf -- '---FOOTBAG-GUARD--- allow\n'
elif (( guard_rc == 1 )) && [[ -n "$why" ]]; then
  printf -- '---FOOTBAG-GUARD--- refuse\n'
  printf -- '---FOOTBAG-GUARD-WHY--- %s\n' "$why"
else
  crr_error "the cutover guard ended without an answer (exit ${guard_rc}), so whether the deploy would be refused is not known"
fi
crr_finish

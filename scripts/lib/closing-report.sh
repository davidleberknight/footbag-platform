# shellcheck shell=bash
#
# scripts/lib/closing-report.sh -- the one closing report an operator script ends
# with.
#
# Sourced, never run. Every error and warning a run meets is collected here and
# listed once, at the end, with what the run proved and what it did not; the
# exit status follows from the list: non-zero when any is an error, zero with the
# warnings still listed otherwise. A problem printed mid-stream and followed by a
# success line is the failure this exists to stop, because the operator reads the
# end of a long run, not the middle.
#
# What it collects:
#   cr_error <msg>, cr_warn <msg>   what the script finds itself
#   cr_die <msg>                    an error that ends the run now
#   cr_run [--errors ERE] [--warnings ERE] [--sentinels-only] <label> -- <cmd...>
#                                   a command whose output is shown as it runs
#                                   and then read for problems: lines the error
#                                   and warning grammars match, every line a
#                                   remote half marked (closing-report-remote.sh),
#                                   and a non-zero exit with the tool's last line.
#                                   Returns the command's status. Output is merged
#                                   onto stdout. The command runs as a tested
#                                   command, so errexit is suspended inside a
#                                   function it names, as bash does for any
#                                   command whose status is checked.
#   cr_tolerate <label> -- <cmd...> a step whose failure is expected: a failure is
#                                   a warning carrying the tool's own message,
#                                   never swallowed. Always returns 0.
#   cr_harvest [--errors ERE] [--warnings ERE] [--sentinels-only] <label> <log>
#                                   the same reading, over output already saved
#   cr_proved <what>, cr_unproved <what>
#                                   the closing lines: what was checked and what
#                                   was not, so no outcome is claimed unchecked
#   cr_cleanup <cmd...>             registered cleanup, run once at exit, newest
#                                   first; a failing cleanup is a warning
#   cr_finish                       ends the run with the report
#
# The default grammars are the runners' own, from scripts/lib/verdict-banner.sh.
#
# A script that sources this owns no EXIT, INT, TERM or HUP trap of its own: the
# library holds them, so a run that stops early, fails under errexit or is
# interrupted still runs its cleanup and prints its report. An interrupt exits
# 130, 143 or 129, and the signals are ignored while the cleanup runs, so a
# second Ctrl-C cannot cut it short.
#
# The report goes to stderr, so a script's stdout stays clean for a caller that
# reads it.

_CR_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/verdict-banner.sh
source "${_CR_LIB_DIR}/verdict-banner.sh"
# shellcheck source=scripts/lib/closing-report-remote.sh
source "${_CR_LIB_DIR}/closing-report-remote.sh"
# Only the shared harvest is used on this side; the remote half's error counter
# file is not.
rm -f "$CRR_ERROR_FILE"

CR_ERRORS=()
CR_WARNINGS=()
CR_PROVED=()
CR_UNPROVED=()
CR_CLEANUPS=()
_CR_FINISHING=0
# Made once, here in the script's own shell: a directory first made inside a
# command substitution would be known only to that subshell and never removed.
_CR_TMP="$(mktemp -d)"

cr_error() {
  CR_ERRORS+=("$*")
  printf 'ERROR: %s\n' "$*" >&2
}

cr_warn() {
  CR_WARNINGS+=("$*")
  printf 'WARNING: %s\n' "$*" >&2
}

cr_die() {
  cr_error "$*"
  exit 1
}

cr_proved() { CR_PROVED+=("$*"); }
cr_unproved() { CR_UNPROVED+=("$*"); }

cr_cleanup() {
  local cmd
  printf -v cmd '%q ' "$@"
  CR_CLEANUPS+=("$cmd")
}

_cr_tmp() { printf '%s' "$_CR_TMP"; }

# Records without echoing: the line was already shown as the tool printed it.
_cr_record() {
  if [[ "$1" == ERROR ]]; then
    CR_ERRORS+=("$2")
  else
    CR_WARNINGS+=("$2")
  fi
}

cr_harvest() {
  local errs="$FOOTBAG_FAILURE_GRAMMAR" warns="$FOOTBAG_NOTICE_GRAMMAR" label log kind line
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --errors) errs="$2"; shift 2 ;;
      --warnings) warns="$2"; shift 2 ;;
      --sentinels-only) errs=""; warns=""; shift ;;
      *) break ;;
    esac
  done
  label="$1"; log="$2"
  [[ -s "$log" ]] || return 0
  while IFS= read -r line; do
    line="${line#"${CRR_SENTINEL} "}"
    case "$line" in
      "ERROR "*) _cr_record ERROR "${label}: ${line#ERROR }" ;;
      "WARN "*) _cr_record WARN "${label}: ${line#WARN }" ;;
    esac
  done < <(grep -e "^${CRR_SENTINEL} " -- "$log" || [[ $? == 1 ]])
  while IFS=$'\t' read -r kind line; do
    _cr_record "$kind" "${label}: ${line}"
  done < <(cr_grep_problems "$log" "$errs" "$warns")
}

cr_run() {
  local opts=() label rc log
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --errors|--warnings) opts+=("$1" "$2"); shift 2 ;;
      --sentinels-only) opts+=("$1"); shift ;;
      *) break ;;
    esac
  done
  label="$1"; shift
  [[ "${1:-}" == "--" ]] && shift
  log="$(mktemp "$(_cr_tmp)/run.XXXXXX")"
  { "$@" 2>&1 && echo 0 > "${log}.rc" || echo "$?" > "${log}.rc"; } | tee "$log"
  rc="$(cat "${log}.rc")"
  cr_harvest "${opts[@]+"${opts[@]}"}" "$label" "$log"
  if [[ "$rc" != 0 ]]; then
    cr_error "${label}: exit ${rc}: $(grep -v -e "^${CRR_SENTINEL}" -- "$log" | tail -n 1)"
  fi
  return "$rc"
}

cr_tolerate() {
  local label rc log
  label="$1"; shift
  [[ "${1:-}" == "--" ]] && shift
  log="$(mktemp "$(_cr_tmp)/tolerate.XXXXXX")"
  { "$@" 2>&1 && echo 0 > "${log}.rc" || echo "$?" > "${log}.rc"; } | tee "$log"
  rc="$(cat "${log}.rc")"
  if [[ "$rc" != 0 ]]; then
    cr_warn "${label}: exit ${rc}: $(tail -n 1 "$log")"
  fi
  return 0
}

cr_finish() {
  _CR_FINISHING=1
  exit 0
}

_cr_print_list() {
  local title="$1"; shift
  (( $# )) || return 0
  printf '%s\n' "$title" >&2
  printf '  - %s\n' "$@" >&2
}

_cr_on_exit() {
  local rc=$? i word
  trap '' INT TERM HUP
  trap - EXIT
  if (( ! _CR_FINISHING )) && [[ "$rc" != 0 ]]; then
    case "$rc" in
      130) CR_ERRORS+=("interrupted (exit 130): the run did not finish") ;;
      143) CR_ERRORS+=("terminated (exit 143): the run did not finish") ;;
      129) CR_ERRORS+=("hung up (exit 129): the run did not finish") ;;
      *) CR_ERRORS+=("the run stopped before the end (exit ${rc})") ;;
    esac
  fi
  # Each cleanup runs in this shell, so one can still record a problem with
  # cr_error or cr_warn (a host left stopped on purpose, say) and have it listed
  # below. A cleanup never exits. Its stderr is kept for the warning when it fails.
  local errf last
  errf="$(mktemp "$(_cr_tmp)/cleanup.XXXXXX")"
  for (( i = ${#CR_CLEANUPS[@]} - 1; i >= 0; i-- )); do
    if ! eval "${CR_CLEANUPS[$i]}" 2>"$errf"; then
      last="$(tail -n 1 "$errf")"
      CR_WARNINGS+=("cleanup failed: ${CR_CLEANUPS[$i]% }: ${last}")
    fi
    cat "$errf" >&2
  done
  [[ -n "$_CR_TMP" ]] && rm -rf "$_CR_TMP"

  local final="$rc"
  if (( ${#CR_ERRORS[@]} )) && [[ "$final" == 0 ]]; then
    final=1
  fi
  {
    echo ""
    echo "==== Closing report: $(basename "$0") ===="
  } >&2
  _cr_print_list "Errors (${#CR_ERRORS[@]}):" "${CR_ERRORS[@]+"${CR_ERRORS[@]}"}"
  _cr_print_list "Warnings (${#CR_WARNINGS[@]}):" "${CR_WARNINGS[@]+"${CR_WARNINGS[@]}"}"
  if (( ${#CR_ERRORS[@]} + ${#CR_WARNINGS[@]} == 0 )); then
    echo "No errors or warnings." >&2
  fi
  _cr_print_list "Proven:" "${CR_PROVED[@]+"${CR_PROVED[@]}"}"
  _cr_print_list "Not proven:" "${CR_UNPROVED[@]+"${CR_UNPROVED[@]}"}"
  if [[ "$final" != 0 ]]; then
    word=FAILED
  elif (( ${#CR_WARNINGS[@]} )); then
    word="DONE WITH WARNINGS"
  else
    word=DONE
  fi
  verdict_banner "$word" "$final" \
    "${#CR_ERRORS[@]} error(s), ${#CR_WARNINGS[@]} warning(s)" >&2
  exit "$final"
}

trap _cr_on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

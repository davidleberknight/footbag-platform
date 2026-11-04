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
#                                   Neither is for a command whose output can carry
#                                   a secret (a privileged ssh session): both keep
#                                   its whole output on disk while the run lasts.
#   cr_run_marked [--errors ERE] [--warnings ERE] <label> -- <cmd...>
#   cr_tolerate_marked <label> -- <cmd...>
#                                   the same two for such a command: stdout passed
#                                   through untouched, stderr shown as it arrives,
#                                   and only the marked lines (and any a grammar
#                                   given matches) ever written down
#   cr_keep_marked <log>            a stdout filter keeping only the lines a half
#                                   printed under a ---FOOTBAG-<NAME>--- marker
#   cr_harvest [--errors ERE] [--warnings ERE] [--sentinels-only] <label> <log>
#                                   the same reading, over output already saved
#   cr_proved <what>, cr_unproved <what>
#                                   the closing lines: what was checked and what
#                                   was not, so no outcome is claimed unchecked
#   cr_cleanup <cmd...>             registered cleanup, run once at exit, newest
#                                   first; a failing cleanup is a warning
#   cr_finish                       ends the run with the report
#   cr_finish_with <status> <word>  ends the run on a deliberate non-zero status
#                                   that is not an error (a "pending" exit a
#                                   caller branches on), with <word> as the
#                                   verdict; any recorded error still reads
#                                   FAILED
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
#
# A script that runs another script on this library gets the child's problems in
# its own report. The outermost run names a file in FOOTBAG_CR_REPORT_TO; a run
# that finds the variable already set is nested, and at its end appends what it
# collected to that file instead of printing the full report, so the operator
# reads one list for the whole run. A file rather than a pipe, because a child
# that asks for a typed APPLY or runs Terraform needs the terminal. A nested run
# still exits as it would alone, so its caller can branch on it. Its problem
# lines mid-stream carry the remote sentinel, so a caller that also wraps it in
# cr_run lists each problem once. cr_tolerate and cr_tolerate_marked list a
# child's errors as warnings.
#
#   cr_exit_status                  in a cleanup: the status the run is ending
#                                   with (130, 143 or 129 on an interrupt)

_CR_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/verdict-banner.sh
source "${_CR_LIB_DIR}/verdict-banner.sh"
# shellcheck source=scripts/lib/closing-report-remote.sh
source "${_CR_LIB_DIR}/closing-report-remote.sh"

CR_ERRORS=()
CR_WARNINGS=()
CR_PROVED=()
CR_UNPROVED=()
CR_CLEANUPS=()
_CR_FINISHING=0
# Made once, here in the script's own shell: a directory first made inside a
# command substitution would be known only to that subshell and never removed.
if ! _CR_TMP="$(mktemp -d)"; then
  printf 'ERROR: %s cannot start: no temp directory could be made (TMPDIR=%s).\n' \
    "$(basename "$0")" "${TMPDIR:-unset}" >&2
  exit 1
fi
_CR_RC=0
_CR_VERDICT=""

# Nested only when the named file is one a parent run made: a regular file this
# user owns. A stray value exported in an operator's shell names no such file, so
# it cannot silence a run's report.
if [[ -n "${FOOTBAG_CR_REPORT_TO:-}" && -f "$FOOTBAG_CR_REPORT_TO" && -O "$FOOTBAG_CR_REPORT_TO" ]]; then
  _CR_NESTED=1
else
  _CR_NESTED=0
  FOOTBAG_CR_REPORT_TO="${_CR_TMP}/nested"
  : > "$FOOTBAG_CR_REPORT_TO"
  export FOOTBAG_CR_REPORT_TO
fi
_CR_NESTED_PREFIX=""
(( _CR_NESTED )) && _CR_NESTED_PREFIX="${CRR_SENTINEL} LISTED "

cr_error() {
  CR_ERRORS+=("$*")
  printf '%sERROR: %s\n' "$_CR_NESTED_PREFIX" "$*" >&2
}

cr_warn() {
  CR_WARNINGS+=("$*")
  printf '%sWARNING: %s\n' "$_CR_NESTED_PREFIX" "$*" >&2
}

cr_exit_status() { printf '%s' "$_CR_RC"; }

# _cr_fold <file> [errors-as-warnings]
# Adds what nested runs appended to <file> to this run's lists.
_cr_fold() {
  local file="$1" downgrade="${2:-}" kind line
  [[ -s "$file" ]] || return 0
  while IFS=$'\t' read -r kind line; do
    case "$kind" in
      ERROR)
        if [[ -n "$downgrade" ]]; then
          CR_WARNINGS+=("$line")
        else
          CR_ERRORS+=("$line")
        fi
        ;;
      WARN) CR_WARNINGS+=("$line") ;;
      PROVED) CR_PROVED+=("$line") ;;
      UNPROVED) CR_UNPROVED+=("$line") ;;
    esac
  done < "$file"
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
  : > "${log}.nested"
  { FOOTBAG_CR_REPORT_TO="${log}.nested" "$@" 2>&1 && echo 0 > "${log}.rc" || echo "$?" > "${log}.rc"; } | tee "$log"
  rc="$(cat "${log}.rc")"
  _cr_fold "${log}.nested" errors-as-warnings
  if [[ "$rc" != 0 ]]; then
    cr_warn "${label}: exit ${rc}: $(grep -v -e "^${CRR_SENTINEL}" -- "$log" | tail -n 1)"
  fi
  return 0
}

# _cr_copy_to <fd>
# Copies stdin line by line to <fd> and to stdout. Written in the shell rather
# than with `tee /dev/stderr`, which opens the descriptor afresh and so would
# truncate, or write past, a log file the caller redirected that stream to.
_cr_copy_to() {
  local fd="$1" line
  while IFS= read -r line || [[ -n "$line" ]]; do
    printf '%s\n' "$line" >&"$fd"
    printf '%s\n' "$line"
  done
}

# _cr_marked_exec <log> <errs> <warns> <cmd...>
# Runs the command with its stderr shown as it arrives and appends to <log> only
# the lines marked with the sentinel, plus any a non-empty grammar matches. With
# no grammar its stdout is passed through untouched; with one, stdout is read the
# same way, line by line, because a tool prints its problems on either stream.
# Leaves the command's status in <log>.rc, empty for 0.
_cr_marked_exec() {
  local log="$1" errs="$2" warns="$3" plumbing=0; shift 3
  local keep=(-e "^${CRR_SENTINEL} ")
  [[ -n "$errs" ]] && keep+=(-e "$errs")
  [[ -n "$warns" ]] && keep+=(-e "$warns")
  : > "$log"
  : > "${log}.rc"
  if [[ -z "$errs" && -z "$warns" ]]; then
    { { "$@" 3>&- || echo "$?" > "${log}.rc"; } 2>&1 1>&3 3>&- \
        | _cr_copy_to 2 | grep -E "${keep[@]}" >> "$log"; } 3>&1 || plumbing=$?
  else
    { { { "$@" 3>&- 4>&- || echo "$?" > "${log}.rc"; } 2>&1 1>&3 3>&- 4>&- \
          | _cr_copy_to 2 | grep -E "${keep[@]}" >> "$log"; } 3>&1 \
        | _cr_copy_to 4 | grep -E "${keep[@]}" >> "$log"; } 4>&1 || plumbing=$?
  fi
  # grep exits 1 when it kept nothing, which is the usual case.
  (( plumbing <= 1 )) || cr_error "the problem lines of a command could not be kept (status ${plumbing}); its own output above is all there is"
}

# cr_run_marked [--errors ERE] [--warnings ERE] <label> -- <cmd...>
# cr_run for a command whose output can carry a secret: a privileged ssh session,
# whose stream carries the sudo password and the values the half needs. Nothing
# it prints is kept on disk whole. Its stderr is shown as it arrives and its
# stdout is passed through untouched, so a caller can redirect or capture it; only
# the lines a remote half marked (closing-report-remote.sh), and any a grammar
# given here matches, are written down, read into this run's report and then
# removed. A grammar reads both streams, line by line. A non-zero exit is an
# error naming the status; the tool's last line is not kept, because it may be
# anything the session printed. Returns the command's status. A child script on
# this library reports into this run's report, as under cr_run. The lists live in
# this shell, so redirect the command's stdout rather than wrapping the call in a
# command substitution, whose subshell would keep them.
cr_run_marked() {
  local errs="" warns="" label rc log
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --errors) errs="$2"; shift 2 ;;
      --warnings) warns="$2"; shift 2 ;;
      *) break ;;
    esac
  done
  label="$1"; shift
  [[ "${1:-}" == "--" ]] && shift
  log="$(mktemp "$(_cr_tmp)/marked.XXXXXX")"
  _cr_marked_exec "$log" "$errs" "$warns" "$@"
  rc="$(cat "${log}.rc")"
  rc="${rc:-0}"
  cr_harvest --sentinels-only --errors "$errs" --warnings "$warns" "$label" "$log"
  rm -f -- "$log" "${log}.rc"
  if [[ "$rc" != 0 ]]; then
    cr_error "${label}: exit ${rc}; its own lines above say why"
  fi
  return "$rc"
}

# cr_tolerate_marked <label> -- <cmd...>
# cr_tolerate for a command whose output can carry a secret, kept the way
# cr_run_marked keeps it: every problem the command marked, and every error of a
# child script on this library, is listed as a warning, and a non-zero exit is a
# warning naming the status. Always returns 0.
cr_tolerate_marked() {
  local label rc log line
  label="$1"; shift
  [[ "${1:-}" == "--" ]] && shift
  log="$(mktemp "$(_cr_tmp)/tolerate-marked.XXXXXX")"
  : > "${log}.nested"
  FOOTBAG_CR_REPORT_TO="${log}.nested" _cr_marked_exec "$log" "" "" "$@"
  rc="$(cat "${log}.rc")"
  rc="${rc:-0}"
  while IFS= read -r line; do
    line="${line#"${CRR_SENTINEL} "}"
    case "$line" in
      "ERROR "*) _cr_record WARN "${label}: ${line#ERROR }" ;;
      "WARN "*) _cr_record WARN "${label}: ${line#WARN }" ;;
    esac
  done < "$log"
  _cr_fold "${log}.nested" errors-as-warnings
  rm -f -- "$log" "${log}.rc" "${log}.nested"
  if [[ "$rc" != 0 ]]; then
    cr_warn "${label}: exit ${rc}; its own lines above say why"
  fi
  return 0
}

# cr_keep_marked <log>
# A filter for a session's stdout: copies every line through, and appends to
# <log> only the lines a half printed under a ---FOOTBAG-<NAME>--- marker, the
# values a caller parses afterwards. The rest of the stream is never written down.
cr_keep_marked() {
  local log="$1"
  { _cr_copy_to 3 | grep -E -e '^---FOOTBAG-[A-Z0-9-]+---( |$)' >> "$log" || [[ $? == 1 ]]; } 3>&1
}

cr_finish() {
  _CR_FINISHING=1
  exit 0
}

cr_finish_with() {
  _CR_FINISHING=1
  _CR_VERDICT="$2"
  exit "$1"
}

_cr_print_list() {
  local title="$1"; shift
  (( $# )) || return 0
  printf '%s\n' "$title" >&2
  printf '  - %s\n' "$@" >&2
}

# A nested run's end: its lists go to the caller's file, each line prefixed with
# this script's name, and one line here says where they went.
_cr_report_to_caller() {
  local final="$1" name item
  name="$(basename "$0")"
  {
    for item in "${CR_ERRORS[@]+"${CR_ERRORS[@]}"}"; do printf 'ERROR\t%s: %s\n' "$name" "$item"; done
    for item in "${CR_WARNINGS[@]+"${CR_WARNINGS[@]}"}"; do printf 'WARN\t%s: %s\n' "$name" "$item"; done
    for item in "${CR_PROVED[@]+"${CR_PROVED[@]}"}"; do printf 'PROVED\t%s: %s\n' "$name" "$item"; done
    for item in "${CR_UNPROVED[@]+"${CR_UNPROVED[@]}"}"; do printf 'UNPROVED\t%s: %s\n' "$name" "$item"; done
  } >> "$FOOTBAG_CR_REPORT_TO"
  printf '==== %s: %d error(s), %d warning(s), exit %s; listed in the closing report of the run that started it ====\n' \
    "$name" "${#CR_ERRORS[@]}" "${#CR_WARNINGS[@]}" "$final" >&2
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
  _CR_RC="$rc"
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
  (( _CR_NESTED )) || _cr_fold "$FOOTBAG_CR_REPORT_TO"
  [[ -n "$_CR_TMP" ]] && rm -rf "$_CR_TMP"

  local final="$rc"
  if (( ${#CR_ERRORS[@]} )) && [[ "$final" == 0 ]]; then
    final=1
  fi
  if (( _CR_NESTED )); then
    _cr_report_to_caller "$final"
    exit "$final"
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
  if (( ${#CR_ERRORS[@]} )) || [[ "$final" != 0 && -z "$_CR_VERDICT" ]]; then
    word=FAILED
  elif [[ -n "$_CR_VERDICT" ]]; then
    word="$_CR_VERDICT"
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

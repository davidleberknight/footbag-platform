# shellcheck shell=bash
#
# scripts/lib/closing-report-remote.sh -- how a remote half reports its problems
# to the operator-side script that sent it.
#
# A remote half runs as root on a host, on the ssh stream behind the sudo
# password, so it cannot source anything: the caller sends this file ahead of
# the body on the same stream (`cat` it before the half). Every problem the half
# meets is printed on stderr as one marked line,
#
#   ---FOOTBAG-PROBLEM--- ERROR <message>
#   ---FOOTBAG-PROBLEM--- WARN <message>
#
# which the caller's cr_run (scripts/lib/closing-report.sh) folds into its own
# closing report, so the operator reads one list for the whole run rather than
# trusting that the host's part printed something above it. The half ends with
# crr_finish, whose exit status says whether any of those was an error.
#
# Also sourced by scripts/lib/closing-report.sh for the grammar harvest the two
# sides share.

CRR_SENTINEL='---FOOTBAG-PROBLEM---'
# The errors are counted in a file, not a variable, because a half often reports
# from inside a command substitution, whose subshell would otherwise lose the
# count and let crr_finish exit 0 over an error it printed. The file is held open
# on a descriptor every subshell inherits and unlinked at once, so a half that
# stops early, fails under errexit or is killed leaves nothing on the host; the
# count is read back through the descriptor, which outlives the name.
if ! _crr_tally="$(mktemp)"; then
  printf 'ERROR: %s cannot start: no temp file could be made (TMPDIR=%s).\n' \
    "$(basename "$0")" "${TMPDIR:-unset}" >&2
  exit 1
fi
exec {CRR_ERROR_FD}>>"$_crr_tally"
rm -f "$_crr_tally"
unset _crr_tally
# Counts kept in this shell, for a half that prints them in its own summary lines;
# the exit status is decided by the file above, which subshells share.
CRR_ERRORS=0
CRR_WARNINGS=0

crr_error() {
  printf '%s ERROR %s\n' "$CRR_SENTINEL" "$*" >&2
  echo x >&"$CRR_ERROR_FD"
  CRR_ERRORS=$((CRR_ERRORS + 1))
}

crr_warn() {
  printf '%s WARN %s\n' "$CRR_SENTINEL" "$*" >&2
  CRR_WARNINGS=$((CRR_WARNINGS + 1))
}

# cr_grep_problems <log> <error-ERE> <warning-ERE>
# Prints "ERROR<TAB>line" or "WARN<TAB>line" for each line of the log one of the
# grammars matches, error first, each line once. Marked lines are skipped: they
# are read by what they say they are, never re-judged by a grammar. An empty
# grammar matches nothing.
cr_grep_problems() {
  local log="$1" errs="$2" warns="$3" body
  [[ -s "$log" ]] || return 0
  # One grep per grammar over the whole log, not one per line: a dnf transaction
  # prints thousands of lines.
  body="$(grep -v -e "^${CRR_SENTINEL}" -- "$log" || [[ $? == 1 ]])"
  [[ -n "$body" ]] || return 0
  if [[ -n "$errs" ]]; then
    { grep -E -- "$errs" <<<"$body" || [[ $? == 1 ]]; } | awk '!seen[$0]++ { print "ERROR\t" $0 }'
  fi
  if [[ -n "$warns" ]]; then
    if [[ -n "$errs" ]]; then
      { grep -E -- "$warns" <<<"$body" | grep -vE -- "$errs" || [[ $? == 1 ]]; } | awk '!seen[$0]++ { print "WARN\t" $0 }'
    else
      { grep -E -- "$warns" <<<"$body" || [[ $? == 1 ]]; } | awk '!seen[$0]++ { print "WARN\t" $0 }'
    fi
  fi
}

# crr_run --errors <ERE> --warnings <ERE> <label> -- <command...>
# Runs the command with its output shown as it runs, then marks each line the
# grammars match, prefixed with the label, and an error for a non-zero exit. The
# grammars are required: on a host the tool is always known, and a default
# grammar would mark a package name containing "error" as one. Returns the
# command's status. The command runs as a tested command, so errexit is
# suspended inside it, as bash does for any command whose status is checked.
crr_run() {
  local errs="" warns="" label rc log kind line
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --errors) errs="$2"; shift 2 ;;
      --warnings) warns="$2"; shift 2 ;;
      *) break ;;
    esac
  done
  label="$1"; shift
  [[ "${1:-}" == "--" ]] && shift
  log="$(mktemp)"
  { "$@" 2>&1 && echo 0 > "${log}.rc" || echo "$?" > "${log}.rc"; } | tee "$log"
  rc="$(cat "${log}.rc")"
  while IFS=$'\t' read -r kind line; do
    if [[ "$kind" == ERROR ]]; then
      crr_error "${label}: ${line}"
    else
      crr_warn "${label}: ${line}"
    fi
  done < <(cr_grep_problems "$log" "$errs" "$warns")
  if [[ "$rc" != 0 ]]; then
    crr_error "${label}: exit ${rc}: $(tail -n 1 "$log")"
  fi
  rm -f "$log" "${log}.rc"
  return "$rc"
}

crr_finish() {
  local errors=0
  # A tally that cannot be read is no proof of a clean run.
  if [[ ! -r "/proc/$$/fd/${CRR_ERROR_FD}" || -s "/proc/$$/fd/${CRR_ERROR_FD}" ]]; then
    errors=1
  fi
  exit "$errors"
}

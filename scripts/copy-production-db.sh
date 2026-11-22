#!/usr/bin/env bash
# copy-production-db.sh
#
# Builds a copy of a host's live database on that host, with every credential
# and payment-provider identifier removed and everything else kept, member
# personal data included. Once production is live, every non-production
# database is such a copy of production, and every migration is rehearsed on a
# fresh one before it runs on production; before then a copy can be made on
# either host to prove the mechanism.
#
# WHAT IT DOES.
#
#   1. Proves the host it reached records the environment it was asked for.
#   2. On production, states what it does and takes the typed APPLY at this
#      terminal; it refuses to run there without one.
#   3. Over one ssh session, runs the copy builder once in a throwaway web
#      container on the host. The builder takes an online backup of the live
#      database, so the site keeps serving, and builds the copy table by table
#      from it, following the column register. It refuses a snapshot holding
#      any table or column the register does not name, and refuses to finish
#      unless the copy passes its integrity, foreign-key and residue checks.
#   4. Replaces the previous copy on the host in one rename, only after a clean
#      build. A refused or interrupted run leaves the previous copy as it was.
#
# WHAT IT DOES NOT DO. It moves nothing off the host and changes nothing in the
# live database. Unstripped data never leaves the host.
#
# WHAT IT REFUSES.
#
#   - A target it was not given, or a host that records a different one.
#   - On production, a run nobody confirmed at a terminal.
#   - A host with too little free space for a snapshot, a build and the
#     previous copy at once.
#
# Usage. The host sudo password is read from stdin, line 1. Which file holds it
# follows the account the alias connects as:
#
#   shared footbag account:  ~/AWS/AWS_OPERATOR.txt   ~/AWS/AWS_OPERATOR_PRODUCTION.txt
#   your own named account:  ~/AWS/DEV_TESTER_HOST.txt  (staging only; none on production)
#
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/copy-production-db.sh --target staging
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/copy-production-db.sh --target production
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --help|-h)
      sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument '$1' (try --help)" >&2
      exit 2
      ;;
  esac
done

# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
require_target "$TARGET" staging production || exit 2

SSH_ALIAS="footbag-${TARGET}"
REMOTE_HALF="${SCRIPT_DIR}/internal/copy-production-db-remote.sh"
REMOTE_REPORT_LIB="${SCRIPT_DIR}/lib/closing-report-remote.sh"
[[ -r "$REMOTE_HALF" ]] || cr_die "missing remote half: $REMOTE_HALF"
[[ -r "$REMOTE_REPORT_LIB" ]] || cr_die "missing remote-half report library: $REMOTE_REPORT_LIB"

require_ssh_alias "$SSH_ALIAS" || exit 1
require_operator_stdin "scripts/copy-production-db.sh --target ${TARGET}" \
  "$SSH_ALIAS" "$TARGET" || exit 1
require_host_is "$SSH_ALIAS" "$TARGET" || exit 1

if [[ "$TARGET" == "production" ]]; then
  echo ""
  echo "About to build a copy of production's live database on ${SSH_ALIAS}, in the"
  echo "database directory, replacing any previous copy there. The live database is"
  echo "only read, through an online backup, and the site keeps serving. The copy"
  echo "keeps members' personal data and drops every credential and payment-provider"
  echo "identifier. Nothing leaves the host."
  echo ""
  confirm_from_tty "Type 'APPLY' to build the copy on ${TARGET}: " "APPLY" \
    || cr_die "not confirmed; nothing was built"
fi

echo "== building a copy of the ${TARGET} database on ${SSH_ALIAS} =="
send_copy() {
  {
    printf '%s\n' "$SUDO_PASS"
    cat "$REMOTE_REPORT_LIB" "$REMOTE_HALF"
  } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$SSH_ALIAS" 'sudo -k -S -p "" bash'
}
if ! cr_run_marked "copy build on ${SSH_ALIAS}" -- send_copy || (( ${#CR_ERRORS[@]} )); then
  cr_unproved "a copy of the ${TARGET} database: the build was refused or did not finish, and any previous copy is unchanged"
  cr_finish
fi
cr_proved "a copy of the ${TARGET} database is built on ${SSH_ALIAS}, with integrity, foreign keys and every residue check clean (the builder's own checks)"
cr_unproved "the copy on any other environment: this run moves nothing off ${SSH_ALIAS}"
cr_finish

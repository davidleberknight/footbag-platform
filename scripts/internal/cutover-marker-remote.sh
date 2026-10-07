#!/usr/bin/env bash
# Root-side body of scripts/cutover-marker-host.sh. Never run directly: it expects
# the variable assignments its wrapper emits ahead of this body on the same stdin
# stream, and it runs as root because the wrapper pipes it into sudo.
#
# Invoked via:
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'MARKER_ACTION=%q\n' "$action"; printf 'MARKER_DRY_RUN=%q\n' "$dry";
#     cat scripts/internal/cutover-marker-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash'
#
# It runs the host's deployed cutover-marker.sh, which owns both markers and how
# they move. For a move it passes --confirmed-at-workstation, because the wrapper
# has already taken the typed APPLY at the operator's terminal and this run has no
# terminal of its own. Every call reads from /dev/null: this body arrives on the
# remote shell's stdin, and a child reading stdin would swallow the rest of it.
#
# It ends by reporting both markers as machine lines, MARKER_ENV=<state> and
# MARKER_DB=<state>, read by a fresh --status after any move, so the wrapper
# judges the outcome rather than the exit status.
#
# Required shell variables (provided by the caller's prepended assignments):
#   MARKER_ACTION   status | set-complete | set-reversed
#   MARKER_DRY_RUN  yes | no
#
# Optional, for the tests only:
#   MARKER_SCRIPT   the cutover-marker.sh to run (default: the deployed copy)
set -euo pipefail

: "${MARKER_ACTION:?remote half requires MARKER_ACTION}"
MARKER_DRY_RUN="${MARKER_DRY_RUN:-no}"
MARKER_SCRIPT="${MARKER_SCRIPT:-/srv/footbag/scripts/cutover-marker.sh}"
[[ -r "$MARKER_SCRIPT" ]] || { echo "ERROR: ${MARKER_SCRIPT} is not on this host; deploy first." >&2; exit 1; }

case "$MARKER_ACTION" in
  status) ;;
  set-complete|set-reversed)
    args=(--set "${MARKER_ACTION#set-}" --confirmed-at-workstation)
    [[ "$MARKER_DRY_RUN" == "yes" ]] && args+=(--dry-run)
    bash "$MARKER_SCRIPT" "${args[@]}" </dev/null
    ;;
  *) echo "ERROR: unknown MARKER_ACTION '${MARKER_ACTION}'." >&2; exit 2 ;;
esac

status_out="$(bash "$MARKER_SCRIPT" --status </dev/null)"
printf '%s\n' "$status_out"
env_state="$(sed -n 's/^ *FOOTBAG_CUTOVER_COMPLETE: *//p' <<<"$status_out" | tail -1)"
db_state="$(sed -n 's/^ *post_cutover: *//p' <<<"$status_out" | tail -1)"
echo "MARKER_ENV=${env_state}"
echo "MARKER_DB=${db_state}"

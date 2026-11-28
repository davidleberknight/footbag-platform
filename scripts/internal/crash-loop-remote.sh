#!/usr/bin/env bash
# Root-side body of scripts/crash-loop-host.sh. Never run directly: it expects
# the variable assignments its wrapper emits ahead of this body on the same stdin
# stream, and it runs as root because the wrapper pipes it into sudo.
#
# Invoked via:
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'CRASH_LOOP_ACTION=%q\n' "$action"; printf 'CRASH_LOOP_SERVICE=%q\n' "$svc";
#     cat scripts/lib/closing-report-remote.sh scripts/internal/crash-loop-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash'
#
# Its problems are marked lines from the report library sent ahead of it, which
# the wrapper's closing report lists; it ends with crr_finish.
#
# It reads, clears or (on staging only) drills the crash-loop breaker's trip,
# and ends by reporting the state as machine lines for the wrapper to judge:
#   CRASH_LOOP_MARKER=<service|none|unknown>
#   CRASH_LOOP_CONTAINER=<service> <status|absent> <health|none|absent>
# Every call reads from /dev/null: this body arrives on the remote shell's stdin,
# and a child reading stdin would swallow the rest of it.
#
# Required shell variables (provided by the caller's prepended assignments):
#   CRASH_LOOP_ACTION   status | clear | drill
#   CRASH_LOOP_SERVICE  for drill: worker or image
#
# Optional, for the tests only:
#   CRASH_LOOP_STATE_DIR      the monitor's state directory
#   CRASH_LOOP_ENV_PATH       the host env file
#   CRASH_LOOP_BREAKER        the deployed crash-loop-breaker.sh
#   CRASH_LOOP_DOCKER_BIN     docker client
#   CRASH_LOOP_SYSTEMCTL_BIN  systemctl
#   CRASH_LOOP_WAIT_SECONDS   how long a clear waits for the containers
set -euo pipefail

: "${CRASH_LOOP_ACTION:?remote half requires CRASH_LOOP_ACTION}"
STATE_DIR="${CRASH_LOOP_STATE_DIR:-/var/lib/footbag-container-monitor}"
ENV_PATH="${CRASH_LOOP_ENV_PATH:-/srv/footbag/env}"
BREAKER="${CRASH_LOOP_BREAKER:-/srv/footbag/scripts/crash-loop-breaker.sh}"
DOCKER_BIN="${CRASH_LOOP_DOCKER_BIN:-docker}"
SYSTEMCTL_BIN="${CRASH_LOOP_SYSTEMCTL_BIN:-systemctl}"
WAIT_SECONDS="${CRASH_LOOP_WAIT_SECONDS:-180}"
MARKER="${STATE_DIR}/crash-loop-tripped"
EXITS_FILE="${STATE_DIR}/exits"
SERVICES=(nginx web worker image)

[[ -r "$BREAKER" ]] || { crr_error "${BREAKER} is not on this host; deploy first."; exit 1; }

marker_service() {
  [[ -e "$MARKER" ]] || { echo none; return 0; }
  local svc=""
  [[ -r "$MARKER" ]] && svc="$(sed -n 's/^container=//p' "$MARKER" | tail -n 1)"
  case " ${SERVICES[*]} " in
    *" ${svc} "*) [[ -n "$svc" ]] && { echo "$svc"; return 0; } ;;
  esac
  echo unknown
}

container_state() {
  local svc="$1" id="" state=""
  id="$("$DOCKER_BIN" ps --all --filter "label=com.docker.compose.service=${svc}" --format '{{.ID}}' </dev/null | head -n 1)"
  if [[ -z "$id" ]]; then
    echo "absent absent"
    return 0
  fi
  state="$("$DOCKER_BIN" inspect --format \
    '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" </dev/null)"
  echo "$state"
}

report() {
  local svc
  [[ -r "$MARKER" ]] && sed 's/^/  marker: /' "$MARKER"
  echo "CRASH_LOOP_MARKER=$(marker_service)"
  for svc in "${SERVICES[@]}"; do
    echo "CRASH_LOOP_CONTAINER=${svc} $(container_state "$svc")"
  done
}

all_ready() {
  local svc status health
  for svc in "${SERVICES[@]}"; do
    read -r status health <<<"$(container_state "$svc")"
    [[ "$status" == running && ( "$health" == healthy || "$health" == none ) ]] || return 1
  done
}

case "$CRASH_LOOP_ACTION" in
  status)
    report
    ;;

  clear)
    if [[ ! -e "$MARKER" ]]; then
      echo "no crash-loop trip is recorded; nothing to clear"
      report
      crr_finish
    fi
    echo "clearing the trip:"
    sed 's/^/  /' "$MARKER"
    rm -f -- "$MARKER" "$EXITS_FILE"
    if "$SYSTEMCTL_BIN" is-failed --quiet footbag.service </dev/null; then
      "$SYSTEMCTL_BIN" reset-failed footbag.service </dev/null
    fi
    if "$SYSTEMCTL_BIN" is-active --quiet footbag.service </dev/null; then
      echo "footbag.service is running; bringing the stopped container back up"
      "$SYSTEMCTL_BIN" reload footbag.service </dev/null
    else
      echo "starting footbag.service"
      "$SYSTEMCTL_BIN" start footbag.service </dev/null
    fi
    waited=0
    until all_ready; do
      if (( waited >= WAIT_SECONDS )); then
        crr_warn "the containers were not all running and healthy after ${WAIT_SECONDS}s"
        break
      fi
      sleep 5
      waited=$(( waited + 5 ))
    done
    report
    ;;

  drill)
    env_name="$(sed -n 's/^FOOTBAG_ENV=//p' "$ENV_PATH" | tail -n 1)"
    if [[ "$env_name" != staging ]]; then
      crr_error "this host records FOOTBAG_ENV=${env_name:-<none>}; the crash-loop drill runs on staging only."
      exit 1
    fi
    case "${CRASH_LOOP_SERVICE:-}" in
      worker|image) ;;
      *) crr_error "the drill trips the worker or the image processor only, never the site itself."; exit 2 ;;
    esac
    if [[ -e "$MARKER" ]]; then
      crr_error "a trip is already recorded; clear it before drilling."
      report
      exit 1
    fi
    limit="$(sed -n 's/^LIMIT=\([0-9][0-9]*\)$/\1/p' "$BREAKER" | head -n 1)"
    [[ -n "$limit" ]] || { crr_error "could not read the breaker's limit from ${BREAKER}."; exit 1; }
    # Recorded exactly as the monitor records a run that saw this many
    # failures, so the breaker's own count, trip and stop are what is drilled.
    printf '%s %s %s\n' "$(date +%s)" "$CRASH_LOOP_SERVICE" "$limit" >> "$EXITS_FILE"
    echo "recorded ${limit} failures for ${CRASH_LOOP_SERVICE}; running the monitor and the breaker now"
    if ! "$SYSTEMCTL_BIN" start footbag-container-monitor.service </dev/null; then
      crr_warn "the monitor unit's run did not succeed; journalctl -u footbag-container-monitor.service says why"
    fi
    report
    ;;

  *)
    crr_error "unknown CRASH_LOOP_ACTION '${CRASH_LOOP_ACTION}'."
    exit 2
    ;;
esac
crr_finish

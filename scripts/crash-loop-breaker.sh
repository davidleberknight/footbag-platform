#!/usr/bin/env bash
# scripts/crash-loop-breaker.sh -- stops a container that keeps crashing after
# it has started, and keeps it stopped until an operator clears it (host-side).
#
# Why it exists. Every container restarts on its own after a crash or an
# out-of-memory kill, so an occasional failure heals without anyone acting. A
# container that fails over and over after each successful start is different:
# Docker resets its restart delay every time the container has run ten seconds,
# so under the stack's restart policy it would cycle without end, holding the
# host's CPU and memory while the site misbehaves. Docker's own retry cap
# counts over a container's whole life and gives up bringing it back after a
# daemon restart, so it cannot bound a loop within a window; this does.
#
# The rule. A container with LIMIT failures (crashes or out-of-memory kills, as
# the container monitor counts them) inside the last WINDOW seconds is tripped:
#   - web or nginx: the site cannot serve without them, so footbag.service is
#     stopped and visitors get the maintenance page;
#   - worker or image: the site can serve without them, so only that container
#     is stopped and the rest of the site stays up.
# A tripped container stays down, through deploys and reboots, until the
# operator clears the trip with scripts/crash-loop-host.sh --clear. While it is
# tripped the container monitor reports it unhealthy, so its alarm fires.
#
# Modes:
#   --check        the monitor timer's run, after container-monitor.sh: trips a
#                  container past the limit, or holds an existing trip
#   --start-guard  footbag.service ExecStartPre: refuses to start the site while
#                  web or nginx is tripped, printing the command that clears it
#   --start-hold   footbag.service ExecStartPost: stops a tripped worker or
#                  image again after the stack has been brought up
#
# Files, in the container monitor's state directory:
#   exits              one line per monitor run that saw failures:
#                      "<epoch> <service> <count>", written by the monitor
#   crash-loop-tripped the trip marker: container=, tripped_at=, failures=
#
# Refuses: an unknown mode; a missing or unwritable state directory in --check.
#
# Test seams (each says on stderr when in use):
#   FOOTBAG_BREAKER_DOCKER_BIN     docker client
#   FOOTBAG_BREAKER_SYSTEMCTL_BIN  systemctl
#   FOOTBAG_BREAKER_NOW            the current time, in epoch seconds
# STATE_DIRECTORY is set by systemd from the monitor unit's StateDirectory=.
set -euo pipefail

# shellcheck source=lib/closing-report.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/closing-report.sh"

LIMIT=5
WINDOW=1800
SERVICES=(nginx web worker image)

seam() {
  local name="$1" value="$2"
  [[ -n "$value" ]] && echo "crash-loop-breaker: test seam ${name} in use: ${value}" >&2
  return 0
}
seam FOOTBAG_BREAKER_DOCKER_BIN "${FOOTBAG_BREAKER_DOCKER_BIN:-}"
seam FOOTBAG_BREAKER_SYSTEMCTL_BIN "${FOOTBAG_BREAKER_SYSTEMCTL_BIN:-}"
seam FOOTBAG_BREAKER_NOW "${FOOTBAG_BREAKER_NOW:-}"

DOCKER_BIN="${FOOTBAG_BREAKER_DOCKER_BIN:-docker}"
SYSTEMCTL_BIN="${FOOTBAG_BREAKER_SYSTEMCTL_BIN:-systemctl}"
NOW="${FOOTBAG_BREAKER_NOW:-$(date +%s)}"
STATE_DIR="${STATE_DIRECTORY:-/var/lib/footbag-container-monitor}"
EXITS_FILE="${STATE_DIR}/exits"
MARKER="${STATE_DIR}/crash-loop-tripped"
# The environment name, only for the command printed to clear a trip. The main
# unit passes it from the host env file; the monitor unit does not load that
# file, so the one line is read from it here.
ENV_NAME="${FOOTBAG_ENV:-}"
if [[ -z "$ENV_NAME" && -r /srv/footbag/env ]]; then
  ENV_NAME="$(sed -n 's/^FOOTBAG_ENV=//p' /srv/footbag/env | tail -n 1)"
fi
CLEAR_CMD="bash scripts/crash-loop-host.sh --target ${ENV_NAME:-<environment>} --clear"

MODE="${1:-}"
case "$MODE" in
  --check|--start-guard|--start-hold) ;;
  *) cr_die "unknown mode '${MODE}'; use --check, --start-guard or --start-hold" ;;
esac

# The tripped container named by the marker, or "unknown" when a marker stands
# that cannot be read: a trip nobody can name is held as the site's own.
tripped_service() {
  [[ -e "$MARKER" ]] || return 0
  local svc=""
  [[ -r "$MARKER" ]] && svc="$(sed -n 's/^container=//p' "$MARKER" | tail -n 1)"
  case " ${SERVICES[*]} " in
    *" ${svc} "*) [[ -n "$svc" ]] && { echo "$svc"; return 0; } ;;
  esac
  echo unknown
}

is_site_service() { [[ "$1" == web || "$1" == nginx || "$1" == unknown ]]; }

# Stops the named service's running container and proves none is left running.
# A stopped container is one Docker counts as stopped by hand, so its restart
# policy leaves it down.
stop_container() {
  local svc="$1" ids="" out=""
  if ! ids="$("$DOCKER_BIN" ps --filter "label=com.docker.compose.service=${svc}" --format '{{.ID}}' 2>&1)"; then
    cr_error "docker ps failed for ${svc}: ${ids##*$'\n'}"
    return 0
  fi
  if [[ -z "$ids" ]]; then
    cr_proved "the ${svc} container is not running"
    return 0
  fi
  local id
  while read -r id; do
    [[ -n "$id" ]] || continue
    if ! out="$("$DOCKER_BIN" stop --time 30 "$id" 2>&1)"; then
      cr_error "docker stop failed for ${svc} (${id}): ${out##*$'\n'}"
    fi
  done <<<"$ids"
  if ! ids="$("$DOCKER_BIN" ps --filter "label=com.docker.compose.service=${svc}" --format '{{.ID}}' 2>&1)"; then
    cr_error "docker ps failed for ${svc} after the stop: ${ids##*$'\n'}"
  elif [[ -n "$ids" ]]; then
    cr_error "the ${svc} container is still running after the stop"
  else
    cr_proved "the ${svc} container is stopped"
  fi
}

# Asks for footbag.service to stop without waiting: its stop takes the final
# backup and can run for minutes, and the next minute's run proves the outcome.
stop_site() {
  local out=""
  if "$SYSTEMCTL_BIN" is-active --quiet footbag.service; then
    if out="$("$SYSTEMCTL_BIN" stop --no-block footbag.service 2>&1)"; then
      cr_proved "footbag.service stop requested; the next run reads it stopped"
    else
      cr_error "systemctl stop footbag.service failed: ${out##*$'\n'}"
    fi
  else
    cr_proved "footbag.service is not active"
  fi
}

hold() {
  local svc="$1"
  if is_site_service "$svc"; then
    stop_site
  else
    stop_container "$svc"
  fi
}

TRIPPED="$(tripped_service)"

case "$MODE" in
  --start-guard)
    if [[ -n "$TRIPPED" ]] && is_site_service "$TRIPPED"; then
      echo "footbag: REFUSING TO START. The ${TRIPPED} container was stopped for crashing" >&2
      echo "         ${LIMIT} or more times within $(( WINDOW / 60 )) minutes. Marker: ${MARKER}" >&2
      [[ -r "$MARKER" ]] && sed 's/^/           /' "$MARKER" >&2
      echo "         Find and fix the cause, then from a workstation clear it and start the site:" >&2
      echo "           ${CLEAR_CMD}" >&2
      cr_die "the ${TRIPPED} container is tripped for a crash loop; the site stays stopped"
    fi
    cr_proved "no site container is tripped for a crash loop"
    cr_finish
    ;;
  --start-hold)
    if [[ -n "$TRIPPED" ]] && ! is_site_service "$TRIPPED"; then
      echo "the ${TRIPPED} container is tripped for a crash loop; stopping it again after the start"
      stop_container "$TRIPPED"
    else
      cr_proved "no container is held down for a crash loop"
    fi
    cr_finish
    ;;
esac

[[ -d "$STATE_DIR" && -w "$STATE_DIR" ]] || cr_die "state directory ${STATE_DIR} is missing or not writable"

if [[ -n "$TRIPPED" ]]; then
  echo "the ${TRIPPED} container is tripped for a crash loop; holding it down until: ${CLEAR_CMD}"
  hold "$TRIPPED"
  cr_finish
fi

# Keep only the failures inside the window, so the file never outgrows it and a
# line from a clock that went backwards is not counted twice.
declare -A FAILURES=()
for svc in "${SERVICES[@]}"; do FAILURES[$svc]=0; done
KEPT=()
if [[ -r "$EXITS_FILE" ]]; then
  while read -r t svc n; do
    [[ "$t" =~ ^[0-9]+$ && "$n" =~ ^[0-9]+$ && -n "$svc" ]] || continue
    [[ -n "${FAILURES[$svc]+set}" ]] || continue
    (( t > NOW - WINDOW && t <= NOW )) || continue
    FAILURES[$svc]=$(( FAILURES[$svc] + n ))
    KEPT+=("$t $svc $n")
  done < "$EXITS_FILE"
  tmp="$(mktemp "${STATE_DIR}/.exits.XXXXXX")"
  cr_cleanup rm -f -- "$tmp"
  (( ${#KEPT[@]} )) && printf '%s\n' "${KEPT[@]}" > "$tmp"
  mv -f -- "$tmp" "$EXITS_FILE"
fi

for svc in "${SERVICES[@]}"; do
  echo "${svc}: ${FAILURES[$svc]} failures in the last $(( WINDOW / 60 )) minutes (limit ${LIMIT})"
done

for svc in "${SERVICES[@]}"; do
  (( FAILURES[$svc] >= LIMIT )) || continue
  tmp="$(mktemp "${STATE_DIR}/.tripped.XXXXXX")"
  cr_cleanup rm -f -- "$tmp"
  printf 'container=%s\ntripped_at=%s\nfailures=%s\n' "$svc" "$NOW" "${FAILURES[$svc]}" > "$tmp"
  chmod 0644 "$tmp"
  mv -f -- "$tmp" "$MARKER"
  cr_warn "the ${svc} container failed ${FAILURES[$svc]} times in $(( WINDOW / 60 )) minutes and is tripped; it stays down until: ${CLEAR_CMD}"
  hold "$svc"
  cr_finish
done

cr_proved "no container is past ${LIMIT} failures in $(( WINDOW / 60 )) minutes"
cr_finish

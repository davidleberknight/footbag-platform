#!/usr/bin/env bash
# scripts/container-monitor.sh -- per-container health for the CloudWatch
# alarms (host-side).
#
# Why it exists. The four containers (nginx, web, worker, image) restart on
# their own after a crash or an out-of-memory kill, so a container that dies and
# comes back leaves no lasting sign on the host: the host survives the kill by
# design, the site keeps answering, and no deploy is running to notice. AWS
# offers no collector for plain Docker on this kind of host, so this script asks
# Docker itself, once a minute, and hands the answer to the CloudWatch agent
# already running here, through the agent's StatsD input on the loopback
# address. The agent publishes with its own credential; this script holds none.
#
# What it publishes, each tagged with the compose service name as `container`:
#   container_memory_percent   working-set memory as a percent of the
#                              container's limit: memory.current minus the
#                              inactive file cache, the same figure the web
#                              readiness check uses (gauge)
#   container_oom_kills        out-of-memory kills since the last run (counter)
#   container_crashes          exits since the last run that were neither a
#                              clean exit (0), a requested stop (143) nor a
#                              forced stop (137) (counter)
#   container_unhealthy        1 while the container is not running or its
#                              healthcheck reports unhealthy, else 0 (gauge)
# and, untagged and last, container_monitor_heartbeat (gauge), so a monitor
# that stops running, or a run that fails part way, is itself an alarm.
#
# Zeros are published, so the counters and gauges are continuous and a missing
# point means the monitor did not run. While footbag.service is deliberately
# stopped (a maintenance window, a restore) only the heartbeat is published,
# so a planned stop raises nothing.
#
# Events are read from `docker events` between the moment the last run read up
# to and now, both fixed timestamps, so consecutive runs neither overlap nor
# leave a gap. The stored moment advances only after the readings were sent.
# OOM kills are counted from Docker's own `oom` events rather than inferred from
# exit codes, because an exit of 137 is also what a slow stop ends in.
#
# Invoked by ops/systemd/footbag-container-monitor.timer every minute. The
# standard deploy ships this script, installs both units and enables the timer.
# Refuses nothing: it is a reader, and every problem it meets is in its closing
# report on the journal.
#
# Test seams (each says on stderr when in use):
#   FOOTBAG_MONITOR_DOCKER_BIN     docker client
#   FOOTBAG_MONITOR_SYSTEMCTL_BIN  systemctl
#   FOOTBAG_MONITOR_CGROUP_ROOT    cgroup v2 mount (default /sys/fs/cgroup)
#   FOOTBAG_MONITOR_STATSD_SINK    a file the StatsD lines are appended to
#                                  instead of the agent's UDP port
#   FOOTBAG_MONITOR_NOW            the current time, in epoch seconds
# STATE_DIRECTORY is set by systemd from the unit's StateDirectory=.
set -euo pipefail

# shellcheck source=lib/closing-report.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/closing-report.sh"

SERVICES=(nginx web worker image)
STATSD_ADDR=127.0.0.1
STATSD_PORT=8125

seam() {
  local name="$1" value="$2"
  [[ -n "$value" ]] && echo "container-monitor: test seam ${name} in use: ${value}" >&2
  return 0
}
seam FOOTBAG_MONITOR_DOCKER_BIN "${FOOTBAG_MONITOR_DOCKER_BIN:-}"
seam FOOTBAG_MONITOR_SYSTEMCTL_BIN "${FOOTBAG_MONITOR_SYSTEMCTL_BIN:-}"
seam FOOTBAG_MONITOR_CGROUP_ROOT "${FOOTBAG_MONITOR_CGROUP_ROOT:-}"
seam FOOTBAG_MONITOR_STATSD_SINK "${FOOTBAG_MONITOR_STATSD_SINK:-}"
seam FOOTBAG_MONITOR_NOW "${FOOTBAG_MONITOR_NOW:-}"

DOCKER_BIN="${FOOTBAG_MONITOR_DOCKER_BIN:-docker}"
SYSTEMCTL_BIN="${FOOTBAG_MONITOR_SYSTEMCTL_BIN:-systemctl}"
CGROUP_ROOT="${FOOTBAG_MONITOR_CGROUP_ROOT:-/sys/fs/cgroup}"
STATSD_SINK="${FOOTBAG_MONITOR_STATSD_SINK:-}"
NOW="${FOOTBAG_MONITOR_NOW:-$(date +%s)}"
STATE_DIR="${STATE_DIRECTORY:-/var/lib/footbag-container-monitor}"
CURSOR_FILE="${STATE_DIR}/events-until"

[[ -d "$STATE_DIR" && -w "$STATE_DIR" ]] || cr_die "state directory ${STATE_DIR} is missing or not writable"

LINES=()
gauge()   { LINES+=("$1:$2|g${3:+|#container:$3}"); }
counter() { LINES+=("$1:$2|c|#container:$3"); }

send_lines() {
  local line
  for line in "$@"; do
    if [[ -n "$STATSD_SINK" ]]; then
      printf '%s\n' "$line" >> "$STATSD_SINK"
    else
      # One datagram per reading; a UDP send to loopback cannot report whether
      # the agent read it, which is what the heartbeat alarm is for.
      printf '%s' "$line" > "/dev/udp/${STATSD_ADDR}/${STATSD_PORT}"
    fi
  done
}

# A planned stop raises nothing: the heartbeat alone says the monitor ran.
if ! "$SYSTEMCTL_BIN" is-active --quiet footbag.service; then
  echo "footbag.service is not active; publishing the heartbeat only"
  send_lines "container_monitor_heartbeat:1|g"
  printf '%s\n' "$NOW" > "$CURSOR_FILE"
  cr_proved "heartbeat sent while footbag.service is stopped"
  cr_finish
fi

since="$NOW"
if [[ -r "$CURSOR_FILE" ]]; then
  since="$(< "$CURSOR_FILE")"
fi
# A cursor that is unreadable, in the future or more than a day old starts a
# fresh minute rather than replaying or skipping a long stretch.
if ! [[ "$since" =~ ^[0-9]+$ ]] || (( since > NOW || NOW - since > 86400 )); then
  since=$(( NOW - 60 ))
fi

events=""
if ! events="$("$DOCKER_BIN" events --since "$since" --until "$NOW" \
      --filter type=container --filter event=oom --filter event=die \
      --format '{{.Status}} {{index .Actor.Attributes "com.docker.compose.service"}} {{index .Actor.Attributes "exitCode"}}' 2>&1)"; then
  cr_error "docker events failed: ${events##*$'\n'}"
  events=""
fi

for svc in "${SERVICES[@]}"; do
  oom=0
  crashes=0
  while read -r status service code; do
    [[ "$service" == "$svc" ]] || continue
    case "$status" in
      oom) oom=$(( oom + 1 )) ;;
      die) case "$code" in 0|137|143) ;; *) crashes=$(( crashes + 1 )) ;; esac ;;
    esac
  done <<<"$events"

  unhealthy=1
  pct=""
  info=""
  if info="$("$DOCKER_BIN" ps --all --filter "label=com.docker.compose.service=${svc}" \
        --format '{{.ID}}' 2>&1)" && [[ -n "$info" ]]; then
    id="${info%%$'\n'*}"
    if state="$("$DOCKER_BIN" inspect --format \
          '{{.Id}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>&1)"; then
      read -r full_id run_state health <<<"$state"
      if [[ "$run_state" == "running" && "$health" != "unhealthy" ]]; then
        unhealthy=0
      fi
      cg=""
      for candidate in "${CGROUP_ROOT}/system.slice/docker-${full_id}.scope" "${CGROUP_ROOT}/docker/${full_id}"; do
        [[ -r "${candidate}/memory.current" ]] && { cg="$candidate"; break; }
      done
      if [[ -n "$cg" ]]; then
        max="$(< "${cg}/memory.max")"
        current="$(< "${cg}/memory.current")"
        inactive="$(grep -oE '^inactive_file [0-9]+' "${cg}/memory.stat" | cut -d' ' -f2 || [[ $? == 1 ]])"
        inactive="${inactive:-0}"
        if [[ "$max" =~ ^[0-9]+$ ]] && (( max > 0 )); then
          ws=$(( current > inactive ? current - inactive : 0 ))
          x100=$(( ws * 10000 / max ))
          pct="$(printf '%d.%02d' $(( x100 / 100 )) $(( x100 % 100 )))"
        fi
      elif [[ "$run_state" == "running" ]]; then
        cr_warn "no cgroup found for running container ${svc} (${full_id:0:12}); its memory was not read"
      fi
    else
      cr_error "docker inspect failed for ${svc}: ${state##*$'\n'}"
    fi
  elif [[ -n "$info" ]]; then
    cr_error "docker ps failed for ${svc}: ${info##*$'\n'}"
  fi

  [[ -n "$pct" ]] && gauge container_memory_percent "$pct" "$svc"
  counter container_oom_kills "$oom" "$svc"
  counter container_crashes "$crashes" "$svc"
  gauge container_unhealthy "$unhealthy" "$svc"
  echo "${svc}: memory=${pct:-unread} oom=${oom} crashes=${crashes} unhealthy=${unhealthy}"
done

send_lines "${LINES[@]}"

# Last, and only for a run that met no error: a monitor that cannot see Docker
# is not a monitor that is running. The cursor moves only then too, so the
# events a failed run could not read are read again in full by the next one.
if (( ${#CR_ERRORS[@]} == 0 )); then
  printf '%s\n' "$NOW" > "$CURSOR_FILE"
  send_lines "container_monitor_heartbeat:1|g"
  cr_proved "readings sent for ${SERVICES[*]} and the heartbeat after them"
else
  cr_unproved "the heartbeat: withheld because this run met an error"
fi
cr_finish

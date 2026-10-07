#!/usr/bin/env bash
# Root-side body of scripts/restart-host.sh. Never run directly: it runs as root
# because the wrapper pipes it into sudo, after the password line on the same
# stdin stream.
#
# Invoked via:
#   { printf '%s\n' "$SUDO_PASS"; cat scripts/internal/restart-host-remote.sh; } \
#     | ssh REMOTE 'sudo -k -S -p "" bash'
#
# A restart is judged on the outcome, not on systemctl's exit status: the unit
# reports active the moment compose has spawned the containers, while the web
# container is still inside its start period and nginx is still gated on it. So
# after the restart this polls until all three hold together: the unit is
# active, every container is running and none is unhealthy or still starting,
# and the application's readiness endpoint answers from inside the web
# container. The probe runs inside the container because nginx refuses any
# request without the origin-verify header, and a host-side probe could only
# send it by putting the secret in a command line.
#
# Optional shell variables, overridable so this body also runs standalone for
# its tests:
#   ENV_PATH     the host env file compose reads (default /srv/footbag/env)
#   POLL_TRIES   how many two-second polls to allow (default 30, about a minute)
set -euo pipefail

ENV_PATH="${ENV_PATH:-/srv/footbag/env}"
POLL_TRIES="${POLL_TRIES:-30}"
[[ -r "$ENV_PATH" ]] || { echo "ERROR: $ENV_PATH not readable." >&2; exit 1; }

compose() {
  # Every compose call reads from /dev/null: this body arrives on the remote
  # shell's stdin, and `compose exec -T` would otherwise forward the rest of the
  # script into the container and end this run early with a clean exit.
  docker compose --env-file "$ENV_PATH" \
    -f /srv/footbag/docker/docker-compose.yml \
    -f /srv/footbag/docker/docker-compose.prod.yml \
    "$@" </dev/null
}

echo "==> systemctl restart footbag"
systemctl restart footbag

# Every container running, and none unhealthy or still starting. A container
# with no healthcheck reports an empty health, which counts as healthy once it is
# running. An empty listing is not healthy: it means compose reached nothing.
containers_healthy() {
  local listing line service state health
  listing="$(compose ps --all --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null)" || return 1
  [[ -n "$listing" ]] || return 1
  while IFS= read -r line; do
    read -r service state health <<<"$line"
    [[ "$state" == "running" ]] || return 1
    [[ -z "$health" || "$health" == "healthy" ]] || return 1
  done <<<"$listing"
  return 0
}

healthy=0
for (( i = 1; i <= POLL_TRIES; i++ )); do
  if systemctl is-active --quiet footbag.service \
     && containers_healthy \
     && compose exec -T web wget -qO- --timeout=3 http://localhost:3000/health/ready >/dev/null 2>&1; then
    healthy=1
    break
  fi
  (( i < POLL_TRIES )) && sleep 2
done

if (( healthy == 0 )); then
  echo "ERROR: the stack did not come back healthy after the restart." >&2
  echo "       Containers as compose reports them:" >&2
  compose ps --all >&2 || true
  systemctl status footbag --no-pager -l >&2 || true
  exit 1
fi

echo "    footbag active, every container running and healthy, readiness answering"

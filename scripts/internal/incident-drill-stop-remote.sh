#!/usr/bin/env bash
# Root-side body of scripts/incident-drill.sh. Never run directly: it runs as
# root because the wrapper pipes it into sudo, after the password line and the
# closing-report remote library on the same stdin stream.
#
# It induces the drill's failure: it stops the web container, leaving nginx and
# the rest of the stack up, so the origin answers every request with a 502 and
# the edge health check fails, as it would if the application died. It proves
# the stop by reading the container's state back, never by compose's exit
# status alone. Recovery is not here: the drill recovers through
# scripts/restart-host.sh, the same runbook a real incident uses.
#
# Optional shell variable, overridable so this body also runs standalone for
# its tests:
#   ENV_PATH     the host env file compose reads (default /srv/footbag/env)
set -euo pipefail

ENV_PATH="${ENV_PATH:-/srv/footbag/env}"
if [[ ! -r "$ENV_PATH" ]]; then
  crr_error "${ENV_PATH} is not readable on the host; nothing was stopped."
  crr_finish
fi

compose() {
  # Every compose call reads from /dev/null: this body arrives on the remote
  # shell's stdin, and compose would otherwise read the rest of it.
  docker compose --env-file "$ENV_PATH" \
    -f /srv/footbag/docker/docker-compose.yml \
    -f /srv/footbag/docker/docker-compose.prod.yml \
    "$@" </dev/null
}

echo "==> docker compose stop web"
if ! compose stop web; then
  crr_error "docker compose stop web failed on the host; see its output above."
  crr_finish
fi

state="$(compose ps --all --format '{{.Service}} {{.State}}' 2>&1 | grep '^web ' | cut -d' ' -f2)" \
  || [[ $? == 1 ]]
if [[ "$state" == "running" || -z "$state" ]]; then
  crr_error "the web container still reads '${state:-absent}' after the stop; the failure was not induced."
  crr_finish
fi
echo "web container state: ${state}"
crr_finish

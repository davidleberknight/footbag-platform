# shellcheck shell=bash
#
# scripts/lib/compose-build.sh -- build the deployed images from
# docker/docker-compose.yml without a running stack's secrets.
#
# Sourced, never run. The compose file refuses to interpolate unless
# SESSION_SECRET and INTERNAL_EVENT_SECRET are set, because the stack runs
# NODE_ENV=production; that check applies to `build` as well as `up`, though a
# build reads neither value and bakes neither into an image. So a build that only
# inspects the images (scripts/check-versions.sh, scripts/check-vulnerabilities.sh)
# supplies a fixed placeholder for that one command, never exported, and a value
# already set in the caller's environment is left as it is.

COMPOSE_BUILD_PLACEHOLDER="build-only-placeholder-never-run"

# compose_build_images <docker-cli> <service...>
compose_build_images() {
  local docker="$1"; shift
  SESSION_SECRET="${SESSION_SECRET:-$COMPOSE_BUILD_PLACEHOLDER}" \
  INTERNAL_EVENT_SECRET="${INTERNAL_EVENT_SECRET:-$COMPOSE_BUILD_PLACEHOLDER}" \
    "$docker" compose -f docker/docker-compose.yml build "$@"
}

# shellcheck shell=bash
#
# scripts/internal/host-tool-versions-remote.sh -- the host-side comparison of
# the tools a deploy relies on with the versions ops/tool-versions.env pins.
#
# Shipped by scripts/deploy-code.sh and scripts/deploy-rebuild.sh on the
# deploy's own pipe, ahead of the remote half, which calls it before it changes
# anything on the host. Defines one function and runs nothing, so it can travel
# on the wire like the other helpers there.
#
# Why it exists: the deploy, the backup and the restore all call the host's
# sqlite3 and docker, the stack is started through the docker Compose plugin,
# and the host's operating-system release decides which docker build it
# carries. Bootstrap installs each at its pin, but a host can drift afterwards
# (a hand-run package update, a release step half done), and a deploy onto a
# drifted host runs code that was tested against other versions. So a deploy
# refuses a host whose sqlite3, docker package, Compose plugin or Amazon Linux
# release differs from the pins it was sent, naming every difference at once,
# and changes nothing.
#
# What it refuses to do: decide the pins itself. The workstation reads them
# from a version list (on production the one at the tip of main, on staging the
# working tree's) and sends them as EXPECTED_SQLITE_VERSION,
# EXPECTED_DOCKER_ENGINE, EXPECTED_COMPOSE_VERSION and
# EXPECTED_AMAZON_LINUX_RELEASE; an empty one is a sender bug and is refused
# rather than treated as "anything goes".
#
# Test seams (only the test suite sets these; each is announced on stderr,
# because a run against a stand-in proves nothing about the host):
#   HOST_SQLITE3_BIN  the sqlite3 to ask for its version (default /usr/bin/sqlite3,
#                     where bootstrap installs the pinned build)
#   HOST_RPM_BIN      the package query tool (default rpm)
#   HOST_DOCKER_BIN   the docker client to ask for its Compose plugin's version
#                     (default docker)
#   AL_RELEASE_FILE   the release file to read (default /etc/amazon-linux-release)

# host_tool_versions_match
# Returns 0 when all four match their pins; otherwise prints one line per
# difference on stderr and returns 1.
host_tool_versions_match() {
  local seam bad=0 sqlite_bin rpm_bin docker_bin release_file
  local have_sqlite have_docker have_compose have_release
  for seam in HOST_SQLITE3_BIN HOST_RPM_BIN HOST_DOCKER_BIN AL_RELEASE_FILE; do
    [[ -n "${!seam:-}" ]] && echo "SYNTHETIC: ${seam} is set -- this check proves nothing about the host." >&2
  done
  sqlite_bin="${HOST_SQLITE3_BIN:-/usr/bin/sqlite3}"
  rpm_bin="${HOST_RPM_BIN:-rpm}"
  docker_bin="${HOST_DOCKER_BIN:-docker}"
  release_file="${AL_RELEASE_FILE:-/etc/amazon-linux-release}"

  local key
  for key in EXPECTED_SQLITE_VERSION EXPECTED_DOCKER_ENGINE EXPECTED_COMPOSE_VERSION EXPECTED_AMAZON_LINUX_RELEASE; do
    if [[ -z "${!key:-}" ]]; then
      echo "ERROR: ${key} was not sent by the calling deploy script." >&2
      bad=1
    fi
  done
  (( bad )) && return 1

  have_sqlite="$("$sqlite_bin" --version 2>/dev/null | cut -d' ' -f1 || true)"
  have_docker="$("$rpm_bin" -q --qf '%{VERSION}-%{RELEASE}' docker 2>/dev/null | grep -v 'not installed' || true)"
  # The pin carries the release tag's leading v and the plugin may print its
  # version without one, so both are compared in the tag's form, as bootstrap
  # compares them when it installs the plugin.
  have_compose="$("$docker_bin" compose version --short 2>/dev/null || true)"
  [[ -n "$have_compose" ]] && have_compose="v${have_compose#v}"
  have_release="$(sed -n 's/^Amazon Linux release \([0-9][0-9.]*\).*/\1/p' "$release_file" 2>/dev/null || true)"

  if [[ "$have_sqlite" != "$EXPECTED_SQLITE_VERSION" ]]; then
    echo "ERROR: the host's sqlite3 is ${have_sqlite:-missing}; the version list pins ${EXPECTED_SQLITE_VERSION}." >&2
    bad=1
  fi
  if [[ "$have_docker" != "$EXPECTED_DOCKER_ENGINE" ]]; then
    echo "ERROR: the host's docker package is ${have_docker:-missing}; the version list pins ${EXPECTED_DOCKER_ENGINE}." >&2
    bad=1
  fi
  if [[ "$have_compose" != "v${EXPECTED_COMPOSE_VERSION#v}" ]]; then
    echo "ERROR: the host's Compose plugin is ${have_compose:-missing}; the version list pins ${EXPECTED_COMPOSE_VERSION}." >&2
    bad=1
  fi
  if [[ "$have_release" != "$EXPECTED_AMAZON_LINUX_RELEASE" ]]; then
    echo "ERROR: the host runs Amazon Linux ${have_release:-of an unknown release}; the version list pins ${EXPECTED_AMAZON_LINUX_RELEASE}." >&2
    bad=1
  fi
  (( bad )) && return 1
  return 0
}

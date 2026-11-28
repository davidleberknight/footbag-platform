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
# release differs from the pins it was sent, or any of whose packages is not at
# that release, naming every difference at once, and changes nothing. Staging
# refuses exactly as production does.
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
#   HOST_DNF_CONF     the dnf configuration whose exclusions are read (default
#                     /etc/dnf/dnf.conf)
# The package check runs `dnf check-update` from PATH, which the suite stands in.

# host_excluded_installed
# Prints the names of packages the host's dnf configuration excludes from
# upgrades that are installed all the same, space-separated, or nothing. Such a
# package cannot follow the pinned release, and it holds what it requires at its
# own versions: the distribution's sqlite package, left under the pinned
# sqlite3, kept sqlite-libs off the pin. Returns 1 when the configuration cannot
# be read, which is never an empty answer.
host_excluded_installed() {
  local conf="${HOST_DNF_CONF:-/etc/dnf/dnf.conf}" rpm_bin="${HOST_RPM_BIN:-rpm}" names name found=""
  [[ -n "${HOST_DNF_CONF:-}" ]] && echo "SYNTHETIC: HOST_DNF_CONF is set -- this check proves nothing about the host." >&2
  [[ -r "$conf" ]] || { echo "cannot read ${conf}" >&2; return 1; }
  names="$(sed -n 's/^[[:space:]]*\(excludepkgs\|exclude\)[[:space:]]*=//p' "$conf" | tr ',' ' ')"
  for name in $names; do
    "$rpm_bin" -q "$name" >/dev/null 2>&1 && found+="${name} "
  done
  printf '%s' "${found% }"
}

# host_tool_versions_match
# Returns 0 when the four tools match their pins and every package is at the
# pinned release; otherwise prints one line per difference on stderr and
# returns 1. The release pin fixes the exact version of every distribution
# package, so a package dnf still lists at that release, or an excluded package
# that cannot move to it, is a host off its pins however its tools read.
# Needs dnf-check-update-remote.sh sent ahead of it.
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

  local -a diffs=()
  [[ "$have_sqlite" == "$EXPECTED_SQLITE_VERSION" ]] \
    || diffs+=("the host's sqlite3 is ${have_sqlite:-missing}; the version list pins ${EXPECTED_SQLITE_VERSION}.")
  [[ "$have_docker" == "$EXPECTED_DOCKER_ENGINE" ]] \
    || diffs+=("the host's docker package is ${have_docker:-missing}; the version list pins ${EXPECTED_DOCKER_ENGINE}.")
  [[ "$have_compose" == "v${EXPECTED_COMPOSE_VERSION#v}" ]] \
    || diffs+=("the host's Compose plugin is ${have_compose:-missing}; the version list pins ${EXPECTED_COMPOSE_VERSION}.")
  [[ "$have_release" == "$EXPECTED_AMAZON_LINUX_RELEASE" ]] \
    || diffs+=("the host runs Amazon Linux ${have_release:-of an unknown release}; the version list pins ${EXPECTED_AMAZON_LINUX_RELEASE}.")

  local excluded
  if excluded="$(host_excluded_installed)"; then
    [[ -z "$excluded" ]] \
      || diffs+=("${excluded} installed while dnf excludes it from upgrades, so it and what it requires cannot follow the pinned release ${EXPECTED_AMAZON_LINUX_RELEASE}; re-run scripts/bootstrap-host.sh for this target, which removes it.")
  else
    diffs+=("the excluded-package check could not read the host's dnf configuration.")
  fi
  if ! declare -F dnf_check_update >/dev/null; then
    diffs+=("dnf-check-update-remote.sh was not sent ahead of this check.")
  elif dnf_check_update "$EXPECTED_AMAZON_LINUX_RELEASE" "the package check"; then
    if [[ "$DNF_UPDATE_COUNT" != 0 ]]; then
      local behind
      behind="$(dnf_check_update_names <(printf '%s\n' "$DNF_UPDATE_LISTING") | tr '\n' ' ')"
      diffs+=("${DNF_UPDATE_COUNT} package(s) are not at the pinned release ${EXPECTED_AMAZON_LINUX_RELEASE}: ${behind% }; step the host with scripts/step-amazon-linux.sh.")
    fi
  else
    diffs+=("whether every package is at the pinned release could not be read: ${DNF_UPDATE_LISTING##*$'\n'}.")
  fi

  # Every environment refuses a host off its pins, staging as production, so
  # staging proves a release on the versions production will run.
  local d
  for d in "${diffs[@]}"; do
    echo "ERROR: ${d}" >&2
    bad=1
  done
  (( bad )) && return 1
  return 0
}

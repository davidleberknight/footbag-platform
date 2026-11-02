#!/usr/bin/env bash
# scripts/internal/step-amazon-linux-remote.sh -- root-side half of
# scripts/step-amazon-linux.sh. Runs on the host as root; never run directly.
#
# The host's package repositories are locked to one Amazon Linux 2023 release,
# which fixes the version of every distribution package it runs, docker
# included. This body reads where the host stands, counts what a step would
# change, steps the host, and starts it again afterwards, one mode per send so
# the operator side can take its recovery points and reboot between them.
#
# It arrives on the ssh stream behind scripts/lib/closing-report-remote.sh, and
# every problem it meets is a marked line the operator side lists in its own
# closing report; it ends with crr_finish, whose status says whether any was an
# error.
#
# Modes:
#   status   the release, the pin, the newer releases the distribution offers,
#            and whether a reboot is already pending
#   preview  how many packages the step would change, without changing any
#   step     stop the service and the backup timer, check the disk, run the
#            upgrade so a dropped session cannot cut it short, prove the release
#            and that nothing at the pin is left to install, and say whether a
#            reboot is needed
#   resume   start the backup timer again (the operator side then restarts the
#            service and proves the stack)
#   prove    compare the host's tools with the pins (needs
#            scripts/internal/host-tool-versions-remote.sh sent ahead)
#
# Lines for the operator side to read:
#   ---FOOTBAG-PREVIEW--- <packages>
#   ---FOOTBAG-REBOOT--- needed|not-needed
#
# Required shell variables (sent ahead of this body over the pipe):
#   MODE                  status | preview | step | resume | prove
#   AMAZON_LINUX_RELEASE  the pinned release
# For prove: EXPECTED_SQLITE_VERSION, EXPECTED_DOCKER_ENGINE,
#   EXPECTED_AMAZON_LINUX_RELEASE, EXPECTED_COMPOSE_VERSION.
# Optional, set only by the suite: AL_RELEASE_FILE (default
# /etc/amazon-linux-release), REBOOT_HINT_MARKER (default
# /run/smart-restart/reboot-hint-marker), MIN_FREE_MB (default 1024).

set -uo pipefail

: "${MODE:?remote half requires MODE}"
: "${AMAZON_LINUX_RELEASE:?remote half requires AMAZON_LINUX_RELEASE}"
release_file="${AL_RELEASE_FILE:-/etc/amazon-linux-release}"
# Written by smart-restart when it advises a reboot (AWS, "Manage package and
# operating system updates in AL2023").
reboot_marker="${REBOOT_HINT_MARKER:-/run/smart-restart/reboot-hint-marker}"
min_free_mb="${MIN_FREE_MB:-1024}"
[[ -n "${MIN_FREE_MB:-}" ]] && echo "SYNTHETIC: MIN_FREE_MB=${MIN_FREE_MB} -- the disk check's floor is not the real one." >&2

# The package manager's own failure and warning lines. Error first: a scriptlet
# that failed is an error even where rpm printed it as a warning.
DNF_ERRORS='^(Error|error):|[Ss]criptlet failed|FAILED|[Tt]ransaction (check|test) error'
DNF_WARNINGS='^(warning|Warning):'

release_now() {
  if [[ ! -r "$release_file" ]]; then
    crr_error "cannot read ${release_file}"
    return 1
  fi
  sed -n 's/^Amazon Linux release \([0-9][0-9.]*\).*/\1/p' "$release_file"
}

# `dnf check-update` exits 100 when it lists updates, 0 when there are none and 1
# on an error, so the count and the failure cannot be confused.
count_updates() {
  local out rc
  out="$(dnf -q check-update --releasever="$AMAZON_LINUX_RELEASE" 2>&1)"
  rc=$?
  case "$rc" in
    0) echo 0 ;;
    100) grep -cE '^[[:alnum:]_.+-]+\.(x86_64|aarch64|noarch|i686)[[:space:]]' <<<"$out" ;;
    *) crr_error "dnf check-update failed (exit ${rc}): ${out##*$'\n'}"; return 1 ;;
  esac
}

# dnf needs-restarting -r exits 1 when a reboot is required and 0 when it is not;
# anything else is a failure to tell, never a yes.
reboot_needed() {
  local rc
  dnf needs-restarting -r >/dev/null 2>&1
  rc=$?
  if [[ -e "$reboot_marker" ]]; then
    echo needed
    return 0
  fi
  case "$rc" in
    1) echo needed ;;
    0) echo not-needed ;;
    *) crr_error "dnf needs-restarting -r could not tell whether a reboot is needed (exit ${rc})"; return 1 ;;
  esac
}

case "$MODE" in
  status)
    rel="$(release_now)"
    echo "    release now:    ${rel:-unknown}"
    echo "    release pinned: ${AMAZON_LINUX_RELEASE}"
    echo "    newer releases the distribution offers:"
    crr_run --errors "$DNF_ERRORS" --warnings '' "dnf check-release-update" -- dnf check-release-update
    if [[ "$rel" == "$AMAZON_LINUX_RELEASE" ]]; then
      echo "    verdict: at the pin"
    else
      echo "    verdict: differs from the pin"
    fi
    if reboot="$(reboot_needed)"; then
      echo "---FOOTBAG-REBOOT--- ${reboot}"
      [[ "$reboot" == needed ]] && crr_warn "a reboot is pending on this host: the new kernel or core libraries are not in use yet"
    fi
    ;;

  preview)
    if n="$(count_updates)"; then
      echo "---FOOTBAG-PREVIEW--- ${n}"
    fi
    ;;

  step)
    echo "==> Stopping the backup timer and footbag.service for the step"
    if ! systemctl stop footbag-backup.timer footbag-backup.service footbag.service; then
      crr_error "could not stop the service and the backup timer; nothing was stepped"
      crr_finish
    fi
    if systemctl is-active --quiet footbag.service; then
      crr_error "footbag.service is still active after the stop; nothing was stepped"
      crr_finish
    fi

    free_mb="$(df -Pm / | sed -n '2p' | tr -s ' ' | cut -d' ' -f4)"
    if [[ ! "$free_mb" =~ ^[0-9]+$ ]]; then
      crr_error "could not read the free space on / ('${free_mb}'); nothing was stepped"
      crr_finish
    fi
    if (( free_mb < min_free_mb )); then
      crr_error "only ${free_mb} MB free on /, under the ${min_free_mb} MB a release step needs; nothing was stepped"
      crr_finish
    fi
    echo "    ${free_mb} MB free on /"

    rel="$(release_now)"
    if [[ "$rel" == "$AMAZON_LINUX_RELEASE" ]]; then
      echo "    already at the pinned release ${AMAZON_LINUX_RELEASE}; checking nothing is left to install"
    else
      echo "==> Stepping Amazon Linux from ${rel:-an unknown release} to ${AMAZON_LINUX_RELEASE}"
    fi
    # Run as a transient unit, so the transaction belongs to systemd rather than
    # to this ssh session: a dropped connection no longer kills dnf part way
    # through, and --wait --pipe still brings its output and status back here.
    crr_run --errors "$DNF_ERRORS" --warnings "$DNF_WARNINGS" "dnf upgrade" -- \
      systemd-run --wait --pipe --collect --quiet --unit=footbag-step-amazon-linux \
        dnf upgrade -y --releasever="$AMAZON_LINUX_RELEASE"

    rel="$(release_now)"
    if [[ "$rel" != "$AMAZON_LINUX_RELEASE" ]]; then
      crr_error "after the upgrade the host reports ${rel:-unknown}, not ${AMAZON_LINUX_RELEASE}"
    else
      echo "    Amazon Linux ${AMAZON_LINUX_RELEASE} verified"
    fi
    if left="$(count_updates)"; then
      if [[ "$left" != 0 ]]; then
        crr_error "${left} package(s) at ${AMAZON_LINUX_RELEASE} are still not installed: the transaction did not complete"
      else
        echo "    nothing at ${AMAZON_LINUX_RELEASE} is left to install"
      fi
    fi
    if reboot="$(reboot_needed)"; then
      echo "---FOOTBAG-REBOOT--- ${reboot}"
    fi
    ;;

  resume)
    echo "==> Starting the backup timer again"
    systemctl start footbag-backup.timer || crr_error "could not start footbag-backup.timer: backups are paused"
    ;;

  prove)
    if ! declare -F host_tool_versions_match >/dev/null; then
      crr_error "host-tool-versions-remote.sh was not sent ahead of this body"
    elif out="$(host_tool_versions_match 2>&1)"; then
      echo "    the host's sqlite3, docker, Compose and release match the pins"
    else
      while IFS= read -r line; do
        case "$line" in
          ERROR:*) crr_error "${line#ERROR: }" ;;
          "") ;;
          *) echo "$line" >&2 ;;
        esac
      done <<<"$out"
    fi
    ;;

  *) crr_error "unknown MODE ${MODE}" ;;
esac

crr_finish

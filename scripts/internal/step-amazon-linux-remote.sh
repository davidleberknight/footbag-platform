#!/usr/bin/env bash
# scripts/internal/step-amazon-linux-remote.sh -- root-side half of
# scripts/step-amazon-linux.sh. Runs on the host as root; never run directly.
#
# The host's package repositories are locked to one Amazon Linux 2023 release,
# which fixes the version of every distribution package it runs, docker
# included. This reports the release, or steps the host to the pinned one and
# proves it landed.
#
# Required shell variables (sent ahead of this body over the pipe):
#   MODE                  status | step
#   AMAZON_LINUX_RELEASE  the pinned release
# AL_RELEASE_FILE names the release file to read (default
# /etc/amazon-linux-release); only the suite sets it.

set -euo pipefail

: "${MODE:?remote half requires MODE}"
: "${AMAZON_LINUX_RELEASE:?remote half requires AMAZON_LINUX_RELEASE}"
release_file="${AL_RELEASE_FILE:-/etc/amazon-linux-release}"
release_now() { sed -n 's/^Amazon Linux release \([0-9][0-9.]*\).*/\1/p' "$release_file" 2>/dev/null || true; }

rel="$(release_now)"
case "$MODE" in
  status)
    echo "    release now:    ${rel:-unknown}"
    echo "    release pinned: ${AMAZON_LINUX_RELEASE}"
    echo "    newer releases the distribution offers:"
    dnf check-release-update 2>&1 | sed 's/^/      /' || true
    [[ "$rel" == "$AMAZON_LINUX_RELEASE" ]] && echo "    verdict: at the pin" || echo "    verdict: differs from the pin"
    ;;
  step)
    if [[ "$rel" == "$AMAZON_LINUX_RELEASE" ]]; then
      echo "    Amazon Linux already at the pinned release ${AMAZON_LINUX_RELEASE}; nothing to do"
      exit 0
    fi
    echo "==> Stepping Amazon Linux from ${rel:-an unknown release} to ${AMAZON_LINUX_RELEASE}"
    dnf upgrade -y --releasever="$AMAZON_LINUX_RELEASE"
    rel="$(release_now)"
    [[ "$rel" == "$AMAZON_LINUX_RELEASE" ]] || {
      echo "ERROR: after the upgrade the host reports ${rel:-unknown}, not ${AMAZON_LINUX_RELEASE}." >&2
      exit 1
    }
    echo "    Amazon Linux ${AMAZON_LINUX_RELEASE} verified"
    if dnf needs-restarting -r >/dev/null 2>&1; then
      echo "    no reboot needed"
    else
      echo "    a reboot is needed for the new kernel or core libraries to take effect"
    fi
    ;;
  *) echo "ERROR: unknown MODE ${MODE}" >&2; exit 2 ;;
esac

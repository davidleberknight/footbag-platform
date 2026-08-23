#!/usr/bin/env bash
# Streams the built images to a deploy target over ssh.
#
# Sourced by both deploy paths so the two cannot drift apart on the one subtlety
# this carries: under `set -o pipefail`, `docker save | ssh docker load` reports
# the writer's status when the writer dies, and the writer dies of SIGPIPE
# whenever the reader finishes first. That is not a failure. `docker load`
# deduplicates layers the host already holds, so on a host that is nearly up to
# date it can consume the whole archive and exit while `docker save` is still
# streaming, and the deploy then aborts with 141 having already loaded every
# image successfully.
#
# The reader's status is the authority. A genuinely truncated stream makes
# `docker load` exit non-zero (it reports an unexpected EOF), and both remote
# halves independently verify the loaded RootFS layer DiffIDs against the local
# ones and refuse to continue on a mismatch, so a half-transferred image cannot
# slip through on the strength of this alone.
#
# Reads SUDO_PASS, REMOTE and SSH_OPTS from the calling script rather than
# taking them as arguments, so the sudo password never enters an argument list.

# shellcheck shell=bash

send_images_to_host() {
  local reader_status=0

  # pipefail off for this pipeline only: with it on, the writer's SIGPIPE would
  # mask the reader's success. Restored immediately afterwards so the rest of
  # the deploy keeps the strict behaviour.
  set +o pipefail
  { printf '%s\n' "$SUDO_PASS"; docker save docker-web docker-worker docker-image; } \
    | ssh "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" docker load' || reader_status=$?
  set -o pipefail

  if (( reader_status != 0 )); then
    echo "ERROR: docker load on $REMOTE failed (exit $reader_status)." >&2
    return "$reader_status"
  fi
}

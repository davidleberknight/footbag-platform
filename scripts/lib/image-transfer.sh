#!/usr/bin/env bash
# Sends the built Docker images to a deploy target, uploading only what changed.
#
# Sourced by both deploy paths so the two cannot drift apart. The Docker images
# are saved to one archive on the workstation and rsynced onto the copy of the
# archive the previous deploy left in the deploy account's home on the host.
# A layer whose content has not changed is byte-identical in both archives, so
# rsync sends only the new layers (on a routine code deploy, the app code) plus
# its block checksums, instead of the whole archive, which on a slow uplink is
# the difference between minutes and hours.
#
# The host's Docker images are not touched until the archive has fully arrived:
# rsync writes to a temporary file and renames it into place only when the
# transfer completes, so a dropped connection leaves the host as it was, and
# `--partial` lets a retry continue rather than start over. `docker load` then
# reads the arrived archive, and both remote halves still verify the loaded
# RootFS layer DiffIDs against the local ones and refuse to continue on a
# mismatch.
#
# Reads SUDO_PASS, REMOTE, REMOTE_HOME and SSH_OPTS from the calling script
# rather than taking them as arguments, so the sudo password never enters an
# argument list. The password travels only on the stdin of the one privileged
# session, `docker load`; rsync and the free-space read carry no secret.

# shellcheck shell=bash

# The processor every deploy target runs. The hosts are x86-64 Lightsail
# instances, and the bootstrap refuses any other. An image is built for the
# processor of the machine that builds it, so a workstation on ARM (an
# Apple-silicon Mac, an ARM virtual machine) builds images the hosts cannot
# start: the deploy would replace the running images, the restart would fail,
# and the host would be left down.
DEPLOY_IMAGE_ARCH="amd64"

# require_images_for_hosts
# Refuses, before anything reaches a host, unless each built image is for the
# hosts' processor. Reads the architecture docker records on the image itself.
require_images_for_hosts() {
  local image arch
  for image in docker-web docker-worker docker-image; do
    arch="$(docker image inspect --format '{{.Architecture}}' "$image" 2>/dev/null)" || {
      echo "ERROR: could not read the architecture of ${image}; nothing was sent to the host." >&2
      return 1
    }
    if [[ "$arch" != "$DEPLOY_IMAGE_ARCH" ]]; then
      echo "ERROR: ${image} was built for ${arch:-an unknown processor}, but the hosts run ${DEPLOY_IMAGE_ARCH}." >&2
      echo "       This workstation's processor is $(uname -m); images built on it cannot start" >&2
      echo "       on the hosts. Nothing was sent. Deploy from an x86-64 Ubuntu machine." >&2
      return 1
    fi
  done
}

# A production build sets INCLUDE_DEV_SHORTCUTS=0 so the images carry no test
# kit, the persona harness that can sign in as any test member. The setting only
# reaches the build through an exported variable, so the built images are read
# back: a production image holding dist/testkit is refused before anything is
# sent. DEPLOY_DOCKER_BIN is the test seam for the docker client.
require_no_testkit_in_images() {
  local image docker_bin="${DEPLOY_DOCKER_BIN:-docker}" rc
  [[ -n "${DEPLOY_DOCKER_BIN:-}" ]] && echo "NOTE: DEPLOY_DOCKER_BIN is set; the image check reads a stand-in, not the real images." >&2
  for image in docker-web docker-worker docker-image; do
    rc=0
    "$docker_bin" run --rm --network none --entrypoint sh "$image" -c 'test ! -e /app/dist/testkit' </dev/null || rc=$?
    case "$rc" in
      0) ;;
      1) echo "ERROR: ${image} holds /app/dist/testkit, which a production image must not; nothing was sent to the host." >&2; return 1 ;;
      *) echo "ERROR: could not read ${image} to check it holds no test kit (docker exited ${rc}); nothing was sent to the host." >&2; return 1 ;;
    esac
  done
}

# The archive's name in the deploy account's home on the host. It lives outside
# the release upload directory, which every deploy empties, because it is the
# basis the next deploy's rsync compares against.
DEPLOY_IMAGE_ARCHIVE_NAME="footbag-docker-images.tar"

send_images_to_host() {
  local local_dir local_tar remote_tar size avail need status=0

  if [[ -z "${REMOTE_HOME:-}" || "$REMOTE_HOME" != /* ]]; then
    echo "ERROR: the deploy account's home on $REMOTE is not known; nothing was sent." >&2
    return 1
  fi
  remote_tar="${REMOTE_HOME}/${DEPLOY_IMAGE_ARCHIVE_NAME}"

  local_dir="$(mktemp -d "${TMPDIR:-/tmp}/footbag-docker-images.XXXXXX")"
  # Registered as well as removed below, so an interrupt mid-save leaves no
  # archive behind on the workstation.
  if declare -F cr_cleanup >/dev/null; then cr_cleanup rm -rf -- "$local_dir"; fi
  local_tar="${local_dir}/${DEPLOY_IMAGE_ARCHIVE_NAME}"

  echo "    saving Docker images to a local archive..."
  if ! docker save -o "$local_tar" docker-web docker-worker docker-image; then
    echo "ERROR: docker save failed on this workstation; nothing was sent to $REMOTE." >&2
    rm -rf -- "$local_dir"
    return 1
  fi
  size="$(stat -c %s -- "$local_tar")" || size=0

  # rsync builds the new archive beside the old one before renaming it into
  # place, and `docker load` then unpacks whatever layers the host lacks, so the
  # host needs room for roughly twice the archive. Refusing here is what keeps a
  # full disk from failing the load after the old Docker images were already
  # pruned. POSIX `df -P` output is a fixed format: the fourth field of the
  # second line is the space available, in 1024-byte blocks.
  avail="$(ssh "${SSH_OPTS[@]}" "$REMOTE" "df -Pk ${REMOTE_HOME@Q}" </dev/null \
    | sed -n '2p' | tr -s ' ' | cut -d' ' -f4)" || avail=""
  if [[ ! "$avail" =~ ^[0-9]+$ ]]; then
    echo "ERROR: could not read the free disk space on $REMOTE; nothing was sent." >&2
    rm -rf -- "$local_dir"
    return 1
  fi
  need=$(( size * 2 / 1024 ))
  if (( avail < need )); then
    echo "ERROR: $REMOTE has $(( avail / 1024 )) MB free, but receiving and loading the" >&2
    echo "       Docker images needs about $(( need / 1024 )) MB. Nothing was sent." >&2
    rm -rf -- "$local_dir"
    return 1
  fi

  echo "    sending only the parts of the Docker images $REMOTE does not already have..."
  if ! rsync -z --partial --chmod=F600 --info=progress2,stats1 \
      -e "ssh ${SSH_OPTS[*]}" "$local_tar" "$REMOTE:$remote_tar" </dev/null; then
    echo "ERROR: sending the Docker images to $REMOTE failed; its running release is unchanged." >&2
    echo "       Re-running the deploy continues the transfer where it stopped." >&2
    rm -rf -- "$local_dir"
    return 1
  fi
  rm -rf -- "$local_dir"

  printf '%s\n' "$SUDO_PASS" \
    | ssh "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" docker load -i '"${remote_tar@Q}" \
    || status=$?
  if (( status != 0 )); then
    echo "ERROR: docker load on $REMOTE failed (exit $status)." >&2
    return "$status"
  fi
}

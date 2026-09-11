#!/usr/bin/env bash
# Root-side body for installing a rewritten env file on a deployed host. Never
# run directly: it expects the variable assignments its caller emits ahead of
# this body on the same stdin stream, and it runs as root because the caller
# pipes it into sudo.
#
# Invoked via scripts/lib/host-env-remote.sh:
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'HOST_ENV_PATH=%q\n' "$path";
#     printf 'NEW_ENV_B64=%q\n' "$encoded";
#     cat scripts/internal/host-env-write-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash'
#
# The content arrives as an assignment on the pipe rather than by scp, so it
# never lands on the host under the operator's ownership on its way to root's,
# and the caller has no remote temp path to name, clean up, or leak.
#
# It is decoded into a restricted temp file owned by root and promoted with a
# rename, rather than being redirected straight at the destination. Writing in
# place would leave the live file truncated for as long as the write takes, and
# any failure part-way would leave the host holding half its configuration,
# which is a host that boots without a secret it needs.
#
# The promote is `mv` within the destination's own directory, not `install`.
# `install` unlinks the destination before creating and writing the new file, so
# it carries the very window this is meant to close: an error or a signal between
# the unlink and the last write leaves the file absent or short, and the trap
# below removes only the temp. A rename inside one filesystem is atomic, so the
# file is either wholly old or wholly new. The mode and owner are set on the temp
# before it holds anything, so it is never briefly readable by anyone else.
#
# No backup copy is kept. A backup is a second, staler copy of the entire
# secret set sitting at rest for as long as nobody remembers to delete it, and
# the file is fully re-derivable: a deploy rebuilds it from the parameter store.
# To undo a bad write, correct the source of the value and run the writer again.
#
# Required shell variables (emitted by the caller ahead of this body):
#   HOST_ENV_PATH  absolute path to install to
#   NEW_ENV_B64    base64 of the complete new file content

set -euo pipefail

: "${HOST_ENV_PATH:?remote half requires HOST_ENV_PATH}"
: "${NEW_ENV_B64:?remote half requires NEW_ENV_B64}"

umask 077
# The temp is created in the destination's own directory so the promote below is
# a rename within one filesystem, which is atomic. A temp in /tmp could land on a
# different filesystem, where `mv` degrades to copy-then-unlink and reintroduces
# the partial-write window this exists to avoid.
tmp="$(mktemp "$(dirname "$HOST_ENV_PATH")/.env.write.XXXXXX")"
cleanup() { rm -f "$tmp"; }
trap cleanup EXIT INT TERM

if ! printf '%s' "$NEW_ENV_B64" | base64 -d > "$tmp"; then
  echo "ERROR: the supplied env content did not decode; $HOST_ENV_PATH is unchanged." >&2
  exit 1
fi

# An empty decode means the caller computed an empty file. Installing it would
# take the host's whole configuration away, and the next restart would fail on
# a missing secret rather than on anything pointing back at this step.
if [[ ! -s "$tmp" ]]; then
  echo "ERROR: the supplied env content is empty; refusing to install it." >&2
  exit 1
fi

chown root:root "$tmp"
chmod 0600 "$tmp"
mv -f "$tmp" "$HOST_ENV_PATH"
trap - EXIT INT TERM
echo "    installed $HOST_ENV_PATH (root:root 0600)" >&2

#!/usr/bin/env bash
# Root-side body that reports which access key a host holds in one credentials
# file, by id only. Never run directly: it expects the assignments its caller
# emits ahead of it on the same stdin stream, and it runs as root because the
# files it reads are root-owned.
#
# Invoked via the wire pattern:
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'CRED_FILE=%q\n' /root/.aws/credentials;
#     printf 'CRED_PROFILE=%q\n' footbag-staging-source-profile;
#     cat scripts/lib/closing-report-remote.sh;
#     cat scripts/internal/bootstrap-host-keyid-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash -s footbag-host-key-id'
#
# Lines for the caller to read, on standard output:
#   ---FOOTBAG-KEY-ID---
#   <the key id, or an empty line when the file holds none for the profile>
#   ---FOOTBAG-END---
# A file that is there but cannot be read is a marked error on standard error,
# never an empty key id: an empty answer tells the installer the host holds no
# key, which on a host that does hold one sends the operator down the rebuilt-
# host path. It ends with crr_finish.
#
# An installer asks this before minting, so that a host rebuilt from nothing,
# whose credentials file is gone while the IAM user still holds the dead host's
# key, is told apart from a host whose key is simply already in service. Only
# the key id crosses the wire: it is an identifier, not a credential, and the
# secret beside it never leaves the file.
#
# Required shell variables:
#   CRED_FILE     the credentials file to read
#   CRED_PROFILE  the profile section whose key id is wanted

set -uo pipefail

if [[ -z "${CRED_FILE:-}" || -z "${CRED_PROFILE:-}" ]]; then
  crr_error "remote half requires CRED_FILE and CRED_PROFILE"
  crr_finish
fi

key_id=""
if [[ -e "$CRED_FILE" ]]; then
  if ! key_id="$(awk -v want="[$CRED_PROFILE]" '
      /^[[:space:]]*\[/ { gsub(/[[:space:]]/, ""); in_section = ($0 == want); next }
      in_section && /^[[:space:]]*aws_access_key_id[[:space:]]*=/ {
        sub(/^[^=]*=[[:space:]]*/, ""); sub(/[[:space:]]+$/, ""); print; exit
      }' "$CRED_FILE" 2>&1)"; then
    crr_error "could not read the key id in ${CRED_FILE}: ${key_id##*$'\n'}"
    crr_finish
  fi
fi

echo "---FOOTBAG-KEY-ID---"
printf '%s\n' "$key_id"
echo "---FOOTBAG-END---"
crr_finish

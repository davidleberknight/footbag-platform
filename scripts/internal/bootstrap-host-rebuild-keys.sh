# shellcheck shell=bash
#
# The refusal an access-key installer gives when it is run bare against a host
# that holds no key of its IAM user while that user already holds one. Sourced
# by the two installers whose identities a rebuilt host has to take over: the
# host credential chain and the CloudWatch agent.
#
# Without it the shared key library refuses with only the count of keys the user
# holds, which on a rebuilt host reads as "nothing to do": the operator's first
# reading is that the credential is already in service, and it is not, because
# the host that held it is gone. The way forward from there is a rotation that
# mints the new host its own key and then retires the dead host's, and this
# message names it with the key ids to retire, so nothing about it has to be
# remembered.
#
# The caller has sourced scripts/lib/host-env-remote.sh and
# scripts/lib/iam-access-key.sh, read the sudo password into SUDO_PASS, and
# confirmed the host with require_host_is.

REBUILD_KEYS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REBUILD_KEYID_HALF="${REBUILD_KEYS_DIR}/bootstrap-host-keyid-remote.sh"

# Set by host_key_id_read: the key id the host holds, empty when it holds none.
HOST_KEY_ID=""

# host_key_id_read <alias> <credentials-file> <profile>
host_key_id_read() {
  local alias="$1" file="$2" profile="$3" stream
  HOST_KEY_ID=""
  require_host_ssh_opts || return 1
  if ! stream="$(
        {
          printf '%s\n' "$SUDO_PASS"
          printf 'CRED_FILE=%q\n' "$file"
          printf 'CRED_PROFILE=%q\n' "$profile"
          cat "$REBUILD_KEYID_HALF"
        } | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$alias" 'sudo -k -S -p "" bash -s footbag-host-key-id'
      )"; then
    echo "ERROR: could not ask ${alias} which key it holds in ${file}." >&2
    return 1
  fi
  if ! grep -q '^---FOOTBAG-KEY-ID---$' <<< "$stream"; then
    echo "ERROR: ${alias} returned no answer about the key it holds." >&2
    return 1
  fi
  HOST_KEY_ID="$(grep -A1 '^---FOOTBAG-KEY-ID---$' <<< "$stream" | tail -1)"
  [[ "$HOST_KEY_ID" == ---FOOTBAG-* ]] && HOST_KEY_ID=""
  return 0
}

# rebuild_user_holds <iam-user> <key-id>
# True when the user holds that key, active or not. False on a read failure.
rebuild_user_holds() {
  local user="$1" key="$2" ids
  ids="$("$IAM_KEY_AWS_BIN" iam list-access-keys --user-name "$user" \
    ${IAM_KEY_AWS_ARGS[@]+"${IAM_KEY_AWS_ARGS[@]}"} \
    --query 'AccessKeyMetadata[].AccessKeyId' --output text)" || return 1
  grep -qxF -- "$key" <<< "$(tr -s '[:space:]' '\n' <<< "$ids")"
}

# rebuild_key_slots_blocked <iam-user> <host-key-id>
# True when the user holds two keys, the most IAM allows, and the host holds
# neither. Then no rotation can mint the host its own key, and no proof run from
# the host can pass, because the host has no working key to prove with; a
# retirement of either key is safe, since nothing on this host uses it, and is
# the only way forward. False on any read failure, which keeps the proof.
rebuild_key_slots_blocked() {
  local user="$1" host_key="$2" ids
  ids="$("$IAM_KEY_AWS_BIN" iam list-access-keys --user-name "$user" \
    ${IAM_KEY_AWS_ARGS[@]+"${IAM_KEY_AWS_ARGS[@]}"} \
    --query 'AccessKeyMetadata[].AccessKeyId' --output text)" || return 1
  ids="$(tr -s '[:space:]' '\n' <<< "$ids" | grep -v -e '^$' -e '^None$' || true)"
  [[ "$(grep -c . <<< "$ids" || true)" == "2" ]] || return 1
  [[ -n "$host_key" ]] && grep -qxF -- "$host_key" <<< "$ids" && return 1
  return 0
}

# rebuild_key_check <iam-user> <host-key-id> <installer> <target> <retire-reads-stdin:yes|no>
# Returns 0 when a bare install may go on to the shared library's own checks:
# the user holds no key, or the host holds one of the user's keys. Returns 1,
# with the rebuild sequence, when the user holds keys and the host holds none of
# them. The last argument says whether that installer's retirement takes the
# sudo password on stdin, because the two installers differ and a redirect
# handed to a command that reads no stdin answers its confirmation prompt.
rebuild_key_check() {
  local user="$1" host_key="$2" installer="$3" target="$4" retire_stdin="$5" ids id
  local retire_prefix=""
  ids="$("$IAM_KEY_AWS_BIN" iam list-access-keys --user-name "$user" \
    ${IAM_KEY_AWS_ARGS[@]+"${IAM_KEY_AWS_ARGS[@]}"} \
    --query 'AccessKeyMetadata[].AccessKeyId' --output text)" || {
    echo "ERROR: cannot read the access keys of ${user}." >&2
    return 1
  }
  ids="$(tr -s '[:space:]' '\n' <<< "$ids" | grep -v -e '^$' -e '^None$' || true)"
  [[ -z "$ids" ]] && return 0
  if [[ -n "$host_key" ]] && grep -qxF -- "$host_key" <<< "$ids"; then
    return 0
  fi

  local cred="<operator credential file>"
  operator_credential_select "footbag-${target}" "$target" 2>/dev/null \
    && cred="$OPERATOR_CREDENTIAL_DISPLAY"
  [[ "$retire_stdin" == "yes" ]] && retire_prefix="< ${cred} "
  echo "REFUSING: ${user} already holds an access key, and this host holds none of them." >&2
  if [[ -n "$host_key" ]]; then
    echo "          The host holds ${host_key}, which is not a key of ${user}." >&2
  fi
  echo "" >&2
  echo "          That is a host rebuilt from nothing: the key the user holds belongs" >&2
  echo "          to the host that was replaced, and nothing still uses it. Give this" >&2
  echo "          host its own key with a rotation, prove it, then retire the old one:" >&2
  echo "" >&2
  echo "            < ${cred} bash ${installer} --rotate" >&2
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    echo "            ${retire_prefix}bash ${installer} --retire ${id}" >&2
    echo "            bash ${installer} --delete ${id}" >&2
  done <<< "$ids"
  echo "" >&2
  echo "          scripts/bootstrap-host.sh --target ${target} runs that sequence itself." >&2
  echo "          Nothing has been created." >&2
  return 1
}

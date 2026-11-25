#!/usr/bin/env bash
# Root-side body that carries a host's AWS access keys from the instance being
# replaced to the fresh one, so a rebuild mints, retires and deletes no key.
# Never run directly: it expects the assignments its caller emits ahead of it on
# the same stdin stream, and it runs as root because the files are root-owned.
#
# Why it exists. A host holds two long-lived IAM access keys: the source-profile
# key its credential chain assumes the runtime role with, and the CloudWatch
# agent's publisher key. Whether either rotates is the maintainer's decision, so
# no script rotates one on its own; a rebuild carries both keys over instead,
# and a host that is lost outright is reinstalled from the vault.
#
# The three files carried, as the installers write them:
#   /root/.aws/credentials and /root/.aws/config, root-owned, group awscreds
#     (gid 1500, which the containers join), 0640, in a 0750 directory
#   /etc/amazon-cloudwatch-agent.aws/credentials, root-owned, 0600, in a 0700
#     directory
#
# Modes, each sent as MODE=<mode>:
#   read     on the host being replaced, as the shared account through sudo:
#              { printf '%s\n' "$SUDO_PASS"; printf 'MODE=read\n';
#                printf 'TARGET_ENV=%q\n' staging;
#                cat scripts/lib/closing-report-remote.sh <this file>;
#              } | ssh ALIAS 'sudo -k -S -p "" bash -s footbag-bootstrap-carry'
#            Standard output is exactly five assignment lines and nothing else:
#            CARRY_CREDS_B64, CARRY_CONFIG_B64 and CARRY_AGENT_B64, each file
#            whole and base64 on one line, then CARRY_SRC_KEY and CARRY_CW_KEY,
#            the two key ids. A missing file, or a file holding no key for its
#            profile, is a marked error and nothing is printed.
#   install  on the fresh instance, as ec2-user, whose sudo takes no password,
#            so no password line leads the stream (one would run as a command):
#              { printf 'MODE=install\n'; printf 'TARGET_ENV=%q\n' staging;
#                <the five assignments, written from the values read above>;
#                cat scripts/lib/closing-report-remote.sh <this file>;
#              } | ssh -p 22 -l ec2-user ALIAS 'sudo -n bash -s footbag-bootstrap-carry'
#            Decodes all three files into root-side restricted temp files
#            before promoting any with install, so a value that does not decode
#            installs none of them; checks each installed file holds the key id
#            it was read with, then proves the chain: the runtime profile must
#            resolve as the environment's runtime role. Prints
#            ---FOOTBAG-CARRY-NOTHING-INSTALLED--- when it refuses before the
#            first file is promoted, ---FOOTBAG-CARRY-INSTALLED--- once the
#            files are in place and ---FOOTBAG-CARRY-PROVED--- once the chain
#            resolves.
#   check    on a fresh instance, as ec2-user, nothing sent but the mode and
#            target: whether it already holds carried keys whose chain proves,
#            which is how a re-run after a stop part way tells a finished carry
#            from a lost one. Prints ---FOOTBAG-CARRY-HELD--- with the two key
#            ids as CARRY_SRC_KEY= and CARRY_CW_KEY= lines, or
#            ---FOOTBAG-CARRY-NOT-HELD--- with the reason on the next line. Only
#            an instance with no shared footbag account yet is judged held: the
#            route never treats a bootstrapped host as its own fresh instance.
#
# What it refuses: a stream whose carried values are not base64 and key ids,
# with nothing installed;
# installed files whose key ids differ from the ones read; a group awscreds
# with another id than the one the containers join. Every problem is marked
# with crr_error from the reporting library the caller sends ahead of this body,
# and crr_finish ends the run, non-zero when any was an error.
#
# A fresh instance's image may not carry the aws CLI yet (the bootstrap installs
# it with the host tools). There the chain cannot be proved on the instance, so
# install and check prove the key ids the files hold and print
# ---FOOTBAG-CARRY-DEFERRED--- instead of ---FOOTBAG-CARRY-PROVED---: the
# bootstrap's credential step proves the chain once the CLI is in, and stops,
# minting nothing, if it does not resolve.
#
# Test seams, each announced, because a run against them proves nothing about
# the host: CARRY_ROOT_DIR, a directory every path above is taken under, so a
# test drives this body as an ordinary user against stand-in files; and
# CARRY_AWS_BIN, the aws CLI to prove the chain with, so a test can stand for an
# image that has none.

set -euo pipefail

: "${MODE:?remote half requires MODE}"
: "${TARGET_ENV:?remote half requires TARGET_ENV}"

ROOT="${CARRY_ROOT_DIR:-}"
if [[ -n "$ROOT" ]]; then
  echo "SYNTHETIC: CARRY_ROOT_DIR='${ROOT}' -- this run proves nothing about the estate." >&2
fi
AWS_CLI="${CARRY_AWS_BIN:-aws}"
if [[ -n "${CARRY_AWS_BIN:-}" ]]; then
  echo "SYNTHETIC: CARRY_AWS_BIN='${CARRY_AWS_BIN}' -- this run proves nothing about the estate." >&2
fi
HOST_AWS_DIR="${ROOT}/root/.aws"
HOST_CREDS="${HOST_AWS_DIR}/credentials"
HOST_CONFIG="${HOST_AWS_DIR}/config"
AGENT_DIR="${ROOT}/etc/amazon-cloudwatch-agent.aws"
AGENT_CREDS="${AGENT_DIR}/credentials"

SOURCE_PROFILE="footbag-${TARGET_ENV}-source-profile"
RUNTIME_PROFILE="footbag-${TARGET_ENV}-runtime"
AGENT_PROFILE="footbag-${TARGET_ENV}-cwagent"
RUNTIME_ROLE_NAME="footbag-${TARGET_ENV}-app-runtime"
AWSCREDS_GROUP=awscreds
AWSCREDS_GID=1500

# key_id_in <file> <profile>
# The access key id under one profile section, empty when the file holds none.
key_id_in() {
  awk -v want="[$2]" '
    /^[[:space:]]*\[/ { gsub(/[[:space:]]/, ""); in_section = ($0 == want); next }
    in_section && /^[[:space:]]*aws_access_key_id[[:space:]]*=/ {
      sub(/^[^=]*=[[:space:]]*/, ""); sub(/[[:space:]]+$/, ""); print; exit
    }' "$1"
}

# prove_chain
# True when the runtime profile, read from the host's own two files, resolves as
# the environment's runtime role: the outcome the application depends on, not
# that a key authenticates. Sets PROVE_SAID to what the client answered.
# Returns 2 when the instance has no aws CLI to ask with.
PROVE_SAID=""
prove_chain() {
  local out
  if ! command -v "$AWS_CLI" >/dev/null 2>&1; then
    PROVE_SAID="no aws CLI on this instance yet, so the bootstrap's credential step proves the chain once it installs one"
    return 2
  fi
  if ! out="$(AWS_CONFIG_FILE="$HOST_CONFIG" AWS_SHARED_CREDENTIALS_FILE="$HOST_CREDS" \
      timeout 30 "$AWS_CLI" sts get-caller-identity --profile "$RUNTIME_PROFILE" --query Arn --output text 2>&1)"; then
    PROVE_SAID="$(tail -n 1 <<< "$out")"
    return 1
  fi
  PROVE_SAID="$out"
  [[ "$out" == *":assumed-role/${RUNTIME_ROLE_NAME}/"* ]]
}

case "$MODE" in
  read)
    for f in "$HOST_CREDS" "$HOST_CONFIG" "$AGENT_CREDS"; do
      [[ -f "$f" ]] || crr_error "${f} is not on this host, so there is nothing to carry from it"
    done
    (( CRR_ERRORS == 0 )) || crr_finish
    src_key="$(key_id_in "$HOST_CREDS" "$SOURCE_PROFILE")"
    cw_key="$(key_id_in "$AGENT_CREDS" "$AGENT_PROFILE")"
    [[ -n "$src_key" ]] || crr_error "${HOST_CREDS} holds no key under [${SOURCE_PROFILE}]"
    [[ -n "$cw_key" ]] || crr_error "${AGENT_CREDS} holds no key under [${AGENT_PROFILE}]"
    (( CRR_ERRORS == 0 )) || crr_finish
    # printf is a builtin, so the content never reaches an argument list.
    printf 'CARRY_CREDS_B64=%s\n' "$(base64 -w0 < "$HOST_CREDS")"
    printf 'CARRY_CONFIG_B64=%s\n' "$(base64 -w0 < "$HOST_CONFIG")"
    printf 'CARRY_AGENT_B64=%s\n' "$(base64 -w0 < "$AGENT_CREDS")"
    printf 'CARRY_SRC_KEY=%s\n' "$src_key"
    printf 'CARRY_CW_KEY=%s\n' "$cw_key"
    crr_finish
    ;;

  install)
    # Every refusal before the first file is promoted says so with its own
    # marker, so the caller can tell keys on no host from keys that may have
    # landed when a session ends without proving them.
    nothing_installed() {
      echo "---FOOTBAG-CARRY-NOTHING-INSTALLED---"
      crr_finish
    }
    for v in CARRY_CREDS_B64 CARRY_CONFIG_B64 CARRY_AGENT_B64 CARRY_SRC_KEY CARRY_CW_KEY; do
      [[ -n "${!v:-}" ]] || crr_error "the stream carried no ${v}; nothing installed"
    done
    (( CRR_ERRORS == 0 )) || nothing_installed

    if ! getent group "$AWSCREDS_GROUP" >/dev/null 2>&1; then
      echo "    Creating group $AWSCREDS_GROUP (gid $AWSCREDS_GID)"
      groupadd --gid "$AWSCREDS_GID" "$AWSCREDS_GROUP"
    fi
    # A group under this name with another id would leave the containers'
    # supplementary group naming something else, and the failure would read as
    # unreadable credentials rather than a numbering mismatch.
    actual_gid="$(getent group "$AWSCREDS_GROUP" | cut -d: -f3)"
    if [[ "$actual_gid" != "$AWSCREDS_GID" ]]; then
      crr_error "group $AWSCREDS_GROUP has gid $actual_gid, expected $AWSCREDS_GID; nothing installed"
      nothing_installed
    fi

    # One restricted temp file per secret, shredded on every way out, including
    # an interrupt between the write and the promote.
    umask 077
    CARRY_TMPS=()
    carry_remote_cleanup() {
      local t
      for t in "${CARRY_TMPS[@]+"${CARRY_TMPS[@]}"}"; do
        [[ -e "$t" ]] || continue
        shred -u "$t" 2>/dev/null || rm -f "$t"
      done
      return 0
    }
    trap carry_remote_cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    trap 'exit 129' HUP

    # All three decoded before any is promoted, so a value that is not base64
    # leaves the instance with none of the files rather than some of them.
    # decode_to_tmp <base64> <dest>; sets DECODED to the temp file.
    DECODED=""
    decode_to_tmp() {
      DECODED="$(mktemp)"
      CARRY_TMPS+=("$DECODED")
      if ! printf '%s' "$1" | base64 -d > "$DECODED" 2>/dev/null || [[ ! -s "$DECODED" ]]; then
        crr_error "the content carried for ${2} is not base64; nothing installed"
      fi
    }
    decode_to_tmp "$CARRY_CREDS_B64" "$HOST_CREDS"; creds_tmp="$DECODED"
    decode_to_tmp "$CARRY_CONFIG_B64" "$HOST_CONFIG"; config_tmp="$DECODED"
    decode_to_tmp "$CARRY_AGENT_B64" "$AGENT_CREDS"; agent_tmp="$DECODED"
    (( CRR_ERRORS == 0 )) || nothing_installed

    install -d -m 0750 -o root -g "$AWSCREDS_GROUP" "$HOST_AWS_DIR"
    install -d -m 0700 -o root -g root "$AGENT_DIR"
    install -m 0640 -o root -g "$AWSCREDS_GROUP" "$creds_tmp" "$HOST_CREDS"
    install -m 0640 -o root -g "$AWSCREDS_GROUP" "$config_tmp" "$HOST_CONFIG"
    install -m 0600 -o root -g root "$agent_tmp" "$AGENT_CREDS"
    carry_remote_cleanup

    # The installed files, read back, hold the keys the old host held.
    have_src="$(key_id_in "$HOST_CREDS" "$SOURCE_PROFILE")"
    have_cw="$(key_id_in "$AGENT_CREDS" "$AGENT_PROFILE")"
    [[ "$have_src" == "$CARRY_SRC_KEY" ]] \
      || crr_error "${HOST_CREDS} holds '${have_src}' under [${SOURCE_PROFILE}] after the install, not ${CARRY_SRC_KEY}"
    [[ "$have_cw" == "$CARRY_CW_KEY" ]] \
      || crr_error "${AGENT_CREDS} holds '${have_cw}' under [${AGENT_PROFILE}] after the install, not ${CARRY_CW_KEY}"
    (( CRR_ERRORS == 0 )) || crr_finish
    echo "---FOOTBAG-CARRY-INSTALLED---"
    echo "    installed ${HOST_CREDS}, ${HOST_CONFIG} and ${AGENT_CREDS}"

    prove_rc=0
    prove_chain || prove_rc=$?
    if (( prove_rc == 0 )); then
      echo "---FOOTBAG-CARRY-PROVED---"
      echo "    ${RUNTIME_PROFILE} resolves as: ${PROVE_SAID}"
    elif (( prove_rc == 2 )); then
      echo "---FOOTBAG-CARRY-DEFERRED---"
      echo "    ${PROVE_SAID}"
    else
      crr_error "the carried keys are installed, but ${RUNTIME_PROFILE} does not resolve as the role ${RUNTIME_ROLE_NAME}: ${PROVE_SAID}"
    fi
    crr_finish
    ;;

  check)
    reason=""
    if id footbag >/dev/null 2>&1; then
      reason="the shared footbag account exists here, so this is not a fresh instance"
    else
      for f in "$HOST_CREDS" "$HOST_CONFIG" "$AGENT_CREDS"; do
        [[ -f "$f" ]] || { reason="${f} is not on this instance"; break; }
      done
    fi
    src_key=""; cw_key=""; prove_rc=0
    if [[ -z "$reason" ]]; then
      src_key="$(key_id_in "$HOST_CREDS" "$SOURCE_PROFILE")"
      cw_key="$(key_id_in "$AGENT_CREDS" "$AGENT_PROFILE")"
      if [[ -z "$src_key" || -z "$cw_key" ]]; then
        reason="a carried file holds no key for its profile"
      else
        prove_chain || prove_rc=$?
        if (( prove_rc == 1 )); then
          reason="the files are here, but ${RUNTIME_PROFILE} does not resolve as the role ${RUNTIME_ROLE_NAME}: ${PROVE_SAID}"
        fi
      fi
    fi
    if [[ -z "$reason" ]]; then
      echo "---FOOTBAG-CARRY-HELD---"
      (( prove_rc == 2 )) && echo "---FOOTBAG-CARRY-DEFERRED---"
      printf 'CARRY_SRC_KEY=%s\nCARRY_CW_KEY=%s\n' "$src_key" "$cw_key"
    else
      echo "---FOOTBAG-CARRY-NOT-HELD---"
      printf '%s\n' "$reason"
    fi
    crr_finish
    ;;

  *)
    crr_error "unknown MODE '${MODE}'"
    crr_finish
    ;;
esac

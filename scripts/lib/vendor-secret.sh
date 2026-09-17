#!/usr/bin/env bash
# shellcheck shell=bash
# vendor-secret.sh — a secret that comes from somebody else's console.
#
# Two kinds of secret live in Parameter Store and they want opposite handling.
# One is generated here and never seen by a human, which is what
# provision-ssm-secret.sh does, and its refusal branch says so in as many words:
# a value "an operator pastes from a provider console" is not that script's job.
# The other kind is exactly that. It is read off a vendor's dashboard, exists
# nowhere else the project controls, and often cannot be re-displayed, so losing
# it means going back to the vendor rather than regenerating.
#
# That difference decides the handling. A generated secret can be destroyed
# freely on any failure, because another one costs nothing. A pasted one cannot:
# once it has reached an environment the operator must be able to retry without
# a trip back to the vendor, and before it has reached one there is no reason to
# keep a file they never asked for.
#
# So the rules here are:
#
#   - The value is typed, never taken from a flag, a variable or a file path on
#     a command line. argv is readable by every process on the machine.
#   - Echo is off while it is typed, and a terminal is required. A script
#     reading a typed secret from a pipe takes whatever the pipe holds.
#   - It is written under the environment's own KMS alias, so the parameter is
#     encrypted with the key that environment owns rather than the account
#     default.
#   - The write is verified by reading the value back and checking it is no
#     longer the Terraform placeholder. A successful put is not a stored value:
#     the parameter can exist, be readable, and still hold `TODO-`.
#   - Nothing is written to a path the caller did not name, and nothing is
#     logged.

VENDOR_SECRET_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=secret-file.sh
source "${VENDOR_SECRET_LIB_DIR}/secret-file.sh"
# shellcheck source=terminal.sh
source "${VENDOR_SECRET_LIB_DIR}/terminal.sh"

# Test seam (CI only; operators never set this): replaces the aws CLI.
VENDOR_SECRET_AWS_BIN="${VENDOR_SECRET_AWS_BIN:-aws}"

# Terraform seeds every operator-supplied secret shell with this prefix, and both
# the deploy's shape gate and the application's boot check reject a value
# carrying it. Reading it back is what distinguishes an environment that was
# applied but never provisioned from one that is genuinely ready.
VENDOR_SECRET_PLACEHOLDER_PREFIX="TODO-"

VENDOR_SECRET_VALUE=""
VENDOR_SECRET_ERROR=""

# vendor_secret_read <prompt>
#
# Leaves the typed value in VENDOR_SECRET_VALUE. Returns non-zero, having read
# nothing, when there is no terminal to type on.
vendor_secret_read() {
  local prompt="$1" first="" second=""
  VENDOR_SECRET_VALUE=""
  VENDOR_SECRET_ERROR=""

  if ! terminal_present --with-stdin; then
    VENDOR_SECRET_ERROR="no terminal to type a secret on; nothing was read"
    return 1
  fi

  printf '%s' "$prompt" > /dev/tty
  IFS= read -rs first < /dev/tty || first=""
  printf '\n' > /dev/tty

  if [[ -z "$first" ]]; then
    VENDOR_SECRET_ERROR="nothing was entered"
    return 1
  fi

  # Asked twice because it is not echoed, so a mistyped or truncated paste is
  # invisible at the moment it happens and surfaces later as an authentication
  # failure in the application, which reads as an outage rather than a typo.
  printf 'Again, to confirm: ' > /dev/tty
  IFS= read -rs second < /dev/tty || second=""
  printf '\n' > /dev/tty

  if [[ "$first" != "$second" ]]; then
    VENDOR_SECRET_ERROR="the two entries differ; nothing was written"
    return 1
  fi

  VENDOR_SECRET_VALUE="$first"
  return 0
}

# vendor_secret_put <parameter-name> <kms-alias> <value> [aws-args...]
#
# Writes, then proves the write by reading it back.
vendor_secret_put() {
  local param="$1" alias="$2" value="$3"
  shift 3
  VENDOR_SECRET_ERROR=""

  # The value reaches the CLI through a file rather than through argv, because
  # `--value "$SECRET"` puts it where `ps` can read it for as long as the call
  # takes. The file is mode-restricted at creation and destroyed on every exit
  # path from this function, including a failed put.
  local tmp
  tmp="$(umask 077 && mktemp)" || {
    VENDOR_SECRET_ERROR="could not create a temp file for the value"
    return 1
  }
  # RETURN destroys it the moment this function is done, which is sooner than the
  # run ends, but it does not fire on an interrupt. The registry covers Ctrl-C:
  # the caller sweeps it from the EXIT/INT/TERM trap it already owns.
  secret_file_register "$tmp"
  # shellcheck disable=SC2064
  trap "secret_file_destroy '${tmp}'; trap - RETURN" RETURN
  printf '%s' "$value" > "$tmp"

  if ! "$VENDOR_SECRET_AWS_BIN" ssm put-parameter \
    --name "$param" \
    --type SecureString \
    --key-id "$alias" \
    --value "file://${tmp}" \
    --overwrite "$@" >/dev/null; then
    VENDOR_SECRET_ERROR="the put-parameter call failed for ${param}"
    return 1
  fi

  # The outcome, not the invocation.
  local stored
  if ! stored="$("$VENDOR_SECRET_AWS_BIN" ssm get-parameter \
    --name "$param" --with-decryption \
    --query 'Parameter.Value' --output text "$@")"; then
    VENDOR_SECRET_ERROR="wrote ${param} but could not read it back to confirm"
    return 1
  fi

  if [[ "$stored" == "${VENDOR_SECRET_PLACEHOLDER_PREFIX}"* ]]; then
    VENDOR_SECRET_ERROR="${param} still holds the Terraform placeholder after the write"
    return 1
  fi
  if [[ "$stored" != "$value" ]]; then
    VENDOR_SECRET_ERROR="${param} reads back as something other than what was written"
    return 1
  fi
  return 0
}

# vendor_secret_status <parameter-name> [aws-args...]
#
# Prints one of: absent, placeholder, set. Reads the value to tell the last two
# apart and prints none of it.
# Answers one of: absent, placeholder, set, unreadable.
#
# `unreadable` is not pedantry. Every non-zero exit used to become `absent`, and
# the caller then told the operator that Terraform had not been applied and that
# they should apply it — so a deactivated key, or a profile without
# ssm:GetParameter or kms:Decrypt, turned a credential fault into an instruction
# to run a production apply. The distinguishing evidence is in the stderr the
# old version discarded.
# Sets VENDOR_SECRET_STATE and VENDOR_SECRET_STATUS_DETAIL rather than printing,
# for the same reason tf_output_read does: `state="$(f)"` runs f in a subshell,
# so the detail explaining WHY it could not be read dies there -- which is the
# whole point of distinguishing unreadable from absent. There is no printing
# form to reach for, so the mistake is not available.
VENDOR_SECRET_STATE=""
VENDOR_SECRET_STATUS_DETAIL=""

vendor_secret_status() {
  local param="$1"
  shift
  local stored err
  VENDOR_SECRET_STATE=""
  VENDOR_SECRET_STATUS_DETAIL=""
  if ! err="$("$VENDOR_SECRET_AWS_BIN" ssm get-parameter \
    --name "$param" --with-decryption \
    --query 'Parameter.Value' --output text "$@" 2>&1 1>/dev/null)"; then
    VENDOR_SECRET_STATUS_DETAIL="$err"
    case "$err" in
      *ParameterNotFound*) VENDOR_SECRET_STATE="absent" ;;
      *) VENDOR_SECRET_STATE="unreadable" ;;
    esac
    return 0
  fi
  if ! stored="$("$VENDOR_SECRET_AWS_BIN" ssm get-parameter \
    --name "$param" --with-decryption \
    --query 'Parameter.Value' --output text "$@" 2>/dev/null)"; then
    VENDOR_SECRET_STATUS_DETAIL="the parameter became unreadable between two reads"
    VENDOR_SECRET_STATE="unreadable"
    return 0
  fi
  if [[ "$stored" == "${VENDOR_SECRET_PLACEHOLDER_PREFIX}"* ]]; then
    VENDOR_SECRET_STATE="placeholder"
    return 0
  fi
  VENDOR_SECRET_STATE="set"
}

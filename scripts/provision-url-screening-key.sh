#!/usr/bin/env bash
# provision-url-screening-key.sh
#
# Full lifecycle for the Google Safe Browsing API key that screens
# member-submitted links, so no step of arming URL screening is a hand-typed
# aws command. The key is operator-supplied: Terraform owns the parameter shell
# and never the value, and the application reads it from Parameter Store through
# the secrets adapter at the first lookup of the process.
#
#   status     Report, per environment: whether the parameter holds a real key
#              or still holds Terraform's placeholder, what the arming switch
#              declares, and whether the two agree. Prints no key material.
#   store      Write a key into one or both environments' parameters. The value
#              travels as a file:// reference, never as an argument, so it
#              reaches neither shell history nor the process list. Every
#              destination is checked before any is written, so a partial write
#              is not possible; the key file is shredded once all of them have
#              taken it, unless --keep-key-file. A failure leaves the file,
#              because the vault is the only other copy.
#
# Write the key file restricted and without a trailing newline, in a shell that
# is not recording history:
#   (umask 077 && printf %s '<key>' > /tmp/sb-key)
# The script refuses a file that is a symlink, is not a regular file, or whose
# mode is not 600 or 400.
#
# One key currently serves both environments, so `--env both` is the ordinary
# way to store: writing one and forgetting the other is the failure this exists
# to prevent. Each environment encrypts under its own KMS key even when the
# plaintext is the same.
#
# Storing a key does NOT turn screening on. That is the arming switch
# url_screening_armed, owned by Terraform: set it in the environment's private
# variables file, apply, and deploy. The order matters and this script enforces
# nothing about it, because it cannot: an environment armed with no key fails
# every URL-bearing form, so store first, then arm. `status` shows you both
# halves.
#
# Usage:
#   scripts/provision-url-screening-key.sh status
#   scripts/provision-url-screening-key.sh --profile <p> status
#   scripts/provision-url-screening-key.sh --env both store
#   scripts/provision-url-screening-key.sh --env production store
#
# store with no --key-file prompts for the key with input hidden, writes its own
# restricted file, and shreds it afterwards. That is the ordinary way to run it:
# nothing about the key reaches the command line, so nothing reaches shell
# history. Pass --key-file only when there is no terminal to prompt on.
#
# Flags:
#   --env staging|production|both   Environment(s) to act on. Default: both.
#   --key-file <path>               File holding the key, no trailing newline.
#                                   Optional; prompts when omitted.
#   --profile <p>                   AWS profile; else ambient AWS_PROFILE.
#   --keep-key-file                 Do not shred the key file after storing.
set -euo pipefail

TARGET_ENV="both"
KEY_FILE=""
AWS_PROFILE_ARG=""
KEEP_KEY_FILE=0
PROMPTED_KEY_FILE=0
ACTION=""

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot truncate the help text or run past it into the script body.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      TARGET_ENV="${2:-}"
      shift 2 || { echo "ERROR: --env requires an argument" >&2; exit 2; }
      ;;
    --key-file)
      KEY_FILE="${2:-}"
      shift 2 || { echo "ERROR: --key-file requires an argument" >&2; exit 2; }
      ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --keep-key-file)
      KEEP_KEY_FILE=1
      shift
      ;;
    -h|--help)
      usage
      ;;
    status|store)
      ACTION="$1"
      shift
      ;;
    *)
      echo "ERROR: unknown argument '$1'" >&2
      usage
      ;;
  esac
done

[[ -n "$ACTION" ]] || { echo "ERROR: name an action: status or store." >&2; usage; }

case "$TARGET_ENV" in
  staging|production) ENVS=("$TARGET_ENV") ;;
  both)               ENVS=(staging production) ;;
  *)
    echo "ERROR: --env must be 'staging', 'production' or 'both' (got '$TARGET_ENV')." >&2
    exit 2
    ;;
esac

AWS_ARGS=()
[[ -n "$AWS_PROFILE_ARG" ]] && AWS_ARGS+=(--profile "$AWS_PROFILE_ARG")

# Terraform seeds every operator-supplied secret shell with this prefix, and the
# live adapter treats a value carrying it as "not configured" rather than
# sending it to Google. Reading it here is what lets status tell an environment
# that was applied but never keyed from one that is genuinely ready.
PLACEHOLDER_PREFIX="TODO-"

param_for() { echo "/footbag/$1/secrets/safe_browsing_api_key"; }
switch_for() { echo "/footbag/$1/app/url_screening_armed"; }
kms_for() { echo "alias/footbag-$1"; }

# Classify the stored value without ever printing it: absent, placeholder, or a
# real key reported only by length.
key_state_for() {
  local env="$1" param value
  param="$(param_for "$env")"
  if ! aws ssm get-parameter --name "$param" "${AWS_ARGS[@]}" >/dev/null 2>&1; then
    echo "absent"
    return
  fi
  value=$(
    aws ssm get-parameter --name "$param" --with-decryption \
      --query 'Parameter.Value' --output text "${AWS_ARGS[@]}" 2>/dev/null
  ) || { echo "unreadable"; return; }
  if [[ -z "$value" ]]; then
    echo "empty"
  elif [[ "$value" == "${PLACEHOLDER_PREFIX}"* ]]; then
    echo "placeholder"
  else
    echo "set:${#value}"
  fi
}

do_status() {
  local env param switch key_state switch_value
  echo "== URL screening key and switch =="
  for env in "${ENVS[@]}"; do
    param="$(param_for "$env")"
    switch="$(switch_for "$env")"
    key_state="$(key_state_for "$env")"
    switch_value=$(
      aws ssm get-parameter --name "$switch" --query 'Parameter.Value' \
        --output text "${AWS_ARGS[@]}" 2>/dev/null
    ) || switch_value="absent"
    echo ""
    echo "  ${env}"
    case "$key_state" in
      absent)
        echo "    key:      parameter ABSENT (${param}); terraform apply creates the shell" ;;
      placeholder)
        echo "    key:      placeholder only; this environment has never been keyed" ;;
      empty)
        echo "    key:      present but EMPTY; store a key before arming" ;;
      unreadable)
        echo "    key:      present but could not be read; check the profile's KMS access" ;;
      set:*)
        echo "    key:      set (${key_state#set:} characters); value not shown" ;;
    esac
    echo "    switch:   url_screening_armed = ${switch_value}"
    if [[ "$switch_value" == "armed" && "$key_state" != set:* ]]; then
      # Deliberately on stdout with the rest of the report: a warning that lands
      # out of position under a pipe is a warning read against the wrong row.
      echo "    WARNING:  armed with no usable key. Every URL-bearing form on this"
      echo "              environment fails until a key is stored and a deploy runs."
    fi
    if [[ "$switch_value" == "dark" && "$key_state" == set:* ]]; then
      echo "    note:     keyed but dark; screening is off until the switch is armed:"
      echo "                scripts/arming.sh --target ${env} --switch url_screening --state armed"
      echo "              That script owns the values file, the apply and the deploy"
      echo "              in order, and refuses to arm without a usable key."
    fi
  done
}

# Shred only where the key actually reached every destination. A failure
# part-way through must leave the file: the vault is the only other copy, and
# destroying an operator's key because the second environment was unreachable
# turns a retry into a trip back to the Google console.
shred_key_file() {
  shred -u "$KEY_FILE" 2>/dev/null || rm -f "$KEY_FILE" 2>/dev/null || true
}

do_store() {
  local env param kms written=()

  # No --key-file: read the key from the terminal without echoing it, and write
  # the restricted file ourselves. This is the ordinary way to run store. The
  # alternative asks an operator to compose a redirection containing the key,
  # which puts it in shell history and, at the default umask, in a file the rest
  # of the workstation can read.
  #
  # Read from /dev/tty rather than stdin, and refuse when there is no terminal:
  # a caller redirecting a credential file into this script would otherwise have
  # its first line consumed as the key.
  if [[ -z "$KEY_FILE" ]]; then
    # The gate is whether the controlling terminal can actually be opened, not
    # whether stdout is one and not whether the device node looks readable.
    # Testing stdout refuses a perfectly interactive run whose output happens to
    # be piped; testing the permission bits passes in a session with no
    # controlling terminal at all, because /dev/tty is a world-readable node
    # whose open fails rather than whose mode denies. Only the open tells the
    # truth, so attempt one in a subshell.
    if ! (exec 3< /dev/tty) 2>/dev/null; then
      echo "ERROR: no terminal to prompt on, and no --key-file given." >&2
      echo "       Run this interactively, or write the key to a restricted file first:" >&2
      echo "         (umask 077 && printf %s '<key>' > /tmp/sb-key)   # records the key in shell history" >&2
      exit 2
    fi
    KEY_FILE=$(mktemp /tmp/footbag-sb-key.XXXXXX)
    chmod 600 "$KEY_FILE"
    PROMPTED_KEY_FILE=1
    printf 'Paste the Safe Browsing API key (input hidden), then press enter: ' > /dev/tty
    local typed=""
    IFS= read -rs typed < /dev/tty
    printf '\n' > /dev/tty
    printf %s "$typed" > "$KEY_FILE"
    unset typed
  fi

  # A regular file, and not a symlink. Both matter: -r and -s are true for a
  # directory, whose shape checks all silently pass; and the shred below follows
  # a symlink, so a link pointing at something else would have that file's
  # contents stored as the key and then destroyed.
  if [[ -L "$KEY_FILE" ]]; then
    echo "ERROR: --key-file '$KEY_FILE' is a symlink; pass the file itself." >&2
    exit 1
  fi
  if [[ ! -f "$KEY_FILE" ]]; then
    echo "ERROR: --key-file '$KEY_FILE' is not a regular file." >&2
    exit 1
  fi
  [[ -r "$KEY_FILE" ]] || { echo "ERROR: --key-file '$KEY_FILE' is not readable." >&2; exit 1; }

  # Mode, the same refusal the deploy wrapper applies to the operator credential
  # file. A key sitting at the default umask is readable by every account on the
  # workstation for as long as it exists.
  local mode
  mode=$(stat -c '%a' "$KEY_FILE" 2>/dev/null || echo "unknown")
  if [[ "$mode" != "600" && "$mode" != "400" ]]; then
    echo "ERROR: --key-file '$KEY_FILE' has mode ${mode}; expected 600 or 400." >&2
    echo "       Create it restricted: (umask 077 && printf %s '<key>' > '$KEY_FILE')" >&2
    exit 1
  fi

  # Shape checks, all before any write, so a bad paste is caught here rather
  # than at the first member submission. A trailing newline is the common one:
  # it reaches Google as part of the key and fails authentication.
  if [[ ! -s "$KEY_FILE" ]]; then
    echo "ERROR: --key-file '$KEY_FILE' is empty." >&2
    exit 1
  fi
  if [[ $(wc -l < "$KEY_FILE") -gt 0 ]]; then
    echo "ERROR: --key-file '$KEY_FILE' contains a newline; the key would be stored with it." >&2
    echo "       Write it restricted and without one, in a shell that is not recording history:" >&2
    echo "         (umask 077 && printf %s '<key>' > '$KEY_FILE')" >&2
    exit 1
  fi
  if grep -q '[[:space:]]' "$KEY_FILE"; then
    echo "ERROR: --key-file '$KEY_FILE' contains whitespace; a Safe Browsing key has none." >&2
    exit 1
  fi
  if grep -q "^${PLACEHOLDER_PREFIX}" "$KEY_FILE"; then
    echo "ERROR: --key-file '$KEY_FILE' holds Terraform's placeholder, not a key." >&2
    exit 1
  fi

  # Every destination is checked before any of them is written, so --env both
  # cannot write one environment and then discover the other is unreachable.
  for env in "${ENVS[@]}"; do
    param="$(param_for "$env")"
    if ! aws ssm get-parameter --name "$param" "${AWS_ARGS[@]}" >/dev/null 2>&1; then
      echo "ERROR: ${param} is not readable." >&2
      echo "       Either terraform/${env} has not been applied, so the parameter shell" >&2
      echo "       does not exist, or this profile cannot read it. Nothing was written." >&2
      exit 1
    fi
  done

  for env in "${ENVS[@]}"; do
    param="$(param_for "$env")"
    kms="$(kms_for "$env")"
    if ! aws ssm put-parameter \
      --name "$param" \
      --type SecureString \
      --key-id "$kms" \
      --value "file://${KEY_FILE}" \
      --overwrite \
      "${AWS_ARGS[@]}" >/dev/null; then
      echo "ERROR: writing ${param} failed." >&2
      if (( ${#written[@]} > 0 )); then
        echo "       Already written: ${written[*]}. Those are keyed; this one is not." >&2
      fi
      echo "       The key file is left in place so you can re-run; delete it yourself" >&2
      echo "       once every environment is keyed." >&2
      exit 1
    fi
    written+=("$param")
    echo "Stored the key in ${param} (SecureString, ${kms})."
  done

  # Every destination took it, so the local copy has no remaining purpose. A file
  # this script created from a prompt is always shredded: the operator never
  # asked for it to exist, so leaving it would be a copy nobody knows about.
  if (( ! KEEP_KEY_FILE )) || (( PROMPTED_KEY_FILE )); then
    shred_key_file
    (( PROMPTED_KEY_FILE )) || echo "Shredded ${KEY_FILE}."
  fi

  echo ""
  echo "The application resolves this lazily on the first lookup of the process,"
  echo "so a running host needs a deploy before it uses the new value."
  echo "Storing a key does not turn screening on: arm url_screening_armed in the"
  echo "environment's private variables file, terraform apply, then deploy."
  echo "Re-run this script's status action to see both halves."
}

case "$ACTION" in
  status) do_status ;;
  store)  do_store ;;
esac

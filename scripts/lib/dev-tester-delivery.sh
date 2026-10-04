#!/usr/bin/env bash
# shellcheck shell=bash
# dev-tester-delivery.sh — the sealed delivery a dev-and-tester receives, written
# by scripts/onboard-dev-tester.sh on a holder's machine and read by
# scripts/accept-dev-tester-onboarding.sh on the newcomer's own, which is the
# same machine when a holder onboards themselves.
#
# The delivery is everything the newcomer cannot fetch for themselves: the
# one-time password of their host account, their IAM access key, the account's
# role ARNs, and the staging host's pin lines, which their job role is denied
# the Lightsail call to read. It is sealed with age to the SSH public key they
# sent, so it can travel by any channel and only the holder of the matching
# private key opens it.
#
# The format has one home, here, so the writer and the reader cannot drift. It
# is KEY=VALUE lines, one value per line, everything after the first '=' taken
# literally. The reader never sources it: the file comes from outside and a
# sourced file is a program. Unknown keys, repeated keys (other than PIN) and
# missing keys are refused rather than guessed around.

DELIVERY_FORMAT="footbag-dev-tester-delivery-1"
# Every single-valued key, in the order the writer emits them.
DELIVERY_KEYS=(TARGET ACCOUNT FULL_NAME HOST_PASSWORD AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY AWS_ACCOUNT_ID DEV_TESTER_ROLE_ARN
  STAGING_RUNTIME_ROLE_ARN HOST_ADDRESS HOST_PORT)

# delivery_require_tools <name>=<command>...
# Checks every tool the caller needs before anything changes, and returns 1
# after naming every missing one with the exact line that installs it. It
# reports and never installs: the person is often on a machine set up before the
# tool was needed, and what they install is theirs to run. <name> is the tool's
# real name, which the instruction is written for; <command> is what is looked
# for, which a test seam may have replaced.
delivery_require_tools() {
  local pair name cmd missing=()
  for pair in "$@"; do
    name="${pair%%=*}"
    cmd="${pair#*=}"
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$name")
  done
  (( ${#missing[@]} == 0 )) && return 0
  echo "ERROR: this machine is missing what this command needs:" >&2
  for name in "${missing[@]}"; do
    case "$name" in
      age)
        echo "  - age, which seals and opens the delivery:  sudo apt install age" >&2
        ;;
      aws)
        echo "  - the AWS CLI v2, which proves your identity:" >&2
        echo "      https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html" >&2
        ;;
      ssh|ssh-keygen)
        echo "  - ${name}:  sudo apt install openssh-client" >&2
        ;;
      openssl)
        echo "  - openssl:  sudo apt install openssl" >&2
        ;;
      terraform|jq|rsync|sqlite3)
        echo "  - ${name}, which the staging deploy and tests use:" >&2
        echo "      bash scripts/setup-dev-workstation.sh --aws installs it" >&2
        ;;
      docker)
        echo "  - docker, which builds what the staging deploy ships: the container" >&2
        echo "      runtime install in the developer onboarding guide" >&2
        ;;
      *)
        echo "  - ${name}" >&2
        ;;
    esac
  done
  echo "Nothing was changed on this machine. Install the above, then run the same" >&2
  echo "command again." >&2
  return 1
}

# delivery_age_recipient_tag <ssh-public-key-line>
# Prints the tag age writes into a sealed file's header for an SSH recipient:
# the first four bytes of the SHA-256 of the key's wire encoding, in unpadded
# base64. It names which key a file was sealed to without naming the key, so
# the onboarding can prove the file it wrote is for the key it was given, and the
# newcomer can find the pair that opens it without trying each one.
delivery_age_recipient_tag() {
  local blob
  blob="$(awk '{print $2}' <<<"$1")"
  [[ -n "$blob" ]] || return 1
  printf '%s' "$blob" | base64 -d 2>/dev/null \
    | openssl dgst -sha256 -binary | head -c 4 | base64 | tr -d '='
}

# delivery_age_header_tags <sealed-file>
# Prints the recipient tag of each SSH stanza in a sealed file's header, one per
# line. The header is plain text ahead of the encrypted body.
delivery_age_header_tags() {
  sed -n '/^---/q;p' "$1" 2>/dev/null \
    | awk '$1 == "->" && ($2 == "ssh-ed25519" || $2 == "ssh-rsa") {print $3}'
}

# delivery_bundle_emit
# Writes the bundle to stdout from DELIVERY_<KEY> variables and the DELIVERY_PINS
# array. Called with stdout redirected to a mode-600 file; every write is the
# printf builtin, so no value reaches any process's argv. Refuses a value
# carrying a newline, which would forge a second line.
delivery_bundle_emit() {
  local key var pin
  for key in "${DELIVERY_KEYS[@]}"; do
    var="DELIVERY_${key}"
    if [[ -z "${!var:-}" || "${!var}" == *$'\n'* ]]; then
      echo "ERROR: the delivery's ${key} is empty or spans lines." >&2
      return 1
    fi
  done
  for pin in "${DELIVERY_PINS[@]}"; do
    if [[ -z "$pin" || "$pin" == *$'\n'* ]]; then
      echo "ERROR: a pin line is empty or spans lines." >&2
      return 1
    fi
  done
  printf 'FORMAT=%s\n' "$DELIVERY_FORMAT"
  for key in "${DELIVERY_KEYS[@]}"; do
    var="DELIVERY_${key}"
    printf '%s=%s\n' "$key" "${!var}"
  done
  for pin in "${DELIVERY_PINS[@]}"; do
    printf 'PIN=%s\n' "$pin"
  done
}

# delivery_bundle_parse <file>
# Sets DELIVERY_<KEY> for every key and DELIVERY_PINS, or returns 1 with the
# reason in DELIVERY_ERROR.
delivery_bundle_parse() {
  local file="$1" line key value seen=" " k
  DELIVERY_ERROR=""
  DELIVERY_PINS=()
  for k in "${DELIVERY_KEYS[@]}"; do
    printf -v "DELIVERY_${k}" '%s' ""
  done
  local format_seen=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    if [[ "$line" != *=* ]]; then
      DELIVERY_ERROR="a line carries no '='"
      return 1
    fi
    key="${line%%=*}"
    value="${line#*=}"
    if [[ "$key" == "FORMAT" ]]; then
      if [[ "$value" != "$DELIVERY_FORMAT" ]]; then
        DELIVERY_ERROR="format '${value}' is not ${DELIVERY_FORMAT}"
        return 1
      fi
      format_seen=1
      continue
    fi
    if [[ "$key" == "PIN" ]]; then
      DELIVERY_PINS+=("$value")
      continue
    fi
    local known=0
    for k in "${DELIVERY_KEYS[@]}"; do
      [[ "$k" == "$key" ]] && known=1
    done
    if (( ! known )); then
      DELIVERY_ERROR="unknown key '${key}'"
      return 1
    fi
    if [[ "$seen" == *" ${key} "* ]]; then
      DELIVERY_ERROR="key '${key}' appears twice"
      return 1
    fi
    seen+="${key} "
    printf -v "DELIVERY_${key}" '%s' "$value"
  done < "$file"
  if (( ! format_seen )); then
    DELIVERY_ERROR="no FORMAT line"
    return 1
  fi
  for k in "${DELIVERY_KEYS[@]}"; do
    if [[ "$seen" != *" ${k} "* ]]; then
      DELIVERY_ERROR="key '${k}' is missing"
      return 1
    fi
  done
  if (( ${#DELIVERY_PINS[@]} < 2 )); then
    DELIVERY_ERROR="fewer than two pin lines"
    return 1
  fi
  return 0
}

#!/usr/bin/env bash
# provision-ssm-secret.sh
#
# Writes a generated opaque secret into one environment's Parameter Store entry,
# so no step of provisioning or rotating it is a hand-typed aws command. These
# are the secrets Terraform declares but deliberately does not hold: the shell
# carries a placeholder and `lifecycle { ignore_changes = [value] }`, and the
# real value is written here instead.
#
# Why the value is not Terraform-generated. A `random_id` result is stored in
# Terraform state in plaintext by construction, so a Terraform-owned secret is a
# secret in the state file. A saved plan committed under an unmatched ignore
# rule published two of these for seven weeks. Encrypting the state harder does
# not reach that; keeping the value out of it does.
#
#   status     Report, for the named environment and secret, whether the
#              parameter holds a real value or still holds Terraform's
#              placeholder. Prints no secret material, only a length.
#   store      Generate a fresh value and write it. The value travels as a
#              file:// reference, never as an argument, so it reaches neither
#              shell history nor the process list, and the temporary file is
#              shredded once the write lands.
#
# Overwriting a parameter that already holds a real value is a rotation, and a
# rotation has consequences the caller has to accept out loud: this refuses to
# proceed without a typed confirmation on the terminal. Writing over the
# placeholder is first provisioning and needs no confirmation, because there is
# nothing to lose.
#
# One environment per run, and no `--env both`. Each environment's value is
# independent and must differ, so a mode that wrote one value to both would be
# wrong for every secret this script handles. Rotating two environments is two
# runs, deliberately.
#
# Usage:
#   scripts/provision-ssm-secret.sh --env staging --secret session_secret status
#   scripts/provision-ssm-secret.sh --env production --secret session_secret store
#
# Flags:
#   --env staging|production        Required. The environment to act on.
#   --secret <name>                 Required. One of the supported names below.
#   --profile <p>                   AWS profile; else ambient AWS_PROFILE.
set -euo pipefail

TARGET_ENV=""
SECRET_NAME=""
AWS_PROFILE_ARG=""
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
    --secret)
      SECRET_NAME="${2:-}"
      shift 2 || { echo "ERROR: --secret requires an argument" >&2; exit 2; }
      ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
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
  staging|production) ;;
  "")
    echo "ERROR: --env is required (staging or production)." >&2
    exit 2
    ;;
  *)
    echo "ERROR: --env must be 'staging' or 'production' (got '$TARGET_ENV')." >&2
    exit 2
    ;;
esac

# An allowlist rather than a free-form parameter name, and the safety property is
# the point rather than tidiness: a mistyped name must not create a parameter
# Terraform never declared, sitting outside every apply and every inventory,
# holding a live secret nothing reads. Adding a secret here is one line, and it
# belongs to whichever change adds the Terraform shell for it.
case "$SECRET_NAME" in
  session_secret) ;;
  "")
    echo "ERROR: --secret is required. Supported: session_secret." >&2
    exit 2
    ;;
  *)
    echo "ERROR: --secret '$SECRET_NAME' is not one this script provisions." >&2
    echo "       Supported: session_secret." >&2
    echo "       A secret Terraform generates, or one an operator pastes from a" >&2
    echo "       provider console, is not this script's job." >&2
    exit 2
    ;;
esac

AWS_ARGS=()
[[ -n "$AWS_PROFILE_ARG" ]] && AWS_ARGS+=(--profile "$AWS_PROFILE_ARG")

PARAM="/footbag/${TARGET_ENV}/secrets/${SECRET_NAME}"
KMS_ALIAS="alias/footbag-${TARGET_ENV}"

# Terraform seeds every operator-supplied secret shell with this prefix, and the
# deploy's own shape gate and the application's boot check both reject a value
# carrying it. Reading it here is what lets status tell an environment that was
# applied but never provisioned from one that is genuinely ready.
PLACEHOLDER_PREFIX="TODO-"

SECRET_FILE=""
cleanup() {
  [[ -n "$SECRET_FILE" && -e "$SECRET_FILE" ]] || return 0
  shred -u "$SECRET_FILE" 2>/dev/null || rm -f "$SECRET_FILE" 2>/dev/null || true
}
# On the trap rather than at the end of the happy path: a generated secret that
# survives an interrupt is a live credential in /tmp that nobody is looking for.
trap cleanup EXIT INT TERM

# Classify the stored value without ever printing it.
current_state() {
  local value
  if ! aws ssm get-parameter --name "$PARAM" "${AWS_ARGS[@]}" >/dev/null 2>&1; then
    echo "absent"
    return
  fi
  value=$(
    aws ssm get-parameter --name "$PARAM" --with-decryption \
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
  local state
  state="$(current_state)"
  echo "== ${SECRET_NAME} (${TARGET_ENV}) =="
  echo "  parameter: ${PARAM}"
  case "$state" in
    absent)
      echo "  value:     parameter ABSENT; terraform apply creates the shell" ;;
    placeholder)
      echo "  value:     placeholder only; this environment has never been provisioned" ;;
    empty)
      echo "  value:     present but EMPTY; store a value before deploying" ;;
    unreadable)
      echo "  value:     present but could not be read; check the profile's KMS access" ;;
    set:*)
      echo "  value:     set (${state#set:} characters); value not shown" ;;
  esac
  if [[ "$state" != set:* ]]; then
    echo "  next:      $0 --env ${TARGET_ENV} --secret ${SECRET_NAME} store"
  fi
}

do_store() {
  local state typed

  # Check the destination before generating anything. A value minted against a
  # parameter that turns out to be unreachable is a live credential with nowhere
  # to go, and the operator has no way to know whether it landed.
  state="$(current_state)"
  if [[ "$state" == "absent" ]]; then
    echo "ERROR: ${PARAM} is not readable." >&2
    echo "       Either terraform/${TARGET_ENV} has not been applied, so the parameter" >&2
    echo "       shell does not exist, or this profile cannot read it. Nothing was" >&2
    echo "       generated and nothing was written." >&2
    exit 1
  fi
  if [[ "$state" == "unreadable" ]]; then
    echo "ERROR: ${PARAM} exists but could not be decrypted with this profile." >&2
    echo "       Storing without being able to read back would leave you unable to" >&2
    echo "       tell whether it worked. Fix the KMS grant first." >&2
    exit 1
  fi

  # Overwriting a real value is a rotation. For the session secret that signs
  # every cookie, it logs every member out at the next request, so it is not a
  # thing to discover afterwards.
  if [[ "$state" == set:* ]]; then
    if ! (exec 3< /dev/tty) 2>/dev/null; then
      echo "ERROR: ${PARAM} already holds a real value, and rotating it needs a typed" >&2
      echo "       confirmation on a terminal. There is none here." >&2
      exit 1
    fi
    echo "${PARAM} already holds a value (${state#set:} characters)."
    case "$SECRET_NAME" in
      session_secret)
        echo "Rotating it invalidates every active session on ${TARGET_ENV}: each member"
        echo "is signed out at their next request, and the host serves the old value"
        echo "until a deploy runs."
        ;;
    esac
    printf 'Type ROTATE to continue, anything else to abort: ' > /dev/tty
    IFS= read -r typed < /dev/tty
    if [[ "$typed" != "ROTATE" ]]; then
      echo "Aborted. Nothing was generated and nothing was written."
      exit 1
    fi
  fi

  # 32 bytes as 64 lowercase hex characters. That clears the application's
  # 32-character floor, carries no '#' (which would end the line early in the
  # systemd EnvironmentFile the deploy writes), and cannot collide with the
  # 'changeme' placeholder any of the guards look for.
  SECRET_FILE=$(mktemp /tmp/footbag-ssm-secret.XXXXXX)
  chmod 600 "$SECRET_FILE"
  openssl rand -hex 32 | tr -d '\n' > "$SECRET_FILE"

  if [[ $(wc -c < "$SECRET_FILE") -ne 64 ]]; then
    echo "ERROR: generated value is not 64 characters; refusing to store it." >&2
    exit 1
  fi

  if ! aws ssm put-parameter \
    --name "$PARAM" \
    --type SecureString \
    --key-id "$KMS_ALIAS" \
    --value "file://${SECRET_FILE}" \
    --overwrite \
    "${AWS_ARGS[@]}" >/dev/null; then
    echo "ERROR: writing ${PARAM} failed. Nothing was changed." >&2
    exit 1
  fi

  # Read back rather than trusting the write. The failure this catches is a
  # parameter that took the value under the wrong key, or took a truncated one.
  state="$(current_state)"
  if [[ "$state" != "set:64" ]]; then
    echo "ERROR: wrote ${PARAM} but read it back as '${state}', expected set:64." >&2
    echo "       Investigate before deploying; the host may now be out of step." >&2
    exit 1
  fi

  echo "Stored a fresh ${SECRET_NAME} in ${PARAM} (SecureString, ${KMS_ALIAS}), 64 characters."
  echo ""
  echo "The value is not on this host: it went straight from openssl to Parameter"
  echo "Store and the temporary file is shredded. Terraform never sees it, so it"
  echo "is not in state."
  echo ""
  echo "A running host still holds the previous value. Deploy to pick this one up:"
  echo "  DEPLOY_TARGET=footbag-${TARGET_ENV} ./deploy_to_aws.sh"
}

case "$ACTION" in
  status) do_status ;;
  store)  do_store ;;
esac

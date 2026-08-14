#!/usr/bin/env bash
# provision-archive-signing-key.sh
#
# Full lifecycle for the archive cookie-signing keypair, so no step of the
# archive bring-up is a hand-typed openssl chain. CloudFront validates the
# archive's signed cookies against a public key Terraform registers; the
# private half signs them and must reach SSM without ever passing through a
# process argument or shell history.
#
#   generate   Create this environment's 2048-bit RSA keypair in the operator
#              key directory (default ~/AWS), named archive-signing-key-<env>
#              .pem and .pub, 0600 on the private half. Refuses to overwrite an
#              existing key: a replaced key invalidates every cookie signed with
#              the old one, so rotation is deliberate (--force) and follows the
#              additive two-key rotation in the ops guide. Every environment
#              gets its own keypair, because a shared one makes one
#              environment's CloudFront key group validate cookies signed by a
#              key another environment's Parameter Store holds.
#   store      Upload the private half to the environment's SSM SecureString.
#              The value travels as a file:// reference, never as an argument.
#   tfvars     Print the archive_signing_public_key assignment in the exact
#              heredoc shape terraform.tfvars expects, ready to paste or
#              redirect. A retyped or line-wrapped key passes the PEM-header
#              validation and only fails at apply, which is why this is
#              emitted rather than transcribed.
#   status     Report what exists: local keypair, SSM parameter, and whether
#              the stored key matches the local one.
#   all        generate (if absent), store, then tfvars.
#
# The private key never leaves the operator workstation except into SSM, and
# is never printed. Only the public half is ever displayed.
#
# Usage:
#   scripts/provision-archive-signing-key.sh --env staging status
#   scripts/provision-archive-signing-key.sh --env staging --profile <p> all
#   scripts/provision-archive-signing-key.sh --env production --profile <p> store
#
# Flags:
#   --env staging|production   Target environment (required).
#   --profile <p>              AWS profile; else ambient AWS_PROFILE.
#   --key-dir <path>           Operator key directory (default ~/AWS).
#   --force                    Allow overwriting an existing local keypair.
set -euo pipefail

TARGET_ENV=""
AWS_PROFILE_ARG=""
KEY_DIR="${HOME}/AWS"
FORCE=0
ACTION=""

usage() {
  sed -n '2,42p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      TARGET_ENV="${2:-}"
      shift 2 || { echo "ERROR: --env requires an argument" >&2; exit 2; }
      ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --key-dir)
      KEY_DIR="${2:-}"
      shift 2 || { echo "ERROR: --key-dir requires an argument" >&2; exit 2; }
      ;;
    --force) FORCE=1; shift ;;
    generate|store|tfvars|status|all) ACTION="$1"; shift ;;
    -h|--help) usage ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage ;;
  esac
done

if [[ "$TARGET_ENV" != "staging" && "$TARGET_ENV" != "production" ]]; then
  echo "ERROR: --env must be 'staging' or 'production'" >&2
  exit 2
fi
if [[ -z "$ACTION" ]]; then
  echo "ERROR: an action is required: generate | store | tfvars | status | all" >&2
  exit 2
fi

# The key file carries the environment, exactly as the parameter name and the
# KMS alias below do. It did not, once, and every action still reported success:
# a second environment's `generate` met the refuse-to-overwrite branch, which
# reads as protective, and `store` and `tfvars` then carried the first
# environment's key onward. The result is one environment's CloudFront key group
# validating cookies signed by a key another environment's Parameter Store holds,
# which is the cross-environment bridge the per-environment secret scoping exists
# to prevent.
PRIVATE_KEY="${KEY_DIR}/archive-signing-key-${TARGET_ENV}.pem"
PUBLIC_KEY="${KEY_DIR}/archive-signing-key-${TARGET_ENV}.pub"
UNSCOPED_PRIVATE_KEY="${KEY_DIR}/archive-signing-key.pem"
PARAM_NAME="/footbag/${TARGET_ENV}/secrets/archive_signing_private_key"
KMS_ALIAS="alias/footbag-${TARGET_ENV}"

# A key from before the filename carried the environment belongs to whichever
# environment it was registered with, and nothing on this workstation records
# which. Guessing either strands a working environment or hands its key to
# another, so every action that would consume a key refuses until the operator
# resolves it by name. Renaming is safe and sufficient: the file's contents are
# what CloudFront and Parameter Store already hold.
refuse_unscoped_key() {
  [[ -e "$PRIVATE_KEY" || ! -e "$UNSCOPED_PRIVATE_KEY" ]] && return 0
  echo "ERROR: no ${PRIVATE_KEY}, but ${UNSCOPED_PRIVATE_KEY} exists." >&2
  echo "That key predates per-environment key filenames and may belong to a" >&2
  echo "different environment; this script cannot tell which, and using it here" >&2
  echo "would make ${TARGET_ENV} trust a key another environment can read." >&2
  echo "" >&2
  echo "Resolve it by name, then re-run:" >&2
  echo "  - if it is ${TARGET_ENV}'s key, rename it to ${PRIVATE_KEY}" >&2
  echo "    (and its .pub alongside), which changes nothing it is registered with;" >&2
  echo "  - otherwise rename it to the environment it does belong to, and run" >&2
  echo "    the generate action here for a key of this environment's own." >&2
  echo "The status action reports whether a local key matches the stored one." >&2
  exit 1
}

needs_aws() {
  AWS_ARGS=()
  if [[ -n "$AWS_PROFILE_ARG" ]]; then
    AWS_ARGS+=(--profile "$AWS_PROFILE_ARG")
  elif [[ -n "${AWS_PROFILE:-}" ]]; then
    echo "Using ambient AWS_PROFILE=${AWS_PROFILE}"
  else
    echo "ERROR: pass --profile or export AWS_PROFILE (operator credentials;" >&2
    echo "       the runtime roles are read-only on SSM by design)" >&2
    exit 2
  fi
}

do_generate() {
  refuse_unscoped_key
  if [[ -e "$PRIVATE_KEY" && "$FORCE" -ne 1 ]]; then
    echo "REFUSING: ${PRIVATE_KEY} already exists." >&2
    echo "Replacing the key invalidates every cookie signed with it, so members" >&2
    echo "holding a valid cookie lose archive access the moment the old public" >&2
    echo "key leaves the key group. Rotate additively per the ops guide, or pass" >&2
    echo "--force if this key was never registered with CloudFront." >&2
    exit 1
  fi
  mkdir -p "$KEY_DIR"
  chmod 700 "$KEY_DIR" 2>/dev/null || true
  # umask so the private key is never briefly world-readable between creation
  # and chmod.
  (umask 077 && openssl genrsa -out "$PRIVATE_KEY" 2048 2>/dev/null)
  openssl rsa -pubout -in "$PRIVATE_KEY" -out "$PUBLIC_KEY" 2>/dev/null
  chmod 600 "$PRIVATE_KEY"
  chmod 644 "$PUBLIC_KEY"
  echo "Generated ${PRIVATE_KEY} (0600) and ${PUBLIC_KEY}."
}

do_store() {
  refuse_unscoped_key
  needs_aws
  if [[ ! -r "$PRIVATE_KEY" ]]; then
    echo "ERROR: ${PRIVATE_KEY} not readable; run the generate action first." >&2
    exit 1
  fi
  # The parameter shell is Terraform-owned with ignore_changes on value, so it
  # exists (holding a placeholder) before this runs.
  if ! aws ssm get-parameter --name "$PARAM_NAME" "${AWS_ARGS[@]}" >/dev/null 2>&1; then
    echo "ERROR: ${PARAM_NAME} does not exist." >&2
    echo "       Terraform owns the parameter shell; apply the archive stack" >&2
    echo "       (enable_archive = true) before storing the key." >&2
    exit 1
  fi
  aws ssm put-parameter \
    --name "$PARAM_NAME" \
    --type SecureString \
    --key-id "$KMS_ALIAS" \
    --value "file://${PRIVATE_KEY}" \
    --overwrite \
    "${AWS_ARGS[@]}" >/dev/null
  echo "Stored the private key in ${PARAM_NAME} (SecureString, ${KMS_ALIAS})."
  echo "The application reads it at boot through the secrets adapter, so a"
  echo "running app needs a restart to pick up a replaced value."
}

do_tfvars() {
  refuse_unscoped_key
  if [[ ! -r "$PUBLIC_KEY" ]]; then
    echo "ERROR: ${PUBLIC_KEY} not readable; run the generate action first." >&2
    exit 1
  fi
  echo "# Paste into terraform/${TARGET_ENV}/terraform.tfvars (or redirect this"
  echo "# action's output), replacing any existing assignment:"
  echo 'archive_signing_public_key = <<-EOT'
  sed 's/^/  /' "$PUBLIC_KEY"
  echo '  EOT'
}

do_status() {
  echo "Environment: ${TARGET_ENV}"
  if [[ -r "$PRIVATE_KEY" ]]; then
    perms=$(stat -c '%a' "$PRIVATE_KEY" 2>/dev/null || echo '?')
    echo "  local private key: present (${PRIVATE_KEY}, mode ${perms})"
  else
    echo "  local private key: ABSENT (${PRIVATE_KEY})"
    if [[ -e "$UNSCOPED_PRIVATE_KEY" ]]; then
      echo "  unscoped key:      ${UNSCOPED_PRIVATE_KEY} exists and is NOT used here;"
      echo "                     rename it to the environment it belongs to (the other"
      echo "                     actions refuse until it is resolved by name)"
    fi
  fi
  [[ -r "$PUBLIC_KEY" ]] \
    && echo "  local public key:  present (${PUBLIC_KEY})" \
    || echo "  local public key:  ABSENT (${PUBLIC_KEY})"

  needs_aws
  if aws ssm get-parameter --name "$PARAM_NAME" "${AWS_ARGS[@]}" >/dev/null 2>&1; then
    stored_fp=$(
      aws ssm get-parameter --name "$PARAM_NAME" --with-decryption \
        --query 'Parameter.Value' --output text "${AWS_ARGS[@]}" 2>/dev/null \
        | openssl rsa -pubout 2>/dev/null | openssl dgst -sha256 | cut -d' ' -f2
    ) || stored_fp=""
    if [[ -z "$stored_fp" ]]; then
      echo "  SSM parameter:     present, but holds no usable key (placeholder?)"
    else
      echo "  SSM parameter:     present (${PARAM_NAME})"
      if [[ -r "$PRIVATE_KEY" ]]; then
        local_fp=$(openssl rsa -pubout -in "$PRIVATE_KEY" 2>/dev/null \
          | openssl dgst -sha256 | cut -d' ' -f2)
        [[ "$local_fp" == "$stored_fp" ]] \
          && echo "  match:             yes (stored key is the local key)" \
          || echo "  match:             NO - the stored key differs from the local one"
      fi
    fi
  else
    echo "  SSM parameter:     ABSENT (${PARAM_NAME}); apply the archive stack first"
  fi
}

case "$ACTION" in
  generate) do_generate ;;
  store)    do_store ;;
  tfvars)   do_tfvars ;;
  status)   do_status ;;
  all)
    [[ -e "$PRIVATE_KEY" ]] && echo "Local keypair present; skipping generate." || do_generate
    do_store
    echo
    do_tfvars
    ;;
esac

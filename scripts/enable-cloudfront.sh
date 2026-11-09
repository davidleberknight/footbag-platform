#!/usr/bin/env bash
# enable-cloudfront.sh
#
# Turns CloudFront on for one environment, the second Terraform pass every new
# environment takes, end to end: the two values-file lines, the apply, and a
# read-back proving the environment now publishes the address the site is
# served at.
#
# Why it exists. A brand-new environment's first apply leaves CloudFront off,
# because the distribution's custom origin needs a resolvable host name for the
# Lightsail static address and that address does not exist until the first
# apply has made it. The second pass sets enable_cloudfront and
# lightsail_origin_dns together. Typed by hand the pair drifts: one line set and
# not the other, an address copied wrong, a line written and never applied. The
# host bootstrap stops on an environment in that state and names this script.
#
# The origin name is derived from the target, never typed: staging uses the
# static address on nip.io; production uses the origin record the production
# tree declares, origin.<domain_name>.
#
# An environment already on is left alone when its origin line already names
# the derived origin, and has that line corrected when it does not: a staging
# host rebuilt onto a new static address leaves the old address there.
#
# What it refuses: a values file it cannot read; a values file holding no
# enable_cloudfront or lightsail_origin_dns line (it never invents one); a
# static address it cannot read from Terraform; a production values file with
# no domain_name.
#
# Usage:
#   bash scripts/enable-cloudfront.sh --target staging
#   bash scripts/enable-cloudfront.sh --target production
#
# Flags:
#   --target staging|production  Environment to change (required, no default).
#   --yes                        Accept the typed confirmation without asking.
#   --tfvars <path>              CI only; operators never set this. Runs against
#                                a scratch values file and stops before the
#                                apply.
#
# Test seams (each announced on stderr):
#   ENABLE_CLOUDFRONT_TERRAFORM  replaces scripts/terraform-apply.sh
#   ENABLE_CLOUDFRONT_STATIC_IP  replaces the Terraform read of the static address
#   ENABLE_CLOUDFRONT_AWS_BIN    replaces the aws CLI for the read-back
#
# Exit: 0 enabled (or already on), 1 refused or failed, 2 usage error.
set -euo pipefail

TARGET=""
TFVARS_OVERRIDE=""
WANT_ASSUME_YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; } ;;
    --tfvars) TFVARS_OVERRIDE="${2:-}"; shift 2 || { echo "ERROR: --tfvars requires an argument" >&2; exit 2; } ;;
    --yes) WANT_ASSUME_YES=1; shift ;;
    --help|-h) sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# The library clears ASSUME_YES when sourced, so only this flag can set it.
(( WANT_ASSUME_YES )) && ASSUME_YES="yes"

require_target "$TARGET" staging production || exit 2

TFVARS_PATH="${TFVARS_OVERRIDE:-${REPO_ROOT}/terraform/${TARGET}/terraform.tfvars}"
SYNTHETIC=0
if [[ -n "$TFVARS_OVERRIDE" ]]; then
  SYNTHETIC=1
  echo "SYNTHETIC: values file '${TFVARS_PATH}', stopping before the apply." >&2
fi
TERRAFORM_CMD="${ENABLE_CLOUDFRONT_TERRAFORM:-${SCRIPT_DIR}/terraform-apply.sh}"
[[ -n "${ENABLE_CLOUDFRONT_TERRAFORM:-}" ]] && echo "SYNTHETIC: terraform seam '${TERRAFORM_CMD}' -- no estate is reached." >&2
AWS_BIN="${ENABLE_CLOUDFRONT_AWS_BIN:-aws}"
[[ -n "${ENABLE_CLOUDFRONT_AWS_BIN:-}" ]] && echo "SYNTHETIC: aws seam '${AWS_BIN}' -- the read-back proves nothing about the estate." >&2

[[ -r "$TFVARS_PATH" ]] || cr_die "cannot read ${TFVARS_PATH}: each values file is a symlink into the maintainers' private operations checkout, and this script never invents one"

# One assignment's value, unquoted, or empty when the line is absent.
tfvar() {
  grep -E "^[[:space:]]*$1[[:space:]]*=" "$TFVARS_PATH" | head -1 \
    | sed -E 's/^[^=]*=[[:space:]]*//; s/[[:space:]]*(#.*)?$//; s/^"(.*)"$/\1/' || [[ $? == 1 ]]
}
for name in enable_cloudfront lightsail_origin_dns; do
  grep -qE "^[[:space:]]*${name}[[:space:]]*=" "$TFVARS_PATH" \
    || cr_die "${TFVARS_PATH} holds no ${name} line; add it from terraform/${TARGET}/terraform.tfvars.example rather than letting this script invent it"
done

if [[ "$TARGET" == "staging" ]]; then
  if [[ -n "${ENABLE_CLOUDFRONT_STATIC_IP:-}" ]]; then
    echo "SYNTHETIC: static address '${ENABLE_CLOUDFRONT_STATIC_IP}' -- not read from Terraform." >&2
    STATIC_IP="$ENABLE_CLOUDFRONT_STATIC_IP"
  else
    # shellcheck source=lib/aws-profile.sh
    source "${SCRIPT_DIR}/lib/aws-profile.sh"
    # shellcheck source=lib/terraform-output.sh
    source "${SCRIPT_DIR}/lib/terraform-output.sh"
    tf_output_read "${REPO_ROOT}/terraform/${TARGET}" lightsail_static_ip \
      || cr_die "could not read the ${TARGET} static address from Terraform: ${TF_OUTPUT_ERROR}"
    STATIC_IP="$TF_OUTPUT_VALUE"
  fi
  [[ "$STATIC_IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] \
    || cr_die "the ${TARGET} static address '${STATIC_IP}' is not an IPv4 address; has the first apply run?"
  ORIGIN="${STATIC_IP}.nip.io"
else
  DOMAIN="$(tfvar domain_name)"
  [[ -n "$DOMAIN" && "$DOMAIN" != TODO* ]] \
    || cr_die "the production values file holds no domain_name, which the origin record is named under"
  ORIGIN="origin.${DOMAIN}"
fi

# Already on and pointing at this environment's origin: nothing to do. Already
# on but naming another origin, which is what a staging host rebuilt onto a new
# static address leaves behind: the run corrects the origin line the same way.
if [[ "$(tfvar enable_cloudfront)" == "true" && "$(tfvar lightsail_origin_dns)" == "$ORIGIN" ]]; then
  echo "CloudFront is already on for ${TARGET} with origin ${ORIGIN}; leaving the values file alone."
  cr_proved "CloudFront is already enabled in the ${TARGET} values file with origin ${ORIGIN}"
  cr_finish
fi

TFVARS_TMP="$(mktemp "${TMPDIR:-/tmp}/footbag-tfvars.XXXXXX")"
TFVARS_BACKUP="$(mktemp "${TMPDIR:-/tmp}/footbag-tfvars-orig.XXXXXX")"
cp "$TFVARS_PATH" "$TFVARS_BACKUP"
# written: the lines are in the file and Terraform has not been invoked, so a
# revert restores the world exactly. Once the apply starts, AWS is the outside
# record and the file is left alone, whatever the apply's outcome.
STATE="clean"
restore_unapplied() {
  if [[ "$STATE" == "written" ]]; then
    cat "$TFVARS_BACKUP" > "$TFVARS_PATH"
    echo "Put ${TFVARS_PATH} back the way it was found: the apply never started." >&2
  fi
  rm -f "$TFVARS_TMP" "$TFVARS_BACKUP"
}
cr_cleanup restore_unapplied

# Only the value is replaced; the alignment and any trailing comment stay.
sed -E \
  -e "0,/^[[:space:]]*enable_cloudfront[[:space:]]*=/s/^([[:space:]]*enable_cloudfront[[:space:]]*=[[:space:]]*)[^#[:space:]]*/\\1true/" \
  -e "0,/^[[:space:]]*lightsail_origin_dns[[:space:]]*=/s|^([[:space:]]*lightsail_origin_dns[[:space:]]*=[[:space:]]*)[^#[:space:]]*|\\1\"${ORIGIN}\"|" \
  "$TFVARS_PATH" > "$TFVARS_TMP"

echo ""
diff -u "$TFVARS_PATH" "$TFVARS_TMP" || [[ $? == 1 ]]
echo ""
echo "This turns CloudFront on for ${TARGET} with origin ${ORIGIN}, then applies the"
echo "${TARGET} tree, which creates the distribution and publishes the site's address."
if ! confirm_from_tty "Type 'APPLY' to enable CloudFront on ${TARGET}: " "APPLY"; then
  cr_unproved "CloudFront on ${TARGET}: not confirmed, and the values file was not changed"
  cr_finish_with 1 ABORTED
fi

# cat rather than mv: the values file is a symlink into the private checkout,
# and moving over it would replace the link with a real file in this tree.
cat "$TFVARS_TMP" > "$TFVARS_PATH"
STATE="written"

if (( SYNTHETIC )) && [[ -z "${ENABLE_CLOUDFRONT_TERRAFORM:-}" ]]; then
  STATE="applied"
  cr_unproved "the apply: synthetic mode stops before it"
  cr_finish
fi

STATE="applying"
cr_run "terraform apply of ${TARGET}" -- bash "$TERRAFORM_CMD" --target "$TARGET" \
  || cr_die "the ${TARGET} apply did not succeed; the values file is left saying enable_cloudfront = true, because the apply may have created part of the distribution"
STATE="applied"

PARAM="/footbag/${TARGET}/app/public_base_url"
if base_url="$("$AWS_BIN" ssm get-parameter --name "$PARAM" --region us-east-1 \
      --query 'Parameter.Value' --output text 2>&1)" && [[ "$base_url" == https://* ]]; then
  cr_proved "${TARGET} publishes ${PARAM} = ${base_url}"
else
  cr_error "the apply finished but ${PARAM} does not read back as an https address: ${base_url##*$'\n'}"
fi
echo ""
echo "Next: re-run the host bootstrap, which now finds the address:"
echo "  < <credential file> bash scripts/bootstrap-host.sh --target ${TARGET}"
cr_finish

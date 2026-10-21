#!/usr/bin/env bash
# shellcheck shell=bash
# origin-tls.sh -- whether the hop from CloudFront to the production origin is
# encrypted, read from the live distribution.
#
# Until origin TLS is in place, CloudFront reaches the origin over plain HTTP
# through a hostname borrowed from a third-party DNS service, so session cookies,
# passwords typed at sign-in, Stripe webhook bodies and the origin-verify secret
# cross that hop in clear. That is tolerable only while production holds no real
# member and takes no real money. Two acts end that state: taking production
# live, and installing a live Stripe key. The scripts that perform them ask this
# library first and refuse unless the hop is https-only, so the ordering is
# enforced where the act happens rather than remembered from a plan.
#
# The live distribution is read, not the Terraform configuration: what protects
# members is what CloudFront does now, and a configuration change that was never
# applied protects nothing. The distribution id comes from the production tree's
# own output.
#
# Fails closed. An id or a protocol that cannot be read is reported as not
# encrypted, with the reason, because a guard that passes on a failed read is no
# guard.
#
# TEST SEAM: the terraform binary through TF_OUTPUT_BIN (terraform-output.sh), and
# ORIGIN_TLS_AWS_BIN for the CloudFront read, announced on stderr when set.

# shellcheck source=lib/terraform-output.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/terraform-output.sh"

ORIGIN_TLS_AWS_BIN="${ORIGIN_TLS_AWS_BIN:-aws}"

# The origin block the platform's traffic goes to, as named in the production
# distribution. The media and maintenance origins are S3 and always HTTPS.
ORIGIN_TLS_ORIGIN_ID="lightsail-origin"

# The last check's protocol policy as CloudFront reported it, and why the check
# failed when it did. Variables rather than printed output, for the reason
# terraform-output.sh gives: a subshell would lose the reason.
ORIGIN_TLS_POLICY=""
ORIGIN_TLS_REASON=""

# origin_hop_encrypted <terraform-dir> <region>
#
# Reads with the ambient AWS_PROFILE. Returns 0 only when the live origin's
# protocol policy is https-only; otherwise returns 1 with ORIGIN_TLS_REASON set.
origin_hop_encrypted() {
  local dir="$1" region="$2" dist_id

  ORIGIN_TLS_POLICY=""
  ORIGIN_TLS_REASON=""

  if [[ "$ORIGIN_TLS_AWS_BIN" != "aws" ]]; then
    echo "==> NOTE: the CloudFront read is stubbed for this run (ORIGIN_TLS_AWS_BIN)." >&2
  fi

  if ! tf_output_read "$dir" cloudfront_distribution_id || [[ -z "$TF_OUTPUT_VALUE" ]]; then
    ORIGIN_TLS_REASON="the production distribution id could not be read from Terraform (terraform said: ${TF_OUTPUT_ERROR:-an empty value})"
    return 1
  fi
  dist_id="$TF_OUTPUT_VALUE"

  if ! ORIGIN_TLS_POLICY="$("$ORIGIN_TLS_AWS_BIN" cloudfront get-distribution-config \
      --id "$dist_id" --region "$region" \
      --query "DistributionConfig.Origins.Items[?Id=='${ORIGIN_TLS_ORIGIN_ID}'].CustomOriginConfig.OriginProtocolPolicy | [0]" \
      --output text 2>/dev/null)"; then
    ORIGIN_TLS_POLICY=""
    ORIGIN_TLS_REASON="CloudFront did not return the configuration of distribution ${dist_id}"
    return 1
  fi

  if [[ "$ORIGIN_TLS_POLICY" != "https-only" ]]; then
    ORIGIN_TLS_REASON="distribution ${dist_id} reaches its origin with protocol policy '${ORIGIN_TLS_POLICY:-unreadable}', not https-only"
    return 1
  fi
  return 0
}

# origin_hop_refusal <act>
#
# The refusal a caller prints after a failed check, naming what it will not do.
origin_hop_refusal() {
  local act="$1"
  echo "ERROR: refusing to ${act}: the CloudFront-to-origin hop is not encrypted." >&2
  echo "       ${ORIGIN_TLS_REASON}" >&2
  echo "       Real member data and real money must never cross a plaintext hop." >&2
  echo "       Put origin TLS in place first (an https-only origin with a valid" >&2
  echo "       certificate), then re-run. Nothing has been changed." >&2
}

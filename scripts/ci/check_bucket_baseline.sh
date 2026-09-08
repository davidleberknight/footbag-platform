#!/usr/bin/env bash
# S3 bucket baseline gate. Every bucket in every tree carries the same three
# things, and this refuses a tree where one of them is missing:
#
#   - a server-side encryption configuration, declared rather than inherited
#     from the S3 account default, which is invisible from here and settable
#     elsewhere;
#   - a public access block;
#   - a bucket policy carrying a DenyPlaintextAccess statement, which is how the
#     Well-Architected encryption-in-transit practice says to enforce TLS on S3.
#
# All three were true of most buckets and quietly untrue of a few before this
# gate existed: two buckets inherited their encryption, and not one of the
# seventeen refused plaintext. That is the shape this exists to stop — a
# baseline nobody restates when they add the eighteenth bucket.
#
# Keyed off the resource label rather than the bucket name, because the three
# trees build names three different ways (a local map, a prefix interpolation,
# and a variable suffix) and none of them is greppable as a literal.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

violations=""

for tree in terraform/*/; do
  [ -d "$tree" ] || continue
  # A tree with no buckets at all is fine; nothing to hold to the baseline.
  bucket_labels="$(grep -rhoE '^resource "aws_s3_bucket" "[a-z0-9_]+"' "$tree" 2>/dev/null \
    | sed -E 's/.*"aws_s3_bucket" "([a-z0-9_]+)"/\1/' | sort -u || true)"
  [ -n "$bucket_labels" ] || continue

  for label in $bucket_labels; do
    if ! grep -rqE "^resource \"aws_s3_bucket_server_side_encryption_configuration\" \"${label}\"" "$tree"; then
      violations="${violations}\n  ${tree}: bucket '${label}' has no aws_s3_bucket_server_side_encryption_configuration"
    fi
    if ! grep -rqE "^resource \"aws_s3_bucket_public_access_block\" \"${label}\"" "$tree"; then
      violations="${violations}\n  ${tree}: bucket '${label}' has no aws_s3_bucket_public_access_block"
    fi
    if ! grep -rqE "^resource \"aws_s3_bucket_policy\" \"${label}\"" "$tree"; then
      violations="${violations}\n  ${tree}: bucket '${label}' has no aws_s3_bucket_policy, so nothing refuses plaintext to it"
    fi
  done

  # Which buckets a deny statement actually names. Counting denies per tree was
  # the first shape of this rule and a test found the hole in it: two denies on
  # one bucket and none on another balances the count and passes. So resolve it
  # per bucket instead, by reading the resources each DenyPlaintextAccess
  # statement lists. Document names do not follow the bucket label — the OAC and
  # log-delivery documents are named for their purpose — so the bucket reference
  # inside the statement is the only reliable link.
  # The optional index matters: a bucket behind a count is referenced as
  # aws_s3_bucket.archive[0].arn, and a pattern without it silently reports
  # every gated bucket as uncovered.
  covered="$(
    grep -rhA 12 'sid[[:space:]]*=[[:space:]]*"DenyPlaintextAccess"' "$tree" 2>/dev/null \
      | grep -oE 'aws_s3_bucket\.[a-z0-9_]+(\[[0-9]+\])?\.arn' \
      | sed -E 's/aws_s3_bucket\.([a-z0-9_]+)(\[[0-9]+\])?\.arn/\1/' | sort -u || true
  )"

  for label in $bucket_labels; do
    if ! printf '%s\n' "$covered" | grep -qx "$label"; then
      violations="${violations}\n  ${tree}: bucket '${label}' is named by no DenyPlaintextAccess statement, so it still accepts plaintext"
    fi
  done
done

if [ -n "$violations" ]; then
  echo "[bucket-baseline] FAIL"
  # shellcheck disable=SC2059
  printf "$violations\n"
  echo ""
  echo "  Every bucket carries a declared encryption configuration, a public"
  echo "  access block, and a policy whose DenyPlaintextAccess statement refuses"
  echo "  requests where aws:SecureTransport is false. Copy the shape from any"
  echo "  existing bucket; terraform/shared/s3.tf is the smallest example."
  exit 1
fi

echo "[bucket-baseline] pass"

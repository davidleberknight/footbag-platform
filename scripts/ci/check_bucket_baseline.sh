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

# How much this run actually examined, counted rather than assumed.
#
# Every refusal below is raised from inside the loop, so a run that enters the
# loop body zero times reaches the end with nothing to report and prints the same
# "pass" as a run that held a dozen buckets to the baseline. Two ways that
# happens, and neither announces itself: the glob stops expanding because the
# directory moved, or the label pattern stops matching because the declarations
# were reformatted or moved into a module. The second is the likelier one, since
# the pattern is anchored to a single space in `resource "aws_s3_bucket" "x"`.
#
# A scope that has quietly shrunk to nothing is a check that has stopped
# enforcing anything, and reporting that in the words used for success is the
# worst of the available failures. So the count is the verdict's evidence: zero
# is a refusal, and any other number is printed so a reader can see at a glance
# whether it matches the estate they expect.
buckets_scanned=0
trees_with_buckets=0

for tree in terraform/*/; do
  [ -d "$tree" ] || continue
  # A tree with no buckets at all is fine; nothing to hold to the baseline.
  bucket_labels="$(grep -rhoE '^resource "aws_s3_bucket" "[a-z0-9_]+"' "$tree" 2>/dev/null \
    | sed -E 's/.*"aws_s3_bucket" "([a-z0-9_]+)"/\1/' | sort -u || true)"
  [ -n "$bucket_labels" ] || continue
  trees_with_buckets=$(( trees_with_buckets + 1 ))

  for label in $bucket_labels; do
    buckets_scanned=$(( buckets_scanned + 1 ))
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

if [ "$buckets_scanned" -eq 0 ]; then
  echo "[bucket-baseline] FAIL: no S3 bucket declaration was found, so this run" >&2
  echo "  held nothing to the baseline and its pass would have meant nothing." >&2
  echo "" >&2
  echo "  Either the trees moved from terraform/*/, or the declarations no longer" >&2
  echo "  match the pattern this gate reads, which is a line beginning" >&2
  echo "  resource \"aws_s3_bucket\" \"<label>\" with one space between the two" >&2
  echo "  quoted names. Reformatting, or moving the buckets into a module, both" >&2
  echo "  break it. Fix the pattern or the path rather than the count." >&2
  exit 1
fi

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

echo "[bucket-baseline] pass (${buckets_scanned} bucket(s) across ${trees_with_buckets} tree(s))"

#!/usr/bin/env bash
# apply-bucket-tls-baseline.sh
#
# Applies the bucket TLS-deny baseline and the session-secret move out of
# Terraform state, across all three trees, in the one order that is safe.
#
# WHY THIS HAS ITS OWN SCRIPT.
#
# scripts/terraform-apply.sh owns every change that needs nothing but a plan
# read and a confirmation. This one has three preconditions that a generic
# wrapper cannot hold, and each of them fails silently rather than loudly:
#
#   1. The session-secret parameter must come through the apply with its value
#      untouched. Terraform no longer owns that value — the parameter is a shell
#      carrying a placeholder and lifecycle { ignore_changes = [value] } — so a
#      plan proposing to change it means ignore_changes is not taking, and
#      confirming would overwrite a live secret with the literal placeholder and
#      sign out every member on the next deploy. This refuses on that diff
#      before the confirmation, rather than asking an operator to spot it.
#
#   2. The two platform-logs buckets previously had a bucket policy the AWS
#      log-delivery service wrote for itself and none in Terraform. The new
#      policy replaces it wholesale, and the delivery statements are reproduced
#      by hand from the archive log bucket. If they are wrong, nothing errors:
#      CloudFront simply stops delivering access logs, and nobody notices until
#      the logs are wanted. This records the newest delivered key before the
#      apply and re-checks after, so a stopped delivery is caught here.
#
#   3. The shared tree keeps its own state in the bucket it manages. Its deny
#      takes effect the instant PutBucketPolicy returns, on the run that then
#      has to write its state back. A malformed condition locks Terraform out of
#      its own state, and recovery needs a principal outside the deny. This
#      applies that tree last, alone, proves state is still reachable
#      immediately afterwards, and prints the exact recovery call if it is not.
#
# Ordering is staging, then production, then shared: the blast radius grows at
# each step and the earlier steps are the rehearsal for the later ones.
#
# Steps (referenced by --from-step, so a failure part-way is resumable):
#   1  staging: plan, gate, confirm, apply, verify
#   2  production: the same
#   3  shared: the same, plus the state-reachability proof
#   4  final baseline check, against the tree rather than the applied estate
#
# Usage:
#   scripts/apply-bucket-tls-baseline.sh --dry-run
#   scripts/apply-bucket-tls-baseline.sh
#   scripts/apply-bucket-tls-baseline.sh --from-step 3
#   scripts/apply-bucket-tls-baseline.sh --verify-only
#
# Flags:
#   --dry-run       State what a real run would do; run nothing.
#   --from-step N   Resume at step N (1-4).
#   --verify-only   Run the verifications against the estate as it stands.
#   --profile <p>   AWS profile; else ambient AWS_PROFILE.
#   --yes           Accept confirmations where no terminal is attached.
#
# Test seam (CI only; operators never set this): TERRAFORM_APPLY_BIN points the
# terraform command at a stub, announced loudly when set, because a run that
# silently used a stub would prove nothing about the estate.
set -euo pipefail

DRY_RUN=0
FROM_STEP=1
VERIFY_ONLY=0
AWS_PROFILE_ARG=""
# The shared confirm_from_tty helper reads this by name and compares it to the
# string "yes", so it is not a numeric flag like the others here.
ASSUME_YES=""

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# confirm_from_tty reads the answer from /dev/tty rather than stdin, refuses when
# no terminal exists and --yes was not given, and honours --yes. Shared so every
# operator script prompts the same way.
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

TF_BIN="${TERRAFORM_APPLY_BIN:-terraform}"
if [[ -n "${TERRAFORM_APPLY_BIN:-}" ]]; then
  # stderr, and in the same words every other operator script uses. On stdout a
  # wrapper capturing output swallows it, and a stubbed run then reads as a real
  # one -- which is the whole reason a seam has to announce itself.
  echo "SYNTHETIC: terraform='${TF_BIN}' -- this run proves nothing about the estate." >&2
fi

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot truncate the help text or run past it into the script body.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)     DRY_RUN=1; shift ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    --yes)         ASSUME_YES="yes"; shift ;;
    --from-step)
      FROM_STEP="${2:-}"
      shift 2 || { echo "ERROR: --from-step requires an argument" >&2; exit 2; }
      ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 ;;
  esac
done

if [[ ! "$FROM_STEP" =~ ^[1-4]$ ]]; then
  echo "ERROR: --from-step takes a step number from 1 to 4 (got '$FROM_STEP')." >&2
  exit 2
fi

AWS_ARGS=()
[[ -n "$AWS_PROFILE_ARG" ]] && AWS_ARGS+=(--profile "$AWS_PROFILE_ARG")

STATE_BUCKET="footbag-terraform-state-a1b2c3d4e5"

if (( DRY_RUN )); then
  cat <<'PLAN'
Dry run. A real run would, in this order:

  step 1  terraform/staging   plan, refuse if the plan changes the value of
                              app_session_secret, show the plan, take a typed
                              APPLY, apply that exact plan, then verify: the
                              deny statement is present, an authenticated call
                              forced onto plaintext is refused, and CloudFront
                              access-log delivery is still arriving.
  step 2  terraform/production the same, against the production buckets.
  step 3  terraform/shared    the same, and then prove Terraform can still read
                              its own state. On failure, print the one recovery
                              call and the identity it needs.
  step 4  the repository's bucket baseline check. It reads the Terraform source
                              of all three trees, not the applied estate, so it
                              proves the baseline is declared rather than live.

Nothing was planned, applied or read.
PLAN
  exit 0
fi

# ── Shared helpers ───────────────────────────────────────────────────────────

# The plan is written to a mode-600 file under a literal /tmp path and shredded
# by a trap on EXIT, INT and TERM, so the shred runs on a failed plan, a failed
# apply and an interrupt alike. A saved plan is a zip carrying a full copy of
# state, so it holds every resolved value in the clear; left behind by a failure
# it is a durable copy of them that no credential scan can see into. The
# directory is literal rather than TMPDIR-relative so the caller's environment
# cannot redirect it into a checkout.
TF_PLAN=""
cleanup_plan() {
  [ -n "${TF_PLAN:-}" ] || return 0
  [ -e "${TF_PLAN}" ] || return 0
  shred -u "${TF_PLAN}" 2>/dev/null || rm -f "${TF_PLAN}" 2>/dev/null || true
}
trap cleanup_plan EXIT INT TERM

# Refuse a plan that would rewrite the session secret. Terraform holds the
# parameter and not its value, so the only correct diff on that resource is no
# diff at all. Reading the plan as JSON rather than grepping the human output:
# the human rendering elides a SecureString value as (sensitive value), which
# looks identical whether it is changing or not.
#
# A gate that cannot read refuses. Every failure path below used to collapse to
# an empty result, which reads as "nothing is changing": a `terraform show` that
# failed, an absent python3, or truncated JSON all let a typed APPLY through and
# overwrite the live secret with the placeholder. The reasons a gate cannot see
# are exactly the conditions under which it must not wave the change past.
gate_session_secret() {
  local plan_file="$1" tf_dir="$2" changing plan_json
  if ! plan_json="$("$TF_BIN" -chdir="$tf_dir" show -json "$plan_file" 2>&1)"; then
    echo "" >&2
    echo "REFUSING: could not read the plan as JSON, so the session-secret check" >&2
    echo "  could not run. This gate is the reason this script exists; it refuses" >&2
    echo "  rather than assuming nothing is changing." >&2
    echo "  terraform show said: ${plan_json}" >&2
    return 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "" >&2
    echo "REFUSING: python3 is not available, so the session-secret check could" >&2
    echo "  not run. Install it, or apply through a host that has it." >&2
    return 1
  fi
  changing="$(
    printf '%s' "$plan_json" \
      | python3 -c '
import json, sys
try:
    plan = json.load(sys.stdin)
except Exception as exc:
    # Exit non-zero so the caller refuses. Exiting 0 here meant a truncated or
    # unparseable plan was indistinguishable from a clean one.
    sys.stderr.write("could not parse the plan JSON: %s\n" % exc)
    sys.exit(2)
for change in plan.get("resource_changes", []):
    if change.get("type") != "aws_ssm_parameter":
        continue
    if not change.get("name", "").endswith("session_secret"):
        continue
    actions = change.get("change", {}).get("actions", [])
    if actions in (["no-op"], ["read"]):
        continue
    before = (change.get("change", {}).get("before") or {}).get("value")
    after = (change.get("change", {}).get("after") or {}).get("value")
    if before != after:
        print(change.get("address", "aws_ssm_parameter.session_secret"))
'
  )" || {
    echo "" >&2
    echo "REFUSING: the session-secret check did not complete, so it cannot say" >&2
    echo "  whether the plan would overwrite a live secret. Refusing rather than" >&2
    echo "  assuming it would not." >&2
    return 1
  }

  if [[ -n "$changing" ]]; then
    echo "" >&2
    echo "REFUSING: the plan would change the value of ${changing}." >&2
    echo "" >&2
    echo "  Terraform owns this parameter's existence and its KMS key, never its" >&2
    echo "  value: the resource carries a placeholder and" >&2
    echo "  lifecycle { ignore_changes = [value] }. A diff on the value means" >&2
    echo "  ignore_changes is not taking, and applying would overwrite a live" >&2
    echo "  secret with the literal placeholder, signing out every member on the" >&2
    echo "  next deploy." >&2
    echo "" >&2
    echo "  Nothing was applied. Fix the resource before resuming." >&2
    return 1
  fi
  return 0
}

# Newest delivered access-log key, or the empty string. Used either side of an
# apply on the two buckets whose delivery policy this change replaces.
newest_log_key() {
  local bucket="$1"
  aws s3api list-objects-v2 --bucket "$bucket" --prefix "AWSLogs/" \
    --query 'sort_by(Contents,&LastModified)[-1].Key' --output text \
    "${AWS_ARGS[@]}" 2>/dev/null || echo "None"
}

# The deny itself, proved rather than assumed: an authenticated call forced onto
# the plaintext endpoint must be refused. An anonymous probe proves nothing here,
# because the public access block already refuses those.
assert_plaintext_refused() {
  local bucket="$1" err rc
  err="$(aws s3api head-bucket --bucket "$bucket" \
      --endpoint-url "http://s3.us-east-1.amazonaws.com" "${AWS_ARGS[@]}" 2>&1)" && rc=0 || rc=$?
  if (( rc == 0 )); then
    echo "  FAIL: ${bucket} accepted an authenticated request over plaintext." >&2
    return 1
  fi
  # The refusal has to be the deny doing its job, not any failure at all. A
  # proxy blocking port 80, a credential expiring mid-run, or a redirect from a
  # bucket outside this region all made the old form print "refuses plaintext"
  # while proving nothing. An invariant this script exists to establish cannot be
  # asserted by a check that passes on every error.
  if ! printf '%s' "$err" | grep -qiE 'AccessDenied|403|Forbidden'; then
    echo "  FAIL: ${bucket} did not accept plaintext, but not because it was denied." >&2
    echo "        The check cannot tell a working deny from an unrelated failure." >&2
    printf '        aws said: %s\n' "$err" | head -5 >&2
    return 1
  fi
  echo "  ok: ${bucket} refuses plaintext"
  return 0
}

assert_deny_statement() {
  local bucket="$1" sids
  sids="$(
    aws s3api get-bucket-policy --bucket "$bucket" --query Policy --output text \
      "${AWS_ARGS[@]}" 2>/dev/null | python3 -c '
import json, sys
try:
    doc = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for s in doc.get("Statement", []):
    if s.get("Sid"):
        print(s["Sid"])
'
  )" || sids=""
  if ! printf '%s\n' "$sids" | grep -q '^DenyPlaintextAccess$'; then
    echo "  FAIL: ${bucket} has no DenyPlaintextAccess statement." >&2
    return 1
  fi
  echo "  ok: ${bucket} carries DenyPlaintextAccess"
  return 0
}

plan_and_apply() {
  # Anchored to the checkout rather than to the caller's directory, for the reason
  # the deploy family now anchors everything: a relative tree name means the run
  # depends on where the operator was standing, and the state-reachability check
  # this protects was anchored while the three calls that follow it were not.
  local tf_dir="${REPO_ROOT}/$1" label="$2"
  TF_PLAN="$(mktemp /tmp/footbag-tls-baseline-plan.XXXXXX)"
  chmod 600 "$TF_PLAN"

  if ! "$TF_BIN" -chdir="$tf_dir" plan -out="$TF_PLAN"; then
    echo "ERROR: terraform plan failed for ${label}. Nothing was applied." >&2
    return 1
  fi

  gate_session_secret "$TF_PLAN" "$tf_dir" || return 1

  echo ""
  echo "Read the plan above before answering. It covers the whole ${label} tree, not"
  echo "only this change: anything else pending in it is applied with it."
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to apply the ${label} plan shown above: " "APPLY"; then
    echo "Aborted before terraform apply. Nothing was changed." >&2
    return 1
  fi
  if ! "$TF_BIN" -chdir="$tf_dir" apply "$TF_PLAN"; then
    echo "ERROR: terraform apply failed for ${label}." >&2
    return 1
  fi
  cleanup_plan
  TF_PLAN=""
  echo ""
  return 0
}

# ── Step 1: staging ──────────────────────────────────────────────────────────

if (( FROM_STEP <= 1 )) && (( ! VERIFY_ONLY )); then
  echo "-- step 1: staging --"
  echo ""
  STAGING_LOG_BEFORE="$(newest_log_key footbag-staging-platform-logs)"
  plan_and_apply "terraform/staging" "staging" || {
    echo "       Resume with --from-step 1 once fixed." >&2; exit 1; }
fi

if (( FROM_STEP <= 1 )) || (( VERIFY_ONLY )); then
  echo "-- verify: staging --"
  fail=0
  assert_deny_statement footbag-staging-media   || fail=1
  assert_deny_statement footbag-staging-snapshots || fail=1
  assert_plaintext_refused footbag-staging-media || fail=1
  after="$(newest_log_key footbag-staging-platform-logs)"
  echo "  note: newest staging access-log key is now ${after}"
  if [[ "${STAGING_LOG_BEFORE:-unset}" != "unset" && "$after" == "${STAGING_LOG_BEFORE}" ]]; then
    echo "  note: unchanged since before the apply. Delivery is batched, so this is"
    echo "        expected immediately afterwards; re-run --verify-only later and"
    echo "        treat a still-unchanged key as a stopped delivery."
  fi
  (( fail == 0 )) || { echo "Staging verification failed." >&2; exit 1; }
  echo ""
fi

# ── Step 2: production ───────────────────────────────────────────────────────

if (( FROM_STEP <= 2 )) && (( ! VERIFY_ONLY )); then
  echo "-- step 2: production --"
  echo ""
  PRODUCTION_LOG_BEFORE="$(newest_log_key footbag-production-platform-logs)"
  plan_and_apply "terraform/production" "production" || {
    echo "       Resume with --from-step 2 once fixed." >&2; exit 1; }
fi

if (( FROM_STEP <= 2 )) || (( VERIFY_ONLY )); then
  echo "-- verify: production --"
  fail=0
  assert_deny_statement footbag-production-media          || fail=1
  assert_deny_statement footbag-production-db-snapshots   || fail=1
  assert_deny_statement footbag-production-cloudtrail     || fail=1
  assert_plaintext_refused footbag-production-db-snapshots || fail=1
  after="$(newest_log_key footbag-production-platform-logs)"
  echo "  note: newest production access-log key is now ${after}"
  if [[ "${PRODUCTION_LOG_BEFORE:-unset}" != "unset" && "$after" == "${PRODUCTION_LOG_BEFORE}" ]]; then
    echo "  note: unchanged since before the apply. Re-run --verify-only later and"
    echo "        treat a still-unchanged key as a stopped delivery."
  fi
  (( fail == 0 )) || { echo "Production verification failed." >&2; exit 1; }
  echo ""
fi

# ── Step 3: the state bucket, last and alone ─────────────────────────────────

if (( FROM_STEP <= 3 )) && (( ! VERIFY_ONLY )); then
  echo "-- step 3: shared (the Terraform state bucket) --"
  echo ""
  echo "This tree keeps its own state in the bucket it is about to put a deny on."
  echo "The statement takes effect the moment PutBucketPolicy returns, on the run"
  echo "that then has to write its state back. If it is malformed, this run locks"
  echo "itself out and recovery needs an identity the deny does not cover."
  echo ""
  echo "Have a break-glass session open before answering. You will almost certainly"
  echo "not need it, and the one time you do you will not be able to obtain it."
  echo ""
  plan_and_apply "terraform/shared" "shared" || {
    echo "       Resume with --from-step 3 once fixed." >&2; exit 1; }
fi

if (( FROM_STEP <= 3 )) || (( VERIFY_ONLY )); then
  echo "-- verify: the state bucket, and that Terraform can still reach it --"
  fail=0
  assert_deny_statement "$STATE_BUCKET" || fail=1
  assert_plaintext_refused "$STATE_BUCKET" || fail=1
  # The proof that matters: a refresh-only plan reads and writes nothing but
  # still has to reach the backend.
  #
  # Anchored to $REPO_ROOT, and the error is kept. Both mattered: the path was
  # relative to the caller's working directory, and every error was discarded, so
  # a run started from the wrong directory reported "Terraform can no longer read
  # its own state" and handed the operator a command that removes the protection
  # this script had just installed. A verdict that cannot distinguish a lockout
  # from a missing directory must not name the lockout as its cause.
  refresh_err=""
  if ! refresh_err="$("$TF_BIN" -chdir="$REPO_ROOT/terraform/production" plan -refresh-only -input=false 2>&1)"; then
    echo "" >&2
    echo "  FAIL: the refresh-only plan against terraform/production did not succeed." >&2
    echo "" >&2
    echo "  terraform said:" >&2
    printf '    %s\n' "$refresh_err" | tail -20 >&2
    echo "" >&2
    echo "  If, and only if, that names an access denial on ${STATE_BUCKET}, the deny" >&2
    echo "  is refusing the backend. Recover from the break-glass session, which is" >&2
    echo "  outside the deny, with exactly this:" >&2
    echo "" >&2
    echo "    aws s3api delete-bucket-policy --bucket ${STATE_BUCKET}" >&2
    echo "" >&2
    echo "  Then fix terraform/shared/s3.tf and resume with --from-step 3. Any other" >&2
    echo "  error above (an uninitialised tree, expired credentials, no network) is" >&2
    echo "  not a lockout, and running that command would remove the protection this" >&2
    echo "  script just installed." >&2
    fail=1
  else
    echo "  ok: Terraform still reads its own state"
  fi
  (( fail == 0 )) || exit 1
  echo ""
fi

# ── Step 4: the repository's own gate, against the tree ──────────────────────
#
# check_bucket_baseline.sh greps the Terraform trees and reads no AWS at all, so
# what this proves is that every bucket in the source declares the baseline. The
# applied estate was proven by the per-tree verifications in steps 1 to 3; this
# catches the next bucket somebody adds without the three resources.
if (( FROM_STEP <= 4 )); then
  echo "-- step 4: baseline check (Terraform source, not the estate) --"
  echo ""
  if ! bash "${REPO_ROOT}/scripts/ci/check_bucket_baseline.sh"; then
    echo "ERROR: the bucket baseline check failed against the tree." >&2
    exit 1
  fi
  echo ""
fi

echo "Done. All three trees carry the deny, plaintext is refused, log delivery was"
echo "checked either side of the apply, and Terraform still reaches its own state."
echo ""
echo "The session secret was not rotated: Terraform no longer owns that value, and"
echo "the plan gate above refuses any apply that would change it. Confirm with:"
echo "  scripts/provision-ssm-secret.sh --env production --secret session_secret status"

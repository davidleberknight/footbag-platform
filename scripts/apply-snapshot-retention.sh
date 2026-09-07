#!/usr/bin/env bash
# apply-snapshot-retention.sh
#
# Applies the snapshot retention tiers, and on production the tier-scoped
# cross-region replication, to one environment.
#
# WHAT THE CHANGE IS.
#
# The backup producer writes a snapshot every five minutes under routine/, and
# promotes the first run of each hour to hourly/ and the first of each day to
# daily/. The tiers exist so the history thins with age instead of keeping every
# six-minute point for a month: fine grain for two days, hourly for weeks, daily
# for far longer. On production the promoted tiers are also what crosses the
# wire to the disaster-recovery bucket, so the same change narrows replication
# from every object to the two tiers.
#
# WHY THE GATE IN STEP 1 IS THE WHOLE POINT.
#
# The routine/ rule expires at two days. Applied before hourly/ and daily/ hold
# more than one point each, that rule starts deleting the fine-grained stream
# while nothing yet writes what replaces it, and the recovery window collapses
# from a month to two days without anything reporting a failure. It is the one
# irreversible mistake available in this change, it is invisible while it
# happens, and it is the reason this is a script rather than a plan and an apply
# the operator is trusted to sequence. Step 1 refuses to continue until both
# tiers hold history. There is no flag to skip it.
#
# The bucket that gate reads is not named alike in the two environments:
# staging is footbag-staging-snapshots and production is
# footbag-production-db-snapshots, because the staging tree builds the name from
# its prefix while production inserts db-. Reaching for the symmetric name
# returns NoSuchBucket, which reads like a missing bucket rather than a typo, so
# the name is read from the tree's own snapshots_bucket_name output instead of
# being spelled here.
#
# WHAT STEP 3 CAN AND CANNOT PROVE.
#
# Replication alarms read S3 replication metrics, and those metrics only exist
# once the rule has published some. Straight after the apply the alarms sit in
# INSUFFICIENT_DATA legitimately, so step 3 reports their state rather than
# asserting one, and says to re-run --verify later. An alarm still in
# INSUFFICIENT_DATA once traffic has flowed is the failure this is watching for:
# it means the metric dimensions never matched, which is exactly the mistake of
# arming an alarm and assuming it works.
#
# REVERSING IT.
#
# Nothing here deletes an object directly; the lifecycle rules do that on their
# own schedule. Reverting the tree and re-applying restores the previous rules,
# but objects the two-day rule has already expired are gone from the primary
# bucket. On production those same objects are still in the disaster-recovery
# bucket under Object Lock, which is where a mistaken early apply would be
# recovered from.
#
# Steps (referenced by --from-step, so a failure part-way is resumable):
#   1  the tier-history gate: refuse unless hourly/ and daily/ both hold history
#   2  terraform plan to a shredded file, confirm, apply that exact plan
#   3  verify the lifecycle rules, the replication scope, and the alarm states
#
# Usage:
#   scripts/apply-snapshot-retention.sh --target staging --dry-run
#   scripts/apply-snapshot-retention.sh --target staging
#   scripts/apply-snapshot-retention.sh --target production
#   scripts/apply-snapshot-retention.sh --target production --verify
#   scripts/apply-snapshot-retention.sh --target production --from-step 3
#   ... --yes   accept every confirmation, where no terminal is attached
#   ... --profile <name>   AWS profile for the read-only checks
#
# --dry-run and --verify apply nothing. --dry-run reads no AWS at all.
#
# Test seams (CI only; operators never set these): RETENTION_AWS_BIN and
# RETENTION_TERRAFORM_BIN point the two external commands at stubs, so the gate
# and the step sequencing can be exercised without an account. Both are
# announced loudly when set, because a run that silently used a stub would prove
# nothing about the estate.
set -euo pipefail

TARGET=""
DRY_RUN=0
VERIFY_ONLY=0
FROM_STEP=1
AWS_PROFILE_ARG="footbag-operator"
AWS_REGION_ARG="${AWS_REGION:-us-east-1}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# confirm_from_tty is the shared confirmation helper: it reads the answer from
# /dev/tty rather than stdin, refuses when no terminal exists and --yes was not
# given, and honours --yes. Reused rather than re-implemented so every operator
# script prompts the same way.
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

AWS_BIN="${RETENTION_AWS_BIN:-aws}"
TF_BIN="${RETENTION_TERRAFORM_BIN:-terraform}"

# The three tier rules this change is about. Their retention windows differ
# between the environments by design and are read from the bucket rather than
# asserted here, because restating a Terraform value in a shell script is how
# the two drift apart. Their ids do not differ, so presence is checkable.
TIER_RULE_IDS=("expire-routine-stream" "expire-hourly-tier" "expire-daily-tier")

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --from-step)
      FROM_STEP="${2:-}"
      shift 2 || { echo "ERROR: --from-step requires a step number" >&2; exit 2; }
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --verify)
      VERIFY_ONLY=1
      shift
      ;;
    --yes)
      ASSUME_YES="yes"
      shift
      ;;
    --help|-h) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

# No default target. Which environment a retention change lands on is exactly
# the decision this script must not make for the operator.
case "$TARGET" in
  staging|production) ;;
  '') echo "ERROR: --target is required ('staging' or 'production')" >&2; exit 2 ;;
  *) echo "ERROR: --target must be 'staging' or 'production' (got '$TARGET')" >&2; exit 2 ;;
esac

if [[ ! "$FROM_STEP" =~ ^[1-3]$ ]]; then
  echo "ERROR: --from-step takes a step number from 1 to 3 (got '$FROM_STEP')." >&2
  exit 2
fi

if (( DRY_RUN && VERIFY_ONLY )); then
  echo "ERROR: --dry-run and --verify do different things; pass one or the other." >&2
  echo "       --dry-run states what a run would do and reads nothing." >&2
  echo "       --verify reads the deployed state and applies nothing." >&2
  exit 2
fi

TF_DIR="$REPO_ROOT/terraform/$TARGET"

# Snapshot cross-region replication exists on production only. Staging has no
# snapshot disaster-recovery bucket, so its half of this change is the lifecycle
# tiers alone, and step 3 must not report a missing replication rule there as a
# fault.
SNAPSHOT_REPLICATION=0
[[ "$TARGET" == "production" ]] && SNAPSHOT_REPLICATION=1

if [[ -n "${RETENTION_AWS_BIN:-}${RETENTION_TERRAFORM_BIN:-}" ]]; then
  echo "SYNTHETIC: aws='$AWS_BIN' terraform='$TF_BIN' -- this run proves nothing about the estate." >&2
fi

aws_read() {
  "$AWS_BIN" "$@" --profile "$AWS_PROFILE_ARG" --region "$AWS_REGION_ARG"
}

# The bucket name comes from the tree that owns it, never from a literal here.
resolve_snapshots_bucket() {
  local name
  if ! name="$("$TF_BIN" -chdir="$TF_DIR" output -raw snapshots_bucket_name 2>/dev/null)"; then
    echo "ERROR: could not read snapshots_bucket_name from terraform/$TARGET." >&2
    echo "       Run 'terraform -chdir=terraform/$TARGET init' first, and check the" >&2
    echo "       private operations checkout is present so the values symlink resolves." >&2
    return 1
  fi
  if [[ -z "$name" ]]; then
    echo "ERROR: terraform/$TARGET reports an empty snapshots bucket name." >&2
    return 1
  fi
  printf '%s' "$name"
}

# Two keys is all the gate needs: the question is whether the tier holds more
# than one point, not how many. --max-keys keeps it one cheap call per prefix.
count_tier_objects() {
  local bucket="$1" prefix="$2" out=""
  out="$(aws_read s3api list-objects-v2 \
    --bucket "$bucket" --prefix "$prefix" --max-keys 2 \
    --query 'length(Contents)' --output text 2>/dev/null)" || out=""
  [[ -z "$out" || "$out" == "None" ]] && out=0
  printf '%s' "$out"
}

echo "== snapshot retention: $TARGET =="
echo ""

if (( DRY_RUN )); then
  echo "Would run, in order:"
  echo "  1. Read the snapshots bucket from terraform/$TARGET, then refuse to go on"
  echo "     unless hourly/ and daily/ each hold more than one object. Applied before"
  echo "     the tiers hold history, the two-day routine/ rule deletes the fine-grained"
  echo "     stream while nothing yet writes what replaces it."
  echo "  2. terraform -chdir=terraform/$TARGET plan into a mode-600 file shredded on every"
  echo "     exit path, show it, take a typed APPLY, then apply that exact plan."
  if (( SNAPSHOT_REPLICATION )); then
    echo "     Expect three tier rules on the snapshots bucket, the unfiltered snapshot"
    echo "     replication rule replaced by two scoped to hourly/ and daily/, and the"
    echo "     replication alarms with their queue and notifications where the flag is on."
  else
    echo "     Expect three tier rules on the snapshots bucket. Staging has no snapshot"
    echo "     disaster-recovery bucket, so no snapshot replication changes here."
  fi
  echo "  3. Read back the lifecycle rules, the replication scope and the alarm states."
  echo ""
  echo "Straight after an apply the replication alarms sit in INSUFFICIENT_DATA"
  echo "legitimately, because the metrics they read do not exist until the rule has"
  echo "published some. Re-run with --verify once traffic has flowed; an alarm still"
  echo "in INSUFFICIENT_DATA then has dimensions that never matched."
  exit 0
fi

# ── Step 1: the tier-history gate ────────────────────────────────────────────
BUCKET=""
if (( FROM_STEP <= 1 )) && (( ! VERIFY_ONLY )); then
  echo "-- step 1: tier history --"
  echo ""
  BUCKET="$(resolve_snapshots_bucket)" || exit 1
  echo "  snapshots bucket: $BUCKET"

  HOURLY="$(count_tier_objects "$BUCKET" "hourly/")"
  DAILY="$(count_tier_objects "$BUCKET" "daily/")"
  echo "  hourly/ holds: $HOURLY (of the first 2 listed)"
  echo "  daily/  holds: $DAILY (of the first 2 listed)"
  echo ""

  if (( HOURLY < 2 || DAILY < 2 )); then
    echo "REFUSING: the promoted tiers do not hold history yet." >&2
    echo "" >&2
    echo "  The routine/ rule in this change expires at two days. Applied now, it would" >&2
    echo "  delete the fine-grained stream while hourly/ and daily/ are still filling," >&2
    echo "  and the recovery window would collapse from a month to two days with nothing" >&2
    echo "  reporting a failure." >&2
    echo "" >&2
    echo "  The producer promotes the first run of each hour and each day, so this clears" >&2
    echo "  on its own after a full day of backups. Confirm the timer is running on the" >&2
    echo "  host before waiting on it: a stalled producer looks exactly like this." >&2
    exit 1
  fi
  echo "  Both tiers hold history. The two-day rule has something to fall back to."
  echo ""
fi

# ── Step 2: plan, confirm, apply that plan ───────────────────────────────────
if (( FROM_STEP <= 2 )) && (( ! VERIFY_ONLY )); then
  echo "-- step 2: terraform apply --"
  echo ""
  # The plan is written to a mode-600 file under a literal /tmp path and shredded
  # by a trap on EXIT, INT and TERM, so the shred runs on a failed plan, a failed
  # apply and an interrupt alike. A saved plan is a zip carrying a full copy of
  # state, so it holds every resolved value in the clear including the
  # vault-governed ones; left behind by a failure it is a durable copy of them
  # that no credential scan can see into. The directory is literal rather than
  # TMPDIR-relative so the caller's environment cannot redirect it into a
  # checkout.
  #
  # Applying the saved plan rather than replanning at apply time is what makes
  # the reviewed diff the applied diff, and it removes the window between
  # deciding and acting.
  TF_PLAN="$(mktemp /tmp/footbag-retention-plan.XXXXXX)"
  chmod 600 "$TF_PLAN"
  trap 'if [ -n "${TF_PLAN:-}" ] && [ -e "${TF_PLAN}" ]; then shred -u "${TF_PLAN}"; fi; rm -f "${TF_PLAN:-}"' EXIT INT TERM

  if ! "$TF_BIN" -chdir="$TF_DIR" plan -out="$TF_PLAN"; then
    echo "ERROR: terraform plan failed. Nothing was applied." >&2
    echo "       Resume with --from-step 2 once fixed." >&2
    exit 1
  fi
  echo ""
  echo "Read the plan above before answering. It covers this whole environment, not"
  echo "only the retention rules: anything else pending in the tree is applied with them."
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to apply the plan shown above: " "APPLY"; then
    echo "Aborted before terraform apply. Nothing was changed; resume with --from-step 2." >&2
    exit 1
  fi
  if ! "$TF_BIN" -chdir="$TF_DIR" apply "$TF_PLAN"; then
    echo "ERROR: terraform apply failed. Resume with --from-step 2 once fixed." >&2
    exit 1
  fi
  echo ""
fi

# ── Step 3: prove it ─────────────────────────────────────────────────────────
echo "-- step 3: verify --"
echo ""
if [[ -z "$BUCKET" ]]; then
  BUCKET="$(resolve_snapshots_bucket)" || exit 1
fi

echo "Lifecycle rules on $BUCKET:"
LIFECYCLE="$(aws_read s3api get-bucket-lifecycle-configuration --bucket "$BUCKET" \
  --query 'Rules[].[ID,Status,Filter.Prefix,Expiration.Days]' --output text 2>/dev/null)" || LIFECYCLE=""
if [[ -z "$LIFECYCLE" ]]; then
  echo "  <unreadable>"
else
  printf '%s\n' "$LIFECYCLE" | sed 's/^/  /'
fi
echo ""

MISSING=""
for rule_id in "${TIER_RULE_IDS[@]}"; do
  printf '%s' "$LIFECYCLE" | grep -q "^${rule_id}\b" || MISSING="${MISSING} ${rule_id}"
done
if [[ -n "$MISSING" ]]; then
  echo "  MISSING tier rules:${MISSING}"
  echo "  The apply did not land, or landed against a different bucket."
else
  echo "  All three tier rules are present. Their windows differ by environment by"
  echo "  design; read the days above against the tree rather than against staging."
fi
echo ""

if (( SNAPSHOT_REPLICATION )); then
  # The disaster-recovery bucket, read directly rather than inferred from the
  # primary. Its windows are the ones that have to match its Object Lock, and a
  # verification that reads only the primary cannot see the rule that matters:
  # a daily tier kept longer than the lock leaves a copy protected by access
  # control alone for the difference, in the account whose credentials the lock
  # exists to defend against. That is exactly the drift this step missed once.
  DR_BUCKET="$("$TF_BIN" -chdir="$TF_DIR" output -raw dr_bucket_name 2>/dev/null)" || DR_BUCKET=""
  if [[ -n "$DR_BUCKET" ]]; then
    echo "Lifecycle rules on $DR_BUCKET (us-west-2), which must match its Object Lock:"
    DR_LIFECYCLE="$("$AWS_BIN" s3api get-bucket-lifecycle-configuration --bucket "$DR_BUCKET" \
      --profile "$AWS_PROFILE_ARG" --region us-west-2 \
      --query 'Rules[].[ID,Status,Filter.Prefix,Expiration.Days]' --output text 2>/dev/null)" || DR_LIFECYCLE=""
    if [[ -z "$DR_LIFECYCLE" ]]; then
      echo "  <unreadable>"
    else
      printf '%s\n' "$DR_LIFECYCLE" | sed 's/^/  /'
      echo ""
      echo "  Every expiring rule here should read the same window as the lock. A longer"
      echo "  one is a copy the lock stops protecting before the lifecycle removes it."
    fi
    echo ""
  fi

  echo "Snapshot replication scope on $BUCKET:"
  REPL="$(aws_read s3api get-bucket-replication --bucket "$BUCKET" \
    --query 'ReplicationConfiguration.Rules[].[ID,Status,Filter.Prefix]' --output text 2>/dev/null)" || REPL=""
  if [[ -z "$REPL" ]]; then
    echo "  <none read>"
  else
    printf '%s\n' "$REPL" | sed 's/^/  /'
    echo ""
    echo "  Expect two rules scoped to hourly/ and daily/. A rule with an empty prefix"
    echo "  means the unfiltered rule is still in place and the change did not land."
  fi
  echo ""
fi

echo "Replication alarm states:"
ALARMS="$(aws_read cloudwatch describe-alarms --alarm-name-prefix "footbag-${TARGET}-" \
  --query "MetricAlarms[?contains(AlarmName, 'replication')].[AlarmName,StateValue]" \
  --output text 2>/dev/null)" || ALARMS=""
if [[ -z "$ALARMS" ]]; then
  echo "  <none found>"
  echo ""
  echo "  No replication alarm exists on this environment. If the replication alarm"
  echo "  flag is on in the values file, the apply did not land."
else
  printf '%s\n' "$ALARMS" | sed 's/^/  /'
  echo ""
  echo "  Straight after an apply, INSUFFICIENT_DATA is correct: the metrics these read are"
  echo "  published by the replication rules and do not exist until those rules have moved"
  echo "  something. Re-run --verify once traffic has flowed, and read the two kinds apart."
  echo ""
  echo "  A backlog alarm reads a pending-operations metric that publishes whenever"
  echo "  replication is active, so one still in INSUFFICIENT_DATA after a promotion has"
  echo "  replicated has dimensions that never matched, which is the failure arming an"
  echo "  alarm without proving it produces. A failed alarm reads a metric published only"
  echo "  when a replication actually fails, so it can sit in INSUFFICIENT_DATA forever"
  echo "  while everything works; that is why it treats missing data as not breaching, and"
  echo "  its state proves nothing either way. The daily tier promotes once a day, so its"
  echo "  pair needs a day before either reading means anything."
fi

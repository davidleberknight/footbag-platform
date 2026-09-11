#!/usr/bin/env bash
# apply-snapshot-retention.sh
#
# Applies the snapshot retention generations, and on production the generation-scoped
# cross-region replication, to one environment.
#
# WHAT THE CHANGE IS.
#
# The backup producer writes a snapshot every five minutes under routine/, and
# promotes the first run of each hour to hourly/ and the first of each day to
# daily/. The generations exist so the history thins with age instead of keeping every
# six-minute point for a month: fine grain for two days, hourly for weeks, daily
# for far longer. On production the promoted generations are also what crosses the
# wire to the disaster-recovery bucket, so the same change narrows replication
# from every object to the two promoted generations.
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
# generations hold history AND are still being added to. There is no flag to skip
# it.
#
# Counting alone is not the gate. Two objects promoted by a producer that stopped
# months ago satisfy a count and describe a host where applying this change does
# the same irreversible damage, so the gate reads the newest object's age in each
# generation and refuses when it is older than the producer's own cadence allows.
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
#   1  the generation-history gate: refuse unless hourly/ and daily/ both hold
#      history and are both still being added to
#   2  terraform plan to a shredded file, confirm, apply that exact plan
#   3  verify the lifecycle rules and the replication scope, and read out the alarms
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

# The three generation rules this change is about. The rule ids below still spell
# the older word "tier"; renaming them is a Terraform change and an apply, so the
# ids stay as they are until one is wanted for its own sake and the alarm
# dimensions move with them. Their retention windows differ
# between the environments by design and are read from the bucket rather than
# asserted here, because restating a Terraform value in a shell script is how
# the two drift apart. Their ids do not differ, so presence is checkable.
TIER_RULE_IDS=("expire-routine-stream" "expire-hourly-tier" "expire-daily-tier")

# How old the newest object in a generation may be before the producer counts as
# stalled rather than merely late. backup-db.sh promotes the first run of each
# hour into hourly/ and the first of each day into daily/, so on a healthy host
# the newest hourly/ object is under an hour old and the newest daily/ object
# under a day. Each threshold below allows exactly one missed promotion; two in a
# row is a stall. These are the gate's own tolerances and are not read from the
# tree, because the cadence they encode is the producer's, not Terraform's.
HOURLY_MAX_AGE_HOURS=3
DAILY_MAX_AGE_HOURS=48

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
# generations alone, and step 3 must not report a missing replication rule there as a
# fault.
SNAPSHOT_REPLICATION=0
[[ "$TARGET" == "production" ]] && SNAPSHOT_REPLICATION=1

if [[ -n "${RETENTION_AWS_BIN:-}${RETENTION_TERRAFORM_BIN:-}" ]]; then
  echo "SYNTHETIC: aws='$AWS_BIN' terraform='$TF_BIN' -- this run proves nothing about the estate." >&2
fi

aws_read() {
  "$AWS_BIN" "$@" --profile "$AWS_PROFILE_ARG" --region "$AWS_REGION_ARG"
}

# Whether this tree declares the replication alarms, read from the tree's own
# values file rather than assumed. No Terraform output exposes the flag, and
# without it the script cannot tell "no alarm because the flag is off", which is
# correct, from "no alarm because the apply did not land", which is a failure. An
# unreadable answer is neither, and leaves that section an explicit read-out.
replication_alarm_declared() {
  local tfvars="$TF_DIR/terraform.tfvars" value=""
  [[ -r "$tfvars" ]] || { printf 'unknown'; return 0; }
  value="$(grep -E '^[[:space:]]*enable_replication_alarm[[:space:]]*=' "$tfvars" \
    | tail -1 | cut -d'=' -f2 | tr -d '[:space:]')" || value=""
  case "$value" in
    true)  printf 'yes' ;;
    false) printf 'no' ;;
    *)     printf 'unknown' ;;
  esac
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

# Two keys is all the gate needs: the question is whether the generation holds
# more than one point, not how many. --max-keys keeps it one cheap call per prefix.
count_generation_objects() {
  local bucket="$1" prefix="$2" out=""
  out="$(aws_read s3api list-objects-v2 \
    --bucket "$bucket" --prefix "$prefix" --max-keys 2 \
    --query 'length(Contents)' --output text 2>/dev/null)" || out=""
  [[ -z "$out" || "$out" == "None" ]] && out=0
  printf '%s' "$out"
}

# The age of the newest object in a generation, in whole hours, or the literal
# "unknown" when it cannot be established.
#
# The count above cannot answer this and the two reads cannot be merged: its
# --max-keys 2 caps the listing at the lexicographically FIRST two keys, so the
# newest element of that listing is not the newest object in the prefix. This one
# lists the prefix in full and picks by timestamp with sort_by rather than by
# position, so the answer does not depend on the producer's key naming happening
# to sort chronologically.
newest_generation_age_hours() {
  local bucket="$1" prefix="$2" stamp="" then_epoch=""
  stamp="$(aws_read s3api list-objects-v2 \
    --bucket "$bucket" --prefix "$prefix" \
    --query 'sort_by(Contents, &LastModified)[-1].LastModified' --output text 2>/dev/null)" || stamp=""
  if [[ -z "$stamp" || "$stamp" == "None" ]]; then
    printf 'unknown'
    return 0
  fi
  then_epoch="$(date -u -d "$stamp" +%s 2>/dev/null)" || then_epoch=""
  if [[ -z "$then_epoch" ]]; then
    printf 'unknown'
    return 0
  fi
  printf '%s' "$(( ( $(date -u +%s) - then_epoch ) / 3600 ))"
}

echo "== snapshot retention: $TARGET =="
echo ""

if (( DRY_RUN )); then
  echo "Would run, in order:"
  echo "  1. Read the snapshots bucket from terraform/$TARGET, then refuse to go on"
  echo "     unless hourly/ and daily/ each hold more than one object AND the newest"
  echo "     object in each is recent enough that the producer is still running"
  echo "     (hourly/ within ${HOURLY_MAX_AGE_HOURS}h, daily/ within ${DAILY_MAX_AGE_HOURS}h). Applied too early, or onto a"
  echo "     stalled producer, the two-day routine/ rule deletes the fine-grained stream"
  echo "     while nothing yet writes what replaces it."
  echo "  2. terraform -chdir=terraform/$TARGET plan into a mode-600 file shredded on every"
  echo "     exit path, show it, take a typed APPLY, then apply that exact plan."
  if (( SNAPSHOT_REPLICATION )); then
    echo "     Expect three generation rules on the snapshots bucket, the unfiltered snapshot"
    echo "     replication rule replaced by two scoped to hourly/ and daily/, and the"
    echo "     replication alarms with their queue and notifications where the flag is on."
  else
    echo "     Expect three generation rules on the snapshots bucket. Staging has no snapshot"
    echo "     disaster-recovery bucket, so no snapshot replication changes here."
  fi
  echo "  3. Read back the lifecycle rules and the replication scope and ASSERT them,"
  echo "     exiting non-zero when a generation rule is missing or an unfiltered"
  echo "     replication rule is still in place. The alarm states are read out rather"
  echo "     than asserted, because INSUFFICIENT_DATA straight after an apply is correct."
  echo ""
  echo "Straight after an apply the replication alarms sit in INSUFFICIENT_DATA"
  echo "legitimately, because the metrics they read do not exist until the rule has"
  echo "published some. Re-run with --verify once traffic has flowed; an alarm still"
  echo "in INSUFFICIENT_DATA then has dimensions that never matched."
  exit 0
fi

# ── Step 1: the generation-history gate ──────────────────────────────────────
BUCKET=""
# Deliberately NOT conditioned on --from-step. The header says there is no flag
# to skip this gate, and while it was guarded by `FROM_STEP <= 1` there was one:
# `--from-step 2` is a value the argument validator accepts and the resume hint
# after a failed plan actively recommends, and it went straight to the apply with
# the gate never consulted. That is the irreversible collapse this script exists
# to prevent. The check is two list calls and is idempotent, so running it again
# on a resume costs nothing worth saving.
if (( ! VERIFY_ONLY )); then
  echo "-- step 1: generation history --"
  echo ""
  BUCKET="$(resolve_snapshots_bucket)" || exit 1
  echo "  snapshots bucket: $BUCKET"

  HOURLY="$(count_generation_objects "$BUCKET" "hourly/")"
  DAILY="$(count_generation_objects "$BUCKET" "daily/")"
  HOURLY_AGE="$(newest_generation_age_hours "$BUCKET" "hourly/")"
  DAILY_AGE="$(newest_generation_age_hours "$BUCKET" "daily/")"
  echo "  hourly/ holds: $HOURLY (of the first 2 listed), newest ${HOURLY_AGE}h old"
  echo "  daily/  holds: $DAILY (of the first 2 listed), newest ${DAILY_AGE}h old"
  echo ""

  if (( HOURLY < 2 || DAILY < 2 )); then
    echo "REFUSING: the promoted generations do not hold history yet." >&2
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

  # Counting is not enough on its own. Two objects promoted by a producer that
  # stopped months ago satisfy the check above, and applying the two-day routine/
  # rule on that host deletes the fine-grained stream with nothing replacing it --
  # the same irreversible collapse, reached through a bucket that looks populated.
  if [[ "$HOURLY_AGE" == "unknown" || "$DAILY_AGE" == "unknown" ]]; then
    echo "REFUSING: could not establish how old the newest promoted snapshots are." >&2
    echo "" >&2
    echo "  The counts came back but the timestamps did not, so this run cannot tell a" >&2
    echo "  live producer from one that stopped. Both readings are needed before the" >&2
    echo "  two-day routine/ rule can be applied safely." >&2
    echo "" >&2
    echo "  Check that the credential has s3:ListBucket on $BUCKET and re-run." >&2
    exit 1
  fi

  if (( HOURLY_AGE > HOURLY_MAX_AGE_HOURS || DAILY_AGE > DAILY_MAX_AGE_HOURS )); then
    echo "REFUSING: both generations hold history, but it has stopped being added to." >&2
    echo "" >&2
    echo "  newest hourly/ object: ${HOURLY_AGE}h old (allowed: ${HOURLY_MAX_AGE_HOURS}h)" >&2
    echo "  newest daily/  object: ${DAILY_AGE}h old (allowed: ${DAILY_MAX_AGE_HOURS}h)" >&2
    echo "" >&2
    echo "  The producer promotes the first run of each hour and each day, so a newest" >&2
    echo "  object older than that means it has stalled. Applying now would expire the" >&2
    echo "  fine-grained stream at two days while nothing writes what replaces it, which" >&2
    echo "  is the same collapse the count above exists to prevent." >&2
    echo "" >&2
    echo "  Check the backup timer on the host first:" >&2
    echo "    scripts/bringup-status.sh --target $TARGET" >&2
    exit 1
  fi

  echo "  Both generations hold history and are still being added to. The two-day rule"
  echo "  has something to fall back to."
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
#
# Everything this step can decide, it decides, and the run's exit status carries
# the verdict. It used to print "the change did not land" and exit 0, which is the
# worst of both: an operator told to go looking for a problem by a run that
# reports success, and a wrapper or a CI job that sees a pass. What genuinely
# cannot be decided here is the alarm STATE, because INSUFFICIENT_DATA
# immediately after an apply is correct; that part stays an explicit read-out and
# says so.
echo "-- step 3: verify --"
echo ""
VERIFY_FAIL=0
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

# Present is not the same as in effect. The listing carries the Status column, so
# a rule that exists and is Disabled expires nothing while reading as landed: the
# id check alone called that a success and exited 0.
MISSING=""
DISABLED=""
for rule_id in "${TIER_RULE_IDS[@]}"; do
  if ! printf '%s' "$LIFECYCLE" | grep -q "^${rule_id}\b"; then
    MISSING="${MISSING} ${rule_id}"
  elif ! printf '%s\n' "$LIFECYCLE" | grep -qE "^${rule_id}[[:space:]]+Enabled([[:space:]]|$)"; then
    DISABLED="${DISABLED} ${rule_id}"
  fi
done
if [[ -n "$MISSING" ]]; then
  echo "  MISSING generation rules:${MISSING}"
  echo "  The apply did not land, or landed against a different bucket."
  VERIFY_FAIL=1
fi
if [[ -n "$DISABLED" ]]; then
  echo "  NOT ENABLED generation rules:${DISABLED}"
  echo "  A Disabled rule expires nothing, so the retention change is not in effect"
  echo "  even though the rule is present."
  VERIFY_FAIL=1
fi
if [[ -z "$MISSING" && -z "$DISABLED" ]]; then
  echo "  All three generation rules are present and Enabled. Their windows differ by"
  echo "  environment by design; read the days above against the tree rather than"
  echo "  against staging."
fi
echo ""

if (( SNAPSHOT_REPLICATION )); then
  # The disaster-recovery bucket, read directly rather than inferred from the
  # primary. Its windows are the ones that have to match its Object Lock, and a
  # verification that reads only the primary cannot see the rule that matters:
  # a daily generation kept longer than the lock leaves a copy protected by access
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
    echo ""
    echo "  Production replicates the promoted generations to the disaster-recovery"
    echo "  bucket, so no replication configuration here means the apply did not land or"
    echo "  the credential cannot read it. Either way this run cannot prove the scope."
    VERIFY_FAIL=1
  else
    printf '%s\n' "$REPL" | sed 's/^/  /'
    echo ""
    # The scope is the half of this change that can be wrong while everything
    # looks fine: an unfiltered rule left in place keeps replicating every object,
    # including the two-day routine/ stream this change exists to stop shipping.
    # A null or empty third field IS that rule, and text output renders a missing
    # Filter.Prefix as the literal "None".
    REPL_HOURLY=0
    REPL_DAILY=0
    REPL_UNFILTERED=""
    while IFS=$'\t' read -r repl_id repl_status repl_prefix; do
      [[ -z "$repl_id" ]] && continue
      case "$repl_prefix" in
        "hourly/") REPL_HOURLY=1 ;;
        "daily/")  REPL_DAILY=1 ;;
        ""|"None") REPL_UNFILTERED="${REPL_UNFILTERED} ${repl_id}" ;;
      esac
      # A Disabled replication rule replicates nothing, so the promoted generations
      # are not reaching the disaster-recovery bucket at all. That is a failure,
      # not a remark: printing it while exiting 0 told the operator to go looking
      # for a problem the exit code denied.
      if [[ "$repl_status" != "Enabled" ]]; then
        echo "  NOT ENABLED: rule '${repl_id}' is '${repl_status}', so it replicates nothing."
        VERIFY_FAIL=1
      fi
    done <<< "$REPL"

    if [[ -n "$REPL_UNFILTERED" ]]; then
      echo "  UNFILTERED replication rule still in place:${REPL_UNFILTERED}"
      echo "  That rule replicates every object, including the two-day routine/ stream"
      echo "  this change narrows away. The apply did not land."
      VERIFY_FAIL=1
    fi
    if (( ! REPL_HOURLY )) || (( ! REPL_DAILY )); then
      (( REPL_HOURLY )) || echo "  MISSING a replication rule scoped to hourly/."
      (( REPL_DAILY ))  || echo "  MISSING a replication rule scoped to daily/."
      VERIFY_FAIL=1
    fi
    if (( REPL_HOURLY && REPL_DAILY )) && [[ -z "$REPL_UNFILTERED" ]]; then
      echo "  Scoped to hourly/ and daily/, with no unfiltered rule left behind."
    fi
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
  if (( SNAPSHOT_REPLICATION )); then
    # Asserted on production only. The snapshot replication alarms are part of
    # this change there. Staging has no snapshot disaster-recovery bucket, so the
    # alarms its flag governs belong to other replication and are not this
    # script's to fail on.
    case "$(replication_alarm_declared)" in
      yes)
        echo "  terraform/$TARGET sets enable_replication_alarm = true, so an alarm should"
        echo "  exist here. The apply did not land."
        VERIFY_FAIL=1
        ;;
      no)
        echo "  terraform/$TARGET sets enable_replication_alarm = false, so no alarm is"
        echo "  expected and there is nothing to prove."
        ;;
      *)
        echo "  Could not read enable_replication_alarm from terraform/$TARGET, so this"
        echo "  cannot tell a deliberately absent alarm from an apply that did not land."
        echo "  Read the flag in that tree and judge this line yourself."
        ;;
    esac
  else
    echo "  No replication alarm on $TARGET. Staging has no snapshot disaster-recovery"
    echo "  bucket, so this change arms no alarm here; nothing is wrong."
  fi
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
  echo "  its state proves nothing either way. The daily generation promotes once a day, so its"
  echo "  pair needs a day before either reading means anything."
fi

echo ""
if (( VERIFY_FAIL )); then
  echo "VERIFICATION FAILED on $TARGET. Read the lines above marked MISSING, UNFILTERED" >&2
  echo "or NOT ENABLED: the change is not in the state this script was asked to reach." >&2
  echo "" >&2
  echo "No alarm STATE contributed to this verdict. INSUFFICIENT_DATA straight after an" >&2
  echo "apply is correct and is reported rather than judged." >&2
  echo "" >&2
  echo "Nothing here is undone by failing: the lifecycle rules and the replication scope" >&2
  echo "are whatever the apply left. Fix the tree and re-run, or re-run --verify once you" >&2
  echo "believe it landed." >&2
  exit 1
fi

if (( SNAPSHOT_REPLICATION )); then
  echo "Verified on $TARGET: all three generation rules are present and Enabled, and"
  echo "replication is Enabled and scoped to the two promoted generations with no"
  echo "unfiltered rule left behind it."
else
  echo "Verified on $TARGET: all three generation rules are present and Enabled."
fi
echo "The alarm states above are a read-out and are not part of that verdict."

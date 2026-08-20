#!/usr/bin/env bash
# production-live-marker.sh
#
# Reads and moves the production-live marker,
# /footbag/production/app/production_live.
#
# The marker is the switch that decides whether production may still be
# treated as a scratch environment. While it reads "false" (pre-live) the
# database-replacing deploy is permitted and a Stripe test-mode key is
# accepted; from "true" (live) onward both are refused, permanently and with
# no bypass flag.
#
# Why this is a script and not `terraform apply`: the marker resource in
# terraform/production/ssm.tf carries `lifecycle { ignore_changes = [value] }`
# precisely so that a routine apply can never silently revert a live
# production to pre-live and re-arm the destructive deploy paths. That means
# Terraform cannot move the marker in either direction, and an operator told
# to "run terraform apply to restore the marker" would watch it change nothing
# and stay refused. Both the flip and the restore are deliberate out-of-band
# put-parameter calls, and this is where they live.
#
# The marker is a plain String parameter (no KMS): it is a state flag, not a
# secret, and the deploy guards read it with the host's own runtime profile.
#
# Usage:
#   scripts/production-live-marker.sh --status --profile <prod-profile>
#   scripts/production-live-marker.sh --set live     --profile <prod-profile>
#   scripts/production-live-marker.sh --set pre-live --profile <prod-profile>
#   scripts/production-live-marker.sh --set live --dry-run
set -euo pipefail

TARGET="production"
AWS_PROFILE_ARG=""
AWS_REGION_ARG="${AWS_REGION:-us-east-1}"
MODE=""
DESIRED=""
DRY_RUN=0

# Confirmation phrases, deliberately different from each other so a half-read
# prompt cannot be answered with the phrase for the opposite direction.
CONFIRM_LIVE="GO LIVE"
CONFIRM_PRE_LIVE="RESTORE PRE-LIVE"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --set)
      MODE="set"
      DESIRED="${2:-}"
      shift 2 || { echo "ERROR: --set requires 'live' or 'pre-live'" >&2; exit 2; }
      ;;
    --status)
      MODE="status"
      shift
      ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --region)
      AWS_REGION_ARG="${2:-}"
      shift 2 || { echo "ERROR: --region requires an argument" >&2; exit 2; }
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      # Bounded by the first `set -eu` rather than a line number, so editing the
      # header cannot truncate the help text or, as here, run past it and print
      # the script's own code to the operator.
      sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument '$1'" >&2
      exit 2
      ;;
  esac
done

PARAM="/footbag/$TARGET/app/production_live"

if [[ -z "$MODE" ]]; then
  echo "ERROR: one of --status or --set live|pre-live is required." >&2
  exit 2
fi

if [[ "$MODE" == "set" ]]; then
  case "$DESIRED" in
    live)     WANT_VALUE="true" ;;
    pre-live) WANT_VALUE="false" ;;
    *)
      echo "ERROR: --set takes 'live' or 'pre-live' (got '$DESIRED')." >&2
      exit 2
      ;;
  esac
fi

if (( DRY_RUN )); then
  echo "== dry run: production-live marker =="
  echo ""
  echo "Parameter: $PARAM"
  if [[ "$MODE" == "status" ]]; then
    echo "Would read the current value and report pre-live / live."
  else
    echo "Would read the current value, then, after a typed confirmation:"
    echo "  aws ssm put-parameter --name $PARAM --type String \\"
    echo "    --value $WANT_VALUE --overwrite --profile <profile>"
    if [[ "$WANT_VALUE" == "true" ]]; then
      echo ""
      echo "Going live forbids the database-replacing deploy permanently and makes the"
      echo "runtime refuse a Stripe test-mode key at the next payment use."
    else
      echo ""
      echo "Returning to pre-live re-arms the database-replacing deploy paths."
    fi
  fi
  exit 0
fi

if [[ -z "$AWS_PROFILE_ARG" ]]; then
  echo "ERROR: --profile is required (the AWS profile that may read and write $PARAM)" >&2
  exit 2
fi

read_marker() {
  aws ssm get-parameter \
    --name "$PARAM" \
    --region "$AWS_REGION_ARG" \
    --profile "$AWS_PROFILE_ARG" \
    --query 'Parameter.Value' \
    --output text 2>/dev/null
}

describe_marker() {
  case "$1" in
    false) echo "pre-live (destructive deploys permitted; a test-mode Stripe key is accepted)" ;;
    true)  echo "live (destructive deploys forbidden; only a live Stripe key is accepted)" ;;
    *)     echo "UNRECOGNISED — every guard fails closed on this" ;;
  esac
}

CURRENT="$(read_marker)" || CURRENT="<unreadable>"

echo "Marker $PARAM currently reads: $CURRENT"
echo "  meaning: $(describe_marker "$CURRENT")"

if [[ "$MODE" == "status" ]]; then
  exit 0
fi

if [[ "$CURRENT" == "$WANT_VALUE" ]]; then
  echo ""
  echo "Already $DESIRED; nothing to do."
  exit 0
fi

echo ""
if [[ "$WANT_VALUE" == "true" ]]; then
  CONFIRM_PHRASE="$CONFIRM_LIVE"
  echo "This takes production LIVE."
  echo ""
  echo "From this point the database-replacing deploy is refused permanently, with no"
  echo "bypass flag, and the runtime refuses a Stripe test-mode key at the next payment"
  echo "use. Restoring pre-live afterwards is possible with this same script, but any"
  echo "full-refresh deploy you were relying on should happen BEFORE this flip, not after."
else
  CONFIRM_PHRASE="$CONFIRM_PRE_LIVE"
  echo "This returns production to PRE-LIVE."
  echo ""
  echo "It re-arms the database-replacing deploy paths against production. Do this only"
  echo "while production genuinely holds no real member data: the real-member tripwire is"
  echo "the only guard left once the marker no longer refuses on its own."
fi

echo ""
printf "Type '%s' to continue: " "$CONFIRM_PHRASE"
read -r TYPED
if [[ "$TYPED" != "$CONFIRM_PHRASE" ]]; then
  echo "Aborted: confirmation phrase not entered." >&2
  exit 1
fi

aws ssm put-parameter \
  --name "$PARAM" \
  --value "$WANT_VALUE" \
  --type String \
  --overwrite \
  --region "$AWS_REGION_ARG" \
  --profile "$AWS_PROFILE_ARG" >/dev/null

# Read back rather than trusting the write: every deploy guard reads this
# parameter, and a marker that did not actually move is the one failure mode
# nobody notices until a deploy behaves the wrong way.
AFTER="$(read_marker)" || AFTER="<unreadable>"
echo ""
echo "Marker now reads: $AFTER"
echo "  meaning: $(describe_marker "$AFTER")"

if [[ "$AFTER" != "$WANT_VALUE" ]]; then
  echo "ERROR: the marker did not take the intended value; investigate before deploying." >&2
  exit 1
fi

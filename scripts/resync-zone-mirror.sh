#!/usr/bin/env bash
# resync-zone-mirror.sh -- bring the Route 53 copy of footbag.org back in line
# with a fresh capture of the legacy zone, and prove it answers the same.
#
# Until the registrar points at Route 53, the production hosted zone is a copy
# nobody resolves from. It has to stay an exact copy, because the nameserver
# change is only safe if changing which servers answer changes nothing about
# what they answer. The legacy webmaster still edits his own zone, so after any
# edit of his the copy is stale: the values file is re-synced to a fresh capture,
# the record changes are applied, and every name is checked again. Done by hand
# that is two commands and a judgement in between about whether the plan holds
# anything else, which is the step that gets skipped. This script is the whole
# operation.
#
# What it does, in order:
#   1. Reads the hosted zone id and its name servers from Terraform's outputs,
#      so neither is transcribed from a console.
#   2. Applies through scripts/terraform-apply.sh --dns-records-only: the saved
#      plan, both typed APPLY confirmations, and a refusal of any change that
#      is not a Route 53 record created or updated in place. An empty plan
#      applies nothing and the run goes on to the check, so a re-run after a stop
#      between the two steps finishes the work rather than repeating it.
#   3. Runs scripts/verify-zone-mirror.sh against the named capture and the first
#      of the zone's name servers, and writes its report into the private
#      checkout's zone-capture evidence, under a UTC timestamp so an earlier
#      report on the same day is never overwritten. The report is written
#      whether the check passes or fails; the check's verdict is this run's exit.
#
# What it refuses to do:
#   - Run against anything but production, the only tree that holds the zone.
#   - Carry the tree's unapplied backlog, a record replacement or a record
#     removal along with the re-sync. A plain production apply clears the first;
#     the other two are decisions for a person reading their own plan.
#   - Pick a capture for you. Which capture a run compares against is exactly
#     the thing that must not be inherited from ambient state.
#   - Touch the registrar or the delegation. Nothing here changes what the
#     internet resolves until the nameserver change, which is a separate sitting.
#
# Usage:
#   bash scripts/resync-zone-mirror.sh --target production \
#        --capture footbag_private_repo/evidence/zone-capture/<capture>.zone
#   bash scripts/resync-zone-mirror.sh --target production --capture <file> --dry-run
#
#   --target    production. Required, with no default.
#   --capture   the RFC-format capture of the legacy zone the values file was
#               re-synced to. Required.
#   --dry-run   states what the run would do and touches nothing.
#
# Exits 0 only when the check passes. Non-zero when an argument or precondition
# is refused, when the apply is refused or declined, or when the check finds a
# difference, a name it could not read, or a name served here only.
#
# Test seams (CI only; operators never set these): RESYNC_ZONE_MIRROR_EVIDENCE_DIR
# replaces the evidence directory, announced on stderr. The seams of the scripts
# this runs pass through unchanged and each announces itself: TF_OUTPUT_BIN for
# the output reads, TERRAFORM_APPLY_BIN for the apply, FOOTBAG_DIG_BIN and
# FOOTBAG_AWS_BIN for the check.

set -euo pipefail

TARGET=""
CAPTURE=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires a value" >&2; exit 2; }
      ;;
    --capture)
      CAPTURE="${2:-}"
      shift 2 || { echo "ERROR: --capture requires a path" >&2; exit 2; }
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      # The whole header, read to the first line that is not a comment, so the
      # tail with the exit contract and the seams is never cut off.
      sed -n '2,/^[^#]/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "ERROR: --target is required (production)." >&2
  exit 2
fi
if [[ "$TARGET" != "production" ]]; then
  echo "ERROR: --target must be production: it is the only tree that holds the hosted zone (got '$TARGET')." >&2
  exit 2
fi
if [[ -z "$CAPTURE" ]]; then
  echo "ERROR: --capture is required: the capture the values file was re-synced to." >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# A capture given relative to where the operator stood still names that file
# once the run moves to the repository root.
if [[ "$CAPTURE" != /* ]]; then
  CAPTURE="$(pwd)/$CAPTURE"
fi
cd "$REPO_ROOT"

# One closing report for the whole run: the apply, on the same library, hands its
# errors and warnings to it, and the check's problem lines are read into it.
# shellcheck source=lib/closing-report.sh
source "$REPO_ROOT/scripts/lib/closing-report.sh"

if [[ ! -f "$CAPTURE" || ! -r "$CAPTURE" ]]; then
  cr_die "the capture is not a readable file: $CAPTURE"
fi

if [[ -n "${RESYNC_ZONE_MIRROR_EVIDENCE_DIR:-}" ]]; then
  EVIDENCE_DIR="$RESYNC_ZONE_MIRROR_EVIDENCE_DIR"
  echo "SYNTHETIC: evidence directory='$EVIDENCE_DIR' -- this run proves nothing about the estate." >&2
else
  EVIDENCE_DIR="$REPO_ROOT/footbag_private_repo/evidence/zone-capture"
fi
if [[ ! -d "$EVIDENCE_DIR" ]]; then
  echo "       The report belongs in the private operations checkout beside the" >&2
  echo "       capture; link the checkout (scripts/setup_private_repo.sh) first." >&2
  cr_die "no evidence directory at $EVIDENCE_DIR."
fi
if ! command -v jq >/dev/null 2>&1; then
  cr_die "jq is required to read the zone's name servers. Nothing has been applied."
fi

REPORT="$EVIDENCE_DIR/mirror-comparison.$(date -u +%Y-%m-%dT%H%M%SZ).txt"
TF_DIR="terraform/$TARGET"

if (( DRY_RUN )); then
  echo "Would run, in order:"
  echo "  1. Read route53_zone_id and route53_name_servers from $TF_DIR."
  echo "  2. bash scripts/terraform-apply.sh --target $TARGET --dns-records-only"
  echo "     (refuses anything but Route 53 records created or updated in place;"
  echo "     asks for APPLY twice; applies nothing when the records already match)."
  echo "  3. bash scripts/verify-zone-mirror.sh --capture $CAPTURE"
  echo "     --nameserver <first name server> --zone-id <zone id>"
  echo "     --out $REPORT"
  cr_unproved "the apply and the check (a dry run touches nothing)"
  cr_finish
fi

# shellcheck source=lib/terraform-output.sh
source "$REPO_ROOT/scripts/lib/terraform-output.sh"

if ! tf_output_read "$TF_DIR" route53_zone_id || [[ -z "$TF_OUTPUT_VALUE" ]]; then
  tf_output_explain "$TF_DIR" route53_zone_id
  cr_die "could not read route53_zone_id from $TF_DIR. Nothing has been applied."
fi
ZONE_ID="$TF_OUTPUT_VALUE"

if ! tf_output_read "$TF_DIR" route53_name_servers --json; then
  tf_output_explain "$TF_DIR" route53_name_servers
  cr_die "could not read route53_name_servers from $TF_DIR. Nothing has been applied."
fi
# jq's own complaint, if the output is not JSON, is shown on stderr; the empty
# answer it leaves is then refused below.
NAMESERVER="$(printf '%s' "$TF_OUTPUT_VALUE" | jq -r 'if type == "array" then (.[0] // "") else "" end')" \
  || NAMESERVER=""
if [[ -z "$NAMESERVER" ]]; then
  cr_die "route53_name_servers in $TF_DIR names no name server. Nothing has been applied."
fi

echo "== resync zone mirror: $TARGET =="
echo "  hosted zone:  $ZONE_ID"
echo "  name server:  $NAMESERVER"
echo "  capture:      $CAPTURE"
echo ""

echo "-- Step 1 of 2: apply the record changes --"
apply_rc=0
# Run directly, never through a pipe: the apply asks for its typed APPLY on this
# terminal, and hands its own errors and warnings to this run's report.
bash "$REPO_ROOT/scripts/terraform-apply.sh" --target "$TARGET" --dns-records-only || apply_rc=$?
if (( apply_rc != 0 )); then
  echo "" >&2
  echo "       Nothing beyond what the apply reported above has changed. Re-run this" >&2
  echo "       script once that is resolved; it applies only what is still pending." >&2
  cr_error "the apply did not complete (exit $apply_rc). The check has not run."
  cr_unproved "that the Route 53 copy answers what the capture holds (the check did not run)"
  exit "$apply_rc"
fi

echo ""
echo "-- Step 2 of 2: check every name against the capture --"
# The check asks for nothing, so its output is read as it runs: each name it
# could not read or found different reaches the closing report by name.
verify_rc=0
cr_run "verify-zone-mirror" -- bash "$REPO_ROOT/scripts/verify-zone-mirror.sh" \
  --capture "$CAPTURE" --nameserver "$NAMESERVER" --zone-id "$ZONE_ID" \
  --out "$REPORT" || verify_rc=$?

echo ""
if (( verify_rc != 0 )); then
  echo "      Report: $REPORT" >&2
  cr_error "FAIL: the Route 53 copy does not answer what the capture holds (exit $verify_rc)."
  exit "$verify_rc"
fi
echo "PASS: the Route 53 copy answers what the capture holds."
echo "      Report: $REPORT"
echo "      Commit it to the private checkout beside the capture."
cr_proved "the Route 53 copy answers what the capture holds (report: $REPORT)"
cr_finish

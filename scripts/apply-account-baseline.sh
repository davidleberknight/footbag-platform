#!/usr/bin/env bash
# apply-account-baseline.sh
#
# Applies the account baseline declared in terraform/shared/account-baseline.tf
# (the account-level public-access block, the IAM password policy, the
# external-access Access Analyzers in the account region and in us-west-2,
# and, behind enable_guardduty, the GuardDuty
# detector) and proves the outcome, as one operation.
#
# WHY THIS HAS ITS OWN SCRIPT.
#
# scripts/terraform-apply.sh --target shared would apply the same resources, but
# it applies whatever the shared tree has pending, and it proves nothing about the
# account afterwards. This change has a narrower contract and a proof that
# belongs to it:
#
#   1. The plan may create the baseline resources and do nothing else. The
#      shared tree holds every environment's Terraform state, so anything else
#      pending in it is not this change and is refused before the confirmation,
#      rather than left for an operator to spot in a long plan. The operations
#      and security alternate contacts stay behind
#      enable_account_alternate_contacts and are created only on a run given
#      --enable-alternate-contacts; otherwise a plan touching them is refused
#      like anything else.
#
#   2. Success is the account reporting the controls in place, not the apply
#      exiting zero. scripts/verify-account-baseline.sh reads every control
#      before and after, and its saved baseline is compared afterwards, so the
#      run also proves footbag-operator and both runtime trusts did not move.
#
# The shared tree is applied by the directly authenticated footbag-operator:
# the job role's state grant reaches only the staging key, so it cannot read
# this tree's state. Any other identity is refused before anything is read.
#
# Re-running is safe. A plan with nothing to do skips the apply and goes
# straight to the proof, so a run stopped after the apply finishes by being run
# again.
#
# Steps:
#   1  report the controls as they stand, and save the baseline to compare
#   2  plan the shared tree, refuse anything beyond the baseline creates, take
#      a typed APPLY, apply that exact plan
#   3  report again, which must show no findings, then compare the baseline
#
# Usage:
#   scripts/apply-account-baseline.sh --dry-run
#   scripts/apply-account-baseline.sh [--enable-guardduty] [--enable-alternate-contacts]
#
# Flags:
#   --dry-run   State what a real run would do; run nothing.
#   --enable-guardduty
#               Turn on the GuardDuty detector. Refused unless both
#               environments' finding rules exist and are ENABLED; shows the
#               values-file change, plans with the gate on, and writes
#               enable_guardduty = true to the shared values file only after
#               the typed APPLY.
#   --enable-alternate-contacts
#               Turn on the operations and security alternate contacts, both
#               naming the ops-alert group. Refused unless the shared tree's
#               secrets file assigns alternate_contact_operations and
#               alternate_contact_security; then the same shown change, plan
#               and write-after-APPLY as above, for
#               enable_account_alternate_contacts = true.
#   --yes       Accept the confirmation where no terminal is attached.
#
# Test seams (CI only; operators never set these): TERRAFORM_APPLY_BIN points
# the terraform command at a stub, ACCOUNT_BASELINE_VERIFIER points the
# verification at a stub script, ACCOUNT_BASELINE_AWS_BIN replaces the aws CLI
# for the finding-route check, and ACCOUNT_BASELINE_TFVARS points the values
# file at a scratch copy. Each is announced loudly when set, because a
# run that silently used a stub would prove nothing about the account.
set -euo pipefail

DRY_RUN=0
ENABLE_GUARDDUTY=0
ENABLE_CONTACTS=0
# The shared confirm_from_tty helper reads this by name and compares it to the
# string "yes", so it is not a numeric flag like the others here.
ASSUME_YES=""

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

TF_DIR="${REPO_ROOT}/terraform/shared"
FOOTBAG_OPERATOR_USER="footbag-operator"
# The only changes this script applies, each a create.
ALLOWED_CREATES=(
  "aws_s3_account_public_access_block.account"
  "aws_iam_account_password_policy.account"
  "aws_accessanalyzer_analyzer.account"
  "aws_accessanalyzer_analyzer.account_us_west_2"
  "aws_guardduty_detector.account[0]"
  'aws_guardduty_detector_feature.account["S3_DATA_EVENTS"]'
  'aws_guardduty_detector_feature.account["EKS_AUDIT_LOGS"]'
  'aws_guardduty_detector_feature.account["EBS_MALWARE_PROTECTION"]'
  'aws_guardduty_detector_feature.account["RDS_LOGIN_EVENTS"]'
  'aws_guardduty_detector_feature.account["LAMBDA_NETWORK_LOGS"]'
  'aws_guardduty_detector_feature.account["RUNTIME_MONITORING"]'
  "aws_account_alternate_contact.operations[0]"
  "aws_account_alternate_contact.security[0]"
)

# The shared tree's values file, a symlink into the private operations checkout.
# Written through the link, never replaced, so the link survives.
TFVARS="${ACCOUNT_BASELINE_TFVARS:-${TF_DIR}/terraform.tfvars}"
if [[ -n "${ACCOUNT_BASELINE_TFVARS:-}" ]]; then
  echo "SYNTHETIC: values file='${TFVARS}' -- this run proves nothing about the account." >&2
fi
# The shared tree's secrets file, which carries the contacts' values. Only the
# assignments' names are read here, never their values.
SECRETS="${ACCOUNT_BASELINE_SECRETS:-${TF_DIR}/secrets.auto.tfvars}"
if [[ -n "${ACCOUNT_BASELINE_SECRETS:-}" ]]; then
  echo "SYNTHETIC: secrets file='${SECRETS}' -- this run proves nothing about the account." >&2
fi

# The EventBridge rules each environment tree declares to route GuardDuty
# findings to its own alarm topic. Both must exist before the detector does, so
# the first finding reaches a person rather than only the console.
GUARDDUTY_ROUTES=(
  "footbag-staging-guardduty-findings"
  "footbag-production-guardduty-findings"
)

TF_BIN="${TERRAFORM_APPLY_BIN:-terraform}"
AWS_BIN="${ACCOUNT_BASELINE_AWS_BIN:-aws}"
if [[ -n "${ACCOUNT_BASELINE_AWS_BIN:-}" ]]; then
  echo "SYNTHETIC: aws='${AWS_BIN}' -- this run proves nothing about the account." >&2
fi
VERIFIER="${ACCOUNT_BASELINE_VERIFIER:-${REPO_ROOT}/scripts/verify-account-baseline.sh}"
if [[ -n "${TERRAFORM_APPLY_BIN:-}" ]]; then
  echo "SYNTHETIC: terraform='${TF_BIN}' -- this run proves nothing about the account." >&2
fi
if [[ -n "${ACCOUNT_BASELINE_VERIFIER:-}" ]]; then
  echo "SYNTHETIC: verifier='${VERIFIER}' -- this run proves nothing about the account." >&2
fi

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot truncate the help text or run past it into the script body.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --enable-guardduty) ENABLE_GUARDDUTY=1; shift ;;
    --enable-alternate-contacts) ENABLE_CONTACTS=1; shift ;;
    --yes)     ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 ;;
  esac
done

if (( DRY_RUN )); then
  cat <<'PLAN'
Dry run. A real run would, in this order:

  step 1  run the account-baseline report as it stands (findings expected
          before the apply), then save the baseline of footbag-operator and
          both runtime trusts for comparison afterwards.
  step 2  plan terraform/shared into a mode-600 file shredded on every exit
          path; refuse unless the plan only creates the public-access block,
          the password policy, the Access Analyzer and the GuardDuty detector
          and its features, and changes nothing else; take a typed APPLY;
          apply that exact plan. A plan with nothing to do skips the apply.
          With --enable-guardduty, first refuse unless both environments'
          finding rules are ENABLED, and write enable_guardduty = true to the
          shared values file after the typed APPLY. With
          --enable-alternate-contacts, first refuse unless the shared secrets
          file assigns both contacts, and write
          enable_account_alternate_contacts = true the same way.
  step 3  run the report again, which must show no findings, then compare
          against the saved baseline, which must show nothing changed.

Nothing was planned, applied or read.
PLAN
  exit 0
fi

# Everything past the dry run reaches the account. Settled and proved once here,
# and refused to anything but the directly authenticated operator, because the
# shared tree's state is out of every other identity's reach and a run started
# under one would fail at the backend rather than at the door.
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"
# shellcheck source=lib/aws-identity.sh
source "${REPO_ROOT}/scripts/lib/aws-identity.sh"
aws_profile_ensure || exit 1
aws_identity_require_direct_user "$FOOTBAG_OPERATOR_USER" || exit 1

# ── Turning on GuardDuty ─────────────────────────────────────────────────────
#
# enable_guardduty is a line in the shared values file and an apply, and typed
# by hand the pair drifts apart. With --enable-guardduty this script owns both:
# it proves each environment routes findings to its alarm topic, shows the
# values-file change, plans with the gate on, and writes the line only after the
# typed APPLY, so an aborted run leaves the file as it was and a failed apply is
# finished by running again. Without the flag a line already set to true is
# honoured, which is how such a re-run completes.
#
# The alternate contacts follow the same shape with --enable-alternate-contacts:
# their precondition is that the shared secrets file assigns both values, read
# by name only, since a gate turned on with a value missing is refused by the
# tree's own precondition only after the plan has started.
TF_PLAN_VARS=()
TFVARS_NEW=""
GATES=()
if (( ENABLE_GUARDDUTY || ENABLE_CONTACTS )); then
  [[ -e "$TFVARS" ]] || {
    echo "REFUSING: ${TFVARS} does not resolve; the private operations checkout" >&2
    echo "  must be present. Nothing was planned or applied." >&2
    exit 1
  }
fi
if (( ENABLE_CONTACTS )); then
  for contact in alternate_contact_operations alternate_contact_security; do
    if ! grep -qE "^[[:space:]]*${contact}[[:space:]]*=" "$SECRETS" 2>/dev/null; then
      echo "REFUSING: ${SECRETS} assigns no ${contact}. Add it there, naming the" >&2
      echo "  ops-alert group's address, then run this again. Nothing was planned or applied." >&2
      exit 1
    fi
    echo "Contact value present: ${contact}"
  done
  GATES+=(enable_account_alternate_contacts)
fi
if (( ENABLE_GUARDDUTY )); then
  for rule in "${GUARDDUTY_ROUTES[@]}"; do
    rule_state=""
    if ! rule_state="$("$AWS_BIN" events describe-rule --name "$rule" \
      --query State --output text 2>&1)"; then
      echo "REFUSING: could not read the EventBridge rule ${rule}: ${rule_state}" >&2
      echo "  Apply that environment's tree with scripts/terraform-apply.sh first," >&2
      echo "  staging before production, so a finding has somewhere to go." >&2
      echo "  Nothing was planned or applied." >&2
      exit 1
    fi
    if [[ "$rule_state" != "ENABLED" ]]; then
      echo "REFUSING: the EventBridge rule ${rule} is ${rule_state}, not ENABLED." >&2
      echo "  Nothing was planned or applied." >&2
      exit 1
    fi
    echo "Finding route in place: ${rule}"
  done
  GATES+=(enable_guardduty)
fi
if (( ${#GATES[@]} )); then
  tfvars_old="$(cat "$TFVARS")"
  draft="$tfvars_old"
  for gate in "${GATES[@]}"; do
    TF_PLAN_VARS+=(-var "${gate}=true")
    if grep -qE "^[[:space:]]*${gate}[[:space:]]*=[[:space:]]*true[[:space:]]*$" <<<"$draft"; then
      echo "The shared values file already sets ${gate} = true."
    elif grep -qE "^[[:space:]]*${gate}[[:space:]]*=" <<<"$draft"; then
      draft="$(sed -E "s/^[[:space:]]*${gate}[[:space:]]*=.*$/${gate} = true/" <<<"$draft")"
    else
      draft="${draft}"$'\n'"${gate} = true"
    fi
  done
  if [[ "$draft" != "$tfvars_old" ]]; then
    TFVARS_NEW="$draft"
    echo ""
    echo "Once confirmed, the shared values file changes like this:"
    diff -u <(printf '%s\n' "$tfvars_old") <(printf '%s\n' "$TFVARS_NEW") \
      --label "${TFVARS} (now)" --label "${TFVARS} (after)" || [[ $? == 1 ]]
  fi
  echo ""
fi

# Writes the gate lines shown above, through the symlink, and reads each back.
# Run after the typed APPLY and before the apply itself, so a failed apply leaves
# a file that a plain re-run plans the same way.
write_gate_lines() {
  [[ -n "$TFVARS_NEW" ]] || return 0
  printf '%s\n' "$TFVARS_NEW" > "$TFVARS"
  local gate
  for gate in "${GATES[@]}"; do
    if ! grep -qE "^${gate} = true$" "$TFVARS"; then
      echo "ERROR: wrote ${TFVARS} but it does not read back ${gate} = true." >&2
      echo "       Nothing was applied." >&2
      exit 1
    fi
    echo "Wrote ${gate} = true to ${TFVARS}."
  done
  TFVARS_NEW=""
}

command -v jq >/dev/null 2>&1 || { echo "ERROR: jq is needed to read the plan." >&2; exit 1; }

# The plan is written to a mode-600 file under a literal /tmp path and shredded
# by a trap on EXIT, INT and TERM. A saved plan is a zip carrying a full copy of
# state, so left behind by a failure it is a durable copy of every resolved
# value that no credential scan can see into.
TF_PLAN=""
cleanup_plan() {
  [ -n "${TF_PLAN:-}" ] || return 0
  [ -e "${TF_PLAN}" ] || return 0
  shred -u "${TF_PLAN}" 2>/dev/null || rm -f "${TF_PLAN}" 2>/dev/null || true
}
trap cleanup_plan EXIT INT TERM

# ── Step 1: the controls as they stand, and the baseline ─────────────────────

echo "-- step 1: the account baseline before the apply --"
echo ""
# Findings are expected here and do not stop the run: they are what the apply is
# for. The report is shown so the before state is on the operator's screen.
bash "$VERIFIER" || true
echo ""

save_out=""
if ! save_out="$(bash "$VERIFIER" --save)"; then
  printf '%s\n' "$save_out"
  echo "ERROR: could not save the baseline, so the run could not prove afterwards" >&2
  echo "       that footbag-operator and the runtime trusts did not move." >&2
  echo "       Nothing was planned or applied." >&2
  exit 1
fi
printf '%s\n' "$save_out"
BASELINE_FILE="$(sed -n 's/^Saved .* to \(.*\)$/\1/p' <<<"$save_out" | tail -1)"
if [[ -z "$BASELINE_FILE" || ! -r "$BASELINE_FILE" ]]; then
  echo "ERROR: the verifier reported no readable baseline file, so there would be" >&2
  echo "       nothing to compare against. Nothing was planned or applied." >&2
  exit 1
fi
echo ""

# ── Step 2: plan, gate, confirm, apply ───────────────────────────────────────

echo "-- step 2: terraform/shared --"
echo ""
TF_PLAN="$(mktemp /tmp/footbag-account-baseline-plan.XXXXXX)"
chmod 600 "$TF_PLAN"

if ! "$TF_BIN" -chdir="$TF_DIR" plan -input=false ${TF_PLAN_VARS[@]+"${TF_PLAN_VARS[@]}"} -out="$TF_PLAN"; then
  echo "ERROR: terraform plan failed for the shared tree. Nothing was applied." >&2
  exit 1
fi

# Every change the plan would make, as "<address> <actions>". Read as JSON rather
# than from the human rendering, which is laid out for reading, not parsing. A
# gate that cannot read refuses: an unreadable plan is not an empty one.
plan_json=""
if ! plan_json="$("$TF_BIN" -chdir="$TF_DIR" show -json "$TF_PLAN" 2>&1)"; then
  echo "" >&2
  echo "REFUSING: could not read the plan as JSON, so the scope check could not" >&2
  echo "  run. Refusing rather than assuming the plan holds only this change." >&2
  echo "  terraform show said: ${plan_json}" >&2
  exit 1
fi
changes=""
if ! changes="$(jq -r '
    .resource_changes // []
    | map(select((.change.actions | tostring) != "[\"no-op\"]"
                 and (.change.actions | tostring) != "[\"read\"]"))
    | .[] | "\(.address) \(.change.actions | join(","))"
  ' <<<"$plan_json" 2>/dev/null)"; then
  echo "" >&2
  echo "REFUSING: the plan JSON could not be parsed, so the scope check did not" >&2
  echo "  complete. Refusing rather than assuming the plan holds only this change." >&2
  exit 1
fi

unexpected=""
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  addr="${line% *}"
  actions="${line##* }"
  allowed=0
  for want in "${ALLOWED_CREATES[@]}"; do
    [[ "$addr" == "$want" && "$actions" == "create" ]] && allowed=1
  done
  (( allowed )) || unexpected+="    ${addr} (${actions})"$'\n'
done <<<"$changes"

if [[ -n "$unexpected" ]]; then
  echo "" >&2
  echo "REFUSING: the shared-tree plan carries changes beyond the account baseline:" >&2
  printf '%s' "$unexpected" >&2
  echo "" >&2
  echo "  This script applies the baseline creates and nothing else, because" >&2
  echo "  the shared tree holds every environment's state. Apply or resolve the" >&2
  echo "  rest through scripts/terraform-apply.sh --target shared first, then run" >&2
  echo "  this again. Nothing was applied." >&2
  exit 1
fi

if [[ -z "$changes" ]]; then
  echo "Nothing to apply: the baseline is already in Terraform state. Going"
  echo "straight to the proof."
  # State already holds what the gates create, so the lines only record what is
  # live; a later plan reading the file without them would plan its removal.
  write_gate_lines
  echo ""
else
  echo ""
  echo "The plan creates only these, and changes nothing else:"
  printf '%s\n' "$changes" | sed 's/^/  /'
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to apply the account baseline shown above: " "APPLY"; then
    echo "Aborted before terraform apply. Nothing was changed." >&2
    exit 1
  fi
  write_gate_lines
  if ! "$TF_BIN" -chdir="$TF_DIR" apply -input=false "$TF_PLAN"; then
    echo "ERROR: terraform apply failed for the shared tree. Run this script again:" >&2
    echo "       the next plan starts from whatever the apply left." >&2
    exit 1
  fi
  echo ""
fi
cleanup_plan
TF_PLAN=""

# ── Step 3: the proof ────────────────────────────────────────────────────────

echo "-- step 3: the account baseline after the apply --"
echo ""
if ! bash "$VERIFIER"; then
  echo "" >&2
  echo "ERROR: the account still reports findings after the apply, so the baseline" >&2
  echo "       is not in place. Read the FAIL lines above. Run this again once" >&2
  echo "       fixed; a plan with nothing left to do goes straight to the proof." >&2
  exit 1
fi
echo ""
if ! bash "$VERIFIER" --compare "$BASELINE_FILE"; then
  echo "" >&2
  echo "ERROR: footbag-operator or a runtime trust differs from the baseline" >&2
  echo "       saved before the apply. This apply should touch neither; read the" >&2
  echo "       differences above before doing anything else. Baseline:" >&2
  echo "       ${BASELINE_FILE}" >&2
  exit 1
fi
echo ""
echo "Done. The public-access block, the password policy, the Access Analyzer and"
echo "the GuardDuty detector are in place, and footbag-operator and both runtime"
echo "trusts are unchanged."

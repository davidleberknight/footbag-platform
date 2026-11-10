#!/usr/bin/env bash
# set-terraform-gate.sh
#
# Turns one on/off Terraform gate on or off in one environment, end to end: the
# values-file line, the apply, and a read-back proving Terraform now holds the
# requested state.
#
# WHY THIS EXISTS.
#
# Optional infrastructure ships behind a default-false bool gate, and turning
# one on or off is two actions that must both happen: the line in the
# environment's values file (terraform/<target>/terraform.tfvars, a gitignored
# symlink into the private operations checkout) and an apply. Typed by hand the
# pair drifts apart: a line written and never applied, a value typed into the
# wrong environment's file, an edit made without the diff being read. This
# script owns the whole operation, so a runbook step names it rather than
# saying "set the variable and apply".
#
# It sets alarm gates, and one gate that is not an alarm:
# enable_legacy_mirror_backup, which creates the legacy-mirror backup bucket
# and is turned on only. No DNS record and no mail setting changes through
# it: each of those belongs to an apply that changes several values together,
# and every one of them is refused by name below.
#
# WHAT IT REFUSES.
#
#   - A gate not on the allowlist below. Each entry is a plain bool gate
#     (type bool, default false), and a gate is accepted on a target only when
#     that target's own tree declares it so (the billing alarm is declared in
#     production only). Anything else is refused, never guessed at.
#   - enable_cutover_login_alarm turned on, except in pass 1 of the
#     production-readiness sitting: it is allowed only while
#     enable_cutover_notice and enable_apex_alias_records both read exactly
#     false, which is where runbook step P1-11 arms the zero-logins alarm, lets
#     it fire on the idle production, and turns it off again before pass 2.
#     From pass 2 on, the freeze stage of the cutover script turns it on with
#     the alias records. Either flag true, a failed read, or a value that is not
#     a bool is refused. There is no metric to look for before arming it: its
#     LoginSuccessCount comes from a log filter the same gate creates, and in
#     pass 1 its firing on missing data is the point.
#   - enable_feed_queues, by name: scripts/activate-notification-feeds.sh owns
#     it, because turning the feeds on also needs a deploy and a host check.
#   - enable_cutover_login_alarm turned off inside the freeze window, while
#     enable_cutover_notice and enable_apex_alias_records are both on: the
#     freeze apply arms it, and it stays on through launch until the close of
#     the 48-hour watch after launch. Either flag that cannot be read is
#     refused as though it were on.
#   - enable_cutover_notice and enable_apex_alias_records, by name, either
#     direction: cutover flags that change only together with other values in
#     one apply, and this script sets one gate per apply. The notice goes on in
#     the window state (the second pass of the production-readiness sitting)
#     and off in the launch apply; the alias records go on only in the
#     write-freeze apply.
#   - enable_preview_record, by name, either direction: a DNS record on the
#     cutover path. The production custom-domain apply turns it on and the
#     launch apply turns it off with the notice.
#   - ses_enable_domain_identity and ses_enable_domain_auth, by name, either
#     direction: SES domain verification publishes DNS records and starts SES's
#     verification clock; it runs in the production-readiness sitting only once
#     the zone delegation is proved.
#   - ses_enable_mail_records, by name: on mail day it changes in one values
#     change with the ifpa MX and TXT. Turning it off restores the mirrored
#     legacy mail records while enable_legacy_mirror_records is on, which is
#     the mail cutover's revert, and deletes the apex MX and TXT once that flag
#     is off. The mail cutover owns it.
#   - enable_archive, by name, either direction: the archive bring-up sets
#     several values together (the flag, the signing key, the platform
#     address), and turning it off is refused by Terraform's prevent_destroy.
#   - enable_legacy_mirror_backup turned off: its bucket carries
#     prevent_destroy, so the apply would fail and leave the values file
#     saying off while the bucket stands. Turning it on looks for no metric,
#     since it creates a bucket, not an alarm.
#   - Arming an alarm over nothing. Before a gate is turned on, what its alarm
#     reads is looked for: BackupAgeMinutes published in the last three hours
#     for the backup alarms, a jobs.heartbeat line in the app log group in the
#     last fifteen minutes for the missed-run alarm (its JobsOverdue metric
#     comes from a log filter the same gate creates, so the metric cannot exist
#     before the gate is on), and AWS/Billing EstimatedCharges in us-east-1 for
#     the billing alarm. The first two treat missing data as breaching and
#     would page at once. A failed AWS call is an error carrying AWS's message,
#     never "absent".
#   - Any other change pending in the tree. The apply applies the whole tree,
#     so before the values file is touched the tree is planned read-only at its
#     current values, and anything pending there is refused: apply it first
#     with scripts/terraform-apply.sh, then re-run. The gate is the only change
#     its apply carries.
#   - A change Terraform cannot plan. The tree is planned read-only with the
#     new value before the values file is touched, and a failed plan leaves the
#     file as it was.
#   - A values file that is missing or a symlink pointing at nothing, which is
#     what a machine without the private operations checkout has. It never
#     improvises one: an apply from an empty values file plans against every
#     other variable's default.
#   - A values file inside this repository that git does not ignore.
#
# Every refusal by name exits 2 before any AWS or Terraform call, with the
# values file untouched. The other refusals, the login alarm's included, exit
# 1, also with the values file untouched.
#
# WHAT A FAILED APPLY LEAVES.
#
# The values file is written before the apply and is not put back if the apply
# fails: a failed apply may already have changed part of the estate, and
# rewriting the file over that would hide the mismatch. The closing report says
# the file holds the new state and the apply did not land; re-running the same
# command finishes the work.
#
# IDEMPOTENT.
#
# When the values file already holds the requested state, the tree is planned
# read-only: a plan with nothing pending means the state holds it too, and the
# run says so and applies nothing. A plan with changes pending is planned again
# with the gate at its other value: if that plan is clean, the gate is the only
# change pending (a run stopped between the write and the apply) and the run
# goes on to the apply; if it is not, something else is pending and the run is
# refused, as above.
#
# Usage:
#   bash scripts/set-terraform-gate.sh --target staging --gate enable_backup_alarm --state on
#   bash scripts/set-terraform-gate.sh --target production --gate enable_cutover_login_alarm --state on    # pass 1 only
#   bash scripts/set-terraform-gate.sh --target production --gate enable_cutover_login_alarm --state off
#   bash scripts/set-terraform-gate.sh --target production --gate enable_billing_alarm --state on --dry-run
#   bash scripts/set-terraform-gate.sh --target staging --gate enable_container_alarms --state on
#   bash scripts/set-terraform-gate.sh --target production --gate enable_host_key_alarm --state on
#
# Before arming, enable_container_alarms needs the container monitor's
# heartbeat flowing, and enable_host_key_alarm (production only, where the
# trail lives) needs the trail's last week to show every call by each host key
# from that host's address; each is checked, and refused otherwise. Arming the
# host-key alarm first brings staging_web_static_ip in the production values
# file to the staging tree's lightsail_static_ip output, writing that one line,
# shown and confirmed, when it is empty or different, and only while nothing
# else is pending.
#
# Flags:
#   --target staging|production  Environment (required, no default).
#   --gate <name>                The gate to set (required; allowlisted below).
#   --state on|off               The state to set it to (required).
#   --dry-run                    Show the gate line's change and what the run would
#                                apply; write nothing, run no terraform and no aws.
#   --yes                        Accept the values-file confirmation in advance,
#                                for a run with no terminal attached. The apply
#                                keeps its own confirmation, which on production
#                                is typed every time.
#
# The apply runs through scripts/terraform-apply.sh, which owns the saved plan,
# its shredding, and the typed APPLY on production.
#
# Test seams (CI only; operators never set these), each announced on stderr:
#   SET_TERRAFORM_GATE_TERRAFORM_BIN  replaces terraform for the read-only plans,
#                                     the region read and the read-back
#   SET_TERRAFORM_GATE_APPLY_CMD      replaces scripts/terraform-apply.sh
#   SET_TERRAFORM_GATE_AWS_BIN        replaces the aws CLI for the metric checks
#
# Exit: 0 at the requested state (set now or already), 1 refused or failed,
# 2 usage error.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

# The gates this script may set, and the only list of them. The login alarm is
# turned on here in pass 1 only; outside it, turning it on is refused below.
ALLOWED_GATES=(
  enable_backup_alarm
  enable_jobs_heartbeat_alarm
  enable_billing_alarm
  enable_cutover_login_alarm
  enable_container_alarms
  enable_host_key_alarm
  enable_legacy_mirror_backup
)

TARGET=""
GATE=""
STATE=""
DRY_RUN=0

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { cr_error "--target requires an argument"; exit 2; }
      ;;
    --gate)
      GATE="${2:-}"
      shift 2 || { cr_error "--gate requires a gate name"; exit 2; }
      ;;
    --state)
      STATE="${2:-}"
      shift 2 || { cr_error "--state requires 'on' or 'off'"; exit 2; }
      ;;
    --dry-run) DRY_RUN=1; shift ;;
    # Parsed after the library is sourced, which assigns ASSUME_YES
    # unconditionally, so only this flag can set it.
    --yes) ASSUME_YES="yes"; shift ;;
    --help|-h) usage; cr_finish ;;
    *) cr_error "unknown argument '$1'"; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2

if [[ -z "$GATE" ]]; then
  cr_error "--gate is required (one of: ${ALLOWED_GATES[*]})"
  exit 2
fi
case "$GATE" in
  enable_feed_queues)
    cr_error "enable_feed_queues is set by scripts/activate-notification-feeds.sh, which also deploys and checks the host; use that"
    exit 2
    ;;
  ses_enable_mail_records)
    cr_error "ses_enable_mail_records changes in one values change with the ifpa mail records on mail day. Turning it off while enable_legacy_mirror_records is on restores the mirrored legacy mail records, which is the mail cutover's revert; once enable_legacy_mirror_records is off, turning it off deletes the apex MX and TXT; the mail cutover owns it, and this script refuses it"
    exit 2
    ;;
  enable_cutover_notice)
    cr_error "enable_cutover_notice is a cutover flag that changes only together with other values: it goes on in the window state, in the second pass of the production-readiness sitting, and off in the launch apply; this script sets one gate per apply and refuses it"
    exit 2
    ;;
  enable_apex_alias_records)
    cr_error "enable_apex_alias_records is a cutover flag that goes on only in the write-freeze apply, together with the other values that apply changes; this script sets one gate per apply and refuses it"
    exit 2
    ;;
  enable_preview_record)
    cr_error "enable_preview_record is a DNS record on the cutover path: the production custom-domain apply turns it on and the launch apply turns it off with the notice; this script refuses it"
    exit 2
    ;;
  ses_enable_domain_identity|ses_enable_domain_auth)
    cr_error "${GATE}: SES domain verification publishes DNS records and starts SES's verification clock; it runs in the production-readiness sitting only once the zone delegation is proved; this script refuses it"
    exit 2
    ;;
  enable_archive)
    cr_error "enable_archive: the archive bring-up sets several values together (the flag, the signing key, the platform address), and turning it off is refused by Terraform's prevent_destroy; this script refuses it. Use scripts/production-cutover.sh --target ${TARGET} --stage archive-base"
    exit 2
    ;;
esac
GATE_ALLOWED=0
for candidate in "${ALLOWED_GATES[@]}"; do
  [[ "$GATE" == "$candidate" ]] && GATE_ALLOWED=1
done
if (( ! GATE_ALLOWED )); then
  cr_error "--gate '${GATE}' is not on the allowlist (one of: ${ALLOWED_GATES[*]})"
  exit 2
fi

if [[ "$STATE" != "on" && "$STATE" != "off" ]]; then
  cr_error "--state takes 'on' or 'off' (got '${STATE}')"
  exit 2
fi
WANTED="false"
[[ "$STATE" == "on" ]] && WANTED="true"

# The legacy-mirror backup bucket carries prevent_destroy, so an apply turning
# its gate off fails, and the values file would be left saying off while the
# bucket stands.
if [[ "$GATE" == enable_legacy_mirror_backup && "$WANTED" == "false" ]]; then
  cr_error "enable_legacy_mirror_backup cannot be turned off here: its bucket carries prevent_destroy, so the apply would fail and leave the values file saying off while the bucket stands; this script refuses it"
  exit 2
fi

TF_DIR="${REPO_ROOT}/terraform/${TARGET}"

# The gate must be declared in this target's own tree as a plain bool gate:
# type bool, default false. Staging lacks most of the cutover gates, and a value
# for an undeclared variable is only a warning to terraform, so an apply would
# succeed while changing nothing.
gate_declaration() {
  local f
  for f in "$TF_DIR"/*.tf; do
    [[ -e "$f" ]] || continue
    sed -n "/^variable \"${GATE}\" {/,/^}/p" "$f"
  done
}
DECLARATION="$(gate_declaration)"
if [[ -z "$DECLARATION" ]]; then
  cr_error "${GATE} is not declared in terraform/${TARGET}; it is not a gate on ${TARGET}"
  exit 2
fi
if ! grep -qE '^[[:space:]]*type[[:space:]]*=[[:space:]]*bool[[:space:]]*$' <<<"$DECLARATION" \
   || ! grep -qE '^[[:space:]]*default[[:space:]]*=[[:space:]]*false[[:space:]]*$' <<<"$DECLARATION"; then
  cr_error "${GATE} in terraform/${TARGET} is not declared as a bool with default false; refusing to treat it as an on/off gate"
  exit 2
fi

# The seams, announced, because a stubbed run proves nothing about the estate.
TF_BIN="${SET_TERRAFORM_GATE_TERRAFORM_BIN:-terraform}"
APPLY_CMD="${SET_TERRAFORM_GATE_APPLY_CMD:-${REPO_ROOT}/scripts/terraform-apply.sh}"
if [[ -n "${SET_TERRAFORM_GATE_TERRAFORM_BIN:-}" ]]; then
  echo "SYNTHETIC: terraform='${TF_BIN}' -- this run proves nothing about the estate." >&2
fi
if [[ -n "${SET_TERRAFORM_GATE_APPLY_CMD:-}" ]]; then
  echo "SYNTHETIC: apply='${APPLY_CMD}' -- this run proves nothing about the estate." >&2
fi
AWS_BIN="${SET_TERRAFORM_GATE_AWS_BIN:-aws}"
if [[ -n "${SET_TERRAFORM_GATE_AWS_BIN:-}" ]]; then
  echo "SYNTHETIC: aws='${AWS_BIN}' -- this run proves nothing about the estate." >&2
fi

# The values file. A missing file or a dangling link means the private
# operations checkout is not on this machine, and no environment can be
# applied without it.
TFVARS_LINK="${TF_DIR}/terraform.tfvars"
if [[ -L "$TFVARS_LINK" && ! -e "$TFVARS_LINK" ]]; then
  cr_die "terraform/${TARGET}/terraform.tfvars points at nothing: the private operations checkout is absent, and this script never improvises a values file."
fi
if [[ ! -e "$TFVARS_LINK" ]]; then
  cr_die "terraform/${TARGET}/terraform.tfvars does not exist: the private operations checkout is not linked here, and this script never improvises a values file."
fi
TFVARS_PATH="$(resolve_tfvars_target "$TFVARS_LINK" "$REPO_ROOT")" \
  || cr_die "the values file for ${TARGET} cannot be written safely; nothing was changed."

# The values file carries operator addresses, and its companion secrets file
# carries vault-governed values. Neither is ever printed, diffed in full, copied
# to a temp file or passed through cr_run: the only lines of it this script
# shows are the gate's own, and the rewritten file is held in this shell's
# memory and written back with the printf builtin, so its content never sits
# in another process's argv or in a file outside the private checkout.

# The value the file sets, from its last assignment, which is the one terraform
# would read; empty when the file sets none and the declared default applies.
# grep finding no line is an answer, so only its failure to read stops the run.
read_file_value() {
  grep -E "^[[:space:]]*${GATE}[[:space:]]*=" "$TFVARS_PATH" | tail -n 1 \
    | sed -E 's/^[^=]*=[[:space:]]*"?([a-z]+)"?.*/\1/' || [[ $? == 1 ]]
}
FILE_VALUE="$(read_file_value)"
EFFECTIVE="${FILE_VALUE:-false}"

echo "== terraform gate: ${GATE} on ${TARGET} -> ${STATE} =="
echo "values file: ${TFVARS_PATH}"
echo "  ${GATE} currently reads: ${FILE_VALUE:-<absent; default false>}"
echo ""

# The new file: the gate's first assignment rewritten in place (its alignment
# kept), any later duplicate dropped, or a line appended when the file sets
# none. Duplicates collapse because terraform reads the last assignment, and a
# stale one below the rewritten line would win over the value the diff showed.
GATE_PATTERN="^[[:space:]]*${GATE}[[:space:]]*="
NEW_CONTENT=""
NEW_LINE=""
build_new_content() {
  NEW_CONTENT="$(VAR_NAME="$GATE" VAR_VALUE="$WANTED" awk '
    BEGIN { pattern = "^[ \t]*" ENVIRON["VAR_NAME"] "[ \t]*="; seen = 0 }
    $0 ~ pattern {
      if (!seen) {
        match($0, pattern "[ \t]*")
        printf "%s%s\n", substr($0, 1, RLENGTH), ENVIRON["VAR_VALUE"]
        seen = 1
      }
      next
    }
    { print; last = $0 }
    # An added gate goes after a blank line, so terraform fmt treats it as a
    # group of its own rather than aligning it with whatever the file ends on;
    # otherwise every flip that adds a gate fails the fmt check.
    END {
      if (!seen) {
        if (NR > 0 && last != "") print ""
        printf "%s = %s\n", ENVIRON["VAR_NAME"], ENVIRON["VAR_VALUE"]
      }
    }
  ' "$TFVARS_PATH")"
  NEW_LINE="$(grep -E "$GATE_PATTERN" <<<"$NEW_CONTENT")"
  # The rewrite must have changed nothing but the gate's own lines: one gate
  # line holding the wanted value, and every other non-blank line kept. A
  # rewrite that lost lines would be written over the only copy outside the
  # vault, so it is refused rather than trusted.
  local before after
  before="$(grep -cvE "${GATE_PATTERN}|^[[:space:]]*$" "$TFVARS_PATH" || [[ $? == 1 ]])"
  after="$(grep -cvE "${GATE_PATTERN}|^[[:space:]]*$" <<<"$NEW_CONTENT" || [[ $? == 1 ]])"
  if [[ "$before" != "$after" ]] || [[ "$(grep -cE "$GATE_PATTERN" <<<"$NEW_CONTENT")" != 1 ]] \
     || ! grep -qE "${GATE_PATTERN}[[:space:]]*${WANTED}\$" <<<"$NEW_LINE"; then
    cr_die "the rewrite of ${GATE} did not come out as one changed line; the values file is unchanged."
  fi
}

# Only the gate's own lines, before and after, each through the shared tfvars
# mask: a full diff would print the neighbouring lines as context, and those
# are the operator addresses.
show_change() {
  echo "Values-file change in ${TFVARS_PATH} (the ${GATE} line only):"
  tfvars_mask <(grep -E "$GATE_PATTERN" "$TFVARS_PATH" | sed 's/^/-/' || [[ $? == 1 ]])
  tfvars_mask <(sed 's/^/+/' <<<"$NEW_LINE")
  echo ""
}

FILE_AT_STATE=0
[[ "$FILE_VALUE" == "$WANTED" ]] && FILE_AT_STATE=1
# A file that sets nothing already holds "off" through the declared default,
# so turning a gate off never has to add a line.
[[ -z "$FILE_VALUE" && "$WANTED" == "false" ]] && FILE_AT_STATE=1

if (( DRY_RUN )); then
  if (( FILE_AT_STATE )); then
    echo "The values file already holds ${GATE} = ${EFFECTIVE}; it would not be changed."
    echo ""
    [[ "$WANTED" == true && "$GATE" != enable_cutover_login_alarm ]] && echo "Would check, first, that what the alarm reads is present in AWS."
    [[ "$GATE" == enable_cutover_login_alarm && "$WANTED" == true ]] && echo "Would check, first, that this is pass 1 (the notice and the alias records both read false)."
    [[ "$GATE" == enable_cutover_login_alarm && "$WANTED" == false ]] && echo "Would check, first, that the freeze window is not on (the notice and the alias records both on)."
    echo "Would run: terraform -chdir=terraform/${TARGET} plan -detailed-exitcode (read-only),"
    echo "  then, only if changes are pending and ${GATE} is the only one,"
    echo "  apply through scripts/terraform-apply.sh --target ${TARGET}."
  else
    build_new_content
    show_change
    echo "Would run, in order:"
    [[ "$WANTED" == true && "$GATE" != enable_cutover_login_alarm ]] && echo "  0. check that what the alarm reads is present in AWS"
    [[ "$GATE" == enable_cutover_login_alarm && "$WANTED" == true ]] && echo "  0. check that this is pass 1 (the notice and the alias records both read false)"
    [[ "$GATE" == enable_cutover_login_alarm && "$WANTED" == false ]] && echo "  0. check that the freeze window is not on (the notice and the alias records both on)"
    echo "  1. terraform plan at the current values (read-only; anything pending stops here)"
    echo "     and terraform plan -var ${GATE}=${WANTED} (read-only; a failed plan stops here)"
    echo "  2. write the change above to ${TFVARS_PATH} (confirmed)"
    echo "  3. bash scripts/terraform-apply.sh --target ${TARGET}"
    echo "     (saved plan shown, typed APPLY on production, plan shredded)"
  fi
  echo "  then read var.${GATE} back from terraform console and require ${WANTED}."
  if [[ "$GATE" == enable_host_key_alarm && "$TARGET" == production && "$WANTED" == true ]]; then
    echo "Before the metric check, it would bring staging_web_static_ip to the staging tree's"
    echo "  lightsail_static_ip output, writing that one line (confirmed) if it differs."
  fi
  cr_unproved "anything: a dry run changes and checks nothing"
  cr_finish
fi

# Every terraform call below reaches the state backend, and every aws call the
# account, so the identity is settled and proved once, here. Only a run with
# both stubbed reaches nothing.
if [[ -z "${SET_TERRAFORM_GATE_TERRAFORM_BIN:-}" || -z "${SET_TERRAFORM_GATE_AWS_BIN:-}" ]]; then
  # shellcheck source=lib/aws-profile.sh
  source "${REPO_ROOT}/scripts/lib/aws-profile.sh"
  aws_profile_ensure || cr_die "no AWS identity to plan or apply ${TARGET} with; nothing was changed."
fi

# Terraform's diagnostic titles ("Error: ..."), joined on one line, or a note
# that it printed none. Never the lines beneath a title.
error_titles() {
  local titles
  titles="$(grep -E '^Error: ' | paste -sd ';' - || [[ $? == 1 ]])"
  printf '%s' "${titles:-no error title printed}"
}

# The value line of a terraform console read. Terraform locks the state for a
# console read and prints its own lock notices on stdout around the value, so
# the value is the last line that is not one of those notices.
console_value() {
  grep -vE '^(Acquiring|Releasing) state lock' | sed '/^[[:space:]]*$/d' | tail -n 1
}

# The effective value terraform reads for the gate, compared with the one
# wanted. This is the outcome check: the apply wrapper exiting 0 says it ran,
# this says what the tree now holds.
prove_gate() {
  local out rc=0
  out="$(printf 'var.%s\n' "$GATE" | "$TF_BIN" -chdir="$TF_DIR" console 2>&1)" || rc=$?
  if [[ "$rc" != 0 ]]; then
    # Only terraform's own error titles are reported. The lines under a title
    # quote the source they complain about, and that source can be the values
    # file or the secrets file.
    cr_error "the read-back of var.${GATE} failed (exit ${rc}): $(error_titles <<<"$out")"
    cr_unproved "${GATE} = ${WANTED} on ${TARGET}: the read-back did not run"
    return 1
  fi
  out="$(console_value <<<"$out" | tr -d '[:space:]')"
  # Anything other than a bool is not repeated, for the same reason.
  [[ "$out" == true || "$out" == false ]] || out="<not a bool>"
  echo "read-back: var.${GATE} = ${out}"
  if [[ "$out" != "$WANTED" ]]; then
    cr_error "the read-back of var.${GATE} on ${TARGET} is '${out}', not ${WANTED}"
    cr_unproved "${GATE} = ${WANTED} on ${TARGET}"
    return 1
  fi
  return 0
}

# A read-only plan of the tree, extra arguments appended, with its exit status
# in PLAN_RC and its output in PLAN_OUT. Held in memory rather than in a log
# file and never printed whole: a plan's diagnostics quote the values and
# secrets files they complain about. Its Error and Warning titles are listed in
# the closing report; the lines under them are not.
plan_tree() {
  PLAN_RC=0
  PLAN_OUT="$("$TF_BIN" -chdir="$TF_DIR" plan -input=false -no-color -detailed-exitcode "$@" 2>&1)" \
    || PLAN_RC=$?
  local line
  while IFS= read -r line; do
    case "$line" in
      "Error: "*) cr_error "terraform plan: ${line}" ;;
      "Warning: "*) cr_warn "terraform plan: ${line}" ;;
    esac
  done <<<"$PLAN_OUT"
}

# The apply that follows applies the whole tree, so anything else pending would
# ride along under this gate's name. Refused, with the values file as found.
refuse_other_pending() {
  grep -E '^Plan: ' <<<"$PLAN_OUT" || [[ $? == 1 ]]
  cr_error "other changes are pending in the ${TARGET} tree besides ${GATE}; apply them first with scripts/terraform-apply.sh --target ${TARGET}, then re-run. This script applies one gate per apply; the values file is unchanged and nothing was applied"
  cr_unproved "${GATE} = ${WANTED} on ${TARGET}: refused with other changes pending"
  cr_finish
}

# The effective value terraform reads for a variable, in TF_BOOL. A failed read
# carries terraform's error titles only, and anything but a bool is a failure.
TF_BOOL=""
read_tf_bool() {
  local name="$1" out rc=0
  out="$(printf 'var.%s\n' "$name" | "$TF_BIN" -chdir="$TF_DIR" console 2>&1)" || rc=$?
  if [[ "$rc" != 0 ]]; then
    cr_error "the read of var.${name} failed (exit ${rc}): $(error_titles <<<"$out")"
    return 1
  fi
  TF_BOOL="$(console_value <<<"$out" | tr -d '[:space:]')"
  if [[ "$TF_BOOL" != true && "$TF_BOOL" != false ]]; then
    cr_error "var.${name} on ${TARGET} did not read back as a bool"
    return 1
  fi
}

# This script turns the zero-logins alarm on only in pass 1 of the
# production-readiness sitting, while the notice and the alias records both
# read exactly false: runbook step P1-11 arms it there, lets it fire on the
# idle production, and turns it off before pass 2. From pass 2 on, the freeze
# stage of the cutover script arms it with the alias records. Fail closed:
# anything but two clean false reads is refused.
refuse_login_alarm_on() {
  cr_error "refusing to turn enable_cutover_login_alarm on on ${TARGET}: $1. This script arms it only in pass 1 of the production-readiness sitting, for runbook step P1-11's fire test, while enable_cutover_notice and enable_apex_alias_records both read false; from pass 2 on, the freeze stage of the cutover script turns it on."
  return 1
}
pass_one_check() {
  local notice alias
  read_tf_bool enable_cutover_notice || refuse_login_alarm_on "var.enable_cutover_notice could not be read as a bool" || return 1
  notice="$TF_BOOL"
  read_tf_bool enable_apex_alias_records || refuse_login_alarm_on "var.enable_apex_alias_records could not be read as a bool" || return 1
  alias="$TF_BOOL"
  if [[ "$notice" != "false" || "$alias" != "false" ]]; then
    refuse_login_alarm_on "enable_cutover_notice reads ${notice} and enable_apex_alias_records reads ${alias}, so this is not pass 1"
    return 1
  fi
  echo "pass 1: enable_cutover_notice and enable_apex_alias_records both read false."
}

# The freeze apply arms the zero-logins alarm with the alias records while the
# notice is up, and the launch apply that lowers the notice is what creates it.
# Turned off in between, the 48-hour watch after launch runs without its main
# sign-in observable. Fail closed: a flag that cannot be read counts as on.
freeze_window_check() {
  [[ "$GATE" == enable_cutover_login_alarm ]] || return 0
  if [[ "$WANTED" != "false" ]]; then
    pass_one_check
    return
  fi
  local notice alias
  read_tf_bool enable_cutover_notice || return 1
  notice="$TF_BOOL"
  read_tf_bool enable_apex_alias_records || return 1
  alias="$TF_BOOL"
  if [[ "$notice" != "false" && "$alias" != "false" ]]; then
    cr_error "refusing to turn enable_cutover_login_alarm off on ${TARGET}: enable_cutover_notice and enable_apex_alias_records are both on, which is the freeze window. The freeze apply arms the alarm, and it stays on through launch until the 48-hour close after launch."
    return 1
  fi
}

# The count an aws call answers through --query 'length(...)', in AWS_COUNT. A
# failed call is an error carrying AWS's own last line, never "absent", and an
# answer that is not a count is an error too.
AWS_COUNT=""
aws_count() {
  local label="$1" out rc=0
  shift
  out="$("$AWS_BIN" "$@" --output text 2>&1)" || rc=$?
  if [[ "$rc" != 0 ]]; then
    cr_error "${label} failed (exit ${rc}): $(tail -n 1 <<<"$out")"
    return 1
  fi
  AWS_COUNT="$(tail -n 1 <<<"$out" | tr -d '[:space:]')"
  if [[ ! "$AWS_COUNT" =~ ^[0-9]+$ ]]; then
    cr_error "${label} answered something other than a count"
    return 1
  fi
}

# The tree's primary region, where its alarms and the app log group live, read
# from terraform rather than assumed.
REGION=""
read_region() {
  local out rc=0
  out="$(printf 'var.aws_region\n' | "$TF_BIN" -chdir="$TF_DIR" console 2>&1)" || rc=$?
  if [[ "$rc" != 0 ]]; then
    cr_error "the read of var.aws_region failed (exit ${rc}): $(error_titles <<<"$out")"
    return 1
  fi
  REGION="$(console_value <<<"$out" | tr -d '[:space:]"')"
  if [[ ! "$REGION" =~ ^[a-z]{2}(-[a-z]+)+-[0-9]+$ ]]; then
    cr_error "var.aws_region in terraform/${TARGET} did not read back as a region"
    return 1
  fi
}

# The host-key alarms fire on any call signed by a host's key from an address
# other than the one the tree expects for that host. Arming them is safe only
# when the trail's last week agrees: every call each key made came from its
# expected address. The users and addresses are read from the tree itself
# (local.host_keys), so the check and the filter cannot disagree about either.
host_key_precheck() {
  local out rc=0 keys start key user ip events seen
  out="$(printf 'jsonencode(local.host_keys)\n' | "$TF_BIN" -chdir="$TF_DIR" console 2>&1)" || rc=$?
  if [[ "$rc" != 0 ]]; then
    cr_error "the read of local.host_keys failed (exit ${rc}): $(error_titles <<<"$out")"
    return 1
  fi
  # console prints the encoded value as a quoted string; decode it once.
  keys="$(console_value <<<"$out" | jq -r 'fromjson | to_entries[] | "\(.key) \(.value.user) \(.value.ip)"' 2>&1)" || {
    cr_error "local.host_keys in terraform/${TARGET} did not read back as the expected map: $(tail -n 1 <<<"$keys")"
    return 1
  }
  start="$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)"
  while read -r key user ip; do
    [[ -n "$key" ]] || continue
    if [[ -z "$ip" ]]; then
      cr_error "refusing to arm ${GATE}: no address is set for ${user}"
      return 1
    fi
    rc=0
    events="$("$AWS_BIN" cloudtrail lookup-events --region us-east-1 \
      --lookup-attributes "AttributeKey=Username,AttributeValue=${user}" \
      --start-time "$start" --query 'Events[].CloudTrailEvent' --output json 2>&1)" || rc=$?
    if [[ "$rc" != 0 ]]; then
      cr_error "reading the trail's last week for ${user} failed (exit ${rc}): $(tail -n 1 <<<"$events")"
      return 1
    fi
    # Addresses of the calls the key signed itself; calls a service made on its
    # behalf carry the service and are not what the filter watches.
    seen="$(jq -r '.[] | fromjson | select(.userIdentity.invokedBy == null) | .sourceIPAddress' <<<"$events" 2>&1 | sort -u)" || {
      cr_error "the trail's events for ${user} did not parse: $(tail -n 1 <<<"$seen")"
      return 1
    }
    if [[ -z "$seen" ]]; then
      echo "host-key check: ${user} made no call of its own in the last week; nothing contradicts ${ip}."
      continue
    fi
    if [[ "$seen" != "$ip" ]]; then
      cr_error "refusing to arm ${GATE}: in the last week ${user} signed calls from $(tr '\n' ' ' <<<"$seen")but the alarm expects ${ip} only; arming it would hold the alarm in ALARM. Find each address in the trail first."
      return 1
    fi
    echo "host-key check: every call ${user} signed in the last week came from ${ip}."
  done <<<"$keys"
}

# Before an alarm is armed, what it reads must be there: the backup and
# missed-run alarms treat missing data as breaching, so arming them over
# nothing pages at once, and the billing alarm over no metric watches nothing.
# Turning an alarm off checks nothing, so a paging alarm can always be stood
# down.
metric_precheck() {
  [[ "$WANTED" != "false" ]] || return 0
  local present_msg
  case "$GATE" in
    enable_backup_alarm)
      read_region || return 1
      aws_count "listing BackupAgeMinutes in Footbag/${TARGET} (${REGION})" \
        cloudwatch list-metrics --region "$REGION" --namespace "Footbag/${TARGET}" \
        --metric-name BackupAgeMinutes --recently-active PT3H --query 'length(Metrics)' || return 1
      present_msg="BackupAgeMinutes has had no data in Footbag/${TARGET} (${REGION}) in the last three hours: the staleness alarm treats missing data as breaching and would page at once. Install the backup timer (scripts/install-backup-timer.sh) and let it run first."
      ;;
    enable_jobs_heartbeat_alarm)
      read_region || return 1
      # The alarm's JobsOverdue metric comes from a log filter this same gate
      # creates, so before the gate is on there is no metric to list; what
      # proves the alarm will have data is the heartbeat line itself, which the
      # worker writes every five minutes. Fifteen minutes is three ticks.
      local since_ms=$(( ($(date +%s) - 900) * 1000 ))
      aws_count "searching /footbag/${TARGET}/app (${REGION}) for jobs.heartbeat" \
        logs filter-log-events --region "$REGION" --log-group-name "/footbag/${TARGET}/app" \
        --filter-pattern '{ $.msg = "jobs.heartbeat" }' --start-time "$since_ms" \
        --max-items 1 --query 'length(events)' || return 1
      present_msg="no jobs.heartbeat line in /footbag/${TARGET}/app (${REGION}) in the last fifteen minutes: the missed-run alarm treats missing data as breaching and would page at once. Deploy the worker and wait for its heartbeat first."
      ;;
    enable_billing_alarm)
      # AWS publishes the billing metric in us-east-1 only, whatever the tree's
      # region.
      aws_count "listing AWS/Billing EstimatedCharges (us-east-1)" \
        cloudwatch list-metrics --region us-east-1 --namespace AWS/Billing \
        --metric-name EstimatedCharges --query 'length(Metrics)' || return 1
      present_msg="AWS/Billing EstimatedCharges is not listed in us-east-1: turn on the 'Receive CloudWatch Billing Alerts' preference in the Billing console, wait for the metric to appear, then re-run."
      ;;
    enable_cutover_login_alarm)
      # Its LoginSuccessCount comes from a log filter this same gate creates,
      # and it is armed only in pass 1, where its firing on the idle production
      # is the fire test, so there is nothing to look for first.
      echo "metric check: none for ${GATE}; it is armed in pass 1 to fire on missing data."
      return 0
      ;;
    enable_legacy_mirror_backup)
      # A backup bucket, not an alarm: it reads no metric, so there is
      # nothing to look for before it is created.
      echo "metric check: none for ${GATE}"
      return 0
      ;;
    enable_container_alarms)
      read_region || return 1
      # The container monitor's heartbeat, which the heartbeat alarm treats as
      # breaching when missing. Staging's agent publishes to the bare CWAgent
      # namespace; production's to CWAgent/production.
      local ns="CWAgent"
      [[ "$TARGET" == "production" ]] && ns="CWAgent/production"
      aws_count "listing container_monitor_heartbeat in ${ns} (${REGION})" \
        cloudwatch list-metrics --region "$REGION" --namespace "$ns" \
        --metric-name container_monitor_heartbeat --recently-active PT3H --query 'length(Metrics)' || return 1
      present_msg="container_monitor_heartbeat has had no data in ${ns} (${REGION}) in the last three hours: the heartbeat alarm treats missing data as breaching and would page at once. Deploy a release carrying the container monitor and let it run first."
      ;;
    enable_host_key_alarm)
      host_key_precheck || return 1
      return 0
      ;;
    *)
      cr_error "no metric check is defined for arming ${GATE}; refusing rather than arming unchecked"
      return 1
      ;;
  esac
  if (( AWS_COUNT < 1 )); then
    cr_error "refusing to arm ${GATE} on ${TARGET}: ${present_msg}"
    return 1
  fi
  echo "metric check: what ${GATE}'s alarm reads is present."
}

if ! freeze_window_check; then
  cr_unproved "${GATE} = ${WANTED} on ${TARGET}: refused before any plan or write; the values file is unchanged"
  cr_finish
fi

# The production tree cannot read the staging tree's state, so the staging
# host's address its host-key filters expect is a value in the production values
# file, and a value typed by hand goes stale when staging's address changes,
# which holds the alarm in ALARM. Arming the host-key alarm therefore first
# brings that value to the staging tree's own output: read, compared, and when
# empty or different written as one line, shown and confirmed, through the link.
# Nothing else may be pending when it is written, so the apply below carries the
# address and the gate and nothing else. While the gate is off the address feeds
# no resource, so a run refused after the write leaves a correct value that
# changes nothing.
ADDRESS_WRITTEN=0
STAGING_ADDRESS_VAR="staging_web_static_ip"
sync_staging_address() {
  [[ "$GATE" == enable_host_key_alarm && "$TARGET" == production && "$WANTED" == true ]] || return 0
  local out rc=0 want have pattern new_content new_line before after
  out="$("$TF_BIN" -chdir="${REPO_ROOT}/terraform/staging" output -raw lightsail_static_ip 2>&1)" || rc=$?
  if [[ "$rc" != 0 ]]; then
    cr_error "the read of the staging tree's lightsail_static_ip output failed (exit ${rc}): $(error_titles <<<"$out")"
    return 1
  fi
  want="$(console_value <<<"$out" | tr -d '[:space:]"')"
  if [[ ! "$want" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    cr_error "the staging tree's lightsail_static_ip output did not read back as an IPv4 address"
    return 1
  fi
  pattern="^[[:space:]]*${STAGING_ADDRESS_VAR}[[:space:]]*="
  have="$(grep -E "$pattern" "$TFVARS_PATH" | tail -n 1 \
    | sed -E 's/^[^=]*=[[:space:]]*"?([0-9.]*)"?.*/\1/' || [[ $? == 1 ]])"
  if [[ "$have" == "$want" ]]; then
    echo "staging address: ${STAGING_ADDRESS_VAR} already matches the staging tree's output."
    return 0
  fi
  echo "staging address: ${STAGING_ADDRESS_VAR} reads '${have:-<absent>}', the staging tree's output is ${want}."
  plan_tree -lock=false
  case "$PLAN_RC" in
    0) ;;
    2) refuse_other_pending ;;
    *)
      cr_error "the read-only plan of ${TARGET} at its current values failed (exit ${PLAN_RC}); the values file is unchanged and nothing was applied"
      return 1
      ;;
  esac
  new_content="$(VAR_NAME="$STAGING_ADDRESS_VAR" VAR_VALUE="\"${want}\"" awk '
    BEGIN { pattern = "^[ \t]*" ENVIRON["VAR_NAME"] "[ \t]*="; seen = 0 }
    $0 ~ pattern {
      if (!seen) {
        match($0, pattern "[ \t]*")
        printf "%s%s\n", substr($0, 1, RLENGTH), ENVIRON["VAR_VALUE"]
        seen = 1
      }
      next
    }
    { print; last = $0 }
    END {
      if (!seen) {
        if (NR > 0 && last != "") print ""
        printf "%s = %s\n", ENVIRON["VAR_NAME"], ENVIRON["VAR_VALUE"]
      }
    }
  ' "$TFVARS_PATH")"
  new_line="$(grep -E "$pattern" <<<"$new_content")"
  before="$(grep -cvE "${pattern}|^[[:space:]]*$" "$TFVARS_PATH" || [[ $? == 1 ]])"
  after="$(grep -cvE "${pattern}|^[[:space:]]*$" <<<"$new_content" || [[ $? == 1 ]])"
  if [[ "$before" != "$after" || "$new_line" != *"\"${want}\"" ]] || [[ "$(grep -cE "$pattern" <<<"$new_content")" != 1 ]]; then
    cr_error "the rewrite of ${STAGING_ADDRESS_VAR} did not come out as one changed line; the values file is unchanged"
    return 1
  fi
  echo "Values-file change in ${TFVARS_PATH} (the ${STAGING_ADDRESS_VAR} line only):"
  tfvars_mask <(grep -E "$pattern" "$TFVARS_PATH" | sed 's/^/-/' || [[ $? == 1 ]])
  tfvars_mask <(sed 's/^/+/' <<<"$new_line")
  echo ""
  if ! confirm_from_tty "Write this to ${TFVARS_PATH}? (yes/no): " "yes"; then
    cr_error "not confirmed: the values file is unchanged and nothing was applied"
    return 1
  fi
  printf '%s\n' "$new_content" > "$TFVARS_PATH"
  echo "  ${STAGING_ADDRESS_VAR} = \"${want}\" written."
  echo ""
  ADDRESS_WRITTEN=1
}

if ! sync_staging_address; then
  cr_unproved "${GATE} = ${WANTED} on ${TARGET}: refused before the gate was written"
  cr_finish
fi

if ! metric_precheck; then
  if (( ADDRESS_WRITTEN )); then
    cr_unproved "${GATE} = ${WANTED} on ${TARGET}: refused before the gate was written; the values file holds the corrected ${STAGING_ADDRESS_VAR}, which feeds nothing while the gate is off"
  else
    cr_unproved "${GATE} = ${WANTED} on ${TARGET}: refused before any plan or write; the values file is unchanged"
  fi
  cr_finish
fi

# What the closing report cannot claim even when the read-back holds.
not_proved_by_readback() {
  if [[ "$GATE" == enable_legacy_mirror_backup ]]; then
    cr_unproved "that the backup bucket exists in AWS: the read-back proves var.${GATE} = true and the apply ran, not the resource"
  elif [[ "$WANTED" == "true" ]]; then
    cr_unproved "that the alarm pages: the read-back proves var.${GATE} = true and the apply ran, not that the alarm fires"
  else
    cr_unproved "that the alarm is gone from CloudWatch: the read-back proves var.${GATE} = false, not the resource"
  fi
}

if (( FILE_AT_STATE )); then
  echo "The values file already holds ${GATE} = ${EFFECTIVE}; leaving it alone."
  echo "Planning ${TARGET} read-only to see whether the state holds it too."
  echo ""
  plan_tree -lock=false
  case "$PLAN_RC" in
    0)
      echo "No changes pending: the state already matches."
      if prove_gate; then
        cr_proved "${GATE} = ${WANTED} on ${TARGET}: already set, nothing pending, read back from terraform; nothing applied"
        not_proved_by_readback
      fi
      cr_finish
      ;;
    2)
      if (( ADDRESS_WRITTEN )); then
        # The plan before the address was written was clean, so the address
        # this run wrote is the one change pending.
        echo "Only ${STAGING_ADDRESS_VAR} is pending, written above; applying it."
        echo ""
      else
      # Here the current-values plan and the plan with the gate at the wanted
      # value are one plan, so it cannot tell a stopped run's unfinished gate
      # from some other change. A plan with the gate at its other value can: it
      # is clean only when the gate is the one thing the state does not hold.
      grep -E '^Plan: ' <<<"$PLAN_OUT" || [[ $? == 1 ]]
      OTHER_VALUE="true"
      [[ "$WANTED" == "true" ]] && OTHER_VALUE="false"
      echo "Changes are pending; planning with ${GATE} = ${OTHER_VALUE} to see whether the gate is the only one."
      plan_tree -lock=false -var "${GATE}=${OTHER_VALUE}"
      case "$PLAN_RC" in
        0)
          echo "Only ${GATE} is pending (a run stopped between the write and the apply); applying it."
          echo ""
          ;;
        2) refuse_other_pending ;;
        *)
          cr_error "the read-only plan of ${TARGET} with ${GATE} = ${OTHER_VALUE} failed (exit ${PLAN_RC}); nothing was applied"
          cr_unproved "${GATE} = ${WANTED} on ${TARGET}: terraform could not tell what is pending"
          cr_finish
          ;;
      esac
      fi
      ;;
    *)
      cr_error "the read-only plan of ${TARGET} failed (exit ${PLAN_RC}); nothing was applied"
      cr_unproved "${GATE} = ${WANTED} on ${TARGET}: the state could not be read"
      cr_finish
      ;;
  esac
else
  build_new_content
  show_change
  # Planned at the current values first, with nothing overridden: a clean plan
  # means the apply below carries this gate's change and nothing else.
  echo "Planning ${TARGET} read-only at its current values, so the apply carries only ${GATE}."
  plan_tree -lock=false
  case "$PLAN_RC" in
    0) echo "Nothing else is pending." ;;
    2) refuse_other_pending ;;
    *)
      cr_error "the read-only plan of ${TARGET} at its current values failed (exit ${PLAN_RC}); the values file is unchanged and nothing was applied"
      cr_unproved "${GATE} = ${WANTED} on ${TARGET}: terraform could not plan the current values"
      cr_finish
      ;;
  esac
  # Then planned with the new value before the file is touched, so anything
  # Terraform rejects at plan time (a validation, a precondition, a missing
  # companion value) stops the run with the file as it was. -lock=false: the
  # plan is read-only and must not hold the state lock the apply will need.
  echo "Planning ${TARGET} read-only with ${GATE} = ${WANTED} before writing anything."
  plan_tree -lock=false -var "${GATE}=${WANTED}"
  case "$PLAN_RC" in
    0|2) echo "The plan succeeded." ; echo "" ;;
    *)
      cr_error "the read-only plan of ${TARGET} with ${GATE} = ${WANTED} failed (exit ${PLAN_RC}); the values file is unchanged and nothing was applied"
      cr_unproved "${GATE} = ${WANTED} on ${TARGET}: terraform could not plan it"
      cr_finish
      ;;
  esac
  if ! confirm_from_tty "Write this to ${TFVARS_PATH}? (yes/no): " "yes"; then
    cr_die "Aborted: the values file is unchanged and nothing was applied."
  fi
  # Through the link, never mv: the values file is a symlink into the private
  # operations checkout, and moving over it would leave a real file here.
  printf '%s\n' "$NEW_CONTENT" > "$TFVARS_PATH"
  echo "  ${GATE} = ${WANTED} written."
  echo ""
fi

echo "== applying ${TARGET} =="
# Run directly rather than through cr_run: on production it asks for a typed
# APPLY on the terminal. Its own problems reach this report through the closing
# report's nested mode.
if ! bash "$APPLY_CMD" --target "$TARGET"; then
  cr_error "the values file now holds ${GATE} = ${WANTED} but the ${TARGET} apply did not land; re-run this command to apply it"
  cr_unproved "${GATE} = ${WANTED} on ${TARGET}: the apply failed"
  cr_finish
fi
echo ""

if prove_gate; then
  cr_proved "${GATE} = ${WANTED} on ${TARGET}: applied and read back from terraform"
  not_proved_by_readback
fi
cr_finish

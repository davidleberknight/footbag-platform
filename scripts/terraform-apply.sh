#!/usr/bin/env bash
# terraform-apply.sh
#
# Applies one environment's Terraform tree, for every change that needs nothing
# but a plan read and a confirmation.
#
# WHY THIS EXISTS.
#
# The saved-plan convention is four commands: make a mode-600 temporary file,
# plan into it, apply that exact file, shred it. Typed by hand the last one is
# the step a failure skips, because a failed plan, a failed apply or a Ctrl-C
# never reaches it. What survives in /tmp is a zip holding a full copy of state,
# so every resolved value is in the clear, including the vault-governed ones the
# tfvars split exists to keep out of the repository. Here the shred is on a trap
# for EXIT, INT and TERM, so it runs on all of those paths.
#
# Applying the saved plan rather than replanning at apply time is the other half:
# it makes the reviewed diff the applied diff, and closes the window between
# deciding and acting.
#
# WHAT THIS DOES NOT OWN.
#
# Changes with a real precondition have their own script, because a gate that
# belongs to one change cannot live in a wrapper shared by all of them:
# scripts/apply-snapshot-retention.sh refuses to apply until the promoted backup
# tiers hold history, scripts/arming.sh rewrites an arming flag and sequences the
# deploy behind it, and scripts/activate-notification-feeds.sh brings queues up
# in the one order that is safe. Reach for this script for the rest.
#
# Some runbook steps also carry work around the apply that stays in the runbook,
# because absorbing it here would mean claiming to handle it: the two-pass
# CloudFront bootstrap, importing a console-created resource before the first
# apply, and refreshing providers when one is added. Use --init for that last
# one; do the other two as the runbook says, then apply through here.
#
# Steps (referenced by --from-step, so a failure part-way is resumable):
#   1  terraform init, only when asked for
#   2  plan to a shredded file, confirm, apply that exact plan
#
# Usage:
#   scripts/terraform-apply.sh --target staging --dry-run
#   scripts/terraform-apply.sh --target staging
#   scripts/terraform-apply.sh --target production
#   scripts/terraform-apply.sh --target staging --init
#   scripts/terraform-apply.sh --target staging --init-upgrade
#   ... --yes   accept the confirmation, where no terminal is attached.
#               Staging and shared only: a production apply is refused with it,
#               because a confirmation a flag can supply in advance is not one.
#               --dry-run --yes still works against production, since a dry run
#               applies nothing.
#
# --dry-run runs nothing at all: it states what the real run would do.
#
# Test seam (CI only; operators never set this): TERRAFORM_APPLY_BIN points the
# terraform command at a stub, announced loudly when set, because a run that
# silently used a stub would prove nothing about the estate.
set -euo pipefail

TARGET=""
DRY_RUN=0
DO_INIT=0
INIT_UPGRADE=0
FROM_STEP=1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# confirm_from_tty reads the answer from /dev/tty rather than stdin, refuses when
# no terminal exists and --yes was not given, and honours --yes. Shared so every
# operator script prompts the same way.
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

TF_BIN="${TERRAFORM_APPLY_BIN:-terraform}"

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
    --from-step)
      FROM_STEP="${2:-}"
      shift 2 || { echo "ERROR: --from-step requires a step number" >&2; exit 2; }
      ;;
    --init)
      DO_INIT=1
      shift
      ;;
    --init-upgrade)
      DO_INIT=1
      INIT_UPGRADE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
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

# No default target. Which environment an apply lands on is exactly the decision
# this script must not make for the operator.
case "$TARGET" in
  staging|production|shared) ;;
  '') echo "ERROR: --target is required ('staging', 'production' or 'shared')" >&2; exit 2 ;;
  *) echo "ERROR: --target must be 'staging', 'production' or 'shared' (got '$TARGET')" >&2; exit 2 ;;
esac

if [[ ! "$FROM_STEP" =~ ^[1-2]$ ]]; then
  echo "ERROR: --from-step takes a step number from 1 to 2 (got '$FROM_STEP')." >&2
  exit 2
fi

TF_DIR="$REPO_ROOT/terraform/$TARGET"
if [[ ! -d "$TF_DIR" ]]; then
  echo "ERROR: no Terraform tree at terraform/$TARGET." >&2
  exit 1
fi

if [[ -n "${TERRAFORM_APPLY_BIN:-}" ]]; then
  echo "SYNTHETIC: terraform='$TF_BIN' -- this run proves nothing about the estate." >&2
fi

echo "== terraform apply: $TARGET =="
echo ""

if (( DRY_RUN )); then
  echo "Would run, in order:"
  if (( DO_INIT )); then
    echo "  1. terraform -chdir=terraform/$TARGET init${INIT_UPGRADE:+ -upgrade}"
  else
    echo "  1. (skipped: pass --init when a provider or backend has changed)"
  fi
  echo "  2. terraform -chdir=terraform/$TARGET plan into a mode-600 file shredded on"
  echo "     every exit path, show it, take a typed APPLY, then apply that exact plan."
  echo ""
  echo "The plan covers the whole environment, not only the change you have in mind:"
  echo "anything else pending in the tree is applied with it. That is the reason the"
  echo "plan is shown and confirmed rather than applied straight through."
  exit 0
fi

# --yes does not carry a production apply.
#
# The confirmation below is what stands between a typed decision and replacing
# what the public is served, and a flag that supplies it in advance is not a
# confirmation at all: it makes an unattended production apply possible from a
# scheduled job, a wrapper, or an agent session, none of which can read the plan
# it is accepting. The plan is the whole environment rather than the change the
# operator came for, so what gets waved through is not knowable in advance.
#
# Refused here rather than at the prompt, so the run stops before a plan file
# holding a full copy of state in the clear has been written at all. A dry run is
# deliberately above this line: it applies nothing, so the flag costs nothing
# there. Staging keeps --yes, which is the same split the deploy wrapper makes.
if [[ "$TARGET" == "production" && "$ASSUME_YES" == "yes" ]]; then
  echo "ERROR: --yes does not carry a production apply." >&2
  echo "       This plan reaches what the public is served, so the confirmation is" >&2
  echo "       typed every time and is never supplied in advance by a flag." >&2
  echo "       Re-run without --yes, read the plan, and answer it." >&2
  echo "       Use --dry-run --yes to see what the run would do, changing nothing." >&2
  exit 2
fi

# ── Step 1: init, only when asked ────────────────────────────────────────────
if (( FROM_STEP <= 1 )) && (( DO_INIT )); then
  echo "-- step 1: terraform init --"
  echo ""
  INIT_ARGS=(init)
  (( INIT_UPGRADE )) && INIT_ARGS+=(-upgrade)
  if ! "$TF_BIN" -chdir="$TF_DIR" "${INIT_ARGS[@]}"; then
    echo "ERROR: terraform init failed. Nothing was applied." >&2
    exit 1
  fi
  echo ""
fi

# ── Step 2: plan, confirm, apply that plan ───────────────────────────────────
echo "-- step 2: terraform apply --"
echo ""
# The plan file is created mode 600 under a literal /tmp path and shredded by a
# trap on EXIT, INT and TERM, so the shred runs on a failed plan, a failed apply
# and an interrupt alike. The directory is literal rather than TMPDIR-relative so
# the caller's environment cannot redirect the archive into a checkout, where a
# single ignore rule would be all that stood between it and a stray commit.
TF_PLAN="$(mktemp "/tmp/footbag-${TARGET}-apply.XXXXXX")"
chmod 600 "$TF_PLAN"
trap 'if [ -n "${TF_PLAN:-}" ] && [ -e "${TF_PLAN}" ]; then shred -u "${TF_PLAN}"; fi; rm -f "${TF_PLAN:-}"' EXIT INT TERM

if ! "$TF_BIN" -chdir="$TF_DIR" plan -out="$TF_PLAN"; then
  echo "ERROR: terraform plan failed. Nothing was applied." >&2
  echo "       Resume with --from-step 2 once fixed." >&2
  exit 1
fi
echo ""
echo "Read the plan above before answering. It covers this whole environment, not only"
echo "the change you came for: anything else pending in the tree is applied with it."
echo "A destroy or a replacement you did not expect is a reason to stop, not to confirm."
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
echo "Applied. Confirm the resources you expected are present before relying on them:"
echo "  terraform -chdir=terraform/$TARGET output"

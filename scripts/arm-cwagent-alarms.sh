#!/usr/bin/env bash
# arm-cwagent-alarms.sh
#
# Arms the host CPU / memory / disk alarms for one environment: the precondition,
# the tfvars flag and the apply, in the one order that is safe.
#
# The flag alone is not the change. Arming is a precondition that must hold, a
# values-file edit, and an apply, and the hazard is that the first is skipped.
# An alarm bound to a metric-and-dimension combination the host does not publish
# cannot leave INSUFFICIENT_DATA, and before the missing-data treatment was
# corrected it read OK forever and reported health it had never measured. That is
# why the check runs here rather than sitting in a runbook next to the flag:
# `scripts/verify-cwagent-metrics.sh` asserts recent datapoints on each of the
# three exact combinations the alarms bind to, and this script refuses to arm
# anything if it fails.
#
# `arming.sh` deliberately does not cover this switch. Its four switches change
# the adapter the host runs and so need a deploy as their third step, and they
# carry provider-side preconditions only an operator can attest to. This one
# needs no deploy and its precondition is machine-checkable, which is the whole
# reason it can be a script rather than a checklist.
#
# The values file is put back ONLY where this run is the whole story. If the run
# stops after the flag is written but before terraform is invoked, nothing
# outside has seen the change and reverting is right. Once terraform has been
# invoked the revert is withdrawn, because a failed apply is not an apply that
# did nothing: it may have created some alarms before it stopped, and rewriting
# the flag to false over a part-built estate produces the same invisible
# half-state from the other side, with real alarms in the account and a values
# file saying there are none. A run that fails there says so loudly and leaves
# both the file and the estate for an operator to reconcile.
#
# Usage:
#   scripts/arm-cwagent-alarms.sh --target staging
#   scripts/arm-cwagent-alarms.sh --target production --profile <p>
#
# Flags:
#   --target staging|production  Environment to arm (required, no default).
#   --profile <p>                AWS profile for the precondition check.
#   --yes                        Accept the typed confirmation in advance, for a
#                                run with no terminal attached.
#   --tfvars <path>              CI only; operators never set this. Runs against
#                                a scratch values file and stops before
#                                terraform, so the rewrite can be tested without
#                                an estate.
#
# Exit: 0 armed (or already armed), 1 refused or failed, 2 usage error.
set -euo pipefail

TARGET=""
PROFILE=""
TFVARS_OVERRIDE=""
WANT_ASSUME_YES=0
TFVAR_NAME="enable_cwagent_alarms"

usage() {
  cat <<'EOF'
Usage: scripts/arm-cwagent-alarms.sh --target staging|production [--profile <p>]

Runs the metric proof, flips enable_cwagent_alarms in that environment's values
file, applies, and confirms the three alarms exist. Refuses if the proof fails.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --profile)
      PROFILE="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --tfvars)
      TFVARS_OVERRIDE="${2:-}"
      shift 2 || { echo "ERROR: --tfvars requires an argument" >&2; exit 2; }
      ;;
    --yes) WANT_ASSUME_YES=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

# The library assigns ASSUME_YES unconditionally, so an exported value in the
# operator's shell cannot stand in for the typed answer. This script parses its
# flags above the source rather than below it, so --yes is recorded there and
# applied here, after the library has had its say.
(( WANT_ASSUME_YES )) && ASSUME_YES="yes"

require_target "$TARGET" staging production || exit 2
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TFVARS_PATH="${TFVARS_OVERRIDE:-${REPO_ROOT}/terraform/${TARGET}/terraform.tfvars}"

SYNTHETIC=0
if [[ -n "$TFVARS_OVERRIDE" ]]; then
  SYNTHETIC=1
  echo "SYNTHETIC: values file '${TFVARS_PATH}', stopping before terraform." >&2
fi

# The terraform seam. Unset, the run invokes the real apply wrapper, which is
# the operator's path. Set, it invokes what it names instead and keeps going, so
# a test can drive the outcome of the apply — including a failing one, which is
# the only way to reach the branch that decides whether the values file is put
# back. Announced on stderr, because a run that did not touch the estate must
# never read as one that did.
TERRAFORM_CMD="${ARM_CWAGENT_TERRAFORM:-}"
if [[ -n "$TERRAFORM_CMD" ]]; then
  echo "SYNTHETIC: terraform seam '${TERRAFORM_CMD}' -- no estate is reached." >&2
else
  TERRAFORM_CMD="${SCRIPT_DIR}/terraform-apply.sh"
fi

# The confirmation is not guarded here. `confirm_from_tty` owns all three
# outcomes: a terminal gets the prompt, no terminal with --yes is accepted in
# advance, and no terminal without --yes is refused. A second guard in this file
# would only disagree with it, and the reason the prompt cannot be answered by a
# redirected credential file is that the helper reads /dev/tty rather than stdin.

if [[ ! -r "$TFVARS_PATH" ]]; then
  echo "ERROR: cannot read $TFVARS_PATH" >&2
  echo "       Each environment's values file is a symlink into the maintainers'" >&2
  echo "       private operations checkout. Without it no environment can be" >&2
  echo "       applied; this script never invents one." >&2
  exit 1
fi

# ── The precondition, which is the reason this script exists ──────────────────
if (( ! SYNTHETIC )); then
  echo "== proving the metrics before arming anything =="
  VERIFY_ARGS=(--target "$TARGET")
  [[ -n "$PROFILE" ]] && VERIFY_ARGS+=(--profile "$PROFILE")
  if ! bash "${SCRIPT_DIR}/verify-cwagent-metrics.sh" "${VERIFY_ARGS[@]}"; then
    echo "" >&2
    echo "REFUSING to arm: the host is not publishing what these alarms bind to." >&2
    echo "Nothing has been changed. Fix what the check reported, then re-run." >&2
    exit 1
  fi
  echo ""
fi

# The trailing `|| true` matters: under `set -o pipefail` a grep that matches
# nothing takes the whole pipeline down, and the script would exit silently on
# the one case that most needs an explanation, a values file with no such flag.
CURRENT="$(grep -E "^[[:space:]]*${TFVAR_NAME}[[:space:]]*=" "$TFVARS_PATH" | head -1 | sed 's/.*=[[:space:]]*//' | tr -d '[:space:]' || true)"
if [[ -z "$CURRENT" ]]; then
  echo "ERROR: no $TFVAR_NAME assignment found in $TFVARS_PATH." >&2
  echo "       Add one rather than letting this script invent the line." >&2
  exit 1
fi

if [[ "$CURRENT" == "true" ]]; then
  echo "$TFVAR_NAME is already true in $TFVARS_PATH; leaving the file alone."
  if (( ! SYNTHETIC )); then
    echo "Re-applying anyway would be a no-op for this flag. Nothing to do."
  fi
  exit 0
fi

TFVARS_TMP="$(mktemp "${TMPDIR:-/tmp}/footbag-tfvars.XXXXXX")"
TFVARS_BACKUP="$(mktemp "${TMPDIR:-/tmp}/footbag-tfvars-orig.XXXXXX")"
# Three states, not two, because "the apply did not succeed" is not one outcome.
#
#   clean    nothing has been written; there is nothing to undo.
#   written  the flag is true in the file and terraform has NOT been invoked.
#            Nothing outside this run has seen the change, so a revert restores
#            the world exactly. This is the only state that reverts.
#   applying terraform has been invoked and its outcome is unknown or bad. It
#            may have created some alarms before it stopped, so the estate may
#            already disagree with the pre-run file. Reverting here would write
#            "unarmed" over real alarms: the same invisible half-state, reached
#            from the other side. Report and leave both alone.
#   armed    the apply succeeded. Keep the file.
#
# This is the operator-script invariant that a trap may only undo what the run
# itself created and nothing outside has recorded yet. Once terraform has run,
# AWS is the outside record.
ARM_STATE="clean"
restore_on_failure() {
  case "$ARM_STATE" in
    written)
      if [[ -s "$TFVARS_BACKUP" ]]; then
        cat "$TFVARS_BACKUP" > "$TFVARS_PATH"
        echo "" >&2
        echo "Put $TFVARS_PATH back the way it was found: the flag was written but" >&2
        echo "terraform was never invoked, so nothing outside this run saw it." >&2
      fi
      ;;
    applying)
      echo "" >&2
      echo "WARNING: terraform was invoked and did not report success, so the estate" >&2
      echo "         may hold some of the alarms already." >&2
      echo "" >&2
      echo "         $TFVARS_PATH has been LEFT saying $TFVAR_NAME = true, deliberately." >&2
      echo "         Reverting it would claim no alarms exist over an account that may" >&2
      echo "         hold several, which is harder to see than the mismatch you have." >&2
      echo "" >&2
      echo "         Reconcile before re-running:" >&2
      echo "           aws cloudwatch describe-alarms \\" >&2
      echo "             --alarm-name-prefix footbag-${TARGET}-high" >&2
      echo "         Then re-run this script, which is idempotent, or set the flag" >&2
      echo "         back by hand once you know what the account actually holds." >&2
      ;;
  esac
  rm -f "$TFVARS_TMP" "$TFVARS_BACKUP"
}
trap restore_on_failure EXIT INT TERM

cp "$TFVARS_PATH" "$TFVARS_BACKUP"

VAR_NAME="$TFVAR_NAME" awk '
  BEGIN { pattern = "^[ \t]*" ENVIRON["VAR_NAME"] "[ \t]*=" }
  $0 ~ pattern && !done {
    match($0, pattern "[ \t]*")
    printf "%strue\n", substr($0, 1, RLENGTH)
    done = 1
    next
  }
  { print }
' "$TFVARS_PATH" > "$TFVARS_TMP"

echo ""
diff -u "$TFVARS_PATH" "$TFVARS_TMP" || true
echo ""
echo "This sets $TFVAR_NAME = true in $TFVARS_PATH and applies the $TARGET tree,"
echo "which creates the three host alarms in the account."
if ! confirm_from_tty "Type 'APPLY' to arm the $TARGET alarms: " "APPLY"; then
  echo "Aborted: tfvars not changed." >&2
  exit 1
fi

# cat rather than mv: the values file is a symlink into the private operations
# checkout, and moving over it would replace the link with a real file in this
# tree, which is the one thing that must never exist here.
cat "$TFVARS_TMP" > "$TFVARS_PATH"
ARM_STATE="written"
echo "  $TFVAR_NAME = true written."

if (( SYNTHETIC )) && [[ -z "${ARM_CWAGENT_TERRAFORM:-}" ]]; then
  ARM_STATE="armed"
  echo ""
  echo "-- synthetic mode: stopping before terraform --"
  exit 0
fi

echo ""
echo "== applying =="
# The state moves BEFORE the apply, not after. Between these two lines the
# estate may change, and that window is exactly what the revert must not cross.
ARM_STATE="applying"
bash "$TERRAFORM_CMD" --target "$TARGET"
ARM_STATE="armed"

if (( SYNTHETIC )); then
  echo ""
  echo "-- synthetic mode: stopping before the alarm read --"
  exit 0
fi

echo ""
echo "== confirming the alarms exist =="
AWS_ARGS=(--region us-east-1)
if [[ -n "$PROFILE" ]]; then
  AWS_ARGS+=(--profile "$PROFILE")
else
  # No profile named on the command line, so the identity is the one the shared
  # library settles and proves: whatever this shell already carries, or the
  # operator profile.
  # shellcheck source=lib/aws-profile.sh
  source "${SCRIPT_DIR}/lib/aws-profile.sh"
  aws_profile_ensure || exit 1
fi
aws cloudwatch describe-alarms \
  --alarm-name-prefix "footbag-${TARGET}-high" \
  --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Missing:TreatMissingData}' \
  --output table "${AWS_ARGS[@]}"

echo ""
echo "They settle into OK once three evaluation periods of real data are in."
echo "One that stays at INSUFFICIENT_DATA is bound to something the host does"
echo "not publish, and the metric check names which combination is missing."
